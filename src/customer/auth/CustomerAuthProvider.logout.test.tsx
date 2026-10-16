import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerAuthProvider, useCustomerAuth } from './CustomerAuthProvider';
import { CUSTOMER_REFRESH_STORAGE_KEY } from './sessionStorageKey';

/**
 * ADR-0014 G-2 regression: web customer sign-out must actually revoke the
 * backend session. `POST /session/logout` authenticates by BEARER token; the
 * old client sent `authenticated: false`, so every web sign-out was a
 * swallowed 401 and the server-side session stayed live.
 */

vi.mock('../supabase/client', () => ({
  getSupabase: () => ({ auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } }),
}));

function Harness() {
  const auth = useCustomerAuth();
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

const ME = { id: 'c1', email: 'c@example.com', userType: 'customer', accountState: 'active', mfaRequired: false, mfaEnrolled: false, partnerOrganizationId: null };

describe('CustomerAuthProvider.signOut — ADR-0014 G-2', () => {
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
      <CustomerAuthProvider>
        <Harness />
      </CustomerAuthProvider>,
    );
    await waitFor(() => screen.getByText('status:signed-out'));
    await user.click(screen.getByText('in'));
    await waitFor(() => screen.getByText('status:signed-in'));
    await user.click(screen.getByText('out'));
    await waitFor(() => screen.getByText('status:signed-out'));

    const logoutCall = calls.find((c) => c.url.includes('/session/logout'));
    expect(logoutCall).toBeDefined();
    expect(headersOf(logoutCall!.init).Authorization).toBe('Bearer access-1');
    expect(logoutCall!.init?.method).toBe('POST');
    expect(localStorage.getItem(CUSTOMER_REFRESH_STORAGE_KEY)).toBeNull();
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
      <CustomerAuthProvider>
        <Harness />
      </CustomerAuthProvider>,
    );
    await waitFor(() => screen.getByText('status:signed-out'));
    await user.click(screen.getByText('in'));
    await waitFor(() => screen.getByText('status:signed-in'));
    await user.click(screen.getByText('out'));
    await waitFor(() => screen.getByText('status:signed-out'));

    expect(logoutAuth).toEqual(['Bearer access-1', 'Bearer access-2']);
    expect(localStorage.getItem(CUSTOMER_REFRESH_STORAGE_KEY)).toBeNull();
  });
});
