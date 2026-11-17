import { describe, expect, it } from 'vitest';
import { createNotificationPreferencesRepo, DEFAULT_NOTIFICATION_PREFERENCES, NOTIFICATION_CATEGORIES } from './notification-preferences.js';

describe('safety_alerts preference category (Feature 021 stage c)', () => {
  it('has a safe default: push and email on, SMS off', () => {
    expect(NOTIFICATION_CATEGORIES).toContain('safety_alerts');
    expect(DEFAULT_NOTIFICATION_PREFERENCES.safety_alerts).toEqual({ push: true, email: true, sms: false });
  });

  it('fills the category from defaults for a preferences document stored before it existed', async () => {
    const { safety_alerts: _omit, ...legacy } = DEFAULT_NOTIFICATION_PREFERENCES;
    const doc = { _id: { toHexString: () => 'x' }, accountId: 'a', channels: legacy, createdAt: new Date(), updatedAt: new Date() };
    const db = { collection: () => ({ findOne: async () => doc }) } as never;
    const prefs = await createNotificationPreferencesRepo(db).getOrCreate('a');
    expect(prefs.channels.safety_alerts).toEqual({ push: true, email: true, sms: false });
  });
});
