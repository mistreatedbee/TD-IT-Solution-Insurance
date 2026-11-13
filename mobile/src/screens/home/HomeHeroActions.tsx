import { useRouter, type Href } from 'expo-router';
import { MapPinIcon, PackagePlusIcon, ShieldAlertIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, GlassCard } from '../../design';
import { useDesignTokens } from '../../theme/designTheme';
import { useHomeStyles } from './homeStyles';

/**
 * Hero actions — R5.2. Report theft is the one primary action; everything else
 * is a glass button. Buttons carry their own fill, so they sit directly on the
 * ground (no card) and the old helper lines live on as accessibility hints.
 */
export function HomeHeroActions({
  showTheftReporting = true,
  theftReportingLocked = false,
  onReportTheft,
}: {
  showTheftReporting?: boolean;
  theftReportingLocked?: boolean;
  onReportTheft?: () => void;
}) {
  const router = useRouter();
  const t = useDesignTokens();
  const styles = useMemo(() => StyleSheet.create({ stack: { gap: t.spacing.s3 } }), [t]);

  function handleReportTheft() {
    if (onReportTheft) {
      onReportTheft();
      return;
    }
    router.push('/(app)/report-theft' as Href);
  }

  return (
    <View style={styles.stack}>
      {showTheftReporting ? (
        <Button
          variant="primary"
          label={theftReportingLocked ? 'Upgrade for theft' : 'Report theft'}
          accessibilityHint={theftReportingLocked ? 'Included from Plus plan' : 'Start recovery immediately'}
          icon={<ShieldAlertIcon size={20} color={t.colors.onActionPrimary} strokeWidth={1.75} />}
          onPress={handleReportTheft}
        />
      ) : null}
      <Button
        variant="glass"
        label="Add asset"
        accessibilityHint="Register a device or vehicle"
        icon={<PackagePlusIcon size={20} color={t.colors.ink} strokeWidth={1.75} />}
        onPress={() => router.push('/assets/register' as Href)}
      />
    </View>
  );
}

/** Secondary pair — map shortcut. */
export function HomeSecondaryActions({ hasMapPins }: { hasMapPins: boolean }) {
  const router = useRouter();
  const t = useDesignTokens();
  const home = useHomeStyles();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.s3, minHeight: 48 },
        copy: { flex: 1 },
      }),
    [t],
  );

  return (
    <GlassCard>
      <Pressable style={styles.row} accessibilityRole="button" onPress={() => router.push('/map' as Href)}>
        <View style={home.iconTileSm}>
          <MapPinIcon size={20} color={t.colors.ink} strokeWidth={1.75} />
        </View>
        <View style={styles.copy}>
          <Text style={home.title}>Live map</Text>
          <Text style={home.textBodySm}>
            {hasMapPins ? 'View last known locations' : 'Enable tracking to see pins'}
          </Text>
        </View>
      </Pressable>
    </GlassCard>
  );
}
