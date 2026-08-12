/**
 * Covers architecture.md §2.4's core contract:
 *  - authenticated requests attach the in-memory access token
 *  - a 401 triggers exactly one refresh-and-retry
 *  - concurrent 401s share a single in-flight refresh (single-flight)
 *  - a failed refresh (401/423) clears local session state
 *  - every /session/refresh call includes the FR-20 device-binding
 *    `deviceId` (api-design.md v1.1.0 §11 Amendment C), matching what
 *    device.ts already generates/persists for login
 */
import { apiFetch, refreshAccessToken, registerForcedLogoutHandler } from '../client';
import { getOrCreateDeviceId } from '../../auth/device';
import { useSessionStore } from '../../auth/session-store';
import * as secureStorage from '../../auth/secure-storage';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('api/client', () => {
  beforeEach(() => {
    useSessionStore.setState({
      status: 'hydrating',
      accessToken: null,
      sessionId: null,
      account: null,
    });
    registerForcedLogoutHandler(jest.fn());
    jest.restoreAllMocks();
  });

  it('attaches the in-memory access token as a Bearer header', async () => {
    useSessionStore.getState().setSignedIn({ accessToken: 'access-1', sessionId: 'sess-1' });

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { id: 'abc' }));

    await apiFetch('/account/me');

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('refreshes once and retries on a single 401, then succeeds', async () => {
    useSessionStore.getState().setSignedIn({ accessToken: 'expired-token', sessionId: 'sess-1' });
    jest.spyOn(secureStorage, 'getRefreshToken').mockResolvedValue('refresh-1');
    const setRefreshTokenSpy = jest.spyOn(secureStorage, 'setRefreshToken').mockResolvedValue();

    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired', requestId: 'r1' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          expiresIn: 600,
          sessionId: 'sess-1',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { id: 'abc', email: 'a@b.com' }));

    const result = await apiFetch<{ id: string }>('/account/me');

    expect(result).toEqual({ id: 'abc', email: 'a@b.com' });
    expect(fetchMock).toHaveBeenCalledTimes(3); // original 401, refresh, retry
    expect(setRefreshTokenSpy).toHaveBeenCalledWith('new-refresh');
    expect(useSessionStore.getState().accessToken).toBe('new-access');
    expect(useSessionStore.getState().status).toBe('signed-in');
  });

  it('includes the locally-generated deviceId on every /session/refresh request', async () => {
    useSessionStore.getState().setSignedIn({ accessToken: 'expired-token', sessionId: 'sess-1' });
    jest.spyOn(secureStorage, 'getRefreshToken').mockResolvedValue('refresh-1');
    jest.spyOn(secureStorage, 'setRefreshToken').mockResolvedValue();

    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 600,
        sessionId: 'sess-1',
      }),
    );

    const expectedDeviceId = await getOrCreateDeviceId();

    await refreshAccessToken();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/session/refresh');
    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({ refreshToken: 'refresh-1', deviceId: expectedDeviceId });
  });

  it('single-flights concurrent refresh calls', async () => {
    jest.spyOn(secureStorage, 'getRefreshToken').mockResolvedValue('refresh-1');
    jest.spyOn(secureStorage, 'setRefreshToken').mockResolvedValue();

    let refreshCallCount = 0;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url: unknown, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      if (body?.refreshToken) {
        refreshCallCount += 1;
        return jsonResponse(200, {
          accessToken: `access-${refreshCallCount}`,
          refreshToken: `refresh-${refreshCallCount}`,
          expiresIn: 600,
          sessionId: 'sess-1',
        });
      }
      return jsonResponse(200, {});
    });

    const [a, b, c] = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(refreshCallCount).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('clears local session and invokes the forced-logout handler on a 423 from refresh', async () => {
    useSessionStore.getState().setSignedIn({ accessToken: 'access-1', sessionId: 'sess-1' });
    jest.spyOn(secureStorage, 'getRefreshToken').mockResolvedValue('refresh-1');
    const clearSpy = jest.spyOn(secureStorage, 'clearRefreshToken').mockResolvedValue();

    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse(423, { error: { code: 'ACCOUNT_SUSPENDED', message: 'suspended', requestId: 'r1' } }),
      );

    const handler = jest.fn();
    registerForcedLogoutHandler(handler);

    await expect(refreshAccessToken()).rejects.toThrow('Account suspended or deactivated.');

    expect(clearSpy).toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('signed-out');
    expect(handler).toHaveBeenCalledWith('account-suspended');
  });

  it('does not invoke the forced-logout handler when there was never a session (cold boot, no refresh token)', async () => {
    jest.spyOn(secureStorage, 'getRefreshToken').mockResolvedValue(null);
    const handler = jest.fn();
    registerForcedLogoutHandler(handler);

    await expect(refreshAccessToken()).rejects.toThrow('Session is no longer valid.');

    expect(handler).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('signed-out');
  });
});
