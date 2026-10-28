# ADR-0015: CI-Run Migration Path With a Dedicated Least-Privilege Migration Role

Status: Proposed
Date: 2026-10-28
Deciders: `database-architect` (proposing, role/schema design), `devops-engineer` (proposing, CI mechanism), pending `cto` ratification per INC-003 §39's instruction

## Context

INC-003 §22.6 and §39 name a standing gap: **no migration runner exists anywhere in this repo.**
`backend/migrations/*.sql` (currently 030–040) are plain numbered SQL files, applied by hand —
either the project owner running them directly against Supabase (dashboard SQL editor or `psql`
with their own credential), or, on 2026-10-28, an agent doing the same with a pasted credential.
`cto`'s §39 ruling is explicit that the latter was a one-off, sets no precedent, and that the
correct fix is this ADR: *"a scoped, auditable migration path, such as a CI-run migration job
with its own role and no agent custody of the credential."*

Three things already exist that this proposal must fit around, not duplicate or conflict with:

1. **`backend/migrations/036_sr3_least_privilege_app_role.sql`** (SR-3, written, not yet applied)
   creates `td_backend_app` — a **runtime** role for `backend/src/db/pg.ts`. It is deliberately
   `NOBYPASSRLS`, owns nothing, and its own header (§5) states it explicitly: *"Migrations are
   owner-run, through the owner's own Supabase-dashboard-authenticated session, never through
   this role's credential"* and *"this role never runs DDL."* **This ADR's migration role must be
   a separate credential from `td_backend_app`, never the same one** — conflating the two would
   re-grant DDL/ownership to the exact role SR-3 exists to narrow.
2. **The numbering/application convention.** Files are named `NNN_description.sql`, committed in
   order, and (per `backend/README.md`'s own language, quoted in migration 036's header) are
   treated as "written and not applied" until someone applies them — there is no
   `supabase/migrations/` directory and no `schema_migrations`-style ledger table anywhere today.
   Any mechanism this ADR proposes has to either introduce that ledger or risk re-running an
   already-applied file.
3. **CI shape.** `.github/workflows/ci.yml` runs on `push`/`pull_request` to `main` only, with four
   build/test jobs (`frontend`, `backend`, `mobile`, `governance`) plus one deliberately
   `continue-on-error` guard job, and `permissions: contents: read` at the workflow level — no job
   in this file holds any secret or talks to a live database today. This is the first proposal to
   add a job with real external-write capability; it should not casually inherit the `on: push`
   trigger the rest of the file uses for build/test.

## Decision

### 1. Mechanism: a separate, manually-dispatched CI job, not an on-merge step

Add a new job, `migrate`, in its own workflow file (`.github/workflows/migrate.yml`), **not**
appended to `ci.yml`'s existing jobs. Reasons to keep it a separate file rather than a job added to
`ci.yml`:

- `ci.yml`'s jobs are idempotent, side-effect-free (lint/typecheck/test/build) and run
  unconditionally on every push/PR. A migration job is neither idempotent-by-default (without the
  ledger in §2 below) nor safe to run unconditionally on every merge — DDL against a live Postgres
  database used for identity data is not something to fire automatically the moment a PR merges
  containing an unrelated code change that happens to also include a new migration file.
- Separating files keeps the blast radius and the secret scope legible: anyone auditing what has
  write access to production Postgres reads one short file, not a diff against the shared
  build/test workflow.

Trigger: **`workflow_dispatch`** only (manual, from the Actions tab or `gh workflow run`), with one
required input, `confirm`, that must literally equal the string `apply-migrations` — a deliberate
"type to confirm" friction point, mirroring the kind of explicit confirmation INC-003 §39 item 3
asks for in place of an implicit one-click or fully automatic trigger. **Not** `on: push to main`:
this repo's own "written, not yet applied" convention (§1.2 above) already establishes that a
merged migration file is not synonymous with "ready to apply this second" — the owner today
chooses when to run it, sometimes well after merge (migrations 032/033 sat unapplied for weeks per
036's own header). A manual trigger preserves that existing, working cadence instead of forcing
every migration to apply the instant its PR lands.

Gating, so this is not just "manual" but *authorized*: the job's environment is
`production-postgres-migrations`, a GitHub **Environment** with **required reviewers** set to the
project owner (and, once more than one trusted human exists on this project, any other named
owner — never an agent identity). A `workflow_dispatch` run queues but does not execute until a
required reviewer approves it in the Actions UI. This is the concrete answer to INC-003 §39's "no
agent custody of the credential": the credential lives only in that Environment's encrypted
secrets, scoped to that Environment, and no workflow step prints it, no agent session ever holds
it, and the approval gate means a compromised or over-eager CI trigger still can't run DDL without
a human click.

Who can trigger a run at all: anyone with write access to the repo can *queue* a `workflow_dispatch`
run (that's a repo-permission question, not this ADR's to re-litigate), but the Environment's
required-reviewer gate means queuing is not executing — the actual DDL only runs after the named
owner approves that specific run.

### 2. What the job actually runs: an idempotent, ledger-tracked apply step

Add `backend/scripts/apply-migrations.ts` (a small Node/`pg` script, consistent with the stack
already in `backend/`, not a new language/tool):

1. Connects using the dedicated role's credential (§3), read from the environment the CI step
   injects it into — never logged, never written to a file the job artifacts.
2. Ensures a ledger table exists: `app.schema_migrations (filename text primary key, applied_at
   timestamptz not null default now(), checksum text not null)`. This is itself migration
   `041_schema_migrations_ledger.sql`, written to apply **idempotently** (`create table if not
   exists`) so introducing the ledger doesn't require a special first-run path.
3. Reads `backend/migrations/*.sql` in filename order, computes a checksum (sha256) of each file's
   contents, and for every file not already recorded in `app.schema_migrations`: runs it inside a
   single transaction, then inserts the ledger row in that same transaction. If a filename *is*
   recorded but its checksum differs from what's on disk, the script fails loudly and does not
   apply anything further — a changed-after-applied migration file is exactly the kind of silent
   drift this ledger exists to catch, not paper over.
4. Logs (to the job's own output, which is retained by GitHub Actions per the repo's normal
   retention, not anywhere this ADR needs to invent) which files were newly applied, which were
   already-applied-and-skipped, and the before/after count — the auditable trail INC-003 §39 asks
   for, in place of today's "an agent or the owner ran something, ask them what" model.
5. Exits non-zero on any failure, including mid-file errors; the transaction-per-file design means
   a failing file rolls back cleanly and does not leave the ledger or schema in a partially-applied
   state for that file (files already committed in earlier iterations of the loop stay applied,
   matching this repo's existing convention that migrations are applied in order and each one is
   expected to be independently correct — see migration 036's own header on this point).

This script is also runnable locally by the owner (`DATABASE_URL=... npm run migrate` against
their own `psql`-equivalent credential) for the same reason the owner runs things manually today —
this ADR does not remove that path, it adds an audited alternative to it. Nothing in this design
requires CI to be the *only* way migrations are ever applied; it requires that **when an agent
needs one applied, the agent dispatches this job instead of being handed or asked for a
credential**, which is the specific failure mode §39 is closing off.

### 3. The role: `td_migration_runner` — DDL-capable, narrowly scoped, never the runtime role

A new Postgres role, created by its own migration (`042_migration_runner_role.sql`, applied by the
owner directly, same one-time bootstrapping constraint SR-3's `td_backend_app` had — a DDL-granting
role cannot be created by a role that doesn't yet have DDL rights, so this one file is necessarily
owner-run before the CI path can run anything):

```sql
create role td_migration_runner
  with login
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit
  noreplication
  nobypassrls
  connection limit 2;

alter schema app owner to td_migration_runner;
-- ownership of every existing app.* table/type/sequence transfers with the schema reassignment
-- for objects already owned by whichever role currently owns them (today: the `postgres`
-- credential, pending SR-3 cutover) — database-architect to confirm the exact REASSIGN OWNED BY
-- step needed at bootstrap time, since `alter schema ... owner to` does not itself reassign
-- ownership of objects already inside the schema.
```

Properties, deliberately mirroring the shape of SR-3's design reasoning rather than inventing a new
pattern:

- **`NOSUPERUSER`, `NOCREATEROLE`, `NOCREATEDB`, `NOBYPASSRLS`** — same floor SR-3 set for
  `td_backend_app`. This role can do real damage (it owns `app` schema and can run arbitrary DDL
  within it) but it categorically cannot create new roles, databases, or escalate RLS bypass
  beyond what owning the schema already implies.
- **Scoped to the `app` schema only.** Never granted anything on `auth.*` (Supabase's own identity
  schema — same exclusion SR-3's design makes, same reasoning: no migration in this repo's history
  has ever needed to touch it, and GoTrue manages its own schema) or `storage.*`/other
  Supabase-managed schemas. If a future feature genuinely needs a migration against another
  schema, that is a new, reviewed grant on this role at that time, not a standing one today.
- **Distinct from `td_backend_app` (SR-3), on purpose, with no privilege overlap requiring
  reconciliation.** `td_backend_app` is `NOBYPASSRLS` and owns nothing — it reads/writes rows
  through the RLS policies migration 036 grants it. `td_migration_runner` owns the schema and
  everything in it, which is exactly the privilege SR-3's design explicitly withheld from the
  runtime role (036 §1's `comment on role` text: *"Must never be used to run migrations/DDL... "*).
  Because `td_migration_runner` owns the tables, it can run the `grant ... to td_backend_app` /
  `create policy ... to td_backend_app` statements migration 036 and future migrations need,
  without itself needing superuser. This is the mechanism that resolves the otherwise-circular
  problem of "the no-DDL runtime role needs grants, but who grants them if no DDL role exists."
- **Connection limit 2, used only during a migration run.** Not a pooled, always-on credential
  the way `SUPABASE_DB_URL`/`td_backend_app` is for the running backend — this role's connection
  string is only ever opened by the `apply-migrations.ts` script inside the gated CI job (or the
  owner's own manual local run), for the seconds-to-minutes a migration batch takes, then closed.
- **Password set out-of-band by the owner** immediately after the role is created, following the
  exact discipline SR-3's header establishes for `td_backend_app` — generated, never committed,
  stored only as the GitHub Environment secret `MIGRATION_RUNNER_DATABASE_URL` (scoped to the
  `production-postgres-migrations` Environment, not a repo-wide secret every workflow can read)
  and, if the owner wants a local-run fallback, in their own password manager — never in chat, never
  in a file an agent session can read.

This role, migration `042`, is **net-new and additive to SR-3**, not a reopening of it: SR-3's
design and migration `036` are unchanged by this ADR. The one coupling point — `td_migration_runner`
needing to own the schema `td_backend_app`'s grants point at — is exactly why this ADR's migration
`042` should be sequenced to apply *before or alongside* SR-3's cutover (`036`), not after a world
where some other role already owns `app` by default (today, before either migration applies, that
owner is whatever the `postgres`/superuser credential already is — reassigning it to
`td_migration_runner` at bootstrap is a strict narrowing, not a widening, of who can do DDL).

### 4. Supabase-native alternative — evaluated, not adopted, with a narrower piece kept

This project's house bias is to prefer managed/existing tooling over custom infrastructure where
one genuinely fits. Supabase does offer a managed migration path: the Supabase CLI's
`supabase db push`/`supabase migration` commands, reading from a `supabase/migrations/` directory
of timestamp-named SQL files, optionally wired into CI via `supabase link` + a
`SUPABASE_ACCESS_TOKEN`/service-role-adjacent credential (there is a documented GitHub Action
pattern for exactly this). Checked against this repo's actual state before proposing custom
infrastructure, per this project's "prefer managed solutions" bias:

- **File-layout mismatch.** This repo's migrations live in `backend/migrations/*.sql`, numbered
  `030`–`040`, not Supabase's expected `supabase/migrations/<timestamp>_name.sql` layout, and
  `supabase/` in this repo today holds only Edge Function code and auth config (`supabase/README.md`
  §"Architecture") — it has never been used for schema migrations. Adopting `supabase db push`
  would mean renaming/relocating eleven-plus already-applied-in-spirit files and reconciling the
  CLI's own migration-history table (`supabase_migrations.schema_migrations`) against the manual
  applications already done for 030–035 — real one-time migration-of-the-migrations work, not a
  drop-in swap.
- **It does not actually get you least privilege for free.** `supabase db push`/CI integrations
  authenticate either via the CLI's database connection string (which, absent a role like
  `td_migration_runner`, defaults to the project's `postgres` superuser-adjacent credential — the
  exact credential INC-003 §21/§39 are trying to stop anyone from holding) or a
  project-scoped Management API access token, which is scoped to the *project*, not to a
  database *role* — it cannot be limited to "DDL on schema `app` only, nothing on `auth`." Using
  Supabase's own CLI push mechanism would still require deciding, and building, the same
  least-privilege role this ADR proposes; the CLI doesn't remove that design work, it only changes
  which process opens the connection.
- **What *is* worth keeping from Supabase's tooling:** the Supabase CLI already in use for Edge
  Function deploys (`supabase/README.md`'s `supabase functions deploy`) is a fine precedent for
  "CLI tool authenticated via a scoped, out-of-band credential run from CI," and nothing about this
  ADR's `apply-migrations.ts` precludes later adopting `supabase db push` as the *execution engine*
  once/if the file layout is unified — it would simply run under the same `td_migration_runner`
  connection string this ADR establishes, inside the same gated job. That is a follow-up
  simplification, not a blocker to proposing the ledger-script approach now, given the file-layout
  reconciliation it would require up front.

**Decision: keep migrations in `backend/migrations/*.sql` with the custom ledger script in §2,
authenticated as `td_migration_runner`, run from the gated `migrate.yml` job.** Revisit swapping the
execution engine to `supabase db push` if/when someone does the file-layout migration work for
unrelated reasons — not before.

## Alternatives Considered

- **Auto-apply on merge to `main`.** Rejected: removes the explicit human checkpoint this project's
  own incident history (INC-003) shows is needed before DDL runs against production identity data;
  also unsafe given migrations are not always written to be a strict no-op when re-run without the
  ledger table existing from day one.
- **Reuse `td_backend_app` (SR-3) for migrations too, just granted DDL.** Rejected outright — this
  is precisely the privilege creep SR-3's own header (036 §1, `comment on role`) warns against:
  "must never be used to run migrations/DDL... doing so reintroduces exactly what this role exists
  to remove."
- **A long-lived GitHub Actions secret the owner pastes once, no Environment gate, auto-run job.**
  Rejected: this is "not pasted into agent chat" but still "any compromised workflow run or
  malicious PR that can reach the job gets DDL on production" — the required-reviewer Environment
  gate is the control that keeps this meaningfully different from just moving the same risk from
  chat into CI secrets.
- **Self-hosted migration runner (a small persistent service/cron on Render) instead of CI.**
  Rejected for now: GitHub Actions `workflow_dispatch` with an Environment-level approval gate gets
  the audit trail and human-approval properties this ADR needs with no new infrastructure to
  provision/secure beyond a role and a workflow file; revisit only if migration frequency or
  duration ever outgrows what a CI job can reasonably do in one run.

## Consequences

- No agent ever needs to hold, be shown, or paste a production Postgres credential to get a
  migration applied — it dispatches `migrate.yml` and asks the owner to approve the run, which is
  exactly INC-003 §39's binding "going forward" instruction operationalized as a mechanism instead
  of a reminder.
- Introduces one new standing role (`td_migration_runner`) and one new GitHub Environment/secret to
  maintain and eventually rotate — real, bounded operational overhead, accepted because it replaces
  "owner or agent holds the full `postgres` credential" with a narrower, auditable alternative.
- Introduces a schema-migrations ledger table (`app.schema_migrations`) that did not exist before —
  a small, permanent addition to the `app` schema's surface area, but one that also retroactively
  makes "which of 030–040 has actually been applied where" answerable in code rather than only in
  prose (as migration 036's header currently has to do).
- Sequencing dependency: migration `042` (this role) and SR-3's `036` both touch who owns/can act on
  `app` schema objects; `devops-engineer` and `database-architect` must sequence their joint
  application in the same session (the already-scheduled 2026-10-30 SR-3 cutover is the natural
  point to do both), not apply them independently weeks apart.
- Does not, by itself, change who can run migrations for the Supabase-managed `auth.*`/GoTrue
  schema or Edge Function deploys — those remain on their existing paths (owner-run dashboard
  changes; `supabase functions deploy` from a developer's own authenticated CLI session) and are
  out of scope for this ADR.

## Revisit Trigger

Reopen this ADR if: migration frequency/duration grows past what a single CI job run can handle
(triggers evaluating a persistent runner service); the `backend/migrations/*.sql` file layout is
ever consolidated into `supabase/migrations/`, making `supabase db push` genuinely simpler than the
custom ledger script (§4's noted follow-up); or GitHub Environment required-reviewer gating proves
insufficient in practice (e.g., more than one trusted human owner needs a quorum/two-person rule
rather than a single-approver gate) — a straightforward Environment-config change, not a redesign
of this ADR's mechanism.
