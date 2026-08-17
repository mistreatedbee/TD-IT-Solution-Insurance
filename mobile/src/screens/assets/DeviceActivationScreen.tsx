/**
 * GPS tracker activation — register IMEI/serial and link to asset (Feature 009 Phase 4).
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAssetQuery } from '../../api/hooks/useAssets';
import {
  useLinkTrackingDeviceMutation,
  useRegisterTrackingDeviceMutation,
} from '../../api/hooks/useAssetTrackingProfile';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { Alert, Button, Card, Input, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

export function DeviceActivationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: asset, isLoading } = useAssetQuery(id);
  const registerMutation = useRegisterTrackingDeviceMutation();
  const linkMutation = useLinkTrackingDeviceMutation(id ?? '');

  const [serialOrImei, setSerialOrImei] = useState('');
  const [label, setLabel] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function handleActivate() {
    if (!id) return;
    const trimmed = serialOrImei.trim();
    if (trimmed.length < 6) {
      setFormError('Enter the IMEI or serial number from your tracker label (at least 6 characters).');
      return;
    }

    setFormError(null);
    try {
      const device = await registerMutation.mutateAsync({
        serialOrImei: trimmed,
        label: label.trim() || undefined,
      });
      await linkMutation.mutateAsync(device.id);
      router.replace(`/assets/${id}/device-health` as Href);
    } catch (err) {
      setFormError(mapUserFacingError(err, { context: 'asset' }));
    }
  }

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>Connect GPS tracker</Text>
      <Text style={styles.subtitle}>
        Register the IMEI or serial number from your tracker to link it to{' '}
        {asset?.displayName ?? 'this asset'}.
      </Text>

      <Alert tone="info" style={styles.info}>
        Hardware vendor integration is still being finalised. Your device ID will be saved and
        will activate automatically when partner connectivity goes live.
      </Alert>

      {formError ? (
        <Alert tone="danger" style={styles.alert}>
          {formError}
        </Alert>
      ) : null}

      <Card style={styles.form}>
        <Input
          label="IMEI or serial number"
          value={serialOrImei}
          onChangeText={setSerialOrImei}
          placeholder="e.g. 359876543210987"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Input
          label="Label (optional)"
          value={label}
          onChangeText={setLabel}
          placeholder="e.g. Dashboard tracker"
        />
      </Card>

      <Button
        fullWidth
        loading={registerMutation.isPending || linkMutation.isPending}
        onPress={() => void handleActivate()}
      >
        Register and link tracker
      </Button>

      <Button
        variant="secondary"
        fullWidth
        style={styles.secondary}
        onPress={() => router.push(`/assets/${id}/installation-guide` as Href)}
      >
        View installation guide first
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  info: {
    marginBottom: spacing.lg,
  },
  alert: {
    marginBottom: spacing.md,
  },
  form: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  secondary: {
    marginTop: spacing.md,
  },
});
