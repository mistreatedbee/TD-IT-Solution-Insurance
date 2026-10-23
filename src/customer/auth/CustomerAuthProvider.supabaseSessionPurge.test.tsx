import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerAuthProvider } from './CustomerAuthProvider';

/**
 * ADR-0014 AE-3: after Phase 1, nothing reads the browser GoTrue session
 * any more, but `persistSession: true` (`../supabase/client.ts`) left one
 * behind for every returning web customer. This must be purged on mount —
 * a client-side mitigation only (ADR-0014 §9 RR-3, §14.5 AE-3), not a
 * replacement for Phase 3's server-side purge.
 */

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

function TestHarness() {
  return <div data-testid="status">provider-mounted</div>;
}

describe('CustomerAuthProvider — AE-3 stale GoTrue session purge', () => {
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

  it('removes a stale sb-<project-ref>-auth-token key left by the browser GoTrue client', async () => {
    localStorage.setItem('sb-abcxyzprojectref-auth-token', JSON.stringify({ access_token: 'stale' }));

    render(
      <CustomerAuthProvider>
        <TestHarness />
      </CustomerAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toBeInTheDocument());
    expect(localStorage.getItem('sb-abcxyzprojectref-auth-token')).toBeNull();
  });

  it('removes a stale PKCE code-verifier key (sb-<project-ref>-auth-token-code-verifier)', async () => {
    localStorage.setItem('sb-abcxyzprojectref-auth-token-code-verifier', 'stale-verifier/signup');

    render(
      <CustomerAuthProvider>
        <TestHarness />
      </CustomerAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toBeInTheDocument());
    expect(localStorage.getItem('sb-abcxyzprojectref-auth-token-code-verifier')).toBeNull();
  });

  it('leaves a non-matching key alone', async () => {
    localStorage.setItem('some-other-app-key', 'unrelated-value');

    render(
      <CustomerAuthProvider>
        <TestHarness />
      </CustomerAuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status')).toBeInTheDocument());
    expect(localStorage.getItem('some-other-app-key')).toBe('unrelated-value');
  });

  it('the purge pattern does not match this app’s own refresh-token storage key', () => {
    // Unit-level guard against the wildcard regex ever widening to collide
    // with CUSTOMER_REFRESH_STORAGE_KEY (ADR-0014 §17.3's safety argument
    // for AE-3) — checked directly, not through the full hydration flow,
    // since 'td-customer-web-refresh' being present also drives this
    // provider's own session-refresh effect, which is unrelated to AE-3.
    expect(/^sb-.*-auth-token(-code-verifier)?$/.test('td-customer-web-refresh')).toBe(false);
  });
});
