/**
 * In-app primer shown before the OS location permission dialog (Feature 008 §2.2).
 */
import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '../theme/primitives';
import { colors, spacing, typography } from '../theme/tokens';

export interface LocationConsentModalProps {
  visible: boolean;
  assetName?: string;
  onAccept: () => void;
  onDecline: () => void;
  loading?: boolean;
}

export function LocationConsentModal({
  visible,
  assetName,
  onAccept,
  onDecline,
  loading = false,
}: LocationConsentModalProps) {
  const title = assetName
    ? `Track "${assetName}" with this phone?`
    : 'Enable location on this phone?';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <Card style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>
            This app can report this phone&apos;s location for your registered smartphone asset
            while the app is open. We never track in the background.
          </Text>
          <Text style={styles.body}>
            Laptops, vehicles, and other assets need separate GPS hardware — that is not available
            yet. You can still view all your assets&apos; last-known locations here when tracking
            data exists.
          </Text>
          <Text style={styles.note}>
            You can turn this off anytime from the asset detail screen.
          </Text>
          <View style={styles.actions}>
            <Button variant="secondary" onPress={onDecline} disabled={loading}>
              Not now
            </Button>
            <Button onPress={onAccept} loading={loading}>
              Continue
            </Button>
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    gap: spacing.md,
  },
  title: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  body: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.45,
  },
  note: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    lineHeight: typography.sizes.xs * 1.4,
  },
  actions: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
});
