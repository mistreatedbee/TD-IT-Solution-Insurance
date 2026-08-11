/**
 * Idempotency-Key generation — api-design.md §4. Required (not optional)
 * on: reset-password/confirm, reset-password/mfa-verify, mfa/enroll/verify,
 * session/logout-all (the mutating endpoints this app's Phase 1 scope
 * actually calls from api-design.md §4's mandatory list — invitations/
 * accept are privileged-web-only, out of scope here).
 */
import * as Crypto from 'expo-crypto';

export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}
