import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerResetPasswordPage } from './CustomerResetPasswordPage';

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
}

const signOutMock = vi.fn().mockResolvedValue({ error: null });
let sessionAccessToken: string | null = 'recovery-access-token-1';

vi.mock('../customer/supabase/client', () => ({
  getSupabase: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({
          data: { session: sessionAccessToken ? { access_token: sessionAccessToken } : null },
        }),
      signOut: signOutMock,
    },
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
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
    sessionAccessToken = 'recovery-access-token-1';
    signOutMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the "request a new link" state when no recovery session exists', async () => {
    sessionAccessToken = null;
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Reset link required' })).toBeInTheDocument());
  });

  it('customer happy path: calls confirm with the recovery access token, then redirects to /login with no auto-sign-in', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      expect(url).toContain('/auth/reset-password/confirm');
      expect(init?.headers).toMatchObject({ 'Idempotency-Key': expect.any(String) });
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ recoveryAccessToken: 'recovery-access-token-1', newPassword: 'longenoughpassword' });
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

    // F-7: no auto-sign-in — the local Supabase session is torn down and the
    // page redirects straight to a normal login, never establishing a
    // session itself (no call to `auth.signInWithTokens` or the exchange
    // endpoint exists anywhere in this component).
    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
    expect(signOutMock).toHaveBeenCalledTimes(1);
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
    expect(signOutMock).toHaveBeenCalledTimes(1);
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
});
