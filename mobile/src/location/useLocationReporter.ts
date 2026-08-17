/**
 * Reports location for the linked smartphone asset when the app is foregrounded.
 * Feature 008 §2.3 — foreground/on-demand only.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { reportAssetLocation } from '../api/asset-location';
import { getLinkedSmartphoneAssetId, getLocationTrackingConsent } from './consent';
import {
  getForegroundLocationFix,
  requestForegroundLocationPermission,
} from './requestForegroundLocation';

async function maybeReportForegroundLocation(triggeredBy: 'foreground_open' | 'manual_refresh') {
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
