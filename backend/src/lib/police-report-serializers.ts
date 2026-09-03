/**
 * Feature 011 (SAPS case-number capture) — CUSTOMER-ONLY serializers.
 *
 * SR-011-1c: these two functions are the only code in this backend that reads
 * `sapsCaseNumber` / `reportingStation` / `reportedToPoliceAt` / `policeReportHistory` /
 * `policeReportReminderSentAt` off a `RecoveryCaseDocument` and puts it on the wire.
 * They exist in their own module, deliberately separate from
 * `repositories/recovery-cases.ts`'s `serializeSecurityRecoveryCase`, so that:
 *
 *   1. `backend/src/routes/security-cases.ts` and `backend/src/routes/support-lookup.ts`
 *      can carry an ESLint `no-restricted-imports` rule (see `.eslintrc.cjs`) forbidding
 *      import of this module by path — a wrong import becomes a lint/build failure, not
 *      a code-review catch (C-011-9 / compliance-review-saps-case-data.md §6).
 *   2. The repository's partner-facing read paths (`listForPartnerOrg`,
 *      `findByIdForPartnerOrg`, `claimForPartnerOrg`, `updateStatusForPartnerOrg`)
 *      additionally project these fields OUT of the query itself (SR-011-1a) — so even
 *      if this module were imported into a partner-facing route by mistake, the document
 *      it would be called on there never has the fields populated in the first place.
 *
 * DO NOT import this module from `security-cases.ts`, `support-lookup.ts`, or any other
 * security-company / support-agent-facing route without a fresh Stage 8 review.
 */
import { serializeRecoveryCase, type RecoveryCaseDocument } from '../repositories/recovery-cases.js';

export function serializePoliceReport(doc: RecoveryCaseDocument) {
  return {
    sapsCaseNumber: doc.sapsCaseNumber,
    reportingStation: doc.reportingStation,
    reportedToPoliceAt: doc.reportedToPoliceAt?.toISOString().slice(0, 10) ?? null,
    history: (doc.policeReportHistory ?? []).map((h) => ({
      field: h.field,
      previousValue: h.previousValue,
      newValue: h.newValue,
      changedAt: h.changedAt.toISOString(),
    })),
  };
}

/** Used ONLY by recovery.ts's customer-facing GET/PATCH handlers. */
export function serializeRecoveryCaseForCustomer(doc: RecoveryCaseDocument) {
  return {
    ...serializeRecoveryCase(doc),
    policeReport: serializePoliceReport(doc),
  };
}
