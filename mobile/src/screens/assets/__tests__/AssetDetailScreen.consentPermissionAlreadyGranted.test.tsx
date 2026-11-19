/**
 * Companion to AssetDetailScreen.consentOrdering: when the OS location permission is ALREADY
 * granted (e.g. via the first-launch explainer), turning on tracking still shows the consent
 * modal and records consent locally + POSTs the server-side consent grant BEFORE anything else.
 * Only the OS prompt itself is skipped.
 */
import * as Location from 'expo-location';
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { AssetDetailScreen } from '../AssetDetailScreen';

const callOrder: string[] = [];

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
  useReportAssetLocationMutation: () => ({
    mutateAsync: jest.fn(async () => {
      callOrder.push('location-reported');
    }),
    isPending: false,
  }),
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

// Real requestForegroundLocation (it reads the OS state and skips the prompt when granted);
// only the device-local consent writes are observed.
jest.mock('../../../location', () => {
  const actual = jest.requireActual('../../../location');
  return {
    ...actual,
    getLinkedSmartphoneAssetId: jest.fn(async () => null),
    getLocationTrackingConsent: jest.fn(async () => null),
    setLinkedSmartphoneAssetId: jest.fn(async () => {
      callOrder.push('asset-linked');
    }),
    setLocationTrackingConsent: jest.fn(async () => {
      callOrder.push('consent-recorded');
    }),
    clearLocationTrackingConsent: jest.fn(async () => undefined),
    clearLinkedSmartphoneAssetId: jest.fn(async () => undefined),
  };
});

jest.mock('../../home/ProtectionMapView', () => ({ ProtectionMapView: () => null }));

jest.mock('../../../config/features', () => ({
  FEATURE_LOCATION_TRACKING_ENABLED: true,
  FEATURE_HARDWARE_TRACKING_ENABLED: false,
}));

describe('AssetDetailScreen — OS permission already granted', () => {
  beforeEach(() => {
    callOrder.length = 0;
    jest.clearAllMocks();
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    });
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(async () => {
      callOrder.push('position-read');
      return { coords: { latitude: 1, longitude: 2, accuracy: 5 }, timestamp: Date.now() };
    });
  });

  it('shows the consent modal and records consent + server grant first; skips only the OS prompt', async () => {
    await renderWithProviders(<AssetDetailScreen />);

    const enableButton = await screen.findByText('Enable location tracking on this phone');
    await act(async () => {
      fireEvent.press(enableButton);
    });

    // Consent text is on screen and nothing has been recorded yet.
    expect(await screen.findByText('Let this phone report its own location?')).toBeTruthy();
    expect(callOrder).toEqual([]);

    await act(async () => {
      fireEvent.press(await screen.findByText('Turn on location'));
    });

    expect(callOrder).toEqual([
      'consent-recorded',
      'asset-linked',
      'server-consent-grant-recorded',
      'position-read',
      'location-reported',
    ]);
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});
