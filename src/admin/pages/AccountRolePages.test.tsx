import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CustomersListPage, StaffListPage } from './AdminDataPages';
import type { AdminAccountSummary } from '../api/admin-data';

vi.mock('../api/admin-data', () => ({
  listAdminAccounts: vi.fn(),
}));

import { listAdminAccounts } from '../api/admin-data';

function account(overrides: Partial<AdminAccountSummary> = {}): AdminAccountSummary {
  return {
    id: '1',
    email: 'person@example.com',
    userType: 'customer',
    accountState: 'active',
    partnerOrganizationId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as AdminAccountSummary;
}

function renderWith(Page: typeof CustomersListPage) {
  return render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  );
}

describe('CustomersListPage', () => {
  it('lists with role=customer and has no invite-staff button', async () => {
    vi.mocked(listAdminAccounts).mockResolvedValue({
      data: [account({ email: 'jane@example.com' })],
      pagination: { nextCursor: null, hasMore: false },
    });

    renderWith(CustomersListPage);

    await waitFor(() => expect(screen.getByText('jane@example.com')).toBeInTheDocument());
    expect(listAdminAccounts).toHaveBeenCalledWith(expect.objectContaining({ role: 'customer' }));
    expect(screen.queryByRole('link', { name: /Invite staff/ })).not.toBeInTheDocument();
    // No redundant Type column once the list is already customer-only.
    expect(screen.queryByText('Type')).not.toBeInTheDocument();
  });

  it('searches by exact email and shows a no-match empty state', async () => {
    const user = userEvent.setup();
    vi.mocked(listAdminAccounts).mockResolvedValue({
      data: [],
      pagination: { nextCursor: null, hasMore: false },
    });

    renderWith(CustomersListPage);
    await user.type(screen.getByPlaceholderText('customer@example.com'), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(listAdminAccounts).toHaveBeenLastCalledWith(
        expect.objectContaining({ role: 'customer', email: 'nobody@example.com' }),
      ),
    );
    await waitFor(() => expect(screen.getByText('No customers found')).toBeInTheDocument());
  });
});

describe('StaffListPage', () => {
  it('lists with role=staff, shows a role badge, and has a prominent invite button', async () => {
    vi.mocked(listAdminAccounts).mockResolvedValue({
      data: [account({ email: 'ops@example.com', userType: 'support_agent' })],
      pagination: { nextCursor: null, hasMore: false },
    });

    renderWith(StaffListPage);

    await waitFor(() => expect(screen.getByText('ops@example.com')).toBeInTheDocument());
    expect(listAdminAccounts).toHaveBeenCalledWith(expect.objectContaining({ role: 'staff' }));
    expect(screen.getByText('Support agent')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Invite staff' })).toHaveAttribute('href', '/admin/accounts/invite');
  });

  it('shows an inviting empty state when there are no staff yet', async () => {
    vi.mocked(listAdminAccounts).mockResolvedValue({
      data: [],
      pagination: { nextCursor: null, hasMore: false },
    });

    renderWith(StaffListPage);

    await waitFor(() => expect(screen.getByText('No staff accounts yet')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Invite your first staff member' })).toHaveAttribute(
      'href',
      '/admin/accounts/invite',
    );
  });
});
