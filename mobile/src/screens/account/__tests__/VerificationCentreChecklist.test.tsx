import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { VerificationCentreScreen } from '../VerificationCentreScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../../api/hooks/useCustomerProfile', () => ({
  useCustomerProfileQuery: () => ({
    isLoading: false,
    isError: false,
    data: {
      firstName: 'Jane',
      middleName: null,
      lastName: 'Doe',
      dateOfBirth: null,
      phone: null,
      idNumberMasked: null,
      residentialAddress: null,
      emergencyContact: null,
      verificationStatus: 'in_progress',
      verificationSubmittedAt: null,
      verificationReviewedAt: null,
      rejectionReasonCustomerSafe: null,
      completionPercent: 40,
      completionChecklist: [],
      profilePictureUrl: null,
    },
  }),
  useSubmitVerificationMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock('../../../api/hooks/usePolicies', () => ({
  usePoliciesQuery: () => ({ isLoading: false, data: { data: [] } }),
}));
jest.mock('../../../api/hooks/useAssets', () => ({
  useAssetsQuery: () => ({ isLoading: false, data: { data: [] } }),
}));
jest.mock('../../../auth/useAccountQuery', () => ({
  useAccountQuery: () => ({ isLoading: false, data: { accountState: 'active', email: 'jane@example.com' } }),
}));

describe('VerificationCentreScreen approval checklist (Feature 023 Phase A)', () => {
  it('shows what is done and what is still needed for approval', async () => {
    await renderWithProviders(<VerificationCentreScreen />);
    expect(screen.getByText('What we need to approve you')).toBeTruthy();
    expect(screen.getByText('First and last name')).toBeTruthy();
    expect(screen.getByText('Last 4 digits of your ID number')).toBeTruthy();
    expect(screen.getAllByLabelText('Done')).toHaveLength(1);
    expect(screen.getAllByLabelText('Still needed')).toHaveLength(5);
  });
});
