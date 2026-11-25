-- Feature 008 "Locate now" (remote locate request), Stage 8 review 2026-11-25 findings F-4 / F-5
-- (docs/features/008-self-device-gps-tracking/security-review.md): dedicated audit event types for
-- the request and for its outcome, replacing the owner-test reuse of `protection_change`.
--
--   location_locate_requested  protection_detail = 'method|assetId|requestId'
--                              (method in mfa, password, bypass)
--   location_locate_answered   protection_detail = 'outcome|assetId|requestId'
--                              (outcome in answered, declined, expired)
--
-- Never coordinates, never a contact detail. No new column: both reuse `protection_detail`
-- (migrations/041), which has no CHECK tying it to an event type; the repository layer enforces
-- the vocabulary.
--
-- Status: WRITTEN, NOT YET APPLIED to any project, live or otherwise. Applying it is the owner's
-- manual step. It MUST be applied BEFORE a backend build containing this change is deployed to
-- Render: until it is, Postgres rejects the new enum values, the audit write fails, and
-- POST /v1/assets/:assetId/locate-request fails closed (500, no request created). Whoever applies
-- it must correct this header (precedent: migrations/041 and 042).
--
-- Single-statement-per-value pattern, as migrations/035, 041 and 042 (`alter type ... add value`
-- cannot be used in the same transaction that adds it on older Postgres).

alter type app.audit_event_type add value if not exists 'location_locate_requested';
alter type app.audit_event_type add value if not exists 'location_locate_answered';

comment on column app.account_audit_log.protection_detail is
  'Feature 021 stage (b) spec section 6: action|method[|assetId] for protection_change rows (action in asset_removed, emergency_contact_changed; method in mfa, password). Feature 008 migrations/043: method|assetId|requestId for location_locate_requested rows (method in mfa, password, bypass) and outcome|assetId|requestId for location_locate_answered rows (outcome in answered, declined, expired). Never contains secrets, contact details or location.';
