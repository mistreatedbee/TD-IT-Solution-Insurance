/**
 * SR-007-2 (docs/features/007-notifications/security-review.md §7.2) —
 * deferred cross-account push-token takeover policy.
 *
 * The re-verification's acceptable-control menu, option 2 ("deferred
 * takeover"): on a cross-account `tokenHash` collision, do not demote the
 * prior owner inline. Quarantine the new registration (kept `enabled:
 * false`) and complete the takeover only after a grace window has elapsed
 * with the prior owner un-notified-response, giving them time to act on the
 * alert email sent at quarantine time (repositories/push-tokens.ts,
 * lib/auth-notification-service.ts).
 *
 * Pulled out as a pure function (no Mongo/Date.now() call baked in) so the
 * policy is unit-testable without a live/fake database — this codebase has
 * no direct unit tests against the Mongo-backed repositories themselves
 * (only through route-level fakes), so keeping the actual decision logic
 * pure is what makes it verifiable at all.
 */

/** Grace window between a contested registration being quarantined and it
 * becoming eligible to complete automatically on the next re-registration
 * attempt from the same (claiming) account+device. Chosen to give a human
 * time to read the losing-account alert email and react (e.g. contact
 * support) before the claim can complete — not to guarantee that reaction
 * happens for them. Not exposed via env var: this is a policy constant with
 * one call site, not a per-deployment tunable. */
export const PUSH_TOKEN_TAKEOVER_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * True once at least `PUSH_TOKEN_TAKEOVER_COOLDOWN_MS` has elapsed since a
 * registration was first quarantined as a contested takeover claim.
 */
export function isTakeoverCooldownElapsed(pendingSince: Date, now: Date = new Date()): boolean {
  return now.getTime() - pendingSince.getTime() >= PUSH_TOKEN_TAKEOVER_COOLDOWN_MS;
}
