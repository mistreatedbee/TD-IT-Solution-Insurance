-- Feature 021 stage (b) (docs/features/021-theft-protection-signals/03-stage-b-step-up-spec.md)
-- / ADR-0020 D4 as amended by its section 9 (A-1, A-3): customer protection-change step-up.
--
-- 1. `app.sessions.password_reauth_at` - set ONLY by POST /v1/auth/reauth/password (a customer
--    WITHOUT a verified TOTP factor re-entering their password on the CURRENT session). It is a
--    separate column from `mfa_verified_at` on purpose (P-INV-1): a password check must never be
--    able to satisfy an admin Tier A step-up. Refresh copies it forward and never renews it.
-- 2. Audit event types for the re-authentication and the guarded changes themselves.
--
-- Status: WRITTEN, NOT YET APPLIED to any project. Whoever applies this must correct this header
-- per the precedent migrations/032 documents. Plain nullable column, no default, no backfill, no
-- index (always read by primary key).
--
-- NOTE: `alter type ... add value` cannot run inside a transaction block on older Postgres; this
-- file follows migrations/035's single-statement-per-value pattern.

alter table app.sessions add column if not exists password_reauth_at timestamptz;

comment on column app.sessions.password_reauth_at is
  'ADR-0020 section 9 A-1: last successful password re-authentication on THIS session, for customers without a verified TOTP factor. Written only by POST /auth/reauth/password. Never written from the MFA path and never read by the admin requireStepUp check. Carried forward (not renewed) by session refresh.';

alter type app.audit_event_type add value if not exists 'protection_reauth_verified';
alter type app.audit_event_type add value if not exists 'protection_reauth_failed';
alter type app.audit_event_type add value if not exists 'protection_reauth_exhausted';
alter type app.audit_event_type add value if not exists 'protection_change';
alter type app.audit_event_type add value if not exists 'protection_change_notice_failed';

-- 3. `protection_detail` - minimal structured detail for `protection_change` rows (spec section 6:
--    action, method, target asset id). Written as a fixed-vocabulary token string, e.g.
--    'asset_removed|password|<assetId>'. Never a password, code, token, contact name/phone or
--    location. No CHECK ties it to the new enum value: Postgres cannot use an enum value added in
--    the same transaction, and the repository layer enforces the vocabulary.
alter table app.account_audit_log add column if not exists protection_detail text null;

comment on column app.account_audit_log.protection_detail is
  'Feature 021 stage (b) spec section 6. action|method[|assetId] for protection_change rows only (action in asset_removed, emergency_contact_changed; method in mfa, password). Never contains secrets, contact details or location.';
