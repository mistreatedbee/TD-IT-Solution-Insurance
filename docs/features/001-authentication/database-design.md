# Feature 001 — Customer Account Creation & Authentication
## Database Design — Stage 6

**Lifecycle stage:** 6 — Database Design
**Author:** `database-architect`
**Formalizes:** [`architecture/data-model-approach.md`](./architecture/data-model-approach.md) (Stage 5 conceptual approach, this role)
**Ratified by:** [`architecture-review.md`](./architecture-review.md) (Stage 5 synthesis, `solution-architect`, 2026-08-07 — gate closed, conditional exit)
**Status:** Paper design. **No live Supabase MCP access was available in producing this document; no SQL below has been executed against a live project.** All DDL, indexes, and RLS SQL are written out for review, not applied.
**Reviewers required before this is treated as final (not self-certified here):** `security-engineer` (RLS SQL — FU-05, hard Stage 8 gate), `cybersecurity-architect` (RLS threat model dependent on FU-18, and confirmation of own-row-only posture — FU-06, due at Stage 6 exit), `compliance-specialist` (retention periods — FU-04, FU-03), `backend-architect` (account_id contract confirmation — already matched per architecture-review §2.1; joint on FU-12(b) email-sync trigger and D-2's protocol half).

---

> **Addendum note (added after Stage 7):** `api-design.md` (Stage 7, `backend-architect`) flagged two tables this document did not originally define — `app.sessions` (backend-minted refresh-token/session record, FR-20 device-binding columns) and `app.idempotency_keys` (backs the idempotency strategy, api-design.md §4). Both are formalized as full DDL/indexing/RLS in [`architecture/database-addendum-001.md`](./architecture/database-addendum-001.md), **not** in this document — this document's table inventory and migration list (§2, §7) remain exactly as originally written below and should be read together with that addendum, not as the complete picture on their own. The addendum also states explicitly that the Redis-backed revocation set (api-design.md §2.1) needs no Postgres-side table at all. Total table count for Feature 001 as of the addendum: the 8 tables below **plus** `app.sessions` and `app.idempotency_keys` = 10.

## 0. What this document resolves vs. carries forward

This is Stage 6's DDL/index/RLS formalization of the Stage 5 conceptual model. It is scoped strictly to what Stage 6 owns per the architecture-review gate conditions:

- **Resolves at Stage 6 exit (per gate conditions):** FU-06 (own-row-only RLS confirmed as final posture, ruling C3 — written into SQL below), FU-12(a) (invitation vocabulary aligned: `pending | accepted | expired | revoked`, `revoked` kept in the enum with no revocation endpoint), FU-12(b) (email-sync mechanism decided: trigger, not read-through), FU-03's DDL-blocking half (the `on delete cascade` question — resolved below with a documented, reversible-if-FU-03-changes design), D-2's data-layer half (this document's §4).
- **Explicitly deferred, not resolved here:** FU-03's full deletion/anonymization mechanism (Stage 8, `compliance-specialist` A), FU-04 (retention period for `account_state_transitions`), FU-05 (RLS SQL is *written* below but is a **draft for `security-engineer` review**, not a self-certified final artifact — Stage 8 hard gate), FU-01/FU-18 (session-token contract and protocol-level staleness handling — `backend-architect`/`cybersecurity-architect`, Stage 7), FU-17 (concrete policy numbers: password strength, lockout thresholds, MFA cadence, token TTL — `cybersecurity-architect`).

---

## 1. Schema-level setup

```sql
-- migration: create_app_schema
create schema if not exists app;

comment on schema app is
  'Application business-schema for Feature 001 and downstream identity-adjacent features. '
  'Distinct from Supabase-managed auth schema per ADR-0002 — auth.users is never extended directly.';

-- app schema must be added to Supabase's "Exposed schemas" API setting for PostgREST
-- to serve it at all (dashboard/config action, not SQL — flagged to
-- cloud-infrastructure-architect / backend-architect, not this document's mechanism to apply).

grant usage on schema app to authenticated;
-- Deliberately NOT granted to anon: no unauthenticated client reads any app-schema table
-- in Feature 001 (invitation-token lookup at acceptance time is backend-mediated via
-- service_role, never a direct anon PostgREST call against app.invitations — see §5.4).
```

Enum types (kept in `app`, not `public`, so they travel with the schema):

```sql
-- migration: create_app_enums
create type app.user_type as enum (
  'customer',
  'admin',
  'security_company_operator',
  'support_agent'
);

create type app.account_state as enum (
  'pending_verification',
  'active',
  'suspended',
  'deactivated'
);

create type app.invitation_status as enum (
  'pending',
  'accepted',
  'expired',
  'revoked'
);
-- FU-12(a): 'pending' (not backend-approach.md's 'issued') and 'revoked' retained per
-- architecture-review D-4 ruling — no revocation endpoint ships in Feature 001, the
-- state exists in the enum only for forward-compatibility and is never reachable by
-- any Stage 7 endpoint in this feature's scope.

create type app.audit_event_type as enum (
  'login_success',
  'login_failure',
  'logout',
  'password_reset_requested',
  'password_reset_completed',
  'mfa_enrolled',
  'mfa_verified',
  'mfa_challenge_failed',
  'session_revoked'
);
-- Note: account-state transitions are NOT unioned into this enum (Stage 5 §1.6 left this
-- open; resolved here: kept as two physically separate tables, queried jointly by the
-- consuming endpoint via UNION ALL at query time if a combined view is ever needed, not
-- by merging rows into one table — preserves the two tables' independent retention
-- policies per FU-04, which a merged table would make impossible to purge selectively).

create type app.partner_org_status as enum (
  'active',
  'inactive'
);
```

---

## 2. Table DDL

### 2.1 `app.partner_organizations`

```sql
-- migration: create_partner_organizations_table
create table app.partner_organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  status      app.partner_org_status not null default 'active',
  created_at  timestamptz not null default now()
);

comment on table app.partner_organizations is
  'Minimal seed table for BR-7 FK target. Lifecycle ownership belongs to a future '
  'Partner Organization Management feature; this feature only reads/references it.';
```

Created first because `app.accounts` FKs into it.

### 2.2 `app.accounts`

```sql
-- migration: create_accounts_table
create table app.accounts (
  id                      uuid primary key references auth.users (id) on delete cascade,
  user_type               app.user_type not null default 'customer',
  account_state           app.account_state not null default 'pending_verification',
  email                   text not null,
  phone                   text,
  mfa_required            boolean not null default false,
  partner_organization_id uuid references app.partner_organizations (id) on delete restrict,
  invited_by              uuid references app.accounts (id) on delete set null,
  suspended_at            timestamptz,
  deactivated_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint accounts_operator_requires_partner_org
    check (user_type <> 'security_company_operator' or partner_organization_id is not null),

  constraint accounts_privileged_roles_require_mfa
    check (user_type = 'customer' or mfa_required = true)
    -- BR-4: MFA is non-negotiable for admin/security_company_operator/support_agent.
    -- mfa_required stays an independent column (not derived solely from user_type) so a
    -- customer can be flipped to mfa_required = true later without a migration, per
    -- product-plan.md §5 OQ-3 — this CHECK only enforces the floor for privileged roles,
    -- it does not couple the column's meaning to user_type.
);

comment on table app.accounts is
  '1:1 business-profile row per auth.users row. Authoritative source for authorization-'
  'relevant fields (user_type, account_state, mfa_required, partner_organization_id) — '
  'never read raw_user_meta_data/user_metadata for these, per Stage 5 §4.';

comment on column app.accounts.email is
  'Denormalized copy of auth.users.email for query convenience only. Kept in sync via '
  'app.sync_account_email_from_auth_users trigger on auth.users (see §2.2.1). '
  'auth.users.email remains the actual authentication source of truth.';
```

**`on delete cascade` from `auth.users` — resolved for Stage 6 DDL purposes, per FU-03's DDL-blocking half:** cascade is kept as written above **only as the physical-deletion path for `auth.users` rows that never had a completed account** (e.g., an orphaned partial signup). It is **not** the intended mechanism for a POPIA deletion request against a real, active account — per Stage 5 §5 and architecture-review D-1, the preferred pattern for a *completed* account is anonymize-in-place (a future `app.accounts` update, not a delete), which never touches `auth.users` and therefore never triggers this cascade. This document does not change the cascade in anticipation of FU-03/ADR-0004 landing — if compliance-specialist's ruling requires hard-delete-on-request for completed accounts too, this `on delete cascade` already does the right physical thing; if it requires anonymize-in-place, the cascade is simply never invoked for that path, and no schema change is needed either way. **This resolves the DDL-blocking half only; the full mechanism is still FU-03/Stage 8.**

`partner_organization_id` uses `on delete restrict` (not `cascade`/`set null`): a partner org going `inactive` cascades operator accounts to `suspended` via application logic (OQ-5, future feature), not via a destructive FK cascade that would silently null out the association this feature's audit trail needs to reconstruct later.

#### 2.2.1 Email-sync trigger (FU-12(b))

```sql
-- migration: create_accounts_email_sync
create or replace function app.sync_account_email_from_auth_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update app.accounts
  set email = new.email,
      updated_at = now()
  where id = new.id;
  return new;
end;
$$;

comment on function app.sync_account_email_from_auth_users is
  'SECURITY DEFINER justified: must write to app.accounts as a result of an auth.users '
  'trigger, and the invoking context (Supabase Auth internals) does not hold app.accounts '
  'UPDATE privilege on the email column for other users rows. Scope is deliberately narrow '
  '(sets email + updated_at only, driven entirely by NEW.id from the firing auth.users row, '
  'never by a client-supplied argument) so it cannot be repurposed for privilege escalation.';

create trigger sync_email_on_auth_users_update
  after update of email on auth.users
  for each row
  execute function app.sync_account_email_from_auth_users();
```

Resolves FU-12(b): trigger, not read-through. Read-through was the Stage 5 alternative flagged but not chosen — rejected because it would require every consumer of `app.accounts.email` to know to join back to `auth.users` for freshness, reintroducing the exact "which one is authoritative" ambiguity Stage 5 flagged. The trigger keeps `app.accounts.email` correct within the same transaction as the `auth.users` change, at negligible write cost (this column changes rarely).

### 2.3 `app.account_status_cache` — the data-layer half of D-2

See §4 (dedicated section, since this is the item the task calls out specifically).

### 2.4 `app.account_state_transitions`

```sql
-- migration: create_account_state_transitions_table
create table app.account_state_transitions (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references app.accounts (id) on delete cascade,
  from_state        app.account_state,
  to_state          app.account_state not null,
  reason            text,
  actor_account_id  uuid references app.accounts (id) on delete set null,
  created_at        timestamptz not null default now()
);

comment on table app.account_state_transitions is
  'Append-only audit trail for BR-5 state machine transitions. Never updated or deleted '
  'by application code. account_state on app.accounts is the fast-read current-state '
  'column; this table is the history of how it got there. Retention period is FU-04, '
  'not yet ruled by compliance-specialist — deliberately kept as a separate table from '
  'account_audit_log so it can carry a different (likely longer) retention.';
```

`from_state` is nullable (the `pending_verification` row created at account creation has no prior state). `actor_account_id` is nullable and `on delete set null` (not `cascade`) — an actor account being later removed/anonymized must never delete the historical fact that a transition occurred, only lose the identity of who performed it.

### 2.5 `app.account_audit_log`

```sql
-- migration: create_account_audit_log_table
create table app.account_audit_log (
  id                   uuid primary key default gen_random_uuid(),
  account_id           uuid references app.accounts (id) on delete set null,
  event_type           app.audit_event_type not null,
  attempted_identifier text,
  ip_address           inet,
  user_agent           text,
  legal_hold           boolean not null default false,
  created_at           timestamptz not null default now(),

  constraint account_audit_log_failure_has_identifier
    check (event_type <> 'login_failure' or attempted_identifier is not null)
);

comment on table app.account_audit_log is
  'Authentication/security audit events. account_id nullable by design: a login_failure '
  'against a non-existent email must still be logged (credential-stuffing detection, '
  'FR-11/FR-12) without a real account row to reference. 12-month retention per '
  'compliance-specialist Stage 1 §9.3, legal_hold carve-out, purge job in §6.';
```

`account_id` uses `on delete set null` (not `cascade`): an account being anonymized/deleted must not silently delete its own audit history — the audit log's whole purpose is to survive the account it describes, subject only to its own retention clock.

### 2.6 `app.retention_purge_runs`

```sql
-- migration: create_retention_purge_runs_table
create table app.retention_purge_runs (
  id            uuid primary key default gen_random_uuid(),
  ran_at        timestamptz not null default now(),
  cutoff_date   timestamptz not null,
  rows_deleted  integer not null,
  target_table  text not null default 'app.account_audit_log'
);

comment on table app.retention_purge_runs is
  'Meta-audit record for the automated 12-month purge job (compliance-specialist Stage 1 '
  '§9.3: "purge job ran on X date, deleted N records"). Written by the purge job itself, '
  'never by client code.';
```

### 2.7 `app.invitations`

```sql
-- migration: create_invitations_table
create table app.invitations (
  id                      uuid primary key default gen_random_uuid(),
  email                   text not null,
  user_type               app.user_type not null,
  partner_organization_id uuid references app.partner_organizations (id) on delete restrict,
  invited_by              uuid not null references app.accounts (id) on delete restrict,
  token_hash              text not null,
  status                  app.invitation_status not null default 'pending',
  expires_at              timestamptz not null,
  accepted_at             timestamptz,
  created_at              timestamptz not null default now(),

  constraint invitations_privileged_user_type
    check (user_type <> 'customer'),
    -- BR-3: invitations exist only for the three privileged roles; customer signup is
    -- self-service and never goes through this table.

  constraint invitations_operator_requires_partner_org
    check (user_type <> 'security_company_operator' or partner_organization_id is not null)
);

comment on table app.invitations is
  'Pre-account invitation records for admin/security_company_operator/support_agent '
  'provisioning (BR-3/FR-6/FR-7). token_hash is a hash of the single-use invitation '
  'secret, never the plaintext token — mirrors password-reset token handling.';

create unique index invitations_pending_email_unique
  on app.invitations (email)
  where status = 'pending';
```

The partial unique index (`WHERE status = 'pending'`) prevents issuing a second live invitation to the same email while one is already outstanding, without constraining historical `accepted`/`expired`/`revoked` rows for that same address (e.g., someone re-invited after their first invitation expired).

---

## 3. Indexing strategy, mapped to actual query patterns

Per this role's Best Practice against speculative indexing, every index below is justified by a named, real Feature 001 query path — not spec'd generically.

| Table | Index | Query pattern it serves |
|---|---|---|
| `app.accounts` | `primary key (id)` | Every FK join from every other table; the single hottest lookup path (`id = auth.uid()` in RLS, and backend joins on `account_id`). |
| `app.accounts` | `unique index accounts_email_unique on (email)` | Admin/support tooling and any query-convenience join by email (Stage 5 §1.2's stated rationale for keeping the denormalized copy at all — otherwise the copy has no query benefit over a join). |
| `app.accounts` | `index accounts_partner_organization_id on (partner_organization_id) where partner_organization_id is not null` | RLS predicate for "security-company operator reads own org" (§5.3); future partner-org-scoped listing. Partial (excludes the common `null` case — customers/admins/support agents) to keep it small. |
| `app.accounts` | `index accounts_invited_by on (invited_by) where invited_by is not null` | "Invitations issued by this admin" / audit reconstruction (FR-6). Partial for the same reason. |
| `app.account_status_cache` | `primary key (id)` | Point lookup: "is this account currently usable" — the D-2 chokepoint query, §4. |
| `app.account_status_cache` | `index account_status_cache_updated_at on (updated_at)` | Delta-sync: "what changed since my last poll" — the bounded, cheap alternative to a per-request full-table read, §4. |
| `app.account_state_transitions` | `index account_state_transitions_account_id_created_at on (account_id, created_at desc)` | "State history for this account," dominant read pattern for any admin-facing account detail view or a future self-service history feature. Composite, descending on the range column, matches "most recent transitions first." |
| `app.account_state_transitions` | `index account_state_transitions_actor_account_id on (actor_account_id) where actor_account_id is not null` | "What did this admin/actor do" — audit reconstruction from the actor's side, not just the subject's side. |
| `app.account_audit_log` | `index account_audit_log_account_id_created_at on (account_id, created_at desc) where account_id is not null` | Dominant hot path per Stage 5 §1.6: "last N days of login activity for this account" (admin account-detail view, `GET /v1/admin/audit-log` per backend-approach.md §2.2). Partial to exclude the `account_id is null` credential-stuffing rows, which are queried differently (below). |
| `app.account_audit_log` | `index account_audit_log_created_at on (created_at) where legal_hold = false` | The 12-month purge job's own query (`WHERE created_at < now() - interval '12 months' AND NOT legal_hold`) — partial index excludes held rows so the purge scan never touches them and the index stays small relative to the full table. |
| `app.account_audit_log` | `index account_audit_log_failed_identifier on (attempted_identifier, created_at desc) where event_type = 'login_failure'` | Credential-stuffing pattern detection (FR-11/FR-12) — repeated-failure lookups against an identifier, including ones with no matching account. Partial to keep it scoped to the one event type it serves. |
| `app.retention_purge_runs` | `primary key (id)` only | Small, low-cardinality, append-only, queried infrequently (ops/compliance spot-check) — no additional index justified; a sequential scan on a table this size is cheaper than maintaining an index for a rare query. |
| `app.invitations` | `unique index invitations_token_hash_unique on (token_hash)` | The single hottest path on this table: invitation-acceptance lookup by presented token (hashed) — must be O(1), not a scan, since it's on the critical path of a user-facing acceptance screen. |
| `app.invitations` | `unique index invitations_pending_email_unique on (email) where status = 'pending'` | Duplicate-pending-invite prevention at issuance time (§2.7) — also serves "does this email already have a pending invite" as a read. |
| `app.invitations` | `index invitations_invited_by on (invited_by)` | "Invitations issued by this admin" listing (mirrors `accounts_invited_by`, different table). |
| `app.invitations` | `index invitations_status_expires_at on (status, expires_at) where status = 'pending'` | The expiry-sweep job (`pending` invitations past `expires_at` transition to `expired`) — partial, scoped to the only status the sweep ever touches. |
| `app.partner_organizations` | `primary key (id)` only | Table is small (one row per partner org, not per operator) and low-write; no additional index justified at Feature 001's scope — would be speculative. |

**Deliberately not indexed:** `app.accounts.user_type`, `app.accounts.account_state` as standalone indexes — Stage 1/architecture-review C3 rules out any Feature 001 query that lists/filters accounts broadly by role or state (that's the future Admin Dashboard feature's job, per product-plan.md §3, and it will define its own index needs against its own query plan when it exists). Adding these now would be exactly the speculative, write-cost-without-proven-read-benefit indexing this role's Best Practices warn against.

---

## 4. Resolving D-2 at the data layer: `app.account_status_cache`

**The problem, restated from architecture-review D-2:** `backend-architect`'s local-JWKS token verification path (no network call per request) cannot, by itself, detect that `account_state` has flipped to `suspended` mid-session. FR-22/AC-8/AC-9 require this to take effect "immediately, not at next natural expiry." Architecture-review's ruling (D-2(a)-(d)) requires a stated, testable staleness window and forbids enforcing revocation/state-gated decisions from an unexpired token claim alone — but explicitly leaves the *protocol* (how often, from where, at what cost) to `backend-architect`/`cybersecurity-architect` at FU-01, Stage 7.

**What this document owns: making the cheap check possible in the first place.** The naive alternative — have the backend query `app.accounts` directly on whatever cadence FU-01 lands on — works but is wasteful: `app.accounts` is a wide, transactional row (email, phone, FK columns, timestamps) that is also the table taking the write load from every account-profile update, invitation acceptance, and state transition. Polling it on a tight interval, even read-only, adds contention and reads columns the freshness check doesn't need.

`app.account_status_cache` (DDL below) is a narrow, purpose-built projection kept in sync with `app.accounts` in the same transaction (via trigger, not a periodically-refreshed materialized view — so it carries **zero additional staleness** beyond whatever `app.accounts` itself already has):

```sql
-- migration: create_account_status_cache_table
create table app.account_status_cache (
  id             uuid primary key references app.accounts (id) on delete cascade,
  account_state  app.account_state not null,
  mfa_required   boolean not null,
  suspended_at   timestamptz,
  deactivated_at timestamptz,
  updated_at     timestamptz not null default now()
);

comment on table app.account_status_cache is
  'Narrow, trigger-synced projection of app.accounts'' authorization-relevant fields. '
  'Exists solely so backend can cheaply detect account_state changes (D-2) without '
  'polling the wide, write-heavy app.accounts table. Access is service_role-only — '
  'never exposed to client PostgREST calls (§5.6). Kept in sync in the same transaction '
  'as the app.accounts write that caused it, so it introduces no staleness of its own; '
  'any staleness the backend observes comes entirely from its own poll/cache interval, '
  'which is FU-01''s call, not this table''s.';

create index account_status_cache_updated_at on app.account_status_cache (updated_at);

create or replace function app.sync_account_status_cache()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into app.account_status_cache (id, account_state, mfa_required, suspended_at, deactivated_at, updated_at)
  values (new.id, new.account_state, new.mfa_required, new.suspended_at, new.deactivated_at, now())
  on conflict (id) do update
    set account_state  = excluded.account_state,
        mfa_required   = excluded.mfa_required,
        suspended_at   = excluded.suspended_at,
        deactivated_at = excluded.deactivated_at,
        updated_at     = now();
  return new;
end;
$$;

comment on function app.sync_account_status_cache is
  'SECURITY INVOKER (default) is sufficient and deliberate here, not an oversight: this '
  'trigger only fires on changes to account_state/mfa_required/suspended_at/deactivated_at '
  '(§2.2''s column-level grants mean an authenticated client can never write those columns '
  'directly — only phone), so every invocation already runs under a service_role or '
  'equivalent privileged context that already has INSERT/UPDATE rights on this table. No '
  'privilege elevation is needed, so none is granted.';

create trigger accounts_sync_status_cache
  after insert or update of account_state, mfa_required, suspended_at, deactivated_at
  on app.accounts
  for each row
  execute function app.sync_account_status_cache();
```

**Two cheap access patterns this enables for `backend-architect` to choose between at FU-01 (their call, not dictated here):**

1. **Point-lookup mode.** A single indexed-PK read, `select account_state, mfa_required, updated_at from app.account_status_cache where id = $1`, sub-millisecond, callable at whatever chokepoint(s) FU-01 decides need one (e.g., refresh-token exchange only, or additionally on commerce-gated actions per D-2(c)) — without touching the wide `accounts` row.
2. **Delta-sync mode.** `select id, account_state, mfa_required, updated_at from app.account_status_cache where updated_at > $last_poll_ts`, using `account_status_cache_updated_at`, lets the backend maintain its own in-memory revocation/status cache and refresh it incrementally on a fixed interval, independent of request volume or account count — a pattern that scales flat regardless of how many accounts exist, which the point-lookup mode does not guarantee under high concurrent request volume.

**What this document explicitly does not decide, per the task's own framing and per D-2's ruling:** which of the two modes is used, the polling/refresh interval, whether the check happens on every request vs. only at defined chokepoints, and what number "bounded staleness" resolves to (architecture-review's provisional 15-minute ceiling, tightenable by `cybersecurity-architect`). Those are FU-01's protocol-level questions, owned by `backend-architect` with `cybersecurity-architect` input, due at Stage 7 exit. This table exists so that whatever protocol they choose is cheap to implement correctly rather than a full-row poll against a hot transactional table.

---

## 5. RLS policies — draft SQL for `security-engineer` review (FU-05)

Written against architecture-review's interim ruling **C7**: Stage 6 writes RLS as if a non-service-role credential can reach Postgres directly (the conservative assumption pending FU-18). Follows the checklist verbatim: `TO authenticated` + ownership predicate on every policy, `auth.role()` never used, `WITH CHECK` matching `USING` on every `UPDATE`, `raw_user_meta_data`/`user_metadata` never referenced, `SECURITY DEFINER` avoided except where already justified above (§2.2.1, §4 — neither is an RLS policy function). `auth.uid()` calls are wrapped in `(select auth.uid())` per Supabase's documented performance guidance (evaluated once per statement, not once per row).

Default posture per ruling **C3**: own-row-only for every client-facing table; no broader visibility grant, because Feature 001's two genuinely cross-account operations (admin audit-log read, admin invitation issuance) execute inside Identity Service against a `service_role` credential per ADR-0002's mediation principle, not via client RLS.

### 5.1 `app.accounts`

```sql
alter table app.accounts enable row level security;

create policy accounts_select_own
  on app.accounts
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy accounts_update_own
  on app.accounts
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Column-level privilege, not RLS, enforces WHICH columns an owner may change: RLS
-- cannot express column-level restriction, so self-service write access is narrowed at
-- the GRANT layer instead of trusted to the policy's WITH CHECK alone.
revoke update on app.accounts from authenticated;
grant select on app.accounts to authenticated;
grant update (phone) on app.accounts to authenticated;
-- user_type, account_state, mfa_required, partner_organization_id, invited_by,
-- suspended_at, deactivated_at are NOT grantable to authenticated: a client cannot
-- self-escalate role, self-clear a suspension, or self-assign a partner org even though
-- the row-level policy above would otherwise let them target their own row.

-- No INSERT policy: accounts are provisioned exclusively by service-role code paths
-- (self-signup handler, invitation-acceptance handler) — a client never inserts its own
-- app.accounts row directly.
-- No DELETE policy: account removal/anonymization is a service-role-only administrative
-- operation, mechanism still open per FU-03.
```

### 5.2 `app.account_state_transitions`

```sql
alter table app.account_state_transitions enable row level security;

-- No policies for `authenticated` at all, and no GRANT of any privilege to `authenticated`
-- on this table. Per Stage 5 §3 (retained, not loosened, by ruling C3): state-transition
-- history is read/written exclusively through backend-mediated, service_role-authenticated
-- endpoints, never via a raw client SELECT/INSERT against this table. RLS is enabled for
-- defense-in-depth even though no policy grants access, consistent with C7's conservative
-- posture — if the schema is ever accidentally exposed via PostgREST, default-deny holds.
```

### 5.3 `app.account_audit_log`

```sql
alter table app.account_audit_log enable row level security;

-- Same posture as §5.2: no policies, no grants, for `authenticated`. Admin audit-log read
-- (`GET /v1/admin/audit-log`, restricted to the admin role per ruling C8) is a
-- backend-enforced, service_role-authenticated path — RBAC is enforced in Identity
-- Service's middleware, not by a client-facing RLS policy keyed on user_type (which would
-- also violate "never read raw_user_meta_data/app_metadata for authorization" if it tried
-- to key off a JWT claim instead of a table read).
```

### 5.4 `app.invitations`

```sql
alter table app.invitations enable row level security;

-- No policies, no grants, for `authenticated` or `anon`. Two distinct reasons, both
-- load-bearing:
--   1. Issuance (INSERT) is admin-only per ruling C4 (default-deny: support agents may
--      not issue invitations) — enforced in Identity Service's middleware against a
--      service_role connection, not via a client-facing RLS INSERT policy.
--   2. Acceptance-time token lookup must NEVER be a direct client query against this
--      table, even scoped by token_hash — exposing `SELECT ... WHERE token_hash = $1` to
--      `anon` would let an attacker probe token_hash values against PostgREST directly,
--      independent of any RLS predicate correctness (RLS restricts ROWS, it does not rate
--      limit or obscure the query surface itself). The acceptance flow is a backend
--      endpoint that hashes the presented plaintext token and performs the lookup under
--      service_role, per Stage 5 §1.8.
```

### 5.5 `app.partner_organizations`

```sql
alter table app.partner_organizations enable row level security;

grant select on app.partner_organizations to authenticated;

create policy partner_organizations_select_own_org
  on app.partner_organizations
  for select
  to authenticated
  using (
    exists (
      select 1
      from app.accounts a
      where a.id = (select auth.uid())
        and a.partner_organization_id = partner_organizations.id
    )
  );

-- No INSERT/UPDATE/DELETE policy and no corresponding GRANT for `authenticated`: lifecycle
-- writes belong to the future Partner Organization Management feature (Stage 5 §1.4),
-- issued only via service_role in the interim.
```

Note: `admin`'s read access to `app.partner_organizations` (for invitation-scoping UI, per Stage 5 §3) is **not** granted via a client RLS policy here — it goes through the same service-role-mediated invitation-issuance endpoint as the write path, consistent with the C3/C4 default-deny posture. If a future feature needs admins to browse partner orgs directly from a client session, that is a new policy added when that feature is scoped, not implied here.

### 5.6 `app.account_status_cache`

```sql
alter table app.account_status_cache enable row level security;

-- No policies, no grants, for `authenticated` or `anon`, under any circumstance. This
-- table exists solely to serve backend's D-2 chokepoint checks (§4) via a service_role
-- connection. It must never be added to Supabase's exposed-schema/API surface for
-- PostgREST client access — flagged explicitly here because, unlike the other tables in
-- this section, there is no client-facing use case for this table even in principle, so
-- an accidental future grant would be a pure regression, not an incremental feature.
```

### 5.7 `app.retention_purge_runs`

```sql
alter table app.retention_purge_runs enable row level security;
-- No policies, no grants, for `authenticated`. Written only by the scheduled purge job
-- under service_role; read only by ops/compliance tooling, also service_role-mediated.
```

---

## 6. Retention/purge job (mechanics, not policy)

Confirms Stage 5 §1.7's design, unchanged in substance:

```sql
-- Executed by pg_cron or an external scheduler calling this as a Postgres function.
-- Interval below (12 months) is compliance-specialist's Stage 1 §9.3 ruling, pending
-- Stage 8 re-confirmation (FU-04) — the query shape does not need to change if the
-- interval does, only the literal.
create or replace function app.purge_expired_audit_log()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - interval '12 months';
  v_deleted integer;
begin
  delete from app.account_audit_log
  where created_at < v_cutoff
    and legal_hold = false;

  get diagnostics v_deleted = row_count;

  insert into app.retention_purge_runs (cutoff_date, rows_deleted, target_table)
  values (v_cutoff, v_deleted, 'app.account_audit_log');
end;
$$;

comment on function app.purge_expired_audit_log is
  'SECURITY DEFINER justified: runs on a schedule with no authenticated client session in '
  'context at all (pg_cron/external scheduler), and must bypass RLS by design since it '
  'performs a bulk DELETE no client role is ever granted. Not parameterized by any '
  'client-supplied input, so there is no injection/escalation surface — the cutoff is '
  'computed internally, never passed in.';
```

`app.account_state_transitions` is **not** purged by this job or any job defined in this document — its retention period is FU-04, still open with `compliance-specialist`.

---

## 7. Migration plan (imperative workflow, no live schema/timestamps yet — fresh project)

Ordered list; each is one migration file, purpose stated, no destructive operations (greenfield, no existing data per Stage 5 §7 checklist):

1. `create_app_schema` — creates `app` schema, grants `usage` to `authenticated` only.
2. `create_app_enums` — `app.user_type`, `app.account_state`, `app.invitation_status`, `app.audit_event_type`, `app.partner_org_status`.
3. `create_partner_organizations_table` — §2.1, no RLS yet (enabled in its own migration, §5.5, so DDL and security posture are independently reviewable/revertable).
4. `create_accounts_table` — §2.2, including both `CHECK` constraints; no RLS/grants yet.
5. `create_accounts_email_sync` — §2.2.1 trigger function + trigger on `auth.users`.
6. `create_account_status_cache_table` — §4 table, index, trigger function, trigger on `app.accounts`.
7. `create_account_state_transitions_table` — §2.4.
8. `create_account_audit_log_table` — §2.5, including the `login_failure`-requires-identifier `CHECK`.
9. `create_retention_purge_runs_table` — §2.6.
10. `create_invitations_table` — §2.7, including the partial unique index.
11. `create_index_accounts_email_partner_org_invited_by` — the three `app.accounts` secondary indexes from §3.
12. `create_index_account_state_transitions` — the two `account_state_transitions` indexes from §3.
13. `create_index_account_audit_log` — the three `account_audit_log` partial indexes from §3.
14. `create_index_invitations` — `invited_by` and `status/expires_at` indexes from §3 (`token_hash` unique and `pending_email` unique are already created inline in migration 10, since they're constraint-shaped, not standalone secondary indexes).
15. `enable_rls_accounts` — §5.1: `ENABLE ROW LEVEL SECURITY`, policies, `REVOKE`/`GRANT` column privileges.
16. `enable_rls_partner_organizations` — §5.5.
17. `enable_rls_account_state_transitions` — §5.2 (RLS enable only, no policies/grants).
18. `enable_rls_account_audit_log` — §5.3 (RLS enable only).
19. `enable_rls_invitations` — §5.4 (RLS enable only).
20. `enable_rls_account_status_cache` — §5.6 (RLS enable only).
21. `enable_rls_retention_purge_runs` — §5.7 (RLS enable only).
22. `create_purge_expired_audit_log_function` — §6.

RLS-enabling migrations (15–21) are deliberately separated from the table-creation migrations (3–10) so that `security-engineer`'s FU-05 review can revise policy SQL in place (migrations 15–16 specifically, which carry actual policies) without requiring the table DDL itself to be reopened — a materially smaller diff for review.

**Continued in the addendum:** migrations 23–29 (`app.sessions`, `app.idempotency_keys`, their indexes, RLS, and the idempotency-key purge function) are listed in [`architecture/database-addendum-001.md`](./architecture/database-addendum-001.md) §6, not here — this list is not renumbered or duplicated across both documents.

---

## 8. Stage 5 follow-up items: closed vs. still open

| Item | Status after this document |
|---|---|
| FU-06 (confirm own-row-only RLS is final, not placeholder) | **Written into SQL** (§5) per ruling C3. Still needs `cybersecurity-architect`'s confirmation per the gate condition — this document implements the ruling, it does not substitute for the sign-off. |
| FU-12(a) (invitation vocabulary alignment) | **Closed.** `app.invitation_status` uses `pending`, matches D-4's ruling; `revoked` retained, no endpoint. |
| FU-12(b) (email sync mechanism) | **Closed.** Trigger-based (§2.2.1), not read-through. |
| D-2 data-layer half | **Resolved** — `app.account_status_cache` (§4) gives `backend-architect` a cheap, correctly-fresh check. Protocol half (cadence, chokepoints, the bounded-staleness number) explicitly **not** decided here — FU-01, Stage 7, `backend-architect`/`cybersecurity-architect`. |
| D-3 / RLS-as-front-line posture | RLS SQL **drafted** per C7's conservative assumption (§5). **Not closed** — FU-05 is a hard Stage 8 gate requiring `security-engineer` authorship/review; nothing here should be applied to a live project first. |
| FU-03 DDL-blocking half (`on delete cascade`) | **Addressed for DDL purposes** (§2.2's cascade note) — the cascade is written and reasoned about, but the *full* deletion/anonymization mechanism remains open, Stage 8, `compliance-specialist` A. |
| FU-04 (`account_state_transitions` retention) | **Still open.** No purge job defined for this table in §6 — deliberately, since no ruling exists yet. |
| Sensitive-field/encryption review | **Still N/A**, unchanged from Stage 5 — no payment or ID-document fields introduced by this schema. Re-triggers the moment one is proposed. |
| FU-15 (ADR-0002 required follow-ups) | **Untouched by this document**, as expected — gates Stage 9, not Stage 6. |

---

## 9. Pre-Approval Checklist (`database-architect` self-review)

- [x] **Schema change reviewed for embed-vs-reference correctness given the relationship's read/write pattern.** State transitions and audit events remain append-only referenced tables, not embedded; `account_status_cache` is a narrow trigger-synced projection, not a duplicate source of truth (§4); MFA factor secrets remain in Supabase's own tables, never duplicated.
- [x] **Indexing strategy validated against actual hot query paths, not speculative.** §3, with an explicit "deliberately not indexed" callout for the one place speculative indexing was tempting (`user_type`/`account_state` standalone indexes, deferred to the future Admin Dashboard feature that will actually need them).
- [x] **GPS/location-history growth accounted for with a retention or rollup plan.** N/A — out of scope, MongoDB/ADR-0001.
- [ ] **Sensitive fields (payment refs, ID documents) reviewed with cybersecurity-architect for encryption/access-control needs.** Left unchecked deliberately, unchanged from Stage 5 — standing obligation, N/A for this feature's actual field set, re-triggers on the next feature that adds such a field.
- [x] **Claim/policy/payment-adjacent changes preserve auditable history, not just current state.** Identity-domain equivalent satisfied: `account_state_transitions` and `account_audit_log` are both append-only; `account_status_cache` is explicitly a cache, not a replacement current-state record (it is derived, never authoritative).
- [ ] **Data-retention policy aligns with compliance-specialist's regulatory guidance.** Audit-log 12-month purge (§6) implements the existing ruling. Left unchecked: `account_state_transitions` retention (FU-04) and the full deletion/anonymization mechanism (FU-03) remain open — this document does not claim to close either.
- [ ] **Capacity impact on the MongoDB cluster reviewed with cloud-infrastructure-architect.** N/A — Supabase/Postgres-scoped document; no MongoDB schema touched.
- [x] **Migration path for existing data specified for any breaking schema change.** N/A — greenfield, no existing data (§7 confirms no destructive operations in any listed migration).

**Net:** five of eight satisfied; three left unchecked and explained, consistent with Stage 5's own checklist state — this document narrows what those three items cover (FU-06's *SQL* is now written; FU-05's *SQL* is now drafted) without closing the underlying reviews, which remain Stage 8 gates.

---

## 10. Sign-off status for Stage 6 exit

**Conditional, consistent with architecture-review's gate terms** — this document does not attempt to discharge FU-05 (RLS review, Stage 8 hard gate), FU-04 or FU-03's full mechanism (`compliance-specialist`, Stage 8), or FU-01/FU-18 (session-token protocol, Stage 7, not this role's). It does close FU-06 and FU-12 at the DDL/SQL level and resolves D-2's data-layer half, per the gate conditions naming those as Stage 6 exit criteria. Recommend Stage 6 exit on this basis, with FU-05's RLS draft (§5) handed to `security-engineer` immediately rather than held until Stage 8 begins, so review lead time is not wasted.
