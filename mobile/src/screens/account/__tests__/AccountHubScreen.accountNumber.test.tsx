import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { AccountHubScreen } from '../AccountHubScreen';

jest.mock('../../../config/features', () => ({
  FEATURE_CLAIMS_ENABLED: false,
  FEATURE_LOCATION_TRACKING_ENABLED: false,
  FEATURE_KYC_ENABLED: false,
  FEATURE_ALERTS_ENABLED: false,
  FEATURE_THEFT_REPORTING_ENABLED: false,
  FEATURE_HARDWARE_TRACKING_ENABLED: false,
  FEATURE_SECURITY_OPERATOR_ENABLED: false,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../../auth/useAccountQuery', () => ({
  useAccountQuery: jest.fn(),
}));

jest.mock('../../../api/hooks/useCustomerProfile', () => ({
  useProfileSummaryQuery: jest.fn(() => ({ data: undefined })),
}));

jest.mock('../useProfilePictureUpload', () => ({
  useProfilePictureUpload: jest.fn(() => ({ showPicker: jest.fn(), isUploading: false })),
}));

jest.mock('../../../tracking/useProtectionDashboard', () => ({
  useProtectionDashboard: jest.fn(() => ({ data: undefined })),
}));

jest.mock('../../../api/hooks/usePlanEntitlements', () => ({
  usePlanEntitlements: jest.fn(() => ({
    policy: null,
    plans: [],
    assetCount: 0,
    planName: '',
    priceLabel: '',
    usageLabel: '',
    changePlanHref: null,
  })),
}));

jest.mock('../../../auth/session-store', () => ({
  useSessionStore: jest.fn((selector: (state: { setSignedOut: () => void }) => unknown) =>
    selector({ setSignedOut: jest.fn() }),
  ),
}));

jest.mock('../../../api/auth', () => ({
  logout: jest.fn(() => Promise.resolve()),
  logoutAll: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../api/notifications', () => ({
  sendTestPushNotification: jest.fn(() => Promise.resolve({ message: 'sent' })),
}));

jest.mock('../../../notifications/push', () => ({
  revokePushTokenFromBackend: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../auth/secure-storage', () => ({
  clearRefreshToken: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../query/queryClient', () => ({
  queryClient: { clear: jest.fn() },
}));

const { useAccountQuery } = jest.requireMock('../../../auth/useAccountQuery') as {
  useAccountQuery: jest.Mock;
};

describe('AccountHubScreen — account number (session.ts accountNumber field)', () => {
  it('shows the account number when backfilled', async () => {
    useAccountQuery.mockReturnValue({
      data: {
        id: 'acc-1',
        email: 'customer@example.com',
        accountState: 'active',
        mfaEnrolled: false,
        accountNumber: 'TD-7F3K9Q',
      },
      isLoading: false,
    });

    await renderWithProviders(<AccountHubScreen />);

    expect(screen.getByText('Account Number: TD-7F3K9Q')).toBeTruthy();
  });

  it('hides the account number field when it is null (not yet backfilled)', async () => {
    useAccountQuery.mockReturnValue({
      data: {
        id: 'acc-2',
        email: 'nobackfill@example.com',
        accountState: 'active',
        mfaEnrolled: false,
        accountNumber: null,
      },
      isLoading: false,
    });

    await renderWithProviders(<AccountHubScreen />);

    expect(screen.queryByText(/Account Number:/)).toBeNull();
  });

  it('hides the account number field while the account is still loading', async () => {
    useAccountQuery.mockReturnValue({ data: undefined, isLoading: true });

    await renderWithProviders(<AccountHubScreen />);

    expect(screen.queryByText(/Account Number:/)).toBeNull();
  });
});
