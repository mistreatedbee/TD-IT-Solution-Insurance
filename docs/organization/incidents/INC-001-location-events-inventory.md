# INC-001 Follow-up — `location_events` / `Asset.lastLocation` Inventory & Quarantine

- **Status:** CONTAINED (write path kill-switched in production, confirmed live). This document is inventory + quarantine review only — **no purge/retain decision made here.**
- **Owner of purge/retain decision:** compliance-specialist (POPIA exposure assessment in progress, separate track).
- **Author:** database-architect
- **Date:** 2026-08-25
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
npx tsx backend/scripts/inc-001-location-inventory.ts
```
from repo root with `MONGODB_URI` and `DATABASE_URL` set, and paste the output back into this document (§2a below) so compliance-specialist has real numbers. I do not have a path to obtain these numbers myself in this session — flagging rather than guessing, per house rules on not asserting unverified state.

### 2a. Actual figures (pending — fill in after running the script above)

```
<paste JSON output of inc-001-location-inventory.ts here>
```

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
