-- ADR-0012 (ratified 2026-09-23) — step-up authentication for privileged
-- actions. Adds the two audit event types the step-up verify endpoint emits
-- (`backend/src/routes/step-up.ts`): `mfa_step_up_verified` on a successful
-- live TOTP re-verification that freshens the current session's
-- `mfa_verified_at`, and `mfa_step_up_failed` on an incorrect code.
--
-- Status: WRITTEN, NOT YET APPLIED to any project, live or otherwise —
-- whoever applies this must correct this header per the precedent
-- migrations/032's header documents (029/030/031 were left stale after
-- application).
--
-- Continues the numbering from migrations/034. No other schema change is
-- needed for ADR-0012: `app.sessions.mfa_verified_at` already exists
-- (migrations/030), and `SessionRepo.touchMfaVerifiedAt` is a plain UPDATE
-- against that existing column.

alter type app.audit_event_type add value if not exists 'mfa_step_up_verified';
alter type app.audit_event_type add value if not exists 'mfa_step_up_failed';
