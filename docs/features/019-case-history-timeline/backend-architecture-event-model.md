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
