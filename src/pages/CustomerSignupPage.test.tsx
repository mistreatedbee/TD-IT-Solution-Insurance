import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** INC-003 A-16: /signup page goes through the backend, not GoTrue-direct. */

const supabaseSignUp = vi.fn();
const supabaseResend = vi.fn();
vi.mock('../customer/supabase/client', () => ({
  getSupabase: () => ({ auth: { signUp: supabaseSignUp, resend: supabaseResend } }),
  supabaseAuthRedirectUrl: () => 'http://localhost/auth/callback',
  isSupabaseAuthConfigured: () => true,
}));

import { CustomerSignupPage } from './CustomerSignupPage';

function inputs(type: 'email' | 'password'): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="${type}"]`));
}

describe('CustomerSignupPage — INC-003 A-16', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    sessionStorage.clear();
    supabaseSignUp.mockReset();
    supabaseResend.mockReset();
    fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ message: 'ok' }), { status: 202 })),
    );
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('signs up via POST /auth/signup with consent + client "web", shows the same state for every address, and resends via the backend', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CustomerSignupPage />
      </MemoryRouter>,
    );
    await user.type(inputs('email')[0]!, 'someone@example.com');
    await user.type(inputs('password')[0]!, 'long-enough-password');
    await user.type(inputs('password')[1]!, 'long-enough-password');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Sign up' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Verify your email' })).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/auth/signup');
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'someone@example.com',
      password: 'long-enough-password',
      consentAccepted: true,
      client: 'web',
    });

    await user.click(screen.getByRole('button', { name: 'Resend verification email' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [resendUrl, resendInit] = fetchMock.mock.calls[1]! as [string, RequestInit];
    expect(resendUrl).toContain('/auth/resend-verification');
    expect(JSON.parse(String(resendInit.body))).toEqual({ email: 'someone@example.com', client: 'web' });

    expect(supabaseSignUp).not.toHaveBeenCalled();
    expect(supabaseResend).not.toHaveBeenCalled();
  });

  it('does not call the backend without consent', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CustomerSignupPage />
      </MemoryRouter>,
    );
    await user.type(inputs('email')[0]!, 'someone@example.com');
    await user.type(inputs('password')[0]!, 'long-enough-password');
    await user.type(inputs('password')[1]!, 'long-enough-password');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));
    await waitFor(() => expect(screen.getByText(/accept the privacy notice/i)).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
