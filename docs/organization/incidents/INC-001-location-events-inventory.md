# INC-001 Follow-up — `location_events` / `Asset.lastLocation` Inventory & Quarantine

- **Status:** CONTAINED (write path kill-switched in production, confirmed live). Filed 2026-08-25 as inventory + quarantine review; **§2a now carries the returned figures and §6 carries the A-9 disposition** (`compliance-specialist`, 2026-09-02).
- **A-9 disposition: CLOSED — NIL PURGE.** Zero `location_events` documents, zero assets with a non-null `lastLocation`. The §7 purge ruling stands and has nothing to operate on. **§6 is the authoritative statement; do not restate it elsewhere.** One evidentiary condition (**INC-001-C-13**, database-identity positive control) blocks the nil purge certificate, not the disposition.
- **Authors:** database-architect (§1–§5) · compliance-specialist (§2a, §2b, §6)
- **Date:** 2026-08-25, updated 2026-09-02
- **Deletion performed:** **NO.** Nothing in this investigation deleted, mutated, or exported any document. No delete-capable tooling was used or written. This is explicit and non-negotiable per the task brief — the purge/retain call belongs to compliance-specialist once their assessment completes.

## 1. Scope

Two data stores are in scope, both written by `POST /v1/assets/:assetId/location-report` (the endpoint that shipped without consent gating and is now kill-switched):

1. **`location_events`** — append-only Mongo collection, one document per location report (`backend/src/db/location-events-collections.ts`, `backend/src/repositories/location-events.ts`).
2. **`assets.lastLocation`** — a field on the `assets` collection's `Asset` document, overwritten in place on every report (`backend/src/repositories/assets.ts`, schema in `backend/src/db/feature004-collections.ts`).

## 2. Row counts, date range, real-vs-test breakdown

**This session has no live database credentials or query-execution capability** (no Bash tool, no MongoDB/Postgres MCP server available in this environment — only static file access). I am not going to fabricate counts. What I can and did confirm from code:

- Both collections are actively written to by the (now-disabled) endpoint, so the collections are expected to be non-empty in any environment where the endpoint was live before containment.
- There is **no built-in "is test account" flag** in either schema — classification must be done by joining `accountId` (Mongo) against `app.accounts.email` (Postgres/Supabase) and checking against known test markers.

**Known test-account markers** (from `backend/scripts/seed-test-accounts.ts`):
- `test.customer@tditsolutions.dev`
- `test.admin@tditsolutions.dev`
- `test.security@tditsolutions.dev`
- Domain pattern: any `@tditsolutions.dev` address (the domain the seed script uses) is a strong test-account signal.
- Any `accountId` referenced in `location_events`/`assets.lastLocation` that does **not** resolve to a row in `app.accounts` at all is neither confirmed real nor test — flagged as `unresolved`, requires manual review before being counted as "real" for compliance purposes.

**Deliverable to close this gap:** `backend/scripts/inc-001-location-inventory.ts` (new, read-only). It:
- Counts total `location_events` documents, distinct `accountId`/`assetId` values, and min/max `recordedAt` (date range).
- Counts `assets` documents where `lastLocation != null`, and their distinct accounts.
- Cross-references every distinct `accountId` against `app.accounts.email` and buckets into `test` / `real` / `unresolved` using the markers above.
- Prints a single JSON summary. It performs **no writes, no updates, no deletes** — it has no delete-capable code path at all.

**Action needed:** someone with production Mongo + Postgres credentials (cloud-infrastructure-architect or backend-engineer) needs to run:
```
cd backend && npm run inc-001:location-inventory
```
from repo root with `MONGODB_URI` and `DATABASE_URL` set, and paste the output back into this document (§2a below) so compliance-specialist has real numbers. For counts without Postgres cross-reference, pass `--mongo-only` (test/real breakdown omitted).

**2026-08-28 attempt:** local `.env.local` had `MONGODB_URI` but Mongo auth failed (`bad auth : authentication failed`). `DATABASE_URL` not present. No counts recorded — credentials need refresh before A-9 can close.

### 2a. Actual figures — returned 2026-09-02

Credentials refreshed; the `bad auth` failure of 2026-08-28 is resolved. Run executed as
`cd backend && npx tsx scripts/inc-001-location-inventory.ts --mongo-only`. Figures as reported:

```
locationEvents.totalDocuments:                   0
locationEvents.distinctAccountCount:             0
locationEvents.distinctAssetCount:               0
assetLastLocation.assetsWithNonNullLastLocation: 0
```

**Zero location-event documents. Zero assets carrying a non-null `lastLocation`.**

> **Record-keeping defect in this return, and it is not cosmetic.** The four lines above are a
> transcription, not the script's output. The script emits `generatedAt`, `mode`, `dateRange`
> (`earliestRecordedAt` / `latestRecordedAt`) and the `note`, and **none of those were captured.**
> The `dateRange` nulls matter specifically: see §2b(2). The **full JSON must be pasted here
> verbatim** on the re-run required by §2b(1). Per INC-001 §5's standing rule, a negative that
> does not enumerate what was searched is not yet evidence.

### 2b. What `--mongo-only` mode does **not** tell us

Set out precisely, because the temptation with a zero is to read it as broader than it is. Ordered
by how much each actually threatens the conclusion — **the first is the only one that could
overturn it, and it is not the one the script's own caveat names.**

1. **It does not tell us which database was counted. This is the real gap.**
   `scripts/inc-001-location-inventory.ts:64` reads `MONGODB_DB_NAME` and passes it to
   `openMongoDatabase(mongo, mongoDbName)`. That helper is
   `dbName ? client.db(dbName) : client.db()` (`backend/src/db/mongo-connection.ts:23-25`) — it
   **does not call `resolveMongoDatabaseName()`**, and the script never prints the database it
   resolved. So the counted database is whichever one the runner's `.env.local` implied, and if
   `MONGODB_URI` carries no path segment the driver falls back to its own default (`test`). The
   deployment topology makes this a live risk rather than a theoretical one: `render.yaml` sets
   `MONGODB_URI` with **no** `MONGODB_DB_NAME` (production uses the URI path), while
   `render-staging.yaml` sets `MONGODB_DB_NAME=td_it_insurance_staging` on the *same cluster*
   (MP-8). **A zero from the staging database, or from an empty default database, is a false
   negative that looks identical to a true one.**
   → Closed by **INC-001-C-13** (§6.3): re-run with the resolved database name printed **and a
   positive control** — an unfiltered count on a sibling collection known to hold data
   (`assets`, `policies`). If `assets` also returns zero, the run hit the wrong database and this
   entire finding is void. The filtered `assetsWithNonNullLastLocation: 0` cannot distinguish
   "no asset has a location" from "there are no assets".

2. **`totalDocuments` is an estimate, not a scan.** Line 74 uses
   `estimatedDocumentCount()`, which reads collection metadata and can be stale after an unclean
   shutdown. It is, however, **independently corroborated inside the same run**: `distinct('accountId')`
   and `distinct('assetId')` (lines 75–76) are real queries and both returned empty, and the
   `find().sort({recordedAt}).limit(1)` calls (lines 77–78) would have returned a document if one
   existed. That corroboration is why I treat the zero as sound *given* (1) — but the `dateRange`
   nulls that evidence it were not transcribed. §2a.

3. **The `--mongo-only` caveat the script prints — "account test/real breakdown omitted" — is
   moot here, and the action register is wrong to hold A-9 open for it.** The breakdown classifies
   `distinctAccountIds`; that array is empty. `DATABASE_URL` would add nothing but a loop over
   zero elements (lines 104–115 are no-ops on an empty set). **D-A-3, D-A-4 and D-A-5 are answered
   vacuously: there are no affected accounts to classify, no contact channels to confirm, no
   residency to determine.** A full-mode run is not required for A-9 and must not be cited as a
   blocker on it.

4. **It says nothing about `recovery_cases`.** The script queries `location_events` and `assets`
   only. **D-A-9** — confirming `recovery_cases.lastLocation` / `lastLocationAt` are null across all
   documents — is untouched by this run. Cheap to add to the C-13 re-run and it should be.

5. **It says nothing about client-side capture that never reached the store.** A database count
   proves what was *persisted*. It cannot prove no coordinate was ever *captured on a handset and
   transmitted*, nor that no coordinate reached a third-party SDK (analytics, APM, map tiles) on
   the device before the server refused the write. The kill switch is evaluated before body parsing
   (`assets.ts:116-119`), so a rejected request's body still transited our TLS terminator.
   **F-2 / INC-001-C-4 (`security-engineer`'s grep-verified SDL-6 assertion) is not discharged by
   this result and remains open on the client limb.**

6. **It says nothing directly about Atlas snapshots** (INC-001-C-5). If nothing was ever written,
   snapshots contain nothing — but that inference rests entirely on (1). C-5 stays open until C-13
   returns, after which it collapses to a formality.

7. **It does not establish *why* the count is zero**, and the difference matters to the Client
   conversation. Two explanations fit: (a) the endpoint was deployed but `LOCATION_INGESTION_ENABLED`
   was never set to `"true"` in any deployed environment, so every write was refused at the switch;
   or (b) it was enabled but never exercised. `render.yaml` declares no `LOCATION_INGESTION_ENABLED`
   key at all, and the switch fails closed on unset — which **points to (a)**, but a Render dashboard
   variable can exist without appearing in `render.yaml`, so the repository cannot settle it.
   **INC-001-C-1** (open, `devops-engineer`) is the item that settles it. (a) is materially the
   better story and it should not be asserted until C-1 returns it.

## 3. Exposure surface — what can currently read this data

Everything below is from `backend/src/routes/*.ts` as of this commit. The **write path** (`POST /v1/assets/:assetId/location-report`) is confirmed kill-switched via `LOCATION_INGESTION_ENABLED` (fail-closed default — see `backend/src/config/env.ts` lines ~117–130, `backend/src/routes/assets.ts` line ~111). The kill switch **only** covers the write path. The following **read** paths are still live and were not part of the containment action:

| Endpoint | Auth scope | Reads | Notes |
|---|---|---|---|
| `GET /v1/assets/:assetId/location` | customer, own account only (`findByIdForAccount`) | `assets.lastLocation` | Customer can view their own asset's last known location if `lastLocation` is non-null. |
| `GET /v1/assets/location-summary` | customer, own account only | `assets.lastLocation` per asset | Same account-scoping. |
| `GET /v1/assets/:assetId/location-history` | customer, own account only | `location_events` (paginated, by `accountId`+`assetId`) | Customer can page through their own historical raw pings. |
| `GET /v1/admin/assets/:assetId` | admin role only, rate-limited, **audited** via `ctx.adminAccessLog.recordDetail` | `assets.lastLocation` (via `serializeAdminAsset` → spreads `serializeAsset`, which includes `lastLocation`) | Admin-only, per-access audit log entry recorded. No Admin Dashboard UI exists yet (per repo state), but the API endpoint itself is live and callable by any authenticated admin account. |
| `GET /v1/admin/assets` (list) | admin role only, audited | `assets` summary | Uses `serializeAdminAssetSummary`, which **does not** include `lastLocation` — confirmed not exposed at list level. |
| Security-company routes (`security-cases.ts`) | security operator | — | No `lastLocation` or `location_events` reference found (`grep` returned no matches). Not an exposure path. |
| Recovery routes (`recovery.ts`, `recovery-cases.ts`) | customer, own account | `recovery_cases.lastLocation` | This is a **separate** field on a separate collection (`recovery_cases`), not directly the `Asset.lastLocation`/`location_events` in scope here. No code path found that copies `Asset.lastLocation`/`location_events` into `recovery_cases` — worth a follow-up check with backend-architect/gps-integration-engineer if/when Feature 005 GPS ingestion is built, but out of scope for INC-001 as currently wired. |

**Finding to flag for compliance-specialist:** the kill switch stops *new* ingestion but does **not** stop customers from reading their *own* pre-containment `lastLocation`/`location_events` data via the three customer-facing GET endpoints above, and does not stop admins from reading a given asset's `lastLocation` via the admin detail endpoint (audited, but still live). No Admin or Security Company dashboard UI exists to surface this today, so the practical exposure is currently limited to API-level access by authenticated customers (their own data) and admins (via direct API call, logged). I have **not** disabled or gated these read endpoints — that would be a unilateral access-control change outside this task's mandate ("flag and let compliance-specialist decide"). Recommend compliance-specialist confirm whether these read paths need to be paused pending the POPIA assessment, since — unlike the write path — no gate currently exists on them.

## 4. What was NOT done (by design)

- No documents were deleted from `location_events` or `assets`.
- No documents were modified.
- No new access-control code was written or shipped (the inventory script above is read-only and not wired into any running service; it is a standalone offline tool).
- No data was exported outside the existing database — the inventory script prints a JSON summary to stdout only, not a file of raw records.

## 5. Recommended next steps

1. Run `backend/scripts/inc-001-location-inventory.ts` against production and record output in §2a.
2. compliance-specialist: confirm whether the three customer-facing read endpoints and the admin detail endpoint (§3) should be paused pending the exposure assessment, or whether audit-logged admin access + own-account-only customer access is an acceptable interim posture.
3. Once compliance-specialist's assessment lands, this document's §2a numbers feed directly into their retain/purge recommendation — no further inventory work needed from database-architect unless the schema/read-path picture changes.

*(§5 was written before the figures returned. It is preserved as filed; §6 supersedes item 1 and answers items 2 and 3.)*

---

## 6. A-9 disposition — `compliance-specialist`, 2026-09-02

**Author:** `compliance-specialist`. This section is the A-9 ruling and is the **only** place it
lives; INC-001 §8's action register and the Gate A status memo point here rather than restate it.
The reasoning that produced the underlying purge decision is at
[`INC-001-location-ingestion-popia-assessment.md`](./INC-001-location-ingestion-popia-assessment.md)
§7 and is not repeated.

### 6.1 The ruling

> **A-9 is CLOSED. Disposition: NIL PURGE.**
>
> The §7.6 ruling — irreversible purge of all coordinates, `Asset.lastLocation` nulled first —
> **stands unamended and is not withdrawn.** It has nothing to operate on. There is no
> pre-containment location data to purge, retain, or make a retain-versus-purge choice about.
>
> This closes the **decision**. It does not by itself file INC-001-C-7's purge certificate, which
> becomes a **nil certificate** and is blocked on one evidentiary condition, **INC-001-C-13**
> (§6.3). The decision needed the numbers; the certificate needs the numbers to be about the right
> database.

I am not restating the disposition as "no purge needed" without qualification, because that phrasing
invites the wrong inference — that the purge ruling was overtaken or was unnecessary. It was
correct on the facts available, it remains the ruling that would execute if a single coordinate
were found, and it is the ruling that governs any coordinate found by the C-13 re-run.

### 6.2 What this does and does not license anyone to say

**May now be said, subject to §6.3:**

- No coordinate was persisted by `POST /v1/assets/:assetId/location-report` in the database queried.
- No asset carries a last-known location.
- There are no affected data subjects identified by the inventory, and therefore nobody to notify
  under the POPIA assessment §6.5.

**May NOT be said, on this evidence:**

- ❌ *"No personal information was processed."* A database count evidences **persistence**, not
  **processing**. POPIA s1 defines processing to include collection and receipt. §2b(5) stands.
- ❌ *"INC-001 was a non-event."* An ungated ingestion endpoint with no consent object, no retention
  period and a materially false withdrawal notice was **deployed to production and into a
  distributed APK**. The s11/s13/s14/s17/s18 findings at POPIA-assessment §4.3 concern conduct and
  controls, not row counts. A control failure that captured nothing is a control failure that got
  lucky — and on the current evidence the luck was `LOCATION_INGESTION_ENABLED` failing closed
  (§2b(7)), i.e. a control doing its job, which is a better story but a different one.
- ❌ *"The C-008 conditions are relieved."* None is released. Feature 008 still starts at Stage 1.
- ❌ *"Feature 009's Stage 8 gap is narrowed."* INC-001 §9.3's ungated-surface finding, criterion 6,
  and the KYC/`customer_profiles` exposure (F009-1, A-6) are entirely untouched by this. `location_events`
  being empty says nothing about `customer_profiles`.

### 6.3 New condition

| ID | Condition | Owner | Deadline / blocks |
|---|---|---|---|
| **INC-001-C-13** | **Database-identity positive control.** Re-run the inventory with (i) the resolved database name printed alongside `mode`, (ii) an **unfiltered** count on `assets` and `policies` as a positive control — a non-zero result proves the run reached a populated database, a zero result voids §2a — (iii) the full JSON pasted verbatim into §2a, and (iv) a `recovery_cases` check discharging **D-A-9**. `--mongo-only` is sufficient; `DATABASE_URL` is **not** required (§2b(3)). Recommend the script be amended to emit the resolved database name unconditionally, since its absence is what created this gap. | `database-architect` (+ credential holder) | **2026-09-08.** Blocks the nil purge certificate (C-7) and INC-001 closure. Does **not** block A-9, which is closed |

**2026-09-02 — script fixed, execution still pending a credentialed run.** `database-architect`
made the code-side fix this condition calls for in `backend/scripts/inc-001-location-inventory.ts`:

- Now calls `resolveMongoDatabaseName(mongoUri, mongoDbNameOverride)`
  (`backend/src/db/mongo-connection.ts`) — the exact same resolution `openMongoDatabase` performs
  internally — and prints it unconditionally to stderr **before any query runs**:
  `resolvedDatabaseName=<name>` (or an explicit "driver default — almost certainly wrong" string
  if neither `MONGODB_DB_NAME` nor the URI path resolves anything). The resolved name is also
  included as `resolvedDatabaseName` in the JSON summary on stdout, and the script asserts the
  name it opened matches the name it printed before running any query, so the two can never
  silently diverge.
- Added the positive control: unfiltered `estimatedDocumentCount()` on `assets` and `policies` in
  the same database, surfaced as `positiveControl.assetsTotalDocuments` /
  `positiveControl.policiesTotalDocuments` / `positiveControl.passed`, plus a top-level `runVoid`
  boolean. If both are zero, the script labels the run VOID in the JSON `note` field and on
  stderr, explicitly instructing that the location-data zeros must not be cited.
- Added the `recovery_cases` check for **D-A-9**: unfiltered total plus a count of documents with
  non-null `lastLocation`/`lastLocationAt`, under `recoveryCases` in the summary.

**2026-09-02 — executed by `cto` (shell + production `MONGODB_URI` available in that session).**
Full JSON output:

```json
{
  "generatedAt": "2026-09-02T07:58:19.259Z",
  "mode": "mongo-only",
  "resolvedDatabaseName": "test",
  "positiveControl": {
    "assetsTotalDocuments": 3,
    "policiesTotalDocuments": 5,
    "passed": true
  },
  "runVoid": false,
  "recoveryCases": { "totalDocuments": 0, "documentsWithNonNullLastLocation": 0 },
  "locationEvents": {
    "totalDocuments": 0, "distinctAccountCount": 0, "distinctAssetCount": 0,
    "dateRange": { "earliestRecordedAt": null, "latestRecordedAt": null },
    "accountBreakdown": { "test": 0, "real": 0, "unresolved": 0 }
  },
  "assetLastLocation": {
    "assetsWithNonNullLastLocation": 0,
    "accountBreakdown": { "test": 0, "real": 0, "unresolved": 0 }
  }
}
```

**INC-001-C-13 is CLOSED.** Positive control passed (3 assets, 5 policies — real counts, not an
empty database), so the run reached a genuinely populated database and the location-data zeros
in §2a are **confirmed real, not a wrong-database artifact**. D-A-9 is also discharged directly:
`recovery_cases` has zero total documents. §6.1's nil purge disposition now has its evidentiary
condition satisfied — the nil purge certificate (C-7) and INC-001 closure on this limb are
unblocked.

**New, separate finding (not an INC-001 data issue):** `resolvedDatabaseName` is `"test"` — the
MongoDB driver's fallback default, because no `MONGODB_DB_NAME` is configured anywhere and the
connection string carries no explicit database path. Production has apparently been running
against a database literally named `test` throughout. The data itself is real and correctly
scoped (per the positive control) — this is a naming/configuration hygiene risk, not a data
exposure, but worth `devops-engineer`/`database-architect` cleaning up separately (rename or
pin `MONGODB_DB_NAME` explicitly) so a future environment mix-up doesn't silently point at the
wrong store. Filed here as a pointer only; not a new INC-001 condition.

### 6.4 Downstream effect on the POPIA assessment's open gates

Recorded here once, and appended to the POPIA assessment as a pointer rather than duplicated:

| Gate (POPIA assessment §7.3 / §6) | Effect |
|---|---|
| **G-1** (D-A-1…D-A-10 returned) | **Substantially answered, nil.** D-A-1/2/3/4/5/6/7/8 all resolve to nil on an empty collection. D-A-9 outstanding → C-13. D-A-10 discussed below |
| **G-2** (F-1/F-2/F-3, s22 final) | **F-1 (non-owner access) disposed of as to stored data** — there is no stored coordinate to have been accessed, and the admin read path at §3 returns `lastLocation: null`. **F-2 survives on the client limb** (§2b(5)) — INC-001-C-4 stays open. **F-3** (APK distribution scope, C-6) is now low-consequence but stays open |
| **s22 determination** (§6.6, provisional negative, expired T+72h unrecorded) | **Now recordable as FINAL NEGATIVE** on a far stronger footing than the statutory-construction argument it originally rested on: there was no personal information in the store capable of being accessed or acquired by anyone, authorised or not. The construction argument at §6.2 is no longer load-bearing, which also relieves the counsel referral at §10.1 of its urgency. Subject to C-13 |
| **G-3** (§6.5 data-subject notifications) | **Closes as "recorded finding that no such data subject exists"** — the alternative limb G-3 always provided for. Notification of nobody is not required. This also **de-fangs INC-001-C-8** (unreachable data subjects via blocked email) *for this incident*; C-8 remains open as a standing go-live blocker, because the next incident may have data subjects |
| **G-4** (legal hold) | Unaffected. No hold raised |
| **§7.4 `Asset.lastLocation` null-by-T+48h order** | **Discharged by fact.** Zero assets carry a value. The order stands for any value C-13 surfaces |

### 6.5 Correction owed to the POPIA assessment

POPIA assessment §0(1) states: *"Every location record written through `POST /v1/assets/:assetId/location-report` was written without a lawful basis."* On this evidence **no location record was written.** The sentence is conditionally true and factually inapplicable, and leaving it to be cited downstream as "unlawfully processed customer location data exists" would reproduce exactly the narrative-outrunning-the-code failure INC-001 §5 identifies as this project's root cause. I wrote it; I correct it. Appended to that document as §13 rather than rewritten, per its own §8.2 precedent.

**The s11 finding survives in substance and is restated as:** an unlawful processing *capability* — collection without consent, without retention, without a withdrawal mechanism, and with an inaccurate s18 notice — was built, reviewed past no gate, and deployed. The contravention is of s8 (accountability) and s19 (security safeguards) in their own right, and of s11/s13/s14/s17/s18 as to any request the endpoint received. **What did not occur is the harm those conditions exist to prevent.** That distinction is worth stating precisely, in both directions: I was scrupulous in making the accusation and I will be scrupulous in narrowing it.

