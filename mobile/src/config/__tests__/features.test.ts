/**
 * Release Gate A: claims must default OFF anywhere `EXPO_PUBLIC_FEATURE_CLAIMS`
 * is explicitly "false" (preview/production build profiles — see eas.json),
 * and stay ON for any other value, including unset (local dev/test default).
 */
describe('FEATURE_CLAIMS_ENABLED', () => {
  const ORIGINAL_ENV = process.env.EXPO_PUBLIC_FEATURE_CLAIMS;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.EXPO_PUBLIC_FEATURE_CLAIMS;
    } else {
      process.env.EXPO_PUBLIC_FEATURE_CLAIMS = ORIGINAL_ENV;
    }
    jest.resetModules();
  });

  it('is disabled when explicitly set to "false" (preview/production profiles)', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_FEATURE_CLAIMS = 'false';
    const { FEATURE_CLAIMS_ENABLED } = require('../features');
    expect(FEATURE_CLAIMS_ENABLED).toBe(false);
  });

  it('is enabled when explicitly set to "true" (development profile)', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_FEATURE_CLAIMS = 'true';
    const { FEATURE_CLAIMS_ENABLED } = require('../features');
    expect(FEATURE_CLAIMS_ENABLED).toBe(true);
  });

  it('defaults to enabled when unset (local dev without .env)', () => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_FEATURE_CLAIMS;
    const { FEATURE_CLAIMS_ENABLED } = require('../features');
    expect(FEATURE_CLAIMS_ENABLED).toBe(true);
  });
});

/**
 * INC-001: the client must never trigger an OS location-permission prompt
 * when this flag is off — location tracking has nowhere for the result to
 * go once a build sets it to "false" (preview/production profiles — see
 * eas.json). Same convention as `FEATURE_CLAIMS_ENABLED`.
 */
describe('FEATURE_LOCATION_TRACKING_ENABLED', () => {
  const ORIGINAL_ENV = process.env.EXPO_PUBLIC_FEATURE_LOCATION_TRACKING;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.EXPO_PUBLIC_FEATURE_LOCATION_TRACKING;
    } else {
      process.env.EXPO_PUBLIC_FEATURE_LOCATION_TRACKING = ORIGINAL_ENV;
    }
    jest.resetModules();
  });

  it('is disabled when explicitly set to "false" (preview/production profiles)', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_FEATURE_LOCATION_TRACKING = 'false';
    const { FEATURE_LOCATION_TRACKING_ENABLED } = require('../features');
    expect(FEATURE_LOCATION_TRACKING_ENABLED).toBe(false);
  });

  it('is enabled when explicitly set to "true" (development profile)', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_FEATURE_LOCATION_TRACKING = 'true';
    const { FEATURE_LOCATION_TRACKING_ENABLED } = require('../features');
    expect(FEATURE_LOCATION_TRACKING_ENABLED).toBe(true);
  });

  it('defaults to enabled when unset (local dev without .env)', () => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_FEATURE_LOCATION_TRACKING;
    const { FEATURE_LOCATION_TRACKING_ENABLED } = require('../features');
    expect(FEATURE_LOCATION_TRACKING_ENABLED).toBe(true);
  });
});

/** INC-001 A-12: every gated Feature 009 surface uses the same env convention. */
describe('FEATURE_KYC_ENABLED', () => {
  const ORIGINAL_ENV = process.env.EXPO_PUBLIC_FEATURE_KYC;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.EXPO_PUBLIC_FEATURE_KYC;
    } else {
      process.env.EXPO_PUBLIC_FEATURE_KYC = ORIGINAL_ENV;
    }
    jest.resetModules();
  });

  it('is disabled when explicitly set to "false"', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_FEATURE_KYC = 'false';
    const { FEATURE_KYC_ENABLED } = require('../features');
    expect(FEATURE_KYC_ENABLED).toBe(false);
  });

  it('defaults to enabled when unset', () => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_FEATURE_KYC;
    const { FEATURE_KYC_ENABLED } = require('../features');
    expect(FEATURE_KYC_ENABLED).toBe(true);
  });
});

describe('FEATURE_ALERTS_ENABLED', () => {
  const ORIGINAL_ENV = process.env.EXPO_PUBLIC_FEATURE_ALERTS;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.EXPO_PUBLIC_FEATURE_ALERTS;
    } else {
      process.env.EXPO_PUBLIC_FEATURE_ALERTS = ORIGINAL_ENV;
    }
    jest.resetModules();
  });

  it('is disabled when explicitly set to "false"', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_FEATURE_ALERTS = 'false';
    const { FEATURE_ALERTS_ENABLED } = require('../features');
    expect(FEATURE_ALERTS_ENABLED).toBe(false);
  });

  it('defaults to enabled when unset', () => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_FEATURE_ALERTS;
    const { FEATURE_ALERTS_ENABLED } = require('../features');
    expect(FEATURE_ALERTS_ENABLED).toBe(true);
  });
});

describe('FEATURE_THEFT_REPORTING_ENABLED', () => {
  const ORIGINAL_ENV = process.env.EXPO_PUBLIC_FEATURE_THEFT_REPORTING;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.EXPO_PUBLIC_FEATURE_THEFT_REPORTING;
    } else {
      process.env.EXPO_PUBLIC_FEATURE_THEFT_REPORTING = ORIGINAL_ENV;
    }
    jest.resetModules();
  });

  it('is disabled when explicitly set to "false"', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_FEATURE_THEFT_REPORTING = 'false';
    const { FEATURE_THEFT_REPORTING_ENABLED } = require('../features');
    expect(FEATURE_THEFT_REPORTING_ENABLED).toBe(false);
  });

  it('defaults to enabled when unset', () => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_FEATURE_THEFT_REPORTING;
    const { FEATURE_THEFT_REPORTING_ENABLED } = require('../features');
    expect(FEATURE_THEFT_REPORTING_ENABLED).toBe(true);
  });
});

describe('FEATURE_HARDWARE_TRACKING_ENABLED', () => {
  const ORIGINAL_ENV = process.env.EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING;
    } else {
      process.env.EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING = ORIGINAL_ENV;
    }
    jest.resetModules();
  });

  it('is disabled when explicitly set to "false"', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING = 'false';
    const { FEATURE_HARDWARE_TRACKING_ENABLED } = require('../features');
    expect(FEATURE_HARDWARE_TRACKING_ENABLED).toBe(false);
  });

  it('defaults to enabled when unset', () => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING;
    const { FEATURE_HARDWARE_TRACKING_ENABLED } = require('../features');
    expect(FEATURE_HARDWARE_TRACKING_ENABLED).toBe(true);
  });
});

describe('FEATURE_SECURITY_OPERATOR_ENABLED', () => {
  const ORIGINAL_ENV = process.env.EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR;
    } else {
      process.env.EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR = ORIGINAL_ENV;
    }
    jest.resetModules();
  });

  it('is disabled when explicitly set to "false"', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR = 'false';
    const { FEATURE_SECURITY_OPERATOR_ENABLED } = require('../features');
    expect(FEATURE_SECURITY_OPERATOR_ENABLED).toBe(false);
  });

  it('defaults to enabled when unset', () => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR;
    const { FEATURE_SECURITY_OPERATOR_ENABLED } = require('../features');
    expect(FEATURE_SECURITY_OPERATOR_ENABLED).toBe(true);
  });
});

/**
 * INC-004-2: in a release bundle (`__DEV__ === false`) every flag fails CLOSED — only the
 * exact string "true" enables it. Dev bundles (`__DEV__ === true`, the Jest default) keep the
 * fail-open convenience asserted above.
 */
describe('release bundle (__DEV__ = false) fails closed for every flag', () => {
  const FLAGS: Array<[string, string]> = [
    ['EXPO_PUBLIC_FEATURE_CLAIMS', 'FEATURE_CLAIMS_ENABLED'],
    ['EXPO_PUBLIC_FEATURE_LOCATION_TRACKING', 'FEATURE_LOCATION_TRACKING_ENABLED'],
    ['EXPO_PUBLIC_FEATURE_KYC', 'FEATURE_KYC_ENABLED'],
    ['EXPO_PUBLIC_FEATURE_ALERTS', 'FEATURE_ALERTS_ENABLED'],
    ['EXPO_PUBLIC_FEATURE_THEFT_REPORTING', 'FEATURE_THEFT_REPORTING_ENABLED'],
    ['EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING', 'FEATURE_HARDWARE_TRACKING_ENABLED'],
    ['EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR', 'FEATURE_SECURITY_OPERATOR_ENABLED'],
    ['EXPO_PUBLIC_FEATURE_PROTECTION_CHECKLIST', 'FEATURE_PROTECTION_CHECKLIST_ENABLED'],
    ['EXPO_PUBLIC_FEATURE_LAUNCH_LOCATION_PROMPT', 'FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED'],
    ['EXPO_PUBLIC_FEATURE_BACKGROUND_LOCATION', 'FEATURE_BACKGROUND_LOCATION_ENABLED'],
    ['EXPO_PUBLIC_FEATURE_ASSISTANT_ENTRY', 'FEATURE_ASSISTANT_ENTRY_ENABLED'],
  ];
  const g = globalThis as unknown as { __DEV__: boolean };
  const ORIGINAL_DEV = g.__DEV__;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const [env] of FLAGS) saved[env] = process.env[env];
    g.__DEV__ = false;
    jest.resetModules();
  });

  afterEach(() => {
    g.__DEV__ = ORIGINAL_DEV;
    for (const [env] of FLAGS) {
      if (saved[env] === undefined) delete process.env[env];
      else process.env[env] = saved[env];
    }
    jest.resetModules();
  });

  function load(env: string, value: string | undefined, exportName: string): boolean {
    for (const [e] of FLAGS) delete process.env[e];
    if (value !== undefined) process.env[env] = value;
    jest.resetModules();
    return require('../features')[exportName];
  }

  describe.each(FLAGS)('%s', (env, exportName) => {
    it.each([
      ['unset', undefined],
      ['"false"', 'false'],
      ['"False"', 'False'],
      ['"TRUE"', 'TRUE'],
      ['blank', ''],
      ['"1"', '1'],
    ])('is OFF when %s', (_label, value) => {
      expect(load(env, value, exportName)).toBe(false);
    });

    it('is ON only for the exact string "true"', () => {
      expect(load(env, 'true', exportName)).toBe(true);
    });
  });
});
