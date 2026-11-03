/**
 * Security partner — single recovery case detail with claim/status actions.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  acceptSecurityCase,
  claimSecurityCase,
  declineSecurityCase,
  getSecurityCase,
  releaseSecurityCase,
  resolveCaseMode,
  TERMINAL_SECURITY_CASE_STATUSES,
  updateSecurityCaseStatus,
  type SecurityCaseCloseReason,
  type SecurityCaseDeclineReason,
  type SecurityCaseReleaseReason,
  type SecurityCaseStatus,
  type SecurityRecoveryCase,
} from '../../api/security-cases';
import { ApiError, NetworkUnavailableError } from '../../api/errors';
import { useIsOnline } from '../../network/NetworkProvider';
import { MapPlaceholder } from '../recovery/MapPlaceholder';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { Alert, Badge, Button, Card, Screen } from '../../theme/primitives';
import { SelectChipGroup, type SelectChipOption } from '../../theme/primitives/SelectChip';
import type { BadgeTone } from '../../theme/primitives/Badge';
import { colors, spacing, typography } from '../../theme/tokens';

const STATUS_ACTIONS: { label: string; status: SecurityCaseStatus }[] = [
  { label: 'Start investigating', status: 'investigating' },
  { label: 'Begin tracking', status: 'tracking' },
  { label: 'Mark recovered', status: 'recovered' },
  { label: 'Close case', status: 'closed' },
];

const CLOSE_REASON_OPTIONS: SelectChipOption<SecurityCaseCloseReason>[] = [
  { value: 'recovered-intact', label: 'Recovered intact' },
  { value: 'recovered-damaged', label: 'Recovered damaged' },
  { value: 'not-located', label: 'Not located' },
  { value: 'handed-to-police', label: 'Handed to police' },
  { value: 'customer-withdrew', label: 'Customer withdrew' },
];

// Mirrors backend/src/routes/security-cases.ts DECLINE_REASONS exactly —
// CS-6: fixed enum only, no TextInput anywhere in this flow.
const DECLINE_REASON_OPTIONS: SelectChipOption<SecurityCaseDeclineReason>[] = [
  { value: 'no_capacity', label: 'No capacity' },
  { value: 'outside_service_area', label: 'Outside service area' },
  { value: 'other', label: 'Other' },
];

// Mirrors backend/src/routes/security-cases.ts HAND_BACK_REASONS exactly —
// CS-6: fixed enum only, no TextInput anywhere in this flow.
const RELEASE_REASON_OPTIONS: SelectChipOption<SecurityCaseReleaseReason>[] = [
  { value: 'recovered_independently', label: 'Recovered independently' },
  { value: 'unable_to_proceed', label: 'Unable to proceed' },
  { value: 'agreement_lapsed', label: 'Agreement lapsed' },
  { value: 'other', label: 'Other' },
];

function formatCloseReason(reason: string): string {
  const match = CLOSE_REASON_OPTIONS.find((o) => o.value === reason);
  return match ? match.label : reason.replace(/-/g, ' ');
}

function caseStatusTone(status: string): BadgeTone {
  if (status === 'recovered' || status === 'closed') return 'emerald';
  if (status === 'tracking' || status === 'investigating') return 'gold';
  if (status === 'open') return 'warning';
  return 'neutral';
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ');
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function SecurityCaseDetailScreen() {
  const { caseId } = useLocalSearchParams<{ caseId?: string }>();

  if (!caseId) {
    return (
      <Screen>
        <Alert tone="danger">Missing case ID.</Alert>
      </Screen>
    );
  }

  return <SecurityCaseDetailBody key={caseId} caseId={caseId} />;
}

function SecurityCaseDetailBody({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [recoveryCase, setRecoveryCase] = useState<SecurityRecoveryCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [pendingTerminalStatus, setPendingTerminalStatus] = useState<SecurityCaseStatus | null>(
    null,
  );
  const [closeReason, setCloseReason] = useState<SecurityCaseCloseReason | null>(null);
  const [pendingDeclineReason, setPendingDeclineReason] = useState<SecurityCaseDeclineReason | null>(
    null,
  );
  const [declinePickerOpen, setDeclinePickerOpen] = useState(false);
  const [pendingReleaseReason, setPendingReleaseReason] = useState<SecurityCaseReleaseReason | null>(
    null,
  );
  const [releasePickerOpen, setReleasePickerOpen] = useState(false);
  const isOnline = useIsOnline();

  useEffect(() => {
    let cancelled = false;
    getSecurityCase(caseId)
      .then((data) => {
        if (!cancelled) setRecoveryCase(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(mapUserFacingError(err, { context: 'security-case' }));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  // Offline-tolerance policy (docs/organization/05-development-standards.md,
  // "Offline behaviour for mutations that need confirmed delivery"): a
  // partner operator believing a case update was saved when it wasn't is
  // the same class of risk as a customer theft report or consent change.
  // setStatus (PATCH to a specific status) is naturally idempotent — only
  // (a)/(b) needed. claimSecurityCase is NOT naturally idempotent: the
  // backend's claim write only matches an unclaimed (status='open', no
  // partner org) case, so a retry after an ambiguous network failure would
  // get NOT_FOUND even if the original attempt actually succeeded — (d)'s
  // "treat as already-succeeded" handling applies here too.

  function requestStatusChange(status: SecurityCaseStatus) {
    if (TERMINAL_SECURITY_CASE_STATUSES.includes(status)) {
      setError(null);
      setPendingTerminalStatus(status);
      setCloseReason(null);
      return;
    }
    void setStatus(status);
  }

  async function setStatus(status: SecurityCaseStatus, reason?: SecurityCaseCloseReason) {
    if (!caseId) return;
    if (!isOnline) {
      setError("You're offline. This status change has not been saved — reconnect and try again.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      const updated = await updateSecurityCaseStatus(caseId, status, reason);
      setRecoveryCase(updated);
      setPendingTerminalStatus(null);
      setCloseReason(null);
    } catch (err) {
      if (err instanceof NetworkUnavailableError) {
        setError("We couldn't confirm this status change was saved. Check your connection and try again.");
      } else {
        setError(mapUserFacingError(err, { context: 'security-case' }));
      }
    } finally {
      setUpdating(false);
    }
  }

  function confirmTerminalStatus() {
    if (!pendingTerminalStatus || !closeReason) return;
    void setStatus(pendingTerminalStatus, closeReason);
  }

  async function handleClaim() {
    if (!caseId) return;
    if (!isOnline) {
      setError("You're offline. This case has not been claimed — reconnect and try again.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      const updated = await claimSecurityCase(caseId);
      setRecoveryCase(updated);
    } catch (err) {
      if (err instanceof NetworkUnavailableError) {
        setError("We couldn't confirm this claim was received. Check your connection, then refresh before retrying — retrying a claim that already succeeded will show as unavailable, not as success.");
        return;
      }
      // (d): a claim retried after it actually already succeeded hits the
      // backend's open-only match and comes back NOT_FOUND. Re-fetch rather
      // than assume failure — if the case is no longer 'open', the original
      // attempt landed; show its current state instead of an error.
      if (err instanceof ApiError && err.status === 404) {
        try {
          const refreshed = await getSecurityCase(caseId);
          if (refreshed.status !== 'open') {
            setRecoveryCase(refreshed);
            return;
          }
        } catch {
          // Fall through to the generic error below — the refetch itself
          // failing doesn't change what we tell the user about the claim.
        }
      }
      setError(mapUserFacingError(err, { context: 'security-case' }));
    } finally {
      setUpdating(false);
    }
  }

  // ADR-0017 §(iii) — accept is not naturally idempotent server-side (the
  // backend's accept write only matches a case still dispatchStatus:
  // 'pending' to this org), so it reuses handleClaim's three-part pattern
  // verbatim rather than inventing a second one.
  async function handleAccept() {
    if (!caseId) return;
    if (!isOnline) {
      setError("You're offline. This case has not been accepted — reconnect and try again.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      const updated = await acceptSecurityCase(caseId);
      setRecoveryCase(updated);
    } catch (err) {
      if (err instanceof NetworkUnavailableError) {
        setError("We couldn't confirm this accept was received. Check your connection, then refresh before retrying — retrying an accept that already succeeded will show as unavailable, not as success.");
        return;
      }
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        try {
          const refreshed = await getSecurityCase(caseId);
          if (refreshed.dispatchStatus === 'accepted') {
            setRecoveryCase(refreshed);
            return;
          }
        } catch {
          // Fall through to the generic error below — the refetch itself
          // failing doesn't change what we tell the user about the accept.
        }
      }
      setError(mapUserFacingError(err, { context: 'security-case' }));
    } finally {
      setUpdating(false);
    }
  }

  // ADR-0017 §(ii) — on success the case leaves this org's visibility
  // entirely, so this clears state implying this org still holds the case
  // and navigates back to the list rather than re-fetching by ID (which
  // would now 403/404).
  function leaveCaseAfterHandoff() {
    setRecoveryCase(null);
    setPendingTerminalStatus(null);
    setCloseReason(null);
    setPendingDeclineReason(null);
    setDeclinePickerOpen(false);
    setPendingReleaseReason(null);
    setReleasePickerOpen(false);
    router.back();
  }

  // ADR-0017 §(iii) — decline/release are PATCH-shaped writes under a
  // precondition (dispatchStatus === 'pending'/'accepted'), closer in
  // idempotency shape to updateSecurityCaseStatus than to claim: a retry
  // after an ambiguous failure either no-ops against the already-moved
  // state, or 404s because the case already left this org's visibility —
  // which is itself confirmation the original attempt succeeded.
  async function handleDecline() {
    if (!caseId || !pendingDeclineReason) return;
    if (!isOnline) {
      setError("You're offline. This case has not been declined — reconnect and try again.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      await declineSecurityCase(caseId, pendingDeclineReason);
      leaveCaseAfterHandoff();
    } catch (err) {
      if (err instanceof NetworkUnavailableError) {
        setError("We couldn't confirm this decline was received. Check your connection, then refresh before retrying.");
        return;
      }
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        try {
          const refreshed = await getSecurityCase(caseId);
          if (refreshed.dispatchStatus !== 'pending') {
            // Original attempt landed — the case is no longer offered to
            // this org (declined, or moved on some other way).
            leaveCaseAfterHandoff();
            return;
          }
        } catch {
          leaveCaseAfterHandoff();
          return;
        }
      }
      setError(mapUserFacingError(err, { context: 'security-case' }));
    } finally {
      setUpdating(false);
    }
  }

  async function handleRelease() {
    if (!caseId || !pendingReleaseReason) return;
    if (!isOnline) {
      setError("You're offline. This case has not been released — reconnect and try again.");
      return;
    }
    setUpdating(true);
    setError(null);
    try {
      await releaseSecurityCase(caseId, pendingReleaseReason);
      leaveCaseAfterHandoff();
    } catch (err) {
      if (err instanceof NetworkUnavailableError) {
        setError("We couldn't confirm this release was received. Check your connection, then refresh before retrying.");
        return;
      }
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        try {
          const refreshed = await getSecurityCase(caseId);
          if (refreshed.dispatchStatus !== 'accepted') {
            // Original attempt landed — the case left this org's visibility.
            leaveCaseAfterHandoff();
            return;
          }
        } catch {
          leaveCaseAfterHandoff();
          return;
        }
      }
      setError(mapUserFacingError(err, { context: 'security-case' }));
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error && !recoveryCase) {
    return (
      <Screen>
        <Text style={styles.title}>Case</Text>
        <Alert tone="danger">{error}</Alert>
      </Screen>
    );
  }

  if (!recoveryCase) {
    return (
      <Screen>
        <Alert tone="danger">Case not found.</Alert>
      </Screen>
    );
  }

  const caseMode = resolveCaseMode(recoveryCase);
  const canClaim =
    caseMode === 'pool' &&
    recoveryCase.status === 'open' &&
    !recoveryCase.partnerOrganizationId;

  return (
    <Screen>
      <Text style={styles.title}>{recoveryCase.referenceNumber}</Text>
      <Badge tone={caseStatusTone(recoveryCase.status)}>
        {formatStatus(recoveryCase.status)}
      </Badge>

      {error ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">{error}</Alert>
        </View>
      ) : null}

      <Card style={styles.section}>
        <DetailRow label="Asset ID" value={recoveryCase.assetId} />
        <DetailRow
          label="Reported"
          value={new Date(recoveryCase.reportedAt).toLocaleString()}
        />
        <DetailRow label="Notes" value={recoveryCase.notes ?? '—'} />
        <DetailRow
          label="Partner org"
          value={recoveryCase.partnerOrganizationId ?? 'Unassigned'}
        />
        {recoveryCase.closeReason ? (
          <DetailRow label="Close reason" value={formatCloseReason(recoveryCase.closeReason)} />
        ) : null}
      </Card>

      {recoveryCase.status === 'tracking' ? (
        <>
          <MapPlaceholder
            emptyMessage="Live GPS requires Phase 2 ingestion — not connected yet."
          />
          <Text style={styles.gpsNote}>
            Live GPS map and location history require Phase 2 GPS ingestion — not yet connected.
          </Text>
        </>
      ) : null}

      {pendingTerminalStatus ? (
        <Card style={styles.section}>
          <Text style={styles.detailLabel}>
            Reason for marking this case &quot;{formatStatus(pendingTerminalStatus)}&quot;
          </Text>
          <SelectChipGroup
            options={CLOSE_REASON_OPTIONS}
            value={closeReason ?? ('' as SecurityCaseCloseReason)}
            onChange={setCloseReason}
            style={styles.reasonPicker}
          />
          <View style={styles.actions}>
            <Button
              variant="primary"
              loading={updating}
              disabled={!closeReason}
              onPress={confirmTerminalStatus}
            >
              {`Confirm ${formatStatus(pendingTerminalStatus)}`}
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                setPendingTerminalStatus(null);
                setCloseReason(null);
              }}
            >
              Cancel
            </Button>
          </View>
        </Card>
      ) : null}

      {declinePickerOpen ? (
        <Card style={styles.section}>
          <Text style={styles.detailLabel}>Reason for declining this case</Text>
          <SelectChipGroup
            options={DECLINE_REASON_OPTIONS}
            value={pendingDeclineReason ?? ('' as SecurityCaseDeclineReason)}
            onChange={setPendingDeclineReason}
            style={styles.reasonPicker}
          />
          <View style={styles.actions}>
            <Button
              variant="primary"
              loading={updating}
              disabled={!pendingDeclineReason}
              onPress={() => void handleDecline()}
            >
              Confirm decline
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                setDeclinePickerOpen(false);
                setPendingDeclineReason(null);
              }}
            >
              Cancel
            </Button>
          </View>
        </Card>
      ) : null}

      {releasePickerOpen ? (
        <Card style={styles.section}>
          <Text style={styles.detailLabel}>Reason for releasing this case</Text>
          <SelectChipGroup
            options={RELEASE_REASON_OPTIONS}
            value={pendingReleaseReason ?? ('' as SecurityCaseReleaseReason)}
            onChange={setPendingReleaseReason}
            style={styles.reasonPicker}
          />
          <View style={styles.actions}>
            <Button
              variant="primary"
              loading={updating}
              disabled={!pendingReleaseReason}
              onPress={() => void handleRelease()}
            >
              Confirm release
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                setReleasePickerOpen(false);
                setPendingReleaseReason(null);
              }}
            >
              Cancel
            </Button>
          </View>
        </Card>
      ) : null}

      <View style={styles.actions}>
        {canClaim ? (
          <Button variant="primary" loading={updating} onPress={() => void handleClaim()}>
            Claim case
          </Button>
        ) : null}
        {caseMode === 'offered' ? (
          <>
            <Button variant="primary" loading={updating} onPress={() => void handleAccept()}>
              Accept
            </Button>
            <Button
              variant="secondary"
              loading={updating}
              onPress={() => {
                setDeclinePickerOpen(true);
                setPendingDeclineReason(null);
              }}
            >
              Decline
            </Button>
          </>
        ) : null}
        {caseMode !== 'offered'
          ? STATUS_ACTIONS.filter((a) => a.status !== recoveryCase.status).map((action) => (
              <Button
                key={action.status}
                variant="secondary"
                loading={updating}
                onPress={() => requestStatusChange(action.status)}
              >
                {action.label}
              </Button>
            ))
          : null}
        {caseMode === 'held' ? (
          <Button
            variant="secondary"
            loading={updating}
            onPress={() => {
              setReleasePickerOpen(true);
              setPendingReleaseReason(null);
            }}
          >
            Release
          </Button>
        ) : null}
      </View>
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
  alertSpacing: {
    marginTop: spacing.lg,
  },
  section: {
    marginTop: spacing.xl,
  },
  detailRow: {
    marginBottom: spacing.md,
  },
  detailLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  detailValue: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  gpsNote: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: typography.sizes.xs * 1.4,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  reasonPicker: {
    marginTop: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
