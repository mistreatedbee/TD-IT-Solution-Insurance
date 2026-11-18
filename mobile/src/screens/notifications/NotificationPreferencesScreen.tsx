/**
 * Feature 007 — notification preferences (customer opt-in/opt-out per
 * category and channel). Wired to the already-live
 * `GET/PATCH /v1/notifications/preferences` contract
 * (`src/api/notifications.ts`'s `NotificationCategory`/
 * `CategoryChannelPreferences` shape — that file, and
 * `backend/src/routes/notifications.ts`, are the source of truth for the
 * category list and the one business rule enforced below, not this
 * screen's own judgment).
 *
 * Business rule (backend/src/routes/notifications.ts's `preferencesPatchSchema`
 * handling): `theft_critical`'s push channel cannot be turned off via
 * self-service — a PATCH attempting `{ theft_critical: { push: false } }`
 * is rejected with 400 VALIDATION_ERROR. Rather than let a customer flip
 * that switch and either silently no-op or surface a raw 400, this screen
 * renders that one toggle disabled/locked with an inline explanation. Every
 * other toggle (including theft_critical's own email/sms channels) is a
 * normal, freely-editable control.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type CategoryChannelPreferences,
  type NotificationCategory,
  type NotificationPreferencesResponse,
} from '../../api/notifications';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert, Toggle } from '../../theme/primitives';
import { FEATURE_CLAIMS_ENABLED } from '../../config/features';

type Channel = keyof CategoryChannelPreferences;

const CHANNELS: ReadonlyArray<{ key: Channel; label: string }> = [
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
];

const ALL_CATEGORIES: ReadonlyArray<{
  key: NotificationCategory;
  label: string;
  description: string;
}> = [
  {
    key: 'theft_critical',
    label: 'Theft alerts',
    description:
      'Critical alerts when a registered asset is reported stolen or a tracking geofence is triggered.',
  },
  {
    key: 'device_status',
    label: 'Device status',
    description:
      'GPS, battery, and connectivity updates for your tracked devices.',
  },
  {
    key: 'billing',
    label: 'Billing',
    description: 'Payment reminders, receipts, and billing issues.',
  },
  {
    key: 'account',
    label: 'Account & security',
    description:
      'Login alerts and changes to your account or security settings.',
  },
  {
    key: 'claims',
    label: 'Claims',
    description: 'Updates on the status of claims you have filed.',
  },
  {
    key: 'general',
    label: 'General',
    description: 'Service announcements and product updates.',
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description: 'Promotions, offers, and newsletters.',
  },
];

/**
 * Release Gate A: the claims backend has not shipped, so a build with
 * claims disabled must not offer preferences for notifications it can
 * never send (same defect class as a dead nav link — see
 * `src/config/features.ts`).
 */
const CATEGORIES: ReadonlyArray<{
  key: NotificationCategory;
  label: string;
  description: string;
}> = ALL_CATEGORIES.filter(
  (category) => category.key !== 'claims' || FEATURE_CLAIMS_ENABLED,
);

/** The one channel/category combination the backend will always reject. */
function isLocked(category: NotificationCategory, channel: Channel): boolean {
  return category === 'theft_critical' && channel === 'push';
}

export function NotificationPreferencesScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const [channels, setChannels] = useState<
    NotificationPreferencesResponse['channels'] | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setIsLoading(true);
    setLoadError(null);
    getNotificationPreferences()
      .then((res) => setChannels(res.channels))
      .catch((err) => {
        setLoadError(mapUserFacingError(err, { context: 'notification' }));
      })
      .finally(() => setIsLoading(false));
  }

  async function handleToggle(
    category: NotificationCategory,
    channel: Channel,
    next: boolean,
  ) {
    if (!channels || isLocked(category, channel)) return;

    const key = `${category}.${channel}`;
    const previous = channels;

    // Optimistic update — reverted below if the PATCH fails.
    setChannels({
      ...channels,
      [category]: { ...channels[category], [channel]: next },
    });
    setSaveError(null);
    setSavingKey(key);

    try {
      const result = await updateNotificationPreferences({
        [category]: { [channel]: next },
      });
      setChannels(result.channels);
    } catch (err) {
      setChannels(previous);
      setSaveError(mapUserFacingError(err, { context: 'notification' }));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <DesignPage>
      <Text style={styles.subtitle}>
        Choose how you want to hear from us, by category and channel.
      </Text>

      {saveError ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger" announceAssertively>
            {saveError}
          </Alert>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={t.colors.link} />
        </View>
      ) : loadError ? (
        <>
          <View style={styles.alertSpacing}>
            <Alert tone="danger">{loadError}</Alert>
          </View>
          <Button label="Retry" onPress={load} variant="glass" />
        </>
      ) : channels ? (
        CATEGORIES.map((category) => (
          <GlassCard
            variant="solid"
            key={category.key}
            style={styles.categoryCard}
          >
            <Text style={styles.categoryLabel}>{category.label}</Text>
            <Text style={styles.categoryDescription}>
              {category.description}
            </Text>

            {CHANNELS.map((channel) => {
              const locked = isLocked(category.key, channel.key);
              const value = channels[category.key]?.[channel.key] ?? false;
              const key = `${category.key}.${channel.key}`;

              return (
                <View key={key} style={styles.channelRow}>
                  <View style={styles.channelLabelColumn}>
                    <Text style={styles.channelLabel}>{channel.label}</Text>
                    {savingKey === key ? (
                      <Text style={styles.savingHint}>Saving…</Text>
                    ) : null}
                  </View>
                  <Toggle
                    value={locked ? true : value}
                    onValueChange={(next) =>
                      handleToggle(category.key, channel.key, next)
                    }
                    disabled={locked || savingKey !== null}
                    accessibilityLabel={`${channel.label} notifications for ${category.label}`}
                    disabledHint={
                      locked ? 'Required — cannot be turned off' : undefined
                    }
                  />
                </View>
              );
            })}
          </GlassCard>
        ))
      ) : null}
    </DesignPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    title: {
      ...t.type.displayMd,
      color: t.colors.ink,
      marginBottom: t.spacing.s1,
    },
    subtitle: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s6,
    },
    alertSpacing: { marginBottom: t.spacing.s4 },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: t.spacing.s8,
    },
    categoryCard: { marginBottom: t.spacing.s4 },
    categoryLabel: {
      ...t.type.label,
      color: t.colors.ink,
      marginBottom: t.spacing.s1,
    },
    categoryDescription: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s3,
    },
    channelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: t.spacing.s1,
      borderTopWidth: 1,
      borderTopColor: t.colors.borderSubtle,
    },
    channelLabelColumn: { flex: 1 },
    channelLabel: { ...t.type.bodySm, color: t.colors.ink },
    savingHint: { ...t.type.labelSm, color: t.colors.inkMuted },
    stretch: { alignSelf: 'stretch' },
  });
}
