import React from 'react';
import { act, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { FileClaimScreen } from '../FileClaimScreen';
import { ApiError } from '../../../api/errors';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn() }),
}));

jest.mock('../../../api/hooks/useAssets', () => ({
  useAssetsQuery: () => ({
    data: {
      data: [{ id: 'asset-1', displayName: 'My Laptop', assetType: 'laptop' }],
    },
    isLoading: false,
  }),
}));

jest.mock('../../../api/hooks/usePolicies', () => ({
  usePoliciesQuery: () => ({
    data: {
      data: [{ id: 'policy-1', planTier: 'plus', status: 'active' }],
    },
    isLoading: false,
  }),
}));

const mockCreateClaimMutateAsync = jest.fn();
jest.mock('../../../api/hooks/useClaims', () => ({
  useCreateClaimMutation: () => ({ mutateAsync: mockCreateClaimMutateAsync, isPending: false }),
}));

async function fillValidForm() {
  await act(async () => {
    fireEvent.press(screen.getByText('plus (active)'));
  });
  await act(async () => {
    fireEvent.press(screen.getByText('My Laptop'));
  });
  await act(async () => {
    fireEvent.changeText(
      screen.getByLabelText('What happened?'),
      'My laptop was stolen from my car overnight in the driveway.',
    );
  });
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Incident date'), '2026-10-01');
  });
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Claimed amount'), '1000');
  });
}

describe('FileClaimScreen', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
    mockCreateClaimMutateAsync.mockReset();
  });

  it('says photo upload is not available rather than implying it is possible', async () => {
    await renderWithProviders(<FileClaimScreen />);
    expect(screen.getAllByText(/photo upload is not available yet/i).length).toBeGreaterThan(0);
  });

  it('submits the full claim payload and navigates to the created claim', async () => {
    mockCreateClaimMutateAsync.mockResolvedValue({ id: 'claim-1', status: 'submitted' });
    await renderWithProviders(<FileClaimScreen />);

    await fillValidForm();
    await act(async () => {
      fireEvent.press(screen.getByText('Submit claim'));
    });

    await waitFor(() =>
      expect(mockCreateClaimMutateAsync).toHaveBeenCalledWith({
        policyId: 'policy-1',
        assetId: 'asset-1',
        incidentDescription: 'My laptop was stolen from my car overnight in the driveway.',
        incidentDate: '2026-10-01',
        evidenceDescription: undefined,
        claimedAmount: 1000,
      }),
    );

    await waitFor(() => expect(screen.getByText('View claim')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('View claim'));
    });
    expect(mockReplace).toHaveBeenCalledWith('/claims/claim-1');
  });

  it('surfaces DUPLICATE_OPEN_CLAIM with a link to the existing claim', async () => {
    mockCreateClaimMutateAsync.mockRejectedValue(
      new ApiError(409, {
        error: {
          code: 'DUPLICATE_OPEN_CLAIM',
          message: 'Duplicate open claim.',
          requestId: 'req-1',
          claimId: 'claim-existing',
        },
      }),
    );
    await renderWithProviders(<FileClaimScreen />);

    await fillValidForm();
    await act(async () => {
      fireEvent.press(screen.getByText('Submit claim'));
    });

    await waitFor(() => expect(screen.getByText('View existing claim')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByText('View existing claim'));
    });
    expect(mockPush).toHaveBeenCalledWith('/claims/claim-existing');
  });

  it('shows the waiting-period eligibility date on WAITING_PERIOD_NOT_MET', async () => {
    mockCreateClaimMutateAsync.mockRejectedValue(
      new ApiError(422, {
        error: {
          code: 'WAITING_PERIOD_NOT_MET',
          message: 'Waiting period not met.',
          requestId: 'req-2',
          waitingPeriodClearsAt: '2026-11-01T00:00:00.000Z',
        },
      }),
    );
    await renderWithProviders(<FileClaimScreen />);

    await fillValidForm();
    await act(async () => {
      fireEvent.press(screen.getByText('Submit claim'));
    });

    await waitFor(() => expect(screen.getByText(/Eligible from/)).toBeTruthy());
  });
});
