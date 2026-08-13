/**
 * Branded push message templates — Feature 007.
 */
import { describe, it, expect } from 'vitest';
import { buildBrandedPushMessage, NOTIFICATION_BRAND } from './notification-brand.js';

describe('notification-brand', () => {
  it('includes brand name as subtitle on recovery alerts', () => {
    const message = buildBrandedPushMessage('recovery.case.created', {
      assetName: 'MacBook Pro',
      caseId: '507f1f77bcf86cd799439011',
      referenceNumber: 'RC-2026-0001',
    });

    expect(message.subtitle).toBe(NOTIFICATION_BRAND.name);
    expect(message.title).toBe('Theft case opened');
    expect(message.body).toContain('MacBook Pro');
    expect(message.category).toBe('theft_critical');
    expect(message.data.logoUrl).toBe(NOTIFICATION_BRAND.logoUrl);
    expect(message.deepLink).toBe('tditinsurance://live-tracking/507f1f77bcf86cd799439011');
  });

  it('builds branded test notification copy', () => {
    const message = buildBrandedPushMessage('account.security.test');
    expect(message.subtitle).toBe(NOTIFICATION_BRAND.tagline);
    expect(message.body).toContain(NOTIFICATION_BRAND.name);
    expect(message.data.brand).toBe(NOTIFICATION_BRAND.name);
  });

  it('builds policy and asset created push messages', () => {
    const policy = buildBrandedPushMessage('policy.created', {
      planName: 'Starter',
      policyId: '507f1f77bcf86cd799439099',
    });
    expect(policy.title).toBe('Policy created');
    expect(policy.body).toContain('Starter');
    expect(policy.data.logoUrl).toBe(NOTIFICATION_BRAND.logoUrl);

    const asset = buildBrandedPushMessage('asset.created', {
      assetName: 'MacBook Pro',
      assetId: '507f1f77bcf86cd799439088',
    });
    expect(asset.title).toBe('Asset registered');
    expect(asset.deepLink).toContain('assets/');
  });
});
