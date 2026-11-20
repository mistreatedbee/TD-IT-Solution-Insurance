import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerAuthProvider } from '../customer/auth/CustomerAuthProvider';
import { CustomerLoginPage } from './CustomerLoginPage';

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function byName(name: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (el) return el;
  const byType = document.querySelector<HTMLInputElement>(`input[type="${name}"]`);
  if (byType) return byType;
  throw new Error(`no input matching "${name}" found`);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <CustomerAuthProvider>
        <Routes>
          <Route path="/login" element={<CustomerLoginPage />} />
          <Route path="/dashboard" element={<div>Customer home</div>} />
        </Routes>
      </CustomerAuthProvider>
    </MemoryRouter>,
  );
}

describe('CustomerLoginPage — MFA enrollment recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reissues a fresh enrollment ticket when the user clicks “Set up MFA again”', async () => {
    const user = userEvent.setup();
    let loginAttempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.endsWith('/auth/login') && method === 'POST') {
          loginAttempts += 1;
          if (loginAttempts === 1) {
            return jsonResponse({ mfaRequired: true, mfaChallengeToken: 'challenge-1', expiresIn: 600 });
          }
          return jsonResponse({ mfaEnrollmentRequired: true, enrollmentTicket: 'ticket-1', expiresIn: 600 });
        }
        if (url.endsWith('/auth/mfa/challenge') && method === 'POST') {
          return jsonResponse({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900, sessionId: 'sess-1' });
        }
        if (url.endsWith('/mfa/enroll') && method === 'POST') {
          return jsonResponse({ qrCodeSvg: '<svg></svg>', manualEntryKey: 'ABCD-1234', enrollmentId: 'enroll-1' });
        }
        if (url.endsWith('/mfa/enroll/verify') && method === 'POST') {
          return jsonResponse({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900, sessionId: 'sess-1' });
        }
        if (url.endsWith('/account/me') && method === 'GET') {
          return jsonResponse({
            id: 'acct-1',
            email: 'customer@example.com',
            userType: 'customer',
            accountState: 'active',
            mfaRequired: true,
            mfaEnrolled: true,
            partnerOrganizationId: null,
          });
        }
        if (url.endsWith('/session/refresh') && method === 'POST') {
          return Promise.reject(new Error('no session to refresh in this test'));
        }
        if (url.endsWith('/auth/logout') && method === 'POST') {
          return jsonResponse({});
        }
        return Promise.reject(new Error(`unexpected fetch: ${url} ${method}`));
      }),
    );

    renderPage();

    await user.type(byName('email'), 'customer@example.com');
    await user.type(byName('password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(screen.getByText('Enter the 6-digit code from your authenticator app.')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Set up MFA again' }));

    await waitFor(() => expect(screen.getByText('ABCD-1234')).toBeInTheDocument());
    expect(loginAttempts).toBe(2);
    expect(screen.getByRole('heading', { name: 'Set up two-factor authentication' })).toBeInTheDocument();

    await user.type(byName('code'), '123456');
    // The 6th digit auto-submits the code (no Verify click needed).

    await waitFor(() => expect(screen.getByText('Customer home')).toBeInTheDocument());
  });
});

describe('CustomerLoginPage — slow server', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('wakes the server when the page opens and explains a long wait only after a few seconds', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/login') && (init?.method ?? 'GET') === 'POST') return new Promise(() => undefined); // never answers
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    // the warm-up ping to the health endpoint is made on open (once per page load, so it may already be spent)
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await user.type(byName('email'), 'a@example.com');
    await user.type(byName('password'), 'password-123');
    await user.click(screen.getByRole('button', { name: /sign in|log in/i }));

    expect(screen.queryByText(/Still signing you in/)).not.toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(4100);
    expect(await screen.findByText(/Still signing you in/)).toBeInTheDocument();
  });
});
