/**
 * P0 fix regression test: a staff account that accepted its invitation but
 * closed the tab before finishing MFA enrollment must not be permanently
 * locked out. `POST /auth/login` re-issues a fresh `enrollmentTicket` in
 * that state (`backend/src/routes/auth.ts`, `mfaRequired && !verifiedFactor`)
 * — this page must drop the user straight into the enrollment step (reusing
 * `MfaEnrollmentStep`, the same component the invitation-accept flow uses)
 * instead of telling them to click a dead invitation link.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivilegedLoginPage } from './PrivilegedLoginPage';
import { DashboardAuthProvider } from '../auth/DashboardAuthProvider';

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function byName(name: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (el) return el;
  // PrivilegedLoginPage's email/password Inputs don't set `name`; fall back
  // to type-based lookup for those two fields.
  const byType = document.querySelector<HTMLInputElement>(`input[type="${name}"]`);
  if (byType) return byType;
  throw new Error(`no input matching "${name}" found`);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/login']}>
      <DashboardAuthProvider config={{ storageKey: 'td-admin-refresh-token', allowedUserType: 'admin' }}>
        <Routes>
          <Route
            path="/admin/login"
            element={<PrivilegedLoginPage title="Admin sign in" subtitle="" defaultRedirect="/admin" />}
          />
          <Route path="/admin" element={<div>Admin home</div>} />
        </Routes>
      </DashboardAuthProvider>
    </MemoryRouter>,
  );
}

describe('PrivilegedLoginPage — MFA enrollment recovery (Feature 017 P0 fix)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drops the user into the enrollment step on a fresh enrollmentTicket instead of a dead-link error, and signs them in on success', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.endsWith('/session/refresh') && method === 'POST') {
          return Promise.reject(new Error('no session to refresh in this test'));
        }
        if (url.endsWith('/auth/login') && method === 'POST') {
          return jsonResponse({ mfaEnrollmentRequired: true, enrollmentTicket: 'ticket-1', expiresIn: 600 });
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
            email: 'staff@example.com',
            userType: 'admin',
            accountState: 'active',
            mfaRequired: true,
            mfaEnrolled: true,
            partnerOrganizationId: null,
          });
        }
        return Promise.reject(new Error(`unexpected fetch: ${url} ${method}`));
      }),
    );

    renderPage();

    await waitFor(() => screen.getByRole('heading', { name: 'Admin sign in' }));
    await user.type(byName('email'), 'staff@example.com');
    await user.type(byName('password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    // Must NOT show the old dead-link error message.
    expect(screen.queryByText(/Complete enrollment via your invitation link/)).not.toBeInTheDocument();

    // Must render the real enrollment step, reusing MfaEnrollmentStep.
    await waitFor(() => expect(screen.getByText('ABCD-1234')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Set up two-factor authentication' })).toBeInTheDocument();

    await user.type(byName('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and finish' }));

    await waitFor(() => expect(sessionStorage.getItem('td-admin-refresh-token')).toBe('refresh-1'));
    await waitFor(() => expect(screen.getByText('Admin home')).toBeInTheDocument());
  });
});

describe('PrivilegedLoginPage — retry button on the MFA code screen', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never silently reverts to a blank credentials form: an already-enrolled account gets a clear message, not a loop', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.endsWith('/session/refresh') && method === 'POST') {
          return Promise.reject(new Error('no session to refresh in this test'));
        }
        // Every /auth/login call returns the same "already enrolled, enter
        // your code" response — this account has a real factor, so there is
        // no enrollment ticket to issue (backend/src/routes/auth.ts).
        if (url.endsWith('/auth/login') && method === 'POST') {
          return jsonResponse({ mfaRequired: true, mfaChallengeToken: 'chal-1', expiresIn: 300 });
        }
        return Promise.reject(new Error(`unexpected fetch: ${url} ${method}`));
      }),
    );

    renderPage();

    await waitFor(() => screen.getByRole('heading', { name: 'Admin sign in' }));
    await user.type(byName('email'), 'staff@example.com');
    await user.type(byName('password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(byName('mfa-code')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Retry/ }));

    // Must NOT silently fall back to the bare credentials form (the bug:
    // clearing state before the network call resolved made this flash/stick
    // regardless of the result). The email/password fields must never
    // reappear here. `queryByLabelText` is unreliable for `required` inputs
    // in this test environment (see `byName`'s own comment above), so query
    // by type directly rather than risk a trivially-passing negative assertion.
    expect(document.querySelector('input[type="email"]')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).not.toBeInTheDocument();

    // Must explain plainly why there's no QR code, instead of looping quietly.
    await waitFor(() =>
      expect(screen.getByText(/already has an authenticator set up/)).toBeInTheDocument(),
    );
    expect(byName('mfa-code')).toBeInTheDocument();
  });

  it('retrying a genuinely never-enrolled account drops into the real QR enrollment step', async () => {
    const user = userEvent.setup();
    let loginCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.endsWith('/session/refresh') && method === 'POST') {
          return Promise.reject(new Error('no session to refresh in this test'));
        }
        if (url.endsWith('/auth/login') && method === 'POST') {
          loginCalls += 1;
          // First attempt: pretend a stale mfaChallengeToken flow already put
          // the user on the code screen. Retry re-authenticates and this time
          // the backend reports no verified factor (recovery path).
          if (loginCalls === 1) {
            return jsonResponse({ mfaRequired: true, mfaChallengeToken: 'chal-1', expiresIn: 300 });
          }
          return jsonResponse({ mfaEnrollmentRequired: true, enrollmentTicket: 'ticket-2', expiresIn: 600 });
        }
        if (url.endsWith('/mfa/enroll') && method === 'POST') {
          return jsonResponse({ qrCodeSvg: '<svg></svg>', manualEntryKey: 'WXYZ-9999', enrollmentId: 'enroll-2' });
        }
        return Promise.reject(new Error(`unexpected fetch: ${url} ${method}`));
      }),
    );

    renderPage();

    await waitFor(() => screen.getByRole('heading', { name: 'Admin sign in' }));
    await user.type(byName('email'), 'staff@example.com');
    await user.type(byName('password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(byName('mfa-code')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Retry/ }));

    await waitFor(() => expect(screen.getByText('WXYZ-9999')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Set up two-factor authentication' })).toBeInTheDocument();
  });
});
