/**
 * Security partner — single recovery case detail with claim/status actions.
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  claimSecurityCase,
  getSecurityCase,
  TERMINAL_SECURITY_CASE_STATUSES,
  updateSecurityCaseStatus,
  type SecurityCaseCloseReason,
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
  const [recoveryCase, setRecoveryCase] = useState<SecurityRecoveryCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [pendingTerminalStatus, setPendingTerminalStatus] = useState<SecurityCaseStatus | null>(
    null,
  );
  const [closeReason, setCloseReason] = useState<SecurityCaseCloseReason | null>(null);
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

  const canClaim =
    recoveryCase.status === 'open' && !recoveryCase.partnerOrganizationId;

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
              Confirm {formatStatus(pendingTerminalStatus)}
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

      <View style={styles.actions}>
        {canClaim ? (
          <Button variant="primary" loading={updating} onPress={() => void handleClaim()}>
            Claim case
          </Button>
        ) : null}
        {STATUS_ACTIONS.filter((a) => a.status !== recoveryCase.status).map((action) => (
          <Button
            key={action.status}
            variant="secondary"
            loading={updating}
            onPress={() => requestStatusChange(action.status)}
          >
            {action.label}
          </Button>
        ))}
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
