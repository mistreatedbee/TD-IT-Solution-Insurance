# OB-04 — Case History / Event Model (Design Only)

**Author:** `backend-architect`. **Status:** Draft, awaiting Stage 8 (Security Review) per
`docs/organization/08-roadmap.md` §F item 5. **Stage:** 1–7 (design); no code in this change.

**Scope ruling this document follows (cto, 2026-10-29, `08-roadmap.md` §F item 5):**
- Design the backend event model now. Build it after Stage 8 sign-off. The admin-facing timeline
  UI is explicitly deferred to `frontend-engineer` as a separate capacity item — **no UI in this
  change.**
- **No location fields anywhere in this model.** Location/dispatch is OB-03 territory, which is
  still paper-only pending the dispatch-model ADR (`08-roadmap.md` §E.2, §D "Partner registry /
  dispatch model (PDM-6, G-7)"). This model must be forward-compatible with OB-03 adding its own
  event types to the same stream later, but it must not anticipate OB-03's shape beyond that
  extensibility.
- Response-time **targets** are explicitly out of this document's scope — `business-analyst`'s
  call, internal-only per the ruling (see §7 below). This document defines the data needed to
  *compute* such a metric later; it does not define or imply a number.

This document is written for a security reviewer to review directly (Stage 8): operator identity
is personal information disclosed to partner organizations under the existing PDM-1..4/PDM-8
discipline in `backend/src/repositories/recovery-cases.ts` and `backend/src/routes/security-cases.ts`,
and this new event stream inherits that same exposure surface, so it is specified in enough detail
to be reviewed on those terms, not just as a database sketch.

## 1. Why this exists — the gap

`repositories/recovery-cases.ts`'s `PartnerOrgScorecard` doc comment (lines ~1127–1148) already
names the two honest limitations this closes:

1. `recovery_cases` has no per-case history of which org held it when — claim/release/reassign
   overwrite `partnerOrganizationId` in place, so a case's assignment history is lost the moment
   it's reassigned or released.
2. There is no `claimedAt` timestamp — the scorecard's `averageTimeToTerminalStatusHours` uses
   `createdAt → closedAt` as a proxy for "claim to resolution," which overstates duration for any
   case that sat in the unclaimed pool before being claimed.

OB-04 ("case timeline with timestamps, who acted, response-time targets") needs an append-only,
chronologically queryable record of every lifecycle transition a case goes through. The existing
`admin_access_log` (ADR-0006 §18, PDM-8) already logs *disclosure* (who read what) and *state
change intent* (`recordStateChange`) for audit/compliance purposes, but it is not designed to be
queried "give me this case's timeline" — it's a flat, cross-resource audit trail, not a per-case
history, and its retention/purpose is audit compliance, not product-facing case history. OB-04
needs its own collection, purpose-built for the "by caseId, chronological" access pattern an
eventual admin UI will use, while the state-change intent the audit trail already captures stays
exactly as-is (this document does not touch `admin_access_log` or ADR-0006).

## 2. New collection: `recovery_case_events`

Per ADR-0002 (polyglot split — domain data lives in MongoDB), this is a new MongoDB Atlas
collection, sibling to `recovery_cases`. Append-only: no update or delete operation is ever issued
against a document in this collection by application code (enforced at the repository layer —
see §5 — not at the Mongo access-control layer, which is unchanged by this document).

### 2.1 Document shape

```ts
export interface RecoveryCaseEventDocument {
  id: string;                       // Mongo _id, hex string
  caseId: string;                   // recovery_cases._id, hex string — indexed
  eventType: RecoveryCaseEventType; // closed, fixed-vocabulary enum — see §2.2
  occurredAt: Date;                 // when the transition happened (not when this row was written —
                                     // see §4 on write-ordering; in practice these are the same
                                     // instant today, but kept distinct so a future backfill or
                                     // async write path cannot silently conflate them)
  actor: RecoveryCaseEventActor;    // who/what caused this event — see §2.3
  fromStatus: RecoveryCaseStatus | null;  // null for creation-type events that have no prior status
  toStatus: RecoveryCaseStatus | null;    // null for events that are not themselves a status change
                                           // (e.g. a future "note added" or OB-03 "dispatched" event)
  fromPartnerOrganizationId: string | null;
  toPartnerOrganizationId: string | null;
  closeReason: RecoveryCaseCloseReason | null; // set only on recovered/closed events, mirrors
                                                 // recovery-cases.ts's existing closeReason semantics
  metadata: Record<string, never> | Record<string, string | number | boolean | null>;
                                     // small, structured, event-type-specific detail — see §2.4 for
                                     // the hard rule on what may never go here
  createdAt: Date;                  // when this row was written — always >= occurredAt
}
```

No field for location, coordinates, address, or anything geographic exists on this document, and
none may be added without revisiting this ruling (see the scope note at the top of this file and
§8 "Guardrail for future editors").

### 2.2 `eventType` — fixed vocabulary, mapped 1:1 to existing lifecycle code

This is deliberately **not** "any string the caller supplies." It is a closed enum so that a
future admin UI (and this Stage 8 review) can reason about the complete set of things that can
ever appear in a case's timeline:

| `eventType` | Written from | Existing code location |
|---|---|---|
| `case_created` | `recoveryCasesRepo.createForAccount` | `recovery-cases.ts` (customer opens a case; status becomes `open`) |
| `case_claimed` | `recoveryCasesRepo.claimForPartnerOrg` | `recovery-cases.ts` / `security-cases.ts` `POST /security/cases/:caseId/claim` |
| `status_changed` | `recoveryCasesRepo.updateStatusForPartnerOrg` | `security-cases.ts` `PATCH /security/cases/:caseId` |
| `case_released` | `recoveryCasesRepo.releaseForPartnerOrg` | `security-cases.ts` `POST /security/cases/:caseId/release` |
| `case_reassigned` | `recoveryCasesRepo.reassignForPartnerOrg` | `security-cases.ts` `POST /security/cases/:caseId/reassign` |
| `customer_contacted` | the `/messages` route | `security-cases.ts` `POST /security/cases/:caseId/messages` (not a status change — `fromStatus`/`toStatus` both set to the unchanged current status, matching the existing audit-log convention at that call site) |

This table is intentionally "one row per case/route pairing that already exists in
`security-cases.ts`/`recovery-cases.ts` today" — per the task instruction, this captures the
*existing* transitions, it does not invent new ones. The only two genuinely new facts being
captured that don't already have a dedicated audit-log call are `case_created` (today's
`createForAccount` writes no audit-log row at all — see §4.1) and the derived `claimedAt` /
per-event actor detail the scorecard currently lacks.

**Forward-compatibility for OB-03 (not built now):** a future `eventType` such as
`case_dispatched` or `partner_access_expired` can be added to this enum later without a schema
migration — Mongo has no rigid enum constraint at the storage layer; the enum lives in
`backend/src/repositories/recovery-case-events.ts`'s TypeScript union and is widened additively,
the same pattern `RecoveryCaseStatus`/`RecoveryCaseCloseReason` already use. OB-03's own Stage 1–8
is a separate piece of work and is not authorized by this document; it only must not require a
breaking change to this collection's shape when it lands.

### 2.3 `actor` — who/what caused the event

```ts
export interface RecoveryCaseEventActor {
  type: 'customer' | 'security_company_operator' | 'support_agent' | 'system';
  accountId: string | null;         // null only for type: 'system'
  partnerOrganizationId: string | null; // the operator's org at the time of the action, for
                                          // 'security_company_operator' actors; null otherwise.
                                          // Recorded even though it duplicates fromPartnerOrganizationId/
                                          // toPartnerOrganizationId in most cases, because an event
                                          // like `customer_contacted` has no org-transition fields at
                                          // all but still needs "which org's operator did this."
}
```

`accountId` here is the same kind of personal-information field `recovery-cases.ts`'s `accountId`
documentation already treats carefully (PDM-1/PDM-8) — see §6 for how this document proposes that
discipline carries over to this new collection, since this is exactly the fact a Stage 8 reviewer
needs to check first.

`type: 'system'` is reserved for a future automated transition (e.g., an eventual PDM-4-style
wrap-up-window housekeeping job) — nothing in today's codebase writes one; it is in the union now
so the type doesn't need to widen later for that case.

### 2.4 `metadata` — hard rule

`metadata` exists to carry small, event-type-specific, already-non-sensitive detail that doesn't
deserve its own top-level column (for example, `customer_contacted`'s event could carry
`{ messageLength: 42 }` the way the audit log already avoids storing message content). **Hard
rule, enforced at the repository boundary, not just documented:** no field ever written into
`metadata` may be a location/coordinate value, free-text note content, or any of the Feature 011
police-report fields (`sapsCaseNumber`, `reportingStation`, `reportedToPoliceAt`) — those stay
governed by their existing, separately-reviewed exclusion-projection discipline
(`POLICE_REPORT_FIELD_EXCLUSION_PROJECTION` in `recovery-cases.ts`) and must not be duplicated into
a second collection that doesn't yet have that projection discipline applied to it. This repo-layer
rule is the concrete mechanism requested by the "do not include any location fields" instruction:
it's not just that no field is named `lastLocation` today, it's that nothing resembling one can be
added later through the one open-ended field this shape has.

## 3. Indexes

- `{ caseId: 1, occurredAt: 1 }` — the primary access pattern ("this case's timeline, chronological
  ascending for display, or descending for 'most recent first'"). Compound, not two singles, since
  every query in §6 filters by `caseId` first.
- `{ caseId: 1, eventType: 1 }` — supports "when was this case claimed" (`claimedAt` derivation, §7)
  without a full per-case scan.
- No index on `actor.accountId` is proposed in this design — nothing in §6's query list needs
  "find all events by this operator" yet; `database-architect` should revisit if that access
  pattern is requested later (e.g., an operator-activity report), rather than this document
  speculatively indexing for a query nobody has asked for.

## 4. Write path — append alongside, not inside, the CAS transition

**Decision: a separate append call alongside the existing compare-and-set logic, not folded into
it.** Concretely:

- `recoveryCasesRepo`'s existing mutation methods (`createForAccount`, `claimForPartnerOrg`,
  `updateStatusForPartnerOrg`, `releaseForPartnerOrg`, `reassignForPartnerOrg`) are **unchanged** —
  this document does not propose touching their compare-and-set (`expectedStatus`/
  `partnerOrganizationId` match-clause) logic, which is already load-bearing per ADR-0006 §18.8
  (C-A/C-B) and SR-009S-6. Re-opening that logic to interleave a second write is unnecessary risk
  for this feature.
- A new, separate repository, `recoveryCaseEventsRepo` (own file,
  `backend/src/repositories/recovery-case-events.ts`), exposes one method:
  `append(event: NewRecoveryCaseEventInput): Promise<RecoveryCaseEventDocument>`, a single
  `insertOne` with no update/delete method exported at all (the "append-only" guarantee is
  structural: the repository module simply has no other mutating export, mirroring how
  `OFFER_TIER_FIELD_EXCLUSION_PROJECTION` makes a guarantee structural rather than conventional
  elsewhere in this codebase).
- The route layer (`security-cases.ts`, `recovery.ts`) calls `recoveryCaseEventsRepo.append(...)`
  at the **same point in the existing handler sequence where `adminAccessLog.recordStateChange`
  is already called** — i.e., after the pre-read, before the CAS mutation (ADR-0006 §18.8 ruling
  (b) ordering, "write-audit-before-mutate"). This is a deliberate, consistent choice: the new
  event-append happens at the identical point in the request lifecycle as the existing audit
  write, for the identical reason (a reviewer tracing one handler's control flow sees both writes
  adjacent, not one at request-start and one at request-end). **It is written whether or not the
  subsequent CAS mutation succeeds or fails on a concurrent-race miss** — no: on reflection, that
  would record events that didn't actually happen (a race-lost claim). Correct rule: **the event is
  appended only after the CAS mutation returns a non-null (successful) result**, immediately
  following it, inside the same try block, before the response is built. This differs from
  `adminAccessLog.recordStateChange`'s own "before mutate" placement precisely because an audit
  *disclosure/intent* record is allowed to exist even for an attempt that then loses the race
  (ADR-0006 already accepts this — "the already-written audit row is reconciled via the AUD-8
  chain check, not by retracting it"), but a *case history* entry describing "status became X" must
  never be written for a transition that did not actually happen, or the timeline itself becomes
  wrong. **This is the one point where this document's write-ordering intentionally diverges from
  the existing `adminAccessLog` pattern, and it must be called out explicitly to the Stage 8
  reviewer as a reasoned deviation, not an oversight.**
- Each call site passes `occurredAt` as the server timestamp captured once per request (the same
  `new Date()` the mutation itself uses for `updatedAt`), not recomputed a second time, so
  `occurredAt` and the case document's own `updatedAt` cannot drift apart for the same transition.
- `case_created` is a new append call that does not exist today anywhere (today's
  `createForAccount` writes no audit-log row). This is the one net-new write call this document
  adds outside the "alongside an existing audit write" pattern — flagged for the Stage 8 reviewer
  for that reason: it is an unconditional append on every case creation, by a `customer`-type
  actor, and should be reviewed as such (no disclosure risk, since a customer creating their own
  case is not disclosing anything to anyone).

### 4.1 Failure handling

If `recoveryCaseEventsRepo.append` throws after a successful CAS mutation, the handler's existing
`catch (err) { next(err); }` converts it to a 5xx — **the HTTP response for that request becomes a
failure even though the underlying case mutation already succeeded.** This is a known, accepted
tradeoff for this design (not silently fixed by this document): a client could see a 500 for a
case update that actually went through. This mirrors the existing tradeoff already accepted for
`adminAccessLog`'s own writes at the same call sites (AUD-10 "fail-closed" — a throw there already
5xxs before the mutation in the current code, which is a slightly different case but the same
philosophy: audit/history durability is treated as part of the operation's correctness, not an
optional side-effect). `site-reliability-engineer`/`backend-engineer` should confirm at build time
whether a retry-queue or at-least-once pattern is warranted before this is actually built, but idempotent re-append (keyed on a request id) is out of scope for this design doc.

## 5. Read path — how an admin UI would eventually query this

(For `frontend-engineer`'s later work — not built here.) A single new endpoint is anticipated,
not specified in full OpenAPI detail in this document (that is proper Stage 1-3 API-design work
when that capacity item is opened):

`GET /v1/admin/recovery-cases/:caseId/events` — admin-only (`requireUserType('admin')`, consistent
with every other `/admin/*` route in this codebase), paginated with the existing
`mongoCursorFilter`/`buildPage` helpers (`lib/mongo-pagination.ts`) already used throughout
`recovery-cases.ts`/`security-cases.ts`, sorted `{ occurredAt: 1 }` (chronological ascending, "read
top to bottom like a timeline") or `-1` via a query param, mirroring the existing pagination
conventions rather than inventing new ones.

Underlying repository method: `recoveryCaseEventsRepo.listForCase(caseId, limit, cursor)` — a
straightforward indexed find on `{ caseId }`, no tiering/projection complexity needed on this read
path *for the admin surface*, because admin is already the single-tier, full-visibility consumer
in this codebase's existing model (`routes/admin-*.ts` files do not apply the partner-tiered
projections that `security-cases.ts` must — see `recovery-cases.ts`'s `OFFER_TIER_FIELD_EXCLUSION_PROJECTION`/
`CLAIMED_TIER_FIELD_EXCLUSION_PROJECTION`, which exist specifically because the *partner* surface,
not the admin surface, is the one with PDM-1..4's narrowed visibility).

**If/when this is ever exposed to a partner organization directly** ("eventually partner orgs" per
the roadmap wording), the read path must NOT reuse the admin method unfiltered — it must introduce
a partner-scoped equivalent of `claimedCaseVisiblePredicate`/`findByIdForPartnerOrg`'s pattern
(only a case the calling org has ever held should surface events for that org's involvement) and
must decide, as its own Stage 8 question, whether another org's prior claim/release/reassign
history on a case is visible to a *later* claimant — this document does not answer that question;
it only flags it exists, since §6 below shows it's not free of PII exposure either way.

## 6. Security-review-facing summary (for Stage 8)

This section is written to be read on its own by `cybersecurity-architect`/`security-engineer`.

- **New personal information stored:** `actor.accountId` for every `customer`-typed event
  (`case_created`) and every `security_company_operator`-typed event. This is not new information
  that doesn't already exist elsewhere (every one of these actions is already captured, with the
  same `accountId`, by `admin_access_log`'s `actorAccountId`/`targetAccountId` under ADR-0006) —
  this design duplicates it into a second collection for a different access pattern (per-case
  chronological read vs. cross-resource audit search). The duplication itself is the thing to
  review: two collections holding overlapping PII now need to agree on retention and on any future
  deletion/erasure request, which is flagged in §8, not resolved here.
- **No location data** — enforced structurally in §2.4, not just by omission from today's schema.
- **Who can read this, once built:** admin only, in the first increment (§5). Partner-organization
  access ("eventually partner orgs" per the roadmap item) is explicitly future scope with its own
  open question flagged above, not something this design pre-authorizes.
- **Retention:** not addressed by this document — inherits no retention policy of its own yet.
  `database-architect`/`compliance-specialist` should set one when this is built (candidate anchor:
  mirror `recovery_cases`' own retention discipline — Feature 011's `POLICE_REPORT_RETENTION_YEARS`/
  `closedAt`-driven clock — rather than inventing an independent policy, but that is this
  design's open follow-up, not a decision made here).
- **Write-ordering deviation flagged for explicit review:** §4's "append only after a successful
  CAS mutation" rule, which differs from the existing `adminAccessLog` "write before mutate"
  convention at the same call sites, for the stated reason. This is the one place this document
  asks the reviewer to actively evaluate a design choice rather than confirm continuity with
  existing patterns.
- **Nothing in this document changes `admin_access_log`, ADR-0006, or any existing
  `POLICE_REPORT_FIELD_EXCLUSION_PROJECTION`/PDM-1..4 guarantee.** Those remain exactly as currently
  implemented and reviewed.

## 7. Response-time targets — explicitly deferred

Per the cto ruling this document follows: **no target numbers are set here.** This model makes the
two timestamps a response-time metric would need available for the first time
(`case_created`'s `occurredAt` and `case_claimed`'s `occurredAt` give a real `claimedAt`, replacing
`PartnerOrgScorecard`'s documented `createdAt → closedAt` proxy; a similar claim-to-terminal-status
duration becomes computable from `case_claimed.occurredAt → status_changed(terminal).occurredAt`).
Defining what a healthy or required value for that duration is — and whether it is ever made
contractual with a partner organization, which the ruling says it explicitly is not, internal only
— is `business-analyst` territory, flagged here as a clean follow-up once this model is built, not
decided or assumed by this document.

## 8. Guardrail for future editors

If a future change proposes adding a location, coordinate, or address field to
`RecoveryCaseEventDocument` or to `metadata`, that is **OB-03 territory** and requires: (a) the
OB-03 dispatch-model ADR to exist and be ratified first (`08-roadmap.md` §D, "Partner registry /
dispatch model (PDM-6, G-7)"), and (b) a fresh compliance review, because this document's Stage 8
sign-off (once obtained) will have been granted on the explicit basis that this collection carries
no location data. Do not treat "it's just one more optional field" as a small change against this
document's review.

---

## 9. Stage 8 Security Review — `cybersecurity-architect` (2026-10-29)

**Appended section. §1–§8 above are `backend-architect`'s and are not modified.** Where I disagree
with them I say so here and cite the section.

**Verdict: APPROVE WITH CONDITIONS (architecture sign-off).** The design holds up: it has a separate
collection, an append-only repository, post-CAS append, admin-only reads, and no location field.
The conditions below are binding on the build. Conditions SR-019-1 through SR-019-8 are
**build-blocking**: implement them in the first PR, and `security-engineer` verifies them at Stage
10. SR-019-9 is **production-enablement-blocking**: the code can merge, but the appends must not
write real production data until it is closed. This is one of the three Stage 8 signatures.
`security-engineer` and `compliance-specialist` must still sign before Development starts (the
joint-gate rule). The compliance signature matters most for SR-019-9.

### 9.1 What I verified against the code, not the doc

Read on 2026-10-29: `backend/src/repositories/recovery-cases.ts`, `backend/src/routes/security-cases.ts`,
`backend/src/routes/recovery.ts`, `backend/src/routes/support-lookup.ts` (call sites only),
`backend/src/lib/mongo-pagination.ts`, `backend/scripts/seed-demo-security-dashboard.ts` (delete
call sites), `docs/organization/runbooks/account-deletion-request-runbook.md` §5 table.

**The §2.2 claim of a "1:1 mapping onto existing transitions" is correct for the lifecycle state
machine. It is not correct for every mutation of `recovery_cases`:**

| Mutation in code today | Caller | Covered by §2.2? |
|---|---|---|
| `createForAccount` | `recovery.ts` `POST /recovery/cases` (customer) | Yes, `case_created` |
| `claimForPartnerOrg` | `security-cases.ts` `POST .../claim` | Yes, `case_claimed` |
| `updateStatusForPartnerOrg` | `security-cases.ts` `PATCH .../:caseId` | Yes, `status_changed` |
| `releaseForPartnerOrg` | `security-cases.ts` `POST .../release` | Yes, `case_released` |
| `reassignForPartnerOrg` | `security-cases.ts` `POST .../reassign` | Yes, `case_reassigned` |
| no repo mutation (notification only) | `security-cases.ts` `POST .../messages` | Yes, `customer_contacted` (see SR-019-5 on its name and semantics) |
| `appendCallCentreNote` | `support-lookup.ts` `POST` (support_agent) | **No.** Not mentioned in §2.2 |
| `setPoliceReportFields` | `recovery.ts` `PATCH .../police-report` (customer) | **No.** Not mentioned in §2.2 |
| `police-report-retention.ts` `updateMany` field purge | system job | **No.** Not mentioned in §2.2 |
| raw `deleteMany` on `recovery_cases` | `scripts/seed-demo-security-dashboard.ts:169` (demo teardown) | **No.** Relevant to SR-019-8 |

**Ruling on the uncovered rows:** leaving them out of increment 1 is the **correct** choice, but §2.2
must say so explicitly instead of implying full coverage. The police-report path in particular must
**never** become an event type while SR-011-1's exclusion discipline applies only to
`recovery_cases`. Even a value-free `police_report_updated` event would tell the timeline's readers
that police were involved, and that fact is itself governed by C-011-9. Any future event type for
call-centre notes or police reports needs its own Stage 8 review. Also note that the demo seed
script drives the repository directly, not through the routes, so with route-layer appends (§4) the
pre-claimed demo cases will have no events. That is acceptable, but nobody should read it as a bug.

**Other code-versus-doc discrepancies found:**

- **§4's `occurredAt` rule cannot be implemented as written.** Every mutation method computes its
  own `new Date()` internally (`recovery-cases.ts` lines 577, 742, 851, 917, 960). None accepts a
  timestamp parameter, and §4 says the methods stay unchanged. "Pass the same `new Date()` the
  mutation uses" is therefore impossible without a signature change. See SR-019-3 for the fix.
- **§5's pagination plan is broken against the real helper.** `mongoCursorFilter`
  (`lib/mongo-pagination.ts:70`) is hard-wired to `createdAt` **descending** with an `_id`
  tiebreak. It cannot page an `occurredAt` sort, and it cannot page ascending. A timeline that
  silently skips or duplicates events at page boundaries is an integrity defect in an
  audit-adjacent view, not just a UX bug. See SR-019-7.
- The §2.2 table's "Written from" column names repository methods, but §4 puts the append calls in
  the route layer. §4 is the correct one: the repository methods stay untouched. The table should
  be read as "corresponds to", not "written from".

### 9.2 Ruling on the write-ordering deviation (§4), actively evaluated

**I accept "append only after a successful CAS mutation." I reject §4.1's failure handling.**

*Why post-CAS is correct:* `admin_access_log` is the **audit record of authority** (ADR-0006 §18,
AUD-8 hash chain, fail-closed per AUD-10, written before the mutation). An intent row there for a
lost race is harmless, because it records an attempt. A timeline row for a lost race would be a
false statement of fact. These are two different artefacts with two different correctness rules,
and the deviation follows from that difference. It is not an inconsistency.

*Why §4.1 is wrong:* §4.1 turns an append failure after the mutation into a 5xx "because audit
durability is part of correctness." That reasoning belongs to the audit log, and the audit log has
already been written by that point. Failing the request does not undo the mutation or make
anything more durable. It only tells the client something false. The client sees a 500 for a claim
that succeeded. If it retries, the CAS misses and it gets `404 Case is not available to claim`
while its own org now holds the case, and the operator has no idea why. That is a worse integrity
outcome (operator confusion, duplicate attempts, support load) for no gain.

**The threat that actually needs designing for is the silent gap:** the mutation succeeds and the
append is lost (a throw, or a process crash between the two calls). The case state and the timeline
then disagree, permanently and invisibly. SR-019-2 makes that gap detectable and reconcilable from
the audit row already written before the mutation. `case_created` is the exception, because it has
no audit row (§4). Its gap can instead be rebuilt from the parent document, since
`recovery_cases.createdAt` is the same fact.

**A corollary that must be stated:** `recovery_case_events` is **not** tamper-evident (it is
outside the AUD-8 chain) and is **not** an audit record. It is a product-facing, derived history.
No surface may label it "audit log", and no compliance or legal process may treat it as the
authoritative record. Disputes resolve against `admin_access_log`.

### 9.3 Build-blocking conditions

- **SR-019-1. Write-path inputs come only from trusted sources.** Every field of an appended event
  must come from `req.auth` (`actor.accountId`, `actor.partnerOrganizationId`) or from the CAS
  mutation's returned document (`caseId` = `result.id`, `toStatus`, `toPartnerOrganizationId`,
  `closeReason`), or, for `from*`, from the handler's own pre-read (`existing`). This is the same
  rule as §18.8(a)(1) for `resourceId`. **Never** use `req.params.caseId` or any `req.body` field,
  with one exception: `reassign`'s `targetPartnerOrganizationId`, and only after the existing
  active-org validation and only as echoed back by `reassigned.partnerOrganizationId`. Test: a
  request whose path `caseId` differs in case or format from the DB id still records the DB id.

- **SR-019-2. Failure handling and reconciliation (replaces §4.1).**
  (a) The post-CAS `append` is wrapped in its own `try/catch`. On failure it emits a structured
  `error`-level log `recovery_case_event_append_failed` and a counter metric, then **continues to
  the success response**. The log carries only `caseId`, `eventType`, `auditRequestId`, and the
  error class: no accountIds and no message text. The pre-mutation `recordStateChange` stays
  fail-closed exactly as today. Do not touch SR-009S-4's tests.
  (b) Add `auditRequestId: string | null` to `RecoveryCaseEventDocument`, populated from
  `req.auditRequestId` (the same value the preceding `recordStateChange` row carries). This is the
  join key that lets a later reconciliation job find "audit row with no matching event, and case
  state consistent with the transition". It holds no PII.
  (c) Add a partial unique index on `{ caseId: 1, eventType: 1, auditRequestId: 1 }` with
  `partialFilterExpression: { auditRequestId: { $type: 'string' } }`, so any future retry or
  backfill path cannot double-append the same transition. Treat duplicate-key error 11000 on
  `append` as success.
  (d) The reconciliation job itself is **not** required in this build. It goes on the risk
  register as **RR-019-A** (owner `backend-engineer` and `site-reliability-engineer`, target before
  the admin timeline UI ships). The admin UI must not ship while RR-019-A is open unless the UI
  says "history may be incomplete". The `append_failed` alert is the interim detective control.

- **SR-019-3. `occurredAt` source (fixes §4).** Use the CAS result's own `updatedAt` as
  `occurredAt` for claim, status_changed, release, and reassign. `toCase()` returns `updatedAt`,
  and none of the tier projections exclude it. For `case_created`, use `recoveryCase.createdAt`.
  For `customer_contacted`, use one `new Date()` captured in the handler. This keeps the
  repository methods unchanged, as §4 intends, and still guarantees that `occurredAt` equals the
  case's `updatedAt` for that transition.

- **SR-019-4. Location exclusion must be structural, not a comment (tightens §2.4).** As written,
  `metadata: Record<string, string | number | boolean | null>` would accept `{ latitude: -26.2 }`
  and pass the type check. "Enforced at the repository boundary" has no mechanism behind it yet.
  Required:
  (a) **Remove `metadata` from increment 1 entirely.** No event in §2.2 needs it.
  `customer_contacted`'s `messageLength` example has no consumer, and dropping it shrinks the
  surface. If a later event type needs detail, add it as a typed, named top-level field via a
  discriminated union per `eventType`, never as an open record.
  (b) `append()` validates its input with a `zod` schema that is a discriminated union on
  `eventType`, with **`.strict()` on every branch**, so unknown keys are rejected rather than
  stripped. The `insertOne` document is then built field by field from the parsed value, never by
  spreading the input.
  (c) Tests: `append` rejects an input carrying any of `latitude`, `longitude`, `lastLocation`,
  `lastLocationAt`, `location`, `notes`, `text`, `message`, `sapsCaseNumber`, `reportingStation`,
  `reportedToPoliceAt`, `reason`, or `metadata`. Add one schema-snapshot test asserting the exact
  key set of the inserted document, so any field addition fails CI and forces a §8 review.
  (d) Never copy `recovery_cases.notes` (customer free text) or the audit row's free-text `reason`
  into an event.

- **SR-019-5. Allowed actors per event, and `customer_contacted` semantics.**
  (a) `append()` enforces an explicit allowlist: `case_created` → `customer`. `case_claimed`,
  `status_changed`, `case_released`, `case_reassigned`, and the contact event →
  `security_company_operator` with a non-null `actor.partnerOrganizationId`. `support_agent` and
  `system` may stay in the TypeScript union (§2.3), but **no event type accepts them in this
  build.** Adding one needs a review, in particular because `support_agent` writes would bring in
  the call-centre trust boundary.
  (b) Rename `customer_contacted` to **`customer_contact_initiated`**. The route returns 202 and
  dispatches in the background through `notifyCaseMessage`, which respects opt-outs. The event can
  truthfully say an operator initiated contact, but not that the customer was contacted. Append it
  after the existing `recordStateChange` call, synchronously and before `res.status(202)`, under
  the same failure rule as SR-019-2(a). Store no message content and no length.

- **SR-019-6. Data minimisation on the actor (resolves the first part of §6's open question).**
  (a) When `actor.type` is `'customer'`, store `actor.accountId: null`. Under this build's
  allowlist, the customer actor is by definition the case owner, and the case owner's id is already
  on the parent `recovery_cases.accountId`. Duplicating it adds nothing and creates a second copy
  that would need erasing. The read API resolves it from the case. This changes §2.3's comment
  ("null only for system") to "null for `system` and `customer`".
  (b) `actor.accountId` for operators is stored as the opaque Supabase UUID **only**. No email,
  display name, or role label is ever denormalised into an event. Names are resolved at read time
  through the identity layer, so an erased or pseudonymised identity shows up automatically as
  "deleted user" with no write to this collection.

- **SR-019-7. Read API gating and pagination (for the §5 endpoint, when built).** The required
  shape for `GET /v1/admin/recovery-cases/:caseId/events`:
  (a) `authenticate`, `requireUserType('admin')`, and a rate limiter keyed on
  `req.auth.accountId`, using `AUDIT_LOG_READ_LIMIT` (the same class as the scorecard and audit-log
  reads, not `DEFAULT_AUTHENTICATED_LIMIT`). Step-up is not required: this is a read, consistent
  with every other admin read in the codebase.
  (b) Validate `:caseId` as 24-hex. Then resolve the parent case with a **new, minimal** repo
  method, `findAccountIdForAdmin(caseId)`, with projection `{ accountId: 1 }` only. Return
  `NOT_FOUND` if the case does not exist, so an empty list never confirms or denies a caseId.
  (c) Before serialising, write `adminAccessLog.recordDetail({ resourceType: 'recovery_case',
  resourceId: <db id>, targetAccountId: <case.accountId>, ... })`, fail-closed per AUD-10. The
  response discloses which operators handled a customer's theft case, and that is a PDM-8
  disclosure like any other admin case read.
  (d) Pagination: either use the existing `mongoCursorFilter`/`buildPage` helpers **as they are**,
  sorting `{ createdAt: -1, _id: -1 }` (newest first; the UI reverses it for display) with the
  index `{ caseId: 1, createdAt: -1, _id: -1 }` replacing §3's first index, or write a dedicated
  cursor encoder for `occurredAt` in both directions with its own tests. Do **not** sort on one
  field while paging on another. The first option is recommended. The asc/desc query parameter
  in §5 is dropped for increment 1.
  (e) Use an explicit allowlist serializer. Output only `id`, `eventType`, `occurredAt`,
  `actor{type, accountId, partnerOrganizationId}`, `fromStatus`, `toStatus`,
  `fromPartnerOrganizationId`, `toPartnerOrganizationId`, and `closeReason`. Never spread the
  document.
  (f) If the route is built in this increment, mount it behind an env flag that defaults to off,
  following the `claimsApiEnabled` pattern in `admin-claims.ts`, until RR-019-A is closed or the
  UI carries the completeness caveat.

- **SR-019-8. Append-only stays structural, and lifecycle deletion goes through an allowlist.**
  `recovery-case-events.ts` exports only `append` and `listForCase`, plus the index bootstrap in
  `db/`. Add a test asserting the module's exact export set. Parent-case deletion must still
  cascade, because orphaned events for a deleted case are personal data with no retention basis.
  Today the only such path is the demo teardown at `scripts/seed-demo-security-dashboard.ts:169`.
  That script must also `deleteMany({ caseId: { $in: <deleted case ids> } })` on
  `recovery_case_events`, using its own raw-collection handle in the same way it already handles
  `admin_access_log` (line 198). It must not use a new repository export. Any future production
  deletion or anonymisation of `recovery_cases` must cascade by `caseId` in the same way. Record
  that obligation in §8's guardrail list.

### 9.4 Production-enablement-blocking condition

- **SR-019-9. Retention of operator identity, and erasure consistency (the §6 duplication
  question).** After SR-019-6, the only personal data this collection holds is
  **`actor.accountId` for security-company operators.** That is a real **retention extension**,
  not a neutral duplicate. Today an operator's per-case activity is held in `admin_access_log` for
  **12 months** (ADR-0006 §14.2 / FU-A8; account-deletion runbook §5, "Retain"). By contrast,
  `recovery_cases` documents are retained **indefinitely** (runbook §5 table row). If the events
  collection simply follows its parent case, as §6 suggests, operator identity would be kept
  indefinitely, outliving the audit trail it duplicates. That conflicts with AUD-7(a)'s
  equal-periods principle.
  **Default, which applies unless `compliance-specialist` rules otherwise in writing:** event
  documents live as long as their parent case (SR-019-8). `actor.accountId` is **cleared to `null`
  12 months after `occurredAt`**, keeping `actor.type` and `actor.partnerOrganizationId`, by a
  field-level purge job modelled on `lib/police-report-retention.ts`: an idempotent `updateMany`,
  a `retention_job_runs` record, and a `legalHold` override read from the parent case. This is the
  one sanctioned non-append write to the collection. It runs as a job outside the repository
  module, so SR-019-8's export test still holds. Org-level attribution is all that §7's
  response-time metrics and the scorecard need, so no product capability is lost.
  `compliance-specialist` also needs to add a `recovery_case_events` row to the
  account-deletion runbook §5 table. Until the ruling exists or the default job is built, the
  append calls must stay disabled in production behind an env flag that defaults to off. In test
  and dev environments they run.

### 9.5 Pre-ruled constraints for the future partner-visibility question (§5, last paragraph)

This is not authorised here, and it needs its own Stage 8 review. That review starts from these
constraints, which I am setting now so the admin build does not paint itself into a corner:

1. A partner org may see only events whose `occurredAt` falls inside an interval in which that org
   held the case (claim/reassign-in until release/reassign-out or terminal), plus the single event
   that ended its holding.
2. **Other orgs' operator `actor.accountId` values are never disclosed to a partner.** At most it
   sees `actor.type` and "another organisation", and whether even the other org's id is shown is a
   PDM question for `compliance-specialist`. Cross-org disclosure of personnel identity is a
   lateral-information channel between competing partners, and it is denied by default.
3. The customer's identity stays covered by PDM-1. Since SR-019-6(a) stores none on events, this
   holds by construction.
4. The partner read path must be its own repository method that applies the predicate at query
   level, following the pattern of `claimedCaseVisiblePredicate`/`findByIdForPartnerOrg`. It
   **never** filters the admin method's output in memory.
5. Design assumption, per this role's standing practice: the partner-org reader is a malicious
   insider. Nothing in the partner response may help them locate, time, or profile a customer or
   another org's operators.

### 9.6 Threat-model delta and risk register

- **STRIDE, new collection.** *Spoofing*: actor derived server-side only (SR-019-1). *Tampering*:
  no update path exists in the app (SR-019-8). The collection is not tamper-evident at the DB layer,
  which is accepted because it is not the audit record (§9.2). **FU-019-B:** when ADR-0008's Mongo
  provisioning lands, grant the app role only `insert`/`find` on this collection (an Atlas custom
  role), with the retention job running under a separate role. *Repudiation*: resolved against
  `admin_access_log`, not this collection. *Information disclosure*: admin-only, disclosure-audited
  (SR-019-7), with no location, police-report, or free-text data (SR-019-4). *DoS*: the read path is
  rate-limited and paginated, and growth per case is bounded by the length of the state machine
  plus the rate-limited `/messages` events. *Elevation*: no new privilege. Writes ride existing
  authorised routes.
- **Account takeover.** A compromised operator account gains nothing new from this collection, and
  the events it generates are attributed to that account, which helps detection. A compromised
  admin can already read case data, so this adds operator-identity history to what such an admin
  can read, and that read is disclosure-audited.
- **Risk register additions:** **RR-019-A** silent timeline gap (SR-019-2(d)), owners
  `backend-engineer`/`site-reliability-engineer`. **RR-019-B** operator-identity retention pending
  the compliance ruling (SR-019-9), owner `compliance-specialist`. **FU-019-B** DB-layer append-only
  role, owner `database-architect`, gated on ADR-0008. Pre-existing cases get no backfill and their
  history starts at the deploy date. The future UI must state this rather than show a partial
  timeline as complete (owner `frontend-engineer`, at UI time).

### 9.7 Gate status

| Signatory | Status |
|---|---|
| `cybersecurity-architect` | **Approve with conditions** (SR-019-1 to SR-019-8 build-blocking, SR-019-9 production-enablement-blocking), 2026-10-29 |
| `security-engineer` | Pending. Verifies SR-019-1 to SR-019-8 in implementation, and the export-set and strict-schema tests in particular |
| `compliance-specialist` | Pending. Rules on SR-019-9 (accept the default or set a different period) and adds the runbook §5 row |

Development may start when the two pending signatures are recorded in new sections below this one.

---

## 11. Stage 8 Compliance Review — `compliance-specialist` (2026-10-29)

**Appended section.** §1–§9 are not modified. **§10 is reserved for `security-engineer`'s
parallel Stage 8 section.** This section is numbered §11 so the two appends cannot collide,
whichever one lands first.

**Verdict: APPROVE WITH CONDITIONS (compliance sign-off).** I accept the chair's SR-019-6, SR-019-7
and SR-019-9 as compliance requirements, not only security ones, and I rule on RR-019-B below.
Development may start on the compliance signature. **Production enablement may not start on this
ruling alone** (§11.4).

**Regime note (pre-approval checklist item 1).** This ruling is made under POPIA. TD IT Solution is
the Operator and the Client is the Responsible Party (`10-data-protection…` §6). Partner-org
operators are data subjects, with lawful basis s11(1)(c)/(f) (ADR-0006 §14.6 item 2). The
collection holds no payment data, so PCI-DSS is not engaged. GDPR is not triggered by anything in
this design. It would only be engaged by a decision to serve EU data subjects, and that decision
has not been made. The insurance-recordkeeping floor (F-4-OI-3, runbook §5.3) attaches to
`policies` and to claims, not to recovery-case handler attribution. If the Client's licensing
confirmation says otherwise, this ruling must be revisited.

### 11.1 Ruling on RR-019-B: operator-identity retention

**Ruling: the 12-month period stands. I adopt SR-019-9's default with four specifications.**
RR-019-B closes as **ruled**. It does not close as **enforced** until §11.4 is met.

1. **Period: 12 months from `occurredAt`.** It is not longer, because the only purpose that needs
   *operator-level* attribution is oversight and dispute handling (who on the partner's staff
   handled this case). That purpose is served authoritatively by `admin_access_log`, which keeps
   the same fact for 12 months (ADR-0006 line 50, ratified and re-confirmed against FAIS). §9.2
   rules that this collection is non-authoritative and not tamper-evident. Holding the identity
   longer in the weaker copy serves no purpose the authoritative record doesn't already serve.
   That would fail POPIA s14(1), and it would create the AUD-7(a) asymmetry. Response-time metrics
   (§7) and the scorecard need only org-level attribution, which is kept. It is not shorter,
   because clearing before the audit trail does would remove attribution from the product-facing
   view during the window when customer complaints about case handling realistically arrive. The
   audit record would still hold the same fact, so nothing would be gained.
2. **Lockstep, not a coincidence.** The purge job's period must come from the **same constant**
   that defines `admin_access_log` retention. It must not be a second literal `12` that can drift.
   If the audit retention period is ever changed (it is "asserted by us, not instructed", G-3),
   this one changes with it, and the change needs a compliance note.
3. **The clock runs from `occurredAt` even while the parent case is still open.** I considered
   anchoring on `closedAt` and rejected it. That anchor would keep operator identity on
   long-running cases beyond the audit trail, which brings back the asymmetry in item 1. The
   current holder org stays on `recovery_cases.partnerOrganizationId` and on the event's
   `actor.partnerOrganizationId`, so no operational capability is lost.
4. **Legal hold must cross into this collection.** The job skips events whose parent case has
   `legalHold: true`, as SR-019-9 specifies. In addition, the C-13/FU-A7 cross-store hold process
   must list `recovery_case_events` in its scope. If an operator-misconduct hold is placed on
   `admin_access_log` rows, the matching event rows must be held as well, so the purge doesn't
   produce a half-preserved evidence set. The job's `retention_job_runs` record must carry the
   rows skipped for hold (C-13(g)).

**Erasure interactions (closes the second half of §6's open question):**
- *Operator erasure request inside the 12 months:* **retain** until the scheduled clear. This is
  the same reasoning as `admin_access_log` (runbook §5.1). Display already degrades to "deleted
  user" through read-time resolution (SR-019-6(b)), so no write is needed.
- *Customer erasure request:* SR-019-6(a) means no customer id is stored. Events follow the parent
  case, and the parent case is **Retain** (runbook §5.2). An open case is a deferral ground
  (§5.5(2)). If `recovery_cases` is ever erased or anonymised, the cascade is SR-019-8's.
- *Pre-existing finding, not this feature's to fix:* `recovery_cases` (and therefore these events,
  since they link to the customer through `caseId`) has **indefinite** retention, apart from the
  police-report triple. That is an open retention gap on the parent. I record it here so that
  nobody reads this ruling as approving it.

### 11.2 Job specification (binding on whoever builds it)

- `jobId: 'recovery_case_event_actor_purge'` is added to `RetentionJobId` **and** to the
  `retention_job_runs` `$jsonSchema` `jobId` enum (`backend/src/db/retention-job-runs-collections.ts`
  lines 22 and 43). The enum currently lists only the two existing jobs, so without a validator
  update (`collMod`) the run record will be rejected.
- Filter: `occurredAt <= cutoff`, `actor.accountId` of `$type: 'string'`, parent case not on legal
  hold. Update: `$set: { 'actor.accountId': null }` only. `actor.type`,
  `actor.partnerOrganizationId` and every other field are untouched. The job is idempotent.
- Cadence: at least monthly. The maximum overrun past 12 months is therefore about 31 days, and the
  privacy notice and partner clause (§11.3) must describe the period as "12 months" consistently
  with this.
- Tests: the job clears only rows past the cutoff, preserves `type` and `partnerOrganizationId`,
  skips held cases, writes a `retention_job_runs` record including the skip count, and stays
  outside the repository module (SR-019-8's export test unchanged).
- Index support is `database-architect`'s call.

### 11.3 Confirmation of SR-019-6 and SR-019-7 on compliance grounds

- **SR-019-6: confirmed as a compliance requirement.** (a) Storing a null customer id is the
  minimisation outcome POPIA s10 requires, because the id is fully recoverable from the parent.
  (b) Opaque operator UUIDs only, with no name, email or role denormalised. Any denormalised
  identity field would itself need a retention ruling, so adding one later reopens this section.
- **SR-019-7: confirmed.** The `recordDetail` disclosure row written fail-closed **before** the
  response, with `targetAccountId` set to the case owner, is what makes the read answerable under a
  customer's s23 access request. The response tells an admin which partner staff handled that
  customer's theft case. No purpose field is required, consistent with ADR-0006 §14.7 (admin reads,
  Phase 1). **This exemption does not carry over to the future partner read path (§9.5).** Partner
  access requires a mandatory purpose/case reference under §14.7's second bullet. The
  default-off flag in SR-019-7(f) is accepted.
- **§9.5 item 2, the PDM question put to me:** for the *future* partner surface, the ruling now is
  that another org's **identity** (its `partnerOrganizationId`) is also **not disclosed** to a
  later claimant by default. The partner sees only that "another organisation" held the case.
  Disclosing it needs a stated purpose in that feature's own Stage 8. This is a default, not a
  final ruling on that surface.
- **Operator notification (s18).** ADR-0006 C-15 already requires a partner-agreement clause
  telling operators that their access is logged. **That clause's scope must be extended to state
  that case actions are recorded in case history, attributed to the individual operator for 12
  months and to the organisation for the life of the case.** It is not an additional gate, because
  C-15 already blocks the first production partner-operator account and no events can be written
  without one. It must be in the clause text when that clause is drafted.

### 11.4 The production-enablement flag: is it satisfied by this ruling?

**No. The ruling is necessary but not sufficient.** SR-019-9 reads "until the ruling exists *or*
the default job is built". I am tightening that to **and**: I adopted the default, so the job is
the enforcement mechanism, and this program does not accept policy-only retention. The existing
audit trail shows why that matters: `admin_access_log` has a 12-month policy and a purge index
(`admin_access_log_createdAt_purge_partial`, `feature004-collections.ts:464`), but **no purge job
exists anywhere** in `backend/src` or `backend/scripts` (checked 2026-10-29). The flag may flip to
on in production only when all of the following hold:

1. This ruling is recorded. **Done.**
2. `recovery_case_event_actor_purge` is built to §11.2, tested, and **actually scheduled**, and
   `security-engineer` verifies it at Stage 10. "Nothing reaches 12 months for a year" is not an
   acceptable reason to ship without it.
3. The runbook §5.2 row exists. **Done in this change**
   (`docs/organization/runbooks/account-deletion-request-runbook.md`).
4. The C-15 partner clause includes the case-history scope from §11.3. This is coupled to the
   existing C-15 trigger rather than being a new gate.

**New finding, filed separately from OB-04 so it doesn't block it: F-019-C1.** The
`admin_access_log` 12-month retention (FU-A8) is ruled but **not enforced**, because no purge job
exists. Owners are `database-architect` and `backend-engineer`, and it is a go-live blocker under
the same reasoning as §11.4(2). Until it is built, the "equal periods" relationship in §11.1 holds
at policy level only. The events purge must not wait for it. When this collection's job is built
first, it is correct and the audit trail is the one out of compliance.

### 11.5 Gate status (compliance)

| Signatory | Status |
|---|---|
| `compliance-specialist` | **Approve with conditions**, 2026-10-29. RR-019-B ruled (12 months, lockstep, `occurredAt` clock, cross-store hold). Production enablement requires §11.4 items 1–4. F-019-C1 filed |

## 10. `security-engineer` second signature under §9.7's joint-gate rule (2026-10-29)

**Appended section. §1–§9 above are unmodified; where I disagree I cite the section rather than
edit it.** This feature is design-only — no code exists yet under `backend/src/repositories/
recovery-case-events.ts` or any route (confirmed by grep: no such file, no `/events` route under
`recovery-cases`). My review is therefore of the chair's conditions for completeness and
sufficiency against the code they target (`recovery-cases.ts`, `security-cases.ts`, `recovery.ts`,
`support-lookup.ts`, `mongo-pagination.ts`), not a Stage 10 implementation verification — that
happens once SR-019-1 through SR-019-8 are built, per §9.7.

### 10.1 Independent spot-checks against the current code

I re-derived, rather than took on trust, the two code-versus-doc discrepancies §9.1 relies on most:

- `mongoCursorFilter` (`backend/src/lib/mongo-pagination.ts:70`) is confirmed hard-wired to
  `createdAt` descending with an `_id` tiebreak, as §9.1 states. SR-019-7(d)'s recommended fix
  (reuse the helper as-is, sort `{ createdAt: -1, _id: -1 }`, let the UI reverse for display) is the
  correct minimal-risk choice — it avoids introducing a second, bespoke cursor encoder for a
  security-adjacent read path with no existing test coverage to lean on.
- The five status-mutating `recoveryCasesRepo` methods each call their own `new Date()` internally
  (`recovery-cases.ts:577,742,851,917,960`, confirmed), none accept an injected timestamp. SR-019-3's
  fix (derive `occurredAt` from the CAS result's own `updatedAt`, which none of the tier projections
  exclude) is sound and keeps the repository's compare-and-set surface untouched, consistent with
  §4's own stated goal of not reopening that logic.

### 10.2 Conditions I confirm are sufficient as written

**SR-019-1 (trusted-source fields only), SR-019-4 (structural location/PII exclusion via strict
discriminated-union zod schema, no spreading into `insertOne`), SR-019-6 (actor minimisation),
SR-019-7(a)–(e) (admin-only, rate-limited, disclosure-audited, allowlist-serialized read path), and
SR-019-8 (append-only held structural by export-set test, cascade deletion handled explicitly) —
each independently closes the specific risk class it targets (authZ/IDOR, NoSQL
object-injection/field-creep, PII minimisation, PDM-8 disclosure, orphaned-PII-on-delete) using
mechanisms already proven elsewhere in this codebase (`OFFER_TIER_FIELD_EXCLUSION_PROJECTION`-style
structural guarantees, the existing admin rate-limiter class, the existing
`adminAccessLog.recordDetail` disclosure pattern). I have no changes to propose to any of these five.

**SR-019-2's ruling that §4.1 is wrong is correct, and the replacement is right-sized.** A 5xx for a
succeeded mutation is a worse outcome than a detectable, alertable gap in a non-authoritative,
non-tamper-evident collection that §9.2 is explicit is not the audit record. Deferring the
reconciliation job itself to RR-019-A rather than build-blocking it is the correct call *given* the
`append_failed` alert exists as an interim detective control and the admin UI is gated from shipping
while RR-019-A is open (SR-019-2(d), reinforced by SR-019-7(f)'s env-flag gate). I would not accept
this deferral without both of those two tethers being present — they both are.

**SR-019-9 (retention/erasure) is the right production gate and the default is defensible**,
mirroring the Feature 011 `police-report-retention.ts` mechanism this role already verified in §13
of `011-saps-case-reporting/security-review.md` above (same `retention_job_runs` evidencing, same
`legalHold` override, same field-clear-not-document-delete pattern). Routing the ruling to
`compliance-specialist` rather than defaulting silently is consistent with this platform's standing
practice (the same posture Feature 011's RR-011-3 took with `cto`).

### 10.3 Gaps the chair's review did not cover — additions, not corrections

1. **Stage 8 manifest coverage is not mentioned anywhere in §9, and Feature 011's own Stage 8 record
   (just re-reviewed by this role today, `docs/features/011-saps-case-reporting/security-review.md`
   §6/§10.3) shows exactly how this gap gets exploited: a new route lands absorbed into an unrelated
   feature's waiver, and `verify-stage8-manifest.mjs` reports PASS having never looked at it.** When
   `GET /v1/admin/recovery-cases/:caseId/events` is built, it must get its own
   `docs/organization/gates/stage8-manifest.json` entry pointing at this document (and, if the SR-019-9
   purge job gets its own CLI script per the `police-report-retention-purge.ts` pattern, that script
   should be named in the same entry or a sibling one) — landing in the same commit as the route,
   per Feature 011's SR-011-6 precedent. I add this as **SR-019-10**, build-blocking at the same point
   SR-019-7's route is built, owner `backend-engineer`, verified `security-engineer`.
2. **SR-019-2(c)'s dedup key only protects against the same server-side attempt being replayed
   (e.g. an internal retry reusing the same `auditRequestId`), not a client-level HTTP retry that
   generates a fresh request and therefore a fresh `auditRequestId`.** That residual gap is already
   implicitly covered by RR-019-A's "may be incomplete" framing and does not need a new condition,
   but §9.3's SR-019-2(c) text reads as if the dedup index closes the retry problem generally. I'd
   ask that the eventual implementation PR's comment on that index say explicitly what it does and
   does not dedupe, so a future reader doesn't assume broader protection than exists. Not a
   build-blocker; a documentation precision for whoever builds it.
3. **Log-injection on the one new unconditional write path (`case_created`).** SR-019-2(a) already
   restricts the failure-path log to `caseId`/`eventType`/`auditRequestId`/error class, which is
   sufficient, but I'd note for the implementer that `caseId` in that log line should be the DB
   `_id` (per SR-019-1, never `req.params.caseId`) even in the failure-log path — a failed append
   logging an attacker-influenced raw param would reopen the exact injection-into-logs concern
   SR-019-1 closes for the data path. Worth a one-line test at Stage 10, not a new condition.

None of the above change the verdict or require a new round of design. They are implementation-time
precision items for whoever picks this up, consistent with the chair's own framing that
SR-019-1–8 are verified by `security-engineer` "at Stage 10" against actual code.

### 10.4 Verdict

**CONCUR — Approve with conditions, joint signature under §9.7.** I find the chair's SR-019-1
through SR-019-9 complete for every realistic exploitation path against this design (IDOR, NoSQL
object/field injection, PII over-retention, disclosure to the wrong party, location-field creep,
silent integrity gap), correctly scoped between build-blocking and production-enablement-blocking,
and grounded in mechanisms this codebase has already proven out on an adjacent, harder problem
(Feature 011's police-report exclusion/retention discipline). I add one new condition
(**SR-019-10**, Stage 8 manifest coverage for the eventual route) based on a gap this same review
pass found live in Feature 011 today, and two non-blocking implementation notes (§10.3.2–3).

| Signatory | Status |
|---|---|
| `cybersecurity-architect` | Approve with conditions (SR-019-1 to SR-019-8 build-blocking, SR-019-9 production-enablement-blocking), 2026-10-29 — §9 |
| `security-engineer` | **Concur — approve with conditions**, adds SR-019-10 (Stage 8 manifest entry, build-blocking at route build time), 2026-10-29 — this section |
| `compliance-specialist` | Pending. Rules on SR-019-9 and adds the runbook §5 row |

**Does not discharge:** Stage 8 as a whole — `compliance-specialist`'s signature on SR-019-9 is
still outstanding and is the third required signature. No code exists yet to verify at Stage 10.

---

## 12. `cto` ruling — OB-03 Tier A event mapping and wiring sequence (2026-11-09)

**Appended section. §1–§11 are not modified.** This answers the open question recorded in the
header comment of `backend/src/repositories/recovery-case-events.ts` (lines 54–59): how OB-03
Tier A's `accept`, `decline` and hand-back routes map onto this event stream. I checked it against
`recovery-cases.ts` (`acceptDispatchedCase`, `declineDispatchedCase`, `handBackAcceptedCase`, the
admin dispatch methods) and `security-cases.ts` (lines 404–760) on 2026-11-09.

### 12.1 Mapping rulings

1. **`accept` maps to `case_claimed`. Approved.** The existing branch fits as written: the actor is
   the operator, `fromStatus: 'open'` comes from the pre-read, `toStatus: 'investigating'` comes from
   the result, `fromPartnerOrganizationId: null`, and `toPartnerOrganizationId` is the org. The
   from-org is `null` even though `partnerOrganizationId` was already set while the case was
   pending. That is deliberate, because the event records the start of a *holding*, not a field
   diff. The call site must carry a comment saying so. `occurredAt` is the returned document's
   `updatedAt` (SR-019-3). Because `acceptDispatchedCase` writes twice, a miss on the second
   (status) CAS returns `status: 'open'`. The schema then rejects the append and SR-019-2(a) logs it.
   That outcome is correct. Do not loosen the schema to absorb it.
2. **Mapping hand-back to `case_released` is rejected.** `handBackAcceptedCase` keeps `status`, but
   the `case_released` branch requires `toStatus: z.literal('open')`. Every hand-back append would
   fail validation and become a permanent silent gap. Widening `case_released` would weaken the
   pool-model invariant and merge two different transitions. Pool release goes to the open pool and
   resets status. Hand-back goes to the admin dispatch queue and keeps status. **Ruling: add a new
   event type, `case_handed_back`.** It uses the operator actor, `fromStatus === toStatus` (any
   status, with equality enforced by a union-level refine), `fromPartnerOrganizationId` set to the
   org, `toPartnerOrganizationId: null` and `closeReason: null`. The hand-back body's `reason` must
   never be copied in (SR-019-4(d) applies by analogy).
   This adds no field, no actor type and no new class of PII, so it needs a **Stage 8 delta from
   `cybersecurity-architect`** (chair addendum plus `security-engineer` concurrence) before it is
   built. It does not need a new compliance signature, because the retention position (RR-019-B)
   does not change.
3. **`decline` gets no event in this increment. I reject the reasoning but accept the
   sequencing.** "The org never held the case, so there is nothing to record" is the wrong test.
   This stream records case lifecycle transitions, and `declineDispatchedCase` is a real CAS
   mutation (`partnerOrganizationId` org→null, `dispatchStatus` pending→null). Without that event,
   a dispatch-mode timeline shows an unexplained gap between `case_created` and `case_claimed`, and
   dispatch-to-accept latency and decline rate are exactly OB-03's response-time questions.
   A decline event on its own would still be incoherent, though. The pending period starts with an
   **admin** `dispatchCase`, and no event type or actor type exists for that today. The union has
   `support_agent`, not `admin`. A per-org decline record is also commercially sensitive between
   competing partners (§9.5 items 1–2). So decline is deferred into a **dispatch-lifecycle event
   family** (Phase B, §12.3), not dropped. The decline call site gets a comment pointing here, plus a
   test asserting that it appends nothing.

### 12.2 Wiring sequence (Phase A, buildable now)

Sub-tasks run in order, each its own `backend-engineer` dispatch and commit. A2 and A3 can run in
parallel. A4 depends on A1, A2 and A3.

- **A1. Plumbing and `case_created`.** (a) Call `bootstrapRecoveryCaseEventsCollections` from
  `db/mongo-bootstrap.ts` and add it to `db/catalog-verify.ts`. It is not called today, so the
  SR-019-2(c) dedupe index does not exist in any real database. (b) Add an env flag for appends:
  default off in production, on in dev and test (SR-019-9 / §11.4). It does not exist yet.
  (c) Add one shared helper that applies SR-019-2(a): check the flag, run `append` in its own
  try/catch, emit the `recovery_case_event_append_failed` structured log containing only the DB
  caseId, `eventType`, `auditRequestId` and the error class, increment a counter, and never throw.
  (d) SR-019-8: add the cascade `deleteMany` to `scripts/seed-demo-security-dashboard.ts`. It is
  missing today. (e) Wire `case_created` in `recovery.ts` (customer actor with `accountId: null`,
  `occurredAt` set to `createdAt`).
- **A2. Pool model (`directedDispatchEnabled` off) in `security-cases.ts`.** Wire `claim`,
  status `PATCH`, `release`, `reassign` and `/messages` to the five existing types. Append after a
  non-null CAS result and before the response (§4, SR-019-5(b)). Take every field per SR-019-1 and
  SR-019-3.
- **A3. `case_handed_back` Stage 8 delta.** A document-only `cybersecurity-architect` addendum to
  this file, per §12.1(2).
- **A4. Dispatch model (flag on) in `security-cases.ts`.** Add the `case_handed_back` schema branch
  and its tests to `recovery-case-events.ts`. The export-set test stays unchanged. Then wire
  `accept` to `case_claimed`, the dispatch status `PATCH` to `status_changed`, the dispatch-branch
  `/messages` to `customer_contact_initiated`, and hand-back to `case_handed_back`. `decline`
  appends nothing and gets a test asserting that.
- **A5. Stage 10.** `security-engineer` verifies SR-019-1..8 against the wired code, plus §10.3.3
  (the failure log uses the DB id), followed by a `qa-engineer` pass.

### 12.3 Phase B (not dispatchable yet)

The dispatch-lifecycle family is `case_dispatched`, `case_dispatch_declined`, `case_recalled`
(`reDispatchToNull`) and `case_redispatched` (direct or approved). It also brings in an `admin`
actor type. It needs three things: a `backend-architect` design delta; a full three-signature
Stage 8 that rules on admin-identity retention and on whether decline records are visible to
partners; and the `pendingApproval` request explicitly ruled as a non-event, since it does not
change the holding.
**Interim condition:** the SR-019-7 admin timeline read path must not present dispatch-mode cases
as complete until Phase B lands. If it ships first, it must show a "dispatch/decline history not
recorded" caveat. This adds to the RR-019-A caveat rather than replacing it.

### 12.4 Production enablement (unchanged, restated)

§11.4 still governs. One more fact recorded here: `backend/scripts/recovery-case-event-actor-purge.ts`
exists, but `render.yaml` has no schedule for it, so §11.4(2) ("actually scheduled") is **not
met**. Owner: `devops-engineer`.

---

## 13. Stage 8 delta — `case_handed_back` (`cybersecurity-architect`, chair, 2026-11-09)

**Appended section. §1–§12 are not modified.** This is the A3 sub-task from §12.2: the chair
addendum that §12.1(2) asks for. `security-engineer` concurrence is still needed in a new section
below this one. The review is limited to the new event type. Anything not mentioned here is
governed by §9–§11 as already signed.

**Verdict: APPROVE WITH CONDITIONS (delta).** The existing Stage 8 approval covers this event
type, subject to two build-blocking conditions (SR-019-11 and SR-019-12) for A4. One pre-existing
OB-03 lifecycle finding came up during the check (F-019-S1). It does not block this event type
and is routed separately.

### 13.1 Checking the "no new field / actor / PII" claim against the code

I read these on 2026-11-09: `backend/src/repositories/recovery-case-events.ts` (the whole file),
`backend/src/lib/recovery-case-event-actor-purge.ts` (the base filter),
`backend/src/routes/security-cases.ts` (lines 99–105 and 664–733, the dispatch-mode hand-back
branch), and `backend/src/repositories/recovery-cases.ts` (`handBackAcceptedCase`,
`dispatchClaimedCaseVisiblePredicate`, `dispatchCase`, `reDispatchToNull`).

| Claim in §12.1(2) | Holds? | Evidence |
|---|---|---|
| No new field | **Yes** | Every field the event needs (`fromStatus`, `toStatus`, `from/toPartnerOrganizationId`, `closeReason`, `auditRequestId`) is already in `RecoveryCaseEventDbRow`, and `append()` builds the document field by field from that fixed set. The SR-019-4(c) key-set snapshot test should not change. If it has to change, the A4 PR has gone outside this delta. |
| No new actor type | **Yes** | `operatorActorSchema` already exists and is strict (`accountId` and `partnerOrganizationId` non-empty strings). It is the same actor as `case_released`/`case_reassigned`. No `admin`, `support_agent` or `system` actor is involved. |
| No new class of PII | **Yes** | The only personal data is `actor.accountId`, an opaque operator UUID, which SR-019-6(b) already covers. The customer is not identified on the event (SR-019-6(a) carries over unchanged). There is no location data and no free text. |
| 12-month retention already covers it | **Yes, structurally** | `buildRecoveryCaseEventActorPurgeBaseFilter` selects on `actor.type: 'security_company_operator'` and `occurredAt`. It does **not** enumerate event types, so `case_handed_back` rows get cleared with no change to the job. This is why I agree that no new compliance signature is needed. |
| `reason` never copied | **Yes, and it must stay that way** | `releaseBodySchema` is `z.enum(HAND_BACK_REASONS)` (`recovered_independently`, `unable_to_proceed`, `agreement_lapsed`, `other`). It is a closed enum, not free text, so copying it would not create a PII risk. It is still excluded, for two reasons. First, it would be a **new field**, which voids this delta. Second, a per-org hand-back reason is commercially sensitive between competing partners in the same way §12.1(3) treats decline records. The authoritative copy already exists in the `admin_access_log` row (`reason: 'case_handed_back:<code>'`). |

### 13.2 Does "any status" create a new information-disclosure shape?

**No, not on the only read path that exists or is authorised.**

- *Admin reader (SR-019-7):* the `(fromStatus, toStatus)` pair on a hand-back is the case's status
  at that moment. The admin can already see it on the case document, and it can be derived from
  the case's own prior `case_claimed`/`status_changed` events. The event adds the fact and time of
  the hand-back and which org handed it back. All three are already in Trail B, and the
  disclosure-audited read covers them (SR-019-7(c)).
- *Terminal statuses included:* `dispatchClaimedCaseVisiblePredicate` keeps `recovered`/`closed`
  cases inside the PDM-4 wrap-up window `accepted`. `handBackAcceptedCase`'s CAS does not filter
  on status, so a hand-back with `fromStatus === toStatus === 'recovered'` is a real, reachable
  event. Recording it with `closeReason: null` is correct. `closeReason` describes the transition
  *into* a terminal state, and that transition is recorded on the earlier `status_changed` event.
  Copying the case's `closeReason` onto the hand-back event would duplicate it and would misstate
  what this event records. It reveals nothing new to an admin.
- *Future partner reader (§9.5):* this is the only place where any new shape appears, and §9.5 already
  covers it with one clarification. **§9.5 item 1's "the single event that ended its holding" must
  be read as including `case_handed_back`, alongside `case_released`, `case_reassigned` and a
  terminal `status_changed`.** A later claimant org must not see an earlier org's hand-back. It is
  outside the later org's holding interval, so item 1 already excludes it. It is also the same
  kind of commercially sensitive cross-partner signal as a decline, so §11.3's "another
  organisation" default applies. Whoever designs the partner path, and the Phase B Stage 8 (§12.3),
  must take this as given and not reopen it.

### 13.3 Build-blocking conditions for A4

- **SR-019-11. Source both statuses from the CAS result, not the pre-read.** §12.1(2) requires
  `fromStatus === toStatus`. SR-019-1 would ordinarily let `fromStatus` come from the pre-read
  (`existing.case.status`). For this event, that produces a **race-induced silent gap**. The
  dispatch hand-back CAS (`handBackAcceptedCase`) matches on `partnerOrganizationId` and
  `dispatchStatus: 'accepted'` only, **not on status**. A concurrent dispatch-mode status `PATCH` by
  another operator of the same org, landing between the pre-read and the CAS, gives a mismatched
  pair. The union-level equality refine then rejects the append, and the timeline permanently
  loses a real hand-back (RR-019-A). Hand-back does not change status by construction, so the
  truthful value for both fields is the status on the returned document. Required sourcing:
  `fromStatus` and `toStatus` = `handedBack.status`. `fromPartnerOrganizationId` = `req.auth`'s
  org (the CAS matched on it). `toPartnerOrganizationId` = `handedBack.partnerOrganizationId`
  (which must be `null`; the branch schema enforces this). `closeReason` = `null`. `occurredAt` =
  `handedBack.updatedAt` (SR-019-3). `caseId` = `handedBack.id` (SR-019-1). The equality refine
  stays in place as a guard against call-site regressions. It must not become the mechanism that
  drops races. I am **not** asking for a status term to be added to `handBackAcceptedCase`'s CAS.
  That would be a lifecycle change to an OB-03 transition, outside this delta (see F-019-S1).
- **SR-019-12. Schema and test shape for the new branch.**
  (a) The `case_handed_back` branch is `.strict()` like every other branch. It uses
  `operatorActorSchema`, `fromStatus`/`toStatus: statusEnum`,
  `fromPartnerOrganizationId: z.string().min(1)`, `toPartnerOrganizationId: z.null()`,
  `closeReason: z.null()`, and `auditRequestId: auditRequestIdSchema`.
  (b) The equality check is a refine on the union (`superRefine` on
  `newRecoveryCaseEventInputSchema`, scoped to `eventType === 'case_handed_back'`), as §12.1(2)
  rules. It must not be done by loosening any other branch. `NewRecoveryCaseEventInput` must still
  infer as the discriminated union, so the call sites keep their compile-time narrowing.
  (c) Tests: a hand-back with an unequal pair is rejected; one with a non-null
  `toPartnerOrganizationId` or `closeReason` is rejected; a `customer` actor is rejected; a body
  carrying `reason` (plus the full SR-019-4(c) forbidden-key list) is rejected; the
  terminal-status case (`'recovered'`→`'recovered'`) is accepted. Add a route-level test that the
  hand-back append is skipped when the CAS returns `null` (§4, post-CAS only), and one that a
  thrown append still returns `200 returned_to_queue` (SR-019-2(a)). The module export-set test
  and the inserted-document key-set snapshot stay **unchanged**.
  (d) Update the stale header comment in `recovery-case-events.ts` (lines 54–59). It still says
  hand-back/decline map onto `case_released`, which §12.1(2) has superseded.

### 13.4 Finding raised during the check (not a blocker for this event type)

- **F-019-S1 (Medium): a terminal case can be handed back and then re-dispatched to a new org.**
  The dispatch-mode hand-back branch checks only `tier === 'claimed'`. The pool-mode `release` at
  lines 740–747 also requires `investigating`/`tracking`; the dispatch branch has no such check.
  `dispatchCase` and `reDispatchToOrgDirect` do not filter on status either. So a
  `recovered`/`closed` case in its wrap-up window can be handed back to the admin queue and then
  dispatched to a **second** partner org. On accept, that org gets claimed-tier access to a
  customer's finished theft case. No purpose supports that, and it widens PDM-1 disclosure. I found
  no ruling on this in `security-review-ob03-dispatch-location-grants.md`. SR-OB03-A5 rules on
  carry-over of terminal cases, not on re-dispatching them. This is an OB-03 lifecycle question,
  not an event-model one: the event correctly records whatever the route does. Owners:
  `backend-architect` (decide whether hand-back and dispatch should reject terminal cases) and the
  OB-03 Stage 8 signatories. It is routed to `cto` for scheduling. It does not block A4.

### 13.5 Gate status (delta)

| Signatory | Status |
|---|---|
| `cybersecurity-architect` | **Approve with conditions**, 2026-11-09. `case_handed_back` is covered by §9–§11. SR-019-11 and SR-019-12 are build-blocking for A4. F-019-S1 is filed against OB-03 |
| `security-engineer` | Pending concurrence in a new section below this one |
| `compliance-specialist` | **Not required.** §13.1 confirms that the RR-019-B purge applies by actor type and is event-type-agnostic, and that no new field or PII class is added. This holds only while SR-019-12(c)'s unchanged key-set snapshot holds |

A4 may wire `case_handed_back` once `security-engineer` concurs.
