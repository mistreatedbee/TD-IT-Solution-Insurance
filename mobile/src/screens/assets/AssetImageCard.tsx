/**
 * Asset list card for the Protection vault (R5.3): the design GlassCard, StatusBadge and tokens, with the
 * asset's own picture (AssetTypeImage) kept. The design AssetCard shows a small line icon only; that dropped
 * the pictures customers recognise their items by, so the vault uses this card instead. Home still uses
 * the icon card. Same fixed badge vocabulary and footer line as home (src/screens/home/assetStatus.ts).
 */
import { useRouter, type Href } from 'expo-router';
import { ChevronRightIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassCard, StatusBadge } from '../../design';
import { usePressScale } from '../../design/hooks';
import { formatAssetType } from '../../lib/asset-labels';
import { useDesignTokens } from '../../theme/designTheme';
import type { AssetTrackingView } from '../../tracking/types';
import { assetFooterLine, assetStatusBadge } from '../home/assetStatus';
import { AssetTypeImage } from '../home/assetVisuals';

export function AssetImageCard({ item }: { item: AssetTrackingView }) {
  const router = useRouter();
  const t = useDesignTokens();
  const press = usePressScale();
  const [focused, setFocused] = useState(false);
  const status = assetStatusBadge(item);
  const footer = assetFooterLine(item);

  return (
    <Animated.View style={{ transform: [{ scale: press.scale }] }}>
      <Pressable
        testID={`asset-preview-${item.assetId}`}
        accessibilityRole="button"
        accessibilityLabel={`${item.displayName}, ${formatAssetType(item.assetType)}, ${status ? `${status.toLowerCase()}. ` : ''}${footer}`}
        onPress={() => router.push(`/(app)/assets/${item.assetId}` as Href)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          { borderRadius: t.radius.lg },
          focused && { outlineColor: t.colors.focusRing, outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' },
        ]}
      >
        <GlassCard>
          <View style={styles.row}>
            <AssetTypeImage assetType={item.assetType} size="md" />
            <View style={[styles.body, { marginLeft: t.spacing.s3 }]}>
              <Text style={[t.type.title, { color: t.colors.ink }]} numberOfLines={1}>
                {item.displayName}
              </Text>
              <Text style={[t.type.bodySm, { color: t.colors.inkMuted }]} numberOfLines={1}>
                {formatAssetType(item.assetType)}
              </Text>
              {status ? (
                <View style={[styles.badge, { marginTop: t.spacing.s2 }]}>
                  <StatusBadge status={status} />
                </View>
              ) : null}
            </View>
            <ChevronRightIcon size={20} color={t.colors.inkMuted} />
          </View>
          <Text style={[t.type.bodySm, { color: t.colors.inkMuted, marginTop: t.spacing.s3 }]}>{footer}</Text>
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1, minWidth: 0 },
  badge: { alignSelf: 'flex-start' },
});
