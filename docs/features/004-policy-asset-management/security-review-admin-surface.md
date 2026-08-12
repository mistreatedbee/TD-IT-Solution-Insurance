# Feature 004 — Security Review (Stage 8), Admin Surface

**Status:** **SIGN-OFF GRANTED WITH REQUIRED CHANGES** — Feature 004 **admin** read surface, conditional on `security-engineer` concurrence (SR-004-admin-1) before these routes are deployed anywhere holding real customer data.
**Date:** 2026-08-12
**Lifecycle stage:** 8 — Security Review. **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate:** `security-engineer` (R — **concurrence not yet given**, see §6) · `compliance-specialist` (C — C-14 purpose documentation and P-04/P-05 retention open).
**Why a separate document, not a section in `security-review.md`:** that document is a signed record whose §0 scope boundary explicitly excludes the admin surface (MP-1) and whose **SR-004-3** requires "full Stage 8 repeat" when `/admin/policies*` / `/admin/assets*` ships. Amending a signed verdict in place is the practice ADR-0006 §17 deliberately refused ("a ratification that quietly edits itself afterwards is not a record of anything"). This is that repeat, filed alongside — the same relationship `database-addendum-001.md` has to `database-design.md`. A pointer section has been appended to `security-review.md` §6; its verdict and tables are untouched.

**Scope of this gate:**
- `GET /v1/admin/policies`, `GET /v1/admin/policies/{policyId}`, `GET /v1/admin/assets`, `GET /v1/admin/assets/{assetId}` (`api-design.md` §4.4, §6.3).
- `admin_access_log` (Trail B) as a **live writer**, not a paper design — ADR-0006 AUD-3(b)/R-1, `database-addendum-001.md` Amendment A1.
- The Admin Dashboard web client as a new privileged read surface (`frontend-architect` building in parallel) — conditions at SR-004-admin-10, **not** a sign-off of a UI that does not exist yet.

**Reviewed against:** [ADR-0006](../../organization/adr/0006-privileged-access-audit-correlation.md) §5 (AUD-1…AUD-12), §14 (C-13…C-18), §16 (R-1…R-5, conditions), §17 (corrections, FU-A13/FU-A14) · [`database-addendum-001.md`](./database-addendum-001.md) Amendment A1 §1.2–§1.4, §2, §3 · [`field-sensitivity-review.md`](./field-sensitivity-review.md) (P-14 Phase 1) · [`api-design.md`](./api-design.md) §4.4, §5, §6.3 · [`security-review.md`](./security-review.md) (Phase 1 customer verdict) · [`06-security-standards.md`](../../organization/06-security-standards.md).

**Running code read (2026-08-12):** `backend/src/routes/admin-policies.ts`, `admin-assets.ts`, `admin-accounts.ts` (Trail A precedent); `repositories/admin-access-log.ts`, `audit-log.ts`, `policies.ts`, `assets.ts`; `lib/policy-asset-serializers.ts`, `lib/policy.ts`, `lib/mongo-pagination.ts`, `lib/pagination.ts`; `middleware/require-role.ts`, `rate-limit.ts`; `db/feature004-collections.ts`; `index.ts` (mounting); `routes/admin-policies.test.ts`, `admin-assets.test.ts`, `repositories/admin-access-log.test.ts`.

---

## 0. Verdict

**SIGN-OFF GRANTED WITH REQUIRED CHANGES**, at the architecture level I own, for the four admin read endpoints and the Trail B writer as implemented.

**First, a state correction this gate must record, because two current documents say otherwise.** [`HANDOFF.md`](../../../HANDOFF.md) and `database-addendum-001.md` §0/§1.3/§7 both state that no Feature 004 admin route and no `admin_access_log` writer exist. **Both are stale as of the working tree I reviewed.** `backend/src/routes/admin-policies.ts` and `admin-assets.ts` implement all four endpoints, `repositories/admin-access-log.ts` implements the Trail B writer, `db/feature004-collections.ts` carries the collection, the A1 validator and all four indexes, and `index.ts:98–100` mounts all three admin routers under `/api/v1`. This is the same class of drift ADR-0006 §17.1 named ("a design document is not a migration, and citing one as 'existing' is how the two get confused"), running in the opposite direction: code that exists while the documents call it unbuilt. Owners should correct their own artifacts — I do not edit them here. It also means this gate is a real implementation review, not the design-only pre-review the task anticipated.

**What is right, and it is most of it.** The implementation is a faithful, careful build of ADR-0006 R-1 on Trail B, and in three places it is better than the contract that specified it: `endpoint` is a module-level template constant (C-17's one-line slip is structurally avoided), `resultCount` carries the Trail B *documents-returned* semantic rather than being copy-pasted from Trail A's distinct-subject count, and the writer mirrors the validator's invariants as loud assertions so a bad row fails in a test. Ordering is correct everywhere: query → materialise → derive subjects → audit → serialise (AUD-10 / §14.5.4).

**What I am requiring.** Twelve items, SR-004-admin-1…12 (§4). Two of them are substantive design changes, not paperwork:

- **SR-004-admin-6 — bulk projection minimisation.** `GET /v1/admin/assets` currently returns the complete `details` object (VIN, IMEI, serial numbers, licence plate) plus `estimatedValue` for up to 200 assets belonging to arbitrarily many customers, per call. Logging that disclosure does not reduce it. This is the one place in the admin surface where a class of harm can be made structurally impossible instead of merely accountable, and per this role's own standard ("prefer architecture patterns that make classes of vulnerability structurally impossible"), it should be.
- **SR-004-admin-5 — bulk-exposure ceiling.** 60 list calls/min × 200 records = **12,000 records/min per admin session**, and up to **12,060 Trail B documents/min**, on a trail whose failure fails the request (AUD-10). Both halves need a lower ceiling.

Neither reopens ADR-0006. Both are `api-design.md` amendments plus small code changes.

**Withheld, explicitly:** nothing in this document is a sign-off of the Admin Dashboard UI (does not exist — SR-004-admin-10 states its conditions in advance), of any export/reporting surface (FU-A12), or of Trail B retention being enforced (SR-004-admin-9).

---

## 1. Threat model — admin read paths

**Data class.** The admin surface discloses, across all customers: `accountId` (linkable to identity in Supabase), the asset registry with its identifying numbers, declared asset value, and policy/billing state. Under the classification `field-sensitivity-review.md` §3.1 set, no single field is payment-, ID-document- or location-grade. **In bulk it is a different asset than it is per-record:** an enumeration of *what valuable property exists, what it is worth, and which customer holds it* is a target-selection list for exactly the theft this platform exists to insure against. That aggregation effect, not any individual field, is what §2's controls and SR-004-admin-5/6 are sized against.

**Trust boundaries crossed (new or changed by this surface):**

| # | Boundary | Posture |
|---|---|---|
| B1 | Admin browser (Admin Dashboard) → Backend API | Bearer access token, Feature 001; `user_type = admin` enforced server-side. **New client surface** — conditions at SR-004-admin-10. |
| B2 | Admin request → all customers' MongoDB domain data | Deliberately unscoped by subject: an admin is authorised platform-wide. Accountability, not scoping, is the control. |
| B3 | Backend → `admin_access_log` (Trail B, same MongoDB) | Append-only **by intent**, not yet by privilege (AUD-11 / SR-004-admin-3). Fail-closed on write error (AUD-10). |
| B4 | Trail A (Supabase) ↔ Trail B (MongoDB) correlation | Application-layer join on `(targetAccountId, actorAccountId, actorSessionId, ±5 s)` — AUD-1/AUD-6. No credential exists to execute it (FU-A11). |

### 1.1 T-A — Unauthorised reach onto the admin surface (Spoofing / Elevation)

| Threat | Control | Verdict |
|---|---|---|
| Customer or unauthenticated caller reaches an admin route | `authenticate` + `requireUserType('admin')` on all four routes; `user_type` read from the verified token claim only | **Adequate.** Tested for `customer` (403). |
| `support_agent` / `security_company_operator` reads policy/asset data | `requireUserType('admin')` admits neither — matches `api-design.md` §4.4's C8-consistent ruling that neither role gets Phase 1 read access | **Adequate in code, untested.** SR-004-admin-11. |
| Forged/tampered token claiming `user_type: admin` | Feature 001 signed access tokens, `kid`-keyed; not re-reviewed here | Inherited. |
| Password-only admin account | Privileged accounts are created with `mfa_required = true` unconditionally (`repositories/accounts.ts` `createPrivilegedAccount`), and SR-14(a) refuses to mint a session for an `mfa_required` account without a verified factor | **Adequate, structurally.** Verify no admin exists with `mfa_required = false` (SR-004-admin-11). |
| Stale privilege — role revoked mid-session | Reads trust the ≤10-minute token claim by design (`api-design.md` §4.3). For a *read* of every customer's asset registry this is a longer blast radius than it is for a customer reading their own policy. Accepted for Phase 1 given `privilegedWeb` idle TTL is 15 min and absolute lifetime 8 h (`lib/policy.ts`) | **Accepted, named** (§5). |

### 1.2 T-B — IDOR / BOLA, in its inverted admin form

On the customer surface, IDOR is the primary threat and 404-on-cross-account is the control. On the admin surface **there is no object-level authorisation to break**: `findByIdForAdmin()` intentionally matches on `_id` alone, and that is the ratified contract. So the residual IDOR-family risks are different ones, and all three are handled:

- **Enumeration by malformed id** — `/^[0-9a-f]{24}$/i` param guard, and a rejected id returns `404 NOT_FOUND`, not a 400 that distinguishes "malformed" from "absent". No audit row is written for a 404, correctly: nothing was disclosed.
- **Unaudited object read** — every 200 response on the detail path is preceded by a `privileged_data_access` row naming `targetAccountId` **and** `resourceId`. This is strictly better attribution than the list path can give (§1.3).
- **Audit-bypassing back door** — `policies.listForAdmin` / `findByIdForAdmin` and the asset equivalents are plain repository methods with no audit coupling. Today the only callers are the four audited routes (verified by grep). **Any future caller silently disables the trail for that path.** Standing constraint, SR-004-admin-12.

### 1.3 T-C — Bulk enumeration and mass identifier harvesting *(the highest-severity path on this surface)*

**Attack tree — "exfiltrate the platform's asset registry":**

```
Goal: obtain (customer, asset, identifier, value) for the whole book
├── (a) Compromise or coerce one admin session  [entry: phishing, malware, insider, session theft]
│   └── GET /v1/admin/assets?limit=200 → cursor-walk to exhaustion
│       ├── Rate limit:      60 calls/min/account  →  12,000 records/min      ← SR-004-admin-5
│       ├── Payload:         full details{} incl. VIN/IMEI/serial + value     ← SR-004-admin-6
│       ├── Audit:           N+1 Trail B rows per call — the read IS recorded  ✔ (R-1)
│       └── Detection:       none — no alerting on bulk-access volume          ← SR-004-admin-5(d)
├── (b) Reach the data through an unaudited path
│   └── Repository method called from a new route/job                          ← SR-004-admin-12
├── (c) Read it out of band, under the audit layer
│   └── Direct Atlas credential / future reporting surface       ← C-16(c) [GL], FU-A12
└── (d) Destroy the evidence afterwards
    └── App credential can update/remove admin_access_log rows                 ← SR-004-admin-3
```

Branch (a) is the live one and it is the reason SR-004-admin-5 and -6 are required rather than recommended. The audit trail makes the theft *reconstructible*; it does not make it *slower*, *smaller*, or *noticed*. Those are three separate controls and Phase 1 has none of them.

**A second-order effect worth naming:** minimising the list projection (SR-004-admin-6) also improves the trail. Once identifiers are only obtainable through the detail path, every identifier disclosure carries a `resourceId` — the exact grain `database-addendum-001.md` §1.2.4 declined to add to bulk rows and flagged for this gate. I am **not** overturning §1.2.4: `resourceIds` on bulk rows stays out. I am removing the need for it by not disclosing identifiers in bulk.

### 1.4 T-D — Audit-trail completeness (AUD-3 Trail B, C-14)

Verified in code, endpoint by endpoint:

| Requirement (ADR-0006 / A1) | Implementation | Verdict |
|---|---|---|
| R-1: one `privileged_data_access` row per **distinct** disclosed subject | `[...new Set(disclosedAccountIds)]` in `recordBulkDisclosure()`; route passes `page.data.map(r => r.accountId)` — the **materialised page**, after `buildPage` trims the `limit + 1` probe row, so no undisclosed subject is recorded and no disclosed one is missed | **Correct** |
| R-1: plus one call-scoped `privileged_bulk_access` row, `resultCount` including 0 | Row 0 of the `insertMany`; `resultCount: page.data.length`. Empty-page case tested | **Correct** |
| Trail B `resultCount` = documents returned, *not* distinct subjects (A1 §1.2.3) | Route passes `page.data.length`; writer's own doc comment states the divergence | **Correct** — the single most misreadable requirement in A1, and it is right |
| AUD-1: `actorSessionId` required, non-null, server-derived | `req.auth!.sessionId` from the verified claim | **Correct** |
| AUD-4/AUD-5: `auditRequestId` server-generated, never client-supplied | `req.auditRequestId` (never `req.requestId`, which SR-18 lets a caller supply) | **Correct** |
| AUD-10: failed audit write fails the request, before serialisation | `await` precedes `res.json()`; errors reach `next(err)` → 5xx with no body | **Correct** |
| A1 §1.2.6: one round trip, `ordered: false` | `insertMany(rows, { ordered: false })` | **Correct** |
| C-17: no verbatim query/filter values anywhere | `endpoint` is a template constant (`'GET /v1/admin/policies'`); no field receives a filter value; filters are zod enum/uuid-validated and never persisted | **Correct** |
| A1 §1.3: validator enforces the R-1 invariants at the store | Present in `feature004-collections.ts`, `validationAction: 'error'`, plus `assertInvariants()` app-side | **Correct in code; existence on the live cluster unverified** — SR-004-admin-2 |
| AUD-11: append-only by privilege | Not enforced; no Mongo role split exists | **Open** — SR-004-admin-3 |
| AUD-7: 12-month retention, `legalHold` carve-out | `legalHold: false` written on every row; **no purge job, no run record** | **Open** — SR-004-admin-9 |
| C-14: purpose-documented **and** role-restricted | Role-restricted ✔. Purpose documentation does not exist for this surface | **Open** — SR-004-admin-4 |
| A1 §1.2/§14.7: **no** purpose/case field on this collection | Correctly absent | **Correct** — do not add one (FU-A14 constrains the *future* GPS/partner trail, not this one) |

**Two completeness limits inherited, not defects here:** correlation grain is the sitting, not the action (RR-1), and cross-store ordering is asserted only to ±5 s (AUD-6/RR-2). Any investigation write-up must not claim finer.

### 1.5 T-E — The trail as an attack surface and an availability dependency

R-1 plus AUD-10 create a coupling that Trail A never exercised at this volume: **an admin list call cannot succeed unless up to 201 audit documents are accepted.** Consequences, all accepted with eyes open but none previously written down for Trail B:

- Audit-store pressure becomes admin-surface downtime. Correct direction (fail closed, never disclose unrecorded), but it means the audit collection's health is now on the availability path for the Admin Dashboard.
- An admin who wants to degrade the platform's own evidence quality can inflate the trail cheaply — 720k documents/hour at the current limiter. SR-004-admin-5 bounds this too.
- Partial `insertMany` followed by a 5xx over-records an access that never completed. A1 §1.2.6 classes this as a harmless false positive and I concur; it is stated here so a future investigator does not read an orphaned row as a completed disclosure.

### 1.6 T-F — Admin Dashboard as a new privileged client (B1)

The dashboard does not exist yet, so this is a set of pre-conditions rather than findings. The threat that matters: **a single XSS or a single unattended browser session on this surface exposes every customer's asset registry**, not one customer's data. Conditions at SR-004-admin-10.

### 1.7 T-G — Investigability

Neither trail has a read path in the running API — grep finds no `/admin/audit-log` route implementation, and Trail B has no read method at all. So today the POPIA s23 answer ("who accessed my data") and the s22 breach enumeration are producible only with a direct database credential that nobody holds (FU-A11). The surface that *generates* the evidence has shipped ahead of the surface that *reads* it. SR-004-admin-7.

---

## 2. Required controls checklist, mapped to implementation

| Control | Required by | Implementation | Status |
|---|---|---|---|
| Authentication on all four routes | `06-security-standards.md` | `createAuthenticateMiddleware` | ✔ |
| `user_type = admin`, no new RBAC primitive | `api-design.md` §4.4 | `requireUserType('admin')` | ✔ |
| `support_agent` / `security_company_operator` excluded | §4.4 (C8 parity) | same middleware, no grant | ✔ code / ✖ test |
| MFA on privileged accounts | Feature 001 SR-14(a) | `mfa_required = true` at privileged-account creation | ✔ |
| Explicit per-route rate limiter | MP-7 | `createRateLimiter` on all four; list `60/min`, detail `100/min`, keyed per admin account | ✔ present / ✖ **ceiling too high** (SR-004-admin-5) |
| Cursor pagination, `limit ≤ 200` | `api-design.md` §5 | `parseMongoPaginationQuery`, `MAX_PAGE_LIMIT = 200` | ✔ contract-conformant / see SR-004-admin-5(c) |
| Filter input validation | §5 | zod: `accountId` uuid, `status`/`assetType` closed enums | ✔ |
| Fixed error catalogue, no upstream strings | SR-19 | `apiError` + `error-handler` | ✔ |
| Mongo outage → `503 UPSTREAM_UNAVAILABLE` | P-12 | `lib/mongo-errors.ts` via error handler | ✔ inherited |
| Trail B: N+1 rows per list call | AUD-3(b) / R-1 | `recordBulkDisclosure()` | ✔ |
| Trail B: per-subject row on detail read, with `resourceId` | R-1 | `recordDetail()`, `new ObjectId(resourceId)` | ✔ |
| Audit before serialisation, fail closed | AUD-10 | route ordering | ✔ |
| Server-derived correlation only | AUD-1/AUD-4/AUD-5 | claims + `req.auditRequestId` | ✔ |
| No query/filter values in the trail | C-17 | `endpoint` template constants | ✔ |
| Store-side structural invariants | A1 §1.3 | validator in `feature004-collections.ts` | ✔ code / ✖ live-verified (SR-004-admin-2) |
| Append-only by privilege | AUD-11 | none | ✖ (SR-004-admin-3) |
| 12-month retention enforced | AUD-7 / A1 §3.3 | none | ✖ (SR-004-admin-9) |
| Purpose documented for bulk access | C-14 | none | ✖ (SR-004-admin-4) |
| Bulk projection minimised | this review | full `details` returned in list | ✖ (SR-004-admin-6) |
| Real client IP in evidentiary `ipAddress` | SR-7 | `clientIp(req)`; correctness depends on `trustProxyHops` | ✖ deployment-verified (SR-004-admin-8) |
| Trail readable for s22/s23 | C-14 / POPIA | no read path, no credential | ✖ (SR-004-admin-7) |
| Bulk-access volume detection | this review | none | ✖ (SR-004-admin-5(d)) |

---

## 3. Field sensitivity — P-14 extended to the admin surface

`field-sensitivity-review.md` ruled Phase 1 fields on `policies`/`assets`, and ADR-0006 AUD-12 ruled `ipAddress`/`userAgent` on `admin_access_log`. Two additions, within this role's authority, both narrow:

1. **No field-level encryption is added for the admin surface.** The §3.1 ruling stands unchanged — a field's classification does not change because a different role reads it. Atlas at-rest encryption, TLS, RBAC and Trail B audit remain the control set.
2. **Aggregation is a distinct exposure from field sensitivity, and it is controlled by projection, not by encryption.** `(accountId, assetType, make/model, VIN|IMEI|serial, estimatedValue)` × the whole book is materially more sensitive than any of its fields. Ruling: **identifying `details.*` fields and `estimatedValue` are detail-read-only on the admin surface** (SR-004-admin-6). This adds a sixth revisit trigger to §4 of that document: *any new surface that returns asset identifiers for more than one subject per call re-opens P-14.*

`admin_access_log` itself needs no field-sensitivity re-ruling — AUD-12 covers it and this implementation adds no field beyond A1's set.

---

## 4. Required changes

**Blocking — must close before these four routes serve real customer data in any environment:**

| ID | Item | Owner |
|---|---|---|
| **SR-004-admin-1** | **`security-engineer` concurrence.** Stage 8 is a joint gate; my sign-off is architecture-level. The implementation exists and has not been reviewed by `security-engineer`. Specific asks: verify §1.4's table against the code independently, verify no unaudited caller of the four repository admin methods, verify `assertInvariants()` matches the live validator, run the suite | `security-engineer` |
| **SR-004-admin-2** | **Live-catalog verification of Trail B**, against the Atlas catalog and not against `HANDOFF.md` or this document: `admin_access_log` exists; the A1 validator is attached with `validationLevel: strict` / `validationAction: error`; all four indexes from A1 §2 exist with the stated partial filters. ADR-0006 §17.1 is the precedent for why a claim is not evidence. Without the validator, R-1's invariants hold only in application code | `security-engineer` + `database-architect` |
| **SR-004-admin-4** | **C-14 — purpose documentation.** Role restriction is met in code; the purpose half does not exist. Required: a written purpose for platform-wide admin read of policy/asset data, entered in the RoPA per `compliance-review-supabase.md` C-8 (not a separate untracked record), plus `compliance-specialist` confirmation that ADR-0006 §14.7's "no per-call purpose field" ruling still holds now that the endpoints are real. **C-15's s18 notification to staff remains a `cto` obligation before the first production privileged account** — unrecoverable if skipped | `backend-architect` + `authentication-engineer`, ruled by `compliance-specialist`; C-15 half `cto` |
| **SR-004-admin-5** | **Bulk-exposure ceiling.** Present: 60 list calls/min × 200 records = 12,000 records/min/admin and ≤12,060 Trail B docs/min. Required, four parts: (a) a dedicated, tighter limiter for the two Feature 004 admin **list** endpoints — do not reuse `AUDIT_LOG_READ_LIMIT`, which was sized for an audit-log read, not a customer-registry read; (b) an IP-scoped limiter in addition to the account-scoped one, so one compromised credential across many hosts is still bounded; (c) a lower `limit` ceiling on admin list endpoints than the platform's 200; (d) an alert on bulk-access volume per actor per window, derived from Trail B. Exact numbers with `security-engineer` + `backend-architect`; I set the requirement, not the constants | `security-engineer` + `backend-architect` (+ `site-reliability-engineer` for (d)) |
| **SR-004-admin-6** | **Bulk projection minimisation.** `GET /v1/admin/assets` must not return `details.vin` / `details.imei` / `details.serialNumber` / `details.licensePlate` or `estimatedValue` in a **list** response. Return a summary shape (id, accountId, assetType, displayName, status, registeredAt, gps-paired boolean, legalHold); full `details` on the detail read only, which is per-subject audited with `resourceId`. Same discipline for `GET /v1/admin/policies` on `billing.*` beyond what admin triage needs. Carries an `api-design.md` amendment (new `AdminAssetSummary` / `AdminPolicySummary` schemas) — do not implement a projection the contract does not describe | `backend-architect` (contract) + `backend-engineer` (code); §3 is my ruling on the underlying question |

**Required before first production privileged account / go-live:**

| ID | Item | Owner |
|---|---|---|
| **SR-004-admin-3** | **AUD-11 on Trail B.** The runtime Mongo credential must be refused `update` / `remove` / `drop` on `admin_access_log`, with purge and hold-placement as separate principals (A1 §1.4). Trail B now has a live writer, so this moved from paper exposure to real: the credential that writes the evidence can also rewrite it. Rides FU-A10's deploy-time assertion; FU-A6 provisions the role. **Until it exists, no document may describe Trail B as append-only** (ADR-0006 §16.5 condition 3). Not blocking merge only because Trail A shipped under the identical accepted condition — recorded as a deliberate consistency call, not an oversight | `cloud-infrastructure-architect` (provision) + `security-engineer` (verify) + `devops-engineer` (assert) |
| **SR-004-admin-7** | **Trail B read path.** Neither trail is readable through the API and no investigative credential exists (FU-A11), so POPIA s23 subject access and s22 enumeration are unanswerable today for a surface that is now generating the records. Either provision FU-A11's read-only credential or specify a read endpoint — a read endpoint is itself a privileged surface needing its own Stage 8, so sequence it deliberately | `cloud-infrastructure-architect` + `database-architect`, verified `security-engineer`; endpoint option → `backend-architect` |
| **SR-004-admin-8** | **`trustProxyHops` correctness in deployment.** `ipAddress` and `userAgent` are evidentiary fields on both trails. `clientIp()` returns `req.ip`, which under Render's proxy records the proxy hop unless `trust proxy` is set from the environment. A trail full of one identical infrastructure IP is a trail that cannot place an actor anywhere. Verify in the deployed environment, not in code review | `devops-engineer` + `security-engineer` |
| **SR-004-admin-9** | **Trail B retention.** 12 months is ruled (A1 §3.3) and nothing enforces it: no purge job, no `retention_purge_runs` equivalent, no `rowsSkippedForHold`. Trail B now grows at up to 201 documents per list call, so this is no longer theoretical. Same standard as FU-A13/ADR-0006 §17.2 — **retention may not be described as enforced until something runs on a schedule.** C-13's resolvable hold reference and purge/hold interlock remain go-live blockers | `database-architect` + `devops-engineer`, retention ruling `compliance-specialist` |

**Standing constraints and test coverage:**

| ID | Item | Owner |
|---|---|---|
| **SR-004-admin-10** | **Admin Dashboard pre-conditions** (binding on `frontend-architect`/`frontend-engineer`; this gate does not sign off a UI that does not exist): (a) **no unfiltered list on page load** — default to a filter, because an unfiltered load is a bulk disclosure of every customer in the page and `api-design.md` §6 already flags it as unindexed; (b) **no polling or auto-refresh on list views** — it converts privileged disclosure into a background process and floods the trail with records no human read; (c) **no client-side persistence** of customer policy/asset data (no `localStorage`/`sessionStorage`/service-worker cache) — in-memory only, cleared on navigation away; (d) enforce the ratified 15-minute privileged idle timeout (`DASHBOARD_IDLE_TIMEOUT_SECONDS`) with re-authentication, not a silent refresh; (e) surface no asset identifiers in list views, mirroring SR-004-admin-6; (f) **no CSV/bulk export in Phase 1** — an export is a new bulk-disclosure surface and needs its own Stage 8 (FU-A12 adjacency); (g) a strict CSP and no third-party script on this origin — one XSS here exposes the whole book, not one account | `frontend-architect` + `cybersecurity-architect` review |
| **SR-004-admin-11** | **Stage 10 test cases derived from this threat model:** AUD-10 fail-closed (audit writer throws → 5xx, no body, no data leaked); 403 for `support_agent` **and** `security_company_operator` (only `customer` is covered today); `resultCount` ≠ distinct-subject count on a page where two records share one account (the A1 §1.2.3 divergence, currently untested); `limit` above 200 rejected; `endpoint` never `req.originalUrl` even with query params present (C-17 regression guard); cross-store correlation smoke test — one admin sitting produces joinable Trail A and Trail B rows on `actorSessionId`; no admin account with `mfa_required = false` | `qa-architect` + `automation-qa-engineer` |
| **SR-004-admin-12** | **Standing constraint: the four repository admin methods** (`policies.listForAdmin`, `policies.findByIdForAdmin`, `assets.listForAdmin`, `assets.findByIdForAdmin`) **may be called only from an audited admin route.** They carry platform-wide read capability with no audit coupling; a new caller — a job, a report, an internal endpoint — silently produces unaudited privileged access and re-triggers Stage 8. Record the constraint at the call sites and treat any new caller as an ADR-0006 AUD-9-class growth event | `backend-architect`; conformance `cybersecurity-architect` |

---

## 5. Residual risks accepted for this phase

| Risk | Why accepted | Owner / trigger |
|---|---|---|
| Admin reads are platform-wide by design; no subject-level authorisation exists to fail | Ratified contract (`api-design.md` §4.4); accountability replaces scoping. Revisit if a narrower admin tier (e.g. regional or support-scoped) is ever introduced | `cybersecurity-architect` on any new privileged tier |
| Bounded-staleness privilege on reads (≤10 min after role revocation) | `api-design.md` §4.3's ratified split; bounded further by 15-min privileged idle TTL. Documented rather than tightened because the enforcement chokepoint is session refresh, not per-read re-derivation | `authentication-engineer` if a revocation-urgency requirement appears |
| Correlation grain is the sitting, not the action; cross-store ordering ±5 s | ADR-0006 RR-1 / RR-2, accepted at ratification | — |
| Over-recorded access on a partial `insertMany` + 5xx | A1 §1.2.6 — safe failure direction; under-recording is impossible | — |
| Trail B write amplification (≤201 docs/call) | ADR-0006 §16.1 accepted it; bounded by 12-month retention once SR-004-admin-9 lands and by SR-004-admin-5's ceiling | `cloud-infrastructure-architect` if volume grows |
| Same Atlas database backs dev and prod (MP-8) | Pre-existing; **worse on this surface than on the customer one** — an admin route reads every document in whatever database it is pointed at. Staging required before go-live | `devops-engineer` + `cloud-infrastructure-architect` |
| Direct/out-of-band database access to the same data | ADR-0006 C-16(c), ruled `[GL]` by `cto` — elimination preferred over vendor-tier audit | `cto` at provisioning |

---

## 6. Sign-off record

| Role | Status | Date |
|---|---|---|
| `cybersecurity-architect` (Stage 8 chair) | **Sign-off granted with required changes** SR-004-admin-1…12; SR-004-admin-1/2/4/5/6 blocking before real customer data | 2026-08-12 |
| `security-engineer` | **Concurrence granted with required changes** — see §7 | 2026-08-12 |
| `compliance-specialist` | **Concurrence required and not yet given** — C-14 purpose documentation (SR-004-admin-4), Trail B retention enforcement (SR-004-admin-9), P-04/P-05 still open for this domain | — |

**Does `security-engineer` concurrence need to precede the backend shipping these routes? Yes.** Stage 8 is a three-role gate and two of the three have not signed. Concretely, the two things only `security-engineer` can close are the ones this gate most depends on: that the live Atlas collection actually carries the validator enforcing R-1's invariants (SR-004-admin-2), and that no unaudited caller reaches the admin repository methods (SR-004-admin-12). Both are verification-against-reality tasks, which is exactly the division of labour ADR-0006 §17.1 was written about. Merging the code is fine; **enabling these routes against real customer data before that concurrence would be a Stage 8 bypass**, and this project's success metric for this gate is zero bypasses.

**Signed:** `cybersecurity-architect`, 2026-08-12. Supersedes `security-review.md` **SR-004-3** ("admin surface re-review") as the record for this surface; that document's Phase 1 verdict is unchanged and unamended.

---

## 7. Security-engineer concurrence

**Verdict:** **CONCURRENCE GRANTED WITH REQUIRED CHANGES**

**Date:** 2026-08-12  
**Reviewer:** `security-engineer`  
**Test evidence:** `cd backend && npm test` — **102 tests passed** (19 files), including `repositories/admin-access-log.test.ts`, `routes/admin-policies.test.ts`, `routes/admin-assets.test.ts`, and `db/feature004-collections.test.ts`.

### 7.1 Independent verification summary

| Area | Finding |
|---|---|
| **R-1 Trail B writer** (`repositories/admin-access-log.ts`) | **Verified.** `recordBulkDisclosure()` emits one `privileged_bulk_access` row (`resultCount` = documents returned) plus one `privileged_data_access` row per distinct subject via `[...new Set(disclosedAccountIds)]`; `insertMany(..., { ordered: false })`. `recordDetail()` sets `resourceId`, null `resultCount`, non-null `targetAccountId`. `assertInvariants()` mirrors addendum-001 §1.3 / A1 conditional branches and fails loudly in tests. |
| **Admin routes** (`admin-policies.ts`, `admin-assets.ts`) | **Verified.** All four routes: `authenticate` → `requireUserType('admin')` → rate limiter(s) → query → materialise → audit → serialise. Detail paths: malformed/unknown id → `404 NOT_FOUND`, no audit row. Filter validation via closed zod enums / UUID. `endpoint` is a module-level template constant (C-17). `req.auditRequestId` used, not `req.requestId`. Audit failure propagates via `next(err)` before `res.json()`. |
| **Unaudited callers** (SR-004-admin-12) | **Verified by grep.** `policies.listForAdmin` / `findByIdForAdmin` and `assets.listForAdmin` / `findByIdForAdmin` are called only from the four audited admin routes (plus test stubs). No job, internal route, or report path reaches them. Call-site comments added in both route files; formal constraint recording remains with `backend-architect`. |
| **Bootstrap validator** (`feature004-collections.ts`) | **Verified in code** against addendum-001 Amendment A1 §1.3: required fields, `eventType` enum, `allOf` conditional invariants for both row types, four named indexes with stated partial filters, `validationLevel: 'strict'`, `validationAction: 'error'`. Static regression in `feature004-collections.test.ts`. **Live Atlas attachment not verified in this session** (SR-004-admin-2). |
| **Rate limits / bulk ceiling** (SR-004-admin-5) | **Partially remediated in this review** — see §7.2. Prior state reused `AUDIT_LOG_READ_LIMIT` (60/min) with platform `MAX_PAGE_LIMIT` 200. |

### 7.2 Code changes made during this concurrence review

**SR-004-admin-5(a)(b)(c)** — implemented:

| Control | Constant / mechanism | Effect |
|---|---|---|
| (a) Dedicated list limiter | `ADMIN_REGISTRY_LIST_LIMIT` — 20 attempts / 60 s per admin account | Replaces `AUDIT_LOG_READ_LIMIT` on `GET /admin/policies` and `GET /admin/assets` |
| (b) IP-scoped limiter | `ADMIN_REGISTRY_LIST_IP_LIMIT` — 30 attempts / 60 s per client IP | Chained after account limiter on both list routes |
| (c) Lower list page ceiling | `ADMIN_REGISTRY_LIST_MAX_PAGE_LIMIT = 50` via `parseMongoPaginationQuery(..., { maxLimit })` | Max bulk disclosure **1,000 records/min/account** (20 × 50), Trail B write amplification ≤ **1,020 docs/min** (20 × 51) — ~12× reduction from prior 12,000 / 12,060 |

Files touched: `backend/src/lib/policy.ts`, `backend/src/lib/mongo-pagination.ts`, `backend/src/routes/admin-policies.ts`, `backend/src/routes/admin-assets.ts`.

**SR-004-admin-6** — **implemented** after `api-design.md` v1.1.0 amendment (`AdminPolicySummary`, `AdminAssetSummary`). List routes use `serializeAdminPolicySummary` / `serializeAdminAssetSummary` in `backend/src/lib/policy-asset-serializers.ts`; detail routes unchanged.

**SR-004-admin-5(d)** — **not implemented.** Bulk-access volume alerting from Trail B requires `site-reliability-engineer` observability wiring; no alert pipeline exists in this repo today.

### 7.3 Disposition — SR-004-admin-1 through SR-004-admin-12

| ID | Disposition | Notes |
|---|---|---|
| **SR-004-admin-1** | **CLOSED** | This section is `security-engineer` concurrence. §1.4 table independently verified; suite green. |
| **SR-004-admin-2** | **OPEN** | Code/bootstrap specs match A1. Live Atlas verification (`admin_access_log` exists, validator strict/error, four indexes) **not executed** — requires cluster access + `database-architect` joint sign-off per ADR-0006 §17.1. **Blocking before real customer data.** |
| **SR-004-admin-3** | **OPEN** | AUD-11 append-only-by-privilege not enforced. Accepted pre-go-live deferral per chair's consistency call; must not describe Trail B as append-only until FU-A10/FU-A6 land. |
| **SR-004-admin-4** | **OPEN** | C-14 purpose documentation and RoPA entry not present. **`compliance-specialist` concurrence still required.** Blocking before real customer data. |
| **SR-004-admin-5** | **PARTIALLY CLOSED** | **(a)(b)(c) closed** in this review (constants above). **(d) alerting remains open** — `site-reliability-engineer` + Trail B-derived alert spec. **`api-design.md` v1.1.0 rate-limit table amendment closed** (2026-08-12). Blocking item narrows to (d), not the ceiling itself. |
| **SR-004-admin-6** | **CLOSED** | List endpoints return summary projections per `api-design.md` v1.1.0; detail reads unchanged. Serializer split in `policy-asset-serializers.ts`; tests in `admin-policies.test.ts` and `admin-assets.test.ts`. |
| **SR-004-admin-7** | **OPEN** | No Trail B read path; FU-A11 investigative credential absent. Pre-production / go-live blocker. |
| **SR-004-admin-8** | **OPEN** | `trustProxyHops` / `clientIp()` correctness requires deployed-environment verification. Pre-production blocker. |
| **SR-004-admin-9** | **OPEN** | 12-month Trail B retention not enforced (no purge job). Pre-production / go-live blocker. |
| **SR-004-admin-10** | **OPEN** | Admin Dashboard UI scaffold exists at `/admin/*` (login, accounts/policies/assets list+detail); pre-conditions (a)(c)(e) partially met — idle timeout (d), filter-default (a), and full ui-designer polish still open. |
| **SR-004-admin-11** | **OPEN** | Stage 10 abuse-case tests largely absent (support_agent/operator 403, AUD-10 fail-closed, resultCount divergence, limit rejection, C-17 regression, correlation smoke). `qa-architect` ownership. |
| **SR-004-admin-12** | **OPEN (standing constraint)** | Grep confirms sole production callers today. Route-level comments added; `backend-architect` must record the constraint at repository definitions and gate new callers as AUD-9-class growth. |

### 7.4 Concurrence conditions

Concurrence is granted for **merge and continued development** of the admin read surface implementation. It is **withheld for serving real customer data** until at minimum **SR-004-admin-2, SR-004-admin-4**, and the remaining **SR-004-admin-5(d)** alerting item close, plus go-live blockers **SR-004-admin-3, -7, -8, -9** per the chair's table in §4.

This aligns with the chair's **SIGN-OFF GRANTED WITH REQUIRED CHANGES** verdict. No Stage 8 bypass: enabling these routes against a database holding production customer policy/asset data before the blocking items close would violate the joint gate.

### 7.5 Updated sign-off record

| Role | Status | Date |
|---|---|---|
| `cybersecurity-architect` (Stage 8 chair) | **Sign-off granted with required changes** | 2026-08-12 |
| `security-engineer` | **Concurrence granted with required changes** — SR-004-admin-1 closed; SR-004-admin-5(a–c) remediated in code; SR-004-admin-2/4/5(d)/6 blocking before real customer data | 2026-08-12 |
| `compliance-specialist` | **Concurrence required and not yet given** | — |

**Signed:** `security-engineer`, 2026-08-12.
