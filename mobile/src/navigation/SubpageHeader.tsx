import { useRouter, type Href } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../theme/ThemeProvider';
import { minTouchTarget, spacing, typography } from '../theme/tokens';

export interface SubpageHeaderProps {
  title?: string;
  /** Tighter spacing when paired with `AuthMasthead` on auth form screens. */
  compact?: boolean;
  /** Called after a successful back navigation. Defaults to `router.back()`. */
  onBack?: () => void;
}

/**
 * In-screen back control for routes that do not use a native stack header
 * (gate screens, modal-style flows, or legacy tab pushes).
 */
export function SubpageHeader({ title, compact = false, onBack }: SubpageHeaderProps) {
  const router = useRouter();
  const colors = useColors();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          marginBottom: compact ? spacing.sm : spacing.lg,
          minHeight: minTouchTarget,
        },
        back: {
          width: minTouchTarget,
          height: minTouchTarget,
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: -spacing.sm,
        },
        title: {
          flex: 1,
          fontSize: typography.sizes.xl,
          fontWeight: '700',
          color: colors.textPrimary,
        },
      }),
    [colors, compact],
  );

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(app)/(tabs)' as Href);
  }

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={handleBack}
        style={styles.back}
        hitSlop={8}
      >
        <ChevronLeftIcon size={24} color={colors.primary} strokeWidth={2.2} />
      </Pressable>
      {title ? <Text style={styles.title}>{title}</Text> : null}
    </View>
  );
}
