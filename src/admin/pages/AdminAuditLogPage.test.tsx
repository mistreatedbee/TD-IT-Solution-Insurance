/** Business-owner gap report item 6 — read-only audit log viewer. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAuditLogPage } from './AdminAuditLogPage';

vi.mock('../api/admin-audit-log', async () => {
  const actual = await vi.importActual<typeof import('../api/admin-audit-log')>('../api/admin-audit-log');
  return { ...actual, listAdminAuditLog: vi.fn() };
});

import { listAdminAuditLog } from '../api/admin-audit-log';

function entry(overrides: Partial<Parameters<typeof Object.assign>[1]> = {}) {
  return {
    id: 'log-1',
    accountId: 'acct-1',
    eventType: 'login_success',
    attemptedIdentifier: null,
    ipAddress: '10.0.0.1',
    createdAt: '2026-10-20T12:00:00.000Z',
    ...overrides,
  };
}

describe('AdminAuditLogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and renders entries on mount', async () => {
    vi.mocked(listAdminAuditLog).mockResolvedValue({
      data: [entry()],
      pagination: { nextCursor: null, hasMore: false },
    });

    render(<AdminAuditLogPage />);

    await waitFor(() => expect(screen.getByText('login success')).toBeInTheDocument());
    expect(screen.getByText('acct-1')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
  });

  it('shows an empty state when no entries match the filters', async () => {
    vi.mocked(listAdminAuditLog).mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });

    render(<AdminAuditLogPage />);

    await waitFor(() =>
      expect(screen.getByText('No audit log entries match these filters')).toBeInTheDocument(),
    );
  });

  it('applies account/event-type/date filters and converts dates to an inclusive ISO range', async () => {
    const user = userEvent.setup();
    vi.mocked(listAdminAuditLog).mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });

    render(<AdminAuditLogPage />);
    await waitFor(() => expect(listAdminAuditLog).toHaveBeenCalledTimes(1));

    const accountInput = screen.getByLabelText('Account ID');
    await user.type(accountInput, 'acct-99');

    const fromInput = screen.getByLabelText('From');
    await user.clear(fromInput);
    await user.type(fromInput, '2026-10-01');

    const toInput = screen.getByLabelText('To');
    await user.clear(toInput);
    await user.type(toInput, '2026-10-02');

    await user.selectOptions(screen.getByLabelText('Event type'), 'privileged_data_access');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(listAdminAuditLog).toHaveBeenCalledTimes(2));
    expect(listAdminAuditLog).toHaveBeenLastCalledWith({
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-02T23:59:59.999Z',
      accountId: 'acct-99',
      eventType: 'privileged_data_access',
      limit: 25,
    });
  });

  it('surfaces a mapped error message when the request fails', async () => {
    vi.mocked(listAdminAuditLog).mockRejectedValue(new Error('boom'));

    render(<AdminAuditLogPage />);

    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeInTheDocument());
  });

  it('loads the next page via Load more and appends rows', async () => {
    const user = userEvent.setup();
    vi.mocked(listAdminAuditLog)
      .mockResolvedValueOnce({
        data: [entry({ id: 'log-1' })],
        pagination: { nextCursor: 'cursor-2', hasMore: true },
      })
      .mockResolvedValueOnce({
        data: [entry({ id: 'log-2', accountId: 'acct-2' })],
        pagination: { nextCursor: null, hasMore: false },
      });

    render(<AdminAuditLogPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(screen.getByText('acct-2')).toBeInTheDocument());
    expect(screen.getByText('acct-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });
});
