-- DEFECT-001 (docs/organization/defect-fixes/DEFECT-001-customer-verification-integrity.md
-- §3) — new `app.audit_event_type` values for the verify-then-swap / approval-race fix.
-- Author: backend-architect (design, §3) — database-architect (this file, confirmed,
-- 2026-10-23).
-- Status: WRITTEN, NOT YET APPLIED to any project, live or otherwise — whoever applies this
-- must correct this header per the precedent migrations/032/033/035's headers document
-- (029/030/031 were left stale after application).
--
-- Continues the numbering from migrations/037.
--
-- WHY THIS IS A SEPARATE FILE FROM 039, AND NOT A COSMETIC SPLIT (same reasoning as
-- migrations/032 vs. 033): `alter type ... add value` cannot be followed, in the same
-- transaction, by a statement that uses the new value as a literal. Migration 039 adds a CHECK
-- constraint that references `customer_verification_decision` by name. Apply 038 first, then
-- 039. Do not merge them.
--
-- `customer_identity_reset` — written by `CustomerProfilesRepo.updateForAccount()` whenever an
-- identity-bearing profile edit flips a `verified` profile back to `in_progress` (DEFECT-001
-- §4.1). Subject = actor = the customer's own `accountId` (self-service action) — this value is
-- deliberately NOT added to `PRIVILEGED_ACCESS_EVENT_TYPES` in `repositories/audit-log.ts`,
-- since it carries no privileged *access to another account's data*.
--
-- `customer_verification_decision` — written by `PATCH /admin/accounts/:id/profile/verification`
-- when `CustomerProfilesRepo.reviewVerification()` succeeds. Subject = the customer's
-- `accountId`; actor = the reviewing admin. THIS VALUE MUST BE ADDED TO
-- `PRIVILEGED_ACCESS_EVENT_TYPES` in `repositories/audit-log.ts` (migrations/039's CHECK
-- constraint enforces an actor on it structurally, matching that set's existing two members).

alter type app.audit_event_type add value if not exists 'customer_identity_reset';
alter type app.audit_event_type add value if not exists 'customer_verification_decision';
