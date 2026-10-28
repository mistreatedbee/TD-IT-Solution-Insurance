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
});
