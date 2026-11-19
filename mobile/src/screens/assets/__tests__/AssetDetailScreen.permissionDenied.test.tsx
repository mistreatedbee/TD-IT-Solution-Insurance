/**
 * security-engineer finding (2026-10-06, Stage 8 gate on the offline-tolerance
 * policy work): handleConsentAccept wrote local "tracking enabled" state
 * (SecureStore consent + linked-asset id + in-memory state) BEFORE the
 * server-side consent-grant call resolved, and never reverted it if that
 * call failed — leaving the device believing it had consent the server has
 * no record of. This must revert on failure so the client never shows
 * "tracking enabled" without a matching server-side consent record.
 */
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { AssetDetailScreen } from '../AssetDetailScreen';
import { LocationPermissionDeniedError } from '../../../location';

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

const mockGrantConsent = jest.fn();

jest.mock('../../../api/hooks/useAssetLocation', () => ({
  useAssetLocationQuery: () => ({ data: null, isLoading: false, refetch: jest.fn() }),
  useAssetLocationSummaryQuery: () => ({ data: { data: [] }, refetch: jest.fn() }),
  useReportAssetLocationMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useWithdrawAssetLocationMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useGrantAssetLocationConsentMutation: () => ({ mutateAsync: mockGrantConsent, isPending: false }),
}));

jest.mock('../../../api/hooks/useAssetTrackingProfile', () => ({
  useAssetTrackingProfileQuery: () => ({ data: undefined }),
}));

jest.mock('../../../api/hooks/usePlanEntitlements', () => ({
  usePlanEntitlements: () => ({ hasIncidentManagement: true, changePlanHref: null, isLoading: false }),
}));

const mockSetLocationTrackingConsent = jest.fn();
const mockSetLinkedSmartphoneAssetId = jest.fn();
const mockClearLinkedSmartphoneAssetId = jest.fn();
const mockRequestForegroundLocation = jest.fn();

jest.mock('../../../location', () => ({
  LocationConsentModal: ({ onAccept }: { onAccept: () => void }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable onPress={onAccept} accessibilityRole="button">
        <Text>Turn on location</Text>
      </Pressable>
    );
  },
  formatRelativeTime: () => 'just now',
  LocationPermissionDeniedError: class LocationPermissionDeniedError extends Error {},
  LocationServicesDisabledError: class LocationServicesDisabledError extends Error {},
  LocationTimeoutError: class LocationTimeoutError extends Error {},
  isCoarseAccuracy: () => false,
  useForegroundPermissionState: () => ({ state: null, refresh: jest.fn() }),
  getLinkedSmartphoneAssetId: jest.fn(async () => null),
  getLocationTrackingConsent: jest.fn(async () => null),
  requestForegroundLocation: () => mockRequestForegroundLocation(),
  setLinkedSmartphoneAssetId: (assetId: string) => mockSetLinkedSmartphoneAssetId(assetId),
  setLocationTrackingConsent: (consent: string) => mockSetLocationTrackingConsent(consent),
  clearLocationTrackingConsent: jest.fn(async () => undefined),
  clearLinkedSmartphoneAssetId: () => mockClearLinkedSmartphoneAssetId(),
}));

jest.mock('../../home/ProtectionMapView', () => ({ ProtectionMapView: () => null }));

jest.mock('../../../config/features', () => ({
  FEATURE_LOCATION_TRACKING_ENABLED: true,
  FEATURE_HARDWARE_TRACKING_ENABLED: false,
}));

const mockIsOnline = jest.fn(() => true);
jest.mock('../../../network/NetworkProvider', () => ({
  useIsOnline: () => mockIsOnline(),
}));

describe('AssetDetailScreen — OS permission denied after consent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOnline.mockReturnValue(true);
    mockGrantConsent.mockReset();
  });

  it('reverts local consent/link and does not claim tracking is active', async () => {
    mockGrantConsent.mockResolvedValueOnce({});
    mockRequestForegroundLocation.mockRejectedValueOnce(new LocationPermissionDeniedError());

    await renderWithProviders(<AssetDetailScreen />);
    await act(async () => {
      fireEvent.press(await screen.findByText('Enable location tracking on this phone'));
    });
    await act(async () => {
      fireEvent.press(await screen.findByText('Turn on location'));
    });

    await waitFor(() => expect(mockSetLocationTrackingConsent).toHaveBeenCalledWith('denied'));
    expect(mockClearLinkedSmartphoneAssetId).toHaveBeenCalled();
    expect(await screen.findByText(/tracking has not been turned on/i)).toBeTruthy();
    expect(screen.getByText('Enable location tracking on this phone')).toBeTruthy();
    expect(screen.queryByText('Update location now')).toBeNull();
  });
});
