import { ChevronRightIcon, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDesignTokens } from '../../theme/designTheme';

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

/** One tappable row: icon tile, title, optional subtitle, chevron. Design tokens, 48px minimum target. */
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
  const t = useDesignTokens();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: t.spacing.s3 },
        rowDisabled: { opacity: 0.5 },
        iconTile: {
          width: 40,
          height: 40,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.bgSunken,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: t.spacing.s3,
        },
        copy: { flex: 1, minWidth: 0 },
        divider: { height: StyleSheet.hairlineWidth, backgroundColor: t.colors.borderSubtle, marginLeft: 40 + t.spacing.s3 },
      }),
    [t],
  );

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
        disabled={disabled || !onPress}
        onPress={onPress}
        style={[styles.row, disabled ? styles.rowDisabled : null]}
      >
        <View style={styles.iconTile}>
          <Icon size={20} color={iconColor ?? t.colors.ink} strokeWidth={1.75} />
        </View>
        <View style={styles.copy}>
          <Text style={[t.type.title, { color: titleColor ?? t.colors.ink }]}>{title}</Text>
          {subtitle ? <Text style={[t.type.bodySm, { color: t.colors.inkMuted }]}>{subtitle}</Text> : null}
        </View>
        {showChevron && onPress ? <ChevronRightIcon size={20} color={t.colors.inkMuted} strokeWidth={1.75} /> : null}
      </Pressable>
      {!isLast ? <View style={styles.divider} /> : null}
    </View>
  );
}
