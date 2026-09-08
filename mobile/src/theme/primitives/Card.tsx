import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../ThemeProvider';
import { radius, spacing } from '../tokens';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps {
  children: React.ReactNode;
  padding?: CardPadding;
  style?: StyleProp<ViewStyle>;
  bordered?: boolean;
}

const paddingValues: Record<CardPadding, number> = {
  none: 0,
  sm: spacing.lg,
  md: spacing.xl,
  lg: spacing['2xl'],
};

export function Card({ children, padding = 'md', style, bordered = false }: CardProps) {
  const { colors, elevation } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        elevated: {
          backgroundColor: colors.background,
          borderRadius: radius.cardLg,
          overflow: 'hidden',
          ...elevation,
        },
        bordered: {
          backgroundColor: colors.background,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: colors.border,
        },
      }),
    [colors.background, colors.border, elevation],
  );

  return (
    <View
      style={[
        bordered ? styles.bordered : styles.elevated,
        { padding: paddingValues[padding] },
        style,
      ]}
    >
      {children}
    </View>
  );
}
