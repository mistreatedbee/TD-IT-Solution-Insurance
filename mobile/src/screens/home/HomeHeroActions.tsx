import { useRouter, type Href } from 'expo-router';
import { MapPinIcon, PackagePlusIcon, ShieldAlertIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SurfaceGroup } from '../../components/SurfaceGroup';
import { useColors } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';

function useHeroActionStyles() {
  const colors = useColors();
  return useMemo(
    () =>
      StyleSheet.create({
        group: {
          flexDirection: 'row',
        },
        cell: {
          flex: 1,
          padding: spacing.lg,
          minHeight: 120,
          alignItems: 'flex-start',
        },
        cellRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        },
        columnDivider: {
          width: StyleSheet.hairlineWidth,
          backgroundColor: colors.hairline,
          marginVertical: spacing.md,
        },
        iconWrap: {
          width: 48,
          height: 48,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.sm,
        },
        iconAccent: {
          backgroundColor: colors.accentGoldTint,
        },
        iconNeutral: {
          backgroundColor: colors.slate[100],
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
        body: {
          fontSize: typography.sizes.xs,
          color: colors.textSecondary,
          lineHeight: typography.sizes.xs * 1.45,
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
      }),
    [colors],
  );
}

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
  const colors = useColors();
  const styles = useHeroActionStyles();

  function handleReportTheft() {
    if (onReportTheft) {
      onReportTheft();
      return;
    }
    router.push('/(app)/report-theft' as Href);
  }

  return (
    <SurfaceGroup style={styles.group}>
      <Pressable
        style={styles.cell}
        accessibilityRole="button"
        onPress={() => router.push('/assets/register' as Href)}
      >
        <View style={[styles.iconWrap, styles.iconAccent]}>
          <PackagePlusIcon size={24} color={colors.accentGoldDeep} strokeWidth={2.2} />
        </View>
        <Text style={styles.title}>Add asset</Text>
        <Text style={styles.body}>Register a device or vehicle</Text>
      </Pressable>

      {showTheftReporting ? (
        <>
          <View style={styles.columnDivider} />
          <Pressable
            style={styles.cell}
            accessibilityRole="button"
            onPress={handleReportTheft}
          >
            <View
              style={[
                styles.iconWrap,
                theftReportingLocked ? styles.iconAccent : styles.iconNeutral,
              ]}
            >
              <ShieldAlertIcon
                size={24}
                color={theftReportingLocked ? colors.accentGoldDeep : colors.primary}
                strokeWidth={2.2}
              />
            </View>
            <Text style={styles.title}>
              {theftReportingLocked ? 'Upgrade for theft' : 'Report theft'}
            </Text>
            <Text style={styles.body}>
              {theftReportingLocked
                ? 'Included from Plus plan'
                : 'Start recovery immediately'}
            </Text>
          </Pressable>
        </>
      ) : null}
    </SurfaceGroup>
  );
}

/** Secondary pair — map + alerts shortcuts. */
export function HomeSecondaryActions({ hasMapPins }: { hasMapPins: boolean }) {
  const router = useRouter();
  const colors = useColors();
  const styles = useHeroActionStyles();

  return (
    <SurfaceGroup style={styles.group}>
      <Pressable
        style={[styles.cell, styles.cellRow]}
        accessibilityRole="button"
        onPress={() => router.push('/map' as Href)}
      >
        <View style={[styles.iconWrapSmall, styles.iconNeutral]}>
          <MapPinIcon size={20} color={colors.primary} strokeWidth={2.2} />
        </View>
        <View style={styles.smallCopy}>
          <Text style={styles.smallTitle}>Live map</Text>
          <Text style={styles.smallBody}>
            {hasMapPins ? 'View last known locations' : 'Enable tracking to see pins'}
          </Text>
        </View>
      </Pressable>
    </SurfaceGroup>
  );
}
