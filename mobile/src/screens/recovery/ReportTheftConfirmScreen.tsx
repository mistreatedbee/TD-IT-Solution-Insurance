/**
 * Phase 2 — Step 2: confirm theft report and submit to recovery API.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from 'lucide-react-native';
import { useAssetQuery } from '../../api/hooks/useAssets';
import { useCreateRecoveryCaseMutation } from '../../api/hooks/useRecovery';
import { ApiError } from '../../api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { formatAssetType } from '../../lib/asset-labels';
import { Alert, Button, Card, Input, Screen } from '../../theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../theme/tokens';

export function ReportTheftConfirmScreen() {
  const router = useRouter();
  const { assetId } = useLocalSearchParams<{ assetId?: string }>();
  const { data: asset, isLoading } = useAssetQuery(assetId);
  const createCase = useCreateRecoveryCaseMutation();

  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit() {
    if (!assetId || !confirmed) return;
    setErrorMessage(null);
    try {
      const created = await createCase.mutateAsync({
        assetId,
        notes: notes.trim() || undefined,
      });
      router.replace(
        `/report-theft/success?caseId=${encodeURIComponent(created.id)}&reference=${encodeURIComponent(created.referenceNumber)}` as Href,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrorMessage('An open recovery case already exists for this asset.');
      } else {
        setErrorMessage(mapUserFacingError(err, { context: 'recovery' }));
      }
    }
  }

  if (!assetId) {
    return (
      <Screen>
        <Alert tone="danger">Missing asset. Go back and select an asset.</Alert>
      </Screen>
    );
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
      <Text style={styles.title}>Confirm theft report</Text>

      {asset ? (
        <Card style={styles.card}>
          <Text style={styles.assetName}>{asset.displayName}</Text>
          <Text style={styles.meta}>{formatAssetType(asset.assetType ?? 'other_electronics')}</Text>
          {!asset.gpsDeviceId ? (
            <Alert tone="warning">
              This asset has no GPS device paired. Live tracking will not be available until
              hardware is installed (Phase 2 pairing flow).
            </Alert>
          ) : null}
        </Card>
      ) : null}

      <Input
        label="Additional details (optional)"
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={4}
        hint="When and where did you last see the asset? Any police case number? Please don't include personal details about other people (e.g. names of suspects) — only describe what happened."
        style={styles.notesInput}
      />

      <Pressable
        style={styles.confirmRow}
        onPress={() => setConfirmed((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
      >
        <View style={[styles.checkbox, confirmed ? styles.checkboxChecked : undefined]}>
          {confirmed ? <CheckIcon size={14} color={colors.textInverse} /> : null}
        </View>
        <Text style={styles.confirmLabel}>
          I confirm this asset was stolen or lost and I want to start the recovery process.
        </Text>
      </Pressable>

      {errorMessage ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">{errorMessage}</Alert>
        </View>
      ) : null}

      <Button
        variant="primary"
        fullWidth
        loading={createCase.isPending}
        disabled={!confirmed}
        onPress={handleSubmit}
      >
        Submit theft report
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  assetName: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
  notesInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    minHeight: minTouchTarget,
    marginBottom: spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.slate[300],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  confirmLabel: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.4,
  },
  alertSpacing: {
    marginBottom: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
