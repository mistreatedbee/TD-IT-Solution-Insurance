#!/usr/bin/env node
/**
 * INC-004-3 layer 3 — `expo export` bundle smoke test.
 *
 * INC-004: gated flags shipped ON because the value was never inlined into the release
 * bundle. Layer 2 (verify-feature-flags-transform.mjs) proves the Babel transform in
 * isolation; this layer proves it on the REAL Metro bundle of the whole app. For each
 * distinct flag environment among the eas.json build profiles it
 *   1. runs `expo export --platform android --no-bytecode --no-minify --clear` (production mode;
 *      `--clear` because the Metro transform cache is NOT keyed on EXPO_PUBLIC_* values,
 *      plain JS so it can be inspected) with ONLY that profile's env exported,
 *   2. strips comments from the produced bundle, then asserts
 *        - no `process.env.EXPO_PUBLIC_FEATURE_*` lookup survives,
 *        - no `EAS_BUILD_PROFILE` and no `EXPO_PUBLIC_FEATURE_` token survives in code,
 *        - `featureEnabled` is exactly the fail-closed `raw === 'true'` (no `__DEV__`
 *          branch, no fail-open `!== 'false'`),
 *        - every `FEATURE_*_ENABLED = featureEnabled(<literal>)` has the literal that
 *          eas.json declares (`"true"`/`"false"`, or `undefined` when the profile omits it),
 *        - the number of such flags equals the number layer 2 discovers (>= 9).
 * Any mismatch exits 1. Profiles with identical flag env share one export (~20s each).
 *
 * Usage: node scripts/verify-feature-flags-bundle.mjs   (from mobile/ or anywhere)
 *   EAS_JSON_PATH overrides eas.json (testing only). Needs `npm ci` done.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const easJsonPath = process.env.EAS_JSON_PATH
  ? resolve(process.env.EAS_JSON_PATH)
  : join(mobileRoot, 'eas.json');
const featuresSource = readFileSync(join(mobileRoot, 'src/config/features.ts'), 'utf8');

const FLAGS = [
  ...featuresSource.matchAll(
    /export const (\w+)\s*=\s*featureEnabled\(\s*process\.env\.(EXPO_PUBLIC_FEATURE_[A-Z0-9_]+)\s*,?\s*\)/g,
  ),
].map((m) => ({ exportName: m[1], envKey: m[2] }));

function resolveProfile(profiles, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`eas.json build profile cycle involving "${name}"`);
  const own = profiles[name];
  if (!own) throw new Error(`eas.json references unknown build profile "${name}"`);
  const base = own.extends ? resolveProfile(profiles, own.extends, new Set([...seen, name])) : {};
  return { ...base, ...own, env: { ...(base.env ?? {}), ...(own.env ?? {}) } };
}

function findBundle(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      const found = findBundle(p);
      if (found) return found;
    } else if (/^entry-.*\.js$/.test(entry)) {
      return p;
    }
  }
  return null;
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');

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
if (FLAGS.length < 9) failures.push(`discovered only ${FLAGS.length} flags in features.ts (expected >= 9)`);

const easJson = JSON.parse(readFileSync(easJsonPath, 'utf8'));
const groups = new Map(); // signature -> { env, names[] }
for (const name of Object.keys(easJson.build ?? {})) {
  const env = resolveProfile(easJson.build, name).env;
  failures.push(...policyViolations(name, env, FLAGS));
  const flagEnv = Object.fromEntries(FLAGS.filter((f) => env[f.envKey] !== undefined).map((f) => [f.envKey, env[f.envKey]]));
  const sig = JSON.stringify(flagEnv);
  if (!groups.has(sig)) groups.set(sig, { flagEnv, names: [] });
  groups.get(sig).names.push(name);
}
if (groups.size === 0) failures.push('eas.json has no build profiles');

for (const { flagEnv, names } of groups.values()) {
  const label = names.join(', ');
  const outDir = mkdtempSync(join(tmpdir(), 'inc004-export-'));
  try {
    const env = { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', NODE_ENV: 'production' };
    for (const k of Object.keys(env)) if (k.startsWith('EXPO_PUBLIC_')) delete env[k];
    delete env.EAS_BUILD_PROFILE;
    Object.assign(env, flagEnv, { EXPO_PUBLIC_API_BASE_URL: 'https://example.invalid' });
    const run = spawnSync(
      'npx',
      ['expo', 'export', '--platform', 'android', '--no-bytecode', '--no-minify', '--clear', '--output-dir', outDir],
      { cwd: mobileRoot, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    if (run.status !== 0) {
      failures.push(`[${label}] expo export failed (exit ${run.status}): ${(run.stderr || run.stdout).slice(-600)}`);
      continue;
    }
    const bundlePath = findBundle(outDir);
    if (!bundlePath) {
      failures.push(`[${label}] expo export produced no entry-*.js bundle`);
      continue;
    }
    const code = stripComments(readFileSync(bundlePath, 'utf8'));

    if (/process\.env\.EXPO_PUBLIC_FEATURE_/.test(code)) failures.push(`[${label}] raw process.env.EXPO_PUBLIC_FEATURE_ lookup survives in bundle`);
    if (/EXPO_PUBLIC_FEATURE_/.test(code)) failures.push(`[${label}] EXPO_PUBLIC_FEATURE_ token survives in bundle code`);
    if (/EAS_BUILD_PROFILE/.test(code)) failures.push(`[${label}] EAS_BUILD_PROFILE survives in bundle code`);

    const fn = code.match(/function featureEnabled\(raw\)\s*\{([\s\S]*?)\n\s*\}/);
    if (!fn || !/^\s*return raw === ['"]true['"];\s*$/.test(fn[1])) {
      failures.push(`[${label}] featureEnabled is not the inlined fail-closed "raw === 'true'" (found: ${fn ? fn[1].trim() : 'no function'})`);
    }

    const found = new Map(
      [...code.matchAll(/var (FEATURE_[A-Z_]+_ENABLED) = featureEnabled\(([^)]*)\);/g)].map((m) => [m[1], m[2].trim()]),
    );
    if (found.size !== FLAGS.length) failures.push(`[${label}] found ${found.size} inlined flag assignments, expected ${FLAGS.length}`);
    for (const { exportName, envKey } of FLAGS) {
      const expected = flagEnv[envKey] === undefined ? 'undefined' : JSON.stringify(flagEnv[envKey]);
      const actual = found.get(exportName);
      if (actual !== expected) failures.push(`[${label}] ${exportName}: bundle has featureEnabled(${actual}), eas.json implies featureEnabled(${expected})`);
    }
    console.log(`[bundle] ${label}: ${found.size} flags inspected in ${bundlePath.split('/').pop()}`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  console.error('FAIL: INC-004 layer 3 — release bundle does not carry the expected flag literals:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`PASS: INC-004 layer 3 — ${groups.size} distinct flag environment(s) exported; all ${FLAGS.length} flags inlined to the eas.json literals; no raw lookups survive.`);
