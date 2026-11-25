/**
 * INC-001 A-7: when the server answers CONSENT_REQUIRED the consent modal is shown again; accept
 * re-records the scoped server consent through the one enable path, "Not now" turns tracking off.
 */
import React from 'react';
import * as Location from 'expo-location';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderWithProviders } from '../../test/renderWithProviders';
import { LocationReconsentPrompt } from '../LocationReconsentPrompt';
import { clearPendingReconsent, notifyServerConsentRequired } from '../serverConsentSignal';
import {
  clearLocalLocationState,
  getLinkedSmartphoneAssetId,
  getLocationTrackingConsent,
  setLinkedSmartphoneAssetId,
  setLocationTrackingConsent,
} from '../consent';
import { grantAssetLocationConsent, reportAssetLocation } from '../../api/asset-location';

jest.mock('../../config/features', () => ({
  FEATURE_LOCATION_TRACKING_ENABLED: true,
  FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED: true,
  FEATURE_BACKGROUND_LOCATION_ENABLED: false,
}));
jest.mock('../../api/asset-location', () => ({
  grantAssetLocationConsent: jest.fn(async () => ({})),
  reportAssetLocation: jest.fn(async () => ({})),
}));

function Prompt() {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity }, queries: { gcTime: Infinity } } }));
  return (
    <QueryClientProvider client={client}>
      <LocationReconsentPrompt />
    </QueryClientProvider>
  );
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe('LocationReconsentPrompt', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    clearPendingReconsent();
    await clearLocalLocationState();
    await setLocationTrackingConsent('granted');
    await setLinkedSmartphoneAssetId('asset-1');
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true });
  });

  it('renders nothing until the server asks for consent', async () => {
    await renderWithProviders(<Prompt />);
    await settle();
    expect(screen.queryByText('Let this phone report its own location?')).toBeNull();
  });

  it('shows the consent modal on CONSENT_REQUIRED; accept re-records scoped consent then reports', async () => {
    await renderWithProviders(<Prompt />);
    await settle();
    await act(async () => {
      notifyServerConsentRequired('asset-1');
    });
    expect(screen.getByText('Let this phone report its own location?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Turn on location'));
    });
    await settle();
    expect(grantAssetLocationConsent).toHaveBeenCalledWith('asset-1', {
      scopes: ['foreground', 'periodic'],
      consentTextVersion: expect.any(String),
    });
    expect(screen.queryByText('Let this phone report its own location?')).toBeNull();
    expect(reportAssetLocation).toHaveBeenCalledTimes(1);
    expect((grantAssetLocationConsent as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (reportAssetLocation as jest.Mock).mock.invocationCallOrder[0]!,
    );
  });

  it('"Not now" turns tracking off on this phone and records nothing server-side', async () => {
    await renderWithProviders(<Prompt />);
    await settle();
    await act(async () => {
      notifyServerConsentRequired('asset-1');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Not now'));
    });
    await settle();
    expect(grantAssetLocationConsent).not.toHaveBeenCalled();
    expect(await getLocationTrackingConsent()).toBe('denied');
    expect(await getLinkedSmartphoneAssetId()).toBeNull();
    expect(screen.queryByText('Let this phone report its own location?')).toBeNull();
  });
});
