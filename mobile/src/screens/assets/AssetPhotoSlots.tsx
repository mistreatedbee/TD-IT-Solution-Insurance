import { CameraIcon, ImageIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDesignTokens } from '../../theme/designTheme';

/** UI-only photo placeholders — MP-5 blocks real camera/upload until storage vendor is chosen. */
export function AssetPhotoSlots({ assetType }: { assetType: string }) {
  const t = useDesignTokens();
  const slots =
    assetType === 'vehicle'
      ? ['Front', 'Rear', 'VIN plate']
      : assetType === 'smartphone' || assetType === 'laptop' || assetType === 'tablet'
        ? ['Front', 'Serial label', 'Receipt']
        : ['Primary', 'Serial label'];

  return (
    <View style={{ gap: t.spacing.s2 }}>
      <View style={styles.header}>
        <ImageIcon size={18} color={t.colors.ink} strokeWidth={1.75} />
        <Text style={[t.type.title, { color: t.colors.ink, marginLeft: t.spacing.s2 }]}>Asset photos</Text>
      </View>
      <Text style={[t.type.bodySm, { color: t.colors.inkMuted }]}>
        Photos can&apos;t be uploaded in the app yet. Keep clear photos of these items on your own
        phone so you have them if you ever need to support a recovery or claim.
      </Text>
      <View style={[styles.grid, { gap: t.spacing.s2, marginTop: t.spacing.s1 }]}>
        {slots.map((label) => (
          <View
            key={label}
            style={[
              styles.slot,
              { borderRadius: t.radius.md, borderColor: t.colors.borderControl, backgroundColor: t.colors.bgSunken, padding: t.spacing.s2 },
            ]}
          >
            <CameraIcon size={22} color={t.colors.inkMuted} strokeWidth={1.75} />
            <Text style={[t.type.labelSm, { color: t.colors.inkMuted, textAlign: 'center', marginTop: t.spacing.s1 }]}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  slot: {
    width: '30%',
    minWidth: 96,
    flexGrow: 1,
    aspectRatio: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
