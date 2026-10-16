import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerAuthCallbackPage } from './CustomerAuthCallbackPage';

/**
 * INC-003 A-13 / A-17 regression (A-5 threat model §5): the email-link
 * callback must never sign the visitor in from a URL-borne credential, must
 * refuse link types the product does not issue before any SDK call, and
 * must strip credentials from the address bar on every exit.
 */

const verifyOtpMock = vi.fn();
const exchangeCodeMock = vi.fn();
const signOutMock = vi.fn().mockResolvedValue({ error: null });
const getSessionMock = vi.fn();

vi.mock('../customer/supabase/client', () => ({
  getSupabase: () => ({
    auth: {
      verifyOtp: verifyOtpMock,
      exchangeCodeForSession: exchangeCodeMock,
      signOut: signOutMock,
      getSession: getSessionMock,
    },
  }),
  supabaseAuthRedirectUrl: () => 'http://localhost/auth/callback',
}));

function renderAt(path: string) {
  // The page reads the fragment from window.location (react-router does not
  // model it), so mirror the entry there too.
  window.history.replaceState(null, '', path);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/callback" element={<CustomerAuthCallbackPage />} />
        <Route path="/auth/email-verified" element={<div>Email verified page</div>} />
        <Route path="/reset-password" element={<div>Reset password page</div>} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function backendCalls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]));
}

describe('CustomerAuthCallbackPage (INC-003 A-13 / A-17)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    verifyOtpMock.mockReset();
    exchangeCodeMock.mockReset();
    signOutMock.mockClear();
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'lingering-gotrue-token' } }, error: null });
    sessionStorage.clear();
    localStorage.clear();
    fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('raw #access_token (attacker-suppliable) is never exchanged for a session', async () => {
    renderAt('/auth/callback#access_token=attacker-token&refresh_token=r&token_type=bearer');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Link problem' })).toBeInTheDocument());
    expect(backendCalls(fetchMock).some((u) => u.includes('/auth/supabase/exchange'))).toBe(false);
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    // Credentials stripped from the address bar even on the error exit.
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('');
  });

  it('a lingering browser GoTrue session is NOT re-minted on a bare page load', async () => {
    renderAt('/auth/callback');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Link problem' })).toBeInTheDocument());
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(backendCalls(fetchMock).some((u) => u.includes('/auth/supabase/exchange'))).toBe(false);
  });

  it.each(['magiclink', 'invite', 'email_change', 'email'])(
    'A-17: refuses type=%s before any SDK call',
    async (type) => {
      renderAt(`/auth/callback?token_hash=hash-1&type=${type}`);

      await waitFor(() => expect(screen.getByRole('heading', { name: 'Link problem' })).toBeInTheDocument());
      expect(verifyOtpMock).not.toHaveBeenCalled();
      expect(backendCalls(fetchMock).some((u) => u.includes('/auth/supabase/exchange'))).toBe(false);
      expect(window.location.search).toBe('');
    },
  );

  it('signup verification succeeds WITHOUT signing in: session cleared locally, routed to sign in', async () => {
    verifyOtpMock.mockResolvedValue({ data: { session: { access_token: 'gotrue-from-link' } }, error: null });
    renderAt('/auth/callback?token_hash=hash-2&type=signup&email=new%40example.com');

    await waitFor(() => expect(screen.getByText('Email verified page')).toBeInTheDocument());
    expect(verifyOtpMock).toHaveBeenCalledWith({ token_hash: 'hash-2', type: 'signup' });
    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    const urls = backendCalls(fetchMock);
    expect(urls.some((u) => u.includes('/auth/supabase/exchange'))).toBe(false);
    // Best-effort account sync instead of a session (SR-006-2 generic endpoint).
    expect(urls.some((u) => u.includes('/auth/notify-email-verified'))).toBe(true);
    expect(window.location.search).toBe('');
  });

  it('PKCE ?code= verification also does not sign in', async () => {
    exchangeCodeMock.mockResolvedValue({ data: { session: { access_token: 'gotrue-from-code' } }, error: null });
    renderAt('/auth/callback?code=pkce-code-1');

    await waitFor(() => expect(screen.getByText('Email verified page')).toBeInTheDocument());
    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    expect(backendCalls(fetchMock).some((u) => u.includes('/auth/supabase/exchange'))).toBe(false);
  });

  it('A-24: a recovery link is NOT redeemed in the browser; the token is forwarded to /reset-password in router state', async () => {
    renderAt('/auth/callback?token_hash=hash-3&type=recovery&email=user%40example.com');

    await waitFor(() => expect(screen.getByText('Reset password page')).toBeInTheDocument());
    // No browser recovery session is planted (closes the §13.4 recovery-CSRF residual).
    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(backendCalls(fetchMock).some((u) => u.includes('/auth/supabase/exchange'))).toBe(false);
    expect(window.location.search).toBe('');
  });

  it('A-24 / §15.3: a recovery link without the email is refused — the stored signup email is never used', async () => {
    // Another person's signup email is stored in this (shared) browser.
    sessionStorage.setItem('td-signup-email', 'someone-else@example.com');
    renderAt('/auth/callback?token_hash=hash-4&type=recovery');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Link problem' })).toBeInTheDocument());
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });
});
