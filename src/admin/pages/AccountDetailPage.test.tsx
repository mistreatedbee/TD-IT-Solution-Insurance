import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDetailPage } from './AdminDataPages';
import type { AdminAccountDetail } from '../api/admin-data';

vi.mock('../api/admin-data', () => ({
  getAdminAccount: vi.fn(),
  listAdminPolicies: vi.fn(),
  listAdminAssets: vi.fn(),
  updateAdminAccountState: vi.fn(),
}));
vi.mock('../api/step-up', () => ({
  requestStepUpChallenge: vi.fn(),
  verifyStepUp: vi.fn(),
}));
vi.mock('../api/admin-verification', () => ({
  getAdminCustomerProfile: vi.fn(),
}));

import { getAdminAccount, listAdminAssets, listAdminPolicies } from '../api/admin-data';
import { getAdminCustomerProfile } from '../api/admin-verification';

function customerDetail(overrides: Partial<AdminAccountDetail> = {}): AdminAccountDetail {
  return {
    id: 'acct-1',
    email: 'customer@example.com',
    userType: 'customer',
    accountState: 'active',
    partnerOrganizationId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    phone: null,
    mfaRequired: false,
    invitedBy: null,
    suspendedAt: null,
    deactivatedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as AdminAccountDetail;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AccountDetailPage accountId="acct-1" />
    </MemoryRouter>,
  );
}

describe('AccountDetailPage — verification status + policy/asset counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows verification status (linked) and real policy/asset counts for a customer', async () => {
    vi.mocked(getAdminAccount).mockResolvedValue(customerDetail());
    vi.mocked(getAdminCustomerProfile).mockResolvedValue({
      account: { id: 'acct-1', email: 'customer@example.com', accountState: 'active' },
      profile: { verificationStatus: 'verified' } as never,
    });
    vi.mocked(listAdminPolicies).mockResolvedValue({
      data: [{ id: 'p1' }, { id: 'p2' }] as never,
      pagination: { nextCursor: null, hasMore: false },
    });
    vi.mocked(listAdminAssets).mockResolvedValue({
      data: [{ id: 'a1', status: 'active' }] as never,
      pagination: { nextCursor: null, hasMore: false },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Verified')).toBeInTheDocument());
    const verificationLink = screen.getByRole('link', { name: 'Verified' });
    expect(verificationLink).toHaveAttribute('href', '/admin/verification/acct-1');

    await waitFor(() => expect(screen.getByText('2 policies →')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('1 asset →')).toBeInTheDocument());
  });

  it('does not show a Verification row or call the profile endpoint for staff accounts', async () => {
    vi.mocked(getAdminAccount).mockResolvedValue(customerDetail({ userType: 'support_agent', mfaRequired: true }));
    vi.mocked(listAdminPolicies).mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });
    vi.mocked(listAdminAssets).mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });

    renderPage();

    await waitFor(() => expect(screen.getByText('support agent')).toBeInTheDocument());
    expect(screen.queryByText('Verification')).not.toBeInTheDocument();
    expect(getAdminCustomerProfile).not.toHaveBeenCalled();
  });
});
