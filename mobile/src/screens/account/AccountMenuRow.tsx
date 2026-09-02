import { ChevronRightIcon, type LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, minTouchTarget, spacing, typography } from '../../theme/tokens';

export interface AccountMenuRowProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  iconColor?: string;
  titleColor?: string;
  showChevron?: boolean;
  isLast?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

export function AccountMenuRow({
  icon: Icon,
  title,
  subtitle,
  iconColor = colors.primary,
  titleColor = colors.textPrimary,
  showChevron = true,
  isLast = false,
  disabled = false,
  onPress,
}: AccountMenuRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[styles.row, isLast ? styles.rowLast : null, disabled ? styles.rowDisabled : null]}
    >
      <View style={styles.iconWrap}>
        <Icon size={18} color={iconColor} strokeWidth={2.2} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {showChevron && onPress ? (
        <ChevronRightIcon size={18} color={colors.slate[400]} strokeWidth={2.2} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: minTouchTarget + spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowDisabled: {
    opacity: 0.65,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: typography.sizes.base,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    lineHeight: typography.sizes.xs * 1.4,
  },
});
