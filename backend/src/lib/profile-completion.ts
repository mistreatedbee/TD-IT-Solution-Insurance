import type { AccountState } from '../repositories/accounts.js';

export type VerificationStatus =
  | 'not_started'
  | 'in_progress'
  | 'pending_review'
  | 'verified'
  | 'rejected'
  | 'action_required';

export interface ProfileCompletionInput {
  accountState: AccountState;
  mfaEnrolled: boolean;
  hasPolicy: boolean;
  hasAsset: boolean;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  city: string | null;
  emergencyContactName: string | null;
  idNumberLast4: string | null;
  verificationStatus: VerificationStatus;
}

export interface ProfileChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface ProfileCompletionResult {
  percent: number;
  checklist: ProfileChecklistItem[];
}

export function computeProfileCompletion(input: ProfileCompletionInput): ProfileCompletionResult {
  const checklist: ProfileChecklistItem[] = [
    {
      id: 'email',
      label: 'Email verified',
      done: input.accountState === 'active',
    },
    {
      id: 'name',
      label: 'Full name',
      done: Boolean(input.firstName?.trim() && input.lastName?.trim()),
    },
    {
      id: 'phone',
      label: 'Phone number',
      done: Boolean(input.phone?.trim()),
    },
    {
      id: 'address',
      label: 'Residential address',
      done: Boolean(input.city?.trim()),
    },
    {
      id: 'emergency',
      label: 'Emergency contact',
      done: Boolean(input.emergencyContactName?.trim()),
    },
    {
      id: 'identity',
      label: 'Identity verification',
      done:
        input.verificationStatus === 'verified' ||
        input.verificationStatus === 'pending_review',
    },
    {
      id: 'mfa',
      label: 'Two-factor authentication',
      done: input.mfaEnrolled,
    },
    {
      id: 'plan',
      label: 'Protection plan',
      done: input.hasPolicy,
    },
    {
      id: 'asset',
      label: 'Registered asset',
      done: input.hasAsset,
    },
  ];

  const done = checklist.filter((c) => c.done).length;
  const percent = checklist.length === 0 ? 0 : Math.round((done / checklist.length) * 100);

  return { percent, checklist };
}

export function maskIdNumberLast4(last4: string | null): string | null {
  if (!last4) return null;
  return `********${last4}`;
}
