/**
 * Security partner — single recovery case detail with claim/status actions.
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  claimSecurityCase,
  getSecurityCase,
  updateSecurityCaseStatus,
  type SecurityCaseStatus,
  type SecurityRecoveryCase,
} from '../../api/security-cases';
import { MapPlaceholder } from '../recovery/MapPlaceholder';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { Alert, Badge, Button, Card, Screen } from '../../theme/primitives';
import type { BadgeTone } from '../../theme/primitives/Badge';
import { colors, spacing, typography } from '../../theme/tokens';

const STATUS_ACTIONS: { label: string; status: SecurityCaseStatus }[] = [
  { label: 'Start investigating', status: 'investigating' },
  { label: 'Begin tracking', status: 'tracking' },
  { label: 'Mark recovered', status: 'recovered' },
  { label: 'Close case', status: 'closed' },
];

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

  async function setStatus(status: SecurityCaseStatus) {
    if (!caseId) return;
    setUpdating(true);
    setError(null);
    try {
      const updated = await updateSecurityCaseStatus(caseId, status);
      setRecoveryCase(updated);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'security-case' }));
    } finally {
      setUpdating(false);
    }
  }

  async function handleClaim() {
    if (!caseId) return;
    setUpdating(true);
    setError(null);
    try {
      const updated = await claimSecurityCase(caseId);
      setRecoveryCase(updated);
    } catch (err) {
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
        <DetailRow label="Customer account" value={recoveryCase.accountId} />
        <DetailRow
          label="Reported"
          value={new Date(recoveryCase.reportedAt).toLocaleString()}
        />
        <DetailRow label="Notes" value={recoveryCase.notes ?? '—'} />
        <DetailRow
          label="Partner org"
          value={recoveryCase.partnerOrganizationId ?? 'Unassigned'}
        />
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
            onPress={() => void setStatus(action.status)}
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
