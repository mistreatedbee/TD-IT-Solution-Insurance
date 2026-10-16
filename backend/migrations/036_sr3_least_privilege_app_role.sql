-- SR-3 (INC-003 §21, §22) — dedicated least-privilege Postgres role to replace the
-- bypass-capable `postgres` credential `SUPABASE_DB_URL` currently resolves to in
-- production (live-confirmed `rolbypassrls = true`, `rolsuper = false` — INC-003 §21 C-2).
--
-- Author: database-architect. Status: DESIGN ONLY — WRITTEN, NOT YET APPLIED to any
-- project, live or otherwise. No agent has run this against production; no agent holds
-- a production credential (cto ruling, INC-003 §21). This file requires:
--   1. database-architect design review sign-off (this file).
--   2. security-engineer review of the RLS policies and the FU-A10 assertion they'll
--      build against pg_roles columns asserted in §9 of INC-003's appended SR-3 design
--      section.
--   3. The project owner running this SQL directly (Supabase SQL editor or psql with the
--      owner's own credential) — see INC-003 §21's "standing rule": production
--      credentials are not pasted into agent chat again.
--   4. `ALTER ROLE td_backend_app WITH PASSWORD '<secret, generated out of band>';` run
--      SEPARATELY by the owner, immediately after this file, and NEVER committed here or
--      anywhere else in source control.
--   5. devops-engineer sequencing the `SUPABASE_DB_URL` cutover in Render (separate,
--      tracked step — INC-003 §21's table) only after this file is confirmed applied and
--      re-verified per INC-003 §22 C-2-equivalent checks.
--
-- Whoever applies this must correct this header per the precedent migrations/032's and
-- migrations/035's headers document (029/030/031 were left stale after application).
--
-- =====================================================================================
-- WHY EVERY TABLE BELOW GETS ITS OWN POLICY, NOT JUST THE TWO AUDIT TABLES
-- =====================================================================================
-- Every `app.*` table in this project was designed on the assumption the backend always
-- connects as a role that bypasses RLS (`service_role`/the current `postgres` credential,
-- both `rolbypassrls = true`) — see docs/features/001-authentication/database-design.md
-- §5 and architecture/database-addendum-001.md §5: RLS is enabled on every table, but
-- deliberately carries NO policies for anyone, because the backend's own access was never
-- meant to go through a policy at all. `td_backend_app` below is the first role in this
-- project's history for which that assumption is false. Without an explicit policy TO
-- td_backend_app on EVERY table it touches, removing BYPASSRLS turns every SELECT into
-- zero rows and every INSERT/UPDATE into a silent RLS rejection — this is the exact
-- cutover trap INC-003 §21's SR-3 schedule entry warns about, and the reason this file
-- exists before, not during, cutover.
--
-- Policies below grant `td_backend_app` unconditional (`using (true)` / `with check
-- (true)`) access per operation, scoped to this role only (`to td_backend_app`, never
-- `authenticated`/`anon`). This does not weaken the existing own-row-only posture for
-- `authenticated`/`anon` (database-design.md §5's C3/C4 default-deny ruling is untouched —
-- no policy below is created `to authenticated` or `to anon`, and no existing policy for
-- those roles is modified). The access-control boundary for td_backend_app's own queries
-- remains the backend's own WHERE-clause scoping (by account_id, token_hash, etc.) in
-- `src/repositories/*` — the same boundary that already existed under the bypass-capable
-- credential. RLS was never the thing enforcing that boundary; this migration does not
-- change who is responsible for it, only removes the blast-radius/tamper-resistance gap a
-- superuser-adjacent credential carried.
--
-- =====================================================================================
-- TABLE INVENTORY — every `app.*` table `backend/src/repositories/*` and
-- `backend/src/routes/*` actually touch (grepped 2026-10-16; excludes `*.test.ts` fixture
-- literals and Mongo-backed repositories that only mention Postgres table names in
-- doc-comments — `location-consent-log.ts`, `push-token-security-log.ts`, `alerts.ts`,
-- and every other repository under `backend/src/repositories/` not listed below are
-- MongoDB collections per ADR-0002 and are out of scope for this role):
--   app.accounts                     — repositories/accounts.ts, routes/auth.ts
--   app.account_status_cache         — repositories/accounts.ts (read) +
--                                       app.sync_account_status_cache() trigger (write,
--                                       SECURITY INVOKER — see §2 below)
--   app.sessions                     — repositories/sessions.ts
--   app.account_state_transitions    — repositories/accounts.ts (insert),
--                                       repositories/sessions.ts (read, watermark query)
--   app.account_audit_log            — repositories/audit-log.ts (insert only),
--                                       repositories/sessions.ts (read, watermark query)
--   app.invitations                  — repositories/invitations.ts
--   app.enrollment_tickets           — repositories/enrollment-tickets.ts
--   app.reset_mfa_verification_tokens — repositories/reset-mfa-tokens.ts
--   app.idempotency_keys             — repositories/idempotency.ts
--
-- Explicitly NOT in this role's grant set, and why:
--   app.partner_organizations — referenced only by backend/scripts/seed-test-accounts.ts
--     (a dev/test seed tool, not backend runtime code reachable from any route). No
--     SELECT/INSERT against this table exists anywhere in backend/src. If a future
--     feature adds one (database-design.md §5.5's "admin browses partner orgs" footnote),
--     add its grant + policy in that feature's own migration, not retrofitted here.
--   app.retention_purge_runs — referenced only in paper design docs
--     (database-design.md §2.6/§5.7, architecture/database-addendum-001.md §1.3); no
--     backend/src code reads or writes it today. `backend/scripts/police-report-retention-
--     purge.ts` operates against MongoDB recovery-case data, not this table. Add this
--     role's grant when a real purge job is implemented against it, not before — an
--     unused grant is exactly the "speculative index"-style risk this role's design
--     checklist warns against, applied to grants instead of indexes.
--   `auth.*` (any table) — never granted, per requirement 6. No backend/src code reads
--     `auth.*` directly; GoTrue Admin API calls go through `db/supabase.ts`'s
--     service-role `supabase-js` client, a completely separate credential path from
--     `SUPABASE_DB_URL`/`pg`, untouched by this migration.
--
-- A note on the baseline itself: the original `CREATE TABLE`/`ENABLE ROW LEVEL SECURITY`
-- statements for app.accounts, app.sessions, app.account_state_transitions,
-- app.account_audit_log, app.invitations, app.account_status_cache, app.idempotency_keys,
-- and app.partner_organizations are NOT present as applied migration files in this repo
-- (`backend/migrations/` starts at 030; the Stage 6 baseline and its addendum are
-- documented only as paper-design SQL in `docs/features/001-authentication/`). This
-- migration assumes those tables exist live with the schema those paper documents and
-- `backend/src/repositories/*`'s column references describe, which is consistent with
-- INC-003 §21's live C2 verification against two of them. If live column names diverge
-- from what is referenced below, this file will fail loudly at apply time (bad column
-- name in a policy/grant is a hard Postgres error, not a silent no-op) — it will not
-- silently under- or over-grant.

-- =====================================================================================
-- §1. Role creation — NOBYPASSRLS, not superuser, not an owner of anything.
-- =====================================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'td_backend_app') then
    create role td_backend_app
      with login
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication
      nobypassrls
      connection limit 20;
    -- `noinherit`: this role is used directly as a LOGIN role via the Supavisor pooler
    -- (requirement 8), not as a group role other logins inherit from — noinherit is the
    -- correct, narrower default for a single-purpose application role and costs nothing
    -- here since nothing is ever granted TO this role via role membership.
  end if;
end
$$;

-- Password is set OUT OF BAND by the project owner, immediately after this file is
-- applied, and is never written to this file or any other committed file:
--   alter role td_backend_app with password '<generated secret, owner-held>';
-- Rotation follows the same discipline INC-003 §21 established for the credential this
-- role replaces.

comment on role td_backend_app is
  'SR-3 (INC-003 appended design section, 2026-10-16). Least-privilege login role for the '
  'backend API runtime (src/db/pg.ts). NOBYPASSRLS, not superuser, owns no table in the '
  '`app` schema. Replaces the project `postgres` credential SUPABASE_DB_URL resolved to '
  'before cutover. Must never be granted BYPASSRLS, SUPERUSER, or ownership of any `app.*` '
  'object — doing so reintroduces exactly what this role exists to remove. Must never be '
  'used to run migrations/DDL (see this file''s header, requirement 7) — migrations are '
  'owner-run, through the owner''s own Supabase-dashboard-authenticated session, never '
  'through this role''s credential.';

-- =====================================================================================
-- §2. Schema-level and type-level USAGE.
-- =====================================================================================

grant usage on schema app to td_backend_app;

-- USAGE on every enum type in the `app` schema, granted dynamically rather than
-- enumerated by name — the exact set live today (at minimum: app.user_type,
-- app.account_state, app.audit_event_type, app.session_revoked_reason,
-- app.invitation_status, per the columns backend/src/repositories/* reference and the
-- `alter type app.audit_event_type add value ...` / `alter type
-- app.session_revoked_reason add value ...` statements in migrations/030, 032, 035) is
-- not independently confirmable from this checkout without a live baseline-migration
-- record (see the note above). Enumerating dynamically means this grant is correct
-- regardless of which of those names turn out to be real enum types vs. plain `text`
-- columns with a CHECK constraint, and it doesn't need a follow-up migration if the live
-- baseline turns out to have a type this design didn't anticipate.
do $$
declare
  t record;
begin
  for t in
    select format('%I.%I', n.nspname, ty.typname) as qualified_name
    from pg_type ty
    join pg_namespace n on n.oid = ty.typnamespace
    where n.nspname = 'app'
      and ty.typtype = 'e' -- enum types only
  loop
    execute format('grant usage on type %s to td_backend_app', t.qualified_name);
  end loop;
end
$$;

-- No sequences exist in the `app` schema today — every primary key observed in
-- migrations/030 and backend/src/repositories/* uses `uuid primary key default
-- gen_random_uuid()`, not a serial/bigserial column (verified: no `nextval`/`serial`
-- anywhere in backend/migrations/*.sql). Defensive EXECUTE grant on gen_random_uuid()
-- itself, in case a future Supabase project configuration has revoked the default PUBLIC
-- EXECUTE grant pgcrypto/pgcrypto-equivalent functions normally carry:
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'gen_random_uuid' and n.nspname in ('pg_catalog', 'extensions', 'public')
  ) then
    execute (
      select format('grant execute on function %I.%I() to td_backend_app', n.nspname, p.proname)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where p.proname = 'gen_random_uuid' and n.nspname in ('pg_catalog', 'extensions', 'public')
      limit 1
    );
  end if;
end
$$;

-- app.sync_account_status_cache() (migrations/030) is `security invoker` — it runs with
-- the privileges of whoever performs the INSERT/UPDATE on app.accounts that fires it,
-- i.e. td_backend_app once cutover lands, not the function's definer. EXECUTE is granted
-- defensively; trigger invocation does not strictly require it, but the table-level
-- INSERT/UPDATE grant on app.account_status_cache below (§3) is what the trigger body
-- actually needs to succeed, and is the one that would silently break cutover if missed.
grant execute on function app.sync_account_status_cache() to td_backend_app;

-- =====================================================================================
-- §3. Table grants — one block per table, matching exactly the operations
-- backend/src/repositories/* perform (grepped 2026-10-16: no DELETE statement exists
-- anywhere against any `app.*` table in backend/src — see this file's header inventory).
-- =====================================================================================

-- --- app.accounts --------------------------------------------------------------------
grant select, insert, update on app.accounts to td_backend_app;

create policy td_backend_app_select on app.accounts
  for select to td_backend_app using (true);
create policy td_backend_app_insert on app.accounts
  for insert to td_backend_app with check (true);
create policy td_backend_app_update on app.accounts
  for update to td_backend_app using (true) with check (true);

-- --- app.account_status_cache ---------------------------------------------------------
-- SELECT: repositories/accounts.ts#getAccountStatus (the D-2 chokepoint read).
-- INSERT/UPDATE: NOT called directly by backend/src — populated exclusively by
-- app.sync_account_status_cache()'s trigger body (`insert ... on conflict do update`),
-- which fires `security invoker` on td_backend_app's own INSERT/UPDATE of app.accounts.
-- Omitting these two grants is the single most likely way to break account
-- creation/state-transition at cutover (the trigger fails, the whole enclosing statement
-- rolls back) without it being obvious from reading repositories/accounts.ts alone —
-- flagged here precisely because it is the least visible of this file's grants.
grant select, insert, update on app.account_status_cache to td_backend_app;

create policy td_backend_app_select on app.account_status_cache
  for select to td_backend_app using (true);
create policy td_backend_app_insert on app.account_status_cache
  for insert to td_backend_app with check (true);
create policy td_backend_app_update on app.account_status_cache
  for update to td_backend_app using (true) with check (true);

-- --- app.sessions ----------------------------------------------------------------------
grant select, insert, update on app.sessions to td_backend_app;

create policy td_backend_app_select on app.sessions
  for select to td_backend_app using (true);
create policy td_backend_app_insert on app.sessions
  for insert to td_backend_app with check (true);
create policy td_backend_app_update on app.sessions
  for update to td_backend_app using (true) with check (true);

-- --- app.account_state_transitions ------------------------------------------------------
-- Append-only history table. SELECT (sessions.ts's revocation-watermark query) + INSERT
-- (accounts.ts#transitionAccountState) only. No UPDATE, no DELETE grant, and — just as
-- importantly — no UPDATE/DELETE *policy* either: both layers independently block
-- tampering, so a future mistaken GRANT does not alone reopen this table to mutation.
grant select, insert on app.account_state_transitions to td_backend_app;

create policy td_backend_app_select on app.account_state_transitions
  for select to td_backend_app using (true);
create policy td_backend_app_insert on app.account_state_transitions
  for insert to td_backend_app with check (true);

-- --- app.account_audit_log --------------------------------------------------------------
-- AUD-11: the table whose tamper-resistance this whole role exists to restore. SELECT
-- (sessions.ts's revocation-watermark query) + INSERT (audit-log.ts) only. Deliberately NO
-- UPDATE, NO DELETE grant, and NO UPDATE/DELETE policy, matching account_state_transitions
-- above. This is what makes the FU-A10 assertion's negative UPDATE/DELETE probe (INC-003's
-- appended SR-3 design section §9) expected to fail with a permission-denied error, not an
-- RLS-silently-filters-zero-rows outcome — a GRANT-level denial is unconditional
-- regardless of RLS policy state, and is the stronger of the two guarantees.
grant select, insert on app.account_audit_log to td_backend_app;

create policy td_backend_app_select on app.account_audit_log
  for select to td_backend_app using (true);
create policy td_backend_app_insert on app.account_audit_log
  for insert to td_backend_app with check (true);

-- --- app.invitations ---------------------------------------------------------------------
grant select, insert, update on app.invitations to td_backend_app;

create policy td_backend_app_select on app.invitations
  for select to td_backend_app using (true);
create policy td_backend_app_insert on app.invitations
  for insert to td_backend_app with check (true);
create policy td_backend_app_update on app.invitations
  for update to td_backend_app using (true) with check (true);

-- --- app.enrollment_tickets ---------------------------------------------------------------
grant select, insert, update on app.enrollment_tickets to td_backend_app;

create policy td_backend_app_select on app.enrollment_tickets
  for select to td_backend_app using (true);
create policy td_backend_app_insert on app.enrollment_tickets
  for insert to td_backend_app with check (true);
create policy td_backend_app_update on app.enrollment_tickets
  for update to td_backend_app using (true) with check (true);

-- --- app.reset_mfa_verification_tokens ------------------------------------------------------
grant select, insert, update on app.reset_mfa_verification_tokens to td_backend_app;

create policy td_backend_app_select on app.reset_mfa_verification_tokens
  for select to td_backend_app using (true);
create policy td_backend_app_insert on app.reset_mfa_verification_tokens
  for insert to td_backend_app with check (true);
create policy td_backend_app_update on app.reset_mfa_verification_tokens
  for update to td_backend_app using (true) with check (true);

-- --- app.idempotency_keys -------------------------------------------------------------------
-- SELECT + INSERT only. repositories/idempotency.ts's INSERT uses
-- `on conflict (endpoint, idempotency_key) do nothing` — never an UPDATE statement — so no
-- UPDATE grant or policy is needed, and omitting it keeps a client-replay-collision from
-- ever mutating a previously stored response even by accident of future code.
grant select, insert on app.idempotency_keys to td_backend_app;

create policy td_backend_app_select on app.idempotency_keys
  for select to td_backend_app using (true);
create policy td_backend_app_insert on app.idempotency_keys
  for insert to td_backend_app with check (true);

-- =====================================================================================
-- §4. Default privileges for future migrations.
-- =====================================================================================
-- Deliberately NARROW, not a blanket "grant everything on future tables" rule. A blanket
-- `alter default privileges ... grant select, insert, update, delete on tables to
-- td_backend_app` would silently hand this role UPDATE/DELETE on some future audit-style
-- table the day it's created, before anyone has reviewed whether that table needs the same
-- AUD-11-style restriction account_audit_log and account_state_transitions get above —
-- reintroducing by default exactly the kind of blast-radius this role exists to bound.
--
-- Instead: default privileges below cover only the two object kinds where "grant it
-- automatically" carries no meaningful policy judgment (types and sequences — a role
-- either can use a type/sequence or it can't; there's no per-type equivalent of "but not
-- UPDATE"). Every future `app.*` TABLE must get its own explicit GRANT + RLS policy
-- (SELECT/INSERT/UPDATE/DELETE chosen deliberately per that table's actual read/write
-- pattern, per this role's design checklist) inside the SAME migration that creates it —
-- add this to the migration-authoring checklist backend-engineer/database-architect use,
-- not solved by a default-privileges rule here.

alter default privileges for role td_backend_app in schema app
  grant usage on types to td_backend_app;

alter default privileges for role td_backend_app in schema app
  grant usage, select on sequences to td_backend_app;

-- Note: `alter default privileges FOR ROLE` only applies to objects later created BY that
-- same role. Since td_backend_app never runs DDL (requirement 7 — migrations are
-- owner-run), the two statements above are inert until/unless that constraint changes.
-- They are included for completeness and because granting USAGE on a type/sequence is
-- harmless even if never exercised. If migrations come to be run by a distinct, named
-- migration-owner role (§5 below), repeat these two statements `for role
-- <migration_owner_role>` in that role's own setup migration — the role that actually
-- creates future objects is the one whose default privileges must be set.

-- =====================================================================================
-- §5. Migrations do NOT run through this role, and do not run through any committed
-- credential today — see this file's header and INC-003's appended SR-3 design section §8
-- for the full analysis. Recorded here in SQL-comment form for proximity to the grants it
-- explains:
--
-- `backend/src/config/env.ts` defines exactly one Postgres connection string
-- (`SUPABASE_DB_URL`) and `backend/src/db/pg.ts` is its only consumer. No migration-runner
-- script exists anywhere in `backend/` (no `npm run migrate`, no `scripts/migrate*.ts`) —
-- `backend/README.md`'s own language ("migrations/032 and 033 are written and not
-- applied... must be applied to the live Supabase project before this code is deployed")
-- describes a manual, out-of-band process, not an automated one. Today that manual process
-- necessarily uses the same bypass-capable `postgres` credential this migration replaces
-- for the RUNTIME role, because no other credential exists.
--
-- After this migration lands and SUPABASE_DB_URL is cut over to td_backend_app
-- (NOBYPASSRLS, no DDL privilege, owns nothing), that credential becomes categorically
-- unable to run any future `backend/migrations/*.sql` file — DDL requires ownership or a
-- superuser-adjacent role, which this design deliberately withholds. Required going
-- forward, decided here so cutover does not silently strand future migrations:
--   - Migrations continue to be applied by the project owner, authenticated through their
--     own Supabase-dashboard session (the same access path INC-003 §21 already used for
--     C-2's live verification) or the `postgres` role directly via psql — NEVER through
--     SUPABASE_DB_URL / td_backend_app, and never by an agent holding that credential.
--   - `SUPABASE_DB_URL` in Render is, from this migration forward, exclusively the
--     runtime application credential. It must never be the credential used to apply a
--     `backend/migrations/*.sql` file again.
--   - This is a process rule, not a technical control this migration can enforce by
--     itself — flagged to `devops-engineer`/`backend-architect` as a real gap (no
--     automated migration runner exists at all) worth its own backlog item independent of
--     SR-3's cutover deadline.
-- =====================================================================================
