import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrandLogo } from '../onboarding/marketing/components/BrandLogo';
import { useOnboardingLayout } from '../onboarding/marketing/hooks/useOnboardingLayout';
import { useDesignTokens } from '../theme/designTheme';

export interface AuthMastheadProps {
  title: string;
  subtitle?: string;
  /** Hairline before the form column. Default true. */
  showDivider?: boolean;
}

/**
 * Centered logo + screen title for auth form routes (login, signup, etc.).
 * Title is display-md in the slab face; subtitle is body in the sans face
 * (Design System rollout R5.1). Callers place it on a card — never on the ground.
 */
export function AuthMasthead({ title, subtitle, showDivider = true }: AuthMastheadProps) {
  const t = useDesignTokens();
  const { isVeryCompact } = useOnboardingLayout();

  return (
    <View>
      <View style={[styles.wrap, { marginBottom: isVeryCompact ? t.spacing.s3 : t.spacing.s4 }]}>
        <BrandLogo size="auth" showPlate={false} />
        <Text
          accessibilityRole="header"
          style={[t.type.displayMd, { color: t.colors.ink, textAlign: 'center', marginTop: t.spacing.s4 }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[t.type.body, { color: t.colors.inkMuted, textAlign: 'center', marginTop: t.spacing.s1 }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {showDivider ? (
        <View
          style={[styles.divider, { borderBottomColor: t.colors.borderSubtle, marginBottom: t.spacing.s5 }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
});
