/**
 * INC-002 §11.3 SR-INC002-M1/M2/M4 — AssetDetailScreen must offer a reachable
 * "Turn off tracking" control (matching what LocationConsentModal promises:
 * "You can turn this off anytime from the asset detail screen") that clears
 * BOTH the server-side location record (DELETE /v1/assets/:assetId/location)
 * and the device-local SecureStore consent/linked-asset state. It must also
 * record consent BEFORE requesting the OS location permission, never after.
 */
import React from 'react';
import { Alert } from 'react-native';
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

const mockMutateAsyncReport = jest.fn();
const mockMutateAsyncWithdraw = jest.fn(async () => ({
  assetId: 'asset-1',
  locationSource: null,
  purgedEventCount: 3,
}));

jest.mock('../../../api/hooks/useAssetLocation', () => ({
  useAssetLocationQuery: () => ({ data: null, isLoading: false, refetch: jest.fn() }),
  useAssetLocationSummaryQuery: () => ({
    data: { data: [] },
    refetch: jest.fn(),
  }),
  useReportAssetLocationMutation: () => ({ mutateAsync: mockMutateAsyncReport, isPending: false }),
  useWithdrawAssetLocationMutation: () => ({
    mutateAsync: mockMutateAsyncWithdraw,
    isPending: false,
  }),
  useGrantAssetLocationConsentMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('../../../api/hooks/useAssetTrackingProfile', () => ({
  useAssetTrackingProfileQuery: () => ({ data: undefined }),
}));

jest.mock('../../../api/hooks/usePlanEntitlements', () => ({
  usePlanEntitlements: () => ({
    hasIncidentManagement: true,
    changePlanHref: null,
    isLoading: false,
  }),
}));

const mockSetLocationTrackingConsent = jest.fn();
const mockSetLinkedSmartphoneAssetId = jest.fn();
const mockClearLocationTrackingConsent = jest.fn();
const mockClearLinkedSmartphoneAssetId = jest.fn();
const mockRequestForegroundLocation = jest.fn(async () => ({
  latitude: 1,
  longitude: 2,
  accuracyMeters: 5,
  capturedAt: '2026-01-01T00:00:00.000Z',
}));

jest.mock('../../../location', () => ({
  LocationConsentModal: () => null,
  formatRelativeTime: () => 'just now',
  getLinkedSmartphoneAssetId: jest.fn(async () => 'asset-1'),
  getLocationTrackingConsent: jest.fn(async () => 'granted'),
  requestForegroundLocation: () => mockRequestForegroundLocation(),
  setLinkedSmartphoneAssetId: (assetId: string) => mockSetLinkedSmartphoneAssetId(assetId),
  setLocationTrackingConsent: (consent: string) => mockSetLocationTrackingConsent(consent),
  clearLocationTrackingConsent: () => mockClearLocationTrackingConsent(),
  clearLinkedSmartphoneAssetId: () => mockClearLinkedSmartphoneAssetId(),
}));

jest.mock('../../home/ProtectionMapView', () => ({
  ProtectionMapView: () => null,
}));

jest.mock('../../../config/features', () => ({
  FEATURE_LOCATION_TRACKING_ENABLED: true,
  FEATURE_HARDWARE_TRACKING_ENABLED: false,
}));

const mockIsOnline = jest.fn(() => true);
jest.mock('../../../network/NetworkProvider', () => ({
  useIsOnline: () => mockIsOnline(),
}));

describe('AssetDetailScreen — location withdrawal (INC-002 M1/M2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOnline.mockReturnValue(true);
  });

  it('renders a reachable "Turn off tracking" control when tracking is active', async () => {
    await renderWithProviders(<AssetDetailScreen />);
    expect(await screen.findByText('Turn off tracking')).toBeTruthy();
  });

  it('calls DELETE withdrawal AND clears device-local consent + linked-asset state on confirm', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const confirm = buttons?.find((b) => b.text === 'Turn off tracking');
      confirm?.onPress?.();
    });

    await renderWithProviders(<AssetDetailScreen />);
    const button = await screen.findByText('Turn off tracking');

    await act(async () => {
      fireEvent.press(button);
    });

    await waitFor(() => {
      expect(mockMutateAsyncWithdraw).toHaveBeenCalledWith('asset-1');
    });
    expect(mockClearLocationTrackingConsent).toHaveBeenCalled();
    expect(mockClearLinkedSmartphoneAssetId).toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('confirms via a destructive Alert before disabling (matches logout-all/delete-account pattern)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    await renderWithProviders(<AssetDetailScreen />);
    const button = await screen.findByText('Turn off tracking');

    await act(async () => {
      fireEvent.press(button);
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Turn off location tracking?',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Turn off tracking', style: 'destructive' }),
      ]),
    );
    expect(mockMutateAsyncWithdraw).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  describe('offline-tolerance policy (docs/organization/05-development-standards.md)', () => {
    it('blocks withdrawal when offline with a definite "has NOT been turned off" message, and never calls the mutation', async () => {
      mockIsOnline.mockReturnValue(false);
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
        const confirm = buttons?.find((b) => b.text === 'Turn off tracking');
        confirm?.onPress?.();
      });

      await renderWithProviders(<AssetDetailScreen />);
      const button = await screen.findByText('Turn off tracking');
      await act(async () => {
        fireEvent.press(button);
      });

      await waitFor(() =>
        expect(screen.getByText(/Tracking has NOT been turned off/)).toBeTruthy(),
      );
      expect(mockMutateAsyncWithdraw).not.toHaveBeenCalled();
      // The critical POPIA property: the screen must still offer "Turn off
      // tracking" (i.e. still believes tracking is ON), never "Enable
      // tracking" — it must not have silently flipped to believing
      // withdrawal succeeded.
      expect(screen.getByText('Turn off tracking')).toBeTruthy();

      alertSpy.mockRestore();
    });

    it('on a NetworkUnavailableError, shows an uncertain-delivery message and leaves tracking shown as ON (never claims success or definite failure)', async () => {
      const { NetworkUnavailableError } = jest.requireActual('../../../api/errors');
      mockMutateAsyncWithdraw.mockRejectedValueOnce(new NetworkUnavailableError());
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
        const confirm = buttons?.find((b) => b.text === 'Turn off tracking');
        confirm?.onPress?.();
      });

      await renderWithProviders(<AssetDetailScreen />);
      const button = await screen.findByText('Turn off tracking');
      await act(async () => {
        fireEvent.press(button);
      });

      await waitFor(() =>
        expect(screen.getByText(/couldn.t confirm tracking was turned off/)).toBeTruthy(),
      );
      // Must not claim it was turned off (that's the "Tracking turned off"
      // success Alert) — confirmed by local state never having been cleared.
      expect(mockClearLocationTrackingConsent).not.toHaveBeenCalled();
      expect(mockClearLinkedSmartphoneAssetId).not.toHaveBeenCalled();
      expect(screen.getByText('Turn off tracking')).toBeTruthy();

      alertSpy.mockRestore();
    });
  });
});
