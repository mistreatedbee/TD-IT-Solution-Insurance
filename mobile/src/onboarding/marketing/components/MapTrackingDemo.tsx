import { BatteryMediumIcon, CarIcon, MapPinIcon, SignalIcon } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { BRAND } from '../../../brand/constants';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { DemoBadge } from './DemoBadge';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

export function MapTrackingDemo() {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 1200 }), withTiming(0, { duration: 1200 })),
      -1,
      false,
    );
  }, [pulse, reduced]);

  const markerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : 1 + pulse.value * 0.15 }],
  }));

  return (
    <View>
      <DemoBadge />
      <View style={styles.map}>
        <View style={styles.gridLineH} />
        <View style={styles.gridLineV} />
        <Animated.View style={[styles.markerWrap, markerStyle]}>
          <View style={styles.marker}>
            <MapPinIcon size={20} color={colors.textInverse} />
          </View>
        </Animated.View>
        <View style={styles.assetCard}>
          <View style={styles.assetHeader}>
            <CarIcon size={18} color={BRAND.secondary} />
            <Text style={styles.assetTitle}>My Vehicle</Text>
          </View>
          <Text style={styles.updated}>Last updated: recently</Text>
          <View style={styles.metrics}>
            <Metric icon={BatteryMediumIcon} label="Battery" value="82%" />
            <Metric icon={SignalIcon} label="Signal" value="Strong" />
            <Metric icon={MapPinIcon} label="Tracking" value="Active" />
          </View>
        </View>
      </View>
      <Text style={styles.disclaimer}>
        Track compatible insured assets with an assigned tracking device. Location depends on device
        connectivity and GPS or network availability.
      </Text>
    </View>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BatteryMediumIcon;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Icon size={14} color={colors.textSecondary} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 220,
    backgroundColor: '#E8F0F8',
    borderRadius: radius.cardLg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  gridLineH: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(39,128,184,0.15)',
  },
  gridLineV: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(39,128,184,0.15)',
  },
  markerWrap: {
    position: 'absolute',
    top: '38%',
    left: '52%',
    marginLeft: -18,
    marginTop: -36,
  },
  marker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  assetCard: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  assetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  assetTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  updated: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metric: { alignItems: 'center', flex: 1 },
  metricLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  metricValue: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  disclaimer: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    lineHeight: typography.sizes.xs * 1.5,
  },
});
