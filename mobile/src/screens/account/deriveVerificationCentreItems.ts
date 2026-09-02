import type { VerificationStatus } from '../../api/customer-profile';
import { formatPlanTierName } from '../../api/plans';
import type { Policy } from '../../api/policies';
import type { BadgeTone } from '../../theme/primitives/Badge';

export type VerificationItemState =
  | 'complete'
  | 'pending'
  | 'in_review'
  | 'action_required'
  | 'not_started';

export interface VerificationCentreItem {
  id: string;
  category: 'account' | 'profile' | 'identity' | 'plan' | 'security' | 'assets';
  title: string;
  statusLabel: string;
  description: string;
  state: VerificationItemState;
  tone: BadgeTone;
  href?: string;
  meta?: string;
}

function identityState(status: VerificationStatus): VerificationItemState {
  switch (status) {
    case 'verified':
      return 'complete';
    case 'pending_review':
      return 'in_review';
    case 'rejected':
    case 'action_required':
      return 'action_required';
    case 'in_progress':
      return 'pending';
    default:
      return 'not_started';
  }
}

function toneForState(state: VerificationItemState): BadgeTone {
  switch (state) {
    case 'complete':
      return 'emerald';
    case 'in_review':
      return 'gold';
    case 'action_required':
      return 'danger';
    case 'pending':
      return 'warning';
    default:
      return 'neutral';
  }
}

function labelForState(state: VerificationItemState): string {
  switch (state) {
    case 'complete':
      return 'Complete';
    case 'in_review':
      return 'Pending review';
    case 'action_required':
      return 'Action required';
    case 'pending':
      return 'Pending';
    default:
      return 'Not started';
  }
}

function policyState(status: string | undefined): VerificationItemState {
  switch (status) {
    case 'active':
      return 'complete';
    case 'pending_activation':
      return 'in_review';
    case 'past_due':
    case 'suspended':
      return 'action_required';
    default:
      return 'pending';
  }
}

function formatPolicyStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'pending_activation':
      return 'Pending activation';
    case 'past_due':
      return 'Payment past due';
    case 'active':
      return 'Active';
    case 'suspended':
      return 'Suspended';
    case 'cancelled':
      return 'Cancelled';
    case 'expired':
      return 'Expired';
    default:
      return status ? status.replace(/_/g, ' ') : 'Unknown';
  }
}

export function deriveVerificationCentreItems(input: {
  accountState?: string;
  email?: string;
  verificationStatus: VerificationStatus;
  verificationSubmittedAt?: string | null;
  completionChecklist: { id: string; label: string; done: boolean }[];
  policies: Policy[];
  assetCount: number;
}): VerificationCentreItem[] {
  const items: VerificationCentreItem[] = [];

  const emailState: VerificationItemState =
    input.accountState === 'active' ? 'complete' : 'pending';
  items.push({
    id: 'email',
    category: 'account',
    title: 'Email verification',
    statusLabel: emailState === 'complete' ? 'Verified' : 'Pending',
    description:
      emailState === 'complete'
        ? 'Your email address is confirmed.'
        : 'Confirm your email to unlock full protection features.',
    state: emailState,
    tone: toneForState(emailState),
    href: emailState === 'complete' ? undefined : '/verification-gate',
    meta: input.email,
  });

  for (const step of input.completionChecklist) {
    if (step.id === 'email' || step.id === 'identity' || step.id === 'plan' || step.id === 'asset') {
      continue;
    }
    const state: VerificationItemState = step.done ? 'complete' : 'pending';
    const href =
      step.done
        ? undefined
        : step.id === 'mfa'
          ? '/(app)/mfa-enroll'
          : '/(app)/account/profile';
    items.push({
      id: `profile-${step.id}`,
      category: step.id === 'mfa' ? 'security' : 'profile',
      title: step.label,
      statusLabel: labelForState(state),
      description: step.done
        ? 'This profile detail is on file.'
        : step.id === 'mfa'
          ? 'Enable two-factor authentication for stronger account security.'
          : 'Add this to your profile to continue setup.',
      state,
      tone: toneForState(state),
      href,
    });
  }

  const identity = identityState(input.verificationStatus);
  items.push({
    id: 'identity',
    category: 'identity',
    title: 'Identity verification',
    statusLabel:
      input.verificationStatus === 'verified'
        ? 'Verified'
        : input.verificationStatus === 'pending_review'
          ? 'Pending review'
          : input.verificationStatus === 'rejected'
            ? 'Rejected'
            : input.verificationStatus === 'action_required'
              ? 'Action required'
              : input.verificationStatus === 'in_progress'
                ? 'Ready to submit'
                : 'Not started',
    description:
      identity === 'complete'
        ? 'Your identity has been verified.'
        : identity === 'in_review'
          ? 'Our team is reviewing your submitted details.'
          : identity === 'action_required'
            ? 'Update your profile and resubmit for review.'
            : 'Complete your profile, then submit for identity review.',
    state: identity,
    tone: toneForState(identity),
    href:
      identity === 'complete' || identity === 'in_review'
        ? undefined
        : '/(app)/account/profile',
    meta: input.verificationSubmittedAt
      ? `Submitted ${new Date(input.verificationSubmittedAt).toLocaleDateString()}`
      : undefined,
  });

  if (input.policies.length === 0) {
    items.push({
      id: 'plan-none',
      category: 'plan',
      title: 'Protection plan',
      statusLabel: 'Not selected',
      description: 'Choose a plan to start protecting your registered assets.',
      state: 'pending',
      tone: 'warning',
      href: '/(app)/policy',
    });
  } else {
    for (const policy of input.policies) {
      const status = policy.status ?? 'pending_activation';
      const state = policyState(status);
      const planName = formatPlanTierName(policy.planTier);
      items.push({
        id: `plan-${policy.id ?? policy.planTier}`,
        category: 'plan',
        title: planName,
        statusLabel: formatPolicyStatusLabel(status),
        description:
          state === 'complete'
            ? 'Your plan is active and covering registered assets.'
            : state === 'in_review'
              ? 'Your plan request is received and awaiting activation or billing setup.'
              : 'This plan needs your attention before coverage is fully active.',
        state,
        tone: policyState(status) === 'complete' ? 'emerald' : toneForState(state),
        href: policy.id ? `/policy/${policy.id}` : '/(app)/policy',
        meta: policy.effectiveDate
          ? `Effective ${new Date(policy.effectiveDate).toLocaleDateString()}`
          : undefined,
      });
    }
  }

  const assetState: VerificationItemState = input.assetCount > 0 ? 'complete' : 'pending';
  items.push({
    id: 'asset',
    category: 'assets',
    title: 'Registered assets',
    statusLabel: assetState === 'complete' ? `${input.assetCount} registered` : 'None yet',
    description:
      assetState === 'complete'
        ? 'At least one asset is registered on your account.'
        : 'Register a device or vehicle to activate protection.',
    state: assetState,
    tone: toneForState(assetState),
    href: assetState === 'complete' ? '/(app)/assets' : '/(app)/assets/register',
  });

  return items;
}

export function partitionVerificationItems(items: VerificationCentreItem[]) {
  const pending = items.filter(
    (item) => item.state !== 'complete',
  );
  const complete = items.filter((item) => item.state === 'complete');
  return { pending, complete };
}
