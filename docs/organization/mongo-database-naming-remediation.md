# MongoDB Production Database Naming Remediation

- **Status:** PLANNED — not executed. No production change has been made as part of this
  document; it is a plan awaiting an explicit go/no-go decision from an owner with production
  Mongo credentials.
- **Trigger:** finding recorded at
  [`INC-001-location-events-inventory.md` §6.3](incidents/INC-001-location-events-inventory.md#63-new-condition)
  (2026-09-02), filed there as "not a new INC-001 condition" and pointed at `devops-engineer` /
  `database-architect` to clean up separately. This document is that follow-up.
- **Author:** devops-engineer, 2026-09-03.
- **Related:** [ADR-0002](adr/0002-polyglot-persistence-identity-vs-domain-data.md) (Mongo for
  domain data), `render.yaml`, `render-staging.yaml`, `docs/DEPLOY.md`.

## 1. What's actually true today

Read from `backend/src/db/mongo-connection.ts` and `render.yaml` directly — not inferred:

```ts
// backend/src/db/mongo-connection.ts
export function resolveMongoDatabaseName(uri: string, override?: string): string | undefined {
  const trimmed = override?.trim();
  if (trimmed) return trimmed;          // 1) MONGODB_DB_NAME wins if set

  try {
    const parsed = new URL(uri);
    const path = parsed.pathname.replace(/^\//, '').split('/')[0]?.trim();
    return path || undefined;           // 2) else, the path segment of the URI
  } catch {
    return undefined;                   // 3) else, undefined → driver default
  }
}

export function openMongoDatabase(client: MongoClient, dbName?: string): Db {
  return dbName ? client.db(dbName) : client.db();  // client.db() with no arg → "test"
}
```

- `render.yaml` (production API service, `td-it-solution-insurance`) sets `MONGODB_URI`
  (`sync: false`, secret set out-of-band in the Render dashboard) and **does not set
  `MONGODB_DB_NAME`** — there is no `- key: MONGODB_DB_NAME` entry at all, unlike
  `render-staging.yaml` which explicitly sets `MONGODB_DB_NAME: td_it_insurance_staging`.
- Whether path (2) or (3) above is in play in production depends on whether the production
  `MONGODB_URI` secret (which this session cannot read — Render dashboard, out-of-band) has a
  path segment. The confirmed runtime evidence
  (`resolvedDatabaseName: "test"` in the 2026-09-02 inventory run, §6.3) tells us the *effective
  outcome* regardless of which path produced it: either the URI has no path segment and the
  driver defaulted to `"test"`, or the URI path segment is literally `test`. Either way, the
  fix is the same — pin `MONGODB_DB_NAME` explicitly.
- **The data is real and correctly scoped** — positive control confirmed 3 `assets`, 5
  `policies` documents on 2026-09-02 (INC-001 §6.3). This is a naming hygiene problem, not a
  data-integrity or exposure problem. Nothing here contradicts or reopens INC-001.

## 2. Why "just set `MONGODB_DB_NAME`" is not safe on its own

Setting `MONGODB_DB_NAME=td_it_insurance_production` (or similar) on the Render production
service **without anything else** would not rename anything — `resolveMongoDatabaseName`
would resolve to the new name, `openMongoDatabase` would call `client.db('td_it_insurance_production')`
on the **same cluster**, and the driver would silently create/open a **new, empty** database
with that name. The app would boot green (health checks don't validate data presence), start
writing new policies/assets/etc. into the empty database, and the existing 3 assets / 5
policies / all other collections would be **orphaned in `test`**, invisible to the app but
still present and still billed. This is a silent data-loss-equivalent outcome — worse than
downtime, because nothing errors.

So env var changes and data migration are two different problems that must be solved together
or not at all.

## 3. Does Atlas support in-place database rename?

No. MongoDB has never supported renaming a database in place, and the mechanism that historically
existed at the cluster level for moving data between database names — the `copydb` server
command / `db.copyDatabase()` shell helper — was **removed in MongoDB 4.2** (deprecated earlier,
gone entirely since; Atlas clusters run recent server versions and do not expose it). There is no
Atlas UI or API action labeled "rename database." Collection-level `renameCollection` exists and
works *within* the same database, but does not help move a database to a new name.

The supported ways to relocate data under a new database name are all copy-based:

- `mongodump --db test` / `mongorestore --nsFrom 'test.*' --nsTo 'td_it_insurance_production.*'`
  — dump/restore with namespace remapping. Standard, low-risk, works against Atlas via the
  connection string. Requires a window where the source stops accepting writes (or a second,
  short delta-copy pass) to avoid losing writes made during the dump.
- Per-collection `$out` / `$merge` aggregation pipelines run against each collection, writing
  into the target database on the same cluster (`$merge` can target a different database).
  Feasible here because the collection list is small and known (`policies`,
  `policy_status_history`, `assets`, `admin_access_log`, `recovery_cases`, plus the newer
  Feature 007/008/009 collections under `src/db/*-collections.ts`: `alerts`, `notification*`,
  `customer_profiles`, `location_events`, `product_events`, `tracking_devices`, …) — but this
  approach reproduces the collection list from application code (`backend/scripts/bootstrap-mongo-collections.ts`)
  rather than dumping the database wholesale, so it is easier to silently miss a collection
  added after this plan is written. `mongodump`/`mongorestore` on the whole database is safer
  precisely because it doesn't require an authoritative collection list.
- Atlas Live Migrate is for moving between clusters/projects, not renaming within the same
  cluster — not the right tool here since source and target are both on the current cluster.

**Conclusion: option (b) in the task brief (ask Atlas to rename in place) is not viable.** The
real choice is between (a) a careful copy-based migration and cutover, and (c) deferring and
just pinning the name going forward without moving old data. Recommendation below is a hybrid.

## 4. Recommendation

**Do the migration, but treat it as a scheduled, low-traffic maintenance-window operation, not
routine work — and do it now while the dataset is still tiny (3 assets, 5 policies, and whatever
has accumulated since 2026-09-02) rather than later when it's bigger and the write-freeze window
matters more.** Concretely:

### Step 0 — pre-conditions (owner sign-off required, not automatic)
- [ ] Explicit approval from an owner with production Mongo credentials
      (`cloud-infrastructure-architect` and/or `database-architect`) to run this during a chosen
      low-traffic window.
- [ ] `site-reliability-engineer` notified of the window per this role's pre-approval checklist.
- [ ] Confirm current collection/document counts immediately before the window via
      `backend/scripts/inc-001-location-inventory.ts --mongo-only` (already prints
      `resolvedDatabaseName` and a positive control — reuse it as a pre-migration snapshot, not
      just an incident tool) plus a plain `mongodump --archive` dry count, so we have a
      before/after reconciliation baseline.

### Step 1 — backup
- [ ] `mongodump --uri="$MONGODB_URI" --db=test --archive=pre-migration-$(date +%F).archive.gz --gzip`
      taken and stored somewhere durable outside the Render environment (not committed to the
      repo — this is data, not code). This is the rollback artifact: if anything goes wrong,
      `mongorestore` from this archive recovers the pre-migration state regardless of what
      happens to `test` itself.

### Step 2 — brief write freeze
- [ ] Put the API into a short read-only/maintenance window. This codebase already has a
      precedent for kill-switching a write path in production (INC-001's
      `LOCATION_INGESTION_ENABLED` flag) — same pattern applies: either scale the Render service
      to zero briefly, or flip a maintenance flag if one exists, for the few minutes the copy
      takes. Given the confirmed tiny data volume, this window should be measured in minutes,
      not hours.

### Step 3 — copy with namespace rename
- [ ] `mongorestore --uri="$MONGODB_URI" --nsFrom='test.*' --nsTo='td_it_insurance_production.*' --archive=pre-migration-<date>.archive.gz --gzip`
      — restores the dump directly into the new database name on the same cluster, including
      indexes (mongodump/restore preserves index definitions, unlike a manual per-collection
      copy, which is another reason to prefer this over `$merge` scripting).

### Step 4 — verify before cutover
- [ ] Run `inc-001-location-inventory.ts` (or a small ad hoc count script) against
      `MONGODB_DB_NAME=td_it_insurance_production` explicitly and confirm document counts per
      collection match the Step 0 baseline exactly. Zero tolerance for mismatch — if any
      collection's count differs, stop and do not cut over.
- [ ] Spot-check index presence (`db.collection.getIndexes()`) matches
      `backend/scripts/bootstrap-mongo-collections.ts` expectations, since the app also
      runs bootstrap on startup and idempotently creating indexes that already exist from the
      dump/restore is fine, but confirm none were dropped.

### Step 5 — cutover
- [ ] Set `MONGODB_DB_NAME=td_it_insurance_production` on the Render production service
      (dashboard, matches the existing `td_it_insurance_staging` naming convention already used
      in `render-staging.yaml` — see `docs/DEPLOY.md` line-item for `MONGODB_DB_NAME`).
- [ ] Also update `render.yaml` to add the `MONGODB_DB_NAME` key explicitly (value left as
      `sync: false` is unnecessary here since it's not a secret — set it as a plain `value:`
      entry, mirroring the staging blueprint), so the environment-as-code definition matches
      reality and a future blueprint re-apply doesn't regress this fix. This is the only
      repo-file change this plan calls for; it is **not** made as part of this document, only
      described, per the task's "planning only" instruction.
- [ ] Redeploy / restart the API service so it picks up the new env var and connects to
      `td_it_insurance_production`.
- [ ] Health check: `GET /api/health/ready`, then confirm `GET /v1/...` reads (e.g. an
      authenticated policies/assets list for a known test account) return the same data as
      before the window.
- [ ] Lift the write freeze.

### Step 6 — decommission the old name, don't delete yet
- [ ] Leave the `test` database in place, untouched, for a defined retention window (recommend
      30 days) as a live rollback path — cheap insurance, Atlas storage cost is negligible at
      this data volume. Do **not** drop it as part of the same change.
- [ ] After the retention window and a second confirmation that `td_it_insurance_production` has
      continued accumulating writes correctly with no discrepancies, `database-architect` signs
      off to drop the `test` database.

### Rollback plan (if Step 4/5 verification fails)
- Revert `MONGODB_DB_NAME` on the Render service (remove it / unset), redeploy — the app falls
  straight back to resolving `test` via the driver default, which was never touched or written
  to during the freeze window, so it is exactly as it was pre-migration. This is why Step 2's
  write freeze matters: as long as nothing writes to `test` during the copy, rollback is a
  one-env-var revert with zero data loss, no restore-from-backup needed. The `mongodump` archive
  from Step 1 is the belt-and-braces fallback if `test` is ever touched unexpectedly.

## 5. Is this safe to schedule as routine work, or does it need a maintenance window?

**Needs a maintenance window and explicit owner approval — not routine work**, for these reasons:

1. It touches the only copy of live production data (no read replica / staging mirror of this
   exact data exists to rehearse against first — staging uses its own empty
   `td_it_insurance_staging` database).
2. Correctness depends on nothing writing to `test` during the copy window; that requires a
   deliberate write freeze, which by definition is not a zero-impact routine change.
3. This role's own pre-approval checklist requires "Database migration (if any) tested against a
   staging snapshot with backup taken" and "site-reliability-engineer notified of the deployment
   window" before any migration ships — neither is satisfied by doing this ad hoc.

**However**, given the confirmed data volume is currently tiny (3 assets, 5 policies, plus
whatever accumulated since 2026-09-02 — worth re-running the inventory script immediately before
scheduling to get a current count), the actual freeze window should be short (single-digit
minutes), so this does not need to be treated as a high-ceremony event — just a scheduled one,
with sign-off, a backup taken, and rollback verified as cheap (env var revert) before starting.

## 6. Explicit non-actions taken in producing this document

- No production database, connection string, Render environment variable, or `render.yaml`
  entry was modified.
- No `mongodump`, `mongorestore`, or query was executed against any database.
- This document does not grant itself approval to execute — Step 0's checklist is a precondition
  for a future, separate execution, owned by whoever is assigned `database-architect` /
  `cloud-infrastructure-architect` sign-off at that time.
