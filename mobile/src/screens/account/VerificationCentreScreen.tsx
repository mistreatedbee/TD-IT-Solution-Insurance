/**
 * Verification centre — unified view of email, profile, identity, plan, and asset status.
 */
import { useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { verificationStatusLabel } from '../../api/customer-profile';
import {
  useCustomerProfileQuery,
  useSubmitVerificationMutation,
} from '../../api/hooks/useCustomerProfile';
import { usePoliciesQuery } from '../../api/hooks/usePolicies';
import { useAssetsQuery } from '../../api/hooks/useAssets';
import { useAccountQuery } from '../../auth/useAccountQuery';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../navigation/tabBarMetrics';
import {
  deriveVerificationCentreItems,
  partitionVerificationItems,
  type VerificationCentreItem,
} from './deriveVerificationCentreItems';
import { Alert, Badge, Button, Card, Screen } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

function VerificationStatusRow({
  item,
  onPress,
}: {
  item: VerificationCentreItem;
  onPress?: () => void;
}) {
  const content = (
    <Card style={styles.statusCard} padding="md">
      <View style={styles.statusHeader}>
        <View style={styles.statusCopy}>
          <Text style={styles.statusCategory}>{item.category.replace(/_/g, ' ')}</Text>
          <Text style={styles.statusTitle}>{item.title}</Text>
        </View>
        <Badge tone={item.tone}>{item.statusLabel}</Badge>
      </View>
      <Text style={styles.statusDescription}>{item.description}</Text>
      {item.meta ? <Text style={styles.statusMeta}>{item.meta}</Text> : null}
      {onPress ? <Text style={styles.statusLink}>View details</Text> : null}
    </Card>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {content}
    </Pressable>
  );
}

export function VerificationCentreScreen() {
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

  const { pending, complete } = useMemo(() => partitionVerificationItems(items), [items]);

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
      <Screen scroll={false} safeAreaEdges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <Screen safeAreaEdges={['bottom']}>
        <Alert tone="danger">
          {mapUserFacingError(profileQuery.error, { context: 'profile' })}
        </Alert>
        <Button variant="secondary" onPress={() => profileQuery.refetch()}>
          Try again
        </Button>
      </Screen>
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
    <Screen
      safeAreaEdges={['bottom']}
      contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE + spacing.lg }}
    >
      <Text style={styles.intro}>
        Track everything still pending for your account — email, profile, identity review,
        protection plans, and asset registration — in one place.
      </Text>

      <Card style={styles.summaryCard} padding="md">
        <Text style={styles.summaryLabel}>Overall setup</Text>
        <Text style={styles.summaryValue}>{profile.completionPercent}% complete</Text>
        <Text style={styles.summaryHint}>
          {pending.length === 0
            ? 'All setup steps are complete.'
            : `${pending.length} item${pending.length === 1 ? '' : 's'} still pending or in review.`}
        </Text>
      </Card>

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
          <Text style={styles.sectionHeading}>Completed ({complete.length})</Text>
          {complete.map((item) => (
            <VerificationStatusRow
              key={item.id}
              item={item}
              onPress={item.href ? () => openItem(item) : undefined}
            />
          ))}
        </>
      ) : null}

      <Text style={styles.sectionHeading}>Identity submission</Text>
      <Card style={styles.card} padding="md">
        <View style={styles.identityRow}>
          <Text style={styles.label}>Current status</Text>
          <Badge tone={profile.verificationStatus === 'verified' ? 'emerald' : 'gold'}>
            {verificationStatusLabel(profile.verificationStatus)}
          </Badge>
        </View>
        {profile.idNumberMasked ? (
          <Text style={styles.value}>ID on file: {profile.idNumberMasked}</Text>
        ) : null}
      </Card>

      {submitError ? <Alert tone="danger">{submitError}</Alert> : null}

      {profile.verificationStatus === 'verified' ? (
        <Alert tone="success">Your identity is verified. No further action needed.</Alert>
      ) : profile.verificationStatus === 'pending_review' ? (
        <Alert tone="info">
          Your identity details are with our team. We will notify you when review is complete.
        </Alert>
      ) : (
        <>
          <Button
            fullWidth
            onPress={() => void handleSubmit()}
            disabled={!canSubmit || submitMutation.isPending}
            style={styles.button}
          >
            {submitMutation.isPending ? 'Submitting…' : 'Submit identity for review'}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onPress={() => router.push('/(app)/account/profile')}
          >
            Edit profile details
          </Button>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intro: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  summaryCard: {
    marginBottom: spacing.lg,
  },
  summaryLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700',
    color: colors.textPrimary,
  },
  summaryHint: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  sectionHeading: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  statusCard: {
    marginBottom: spacing.sm,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statusCopy: {
    flex: 1,
  },
  statusCategory: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
    textTransform: 'capitalize',
    marginBottom: 2,
  },
  statusTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  statusMeta: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
  },
  statusLink: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  blockAlert: {
    marginBottom: spacing.md,
  },
  card: {
    marginBottom: spacing.lg,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  value: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  button: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
