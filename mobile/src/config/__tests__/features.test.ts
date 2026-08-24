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
