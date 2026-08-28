/**
 * Reports location for the linked smartphone asset when the app is foregrounded.
 * Feature 008 §2.3 — foreground/on-demand only.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { reportAssetLocation } from '../api/asset-location';
import { FEATURE_LOCATION_TRACKING_ENABLED } from '../config/features';
import { getLinkedSmartphoneAssetId, getLocationTrackingConsent } from './consent';
import {
  getForegroundLocationFix,
  requestForegroundLocationPermission,
} from './requestForegroundLocation';

async function maybeReportForegroundLocation(triggeredBy: 'foreground_open' | 'manual_refresh') {
  // INC-001: never call expo-location or reach the (kill-switched)
  // location-report endpoint when the client feature flag is off — there
  // is no product surface for the result if this build has location
  // tracking disabled. See `src/config/features.ts`.
  if (!FEATURE_LOCATION_TRACKING_ENABLED) return;

  const consent = await getLocationTrackingConsent();
  if (consent !== 'granted') return;

  const assetId = await getLinkedSmartphoneAssetId();
  if (!assetId) return;

  const granted = await requestForegroundLocationPermission();
  if (!granted) return;

  const fix = await getForegroundLocationFix();
  await reportAssetLocation(assetId, {
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracyMeters: fix.accuracyMeters,
    capturedAt: fix.capturedAt,
    triggeredBy,
  });
}

/**
 * Hook for the authenticated app shell — listens for foreground transitions
 * and reports location for the bound smartphone asset when consented.
 */
export function useLocationReporter(): void {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    // INC-001: skip wiring the AppState listener entirely when the flag is
    // off, so this hook cannot trigger an expo-location call under any
    // circumstance for a build with location tracking disabled.
    if (!FEATURE_LOCATION_TRACKING_ENABLED) return;

    maybeReportForegroundLocation('foreground_open').catch(() => {
      // Non-blocking — permission denied, network error, or backend unavailable.
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appState.current.match(/inactive|background/);
      if (wasBackground && nextState === 'active') {
        maybeReportForegroundLocation('foreground_open').catch(() => {
          // Non-blocking.
        });
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, []);
}

export { maybeReportForegroundLocation };
