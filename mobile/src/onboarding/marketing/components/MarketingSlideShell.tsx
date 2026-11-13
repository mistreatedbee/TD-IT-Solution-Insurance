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
import { Button, GlassCard } from '../../../design';
import { useDesignTokens } from '../../../theme/designTheme';
import { spacing } from '../../../theme/tokens';
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
}

/**
 * One marketing slide: title + subtitle on a glass card (never on the ground),
 * slide content below, optional footer CTA (design Button, 48dp).
 */
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
}: MarketingSlideShellProps) {
  const insets = useSafeAreaInsets();
  const t = useDesignTokens();
  const { isCompact } = useOnboardingLayout();

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, contentStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <GlassCard radius="xl" style={{ marginBottom: spacing.sm }}>
          <Text
            accessibilityRole="header"
            style={[isCompact ? t.type.title : t.type.displayMd, { color: t.colors.ink }, titleStyle]}
          >
            {title}
          </Text>
          <Text style={[t.type.body, { color: t.colors.inkMuted, marginTop: t.spacing.s2 }]}>{subtitle}</Text>
          {inlineActions ? <View style={[styles.inlineActions, { marginTop: t.spacing.s6 }]}>{inlineActions}</View> : null}
        </GlassCard>
        {children}
      </ScrollView>

      {!footerHidden && footerLabel && onFooterPress ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button label={footerLabel} onPress={onFooterPress} />
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
  inlineActions: {
    gap: spacing.sm,
  },
  footer: {
    paddingTop: spacing.sm,
  },
});
