import { useRouter, type Href } from 'expo-router';
import { MapPinIcon, PackagePlusIcon, ShieldAlertIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { homeShadow } from './homeStyles';

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

  function handleReportTheft() {
    if (onReportTheft) {
      onReportTheft();
      return;
    }
    router.push('/(app)/report-theft' as Href);
  }

  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.card, styles.cardWarm]}
        accessibilityRole="button"
        onPress={() => router.push('/(app)/assets/register' as Href)}
      >
        <View style={[styles.iconWrap, styles.iconWarm]}>
          <PackagePlusIcon size={26} color={colors.accentGoldDeep} strokeWidth={2.2} />
        </View>
        <Text style={styles.title}>Add asset</Text>
        <Text style={styles.body}>Register a device or vehicle</Text>
      </Pressable>

      {showTheftReporting ? (
        <Pressable
          style={[styles.card, theftReportingLocked ? styles.cardWarm : styles.cardCool]}
          accessibilityRole="button"
          onPress={handleReportTheft}
        >
          <View style={[styles.iconWrap, theftReportingLocked ? styles.iconWarm : styles.iconCool]}>
            <ShieldAlertIcon
              size={26}
              color={theftReportingLocked ? colors.accentGoldDeep : colors.textInverse}
              strokeWidth={2.2}
            />
          </View>
          <Text style={[styles.title, theftReportingLocked ? undefined : styles.titleOnDark]}>
            {theftReportingLocked ? 'Upgrade for theft reporting' : 'Report theft'}
          </Text>
          <Text style={[styles.body, theftReportingLocked ? undefined : styles.bodyOnDark]}>
            {theftReportingLocked
              ? 'Included from the Plus plan'
              : 'Start recovery immediately'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Secondary pair — map + alerts shortcuts. */
export function HomeSecondaryActions({ hasMapPins }: { hasMapPins: boolean }) {
  const router = useRouter();

  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.cardSmall, styles.cardCool]}
        accessibilityRole="button"
        onPress={() => router.push('/(app)/map' as Href)}
      >
        <View style={[styles.iconWrapSmall, styles.iconCool]}>
          <MapPinIcon size={20} color={colors.primary} strokeWidth={2.2} />
        </View>
        <View style={styles.smallCopy}>
          <Text style={styles.smallTitle}>Live map</Text>
          <Text style={styles.smallBody}>
            {hasMapPins ? 'View last known locations' : 'Enable tracking to see pins'}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  card: {
    flex: 1,
    borderRadius: radius.cardLg,
    padding: spacing.lg,
    minHeight: 128,
    ...homeShadow,
  },
  cardWarm: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  cardCool: {
    backgroundColor: colors.primary,
    borderWidth: 0,
  },
  cardSmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.card,
    padding: spacing.md,
    ...homeShadow,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconWarm: {
    backgroundColor: colors.accentGoldTint,
  },
  iconCool: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  iconWrapSmall: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  titleOnDark: {
    color: colors.textInverse,
  },
  body: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    lineHeight: typography.sizes.xs * 1.45,
  },
  bodyOnDark: {
    color: 'rgba(255,255,255,0.78)',
  },
  smallCopy: {
    flex: 1,
  },
  smallTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  smallBody: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
