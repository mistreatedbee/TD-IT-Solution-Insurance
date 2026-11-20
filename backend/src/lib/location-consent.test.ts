import { describe, it, expect } from 'vitest';
import { isReportConsented, scopeForTrigger } from './location-consent.js';
import type { LocationConsentEventDocument } from '../repositories/location-consent-log.js';

function event(overrides: Partial<LocationConsentEventDocument> = {}): LocationConsentEventDocument {
  return {
    id: 'e1',
    accountId: 'a',
    assetId: 'x',
    eventType: 'granted',
    purgedEventCount: null,
    actorSessionId: 's',
    ipAddress: null,
    userAgent: null,
    deviceId: 'd1',
    consentTextVersion: 'v1',
    scopes: ['foreground'],
    createdAt: new Date('2026-11-20T10:00:00Z'),
    ...overrides,
  };
}

describe('scopeForTrigger', () => {
  it('maps triggers to scopes', () => {
    expect(scopeForTrigger(undefined)).toBe('foreground');
    expect(scopeForTrigger('manual_refresh')).toBe('foreground');
    expect(scopeForTrigger('foreground_open')).toBe('foreground');
    expect(scopeForTrigger('periodic_foreground')).toBe('periodic');
    expect(scopeForTrigger('background')).toBe('background');
  });
});

describe('isReportConsented', () => {
  const now = new Date('2026-11-20T11:00:00Z');
  it('accepts an active grant from the same device with the scope', () => {
    expect(isReportConsented(event(), 'd1', 'foreground', now)).toBe(true);
  });
  it('refuses no record, a withdrawal, another device, a missing scope, a pre-A-7 grant, a future grant', () => {
    expect(isReportConsented(null, 'd1', 'foreground', now)).toBe(false);
    expect(isReportConsented(event({ eventType: 'withdrawn' }), 'd1', 'foreground', now)).toBe(false);
    expect(isReportConsented(event(), 'd2', 'foreground', now)).toBe(false);
    expect(isReportConsented(event(), 'd1', 'background', now)).toBe(false);
    expect(isReportConsented(event({ deviceId: null }), 'd1', 'foreground', now)).toBe(false);
    expect(isReportConsented(event({ createdAt: new Date('2026-11-20T12:00:00Z') }), 'd1', 'foreground', now)).toBe(false);
  });
});
