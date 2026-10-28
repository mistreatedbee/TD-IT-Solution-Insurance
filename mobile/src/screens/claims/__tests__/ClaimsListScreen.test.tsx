import React from 'react';
import { screen, fireEvent } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { ClaimsListScreen } from '../ClaimsListScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
}));

const mockUseClaimsQuery = jest.fn();
jest.mock('../../../api/hooks/useClaims', () => ({
  useClaimsQuery: () => mockUseClaimsQuery(),
}));

describe('ClaimsListScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockUseClaimsQuery.mockReset();
  });

  it('shows the empty state with a File a claim button when there are no claims', async () => {
    mockUseClaimsQuery.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false, error: null });
    await renderWithProviders(<ClaimsListScreen />);
    expect(screen.getByText(/No claims yet/)).toBeTruthy();
    fireEvent.press(screen.getByText('File a claim'));
    expect(mockPush).toHaveBeenCalledWith('/claims/new');
  });

  it('renders claims with status label and navigates to detail on press', async () => {
    mockUseClaimsQuery.mockReturnValue({
      data: {
        data: [
          {
            id: 'claim-1',
            assetDisplayName: 'My Laptop',
            status: 'awaiting_payout',
            submittedAt: '2026-10-01T00:00:00.000Z',
            claimedAmount: 1000,
            claimedAmountCurrency: 'ZAR',
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    await renderWithProviders(<ClaimsListScreen />);
    expect(screen.getByText('My Laptop')).toBeTruthy();
    expect(screen.getByText('Approved — payout pending')).toBeTruthy();
    fireEvent.press(screen.getByText('My Laptop'));
    expect(mockPush).toHaveBeenCalledWith('/claims/claim-1');
  });

  it('renders an error message when the query fails', async () => {
    mockUseClaimsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
    });
    await renderWithProviders(<ClaimsListScreen />);
    expect(screen.getByText('boom')).toBeTruthy();
  });
});
