# INC-003 — C-2 grant/RLS verification working notes (`app.account_state_transitions` / `app.account_audit_log`)

**Author:** `database-architect` · **Date:** 2026-10-16 · **Branch:** `claude/nice-bardeen-0j5x8y`
**Scope:** INC-003 §15.2/§17.1 C-2, as sequenced by §20.3 step 4 of the `cto` merge-readiness ruling.
**What this is:** a read-of-the-repo preparation for the live check — not the live check itself. I
have no production database access in this environment. Everything below is either (a) what the
repo's own source-of-truth documents say *should* be true, (b) exact SQL for someone with
production Postgres access to run to confirm reality matches, or (c) a concern plus a draft
(unapplied) forward migration. **No migration has been applied. Nothing here has been committed —
left for the requester to review and commit.**

---

## 1. Where the actual DDL/GRANT/RLS for these two tables lives

`backend/migrations/*.sql` (030–035) does **not** contain `CREATE TABLE` for either table, and
contains **no `GRANT` statement and no RLS statement of any kind** for either table. The six files
there are incremental changes (new columns, indexes, enum values, constraints) layered on tables
that migrations/030 onward *assume already exist*.

The actual `CREATE TABLE`, `GRANT`, and `ENABLE ROW LEVEL SECURITY`/`CREATE POLICY` statements for
both tables live in `docs/features/001-authentication/database-design.md`:

- `app.account_state_transitions`: `CREATE TABLE` at §2.4 (lines 201–221); RLS at §5.2 (lines
  452–462).
- `app.account_audit_log`: `CREATE TABLE` at §2.5 (lines 225–248); RLS at §5.3 (lines 465–474).
- §7's migration checklist (lines 591–610) lists both tables' creation (`create_account_state_transitions_table`,
  `create_account_audit_log_table`), their indexes, and `enable_rls_account_state_transitions` /
  `enable_rls_account_audit_log` as the intended migration steps — i.e. this document **is** the
  spec the numbered `backend/migrations/*.sql` files were supposed to have started from.

That document carries its own caveat at the top (line 8): *"Paper design. No live Supabase MCP
access was available in producing this document; no SQL below has been executed against a live
project. All DDL, indexes, and RLS SQL are written out for review, not applied."* So it is the
best available statement of intent, not proof of what's live.

## 2. What the backend's connection role actually is — and the gap this surfaces

`backend/src/db/pg.ts` (header comment, lines 1–20) and `backend/src/config/env.ts` (lines 50–57)
both state the backend connects to Postgres directly via `pg`, using the connection string in
`SUPABASE_DB_URL`, as **"a dedicated least-privilege application role (SR-3) — NOT the project
superuser."** This is a *direct Postgres role*, separate from Supabase/PostgREST's built-in
`anon`/`authenticated`/`service_role` roles. **No file in this repo names that role** — it's
identified only by whatever user is embedded in the `SUPABASE_DB_URL` connection string, which is
a secret, never committed.

This matters because `database-design.md` §5.2/§5.3's RLS sections are written entirely in terms
of the PostgREST-facing `authenticated` role:

> §5.2: *"No policies for `authenticated` at all, and no GRANT of any privilege to `authenticated`
> ... this history is read/written exclusively through backend-mediated, service_role-authenticated
> ... RLS enabled ... as defense-in-depth even though no policy grants access"* (paraphrased from
> lines 455–462; same posture at §5.3 lines 465–474 for `account_audit_log`).

**That design document never once grants, or discusses granting, anything to the backend's actual
direct-Postgres role.** It rules out `authenticated` and `anon` by name, and says access is
"backend-mediated" without specifying the SQL-level grant that makes the backend's own role able to
do that mediation. In other words: per the one document that is the source of truth for intended
grants, nobody has written down what the backend's own role is supposed to be allowed to do on
these two tables. Whatever privileges that role currently has in production were either (a) never
set, (b) set ad hoc when the role was created (SR-3 remediation), or (c) inherited from a broader
grant (e.g. if the role is still the project superuser, which needs no grants at all).

### 2.1 This is a known, previously-flagged gap, not a new finding

`docs/features/001-authentication/security-review.md`:
- Line 61 (TB-3): *"Identity Service → Supabase Postgres ... **Currently the project superuser and
  RLS-exempt. SR-3 requires a least-privilege role.**"*
- Line 464: *"**SR-3** | Specified; **unverified live**, and load-bearing again | A-22 item 4"*
- Line 455: *"An `authenticated` Postgres caller now exists. SR-3 (exposed schemas) is therefore
  load-bearing again and must be verified live (A-22 item 4)."*

So as of that review, SR-3 (swap the backend's Postgres role from project-superuser to a
least-privilege role) was **specified but never confirmed live**, and its live verification was
folded into "A-22 item 4" — a console-access checklist item, not a migration. C-2, as framed in
this incident doc, is the first time anyone has asked for the grant/RLS state on these two specific
tables to actually be checked rather than assumed. There is no migration anywhere in this repo that
(a) creates a named least-privilege role, or (b) grants it anything on `app.account_state_transitions`
or `app.account_audit_log`. If SR-3's console remediation happened, it happened entirely outside
version control, and nothing here can confirm what it granted.

## 3. What the application code actually needs from these two tables

Confirmed by reading the call sites (not assumed):

| Table | Operation | Call site |
|---|---|---|
| `app.account_state_transitions` | `INSERT` | `backend/src/repositories/accounts.ts:419` |
| `app.account_state_transitions` | `SELECT` (via `max(created_at)` subquery) | `backend/src/repositories/sessions.ts:160` |
| `app.account_audit_log` | `INSERT` (single-row and bulk) | `backend/src/repositories/audit-log.ts:180`, `:230` |
| `app.account_audit_log` | `SELECT` (via `max(created_at)` subquery) | `backend/src/repositories/sessions.ts:162` |

No `UPDATE` or `DELETE` call against either table exists anywhere under `backend/src/` (grepped
directly). The 12-month purge job described in `database-design.md` §6 (`DELETE FROM
app.account_audit_log ...`) is **not implemented anywhere in `backend/src/`** — it exists only in
seed/demo scripts (`backend/scripts/seed-demo-security-dashboard.ts`,
`backend/scripts/seed-test-accounts.ts`), confirming HANDOFF.md's note that the purge job (FU-A13)
is not scheduled. So the running backend's required privilege set on these two tables, today, is
exactly: **`SELECT, INSERT` on both tables**, nothing more.

## 4. Verification SQL — run as the backend's own connection role, with production access

Run this against the production database, authenticated as (or impersonating, via
`SET ROLE`/`SET SESSION AUTHORIZATION`) the exact role embedded in the production `SUPABASE_DB_URL`.
Do **not** run it as the dashboard/owner superuser connection — that will not reflect what the
backend process itself can do.

```sql
-- 0. Identify the role actually being checked, and whether it can even see the rows
--    it thinks it can (defensive: confirms you're not accidentally testing as owner/superuser).
select current_user, session_user;

-- 1. Table-level privileges the backend's repositories actually exercise (§3 above).
--    All four must return true.
select
  has_table_privilege(current_user, 'app.account_state_transitions', 'SELECT') as ast_select,
  has_table_privilege(current_user, 'app.account_state_transitions', 'INSERT') as ast_insert,
  has_table_privilege(current_user, 'app.account_audit_log',         'SELECT') as aal_select,
  has_table_privilege(current_user, 'app.account_audit_log',         'INSERT') as aal_insert;

-- 2. Schema-level USAGE — a missing USAGE grant on the `app` schema hides every table in it
--    from this role regardless of table-level grants. Must be true.
select has_schema_privilege(current_user, 'app', 'USAGE') as app_schema_usage;

-- 3. RLS status on both tables — per database-design.md §5.2/§5.3, RLS is INTENDED to be
--    enabled on both. Confirm it actually is (relrowsecurity) and whether a forced mode
--    is also set (relforcerowsecurity matters if the role happens to be the table owner).
select
  n.nspname as schema,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'app'
  and c.relname in ('account_state_transitions', 'account_audit_log');

-- 4. Does the backend's role bypass RLS outright (table ownership or BYPASSRLS)?
--    If this is true, RLS is a non-factor for this role by design, same way superuser is.
select rolname, rolsuper, rolbypassrls
from pg_roles
where rolname = current_user;

-- 5. Any permissive policies that actually apply to this role on either table.
--    If RLS is enabled (step 3 = true) and this role is NOT bypassrls/owner (step 4),
--    and this returns ZERO rows for a table, every SELECT/INSERT this role attempts
--    against that table is silently filtered/rejected by RLS regardless of the
--    GRANT answers in step 1 — this is the "fails open on SELECT, fails closed on
--    INSERT" case the incident doc warns about.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'app'
  and tablename in ('account_state_transitions', 'account_audit_log');

-- 6. End-to-end smoke test (per §15.2 item 3 / §17.1 of the incident doc) — the only
--    check that proves 1-5 actually compose correctly. Run as the backend's role,
--    inside a transaction you roll back:
begin;
  insert into app.account_audit_log (account_id, event_type, created_at)
  values (null, 'login_failure', now())  -- adjust columns/enum value to match the
                                          -- live schema if migrations/032+ changed
                                          -- the enum or NOT NULL columns since this
                                          -- draft was written; the point is proving
                                          -- INSERT actually succeeds, not the exact row.
  returning id;

  select max(created_at) from app.account_state_transitions;
  select max(created_at) from app.account_audit_log;
rollback;
```

**How to read the results:**
- Any `false` in step 1, or `app_schema_usage = false` in step 2 → **missing grant**. Per the
  incident doc, this fails **closed**: every customer web sign-in and every staff MFA login/MFA
  enrolment-verify 5xxs at the point `sessions.ts`'s watermark query or `audit-log.ts`'s insert
  runs. Fix via a forward `GRANT` migration (§5 below has a draft). Never fix by making application
  code tolerate the failure — the incident doc is explicit that failing open here is the wrong fix.
- Step 3 showing `rls_enabled = false` on either table contradicts `database-design.md` §5.2/§5.3's
  stated intent (RLS should be enabled on both, with no policies for `authenticated`) — not
  dangerous for the backend's own role per se, but a drift from the documented design worth a
  one-line note back to `database-architect`'s own design doc if confirmed.
- Step 4 `rolbypassrls = true` or `rolsuper = true` → RLS is moot for this role; steps 1/2/5 are
  what actually governs its access. If this is `true` in production, **SR-3 was never actioned**
  (TB-3's "currently the project superuser" state persists) — flag that back to `cybersecurity-architect`
  separately from C-2, since it's a standing, named, previously-accepted-as-open item (SR-3,
  "unverified live"), not something this task can resolve, but C-2's own result depends on knowing
  which case you're in.
- Step 4 `false`/`false` **and** step 3 `rls_enabled = true` **and** step 5 returns zero rows for a
  table → the dangerous, silent case: `SELECT`s against that table return no rows (not an error),
  which is exactly D-1's "the watermark quietly loses that source" failure the incident doc names.
  `INSERT`s would be rejected outright (a visible `42501`/RLS-violation error, not silent) unless a
  `WITH CHECK` policy happens to admit them.

## 5. Finding and draft fix

**Concern — not "looks correct per the migrations," because there is nothing in the migrations to
compare against.** The migrations are silent on this role entirely; the one document that does
discuss RLS/grants for these tables (`database-design.md` §5.2/§5.3) explicitly scopes its ruling
to `authenticated`/`anon` and states the backend's own access is "backend-mediated" without ever
writing the GRANT that mediation requires. Combined with security-review.md's own unresolved "SR-3:
specified; unverified live" line, the honest status is: **the intended privilege state for the
backend's own role on these two tables has never been written down anywhere in this repo, let
alone applied via a tracked migration.** Whatever is live in production today reflects, at best, an
untracked console action.

Given §3's finding that the backend needs exactly `SELECT, INSERT` on both tables and nothing more,
here is a draft forward migration that grants precisely that — written idempotently so it is safe
to run whether or not some subset of these grants already exists, and deliberately **not** touching
RLS (enabling it is already done per intent; adding a bypass or a policy for this role is a
separate, larger decision about whether the direct-Postgres role should go through RLS policies at
all or should instead be the documented SR-3 exception, which needs `cybersecurity-architect`
sign-off, not a quick grant fix). **Do not apply this without first running §4's checks** — if
step 1 already returns all-`true`, this migration is a no-op confirmation, not a fix, and should
still be applied for the sake of having the grant tracked in version control rather than living
only in an untracked console action.

**Unresolved prerequisite this draft cannot fill in:** the exact role name. It is a secret
(embedded in `SUPABASE_DB_URL`), correctly never committed to this repo. Whoever applies this
migration must substitute it for the `:backend_app_role` placeholder below (e.g. via `psql -v
backend_app_role='the_actual_role_name'`) after confirming it from the production
`SUPABASE_DB_URL` value.

```sql
-- backend/migrations/036_c2_backend_role_grants.sql  (DRAFT — NOT APPLIED)
--
-- INC-003 C-2 (§15.2/§17.1): the backend's dedicated least-privilege Postgres role
-- (SR-3, database-design.md §5.2/§5.3's RLS sections never actually grant anything
-- to this role — they only rule out `authenticated`/`anon`) has had no tracked GRANT
-- of any kind on app.account_state_transitions or app.account_audit_log. This
-- migration grants exactly what backend/src/repositories/accounts.ts,
-- backend/src/repositories/audit-log.ts, and backend/src/repositories/sessions.ts
-- actually exercise (SELECT, INSERT only — confirmed by grep, no UPDATE/DELETE call
-- exists against either table in backend/src/) — no more.
--
-- Substitute the real role name for :backend_app_role before running (it is a
-- secret, embedded in SUPABASE_DB_URL, and is deliberately not written here).
-- Idempotent: safe to re-run.
--
-- Status: WRITTEN, NOT YET APPLIED to any project, live or otherwise.

grant usage on schema app to :backend_app_role;

grant select, insert on app.account_state_transitions to :backend_app_role;
grant select, insert on app.account_audit_log         to :backend_app_role;

comment on table app.account_state_transitions is
  'Append-only audit trail for BR-5 state machine transitions. Never updated or deleted '
  'by application code. account_state on app.accounts is the fast-read current-state '
  'column; this table is the history of how it got there. Retention period is FU-04, '
  'not yet ruled by compliance-specialist — deliberately kept as a separate table from '
  'account_audit_log so it can carry a different (likely longer) retention. '
  'INC-003 C-2 (migrations/036): SELECT, INSERT explicitly granted to the backend''s '
  'own least-privilege Postgres role — this comment, not database-design.md §5.2, is '
  'the first place that grant is tracked in version control.';

comment on table app.account_audit_log is
  'Authentication/security audit events. account_id nullable by design: a login_failure '
  'against a non-existent email must still be logged (credential-stuffing detection, '
  'FR-11/FR-12) without a real account row to reference. 12-month retention per '
  'compliance-specialist Stage 1 §9.3, legal_hold carve-out, purge job in §6 — purge job '
  'itself not yet implemented in backend/src (FU-A13, not scheduled). '
  'INC-003 C-2 (migrations/036): SELECT, INSERT explicitly granted to the backend''s '
  'own least-privilege Postgres role — this comment, not database-design.md §5.3, is '
  'the first place that grant is tracked in version control.';

-- Deliberately NOT touched by this migration:
--   - RLS enable/disable state on either table (assumed already enabled per
--     database-design.md §5.2/§5.3's stated intent — confirm with §4 step 3 of
--     INC-003-c2-grant-verification.md, do not assume).
--   - Any RLS POLICY admitting :backend_app_role. If §4 step 3 shows RLS enabled
--     AND §4 step 4 shows this role is neither bypassrls nor the table owner, the
--     GRANTs above are necessary but not sufficient — a policy (or BYPASSRLS on
--     this role, which is the documented SR-3 posture: a non-PostgREST,
--     backend-mediated role is exactly the case RLS was never meant to gate) is
--     also required, and that is a cybersecurity-architect-reviewed decision, not
--     folded into this grant-only migration.
--   - UPDATE/DELETE privileges: not granted, because no code path uses them. If a
--     future feature (e.g. the FU-A13 purge job) needs DELETE on
--     app.account_audit_log, that is a new, separately-reviewed migration, not an
--     implicit extension of this one.
```

## 6. Summary for whoever runs §4 live

1. The migrations contain **no grant or RLS statement at all** for either table — the spec lives in
   `database-design.md` §5.2/§5.3, and that spec only governs `authenticated`/`anon`, never the
   backend's own direct-Postgres role.
2. `security-review.md` already flags this role's live state as unresolved (SR-3: "specified;
   unverified live"; TB-3: "currently the project superuser" as of that review). C-2 is the first
   time anyone has asked to actually check it against these two specific tables.
3. The backend's code only needs `SELECT, INSERT` on both tables (confirmed by grep across
   `backend/src/repositories/`) — no `UPDATE`/`DELETE`.
4. Run §4's six checks as the backend's actual production role. If any of the four `has_table_privilege`
   calls or the schema-`USAGE` check comes back `false`, apply §5's draft migration (after filling in
   the real role name) as the forward-migration fix C-2 requires before merge — per the incident
   doc, never by relaxing application code to tolerate the failure.
5. If step 4 shows the role is `rolsuper`/`rolbypassrls`, §5's grants are harmless but moot for this
   role specifically, and that fact itself should go back to `cybersecurity-architect` as a
   still-open SR-3 item, separate from closing C-2.
