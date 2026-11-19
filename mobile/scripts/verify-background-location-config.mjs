#!/usr/bin/env node
/**
 * Background-location profile guard (OWNER EXCEPTION 2026-11-17 addendum, 2026-11-19).
 *
 * Android background location (ACCESS_BACKGROUND_LOCATION, FOREGROUND_SERVICE,
 * FOREGROUND_SERVICE_LOCATION, expo-location `isAndroidBackgroundLocationEnabled` /
 * `isAndroidForegroundServiceEnabled`) may appear ONLY in the owner-test build. This script
 * resolves the real Expo config — `expo config --type introspect`, i.e. app.config.ts plus every
 * config plugin's mods, including the generated AndroidManifest permissions — for every eas.json
 * build profile, with exactly that profile's env (eas.json `extends` per-key merge) and
 * EAS_BUILD_PROFILE set, and:
 *
 *   1. FAILS if any profile other than owner-test carries a background permission, an
 *      expo-location background option, or an iOS UIBackgroundModes "location" / "fetch" entry;
 *   2. repeats (1) for every non-owner-test profile with both location flags forced "true", so the
 *      gate is proven to be the profile NAME, not merely the flag values;
 *   3. FAILS if owner-test does NOT carry the Android permissions (a check that can never see the
 *      thing it guards against must fail, not pass) — and checks iOS stays clean there too.
 *
 * `--self-test` runs the violation detector against a synthetic bad config and exits 1 if it is
 * not caught. Usage: node scripts/verify-background-location-config.mjs [--self-test]
 * Do not widen the owner-test exception: the allowed set below is exactly one profile name.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const OWNER_TEST_PROFILE = 'owner-test';
const BACKGROUND_PERMISSIONS = [
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
];
const BACKGROUND_PLUGIN_OPTIONS = [
  'isAndroidBackgroundLocationEnabled',
  'isAndroidForegroundServiceEnabled',
  'isIosBackgroundLocationEnabled',
];
const FORBIDDEN_IOS_MODES = ['location', 'fetch'];

function resolveProfile(profiles, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`eas.json build profile cycle involving "${name}"`);
  const own = profiles[name];
  if (!own) throw new Error(`eas.json references unknown build profile "${name}"`);
  const base = own.extends ? resolveProfile(profiles, own.extends, new Set([...seen, name])) : {};
  return { ...base, ...own, env: { ...(base.env ?? {}), ...(own.env ?? {}) } };
}

function manifestPermissions(config) {
  const manifest = config?._internal?.modResults?.android?.manifest?.manifest;
  return (manifest?.['uses-permission'] ?? []).map((p) => p?.$?.['android:name']).filter(Boolean);
}

function iosBackgroundModes(config) {
  const fromMods = config?._internal?.modResults?.ios?.infoPlist?.UIBackgroundModes ?? [];
  const fromConfig = config?.ios?.infoPlist?.UIBackgroundModes ?? [];
  return [...new Set([...fromMods, ...fromConfig])];
}

/** Every background-location trace in a resolved config. */
export function findBackgroundTraces(config) {
  const traces = [];
  const declared = config?.android?.permissions ?? [];
  const manifest = manifestPermissions(config);
  for (const permission of BACKGROUND_PERMISSIONS) {
    if (declared.includes(permission)) traces.push(`android.permissions has ${permission}`);
    if (manifest.includes(permission)) traces.push(`AndroidManifest uses-permission ${permission}`);
  }
  for (const plugin of config?.plugins ?? []) {
    if (!Array.isArray(plugin) || plugin[0] !== 'expo-location') continue;
    for (const option of BACKGROUND_PLUGIN_OPTIONS) {
      if (plugin[1]?.[option]) traces.push(`expo-location plugin option ${option}=true`);
    }
  }
  for (const mode of iosBackgroundModes(config)) {
    if (FORBIDDEN_IOS_MODES.includes(mode)) traces.push(`iOS UIBackgroundModes has "${mode}"`);
  }
  return traces;
}

function introspect(profileName, profileEnv) {
  const env = { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' };
  for (const k of Object.keys(env)) if (k.startsWith('EXPO_PUBLIC_')) delete env[k];
  delete env.GOOGLE_MAPS_ANDROID_API_KEY;
  Object.assign(env, profileEnv, { EAS_BUILD_PROFILE: profileName });
  const run = spawnSync('npx', ['expo', 'config', '--json', '--type', 'introspect'], {
    cwd: mobileRoot,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) {
    throw new Error(`expo config failed for "${profileName}" (exit ${run.status}): ${(run.stderr || '').slice(-600)}`);
  }
  return JSON.parse(run.stdout);
}

function selfTest() {
  const bad = {
    android: { permissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'] },
    plugins: [['expo-location', { isAndroidBackgroundLocationEnabled: true }]],
    ios: { infoPlist: { UIBackgroundModes: ['remote-notification', 'location'] } },
    _internal: {
      modResults: {
        android: { manifest: { manifest: { 'uses-permission': [{ $: { 'android:name': 'android.permission.FOREGROUND_SERVICE_LOCATION' } }] } } },
      },
    },
  };
  const good = { android: { permissions: ['android.permission.ACCESS_FINE_LOCATION'] }, plugins: [['expo-location', {}]] };
  const badTraces = findBackgroundTraces(bad);
  const goodTraces = findBackgroundTraces(good);
  if (badTraces.length !== 4 || goodTraces.length !== 0) {
    console.error(`FAIL: self-test — detector found ${badTraces.length}/4 traces in the bad config and ${goodTraces.length} in the clean one.`);
    process.exit(1);
  }
  console.log('PASS: self-test — the detector catches every synthetic background-location trace.');
}

function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }
  const easJson = JSON.parse(readFileSync(join(mobileRoot, 'eas.json'), 'utf8'));
  const names = Object.keys(easJson.build ?? {});
  const failures = [];
  if (!names.includes(OWNER_TEST_PROFILE)) failures.push(`eas.json has no "${OWNER_TEST_PROFILE}" profile to check`);

  let checks = 0;
  for (const name of names) {
    const env = resolveProfile(easJson.build, name).env ?? {};
    if (name === OWNER_TEST_PROFILE) {
      const config = introspect(name, env);
      checks++;
      const manifest = manifestPermissions(config);
      for (const permission of BACKGROUND_PERMISSIONS) {
        if (!manifest.includes(permission)) {
          failures.push(`profile "${name}": expected ${permission} in the generated AndroidManifest (check cannot see what it guards)`);
        }
      }
      for (const mode of iosBackgroundModes(config)) {
        if (FORBIDDEN_IOS_MODES.includes(mode)) failures.push(`profile "${name}": iOS UIBackgroundModes has "${mode}" (iOS must stay untouched)`);
      }
      continue;
    }
    const variants = [
      ['as declared', env],
      ['location flags forced "true"', {
        ...env,
        EXPO_PUBLIC_FEATURE_LOCATION_TRACKING: 'true',
        EXPO_PUBLIC_FEATURE_BACKGROUND_LOCATION: 'true',
      }],
    ];
    for (const [label, variantEnv] of variants) {
      const traces = findBackgroundTraces(introspect(name, variantEnv));
      checks++;
      for (const trace of traces) failures.push(`profile "${name}" (${label}): ${trace}`);
    }
  }

  if (failures.length > 0) {
    console.error('FAIL: background location must appear in the owner-test build only:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `PASS: background location — ${checks} resolved configs; only "${OWNER_TEST_PROFILE}" declares ACCESS_BACKGROUND_LOCATION / FOREGROUND_SERVICE_LOCATION; no profile adds an iOS background location/fetch mode.`,
  );
}

main();
