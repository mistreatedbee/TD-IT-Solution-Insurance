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
