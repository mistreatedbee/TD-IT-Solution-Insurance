import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardAuthProvider, useDashboardAuth, type DashboardAuthConfig } from './DashboardAuthProvider';

/**
 * ADR-0014 §14.6 AE-5 regression: privileged (admin / security-company
 * operator / support-agent) web sign-out must actually revoke the backend
 * session. `POST /session/logout` authenticates by BEARER token only
 * (backend/src/routes/session.ts:58) and ignores the request body — the old
 * client sent `authenticated: false` with `{ refreshToken }` in the body, so
 * every privileged web sign-out was a swallowed 401 and the server-side
 * session (and its `logout` audit row) was never written. This is the same
 * class of bug as G-2, fixed on the customer side.
 *
 * All three privileged roles (admin, security-company operator,
 * support/call-centre agent) share this one `DashboardAuthProvider`, so a
 * single config here covers all of them.
 */

const ADMIN_CONFIG: DashboardAuthConfig = { storageKey: 'td-admin-refresh-token', allowedUserType: 'admin' };

function Harness() {
  const auth = useDashboardAuth();
  return (
    <div>
      <span>status:{auth.status}</span>
      <button onClick={() => void auth.signInWithTokens('access-1', 'refresh-1')}>in</button>
      <button onClick={() => void auth.signOut()}>out</button>
    </div>
  );
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const ME = {
  id: 'a1',
  email: 'admin@example.com',
  userType: 'admin',
  accountState: 'active',
  mfaRequired: false,
  mfaEnrolled: false,
  partnerOrganizationId: null,
};

describe('DashboardAuthProvider.signOut — ADR-0014 §14.6 AE-5', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  function headersOf(init: RequestInit | undefined): Record<string, string> {
    return (init?.headers ?? {}) as Record<string, string>;
  }

  it('calls POST /session/logout WITH the bearer access token, then clears the local session', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.includes('/account/me')) return json(ME);
        if (url.includes('/session/logout')) return Promise.resolve(new Response(null, { status: 204 }));
        return Promise.reject(new Error(`unexpected ${url}`));
      }),
    );
    const user = userEvent.setup();
    render(
      <DashboardAuthProvider config={ADMIN_CONFIG}>
        <Harness />
      </DashboardAuthProvider>,
    );
    await waitFor(() => screen.getByText('status:signed-out'));
    await user.click(screen.getByText('in'));
    await waitFor(() => screen.getByText('status:signed-in'));
    await user.click(screen.getByText('out'));
    await waitFor(() => screen.getByText('status:signed-out'));

    const logoutCall = calls.find((c) => c.url.includes('/session/logout'));
    expect(logoutCall).toBeDefined();
    // The defining regression assertion: a bearer token is attached (the
    // old client sent `authenticated: false` and no body the backend reads
    // at all, so this header was absent and the backend 401'd silently).
    expect(headersOf(logoutCall!.init).Authorization).toBe('Bearer access-1');
    expect(logoutCall!.init?.method).toBe('POST');
    // No refresh-token-in-body shape is sent anymore — the backend never
    // reads it (session.ts:58 authenticates by bearer token only).
    expect(logoutCall!.init?.body).toBeUndefined();
    expect(sessionStorage.getItem(ADMIN_CONFIG.storageKey)).toBeNull();
  });

  it('an expired access token is refreshed once and the logout retried, so it still reaches the server', async () => {
    const logoutAuth: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/account/me')) return json(ME);
        if (url.includes('/session/refresh')) {
          return json({ accessToken: 'access-2', refreshToken: 'refresh-2', sessionId: 's2' });
        }
        if (url.includes('/session/logout')) {
          const auth = headersOf(init).Authorization ?? '';
          logoutAuth.push(auth);
          return auth === 'Bearer access-2'
            ? Promise.resolve(new Response(null, { status: 204 }))
            : json({ error: { code: 'UNAUTHORIZED', message: 'expired' } }, 401);
        }
        return Promise.reject(new Error(`unexpected ${url}`));
      }),
    );
    const user = userEvent.setup();
    render(
      <DashboardAuthProvider config={ADMIN_CONFIG}>
        <Harness />
      </DashboardAuthProvider>,
    );
    await waitFor(() => screen.getByText('status:signed-out'));
    await user.click(screen.getByText('in'));
    await waitFor(() => screen.getByText('status:signed-in'));
    await user.click(screen.getByText('out'));
    await waitFor(() => screen.getByText('status:signed-out'));

    expect(logoutAuth).toEqual(['Bearer access-1', 'Bearer access-2']);
    expect(sessionStorage.getItem(ADMIN_CONFIG.storageKey)).toBeNull();
  });

  it('clears local tokens only after the backend logout call settles, not before', async () => {
    let releaseLogout!: () => void;
    const callOrder: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/account/me')) return json(ME);
        if (url.includes('/session/logout')) {
          callOrder.push('logout-called');
          return new Promise<Response>((resolve) => {
            releaseLogout = () => resolve(new Response(null, { status: 204 }));
          });
        }
        return Promise.reject(new Error(`unexpected ${url}`));
      }),
    );
    const user = userEvent.setup();
    render(
      <DashboardAuthProvider config={ADMIN_CONFIG}>
        <Harness />
      </DashboardAuthProvider>,
    );
    await waitFor(() => screen.getByText('status:signed-out'));
    await user.click(screen.getByText('in'));
    await waitFor(() => screen.getByText('status:signed-in'));

    await user.click(screen.getByText('out'));
    // The logout request is in flight — local tokens must still be present,
    // because clearing them happens in the `finally` AFTER the call settles.
    expect(callOrder).toEqual(['logout-called']);
    expect(sessionStorage.getItem(ADMIN_CONFIG.storageKey)).toBe('refresh-1');
    expect(screen.getByText('status:signed-in')).toBeTruthy();

    releaseLogout();
    await waitFor(() => screen.getByText('status:signed-out'));
    expect(sessionStorage.getItem(ADMIN_CONFIG.storageKey)).toBeNull();
  });
});
