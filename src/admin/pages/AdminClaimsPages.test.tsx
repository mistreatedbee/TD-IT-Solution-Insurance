import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ClaimDetailPage, ClaimsQueuePage } from './AdminClaimsPages';
import type { AdminClaim } from '../api/admin-claims';

vi.mock('../api/admin-claims', () => ({
  listAdminClaims: vi.fn(),
  getAdminClaim: vi.fn(),
  patchAdminClaim: vi.fn(),
}));

import { getAdminClaim, listAdminClaims, patchAdminClaim } from '../api/admin-claims';

function claim(overrides: Partial<AdminClaim> = {}): AdminClaim {
  return {
    id: 'claim-1',
    accountId: 'acct-1',
    policyId: 'policy-1',
    assetId: 'asset-1',
    recoveryCaseId: null,
    supersedesClaimId: null,
    status: 'submitted',
    assetType: 'laptop',
    assetDisplayName: 'QA Test Laptop',
    policyPlanTier: 'plus',
    incidentDescription: 'Stolen from car.',
    incidentDate: '2026-10-01T00:00:00.000Z',
    evidenceDescription: null,
    claimedAmount: 10000,
    claimedAmountCurrency: 'ZAR',
    approvedAmount: null,
    rejectionReason: null,
    reviewNotes: [],
    submittedAt: '2026-10-02T00:00:00.000Z',
    decidedAt: null,
    updatedAt: '2026-10-02T00:00:00.000Z',
    fraudFlags: [],
    waitingPeriod: { clearedAt: '2026-09-01T00:00:00.000Z', wasMetAtFiling: true },
    coverageLimit: { configured: false, limitAmount: null, limitCurrency: null, wouldExceed: null },
    duplicateOpenClaimIdAtFiling: null,
    ...overrides,
  };
}

function renderQueue() {
  return render(
    <MemoryRouter>
      <ClaimsQueuePage />
    </MemoryRouter>,
  );
}

function renderDetail(claimId = 'claim-1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/claims/${claimId}`]}>
      <Routes>
        <Route path="/admin/claims/:claimId" element={<ClaimDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ClaimsQueuePage', () => {
  it('renders claims and highlights fraud flags with badges', async () => {
    vi.mocked(listAdminClaims).mockResolvedValue({
      data: [
        claim({ id: 'claim-1', assetDisplayName: 'Flagged laptop', fraudFlags: ['FLAG_AMOUNT_OUTLIER'] }),
        claim({ id: 'claim-2', assetDisplayName: 'Clean claim', fraudFlags: [] }),
      ],
      pagination: { nextCursor: null, hasMore: false },
    });

    renderQueue();

    await waitFor(() => expect(screen.getByText('Flagged laptop')).toBeInTheDocument());
    expect(screen.getByText('Amount outlier')).toBeInTheDocument();
    expect(screen.getByText('Clean claim')).toBeInTheDocument();
  });

  it('re-fetches with the selected status filter', async () => {
    const user = userEvent.setup();
    vi.mocked(listAdminClaims).mockResolvedValue({
      data: [claim()],
      pagination: { nextCursor: null, hasMore: false },
    });

    renderQueue();
    await waitFor(() => expect(listAdminClaims).toHaveBeenCalled());

    await user.selectOptions(screen.getByDisplayValue('All statuses'), 'under_review');
    await waitFor(() =>
      expect(listAdminClaims).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'under_review' })),
    );
  });

  it('shows an empty state when no claims match', async () => {
    vi.mocked(listAdminClaims).mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } });
    renderQueue();
    await waitFor(() => expect(screen.getByText('No claims match these filters.')).toBeInTheDocument());
  });
});

describe('ClaimDetailPage', () => {
  it('shows only the valid action for a submitted claim and starts review', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminClaim).mockResolvedValue(claim({ status: 'submitted' }));
    vi.mocked(patchAdminClaim).mockResolvedValue(claim({ status: 'under_review' }));

    renderDetail();
    await waitFor(() => expect(screen.getByText('Start review')).toBeInTheDocument());
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
    expect(screen.queryByText('Reject')).not.toBeInTheDocument();

    await user.click(screen.getByText('Start review'));
    await waitFor(() => expect(patchAdminClaim).toHaveBeenCalledWith('claim-1', { action: 'start_review' }));
  });

  it('requires a reason before confirming rejection', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminClaim).mockResolvedValue(claim({ status: 'under_review' }));

    renderDetail();
    await waitFor(() => expect(screen.getByText('Reject')).toBeInTheDocument());

    await user.click(screen.getByText('Reject'));
    const confirmButton = await screen.findByText('Confirm rejection');
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Rejection reason/), 'Insufficient evidence.');
    expect(confirmButton).not.toBeDisabled();

    vi.mocked(patchAdminClaim).mockResolvedValue(claim({ status: 'rejected', rejectionReason: 'Insufficient evidence.' }));
    await user.click(confirmButton);
    await waitFor(() =>
      expect(patchAdminClaim).toHaveBeenCalledWith('claim-1', {
        action: 'rejected',
        rejectionReason: 'Insufficient evidence.',
      }),
    );
  });

  it('warns when the entered approval amount would exceed the configured coverage limit', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminClaim).mockResolvedValue(
      claim({
        status: 'under_review',
        claimedAmount: 50000,
        coverageLimit: { configured: true, limitAmount: 20000, limitCurrency: 'ZAR', wouldExceed: null },
      }),
    );

    renderDetail();
    await waitFor(() => expect(screen.getByText('Approve')).toBeInTheDocument());
    await user.click(screen.getByText('Approve'));

    const amountInput = await screen.findByLabelText('Approved amount');
    await user.clear(amountInput);
    await user.type(amountInput, '50000');

    await waitFor(() =>
      expect(
        screen.getByText('This amount exceeds the configured coverage limit and will be rejected by the server.'),
      ).toBeInTheDocument(),
    );
  });

  it('shows no actions available for a terminal claim', async () => {
    vi.mocked(getAdminClaim).mockResolvedValue(claim({ status: 'closed' }));
    renderDetail();
    await waitFor(() =>
      expect(screen.getByText('No further admin actions are available for this claim.')).toBeInTheDocument(),
    );
  });
});
