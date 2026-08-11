# Feature 004 — Policy, Subscription & Asset Management
## Database Design Addendum 001 — Stage 6 (formalizing Stage 7's flagged gap)

**Lifecycle stage:** 6 — Database Design (addendum, produced after Stage 7 flagged a gap against the Stage 6 baseline).
**Author:** `database-architect`
**Formalizes:** [`api-design.md`](./api-design.md) §3.1, §4.4, §6.3 — the `admin_access_log` collection that document proposed in illustrative document-shape form and explicitly declined to self-schema, per its own framing ("mirroring the precedent `001-authentication/api-design.md` §3 set — propose column/collection shapes for `database-architect` to formalize, write no schema unilaterally") and its P-13 open item ("`admin_access_log` collection — formalize DDL/indexing, and rule Postgres-vs-MongoDB for where it lives... `database-architect`").
**Amends:** [`database-design.md`](./database-design.md) (Stage 6 baseline). This is an **addendum, not a replacement** — the baseline's `policies`, `policy_status_history`, and `assets` collections, their indexes, validators, retention posture (§7), and migration plan (§9) are unchanged and remain in force. This document adds exactly one collection the baseline did not define.

**Amendment A1 — ADR-0006, 2026-08-11.** [ADR-0006](../../organization/adr/0006-privileged-access-audit-correlation.md) (*Privileged-Access Audit Trails Across Two Data Stores*, **ratified by `cto` 2026-08-11, §16, with rulings R-1 … R-5**) postdates this document and lands directly on this collection. **FU-A2 is this role's follow-up and this amendment discharges it.** Four substantive changes — `actorSessionId` (AUD-1), `auditRequestId` (AUD-5), AUD-3(b)'s bulk-disclosure shape in the form ruling **R-1** closed, and the **12-month retention period** `compliance-specialist` ruled at §14.2/§14.9 — plus consequential updates to the validator (§1.3), the AUD-11 role split (§1.4), the indexing strategy (§2), the migration list (§4), and the checklist (§6). Amended text is marked **[A1]** throughout; superseded text is marked as superseded rather than deleted, so this document keeps reading as a record of what was decided when. This amendment does **not** reopen §1.1's storage-location ruling — ADR-0006 §10 explicitly concurs with it, on its own three reasons plus a fourth (fail-closed affordability) it did not claim.

**Status:** **Paper design**, same posture as the baseline and as Feature 001's own addendum. Nothing below has been executed against a live database. Precisely, as of this amendment: **no `admin_access_log` collection, no writer, and no Feature 004 admin route (`/admin/policies*`, `/admin/assets*`) exists** — so AUD-3(b) has no live bulk call site *on this trail* and the machinery here is deliberately ahead of the endpoint. **[`cto`, 2026-08-11]** This sentence originally read "no `/admin/*` route exists anywhere on the platform," citing ADR-0006 §16.8. That became false later the same day: `GET /v1/admin/accounts` now exists and calls `recordBulkDisclosure()` on **Trail A** (ADR-0006 §17.7). Narrowed to what is still true — the claim about *this* collection is unaffected. A MongoDB client *is* wired up (`backend/src/db/mongodb.ts`, used only by the readiness/liveness probes in `routes/health.ts`) — this amendment adopts `security-engineer`'s correction (ADR-0006 §15) that the earlier phrasing "no MongoDB cluster exists yet" was stale and would mislead a reader into thinking Mongo is unwired when it is; what does not exist is this collection and everything that would write to it.
**Reviewers required before this is treated as final (not self-certified here):** `backend-architect` (confirms this collection's shape matches `api-design.md` §3.1's proposal, as amended by ADR-0006 R-1, and that §4.4/§6.3's write-one-entry-per-admin-read obligation is satisfiable against it — **the write contract changed under A1**: a list call now writes N+1 documents, not one); `cybersecurity-architect`/`security-engineer` (per `api-design.md` P-13's second half — this document rules the MongoDB-vs-Postgres storage-location question itself, within this role's schema authority, but the field-sensitivity/access-control review of the result is still theirs to perform, not self-certified here; **AUD-12 discharges part of it for this collection, see §6**). **`compliance-specialist`'s review of the retention period is no longer outstanding** — ruled at ADR-0006 §14.2, recorded at §3.3 below.

---

## 0. What this addendum resolves, and what it carries forward unchanged

**Resolves:**
- Formal MongoDB collection shape, `$jsonSchema` validator, and indexing for `admin_access_log` (§1–§2 below), matching `api-design.md` §3.1's proposed document shape **as amended by ADR-0006 [A1]**.
- The storage-location question `api-design.md` §3.1 explicitly left open ("Postgres in Supabase... versus this MongoDB collection... not decided here, flagged for `database-architect`") — resolved in §1.1 below, within this role's final authority over MongoDB schema design and consistent with `backend-architect`'s own stated reason for proposing the MongoDB shape in the first place. **[A1] Concurred by `cybersecurity-architect` and ratified: ADR-0006 §10 ("`database-addendum-001.md` §1.1's MongoDB ruling stands, and I concur with it").**
- Retention and TTL-vs-scheduled-purge mechanics for this specific collection (§3), applying — not re-deriving — the reasoning `database-design.md` §7 already established for the baseline's collections.
- **[A1] The retention *period*: 12 months**, ruled by `compliance-specialist` at ADR-0006 §14.2/§14.9 (which discharges FU-A8 and accepts this document's own §3.3 recommendation on its own reasoning). Recorded at §3.3, which no longer carries it as open.
- **[A1] This collection's half of ADR-0006's platform join key** — `actorSessionId` (AUD-1) and `auditRequestId` (AUD-5) — and **AUD-3(b)'s bulk-disclosure shape in the form `cto` ruling R-1 closed** (§1.2, §1.3). This is FU-A2. Trail B is now symmetric with Trail A as implemented in `backend/migrations/033` and `backend/src/repositories/audit-log.ts`.

**Carries forward, unchanged:**
- Every table/collection, index, validator, and migration step in the Stage 6 baseline. This document does not reopen `policies`, `policy_status_history`, or `assets`. **[A1] Amendment A1 does not reach them either** — it touches exactly one collection, the one this addendum introduced.
- The baseline's retention *mechanism* (scheduled purge job honoring `legalHold`, no TTL on transactional/evidentiary collections) — §3 below applies that exact mechanism to a new collection rather than inventing a second one.

**Still open (revised at [A1] — two items closed, five added, all with named owners elsewhere):**
- ~~The actual retention *period* for `admin_access_log`~~ — **closed [A1]**: 12 months, ADR-0006 §14.2, recorded at §3.3.
- Field-sensitivity/access-control review of this collection (`api-design.md` P-14-class gap, extended to this new collection) — **partially discharged [A1]** by ADR-0006 **AUD-12** for `ipAddress`/`userAgent` on this collection only; the access-control half (who may *read* this trail) is explicitly not designed anywhere yet and remains open. See §6.
- **[A1] AUD-11's MongoDB role split is defined here but not enforced anywhere** — no cluster-side role exists (FU-A6, this role + `cloud-infrastructure-architect`, verified `security-engineer`). Per ADR-0006 §16.5 condition 3, AUD-11 is described as *checked*, never *enforced*, until FU-A10 exists. §1.4, §6.
- **[A1] C-13's cross-store legal-hold requirements land partly on this role** — a resolvable hold reference rather than a bare boolean, a purge/hold interlock, and rows-skipped-for-hold in the purge run record. Go-live blocker, not a Stage 8 blocker; deliberately **not** designed here because the hold register it must resolve against does not exist. §3.2.
- **[A1] There is no `retention_purge_runs`-equivalent collection and no purge job** for any collection in this domain — unchanged from the original §3.2, but now with a ruled cutoff, so the job is buildable where before it was blocked.
- **[A1] Whether bulk-derived per-subject rows should also name the individual documents disclosed** (`resourceIds`) rather than only the subject — decided *not* to, with reasoning and a named trigger at §1.2. Flagged for Stage 8 reviewers as a decision, not an oversight.
- Whether this collection should ever feed a cross-domain compliance view alongside Feature 001's `account_audit_log` — **[A1] answered by ADR-0006**: yes, as an application-layer read across two stores on the AUD-1 join key, executed as `security-engineer`'s AUD-8 runbook ([`aud-8-privileged-access-reconstruction.md`](../../organization/runbooks/aud-8-privileged-access-reconstruction.md) — FU-A4 discharged 2026-08-11; not executable until FU-A11). Not a schema question and not a unified store. §1.1.

---

## 1. `admin_access_log` — collection design

### 1.1 Why MongoDB, not Postgres — resolving `api-design.md` §3.1's flagged question

**Ruling: MongoDB, domain-owned by Policy & Asset Service, not a Supabase/Postgres table.** Three reasons, none of which `api-design.md` §3.1 was in a position to rule on its own (it correctly deferred rather than picking a schema unilaterally), but which are squarely this role's call:

1. **It avoids exactly the synchronous cross-store dependency `api-design.md` §2/§4.3 built the entire read path to avoid.** Every admin policy/asset read (`GET /v1/admin/policies`, `/admin/policies/{id}`, `/admin/assets`, `/admin/assets/{id}`) already trusts the bearer token's claims and touches only MongoDB (§4.3: "every `GET` endpoint... trusts the bearer token's claim set"). Writing the mandatory audit entry (§4.4) to a Postgres table would mean every one of those reads takes a new, synchronous, cross-service write dependency on Supabase's availability — a real regression against a document that otherwise went out of its way to keep this domain's read path independent of Identity Service's network reachability (ADR-0002; §2's "this service never writes to Supabase and holds no Supabase credential").
2. **Consistency with what this collection actually is: an append-only history collection for this domain's own data, structurally identical to `policy_status_history`.** Both record "what happened to a policy/asset-adjacent thing, by whom, when" — `policy_status_history` for state transitions, `admin_access_log` for privileged reads. Same shape of problem (§1.2 below deliberately mirrors `policy_status_history`'s own actor/subject/reason/timestamp pattern), same collection family, no reason to split the read-audit half of "things that happen to policies and assets" into a different database technology than the write-audit half.
3. **One place, not two, to reconcile "who touched this specific policy or asset."** An admin investigating "what happened to account X's vehicle policy" today already queries `policies`, `policy_status_history`, and `assets` in MongoDB. Putting `admin_access_log` in the same store means that reconstruction is one database's queries, not a MongoDB query plus a separate Postgres query joined at the application layer against `resourceId`s Postgres has no native concept of.

**[A1] Ratification note.** ADR-0006 §3 rejected merging the two trails into one store and §10 records that this section's ruling stands, adding a fourth reason this document did not claim and which is stronger than the availability argument it did make: **co-locating the trails is what would make AUD-10's fail-closed audit write unaffordable.** If Trail B lived in Postgres, `GET /v1/admin/policies` would fail closed on *Supabase* availability — an admin policy read taking down on an outage in a store it otherwise never touches — and the only alternative would be failing open and serving customer data with no audit record. Keeping each trail in the store that holds the data it describes is what makes the strong audit-integrity ruling cheap. That reasoning is now platform precedent (ADR-0006 §16, R-5) and is inherited by name by the future GPS location-access trail (AUD-9's third-trail rule), so it should not be re-litigated collection by collection.

**What this does not decide:** whether Identity-Service-side privileged access (Feature 001's own `privileged_data_access` event type, SR-10) should ever be unified into one platform-wide "who-accessed-what" view. That is a real, larger question — `backend-approach.md` §5.2 named the structurally identical dilemma for Feature 001's own audit log and left it open; this document does the same here, deliberately, rather than pretending a two-collection-in-two-databases platform audit story is fully coherent. If a unified cross-domain audit view is ever required (e.g., a compliance dashboard reconstructing "everything admin Y did today across both Identity and Policy/Asset services"), that is an application-layer read across two stores, keyed on `actorAccountId`, which both collections already carry identically-shaped — not a reason to force one collection into the other's database now.

**[A1] Answered, and this document's answer was necessary but not sufficient.** ADR-0006 adopted the application-layer-read shape proposed above (§4: *"that is the right shape"*) and then corrected it on a point this document got wrong by omission: **`actorAccountId` alone does not identify the unit of reconstruction.** The unit is *one admin sitting against one customer*, and the key is `(subject account id, actor identity, actor session id, timestamp within ±5 s)` — AUD-1. Neither trail carried a session id, so the correlation this section described as already possible was not. That is what §1.2's `actorSessionId` fixes, and it is why FU-A2 was a Feature 004 Stage 8 blocker until this amendment discharged it. Two consequences worth carrying here rather than leaving in the ADR:

- **Correlation is sitting-level, not action-level** (ADR-0006 RR-1, accepted with a stated bound). Grouping by `actorSessionId` is what makes one group one sitting. A finer grain would require a client-supplied identifier, which AUD-4 prohibits outright: an insider who can choose their own correlation id can split one sitting into unrelated ids or merge their activity into a colliding one. **Every correlation field on this collection is server-derived, and that is a hard property, not a default.**
- **Cross-store ordering is asserted only to ±5 s** (AUD-6/RR-2 — two stores, two clocks). Ordering *within* this collection remains exact. A reconstruction must not claim finer cross-store interleaving than that, and if such a requirement ever appears the answer is a monotonic sequence issued by one store, not a tighter clock.

### 1.2 Document shape

**[A1] Amended by ADR-0006.** The shape below supersedes the original. Three fields are added (`eventType`, `actorSessionId`, `auditRequestId`, plus `resultCount` on one row type), and one field's meaning is materially narrowed (`targetAccountId`). The original single-document-per-call shape, and the reasoning for the two fields this document added on its own authority, are retained below so the diff is legible rather than silently rewritten.

Mirrors `policy_status_history`'s own actor/subject/reason/timestamp shape (`database-design.md` §3.2), `api-design.md` §3.1's proposed fields, and — from [A1] onward — **`app.account_audit_log`'s post-ADR-0006 shape field for field**, deliberately: FU-A2 exists because Trail B was asymmetric with Trail A, and the two trails are merged by hand during an investigation. Field names differ only in case convention (`actor_session_id` / `actorSessionId`), which is the convention split ADR-0002 already imposes on the two stores.

#### 1.2.1 The three documents this collection now holds

Under `cto` ruling **R-1** (ADR-0006 §16.1) a bulk list call no longer writes one document. It writes **one document per distinct disclosed subject, plus one call-scoped document.** All three shapes below are the same field set; only which fields are populated differs, and the discriminator is `eventType`.

**(1) Detail read** — `GET /v1/admin/policies/{policyId}`, `GET /v1/admin/assets/{assetId}`. One document, unchanged in substance from the original shape apart from the three new correlation fields:

```jsonc
// Collection: admin_access_log
{
  _id: ObjectId,
  eventType: "privileged_data_access",   // [A1] "privileged_data_access" | "privileged_bulk_access" — same two values as app.audit_event_type carries on Trail A (migrations/032)
  actorAccountId: "b3f1c2a4-...",   // soft reference to Supabase app.accounts.id (the admin who performed the read) — same cross-store pattern as accountId elsewhere in this domain, see database-design.md §4
  actorSessionId: "9f2c8d10-...",   // [A1] AUD-1. Soft reference to Supabase app.sessions.id — the "sitting" element of the join key. Required, never null.
  auditRequestId: "3b71e0a2-...",   // [A1] AUD-5. Server-generated per request; nullable, non-evidentiary, NOT the cross-store join key.
  targetAccountId: "c9e2d1b7-...",  // [A1] soft reference; the disclosed subject. Non-null on every privileged_data_access document — see 1.2.3.
  resourceType: "policy",            // "policy" | "asset"
  resourceId: ObjectId,               // real, same-database reference to policies._id or assets._id (per resourceType) — existence-checkable, unlike the accountId fields above
  resultCount: null,                  // [A1] R-1. Null on this row type; carried only by the call-scoped row below.
  endpoint: "GET /v1/admin/policies/{policyId}",  // literal method+path TEMPLATE, same convention as app.idempotency_keys.endpoint (001-authentication) — never the resolved URL, see 1.2.5
  ipAddress: "203.0.113.4",
  userAgent: "...",                   // ADDED beyond api-design.md §3.1's illustrative shape — see note below
  legalHold: false,                   // ADDED beyond api-design.md §3.1's illustrative shape — see §3
  createdAt: ISODate("2026-08-11T09:14:03.221Z")
}
```

**(2) Bulk disclosure, per subject** — one per *distinct* account id present in the materialised result page of `GET /v1/admin/policies` / `GET /v1/admin/assets`, up to the 200-row `limit` ceiling (`api-design.md` §5). **Shaped exactly as a detail read records it**, which is R-1's whole point: a subject-keyed query needs no knowledge of bulk-vs-detail.

```jsonc
{
  eventType: "privileged_data_access",
  actorAccountId: "b3f1c2a4-...",
  actorSessionId: "9f2c8d10-...",
  auditRequestId: "3b71e0a2-...",   // identical across every document written by this one call
  targetAccountId: "c9e2d1b7-...",  // one of the accounts whose records were actually returned
  resourceType: "policy",
  resourceId: null,                  // the disclosure was a page of records, not one named record — see 1.2.4
  resultCount: null,
  endpoint: "GET /v1/admin/policies",
  ipAddress: "203.0.113.4",
  userAgent: "...",
  legalHold: false,
  createdAt: ISODate("2026-08-11T09:14:03.221Z")
}
```

**(3) The call-scoped row** — exactly one per list call, including a call that returned nothing:

```jsonc
{
  eventType: "privileged_bulk_access",
  actorAccountId: "b3f1c2a4-...",
  actorSessionId: "9f2c8d10-...",
  auditRequestId: "3b71e0a2-...",
  targetAccountId: null,             // deliberate: this document is NOT a disclosure record
  resourceType: "policy",
  resourceId: null,
  resultCount: 47,                   // [A1] R-1 — documents returned in the page, INCLUDING 0
  endpoint: "GET /v1/admin/policies",
  ipAddress: "203.0.113.4",
  userAgent: "...",
  legalHold: false,
  createdAt: ISODate("2026-08-11T09:14:03.221Z")
}
```

#### 1.2.2 What was wrong with the original shape, stated plainly

The original §1.2 recorded `targetAccountId: null` *and nothing else* for an unfiltered list call. ADR-0006 §2.3(3) identified that as a direct, current failure of SR-10's guarantee — *"an admin who pulls an unfiltered `GET /admin/policies` has read hundreds of customers' data and no row says so for any of them"* — and `compliance-specialist` (§14.4) upgraded it from an architecture gap to a **live POPIA s22 incapacity**: on a compromised-admin scenario the platform could not enumerate the affected data subjects, so it could not notify them. The defect was not the null-subject row as such; it is that the null-subject row was the *entire* record of the call. It survives, as document (3), with a narrowed and explicit meaning — **`privileged_bulk_access` documents are not disclosure records and must never be counted as accesses to a subject** (same warning as `migrations/033`'s header comment, deliberately worded identically).

#### 1.2.3 Fields added or re-specified at [A1]

- **`eventType`** — required, `"privileged_data_access" | "privileged_bulk_access"`, the same two values `migrations/032` added to `app.audit_event_type`. This **supersedes the original §1.2's "Not added: an `action` field"** ruling, and the reason that ruling no longer holds is worth recording rather than quietly reversing: it argued `endpoint`'s literal method+path already distinguishes a list call from a detail call. True, and irrelevant now — under R-1 a single list call emits *both* row types with the *same* `endpoint`, so `endpoint` cannot discriminate them. The discriminator is load-bearing: it is what the validator's conditional requirements (§1.3), the subject-side index's partial filter (§2), and the AUD-8 runbook's Trail B query all key on. It is not the speculative field the original paragraph was right to refuse; it is the field that makes three shapes in one collection legible.
- **`actorSessionId`** — required, non-null, string. AUD-1's "sitting" element. A **soft reference to `app.sessions.id`** in Supabase, and deliberately not existence-checked: `app.sessions` cascades from `app.accounts` and has its own open retention question, so the referent will routinely be gone while this row must survive — the identical reasoning that made Trail A's `actor_session_id` carry no foreign key (`migrations/033`'s column comment). Non-null because **every write to this collection originates from a bearer-authenticated admin request**. If a non-session actor (a service, a scheduled job) ever needs to write here, that is a validator amendment **and** a re-threat-model trigger, not a quiet relaxation of `required` — this is the Mongo-side equivalent of the unattributed-service-call problem AUD-2 solved on Trail A with `actor_service`, and this collection has no equivalent column today because no internal service reads this domain's data (ADR-0006 AUD-1, "n/a today").
- **`auditRequestId`** — nullable, not required, string. AUD-5. **Server-generated** (`req.auditRequestId`, `backend/src/middleware/error-handler.ts:56`), never read from a header: AUD-4 prohibits a client-supplied value from being audit-correlation evidence, and `req.requestId` — which SR-18 still lets a caller supply when UUID-shaped — must never be written here. Two honest limits on what this field is:
  1. **It is not the cross-store join key and under the current endpoint set it will never hold the same value in this collection and in `app.account_audit_log`** — no single request writes both trails (ADR-0006 §2.2, re-verified against the tree by `security-engineer` at §15). It is pre-positioned for AUD-9's growth rule, when one request does write both, at which point it becomes an exact join key with no schema change. A future engineer who finds this field in two stores must not conclude that it correlates them.
  2. **Nullable by ADR mandate** (AUD-3(a) specifies it as `["string","null"]`, not required), which means it is the natural *within-call* grouping key — it ties document (3) to its document (2)s — but it is **best-effort, not guaranteed**. The authoritative reconstruction grain remains the sitting (`actorSessionId`), per RR-1. Do not build a query that depends on `auditRequestId` being present.
- **`targetAccountId`** — meaning narrowed. Previously "null for an unfiltered list call"; now **non-null on every `privileged_data_access` document and null on every `privileged_bulk_access` document**, enforced by the validator (§1.3) rather than left to call-site discipline. This is the Mongo-side mirror of `migrations/033`'s `account_audit_log_privileged_access_has_subject` `CHECK`, and it exists for the same stated reason: R-1's guarantee should be structurally impossible to violate, not merely prohibited in prose.
- **`resultCount`** — nullable integer ≥ 0, on the call-scoped row **and only** on it, and **always** on one (both directions, mirroring `account_audit_log_result_count_only_on_bulk`). **Including zero** — `compliance-specialist` §14.5.5 explicitly requires that a list call disclosing nothing still leaves the *attempt* reconstructible, so an implementer must not optimise away the audit write for an empty result. **One semantic divergence from Trail A, stated because it will otherwise be misread:** on Trail A the records returned by `GET /v1/admin/accounts` *are* accounts, so "records returned" and "distinct subjects" coincide and `recordBulkDisclosure()` sets `result_count` to the distinct-subject count. On Trail B they do not coincide — a page of 47 policies can belong to 30 accounts. **`resultCount` on this collection is the number of documents returned in the page**, matching `migrations/033`'s stated semantic ("number of records a bulk/list call returned"); the distinct-subject count is the number of `privileged_data_access` documents written alongside it. Recording both numbers is the point: `resultCount` > subject count is normal and tells an investigator how much was read, not merely from how many customers.

#### 1.2.4 What a bulk-derived per-subject document does *not* record, and why that is a decision

A per-subject document from a list call carries `resourceId: null` — it names the customer whose records were disclosed, not the individual policy or asset documents. Considered and rejected: an additional `resourceIds: [ObjectId]` array on the per-subject row. The array objection `compliance-specialist` raised at §14.5.1 does **not** apply to it (an array of one subject's own resource ids creates no hold-granularity, subject-operation or co-disclosure problem — the row is already scoped to one subject), so this is a judgement call, not a constraint:

- **Against adding it:** it is a fourth shape variant in a collection that just acquired three; it is bounded only by the page limit; and **Trail A carries strictly less** — `app.account_audit_log` has no resource concept at all, so adding it here widens rather than closes the asymmetry FU-A2 exists to fix.
- **The named trigger for revisiting:** if an investigation or a Stage 8 reviewer needs "which specific records of customer X did admin Y see in that list call," this is an additive field plus, at most, a validator amendment — no migration of existing documents, no index change. Cheap later, exactly like the baseline's deliberately-deferred `{ resourceType, resourceId }` index (§2).
- **Flagged for Stage 8**, not buried: the reconstruction grain for a bulk disclosure is `(subject, call)`, not `(subject, record)`. `cybersecurity-architect` may rule that insufficient; this document does not pre-empt that ruling.

#### 1.2.5 C-17 — no verbatim query or filter values, ever, in any field here

**Standing constraint, effective immediately** (`compliance-specialist` C-17, accepted by `cto` at §16.4). The bulk-disclosure writer records disclosed subject **ids** — never the search terms that found them. This collection has no field for a query value and must not acquire one without `compliance-specialist`'s field-sensitivity review; if filter capture is ever needed for insider detection, the compliant shape is to record *which fields* were filtered on, never their values. Admin search terms on this platform are routinely a customer's name, email, VIN or device serial, including of people who are not customers at all.

**The one implementation slip this constraint is one line away from:** `endpoint` is a method + path **template** (`GET /v1/admin/policies`), the same convention as `app.idempotency_keys.endpoint`. An implementer writing `req.originalUrl` into it — the obvious, well-meaning thing — captures `?accountId=…&search=…` and violates C-17 through a field nobody thought of as a query-value field. Stated here because C-17 was flagged as *"one well-meaning implementation away,"* and this is the one.

#### 1.2.6 How the writer must write it — one round trip, and what "atomic" can and cannot mean on MongoDB

R-1 attaches an implementation requirement: the per-subject documents and the call-scoped document are written in **a single multi-row statement, one round trip**, so AUD-10's fail-closed ruling costs one statement per call rather than N. On MongoDB that is **`insertMany()`**, and the details matter because AUD-10 makes a failed audit write fail the request:

- **`ordered: false`.** With `ordered: true` the driver stops at the first failing document, so one rejected document silently prevents the rest from being recorded. Unordered attempts all of them and reports every error.
- **Any write error is a failed audit write** — the caller lets it propagate to a 5xx and **does not serialise the customer data** (AUD-10, `api-design.md` §4.4's synchronous pre-response write).
- **Honest limit on the word "atomic":** `insertMany` is one round trip but is **not atomic across documents** without a multi-document transaction (which requires a session against a replica set; Atlas provides one). A transaction is available and is **not required here**, because the failure direction is safe: a partial insert followed by a 5xx over-records an access that never completed, which AUD-10 itself classes as a harmless false positive, while under-recording is impossible — any error fails the request. If a future reviewer wants the stronger property, wrapping the `insertMany` in a transaction is a code change, not a schema change.
- **Ordering within the request** (`compliance-specialist` §14.5.4, which flagged that a naive reading makes AUD-3(b) and AUD-10 look mutually unsatisfiable): **query → materialise the result → derive the distinct disclosed subjects → write the audit documents → serialise the response.** AUD-10 requires the audit write to precede *serialisation*, not to precede the query — the subjects are not knowable before the query runs.
- **Duplicates are collapsed** before writing: one document per *distinct* subject, matching `recordBulkDisclosure()`'s `[...new Set(...)]` on Trail A.

---

**Two additions beyond `api-design.md` §3.1's illustrative shape, both within this role's schema authority and both flagged so `backend-architect` can confirm neither breaks the write contract §4.4/§6.3 assumed** (original text, retained — `backend-architect`'s confirmation is still outstanding, and [A1] has *widened* what needs confirming: a list call now writes N+1 documents where the original contract assumed one):

- **`userAgent`** — parity with `app.account_audit_log.user_agent` (Feature 001, `001-authentication/database-design.md` §2.5) and `app.sessions.user_agent` (Feature 001's own addendum, §1: "Parity with `app.account_audit_log`'s existing columns"). This is the identical class of record (who did a security-relevant thing, from where, with what client) and the identical parity argument applies. `backend-architect`'s write-path implementation (§4.4/§6.3) already has the request's `User-Agent` header available at the point it writes this entry — no new capability is required to populate it, only one more field on an existing write.
- **`legalHold`** — mirrors `policies.legalHold`/`assets.legalHold` (`database-design.md` §7) and `app.account_audit_log.legal_hold` exactly. This field is not cosmetic: it is the mechanism §3 below depends on to justify a scheduled purge job instead of a TTL index. Default `false`; not set by any endpoint in this contract today (no admin-access-log entry is expected to need a hold in Phase 1), but the field must exist now so a future hold (e.g., an access-log entry that becomes evidence in a POPIA complaint or an internal-misconduct investigation) is a targeted `UPDATE`, not a schema migration performed under pressure during an actual investigation.

**Not added:** ~~an `action` field distinguishing "list" vs. "detail" calls. `endpoint`'s literal method+path already carries that distinction (`GET /v1/admin/policies` vs. `GET /v1/admin/policies/{id}`), and no named query needs "count of list calls vs. detail calls by this admin" as a first-class filter. Adding a redundant field for a query pattern nobody has asked for would be exactly the speculative-field creep this role's Best Practices warn against for indexing, applied here to schema shape instead.~~ — **superseded at [A1]**, see §1.2.3's `eventType` entry for why the reasoning stopped holding (a list call now emits two row types under the same `endpoint`).

**[A1] Still not added, deliberately:**

- **A purpose / case-reference field.** `compliance-specialist` ruled this explicitly at ADR-0006 §14.7: **Phase 1 admin reads of policy and asset records require no purpose field on either trail** — forcing a justification on every dashboard page view produces *"investigating"* ten thousand times and degrades the trail's evidential value rather than improving it; `endpoint` plus the AUD-1 key is proportionate here. **Do not add one to this collection.** The asymmetry is deliberate and is recorded here only because whoever designs the next trail will need it: the **GPS location-access trail** (AUD-9's third-trail rule) and **any security-company partner-operator access** carry AUD-1's key **plus a mandatory purpose/case reference** — those are the classes where the question asked afterwards is not "did they look" but "were they entitled to look *on this occasion*," and where it is the only field that makes a POPIA s23 answer meaningful for a third-party accessor. `cybersecurity-architect` is folding that into AUD-9's text (C-16(b), a `cto` ratification condition at §16.5); it is **not** this collection's requirement and this document does not restate it as one.
- **A `resourceIds` array on bulk-derived per-subject documents** — §1.2.4, with the trigger that would reverse it.
- **Any field capturing a query, filter or search value** — §1.2.5, C-17, standing.

### 1.3 `$jsonSchema` validator

**[A1] Supersedes the original §1.3.** Adds `eventType`, `actorSessionId`, `auditRequestId`, `resultCount`, and the R-1 / R-3 structural invariants as `$jsonSchema` conditionals — the Mongo-side mirror of `migrations/033`'s four `CHECK` constraints. The original required-field set and the `userAgent`/`legalHold` properties are retained.

```javascript
db.createCollection("admin_access_log", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "eventType",
        "actorAccountId",
        "actorSessionId",
        "resourceType",
        "endpoint",
        "legalHold",
        "createdAt"
      ],
      properties: {
        eventType: {
          enum: ["privileged_data_access", "privileged_bulk_access"],
          description: "Row-type discriminator. Same two values as app.audit_event_type after migrations/032."
        },
        actorAccountId: {
          bsonType: "string",
          description: "Soft reference to Supabase app.accounts.id (UUID string) — the admin who performed the read. Never null: every entry in this collection exists because an authenticated admin request was made."
        },
        actorSessionId: {
          bsonType: "string",
          description: "AUD-1. Soft reference to Supabase app.sessions.id — sitting element of the join key. Required; no FK (referent routinely ages out)."
        },
        auditRequestId: {
          bsonType: ["string", "null"],
          description: "AUD-5. Server-generated only (req.auditRequestId). Not the cross-store join key. Best-effort within-call grouping."
        },
        targetAccountId: {
          bsonType: ["string", "null"],
          description: "Soft reference to Supabase app.accounts.id. Non-null on privileged_data_access; null on privileged_bulk_access (enforced below)."
        },
        resourceType: { enum: ["policy", "asset"] },
        resourceId: {
          bsonType: ["objectId", "null"],
          description: "References policies._id or assets._id per resourceType. Null for list-level / call-scoped rows."
        },
        resultCount: {
          bsonType: ["int", "long", "null"],
          minimum: 0,
          description: "R-1. Set on privileged_bulk_access only (including 0); null on every privileged_data_access row."
        },
        endpoint: {
          bsonType: "string",
          minLength: 1,
          description: "Method + path TEMPLATE only (e.g. GET /v1/admin/policies). Never req.originalUrl — C-17."
        },
        ipAddress: {
          bsonType: ["string", "null"],
          description: "AUD-12: behavioural PII about an internal user; retention-bounded; not field-encrypted."
        },
        userAgent: {
          bsonType: ["string", "null"],
          description: "AUD-12: same class as ipAddress."
        },
        legalHold: { bsonType: "bool" },
        createdAt: { bsonType: "date" }
      },
      allOf: [
        // Mirror of account_audit_log_privileged_access_has_subject
        {
          if: {
            properties: { eventType: { enum: ["privileged_data_access"] } },
            required: ["eventType"]
          },
          then: {
            required: ["targetAccountId"],
            properties: {
              targetAccountId: { bsonType: "string" },
              resultCount: { bsonType: "null" }
            }
          }
        },
        // Mirror of account_audit_log_result_count_only_on_bulk (both directions)
        {
          if: {
            properties: { eventType: { enum: ["privileged_bulk_access"] } },
            required: ["eventType"]
          },
          then: {
            required: ["resultCount"],
            properties: {
              targetAccountId: { bsonType: "null" },
              resultCount: { bsonType: ["int", "long"], minimum: 0 }
            }
          }
        }
      ]
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
```

`validationLevel: "strict"` / `validationAction: "error"` from creation, same justification as `assets` (`database-design.md` §3.3): greenfield, no legacy-data conformance risk. This collection is written exclusively by backend service code on the admin-read path (never client-supplied), so strict validation costs nothing in flexibility it would otherwise need. Application-level asserts in the future writer should mirror these invariants the same way `repositories/audit-log.ts` mirrors `migrations/033` — a bug fails in a unit test, not as an opaque validation 500.

**Paper-design note:** no collection, no writer, and no `/admin/*` route exists yet. The validator above is the shape the first writer must satisfy when Feature 004's admin routes are built; it is not live.

### 1.4 AUD-11 — MongoDB role split (defined here; **checked, not enforced**)

**[A1]** ADR-0006 AUD-11 requires both trails to be append-only by *privilege*, not by convention. For this collection the intended Atlas role split is:

| Principal | Actions on `admin_access_log` | Purpose |
|---|---|---|
| Application user (request-path) | `find` + `insert` only — **not** `update` / `remove` | Admin-read audit writes |
| Purge job user | `remove` on this collection only (plus whatever the shared `retention_purge_runs` write needs) | Scheduled retention purge (§3.2) |
| Hold-placement principal | A path that can set/clear hold state **without** being able to rewrite evidentiary fields (`actorAccountId`, `targetAccountId`, `createdAt`, etc.) — mechanism TBD under C-13 (security-definer-equivalent / controlled admin op, not a raw `update` credential) | Legal-hold place/lift (AUD-7(b) / compliance D3) |

**Status: checked, not enforced.** No MongoDB cluster-side role for this collection exists today (FU-A6 open — this role defines the split; `cloud-infrastructure-architect` provisions it; `security-engineer` verifies). Per ADR-0006 §16.5 condition 3 / RR-6, **do not describe AUD-11 as enforced** until FU-A10 exists. The intended write contract is append-only inserts plus eventual purge/hold paths under distinct principals; that contract is **not** a live privilege grant.

---

## 2. Indexing strategy

**[A1] Revisited for the R-1 shape.** Same discipline as the baseline (`database-design.md` §5): every index is tied to a named query. Cross-store correlation itself still needs no new index on the join (AUD-3(a): subject-side indexes are the entry points; linkage is application-layer). What changes under R-1 is (a) the partial-filter reasoning for the subject index — null subjects are now only the call-scoped `privileged_bulk_access` rows, not "the entire record of a list call" — and (b) an explicit sitting-reconstruction index on `actorSessionId`, because AUD-8 groups by that field and the original §2 had no sitting grain.

| Index | Query pattern it serves |
|---|---|
| `{ actorAccountId: 1, createdAt: -1 }` | **"Show me all actions by admin Y."** Actor-keyed reconstruction (AUD-8 actor half). Mongo analogue of `account_audit_log_actor_created_at` (`migrations/033`) and of `policy_status_history`'s actor-side index. Descending on the range field for "most recent first." |
| `{ actorSessionId: 1, createdAt: -1 }` | **"Reconstruct one sitting."** AUD-1 / AUD-8 group-by: one `actorSessionId` is one admin working session. Required once correlation is sitting-level (RR-1); the original §2 omitted it because neither trail carried a session id. |
| `{ targetAccountId: 1, createdAt: -1 }`, partial filter `{ targetAccountId: { $type: "string" } }` (equivalently: `eventType: "privileged_data_access"`) | **"Show me all admin access to account X."** Subject-keyed reconstruction — detail reads **and** bulk-derived per-subject disclosures, both `privileged_data_access` with a populated subject (R-1's point). Partial so call-scoped `privileged_bulk_access` rows (`targetAccountId: null`) are excluded — they are not disclosure records and must never match a subject query. Same sparse reasoning as the baseline's `gpsDeviceId` index; the *reason* those nulls exist is what A1 changed, not the index shape. |
| `{ createdAt: 1 }`, partial (`legalHold == false`) | **The purge job's scan** (`createdAt < cutoff AND legalHold == false`) — Mongo analogue of `account_audit_log_created_at`. Cutoff is now known (§3.3: 12 months); the job itself is still unbuilt. |
| primary key `_id` | Direct lookups if a specific entry is ever referenced (e.g., linking a support ticket to the exact audit row). |

**Deliberately not indexed:**

- `{ resourceType: 1, resourceId: 1 }` — "who looked at this specific policy/asset" is still not a named hot path; cheap to add later.
- `{ auditRequestId: 1 }` — within-call grouping is best-effort (AUD-5); the authoritative grain is the sitting. Do not invent a hot path that depends on a nullable field being present.
- Any multikey / GIN-equivalent on a subject-id array — R-1 closed the array shape; there is no `targetAccountIds` field and there will not be one under this ADR.

**Capacity note (R-1):** a list call writes up to `limit + 1` documents (≤ 201 at `api-design.md` §5's ceiling). Accepted with eyes open at ADR-0006 §16.1; bounded by the 12-month retention at §3.3. Low risk at Phase 1 admin-dashboard volume; named for `cloud-infrastructure-architect`, not a Stage 8 schema blocker.

---

## 3. Retention and purge — applying §7's reasoning, not inventing a new policy

### 3.1 Does the baseline's TTL reservation (raw GPS pings only) still hold? Yes — reconsidered explicitly, not carried forward by default.

`database-design.md` §7 drew a specific line: TTL indexes are the right tool for the future raw-GPS-ping collection (§6), and the wrong tool for `policies`, `assets`, and `policy_status_history`, because "TTL indexes delete unconditionally on expiry with no way to honor a `legalHold` exception" and because no individual GPS ping (unlike a policy/asset/status-transition record) carries long-term evidentiary weight — unconditional expiry there is the actual intent, not a compromise.

**`admin_access_log` sits unambiguously on the `legalHold`/scheduled-purge side of that line, for a reason that if anything makes the case stronger than it was for `policy_status_history`:** the entire purpose of this collection is to be the evidentiary record of who accessed whose data and when. An entry in this collection is exactly the kind of row that might need to survive past its normal retention window — as evidence in a POPIA data-subject complaint, an internal misconduct investigation into an admin's access pattern, or litigation over improper cross-account access — which is precisely the scenario a `legalHold` carve-out exists to protect and a TTL index cannot. Reconsidering the reservation explicitly, as asked: **it still holds, and this collection does not get a TTL index**, for the identical reason `policy_status_history` doesn't — not because TTL is categorically wrong for MongoDB collections, but because this specific collection's records can individually matter in a way a raw location ping does not.

### 3.2 The mechanism this collection uses instead

Mirrors `app.account_audit_log`'s approach (`001-authentication/database-design.md` §6) exactly, translated to MongoDB, and consistent with `database-design.md` §7's own description of what a future policy/asset purge job should look like:

- A scheduled job (e.g. `purgeExpiredAdminAccessLog()`, run by an external scheduler — no MongoDB-native equivalent of `pg_cron` is assumed here, this is an operational/`cloud-infrastructure-architect` concern, not a schema one) deletes documents where `createdAt < cutoff AND legalHold == false`, using the partial index from §2. **Cutoff = createdAt older than 12 months** (§3.3).
- The job writes its own run record — `{ ranAt, cutoffDate, rowsDeleted, rowsSkippedForHold, targetCollection: "admin_access_log" }` — mirroring `app.retention_purge_runs`'s shape. **[A1]** `rowsSkippedForHold` is required by compliance D4 / C-13 when the job is built (converts a silently-failed hold into a detectable one); named here so the first implementer does not omit it. **Named here, not built now:** no `retention_purge_runs`-equivalent MongoDB collection exists yet, because no MongoDB-side purge job exists yet for *any* collection in this domain.
- `legalHold` is set manually in Phase 1 (same posture as `policies.legalHold`/`assets.legalHold`). **[A1] Forward constraint, deliberately not designed here:** C-13 will require a resolvable hold reference (not only a boolean), a purge/hold interlock, and a hold-placement principal that cannot rewrite evidentiary content (§1.4). Go-live blocker owned with `compliance-specialist`; not a Stage 8 schema blocker for Feature 004, and not inventable until a hold register exists to resolve against.

### 3.3 Retention period — **closed [A1]**

**Ruling (discharges FU-A8; `compliance-specialist` at ADR-0006 §14.2 / §14.9, accepting this document's original recommendation on its own reasoning):**

1. **`admin_access_log` retains for 12 months.** Equal to Trail A's `privileged_data_access` period, so AUD-7(a)'s equality condition is satisfied and no asymmetry statement is required.
2. **12 months is a ceiling with a purpose-justified carve-out (`legalHold`), not a floor.** POPIA s14 imposes a maximum ("no longer than necessary"); POPIA imposes **no minimum** retention on privileged-access logs. Anyone reading "12 months" as an obligation to *keep* records for 12 months has it backwards.
3. **Purge job may be built against this cutoff** — the period is no longer blocking design. The job, the shared `retention_purge_runs` collection, and C-13's hold-register interlock remain unbuilt (§3.2, §0).
4. **Reopening:** an extension needs a documented purpose under s14(1)(c)/(d) and a fresh `compliance-specialist` ruling — not a quiet change to a cutoff constant.

**Still open in the retention neighbourhood (not the period itself):** whether this collection's purge machinery and C-13 hold reference land before go-live (they must); the GPS/location-access trail's *own* retention period (C-16(a) — must not silently inherit 12 months).

---

## 4. Migration and versioning notes

Additive only, consistent with `database-design.md` §9's greenfield posture — this is a new collection, no existing document anywhere is affected. **Paper design only:** none of the steps below has been executed against a live database; no `admin_access_log` collection exists.

Ordered creation list, continuing after the baseline's own step 7 (`database-design.md` §9):

8. `create_admin_access_log_collection` — §1.2 A1 shape (`eventType`, `actorSessionId`, `auditRequestId`, `resultCount`, narrowed `targetAccountId`), no validator yet (same DDL/validation separation rationale as the baseline's steps 3–4).
9. `apply_admin_access_log_jsonschema_validator` — §1.3, `validationAction: "error"` from creation, including R-1 conditionals.
10. `create_admin_access_log_indexes` — the four indexes from §2 (`{ actorAccountId, createdAt }`, `{ actorSessionId, createdAt }`, the partial `{ targetAccountId, createdAt }`, and the partial `{ createdAt }` purge-scan index).

No purge job, no `retention_purge_runs` collection, and no Atlas role grants (AUD-11 / FU-A6) are created by this migration list — retention *period* is ruled (§3.3); retention *machinery* and cluster-side privileges remain separate work.

---

## 5. Cross-reference: `api-design.md` P-13

This addendum resolves `api-design.md` §8's P-13 ("`admin_access_log` collection — formalize DDL/indexing, and rule Postgres-vs-MongoDB for where it lives") in full: DDL/indexing formalized in §1–§2 above (as amended by A1 / ADR-0006 R-1), storage-location ruled MongoDB in §1.1. `backend-architect` should update P-13's status once this document is reviewed, and must treat the write contract as **N+1 documents per list call**, not one — this document does not edit `api-design.md` directly, consistent with keeping each document's own tracker owned by its author.

---

## 6. Pre-Approval Checklist — re-run for this one collection

- [x] **Schema change reviewed for embed-vs-reference correctness given the relationship's read/write pattern.** Referenced, not embedded: an append-only, high-write-relative-to-`policies`/`assets` history collection with its own independent retention/legal-hold lifecycle — identical reasoning to why `policy_status_history` is its own collection rather than an array embedded in `policies` (`database-design.md` §11). R-1 does not change embed-vs-reference; it changes how many referenced documents one call writes.
- [x] **Indexing strategy validated against actual hot query paths, not speculative.** §2 — actor-keyed, subject-keyed (partial), sitting reconstruction via `actorSessionId`, purge-scan; deliberately-not-indexed patterns called out by name.
- [x] **GPS/location-history growth accounted for with a retention or rollup plan.** N/A to this addendum — no GPS field exists on this collection; §3.1 only *references* the GPS TTL reservation to confirm it doesn't extend here. (GPS *access* trail is a future third trail under AUD-9 / C-16 — not this collection.)
- [x] **Sensitive fields reviewed with `cybersecurity-architect` for encryption/access-control needs — partial [A1].** **AUD-12 discharges the field-sensitivity half for this collection only:** `ipAddress` / `userAgent` are behavioural PII about an internal user (same class as Trail A's columns); retention-bounded; no field-level encryption. No payment/ID/location field exists here. **C-17** additionally prohibits verbatim query/filter values in any field (including the `endpoint` template slip — §1.2.5). **Still open:** who may *read* this trail (access-control half — AUD-12 explicitly did not design it); and Feature 004's broader P-14 (VIN / device serial / estimated value on `policies`/`assets`) is untouched by this addendum.
- [x] **Claim/policy/payment-adjacent changes preserve auditable history, not just current state.** This collection's entire purpose is auditable history. **Intended write contract:** append-only inserts; never updated on the request path; eventually purged per §3 or held under §3.2. **AUD-11's role split that would enforce that contract is defined at §1.4 but not enforced anywhere (FU-A6 open)** — do not read this checkbox as "immutable by privilege today."
- [x] **Data-retention policy aligns with `compliance-specialist`'s regulatory guidance.** Mechanism (§3.1–§3.2) + **period closed at 12 months** (§3.3, FU-A8). C-13 hold-register work remains go-live, not Stage 8 schema.
- [x] **Capacity impact on the MongoDB cluster reviewed with `cloud-infrastructure-architect`.** Not a meaningful capacity concern at Phase 1 volume — even under R-1's ≤201 inserts per list call, admin-dashboard usage is low relative to any GPS-ping-class write volume. Named as low-risk, not formally reviewed — consistent with the baseline's own unchecked capacity item (`database-design.md` §11).
- [x] **Migration path for existing data specified for any breaking schema change.** N/A — new collection, no existing data, purely additive (§4). Paper design; nothing applied live.

**Net:** schema / index / retention-period items for FU-A2 are satisfied on paper. Remaining Stage 8-adjacent opens are named in §0 and §7 — none of them is "finish FU-A2."

---

## 7. Summary for handoff

**[A1] FU-A2 discharged** — Trail B (`admin_access_log`) is paper-symmetric with Trail A after ADR-0006 R-1. Still **paper design only**: no collection, no writer, no `/admin/*` route.

- **Collection shape (A1):** `eventType` (`privileged_data_access` \| `privileged_bulk_access`), `actorAccountId`, **`actorSessionId` (required, soft ref to `app.sessions.id`)**, **`auditRequestId` (server-generated only, not the cross-store join key)**, `targetAccountId` (null only on call-scoped bulk rows), `resourceType`, `resourceId` (null on list/bulk-scoped rows), **`resultCount` (bulk row only, including 0)**, `endpoint` (path template — C-17), `ipAddress`, `userAgent` (AUD-12 behavioural PII), `legalHold`, `createdAt`. **No purpose/case field** (C-16(b) is for the future GPS/partner trail only).
- **R-1 bulk shape (accepted, closed):** one `privileged_data_access` document per distinct disclosed subject **plus** one `privileged_bulk_access` call-scoped document; written via **`insertMany`** (`ordered: false`) so AUD-10 fail-closed costs one round trip.
- **Storage:** MongoDB, unchanged (§1.1); ADR-0006 §10 concurs.
- **Indexes:** `{ actorAccountId, createdAt: -1 }`, `{ actorSessionId, createdAt: -1 }`, partial `{ targetAccountId, createdAt: -1 }`, partial `{ createdAt: 1 }` where `legalHold == false`.
- **Retention:** **12 months**, ceiling with `legalHold` carve-out — not a floor (§3.3). Purge job still unbuilt.
- **AUD-11:** role split defined at §1.4 — **checked, not enforced** (FU-A6).
- **Open beyond FU-A2 (Stage 8 / go-live, not this amendment):** trail read-access control; Feature 004 P-14 field-sensitivity on `policies`/`assets`; AUD-8 runbook document (FU-A4 — discharged; executable use blocked on FU-A11); AUD-11 enforcement (FU-A6 / FU-A10); C-13 hold register; `backend-architect` confirmation that §4.4/§6.3 write contract is N+1 docs per list call; no purpose field here (do not add one).
- **Nothing in the Stage 6 baseline is reopened** — strictly additive, per §0.
