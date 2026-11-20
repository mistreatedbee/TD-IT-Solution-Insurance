import {
  needsGpsHardware,
  trackingMethodDescription,
  trackingMethodFor,
  trackingMethodShortLabel,
} from '../trackingMethod';

describe('trackingMethodFor', () => {
  it('maps every asset type', () => {
    expect(trackingMethodFor('smartphone')).toBe('this_app');
    for (const t of ['laptop', 'desktop', 'tv', 'tablet']) {
      expect(trackingMethodFor(t)).toBe('our_software');
    }
    for (const t of ['vehicle', 'business_equipment', 'other_electronics']) {
      expect(trackingMethodFor(t)).toBe('gps_hardware');
    }
  });

  it('falls back to gps_hardware for unknown or missing types', () => {
    expect(trackingMethodFor(undefined)).toBe('gps_hardware');
    expect(trackingMethodFor('spaceship')).toBe('gps_hardware');
  });

  it('only hardware types need a GPS tracker', () => {
    expect(needsGpsHardware('smartphone')).toBe(false);
    expect(needsGpsHardware('laptop')).toBe(false);
    expect(needsGpsHardware('vehicle')).toBe(true);
  });
});

describe('tracking method copy', () => {
  it('never mentions a GPS tracker for phones or software-tracked types', () => {
    for (const t of ['smartphone', 'laptop', 'desktop', 'tv', 'tablet']) {
      expect(trackingMethodShortLabel(t)).not.toMatch(/gps|tracker|hardware/i);
      expect(trackingMethodDescription(t)).not.toMatch(/gps|tracker|hardware/i);
    }
  });

  it('says the laptop/computer/TV app is coming soon, not that it works', () => {
    expect(trackingMethodDescription('laptop')).toBe(
      'Tracked with the TD Insurance app on the device. The laptop app is coming soon.',
    );
    expect(trackingMethodDescription('desktop')).toContain('computer app is coming soon');
    expect(trackingMethodDescription('tv')).toContain('TV app is coming soon');
    expect(trackingMethodShortLabel('tablet')).toBe('TD Insurance app coming soon');
  });

  it('keeps hardware wording for vehicles', () => {
    expect(trackingMethodShortLabel('vehicle')).toBe('GPS tracker required');
    expect(trackingMethodDescription('vehicle')).toMatch(/GPS tracker/);
  });
});
