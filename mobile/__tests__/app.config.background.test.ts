/**
 * @jest-environment node
 *
 * Background location (ACCESS_BACKGROUND_LOCATION / FOREGROUND_SERVICE*) is declared in the
 * owner-test build only. CI additionally resolves the full config with plugin mods per eas.json
 * profile (scripts/verify-background-location-config.mjs); this is the fast unit-level check.
 */
import type { ExpoConfig } from 'expo/config';
import easJson from '../eas.json';

const BACKGROUND = [
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
];

type Profiles = Record<string, { extends?: string; env?: Record<string, string> }>;

function profileEnv(name: string): Record<string, string> {
  const profiles = easJson.build as unknown as Profiles;
  const own = profiles[name]!;
  const base = own.extends ? profileEnv(own.extends) : {};
  return { ...base, ...(own.env ?? {}) };
}

function resolve(profile: string | undefined, env: Record<string, string>): ExpoConfig {
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (k.startsWith('EXPO_PUBLIC_')) delete process.env[k];
  delete process.env.EAS_BUILD_PROFILE;
  Object.assign(process.env, env);
  if (profile) process.env.EAS_BUILD_PROFILE = profile;
  try {
    let config!: ExpoConfig;
    jest.isolateModules(() => {
      const mod = require('../app.config');
      config = mod.default({ config: {} } as never);
    });
    return config;
  } finally {
    process.env = saved;
  }
}

function backgroundTraces(config: ExpoConfig): string[] {
  const traces = (config.android?.permissions ?? []).filter((p) => BACKGROUND.includes(p));
  for (const plugin of config.plugins ?? []) {
    if (Array.isArray(plugin) && plugin[0] === 'expo-location') {
      const opts = (plugin[1] ?? {}) as Record<string, unknown>;
      for (const key of [
        'isAndroidBackgroundLocationEnabled',
        'isAndroidForegroundServiceEnabled',
        'isIosBackgroundLocationEnabled',
      ]) {
        if (opts[key]) traces.push(key);
      }
    }
  }
  const modes = config.ios?.infoPlist?.UIBackgroundModes as string[] | undefined;
  if (modes?.includes('location')) traces.push('ios:location');
  return traces;
}

const nonOwnerProfiles = Object.keys(easJson.build).filter((n) => n !== 'owner-test');

describe('app.config background location gating', () => {
  it('owner-test declares the Android background permissions and plugin options', () => {
    const traces = backgroundTraces(resolve('owner-test', profileEnv('owner-test')));
    expect(traces).toEqual(
      expect.arrayContaining([...BACKGROUND, 'isAndroidBackgroundLocationEnabled', 'isAndroidForegroundServiceEnabled']),
    );
    expect(traces).not.toContain('isIosBackgroundLocationEnabled');
    expect(traces).not.toContain('ios:location');
  });

  it.each(nonOwnerProfiles)('profile "%s" never carries background location (as declared)', (name) => {
    expect(backgroundTraces(resolve(name, profileEnv(name)))).toEqual([]);
  });

  it.each(nonOwnerProfiles)(
    'profile "%s" never carries background location even with the flags forced on',
    (name) => {
      const env = {
        ...profileEnv(name),
        EXPO_PUBLIC_FEATURE_LOCATION_TRACKING: 'true',
        EXPO_PUBLIC_FEATURE_BACKGROUND_LOCATION: 'true',
      };
      expect(backgroundTraces(resolve(name, env))).toEqual([]);
    },
  );

  it('owner-test with the background flag off has no background permissions', () => {
    const env = { ...profileEnv('owner-test'), EXPO_PUBLIC_FEATURE_BACKGROUND_LOCATION: 'false' };
    expect(backgroundTraces(resolve('owner-test', env))).toEqual([]);
  });

  it('local expo start (no EAS profile) has no background permissions', () => {
    expect(backgroundTraces(resolve(undefined, { EXPO_PUBLIC_FEATURE_BACKGROUND_LOCATION: 'true' }))).toEqual([]);
  });

  it('the detector used here does catch a background permission (no vacuous pass)', () => {
    const bad = { name: 'x', slug: 'x', android: { permissions: [BACKGROUND[0]!] } } as ExpoConfig;
    expect(backgroundTraces(bad)).toEqual([BACKGROUND[0]]);
  });
});
