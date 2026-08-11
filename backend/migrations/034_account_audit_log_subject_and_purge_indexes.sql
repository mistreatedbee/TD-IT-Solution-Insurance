-- Feature 001 / ADR-0006 FU-A13 — Trail A indexes designed at
-- 001-authentication/database-design.md §3 but never migrated.
-- Author: database-architect formalization per ADR-0006 §17.2 (`cto` ruling).
-- Status: APPLIED to the live Supabase project (`TD IT Solutions`, eu-central-1) on
--   2026-08-11, after 033. DO NOT RE-APPLY. Verified: both indexes present in catalog.
--
-- WHY NOW: ADR-0006 §16.1/R-1 and five downstream documents cited
-- `account_audit_log_account_id_created_at` as *existing*; it was not. The
-- subject-keyed privileged-access query (AUD-8, POPIA s22/s23) was a sequential
-- scan on a table that R-1 commits to growing by up to 200 rows per admin list
-- call. The purge partial index supports `app.purge_expired_audit_log()` when
-- something schedules it (scheduling itself is FU-A13's second half — not here).
--
-- Additive only. Safe on empty or populated tables at current volume.

-- Subject-side index — privileged_data_access / subject-keyed reconstruction
create index if not exists account_audit_log_account_id_created_at
  on app.account_audit_log (account_id, created_at desc)
  where account_id is not null;

comment on index app.account_audit_log_account_id_created_at is
  'Dominant subject-keyed path: privileged_data_access rows per ADR-0006 R-1, '
  'admin audit-log by account, AUD-8 subject-keyed query. Partial excludes '
  'subject-null rows (login_failure, privileged_bulk_access, privilege_granted).';

-- Purge job scan — partial excludes legal_hold rows (database-design.md §3)
create index if not exists account_audit_log_created_at
  on app.account_audit_log (created_at)
  where legal_hold = false;

comment on index app.account_audit_log_created_at is
  'Supports app.purge_expired_audit_log() 12-month cutoff scan. Partial '
  'excludes held rows. Enforcement requires something to call the function '
  '(FU-A13 scheduling — cloud-infrastructure-architect / devops-engineer).';

-- Post-application verification (security-engineer):
--   select indexname from pg_indexes
--     where schemaname = 'app' and tablename = 'account_audit_log'
--     and indexname in (
--       'account_audit_log_account_id_created_at',
--       'account_audit_log_created_at'
--     );
--   Expect 2 rows.
