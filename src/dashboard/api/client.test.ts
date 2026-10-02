/**
 * ADR-0012 §2.4 — regression guard for the shared-client defect fixed as
 * part of SU-FU-1 (frontend half): `apiFetch` used to treat every
 * authenticated 401 as "session expired" and run a refresh-token rotation
 * before retrying, including `STEP_UP_REQUIRED`, which is also a 401. That
 * burned an unnecessary `/session/refresh` round-trip before every step-up
 * prompt. This file proves `STEP_UP_REQUIRED` is excluded from the
 * refresh-and-retry branch, and that a genuine session-expiry 401 still
 * refreshes as before (no silent regression of the original behaviour).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, configureDashboardClient } from './client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null } as unknown as Headers,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('dashboard apiFetch — STEP_UP_REQUIRED vs session-expiry 401 handling', () => {
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

  it('does not call /session/refresh when the request fails with STEP_UP_REQUIRED', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(401, {
          error: { code: 'STEP_UP_REQUIRED', message: 'Please re-verify your identity to continue.' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      apiFetch('/admin/plans/plan-1', { method: 'PATCH', body: {} }),
    ).rejects.toMatchObject({ code: 'STEP_UP_REQUIRED', status: 401 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls.some((url) => url.includes('/session/refresh'))).toBe(false);
  });

  it('still refreshes and retries on a genuine session-expiry 401 (regression guard)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'SESSION_EXPIRED', message: 'expired' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh', sessionId: 'sess-1' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch('/admin/plans/plan-1', { method: 'PATCH', body: {} });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/session/refresh');
  });
});
