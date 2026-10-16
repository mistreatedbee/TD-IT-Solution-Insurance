import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * INC-003 A-14 / A-16 regression (A-5 threat model §6.1, §3 rows C-3/C-5):
 * - signup and resend go to the backend, never GoTrue-direct;
 * - the chosen password is never written to browser storage, and is never
 *   replayed as a background password grant while waiting for verification.
 */

const loginWithPassword = vi.fn();
const signInWithTokens = vi.fn().mockResolvedValue(undefined);
const refreshAccount = vi.fn().mockResolvedValue({ accountState: 'active' });

vi.mock('../../customer/auth/CustomerAuthProvider', () => ({
  useCustomerAuth: () => ({
    status: 'signed-out',
    account: null,
    accessToken: null,
    loginWithPassword,
    signInWithTokens,
    refreshAccount,
    signOut: vi.fn(),
    completeMfa: vi.fn(),
  }),
}));

const supabaseSignUp = vi.fn();
const supabaseResend = vi.fn();
vi.mock('../../customer/supabase/client', () => ({
  getSupabase: () => ({ auth: { signUp: supabaseSignUp, resend: supabaseResend } }),
  supabaseAuthRedirectUrl: () => 'http://localhost/auth/callback',
}));

import { CustomerOnboardingPage } from './CustomerOnboardingPage';

const PASSWORD = 'my-secret-signup-password';

function storageValues(): string[] {
  const out: string[] = [];
  for (const store of [sessionStorage, localStorage]) {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key) out.push(`${key}=${store.getItem(key) ?? ''}`);
    }
  }
  return out;
}

function inputs(type: 'email' | 'password'): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`));
}

async function fillSignup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'I already have an account' }));
  // Signup form comes first on this step: [email, (login email)], [password, confirm, (login password)].
  await user.type(inputs('email')[0]!, 'new.customer@example.com');
  await user.type(inputs('password')[0]!, PASSWORD);
  await user.type(inputs('password')[1]!, PASSWORD);
}

async function goToSignupAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await fillSignup(user);
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('CustomerOnboardingPage — INC-003 A-14 / A-16', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    loginWithPassword.mockReset();
    supabaseSignUp.mockReset();
    supabaseResend.mockReset();
    fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            String(url).includes('/auth/resend-verification')
              ? { message: 'If this account needs verifying, check your inbox.', retryAfterSeconds: 60 }
              : { message: 'If this email is new, check your inbox to verify your account.' },
          ),
          { status: 202 },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('A-16: signup posts to the backend with consent and client "web" — never supabase.auth.signUp', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CustomerOnboardingPage />
      </MemoryRouter>,
    );
    await goToSignupAndSubmit(user);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument());
    const signupCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/auth/signup'));
    expect(signupCall).toBeDefined();
    expect(JSON.parse(String((signupCall![1] as RequestInit).body))).toEqual({
      email: 'new.customer@example.com',
      password: PASSWORD,
      consentAccepted: true,
      client: 'web',
    });
    expect(supabaseSignUp).not.toHaveBeenCalled();
  });

  it('A-16: signup is not sent at all without consent', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CustomerOnboardingPage />
      </MemoryRouter>,
    );
    await fillSignup(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByText(/accept the terms/i)).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('A-14: the password is never written to browser storage and never replayed in the background', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CustomerOnboardingPage />
      </MemoryRouter>,
    );
    await goToSignupAndSubmit(user);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument());

    expect(storageValues().some((v) => v.includes(PASSWORD))).toBe(false);
    // The pre-fix wizard fired a GoTrue password grant immediately on entering
    // this step (and every 10 s after). Nothing may sign in without the user.
    expect(loginWithPassword).not.toHaveBeenCalled();
  });

  it('A-14: after verifying, the user signs in once on this step with the password they type', async () => {
    loginWithPassword.mockResolvedValue({ kind: 'tokens', accessToken: 'a', refreshToken: 'r' });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CustomerOnboardingPage />
      </MemoryRouter>,
    );
    await goToSignupAndSubmit(user);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument());

    expect(inputs('password')).toHaveLength(1);
    await user.type(inputs('password')[0]!, PASSWORD);
    await user.click(screen.getByRole('button', { name: /I.ve verified/ }));

    await waitFor(() => expect(loginWithPassword).toHaveBeenCalledTimes(1));
    expect(loginWithPassword).toHaveBeenCalledWith('new.customer@example.com', PASSWORD);
    expect(signInWithTokens).toHaveBeenCalledWith('a', 'r');
  });

  it('A-16: resend posts to the backend, never supabase.auth.resend', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CustomerOnboardingPage />
      </MemoryRouter>,
    );
    await goToSignupAndSubmit(user);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Resend email' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/auth/resend-verification'))).toBe(true),
    );
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/auth/resend-verification'))!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ email: 'new.customer@example.com', client: 'web' });
    expect(supabaseResend).not.toHaveBeenCalled();
  });

  it('A-14: purges a plaintext-password record left behind by a pre-fix build', async () => {
    sessionStorage.setItem(
      'td_signup_pending_auth',
      JSON.stringify({ email: 'old@example.com', password: 'legacy-password', expiresAt: Date.now() + 60_000 }),
    );
    render(
      <MemoryRouter>
        <CustomerOnboardingPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(sessionStorage.getItem('td_signup_pending_auth')).toBeNull());
  });
});
