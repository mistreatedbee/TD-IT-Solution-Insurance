/**
 * Feature 018 — server-composed, versioned claim decision notices.
 *
 * security-review.md §12.3 (compliance-specialist ruling, SR-018-6): "Free
 * text plus admin training is not sufficient." Every admin-initiated
 * `rejected` claim, the shortfall on a partial `approved`, and an
 * administrative `closed` must carry a notice assembled from a versioned
 * template, never an admin's free text alone. The admin's own text (ground
 * reason / quantum reason / close reason) fills exactly ONE slot in a
 * server-composed document; it is never the whole notice.
 *
 * Minimum content, per §12.3 N-2 (full/partial rejection), N-4
 * (administrative close) and N-5 (more-info request):
 *   1. the decision and its date,
 *   2. a structured ground code + the admin's plain-language reason (+ a
 *      policy clause, when the admin supplies one),
 *   3. the right to make representations within at least 90 days,
 *   4. the internal complaints contact,
 *   5. the National Financial Ombud Scheme (NFO) and FAIS Ombud contacts,
 *   6. any policy legal-action time limit (and that the 90-day window does
 *      not count against it),
 *   7. that the customer can re-file,
 *   8. insurer name, licence number and FSP number.
 *
 * All of #4, #5 and #8's contact/licence details are sourced from
 * `ctx.env.claimsNotice` (`config/env.ts`) — NOT hard-coded here — because
 * none of them are confirmed real yet (Feature 002 §12.5.1 is open, and the
 * NFO/FAIS Ombud details still need verification per §12.3 item 5). Where a
 * required config value is missing or blank, `buildClaimDecisionNotice`
 * throws `ClaimDecisionNoticeConfigError` rather than silently rendering a
 * blank or omitted line — "No notice goes out with required fields blank."
 *
 * Explicitly OUT of scope here (§12.3 N-6/N-7, and the dispatcher's task
 * description): actually emailing the notice — blocked on the Resend owner
 * action, tracked separately — and `technical-writer`/legal review of the
 * final copy. Every string below is placeholder copy that obviously still
 * needs a real compliance/legal pass; it exists so a future delivery
 * mechanism and `technical-writer` have real structured content to work
 * from, not final customer-facing language.
 */
import type { Env } from '../config/env.js';

/**
 * Bumped whenever the template's rendered wording or required-field set
 * changes. `renderedText` is persisted as-issued on the claim
 * (`ClaimDocument.decisionNotices[]`) and is never re-rendered — a later
 * template version must never retroactively alter a notice already issued
 * (§12.3 N-1: "A later template change must never re-render old notices.").
 */
export const CLAIM_DECISION_NOTICE_TEMPLATE_VERSION = 1;

/**
 * §12.3 N-2 item 2 — v1 ground codes. Compliance's ruling did not supply an
 * exact list ("compliance didn't give an exact list" per the dispatch);
 * these are reasonable short-term-insurance rejection grounds chosen to
 * cover this product's claim surface:
 *   - LOSS_OUTSIDE_PERIOD_OF_COVER: incident predates policy inception,
 *     asset registration, or falls inside the 30-day waiting period
 *     (§12.2's eligibility-hold ground).
 *   - EXCLUDED_EVENT_OR_CAUSE: a disclosed policy exclusion applies to the
 *     cause of loss (e.g. wear and tear, consequential loss).
 *   - INSUFFICIENT_EVIDENCE_OF_LOSS: the admin isn't satisfied the loss, as
 *     described, actually occurred.
 *   - INSUFFICIENT_EVIDENCE_OF_OWNERSHIP: the admin isn't satisfied the
 *     claimant owned/had an insurable interest in the asset.
 *   - MISREPRESENTATION_OR_NON_DISCLOSURE: material misstatement at
 *     onboarding/registration or in the claim itself.
 *   - POLICY_NOT_IN_FORCE_AT_INCIDENT: the policy had lapsed/was cancelled
 *     by the incident date.
 *   - QUANTUM_DISPUTED: the loss is covered, but the admin disputes the
 *     claimed amount — used both for a full rejection on quantum grounds
 *     and, per §12.3 N-3, for the shortfall on a partial approval.
 *   - OTHER: anything else; needs a longer minimum admin-supplied reason
 *     (enforced in the route layer, not here).
 */
export const CLAIM_REJECTION_GROUND_CODES = [
  'LOSS_OUTSIDE_PERIOD_OF_COVER',
  'EXCLUDED_EVENT_OR_CAUSE',
  'INSUFFICIENT_EVIDENCE_OF_LOSS',
  'INSUFFICIENT_EVIDENCE_OF_OWNERSHIP',
  'MISREPRESENTATION_OR_NON_DISCLOSURE',
  'POLICY_NOT_IN_FORCE_AT_INCIDENT',
  'QUANTUM_DISPUTED',
  'OTHER',
] as const;

export type ClaimRejectionGroundCode = (typeof CLAIM_REJECTION_GROUND_CODES)[number];

export function isClaimRejectionGroundCode(value: unknown): value is ClaimRejectionGroundCode {
  return typeof value === 'string' && (CLAIM_REJECTION_GROUND_CODES as readonly string[]).includes(value);
}

/**
 * §12.3 N-4 — administrative close is for NON-MERITS grounds only. Any
 * merits-based ending of a claim (eligibility, evidence, exclusions,
 * quantum, lapse, fraud, etc.) must go through `rejected` and the full N-2
 * notice instead. This list is deliberately narrow.
 */
export const CLAIM_ADMIN_CLOSE_GROUNDS = [
  'DUPLICATE_CLAIM',
  'FILED_IN_ERROR_CONFIRMED_BY_CUSTOMER',
  'WITHDRAWN_AT_CUSTOMER_REQUEST',
] as const;

export type ClaimAdminCloseGround = (typeof CLAIM_ADMIN_CLOSE_GROUNDS)[number];

export function isClaimAdminCloseGround(value: unknown): value is ClaimAdminCloseGround {
  return typeof value === 'string' && (CLAIM_ADMIN_CLOSE_GROUNDS as readonly string[]).includes(value);
}

export type ClaimDecisionNoticeKind =
  | 'rejection'
  | 'partial_approval_shortfall'
  | 'administrative_close'
  | 'more_info_request';

/**
 * §12.3 N-6 — delivery is a SEPARATE, not-yet-built concern (blocked on the
 * production email readiness item). This array exists so a future delivery
 * mechanism has somewhere to record attempts against an immutable notice
 * record; nothing in this backend appends to it yet.
 */
export interface ClaimDecisionNoticeDelivery {
  channel: 'email' | 'in_app';
  attemptedAt: string;
  succeeded: boolean;
}

/** §12.3 N-1 — the persisted, immutable notice record shape. */
export interface ClaimDecisionNotice {
  kind: ClaimDecisionNoticeKind;
  templateVersion: number;
  /** Null only for `more_info_request`, which has no ground code. */
  groundCode: ClaimRejectionGroundCode | ClaimAdminCloseGround | null;
  renderedText: string;
  issuedAt: string;
  deliveries: ClaimDecisionNoticeDelivery[];
}

export class ClaimDecisionNoticeConfigError extends Error {
  constructor(fieldLabel: string) {
    super(
      `Cannot compose a claim decision notice: required configuration "${fieldLabel}" is missing or blank. ` +
        'Refusing to issue a notice with a blank required field (security-review.md §12.3).',
    );
    this.name = 'ClaimDecisionNoticeConfigError';
  }
}

/**
 * SR-018-11 / CR-018-10: `config/env.ts`'s `loadEnv()` substitutes a
 * `TODO_OWNER_MUST_CONFIGURE: ...` placeholder string when a `claimsNotice`
 * env var is genuinely unset (not blank). That string is non-empty, so a
 * blank/whitespace-only check alone lets it through. A placeholder value is
 * "blank licence details" in substance even though it is not blank in form
 * (security-review.md §12.3 N-2(8), §16.4 SR-018-11) — treat it exactly like
 * a blank value.
 */
export const CLAIM_NOTICE_PLACEHOLDER_PREFIX = 'TODO_OWNER_MUST_CONFIGURE';

export function isClaimNoticePlaceholderValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().startsWith(CLAIM_NOTICE_PLACEHOLDER_PREFIX);
}

function requireConfigValue(value: string | undefined, fieldLabel: string): string {
  const trimmed = value?.trim();
  if (!trimmed || isClaimNoticePlaceholderValue(trimmed)) {
    throw new ClaimDecisionNoticeConfigError(fieldLabel);
  }
  return trimmed;
}

interface ResolvedNoticeConfig {
  internalComplaintsContact: string;
  nfoContactName: string;
  nfoWebsite: string;
  nfoPhone: string;
  nfoEmail: string;
  faisOmbudContactName: string;
  faisOmbudWebsite: string;
  faisOmbudPhone: string;
  faisOmbudEmail: string;
  insurerLegalName: string;
  insurerLicenceNumber: string;
  insurerFspNumber: string;
}

/**
 * Note: `env.claimsNotice` itself is optional on `Env` only so every
 * pre-existing hand-built test `Env` fixture across the backend (there are
 * dozens, per file, predating this feature) keeps compiling without being
 * touched. `loadEnv()` always populates it in a real process, with
 * TODO_OWNER_MUST_CONFIGURE placeholders standing in for real values — so in
 * every real environment this resolves successfully to placeholder-but-
 * non-blank text, never throws. It throws only when a caller (production
 * misconfiguration, or a test deliberately simulating one) supplies a
 * blank/whitespace-only value for a required field, or omits the whole
 * `claimsNotice` block entirely.
 */
function resolveNoticeConfig(env: Env): ResolvedNoticeConfig {
  const cfg = env.claimsNotice;
  return {
    internalComplaintsContact: requireConfigValue(cfg?.internalComplaintsContact, 'internal complaints contact'),
    nfoContactName: requireConfigValue(cfg?.nfoContactName, 'NFO contact name'),
    nfoWebsite: requireConfigValue(cfg?.nfoWebsite, 'NFO website'),
    nfoPhone: requireConfigValue(cfg?.nfoPhone, 'NFO phone number'),
    nfoEmail: requireConfigValue(cfg?.nfoEmail, 'NFO email'),
    faisOmbudContactName: requireConfigValue(cfg?.faisOmbudContactName, 'FAIS Ombud contact name'),
    faisOmbudWebsite: requireConfigValue(cfg?.faisOmbudWebsite, 'FAIS Ombud website'),
    faisOmbudPhone: requireConfigValue(cfg?.faisOmbudPhone, 'FAIS Ombud phone number'),
    faisOmbudEmail: requireConfigValue(cfg?.faisOmbudEmail, 'FAIS Ombud email'),
    insurerLegalName: requireConfigValue(cfg?.insurerLegalName, 'insurer legal name'),
    insurerLicenceNumber: requireConfigValue(cfg?.insurerLicenceNumber, 'insurer licence number'),
    insurerFspNumber: requireConfigValue(cfg?.insurerFspNumber, 'insurer FSP number'),
  };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** §12.3 N-2 items 3-8, shared by every adverse-notice kind (full/partial rejection, admin close). */
function renderAdverseBoilerplate(cfg: ResolvedNoticeConfig, opts: { legalActionTimeLimit?: string | null }): string {
  const lines: string[] = [];

  lines.push(
    `Your right to respond: you may make representations to us about this decision ` +
      `(or about the amount) within at least 90 days of receiving this notice. ` +
      `Please contact us at: ${cfg.internalComplaintsContact}. We will consider any representations you make.`,
  );

  lines.push(
    `If you remain unsatisfied after raising this with us, you have the right to refer a free complaint to ` +
      `the National Financial Ombud Scheme South Africa (NFO): ${cfg.nfoContactName}, ${cfg.nfoWebsite}, ` +
      `phone ${cfg.nfoPhone}, email ${cfg.nfoEmail}.`,
  );

  lines.push(
    `If your complaint concerns advice or an intermediary's service, you may also refer it to the FAIS Ombud: ` +
      `${cfg.faisOmbudContactName}, ${cfg.faisOmbudWebsite}, phone ${cfg.faisOmbudPhone}, email ${cfg.faisOmbudEmail}.`,
  );

  if (opts.legalActionTimeLimit) {
    lines.push(
      `Time limit on legal action: ${opts.legalActionTimeLimit}. The 90-day representation period above does ` +
        `not count against this time limit.`,
    );
  }

  lines.push(
    `You may file a new claim if you have new or different information about this loss — this does not ` +
      `replace your representation right above.`,
  );

  lines.push(
    `Insurer details: ${cfg.insurerLegalName}, licence number ${cfg.insurerLicenceNumber}, ` +
      `FSP number ${cfg.insurerFspNumber}.`,
  );

  lines.push(
    '[PLACEHOLDER COPY — not yet reviewed by technical-writer, compliance-specialist, or insurer legal against ' +
      'the gazetted Policyholder Protection Rules text. Do not treat this wording as final (security-review.md §12.3 N-7).]',
  );

  return lines.join('\n\n');
}

export interface BuildRejectionNoticeInput {
  env: Env;
  claimId: string;
  assetDisplayName: string;
  submittedAt: Date;
  decidedAt: Date;
  claimedAmount: number;
  claimedAmountCurrency: string;
  groundCode: ClaimRejectionGroundCode;
  /** The admin's own plain-language reason — ONE slot in the notice, never the whole notice. */
  adminReason: string;
  /** The policy clause relied on, when the admin supplies one. Optional: not every rejection cites a clause. */
  policyClauseReference?: string | null;
  /** Any legal-action time limit stated in the policy wording. Left out entirely (not invented) when absent. */
  legalActionTimeLimit?: string | null;
}

/** §12.3 N-2 — a full rejection notice. */
export function buildRejectionNotice(input: BuildRejectionNoticeInput): ClaimDecisionNotice {
  const cfg = resolveNoticeConfig(input.env);
  const issuedAt = new Date();

  const header =
    `Claim reference: ${input.claimId}\n` +
    `Asset: ${input.assetDisplayName}\n` +
    `Filed: ${formatDate(input.submittedAt)}\n` +
    `Decision: your claim has been REJECTED in full as of ${formatDate(input.decidedAt)}.`;

  const groundSection =
    `Ground: ${input.groundCode}.\n` +
    `Reason: ${input.adminReason}` +
    (input.policyClauseReference ? `\nPolicy clause relied on: ${input.policyClauseReference}` : '');

  const renderedText = [
    header,
    groundSection,
    renderAdverseBoilerplate(cfg, { legalActionTimeLimit: input.legalActionTimeLimit }),
  ].join('\n\n');

  return {
    kind: 'rejection',
    templateVersion: CLAIM_DECISION_NOTICE_TEMPLATE_VERSION,
    groundCode: input.groundCode,
    renderedText,
    issuedAt: issuedAt.toISOString(),
    deliveries: [],
  };
}

export interface BuildPartialApprovalShortfallNoticeInput {
  env: Env;
  claimId: string;
  assetDisplayName: string;
  submittedAt: Date;
  decidedAt: Date;
  claimedAmount: number;
  approvedAmount: number;
  currency: string;
  /** The admin's reason for disputing the amount — required by the route layer whenever approvedAmount < claimedAmount. */
  quantumReason: string;
  policyClauseReference?: string | null;
  legalActionTimeLimit?: string | null;
}

/**
 * §12.3 N-3 — "A partial approval is a partial rejection." Always issued
 * with `groundCode: 'QUANTUM_DISPUTED'` alongside the approval, for the
 * shortfall between what was claimed and what was approved.
 */
export function buildPartialApprovalShortfallNotice(
  input: BuildPartialApprovalShortfallNoticeInput,
): ClaimDecisionNotice {
  const cfg = resolveNoticeConfig(input.env);
  const issuedAt = new Date();
  const shortfall = input.claimedAmount - input.approvedAmount;

  const header =
    `Claim reference: ${input.claimId}\n` +
    `Asset: ${input.assetDisplayName}\n` +
    `Filed: ${formatDate(input.submittedAt)}\n` +
    `Decision: your claim has been PARTIALLY approved as of ${formatDate(input.decidedAt)}. ` +
    `You claimed ${input.claimedAmount.toFixed(2)} ${input.currency}; we have approved ` +
    `${input.approvedAmount.toFixed(2)} ${input.currency}. This notice concerns the unapproved shortfall of ` +
    `${shortfall.toFixed(2)} ${input.currency}, which is treated as a rejection of that portion of your claim.`;

  const groundSection =
    `Ground: QUANTUM_DISPUTED.\n` +
    `Reason: ${input.quantumReason}` +
    (input.policyClauseReference ? `\nPolicy clause relied on: ${input.policyClauseReference}` : '');

  const renderedText = [
    header,
    groundSection,
    renderAdverseBoilerplate(cfg, { legalActionTimeLimit: input.legalActionTimeLimit }),
  ].join('\n\n');

  return {
    kind: 'partial_approval_shortfall',
    templateVersion: CLAIM_DECISION_NOTICE_TEMPLATE_VERSION,
    groundCode: 'QUANTUM_DISPUTED',
    renderedText,
    issuedAt: issuedAt.toISOString(),
    deliveries: [],
  };
}

export interface BuildAdministrativeCloseNoticeInput {
  env: Env;
  claimId: string;
  assetDisplayName: string;
  submittedAt: Date;
  decidedAt: Date;
  closeGround: ClaimAdminCloseGround;
  adminReason: string;
  /** Required and validated by the route layer when closeGround === 'DUPLICATE_CLAIM'. */
  survivingClaimId?: string | null;
}

/** §12.3 N-4 — administrative close notice. Never used for a merits-based ending (see `isClaimAdminCloseGround`). */
export function buildAdministrativeCloseNotice(input: BuildAdministrativeCloseNoticeInput): ClaimDecisionNotice {
  const cfg = resolveNoticeConfig(input.env);
  const issuedAt = new Date();

  const header =
    `Claim reference: ${input.claimId}\n` +
    `Asset: ${input.assetDisplayName}\n` +
    `Filed: ${formatDate(input.submittedAt)}\n` +
    `This claim has been administratively CLOSED as of ${formatDate(input.decidedAt)}.`;

  const groundSection =
    `Ground: ${input.closeGround}.\n` +
    `Reason: ${input.adminReason}` +
    (input.survivingClaimId ? `\nRelated open claim reference: ${input.survivingClaimId}` : '') +
    `\n\nImportant: this is NOT a decision on whether your claim is covered. ` +
    `No determination of cover or loss has been made.`;

  const renderedText = [
    header,
    groundSection,
    `You may file a new claim at any time.`,
    `If you have questions about this closure, contact us at: ${cfg.internalComplaintsContact}.`,
    `You may also refer a free complaint to the National Financial Ombud Scheme South Africa (NFO): ` +
      `${cfg.nfoContactName}, ${cfg.nfoWebsite}, phone ${cfg.nfoPhone}, email ${cfg.nfoEmail}.`,
    '[PLACEHOLDER COPY — not yet reviewed by technical-writer, compliance-specialist, or insurer legal ' +
      '(security-review.md §12.3 N-7).]',
  ].join('\n\n');

  return {
    kind: 'administrative_close',
    templateVersion: CLAIM_DECISION_NOTICE_TEMPLATE_VERSION,
    groundCode: input.closeGround,
    renderedText,
    issuedAt: issuedAt.toISOString(),
    deliveries: [],
  };
}

/**
 * §12.3 N-5 — more-information notice. The admin's `reviewNote` fills one
 * slot; the rest is FIXED boilerplate, not the admin's free text, stating
 * the claim stays open and will not be rejected for lack of a response
 * without a further written notice. This does NOT touch the §12.3 N-1
 * `decisionNotices[]` array (a more-info request is not an adverse
 * decision) — it is appended to the `reviewNotes` entry's text instead, so
 * it reaches the customer the same way the admin's own text already does
 * (`claim-serializers.ts`).
 */
export function appendMoreInfoBoilerplate(adminReviewNote: string): string {
  return (
    `${adminReviewNote}\n\n` +
    '---\n' +
    'Your claim remains open while we wait for this information. It will NOT be rejected for lack of a ' +
    'response without a further written notice from us.'
  );
}
