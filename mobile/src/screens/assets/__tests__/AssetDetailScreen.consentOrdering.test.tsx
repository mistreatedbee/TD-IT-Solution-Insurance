/**
 * INC-002 §11.3 SR-INC002-M4 / INC-001 §4.2(d): consent must be recorded
 * BEFORE the OS location-permission dialog is requested — an OS grant must
 * never be treated as the consent event itself.
 */
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { AssetDetailScreen } from '../AssetDetailScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'asset-1' }),
}));

jest.mock('../../../api/hooks/useAssets', () => ({
  useAssetQuery: () => ({
    data: {
      id: 'asset-1',
      displayName: 'My Phone',
      assetType: 'smartphone',
      status: 'active',
      registeredAt: '2026-01-01T00:00:00.000Z',
      details: {},
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

jest.mock('../../../api/hooks/useAssetLocation', () => ({
  useAssetLocationQuery: () => ({ data: null, isLoading: false, refetch: jest.fn() }),
  useAssetLocationSummaryQuery: () => ({ data: { data: [] }, refetch: jest.fn() }),
  useReportAssetLocationMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useWithdrawAssetLocationMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useGrantAssetLocationConsentMutation: () => ({
    mutateAsync: jest.fn(async () => {
      callOrder.push('server-consent-grant-recorded');
      return { assetId: 'asset-1', eventType: 'granted', createdAt: '2026-01-01T00:00:00.000Z' };
    }),
    isPending: false,
  }),
}));

jest.mock('../../../api/hooks/useAssetTrackingProfile', () => ({
  useAssetTrackingProfileQuery: () => ({ data: undefined }),
}));

jest.mock('../../../api/hooks/usePlanEntitlements', () => ({
  usePlanEntitlements: () => ({ hasIncidentManagement: true, changePlanHref: null, isLoading: false }),
}));

const callOrder: string[] = [];

jest.mock('../../../location', () => {
  const actual = jest.requireActual('../../../location');
  return {
    ...actual,
    getLinkedSmartphoneAssetId: jest.fn(async () => null),
    getLocationTrackingConsent: jest.fn(async () => null),
    setLinkedSmartphoneAssetId: jest.fn(async () => undefined),
    setLocationTrackingConsent: jest.fn(async () => {
      callOrder.push('consent-recorded');
    }),
    clearLocationTrackingConsent: jest.fn(async () => undefined),
    clearLinkedSmartphoneAssetId: jest.fn(async () => undefined),
    requestForegroundLocation: jest.fn(async () => {
      callOrder.push('os-permission-requested');
      return {
        latitude: 1,
        longitude: 2,
        accuracyMeters: 5,
        capturedAt: '2026-01-01T00:00:00.000Z',
      };
    }),
  };
});

jest.mock('../../home/ProtectionMapView', () => ({ ProtectionMapView: () => null }));

jest.mock('../../../config/features', () => ({
  FEATURE_LOCATION_TRACKING_ENABLED: true,
  FEATURE_HARDWARE_TRACKING_ENABLED: false,
}));

describe('AssetDetailScreen — consent-before-OS-permission ordering', () => {
  beforeEach(() => {
    callOrder.length = 0;
  });

  it('records consent (SecureStore) before requesting the OS location permission', async () => {
    await renderWithProviders(<AssetDetailScreen />);

    const enableButton = await screen.findByText('Enable location tracking on this phone');
    await act(async () => {
      fireEvent.press(enableButton);
    });

    const continueButton = await screen.findByText('Turn on location');
    await act(async () => {
      fireEvent.press(continueButton);
    });

    expect(callOrder).toEqual([
      'consent-recorded',
      'server-consent-grant-recorded',
      'os-permission-requested',
    ]);
  });
});
