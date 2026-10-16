/**
 * SR-14(b) reconciliation, extended per INC-003 A-19 (A-5 threat model §3
 * row C-10) — pure logic, no I/O. The runner is
 * `backend/scripts/sr14b-mfa-factor-reconciliation.ts`; scheduling and
 * alert routing are `site-reliability-engineer`'s (not done here).
 *
 * Two checks:
 *
 * 1. **SR-14(b) as originally specified** (Feature 001 security-review §5):
 *    every `mfa_required` account must hold >=1 verified TOTP factor. A
 *    violation means a factor was removed out-of-band (e.g. via
 *    `service_role`) — BR-4's "no bypass" is only verifiable with this.
 * 2. **A-19 extension:** every *verified* TOTP factor must correspond to a
 *    backend-mediated enrolment, i.e. an `mfa_enrolled` audit event for the
 *    same account written within the enrolment window after the factor was
 *    created (`POST /mfa/enroll` creates the factor; `POST /mfa/enroll/verify`
 *    writes `mfa_enrolled`; the pending-enrolment record that links them
 *    lives at most `ENROLLMENT_TICKET_TTL_SECONDS`). A verified factor with no
 *    such event was enrolled GoTrue-direct with the published anon key — the
 *    C-10 durable-ATO primitive — and must be investigated as a suspected
 *    account takeover, not auto-remediated.
 *
 * Each audit event can vouch for at most one factor, so an attacker factor
 * enrolled shortly after a legitimate one is not hidden by the legitimate
 * event.
 */
import { ENROLLMENT_TICKET_TTL_SECONDS } from './policy.js';

/** Allowance for clock skew between GoTrue and the backend's Postgres writes. */
export const RECONCILIATION_CLOCK_SKEW_SECONDS = 60;

export interface ReconciliationAccount {
  accountId: string;
  mfaRequired: boolean;
  userType: string;
}

export interface ReconciliationFactor {
  factorId: string;
  factorType: string;
  status: string;
  createdAt: Date;
}

export type ReconciliationFinding =
  | {
      kind: 'mfa_required_without_verified_factor';
      accountId: string;
      userType: string;
    }
  | {
      kind: 'verified_factor_without_backend_enrolment';
      accountId: string;
      userType: string;
      factorId: string;
      factorCreatedAt: string;
    };

export function reconcileMfaFactors(input: {
  accounts: ReconciliationAccount[];
  factorsByAccount: ReadonlyMap<string, ReconciliationFactor[]>;
  /** `mfa_enrolled` audit-event timestamps per account. */
  enrolmentEventsByAccount: ReadonlyMap<string, Date[]>;
}): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const windowAfterMs = (ENROLLMENT_TICKET_TTL_SECONDS + RECONCILIATION_CLOCK_SKEW_SECONDS) * 1000;
  const windowBeforeMs = RECONCILIATION_CLOCK_SKEW_SECONDS * 1000;

  for (const account of input.accounts) {
    const verified = (input.factorsByAccount.get(account.accountId) ?? [])
      .filter((f) => f.factorType === 'totp' && f.status === 'verified')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (account.mfaRequired && verified.length === 0) {
      findings.push({
        kind: 'mfa_required_without_verified_factor',
        accountId: account.accountId,
        userType: account.userType,
      });
    }

    const unusedEvents = [...(input.enrolmentEventsByAccount.get(account.accountId) ?? [])]
      .map((d) => d.getTime())
      .sort((a, b) => a - b);

    for (const factor of verified) {
      const created = factor.createdAt.getTime();
      const matchIndex = unusedEvents.findIndex(
        (t) => t >= created - windowBeforeMs && t <= created + windowAfterMs,
      );
      if (matchIndex >= 0) {
        unusedEvents.splice(matchIndex, 1);
        continue;
      }
      findings.push({
        kind: 'verified_factor_without_backend_enrolment',
        accountId: account.accountId,
        userType: account.userType,
        factorId: factor.factorId,
        factorCreatedAt: factor.createdAt.toISOString(),
      });
    }
  }

  return findings;
}
