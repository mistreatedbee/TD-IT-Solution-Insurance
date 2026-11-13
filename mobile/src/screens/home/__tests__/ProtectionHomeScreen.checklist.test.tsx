import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../../test/renderWithProviders';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('../../../api/auth', () => ({ resendVerification: jest.fn() }));
jest.mock('../../../auth/useAccountQuery', () => ({ useAccountQuery: () => ({ data: { email: 'a@b.c' } }) }));
jest.mock('../../../api/hooks/usePlanEntitlements', () => ({
  usePlanEntitlements: () => ({ hasIncidentManagement: true, changePlanHref: null }),
}));
jest.mock('../../../api/hooks/useCustomerProfile', () => ({
  useProfileSummaryQuery: () => ({ data: undefined }),
}));
jest.mock('../../../tracking/useProtectionDashboard', () => ({
  useProtectionDashboard: () => ({
    data: {
      greetingName: 'Sam',
      subtitle: '',
      alertCount: 0,
      criticalAlertCount: 0,
      alerts: [],
      assetCount: 0,
      protectedAssetCount: 0,
      trackingOnlineCount: 0,
      trackingActiveCount: 0,
      profilePercent: 0,
      profileChecklist: [],
      assetPreviews: [],
      openRecoveryCount: 0,
      isPendingVerification: false,
    },
    isLoading: false,
    isError: false,
    error: null,
    isRefetching: false,
    refetchAll: jest.fn(),
  }),
}));
jest.mock('../HomeMapPreview', () => ({ HomeMapPreview: () => null }));

const mockQuery = jest.fn();
jest.mock('../../../api/hooks/useProtectionChecklist', () => ({
  useProtectionChecklistQuery: () => mockQuery(),
}));

let mockFlag = true;
jest.mock('../../../config/features', () => ({
  FEATURE_ALERTS_ENABLED: false,
  FEATURE_KYC_ENABLED: false,
  FEATURE_LOCATION_TRACKING_ENABLED: false,
  FEATURE_THEFT_REPORTING_ENABLED: false,
  get FEATURE_PROTECTION_CHECKLIST_ENABLED() {
    return mockFlag;
  },
}));

// eslint-disable-next-line import/first
import { ProtectionHomeScreen } from '../ProtectionHomeScreen';

describe('ProtectionHomeScreen checklist placement', () => {
  beforeEach(() => {
    mockFlag = true;
    mockQuery.mockReset();
    mockPush.mockClear();
  });

  it('flag off: card absent, home still renders', async () => {
    mockFlag = false;
    mockQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    await renderWithProviders(<ProtectionHomeScreen />);
    expect(screen.queryByText('Protection checklist')).toBeNull();
    expect(screen.getByText('Contact support')).toBeTruthy();
  });

  it('loading: home content renders around the skeleton', async () => {
    mockQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    await renderWithProviders(<ProtectionHomeScreen />);
    expect(screen.getByLabelText('Loading your protection checklist')).toBeTruthy();
    expect(screen.getByText('Contact support')).toBeTruthy();
  });

  it('error: neutral copy and retry', async () => {
    const refetch = jest.fn();
    mockQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    await renderWithProviders(<ProtectionHomeScreen />);
    expect(screen.getByText('Your protection checklist is unavailable right now.')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });

  it('data: card renders and CTA routes', async () => {
    mockQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        doneCount: 0,
        totalCount: 1,
        disclosure: 'This does not affect your premium, your cover or your claims.',
        items: [
          {
            id: 'asset_registered',
            title: 'Register a device',
            benefit: 'Keeps your device details on file.',
            done: false,
            unavailable: false,
            points: 0,
            maxPoints: 20,
            nextStep: { label: 'Add a device', action: 'add_asset' },
          },
        ],
      },
    });
    await renderWithProviders(<ProtectionHomeScreen />);
    expect(screen.getByText('Protection checklist')).toBeTruthy();
    fireEvent.press(screen.getByText('Add a device'));
    expect(mockPush).toHaveBeenCalledWith('/assets/register');
  });
});
