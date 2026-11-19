/**
 * Home one-tap "Turn on protection for this phone": shown only for exactly one active smartphone
 * with no stored consent decision; shows the consent text before anything is recorded, then runs
 * the SAME shared consent path as AssetDetailScreen (enableLocationTrackingForAsset).
 */
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { enableLocationTrackingForAsset } from '../../location/enableTrackingForAsset';
import { OneTapPhoneProtectionCard } from '../OneTapPhoneProtectionCard';

const callOrder: string[] = [];
let mockAssets: Record<string, unknown>[] = [];
let mockConsent: string | null = null;

jest.mock('../../../api/hooks/useAssets', () => ({
  useAssetsQuery: () => ({ data: { data: mockAssets }, isLoading: false }),
}));

jest.mock('../../../api/hooks/useAssetLocation', () => ({
  useReportAssetLocationMutation: () => ({
    mutateAsync: jest.fn(async () => {
      callOrder.push('location-reported');
    }),
  }),
  useGrantAssetLocationConsentMutation: () => ({
    mutateAsync: jest.fn(async () => {
      callOrder.push('server-consent-grant-recorded');
    }),
  }),
}));

jest.mock('../../../location', () => {
  const actual = jest.requireActual('../../../location');
  return {
    ...actual,
    getLinkedSmartphoneAssetId: jest.fn(async () => null),
    getLocationTrackingConsent: jest.fn(async () => mockConsent),
    setLinkedSmartphoneAssetId: jest.fn(async () => {
      callOrder.push('asset-linked');
    }),
    setLocationTrackingConsent: jest.fn(async (value: string) => {
      callOrder.push(`consent-${value}`);
    }),
    clearLinkedSmartphoneAssetId: jest.fn(async () => undefined),
    requestForegroundLocation: jest.fn(async () => {
      callOrder.push('os-permission-requested');
      return { latitude: 1, longitude: 2, accuracyMeters: 5, capturedAt: '2026-01-01T00:00:00.000Z' };
    }),
  };
});

jest.mock('../../location/enableTrackingForAsset', () => {
  const actual = jest.requireActual('../../location/enableTrackingForAsset');
  return { enableLocationTrackingForAsset: jest.fn(actual.enableLocationTrackingForAsset) };
});

const phone = { id: 'phone-1', displayName: 'My Phone', assetType: 'smartphone', status: 'active' };

async function renderCard() {
  await renderWithProviders(<OneTapPhoneProtectionCard />);
  await act(async () => {});
}

describe('OneTapPhoneProtectionCard', () => {
  beforeEach(() => {
    callOrder.length = 0;
    mockAssets = [phone];
    mockConsent = null;
    jest.clearAllMocks();
  });

  it('shows the consent text before recording anything, then uses the shared consent path', async () => {
    await renderCard();
    await act(async () => {
      fireEvent.press(await screen.findByText('Turn on protection for this phone'));
    });

    expect(await screen.findByText('Let this phone report its own location?')).toBeTruthy();
    expect(callOrder).toEqual([]);
    expect(enableLocationTrackingForAsset).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(await screen.findByText('Turn on location'));
    });

    expect(enableLocationTrackingForAsset).toHaveBeenCalledTimes(1);
    expect(enableLocationTrackingForAsset).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'phone-1' }),
    );
    expect(callOrder).toEqual([
      'consent-granted',
      'asset-linked',
      'server-consent-grant-recorded',
      'os-permission-requested',
      'location-reported',
    ]);
  });

  it("'Not now' in the consent modal records the decline and nothing else", async () => {
    await renderCard();
    await act(async () => {
      fireEvent.press(await screen.findByText('Turn on protection for this phone'));
    });
    await act(async () => {
      fireEvent.press(await screen.findByText('Not now'));
    });
    expect(callOrder).toEqual(['consent-denied']);
    expect(enableLocationTrackingForAsset).not.toHaveBeenCalled();
    expect(screen.queryByText('Turn on protection for this phone')).toBeNull();
  });

  it('is hidden when there is more than one active smartphone', async () => {
    mockAssets = [phone, { ...phone, id: 'phone-2' }];
    await renderCard();
    expect(screen.queryByText('Turn on protection for this phone')).toBeNull();
  });

  it('ignores inactive smartphones and other asset types when counting', async () => {
    mockAssets = [phone, { ...phone, id: 'phone-2', status: 'inactive' }, { id: 'l-1', assetType: 'laptop', status: 'active' }];
    await renderCard();
    expect(await screen.findByText('Turn on protection for this phone')).toBeTruthy();
  });

  it('is hidden when a consent decision is already stored', async () => {
    mockConsent = 'denied';
    await renderCard();
    expect(screen.queryByText('Turn on protection for this phone')).toBeNull();
  });
});
