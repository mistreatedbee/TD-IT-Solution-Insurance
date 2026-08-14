/**
 * Ratified authentication policy constants.
 *
 * Every number here traces to security-review.md §6 ("Authentication and
 * Session Mechanics — Ratified Policy") or §5's rate-limit table (also
 * ratified at §6/§8's SR-11). Do not change a value here without a recorded
 * cybersecurity-architect decision — per that document, these are
 * "tightenable, not loosenable" without one.
 */

export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60; // 10 minutes, ratified, not loosenable.

export const REFRESH_TOKEN_IDLE_TTL_SECONDS = {
  privilegedWeb: 15 * 60, // 15 minutes
  customerMobile: 30 * 24 * 60 * 60, // 30 days
} as const;

export const ABSOLUTE_SESSION_LIFETIME_SECONDS = {
  privilegedWeb: 8 * 60 * 60, // 8 hours
  customerMobile: 90 * 24 * 60 * 60, // 90 days
} as const;

export const DASHBOARD_IDLE_TIMEOUT_SECONDS = 15 * 60;

export const PASSWORD_MIN_LENGTH = {
  customer: 10,
  privileged: 14,
} as const;
export const PASSWORD_MAX_LENGTH = 128;

export const LOGIN_LOCKOUT = {
  perIdentifierAttempts: 5,
  perIdentifierWindowSeconds: 15 * 60,
  perIpAttempts: 20,
  perIpWindowSeconds: 15 * 60,
} as const;

export const MFA_CHALLENGE_LIMIT = {
  attempts: 5,
  windowSeconds: 10 * 60,
} as const;

export const MFA_ENROLLMENT_VERIFY_LIMIT = {
  attempts: 10,
  windowSeconds: 60 * 60,
} as const;

/** SR-6: the rate-limit row api-design.md §5's table omitted entirely. */
export const RESET_PASSWORD_MFA_VERIFY_LIMIT = {
  attempts: 5,
  windowSeconds: 15 * 60,
} as const;
export const RESET_PASSWORD_MFA_VERIFY_TOKEN_TTL_SECONDS = 5 * 60;

export const RESET_PASSWORD_REQUEST_LIMIT = {
  perIdentifierAttempts: 3,
  perIdentifierWindowSeconds: 60 * 60,
  perIpAttempts: 10,
  perIpWindowSeconds: 60 * 60,
} as const;

export const RESET_PASSWORD_CONFIRM_LIMIT = {
  attempts: 5,
  windowSeconds: 15 * 60,
} as const;

export const SIGNUP_LIMIT = {
  perIpAttempts: 10,
  perIpWindowSeconds: 60 * 60,
} as const;

export const RESEND_VERIFICATION_LIMIT = {
  cooldownSeconds: 60,
  perAccountAttempts: 5,
  perAccountWindowSeconds: 60 * 60,
} as const;

/** SR-006-2: `POST /auth/notify-email-verified` previously carried only a
 * per-email cooldown, which bounds abuse of one victim address but does
 * nothing against enumeration sweeping many addresses from one source. This
 * is the same `LOGIN_LOCKOUT.perIp*`-style ceiling applied to this route,
 * per MP-7's "every route gets an explicit limiter" convention. */
export const NOTIFY_EMAIL_VERIFIED_IP_LIMIT = {
  attempts: 20,
  windowSeconds: 15 * 60,
} as const;

export const INVITATIONS_CREATE_LIMIT = {
  attempts: 50,
  windowSeconds: 60 * 60,
} as const;

export const AUDIT_LOG_READ_LIMIT = {
  attempts: 60,
  windowSeconds: 60,
} as const;

/**
 * SR-004-admin-5: Feature 004 admin policy/asset registry list endpoints.
 * Sized for customer-registry bulk reads, not audit-log reads — 20/min/account
 * × 50 records/page = 1,000 records/min (vs 12,000 at the prior AUDIT_LOG_READ_LIMIT × 200).
 */
export const ADMIN_REGISTRY_LIST_LIMIT = {
  attempts: 20,
  windowSeconds: 60,
} as const;

/** SR-004-admin-5(b): IP-scoped ceiling so one credential rotated across hosts stays bounded. */
export const ADMIN_REGISTRY_LIST_IP_LIMIT = {
  attempts: 30,
  windowSeconds: 60,
} as const;

/** SR-004-admin-5(c): admin registry list max page size (platform-wide max remains 200). */
export const ADMIN_REGISTRY_LIST_MAX_PAGE_LIMIT = 50;

export const DEFAULT_AUTHENTICATED_LIMIT = {
  attempts: 100,
  windowSeconds: 60,
} as const;

/** SR-1: enrollment ticket, and SR-6's mfaVerificationToken, both minted with this TTL
 * unless a more specific constant above overrides it. Enrollment ticket TTL is 10
 * minutes per SR-1's own text. */
export const ENROLLMENT_TICKET_TTL_SECONDS = 10 * 60;

// C-5.3 (compliance-review-smtp-vendor.md §6/§10): Brevo (the SMTP vendor) retains
// transactional logs AND rendered message bodies — i.e. the token-bearing link itself —
// for a floor of 1 month, not eliminable by us. Every token type an auth email carries
// must therefore expire far inside that retention floor, so a copy Brevo retains is
// already dead by the time anyone could act on it. Ceilings are C-5.3's ruling, not a
// recommendation: departing from them (loosening, not tightening) requires written
// justification plus compliance-specialist's and cybersecurity-architect's counter-sign,
// same governance this file's header comment already states for every other constant here.
//
// This app-owned constant is the actual, enforced ceiling — `routes/invitations.ts` reads
// it directly to compute `expiresAt` on `app.invitations`, which this backend owns end to
// end (its own opaque token, its own DB-stored expiry, its own TTL check at
// `GET /invitations/{token}` and `POST /invitations/{token}/accept`).
// C-5.3 ceiling: invitation ≤ 72 hours. Tightened from 7 days (was 2.33x over ceiling).
export const INVITATION_TTL_SECONDS = 72 * 60 * 60;

// C-5.3 ceiling: email verification ≤ 24 hours. This constant documents the required
// ceiling but is NOT itself wired into any TTL check in this codebase — the actual
// verification token is minted by Supabase Admin API's `generateLink({ type: 'signup' })`
// (db/supabase.ts `generateEmailVerificationLink`), and GoTrue governs that token's expiry
// via the Supabase project's own Auth settings (dashboard-configured "Email OTP
// expiration"/mailer OTP expiry), not via any parameter this backend's code passes. There
// is currently no code path in this repo that reads this constant. Follow-up action item,
// out of this codebase's reach: whoever administers the Supabase project dashboard must
// confirm/set the project's email-OTP/link expiry to <= 24 hours to actually satisfy
// C-5.3 for this token type — this constant alone does not enforce it.
export const EMAIL_VERIFICATION_LINK_TTL_SECONDS = 24 * 60 * 60;

// C-5.3 ceiling: password reset <= 60 minutes. Same caveat as
// EMAIL_VERIFICATION_LINK_TTL_SECONDS immediately above: the actual recovery token is
// minted by Supabase Admin API's `generateLink({ type: 'recovery' })` (db/supabase.ts
// `generatePasswordResetLink`), and its expiry is GoTrue/dashboard-governed, not read from
// this constant by any code in this repo. Same dashboard-side follow-up action item
// applies: confirm/set the project's recovery-link expiry to <= 60 minutes.
export const PASSWORD_RESET_LINK_TTL_SECONDS = 60 * 60;
export const MFA_CHALLENGE_TOKEN_TTL_SECONDS = 5 * 60;

/** api-design.md §2.2: 10-minute access-token TTL means step-up MFA for
 * POST /v1/invitations requires mfa_verified_at within this window. */
export const INVITATION_ISSUANCE_STEP_UP_WINDOW_SECONDS = 15 * 60;

export const PRIVILEGED_USER_TYPES = ['admin', 'security_company_operator', 'support_agent'] as const;
export type PrivilegedUserType = (typeof PRIVILEGED_USER_TYPES)[number];

export function isPrivilegedUserType(userType: string): userType is PrivilegedUserType {
  return (PRIVILEGED_USER_TYPES as readonly string[]).includes(userType);
}

export function passwordMinLengthFor(userType: string): number {
  return isPrivilegedUserType(userType) ? PASSWORD_MIN_LENGTH.privileged : PASSWORD_MIN_LENGTH.customer;
}
