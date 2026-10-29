/**
 * Claim detail — Feature 018 backend (GET/PATCH /v1/claims/:claimId*).
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useClaimQuery, useRespondToClaimMutation, useWithdrawClaimMutation } from '../../api/hooks/useClaims';
import type { Claim } from '../../api/claims';
import { Alert, Badge, Button, Card, Input, Screen } from '../../theme/primitives';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { claimStatusBadgeTone, formatClaimStatus, isClaimWithdrawable } from '../../lib/claim-labels';
import { formatAssetType } from '../../lib/asset-labels';
import type { AssetType } from '../../api/assets';
import { colors, spacing, typography } from '../../theme/tokens';

export function ClaimDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: claim, isLoading, isError, error } = useClaimQuery(id);
  const respondMutation = useRespondToClaimMutation(id ?? '');
  const withdrawMutation = useWithdrawClaimMutation(id ?? '');

  const [responseText, setResponseText] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (isError || !claim) {
    return (
      <Screen>
        <Text style={styles.title}>Claim</Text>
        <Alert tone="danger">{mapUserFacingError(error, { context: 'claim' })}</Alert>
      </Screen>
    );
  }

  async function handleRespond() {
    setActionError(null);
    if (responseText.trim().length < 1) {
      setActionError('Enter a response before submitting.');
      return;
    }
    try {
      await respondMutation.mutateAsync({ text: responseText.trim() });
      setResponseText('');
    } catch (err) {
      setActionError(mapUserFacingError(err, { context: 'claim' }));
    }
  }

  async function handleWithdraw() {
    setActionError(null);
    try {
      await withdrawMutation.mutateAsync();
      setConfirmingWithdraw(false);
    } catch (err) {
      setActionError(mapUserFacingError(err, { context: 'claim' }));
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>{claim.assetDisplayName}</Text>
      <Badge tone={claimStatusBadgeTone(claim.status)}>{formatClaimStatus(claim.status)}</Badge>

      <Card style={styles.section}>
        <DetailRow label="Asset type" value={formatAssetType(claim.assetType as AssetType)} />
        <DetailRow label="Policy plan" value={claim.policyPlanTier} />
        <DetailRow label="Submitted" value={new Date(claim.submittedAt).toLocaleString()} />
        <DetailRow label="Incident date" value={new Date(claim.incidentDate).toLocaleDateString()} />
        <DetailRow
          label="Claimed amount"
          value={`${claim.claimedAmountCurrency} ${claim.claimedAmount.toLocaleString()}`}
        />
        {claim.approvedAmount != null ? (
          <DetailRow
            label="Approved amount"
            value={`${claim.claimedAmountCurrency} ${claim.approvedAmount.toLocaleString()}`}
          />
        ) : null}
        {claim.recoveryCaseId ? <DetailRow label="Recovery case" value={claim.recoveryCaseId} /> : null}
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Incident description</Text>
        <Text style={styles.body}>{claim.incidentDescription}</Text>
      </Card>

      {claim.evidenceDescription ? (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Evidence description</Text>
          <Text style={styles.body}>{claim.evidenceDescription}</Text>
        </Card>
      ) : null}

      {claim.rejectionReason ? (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Rejection reason</Text>
          <Text style={styles.body}>{claim.rejectionReason}</Text>
        </Card>
      ) : null}

      {claim.quantumReason ? (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Why the approved amount differs from what you claimed</Text>
          <DetailRow
            label="Amount claimed"
            value={`${claim.claimedAmountCurrency} ${claim.claimedAmount.toLocaleString()}`}
          />
          {claim.approvedAmount != null ? (
            <DetailRow
              label="Amount approved"
              value={`${claim.claimedAmountCurrency} ${claim.approvedAmount.toLocaleString()}`}
            />
          ) : null}
          <Text style={styles.body}>{claim.quantumReason}</Text>
        </Card>
      ) : null}

      {claim.closeReason ? (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Reason this claim was closed</Text>
          <Text style={styles.body}>{claim.closeReason}</Text>
        </Card>
      ) : null}

      {claim.decisionNotices.length > 0 ? (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Important notices about this claim</Text>
          {[...claim.decisionNotices]
            .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
            .map((notice, idx) => (
              <View key={idx} style={styles.noticeBlock} testID={`decision-notice-${idx}`}>
                <Text style={styles.noticeHeading}>{decisionNoticeHeading(notice.kind)}</Text>
                <Text style={styles.noticeMeta}>{new Date(notice.issuedAt).toLocaleString()}</Text>
                {notice.renderedText
                  .split(/\n\n+/)
                  .filter((p) => p.trim().length > 0)
                  .map((paragraph, pIdx) => (
                    <Text key={pIdx} style={styles.noticeParagraph}>
                      {paragraph}
                    </Text>
                  ))}
              </View>
            ))}
        </Card>
      ) : null}

      {claim.reviewNotes.length > 0 ? (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Reviewer notes</Text>
          {claim.reviewNotes.map((note, idx) => (
            <View key={idx} style={styles.noteRow}>
              <Text style={styles.body}>{note.text}</Text>
              <Text style={styles.noteMeta}>{new Date(note.createdAt).toLocaleString()}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {actionError ? (
        <View style={styles.section}>
          <Alert tone="danger">{actionError}</Alert>
        </View>
      ) : null}

      {claim.status === 'more_info_requested' ? (
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Respond to reviewer</Text>
          <Input
            label="Your response"
            value={responseText}
            onChangeText={setResponseText}
            multiline
            numberOfLines={4}
            style={styles.multilineInput}
          />
          <Button
            variant="primary"
            fullWidth
            loading={respondMutation.isPending}
            disabled={responseText.trim().length === 0}
            onPress={handleRespond}
          >
            Send response
          </Button>
        </Card>
      ) : null}

      {isClaimWithdrawable(claim.status) ? (
        <View style={styles.section}>
          {confirmingWithdraw ? (
            <>
              <Alert tone="warning">Withdraw this claim? This cannot be undone.</Alert>
              <View style={styles.withdrawActions}>
                <Button
                  variant="tertiary"
                  fullWidth
                  disabled={withdrawMutation.isPending}
                  onPress={() => setConfirmingWithdraw(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  loading={withdrawMutation.isPending}
                  onPress={handleWithdraw}
                >
                  Confirm withdraw
                </Button>
              </View>
            </>
          ) : (
            <Button variant="tertiary" fullWidth onPress={() => setConfirmingWithdraw(true)}>
              Withdraw claim
            </Button>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

function decisionNoticeHeading(kind: Claim['decisionNotices'][number]['kind']): string {
  switch (kind) {
    case 'rejection':
      return 'Claim rejection notice';
    case 'partial_approval_shortfall':
      return 'Partial approval notice';
    case 'administrative_close':
      return 'Claim closed notice';
    case 'more_info_request':
      return 'Information request';
    default:
      return 'Notice';
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
  },
  row: {
    marginBottom: spacing.md,
  },
  rowLabel: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginBottom: spacing.xs,
  },
  rowValue: {
    fontSize: typography.sizes.base,
    color: colors.textPrimary,
  },
  noteRow: {
    marginBottom: spacing.sm,
  },
  noteMeta: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginTop: spacing.xs,
  },
  noticeBlock: {
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
  },
  noticeHeading: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  noticeMeta: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    marginBottom: spacing.sm,
  },
  noticeParagraph: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    lineHeight: typography.sizes.base * 1.4,
    marginBottom: spacing.sm,
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  withdrawActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
