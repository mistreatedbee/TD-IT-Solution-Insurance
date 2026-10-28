import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureDashboardClient } from '../../dashboard/api/client';
import { RecoveryCaseDetailPage } from './RecoveryCaseDetailPage';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null } as unknown as Headers,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('RecoveryCaseDetailPage', () => {
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

  it('loads and renders a case by reference number, without location or police-report fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: {
            id: 'case-1',
            accountId: 'acct-1',
            assetId: 'asset-1',
            status: 'investigating',
            referenceNumber: 'RC-20261023-X7K2',
            reportedAt: '2026-10-20T10:00:00.000Z',
            closedAt: null,
            notes: 'Reported stolen from vehicle',
            lastLocationAt: '2026-10-22T09:00:00.000Z',
            callCentreNotes: [],
          },
        }),
      ),
    );

    render(
      <MemoryRouter initialEntries={['/']}>
        <RecoveryCaseDetailPage idOrReference="RC-20261023-X7K2" />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Case RC-20261023-X7K2' })).toBeInTheDocument(),
    );
    expect(screen.getByText('acct-1')).toBeInTheDocument();
    expect(screen.getByText('No call-centre notes yet.')).toBeInTheDocument();
    expect(screen.queryByText(/saps/i)).not.toBeInTheDocument();
  });

  it('shows a not-found message for an unknown case', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Not found' } })),
    );

    render(
      <MemoryRouter initialEntries={['/']}>
        <RecoveryCaseDetailPage idOrReference="RC-20261023-ZZZZ" />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText('No recovery case found for that ID or reference number.')).toBeInTheDocument(),
    );
  });

  it('renders a bare search form when no id or reference is supplied', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <RecoveryCaseDetailPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('textbox', { name: 'Case ID or reference number' })).toBeInTheDocument();
    expect(screen.queryByText(/Case RC-/)).not.toBeInTheDocument();
  });
});
