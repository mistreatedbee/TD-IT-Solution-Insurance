/**
 * GPS tracker activation — register IMEI/serial and link to asset (Feature 009 Phase 4).
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAssetQuery } from '../../api/hooks/useAssets';
import {
  useLinkTrackingDeviceMutation,
  useRegisterTrackingDeviceMutation,
} from '../../api/hooks/useAssetTrackingProfile';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert, Input } from '../../theme/primitives';
import { AssetPage } from './AssetPage';

export function DeviceActivationScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
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
      <AssetPage scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={t.colors.link} />
        </View>
      </AssetPage>
    );
  }

  return (
    <AssetPage>
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

      <GlassCard variant="solid" style={styles.form}>
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
      </GlassCard>

      <Button label="Register and link tracker"
        loading={registerMutation.isPending || linkMutation.isPending}
        onPress={() => void handleActivate()}
       style={styles.stretch} />

      <Button label="View installation guide first"
        variant="secondary"
        style={[styles.stretch, styles.secondary]}
        onPress={() => router.push(`/assets/${id}/installation-guide` as Href)}
       />
    </AssetPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',},
    title: {
    ...t.type.displayMd,
    color: t.colors.ink,
    marginBottom: t.spacing.s2,},
    subtitle: {
    ...t.type.body,
    color: t.colors.inkMuted,
    marginBottom: t.spacing.s4,},
    info: {
    marginBottom: t.spacing.s4,},
    alert: {
    marginBottom: t.spacing.s3,},
    form: {
    marginBottom: t.spacing.s4,
    gap: t.spacing.s3,},
    secondary: {
    marginTop: t.spacing.s3,},

    stretch: { alignSelf: 'stretch' },
  });
}
