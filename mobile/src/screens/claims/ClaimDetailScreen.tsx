/**
 * Claim detail — Feature 018 backend (GET/PATCH /v1/claims/:claimId*).
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  useClaimQuery,
  useRespondToClaimMutation,
  useWithdrawClaimMutation,
} from '../../api/hooks/useClaims';
import type { Claim } from '../../api/claims';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert, Input } from '../../theme/primitives';
import { PolicyStatusPill } from '../policy/PolicyStatusPill';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  claimStatusBadgeTone,
  formatClaimStatus,
  isClaimWithdrawable,
} from '../../lib/claim-labels';
import { formatAssetType } from '../../lib/asset-labels';
import type { AssetType } from '../../api/assets';

export function ClaimDetailScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: claim, isLoading, isError, error } = useClaimQuery(id);
  const respondMutation = useRespondToClaimMutation(id ?? '');
  const withdrawMutation = useWithdrawClaimMutation(id ?? '');

  const [responseText, setResponseText] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  if (isLoading) {
    return (
      <DesignPage scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={t.colors.link} />
        </View>
      </DesignPage>
    );
  }

  if (isError || !claim) {
    return (
      <DesignPage>
        <Text style={styles.title}>Claim</Text>
        <Alert tone="danger">
          {mapUserFacingError(error, { context: 'claim' })}
        </Alert>
      </DesignPage>
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

  // CR-018-12a (security-review.md §21.3/§22): when decision notices exist, the most recent
  // notice must be the primary content of the screen — directly under the status badge, before
  // the details card — not a separate "Rejection reason" summary buried further down.
  const hasDecisionNotices = claim.decisionNotices.length > 0;
  const sortedNotices = hasDecisionNotices
    ? [...claim.decisionNotices].sort(
        (a, b) =>
          new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
      )
    : [];

  const decisionNoticesCard = hasDecisionNotices ? (
    <GlassCard variant="solid" style={styles.section}>
      <Text style={styles.sectionTitle}>
        Important notices about this claim
      </Text>
      {sortedNotices.map((notice, idx) => (
        <View
          key={idx}
          style={styles.noticeBlock}
          testID={`decision-notice-${idx}`}
        >
          <Text style={styles.noticeHeading}>
            {decisionNoticeHeading(notice.kind)}
          </Text>
          <Text style={styles.noticeMeta}>
            {new Date(notice.issuedAt).toLocaleString()}
          </Text>
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
    </GlassCard>
  ) : null;

  return (
    <DesignPage>
      <Text style={styles.title}>{claim.assetDisplayName}</Text>
      <PolicyStatusPill tone={claimStatusBadgeTone(claim.status)}>
        {formatClaimStatus(claim.status)}
      </PolicyStatusPill>

      {decisionNoticesCard}

      <GlassCard variant="solid" style={styles.section}>
        <DetailRow
          label="Asset type"
          value={formatAssetType(claim.assetType as AssetType)}
        />
        <DetailRow label="Policy plan" value={claim.policyPlanTier} />
        <DetailRow
          label="Submitted"
          value={new Date(claim.submittedAt).toLocaleString()}
        />
        <DetailRow
          label="Incident date"
          value={new Date(claim.incidentDate).toLocaleDateString()}
        />
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
        {claim.recoveryCaseId ? (
          <DetailRow label="Recovery case" value={claim.recoveryCaseId} />
        ) : null}
      </GlassCard>

      <GlassCard variant="solid" style={styles.section}>
        <Text style={styles.sectionTitle}>Incident description</Text>
        <Text style={styles.body}>{claim.incidentDescription}</Text>
      </GlassCard>

      {claim.evidenceDescription ? (
        <GlassCard variant="solid" style={styles.section}>
          <Text style={styles.sectionTitle}>Evidence description</Text>
          <Text style={styles.body}>{claim.evidenceDescription}</Text>
        </GlassCard>
      ) : null}

      {!hasDecisionNotices && claim.rejectionReason ? (
        <GlassCard variant="solid" style={styles.section}>
          <Text style={styles.sectionTitle}>Rejection reason</Text>
          <Text style={styles.body}>{claim.rejectionReason}</Text>
        </GlassCard>
      ) : null}

      {claim.quantumReason ? (
        <GlassCard variant="solid" style={styles.section}>
          <Text style={styles.sectionTitle}>
            Why the approved amount differs from what you claimed
          </Text>
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
        </GlassCard>
      ) : null}

      {claim.closeReason ? (
        <GlassCard variant="solid" style={styles.section}>
          <Text style={styles.sectionTitle}>Reason this claim was closed</Text>
          <Text style={styles.body}>{claim.closeReason}</Text>
        </GlassCard>
      ) : null}

      {claim.reviewNotes.length > 0 ? (
        <GlassCard variant="solid" style={styles.section}>
          <Text style={styles.sectionTitle}>Reviewer notes</Text>
          {claim.reviewNotes.map((note, idx) => (
            <View key={idx} style={styles.noteRow}>
              <Text style={styles.body}>{note.text}</Text>
              <Text style={styles.noteMeta}>
                {new Date(note.createdAt).toLocaleString()}
              </Text>
            </View>
          ))}
        </GlassCard>
      ) : null}

      {actionError ? (
        <View style={styles.section}>
          <Alert tone="danger">{actionError}</Alert>
        </View>
      ) : null}

      {claim.status === 'more_info_requested' ? (
        <GlassCard variant="solid" style={styles.section}>
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
            label="Send response"
            loading={respondMutation.isPending}
            disabled={responseText.trim().length === 0}
            onPress={handleRespond}
            style={styles.stretch}
          />
        </GlassCard>
      ) : null}

      {isClaimWithdrawable(claim.status) ? (
        <View style={styles.section}>
          {confirmingWithdraw ? (
            <>
              <Alert tone="warning">
                Withdraw this claim? This cannot be undone.
              </Alert>
              <View style={styles.withdrawActions}>
                <Button
                  label="Cancel"
                  disabled={withdrawMutation.isPending}
                  onPress={() => setConfirmingWithdraw(false)}
                  variant="glass"
                  style={styles.stretch}
                />
                <Button
                  label="Confirm withdraw"
                  loading={withdrawMutation.isPending}
                  onPress={handleWithdraw}
                  variant="secondary"
                  style={styles.stretch}
                />
              </View>
            </>
          ) : (
            <Button
              label="Withdraw claim"
              onPress={() => setConfirmingWithdraw(true)}
              variant="glass"
              style={styles.stretch}
            />
          )}
        </View>
      ) : null}
    </DesignPage>
  );
}

function decisionNoticeHeading(
  kind: Claim['decisionNotices'][number]['kind'],
): string {
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
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    title: {
      ...t.type.displayMd,
      color: t.colors.ink,
      marginBottom: t.spacing.s2,
    },
    section: { marginTop: t.spacing.s4 },
    sectionTitle: {
      ...t.type.label,
      color: t.colors.ink,
      marginBottom: t.spacing.s2,
    },
    body: { ...t.type.body, color: t.colors.inkMuted },
    row: { marginBottom: t.spacing.s3 },
    rowLabel: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s1,
    },
    rowValue: { ...t.type.body, color: t.colors.ink },
    noteRow: { marginBottom: t.spacing.s2 },
    noteMeta: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      marginTop: t.spacing.s1,
    },
    noticeBlock: {
      marginBottom: t.spacing.s4,
      paddingBottom: t.spacing.s3,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.inkMuted,
    },
    noticeHeading: { ...t.type.label, color: t.colors.ink },
    noticeMeta: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s2,
    },
    noticeParagraph: {
      ...t.type.body,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s2,
    },
    multilineInput: { minHeight: 100, textAlignVertical: 'top' },
    withdrawActions: {
      flexDirection: 'row',
      gap: t.spacing.s3,
      marginTop: t.spacing.s3,
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    stretch: { alignSelf: 'stretch' },
  });
}
