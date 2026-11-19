/**
 * "Keep protecting this phone when the app is closed?" — the background ("Allow all the time")
 * location explainer. OWNER EXCEPTION 2026-11-17 addendum (2026-11-19), owner-test Android only.
 *
 * Ordering (CTO condition 4): rendered only AFTER protection is on for this phone (local consent +
 * linked asset recorded, foreground permission granted). It never renders on iOS or in a build
 * without `FEATURE_BACKGROUND_LOCATION_ENABLED`. "Allow all the time" calls
 * `requestBackgroundPermissionsAsync` (Android 11+ opens the app's location settings page);
 * "Not now" or a refusal leaves foreground reporting exactly as it was.
 *
 * Built only from `src/design` components (GlassCard, Button) and design tokens.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Button, GlassCard } from '../design';
import { useDesignTokens } from '../theme/designTheme';
import {
  isBackgroundLocationSupported,
  isBackgroundPermissionGranted,
  requestBackgroundLocationPermission,
  startBackgroundLocationUpdates,
} from './backgroundLocation';
import { hasActiveLocationTracking } from './consent';

/** "Not now" holds for the rest of this app session; the offer returns on the next launch. */
let dismissedThisSession = false;

/** Test-only. */
export function __resetBackgroundOfferForTests(): void {
  dismissedThisSession = false;
}

type OfferState = 'checking' | 'offer' | 'hidden' | 'running' | 'declined';

export function BackgroundLocationOffer() {
  const t = useDesignTokens();
  const [state, setState] = useState<OfferState>(() =>
    isBackgroundLocationSupported() ? 'checking' : 'hidden',
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isBackgroundLocationSupported()) return;
    let cancelled = false;
    void (async () => {
      const active = await hasActiveLocationTracking();
      if (!active) {
        if (!cancelled) setState('hidden');
        return;
      }
      if (await isBackgroundPermissionGranted()) {
        // Already allowed earlier: make sure updates run, no prompt.
        await startBackgroundLocationUpdates();
        if (!cancelled) setState('hidden');
        return;
      }
      if (!cancelled) setState(dismissedThisSession ? 'hidden' : 'offer');
    })().catch(() => {
      if (!cancelled) setState('hidden');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onAllow = useCallback(async () => {
    setLoading(true);
    try {
      const granted = await requestBackgroundLocationPermission();
      const running = granted ? await startBackgroundLocationUpdates() : false;
      setState(running ? 'running' : 'declined');
    } finally {
      setLoading(false);
    }
  }, []);

  const onNotNow = useCallback(() => {
    dismissedThisSession = true;
    setState('hidden');
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { gap: t.spacing.s3 },
        title: { ...t.type.title, color: t.colors.ink },
        body: { ...t.type.bodySm, color: t.colors.inkMuted },
      }),
    [t],
  );

  if (state === 'checking' || state === 'hidden') return null;

  if (state === 'running' || state === 'declined') {
    return (
      <GlassCard style={styles.card} testID="background-location-result">
        <Text style={styles.body}>
          {state === 'running'
            ? 'This phone now reports its location even when the app is closed. Android shows the notification "TD Insurance is protecting this phone" while this is on.'
            : 'Location is not allowed all the time, so this phone reports its location only while the app is open. You can change this in your phone settings at any time.'}
        </Text>
      </GlassCard>
    );
  }

  return (
    <GlassCard style={styles.card} testID="background-location-offer">
      <Text style={styles.title} accessibilityRole="header">
        Keep protecting this phone when the app is closed?
      </Text>
      <Text style={styles.body}>
        If you allow location all the time, this phone sends its location to TD Insurance about
        every 5 minutes, or when it moves about 100 metres, even when the app is closed. While this
        is on, Android shows the notification “TD Insurance is protecting this phone”.
      </Text>
      <Text style={styles.body}>
        Your phone will open its location settings. Choose “Allow all the time”. If you say no, this
        phone still reports its location while the app is open. Turning off protection for this
        phone stops it at any time.
      </Text>
      <Button
        label="Allow all the time"
        onPress={() => void onAllow()}
        loading={loading}
        testID="background-location-allow"
      />
      <Button label="Not now" variant="glass" onPress={onNotNow} disabled={loading} testID="background-location-not-now" />
    </GlassCard>
  );
}
