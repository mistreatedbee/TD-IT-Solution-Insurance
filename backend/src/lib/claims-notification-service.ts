/**
 * SR-018-10/CR-018-7 (security-review.md §16.4) — email delivery for claims
 * adverse-decision notices (rejection, partial-approval shortfall,
 * administrative close). The notice itself is composed once, server-side,
 * and persisted on the claim (`lib/claim-decision-notice.ts`); this module's
 * only job is delivering that ALREADY-COMPOSED `renderedText` by email and
 * recording the attempt — it never re-renders or edits the notice text.
 *
 * Ordering contract (enforced by the caller, `routes/admin-claims.ts`): the
 * decision (status change + notice write) must already be committed before
 * this is invoked. A failed send here must never roll back, retry-block, or
 * otherwise affect the decision — it only records `{channel, attemptedAt,
 * succeeded}` on the specific notice's `deliveries[]` so it stays retryable
 * and visible to admins as "notice not yet delivered".
 */
import type { Env } from '../config/env.js';
import type { AccountsRepo } from '../repositories/accounts.js';
import type { ClaimsRepo } from '../repositories/claims.js';
import type { ClaimDecisionNotice } from './claim-decision-notice.js';
import { buildClaimDecisionNoticeEmail } from './domain-email-templates.js';
import { isResendConfigured, sendResendEmail } from './resend-email.js';

/** The three adverse-decision kinds this module ever emails. `more_info_request`
 * is not an adverse decision (§12.3 N-5) and is never passed here. */
const EMAILABLE_NOTICE_KINDS = ['rejection', 'partial_approval_shortfall', 'administrative_close'] as const;
type EmailableNoticeKind = (typeof EMAILABLE_NOTICE_KINDS)[number];

function isEmailableNoticeKind(kind: ClaimDecisionNotice['kind']): kind is EmailableNoticeKind {
  return (EMAILABLE_NOTICE_KINDS as readonly string[]).includes(kind);
}

export interface ClaimsNotificationService {
  /**
   * Sends (or records a failed attempt to send) the given, already-issued
   * notice's `renderedText` verbatim to the account's own VERIFIED email
   * address only (security-review.md §16.4 item 4: "Send only to the
   * customer's verified email"). Always resolves — never throws — so a
   * caller can safely fire this in the background after the decision has
   * already committed.
   */
  sendDecisionNoticeEmail(params: { accountId: string; claimId: string; notice: ClaimDecisionNotice }): Promise<void>;
}

export function createClaimsNotificationService(deps: {
  env: Env;
  accounts: AccountsRepo;
  claims: ClaimsRepo;
}): ClaimsNotificationService {
  return {
    async sendDecisionNoticeEmail({ accountId, claimId, notice }) {
      const attemptedAt = new Date().toISOString();
      let succeeded = false;

      try {
        if (!isEmailableNoticeKind(notice.kind)) {
          throw new Error(`claim decision notice kind "${notice.kind}" is not an adverse decision; not emailed`);
        }

        const account = await deps.accounts.findById(accountId);
        // §16.4 item 4 — only a customer account, and only once the
        // platform has an independent verified-email signal for it
        // (`accountState !== 'pending_verification'` is this codebase's
        // existing convention for "email verified", e.g.
        // `lib/sync-email-verification.ts`, `lib/gotrue-session-revocation.ts`).
        if (!account || account.userType !== 'customer' || account.accountState === 'pending_verification') {
          throw new Error(
            `cannot email claim decision notice: account ${accountId} not found, not a customer, or email not verified`,
          );
        }

        if (!isResendConfigured(deps.env)) {
          throw new Error('claim decision notice NOT sent — Resend is not configured on this backend');
        }

        // Send the STORED renderedText verbatim — the template is never
        // re-invoked here (`buildClaimDecisionNoticeEmail` only wraps the
        // existing string in branded HTML; it does not call any
        // `buildRejectionNotice`/`buildPartialApprovalShortfallNotice`/
        // `buildAdministrativeCloseNotice` composer).
        const email = buildClaimDecisionNoticeEmail({
          claimId,
          kind: notice.kind,
          renderedText: notice.renderedText,
        });
        await sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html });
        succeeded = true;
      } catch (err) {
        succeeded = false;
        // eslint-disable-next-line no-console
        console.error(
          '[claims-notification] decision notice email delivery failed',
          err instanceof Error ? err.message : err,
        );
      } finally {
        await deps.claims.appendNoticeDelivery(claimId, {
          noticeIssuedAt: notice.issuedAt,
          delivery: { channel: 'email', attemptedAt, succeeded },
        });
      }
    },
  };
}
