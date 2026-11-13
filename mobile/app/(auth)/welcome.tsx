/**
 * Hero welcome — premium first impression before marketing intro or login.
 * Restyled to the design system (R5.1): gradient Backdrop with the chevron
 * pattern, hero copy on a glass card, design Buttons. Navigation unchanged.
 */
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandLogo } from '../../src/onboarding/marketing/components/BrandLogo';
import { HeroDeviceAnimation } from '../../src/onboarding/marketing/components/HeroDeviceAnimation';
import { useOnboardingLayout } from '../../src/onboarding/marketing/hooks/useOnboardingLayout';
import { Button } from '../../src/design';
import { AuthCard, AuthHeading, AuthLink, AuthPage, AuthText } from '../../src/screens/auth/AuthScaffold';
import { useDesignTokens } from '../../src/theme/designTheme';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useDesignTokens();
  const fade = useSharedValue(0);
  const { isCompact, isVeryCompact, heroHeight } = useOnboardingLayout();

  useEffect(() => {
    fade.value = withTiming(1, { duration: t.motion.duration.entrance });
  }, [fade, t.motion.duration.entrance]);

  const headerStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <AuthPage pattern="chevron" scroll padded contentContainerStyle={[styles.screenContent, { paddingVertical: t.spacing.s4 }]}>
      <Animated.View style={[styles.header, { marginBottom: t.spacing.s4 }, headerStyle]}>
        <BrandLogo size="hero" showPlate={false} />
      </Animated.View>

      <View style={styles.hero}>
        <AuthCard variant="glass" radius="xl" testID="welcome-hero-card">
          <AuthHeading
            title="Protect what matters most."
            size={isCompact ? 'md' : 'lg'}
            subtitle="Insurance and intelligent asset protection in one simple app."
          />
          {!isVeryCompact ? (
            <AuthText small>
              Protect your valuable assets, manage your insurance and stay connected to the things that
              matter most — all from your phone.
            </AuthText>
          ) : null}
        </AuthCard>
        <HeroDeviceAnimation height={heroHeight} inlineBadges={isCompact} />
      </View>

      <AuthCard
        variant="glass"
        testID="welcome-actions-card"
        style={{ marginTop: t.spacing.s4, marginBottom: Math.max(insets.bottom, t.spacing.s3) }}
      >
        <Button label="Get started" onPress={() => router.push('/(auth)/intro')} />
        <Button
          variant="secondary"
          label="Log in"
          onPress={() => router.push('/(auth)/login')}
          style={{ marginTop: t.spacing.s3 }}
        />
        <AuthLink
          label="Explore first"
          accessibilityLabel="Explore the app introduction first"
          onPress={() => router.push('/(auth)/intro')}
        />
      </AuthCard>
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
  },
  hero: {
    flexShrink: 1,
    gap: 8,
  },
});
