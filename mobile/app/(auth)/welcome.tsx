/**
 * Hero welcome — premium first impression before marketing intro or login.
 */
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND } from '../../src/brand/constants';
import { BrandLogo } from '../../src/onboarding/marketing/components/BrandLogo';
import { HeroDeviceAnimation } from '../../src/onboarding/marketing/components/HeroDeviceAnimation';
import { useOnboardingLayout } from '../../src/onboarding/marketing/hooks/useOnboardingLayout';
import { Button, Screen } from '../../src/theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../src/theme/tokens';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fade = useSharedValue(0);
  const { headlineSize, subtitleSize, buttonSize, isCompact, isVeryCompact, heroHeight } =
    useOnboardingLayout();

  useEffect(() => {
    fade.value = withTiming(1, { duration: 700 });
  }, [fade]);

  const headerStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Screen scroll padded contentContainerStyle={styles.screenContent}>
      <Animated.View style={[styles.header, headerStyle]}>
        <BrandLogo size="hero" />
      </Animated.View>

      <View style={styles.hero}>
        <Text style={[styles.headline, { fontSize: headlineSize }]}>Protect what matters most.</Text>
        <Text style={[styles.tagline, { fontSize: isCompact ? typography.sizes.base : typography.sizes.lg }]}>
          Insurance and intelligent asset protection in one simple app.
        </Text>
        {!isVeryCompact ? (
          <Text style={[styles.supporting, { fontSize: subtitleSize }]}>
            Protect your valuable assets, manage your insurance and stay connected to the things that
            matter most — all from your phone.
          </Text>
        ) : null}
        <HeroDeviceAnimation height={heroHeight} inlineBadges={isCompact} />
      </View>

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Button variant="primary" fullWidth size={buttonSize} onPress={() => router.push('/(auth)/intro')}>
          Get started
        </Button>
        <Button variant="secondary" fullWidth size={buttonSize} onPress={() => router.push('/(auth)/login')}>
          I already have an account
        </Button>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Explore the app introduction first"
          onPress={() => router.push('/(auth)/intro')}
          style={styles.exploreBtn}
        >
          <Text style={styles.exploreText}>Explore first</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  hero: {
    flexShrink: 1,
    gap: spacing.xs,
  },
  headline: {
    fontWeight: '700',
    color: BRAND.primaryMid,
  },
  tagline: {
    fontWeight: '600',
    color: BRAND.secondary,
  },
  supporting: {
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.45,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  exploreBtn: {
    minHeight: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreText: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
