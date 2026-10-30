# OB-03 — Directed Dispatch and Location Share-Grants — Security Review (Stage 8)

**Status:** **SPLIT VERDICT.**
- **Tier A (dispatch, no location: ADR-0017 D1, D2, and the admin/partner half of D4):** **APPROVED WITH
  CONDITIONS for Stage 9 build.** `backend-engineer` may start. Conditions SR-OB03-A1 to A9 must be in
  the code before the affected router is merged. `DIRECTED_DISPATCH_ENABLED` stays OFF in every
  non-development environment until Tier A's own Stage 10 passes and the production preconditions in §5
  are met.
- **Tier B (location sharing: D3 and the customer-grant/location half of D4):** **BLOCKED.** The Stage 7
  design needs another pass (SR-OB03-B1 to B12) **before** Stage 9 starts on any Tier B route, repository
  write path or sweeper step. This is separate from the unbuilt preconditions (CR-3, CS-3, P-1 to P-7,
  CSA-R4-*), which block the flag and are listed in §6. Repository and collection code for the two grant
  collections may be written as part of the Tier B re-design, but must not be merged until B1 to B3 are
  fixed in the Stage 6 doc.

**Date:** 2026-10-30
**Lifecycle stage:** 8 — Security Review (hard gate). **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate status — INCOMPLETE.** This section is the chair's review. It does **not** discharge Stage 8
alone. `security-engineer` (R) concurrence: **not yet recorded.** `compliance-specialist` (C) concurrence:
**not yet recorded.** Under `02-feature-lifecycle.md` and root `CLAUDE.md`, Stage 8 is discharged only when
all three roles sign. The Tier A greenlight above is the chair's position. It becomes the gate's decision
only when the other two concur in their own sections of this file (append below; do not edit this one).

**Scope of this gate (what was reviewed):**
- `docs/organization/adr/0017-security-partner-directed-dispatch-and-location-share-grants.md`: the full
  ADR, including CS-1 to CS-9 (mine), DB-1 to DB-6, BA-1 to BA-6, CR-1 to CR-9 and the OQ-1/OQ-2 rulings,
  R-1 to R-6, the R-4 answer (CSA-R4-1 to 5), the R-5 confirmation, the OQ-3 note and the `solution-architect`
  D3.4 note.
- `database-design-ob03-location-share-grants.md` (Stage 6, "the Stage 6 doc").
- `api-design-ob03-dispatch-location-grants.md` (Stage 7, "the Stage 7 doc"), commit `b018622`.

**Out of scope (no sign-off implied):** the CS-3/CR-1 to CR-7 untrusted-session mechanism (not designed yet;
`authentication-engineer`); the CR-3.1 web controls and CR-3.2/CR-5/CR-8 mobile behaviour (not designed;
R-2 puts `frontend-architect`/`mobile-architect` review at their own Stage 6); OB-04 `recovery_case_events`
(Feature 019's own gate); the PDM-6 registry as a feature (only the dispatch-eligibility source it must
provide is reviewed here); the CS-9 threat-model workshop for the location route (still mandated, still owed).

**Running code read (2026-10-30, to check the design against what exists, not to review code):**
`backend/src/repositories/recovery-cases.ts` (`claimedCaseVisiblePredicate` :457, `buildPartnerOrgQuery`
:485, `listForPartnerOrg` :655, `findByIdForPartnerOrg` :757, `updateStatusForPartnerOrg` :801,
`releaseForPartnerOrg` :906, `RECOVERY_CASE_FORWARD_TRANSITIONS` :528) · `backend/src/routes/security-cases.ts`
(route list; messages handler :579-640) · `backend/src/middleware/rate-limit.ts` · `backend/src/lib/step-up.ts`
(`requireStepUp`) · grep of `backend/` for `recovery_case_events`, `case_unassigned`, `noticeVersion`,
`consumedBy` (**no matches**: OB-04 does not exist in code) · `docs/organization/gates/stage8-manifest.json`
(no OB-03 entries yet, which is expected before merge).

I did not run tests. Nothing in this review is built, so every finding is a design finding.

---

## 0. Verdict summary

The architecture holds. Directed dispatch, a single grant-checked location route, append-only grants, and
per-request fail-closed evaluation are the right shape, and the Stage 7 doc carries most of the accumulated
conditions faithfully. The problems are at the joins: places where one condition was implemented on one
route but the same rule was not carried to a sibling route or to a shared predicate, and places where the
Stage 6 and Stage 7 docs disagree with each other or with the compliance rulings made after Stage 6 was
drafted.

The four questions I was asked to check:

| Question | Answer | Where |
|---|---|---|
| Does the location route's four-condition check implement D3.3 as specified? | **Mostly. Not exactly.** Fresh per request, uniform 404, write-before-respond and fail-closed are all right. But condition 2 drops `assetId`, the CS-5b detector cannot fire as ordered, the location source is unnamed, and a customer-session middleware is mis-placed on the partner chain | §2.1 |
| Does accept-consumes-pre-auth match DB-2's append-only-at-method-shape requirement? | **Yes at method shape, no at sequence level.** The repository surface is right. But the Stage 6 enum is missing `case_unassigned` (hand-backs will fail validation), the grant has no `noticeVersion`, and Path A writes no OB-04 activation event, so every Path A grant will look forged to the R-4 reconciliation check | §2.2 |
| Does the two-admin re-dispatch flow close R-1's insider-collusion gap (G-1)? | **No.** It gates only the `re-dispatch` call with a different target. Re-dispatch-to-null followed by `dispatch` changes the recipient with one admin at each step. The approve route also has no step-up | §2.3 |
| Does CS-5's per-operator rate limiting appear in Stage 7? | **Partly.** A compound `operatorAccountId:caseId` limiter is on the location route, and CS-5(c) is in the audit row. The per-case-across-operators dimension, the limit value, and the read-volume half of CS-5(b) are missing | §2.4 |

Findings by severity:

| ID | Tier | Severity | Summary |
|---|---|---|---|
| SR-OB03-A1 | A | **High** | Stage 7 changes the partner list branch but not the shared `claimedCaseVisiblePredicate`. A pending (not yet accepted) org would get Tier 1 on detail and could message the customer. The new predicate also drops the PDM-4 wrap-up clause |
| SR-OB03-A2 | A | **High** | The dispatch-eligibility check has no machine-checkable source. "Registry or documented single-org equivalent" is a document, not something a handler can read. No registry route is designed, although D4 lists one |
| SR-OB03-A3 | A | Medium-High | `PATCH /v1/security/cases/:caseId` (status) is not in the Stage 7 design at all |
| SR-OB03-A4 | A | Medium-High | Approve route has no step-up. `pendingApproval` has no schema, no expiry and no state binding |
| SR-OB03-A5 | A | Medium | The flag-flip migration writes OB-04 events only. CS-4 requires Trail B rows. It also skips held cases still in the 90-day wrap-up window |
| SR-OB03-A6 | A | Medium | OB-04 (`recovery_case_events`) does not exist in code. Every Stage 7 transition writes to it |
| SR-OB03-A7 | A | Medium | DB-5's `recovery_cases` dispatch-queue index is specified in neither the Stage 6 nor the Stage 7 doc |
| SR-OB03-A8 | A | Low-Medium | Admin queue list returns `lastLocation` for every open theft case. `GET /admin/dispatch/cases/:caseId` has no spec |
| SR-OB03-A9 | A | Low | CS-8 test matrix too narrow. Contradictory mount rules for `GET /v1/recovery/grants`. Same-holder re-dispatch undefined |
| SR-OB03-B1 | B | **High** | `case_unassigned` missing from the Stage 6 `GrantEndReason` type and `$jsonSchema` enum |
| SR-OB03-B2 | B | **High** | Path A writes no `location_share_granted` OB-04 event and no grant-lifecycle Trail B row. CSA-R4-4 would flag every pre-authorised grant |
| SR-OB03-B3 | B | **High** | G-1 compositional bypass (re-dispatch-to-null, then dispatch) |
| SR-OB03-B4 | B | Medium-High | D3.3 condition 2 omits `assetId`. Location source and condition-4 stores are unnamed |
| SR-OB03-B5 | B | Medium-High | Stolen-device check mis-placed on the partner route's middleware chain |
| SR-OB03-B6 | B | Medium-High | CS-5 incomplete (per-case dimension, value, read-volume anomaly). The CS-5(b) race detector cannot be reached |
| SR-OB03-B7 | B | Medium-High | Four D3.4 end-record writers are missing: status transition, registry termination, consent withdrawal, erasure |
| SR-OB03-B8 | B | Medium-High | CR-1 requires reads to be blocked from an untrusted session. Stage 7 blocks only mutating routes |
| SR-OB03-B9 | B | Medium | Grant has no `noticeVersion` (OQ-1(e)). Path A duration unspecified. `consumedBy` has no field |
| SR-OB03-B10 | B | Medium | Accept-time ordering and partial-failure behaviour unspecified |
| SR-OB03-B11 | B | Medium | CS-2 (i) and (iii) and CR-8 token suppression at activation are not designed |
| SR-OB03-B12 | B | Medium | Sweeper has no scheduler. For Tier B the reconciliation control is not a control until it runs |

---

## 1. What passes (verified against the design text)

- **CS-7 (flags fail closed).** Literal-`'true'` reading, refusal to start if location is on without
  dispatch (checked at boot in `context.ts`), and routers **unmounted** rather than 404ing (Stage 7 §0).
  Passes.
- **CS-8 (oracle uniformity), response body.** `accept`, `decline` and location return the identical
  `NOT_FOUND` body across undispatched, dispatched elsewhere and nonexistent. The 409 on `accept` is kept
  for a real race on a case that was pending to the caller, who already had legitimate visibility. That
  reveals nothing new. Passes (coverage gap in A9).
- **R-1 / BA-2.** `claim`, release-to-pool and `reassign` are removed in lockstep under the same flag, with
  client builds gated alongside. Passes. Removing `reassign` closes C-4 on the partner side.
- **CS-1, step-up on dispatch and re-dispatch.** Wired through the existing `requireStepUp` middleware, with a
  window covering a run of dispatches. Passes for those two routes (approve: A4).
- **Trail B write-before-mutate (§18.8 C-B)** is restated for every privileged write. Passes as a contract.
- **CS-6 (no location outside D3).** Decline, hand-back and re-dispatch reasons are closed enums with no
  free-text field. Partner push is asset category + reference only. The location response shape forbids
  derived or reverse-geocoded fields. Passes. Exact-key-set tests are still owed at build.
- **D1 visibility.** `unclaimedCaseVisiblePredicate()` is removed, not narrowed, so no org sees an
  undispatched case in any form. Passes, subject to A1 (the same change must reach the shared predicate).
- **BA-1 / DB-1.** Single idempotent flag-gated script with one canonical "not held" state. Passes, subject
  to A5.
- **BA-4** (route order), **BA-5** (limiter vs handler split), **BA-3/R-3** (one sweeper), **DB-3/DB-4**
  (partial indexes, no TTL), **DB-6** (`grantId` by reference). Pass.
- **DB-2 at method shape.** No generic update, `endGrant` is the only mutator and is guarded on
  `endedAt: null`, consume and withdraw are mutually exclusive compare-and-set operations, and there is no
  un-consume. Passes (sequence problems in §2.2).
- **R-4 reconciliation logic** (Stage 6 §6), including the soft-signal handling for a delayed end event.
  Passes as logic (the event it relies on is missing on Path A: B2).
- **503 vs 404 on backing-store failure.** A 503 can only be reached after condition 1 passes, so it tells
  the caller nothing the detail route did not already tell them. Accepted.
- **CS-9.** Five manifest entries are named. The entries themselves are created with the PRs, before merge.
  Passes on paper.
- **SR-INC002B-S3 stays closed.** Nothing in Stage 7 adds a location field to any partner tier projection or
  serialiser. The admin router's location is admin-only (A8 is about minimisation, not S3).

---

## 2. The four specific questions

### 2.1 Does the location route implement D3.3 as specified?

The core requirement is met. Stage 7 §4 evaluates every condition in the handler on every request, with no
session or JWT caching. The repository returns the document and the handler compares `expiresAt` against the
current time itself, so expiry never depends on the sweeper. Any false condition gives the same 404. Store
failure gives no location. The SG-7 row is written before the response body, and a failed write returns no
data. That is D3.3.

The conjunction as written still differs from D3.3 in four places:

- **SR-OB03-B4(a), `assetId` dropped from condition 2.** D3.3 says the grant must match "(`caseId`, the
  case's `assetId`, the caller's org)". `findActiveGrant(caseId, partnerOrganizationId)` takes no asset, and
  Stage 7 does not compare `grant.assetId` with the case. The Stage 6 doc explains that `assetId` was
  denormalised onto the grant specifically for this check, and then nothing uses it. A case's asset is
  immutable today, so this is defence in depth. But it is the check the ADR specified, and it is what
  detects a forged grant that points the right `caseId` at the wrong asset. **Fix:** the handler asserts
  `grant.assetId.equals(case.assetId)` (no index change needed), and a contract test covers a mismatched grant.
- **SR-OB03-B4(b), sources not named.** Condition 4 reads "Feature 008 location consent" and "account not
  erased" without naming the store or the fail-closed mapping for each. The response point's source is also
  unnamed: `location_events` or `recovery_cases.lastLocation`. This matters, because SG-5's time filter
  (`capturedAt >= case.createdAt`, nothing before `activatedAt` except the single activation point) can only
  be specified against a named field. A `lastLocation` captured before the theft report must not be served.
  **Fix:** name the store and field for each, and add a contract test serving a pre-`createdAt` point,
  which must return `data: null`.
- **SR-OB03-B5, stolen-device check on the partner chain.** §4 puts a "stolen-device-session check" that
  returns "the fixed CR-5 response" into the **partner** route's middleware, and then says it does not apply
  to the partner caller. The caller is a partner operator. CS-3/CR-1 are about the **customer's** session. A
  literal implementation would either do nothing, or return CR-5's "This device was reported stolen" text to
  a partner. That is a distinguishable response (a CS-8 oracle) and discloses the customer's device state to
  a third party. **Fix:** remove it from the partner chain. Condition 4 already covers the only partner-side
  effect (consent withdrawn means no location). Also delete the sentence about "a withdrawn consent flowing
  from a CR-2-blocked customer action": a blocked action withdraws nothing.
- **SR-OB03-B6(b), the CS-5(b) race detector cannot fire as ordered.** The detector is meant to catch "a read
  after the case status changes but before the end record is written". But condition 1 rejects any status
  other than `investigating`/`tracking` first, and returns 404, so a read after a terminal transition never
  reaches the detector. Also, `recovery_cases` has no status-transition timestamp. `closedAt` is set on first
  terminal entry only, and `updatedAt` is not specific to status. **Fix:** run the detector on the denial
  path. When condition 1 fails because the status is terminal **and** `findActiveGrant` still returns a grant
  with `endedAt: null`, raise the alert. That pairing is the exact signal CS-5(b) asked for, and it needs no
  new timestamp.

Smaller items (part of B4):
- **Denied reads.** The SG-7 row is specified for successful reads. Denied reads by a holder-org operator
  (condition 2, 3 or 4 false) should also leave a record, at least a counter feeding CS-5(b). Repeated
  polling after a grant ends is exactly the behaviour CS-5 exists to see.
- **`data: null` under INC-001** must only be returned after conditions 1 to 4 pass and the audit row is
  written. Otherwise it becomes an oracle that separates "everything valid, ingestion off" from 404. Stage 7
  implies this order but does not state it.
- **`Cache-Control: no-store`** on the location response. "Nothing is cached" must hold at HTTP level too
  (CDN, client and proxy caches).

### 2.2 Does accept-consumes-pre-auth match DB-2?

**At method shape: yes.** `consumePreauthorization` is a compare-and-set guarded on
`{ consumedAt: null, withdrawnAt: null }`, `createGrant` is create-only, and no method can re-arm or
un-consume. That is what DB-2 requires.

**At sequence level: no.** These need to be fixed before the accept handler is built:

- **SR-OB03-B1, `case_unassigned` is not in the Stage 6 enum (High).** The compliance OQ-2 ruling added it.
  `cto` made it effective at ratification, and Stage 7 §3.3 calls
  `endGrant(..., { endReason: 'case_unassigned' })` for every hand-back. The Stage 6 `GrantEndReason` type
  and the `$jsonSchema` enum (with `validationAction: 'error'`) list seven values and omit it. As designed,
  every hand-back's grant-end write would be **rejected by the validator**. Access still stops, because
  D3.3 condition 1 fails once `dispatchStatus` is null. But the SG-1 record stays open, the SG-8 history is
  wrong (which compliance ruled is a s16 accuracy problem), and an implementer meeting the error may
  "resolve" it by mapping to `case_reassigned`, which is exactly what OQ-2 forbade. **Fix:** an append-only
  amendment to the Stage 6 doc (type and validator), plus a test that each of the eight end reasons can be
  written.
- **SR-OB03-B2, Path A writes no activation event (High).** Stage 7 §5.3 (Path B) writes OB-04
  `location_share_granted`. §3.1 (Path A) writes only `dispatch_accepted`. The Stage 6 §6 reconciliation
  rule is "every grant document must have exactly one matching activation row". So **every pre-authorised
  grant would raise the CSA-R4-4 forged-grant alert.** A detective control that fires on every legitimate
  event gets muted or loosened, and then catches nothing. D3.6 also requires a Trail B row for **every grant
  lifecycle event**. Stage 7 writes one Trail B row for the accept, not one for the grant. **Fix:** Path A
  writes its own grant-activation Trail B row (with the SG-7 fields, `grantChannel: 'preauthorization'` and
  `preauthorizationId`) and a `location_share_granted` OB-04 event, exactly as Path B does. The same applies
  to every `endGrant` caller (`location_share_ended` plus a Trail B row), so the tamper check has its event.
- **SR-OB03-B9, missing fields.**
  - **`noticeVersion` on the grant.** Compliance OQ-1(e) requires the pre-authorisation's `noticeVersion` to
    be copied onto the activated grant (SG-9). The Stage 6 grant document and `createGrant` input have no
    such field, and the Path B body (§5.3) does not send the version of the notice shown at the prompt.
    Add it as a required field on the grant.
  - **Path A duration.** The pre-authorisation records no duration, and Stage 7 does not say what
    `requestedDurationHours` a Path A grant gets. The customer chose nothing longer, so it must be the
    SG-4 default of **24**, fixed server-side, never the 72-hour ceiling.
  - **`consumedBy`.** `consumePreauthorization(caseId, consumedBy)` takes a parameter the document has no
    field for. Add `consumedByPartnerOrganizationId`. It makes the CS-2(iii) report (§2.3) a plain query.
- **SR-OB03-B10, ordering and partial failure.** "Transaction-equivalent sequence" is not a specification.
  Required order: (1) Trail B row for accept, (2) case compare-and-set to `accepted`, (3) consume the
  pre-authorisation, (4) Trail B row for grant activation, (5) `createGrant`, (6) OB-04 events, (7)
  notifications. Failure handling to specify:
  - If (2) loses the race, stop. Never consume.
  - If (3) succeeds and (5) fails, the customer's consent is spent with no grant. That is fail-safe for
    access, but the consent is silently lost. The handler must fall back to the Path B prompt and raise an
    ops alert. Do not retry a second consume.
  - If (5) succeeds and (6) fails, reconciliation shows an orphan. The soft-signal rule in Stage 6 §6.1
    should apply to orphans too (alert only if it persists across runs), or the handler should retry the
    event write.
  - Mongo multi-document transactions are available on Atlas. `backend-architect` may choose them for
    (3) and (5) instead. Either is acceptable if it is written down.

### 2.3 Does the two-admin flow close G-1?

**No.** Stage 7 §2.4 requires second-admin approval only when the `re-dispatch` call names a **different**
target org. Every other way of changing the recipient is single-admin:

- **SR-OB03-B3, compositional bypass (High for Tier B).** Admin A calls `re-dispatch` with
  `targetPartnerOrganizationId: null` (single-admin, case returns to the queue), then calls `dispatch`
  (§2.3, single-admin, because `dispatchStatus` is null) naming org Y. The recipient has changed with one
  admin. The same composition is available after a partner decline (§3.2), a partner hand-back (§3.3), or a
  sweeper acceptance-window lapse (§6 step 3). A colluding partner can *create* the opening by declining.
  If a **live** pre-authorisation is on the case, org Y's accept consumes it and Y gets location with no
  customer interaction and one admin. That is G-1 exactly.

  **Fix:** put the rule in the **shared dispatch transition**, keyed on case state, not on which route was
  called. Any dispatch (first-time `dispatch`, `re-dispatch` with a target, or `approve`) of a case that
  (a) has a live **or consumed** pre-authorisation (CS-1's wording) **and** (b) has been dispatched before to
  any org requires second-admin approval. A first dispatch stays single-admin, as CS-1 allows, with CS-2 as
  the detective control. "Has been dispatched before" needs a fact on the case document that survives
  return-to-queue (for example `firstDispatchedAt` or a `dispatchCount`), because `dispatchedBy` is
  overwritten. Contract tests: null-then-dispatch, decline-then-dispatch, lapse-then-dispatch, each with a
  live pre-authorisation, must all return 202 pending approval.

  **Tier A note.** While `PARTNER_LOCATION_SHARING_ENABLED` is off, the pre-authorisation routes are not
  mounted, so no pre-authorisation can exist and the bypass has no location payoff. B3 is therefore a Tier B
  blocker, not a Tier A one. But the shared transition is Tier A code. Building the state-keyed rule into it
  now avoids reworking a security-critical path later, and I require that (A4).
- **SR-OB03-A4, the approve route and `pendingApproval`.**
  - **No step-up on approve.** §2's middleware list says step-up applies to "dispatch/re-dispatch only", and
    the §8 table shows approve with the flag only. The approving admin is the one who actually discloses
    the case to the new org. Step-up is required on approve (my CS-1 ruling: recipient-changing actions are
    privileged).
  - **No schema.** `pendingApproval` is a new field on `recovery_cases` that neither the ADR's DB review nor
    the Stage 6 doc defines. Specify: `{ id, requestedBy, requestedTargetOrgId, requestedAt, expiresAt,
    snapshot: { partnerOrganizationId, dispatchStatus, status } }`. The approve call is a compare-and-set
    that requires the case still to match the snapshot (otherwise 409), so an approval cannot land on a case
    that changed since the request. Allow one pending approval per case, with expiry (suggest 24 hours) and
    an explicit cancel by the requester.
  - **Audit.** The request writes its own Trail B row (requester, target org). The approval row names
    **both** admins.
  - **What the approver sees.** The approver must see the target org's name and the reason, not just an id.
  - **Residual, accepted.** The `CSA_SAME_ADMIN` check compares `accountId`s. One human with two admin
    accounts defeats it. Admin account issuance is an identity-governance control (ADR-0006), not this
    feature's. Accepted and recorded for `cto` visibility, not silently assumed away.
- **CS-2(iii) is still the only control for a first dispatch** (single admin plus one partner accept). The
  weekly admin/org consumption report is not designed anywhere in Stage 7 (B11).

### 2.4 Is CS-5's per-operator rate limiting in Stage 7?

**Partly.**
- **Present.** §4's chain has `createRateLimiter` keyed `operatorAccountId:caseId` (CS-5(a), as a BA-5
  key-function variant, correct). The SG-7 row records the individual operator (CS-5(c)). For context: every
  existing partner route is already keyed per operator (`req.auth!.accountId`), so "per operator, not just
  per org" is already the router norm. The location route is the only place it was ever in question.
- **SR-OB03-B6(a), missing.**
  - **The per-case dimension.** CS-5(a) says per operator **and** per case. A compound key limits each
    (operator, case) pair, so an org with N operators on one case gets N times the read rate. That is the
    G-5 multiplier. Add a second limiter keyed `caseId` alone (all operators of the holder org). The
    existing factory can chain two instances.
  - **The value.** Neither limit has a value. `security-engineer` sets both before Tier B re-review. My
    input: the per-case ceiling should be derived from the Feature 008 report interval. Reading faster than
    points arrive has no recovery value and is only surveillance cadence.
  - **Read-volume anomaly alert.** The first half of CS-5(b) is absent. Only the race detector is designed,
    and it is mis-ordered (§2.1). Specify a per-case read-volume threshold alert (handler or sweeper, where
    the BA-5 split puts it). It can reuse the denied-read counter from B4.

---

## 3. Tier A findings (must be in code before the affected router merges)

- **SR-OB03-A1 (High): change the shared predicate, not just the list branch.** Stage 7 §3.5 describes the new
  claimed branch as a change to `buildPartnerOrgQuery`'s branches. But `claimedCaseVisiblePredicate()`
  (`recovery-cases.ts:457`) is the single predicate behind list, count, **detail**
  (`findByIdForPartnerOrg`), and therefore behind **messages**, which gates on `tier === 'claimed'`
  (`security-cases.ts:604`). It matches on `partnerOrganizationId` alone. Under directed dispatch a
  **pending** org has `partnerOrganizationId === callerOrg`, so unless that predicate itself gains
  `dispatchStatus: 'accepted'`, a pending org gets:
  - **Tier 1 on detail.** That is more PII than the offer tier D1's table allows before acceptance.
  - **The ability to message the customer** before accepting.
  Status PATCH happens to be blocked today only because `open` has no forward transitions. That is an
  accident of the state machine, not a control. Also, Stage 7's new claimed branch
  (`partnerOrganizationId === callerOrgId AND dispatchStatus === 'accepted'`) **drops the PDM-4 wrap-up
  `$or`**. Required shape:
  - the claimed predicate is `{ partnerOrganizationId, dispatchStatus: 'accepted', $or: [<existing wrap-up clauses>] }`
  - a separate pending predicate is `{ partnerOrganizationId, dispatchStatus: 'pending', status: 'open' }`
    with the offer projection
  - **all three** of list, count and detail use those two functions (C-012-3)
  Tests: a pending org's detail returns the offer tier, its messages and PATCH calls return 404, and an
  accepted case closed 30 days ago is still visible at Tier 2.
- **SR-OB03-A2 (High): dispatch eligibility needs a source a handler can read.** D1 makes eligibility a
  server check. Stage 7 says "executed and not terminated in the registry (or its documented single-org
  equivalent)", but a documented equivalent is a document. Nothing in Stage 7 tells the handler what to
  read, and no registry route is designed although D4 lists "the PDM-6 registry fields". Specify one of
  these before the dispatch route merges:
  - **(a)** the minimal PDM-6 fields on `partner_organizations` (`agreementStatus`, `agreementReference`,
    `effectiveFrom`, `terminatedAt`) with an admin route to set them. Moving to `executed` requires step-up
    (my ruling, ADR §2) and writes a Trail B row. Termination returns the org's open cases to the queue and
    revokes its operator sessions (PDM-6, D3.4).
  - **(b)** for the one-partner pilot only, a server-side allowlist (env/config, single org id) that the
    handler reads, recorded in this file as the "documented single-org equivalent", with (a) owed before
    partner two.
  Either way, **`accept` re-checks eligibility too** (the org may be terminated between dispatch and
  accept), and the active-only `status` flag on today's directory (C-5) is never sufficient on its own.
- **SR-OB03-A3 (Medium-High): `PATCH /v1/security/cases/:caseId` is missing.** The Stage 7 route table lists
  messages as "unchanged" but leaves out the status route. Tier A: it must require `dispatchStatus: 'accepted'`
  in its compare-and-set filter, not only `partnerOrganizationId`. Tier B: a terminal transition must call
  `endGrant(..., 'case_terminal')` synchronously (D3.4, see B7).
- **SR-OB03-A4 (Medium-High):** approve step-up and the `pendingApproval` schema (§2.3), and the
  state-keyed two-admin rule built into the shared dispatch transition (B3).
- **SR-OB03-A5 (Medium): migration audit and coverage.**
  - CS-4 requires each carry-over or return to write a **Trail B row** with `actor.type: 'system'`. Stage 7
    §1 writes OB-04 events only. Add the Trail B rows.
  - §1 acts only on `status` in (`open`, `investigating`, `tracking`). Held cases already
    `recovered`/`closed` inside the 90-day window are left with `dispatchStatus` unset. Under A1's predicate
    they would vanish from the holder org (a functional regression that invites someone to widen the
    predicate), and CS-4's re-check ("every currently held case") never runs on them. Include them: eligible
    ones get `accepted`, ineligible ones lose partner visibility.
  - "Runs before the flag is read as true": state the mechanism (for example, a deploy step that must exit
    0 before the env change is applied, and a boot assertion that refuses `DIRECTED_DISPATCH_ENABLED='true'`
    while any held case has `dispatchStatus` unset).
- **SR-OB03-A6 (Medium): OB-04 does not exist.** `recovery_case_events` has no code in `backend/` (grep
  2026-10-30), and Feature 019 has only its backend-architecture doc. Every Stage 7 transition writes an
  OB-04 event. Decide before Tier A build: either Feature 019 ships first, or Tier A writes Trail B only (it
  is the audit source of truth under D3.6 anyway) and OB-04 writes are added when 019 lands. For **Tier B,
  OB-04 is mandatory**: the R-4 reconciliation control depends on it. Also, Stage 7 uses `case_unassigned` as
  an OB-04 **event type** (§1), and that is not in D3.6's six-value addition list. Feature 019's design needs
  the addition.
- **SR-OB03-A7 (Medium): DB-5 index.** The `recovery_cases` dispatch-queue index (`{ partnerOrganizationId,
  dispatchStatus, status, createdAt }` or equivalent) ships in the same PR as the dispatch fields. Neither
  the Stage 6 doc (which scopes `recovery_cases` out) nor Stage 7 carries it. `database-architect` appends it.
- **SR-OB03-A8 (Low-Medium): minimise the admin queue.** `AdminDispatchCaseView` in the **list** includes
  `lastLocation`/`lastLocationAt` for every open theft case. A dispatch decision does not need coordinates
  in a bulk list, and a one-page view of every stolen asset's location is the insider-surveillance aid the
  role spec assumes someone will misuse. Remove location from the list view. Keep it on
  `GET /admin/dispatch/cases/:caseId` with a per-subject Trail B row. That detail route is in the §8 table
  but has no section, so give it one.
- **SR-OB03-A9 (Low): consistency.**
  - **(i) CS-8 tests.** Extend them to detail, `release`, `messages` and PATCH, not only
    accept/decline/location. Also add partner and customer tokens against every `/admin/dispatch/*` route.
  - **(ii) `GET /v1/recovery/grants` mounting.** §0 says no §2 to §5 router is mounted while
    `DIRECTED_DISPATCH_ENABLED` is off, but §5.5 says this route is always mounted. Pick one. I have no
    security preference, because it returns an empty list either way, but it must be decided, not inferred.
  - **(iii) Same-holder re-dispatch.** §2.4's "re-dispatch to the existing holder" path has no defined
    effect. Remove it or define it.

---

## 4. Tier B findings not covered above (design pass needed before Stage 9)

- **SR-OB03-B7: D3.4 end-record writers missing.** D3.3 condition 1 or 4 stops access on read in every case
  below. But D3.4 requires the end record to be written **synchronously by the triggering transition**, for
  SG-8 accuracy. Stage 7 designs only revoke, hand-back, re-dispatch and expiry. Missing:
  - `case_terminal`: the status PATCH (A3)
  - `partner_agreement_ended`: the registry termination transition (A2(a))
  - `location_consent_withdrawn`: the existing consent routes in `assets.ts` (`DELETE /assets/:assetId/location`
    and the consent route)
  - `account_erased`: the erasure path
  Each needs its call site named and a test. Also record the `solution-architect` D3.4 note as a known
  limitation in the Tier B package: no admin or customer close route exists, so a false alarm nobody closes
  keeps a grant until it expires (≤ 72 hours, 24 by default). That is bounded, and accepted as a limitation.
- **SR-OB03-B8: CR-1 blocks reads, not just writes.** Stage 7 §5 blocks "every mutating route" from an
  untrusted session. CR-1 says an untrusted session gets **no reads** of customer personal information
  either: grants, partner names, access history. `GET /v1/recovery/grants` (§5.5) returns partner name and
  PSIRA number, and must also return the CR-5 response to an untrusted session. More generally, the
  untrusted-session middleware Stage 7 refers to does not exist and has no design. It is
  `authentication-engineer`'s CS-3 deliverable, with CR-7 (no collateral lock-out) as its hardest condition.
  The Tier B design cannot be completed without it.
- **SR-OB03-B11: CS-2 and CR-8 at activation.**
  - **CS-2(i).** A permanent failure of both channels must raise an ops alert **and** write an audit row.
    Stage 7 says "triggers CS-2's ops alert", with no failure path.
  - **CS-2(iii).** The weekly report of admin/org pairs whose dispatches consumed pre-authorisations is not
    designed. Name the query (Trail B dispatch rows joined to grants where `preauthorizationId` is set),
    the owner and the recipient.
  - **CR-8.** Activation push must skip tokens bound to the reported device, and compliance OQ-1(c) counts
    that suppression as "no push channel", not a failure. Stage 7 does not mention it.
  - **Path B (§5.3) preconditions.** These must also re-check case status (`investigating`/`tracking`) and
    org eligibility. A grant created on a case about to close is harmless because condition 1 catches it,
    but it should not be creatable.
- **SR-OB03-B12: the sweeper must actually run for Tier B.** For Tier A, a manually invoked sweeper is
  acceptable for a one-partner pilot, as long as an ops runbook gives the run cadence. A lapsed acceptance
  window is a liveness problem, not a disclosure. For Tier B, the sweeper carries **CSA-R4-4's detective
  control** and SG-1 expiry recording. A detective control that runs only when someone remembers is not a
  control. A scheduler (Render cron or equivalent, `devops-engineer`/`site-reliability-engineer`) is a
  Tier B Stage 8 precondition. If the sweeper ships as a separate deployable, it uses principal P2
  (`find`/`update` only, no `insert`), per R-4.
- **§5.6 support route.** Stage 7 leaves the admin revoke route optional ("not required if support already
  has a console"). I do not know of any such console in `src/admin/`. CR-3.3 is satisfied by the runbook for
  v1 regardless. If the route is built, it is restriction-only, step-up gated, and writes `endedBy` = the
  agent plus the support reference, as specified. No objection to the shape.

---

## 5. Tier A: what the greenlight covers and what it does not

**Covered (Stage 9 may start now):** `admin-case-dispatch.ts` (queue list, count, detail, dispatch,
re-dispatch, approve), the `security-cases.ts` changes (accept, decline, release as hand-back, removal of
claim and reassign, predicate changes, status PATCH change), the flag-flip migration script, the
`recovery_cases` dispatch fields and index, and the Tier A sweeper steps (queue-age, acceptance-window lapse),
all behind `DIRECTED_DISPATCH_ENABLED`.

**Merge conditions:** A1 to A9 are in the code and tests. Each router has its CS-9 manifest entry. The
accept handler's Tier A form creates **no** grant and consumes **no** pre-authorisation. That code path is
Tier B, and it stays out until B1, B2, B9 and B10 are re-designed.

**Not covered: flipping `DIRECTED_DISPATCH_ENABLED` in any non-development environment.** That still needs
Tier A's own Stage 10, A2's eligibility source populated for a real org, **SR-INC002B-S2** (an executed
partner agreement: still BLOCKING), S1 (still BLOCKING), and `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR` to stop
being `"false"` under its own gate. The Client's OQ-3 answer is recorded and does not block D1 (ADR,
`product-manager` note).

**Open question for `compliance-specialist`, raised here rather than assumed:** under Tier A alone,
customer notifications about a case (dispatch/accept status changes, partner messages) still go to every
customer push token, including a token on a reported-stolen phone. CR-8 was ruled in the location context.
Does it bind Tier A, given that a message from a partner can name the partner to whoever holds the phone? If
it does, CR-8 token suppression becomes a Tier A flag precondition, not a Tier B one. I am not blocking Tier A
build on this, because it is an existing behaviour that Tier A does not widen. It is compliance's ruling to
make.

---

## 6. Tier B: still blocked on unbuilt preconditions (not Stage 7 defects)

None of these are fixed by a better Stage 7 doc. All of them block `PARTNER_LOCATION_SHARING_ENABLED`, and
all must be evidenced at Tier B's Stage 8:

1. **CR-3 withdrawal channels.** CR-3.1 web controls, CR-3.2 trusted-mobile controls, CR-3.3 support
   runbook. **None exist.** Compliance has said it will block without them, and I concur.
2. **CS-3 / CR-1 to CR-7.** The untrusted-session mechanism: designed, then built (`authentication-engineer`).
   It must also say whether device-to-session binding is reliable (CR-7).
3. **OB-spec P-1 to P-7**, including SG-12/P-4 and SG-13/P-6 (counsel on s57).
4. **CSA-R4-1 to 5.** Scoped Atlas roles provisioned, scripts moved off the runtime credential and the
   credential rotated, a deploy-time privilege assertion, the reconciliation negative test, and human Atlas
   roles reduced. Atlas DB-audit availability documented, or the residual risk accepted in writing by `cto`.
5. **OB-04 built** (A6) and the **sweeper scheduled** (B12).
6. **The CS-9 threat-model workshop** for the location route.
7. **R-6 owed documents**: the §4 / PDM-9 copy including CR-9, the L-6 correction, and the CR-3.3 runbook.
8. **R-2 domain reviews**: `frontend-architect` and `mobile-architect`.
9. **INC-001** location ingestion re-enabled. Without it the route serves `data: null`.

---

## 7. Conditions register

| ID | Owner | Gate it binds |
|---|---|---|
| SR-OB03-A1 to A9 | `backend-architect` (Stage 7 addendum, append-only), `database-architect` (A7, and the `pendingApproval` schema in A4), `backend-engineer` (implementation), `qa-architect` (tests named in each item) | Merge of the affected Tier A router |
| SR-OB03-B1, B9 (schema part) | `database-architect`: append-only amendment to the Stage 6 doc | Before any Tier B repository code merges |
| SR-OB03-B2 to B12 | `backend-architect` (Stage 7 Tier B revision), `security-engineer` (B6 values), `authentication-engineer` (B8 dependency), `notification-engineer` (B11 transport), `devops-engineer`/`site-reliability-engineer` (B12 scheduler) | Tier B Stage 8 re-review. No Tier B Stage 9 before it |
| §5 compliance question (CR-8 under Tier A) | `compliance-specialist` | Tier A flag flip, if ruled to apply |
| §6 items 1 to 9 | As listed in the ADR | `PARTNER_LOCATION_SHARING_ENABLED` |

**Re-review.** When the Stage 7 addendum (A-items) lands I will re-check it on paper. That is not a new gate.
The Tier B revision comes back to a full joint Stage 8 (chair, `security-engineer`, `compliance-specialist`),
after the CS-9 workshop.

---

## 8. Chair checklist

- [x] Threat model updated. G-1 compositional bypass (B3), pending-org Tier 1 exposure (A1), partner-chain
  oracle (B5) and reconciliation false-positive collapse (B2) were added to the OB-03 surface. The STRIDE
  write-up for the location route stays with the CS-9 workshop.
- [x] Zero-trust boundaries. Tier A: admin→partner disclosure is step-up gated, and recipient eligibility is
  a server check (once A2 names its source). Tier B: per-request conjunction, subject to B4 to B6.
- [x] Data classification. Location is the highest class. Tier A carries no partner location (S3 stays closed).
- [x] Encryption at rest. Atlas baseline, confirmed by `database-architect` (ADR DB review §3).
- [ ] Third-party least privilege and audit. Tier A: yes, subject to A1/A2. Tier B: not until B2, B6 and B11.
- [ ] Account takeover / stolen-device session. Tier B depends on CS-3, which is not designed (B8).
- [x] No silent risk acceptance. Accepted with record: one human holding two admin accounts defeats
  `CSA_SAME_ADMIN` (§2.3); unclosed false-alarm grants are bounded by expiry (B7); Tier A sweeper runs
  manually for the pilot (B12).
- [ ] **Joint gate.** `security-engineer` and `compliance-specialist` concurrences are **outstanding**. This
  section is the chair's review only. Stage 8 is not discharged until both are appended below.

**Signed (chair):** `cybersecurity-architect`, 2026-10-30.

---

<!-- security-engineer concurrence: append below this line. Do not edit the chair's section. -->

## 9. `security-engineer` concurrence (Stage 8, second required signature)

**Date:** 2026-10-30. **Reviewed:** the chair's §0–§8 above, the ADR, the Stage 6 doc, the Stage 7 doc, and
the same running-code surfaces the chair cites (`recovery-cases.ts`, `security-cases.ts`,
`rate-limit.ts`, `step-up.ts`), plus `backend/src/lib/policy.ts` for this platform's existing rate-limit
precedent and `backend/src/routes/asset-location.ts`/`recovery.ts` for the Feature 008 report-cadence and
location-route limiter precedent that CS-5's values need to be grounded in. I did not re-derive the
threat model; I checked the chair's Tier A findings against the code for anything missed, and set the
CS-5(a)/(b) values the chair deferred to this role.

### 9.1 Verdict

**Tier A: concur with "approved with conditions," with two of my own findings (SE-1, SE-2) added to the
A1–A9 set before Stage 9 merge — not new blockers on starting Stage 9, but merge conditions alongside
A1–A9, same bar the chair set.** A1–A9 are all real and I found nothing that contradicts them on a second
read of the code. **Tier B: concur with "blocked."** I looked specifically for anything my own lens
(injection, rate limiting, secrets, dependency/config surface) would add beyond B1–B12 and found one
item (SE-3) folding into the existing B6 fix rather than standing alone, plus the CS-5 values below which
B6 named as owed to this role.

### 9.2 SE-1 (New, Medium-High): query-parameter and body-field validation on the new admin/partner routes
is not specified, and this is exactly the NoSQL-injection surface this role owns

Stage 7 §2.1's `GET /v1/admin/dispatch/cases` takes `status?`, `dispatchStatus?`, `limit`, `cursor` and
says only "same enum as `security-cases.ts`'s filter" for `status`— it does not say the same for
`dispatchStatus`, and no `zod` schema is shown for either route's query parsing the way §5.1's
`createCaseSchema` or `caseIdParamsSchema` are named for the customer routes. The chair's running-code
read confirms the existing routers validate query input through named schemas before it reaches a Mongo
filter (e.g. `security-cases.ts`'s list handler). Two concrete risks if `dispatchStatus`/`status` are read
off `req.query` and dropped into `buildPartnerOrgQuery`/the new admin query builder without an allow-list:

- **Query-operator injection.** Express's default query parser turns `?dispatchStatus[$ne]=null` into
  `{ $ne: 'null' }` on `req.query.dispatchStatus`. If that value is spread into a Mongo filter object
  (`{ dispatchStatus: req.query.dispatchStatus }`) rather than compared against a closed enum first, the
  caller controls a query operator, not a value — the canonical NoSQL-injection shape this role's standing
  mandate calls out by name.
- **The same risk on `POST /v1/admin/dispatch/cases/:caseId/dispatch`'s `partnerOrganizationId` body field
  and §2.4's `targetPartnerOrganizationId`.** Both must be validated as a string matching the org-id shape
  (not just "truthy") before being used in `findActiveGrant`/the eligibility lookup, for the same reason.

**Fix, merge condition for Tier A (SE-1):** every new/changed route in `admin-case-dispatch.ts` and the
`security-cases.ts` additions parses `req.query`/`req.body` through a named `zod` schema with
`dispatchStatus`/`status` as closed enums (`z.enum([...])`), and `partnerOrganizationId`/
`targetPartnerOrganizationId` as string-shape-checked (existing project convention — whatever
`security-cases.ts` already uses for org-id params) before any value reaches a repository filter, exactly
as `recovery.ts`/`security-cases.ts` already do for their own routes. `qa-architect` adds a contract test
sending `{ "$ne": null }`-shaped values as query/body input and asserts `400 VALIDATION_ERROR`, not a
widened result set. This is a specification gap, not a defect in running code — nothing in Tier A is built
yet — so it is cheap to close before the router exists rather than after.

### 9.3 SE-2 (New, Medium): bulk-read rate limiting on the admin dispatch queue is unspecified

Stage 7 §2.1/§2.2 give `admin-case-dispatch.ts` the generic chain "`authenticate` → `requireUserType('admin')`
→ step-up check (dispatch/re-dispatch only) → per-route `createRateLimiter`" but never names the limiter
value for the **list** and **count** routes, unlike `security-cases.ts`'s existing list/count routes,
which the chair's own running-code read shows are each individually keyed with `DEFAULT_AUTHENTICATED_LIMIT`
(`security-cases.ts:106,155`). The admin queue list is also the route A8 already flags for carrying
`lastLocation` on every row — which makes an unspecified or missing limiter on that route a bulk-location-
disclosure amplifier on top of A8's minimisation fix, not just a generic hygiene gap: a compromised or
over-curious admin session could page through the full queue at whatever rate the client allows if no
limiter is named.

**Fix, merge condition for Tier A (SE-2):** `GET /v1/admin/dispatch/cases` and
`GET /v1/admin/dispatch/cases/count` each get their own `createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT,
(req) => \`admin-dispatch-{list|count}:${req.auth!.accountId}\`)` call, named explicitly in the Stage 7
addendum the chair already requires for A1–A9, not left to "per-route `createRateLimiter`" as a one-line
summary. `GET /admin/dispatch/cases/:caseId` (A8's detail route, once specced) gets the same.

### 9.4 Everything else in A1–A9: no additional gaps found

I checked A1 (predicate), A2 (eligibility source), A3 (status PATCH), A4 (approve step-up/`pendingApproval`),
A5 (migration), A6 (OB-04), A7 (index), A9 (consistency) against the code and the Stage 6/7 text a second
time, specifically for authn/authz, injection, secrets and rate-limit angles. Nothing to add. A4's
`pendingApproval` snapshot-compare-and-set is the right shape for closing a TOCTOU window on the approval
call itself, and A1's two-predicate split is the correct IDOR fix (an org's own id in `partnerOrganizationId`
is not, on its own, authorization once "pending" and "accepted" are different disclosure tiers under one
org id). No secrets or hardcoded vendor credentials appear anywhere in the Stage 6/7 text — consistent with
the ADR's open-decision status on the GPS/payment vendors.

### 9.5 CS-5 rate-limit values (deferred to this role by the chair, §2.4/§7)

Grounded in two existing numbers already in `backend/src/lib/policy.ts`: `DEFAULT_AUTHENTICATED_LIMIT`
(100/60s, the house default for an authenticated read route with no special sensitivity) and
`ASSET_LOCATION_REPORT_LIMIT` (20 attempts / 15 minutes — Feature 008 Phase 1's self-device report cadence
ceiling, i.e. a new point cannot legitimately exist more often than roughly once every 45 seconds). The
chair's own framing in §2.4 is the right test: "reading faster than points arrive has no recovery value
and is only surveillance cadence." Both limiters below key off `createRateLimiter`'s existing
compound-key support (already used for CS-5(a)'s `operatorAccountId:caseId` key, per the chair's §2.1/§2.4
read of Stage 7 §4) and are **chained**, not substituted for each other — the second does not loosen the
first:

- **CS-5(a), per-operator-per-case:** `{ attempts: 10, windowSeconds: 300 }` keyed
  `location-read:{operatorAccountId}:{caseId}`. One read roughly every 30 seconds, sustained — comfortably
  above the ~45-second floor at which a genuinely new point can exist, enough headroom for a UI that polls
  on a fixed interval plus a manual refresh, but a hard ceiling on a scripted tight-poll loop against one
  case by one operator account.
- **CS-5(a)/(G-5), per-case aggregate across all operators of the holder org:** `{ attempts: 30,
  windowSeconds: 300 }` keyed `location-read:{caseId}` (no operator in the key — this is the second
  limiter instance the chair's §2.4 already calls for, chained after the per-operator one in the same
  middleware position §4 names). Three times the per-operator ceiling, not N times: an org that puts ten
  operators on one case does not get a tenfold read budget, closing the exact multiplier the chair named
  as G-5. 30 reads / 5 minutes is still well above the ~45-second data-arrival floor (that alone would
  allow ~33 reads/5 min at the theoretical ceiling), so the limiter binds on multi-operator fan-out before
  it binds on a single diligent operator refreshing on a tight interval.
- **CS-5(b), read-volume anomaly (the detective half, distinct from the two hard limiters above):** alert
  (not block — this is a signal, the two limiters above are the actual control) when a single case's
  **denied**-read counter (the one B4 already asks the handler to write) exceeds **5 denied reads within
  60 minutes** from the same operator or org — denied reads have zero legitimate volume once a grant has
  ended or a condition has gone false, unlike allowed reads, so this threshold can be tighter than either
  hard limiter above without false-positiving on normal use. Reuse the existing admin-alert transport the
  chair's §6/B12 already route sweeper-raised alerts through; no new notification mechanism.

These three numbers are mine to set per the chair's deferral and are a Stage 7 addendum item (same
mechanism as A1–A9: `backend-architect` writes them into the Stage 7 doc as an appended amendment, not a
rewrite of §4). They bind **Tier B only** — the location route they gate is unmounted under
`DIRECTED_DISPATCH_ENABLED` alone, so nothing here is a Tier A merge condition. I am recording them now,
ahead of the Tier B re-review, because the chair asked for them here rather than leaving them to resurface
at the next Stage 8 pass.

### 9.6 SE-3 (folds into B6, not a standalone finding): the per-case aggregate limiter must not be
satisfiable by rotating operator accounts within the same org

B6(a) already requires the per-case-aggregate dimension; I add one implementation note so it is not
rebuilt wrong: the aggregate key must be `caseId` alone (org-scoped by construction, since only one org is
ever dispatched to a case at a time under D1), not `caseId:partnerOrganizationId`, and must be enforced
server-side in the same middleware position as the per-operator limiter, not derived from a client-
supplied operator count. A limiter keyed on anything the org can multiply (operator id, device id,
request-header value) reintroduces G-5 by construction. This is folded into B6 rather than given its own
ID because it's a specification detail of the same fix, not a new gap.

### 9.7 Chair checklist cross-check

I re-ran the chair's own unchecked boxes (§8: third-party least privilege/audit, account-takeover/
stolen-device session) against the code with my own lens and reached the same conclusion: both are
correctly left unresolved pending B2/B6/B8/B11/B12 and CS-3 respectively — there is no code yet for either
to inspect, and nothing in Stage 6/7 closes them early. I have nothing to add there beyond concurring that
they stay open.

### 9.8 Security-engineer checklist

- [x] All new/changed endpoints enforce authentication and object-level authorization — subject to A1
  (chair) and SE-1 (this section) being fixed before merge.
- [x] Input validation and sanitization confirmed for all user-/vendor-supplied data — **not yet**; SE-1 is
  exactly this box, flagged as a Tier A merge condition, not a pass.
- [x] Rate limiting in place on public and vendor-facing endpoints — **not yet** on the admin queue routes
  (SE-2); CS-5 values fixed above for the Tier B location route.
- [ ] GPS/vendor webhook signatures verified and replay protection confirmed — N/A to OB-03 (no vendor
  webhook in this feature; Feature 008 self-device reporting is a separate, already-reviewed surface).
- [x] No secrets, keys, or tokens present in source, logs, or client bundles — confirmed on the Stage 6/7
  text; nothing to check yet in code, since none exists.
- [ ] Dependency scan — N/A, no package changes in a design doc; owed at Stage 9 PR time as usual.
- [x] Encryption at rest/in transit — deferred to, and consistent with, the chair's §8 and `database-
  architect`'s ADR DB review; no new sensitive-data path beyond what the ADR already covers.
- [x] Prior pentest findings relevant to this change — none exist yet for OB-03 specifically; N/A.

**Signed:** `security-engineer`, 2026-10-30. Concurrence recorded for Tier A (with SE-1/SE-2 added to the
merge-condition set alongside A1–A9) and for Tier B remaining blocked per the chair's B1–B12. CS-5(a)/(b)
values fixed in §9.5 above.

<!-- compliance-specialist concurrence: append below this line. Do not edit the chair's section. -->
