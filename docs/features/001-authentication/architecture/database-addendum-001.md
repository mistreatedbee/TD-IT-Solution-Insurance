# Feature 001 — Customer Account Creation & Authentication
## Database Design Addendum 001 — Stage 6 (formalizing Stage 7's flagged gap)

**Lifecycle stage:** 6 — Database Design (addendum, produced after Stage 7 flagged a gap against the Stage 6 baseline)
**Author:** `database-architect`
**Formalizes:** [`api-design.md`](../api-design.md) §3.1, §3.2, §4 (Stage 7, `backend-architect`) — the two tables that document proposed in *column-shape* form, not DDL, and explicitly deferred to this role to formalize.
**Amends:** [`database-design.md`](../database-design.md) (Stage 6 baseline). This is an **addendum, not a replacement** — the baseline document's tables, indexes, RLS, and migration plan are unchanged and remain in force; this document only adds the two new tables `api-design.md` §3 named as missing.
**Status:** Paper design, same posture as the baseline. **No live Supabase MCP access was available in producing this document; no SQL below has been executed against a live project.** All DDL, indexes, and RLS SQL are written out for review, not applied.
**Reviewers required before this is treated as final (not self-certified here):** `security-engineer` (RLS SQL — same FU-05 Stage 8 gate the baseline document is subject to), `cybersecurity-architect` (refresh-token-hash algorithm choice and `app.sessions` threat model, given this table now carries the credential-adjacent artifact the baseline's tables did not), `backend-architect` (confirms this DDL matches exactly what api-design.md §3 specified — this document does not redesign the contract, only implements it).

---

## 0. What this document resolves vs. carries forward

- **Resolves:** the two Stage 6 addenda `api-design.md` §3 flagged by name — `app.sessions` (§1 below) and `app.idempotency_keys` (§2 below) — as full DDL, indexes, and RLS, matching api-design.md's specified column shapes exactly (no redesign of the API contract performed here).
- **Explicitly answers, per this task's instruction:** whether the Redis-backed revocation set (api-design.md §2.1, Mechanism 1) needs any Postgres-side backing beyond the durable `app.sessions` record — see §3 below. Short answer stated there in full: **no, it does not; no revocation-set table is added.**
- **Carries forward, unchanged:** every table, index, RLS policy, and migration step in the Stage 6 baseline (`database-design.md`). This document does not reopen `app.accounts`, `app.account_status_cache`, or any other baseline table.
- **Still open, unchanged from either document:** FU-05 (RLS review, Stage 8 hard gate — now also covers this addendum's RLS), the refresh-token-hash algorithm's specific choice (flagged in §1.4 below as a `cybersecurity-architect` call, not decided here), FU-17 (concrete policy numbers, including whether `app.idempotency_keys`' 24-hour TTL and `app.sessions`' derived retention need Stage 8 ratification).

---

## 1. `app.sessions` — DDL

Backs the backend-minted refresh-token model and durable revocation record specified in api-design.md §1 and §2.1, including the FR-20 device-binding columns api-design.md §3.1 named explicitly.

```sql
-- migration: create_sessions_table
create type app.session_revoked_reason as enum (
  'logout',
  'logout_all',
  'password_reset',
  'admin_forced',
  'rotation_reuse_detected'
);
-- Matches api-design.md §3.1's enum-shaped revoked_reason list verbatim — this document
-- does not add or remove a value from what the API contract specified.

create table app.sessions (
  id                      uuid primary key default gen_random_uuid(),
  -- This is the session's `jti` — api-design.md §1 states the access-token's `session_id`
  -- claim IS this column's value, not a separate identifier. The backend mints this id at
  -- login/refresh time and embeds it as the JWT's `jti`/`session_id` claim before any row
  -- referencing it exists elsewhere, which is why it is not a `references` target itself
  -- for anything outside this table (nothing FKs into a JWT claim).

  account_id              uuid not null references app.accounts (id) on delete cascade,
  -- api-design.md §3.1: "a session cannot outlive the account it belongs to" — cascade,
  -- not restrict/set null, matching the specified semantics exactly.

  refresh_token_hash      text not null,
  -- Hashed, never plaintext (api-design.md §1/§3.1: "mirrors app.invitations.token_hash's
  -- existing pattern"). Hash algorithm is this table's one open implementation detail —
  -- flagged to cybersecurity-architect (see §1.4 below), not decided in this DDL; the
  -- column type (text) accommodates any of the algorithms under consideration without a
  -- future migration.

  device_id               text,
  device_name             text,
  -- Nullable per api-design.md §3.1: "populated by mobile clients per FR-20" — a web
  -- session legitimately has neither. This is the field FU-09 (mobile-architect's
  -- device-binding review) reacts to, per api-design.md's own framing; this DDL does not
  -- add any additional device-binding column FU-09 has not yet asked for.

  ip_address              inet,
  user_agent              text,
  -- Parity with app.account_audit_log's existing columns, per api-design.md §3.1.

  created_at              timestamptz not null default now(),
  last_used_at            timestamptz not null default now(),
  expires_at              timestamptz not null,
  -- Refresh-token expiry (distinct from the 10-minute access-token TTL, which is not
  -- persisted anywhere — it is derived at mint time from api-design.md §2.2's ceiling and
  -- carried only in the JWT's own `exp` claim).

  revoked_at              timestamptz,
  revoked_reason          app.session_revoked_reason,
  replaced_by_session_id  uuid references app.sessions (id) on delete set null,
  -- Self-referencing FK for the refresh-token rotation chain (api-design.md §3.1: "reuse
  -- of a rotated-out token is detectable, per FR-20's token-theft-blast-radius goal").
  -- on delete set null (not cascade/restrict): if a chain's later session is later purged
  -- by a future retention job, the earlier session's row must not be destroyed or blocked
  -- by that — it simply loses the pointer to what it was replaced by.

  constraint sessions_revoked_at_requires_reason
    check (revoked_at is null or revoked_reason is not null),
  constraint sessions_reason_requires_revoked_at
    check (revoked_reason is null or revoked_at is not null),
  -- Both directions enforced: a row is never "revoked with no reason recorded" (breaks
  -- FR-20's blast-radius/audit goal) and never "has a reason but isn't marked revoked"
  -- (would be a contradictory row no application code should be able to produce).

  constraint sessions_expires_at_after_created_at
    check (expires_at > created_at)
);

comment on table app.sessions is
  'Durable, backend-owned record for the backend-minted refresh-token model (api-design.md '
  'Stage 7 §1) and Mechanism 1''s durable revocation record (api-design.md §2.1) — the '
  'thing an admin/audit view or a logout-all operation enumerates against. The FAST '
  'revocation check on the hot request path is a Redis SET lookup on jti, not a query '
  'against this table (see §3 of this addendum) — this table exists for durability/audit/'
  'enumeration, not for the per-request check itself.';

comment on column app.sessions.refresh_token_hash is
  'Hashed refresh token presented at /v1/session/refresh. Never plaintext. Algorithm '
  'choice (e.g. SHA-256 vs a keyed HMAC) is flagged to cybersecurity-architect, not fixed '
  'by this DDL (see addendum §1.4).';
```

### 1.1 Refresh-token rotation, restated as a schema fact (not a new design decision)

api-design.md's `/v1/session/refresh` contract mints a new access+refresh token pair on every use. In this schema, that means: a new `app.sessions` row is inserted, the prior row's `revoked_at`/`revoked_reason = 'rotation_reuse_detected'`-eligible chain field `replaced_by_session_id` is set to the new row's `id`, and the prior row is **not** deleted — its presence, still linked, is exactly what lets a later replay of the *old* refresh token be recognized as reuse (the row exists, is `revoked_at is not null`, and has a `replaced_by_session_id`, which is the reuse-detection signal `refreshSession`'s `401` response in api-design.md §7 (`operationId: refreshSession`) names).

### 1.2 `logout-all` as a schema operation

`POST /v1/session/logout-all` (api-design.md §7) is, at the data layer, an `UPDATE app.sessions SET revoked_at = now(), revoked_reason = 'logout_all' WHERE account_id = $1 AND revoked_at IS NULL`, executed in the same transaction as writing every affected `jti` into the Redis revocation set (api-design.md §2.1). §3 (indexing) below is written specifically so that `WHERE account_id = $1 AND revoked_at IS NULL` is an index-only lookup, not a scan, since this is the query the account_id + partial-index combination in §3.1 exists to serve.

### 1.3 Retention — flagged, not decided here

api-design.md does not specify a retention/purge policy for `app.sessions`, and neither did the Stage 6 baseline anticipate this table. No purge job is defined in this addendum. Recommend `compliance-specialist` be asked to rule on a retention period for revoked/expired session rows (candidate analogue: the same 12-month window as `app.account_audit_log`, since a session row is itself a security-relevant record an incident investigation might need), tracked as a new follow-up item rather than silently assumed. Until ruled, revoked/expired rows accumulate — acceptable at Feature 001's scale (one row per session, not per request), but should not be treated as "solved" by omission.

### 1.4 Open implementation detail, named honestly

The specific hash function for `refresh_token_hash` (SHA-256 vs. a keyed HMAC vs. bcrypt-class) is not specified in api-design.md and is not decided in this DDL — refresh tokens are high-entropy random values (not low-entropy secrets like passwords), so a fast, unsalted cryptographic hash (SHA-256) is defensible and consistent with `app.invitations.token_hash`'s existing pattern in the baseline, but this role defers the final call to `cybersecurity-architect` per this role's own charter boundary on security-posture numbers, consistent with how api-design.md itself deferred its rate-limit thresholds and TTL number for `cybersecurity-architect`/`security-engineer` ratification at Stage 8.

---

## 2. `app.idempotency_keys` — DDL

Backs the idempotency strategy in api-design.md §4.

```sql
-- migration: create_idempotency_keys_table
create table app.idempotency_keys (
  id                uuid primary key default gen_random_uuid(),
  endpoint          text not null,
  -- The route, e.g. "POST /v1/invitations" — per api-design.md §3.2's example, stored as
  -- the literal method+path pair, not decomposed further (no query needs to filter by
  -- method or path independently of the other).

  idempotency_key   text not null,
  -- Client-supplied, expected UUID v4 per api-design.md §4/§7 (IdempotencyKey parameter,
  -- format: uuid). Validated shape below, not just documented.

  account_id        uuid references app.accounts (id) on delete set null,
  -- Nullable per api-design.md §3.2: "null for pre-auth flows like invitation acceptance,
  -- where no session exists yet." on delete set null (not cascade): the cached response
  -- record's replay value does not depend on the account row still existing, and an
  -- account being removed must not silently invalidate an in-flight idempotency window —
  -- mirrors app.account_audit_log.account_id's existing on-delete-set-null rationale in
  -- the baseline document.

  request_hash      char(64) not null,
  -- sha-256 hex digest of the normalized request body (api-design.md §3.2), fixed-length
  -- so the column can be a char(64) rather than an unbounded text, matching the fixed
  -- output width of the specified hash function.

  response_status   integer not null,
  response_body     jsonb not null,
  -- The cached response, replayed verbatim on retry (api-design.md §4).

  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '24 hours',
  -- 24-hour TTL per api-design.md §4/§3.2, matching literally.

  constraint idempotency_keys_key_is_uuid
    check (idempotency_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  -- Enforces the "expected UUID v4" shape api-design.md §3.2/§7 documents at the API layer
  -- also at the DDL layer, so a malformed key can never be persisted even if a future
  -- caller bypasses the OpenAPI-validated ingress. Format-only (v4-vs-other-version is not
  -- distinguished by this regex) — sufficient for the collision-avoidance purpose this
  -- column serves; a stricter v4-only pattern is not worth the added constraint complexity
  -- for a client-supplied value the backend does not itself rely on being v4 for anything
  -- beyond high entropy.

  constraint idempotency_keys_response_status_valid
    check (response_status between 100 and 599),

  constraint idempotency_keys_expires_at_after_created_at
    check (expires_at > created_at),

  constraint idempotency_keys_endpoint_key_unique
    unique (endpoint, idempotency_key)
  -- api-design.md §3.2's stated unique constraint, implemented literally. This is what
  -- makes "same key, different body" detectable (§4: a second INSERT attempt for the same
  -- (endpoint, idempotency_key) pair with a different request_hash conflicts against this
  -- constraint at the database layer, backstopping the application-layer check the backend
  -- performs before deciding between "replay" and "409 IDEMPOTENCY_KEY_REUSE").
);

comment on table app.idempotency_keys is
  'Backs api-design.md §4''s idempotency-key replay mechanism for mutating endpoints a '
  'mobile client might retry. Rows are read/written exclusively by service-role backend '
  'code on the hot request path of every idempotency-key-bearing endpoint (api-design.md '
  '§4''s mandatory-endpoint table) — never queried directly by a client. 24-hour TTL, '
  'purged by app.purge_expired_idempotency_keys (see §2.1 of this addendum), analogous in '
  'shape to app.purge_expired_audit_log (database-design.md §6).';
```

### 2.1 Purge job — analogous shape to the baseline's audit-log purge

api-design.md §3.2 anticipated this ("a new, small function, not proposed in full here"). Formalized here, matching the baseline's existing pattern exactly:

```sql
-- migration: create_purge_expired_idempotency_keys_function
create or replace function app.purge_expired_idempotency_keys()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from app.idempotency_keys
  where expires_at < now();

  get diagnostics v_deleted = row_count;

  insert into app.retention_purge_runs (cutoff_date, rows_deleted, target_table)
  values (now(), v_deleted, 'app.idempotency_keys');
end;
$$;

comment on function app.purge_expired_idempotency_keys is
  'SECURITY DEFINER justified on the same grounds as app.purge_expired_audit_log '
  '(database-design.md §6): runs on a schedule with no authenticated client session in '
  'context, must bypass RLS to perform a bulk DELETE no client role is ever granted, and '
  'takes no client-supplied input. Reuses the baseline''s app.retention_purge_runs table '
  'as its own meta-audit sink (target_table distinguishes the two jobs'' rows) rather than '
  'introducing a second, redundant meta-audit table for what is structurally the same '
  'kind of record.';
```

No new meta-audit table is introduced — `app.retention_purge_runs` (baseline §2.6) already generalizes across purge jobs via its `target_table` column, so this job reuses it rather than duplicating it.

---

## 3. Redis vs. Postgres — division of labor for revocation, stated plainly

**Question the task requires an explicit answer to: does the Redis-backed revocation set need any Postgres-side backing at all?**

**Answer: no. The revocation set itself lives entirely in Redis. No Postgres table is added for it, and none is needed.**

Reasoning, direct from api-design.md §2.1's own mechanism description:

- The revocation set is a Redis `SET` keyed by `jti`, with a per-entry TTL equal to the token's remaining lifetime — api-design.md is explicit that this is chosen *because* it self-expires and never grows unbounded, and *because* checking it is "a single Redis `EXISTS` lookup," deliberately the one and only network call the hot request path tolerates (api-design.md §2.1, §6). A Postgres-backed mirror of that same set would reintroduce exactly the per-request database round-trip this design goes out of its way to avoid — it would not be "backing" the mechanism, it would be defeating its purpose.
- `app.sessions` (§1 above) is **not** a backing store for the revocation set — it is a separate, durable record of session lifecycle (created, rotated, revoked-with-reason) that exists for reasons the Redis set does not serve: audit trail, `logout-all` enumeration, rotation-reuse detection, and anything an admin/incident-response view needs to reconstruct after the fact (including after the Redis entry has itself expired, which happens on a much shorter clock than any reasonable audit-retention need). api-design.md §3.1 names this distinction directly: "the Redis revocation set is the *fast* check; `app.sessions` is the *durable* record."
- Concretely: at revocation time, the backend writes to **both** stores in the same logical operation (api-design.md §2.1: "does two things in the same transaction") — `app.sessions.revoked_at`/`revoked_reason` (Postgres, durable) and the Redis `SET` entry (fast-check). These are two different artifacts serving two different query needs, not a primary/replica pair of the same data — there is nothing to keep "consistent" between them in the sense a cache-invalidation bug would threaten, because the Redis entry answers "is this token revoked right now" and the Postgres row answers "what happened to this session, ever," and only the former needs to be instant.
- If the Redis entry is lost (e.g., a Redis-cluster failover drops an unpersisted set mid-flight), the **worst case is a false negative on Mechanism 1** — a revoked token is briefly treated as valid until Mechanism 2's 10-minute bounded-staleness check (`/session/refresh`, `/account/me`) catches the drift via `app.account_status_cache` or, for the `app.sessions.revoked_at` row directly, the next explicit check against it. This is a known, accepted trade already implicit in api-design.md's own design (it does not propose Redis persistence/AOF as a requirement), not a new gap this addendum introduces — `cloud-infrastructure-architect`/`security-engineer`'s FU-08 sizing work (api-design.md §3.2) is the right place to decide whether Redis persistence is warranted, not a Postgres mirror table.

**Conclusion for the migration plan: one revocation-adjacent table (`app.sessions`), zero revocation-set tables.** Adding a Postgres table to mirror the Redis set was considered and explicitly rejected above, not simply omitted.

---

## 4. Indexing strategy for both new tables

Same discipline as the baseline (§3 of `database-design.md`): every index below is justified by a named query path from api-design.md, not speculative.

| Table | Index | Query pattern it serves |
|---|---|---|
| `app.sessions` | `primary key (id)` | JWT `jti`/`session_id` claim lookup — used when a request needs the durable record for a given session (rare on the hot path, since Mechanism 1's hot-path check is Redis-only per §3 above; this serves admin/audit lookup and the rotation-chain walk). |
| `app.sessions` | `unique index sessions_refresh_token_hash_unique on (refresh_token_hash)` | The single hottest query on this table: `POST /v1/session/refresh`'s lookup of the presented (hashed) refresh token — must be O(1), on the critical path of every token-refresh call (api-design.md §2.2: 6 calls/hour/active session at the 10-minute TTL). Unique, not just indexed, since two live sessions must never share a hash. |
| `app.sessions` | `index sessions_account_id_active on (account_id) where revoked_at is null` | `POST /v1/session/logout-all`'s enumeration (§1.2 above: `UPDATE ... WHERE account_id = $1 AND revoked_at IS NULL`) and any future "list my active sessions" read. Partial on `revoked_at is null` — the query that matters operationally only ever wants the live rows, and this keeps the index small as revoked rows accumulate over the table's life (retention still open, §1.3). |
| `app.sessions` | `index sessions_replaced_by_session_id on (replaced_by_session_id) where replaced_by_session_id is not null` | Rotation-chain traversal for reuse-detection/audit ("was this token's replacement itself later replaced") — partial, since most rows (not-yet-rotated, active sessions) have a null value here. |
| `app.idempotency_keys` | `unique index idempotency_keys_endpoint_key_unique on (endpoint, idempotency_key)` | Already declared inline as a table constraint (§2) — the hottest and only truly required lookup on this table: every idempotency-key-bearing request's first action is exactly this point lookup, on the critical path of six mandatory endpoints (api-design.md §4). |
| `app.idempotency_keys` | `index idempotency_keys_expires_at on (expires_at)` | The purge job's own query (§2.1: `WHERE expires_at < now()`) — a small, non-partial index is sufficient here (unlike the audit-log purge index in the baseline, this table's total row count is bounded by a 24-hour retention window, not months, so index size is inherently self-limiting; a partial-index optimization would add complexity without a proven benefit at this table's scale). |

**Deliberately not indexed:** `app.sessions.account_id` as a plain (non-partial) index — the only named query pattern against this column filters on `revoked_at is null` (§1.2), so the partial index above already covers it more cheaply; a second, broader index would be pure write-cost with no additional read benefit any named query path uses. `app.idempotency_keys.account_id` — no query pattern in api-design.md filters idempotency records by account (replay is always keyed by `(endpoint, idempotency_key)`, never by account); adding this index now would be exactly the speculative indexing this role's Best Practices warn against, deferred until a real query path (e.g. a future "my recent idempotent requests" admin tool) names it.

---

## 5. RLS policies

Same posture as the Stage 6 baseline's D-3/C7 finding: own-row-only where a client-facing use case exists at all, front-line-not-defense-in-depth conservative assumption pending FU-18 formal ratification, and — critically for these two tables specifically — **no client-facing use case exists for either table at all**, exactly like `app.account_status_cache` (baseline §5.6). Neither table is ever queried directly by a client; both are exposed only through the `/v1/session/*` and idempotency-replay *behavior* of the API, never raw table access. Per the checklist: `TO authenticated`/`TO anon` grants are withheld entirely rather than written as a same-row policy that would be technically satisfiable but operationally pointless (a client has no legitimate reason to `SELECT` its own `app.sessions` row directly — it gets that information, shaped, from `GET /v1/account/me` or the session endpoints' own response bodies).

```sql
-- migration: enable_rls_sessions
alter table app.sessions enable row level security;

-- No policies, no grants, for `authenticated` or `anon`, under any circumstance. This
-- mirrors app.account_status_cache's posture (database-design.md §5.6) for the same
-- reason: refresh_token_hash is a credential-adjacent secret-derived value, and even a
-- correctly-scoped "select own sessions" policy would expose device_id/device_name/
-- ip_address/user_agent metadata a client never needs to read directly — that data is
-- surfaced to the client only through backend-shaped, service-role-mediated responses
-- (e.g. a future "manage my devices" screen would be a new backend endpoint returning a
-- curated projection, not a direct RLS-gated table read). RLS is enabled anyway for
-- default-deny defense-in-depth, consistent with C7's conservative posture, even though no
-- policy grants access — if app schema is ever accidentally exposed via PostgREST, this
-- table fails closed rather than open.
```

```sql
-- migration: enable_rls_idempotency_keys
alter table app.idempotency_keys enable row level security;

-- No policies, no grants, for `authenticated` or `anon`. Idempotency-key replay is a
-- backend-internal mechanism (api-design.md §4) — the client never queries this table; it
-- only experiences the mechanism's effect (a replayed response body on retry). request_hash
-- and response_body may echo request/response content a client legitimately owns, but
-- exposing this table for direct client read would let a caller enumerate another
-- account's cached response bodies by guessing (endpoint, idempotency_key) pairs, which is
-- exactly the kind of query-surface risk app.invitations §5.4 already reasons about for a
-- structurally similar token-lookup table in the baseline document — same reasoning
-- applies here without needing to be re-derived.
```

**Why this is consistent with "own-row-only," not a departure from it:** the baseline's own-row-only posture (C3/D-3) governs tables where a client legitimately owns and needs direct read/write access to its own row (`app.accounts`, `app.partner_organizations`). Both new tables fall into the baseline's *other* named category — tables with **no client-facing use case even in principle** (`app.account_status_cache`, `app.account_state_transitions`, `app.account_audit_log`) — and this addendum applies that existing category's posture rather than inventing a third one. This is the same judgment call the baseline document already made explicitly for `app.account_status_cache` (§5.6: "there is no client-facing use case for this table even in principle, so an accidental future grant would be a pure regression"), extended here to two tables that share the same property.

---

## 6. Migration plan — addendum steps (continuing the baseline's numbering)

The baseline (`database-design.md` §7) ends at migration 22. These are additive, not renumbering anything already listed there:

23. `create_sessions_table` — §1 above: `app.session_revoked_reason` enum, `app.sessions` table with both revocation-consistency `CHECK` constraints; no RLS/grants yet.
24. `create_idempotency_keys_table` — §2 above: `app.idempotency_keys` table with the UUID-shape, status-range, and expiry-ordering `CHECK` constraints, and the `(endpoint, idempotency_key)` unique constraint declared inline.
25. `create_purge_expired_idempotency_keys_function` — §2.1 above.
26. `create_index_sessions` — the four `app.sessions` indexes from §4 (refresh-token-hash unique, account-id-active partial, replaced-by-session-id partial; primary key is inline in migration 23).
27. `create_index_idempotency_keys` — the `expires_at` index from §4 (`(endpoint, idempotency_key)` unique is already created inline in migration 24).
28. `enable_rls_sessions` — §5 above (RLS enable only, no policies/grants, matching the baseline's own separation of DDL migrations from RLS-enabling migrations for a smaller `security-engineer` review diff).
29. `enable_rls_idempotency_keys` — §5 above (RLS enable only).

Same rationale as the baseline's own §7 closing note: RLS-enabling migrations (28–29) are kept separate from table-creation migrations (23–24) so `security-engineer`'s FU-05 review — which now also covers this addendum — can revise these two tables' posture (should a client-facing use case for either ever legitimately emerge, e.g. a future "manage my devices" feature) without reopening the DDL.

---

## 7. Pointer note confirmation

`database-design.md` §0 and §7 have been updated with a short pointer to this addendum (not a full rewrite) — see that document directly. The two documents' table inventories and migration-step counts are kept in sync by that pointer rather than by duplicating this addendum's content into the baseline, consistent with the instruction not to let the two documents drift the way `ui-design.md`/`design-system-additions.md` briefly did.

---

## 8. Pre-Approval Checklist — re-run for the two new tables only

Per this role's charter, the items that apply to new-table changes, re-run against `app.sessions` and `app.idempotency_keys` specifically (the baseline's own checklist in `database-design.md` §9 is unchanged and still governs the tables it already covered):

- [x] **Schema change reviewed for embed-vs-reference correctness given the relationship's read/write pattern.** Both tables are referenced, not embedded: session records are high-write, independently-lifecycled rows that would bloat `app.accounts` if embedded (mirrors the baseline's own reasoning for keeping `account_state_transitions`/`account_audit_log` as separate referenced tables, §9 of the baseline); idempotency records are short-lived, endpoint-keyed, and have no natural parent document to embed into (an idempotent call may occur pre-auth, per §2's nullable `account_id`).
- [x] **Indexing strategy validated against actual hot query paths, not speculative.** §4 above, with explicit "deliberately not indexed" callouts for two tempting-but-unjustified indexes (plain `account_id` on `app.sessions`, `account_id` on `app.idempotency_keys`).
- [x] **GPS/location-history growth accounted for with a retention or rollup plan.** N/A — out of scope, MongoDB/ADR-0001, same as the baseline.
- [x] **Sensitive fields (payment refs, ID documents) reviewed with cybersecurity-architect for encryption/access-control needs.** `refresh_token_hash` is the one sensitive field either table introduces — it is stored hashed (never plaintext, §1) per the same pattern already applied to `app.invitations.token_hash` in the baseline, and the hash-algorithm choice is explicitly flagged to `cybersecurity-architect` rather than silently fixed (§1.4). Checked, not left open, because the *mitigation* (hash, not plaintext) is applied here even though the *algorithm* is deferred.
- [x] **Claim/policy/payment-adjacent changes preserve auditable history, not just current state.** `app.sessions` is append-only in the sense that matters: revocation never deletes a row, it sets `revoked_at`/`revoked_reason` and links the rotation chain via `replaced_by_session_id` (§1.1) — a full session lifecycle is reconstructable from this table alone, matching the baseline's `account_state_transitions` pattern of "never overwrite away history."
- [ ] **Data-retention policy aligns with compliance-specialist's regulatory guidance.** `app.idempotency_keys`' 24-hour TTL is fixed by api-design.md's own contract and needs no further ruling. `app.sessions` retention (revoked/expired row lifespan) is **not yet ruled** — flagged explicitly in §1.3 above as a new, previously-untracked follow-up item, not silently assumed. Left unchecked deliberately.
- [x] **Capacity impact on the MongoDB cluster reviewed with cloud-infrastructure-architect.** N/A — Supabase/Postgres-scoped addendum, no MongoDB schema touched, same as the baseline.
- [x] **Migration path for existing data specified for any breaking schema change.** N/A — greenfield addition, no existing data, no destructive operation in any migration listed in §6.

**Net:** six of eight satisfied; one N/A (MongoDB, structurally out of scope for this document); one left open and named as a new follow-up (`app.sessions` retention period, not yet ruled by `compliance-specialist`) rather than assumed away.

---

## 9. Summary for handoff

- **`app.sessions`** (§1): backend-minted refresh-token model's durable store, hashed refresh token, FR-20 device-binding columns (`device_id`/`device_name`, nullable), rotation chain (`replaced_by_session_id`) for reuse detection, revocation record (`revoked_at`/`revoked_reason`) — matches api-design.md §3.1's proposed shape exactly, adds only the constraints/comments/index layer the API document deferred to this role.
- **`app.idempotency_keys`** (§2): endpoint+key unique constraint, request-hash mismatch detection, 24-hour TTL with a purge job that reuses the baseline's existing `app.retention_purge_runs` meta-audit table rather than duplicating it — matches api-design.md §3.2/§4 exactly.
- **Redis vs. Postgres (§3, the task's explicit question): the revocation set lives entirely in Redis. No Postgres table backs it.** `app.sessions` is a separate, durable lifecycle record that exists for audit/enumeration/rotation-reuse detection, not as a mirror of the Redis set — mirroring it would defeat the set's whole performance purpose. Zero new tables for revocation itself; one table (`app.sessions`) for durable session lifecycle, which was already required for other reasons.
- **`database-design.md` updated** with a pointer note (§0, §7) rather than a rewrite — see that document directly for the exact wording.
- **One new follow-up surfaced, not previously tracked:** `app.sessions` retention period is unruled (§1.3/§8) — recommend `compliance-specialist` add this to the same docket as FU-04 (`account_state_transitions` retention), since both are "how long does a security-relevant history row live" questions of the same shape.
