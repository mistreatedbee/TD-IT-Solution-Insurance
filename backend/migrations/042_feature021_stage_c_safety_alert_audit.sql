-- Feature 021 stage (c) (docs/features/021-theft-protection-signals/04-stage-c-went-dark-and-channels.md):
-- audit trail for safety-alert channel dispatch (TP-14).
--
-- Status: APPLIED 2026-11-19 to the linked Supabase project (owner request, test-only phase), one
-- statement at a time; verified afterwards (new columns and audit_event_type values present).
-- Superseded status line, kept for audit: "WRITTEN, NOT YET APPLIED to any project."
-- Single-statement-per-value pattern, as migrations/035 and 041.

alter type app.audit_event_type add value if not exists 'safety_alert_dispatch';

-- Fixed-vocabulary detail: alertType|channel|outcome[|deviceId]. Never location, coordinates, message text
-- or contact details. No CHECK tied to the new enum value (it cannot be used in the transaction that adds it);
-- the repository layer enforces the vocabulary.
alter table app.account_audit_log add column if not exists safety_alert_detail text null;

comment on column app.account_audit_log.safety_alert_detail is
  'Feature 021 stage (c). alertType|channel|outcome[|deviceId] for safety_alert_dispatch rows only. Never location or contact details.';
