import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AssetType } from '../api/assets';
import { ASSET_CATEGORY_OPTIONS } from '../onboarding/assetFormConfig';
import { AssetTypeImage } from '../screens/home/assetVisuals';
import { colors, minTouchTarget, spacing, typography } from '../theme/tokens';

export interface AssetTypePickerGridProps {
  value: AssetType;
  onChange: (type: AssetType) => void;
}

export function AssetTypePickerGrid({ value, onChange }: AssetTypePickerGridProps) {
  return (
    <View style={styles.grid}>
      {ASSET_CATEGORY_OPTIONS.map((opt) => {
        const selected = value === opt.api;
        return (
          <Pressable
            key={opt.api}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(opt.api)}
            style={[styles.chip, selected ? styles.chipSelected : null]}
          >
            <AssetTypeImage assetType={opt.api} size="sm" />
            <Text style={[styles.label, selected ? styles.labelSelected : null]} numberOfLines={2}>
              {opt.label}
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
    marginBottom: spacing.md,
  },
  chip: {
    width: '47.5%',
    minHeight: minTouchTarget * 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: colors.background,
    gap: spacing.xs,
  },
  chipSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.slate[50],
  },
  label: {
    fontSize: typography.sizes.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.sizes.xs * 1.35,
  },
  labelSelected: {
    color: colors.primary,
  },
});
