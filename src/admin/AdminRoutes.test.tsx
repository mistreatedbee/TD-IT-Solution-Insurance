import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminRoutes from './AdminRoutes';


describe('AdminRoutes index route (Feature 012 AC-1, AC-7)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC-7: with no session, the index route redirects to login exactly like every other admin route — Home does not bypass AuthGate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network call expected when signed-out')));

    render(
      <MemoryRouter initialEntries={['/']}>
        <AdminRoutes />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Admin sign in' })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
  });

  it('AC-1: a signed-in admin lands on a real Home screen at the index route, not an immediate redirect to Customers', async () => {
    sessionStorage.setItem('td-admin-refresh-token', 'refresh-1');
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
                email: 'admin@example.com',
                userType: 'admin',
                accountState: 'active',
                mfaRequired: true,
                mfaEnrolled: true,
                partnerOrganizationId: null,
              }),
              { status: 200 },
            ),
          );
        }
        if (url.includes('/admin/verification-requests/count')) {
          return Promise.resolve(new Response(JSON.stringify({ data: { count: 3 } }), { status: 200 }));
        }
        return Promise.reject(new Error(`unexpected fetch: ${String(url)} ${init?.method ?? 'GET'}`));
      }),
    );

    render(
      <MemoryRouter initialEntries={['/']}>
        <AdminRoutes />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument());
    expect(screen.getByText(/Signed in as admin@example\.com · Admin/)).toBeInTheDocument();
    // Not redirected straight to the Customers/accounts list.
    expect(screen.queryByRole('heading', { name: 'Customers' })).not.toBeInTheDocument();
  });
});
