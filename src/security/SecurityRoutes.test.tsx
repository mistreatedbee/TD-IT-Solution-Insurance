import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SecurityRoutes from './SecurityRoutes';

describe('SecurityRoutes index route (Feature 012 AC-1, AC-7)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC-7: with no session, the index route redirects to login exactly like every other security route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network call expected when signed-out')));

    render(
      <MemoryRouter initialEntries={['/']}>
        <SecurityRoutes />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Security partner sign in' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
  });

  it('AC-1: a signed-in security operator lands on a real Home screen, not an immediate redirect to the case queue', async () => {
    sessionStorage.setItem('td-security-refresh-token', 'refresh-1');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith('/session/refresh')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ accessToken: 'access-1', refreshToken: 'refresh-2', sessionId: 's1' }),
              { status: 200 },
            ),
          );
        }
        if (url.endsWith('/account/me')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'acct-1',
                email: 'ops@partner.example',
                userType: 'security_company_operator',
                accountState: 'active',
                mfaRequired: true,
                mfaEnrolled: true,
                partnerOrganizationId: 'org-1',
              }),
              { status: 200 },
            ),
          );
        }
        if (url.includes('/security/cases/count')) {
          return Promise.resolve(new Response(JSON.stringify({ data: { count: 6 } }), { status: 200 }));
        }
        return Promise.reject(new Error(`unexpected fetch: ${String(url)} ${init?.method ?? 'GET'}`));
      }),
    );

    render(
      <MemoryRouter initialEntries={['/']}>
        <SecurityRoutes />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument());
    expect(screen.getByText(/Signed in as ops@partner\.example · Security Partner Operator/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Go to case queue/ })).toBeInTheDocument();
  });
});
