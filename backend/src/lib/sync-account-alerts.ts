/**
 * Upsert system-derived alerts from current account state — mirrors mobile deriveAlerts.
 */
import type { AppContext } from '../context.js';
import type { UpsertAlertInput } from '../repositories/alerts.js';

export async function syncAccountAlerts(ctx: AppContext, accountId: string): Promise<void> {
  const [account, profile, policies, assets, recoveryCases] = await Promise.all([
    ctx.accounts.findById(accountId),
    ctx.customerProfiles.findByAccountId(accountId),
    ctx.policies.listByAccount(accountId, 50, null),
    ctx.assets.listByAccount(accountId, 50, null, 'active'),
    ctx.recoveryCases.listByAccount(accountId, 50, null),
  ]);

  if (!account) return;

  const status = await ctx.accounts.getAccountStatus(accountId);
  const accountState = status?.accountState ?? 'pending_verification';
  const hasPolicy = policies.length > 0;
  const assetCount = assets.length;
  const openRecoveryCount = recoveryCases.filter(
    (c) => c.status !== 'closed' && c.status !== 'recovered',
  ).length;

  let profilePercent = 0;
  let verificationStatus: string | undefined;
  if (profile) {
    const { computeProfileCompletion } = await import('./profile-completion.js');
    const completion = computeProfileCompletion({
      accountState,
      mfaEnrolled: false,
      hasPolicy,
      hasAsset: assetCount > 0,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      city: profile.residentialAddress?.city ?? null,
      emergencyContactName: profile.emergencyContact?.name ?? null,
      idNumberLast4: profile.idNumberLast4,
      verificationStatus: profile.verificationStatus,
    });
    profilePercent = completion.percent;
    verificationStatus = profile.verificationStatus;
  }

  const upserts: UpsertAlertInput[] = [];

  if (accountState === 'pending_verification') {
    upserts.push({
      dedupeKey: 'verify-email',
      severity: 'high',
      category: 'account',
      title: 'Verify your email',
      body: 'Confirm your email to unlock full protection features.',
      href: '/verification-gate',
      source: 'system',
    });
  }

  if (profile && profilePercent < 100) {
    upserts.push({
      dedupeKey: 'complete-profile',
      severity: 'info',
      category: 'account',
      title: 'Complete your profile',
      body: 'Add a few details to strengthen your protection setup.',
      href: '/account/profile',
      source: 'system',
    });
  }

  if (profile) {
    if (verificationStatus === 'rejected' || verificationStatus === 'action_required') {
      upserts.push({
        dedupeKey: 'verification-action',
        severity: 'warning',
        category: 'account',
        title: 'Identity verification needs attention',
        body: profile.rejectionReasonCustomerSafe ?? 'Review your details and resubmit for verification.',
        href: '/account/verification',
        source: 'verification',
      });
    } else if (verificationStatus === 'pending_review') {
      upserts.push({
        dedupeKey: 'verification-pending',
        severity: 'info',
        category: 'account',
        title: 'Identity verification in review',
        body: 'Our team is reviewing your submitted details.',
        href: '/account/verification',
        source: 'verification',
      });
    } else if (verificationStatus === 'in_progress' || verificationStatus === 'not_started') {
      upserts.push({
        dedupeKey: 'submit-verification',
        severity: 'info',
        category: 'account',
        title: 'Submit identity verification',
        body: 'Complete verification to unlock full recovery support.',
        href: '/account/verification',
        source: 'verification',
      });
    } else if (verificationStatus === 'verified') {
      upserts.push({
        dedupeKey: 'verification-verified',
        severity: 'info',
        category: 'account',
        title: 'Identity verified',
        body: 'Your identity has been verified successfully.',
        href: '/account/verification',
        source: 'verification',
      });
    }
  }

  if (assetCount === 0) {
    upserts.push({
      dedupeKey: 'first-asset',
      severity: 'info',
      category: 'insurance',
      title: 'Protect your first asset',
      body: 'Register a device or vehicle to start your coverage.',
      href: '/assets/register',
      source: 'system',
    });
  } else if (!hasPolicy) {
    upserts.push({
      dedupeKey: 'choose-plan',
      severity: 'warning',
      category: 'insurance',
      title: 'Choose a protection plan',
      body: 'Select a plan to activate coverage for your assets.',
      href: '/policies',
      source: 'policy',
    });
  }

  for (const policy of policies) {
    if (policy.status === 'pending_activation') {
      upserts.push({
        dedupeKey: `plan-pending-${policy.id}`,
        severity: 'info',
        category: 'insurance',
        title: 'Plan pending activation',
        body: 'Your protection plan is awaiting activation or billing setup.',
        href: policy.id ? `/policies/${policy.id}` : '/policies',
        source: 'policy',
      });
    }
  }

  if (openRecoveryCount > 0) {
    upserts.push({
      dedupeKey: 'open-recovery',
      severity: 'high',
      category: 'security',
      title:
        openRecoveryCount === 1
          ? '1 open recovery case'
          : `${openRecoveryCount} open recovery cases`,
      body: 'View case progress and last known locations.',
      href: '/recovery',
      source: 'recovery',
    });
  }

  for (const input of upserts) {
    await ctx.alerts.upsertForAccount(accountId, input);
  }
  await ctx.alerts.dismissStaleKeys(
    accountId,
    upserts.map((u) => u.dedupeKey),
  );
}
