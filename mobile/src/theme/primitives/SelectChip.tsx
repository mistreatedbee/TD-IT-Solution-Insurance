/**
 * TEMPORARY BRIDGE — selectable chip for single-choice fields (e.g. asset type).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../tokens';

export interface SelectChipOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SelectChipGroupProps<T extends string = string> {
  options: readonly SelectChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function SelectChipGroup<T extends string>({
  options,
  value,
  onChange,
  style,
}: SelectChipGroupProps<T>) {
  return (
    <View style={[styles.grid, style]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.chip, selected ? styles.chipSelected : undefined]}
          >
            <Text style={[styles.chipText, selected ? styles.chipTextSelected : undefined]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.slate[300],
    backgroundColor: colors.background,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.accentGoldTint,
  },
  chipText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});
