/**
 * Phase 2 — Step 2: confirm theft report and submit to recovery API.
 */
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from 'lucide-react-native';
import { useAssetQuery } from '../../api/hooks/useAssets';
import { useCreateRecoveryCaseMutation } from '../../api/hooks/useRecovery';
import { ApiError, NetworkUnavailableError } from '../../api/errors';
import { newIdempotencyKey } from '../../api/idempotency';
import { useIsOnline } from '../../network/NetworkProvider';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { formatAssetType } from '../../lib/asset-labels';
import { Alert, Button, Card, Input, Screen } from '../../theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../theme/tokens';

/**
 * Offline-retry policy (docs/organization/05-development-standards.md,
 * "Offline behaviour for mutations that need confirmed delivery", CTO
 * ruling 2026-10-06): a theft report must fail clearly rather than queue
 * silently — a customer must never walk away believing a stolen asset is
 * reported when it isn't. But a dropped connection does not mean the
 * request never arrived (NetworkUnavailableError covers timeouts and
 * connections dropped mid-response too), so:
 *   (a) block submission before it starts if we already know we're
 *       offline — this case IS a definite "nothing was sent";
 *   (b) a NetworkUnavailableError from the mutation itself is NOT definite
 *       — say so, and make retry safe rather than telling the user it
 *       failed when it may have already succeeded;
 *   (c) reuse the SAME idempotency key across retries of one submission
 *       intent, so the server recognises a retry as the same request
 *       instead of rejecting it as a duplicate open case;
 *   (d) treat CONFLICT as "already reported", not as a failure — route to
 *       the case that already exists rather than dead-ending the user.
 */
export function ReportTheftConfirmScreen() {
  const router = useRouter();
  const { assetId } = useLocalSearchParams<{ assetId?: string }>();
  const { data: asset, isLoading } = useAssetQuery(assetId);
  const createCase = useCreateRecoveryCaseMutation();
  const isOnline = useIsOnline();

  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // One key per submission intent (c). Reset only when the form contents
  // change or the submission succeeds — never on a mere retry of the same
  // report.
  const idempotencyKeyRef = useRef<string | null>(null);
  function keyForThisSubmission(): string {
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }
    return idempotencyKeyRef.current;
  }
  function resetSubmissionIntent() {
    idempotencyKeyRef.current = null;
  }

  function goToCase(caseId: string, referenceNumber: string) {
    resetSubmissionIntent();
    router.replace(
      `/report-theft/success?caseId=${encodeURIComponent(caseId)}&reference=${encodeURIComponent(referenceNumber)}` as Href,
    );
  }

  async function handleSubmit() {
    if (!assetId || !confirmed) return;
    setErrorMessage(null);

    // (a) Definite failure, before sending: nothing left the device.
    if (!isOnline) {
      setErrorMessage("You're offline. Your report has not been sent. Reconnect and try again.");
      return;
    }

    try {
      const created = await createCase.mutateAsync({
        body: { assetId, notes: notes.trim() || undefined },
        idempotencyKey: keyForThisSubmission(),
      });
      goToCase(created.id, created.referenceNumber);
    } catch (err) {
      // (d) CONFLICT means this exact report already went through — on an
      // earlier attempt, possibly this very retry's predecessor. Never show
      // this as an error; take the user to the case that already exists.
      if (err instanceof ApiError && err.status === 409 && err.caseId && err.referenceNumber) {
        goToCase(err.caseId, err.referenceNumber);
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        setErrorMessage('This asset already has an open theft report.');
        return;
      }
      // (b) Uncertain failure: do NOT claim the report was not received —
      // it may have reached the server before the connection dropped.
      // Retrying is safe (c) and will not create a duplicate.
      if (err instanceof NetworkUnavailableError) {
        setErrorMessage(
          "We couldn't confirm your report was received. Check your connection and try again — retrying won't create a duplicate report.",
        );
        return;
      }
      setErrorMessage(mapUserFacingError(err, { context: 'recovery' }));
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
        onChangeText={(text) => {
          // Editing the report's content makes this a different submission
          // intent — a stored idempotency key from a previous attempt must
          // not be reused against materially different content.
          resetSubmissionIntent();
          setNotes(text);
        }}
        multiline
        numberOfLines={4}
        hint="When and where did you last see the asset? Any police case number? Please don't include personal details about other people (e.g. names of suspects) — only describe what happened."
        style={styles.notesInput}
      />

      {!isOnline ? (
        <View style={styles.alertSpacing}>
          <Alert tone="warning">You&rsquo;re offline. Reconnect before submitting this report.</Alert>
        </View>
      ) : null}

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
        disabled={!confirmed || !isOnline}
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
