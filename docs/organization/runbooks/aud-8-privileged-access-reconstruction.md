# AUD-8 — Privileged-access reconstruction runbook

**Owner:** `security-engineer`  
**Governing ADR:** [ADR-0006](../adr/0006-privileged-access-audit-correlation.md) (ratified 2026-08-11, §16)  
**Filing location:** `docs/organization/runbooks/` — ruled by `cto` §16.4 / §16.5 (platform-level; spans Feature 001 and Feature 004 and both stores).  
**Status:** **Written. Not executable in production** until **FU-A11** provisions a read-only investigative credential against both trails. Do not invent access grants; do not run these queries with the application runtime credential or a project superuser “because the runbook exists.”

---

## 1. Purpose

Answer the SR-10 / POPIA s22–s23 question at **sitting** grain:

> For customer X (and/or admin Y), who accessed whose data, in which working session, between T1 and T2 — across **both** identity (Trail A) and policy/asset (Trail B) stores?

This is **not** a dashboard, SIEM, or compliance-reporting feature (ADR-0006 AUD-8, RR-3). It is two store queries, a documented merge, and sitting-level grouping.

---

## 2. When to use

| Trigger | Example |
|---|---|
| Compromised or malicious privileged account | Enumerate customers whose data the actor disclosed |
| POPIA s22 breach scoping | “Which data subjects were accessed in window W?” |
| POPIA s23 / internal misconduct | “Did admin Y look at customer X’s identity and/or policies?” |
| Cross-store legal-hold placement (AUD-7(b) / C-13) | Find the correlated `(actor, subject, window)` rows in **both** trails before setting holds |

Do **not** use this runbook for routine product analytics, Reporting & Analytics out-of-band reads (FU-A12), or any purpose that would paste query filters into tickets (see §10).

---

## 3. Who may execute

| Role | Authority |
|---|---|
| `security-engineer` | Owns the procedure; executes once FU-A11 exists and has been verified |
| Named break-glass investigators | Only via the **FU-A11** credential, time-bound and approved — not via standing human DBA access (C-16(c) preference) |

### Honest prerequisite — FU-A11 does not exist yet

ADR-0006 §16.6 **FU-A11**: *“Read-only investigative credential against both stores, scoped to the two trails, for whoever executes the AUD-8 runbook.”* Owners: `cloud-infrastructure-architect` + `database-architect`, verified `security-engineer`.

**Until FU-A11 exists, this runbook is documentation only.** Condition §16.5 item 2: the runbook must be written against R-1’s shape *and* FU-A11 must be in place **before the runbook is relied on**. Writing ≠ executable.

Also not ready for live reconstruction:

- Migrations **032** and **033** are **written, not applied** (ADR-0006 §16.8). Without them, Trail A lacks `actor_session_id`, `actor_service`, `audit_request_id`, `result_count`, `privileged_bulk_access` / `privilege_granted` enum values, and `account_audit_log_actor_created_at`.
- **Trail B** (`admin_access_log`) is **paper design only** — no collection, no writer, no Feature 004 admin route (`/admin/policies*`, `/admin/assets*`) ([`database-addendum-001.md`](../../features/004-policy-asset-management/database-addendum-001.md) Amendment A1). Mongo queries below are design-faithful against A1 / R-1; they will fail until the collection is created. *(`cto` 2026-08-11: narrowed from "no `/admin/*` route exists on the platform" — **Trail A now has one**, `GET /v1/admin/accounts`, writing per-subject + call-scoped rows. The Postgres queries below have real data to return; the Mongo ones do not.)*

---

## 4. Trails and schemas (truth as of this filing)

### Trail A — Postgres / Supabase — `app.account_audit_log`

**Implementation truth:** `backend/migrations/032_adr0006_audit_event_types.sql`, `backend/migrations/033_adr0006_audit_correlation_columns.sql`, `backend/src/repositories/audit-log.ts` (`record`, `recordBulkDisclosure`).

Relevant columns for reconstruction:

| Column | Role |
|---|---|
| `account_id` | Subject (whose data) |
| `actor_account_id` | Acting account |
| `actor_service` | Acting service (internal callers; no session) |
| `actor_session_id` | Sitting key (AUD-1) |
| `audit_request_id` | Server-only request id (AUD-5) — **not** the cross-store join key today |
| `event_type` | Discriminator (see §5) |
| `result_count` | On `privileged_bulk_access` only (including 0) |
| `ip_address`, `user_agent`, `created_at`, `legal_hold` | Context / retention |

Indexes this runbook cites (post-033):

- Subject-keyed: `account_audit_log_account_id_created_at` on `(account_id, created_at desc) where account_id is not null` — created by migration `034` (FU-A13, applied 2026-08-11).
- Purge scan: `account_audit_log_created_at` on `(created_at) where legal_hold = false` — same migration. Retention is still **not enforced** until something schedules `app.purge_expired_audit_log()` (FU-A13 scheduling half).
- Actor-keyed: `account_audit_log_actor_created_at` on `(actor_account_id, created_at desc)` where `actor_account_id is not null` (033; replaces 031’s `account_audit_log_actor_account_id`)

### Trail B — MongoDB — `admin_access_log` (**design only**)

**Design truth:** [`database-addendum-001.md`](../../features/004-policy-asset-management/database-addendum-001.md) Amendment **A1** (FU-A2 discharged 2026-08-11; R-1 shape in §1.2–§1.3).

| Field | Trail A analogue |
|---|---|
| `targetAccountId` | `account_id` |
| `actorAccountId` | `actor_account_id` |
| `actorSessionId` | `actor_session_id` |
| `auditRequestId` | `audit_request_id` |
| `eventType` | `event_type` |
| `resultCount` | `result_count` |
| `endpoint`, `resourceType`, `resourceId` | (Trail A has no resource concept) |
| `createdAt`, `legalHold`, `ipAddress`, `userAgent` | same semantics |

**Semantic note (A1):** on Trail B, `resultCount` is **documents returned in the page** (policies/assets). Distinct subjects = count of sibling `privileged_data_access` docs. On Trail A, list results *are* accounts, so `result_count` equals distinct-subject count (`recordBulkDisclosure`).

---

## 5. Event types — RR-4 filter (real column, not a heuristic)

| `event_type` / `eventType` | Meaning | In subject-keyed “who looked at this customer”? | In actor-keyed “what did this admin do”? |
|---|---|---|---|
| `privileged_data_access` | Disclosure of a subject’s data (detail **or** bulk-derived per-subject row) | **Yes** — filter `account_id` / `targetAccountId` | **Yes** |
| `privileged_bulk_access` | Call-scoped list attempt; `account_id`/`targetAccountId` null; carries `result_count` | **No** — never a disclosure record | **Yes** (shows the list *call*, not a subject) |
| `privilege_granted` | Privilege-*granting* (e.g. invitation issuance) — **not** a data read (R-2 / FU-A9 discharged) | **No** | **Yes** when investigating *grants*, not access |

**RR-4 closed structurally (R-2):** exclude privilege-granting noise with:

```text
event_type = 'privileged_data_access'     -- subject-keyed disclosure queries
-- NEVER: account_id is null and actor_account_id is not null
```

The null-subject heuristic was used **once**, in migration 033’s one-time reclassification of historical invitation rows to `privilege_granted`. It must **never** be reused in this runbook or in investigation SQL (033 header).

Trail B has no `privilege_granted` today (no invitation-class write in that domain). Filter Trail B subject queries on `eventType: "privileged_data_access"` anyway so bulk call-scoped docs cannot be miscounted.

---

## 6. Interpreting bulk disclosures (R-1)

Chosen shape (033 header / ADR-0006 §16.1):

1. **One `privileged_data_access` row per distinct disclosed subject** — same shape as a detail read; subject-keyed index answers without array containment. There is **no** `disclosed_account_ids` / `targetAccountIds` column and there will not be under this ADR.
2. **Plus one `privileged_bulk_access` row** with `result_count` set, **including zero**, so empty filtered lists remain reconstructible (compliance §14.5.5).

Writer: `recordBulkDisclosure()` inserts the call-scoped row and all subject rows in **one** multi-row `INSERT`. Trail B design: one `insertMany()` of N+1 documents (A1 §1.2.6).

**How to read results:**

- Count **accesses to customer X** → only `privileged_data_access` rows where subject = X. Do **not** count `privileged_bulk_access`.
- Reconstruct **list-call attempts** (including empty) → `privileged_bulk_access` by actor/session/time; optionally join siblings via shared `audit_request_id` / `auditRequestId` when present (best-effort; sitting remains authoritative — RR-1).
- `result_count = 0` means “list ran, disclosed nobody” — keep it; do not drop it from actor-keyed timelines.

---

## 7. Direction 1 — Subject-keyed (“every privileged access to customer X”)

**Inputs:** subject account id `$1` / `X`, window `$2`–`$3` / `T1`–`T2` (inclusive UTC).

### 7.1 Trail A (Postgres)

```sql
-- Uses account_audit_log_account_id_created_at
-- R-1: subject is always account_id on privileged_data_access (no array column)
select
  created_at,
  event_type,
  account_id          as subject_account_id,
  actor_account_id,
  actor_service,
  actor_session_id,
  audit_request_id,
  result_count,       -- null on disclosure rows; present only if a bulk row slipped in (should not)
  ip_address,
  user_agent,
  legal_hold
from app.account_audit_log
where event_type = 'privileged_data_access'   -- RR-4 / R-2: excludes privilege_granted
  and account_id = $1::uuid                   -- never: or $1 = any(disclosed_account_ids)
  and created_at >= $2::timestamptz
  and created_at <= $3::timestamptz
order by created_at desc;
```

Optional companion (list *attempts* that disclosed this subject appear only via the per-subject rows above; to list call-scoped siblings in the same sitting, use Direction 2 or group by `actor_session_id` then fetch bulk rows for that session):

```sql
-- Call-scoped bulk rows for sessions that touched this subject (optional enrichment)
select b.*
from app.account_audit_log b
where b.event_type = 'privileged_bulk_access'
  and b.actor_session_id in (
    select distinct actor_session_id
    from app.account_audit_log
    where event_type = 'privileged_data_access'
      and account_id = $1::uuid
      and created_at >= $2::timestamptz
      and created_at <= $3::timestamptz
      and actor_session_id is not null
  )
  and b.created_at >= $2::timestamptz
  and b.created_at <= $3::timestamptz
order by b.created_at desc;
```

### 7.2 Trail B (MongoDB — design)

```javascript
// Paper design only — collection may not exist.
// Partial index intended: { targetAccountId: 1, createdAt: -1 } where targetAccountId != null
db.admin_access_log.find({
  eventType: "privileged_data_access",  // excludes privileged_bulk_access
  targetAccountId: X,                   // R-1: no targetAccountIds array
  createdAt: { $gte: T1, $lte: T2 }
}).sort({ createdAt: -1 });
```

### 7.3 Merge and sitting grouping

1. Normalize field names (`actor_account_id` ↔ `actorAccountId`, etc.).
2. **Join key (AUD-1):** `(subject, actor identity, actor_session_id / actorSessionId, timestamp)`.  
   Prefer grouping by `actor_session_id` / `actorSessionId`. Rows with null session (Trail A service callers via `actor_service`) form a separate “service actor” bucket — not a human sitting.
3. Within a sitting, order by timestamp. **Cross-store interleaving within ±5 seconds is not assertable** (AUD-6 / RR-2). Do not claim “admin viewed identity *before* policy” unless the gap exceeds 5s or a future single-request dual-write shares `auditRequestId` (AUD-9 growth rule — **not** true for the current endpoint set).
4. One group = one admin **sitting** against this customer (RR-1: session grain, not tab grain).

`audit_request_id` / `auditRequestId` may match **within** one trail for one list call’s N+1 rows. Under the current endpoint set it will **not** equal a value in the other store (ADR-0006 §2.2 / 033 column comment). Do not treat it as a cross-store join.

---

## 8. Direction 2 — Actor-keyed (“everything admin Y looked at / did”)

**Inputs:** actor account id `$1` / `Y`, window `$2`–`$3` / `T1`–`T2`.

### 8.1 Trail A (Postgres)

```sql
-- Uses account_audit_log_actor_created_at (033)
select
  created_at,
  event_type,
  account_id          as subject_account_id,  -- null on privileged_bulk_access and privilege_granted
  actor_account_id,
  actor_service,
  actor_session_id,
  audit_request_id,
  result_count,       -- set only on privileged_bulk_access
  ip_address,
  user_agent,
  legal_hold
from app.account_audit_log
where actor_account_id = $1::uuid
  and event_type in (
    'privileged_data_access',
    'privileged_bulk_access',
    'privilege_granted'         -- include when investigating grants; drop if only "looked at"
  )
  and created_at >= $2::timestamptz
  and created_at <= $3::timestamptz
order by created_at desc;
```

**Access-only variant** (subject-keyed twin for an actor timeline):

```sql
where actor_account_id = $1::uuid
  and event_type in ('privileged_data_access', 'privileged_bulk_access')
  -- omit privilege_granted
```

Service-to-service attribution (no admin account):

```sql
where actor_service = $service_name
  and event_type in ('privileged_data_access', 'privileged_bulk_access')
  and created_at >= $2::timestamptz
  and created_at <= $3::timestamptz
order by created_at desc;
```

### 8.2 Trail B (MongoDB — design)

```javascript
// Index intended: { actorAccountId: 1, createdAt: -1 }
db.admin_access_log.find({
  actorAccountId: Y,
  eventType: { $in: ["privileged_data_access", "privileged_bulk_access"] },
  createdAt: { $gte: T1, $lte: T2 }
}).sort({ createdAt: -1 });
```

### 8.3 Merge and sitting grouping

1. Union Trail A + Trail B rows for actor Y in the window.
2. **Group by `actor_session_id` / `actorSessionId`.** Each group is one sitting’s activity across both domains (identity reads in A, policy/asset reads in B).
3. Inside a sitting, list subjects disclosed (`privileged_data_access`) separately from list-call envelopes (`privileged_bulk_access` + `result_count`) and grants (`privilege_granted`).
4. Apply the same ±5 s cross-store ordering caveat.

---

## 9. Append-only posture — AUD-11: checked, not enforced

Until **FU-A10** (deploy-time / CI assertion that the runtime credential is refused `UPDATE`/`DELETE` on both trails) and the underlying least-privilege roles (SR-3 Postgres; FU-A6 Mongo) exist:

- AUD-11 is **checked** (described and owned) — **never “enforced”** in any report, ticket, or regulator-facing statement (cto §16.5 item 3).
- Today `SUPABASE_DB_URL` remains the project superuser (RR-6 / SR-3 open). Trail B has no collection-level role split yet.
- Investigators using FU-A11 (when it exists) get **read-only** on the two trails. Do not use a credential that can mutate evidentiary rows to “just run the runbook.”

---

## 10. Failure modes — what not to do

| Prohibited | Why |
|---|---|
| Paste verbatim query filters, search terms, emails, VINs, or device serials into tickets or chat | **C-17** — those values are often third-party PII; trails must not record them, and investigation notes must not reintroduce them. Record *which fields* were filtered if needed, never their values. |
| Treat a client-supplied `x-request-id` / `req.requestId` as correlation evidence | **AUD-4 / AUD-5** — only `audit_request_id` / `auditRequestId` (server-generated) may appear in trails; even then it is not today’s cross-store join key. |
| Invent or accept caller-supplied `actor_session_id` / `actorSessionId` | Join keys are server-derived from the verified token only. |
| Count `privileged_bulk_access` as a subject access | R-1 — call-scoped rows are not disclosures. |
| Use `account_id is null and actor_account_id is not null` as the RR-4 filter | Fragile; superseded by `event_type = 'privilege_granted'` (R-2). |
| Assert cross-store order inside ±5 s | AUD-6 / RR-2. |
| Claim Trail B data exists, or that `/admin/*` wrote it | Collection/writer/routes are paper design only (§16.8). |
| Run reconstruction with application write credentials or undocumented DBA access | Wait for FU-A11; C-16(c). |
| Describe AUD-11 as enforced | Wait for FU-A10 (§9). |
| Ship trail copies to a third-party SIEM as the correlation mechanism | AUD-9 prohibition until a reviewed SIEM exists. |

**Investigation notes hygiene:** store subject/actor UUIDs and sitting ids in the case file; summarise findings without replaying admin search strings.

---

## 11. Preconditions checklist (before relying on a live run)

- [ ] Migrations **032** and **033** applied to the target Supabase project (and constraints reviewed / optionally `VALIDATE`d per 033 footer — `security-engineer` call).
- [ ] Audit writer emitting AUD-1 fields and `recordBulkDisclosure` on any live bulk admin list (FU-A3).
- [ ] Trail B collection created per A1 **and** writers live on admin policy/asset reads (Feature 004) — otherwise Direction 1/2 Trail B halves are empty by design, not by innocence.
- [ ] **FU-A11** read credential provisioned and verified (`security-engineer`).
- [ ] Retention window understood: both trails **12 months** unless a documented asymmetry exists (AUD-7(a); FU-A8 discharged at §14.9). Reconstruction only possible inside `min(A, B)`.
- [ ] Cross-store legal hold process (C-13 / FU-A7) followed if rows must be preserved.

---

## 12. Discharge status (FU-A4)

| Item | Status |
|---|---|
| Runbook filed at `docs/organization/runbooks/` | **Done** (this document) |
| Both directions (subject ↔ actor) | **Done** |
| Sitting grouping via `actor_session_id` / `actorSessionId` | **Done** |
| R-1 bulk shape (per-subject + `result_count` call row) | **Done** — matches 033 / `recordBulkDisclosure` |
| RR-4 via real `event_type` (`privilege_granted` excluded from subject-keyed access queries) | **Done** |
| C-17 / AUD-4 failure modes | **Done** |
| AUD-11 “checked vs enforced” until FU-A10 | **Done** |
| Production executability | **Blocked on FU-A11** (and on 032/033 apply + Trail B existence for a complete cross-store answer) |

**FU-A4 (document):** discharged.  
**FU-A4 as an operable control before first production privileged account:** still blocked on **FU-A11** per §16.5 item 2 / §16.6.

## 14. Chain-check — was a `privileged_state_change` row actually applied? (ADR-0006 §18.8 C-C / SR-009S-7)

**Added 2026-10-08 by `security-engineer`, closing SR-009S-7**
(`docs/features/009-customer-experience-redesign/security-review-security-operations.md` §8).
This section is additive — §1–§12 above (disclosure reconstruction) are unchanged and this does
not reopen or restate them. It documents the decision-record half of AUD-8 that ADR-0006 §18.8
introduced after this runbook was first filed: `privileged_state_change` rows (Security Company
Dashboard case claim/status-transition audit, `backend/src/repositories/admin-access-log.ts`
`recordStateChange()`) are written **before** the compare-and-set mutation they describe, not
inside a transaction with it (§18.8 ruling (b)). That ordering is only safe because a row's
truth can be checked after the fact. This section is that check.

### 14.1 Why this exists

AUD-10's "no privileged effect without a record" principle is read, for a state change, as
"before the effect" = "before mutating" (§18.8(b)). That makes the audit row and the mutation two
separate writes with no multi-document transaction between them (C-D names the triggers that
would make a transaction mandatory; none has tripped yet). A row can therefore exist whose
mutation never took effect — a crash between the audit write and the compare-and-set call, or
(the far more common case) the compare-and-set itself missing because a concurrent writer moved
the document first (`security-cases.ts`'s claim/PATCH handlers, exactly the race
`security-cases.test.ts:978-1025` exercises). An unverifiable "operator closed case C" row is
misleading evidence, not just stale data, so the chain-check below is required, not optional.

### 14.2 The applied-iff rule (verbatim from ADR-0006 §18.8 C-C)

> A `privileged_state_change` row records an authorised transition that was committed to, and it
> was **applied if and only if** one of these holds: the next row for the same `resourceId` has
> `fromStatus` equal to this row's `toStatus`, **or** this is the latest row and the case's
> current `status` equals its `toStatus`.

Restated operationally, for a given `privileged_state_change` row R on case C:

1. Fetch every `privileged_state_change` row for C (`resourceType: 'recovery_case'`,
   `resourceId` = C's `_id`), ordered by `createdAt` ascending.
2. If R has a successor row N in that ordering: R is **applied** iff `N.fromStatus ===
   R.toStatus`. (If they differ, R's compare-and-set missed — some other write, not the one R
   describes, is what actually changed C's status between R and N.)
3. If R is the last row in that ordering (no successor yet): R is **applied** iff `C.status ===
   R.toStatus`, read from the case document itself (`recovery_cases` collection) at chain-check
   time.
4. A row that fails its check is not proof of a security breach by itself — it is proof the
   audited transition did not take effect. Compare-and-set misses (lost races, §14.4) and
   process crashes between the audit write and the mutation (§18.8(b)) produce the identical
   signature: a broken chain. The chain check cannot distinguish the two causes; it only proves
   one of them happened. Distinguishing them (if ever required) needs application logs or
   process-restart evidence from the same time window — out of scope for this runbook.

This rule is **per case** (`resourceId`), not per actor or per session — it says nothing about
*who* a row belongs to, only whether *that case's* documented transition happened. It is a
different axis from §7–§8's subject-keyed/actor-keyed disclosure reconstruction above and is run
separately.

### 14.3 Chain-check query

**Inputs:** case id `$1` / `C` (the `recovery_cases._id`, a Mongo `ObjectId`).

```javascript
// Uses admin_access_log_resourceType_resourceId_createdAt_partial
// (backend/src/db/feature004-collections.ts FEATURE004_INDEXES.adminAccessLog) —
// without it this is a collection scan, which is exactly what SR-009S-7 required
// an index to avoid.
const rows = await db.admin_access_log
  .find({
    resourceType: 'recovery_case',
    resourceId: C, // ObjectId, not the :caseId path string — AUD-4/§18.8(a)(1)
    eventType: 'privileged_state_change',
  })
  .sort({ createdAt: 1 })
  .toArray();

// §14.2 step 2–3, applied in order:
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const next = rows[i + 1];
  const applied = next
    ? next.fromStatus === row.toStatus
    : (await db.recovery_cases.findOne({ _id: C }))?.status === row.toStatus;
  // record `applied` per row; do not discard rows that fail the check — see §14.4.
}
```

Do not add a `$limit` to the sort — the rule needs every row for the case, not a recent window,
because a crash that produced a dangling row can be arbitrarily old if nobody has run this check
since.

### 14.4 Known-good worked example (the SR-009S-4/SR-009S-7 race test)

`backend/src/routes/security-cases.test.ts` — *"a PATCH that races a concurrent status change
returns 404, not 2xx, and leaves the case at the post-race status"* (around line 978) is the
chain-check's worked example, not just a route-level regression test:

- The case pre-read observes `status: 'investigating'`.
- A concurrent writer moves the case to `'tracking'` before the PATCH handler's compare-and-set
  runs.
- The handler audits one `privileged_state_change` row — `fromStatus: 'investigating'`,
  `toStatus: 'recovered'` — then its own compare-and-set (`status: 'investigating'`) misses,
  because the document is now at `'tracking'`. The route returns 404, never 2xx.
- Applying §14.2 to the resulting state: this row is the only (hence latest) row for the case, so
  the rule compares the case's current status (`'tracking'`, left exactly where the race left it)
  against the row's `toStatus` (`'recovered'`). They differ → **the chain check correctly marks
  this row as not applied** — matching reality: the audited transition to `'recovered'` never
  took effect.

This confirms the rule behaves correctly on the one race scenario the test suite already
exercises end to end. A dedicated chain-check unit test against the repository layer was
considered (per the Stage 8 review's invitation to use judgment on this) and not added in this
pass: the rule itself is a three-line read-after-query comparison with no independent
implementation in `backend/src/` to regress — adding one here would be asserting the rule
document matches itself, not catching a real defect. If the chain-check query above is ever
promoted from "runbook" to actual code (a scheduled job, an admin tool), that implementation
needs its own unit tests against this worked example and the obvious "two consecutive rows for
the same case" / "single unambiguously-applied row" cases — tracked as a follow-up if and when
C-D(iii) ("the chain check finds an unexplained break in production") becomes something anyone
actually runs on a schedule, rather than a manual investigative procedure like the rest of this
document.

### 14.5 Preconditions and failure modes specific to this check

- Same FU-A11 investigative-credential prerequisite as §11/§3 — this is still a manual
  investigative procedure, not an automated job, and the same "do not invent access grants" rule
  applies.
- `resourceId` must be read from the stored row, never re-derived from a request path parameter —
  AUD-4, already enforced at write time (§18.8(a)(1)) and worth re-checking at read time if this
  is ever scripted.
- **RR-009S-1 limits what a broken chain can tell you with more than one partner organisation.**
  Per the Stage 8 review (§4): in a cross-org claim race, rows can be written in the opposite
  order from the mutations, and `admin_access_log` carries no partner-organisation field today
  (A-3, open advisory) to resolve which org's row the applied transition actually belongs to. For
  the single-partner pilot this cannot happen. It becomes live the moment a second partner
  organisation is onboarded (C-D(ii)), which is also the trigger that makes transactions
  mandatory and would retire this manual chain-check path for new writes.
- A broken chain found during a live investigation is itself a C-D(iii) trigger (ADR-0006 §18.8):
  finding one in production requires revisiting whether transactions are now mandatory, not just
  noting the one row.

