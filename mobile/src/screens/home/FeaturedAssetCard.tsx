import { useRouter, type Href } from 'expo-router';
import { ChevronRightIcon, PackageIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassCard, StatusBadge } from '../../design';
import { formatAssetType } from '../../lib/asset-labels';
import type { AssetTrackingView } from '../../tracking/types';
import { useDesignTokens } from '../../theme/designTheme';
import { assetStatusBadge } from './assetStatus';
import { AssetTypeImage } from './assetVisuals';
import { useHomeStyles } from './homeStyles';

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
  const t = useDesignTokens();
  const home = useHomeStyles();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        emptyRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.s4 },
        emptyCopy: { flex: 1 },
        emptyTitle: { ...t.type.displayMd, color: t.colors.ink },
        emptyBody: { ...t.type.body, color: t.colors.inkMuted, marginTop: t.spacing.s2, marginBottom: t.spacing.s3 },
        ctaRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.s1, minHeight: 48 },
        ctaText: { ...t.type.label, color: t.colors.link },
        titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.s3, marginBottom: t.spacing.s3 },
        titleCopy: { flex: 1 },
        assetName: { ...t.type.title, color: t.colors.ink },
        assetMeta: { ...t.type.bodySm, color: t.colors.inkMuted, marginTop: 2 },
        stateLine: { ...t.type.label, color: t.colors.inkMuted },
        statusWrap: { marginBottom: t.spacing.s4 },
        steps: { flexDirection: 'row', gap: t.spacing.s3, marginBottom: t.spacing.s2 },
        stepItem: { alignItems: 'center', flex: 1 },
        stepTrack: {
          flexDirection: 'row',
          alignItems: 'center',
          width: '100%',
          justifyContent: 'center',
          marginBottom: t.spacing.s1,
        },
        stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.colors.borderControl },
        stepDotDone: { backgroundColor: t.colors.success },
        stepLine: {
          position: 'absolute',
          left: '55%',
          right: '-45%',
          height: 2,
          backgroundColor: t.colors.borderControl,
          top: 4,
        },
        stepLineDone: { backgroundColor: t.colors.success },
        stepLabel: { ...t.type.labelSm, color: t.colors.inkMuted, textAlign: 'center', textTransform: 'uppercase' },
        stepLabelDone: { color: t.colors.ink },
        location: { ...t.type.bodySm, color: t.colors.inkMuted },
      }),
    [t],
  );

  if (!item) {
    return (
      <Pressable accessibilityRole="button" onPress={onAddAsset}>
        <GlassCard radius="xl">
          <View style={styles.emptyRow}>
          <View style={styles.emptyCopy}>
            <Text style={home.eyebrow}>Current protection</Text>
            <Text style={styles.emptyTitle} accessibilityRole="header">
              No assets registered yet
            </Text>
            <Text style={styles.emptyBody}>
              Add your first device or vehicle to start building your protection vault.
            </Text>
            <View style={styles.ctaRow}>
              <Text style={styles.ctaText}>Add your first asset</Text>
              <ChevronRightIcon size={20} color={t.colors.link} strokeWidth={1.75} />
            </View>
          </View>
          <View style={home.iconTile}>
            <PackageIcon size={24} color={t.colors.ink} strokeWidth={1.75} />
          </View>
          </View>
        </GlassCard>
      </Pressable>
    );
  }

  const steps = protectionSteps(item);
  const status = assetStatusBadge(item);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.displayName}, ${item.trackingLabel}`}
      onPress={() => router.push(`/(app)/assets/${item.assetId}` as Href)}
    >
      <GlassCard radius="xl">
        <Text style={home.eyebrow}>Current protection</Text>
        <View style={styles.titleRow}>
          <AssetTypeImage assetType={item.assetType} size="md" />
          <View style={styles.titleCopy}>
            <Text style={styles.assetName} numberOfLines={1}>
              {item.displayName}
            </Text>
            <Text style={styles.assetMeta}>{formatAssetType(item.assetType)}</Text>
          </View>
        </View>

        <View style={styles.statusWrap}>
          {status ? <StatusBadge status={status} /> : <Text style={styles.stateLine}>{item.trackingLabel}</Text>}
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
              <Text style={[styles.stepLabel, step.done ? styles.stepLabelDone : null]}>{step.label}</Text>
            </View>
          ))}
        </View>

        {item.locationLabel ? <Text style={styles.location}>Updated {item.locationLabel}</Text> : null}
      </GlassCard>
    </Pressable>
  );
}
