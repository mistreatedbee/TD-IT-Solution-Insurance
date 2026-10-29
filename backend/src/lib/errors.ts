/**
 * Fixed error-message catalogue, keyed by code (SR-19).
 *
 * security-review.md SR-19: "`errorHandler` must not return raw
 * upstream/driver messages on 4xx — fixed message catalogue keyed by
 * `code`." This directly protects FR-5/AC-2 anti-enumeration: a Postgres
 * unique-violation message, a Supabase Admin API error body, or any other
 * driver/vendor string must never reach the client verbatim. Every ApiError
 * thrown by route/service code in this backend MUST be constructed via
 * `apiError()` below (never `new ApiError(status, code, someUpstreamString)`
 * directly) so the message is always one of the fixed strings here.
 */

export interface ErrorCatalogEntry {
  statusCode: number;
  message: string;
}

export const ERROR_CATALOG = {
  VALIDATION_ERROR: { statusCode: 400, message: 'The request could not be processed as submitted.' },
  IDEMPOTENCY_KEY_REQUIRED: { statusCode: 400, message: 'An Idempotency-Key header is required for this request.' },
  IDEMPOTENCY_KEY_REUSE: {
    statusCode: 409,
    message: 'This Idempotency-Key was already used with a different request body.',
  },
  // SR-018-5 — a second request with the same Idempotency-Key arrived while the first
  // request (which reserved the key) is still being processed and has not yet stored a
  // cached response to replay. Distinct from IDEMPOTENCY_KEY_REUSE (same key, different
  // body): this is the same key, same or unknown body, just not resolved yet.
  IDEMPOTENCY_KEY_IN_PROGRESS: {
    statusCode: 409,
    message: 'A request with this Idempotency-Key is already being processed. Please retry shortly.',
  },
  CONFLICT: {
    statusCode: 409,
    message: 'The request conflicts with the current state of the resource.',
  },
  INVALID_CREDENTIALS: { statusCode: 401, message: 'Incorrect email or password.' },
  ACCOUNT_LOCKED: { statusCode: 423, message: 'Too many attempts. Please try again later.' },
  RATE_LIMITED: { statusCode: 429, message: 'Too many requests. Please try again later.' },
  UNAUTHORIZED: { statusCode: 401, message: 'Authentication is required to access this resource.' },
  FORBIDDEN: { statusCode: 403, message: 'You do not have permission to perform this action.' },
  ACCOUNT_NOT_ACTIVE: {
    statusCode: 403,
    message: 'This action requires an active account.',
  },
  ASSET_LIMIT_REACHED: {
    statusCode: 403,
    message: 'You have reached the asset limit for your selected plan.',
  },
  PLAN_REQUIRES_QUOTE: {
    statusCode: 422,
    message: 'This plan requires a custom quote. Please contact us to continue.',
  },
  PLAN_DOWNGRADE_NOT_ALLOWED: {
    statusCode: 409,
    message:
      'This plan change is not allowed while you have more registered assets than the new plan allows. Remove assets or contact support.',
  },
  PLAN_FEATURE_NOT_INCLUDED: {
    statusCode: 403,
    message: 'This feature is not included in your current platform subscription plan.',
  },
  NOT_FOUND: { statusCode: 404, message: 'The requested resource was not found.' },
  INVITATION_INVALID: { statusCode: 404, message: 'This invitation link is invalid or has expired.' },
  INVITATION_EXPIRED: { statusCode: 410, message: 'This invitation link has expired or was already used.' },
  ENROLLMENT_TICKET_INVALID: {
    statusCode: 401,
    message: 'This enrollment session is invalid or has expired. Please start again.',
  },
  MFA_ENROLLMENT_NOT_FOUND: { statusCode: 400, message: 'This enrollment could not be found or has expired.' },
  MFA_CHALLENGE_INVALID: { statusCode: 400, message: 'Incorrect verification code.' },
  MFA_CHALLENGE_EXPIRED: {
    statusCode: 410,
    message: 'This verification challenge has expired. Please log in again.',
  },
  RESET_TOKEN_INVALID: { statusCode: 404, message: 'This link is invalid or has expired.' },
  RESET_TOKEN_EXPIRED: { statusCode: 410, message: 'This link has expired or was already used.' },
  // INC-003 §30 advisory (C-12 follow-on): a server-side failure on
  // /auth/reset-password/confirm AFTER GoTrue already redeemed the single-use
  // reset link. Retrying the same link cannot succeed (it is consumed), and
  // the password may or may not have been changed, so clients must not offer
  // "try again" with this link. Distinct from UPSTREAM_UNAVAILABLE (503),
  // which is only returned before redemption and is safe to retry.
  RESET_COMPLETION_FAILED: {
    statusCode: 500,
    message:
      'We could not finish resetting your password. Your link may already have been used: try signing in with your new password, or request a new reset link.',
  },
  REFRESH_TOKEN_INVALID: { statusCode: 401, message: 'Your session has expired. Please log in again.' },
  ACCOUNT_SUSPENDED: { statusCode: 423, message: 'This account is currently unavailable.' },
  DEVICE_MISMATCH: {
    statusCode: 403,
    message: 'This action must be performed from the device associated with your current session.',
  },
  STEP_UP_REQUIRED: { statusCode: 401, message: 'Please re-verify your identity to continue.' },
  // ADR-0012 §2.2.3 — no password fallback and no bypass for a privileged
  // account that has no verified TOTP factor on file; there is no session to
  // step up from a factor that was never enrolled.
  MFA_NOT_ENROLLED: { statusCode: 409, message: 'Multi-factor authentication is not enrolled on this account.' },
  UPSTREAM_UNAVAILABLE: {
    statusCode: 503,
    message: 'The service is temporarily unavailable. Please try again shortly.',
  },
  // Feature 018 (claims filing and adjudication) — business-requirements.md §1/§5/§7.
  POLICY_NOT_ACTIVE: {
    statusCode: 422,
    message: 'A claim cannot be filed against this policy because it is not currently active.',
  },
  ASSET_NOT_ELIGIBLE: {
    statusCode: 422,
    message: 'A claim cannot be filed against this asset because it is not currently active.',
  },
  WAITING_PERIOD_NOT_MET: {
    statusCode: 422,
    message: 'This policy or asset has not yet cleared the waiting period for new claims.',
  },
  DUPLICATE_OPEN_CLAIM: {
    statusCode: 409,
    message: 'There is already an open claim for this asset.',
  },
  RECOVERY_CASE_MISMATCH: {
    statusCode: 422,
    message: 'The referenced recovery case does not belong to this account and asset.',
  },
  APPROVED_AMOUNT_EXCEEDS_COVERAGE_LIMIT: {
    statusCode: 422,
    message: 'The approved amount exceeds the configured coverage limit for this asset type.',
  },
  // SR-018-3: an admin cannot approve more than the customer claimed.
  APPROVED_AMOUNT_EXCEEDS_CLAIMED: {
    statusCode: 422,
    message: 'The approved amount cannot exceed the claimed amount.',
  },
  // SR-018-4: fail closed, not open, when the claim's policy cannot be
  // found at approval time (so the coverage-limit check is never silently
  // skipped as "no cap").
  CLAIM_POLICY_NOT_FOUND: {
    statusCode: 409,
    message: 'The policy referenced by this claim could not be found. This claim cannot be adjudicated.',
  },
  // §12.2 R7-3 (compliance ruling 2026-10-28) — approval hold on a claim
  // carrying FLAG_INCIDENT_BEFORE_ELIGIBILITY until an admin records why the
  // loss is nonetheless within cover.
  ELIGIBILITY_DETERMINATION_REQUIRED: {
    statusCode: 422,
    message:
      'This claim has an incident-date eligibility flag. An eligibility determination must be recorded before it can be approved.',
  },
  // security-review.md §12.4 (compliance ruling 2026-10-28) — the approval
  // ceiling is an operational control (a single admin cannot approve above
  // it alone), never a coverage limit, so it must not silently reduce or
  // reject a claim. It blocks THIS self-service PATCH only and routes the
  // admin to escalate instead. Also returned, fail-closed, when the claim's
  // currency is not the ceiling's currency (ZAR).
  APPROVAL_REQUIRES_ESCALATION: {
    statusCode: 422,
    message:
      'This approval amount exceeds the self-service approval ceiling (or the claim is not in the ceiling currency) and must be escalated for approval above the standard admin limit.',
  },
  INTERNAL_ERROR: { statusCode: 500, message: 'An internal error occurred.' },
} as const satisfies Record<string, ErrorCatalogEntry>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly extra?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;

  constructor(code: ErrorCode, extra?: Record<string, unknown>, retryAfterSeconds?: number) {
    const entry = ERROR_CATALOG[code];
    super(entry.message);
    this.statusCode = entry.statusCode;
    this.code = code;
    this.extra = extra;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The only sanctioned way to construct an auth-domain error. Never wrap an
 * upstream driver/vendor message here — pick the catalogue code that best
 * describes the situation instead. */
export function apiError(code: ErrorCode, extra?: Record<string, unknown>, retryAfterSeconds?: number): ApiError {
  return new ApiError(code, extra, retryAfterSeconds);
}
