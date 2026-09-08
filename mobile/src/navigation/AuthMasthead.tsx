import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrandLogo } from '../onboarding/marketing/components/BrandLogo';
import { useOnboardingLayout } from '../onboarding/marketing/hooks/useOnboardingLayout';
import { useColors } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

export interface AuthMastheadProps {
  title: string;
  subtitle?: string;
  /** Hairline before the form column. Default true. */
  showDivider?: boolean;
}

/**
 * Centered logo + screen title for auth form routes (login, signup, etc.).
 * Form fields stay left-aligned below the optional divider.
 */
export function AuthMasthead({ title, subtitle, showDivider = true }: AuthMastheadProps) {
  const colors = useColors();
  const { isVeryCompact } = useOnboardingLayout();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          alignItems: 'center',
          marginBottom: isVeryCompact ? spacing.md : spacing.lg,
        },
        title: {
          fontSize: typography.sizes['2xl'],
          fontWeight: '700',
          color: colors.textPrimary,
          textAlign: 'center',
          marginTop: spacing.lg,
        },
        subtitle: {
          fontSize: typography.sizes.base,
          color: colors.textSecondary,
          textAlign: 'center',
          lineHeight: typography.sizes.base * 1.4,
          marginTop: spacing.xs,
        },
        divider: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
          marginBottom: spacing.xl,
        },
      }),
    [colors, isVeryCompact],
  );

  return (
    <View>
      <View style={styles.wrap}>
        <BrandLogo size="hero" showPlate={false} />
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {showDivider ? (
        <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no" />
      ) : null}
    </View>
  );
}
