/**
 * Coverage for the situation-summary banner (backend commit e51b6f8) — meant to be the
 * first thing an agent sees for a panicked theft-report caller.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDashboardClient } from '../../dashboard/api/client';
import { CustomerLookupPage } from './CustomerLookupPage';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null } as unknown as Headers,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function baseCustomer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    accountId: 'acct-1',
    email: 'customer@example.com',
    accountState: 'active',
    policyCount: 1,
    assetCount: 1,
    assets: [],
    openRecoveryCaseCount: 0,
    recoveryCases: [],
    openSupportCaseCount: 0,
    supportCases: [],
    situationSummary: {
      hasOpenRecoveryCase: false,
      hasActiveClaim: false,
      recentRecoveryCaseCount: 0,
    },
    ...overrides,
  };
}

async function searchByEmail() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <CustomerLookupPage />
    </MemoryRouter>,
  );

  const input = screen.getByRole('textbox', { name: 'Customer email' });
  input.focus();
  await (await import('@testing-library/user-event')).default.type(input, 'customer@example.com');
  await (await import('@testing-library/user-event')).default.click(screen.getByRole('button', { name: 'Search' }));
}

describe('CustomerLookupPage — situation summary banner', () => {
  beforeEach(() => {
    configureDashboardClient({
      getAccessToken: () => 'access-token',
      getRefreshToken: () => 'refresh-token',
      setRefreshToken: vi.fn(),
      clearRefreshToken: vi.fn(),
      setAccessToken: vi.fn(),
      onSessionTerminated: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows no banner when there is nothing to flag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { data: baseCustomer() })));

    await searchByEmail();

    await waitFor(() => expect(screen.getByText('customer@example.com')).toBeInTheDocument());
    expect(screen.queryByTestId('situation-summary-banner')).not.toBeInTheDocument();
  });

  it('flags an open recovery case', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: baseCustomer({
            situationSummary: { hasOpenRecoveryCase: true, hasActiveClaim: false, recentRecoveryCaseCount: 1 },
          }),
        }),
      ),
    );

    await searchByEmail();

    await waitFor(() => expect(screen.getByText('Customer has an open recovery case.')).toBeInTheDocument());
    expect(screen.queryByText('Customer has an active claim.')).not.toBeInTheDocument();
    expect(screen.queryByText(/recovery cases in the last 6 months/)).not.toBeInTheDocument();
  });

  it('flags an active claim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: baseCustomer({
            situationSummary: { hasOpenRecoveryCase: false, hasActiveClaim: true, recentRecoveryCaseCount: 0 },
          }),
        }),
      ),
    );

    await searchByEmail();

    await waitFor(() => expect(screen.getByText('Customer has an active claim.')).toBeInTheDocument());
  });

  it('shows a softer recurrence note when recentRecoveryCaseCount is greater than one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: baseCustomer({
            situationSummary: { hasOpenRecoveryCase: false, hasActiveClaim: false, recentRecoveryCaseCount: 3 },
          }),
        }),
      ),
    );

    await searchByEmail();

    await waitFor(() => expect(screen.getByText('3 recovery cases in the last 6 months.')).toBeInTheDocument());
  });
});
