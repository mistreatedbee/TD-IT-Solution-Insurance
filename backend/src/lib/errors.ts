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
  INVALID_CREDENTIALS: { statusCode: 401, message: 'Incorrect email or password.' },
  ACCOUNT_LOCKED: { statusCode: 423, message: 'Too many attempts. Please try again later.' },
  RATE_LIMITED: { statusCode: 429, message: 'Too many requests. Please try again later.' },
  UNAUTHORIZED: { statusCode: 401, message: 'Authentication is required to access this resource.' },
  FORBIDDEN: { statusCode: 403, message: 'You do not have permission to perform this action.' },
  ACCOUNT_NOT_ACTIVE: {
    statusCode: 403,
    message: 'This action requires an active account.',
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
  REFRESH_TOKEN_INVALID: { statusCode: 401, message: 'Your session has expired. Please log in again.' },
  ACCOUNT_SUSPENDED: { statusCode: 423, message: 'This account is currently unavailable.' },
  STEP_UP_REQUIRED: { statusCode: 401, message: 'Please re-verify your identity to continue.' },
  UPSTREAM_UNAVAILABLE: {
    statusCode: 503,
    message: 'The service is temporarily unavailable. Please try again shortly.',
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
