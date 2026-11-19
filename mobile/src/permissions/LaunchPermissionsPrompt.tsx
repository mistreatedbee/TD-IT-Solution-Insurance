/**
 * First-launch permissions explainer (owner-test only, `FEATURE_LAUNCH_LOCATION_PROMPT_ENABLED`).
 *
 * Full-screen, built only from `src/design` components (Backdrop, GlassCard, Button) and the
 * day/night design tokens. Two steps, location first then camera; each step is skipped when the
 * permission is already granted or was offered in the last 7 days.
 *
 * What "Allow" does — and does not do:
 *  - location: asks the OS for foreground ("when in use") permission. It does NOT record
 *    tracking consent, link an asset, read a position or send anything to the server.
 *  - camera: asks the OS for camera permission. It does NOT open the camera or upload anything.
 * When a permission is permanently denied the OS prompt is never shown; "Open Settings" is.
 *
 * Mounted once in the root layout, so it can appear before or after sign-in.
 */
import { CameraIcon, MapPinIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { Backdrop, Button, GlassCard } from '../design';
import { useDesignTokens } from '../theme/designTheme';
import {
  recordOffered,
  requestLaunchPermission,
  resolveDueLaunchSteps,
  type LaunchPermissionKind,
  type LaunchPermissionStep,
} from './launchPermissions';

interface StepCopy {
  title: string;
  lines: string[];
  blockedLine: string;
}

export const LAUNCH_PROMPT_COPY: Record<LaunchPermissionKind, StepCopy> = {
  location: {
    title: 'Use your location?',
    lines: [
      'We use your location only while the app is open.',
      'Your location is not shared until you turn on protection for an asset.',
      'You can change this at any time in Settings.',
    ],
    blockedLine: 'Location is turned off for this app. You can turn it on in Settings.',
  },
  camera: {
    title: 'Use your camera?',
    lines: [
      'The camera is used to take photos in the app — today, your profile picture.',
      'Nothing is taken or uploaded unless you choose to.',
      'You can change this at any time in Settings.',
    ],
    blockedLine: 'The camera is turned off for this app. You can turn it on in Settings.',
  },
};

export function LaunchPermissionsPrompt() {
  const t = useDesignTokens();
  const [steps, setSteps] = useState<LaunchPermissionStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveDueLaunchSteps().then(
      (due) => {
        if (!cancelled) setSteps(due);
      },
      () => {
        // Can't read permission state: show nothing rather than guess.
        if (!cancelled) setSteps([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const step = steps && index < steps.length ? steps[index] : null;

  const finishStep = useCallback(
    async (kind: LaunchPermissionKind) => {
      // Any non-grant outcome is re-offered at most once per 7 days; a grant is never re-offered
      // because a granted permission is skipped when steps are resolved.
      try {
        await recordOffered(kind);
      } catch {
        // Storage failure must not trap the user on the explainer.
      }
      setIndex((i) => i + 1);
    },
    [],
  );

  const onAllow = useCallback(async () => {
    if (!step || busy) return;
    setBusy(true);
    try {
      if (step.status === 'blocked') {
        // Permanently denied: never show the OS prompt again — only Settings can change it.
        await Linking.openSettings().catch(() => undefined);
      } else {
        await requestLaunchPermission(step.kind).catch(() => undefined);
      }
    } finally {
      setBusy(false);
      await finishStep(step.kind);
    }
  }, [step, busy, finishStep]);

  const onNotNow = useCallback(() => {
    if (!step || busy) return;
    void finishStep(step.kind);
  }, [step, busy, finishStep]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        fill: { flex: 1, backgroundColor: t.colors.bgPage },
        content: { flex: 1, justifyContent: 'center', padding: t.spacing.s6, gap: t.spacing.s4 },
        card: { gap: t.spacing.s3 },
        iconWrap: {
          width: 56,
          height: 56,
          borderRadius: t.radius.pill,
          backgroundColor: t.colors.bgPage,
          alignItems: 'center',
          justifyContent: 'center',
        },
        title: { ...t.type.displayMd, color: t.colors.ink },
        body: { ...t.type.body, color: t.colors.inkMuted },
        progress: { ...t.type.labelSm, color: t.colors.inkMuted },
        actions: { gap: t.spacing.s3 },
      }),
    [t],
  );

  if (!step || !steps) return null;

  const copy = LAUNCH_PROMPT_COPY[step.kind];
  const Icon = step.kind === 'location' ? MapPinIcon : CameraIcon;
  const blocked = step.status === 'blocked';

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onNotNow}>
      <View style={styles.fill} testID={`launch-permission-${step.kind}`}>
        <Backdrop variant="gradient" />
        <View style={styles.content}>
          <GlassCard variant="solid" style={styles.card}>
            <View style={styles.iconWrap}>
              <Icon size={28} color={t.colors.ink} strokeWidth={1.75} />
            </View>
            {steps.length > 1 ? (
              <Text style={styles.progress}>
                Step {index + 1} of {steps.length}
              </Text>
            ) : null}
            <Text style={styles.title} accessibilityRole="header">
              {copy.title}
            </Text>
            {copy.lines.map((line) => (
              <Text key={line} style={styles.body}>
                {line}
              </Text>
            ))}
            {blocked ? <Text style={styles.body}>{copy.blockedLine}</Text> : null}
          </GlassCard>
          <View style={styles.actions}>
            <Button
              label={blocked ? 'Open Settings' : 'Allow'}
              onPress={() => void onAllow()}
              loading={busy}
            />
            <Button label="Not now" variant="glass" onPress={onNotNow} disabled={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
