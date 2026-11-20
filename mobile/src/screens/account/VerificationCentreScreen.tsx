/**
 * Verification centre — unified view of email, profile, identity, plan, and asset status.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { verificationStatusLabel } from '../../api/customer-profile';
import {
  useCustomerProfileQuery,
  useSubmitVerificationMutation,
} from '../../api/hooks/useCustomerProfile';
import { usePoliciesQuery } from '../../api/hooks/usePolicies';
import { useAssetsQuery } from '../../api/hooks/useAssets';
import { useAccountQuery } from '../../auth/useAccountQuery';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  deriveVerificationCentreItems,
  partitionVerificationItems,
  type VerificationCentreItem,
} from './deriveVerificationCentreItems';
import { deriveApprovalChecklist } from './deriveApprovalChecklist';
import { DesignPage } from '../../components/DesignPage';
import { Button, GlassCard } from '../../design';
import { useDesignTokens, type DesignTokens } from '../../theme/designTheme';
import { Alert } from '../../theme/primitives';
import { PolicyStatusPill } from '../policy/PolicyStatusPill';

function VerificationStatusRow({
  item,
  onPress,
}: {
  item: VerificationCentreItem;
  onPress?: () => void;
}) {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const content = (
    <GlassCard variant="solid" style={styles.statusCard}>
      <View style={styles.statusHeader}>
        <View style={styles.statusCopy}>
          <Text style={styles.statusCategory}>
            {item.category.replace(/_/g, ' ')}
          </Text>
          <Text style={styles.statusTitle}>{item.title}</Text>
        </View>
        <PolicyStatusPill tone={item.tone}>{item.statusLabel}</PolicyStatusPill>
      </View>
      <Text style={styles.statusDescription}>{item.description}</Text>
      {item.meta ? <Text style={styles.statusMeta}>{item.meta}</Text> : null}
      {onPress ? <Text style={styles.statusLink}>View details</Text> : null}
    </GlassCard>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {content}
    </Pressable>
  );
}

export function VerificationCentreScreen() {
  const t = useDesignTokens();
  const styles = useMemo(() => buildStyles(t), [t]);
  const router = useRouter();
  const accountQuery = useAccountQuery();
  const profileQuery = useCustomerProfileQuery();
  const policiesQuery = usePoliciesQuery({ limit: 20 });
  const assetsQuery = useAssetsQuery({ limit: 1, status: 'active' });
  const submitMutation = useSubmitVerificationMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isLoading =
    profileQuery.isLoading || accountQuery.isLoading || policiesQuery.isLoading;

  const items = useMemo(() => {
    const profile = profileQuery.data;
    if (!profile) return [];
    return deriveVerificationCentreItems({
      accountState: accountQuery.data?.accountState,
      email: accountQuery.data?.email,
      verificationStatus: profile.verificationStatus,
      verificationSubmittedAt: profile.verificationSubmittedAt,
      completionChecklist: profile.completionChecklist,
      policies: policiesQuery.data?.data ?? [],
      assetCount: assetsQuery.data?.data?.length ?? 0,
    });
  }, [
    accountQuery.data,
    profileQuery.data,
    policiesQuery.data,
    assetsQuery.data,
  ]);

  const { pending, complete } = useMemo(
    () => partitionVerificationItems(items),
    [items],
  );

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync();
    } catch (err) {
      setSubmitError(mapUserFacingError(err, { context: 'profile' }));
    }
  }

  if (isLoading) {
    return (
      <DesignPage scroll={false} safeAreaEdges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={t.colors.link} />
        </View>
      </DesignPage>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <DesignPage safeAreaEdges={['bottom']}>
        <Alert tone="danger">
          {mapUserFacingError(profileQuery.error, { context: 'profile' })}
        </Alert>
        <Button
          label="Try again"
          onPress={() => profileQuery.refetch()}
          variant="secondary"
        />
      </DesignPage>
    );
  }

  const profile = profileQuery.data;
  const canSubmit =
    profile.verificationStatus === 'in_progress' ||
    profile.verificationStatus === 'not_started' ||
    profile.verificationStatus === 'rejected' ||
    profile.verificationStatus === 'action_required';

  function openItem(item: VerificationCentreItem) {
    if (item.href) router.push(item.href as Href);
  }

  return (
    <DesignPage
      safeAreaEdges={['bottom']}
      contentContainerStyle={{ paddingBottom: t.spacing.s4 }}
    >
      <Text style={styles.intro}>
        Track everything still pending for your account — email, profile,
        identity review, protection plans, and asset registration — in one
        place.
      </Text>

      <GlassCard variant="solid" style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Overall setup</Text>
        <Text style={styles.summaryValue}>
          {profile.completionPercent}% complete
        </Text>
        <Text style={styles.summaryHint}>
          {pending.length === 0
            ? 'All setup steps are complete.'
            : `${pending.length} item${pending.length === 1 ? '' : 's'} still pending or in review.`}
        </Text>
      </GlassCard>

      {profile.rejectionReasonCustomerSafe ? (
        <Alert tone="warning" style={styles.blockAlert}>
          {profile.rejectionReasonCustomerSafe}
        </Alert>
      ) : null}

      <Text style={styles.sectionHeading}>
        Pending & in review ({pending.length})
      </Text>
      {pending.length === 0 ? (
        <Alert tone="success" style={styles.blockAlert}>
          Nothing is waiting on you right now. Your identity status is{' '}
          {verificationStatusLabel(profile.verificationStatus).toLowerCase()}.
        </Alert>
      ) : (
        pending.map((item) => (
          <VerificationStatusRow
            key={item.id}
            item={item}
            onPress={item.href ? () => openItem(item) : undefined}
          />
        ))
      )}

      {complete.length > 0 ? (
        <>
          <Text style={styles.sectionHeading}>
            Completed ({complete.length})
          </Text>
          {complete.map((item) => (
            <VerificationStatusRow
              key={item.id}
              item={item}
              onPress={item.href ? () => openItem(item) : undefined}
            />
          ))}
        </>
      ) : null}

      <Text style={styles.sectionHeading}>What we need to approve you</Text>
      <GlassCard variant="solid" style={styles.card} testID="approval-checklist">
        {deriveApprovalChecklist(profile).map((item) => (
          <View key={item.id} style={styles.checklistRow}>
            <Text
              style={[styles.checklistMark, item.done ? styles.checklistDone : styles.checklistTodo]}
              accessibilityLabel={item.done ? 'Done' : 'Still needed'}
            >
              {item.done ? '\u2713' : '\u25CB'}
            </Text>
            <Text style={item.done ? styles.checklistLabelDone : styles.value}>{item.label}</Text>
          </View>
        ))}
      </GlassCard>

      <Text style={styles.sectionHeading}>Identity submission</Text>
      <GlassCard variant="solid" style={styles.card}>
        <View style={styles.identityRow}>
          <Text style={styles.label}>Current status</Text>
          <PolicyStatusPill
            tone={
              profile.verificationStatus === 'verified' ? 'emerald' : 'gold'
            }
          >
            {verificationStatusLabel(profile.verificationStatus)}
          </PolicyStatusPill>
        </View>
        {profile.idNumberMasked ? (
          <Text style={styles.value}>ID on file: {profile.idNumberMasked}</Text>
        ) : null}
      </GlassCard>

      {submitError ? <Alert tone="danger">{submitError}</Alert> : null}

      {profile.verificationStatus === 'verified' ? (
        <Alert tone="success">
          Your identity is verified. No further action needed.
        </Alert>
      ) : profile.verificationStatus === 'pending_review' ? (
        <Alert tone="info">
          Your identity details are with our team. We will notify you when
          review is complete.
        </Alert>
      ) : (
        <>
          <Button
            label={
              submitMutation.isPending
                ? 'Submitting…'
                : 'Submit identity for review'
            }
            onPress={() => void handleSubmit()}
            disabled={!canSubmit || submitMutation.isPending}
            style={[styles.stretch, styles.button]}
          />
          <Button
            label="Edit profile details"
            onPress={() => router.push('/account/profile')}
            variant="secondary"
            style={styles.stretch}
          />
        </>
      )}
    </DesignPage>
  );
}

function buildStyles(t: DesignTokens) {
  return StyleSheet.create({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    intro: {
      ...t.type.bodySm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s4,
    },
    summaryCard: { marginBottom: t.spacing.s4 },
    summaryLabel: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      marginBottom: t.spacing.s1,
    },
    summaryValue: { ...t.type.displayMd, color: t.colors.ink },
    summaryHint: {
      ...t.type.bodySm,
      marginTop: t.spacing.s1,
      color: t.colors.inkMuted,
    },
    sectionHeading: {
      ...t.type.label,
      color: t.colors.ink,
      marginBottom: t.spacing.s2,
      marginTop: t.spacing.s3,
    },
    statusCard: { marginBottom: t.spacing.s2 },
    statusHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: t.spacing.s2,
      marginBottom: t.spacing.s2,
    },
    statusCopy: { flex: 1 },
    statusCategory: {
      ...t.type.labelSm,
      color: t.colors.inkMuted,
      textTransform: 'capitalize',
      marginBottom: 2,
    },
    statusTitle: { ...t.type.label, color: t.colors.ink },
    statusDescription: { ...t.type.bodySm, color: t.colors.inkMuted },
    statusMeta: {
      ...t.type.labelSm,
      marginTop: t.spacing.s1,
      color: t.colors.inkMuted,
    },
    statusLink: {
      ...t.type.label,
      marginTop: t.spacing.s2,
      color: t.colors.link,
    },
    blockAlert: { marginBottom: t.spacing.s3 },
    card: { marginBottom: t.spacing.s4 },
    identityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.s2,
      marginBottom: t.spacing.s2,
    },
    label: { ...t.type.labelSm, color: t.colors.inkMuted },
    value: { ...t.type.bodySm, color: t.colors.ink },
    button: { marginTop: t.spacing.s4, marginBottom: t.spacing.s3 },
    checklistRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.s2,
      paddingVertical: t.spacing.s1,
    },
    checklistMark: { ...t.type.label, width: 20, textAlign: 'center' },
    checklistDone: { color: t.colors.success },
    checklistTodo: { color: t.colors.inkMuted },
    checklistLabelDone: { ...t.type.bodySm, color: t.colors.inkMuted },
    stretch: { alignSelf: 'stretch' },
  });
}
