/**
 * Feature 010 call-centre dashboard — client coverage for the three additive
 * capabilities shipped in backend commit 326254e: asset identifiers on
 * customer-lookup, the standalone recovery-case detail read, and the read-only
 * notification-preferences view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDashboardClient } from '../../dashboard/api/client';
import {
  getCustomerNotificationPreferencesForCallCentre,
  getRecoveryCaseForCallCentre,
  lookupCustomerByEmail,
} from './support-lookup';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null } as unknown as Headers,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('call-centre support-lookup API client', () => {
  beforeEach(() => {
    configureDashboardClient({
      getAccessToken: () => 'access-token',
      getRefreshToken: () => 'refresh-token',
      setRefreshToken: vi.fn(),
      clearRefreshToken: vi.fn(),
      setAccessToken: vi.fn(),
      onSessionTerminated: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('surfaces the additive asset-identifier fields on customer-lookup', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          accountId: 'acct-1',
          email: 'customer@example.com',
          accountState: 'active',
          policyCount: 1,
          assetCount: 1,
          assets: [
            {
              id: 'asset-1',
              assetType: 'smartphone',
              displayName: "Ash's phone",
              status: 'active',
              make: 'Apple',
              model: 'iPhone 15',
              serialNumber: null,
              imei: '490154203237518',
            },
          ],
          openRecoveryCaseCount: 0,
          recoveryCases: [],
          openSupportCaseCount: 0,
          supportCases: [],
          situationSummary: {
            hasOpenRecoveryCase: false,
            hasActiveClaim: false,
            recentRecoveryCaseCount: 0,
          },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await lookupCustomerByEmail('customer@example.com');

    expect(result.assets[0]).toMatchObject({
      make: 'Apple',
      model: 'iPhone 15',
      serialNumber: null,
      imei: '490154203237518',
    });
    expect(result.situationSummary).toEqual({
      hasOpenRecoveryCase: false,
      hasActiveClaim: false,
      recentRecoveryCaseCount: 0,
    });
  });

  it('fetches a recovery case by reference number and excludes location/police fields', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      expect(String(url)).toContain('/support/recovery-cases/RC-20261023-X7K2');
      return Promise.resolve(
        jsonResponse(200, {
          data: {
            id: 'case-1',
            accountId: 'acct-1',
            assetId: 'asset-1',
            status: 'investigating',
            referenceNumber: 'RC-20261023-X7K2',
            reportedAt: '2026-10-20T10:00:00.000Z',
            closedAt: null,
            notes: 'Reported stolen from vehicle',
            lastLocationAt: '2026-10-22T09:00:00.000Z',
            callCentreNotes: [{ agentAccountId: 'agent-1', text: 'Called customer back', createdAt: '2026-10-22T10:00:00.000Z' }],
          },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getRecoveryCaseForCallCentre('RC-20261023-X7K2');

    expect(result.referenceNumber).toBe('RC-20261023-X7K2');
    expect(result).not.toHaveProperty('lastLocation');
    expect(result).not.toHaveProperty('sapsCaseNumber');
    expect(result.callCentreNotes).toHaveLength(1);
  });

  it('fetches read-only notification preferences for a looked-up customer', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      expect(String(url)).toContain('/support/customers/acct-1/notification-preferences');
      return Promise.resolve(
        jsonResponse(200, {
          data: {
            accountId: 'acct-1',
            channels: {
              theft_critical: { push: true, email: true, sms: false },
              marketing: { push: false, email: false, sms: false },
            },
            updatedAt: '2026-10-21T08:00:00.000Z',
          },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getCustomerNotificationPreferencesForCallCentre('acct-1');

    expect(result.channels.theft_critical).toEqual({ push: true, email: true, sms: false });
    expect(result.updatedAt).toBe('2026-10-21T08:00:00.000Z');
  });
});
