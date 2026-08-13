/**
 * ui-design.md §4.1 Screen A — Welcome / Landing.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Button, Screen } from '../../src/theme/primitives';
import { colors, spacing, typography } from '../../src/theme/tokens';

const logo = require('../../assets/icon.png');

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <Screen scroll={false}>
      <View style={styles.top}>
        <Image
          accessibilityLabel="TD IT Solution Insurance"
          source={logo}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.middle}>
        <Text style={styles.headline}>Insurance that helps you get your stuff back</Text>
        <Text style={styles.subhead}>
          Register vehicles, laptops, phones and business equipment. Manage your policy and report
          theft — with GPS-assisted recovery when hardware is paired.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          variant="primary"
          fullWidth
          size="lg"
          onPress={() => router.push('/(auth)/get-started')}
        >
          Get Started
        </Button>
        <Button
          variant="tertiary"
          fullWidth
          onPress={() => router.push('/(auth)/login')}
        >
          Log in
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingTop: spacing.xl,
    alignItems: 'center',
  },
  logo: {
    width: 280,
    height: 180,
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  headline: {
    fontSize: typography.sizes['3xl'],
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subhead: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
  },
  actions: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
});
