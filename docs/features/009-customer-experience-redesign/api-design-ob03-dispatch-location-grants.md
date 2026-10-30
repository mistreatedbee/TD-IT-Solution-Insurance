# OB-03 — Directed Dispatch and Location Share-Grant API Design
## Stage 7 — API / Backend Architecture

**Lifecycle stage:** 7 — API Design, per [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md).
**Author:** `backend-architect`
**Status:** Paper design. Authorized for Stage 6/7 design and flagged build by the `cto` ratification in
[`0017-security-partner-directed-dispatch-and-location-share-grants.md`](../../organization/adr/0017-security-partner-directed-dispatch-and-location-share-grants.md)
("ADR-0017" below). **Not yet built.** Formalizes this role's own earlier "`backend-architect` review"
section of ADR-0017 (BA-1 to BA-6) into route/contract shapes, reading on `database-architect`'s
[`database-design-ob03-location-share-grants.md`](database-design-ob03-location-share-grants.md) ("the
Stage 6 doc" below) for the repository method shapes this design calls.

**Does not authorize:** turning on either D5 flag in production, or building ahead of each route's own
Stage 8/Stage 10. `DIRECTED_DISPATCH_ENABLED` gates §2–§3 below; `PARTNER_LOCATION_SHARING_ENABLED`
additionally gates §4–§5 and may only be on if the first flag is also on (ADR-0017 D5, CS-7).

---

## 0. Cross-cutting contract rules (apply to every route below)

- **Both flags fail closed per CS-7.** While `DIRECTED_DISPATCH_ENABLED` is off, none of §2–§5's routers
  are mounted at all (not mounted-but-404 — unmounted). While `PARTNER_LOCATION_SHARING_ENABLED` is off,
  §4's location route and §5's grant-mutating customer routes are unmounted; §5's read-only "list my
  grants" may stay mounted and simply return an empty list, since it discloses nothing. If
  `PARTNER_LOCATION_SHARING_ENABLED='true'` is read while `DIRECTED_DISPATCH_ENABLED` is not `'true'`,
  the server refuses to start (CS-7) — checked once at boot in `context.ts`, not per-request.
- **Oracle uniformity (CS-8).** For any caller-org that is not the current holder of a case, `accept`,
  `decline` and the location route return the identical `apiError('NOT_FOUND', ...)` body used today for
  an inaccessible case detail, regardless of whether the case is undispatched, dispatched to a different
  org, or does not exist. Contract tests (`qa-architect`) assert this across all three states for every
  one of these routes.
- **Trail B write-before-mutate (§18.8 C-B), unchanged pattern.** Every privileged write below (dispatch,
  re-dispatch, hand-back, accept, decline, grant create/revoke, pre-authorization create/withdraw/consume)
  follows: pre-read → precondition check (no audit row on failure) → write Trail B row → compare-and-set
  mutation → tier-scoped or customer-scoped serializer. This is a restatement of the existing
  `security-cases.ts` pattern, not a new one.
- **Route-registration order (BA-4).** Every new literal-segment path is registered before any sibling
  `:paramName` route on the same prefix, matching the existing `/security/cases/count`-before-`/:caseId`
  precedent (`security-cases.ts:145-149`). Concretely: `/admin/dispatch/cases/count` before
  `/admin/dispatch/cases/:caseId`; `/security/cases/count` keeps its existing position; no new path
  segment under `/security/cases/:caseId/*` collides with a literal segment, since `accept`/`decline` are
  suffixes on an already-bound `:caseId`, not siblings of it.
- **Idempotency.** Dispatch, accept, decline, hand-back, re-dispatch, grant revoke, and pre-authorization
  withdraw/consume are all compare-and-set mutations keyed on current state (the existing `claim`/`release`
  idiom, `recovery-cases.ts:878-917`) — a repeated identical request either no-ops with the same 200 body
  (if state already reflects the requested outcome) or 409s with a structured conflict (if state has moved
  on). None of these are money-mutating, so no separate `Idempotency-Key` header scheme is introduced;
  compare-and-set on domain state is the idempotency mechanism, consistent with this router family today.
- **Step-up (ADR-0012).** Dispatch and re-dispatch require step-up per the `cybersecurity-architect`
  sign-off; a step-up window may cover a run of dispatches in one admin session (no per-action re-prompt).
  Re-dispatch to a *different* org additionally requires CS-1's second-admin approval — modeled as a
  two-step mutation (§3.3 below), not a second step-up factor.

---

## 1. Flag-flip migration (BA-1, DB-1, CS-4) — stated explicitly, not left implicit

Resolves BA-1's open question. When `DIRECTED_DISPATCH_ENABLED` flips to `true` in an environment, a
one-time idempotent script runs **before** the flag is read as `true` by any route:

- For every `recovery_cases` document with `partnerOrganizationId` set and `status` in
  (`open`, `investigating`, `tracking`): re-check the holder against the PDM-6 registry /
  documented single-org equivalent (CS-4).
  - **Eligible:** set `dispatchStatus: 'accepted'`, `acceptedAt: <migration timestamp>`,
    `dispatchedAt: <migration timestamp>`, `dispatchedBy: 'system:migration-ddflip'`. Writes an OB-04
    `dispatch_accepted` event with `actor.type: 'system'`.
  - **Not eligible:** clear `partnerOrganizationId: null`, `dispatchStatus: null`, `acceptedAt: null` —
    this is the single canonical "not held" shape, identical to today's pool-unclaimed row, so CS-8's
    oracle-uniformity tests have exactly one state to assert for "undispatched" (BA-1's concern). Writes
    an OB-04 `case_unassigned` event (compliance OQ-2 ruling — not `case_reassigned`), `actor.type: 'system'`.
- Cases already `open` with no holder are untouched; they are visible in the dispatch queue (§2.1) from
  the moment the flag is on.
- Script is flag-gated and idempotent (re-running against already-migrated cases is a no-op, per DB-1):
  it only acts on documents where `dispatchStatus` is currently unset.

---

## 2. Admin dispatch router — `admin-case-dispatch.ts`

New sibling router, following `admin-partner-organizations.ts`'s convention (own file, own
`create*Router(ctx)` export, mounted under `/v1` in `context.ts`'s router list). Middleware chain:
`authenticate` → `requireUserType('admin')` → step-up check (ADR-0012, dispatch/re-dispatch only) →
per-route `createRateLimiter`.

### 2.1 `GET /v1/admin/dispatch/cases`
List the dispatch queue: undispatched cases, plus (query-filterable) dispatched/accepted cases, for
admin visibility. **No partner org can reach any part of this router.**

- Query: `status?` (same enum as `security-cases.ts`'s filter), `dispatchStatus?: 'undispatched' | 'pending' | 'accepted'`,
  pagination (`limit`, `cursor`, existing `parseMongoPaginationQuery` convention).
- Response `200`: `{ data: AdminDispatchCaseView[], pagination: { nextCursor, hasMore } }`.
  `AdminDispatchCaseView` is a full-fidelity admin view (unlike the partner tiers) — it may include
  `lastLocation`/`lastLocationAt` as today's admin surfaces already do; this router carries no PDM
  tier restriction, since it is never partner-facing.
- Writes an `admin_access_log` bulk-disclosure row (Trail B) per page, same pattern as
  `security-cases.ts`'s list handler, keyed per-case not per-subject.
- Registered **above** `/admin/dispatch/cases/:caseId` and `/admin/dispatch/cases/count` per the
  BA-4 ordering rule.

### 2.2 `GET /v1/admin/dispatch/cases/count`
Same filters as 2.1, `{ data: { count } }`. Registered before any `:caseId` route on this prefix.
Uses the cheap unlogged `auditLog.recordBulkDisclosure` pattern (Trail A), mirroring
`security-cases.ts`'s `/count` handler (RR-012-1 precedent) — not Trail B, since no case content is
returned.

### 2.3 `POST /v1/admin/dispatch/cases/:caseId/dispatch`
Dispatch an undispatched (or hand-backed/unassigned) case to exactly one partner org. **Requires
step-up (CS-1).**

- Body: `{ partnerOrganizationId: string }`.
- Precondition: case exists; `dispatchStatus` is `null` (undispatched or just unassigned); target org
  is `executed` and not terminated in the registry (or its documented single-org equivalent).
- On success: `dispatchStatus: 'pending'`, `partnerOrganizationId` set, `dispatchedAt`, `dispatchedBy`
  set. Writes Trail B row naming the admin and target org (CS-1), then an OB-04 `case_dispatched` event.
  Triggers the PDM-5/SG-10 partner push (asset category + reference only, CS-6) to the target org's
  operators only.
- Responses: `200 { data: AdminDispatchCaseView }` on success. `409 CONFLICT` if `dispatchStatus` is
  not `null` (someone else dispatched it first — compare-and-set loser). `422` if the target org is not
  `executed`/is terminated. `404` if the case does not exist.

### 2.4 `POST /v1/admin/dispatch/cases/:caseId/re-dispatch`
Hand a case back to the queue, or move it directly to a different org. **Requires step-up.** Re-dispatch
to a *different* org than the current holder additionally requires **CS-1's second-admin approval**,
modeled as two calls:

- Body: `{ targetPartnerOrganizationId: string | null, reason: RedispatchReason }` where
  `RedispatchReason` is a fixed enum (`partner_declined`, `partner_handed_back`, `agreement_ended`,
  `admin_recall`, `other`). `targetPartnerOrganizationId: null` means "return to the queue with no new
  holder" (`case_unassigned`, not `case_reassigned` — compliance OQ-2).
- **If `targetPartnerOrganizationId` is null or equals the case's existing holder:** single-admin call,
  same shape as 2.3's precondition/response pattern, ends any active grant (`case_unassigned` or
  `case_reassigned` per OQ-2's split) via `ctx.partnerLocationShareGrants.endGrant(...)`.
- **If `targetPartnerOrganizationId` is a *different* org:** this call creates a
  `pendingApproval: { requestedBy: adminAccountId, requestedTargetOrgId, requestedAt }` record on the
  case (not yet a mutation) and returns `202 { data: { pendingApprovalId } }`. A second admin calls
  **`POST /v1/admin/dispatch/cases/:caseId/re-dispatch/approve`** with
  `{ pendingApprovalId: string }`; the server rejects (`403 CSA_SAME_ADMIN`) if the approving admin's
  `accountId` matches `requestedBy`. Only the approval call performs the actual state mutation, Trail B
  write, grant-end, and OB-04 event. This is the smallest change that satisfies CS-1 without inventing a
  new generic "pending-admin-action" primitive elsewhere in the codebase.
- Responses: `200` (single-admin path, mutation complete) / `202` (two-admin path, awaiting approval) /
  `404` / `409` (case already moved) / `403` (same-admin approval attempt).

**Why no separate "hand-back" route distinct from re-dispatch.** ADR-0017 D1 describes "hand back" and
"admin re-dispatch to a different org" as two concepts, but both are "move the current holder off this
case, optionally naming a new one" — one route with a nullable target, differing only in whether the
second-admin gate applies, is the same-shape change BA-4/BA's own review already characterized this
whole family as. A partner-initiated hand-back (§3.4 below) calls into the *same* underlying
repository/service transition the admin single-target re-dispatch does, just from the partner router
with no target org (always `case_unassigned`).

---

## 3. Partner-facing changes — `security-cases.ts`

Per R-1 (cto ratification): `claim`, `release`-to-pool, and `reassign` are **removed in lockstep**, same
`/v1` path, same release as the admin router above, gated on `DIRECTED_DISPATCH_ENABLED`. No 410
deprecation window (no real partner traffic — `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR="false"`). Mobile
operator app and web security dashboard builds ship the same release, gated on the same flag.

### 3.1 `POST /v1/security/cases/:caseId/accept` (replaces `claim`)
- Precondition: case is held by caller's org (`partnerOrganizationId === callerOrgId`),
  `dispatchStatus === 'pending'`. Same compare-and-set idiom as today's `claim`
  (`recovery-cases.ts:878-917`), guarded on `dispatchStatus` instead of `partnerOrganizationId: null`.
- On success: `dispatchStatus: 'accepted'`, `acceptedAt` set, case `status` moves to `investigating` if
  still `open`. Writes Trail B row, then OB-04 `dispatch_accepted` event.
  - **Consumes a live pre-authorization if one exists** (§5.1): calls
    `preauthorizations.consumePreauthorization(caseId, callerOrgId)`. If it returns a record, the handler
    creates a grant (`grants.createGrant({ grantChannel: 'preauthorization', preauthorizationId: ... })`)
    naming the accepting org, per D3.1 Path A — in the same transaction-equivalent sequence as the Trail B
    write (grant creation happens after the Trail B row for the accept itself, before the response body).
    Triggers CS-2's ops alert + customer push/email attempt (activation notice).
  - If no live pre-authorization exists, no grant is created here — the customer gets the in-app/push/
    email prompt (Path B, §5.2) separately; `accept` itself never blocks on that prompt's outcome.
- Response: `200 { data: ClaimedTierRecoveryCaseView }` (reuses `serializeClaimedTierRecoveryCase`
  unchanged — PDM-2's tier serializers are not touched by this change). `409` if `dispatchStatus` is not
  `pending` or holder mismatch (CS-8 oracle: same `NOT_FOUND` body as today for a non-held case, not a
  409, when the mismatch is "this case isn't dispatched to you" — `409` is reserved for "it was `pending`
  and dispatched to you a moment ago but someone/something changed it since your last read", i.e. a true
  race, which is rare since only one org is ever dispatched at a time).

### 3.2 `POST /v1/security/cases/:caseId/decline` (new)
- Precondition: same as `accept` (`partnerOrganizationId === callerOrgId`, `dispatchStatus === 'pending'`).
- Body: `{ reason: DeclineReason }`, fixed enum (`no_capacity`, `outside_service_area`, `other`) — CS-6:
  no free-text location-adjacent reason.
- On success: case returns to the admin dispatch queue — same underlying transition as admin
  re-dispatch-to-null (§2.4's single-admin path), `dispatchStatus: null`, `partnerOrganizationId: null`,
  OB-04 `dispatch_declined` event (not `case_unassigned` — "declined" is distinct from "handed back after
  acceptance" per D3.4's table, so the OB-04 enum keeps both). No grant existed yet at `pending` (D3.2:
  grants activate on acceptance only), so no grant-end step applies here.
- Response: `200 { data: { caseId, status: 'returned_to_queue' } }` to the declining org. `404`
  (CS-8 oracle) if the case is not dispatched to the caller's org.

### 3.3 `POST /v1/security/cases/:caseId/release` (hand-back, repurposed — "becomes hand back" per D1)
- Precondition: case is held by caller's org, `dispatchStatus === 'accepted'`.
- Body: `{ reason: HandBackReason }`, fixed enum (`recovered_independently`, `unable_to_proceed`,
  `agreement_lapsed`, `other`).
- On success: same underlying transition as admin re-dispatch-to-null (§2.4), `dispatchStatus: null`,
  `partnerOrganizationId: null`, any active grant ended with `endReason: 'case_unassigned'` (compliance
  OQ-2 — a hand-back is not a reassignment to a new org), OB-04 `case_handed_back` event.
- Response: `200 { data: { caseId, status: 'returned_to_queue' } }`. `404` (CS-8 oracle) otherwise.

### 3.4 `reassign` — removed
No route. Calling it after the flag flip returns `404` (unmounted, not merely unimplemented — same
"literally not mounted" treatment as the flag-gating rule in §0, since real traffic does not exist to
protect with a softer deprecation response per R-1).

### 3.5 List / count / detail — predicate change only, same routes
`GET /v1/security/cases`, `/count`, `/:caseId` keep their existing paths, serializers, and tier-selection
logic (`serializePartnerCase`). Only `buildPartnerOrgQuery`'s branches change (database-architect's own
review, confirmed workable): the `unclaimedCaseVisiblePredicate()` OR-branch is replaced by a
"`partnerOrganizationId === callerOrgId AND dispatchStatus === 'pending'`" branch (offer tier — no
location, same `OFFER_TIER_FIELD_EXCLUSION_PROJECTION`), and the claimed branch becomes
"`partnerOrganizationId === callerOrgId AND dispatchStatus === 'accepted'`" (claimed tier, unchanged
projection). **No org ever sees another org's pending or accepted case** — this is the literal
"no partner org can see an undispatched case in any form" requirement (D1), enforced by removing the
`unclaimedCaseVisiblePredicate()` OR-branch entirely rather than narrowing it.

### 3.6 Messages (`POST /v1/security/cases/:caseId/messages`) — unchanged
No change to contract. CS-6's template rule (no coordinate/place-name in message bodies) is an existing
free-text field already covered by that condition, not a new route concern.

---

## 4. Partner location route — the one dedicated route (D3.3)

### `GET /v1/security/cases/:caseId/location`

This is the **only** route in the entire API, partner- or customer-facing, that may return a coordinate
to a partner. Mounted only when `PARTNER_LOCATION_SHARING_ENABLED='true'` (and, by CS-7, that implies
`DIRECTED_DISPATCH_ENABLED` is also `'true'`).

**Middleware chain:** `authenticate` → `requireUserType('security_company_operator')` →
`requirePartnerOrg` → **stolen-device-session check** (CR-1: an untrusted session per CS-3 gets the fixed
CR-5 response, not location — this check applies to the *customer* consent condition #4 below via the
account's session state, not to the partner caller; named here because the handler's condition #4 reads
it) → `createRateLimiter` keyed `operatorAccountId:caseId` (CS-5a — a key-function variant of the
existing `createRateLimiter` factory, no new primitive per BA-5) → handler.

**Handler evaluates, fresh, every request, in this order (D3.3), no step short-circuited by a cache:**
1. Case is held by caller's org (`partnerOrganizationId === callerOrgId`), `dispatchStatus === 'accepted'`,
   `status` in (`investigating`, `tracking`).
2. `ctx.partnerLocationShareGrants.findActiveGrant(caseId, callerOrgId)` returns a non-null grant, and
   the handler checks `grant.expiresAt > Date.now()` and `grant.endedAt === null` itself (the repository
   method does not perform the time comparison — Stage 6 doc §4, "now is checked at read time... this
   method does not itself compare against Date.now()").
3. Caller's org is `executed` and not terminated in the registry.
4. The case's `accountId`'s Feature 008 location consent is active and the account is not erased.
   (If the reporting device's session is marked untrusted per CS-3, that affects the *customer's* own
   routes, not this handler directly — but a withdrawn consent flowing from a CR-2-blocked customer
   action is exactly what condition 4 catches here.)

- **Any condition false → same `404 NOT_FOUND`** body used for an inaccessible case (CS-8 — "no grant
  oracle": the response does not distinguish "no grant" from "case not yours" from "case doesn't exist").
- **Any backing store unreachable (grant store, registry, consent store) → no location, generic error**
  that does not reveal whether a grant exists (`503`-class `UPSTREAM_UNAVAILABLE`, matching this
  project's existing P-12 convention for Mongo outages — not a 404, since a 404 here would itself leak
  "the backing check ran and failed closed on a real case" information asymmetrically from "case truly
  doesn't exist"; both still withhold location, the distinction is operational, not security-bearing).
- **SG-7 audit row written before the response body is built** (write-before-respond, the same
  write-before-act pattern as §18.8 C-B). If that write fails, `503`, no location returned. The row
  records the operator's individual `accountId` (CS-5c), not only the org.
- **CS-5b anomaly check** (handler-level logic, not the rate limiter per BA-5's split): compares the read
  timestamp against the case's last `status`-transition timestamp; a read after a terminal transition but
  before the corresponding grant-end record exists raises an ops alert (should be rare, since D3.4 ends
  grants synchronously on the triggering transition — this is a belt-and-suspenders detector for a race,
  not an expected path).
- **Response `200`:** `{ data: { latitude, longitude, capturedAt } }` — one point only (D3.3: "if Feature
  008 keeps only the last point, the route serves that one point"), subject to SG-5 scope (nothing
  before the case's `createdAt`, nothing from before the grant's `activatedAt` beyond the single
  activation point, no labels or derived data — CS-6's "no derived/coarsened coordinate" rule applies
  equally to anything this route itself might compute, e.g. no reverse-geocoded field is ever added to
  this response shape).
- **Response when location ingestion is off (INC-001):** `200 { data: null }` with a `meta.reason:
  'location_ingestion_disabled'` — honest per the failure-modes table, not a 404 (the grant and case
  state may all be valid; there is simply nothing to serve).

---

## 5. Customer-facing grant/pre-authorization routes

New file: `backend/src/routes/location-share-grants.ts`, customer-scoped (same auth model as
`recovery.ts`'s `getLocationForCase` caller — `authenticate` → `requireUserType('customer')` → ownership
check that the caller's `accountId` matches the grant/pre-auth/case's `accountId`). Mounted only when
`PARTNER_LOCATION_SHARING_ENABLED='true'`, except 5.5 (list-my-grants) which may stay mounted returning
an empty list — it discloses nothing new.

Per CR-2, **every mutating route in this section is blocked outright when the calling session is marked
untrusted** (CS-3/CR-1) — the middleware chain includes the untrusted-session check before the handler,
returning the fixed CR-5 response (`"This device was reported stolen..."`), never a fake success, and
never revealing whether a grant exists.

### 5.1 `POST /v1/recovery/cases/:caseId/location-preauthorization` (Path A, SG-3)
Create a pre-authorization at report time. Separate step from submitting the theft/loss report (§2
Voluntary — not pre-selected).
- Body: `{ noticeVersion: string }` (the §4 notice copy version shown).
- Precondition: caller owns the case's account; case has no live pre-authorization yet
  (`findLivePreauthorization` returns null) — a second call is a no-op `200` returning the existing
  record (idempotent), not a duplicate.
- `201 { data: { preauthorizationId, caseId, createdAt } }`. Names no org (D3.1 — none exists yet).

### 5.2 `DELETE /v1/recovery/cases/:caseId/location-preauthorization` (withdraw, "single tap")
- Precondition: caller owns it; `consumedAt === null`, `withdrawnAt === null` (compare-and-set,
  `withdrawPreauthorization`).
- `200 { data: { caseId, withdrawnAt } }`. `409` if already consumed (cannot withdraw after the org has
  already accepted and the grant exists — the customer instead uses 5.4 to revoke the resulting grant).

### 5.3 `POST /v1/recovery/cases/:caseId/location-grant` (Path B — post-acceptance prompt confirmation)
Only reachable once an org has accepted and no pre-authorization was consumed (the server-driven prompt
state, surfaced to the client via the case/notification state — this route is the "customer confirms"
action, not the prompt display itself).
- Precondition: case `dispatchStatus === 'accepted'`; no currently-active grant for this case (one active
  grant per case at a time — a renewal is a new document per D3.2, but only after the prior one ends or
  expires, mirroring D3.4's lifecycle).
- Body: `{ requestedDurationHours: number }` (1–72, SG-4 ceiling; clients may offer 24 only, server
  accepts up to 72 per D3.2).
- `201 { data: GrantView }` where `GrantView` includes `partnerOrganizationId`, the partner's legal name
  and PSIRA number (denormalized read from the registry at response time, not stored on the grant),
  `expiresAt`, and a revoke affordance. Creates the grant via `createGrant({ grantChannel:
  'post_acceptance_prompt', preauthorizationId: null, ... })`, writes OB-04 `location_share_granted`.
- `409` if a grant is already active for this case (idempotent-safe: returns the existing active grant
  instead of erroring, since "confirm again" should not be a hard failure for a double-tap).

### 5.4 `DELETE /v1/recovery/cases/:caseId/location-grant` (revoke — SG-3's one-tap)
- Precondition: caller owns the case; an active grant exists (`findActiveGrant`).
- Requires fresh step-up **only** if the calling session is on the reported-stolen device — which is
  structurally impossible here, since CR-2 blocks this exact route from an untrusted session entirely;
  from a trusted session, this is the deliberately low-friction "one tap after authentication on a
  trusted channel" (CR-8's reading of SG-3).
- `endGrant(grantId, { endReason: 'revoked_by_customer', endedBy: callerAccountId })`.
  `200 { data: { caseId, endedAt } }`. `404` if no active grant (nothing to revoke — not an error state,
  idempotent).

### 5.5 `GET /v1/recovery/grants` (SG-8 — list my grants / access history)
- Query: pagination only (no `caseId` filter needed — a customer's full grant history across all their
  cases).
- `ctx.partnerLocationShareGrants.listGrantsForAccount(callerAccountId, pagination)` — plain time-ordered
  query (Stage 6 doc §4 — append-only makes this a diff-free read).
- `200 { data: GrantHistoryView[], pagination: {...} }`. Each entry includes partner name/PSIRA number
  (point-in-time, from the registry as of now — acceptable for a history view per the Stage 6 doc's
  reasoning that `expiresAt`/`endReason` are legitimately point-in-time copies at write time; the partner
  identity fields here are read live for display, not stored redundantly on the grant document).
- Mounted even with `PARTNER_LOCATION_SHARING_ENABLED='false'` — always returns `{ data: [] }` in that
  state (no grants can exist pre-flag), satisfying CR-3.1's "customer can always check" requirement
  without disclosing anything new while the flag is off.

### 5.6 Support-runbook action (CR-3.3) — no new route
Per the compliance ruling, support-initiated withdrawal is a **documented manual runbook**
(`customer-support-lead` + `technical-writer`), not a new authenticated customer-facing route for v1. The
support agent uses the same 5.2/5.4 routes under their own admin-impersonation-free path (an existing
support-tooling concern, out of this design's scope) — or, if no such tooling exists yet, an internal
admin-only variant of 5.4 keyed by `accountId` + `caseId` rather than the caller's own session, gated
behind `requireUserType('admin')` and step-up, writing `endedBy` = the agent's `accountId` plus the
support reference on the Trail B row (per CR-3.3's specified audit shape). This internal route, if built,
is `POST /v1/admin/accounts/:accountId/location-grants/:grantId/revoke` — named here as the fallback
shape so it is not invented ad hoc later, but it is **not required for CR-3** if support already has a
general-purpose admin action console that can call 5.4-equivalent logic directly.

---

## 6. The shared sweeper (R-3) — trigger/scheduling mechanism

Per R-3 and consistent with the project's existing pattern for `police-report-retention` and
`admin_access_log`-retention (both built as **callable units with no scheduler wired up yet**): this
sweeper is built the same way. **No new scheduling infrastructure is introduced by this design.**

- **Module:** `backend/src/jobs/dispatch-location-sweeper.ts`, exporting a single callable
  `runDispatchLocationSweep(ctx: AppContext): Promise<SweepResult>` — no cron primitive, no queue, no
  timer registered anywhere in `backend/src`. It is invoked the same way the retention jobs are today:
  manually, via a CLI/ops entrypoint, until `devops-engineer`/`site-reliability-engineer` wire a real
  scheduler (Render cron job or equivalent) for *all* of these callable units in one pass, not sweeper-by-
  sweeper.
- **What one sweep pass does, in one shared pass** (BA-3's "one sweeper, not three"):
  1. **Grant expiry recording (D3.4 `expired`):** `listGrantsEndingBefore(now)` → for each still-open
     grant (`endedAt === null`, `expiresAt <= now`), `endGrant(id, { endReason: 'expired', endedBy:
     'system:sweeper' })`. Access was already cut off at read time (D3.3) regardless of when this runs —
     this pass only makes the SG-1 record accurate.
  2. **Dispatch queue-age alert (failure modes table):** cases with `dispatchStatus: null` and `status:
     'open'` older than `business-analyst`'s time-to-dispatch target → emits one admin alert per case (or
     batched), via whatever transport `notification-engineer` designs (BA-3 — not named by this document,
     which only fixes that it is the same sweep pass, not a second mechanism).
  3. **Acceptance-window lapse (failure modes table):** cases with `dispatchStatus: 'pending'` older than
     the acceptance-window length (`business-analyst`'s call) → the sweeper calls the *same* underlying
     "return to queue" transition §2.4/§3.3 use (`dispatchStatus: null`, `partnerOrganizationId: null`,
     `endReason: 'case_unassigned'` if a grant somehow existed at `pending` — it should not, per D3.2, but
     the transition is defensive), writes Trail B with `actor.type: 'system'`, OB-04 event, and alerts
     admins.
  4. **Grant/event integrity check (R-4, Stage 6 doc §6):** the orphan check and tamper check specified in
     the Stage 6 doc, run against grants created/ended since the last pass (or a periodic full pass) —
     this document does not redesign that logic, only confirms it runs inside the same callable unit
     rather than a fourth standalone job.
- **Idempotency of the sweep itself:** every mutation inside a pass is the same compare-and-set
  transition used by the interactive routes, so a sweep that is accidentally run twice, or that overlaps
  with an interactive mutation, loses the race safely (the second writer's conditional update simply
  matches zero documents) rather than double-firing an alert or double-writing an end record.

---

## 7. Manifest coverage (CS-9)

Each of the following gets its own `stage8-manifest.json` entry before merge, per the SR-012-5
precedent — listed here so none is dropped at Stage 8 time:
`admin-case-dispatch` (queue list/count/dispatch/re-dispatch/approve), `security-cases-accept-decline`
(amendment to the existing `backend-security-cases` entry, not a new one, since it is the same router),
`security-cases-location` (the partner location route — flagged by CS-9 as a **mandated threat-model
workshop item** before its own Stage 8, not just a manifest line), `recovery-location-share-grants`
(the customer grant/pre-auth routes), and `dispatch-location-sweeper` (the sweeper, as a job rather than
an HTTP route, still gets an entry per CS-9's "each new ... route" read broadly to cover the equivalent
privileged-write surface).

---

## 8. Summary — route list

| Method | Path | Router | Flag |
|---|---|---|---|
| GET | `/v1/admin/dispatch/cases` | `admin-case-dispatch.ts` (new) | `DIRECTED_DISPATCH_ENABLED` |
| GET | `/v1/admin/dispatch/cases/count` | same | same |
| GET | `/v1/admin/dispatch/cases/:caseId` | same | same |
| POST | `/v1/admin/dispatch/cases/:caseId/dispatch` | same | same, + step-up |
| POST | `/v1/admin/dispatch/cases/:caseId/re-dispatch` | same | same, + step-up (+2nd admin if cross-org) |
| POST | `/v1/admin/dispatch/cases/:caseId/re-dispatch/approve` | same | same |
| GET | `/v1/security/cases` | `security-cases.ts` (predicate change only) | `DIRECTED_DISPATCH_ENABLED` |
| GET | `/v1/security/cases/count` | same | same |
| GET | `/v1/security/cases/:caseId` | same | same |
| POST | `/v1/security/cases/:caseId/accept` | same (replaces `claim`) | same |
| POST | `/v1/security/cases/:caseId/decline` | same (new) | same |
| POST | `/v1/security/cases/:caseId/release` | same (repurposed: hand-back) | same |
| POST | `/v1/security/cases/:caseId/messages` | same (unchanged) | n/a |
| ~~POST~~ | ~~`/v1/security/cases/:caseId/claim`~~ | removed | — |
| ~~POST~~ | ~~`/v1/security/cases/:caseId/reassign`~~ | removed | — |
| GET | `/v1/security/cases/:caseId/location` | same (new, the one dedicated route) | `PARTNER_LOCATION_SHARING_ENABLED` |
| POST | `/v1/recovery/cases/:caseId/location-preauthorization` | `location-share-grants.ts` (new) | `PARTNER_LOCATION_SHARING_ENABLED` |
| DELETE | `/v1/recovery/cases/:caseId/location-preauthorization` | same | same |
| POST | `/v1/recovery/cases/:caseId/location-grant` | same | same |
| DELETE | `/v1/recovery/cases/:caseId/location-grant` | same | same |
| GET | `/v1/recovery/grants` | same | always mounted (empty when flag off) |
| — | `runDispatchLocationSweep(ctx)` | `jobs/dispatch-location-sweeper.ts` (new, callable unit, no scheduler wired) | `DIRECTED_DISPATCH_ENABLED` |

All routes are authenticated and request/response bodies use the existing `apiError`/`zod` validation
conventions already in `security-cases.ts`/`recovery.ts`. Full OpenAPI schemas (request/response JSON
Schema per route) are a Stage 9 implementation deliverable, not reproduced line-by-line here — this
document fixes the contract shape and middleware chain `qa-architect`'s contract tests and
`backend-engineer`'s implementation both build against.
