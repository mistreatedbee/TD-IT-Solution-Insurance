import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { DashboardAuthProvider, useDashboardAuth, type DashboardAuthConfig } from './DashboardAuthProvider';
import * as dashboardAuthApi from '../api/auth';

vi.mock('../api/auth', () => ({
  getAccountMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  verifyMfaChallenge: vi.fn(),
}));

const ADMIN_CONFIG: DashboardAuthConfig = { storageKey: 'td-admin-refresh-token', allowedUserType: 'admin' };

type DashboardAuthValue = ReturnType<typeof useDashboardAuth>;

function Harness({ onReady }: { onReady: (auth: DashboardAuthValue) => void }) {
  const auth = useDashboardAuth();
  useEffect(() => {
    onReady(auth);
  }, [auth, onReady]);
  return <div data-testid="status">{auth.status}</div>;
}

function renderProvider(config: DashboardAuthConfig) {
  let current: DashboardAuthValue | null = null;
  render(
    <DashboardAuthProvider config={config}>
      <Harness onReady={(auth) => (current = auth)} />
    </DashboardAuthProvider>,
  );
  return () => current!;
}

function accountMe(overrides: Partial<dashboardAuthApi.AccountMe> = {}): dashboardAuthApi.AccountMe {
  return {
    id: 'acct-1',
    email: 'user@example.com',
    userType: 'admin',
    accountState: 'active',
    mfaRequired: true,
    mfaEnrolled: true,
    partnerOrganizationId: null,
    ...overrides,
  };
}

// SR-LU-3 (docs/features/001-authentication/security-review-login-unification.md):
// `signInWithTokens` used to set `status: 'signed-in'` synchronously, before the
// server-side role check (`GET /account/me`) resolved, and swallowed a failed or
// dropped check in an empty catch — so the privileged shell could render before,
// or despite, a failed/mismatched role check. These tests prove the fix: status
// only becomes 'signed-in' after /account/me confirms the role, and both a role
// mismatch and a network error fail CLOSED (never 'signed-in'), clearing the
// refresh token that was just written.
describe('DashboardAuthProvider.signInWithTokens (SR-LU-3)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unexpected network call in test')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not set signed-in until GET /account/me resolves and confirms the role', async () => {
    let resolveAccountMe!: (value: dashboardAuthApi.AccountMe) => void;
    vi.mocked(dashboardAuthApi.getAccountMe).mockReturnValue(
      new Promise((resolve) => {
        resolveAccountMe = resolve;
      }),
    );

    const getAuth = renderProvider(ADMIN_CONFIG);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signed-out'));

    let signInPromise!: Promise<void>;
    act(() => {
      signInPromise = getAuth().signInWithTokens('access-token', 'refresh-token');
    });

    // The critical regression assertion: status must NOT be 'signed-in' while
    // the role check is still in flight — this is exactly the bug SR-LU-3
    // found (optimistic 'signed-in' set BEFORE the server check).
    expect(screen.getByTestId('status').textContent).not.toBe('signed-in');

    await act(async () => {
      resolveAccountMe(accountMe({ userType: 'admin' }));
      await signInPromise;
    });

    expect(screen.getByTestId('status').textContent).toBe('signed-in');
  });

  it('fails closed on a role mismatch: status becomes wrong-role and the refresh token is cleared, never signed-in', async () => {
    vi.mocked(dashboardAuthApi.getAccountMe).mockResolvedValue(accountMe({ userType: 'customer' }));

    const getAuth = renderProvider(ADMIN_CONFIG);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signed-out'));

    await act(async () => {
      await getAuth().signInWithTokens('access-token', 'refresh-token');
    });

    expect(screen.getByTestId('status').textContent).toBe('wrong-role');
    expect(screen.getByTestId('status').textContent).not.toBe('signed-in');
    // SR-LU-3(c): a non-admin's refresh token must not be left resumable in
    // the admin storage slot.
    expect(sessionStorage.getItem(ADMIN_CONFIG.storageKey)).toBeNull();
  });

  it('fails closed on a dropped/errored account check: status becomes signed-out, never stuck signed-in indefinitely', async () => {
    vi.mocked(dashboardAuthApi.getAccountMe).mockRejectedValue(new Error('network blip'));

    const getAuth = renderProvider(ADMIN_CONFIG);
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signed-out'));

    await act(async () => {
      await expect(getAuth().signInWithTokens('access-token', 'refresh-token')).rejects.toThrow();
    });

    expect(screen.getByTestId('status').textContent).toBe('signed-out');
    expect(screen.getByTestId('status').textContent).not.toBe('signed-in');
    expect(sessionStorage.getItem(ADMIN_CONFIG.storageKey)).toBeNull();
  });
});
