import React from 'react';
import { act, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { ClaimDetailScreen } from '../ClaimDetailScreen';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'claim-1' }),
}));

const baseClaim = {
  id: 'claim-1',
  policyId: 'policy-1',
  assetId: 'asset-1',
  recoveryCaseId: null,
  supersedesClaimId: null,
  status: 'submitted',
  assetType: 'laptop',
  assetDisplayName: 'My Laptop',
  policyPlanTier: 'plus',
  incidentDescription: 'Stolen from my car overnight.',
  incidentDate: '2026-10-01T00:00:00.000Z',
  evidenceDescription: null,
  claimedAmount: 1000,
  claimedAmountCurrency: 'ZAR',
  approvedAmount: null,
  rejectionReason: null,
  closeReason: null,
  quantumReason: null,
  decisionNotices: [],
  reviewNotes: [],
  submittedAt: '2026-10-01T00:00:00.000Z',
  decidedAt: null,
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const mockUseClaimQuery = jest.fn();
const mockRespondMutateAsync = jest.fn();
const mockWithdrawMutateAsync = jest.fn();

jest.mock('../../../api/hooks/useClaims', () => ({
  useClaimQuery: () => mockUseClaimQuery(),
  useRespondToClaimMutation: () => ({ mutateAsync: mockRespondMutateAsync, isPending: false }),
  useWithdrawClaimMutation: () => ({ mutateAsync: mockWithdrawMutateAsync, isPending: false }),
}));

describe('ClaimDetailScreen', () => {
  beforeEach(() => {
    mockUseClaimQuery.mockReset();
    mockRespondMutateAsync.mockReset();
    mockWithdrawMutateAsync.mockReset();
  });

  it('shows status, never literally "approved" at rest, and no fraudFlags field', async () => {
    mockUseClaimQuery.mockReturnValue({
      data: { ...baseClaim, status: 'awaiting_payout' },
      isLoading: false,
      isError: false,
      error: null,
    });
    await renderWithProviders(<ClaimDetailScreen />);
    expect(screen.getByText('Approved — payout pending')).toBeTruthy();
    expect(screen.queryByText(/fraudFlags/i)).toBeNull();
  });

  it('shows a Respond action only when status is more_info_requested', async () => {
    mockUseClaimQuery.mockReturnValue({
      data: { ...baseClaim, status: 'more_info_requested' },
      isLoading: false,
      isError: false,
      error: null,
    });
    await renderWithProviders(<ClaimDetailScreen />);
    expect(screen.getByText('Respond to reviewer')).toBeTruthy();

    mockRespondMutateAsync.mockResolvedValue({ ...baseClaim, status: 'under_review' });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Your response'), 'Here is more detail.');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Send response'));
    });

    await waitFor(() =>
      expect(mockRespondMutateAsync).toHaveBeenCalledWith({ text: 'Here is more detail.' }),
    );
  });

  it('hides the Respond action for other statuses', async () => {
    mockUseClaimQuery.mockReturnValue({
      data: { ...baseClaim, status: 'under_review' },
      isLoading: false,
      isError: false,
      error: null,
    });
    await renderWithProviders(<ClaimDetailScreen />);
    expect(screen.queryByText('Respond to reviewer')).toBeNull();
  });

  it('offers Withdraw for a non-terminal claim and confirms before calling the API', async () => {
    mockUseClaimQuery.mockReturnValue({
      data: { ...baseClaim, status: 'under_review' },
      isLoading: false,
      isError: false,
      error: null,
    });
    mockWithdrawMutateAsync.mockResolvedValue({ ...baseClaim, status: 'closed' });
    await renderWithProviders(<ClaimDetailScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Withdraw claim'));
    });
    expect(screen.getByText('Confirm withdraw')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Confirm withdraw'));
    });

    await waitFor(() => expect(mockWithdrawMutateAsync).toHaveBeenCalled());
  });

  it('hides Withdraw for a terminal claim', async () => {
    mockUseClaimQuery.mockReturnValue({
      data: { ...baseClaim, status: 'closed' },
      isLoading: false,
      isError: false,
      error: null,
    });
    await renderWithProviders(<ClaimDetailScreen />);
    expect(screen.queryByText('Withdraw claim')).toBeNull();
  });

  it('renders the full decision notice text, most recent first, for a rejected claim', async () => {
    const olderNotice = {
      kind: 'more_info_request' as const,
      templateVersion: 1,
      groundCode: null,
      renderedText: 'We need more evidence to assess your claim.',
      issuedAt: '2026-09-01T00:00:00.000Z',
    };
    const newerNotice = {
      kind: 'rejection' as const,
      templateVersion: 2,
      groundCode: 'EXCLUDED_CAUSE',
      renderedText:
        'Claim reference: claim-1.\n\n' +
        'Ground: EXCLUDED_CAUSE.\nReason: not covered under the policy.\n\n' +
        'Your right to respond: you may make representations within 90 days. Contact: complaints@example.com.',
      issuedAt: '2026-10-02T00:00:00.000Z',
    };
    mockUseClaimQuery.mockReturnValue({
      data: {
        ...baseClaim,
        status: 'rejected',
        rejectionReason: 'Not covered under the policy.',
        decisionNotices: [olderNotice, newerNotice],
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    await renderWithProviders(<ClaimDetailScreen />);

    expect(screen.getByText('Important notices about this claim')).toBeTruthy();
    expect(
      screen.getByText(
        'Your right to respond: you may make representations within 90 days. Contact: complaints@example.com.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Ground: EXCLUDED_CAUSE.\nReason: not covered under the policy.')).toBeTruthy();
    expect(screen.getByText('We need more evidence to assess your claim.')).toBeTruthy();

    // Most-recent-first: the rejection notice (newer) appears before the more-info notice (older).
    const rejectionHeading = screen.getByText('Claim rejection notice');
    const infoHeading = screen.getByText('Information request');
    const tree = screen.toJSON();
    const serialized = JSON.stringify(tree);
    expect(serialized.indexOf('Claim rejection notice')).toBeLessThan(serialized.indexOf('Information request'));
    expect(rejectionHeading).toBeTruthy();
    expect(infoHeading).toBeTruthy();
  });

  it('shows quantumReason alongside claimed vs approved amount for a partial approval', async () => {
    mockUseClaimQuery.mockReturnValue({
      data: {
        ...baseClaim,
        status: 'approved',
        approvedAmount: 600,
        quantumReason: 'Depreciation applied per policy clause 4.2.',
        decisionNotices: [
          {
            kind: 'partial_approval_shortfall' as const,
            templateVersion: 1,
            groundCode: 'QUANTUM_DISPUTED',
            renderedText: 'We have approved a reduced amount for your claim.',
            issuedAt: '2026-10-05T00:00:00.000Z',
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    await renderWithProviders(<ClaimDetailScreen />);

    expect(screen.getByText('Why the approved amount differs from what you claimed')).toBeTruthy();
    expect(screen.getByText('Depreciation applied per policy clause 4.2.')).toBeTruthy();
    expect(screen.getAllByText('ZAR 1,000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ZAR 600').length).toBeGreaterThan(0);
  });

  it('shows closeReason for a closed claim', async () => {
    mockUseClaimQuery.mockReturnValue({
      data: {
        ...baseClaim,
        status: 'closed',
        closeReason: 'Closed at customer request after a duplicate filing.',
        decisionNotices: [
          {
            kind: 'administrative_close' as const,
            templateVersion: 1,
            groundCode: 'DUPLICATE_CLAIM',
            renderedText: 'This claim has been closed administratively.',
            issuedAt: '2026-10-06T00:00:00.000Z',
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    await renderWithProviders(<ClaimDetailScreen />);

    expect(screen.getByText('Reason this claim was closed')).toBeTruthy();
    expect(screen.getByText('Closed at customer request after a duplicate filing.')).toBeTruthy();
    expect(screen.getByText('This claim has been closed administratively.')).toBeTruthy();
  });
});
