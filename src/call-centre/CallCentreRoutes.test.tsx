import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CallCentreRoutes from './CallCentreRoutes';

describe('CallCentreRoutes index route (Feature 012 AC-1, AC-7)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC-7: with no session, the index route redirects to login exactly like every other call-centre route', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network call expected when signed-out')));

    render(
      <MemoryRouter initialEntries={['/']}>
        <CallCentreRoutes />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Call centre sign in' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
  });

  it('AC-1: a signed-in agent lands on a real Home screen, not an immediate redirect to customer lookup', async () => {
    sessionStorage.setItem('td-call-centre-refresh-token', 'refresh-1');
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
                email: 'agent@example.com',
                userType: 'support_agent',
                accountState: 'active',
                mfaRequired: true,
                mfaEnrolled: true,
                partnerOrganizationId: null,
              }),
              { status: 200 },
            ),
          );
        }
        if (url.includes('/support-cases/count')) {
          return Promise.resolve(new Response(JSON.stringify({ data: { count: 2 } }), { status: 200 }));
        }
        return Promise.reject(new Error(`unexpected fetch: ${String(url)} ${init?.method ?? 'GET'}`));
      }),
    );

    render(
      <MemoryRouter initialEntries={['/']}>
        <CallCentreRoutes />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument());
    expect(screen.getByText(/Signed in as agent@example\.com · Call Centre Agent/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Look up a customer/ })).toBeInTheDocument();
  });
});
