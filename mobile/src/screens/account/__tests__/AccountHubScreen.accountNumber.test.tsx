import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
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

describe('AccountHubScreen — no dev rows, claims hidden when disabled', () => {
  it('does not render the test-notification row or a claims row', async () => {
    useAccountQuery.mockReturnValue({ data: undefined, isLoading: true });

    await renderWithProviders(<AccountHubScreen />);

    expect(screen.queryByText('Send test notification')).toBeNull();
    expect(screen.queryByText('Claims')).toBeNull();
    expect(screen.queryByText('Claims filing coming soon')).toBeNull();
    expect(screen.getByText('Settings')).toBeTruthy();
    // the setting-type options live behind the Settings row, not on the Account page itself
    expect(screen.queryByText('Notification preferences')).toBeNull();
    expect(screen.queryByText('Log out of all devices')).toBeNull();
  });
});

describe('AccountHubScreen — rows keep their behaviour after the restyle', () => {
  beforeEach(() => {
    useAccountQuery.mockReturnValue({
      data: { id: 'acc-9', email: 'a@example.com', accountState: 'active', mfaEnrolled: true, accountNumber: null },
      isLoading: false,
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows section titles, the account state word and the two-factor line', async () => {
    await renderWithProviders(<AccountHubScreen />);
    expect(screen.getByText('Your protection')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
    expect(screen.getByText('Two-factor authentication enabled')).toBeTruthy();
  });

  it('opens the support email', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderWithProviders(<AccountHubScreen />);
    fireEvent.press(screen.getByText('Contact support'));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^mailto:/));
  });
});
