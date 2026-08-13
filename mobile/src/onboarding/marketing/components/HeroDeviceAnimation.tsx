import { CheckIcon, ShieldCheckIcon, SmartphoneIcon } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { BRAND } from '../../../brand/constants';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

const BADGES = [
  { label: 'Protected', icon: ShieldCheckIcon },
  { label: 'Insured', icon: CheckIcon },
  { label: 'Connected', icon: CheckIcon },
] as const;

interface HeroDeviceAnimationProps {
  height?: number;
  /** On compact screens, show badges in a row instead of floating over the card. */
  inlineBadges?: boolean;
}

export function HeroDeviceAnimation({ height = 220, inlineBadges = false }: HeroDeviceAnimationProps) {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    cardOpacity.value = withTiming(1, { duration: reducedMotion ? 0 : 600 });
    if (!reducedMotion) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    }
  }, [cardOpacity, pulse, reducedMotion]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + pulse.value * 0.2,
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: (1 - cardOpacity.value) * 8 }],
  }));

  return (
    <View
      style={[styles.container, { height, marginVertical: spacing.sm }]}
      accessibilityLabel="Asset protection illustration"
    >
      <Animated.View style={[styles.pulseRing, ringStyle, { width: height * 0.75, height: height * 0.75, borderRadius: height * 0.375 }]} />
      <Animated.View style={[styles.deviceCard, cardStyle]}>
        <View style={styles.deviceIconWrap}>
          <SmartphoneIcon size={28} color={BRAND.secondary} strokeWidth={1.5} />
        </View>
        <Text style={styles.deviceTitle}>MacBook Pro</Text>
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Protected</Text>
        </View>
        <Text style={styles.meta}>Insurance active</Text>
      </Animated.View>

      {inlineBadges ? (
        <View style={styles.inlineBadges}>
          {BADGES.map(({ label, icon: Icon }) => (
            <View key={label} style={styles.inlineBadge}>
              <Icon size={11} color={BRAND.accent} strokeWidth={2.5} />
              <Text style={styles.badgeText}>{label}</Text>
            </View>
          ))}
        </View>
      ) : (
        BADGES.map((badge, index) => (
          <FloatingBadge key={badge.label} index={index} label={badge.label} Icon={badge.icon} reduced={reducedMotion} containerHeight={height} />
        ))
      )}
    </View>
  );
}

function FloatingBadge({
  index,
  label,
  Icon,
  reduced,
  containerHeight,
}: {
  index: number;
  label: string;
  Icon: typeof ShieldCheckIcon;
  reduced: boolean;
  containerHeight: number;
}) {
  const float = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    float.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200 + index * 200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2200 + index * 200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [float, index, reduced]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: reduced ? 0 : float.value * -3 }],
  }));

  const positions = [
    { top: containerHeight * 0.08 },
    { top: containerHeight * 0.42, left: 4 },
    { top: containerHeight * 0.36, right: 4 },
  ] as const;

  return (
    <Animated.View style={[styles.badge, positions[index], style]}>
      <Icon size={11} color={BRAND.accent} strokeWidth={2.5} />
      <Text style={styles.badgeText}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  pulseRing: {
    position: 'absolute',
    backgroundColor: BRAND.secondary,
  },
  deviceCard: {
    width: 148,
    backgroundColor: colors.background,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    shadowColor: BRAND.primary,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    alignItems: 'center',
  },
  deviceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.tones.info.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  deviceTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  statusText: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.success,
  },
  meta: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  inlineBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    width: '100%',
  },
  inlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: BRAND.primaryMid,
  },
});
