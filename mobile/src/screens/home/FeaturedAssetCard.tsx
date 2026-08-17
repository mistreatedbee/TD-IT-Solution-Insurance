import { useRouter, type Href } from 'expo-router';
import { ChevronRightIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatAssetType } from '../../lib/asset-labels';
import type { AssetTrackingView } from '../../tracking/types';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { AssetHeroImage, AssetTypeImage } from './assetVisuals';
import { homeShadow, homeStyles } from './homeStyles';

function protectionSteps(item: AssetTrackingView): { label: string; done: boolean }[] {
  const tracked =
    item.trackingStatus === 'online' ||
    item.trackingStatus === 'last_known' ||
    item.trackingStatus === 'offline';
  return [
    { label: 'Registered', done: true },
    { label: 'Tracked', done: tracked },
    { label: 'Protected', done: item.trackingStatus === 'online' || item.trackingStatus === 'last_known' },
  ];
}

export interface FeaturedAssetCardProps {
  item: AssetTrackingView | null;
  onAddAsset: () => void;
}

export function FeaturedAssetCard({ item, onAddAsset }: FeaturedAssetCardProps) {
  const router = useRouter();

  if (!item) {
    return (
      <Pressable
        style={[styles.card, styles.emptyCard]}
        accessibilityRole="button"
        onPress={onAddAsset}
      >
        <View style={styles.emptyCopy}>
          <Text style={styles.sectionLabel}>Current protection</Text>
          <Text style={styles.emptyTitle}>No assets registered yet</Text>
          <Text style={styles.emptyBody}>
            Add your first device or vehicle to start building your protection vault.
          </Text>
          <View style={styles.ctaRow}>
            <Text style={styles.ctaText}>Add your first asset</Text>
            <ChevronRightIcon size={18} color={colors.accentGoldDeep} />
          </View>
        </View>
        <AssetHeroImage assetType="other_electronics" />
      </Pressable>
    );
  }

  const steps = protectionSteps(item);
  const pillStyle =
    item.trackingStatus === 'online'
      ? homeStyles.pillSuccess
      : item.trackingStatus === 'last_known' || item.trackingStatus === 'offline'
        ? homeStyles.pillWarning
        : null;
  const pillTextStyle =
    item.trackingStatus === 'online'
      ? homeStyles.pillSuccessText
      : item.trackingStatus === 'last_known' || item.trackingStatus === 'offline'
        ? homeStyles.pillWarningText
        : null;

  return (
    <Pressable
      style={styles.card}
      accessibilityRole="button"
      onPress={() => router.push(`/(app)/assets/${item.assetId}` as Href)}
    >
      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Current protection</Text>
        <View style={styles.titleRow}>
          <AssetTypeImage assetType={item.assetType} size="sm" />
          <View style={styles.titleCopy}>
            <Text style={styles.assetName} numberOfLines={1}>
              {item.displayName}
            </Text>
            <Text style={styles.assetMeta}>{formatAssetType(item.assetType)}</Text>
          </View>
        </View>

        <View style={[homeStyles.pill, pillStyle, styles.statusPill]}>
          <Text style={[homeStyles.pillText, pillTextStyle]}>{item.trackingLabel}</Text>
        </View>

        <View style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step.label} style={styles.stepItem}>
              <View style={styles.stepTrack}>
                <View style={[styles.stepDot, step.done ? styles.stepDotDone : null]} />
                {index < steps.length - 1 ? (
                  <View style={[styles.stepLine, step.done ? styles.stepLineDone : null]} />
                ) : null}
              </View>
              <Text style={[styles.stepLabel, step.done ? styles.stepLabelDone : null]}>
                {step.label}
              </Text>
            </View>
          ))}
        </View>

        {item.locationLabel ? (
          <Text style={styles.location}>Updated {item.locationLabel}</Text>
        ) : null}
      </View>

      <View style={styles.decorWrap}>
        <AssetHeroImage assetType={item.assetType} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    minHeight: 168,
    ...homeShadow,
  },
  emptyCard: {
    backgroundColor: colors.card,
    alignItems: 'center',
    padding: spacing.lg,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    paddingRight: spacing.sm,
  },
  emptyCopy: {
    flex: 1,
    paddingRight: spacing.md,
  },
  sectionLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  titleCopy: {
    flex: 1,
  },
  assetName: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  assetMeta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    marginBottom: spacing.md,
  },
  steps: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
  },
  stepTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.slate[300],
  },
  stepDotDone: {
    backgroundColor: colors.accentGold,
  },
  stepLine: {
    position: 'absolute',
    left: '55%',
    right: '-45%',
    height: 2,
    backgroundColor: colors.slate[300],
    top: 4,
  },
  stepLineDone: {
    backgroundColor: colors.accentGold,
  },
  stepLabel: {
    fontSize: 10,
    color: colors.slate[500],
    fontWeight: '600',
    textAlign: 'center',
  },
  stepLabelDone: {
    color: colors.textPrimary,
  },
  location: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  decorWrap: {
    justifyContent: 'center',
    paddingRight: spacing.sm,
    overflow: 'hidden',
  },
  emptyTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyBody: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.45,
    marginBottom: spacing.md,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ctaText: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.accentGoldDeep,
  },
});
