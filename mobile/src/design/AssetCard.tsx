import { Briefcase, Car, Laptop, Monitor, Package, Smartphone, Tablet, Tv, type LucideIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useDesignTokens } from '../theme/designTheme';
import { GlassCard } from './GlassCard';
import { usePressScale } from './hooks';
import { StatusBadge, type StatusBadgeStatus } from './StatusBadge';

/**
 * The reference spec names laptop/car/smartphone/tv; the extra four cover the
 * remaining API asset types (R5.2, additive — pending design-system-manager sign-off).
 */
export type AssetCardType =
  | 'laptop'
  | 'car'
  | 'smartphone'
  | 'tv'
  | 'tablet'
  | 'desktop'
  | 'business_equipment'
  | 'other_electronics';

const TYPE_ICON: Record<AssetCardType, LucideIcon> = {
  laptop: Laptop,
  car: Car,
  smartphone: Smartphone,
  tv: Tv,
  tablet: Tablet,
  desktop: Monitor,
  business_equipment: Briefcase,
  other_electronics: Package,
};

/** Lists show only the last four characters of a serial/ID/registration. */
export function maskIdentifier(value: string): string {
  const v = value.trim();
  if (!v) return '';
  const tail = v.slice(-4);
  return v.length <= 4 ? tail : `•••• ${tail}`;
}

export interface AssetCardProps {
  type: AssetCardType;
  name: string;
  /** Raw serial or registration; masked here, never rendered in full. Empty hides the line. */
  identifier: string;
  /** Fixed vocabulary only; pass null when no word is honest and no badge renders. */
  status: StatusBadgeStatus | null;
  /** Last-seen or case line; for open cases name the next step. */
  footer: string;
  onPress?: () => void;
  testID?: string;
}

export function AssetCard({ type, name, identifier, status, footer, onPress, testID }: AssetCardProps) {
  const t = useDesignTokens();
  const press = usePressScale();
  const [focused, setFocused] = useState(false);
  const Icon = TYPE_ICON[type];
  const masked = maskIdentifier(identifier);

  return (
    <Animated.View style={{ transform: [{ scale: press.scale }] }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${masked ? `identifier ending ${identifier.trim().slice(-4)}, ` : ''}${status ? `${status.toLowerCase()}. ` : ''}${footer}`}
        onPress={onPress}
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
            <View
              style={[styles.iconWrap, { backgroundColor: t.colors.bgSunken, borderRadius: t.radius.md, marginRight: t.spacing.s3 }]}
            >
              <Icon size={24} strokeWidth={1.75} color={t.colors.ink} />
            </View>
            <View style={styles.flex}>
              <Text style={[t.type.title, { color: t.colors.ink }]} numberOfLines={1}>
                {name}
              </Text>
              {masked ? (
                <Text testID="asset-identifier" style={[t.type.bodySm, { color: t.colors.inkMuted }]}>
                  {masked}
                </Text>
              ) : null}
            </View>
          </View>
          {status ? (
            <View style={{ marginTop: t.spacing.s3 }}>
              <StatusBadge status={status} />
            </View>
          ) : null}
          <Text style={[t.type.bodySm, { color: t.colors.inkMuted, marginTop: t.spacing.s3 }]}>{footer}</Text>
        </GlassCard>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  iconWrap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
