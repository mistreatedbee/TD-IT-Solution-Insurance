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

describe('AssetDetailScreen — consent-grant reverts optimistic state on failure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOnline.mockReturnValue(true);
    mockGrantConsent.mockReset();
  });

  it('reverts local consent/linked-asset state when the server-side consent grant fails', async () => {
    mockGrantConsent.mockRejectedValueOnce(new Error('server rejected consent grant'));

    await renderWithProviders(<AssetDetailScreen />);

    const enableButton = await screen.findByText('Enable location tracking on this phone');
    await act(async () => {
      fireEvent.press(enableButton);
    });

    const continueButton = await screen.findByText('Turn on location');
    await act(async () => {
      fireEvent.press(continueButton);
    });

    await waitFor(() => {
      expect(mockGrantConsent).toHaveBeenCalledWith('asset-1');
    });

    // The optimistic local writes must be reverted, not left standing.
    expect(mockSetLocationTrackingConsent).toHaveBeenCalledWith('granted');
    expect(mockSetLocationTrackingConsent).toHaveBeenCalledWith('denied');
    expect(mockClearLinkedSmartphoneAssetId).toHaveBeenCalled();

    // The OS permission prompt must never fire off the back of a consent
    // grant the server rejected.
    expect(mockRequestForegroundLocation).not.toHaveBeenCalled();

    // The screen must not be left showing "tracking is on" — it should still
    // offer to enable tracking, not the active-tracking controls.
    await waitFor(() =>
      expect(screen.getByText('Enable location tracking on this phone')).toBeTruthy(),
    );
  });
});
