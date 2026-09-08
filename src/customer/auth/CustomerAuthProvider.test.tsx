import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { CustomerAuthProvider, useCustomerAuth } from './CustomerAuthProvider';
import * as customerAuthApi from '../api/auth';
import { PRIVILEGED_DASHBOARD_CONFIG } from '../../dashboard/auth/roleRouting';

vi.mock('../api/auth', async () => {
  const actual = await vi.importActual<typeof import('../api/auth')>('../api/auth');
  return {
    ...actual,
    getAccountMe: vi.fn(),
    logout: vi.fn(),
    verifyMfaChallenge: vi.fn(),
  };
});

vi.mock('../supabase/client', () => ({
  getSupabase: () => ({ auth: { signOut: vi.fn() } }),
}));

const ADMIN_KEY = PRIVILEGED_DASHBOARD_CONFIG.admin.storageKey;
const CUSTOMER_KEY = 'td-customer-web-refresh';

type CustomerAuthValue = ReturnType<typeof useCustomerAuth>;

function Harness({ onReady }: { onReady: (auth: CustomerAuthValue) => void }) {
  const auth = useCustomerAuth();
  useEffect(() => {
    onReady(auth);
  }, [auth, onReady]);
  return <div data-testid="status">{auth.status}</div>;
}

function renderProvider() {
  let current: CustomerAuthValue | null = null;
  render(
    <CustomerAuthProvider>
      <Harness onReady={(auth) => (current = auth)} />
    </CustomerAuthProvider>,
  );
  return () => current!;
}

// SR-LU-4 (docs/features/001-authentication/security-review-login-unification.md)
// scenario (a): "Privileged -> customer. Sign in as admin at /login ... Return to
// /login, sign in as a customer. The customer session is established;
// td-admin-refresh-token is untouched and the admin session is not revoked
// server-side." This proves the fix: establishing the customer session now clears
// the previously-live admin session's storage slot.
describe('CustomerAuthProvider.signInWithTokens clears other-role sessions (SR-LU-4)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accessToken: 'stub' }) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('logging in as a customer after an admin session was left live in this browser clears the admin slot', async () => {
    // Simulate: this browser previously signed in as admin at /login (or
    // /admin/login) and never logged out — the admin refresh token is still
    // sitting in its sessionStorage slot.
    sessionStorage.setItem(ADMIN_KEY, 'stale-admin-refresh-token');

    vi.mocked(customerAuthApi.getAccountMe).mockResolvedValue({
      id: 'cust-1',
      email: 'customer@example.com',
      userType: 'customer',
      accountState: 'active',
      mfaRequired: false,
      mfaEnrolled: false,
      partnerOrganizationId: null,
    });

    const getAuth = renderProvider();
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('signed-out'));

    await act(async () => {
      await getAuth().signInWithTokens('customer-access-token', 'customer-refresh-token');
    });

    // The new customer session is established.
    expect(localStorage.getItem(CUSTOMER_KEY)).toBe('customer-refresh-token');
    // The stale admin session is gone — navigating to /admin now hits an
    // empty storage slot instead of resuming full admin access with no
    // credentials re-entered.
    expect(sessionStorage.getItem(ADMIN_KEY)).toBeNull();
  });
});
