/**
 * TEMPORARY BRIDGE component — see mobile/src/theme/tokens.ts header.
 * RN port of src/components/Card/index.tsx's static (non-interactive)
 * surface. Per ui-design.md §1, auth screens do NOT use this (mobile
 * screens are full-bleed, see Screen.tsx) — kept for non-auth, future
 * screens (e.g. the placeholder home cards in app/(app)/index.tsx) that
 * do benefit from a bounded surface.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../tokens';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps {
  children: React.ReactNode;
  padding?: CardPadding;
  style?: StyleProp<ViewStyle>;
}

const paddingValues: Record<CardPadding, number> = {
  none: 0,
  sm: spacing.lg,
  md: spacing.xl,
  lg: spacing['2xl'],
};

export function Card({ children, padding = 'md', style }: CardProps) {
  return (
    <View
      style={[
        styles.base,
        { padding: paddingValues[padding] },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.background,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
