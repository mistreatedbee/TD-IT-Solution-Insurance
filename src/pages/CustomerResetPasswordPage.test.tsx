import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerResetPasswordPage } from './CustomerResetPasswordPage';

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
}

// INC-003 §15.3 C-7: the browser holds an ordinary persisted LOGIN session
// in every test below. The page must never read or use it.
const signOutMock = vi.fn().mockResolvedValue({ error: null });
let sessionAccessToken: string | null = 'persisted-login-session-token';
const getSessionMock = vi.fn(() =>
  Promise.resolve({
    data: { session: sessionAccessToken ? { access_token: sessionAccessToken } : null },
  }),
);

vi.mock('../customer/supabase/client', () => ({
  getSupabase: () => ({
    auth: {
      getSession: getSessionMock,
      signOut: signOutMock,
    },
  }),
}));

const LINK_QUERY = '?token_hash=hash-abc&type=recovery&email=user%40example.com';

/** Renders the page as reached from a genuine recovery email link (A-24). */
function renderPage(query: string = LINK_QUERY) {
  window.history.replaceState(null, '', `/reset-password${query}`);
  return render(
    <MemoryRouter initialEntries={[`/reset-password${query}`]}>
      <Routes>
        <Route path="/reset-password" element={<CustomerResetPasswordPage />} />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/forgot-password" element={<div>Forgot password page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function passwordInputs(): { password: HTMLInputElement; confirm: HTMLInputElement } {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="password"]');
  if (inputs.length < 2) throw new Error('expected two password inputs');
  return { password: inputs[0], confirm: inputs[1] };
}

function codeInput(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>('input[inputmode="numeric"]');
  if (!el) throw new Error('no code input found');
  return el;
}

describe('CustomerResetPasswordPage (INC-003 F-3/F-4/F-6/F-7)', () => {
  beforeEach(() => {
    sessionAccessToken = 'persisted-login-session-token';
    signOutMock.mockClear();
    getSessionMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('shows the "request a new link" state when there is no recovery link', async () => {
    sessionAccessToken = null;
    renderPage('');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Reset link required' })).toBeInTheDocument());
  });

  it('§15.3 C-7: a logged-in browser session alone can NEVER reach the password form or submit', async () => {
    // A persisted ordinary login session exists (sessionAccessToken is set),
    // but there is no link in the URL and nothing in router state.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage('');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Reset link required' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Choose a new password' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update password' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(0);
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('customer happy path: calls confirm with the link token (never a browser session), then redirects to /login with no auto-sign-in', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      expect(url).toContain('/auth/reset-password/confirm');
      expect(init?.headers).toMatchObject({ 'Idempotency-Key': expect.any(String) });
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ email: 'user@example.com', resetToken: 'hash-abc', newPassword: 'longenoughpassword' });
      expect(body.recoveryAccessToken).toBeUndefined();
      return jsonResponse({ message: 'Password reset complete.', allSessionsRevoked: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByRole('heading', { name: 'Choose a new password' }));

    const { password, confirm } = passwordInputs();
    await user.type(password, 'longenoughpassword');
    await user.type(confirm, 'longenoughpassword');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    // F-7: no auto-sign-in — the page redirects straight to a normal login,
    // never establishing a session itself, and (C-7) never touches the
    // browser's GoTrue session at all.
    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
    expect(signOutMock).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('does not gate on the server-side privileged minimum client-side (F-6): a 12-char password is submitted, and a VALIDATION_ERROR is rendered verbatim rather than inferring user type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'The request could not be processed as submitted.',
              details: ['password does not meet the minimum length requirement'],
            },
          },
          400,
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByRole('heading', { name: 'Choose a new password' }));

    const { password, confirm } = passwordInputs();
    await user.type(password, 'twelvecharsx');
    await user.type(confirm, 'twelvecharsx');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() =>
      expect(screen.getByText(/password does not meet the minimum length requirement/)).toBeInTheDocument(),
    );
    // Never stays silent nor claims success on a rejected password.
    expect(screen.queryByRole('heading', { name: 'Password updated' })).not.toBeInTheDocument();
  });

  it('privileged/staff path: mfaVerificationRequired routes to a real TOTP step, then verify succeeds and redirects with no auto-sign-in', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/auth/reset-password/confirm')) {
        return jsonResponse({ mfaVerificationRequired: true, mfaVerificationToken: 'mfa-token-1' });
      }
      if (url.includes('/auth/reset-password/mfa-verify')) {
        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({ mfaVerificationToken: 'mfa-token-1', code: '123456' });
        return jsonResponse({ message: 'Password reset complete.', allSessionsRevoked: true });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByRole('heading', { name: 'Choose a new password' }));

    const { password, confirm } = passwordInputs();
    await user.type(password, 'a-very-long-privileged-password');
    await user.type(confirm, 'a-very-long-privileged-password');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: "Verify it's you" })).toBeInTheDocument());

    await user.type(codeInput(), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and finish' }));

    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('surfaces the mfa-verify rate limit (5/15min) as a real UI state, not a silent failure', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/reset-password/confirm')) {
        return jsonResponse({ mfaVerificationRequired: true, mfaVerificationToken: 'mfa-token-1' });
      }
      if (url.includes('/auth/reset-password/mfa-verify')) {
        return jsonResponse(
          { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
          429,
          { 'Retry-After': '900' },
        );
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByRole('heading', { name: 'Choose a new password' }));
    const { password, confirm } = passwordInputs();
    await user.type(password, 'a-very-long-privileged-password');
    await user.type(confirm, 'a-very-long-privileged-password');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => screen.getByRole('heading', { name: "Verify it's you" }));
    await user.type(codeInput(), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify and finish' }));

    await waitFor(() => expect(screen.getByText(/Too many attempts/)).toBeInTheDocument());
    expect(screen.getByText(/15 minute/)).toBeInTheDocument();
  });

  describe('INC-003 A-24: recovery link read from the URL and verified server-side', () => {
    function renderWithLink(query: string, state?: unknown) {
      window.history.replaceState(null, '', `/reset-password${query}`);
      return render(
        <MemoryRouter initialEntries={[{ pathname: '/reset-password', search: query, state }]}>
          <Routes>
            <Route path="/reset-password" element={<CustomerResetPasswordPage />} />
            <Route path="/login" element={<div>Login page</div>} />
          </Routes>
        </MemoryRouter>,
      );
    }

    it('a genuine hook link (?token_hash&type=recovery&email) works with NO browser session, and scrubs the URL at once', async () => {
      sessionAccessToken = null; // the F-9 tests mocked a session; a real link has none
      const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        expect(url).toContain('/auth/reset-password/confirm');
        expect(init?.headers).toMatchObject({ 'Idempotency-Key': expect.any(String) });
        expect(JSON.parse(String(init?.body))).toEqual({
          email: 'user@example.com',
          resetToken: 'hash-abc',
          newPassword: 'longenoughpassword',
        });
        return jsonResponse({ message: 'Password reset complete.', allSessionsRevoked: true });
      });
      vi.stubGlobal('fetch', fetchMock);

      const user = userEvent.setup();
      renderWithLink('?token_hash=hash-abc&type=recovery&email=User%40Example.com');
      await waitFor(() => screen.getByRole('heading', { name: 'Choose a new password' }));
      // Scrubbed before the user has typed anything.
      expect(window.location.search).toBe('');
      expect(getSessionMock).not.toHaveBeenCalled();

      const { password, confirm } = passwordInputs();
      await user.type(password, 'longenoughpassword');
      await user.type(confirm, 'longenoughpassword');
      await user.click(screen.getByRole('button', { name: 'Update password' }));

      await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // No browser session was created, so none is touched.
      expect(signOutMock).not.toHaveBeenCalled();
    });

    it('privileged account via a link still gets the full MFA step (SR-6 unchanged)', async () => {
      sessionAccessToken = null;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) =>
          url.includes('/confirm')
            ? jsonResponse({ mfaVerificationRequired: true, mfaVerificationToken: 'mfa-token-1' })
            : jsonResponse({ message: 'Password reset complete.', allSessionsRevoked: true }),
        ),
      );
      const user = userEvent.setup();
      renderWithLink('?token_hash=hash-abc&type=recovery&email=staff%40example.com');
      await waitFor(() => screen.getByRole('heading', { name: 'Choose a new password' }));
      const { password, confirm } = passwordInputs();
      await user.type(password, 'a-very-long-privileged-password');
      await user.type(confirm, 'a-very-long-privileged-password');
      await user.click(screen.getByRole('button', { name: 'Update password' }));
      await waitFor(() => expect(screen.getByRole('heading', { name: "Verify it's you" })).toBeInTheDocument());
    });

    it('a link whose type is not recovery, or that lacks the email, is refused without calling the backend', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      renderWithLink('?token_hash=hash-abc&type=signup&email=user%40example.com');
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Reset link required' })).toBeInTheDocument());
      expect(window.location.search).toBe('');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts the token handed over in router state by /auth/callback (never via the URL)', async () => {
      sessionAccessToken = null;
      const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({ email: 'user@example.com', resetToken: 'hash-from-callback' });
        return jsonResponse({ message: 'Password reset complete.', allSessionsRevoked: true });
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();
      renderWithLink('', { resetToken: 'hash-from-callback', email: 'user@example.com' });
      await waitFor(() => screen.getByRole('heading', { name: 'Choose a new password' }));
      const { password, confirm } = passwordInputs();
      await user.type(password, 'longenoughpassword');
      await user.type(confirm, 'longenoughpassword');
      await user.click(screen.getByRole('button', { name: 'Update password' }));
      await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
      expect(getSessionMock).not.toHaveBeenCalled();
    });

    it('§15.3: the router-state token is cleared from history state as soon as it is read', async () => {
      sessionAccessToken = null;
      let lastState: unknown = 'unset';
      function StateProbe() {
        lastState = useLocation().state;
        return null;
      }
      render(
        <MemoryRouter
          initialEntries={[{ pathname: '/reset-password', state: { resetToken: 'hash-from-callback', email: 'user@example.com' } }]}
        >
          <StateProbe />
          <Routes>
            <Route path="/reset-password" element={<CustomerResetPasswordPage />} />
          </Routes>
        </MemoryRouter>,
      );
      await waitFor(() => screen.getByRole('heading', { name: 'Choose a new password' }));
      await waitFor(() => expect(lastState).toBeNull());
    });

    it('§15.4: a failure BEFORE redemption (rate limit) does not claim the link is spent', async () => {
      sessionAccessToken = null;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() =>
          jsonResponse({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } }, 429, {
            'Retry-After': '60',
          }),
        ),
      );
      const user = userEvent.setup();
      renderWithLink('?token_hash=hash-abc&type=recovery&email=user%40example.com');
      await waitFor(() => screen.getByRole('heading', { name: 'Choose a new password' }));
      const { password, confirm } = passwordInputs();
      await user.type(password, 'longenoughpassword');
      await user.type(confirm, 'longenoughpassword');
      await user.click(screen.getByRole('button', { name: 'Update password' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Update password' })).not.toBeDisabled());
      expect(screen.queryByText(/can only be used once/)).not.toBeInTheDocument();
    });

    it('a failed submission tells the user the single-use link is spent', async () => {
      sessionAccessToken = null;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() =>
          jsonResponse(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'The request could not be processed as submitted.',
                details: ['password does not meet the minimum length requirement'],
              },
            },
            400,
          ),
        ),
      );
      const user = userEvent.setup();
      renderWithLink('?token_hash=hash-abc&type=recovery&email=staff%40example.com');
      await waitFor(() => screen.getByRole('heading', { name: 'Choose a new password' }));
      const { password, confirm } = passwordInputs();
      await user.type(password, 'twelve-chars');
      await user.type(confirm, 'twelve-chars');
      await user.click(screen.getByRole('button', { name: 'Update password' }));
      await waitFor(() => expect(screen.getByText(/can only be used once/)).toBeInTheDocument());
    });
  });
});
