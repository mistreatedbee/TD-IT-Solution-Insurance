/**
 * INC-001: the smartphone "Enable location tracking on this phone" /
 * "Update location now" buttons are the UI entry points that lead to an OS
 * location-permission prompt from the asset detail screen. When
 * `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING` is off, neither button — nor any
 * other path to `requestForegroundLocation` — may render. Mirrors the
 * claims entry-point-hidden pattern (see
 * `ReportTheftSuccessScreen.claimsDisabled.test.tsx`).
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
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
  useAssetLocationSummaryQuery: () => ({
    data: { data: [] },
    refetch: jest.fn(),
  }),
  useReportAssetLocationMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
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

jest.mock('../../../location', () => ({
  LocationConsentModal: () => null,
  formatRelativeTime: () => 'just now',
  getLinkedSmartphoneAssetId: jest.fn(async () => null),
  getLocationTrackingConsent: jest.fn(async () => 'not_set'),
  requestForegroundLocation: jest.fn(),
  setLinkedSmartphoneAssetId: jest.fn(),
  setLocationTrackingConsent: jest.fn(),
}));

jest.mock('../../home/ProtectionMapView', () => ({
  ProtectionMapView: () => null,
}));

jest.mock('../../../config/features', () => ({ FEATURE_LOCATION_TRACKING_ENABLED: false }));

describe('AssetDetailScreen — location tracking flag disabled (preview/production)', () => {
  it('hides "Enable location tracking on this phone"', async () => {
    await render(<AssetDetailScreen />);
    expect(screen.queryByText('Enable location tracking on this phone')).toBeNull();
  });

  it('hides "Update location now"', async () => {
    await render(<AssetDetailScreen />);
    expect(screen.queryByText('Update location now')).toBeNull();
  });

  it('shows a static not-available message instead', async () => {
    await render(<AssetDetailScreen />);
    expect(
      screen.getByText('Phone-based location tracking is not available in this build.'),
    ).toBeTruthy();
  });

  it('never calls requestForegroundLocation from this screen', async () => {
    const { requestForegroundLocation } = require('../../../location');
    await render(<AssetDetailScreen />);
    expect(requestForegroundLocation).not.toHaveBeenCalled();
  });
});
