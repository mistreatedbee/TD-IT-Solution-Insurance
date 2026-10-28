/**
 * File a new insurance claim — Feature 018 backend
 * (backend/src/routes/claims.ts, business-requirements.md §1-§3).
 *
 * No photo upload: no object-storage vendor exists yet (MP-5) — evidence is
 * a free-text description only, and the copy here must not imply otherwise.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAssetsQuery } from '../../api/hooks/useAssets';
import { usePoliciesQuery } from '../../api/hooks/usePolicies';
import { useCreateClaimMutation } from '../../api/hooks/useClaims';
import { ApiError } from '../../api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { formatAssetType } from '../../lib/asset-labels';
import { Alert, Button, Input, Screen, SelectChipGroup } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function FileClaimScreen() {
  const router = useRouter();
  const { data: assetsPage, isLoading: assetsLoading } = useAssetsQuery();
  const { data: policiesPage, isLoading: policiesLoading } = usePoliciesQuery();
  const createClaim = useCreateClaimMutation();

  const assets = assetsPage?.data ?? [];
  const policies = policiesPage?.data ?? [];

  const assetOptions = useMemo(
    () =>
      assets
        .filter((a) => a.id)
        .map((a) => ({ value: a.id!, label: a.displayName ?? a.id! })),
    [assets],
  );
  const policyOptions = useMemo(
    () =>
      policies
        .filter((p) => p.id)
        .map((p) => ({ value: p.id!, label: `${p.planTier ?? 'Policy'} (${p.status ?? 'unknown'})` })),
    [policies],
  );

  const [assetId, setAssetId] = useState<string | undefined>();
  const [policyId, setPolicyId] = useState<string | undefined>();
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [claimedAmount, setClaimedAmount] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [duplicateClaimId, setDuplicateClaimId] = useState<string | null>(null);
  const [submittedClaimId, setSubmittedClaimId] = useState<string | null>(null);

  const amountNumber = Number(claimedAmount);
  const canSubmit =
    Boolean(assetId) &&
    Boolean(policyId) &&
    incidentDescription.trim().length >= 20 &&
    DATE_RE.test(incidentDate.trim()) &&
    Number.isFinite(amountNumber) &&
    amountNumber > 0;

  async function handleSubmit() {
    setSubmitError(null);
    setDuplicateClaimId(null);

    if (!assetId || !policyId) {
      setFieldError('Select a policy and an asset.');
      return;
    }
    if (incidentDescription.trim().length < 20) {
      setFieldError('Describe what happened in at least 20 characters.');
      return;
    }
    if (!DATE_RE.test(incidentDate.trim())) {
      setFieldError('Enter the incident date as YYYY-MM-DD.');
      return;
    }
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setFieldError('Enter a claimed amount greater than zero.');
      return;
    }
    setFieldError(null);

    try {
      const claim = await createClaim.mutateAsync({
        policyId,
        assetId,
        incidentDescription: incidentDescription.trim(),
        incidentDate: incidentDate.trim(),
        evidenceDescription: evidenceDescription.trim() || undefined,
        claimedAmount: amountNumber,
      });
      setSubmittedClaimId(claim.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_OPEN_CLAIM' && err.claimId) {
        setDuplicateClaimId(err.claimId);
        setSubmitError('There is already an open claim for this asset.');
        return;
      }
      if (err instanceof ApiError && err.code === 'WAITING_PERIOD_NOT_MET' && err.waitingPeriodClearsAt) {
        setSubmitError(
          `${mapUserFacingError(err, { context: 'claim' })} Eligible from ${new Date(
            err.waitingPeriodClearsAt,
          ).toLocaleDateString()}.`,
        );
        return;
      }
      setSubmitError(mapUserFacingError(err, { context: 'claim' }));
    }
  }

  if (submittedClaimId) {
    return (
      <Screen>
        <Alert tone="success">Claim submitted.</Alert>
        <View style={styles.actions}>
          <Button
            variant="primary"
            fullWidth
            onPress={() => router.replace(`/claims/${submittedClaimId}` as Href)}
          >
            View claim
          </Button>
          <Button variant="tertiary" fullWidth onPress={() => router.replace('/claims' as Href)}>
            Back to claims
          </Button>
        </View>
      </Screen>
    );
  }

  const loading = assetsLoading || policiesLoading;

  return (
    <Screen>
      <Text style={styles.title}>File a claim</Text>
      <Text style={styles.subtitle}>
        Provide details about the loss or theft. Evidence is a written description only — photo
        upload is not available yet.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          {policyOptions.length === 0 ? (
            <Alert tone="warning">You need an active policy before filing a claim.</Alert>
          ) : (
            <>
              <Text style={styles.label}>Policy</Text>
              <SelectChipGroup options={policyOptions} value={policyId ?? ''} onChange={setPolicyId} />
            </>
          )}

          {assetOptions.length === 0 ? (
            <Alert tone="warning">Register an asset before filing a claim.</Alert>
          ) : (
            <>
              <Text style={styles.label}>Asset</Text>
              <SelectChipGroup options={assetOptions} value={assetId ?? ''} onChange={setAssetId} />
              {assetId && assets.find((a) => a.id === assetId) ? (
                <Text style={styles.assetType}>
                  {formatAssetType(assets.find((a) => a.id === assetId)!.assetType ?? 'other_electronics')}
                </Text>
              ) : null}
            </>
          )}
        </>
      )}

      <Input
        label="What happened?"
        value={incidentDescription}
        onChangeText={setIncidentDescription}
        multiline
        numberOfLines={5}
        hint="At least 20 characters. Include date, location, and whether police were notified."
        style={styles.multilineInput}
      />

      <Input
        label="Incident date"
        value={incidentDate}
        onChangeText={setIncidentDate}
        placeholder="YYYY-MM-DD"
        hint="Use YYYY-MM-DD format, e.g. 2026-10-01. Cannot be in the future."
      />

      <Input
        label="Evidence description (optional)"
        value={evidenceDescription}
        onChangeText={setEvidenceDescription}
        multiline
        numberOfLines={3}
        hint="Describe any supporting evidence in writing — photo upload is not available yet."
        style={styles.multilineInput}
      />

      <Input
        label="Claimed amount"
        value={claimedAmount}
        onChangeText={setClaimedAmount}
        keyboardType="decimal-pad"
        hint="Enter the amount you are claiming, in your policy's currency."
      />

      {fieldError ? (
        <View style={styles.alertSpacing}>
          <Alert tone="warning">{fieldError}</Alert>
        </View>
      ) : null}

      {submitError ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">{submitError}</Alert>
          {duplicateClaimId ? (
            <Button
              variant="tertiary"
              fullWidth
              onPress={() => router.push(`/claims/${duplicateClaimId}` as Href)}
            >
              View existing claim
            </Button>
          ) : null}
        </View>
      ) : null}

      <Button
        variant="primary"
        fullWidth
        loading={createClaim.isPending}
        disabled={!canSubmit}
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
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  alertSpacing: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
});
