import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, type ButtonSize } from '../../../theme/primitives';
import { colors, spacing, typography } from '../../../theme/tokens';
import { useOnboardingLayout } from '../hooks/useOnboardingLayout';

interface MarketingSlideShellProps {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
  footerLabel?: string;
  onFooterPress?: () => void;
  footerHidden?: boolean;
  /** Inline actions rendered inside scroll area (e.g. account gate). */
  inlineActions?: React.ReactNode;
  titleStyle?: StyleProp<TextStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  buttonSize?: ButtonSize;
}

export function MarketingSlideShell({
  title,
  subtitle,
  children,
  footerLabel,
  onFooterPress,
  footerHidden = false,
  inlineActions,
  titleStyle,
  contentStyle,
  buttonSize,
}: MarketingSlideShellProps) {
  const insets = useSafeAreaInsets();
  const { titleSize, subtitleSize, buttonSize: layoutButtonSize } = useOnboardingLayout();
  const ctaSize = buttonSize ?? layoutButtonSize;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <Text style={[styles.title, { fontSize: titleSize }, titleStyle]}>{title}</Text>
        <Text style={[styles.subtitle, { fontSize: subtitleSize }]}>{subtitle}</Text>
        {children}
        {inlineActions ? <View style={styles.inlineActions}>{inlineActions}</View> : null}
      </ScrollView>

      {!footerHidden && footerLabel && onFooterPress ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button size={ctaSize} fullWidth onPress={onFooterPress}>
            {footerLabel}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  title: {
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginBottom: spacing.sm,
  },
  inlineActions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  footer: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
