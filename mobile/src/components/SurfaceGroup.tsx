import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useSurfaceStyles } from '../theme/useSurfaceStyles';
import { spacing } from '../theme/tokens';

export interface SurfaceGroupProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Apply standard horizontal + vertical padding inside the group. */
  padded?: boolean;
}

/** Elevated surface for grouped list rows (Material 3 list aesthetic). */
export function SurfaceGroup({ children, style, padded = false }: SurfaceGroupProps) {
  const surfaceStyles = useSurfaceStyles();
  return (
    <View style={[surfaceStyles.group, padded ? surfaceStyles.groupPadding : null, style]}>
      {children}
    </View>
  );
}

export interface InsetDividerProps {
  /** Left inset in dp. Defaults to icon-row inset (16 + 44 + 12). Pass 0 for full-bleed. */
  inset?: number;
}

/** Hairline divider inset from the leading edge — use between rows inside a SurfaceGroup. */
export function InsetDivider({ inset }: InsetDividerProps) {
  const surfaceStyles = useSurfaceStyles();
  const dividerInset = inset ?? spacing.lg + 44 + spacing.md;
  return (
    <View
      style={[
        surfaceStyles.insetDivider,
        dividerInset === 0 ? surfaceStyles.insetDividerFull : { marginLeft: dividerInset },
      ]}
    />
  );
}

export interface AppScreenSectionProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Section with uppercase title and optional trailing action above grouped content. */
export function AppScreenSection({
  title,
  actionLabel,
  onAction,
  children,
  style,
}: AppScreenSectionProps) {
  const surfaceStyles = useSurfaceStyles();
  return (
    <View style={[styles.section, style]}>
      <View style={surfaceStyles.sectionHeader}>
        <Text style={surfaceStyles.sectionTitle}>{title}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
            <Text style={surfaceStyles.sectionAction}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export interface InlineStatItem {
  label: string;
  value: string | number;
}

export interface InlineStatBarProps {
  items: InlineStatItem[];
  style?: StyleProp<ViewStyle>;
  /** When true, render stats only — parent provides the SurfaceGroup. */
  inline?: boolean;
}

/** Horizontal stat chips with vertical dividers inside one elevated surface. */
export function InlineStatBar({ items, style, inline = false }: InlineStatBarProps) {
  const surfaceStyles = useSurfaceStyles();
  const { colors } = useTheme();

  if (items.length === 0) return null;

  const content = (
    <View
      style={[
        surfaceStyles.statBar,
        inline ? { marginTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline } : null,
      ]}
    >
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 ? <View style={surfaceStyles.statDivider} /> : null}
          <View style={surfaceStyles.statItem}>
            <Text style={surfaceStyles.statValue}>{item.value}</Text>
            <Text style={surfaceStyles.statLabel}>{item.label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );

  if (inline) {
    return <View style={style}>{content}</View>;
  }

  return <SurfaceGroup style={style}>{content}</SurfaceGroup>;
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
});
