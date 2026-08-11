-- Feature 001 / ADR-0006 FU-A1 — the AUD-1 join key on Trail A, plus AUD-2's/R-3's
-- structural constraints and the index AUD-8's runbook actually cites.
-- Author: cto (ratification, §16 R-1/R-3) — DDL formalization remains database-architect's.
-- Status: APPLIED to the live Supabase project (`TD IT Solutions`, eu-central-1) on
--   2026-08-11, after 032. DO NOT RE-APPLY. Verified by `cto` 2026-08-11 against the live
--   catalog: all four AUD-1 columns plus `result_count` exist, all four R-3 CHECK constraints
--   exist, `account_audit_log_actor_created_at` exists with the (actor_account_id, created_at
--   desc) partial shape, and 031's `account_audit_log_actor_account_id` is gone. The original
--   header said "WRITTEN, NOT YET APPLIED" and was left stale by whoever applied it.
--   STILL OPEN on this file: the constraints were added NOT VALID and have NOT been promoted —
--   the verification block at the end of this file is `security-engineer`'s to run, and no
--   record of it having been run exists. The BLOCKING SEQUENCE that gated this file (apply
--   before deploying src/repositories/audit-log.ts) is satisfied.
--
-- Apply AFTER migrations/032 (which adds the two enum values the CHECK constraints below
-- reference — see 032's header for why they are two files).
--
-- ============================================================================
-- THIS IS ADDITIVE TO MIGRATION 031, NOT A RESTATEMENT OF IT.
-- ============================================================================
-- security-engineer's concurrence condition (a) (ADR-0006 §15, AUD-8 finding 1) named the
-- exact misreading to prevent: 031 added ONLY `actor_account_id`, and created an index named
-- `account_audit_log_actor_account_id (actor_account_id)` — not the
-- `account_audit_log_actor_created_at (actor_account_id, created_at desc)` that ADR-0006's
-- AUD-2 snippet proposed and its AUD-8 runbook cites by name. 031 also added no
-- `actor_service`, no `actor_session_id`, no `audit_request_id`, and no CHECK constraint.
-- 031 is not defective — it predates the ADR and correctly scoped itself to the actor/subject
-- split alone. This file adds the remaining three AUD-1 columns, R-1's `result_count`, R-3's
-- constraints, and the correctly-named/shaped actor index.
--
-- ============================================================================
-- THE AUD-3(b) SHAPE, RECORDED HERE BECAUSE THIS IS WHERE IT WAS ASKED TO BE RECORDED
-- ============================================================================
-- security-engineer (ADR-0006 §15, AUD-8 finding 2) required the AUD-3(b) shape choice be
-- made and recorded in one place — this migration's header, matching 031's convention —
-- before FU-A4's runbook is written, because the runbook's Trail A SQL fails at PARSE time
-- under the shape it does not assume.
--
--   CHOSEN (cto ruling R-1, ADR-0006 §16.1): one audit row per disclosed subject
--   (`event_type = 'privileged_data_access'`, subject in `account_id` — identical in shape to
--   a detail read), PLUS one call-scoped row (`event_type = 'privileged_bulk_access'`,
--   `account_id` null, `result_count` set, including 0).
--
--   NOT CHOSEN: `disclosed_account_ids uuid[]` with a GIN index. There is therefore NO
--   `disclosed_account_ids` column on this table and there never will be under this ADR.
--   AUD-8's runbook SQL as drafted in ADR-0006 §5 — `where (account_id = $1 or $1 =
--   any(disclosed_account_ids))` — MUST be rewritten to `where account_id = $1` before it is
--   filed. It is simpler under the chosen shape, not harder.
--
--   CORRECTION (`cto`, 2026-08-11, ADR-0006 §17.1): the sentence that stood here claimed
--   "the existing `account_audit_log_account_id_created_at` index answers the subject-keyed
--   query directly." That index did not exist at 033 application time. It is designed at
--   001-authentication/database-design.md §3 and was created by migration `034` (FU-A13,
--   applied 2026-08-11). The chosen shape is still correct; the performance claim attached
--   to it was not valid until `034` landed. See ADR-0006 §17.8.
--
-- Consequences of the chosen shape, for whoever reads this table without reading the ADR:
--   * A subject-keyed query needs NO knowledge of bulk-vs-detail. Both are
--     `privileged_data_access` rows with a subject. That is deliberate.
--   * `privileged_bulk_access` rows are NOT disclosure records. They record that a list call
--     happened and how many records it returned. Never count them as accesses to a subject.
--   * Up to 200 subject rows per list call (`004/api-design.md` §5's `limit` ceiling),
--     accepted with eyes open at ADR-0006 §16.1, bounded by the 12-month retention
--     compliance-specialist ruled for both trails (§14.9). The application writes them in a
--     single multi-row INSERT — one round trip, atomic with the call-scoped row.

-- =====================================================================================
-- AUD-1 / AUD-2 / AUD-5 — the three remaining join-key columns, plus R-1's result_count.
-- =====================================================================================

alter table app.account_audit_log
  add column if not exists actor_service    text    null,
  add column if not exists actor_session_id uuid    null,
  add column if not exists audit_request_id uuid    null,
  add column if not exists result_count     integer null;

comment on column app.account_audit_log.actor_service is
  'AUD-2. The acting SERVICE, when the actor is not an account. Internal callers '
  '(GET /internal/accounts/{id}/status, authenticated by X-Internal-Service-Key) are not '
  'accounts, so before this column every service-to-service privileged read was '
  'UNATTRIBUTED — a row recording that customer X''s status was read, but not by whom. '
  'Populated from req.internalCaller, which is SR-13''s per-consumer caller identity, never '
  'a shared literal. Exactly one of actor_account_id / actor_service is expected to be set '
  'on a privileged-access row; the CHECK below requires at least one.';

comment on column app.account_audit_log.actor_session_id is
  'AUD-1. The actor''s session id (the session_id claim of the backend-minted access token) '
  '— the "sitting" element of the platform join key (subject, actor, actor session, '
  'timestamp +/-5s). Reconstruction groups by this column: one group is one admin''s working '
  'session, which is the grain a forensic question is actually asked at. '
  'DELIBERATELY NO FOREIGN KEY to app.sessions, and this is not an oversight to "fix": '
  'app.sessions cascades from app.accounts and has its own open retention question, so an FK '
  'would either cascade-delete this audit row or null out the correlation key when the '
  'session row goes away. A soft reference is the only shape that survives its referent — '
  'the same reasoning that made account_id "on delete set null" rather than cascade. '
  'AUD-4: server-derived only. A caller-supplied value may never be a join key.';

comment on column app.account_audit_log.audit_request_id is
  'AUD-5. Server-generated per request (req.auditRequestId), NEVER read from a header — '
  'distinct from req.requestId, which SR-18 still allows a client to supply when '
  'UUID-shaped and which is echoed in the x-request-id response header and error envelope. '
  'Purpose: tie an audit row to the application log line for the same request, in both '
  'directions, without treating a caller-controlled value as evidence. '
  'IT IS NOT THE CROSS-STORE JOIN KEY and under the current endpoint set it will never hold '
  'the same value in this table and in MongoDB admin_access_log — no single request writes '
  'both (ADR-0006 §2.2, re-verified by security-engineer §15). A future engineer who finds '
  'this field in both stores must not conclude that it correlates them. It becomes a genuine '
  'cross-store key only under AUD-9''s growth rule, when one request does write both — at '
  'which point that endpoint must be re-threat-modelled before it ships.';

comment on column app.account_audit_log.result_count is
  'ADR-0006 R-1 (§16.1). Number of records a bulk/list call returned, on the call-scoped '
  'privileged_bulk_access row only — including 0, so a list call that disclosed nothing '
  'still leaves the ATTEMPT reconstructible (compliance-specialist, §14.5.5: do not optimise '
  'away audit rows for empty results, or the search-pattern signal disappears). '
  'C-17, standing constraint: the QUERY that produced the count may not be recorded here or '
  'anywhere else in either trail. Admin search terms on this platform are routinely a '
  'customer''s name, email, VIN or device serial, including of people who are not customers. '
  'Record which fields were filtered on if ever needed — never their values.';

-- =====================================================================================
-- AUD-8's actor-keyed query: the index it names, with the shape it needs.
-- =====================================================================================

create index if not exists account_audit_log_actor_created_at
  on app.account_audit_log (actor_account_id, created_at desc)
  where actor_account_id is not null;

-- 031's account_audit_log_actor_account_id is a strict leading-column prefix of the index
-- just created, so every lookup it served is served at least as well by the new one. Dropped
-- rather than left in place: two indexes on the same column pay double write cost on every
-- audit insert, and audit inserts are on the login path.
drop index if exists app.account_audit_log_actor_account_id;

-- =====================================================================================
-- R-3 (ADR-0006 §16.3) — four invariants as constraints, not as call-site discipline.
--
-- All added NOT VALID, deliberately. NOT VALID enforces the constraint on every INSERT and
-- UPDATE from this point forward while declining to assert anything about rows written before
-- ADR-0006 existed. Those historical rows genuinely lack the attribution these constraints
-- require, and the alternative — back-filling a plausible-looking actor into an evidentiary
-- table — would be fabricating audit content to make a constraint pass. That is not a trade
-- this project makes. See the verification block at the end of this file for how to decide
-- whether to VALIDATE later.
-- =====================================================================================

-- AUD-2's recommended CHECK, taken (R-3) and extended to the bulk row type: unattributed
-- privileged access becomes structurally impossible rather than something every call site has
-- to remember.
alter table app.account_audit_log
  add constraint account_audit_log_privileged_has_actor
    check (
      event_type not in ('privileged_data_access', 'privileged_bulk_access')
      or actor_account_id is not null
      or actor_service is not null
    ) not valid;

-- R-1's guarantee, made structural: a privileged_data_access row IS a disclosure record, so
-- it must name the subject it disclosed. This is the constraint that makes the null-subject
-- bulk row AUD-3(b) prohibits impossible to insert at all, rather than prohibited in prose.
-- Privilege-granting actions, which legitimately have no subject account at issuance time,
-- are 'privilege_granted' after migration 032 + the reclassification below.
alter table app.account_audit_log
  add constraint account_audit_log_privileged_access_has_subject
    check (event_type <> 'privileged_data_access' or account_id is not null) not valid;

-- result_count belongs to the call-scoped row and only to it, in both directions: every
-- privileged_bulk_access row carries one, no other row type may.
alter table app.account_audit_log
  add constraint account_audit_log_result_count_only_on_bulk
    check ((event_type = 'privileged_bulk_access') = (result_count is not null)) not valid;

alter table app.account_audit_log
  add constraint account_audit_log_result_count_non_negative
    check (result_count is null or result_count >= 0) not valid;

-- =====================================================================================
-- Reclassification of existing invitation-issuance rows (R-2).
--
-- POST /v1/invitations has been writing privileged_data_access with a null subject and a
-- non-null actor. Those rows are privilege-GRANTING events, not data accesses, and they are
-- the rows that diluted every subject-keyed query.
--
-- The predicate below is RR-4's fragile heuristic, used deliberately, exactly once, at the
-- only moment it is reliable: invitation issuance is currently the sole actor-only,
-- subject-null row type in this table (security-engineer §15, AUD-8 finding 3, confirmed
-- against the live column list). After this migration that is no longer true in general, so
-- this predicate must never be reused — which is the whole reason R-2 replaced it with a real
-- event_type value.
-- =====================================================================================

update app.account_audit_log
set event_type = 'privilege_granted'
where event_type = 'privileged_data_access'
  and account_id is null
  and actor_account_id is not null;

-- =====================================================================================
-- Post-application verification — for the applying reviewer, not the application.
--
-- 1. Rows the actor constraint would reject if VALIDATEd (expected: pre-ADR-0006
--    service-to-service reads, which have no recorded actor and cannot honestly gain one):
--
--      select id, created_at, account_id from app.account_audit_log
--      where event_type in ('privileged_data_access', 'privileged_bulk_access')
--        and actor_account_id is null and actor_service is null;
--
-- 2. Rows the subject constraint would reject (expected: ZERO after the reclassification
--    above — anything here means a row type nobody has accounted for):
--
--      select id, created_at, actor_account_id from app.account_audit_log
--      where event_type = 'privileged_data_access' and account_id is null;
--
-- If (1) and (2) both return zero rows, security-engineer may promote the constraints:
--
--      alter table app.account_audit_log validate constraint account_audit_log_privileged_has_actor;
--      alter table app.account_audit_log validate constraint account_audit_log_privileged_access_has_subject;
--      alter table app.account_audit_log validate constraint account_audit_log_result_count_only_on_bulk;
--      alter table app.account_audit_log validate constraint account_audit_log_result_count_non_negative;
--
-- Whether to validate is security-engineer's call, not this file's: leaving them NOT VALID is
-- honest about history, validating them is a stronger assertion. Do not validate by reflex.
-- =====================================================================================
