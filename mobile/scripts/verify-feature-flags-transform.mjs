#!/usr/bin/env node
/**
 * INC-004-3 layer 2 — transform-and-evaluate test per eas.json build profile.
 *
 * INC-004 (docs/organization/incidents/INC-004-mobile-feature-flags-not-inlined.md): every
 * gated flag shipped ON in release bundles because Expo's Babel preset never inlined the
 * value. Jest cannot catch that (it reads the real Node env), so this script reproduces what
 * Metro does: for each build profile it
 *   1. resolves the profile's `env` (eas.json `extends` per-key merge),
 *   2. runs `src/config/features.ts` through `babel-preset-expo` in PRODUCTION mode with
 *      exactly that env visible to the transform (what EAS injects at build time),
 *   3. evaluates the transformed module with `__DEV__ = false` and an otherwise EMPTY
 *      `process.env` (a shipped native bundle has no runtime env — anything not inlined
 *      reads `undefined`),
 *   4. asserts every flag equals what eas.json declares (`"true"` => ON, else OFF), and
 *   5. for each flag, deletes that one key from the profile and asserts the flag is OFF
 *      (fail-closed on a missing key).
 * Any mismatch exits 1 naming profile/flag/expected/actual.
 *
 * Every build profile is checked with __DEV__ = false, including `development`, as the
 * conservative worst case (a development-client profile that omits a key must not rely on the
 * dev fail-open convenience in a release-style bundle).
 *
 * Usage: node scripts/verify-feature-flags-transform.mjs   (from mobile/ or anywhere)
 *   EAS_JSON_PATH / FEATURES_PATH override the inputs (used only to prove the check can fail).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(mobileRoot, 'package.json'));
const babel = require('@babel/core');

const easJsonPath = process.env.EAS_JSON_PATH
  ? resolve(process.env.EAS_JSON_PATH)
  : join(mobileRoot, 'eas.json');
const featuresPath = process.env.FEATURES_PATH
  ? resolve(process.env.FEATURES_PATH)
  : join(mobileRoot, 'src/config/features.ts');
const source = readFileSync(featuresPath, 'utf8');

function resolveProfile(profiles, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`eas.json build profile cycle involving "${name}"`);
  const own = profiles[name];
  if (!own) throw new Error(`eas.json references unknown build profile "${name}"`);
  const base = own.extends ? resolveProfile(profiles, own.extends, new Set([...seen, name])) : {};
  return { ...base, ...own, env: { ...(base.env ?? {}), ...(own.env ?? {}) } };
}

// Flags the app reads: static `process.env.EXPO_PUBLIC_FEATURE_*` accesses in features.ts
// mapped to their exported constant. Parsed from source so a new flag is covered automatically.
const FLAGS = [
  ...source.matchAll(
    /export const (\w+)\s*=\s*featureEnabled\(\s*process\.env\.(EXPO_PUBLIC_FEATURE_[A-Z0-9_]+)\s*,?\s*\)/g,
  ),
].map((m) => ({ exportName: m[1], envKey: m[2] }));

// Release policy (coordinator ruling 2026-11-19; OWNER-EXCEPTION-2026-11-17-test-only-build.md):
// the owner-only `owner-test` profile must have ALL flags "true"; every other profile except the
// `development` dev-client profile (declaration-matching only, as in verify-eas-feature-flags.mjs)
// must have ALL flags "false". Keep in sync with OWNER_TEST_EXCEPTION_PROFILES there.
const OWNER_TEST_PROFILES = new Set(['owner-test']);
function policyViolations(name, env, flags) {
  if (name === 'development') return [];
  const want = OWNER_TEST_PROFILES.has(name) ? 'true' : 'false';
  return flags
    .filter((f) => env[f.envKey] !== want)
    .map((f) => `profile "${name}": ${f.envKey}=${JSON.stringify(env[f.envKey])}, policy requires "${want}"`);
}

const failures = [];
// Anti-bypass: every featureEnabled(...) call site and every process.env access in features.ts
// must be a discovered static flag read; a dynamic read would otherwise silently drop out of FLAGS.
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const callSites = (code.match(/\bfeatureEnabled\(/g) ?? []).length - 1; // minus the declaration
if (callSites !== FLAGS.length) {
  failures.push(
    `features.ts has ${callSites} featureEnabled() call sites but ${FLAGS.length} are static EXPO_PUBLIC_FEATURE_* reads`,
  );
}
if (/process\.env\s*\[/.test(code) || /process\.env\.(?!EXPO_PUBLIC_FEATURE_)/.test(code)) {
  failures.push('features.ts reads process.env dynamically or a non-flag variable');
}
if (FLAGS.length < 12) {
  failures.push(`discovered only ${FLAGS.length} flags in features.ts (expected >= 12)`);
}

function evaluateFlags(profileEnv) {
  // Environment visible to the transform = the profile env only (no inherited shell flags).
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('EXPO_PUBLIC_')) delete process.env[k];
  }
  Object.assign(process.env, profileEnv);
  process.env.NODE_ENV = 'production';
  process.env.BABEL_ENV = 'production';

  const out = babel.transformSync(source, {
    filename: featuresPath,
    babelrc: false,
    configFile: false,
    presets: [require.resolve('babel-preset-expo')],
    caller: {
      name: 'metro',
      bundler: 'metro',
      platform: 'android',
      isDev: false,
      isServer: false,
      supportsStaticESM: false,
    },
    sourceType: 'module',
  });

  const module_ = { exports: {} };
  const sandbox = {
    module: module_,
    exports: module_.exports,
    __DEV__: false,
    process: { env: {} }, // empty runtime env, as in a shipped native bundle
    require: () => {
      throw new Error('features.ts must not import anything');
    },
  };
  vm.runInNewContext(out.code, sandbox, { filename: 'features.transformed.js' });
  return Object.fromEntries(FLAGS.map(({ exportName }) => [exportName, module_.exports[exportName]]));
}

const easJson = JSON.parse(readFileSync(easJsonPath, 'utf8'));
const profileNames = Object.keys(easJson.build ?? {});
if (profileNames.length === 0) failures.push('eas.json has no build profiles');

let checks = 0;
for (const name of profileNames) {
  const env = resolveProfile(easJson.build, name).env;
  failures.push(...policyViolations(name, env, FLAGS));
  const declared = {};
  for (const { envKey } of FLAGS) {
    if (env[envKey] !== undefined) declared[envKey] = env[envKey];
  }
  const actual = evaluateFlags(declared);
  for (const { exportName, envKey } of FLAGS) {
    const expected = env[envKey] === 'true';
    checks++;
    if (actual[exportName] !== expected) {
      failures.push(
        `profile "${name}": ${exportName} (${envKey}=${JSON.stringify(env[envKey])}) expected ${expected}, bundle evaluates ${actual[exportName]}`,
      );
    }
  }
  // Delete one key at a time: a missing key must evaluate OFF.
  for (const { exportName, envKey } of FLAGS) {
    const without = { ...declared };
    delete without[envKey];
    const res = evaluateFlags(without);
    checks++;
    if (res[exportName] !== false) {
      failures.push(
        `profile "${name}": ${exportName} must be OFF when ${envKey} is missing, bundle evaluates ${res[exportName]}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('FAIL: INC-004 layer 2 — transformed features.ts disagrees with eas.json:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `PASS: INC-004 layer 2 — ${profileNames.length} profiles x ${FLAGS.length} flags (${checks} checks) evaluate as eas.json declares with __DEV__=false and empty runtime env; missing keys fail closed.`,
);
