import { NON_TERMINAL_CLAIM_STATUSES, type ClaimStatus } from '../api/claims';
import type { BadgeTone } from '../theme/primitives/Badge';

/**
 * Status copy — no payment integration exists yet (see CLAUDE.md "Not
 * built"), so `approved`/`awaiting_payout` must read as "payout pending",
 * never imply money has already moved.
 */
const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  more_info_requested: 'More info requested',
  approved: 'Approved — payout pending',
  awaiting_payout: 'Approved — payout pending',
  rejected: 'Rejected',
  closed: 'Closed',
};

export function formatClaimStatus(status: ClaimStatus): string {
  return CLAIM_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

const CLAIM_STATUS_TONE: Record<ClaimStatus, BadgeTone> = {
  submitted: 'neutral',
  under_review: 'accent',
  more_info_requested: 'warning',
  approved: 'emerald',
  awaiting_payout: 'emerald',
  rejected: 'danger',
  closed: 'neutral',
};

export function claimStatusBadgeTone(status: ClaimStatus): BadgeTone {
  return CLAIM_STATUS_TONE[status] ?? 'neutral';
}

/** Statuses from which the customer may still withdraw (any non-terminal). */
export function isClaimWithdrawable(status: ClaimStatus): boolean {
  return NON_TERMINAL_CLAIM_STATUSES.has(status);
}
