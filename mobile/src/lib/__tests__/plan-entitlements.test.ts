import { hasPlanEntitlement } from '../plan-entitlements';

describe('plan-entitlements', () => {
  it('fails open when entitlements are missing', () => {
    expect(hasPlanEntitlement(null, 'incidentManagement')).toBe(true);
    expect(hasPlanEntitlement(undefined, 'locationHistory')).toBe(true);
  });

  it('respects explicit entitlement flags', () => {
    const essential = {
      incidentManagement: false,
      locationHistory: false,
      gpsAlerts: false,
    };
    expect(hasPlanEntitlement(essential, 'incidentManagement')).toBe(false);
    expect(hasPlanEntitlement(essential, 'locationHistory')).toBe(false);

    const plus = {
      incidentManagement: true,
      locationHistory: true,
      gpsAlerts: true,
    };
    expect(hasPlanEntitlement(plus, 'incidentManagement')).toBe(true);
  });
});
