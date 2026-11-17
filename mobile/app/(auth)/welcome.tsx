/**
 * Hero welcome — premium first impression before marketing intro or login.
 * Restyled to the design system (R5.1): gradient Backdrop with the chevron
 * pattern, hero copy on a glass card, design Buttons. Navigation unchanged.
 */
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProtectionMapHero } from '../../src/onboarding/marketing/components/ProtectionMapHero';
import { useOnboardingLayout } from '../../src/onboarding/marketing/hooks/useOnboardingLayout';
import { Button } from '../../src/design';
import {
  AuthCard,
  AuthHeading,
  AuthLink,
  AuthPage,
  AuthText,
} from '../../src/screens/auth/AuthScaffold';
import { useDesignTokens } from '../../src/theme/designTheme';

const MAX_MAP_HEIGHT = 480;

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useDesignTokens();
  const { isCompact, isVeryCompact, heroHeight } = useOnboardingLayout();
  // The map takes all the space left between the two cards (capped so it stays in proportion), so nothing overflows.
  const [freeHeight, setFreeHeight] = useState<number | null>(null);
  const animationHeight =
    freeHeight == null
      ? heroHeight
      : Math.max(0, Math.min(MAX_MAP_HEIGHT, freeHeight - t.spacing.s2));

  // iPhone: sit just above the home indicator. Android: always clear the system navigation bar (three buttons or
  // gesture bar) by its full height, so the card is never covered.
  const bottomPadding =
    Platform.OS === 'ios'
      ? Math.max(insets.bottom - 14, t.spacing.s2)
      : insets.bottom + t.spacing.s3;

  return (
    <AuthPage
      pattern="chevron"
      scroll={false}
      padded={false}
      // Only the top inset comes from the page; the bottom is handled below so it can differ per platform.
      safeAreaEdges={['top']}
      contentContainerStyle={[
        styles.screenContent,
        {
          paddingHorizontal: t.spacing.s4,
          paddingTop: t.spacing.s4,
          paddingBottom: bottomPadding,
          gap: t.spacing.s4,
        },
      ]}
    >
      <View style={styles.hero}>
        <AuthCard variant="glass" radius="xl" testID="welcome-hero-card">
          <AuthHeading
            title="Protect what matters most."
            size={isCompact ? 'md' : 'lg'}
            subtitle="Insurance and intelligent asset protection in one simple app."
          />
          {!isVeryCompact ? (
            <AuthText small>
              Protect your valuable assets, manage your insurance and stay
              connected to the things that matter most — all from your phone.
            </AuthText>
          ) : null}
        </AuthCard>
      </View>

      <View
        style={styles.animationSlot}
        onLayout={(e) => setFreeHeight(e.nativeEvent.layout.height)}
      >
        {animationHeight > 150 ? (
          <ProtectionMapHero height={animationHeight} />
        ) : null}
      </View>

      <AuthCard variant="glass" testID="welcome-actions-card">
        <Button
          label="Get started"
          onPress={() => router.push('/(auth)/intro')}
        />
        <Button
          variant="secondary"
          label="Log in"
          onPress={() => router.push('/(auth)/login')}
          style={{ marginTop: t.spacing.s2 }}
        />
        <AuthLink
          compact
          // pull the link toward the card's bottom edge so there is less empty space under it
          style={{ marginBottom: -t.spacing.s3 }}
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
    flex: 1,
  },
  hero: {
    flexShrink: 0,
  },
  animationSlot: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
