import { ChevronRightIcon, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../theme/ThemeProvider';
import { useSurfaceStyles } from '../../theme/useSurfaceStyles';
import { spacing, typography } from '../../theme/tokens';

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
  iconColor,
  titleColor,
  showChevron = true,
  isLast = false,
  disabled = false,
  onPress,
}: AccountMenuRowProps) {
  const colors = useColors();
  const surfaceStyles = useSurfaceStyles();
  const resolvedIconColor = iconColor ?? colors.primary;
  const resolvedTitleColor = titleColor ?? colors.textPrimary;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          ...surfaceStyles.insetRow,
          gap: spacing.md,
        },
        rowDisabled: {
          opacity: 0.65,
        },
        insetDivider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.hairline,
          marginLeft: spacing.lg + 36 + spacing.md,
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
      }),
    [colors, surfaceStyles.insetRow],
  );

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        disabled={disabled || !onPress}
        onPress={onPress}
        style={[styles.row, disabled ? styles.rowDisabled : null]}
      >
        <View style={styles.iconWrap}>
          <Icon size={18} color={resolvedIconColor} strokeWidth={2.2} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: resolvedTitleColor }]}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {showChevron && onPress ? (
          <ChevronRightIcon size={18} color={colors.slate[400]} strokeWidth={2.2} />
        ) : null}
      </Pressable>
      {!isLast ? <View style={styles.insetDivider} /> : null}
    </View>
  );
}
