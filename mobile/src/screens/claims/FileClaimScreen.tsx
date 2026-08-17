/**
 * Phase 2 — file a new insurance claim.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAssetsQuery } from '../../api/hooks/useAssets';
import { useCreateClaimMutation } from '../../api/hooks/useClaims';
import { ApiError } from '../../api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { formatAssetType } from '../../lib/asset-labels';
import { Alert, Button, Input, Screen, SelectChipGroup } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

export function FileClaimScreen() {
  const router = useRouter();
  const { data: assetsPage, isLoading: assetsLoading } = useAssetsQuery();
  const createClaim = useCreateClaimMutation();

  const assets = assetsPage?.data ?? [];
  const assetOptions = assets
    .filter((a) => a.id)
    .map((a) => ({ value: a.id!, label: a.displayName ?? a.id! }));

  const [assetId, setAssetId] = useState<string | undefined>();
  const [summary, setSummary] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successRef, setSuccessRef] = useState<string | null>(null);

  async function handleSubmit() {
    if (!assetId || summary.trim().length < 10) {
      setErrorMessage('Select an asset and describe the incident (at least 10 characters).');
      return;
    }
    setErrorMessage(null);
    try {
      const claim = await createClaim.mutateAsync({
        assetId,
        incidentSummary: summary.trim(),
      });
      setSuccessRef(claim.referenceNumber);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setErrorMessage(
          'Claims service is not available yet. The claims API has not been deployed — nothing was saved.',
        );
      } else {
        setErrorMessage(mapUserFacingError(err, { context: 'claim' }));
      }
    }
  }

  if (successRef) {
    return (
      <Screen>
        <Alert tone="success">Claim submitted. Reference: {successRef}</Alert>
        <View style={styles.actions}>
          <Button variant="primary" fullWidth onPress={() => router.replace('/claims' as Href)}>
            View claims
          </Button>
          <Button variant="tertiary" fullWidth onPress={() => router.back()}>
            Done
          </Button>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>File a claim</Text>
      <Text style={styles.subtitle}>
        Provide details about the loss or theft. A claims adjuster will review once the service is
        live.
      </Text>

      {assetsLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : assetOptions.length === 0 ? (
        <Alert tone="warning">Register an asset before filing a claim.</Alert>
      ) : (
        <>
          <Text style={styles.label}>Asset</Text>
          <SelectChipGroup
            options={assetOptions}
            value={assetId ?? ''}
            onChange={setAssetId}
          />
          {assetId && assets.find((a) => a.id === assetId) ? (
            <Text style={styles.assetType}>
              {formatAssetType(assets.find((a) => a.id === assetId)!.assetType ?? 'other_electronics')}
            </Text>
          ) : null}
        </>
      )}

      <Input
        label="What happened?"
        value={summary}
        onChangeText={setSummary}
        multiline
        numberOfLines={5}
        hint="Include date, location, and whether police were notified."
        style={styles.summaryInput}
      />

      {errorMessage ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">{errorMessage}</Alert>
        </View>
      ) : null}

      <Button
        variant="primary"
        fullWidth
        loading={createClaim.isPending}
        disabled={!assetId || summary.trim().length < 10}
        onPress={handleSubmit}
      >
        Submit claim
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  assetType: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginBottom: spacing.lg,
  },
  summaryInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  alertSpacing: {
    marginBottom: spacing.lg,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
});
