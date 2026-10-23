-- DEFECT-001 (docs/organization/defect-fixes/DEFECT-001-customer-verification-integrity.md
-- §3) — the `decision` column and its CHECK constraint, split from migrations/038 because it
-- references migrations/038's new enum literal (`alter type ... add value` cannot be followed,
-- in the same transaction, by a statement that uses the new value — same reasoning as
-- migrations/032 vs. 033). Apply AFTER migrations/038.
-- Author: backend-architect (design, §3) — database-architect (this file, confirmed,
-- 2026-10-23).
-- Status: WRITTEN, NOT YET APPLIED to any project, live or otherwise — whoever applies this
-- must correct this header per the precedent migrations/032/033/035's headers document
-- (029/030/031 were left stale after application).
--
-- Continues the numbering from migrations/038.
--
-- Unlike migrations/033's four R-3 constraints, this one is added WITHOUT `NOT VALID` and
-- needs no backfill/reclassification step: `decision` is a brand-new column, so every existing
-- row already satisfies "decision is null" and no existing row has
-- `event_type = 'customer_verification_decision'` (that value did not exist before
-- migrations/038). The constraint holds for 100% of historical data by construction, so there
-- is nothing to validate later and no reviewer judgment call to defer, unlike 033's case.
--
-- `decision` mirrors the existing `result_count` pattern (migrations/033's
-- `account_audit_log_result_count_only_on_bulk`): present if and only if the row is the one
-- event type that carries it.

alter table app.account_audit_log
  add column if not exists decision text null;

comment on column app.account_audit_log.decision is
  'DEFECT-001 §3. The admin decision recorded on a customer_verification_decision row only: '
  'one of ''verified'', ''rejected'', ''action_required''. Records WHAT was decided; the '
  'existing privileged_data_access row written by the same route at the moment the admin opens '
  'the record continues to record only THAT the admin accessed it, and is unchanged by this '
  'migration.';

alter table app.account_audit_log
  add constraint account_audit_log_decision_only_on_verification_decision
    check (
      (event_type = 'customer_verification_decision') = (decision is not null)
    );

alter table app.account_audit_log
  add constraint account_audit_log_decision_valid_values
    check (decision is null or decision in ('verified', 'rejected', 'action_required'));
