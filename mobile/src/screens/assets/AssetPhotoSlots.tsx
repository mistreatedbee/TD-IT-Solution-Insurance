import { CameraIcon, ImageIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

/** UI-only photo placeholders — MP-5 blocks real camera/upload until storage vendor is chosen. */
export function AssetPhotoSlots({ assetType }: { assetType: string }) {
  const slots =
    assetType === 'vehicle'
      ? ['Front', 'Rear', 'VIN plate']
      : assetType === 'smartphone' || assetType === 'laptop' || assetType === 'tablet'
        ? ['Front', 'Serial label', 'Receipt']
        : ['Primary', 'Serial label'];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <ImageIcon size={18} color={colors.primary} strokeWidth={2.2} />
        <Text style={styles.title}>Asset photos</Text>
      </View>
      <Text style={styles.hint}>
        Photo upload is coming soon. These slots show what you&apos;ll be able to add for recovery
        and claims support.
      </Text>
      <View style={styles.grid}>
        {slots.map((label) => (
          <View key={label} style={styles.slot}>
            <View style={styles.slotIcon}>
              <CameraIcon size={22} color={colors.slate[400]} strokeWidth={2} />
            </View>
            <Text style={styles.slotLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  hint: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    lineHeight: typography.sizes.xs * 1.45,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  slot: {
    width: '30%',
    minWidth: 96,
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  slotIcon: {
    marginBottom: spacing.xs,
  },
  slotLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.slate[500],
    textAlign: 'center',
  },
});
