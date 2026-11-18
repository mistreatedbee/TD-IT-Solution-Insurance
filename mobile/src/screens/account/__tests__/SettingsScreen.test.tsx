import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { SettingsScreen } from '../SettingsScreen';

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
  useProfilePictureUpload: jest.fn(() => ({
    showPicker: jest.fn(),
    isUploading: false,
  })),
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
  useSessionStore: jest.fn(
    (selector: (state: { setSignedOut: () => void }) => unknown) =>
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

const { useAccountQuery } = jest.requireMock(
  '../../../auth/useAccountQuery',
) as {
  useAccountQuery: jest.Mock;
};

describe('SettingsScreen', () => {
  beforeEach(() => {
    useAccountQuery.mockReturnValue({
      data: {
        id: 'acc-9',
        email: 'a@example.com',
        accountState: 'active',
        mfaEnrolled: true,
        accountNumber: null,
      },
      isLoading: false,
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('offers System, Light and Dark appearance choices', async () => {
    await renderWithProviders(<SettingsScreen />);
    expect(screen.getByText('Appearance')).toBeTruthy();
    for (const label of ['System', 'Light', 'Dark']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('lists every setting-type option', async () => {
    await renderWithProviders(<SettingsScreen />);
    for (const label of [
      'Notification preferences',
      'Two-factor authentication',
      'Privacy notice',
      'Terms of use',
      'Delete account & data',
      'Log out',
      'Log out of all devices',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('Enabled')).toBeTruthy();
  });

  it('asks twice before logging out of every device', async () => {
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    await renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByText('Log out of all devices'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0]![0]).toBe('Log out of all devices?');
    // pressing Continue opens the second, escalating confirmation, not the logout itself
    const buttons = alertSpy.mock.calls[0]![2]!;
    buttons.find((b) => b.text === 'Continue')!.onPress!();
    expect(alertSpy).toHaveBeenCalledTimes(2);
    expect(alertSpy.mock.calls[1]![0]).toBe('Are you sure?');
  });
});
