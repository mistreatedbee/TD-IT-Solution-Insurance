import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvitationAcceptPage } from './InvitationAcceptPage';

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

/**
 * `screen.getByLabelText` relies on jsdom's `HTMLInputElement.labels`, which
 * returns an empty NodeList for `required` inputs in this environment (a
 * known jsdom/React-`useId` interaction, unrelated to this component) — so
 * label association is verified visually in the component itself and these
 * tests target fields by their `name` attribute instead.
 */
function byName(name: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!el) throw new Error(`no input[name="${name}"] found`);
  return el;
}

function renderPage(token = 'tok-1') {
  return render(
    <MemoryRouter initialEntries={[`/invitations/accept?token=${token}`]}>
      <Routes>
        <Route path="/invitations/accept" element={<InvitationAcceptPage />} />
        <Route path="/admin" element={<div>Admin home</div>} />
        <Route path="/admin/login" element={<div>Admin sign in</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const INVITATION = {
  email: 'invitee@example.com',
  userType: 'admin' as const,
  partnerOrganizationName: null,
  status: 'pending',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

describe('InvitationAcceptPage (Feature 017 D-1)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the terminal error card when the token is missing entirely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network call expected')));
    render(
      <MemoryRouter initialEntries={['/invitations/accept']}>
        <InvitationAcceptPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: "This invitation link isn't valid" })).toBeInTheDocument());
  });

  it('renders the terminal error card on an invalid/expired token, with no retry form', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/invitations/tok-1')) {
          return jsonResponse({ error: { code: 'INVITATION_INVALID' } }, 404);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: "This invitation link isn't valid" })).toBeInTheDocument());
    expect(screen.getByText(/This invitation link is not valid/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows invitation details on success, with role badge and Accept CTA', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/invitations/tok-1')) return jsonResponse(INVITATION);
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Accept your invitation' })).toBeInTheDocument());
    expect(screen.getByText(/invitee@example\.com/)).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept invitation' })).toBeInTheDocument();
  });

  it('rejects mismatched password confirmation client-side without calling the API', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.includes('/invitations/tok-1') && method === 'GET') return jsonResponse(INVITATION);
        if (url.includes('/accept')) return Promise.reject(new Error('accept should not be called on mismatch'));
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: 'Accept invitation' }));
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await user.type(byName('password'), 'password123');
    await user.type(byName('confirmPassword'), 'password124');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
  });

  it('walks the full happy path: accept -> mfa enroll -> verify -> stores tokens -> redirects by role', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.includes('/invitations/tok-1/accept') && method === 'POST') {
          return jsonResponse({ accountId: 'acct-1', mfaEnrollmentRequired: true, enrollmentTicket: 'ticket-1' });
        }
        if (url.includes('/invitations/tok-1') && method === 'GET') {
          return jsonResponse(INVITATION);
        }
        if (url.endsWith('/mfa/enroll') && method === 'POST') {
          return jsonResponse({ qrCodeSvg: '<svg></svg>', manualEntryKey: 'ABCD-1234', enrollmentId: 'enroll-1' });
        }
        if (url.endsWith('/mfa/enroll/verify') && method === 'POST') {
          const claims = { user_type: 'admin' };
          const payload = btoa(JSON.stringify(claims)).replace(/=+$/, '');
          const token = `header.${payload}.sig`;
          return jsonResponse({ accessToken: token, refreshToken: 'refresh-1', expiresIn: 900, sessionId: 'sess-1' });
        }
        return Promise.reject(new Error(`unexpected fetch: ${url} ${method}`));
      }),
    );
    renderPage();

    await waitFor(() => screen.getByRole('button', { name: 'Accept invitation' }));
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await user.type(byName('password'), 'password123');
    await user.type(byName('confirmPassword'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByText('ABCD-1234')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Step 3 of 3: Set up two-factor authentication' })).toBeInTheDocument();

    await user.type(byName('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and finish' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: "You're all set" })).toBeInTheDocument());
    expect(sessionStorage.getItem('td-admin-refresh-token')).toBe('refresh-1');

    await waitFor(() => expect(screen.getByText('Admin home')).toBeInTheDocument(), { timeout: 2000 });
  });

  it('shows an inline error and clears the code field on MFA_CHALLENGE_INVALID, staying on the mfa step', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.includes('/invitations/tok-1/accept') && method === 'POST') {
          return jsonResponse({ accountId: 'acct-1', mfaEnrollmentRequired: true, enrollmentTicket: 'ticket-1' });
        }
        if (url.includes('/invitations/tok-1') && method === 'GET') return jsonResponse(INVITATION);
        if (url.endsWith('/mfa/enroll') && method === 'POST') {
          return jsonResponse({ qrCodeSvg: '<svg></svg>', manualEntryKey: 'ABCD-1234', enrollmentId: 'enroll-1' });
        }
        if (url.endsWith('/mfa/enroll/verify') && method === 'POST') {
          return jsonResponse({ error: { code: 'MFA_CHALLENGE_INVALID' } }, 400);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url} ${method}`));
      }),
    );
    renderPage();

    await waitFor(() => screen.getByRole('button', { name: 'Accept invitation' }));
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await user.type(byName('password'), 'password123');
    await user.type(byName('confirmPassword'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => byName('code'));
    await user.type(byName('code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify and finish' }));

    await waitFor(() => expect(screen.getByText(/That code is incorrect/)).toBeInTheDocument());
    expect(byName('code')).toHaveValue('');
  });

  it('renders a terminal "start sign-in again" state (not a retryable form) on MFA_ENROLLMENT_NOT_FOUND', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.includes('/invitations/tok-1/accept') && method === 'POST') {
          return jsonResponse({ accountId: 'acct-1', mfaEnrollmentRequired: true, enrollmentTicket: 'ticket-1' });
        }
        if (url.includes('/invitations/tok-1') && method === 'GET') return jsonResponse(INVITATION);
        if (url.endsWith('/mfa/enroll') && method === 'POST') {
          return jsonResponse({ error: { code: 'MFA_ENROLLMENT_NOT_FOUND' } }, 404);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url} ${method}`));
      }),
    );
    renderPage();

    await waitFor(() => screen.getByRole('button', { name: 'Accept invitation' }));
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await user.type(byName('password'), 'password123');
    await user.type(byName('confirmPassword'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'This setup session expired' })).toBeInTheDocument());
    const returnButton = screen.getByRole('button', { name: 'Return to sign-in' });
    await user.click(returnButton);
    await waitFor(() => expect(screen.getByText('Admin sign in')).toBeInTheDocument());
  });
});
