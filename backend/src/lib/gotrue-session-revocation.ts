/**
 * INC-003 A-10 / A-23 — make backend revocation reach the browser-resident
 * GoTrue session (INC-003-A5 threat model §4.4).
 *
 * The web customer app holds its own self-refreshing GoTrue session
 * (`src/customer/supabase/client.ts`), and `POST /auth/supabase/exchange`
 * will turn any valid GoTrue access token into a brand-new backend session.
 * Before this module, no backend revocation event (logout-all, admin
 * suspend/deactivate, SR-8 reuse, FR-20 device mismatch) reached that GoTrue
 * session, so an attacker holding it could re-mint seconds after being
 * "thrown out". Two properties, per §4.4:
 *
 * 1. **Revocation watermark (authoritative, ours).** Every account-wide
 *    revocation already writes `app.sessions.revoked_at` with a distinctive
 *    `revoked_reason`, and every admin state change already appends an
 *    `app.account_state_transitions` row. The latest of those is the
 *    account's watermark (`SessionRepo.findRevocationWatermark`). The
 *    exchange refuses any GoTrue session that was *authenticated* before it.
 *    "Authenticated" is read from the GoTrue JWT's `amr` timestamps, which
 *    GoTrue stamps when the session is created and carries forward
 *    unchanged across refreshes — unlike `iat`, which a thief resets simply
 *    by refreshing. No schema change: derived from existing durable rows.
 * 2. **Propagation to GoTrue (defence in depth).** On the same events, the
 *    backend asks GoTrue to sign the user out globally, so the stolen
 *    GoTrue session also stops working *directly against GoTrue* (C-8/C-9/
 *    C-10 during a suspension). Best-effort: the watermark is the control
 *    that does not depend on GoTrue being reachable, so a GoTrue outage must
 *    not turn a successful backend revocation into a 5xx.
 *
 * Deliberately NOT done here (left for `backend-architect`, see INC-003
 * §12): a GoTrue *ban* on suspend. GoTrue's password grant answers
 * `user_banned` for a banned user, and whether it does so before or after
 * checking the password is version-dependent — mapping it would risk a
 * suspension-state oracle in `/auth/login`, and not mapping it would turn
 * every suspended user's login into a lockout-counting INVALID_CREDENTIALS.
 * That trade-off is a design call, not an implementation detail.
 */
import type { SessionRevokedReason } from './refresh-session.js';
import type { SupabaseAdmin } from '../db/supabase.js';

/**
 * Revocation reasons that are account-wide (advance the watermark). Single
 * `logout` and `rotated` are per-session housekeeping and must NOT advance
 * it, or every ordinary logout/refresh would invalidate the user's other
 * live GoTrue sessions.
 */
export const ACCOUNT_WIDE_REVOCATION_REASONS: readonly SessionRevokedReason[] = [
  'logout_all',
  'admin_forced',
  'rotation_reuse_detected',
  'device_mismatch',
  'password_reset',
] as const;

/**
 * Earliest `amr[].timestamp` (seconds since epoch) in a GoTrue access token,
 * i.e. when the GoTrue session was authenticated. Returns `null` if the
 * token is not a decodable JWT or carries no usable `amr`.
 *
 * The signature is NOT verified here and does not need to be: callers only
 * use this after `getUserFromAccessToken` has already had GoTrue accept the
 * token. A forged payload would fail that call first.
 */
export function gotrueSessionAuthenticatedAt(accessToken: string): number | null {
  const parts = accessToken.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const amr = (payload as { amr?: unknown }).amr;
  if (!Array.isArray(amr)) return null;
  const stamps = amr
    .map((entry) => (entry && typeof entry === 'object' ? (entry as { timestamp?: unknown }).timestamp : undefined))
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t > 0);
  if (stamps.length === 0) return null;
  return Math.min(...stamps);
}

/**
 * True when the GoTrue session behind `accessToken` must be refused because
 * it was authenticated before the account's revocation watermark.
 *
 * Fails closed: if a watermark exists and the token's authentication time
 * cannot be determined, the session is treated as stale. Compared at
 * whole-second granularity (GoTrue's `amr` resolution), so a genuine fresh
 * sign-in in the same second as the revocation is not refused.
 */
export function isGoTrueSessionStale(accessToken: string, watermark: Date | null): boolean {
  if (!watermark) return false;
  const authenticatedAt = gotrueSessionAuthenticatedAt(accessToken);
  if (authenticatedAt === null) return true;
  return authenticatedAt < Math.floor(watermark.getTime() / 1000);
}

/**
 * INC-003 §13 D-1 — audit events that also advance the watermark. Session
 * rows alone are not enough: `revokeAllForAccount` only touches rows that
 * are still live, so a password reset by a user who is already logged out
 * everywhere (the normal forgot-password case), or an SR-8/FR-20 detection
 * whose whole family was already closed, writes no `revoked_at` at all.
 * These audit rows are written unconditionally by those flows.
 * `session_family_revoked` is written for both reuse and device mismatch.
 */
export const WATERMARK_AUDIT_EVENT_TYPES = ['password_reset_completed', 'session_family_revoked'] as const;

/**
 * Stable log tag for alerting (INC-003 §13 low follow-up). Alert rules
 * should match this exact string; do not reword it.
 */
export const GOTRUE_PROPAGATION_FAILURE_LOG_TAG = '[ALERT:gotrue_revocation_propagation_failed]';

export type GoTrueRevocationTrigger =
  | 'logout_all'
  | 'password_reset'
  | 'admin_forced'
  | 'admin_reactivated'
  | 'rotation_reuse_detected'
  | 'device_mismatch';

/**
 * Best-effort: terminate every GoTrue session the user holds. Never throws;
 * returns whether GoTrue confirmed the sign-out so callers/tests can observe
 * it. Logs the account id and trigger only — never the email or any token.
 */
export async function propagateRevocationToGoTrue(
  supabase: Pick<SupabaseAdmin, 'signOutAllUserSessions'>,
  subject: { accountId: string; email: string; accountState?: string },
  trigger: GoTrueRevocationTrigger,
): Promise<boolean> {
  // INC-003 §13 low follow-up (b): the sign-out mints and verifies a magic
  // link, which may mark an unconfirmed email as confirmed. An account still
  // in pending_verification must not be confirmed as a side effect of a
  // revocation; the exchange refuses pending accounts anyway, and the
  // watermark still applies once it is activated.
  if (subject.accountState === 'pending_verification') return false;
  try {
    await supabase.signOutAllUserSessions(subject.email);
    return true;
  } catch (err) {
    console.error(
      `${GOTRUE_PROPAGATION_FAILURE_LOG_TAG} GoTrue global sign-out failed for account ${subject.accountId} ` +
        `(trigger=${trigger}); the exchange watermark still applies. ${err instanceof Error ? err.name : 'Error'}`,
    );
    return false;
  }
}
