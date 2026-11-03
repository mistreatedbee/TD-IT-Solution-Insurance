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

**Revision note (2026-10-30, Tier A addendum).** Stage 8's joint gate (chair + `security-engineer` +
`compliance-specialist`) discharged Tier A "approved with conditions" in
[`security-review-ob03-dispatch-location-grants.md`](security-review-ob03-dispatch-location-grants.md)
(SR-OB03-A1 to A9, SE-1, SE-2, CO-OB03-1 to CO-OB03-6). This revision folds those conditions into the
Tier A sections below (§0–§3, the migration in §1, the admin router in §2) before `backend-engineer`
builds against it. **Tier B sections (§4–§5, the location route and the customer grant/pre-authorization
routes) are intentionally untouched by this pass** — they stay blocked pending the separate B1–B12
Tier B re-design, which is a later, lower-priority task. Every place below marked **[A-n]**, **[SE-n]**
or **[CO-n]** is a direct response to that review's numbered finding.

---

## 0. Cross-cutting contract rules (apply to every route below)

- **Both flags fail closed per CS-7.** While `DIRECTED_DISPATCH_ENABLED` is off, none of §2–§4's routers,
  and none of §5's *mutating* routes, are mounted at all (not mounted-but-404 — unmounted). **[A9(ii)]
  `GET /v1/recovery/grants` (§5.5) is the sole exception and stays mounted at all times, independent of
  either flag** — the prior draft said in this bullet that "none of §2–§5's routers are mounted" while
  `DIRECTED_DISPATCH_ENABLED` is off, which contradicted §5.5's own text ("mounted even with
  `PARTNER_LOCATION_SHARING_ENABLED='false'`"). This is now resolved explicitly, not left to be inferred:
  §5.5 is always mounted and always returns `{ data: [] }` until a grant can exist, since it discloses
  nothing new in either flag state. Every other §5 route (5.1–5.4) follows the general rule: unmounted
  unless `PARTNER_LOCATION_SHARING_ENABLED='true'`. If `PARTNER_LOCATION_SHARING_ENABLED='true'` is read
  while `DIRECTED_DISPATCH_ENABLED` is not `'true'`, the server refuses to start (CS-7) — checked once at
  boot in `context.ts`, not per-request.
- **Oracle uniformity (CS-8).** For any caller-org that is not the current holder of a case, `accept`,
  `decline` and the location route return the identical `apiError('NOT_FOUND', ...)` body used today for
  an inaccessible case detail, regardless of whether the case is undispatched, dispatched to a different
  org, or does not exist. **[A9(i)] Coverage extended** beyond accept/decline/location to **detail,
  `release`, `messages`, and the new status-PATCH route (§3.1a)** — the prior draft's test list was too
  narrow. Contract tests (`qa-architect`) assert the identical body across all three states
  (undispatched / dispatched-elsewhere / nonexistent) for every one of these routes, and additionally
  send a partner token and a customer token against every `/v1/admin/dispatch/*` route to confirm each
  is rejected the same way regardless of caller type.
- **[A7] Index.** `recovery_cases`' dispatch-queue index — `{ partnerOrganizationId, dispatchStatus,
  status, createdAt }` (DB-5, Stage 6 doc's cross-reference) — ships in the same PR as the dispatch
  fields this document adds (`dispatchStatus`, `acceptedAt`, `dispatchedAt`, `dispatchedBy`,
  `firstDispatchedAt`, `dispatchCount`, `pendingApproval`). Neither the Stage 6 doc (which scopes
  `recovery_cases` out) nor the prior draft of this document carried it; `database-architect` appends it
  to the Stage 6 doc as an append-only amendment alongside the `pendingApproval` schema (§2.4) and the
  `reportedFromDeviceId` field (§3.7(c)).
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
- **[A6] Audit event source for Tier A: Trail B only, no OB-04 writes.** `recovery_case_events` (OB-04)
  has no code anywhere in `backend/` — it is Feature 019's deliverable and that feature has only a
  backend-architecture doc, not a build. Every transition this document describes (dispatch, re-dispatch,
  decline, hand-back, accept, approve, the migration) therefore writes **a Trail B row only** —
  `admin_access_log`/the existing privileged-write audit collection, per §0's write-before-mutate rule —
  and **does not** call any OB-04 event writer. This is Tier A's explicit decision, not an oversight: Trail
  B is already this project's audit source of truth (D3.6), the Tier A build has nothing to gain from
  writing to a table that doesn't exist, and `compliance-specialist`'s CO-OB03-5 s23 recipient-history
  requirement is satisfiable from Trail B rows alone (caseId, customer accountId, org, actor, timestamp) as
  long as every offer/accept/decline/lapse/hand-back/re-dispatch/migration-return writes one. **When Feature
  019 ships**, a follow-up change adds the OB-04 event write alongside the existing Trail B write at each of
  these call sites (additive, not a redesign) — that follow-up is out of scope for this document. Every
  "writes an OB-04 `<event>` event" sentence in **§1–§3 (the Tier A sections this pass revises)** is
  therefore **superseded by this note**: read it as "writes a Trail B row for `<event>`" there. **§4–§5
  (Tier B, untouched by this pass) keep their existing "writes an OB-04 event" text as-is** — for Tier B,
  OB-04 is mandatory (the R-4 reconciliation control depends on it, per SR-OB03-A6/B2), and that
  requirement is carried into the separate Tier B re-design, not decided or altered here.

---

## 1. Flag-flip migration (BA-1, DB-1, CS-4) — stated explicitly, not left implicit

Resolves BA-1's open question. When `DIRECTED_DISPATCH_ENABLED` flips to `true` in an environment, a
one-time idempotent script runs **before** the flag is read as `true` by any route:

- **[A5] Scope widened: held cases in their 90-day wrap-up window are included, not skipped.** For every
  `recovery_cases` document with `partnerOrganizationId` set, **regardless of current `status`** (i.e.
  `open`/`investigating`/`tracking` **and** `recovered`/`closed` cases still inside the PDM-4 90-day
  wrap-up window — the prior draft acted only on the first three and left wrap-up-window cases with
  `dispatchStatus` unset, which would make them vanish from the holder org once §3.5's split predicate
  reads `dispatchStatus: 'accepted'`): re-check the holder against the PDM-6 registry / documented
  single-org equivalent (CS-4).
  - **Eligible:** set `dispatchStatus: 'accepted'`, `acceptedAt: <migration timestamp>`,
    `dispatchedAt: <migration timestamp>`, `dispatchedBy: 'system:migration-ddflip'`. Writes a **Trail B
    row** (per the global [A6] note above — no OB-04 write) with `actor.type: 'system'`,
    `action: 'dispatch_accepted'`, naming the case, the customer `accountId` and the holder org.
  - **Not eligible (including a terminated-org holder, CO-OB03-3):** clear `partnerOrganizationId: null`,
    `dispatchStatus: null`, `acceptedAt: null` — this is the single canonical "not held" shape, identical to
    today's pool-unclaimed row, so CS-8's oracle-uniformity tests have exactly one state to assert for
    "undispatched" (BA-1's concern). Writes a **Trail B row** with `actor.type: 'system'`,
    `action: 'case_unassigned'` (compliance OQ-2 ruling — not `case_reassigned`), naming the case, the
    customer `accountId` and the formerly-holding org (CO-OB03-5: this is part of the s23 recipient
    history, so the row must be queryable per customer and retained for the audit-trail retention period,
    not the case retention period).
- Cases already `open` with no holder are untouched; they are visible in the dispatch queue (§2.1) from
  the moment the flag is on.
- Script is flag-gated and idempotent (re-running against already-migrated cases is a no-op, per DB-1):
  it only acts on documents where `dispatchStatus` is currently unset.
- **[A5] "Runs before the flag is read as true": the mechanism, stated.** A deploy step runs the script to
  completion (exit 0) before the environment variable carrying `DIRECTED_DISPATCH_ENABLED='true'` is
  applied to the running service. As a second, independent guard, `context.ts`'s existing boot-time flag
  check (CS-7) additionally refuses to start if `DIRECTED_DISPATCH_ENABLED==='true'` and any
  `recovery_cases` document matching this section's scope (held, any eligible status including wrap-up)
  still has `dispatchStatus` unset — a cheap existence query run once at boot, failing startup loudly
  rather than letting an un-migrated case silently fall through §3.5's new predicate.

---

## 2. Admin dispatch router — `admin-case-dispatch.ts`

New sibling router, following `admin-partner-organizations.ts`'s convention (own file, own
`create*Router(ctx)` export, mounted under `/v1` in `context.ts`'s router list). Middleware chain:
`authenticate` → `requireUserType('admin')` → step-up check (ADR-0012, dispatch/re-dispatch only) →
per-route `createRateLimiter` **(named explicitly per route below — [SE-2])**.

**[SE-1] Validation, every route in this router.** `req.query` and `req.body` on every route below are
parsed through a named `zod` schema before any value reaches a repository filter — the same convention
`security-cases.ts` already uses for its own routes (e.g. `caseIdParamsSchema`), extended here to close
the NoSQL query-operator injection opening `security-engineer` found (SE-1): Express's default query
parser turns `?dispatchStatus[$ne]=null` into `{ $ne: 'null' }`, so a bare "truthy" check is not enough.
Schemas, named so `backend-engineer` builds directly against them:
- `adminDispatchListQuerySchema = z.object({ status: z.enum(['open','investigating','tracking','recovered','closed']).optional(), dispatchStatus: z.enum(['undispatched','pending','accepted']).optional(), limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().optional() })`
  — used by 2.1 and 2.2 (count ignores `limit`/`cursor`).
- `dispatchCaseBodySchema = z.object({ partnerOrganizationId: z.string().regex(ORG_ID_SHAPE) })` — used
  by 2.3 (`ORG_ID_SHAPE` is whatever string-shape check `security-cases.ts`/`admin-partner-organizations.ts`
  already apply to an org id; reuse it rather than inventing a second one).
- `reDispatchBodySchema = z.object({ targetPartnerOrganizationId: z.string().regex(ORG_ID_SHAPE).nullable(), reason: z.enum(['partner_declined','partner_handed_back','agreement_ended','admin_recall','other']) })`
  — used by 2.4.
- `approveBodySchema = z.object({ pendingApprovalId: z.string() })` — used by 2.4's `approve` call.
- `statusPatchBodySchema` — see 2.5 below.
A request failing any of these returns `400 VALIDATION_ERROR`, never a widened or unfiltered Mongo
query. `qa-architect` adds a contract test sending `{ "$ne": null }`-shaped values as query/body input
to each route and asserts the rejection, per SE-1.

### 2.1 `GET /v1/admin/dispatch/cases`
List the dispatch queue: undispatched cases, plus (query-filterable) dispatched/accepted cases, for
admin visibility. **No partner org can reach any part of this router.**

- Query: validated by `adminDispatchListQuerySchema` above (`status?`, `dispatchStatus?`, `limit`,
  `cursor`, existing `parseMongoPaginationQuery` convention for pagination).
- Response `200`: `{ data: AdminDispatchCaseView[], pagination: { nextCursor, hasMore } }`.
  `AdminDispatchCaseView` is a full-fidelity admin view relative to the partner tiers — **[A8] it does
  NOT include `lastLocation`/`lastLocationAt`**. A bulk list of every open theft case's coordinates in
  one page is the insider-surveillance aid `security-engineer`/`compliance-specialist` (s10 minimality)
  both flagged; a dispatch decision needs no coordinates. Location stays available only on the per-case
  detail route (2.6 below), which carries its own per-subject Trail B row.
- Writes an `admin_access_log` bulk-disclosure row (Trail B) per page, same pattern as
  `security-cases.ts`'s list handler, keyed per-case not per-subject.
- Registered **above** `/admin/dispatch/cases/:caseId` and `/admin/dispatch/cases/count` per the
  BA-4 ordering rule.
- **[SE-2] Rate limiter, named:** `createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => \`admin-dispatch-list:${req.auth!.accountId}\`)`
  — the same `DEFAULT_AUTHENTICATED_LIMIT` pattern `security-cases.ts:106` already applies to its own
  list route, keyed per admin account. Named explicitly here rather than left to "per-route
  `createRateLimiter`" as a one-line summary, since an unspecified limiter on the one route that lists
  every open theft case is a bulk-disclosure amplifier on top of A8, not just generic hygiene.

### 2.2 `GET /v1/admin/dispatch/cases/count`
Same filters as 2.1 (validated by the same `adminDispatchListQuerySchema`), `{ data: { count } }`.
Registered before any `:caseId` route on this prefix. Uses the cheap unlogged
`auditLog.recordBulkDisclosure` pattern (Trail A), mirroring `security-cases.ts`'s `/count` handler
(RR-012-1 precedent) — not Trail B, since no case content is returned.
- **[SE-2] Rate limiter, named:** `createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => \`admin-dispatch-count:${req.auth!.accountId}\`)`
  — same pattern as `security-cases.ts:155`'s count route.

### 2.3 `POST /v1/admin/dispatch/cases/:caseId/dispatch`
Dispatch an undispatched (or hand-backed/unassigned) case to exactly one partner org. **Requires
step-up (CS-1).**

- Body: validated by `dispatchCaseBodySchema` above — `{ partnerOrganizationId: string }`.
- **[A2] Precondition, with a named eligibility source, not a document.** Case exists; `dispatchStatus`
  is `null` (undispatched or just unassigned); target org is eligible per **one** of the following, which
  this document now specifies rather than leaving as "the registry or its documented single-org
  equivalent":
  - **(a) PDM-6 registry fields on `partner_organizations`:** `agreementStatus` (`'executed' |
    'terminated'`), `agreementReference`, `effectiveFrom`, `terminatedAt`. The handler reads
    `ctx.partnerOrganizations.findById(partnerOrganizationId)` and checks
    `agreementStatus === 'executed' && terminatedAt === null`. An admin route (owned by
    `admin-partner-organizations.ts`, not this router) sets `agreementStatus: 'executed'` — moving to
    `executed` requires step-up (chair's ruling, ADR §2) and writes its own Trail B row. Terminating an
    org (`agreementStatus: 'terminated'`, `terminatedAt` set) returns the org's open cases to the queue
    and revokes its operator sessions (PDM-6, D3.4) — out of this router's scope, owned by
    `admin-partner-organizations.ts`.
  - **(b) For the one-partner pilot only:** a server-side allowlist read from config/env (a single org
    id), used as "the documented single-org equivalent" referenced above. **[CO-OB03-4]** The allowlist
    entry is not a bare id — it records the executed agreement's reference and effective date (the
    SR-INC002B-S2 artefact): `{ partnerOrganizationId, agreementReference, effectiveFrom }`, checked into
    this document as the record compliance requires:
    - `partnerOrganizationId`: set once the pilot partner is selected (not yet assigned — placeholder).
    - `agreementReference` / `effectiveFrom`: set once SR-INC002B-S2's agreement is executed. **Both
      fields are a precondition of the flag flip, not of the build** — the allowlist constant may exist
      in code with these fields `null`/empty before the agreement exists, but the flag does not flip to
      `true` in a non-development environment until they are populated (chair §5, compliance C6).
    - Option (a) is still owed before a second partner organization is onboarded (A2's original text).
  - **`accept` (§3.1) re-checks the same eligibility source** at acceptance time, since an org may be
    terminated between dispatch and accept. The active-only `status` flag on today's directory (C-5) is
    never sufficient on its own — `agreementStatus`/the allowlist is the authoritative check.
- On success: `dispatchStatus: 'pending'`, `partnerOrganizationId` set, `dispatchedAt`, `dispatchedBy`
  set, plus `firstDispatchedAt` set only if currently null and `dispatchCount` incremented (persisted
  facts needed by A4's state-keyed two-admin rule in §2.4 below — these survive a later return-to-queue,
  unlike `dispatchedBy`, which is overwritten on each dispatch). Writes a **Trail B row** naming the admin
  and target org (CS-1) — see the global [A6] note: no OB-04 write in Tier A. Triggers the PDM-5/SG-10
  partner push (asset category + reference only, CS-6, **and never `assetId`** — see **[CO-OB03-2]**
  below) to the target org's operators only.
- Responses: `200 { data: AdminDispatchCaseView }` on success. `409 CONFLICT` if `dispatchStatus` is
  not `null` (someone else dispatched it first — compare-and-set loser). `422` if the target org is not
  eligible per the check above. `404` if the case does not exist.

**[CO-OB03-2] The theft-report broadcast push is turned off when `DIRECTED_DISPATCH_ENABLED` is on, and
`assetId` is dropped from the replacement.** `recovery.ts:128-141`'s `notifySecurityOperatorsTheftReported`
call, which today pushes `caseId`, `referenceNumber`, `assetType` and **`assetId`** to
`listActiveSecurityOperatorIds()` — every active operator in every org, with no agreement or eligibility
filter — is a required behavior change here, not an afterthought: compliance found this is a POPIA
disclosure to operators who may have no s21 written agreement, and outside the s13 purpose the customer
was told about (one partner, chosen by us). **Required change:** while `DIRECTED_DISPATCH_ENABLED` is
`'true'`, `recovery.ts`'s theft-report handler does not call `notifySecurityOperatorsTheftReported` at
all. The **only** partner push for a case, from report through dispatch, is this route's
target-org-only push at the moment of dispatch (above), carrying asset **category** and **reference
number** only — never `assetId`, and never any other internal identifier. Contract tests: a theft report
filed with the flag on sends no partner push to any org; a subsequent dispatch sends a push only to the
target org's operators, and that push's payload contains no `assetId` field. This binds the same
real-traffic flip as CO-OB03-1 below, and also binds any `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR` flip
made without directed dispatch, since the broadcast exists today independent of this feature's flag.

### 2.4 `POST /v1/admin/dispatch/cases/:caseId/re-dispatch`
Hand a case back to the queue, or move it directly to a different org. **Requires step-up.**

**[A4] The two-admin gate is state-keyed, not route-keyed — this is the fix for the review's G-1
compositional-bypass finding (B3), and the chair required it be built into this shared transition now
even though the bypass itself has no location payoff until Tier B (no pre-authorization can exist while
`PARTNER_LOCATION_SHARING_ENABLED` is off).** The prior draft required second-admin approval only when
*this* call named a different target org, which left a bypass: re-dispatch-to-null (single-admin) then a
plain `dispatch` (§2.3, single-admin, since `dispatchStatus` is `null` again) naming org Y changes the
recipient with one admin across two calls. **Required rule, enforced in the shared dispatch transition
used by `dispatch` (§2.3), `re-dispatch` (here) and `approve` (below) alike:** any dispatch of a case
that (a) has been dispatched before to any org — tested via `firstDispatchedAt !== null` (persisted by
§2.3, survives return-to-queue, unlike `dispatchedBy` which is overwritten) — **and** (b), for Tier B
only, has a live or consumed pre-authorization (not reachable while `PARTNER_LOCATION_SHARING_ENABLED`
is off, so a no-op condition under Tier A alone) requires second-admin approval. A case's first-ever
dispatch stays single-admin, as CS-1 allows, with CS-2 as the detective control. Contract tests
(`qa-architect`): null-then-dispatch, decline-then-dispatch and lapse-then-dispatch each require 202
pending-approval on the second call, not 200.

- Body: validated by `reDispatchBodySchema` (§2, SE-1) — `{ targetPartnerOrganizationId: string | null, reason: RedispatchReason }`
  where `RedispatchReason` is a fixed enum (`partner_declined`, `partner_handed_back`, `agreement_ended`,
  `admin_recall`, `other`). `targetPartnerOrganizationId: null` means "return to the queue with no new
  holder" (`case_unassigned`, not `case_reassigned` — compliance OQ-2).
- **[A9(iii)] Same-holder re-dispatch (`targetPartnerOrganizationId` equals the case's current holder) is
  rejected with `422 NO_OP_TARGET`.** The prior draft left this path's effect undefined. It has no
  legitimate use (nothing changes) and is removed rather than given a defined no-op behavior, closing the
  ambiguity the review flagged.
- **If `targetPartnerOrganizationId` is `null`:** single-admin call (subject to the state-keyed gate
  above), same shape as 2.3's precondition/response pattern, ends any active grant with
  `endReason: 'case_unassigned'` via `ctx.partnerLocationShareGrants.endGrant(...)` (Tier B only — no
  grant exists under Tier A alone). **[CO-OB03-6]** The response and the customer-facing case view both
  reflect `status: 'returned_to_queue'` (or whatever status label the customer UI shows for "no partner
  currently assigned") immediately on this transition — the customer's view must never continue to read
  "assigned" once a hand-back/re-dispatch-to-null has happened; no new consent or push is required for
  this, accuracy is the requirement (s16).
- **If `targetPartnerOrganizationId` is a *different* org, and the state-keyed gate above requires
  approval:** this call creates a `pendingApproval` record on the case (not yet a mutation) and returns
  `202 { data: { pendingApprovalId } }`. **[A4] `pendingApproval` schema, specified** (the prior draft
  left this undefined — `database-architect` appends it to the Stage 6 doc as an append-only amendment):
  ```
  pendingApproval: {
    id: string,
    requestedBy: adminAccountId,
    requestedTargetOrgId: string,
    requestedAt: Date,
    expiresAt: Date,              // requestedAt + 24h (suggested default)
    snapshot: { partnerOrganizationId, dispatchStatus, status }
  }
  ```
  A second admin calls **`POST /v1/admin/dispatch/cases/:caseId/re-dispatch/approve`** with body
  validated by `approveBodySchema` (§2, SE-1) — `{ pendingApprovalId: string }`. **This call also
  requires step-up** (the prior draft's §8 table showed approve gated by the flag only — the approving
  admin is the one who actually discloses the case to the new org, so the chair's CS-1 ruling applies to
  approve, not only to dispatch/re-dispatch). The server rejects (`403 CSA_SAME_ADMIN`) if the approving
  admin's `accountId` matches `requestedBy`. The approve call is a compare-and-set that additionally
  requires the case still to match `pendingApproval.snapshot` (otherwise `409`), closing a TOCTOU window
  on a case that changed state since the request. Approving admin sees the target org's name and the
  request's `reason` before approving, not just an id. Only the approval call performs the actual state
  mutation, Trail B write (naming **both** admins), and grant-end (Tier B only; no OB-04 write — [A6]).
  The request call writes its own Trail B row (requester, target org) at creation time. `pendingApproval`
  is cleared from the case document on approval, expiry, or an explicit cancel by the requester (no new
  route needed for cancel if `re-dispatch` itself is called again before expiry, overwriting the pending
  record) — compliance's reasoning: the Trail B rows are the durable record of the decision, the
  in-document field does not need to persist once its outcome is recorded. If the pending approval's
  `expiresAt` lapses, the request is void; the requester must call `re-dispatch` again.
  - **Residual, accepted and recorded (per the chair).** `CSA_SAME_ADMIN` compares `accountId`s. One
    human holding two admin accounts defeats it. Admin account issuance is an identity-governance
    control (ADR-0006), not this feature's — accepted, not silently assumed away.
  - **Same-holder approval requests are rejected** by the same `422 NO_OP_TARGET` rule as above (A9(iii)).
  - This is the smallest change that satisfies CS-1 without inventing a new generic "pending-admin-action"
    primitive elsewhere in the codebase.
- Responses: `200` (single-admin path, mutation complete) / `202` (two-admin path, awaiting approval) /
  `404` / `409` (case already moved, or approval snapshot mismatch) / `403` (same-admin approval attempt)
  / `422` (same-holder target — A9(iii)).

**Why no separate "hand-back" route distinct from re-dispatch.** ADR-0017 D1 describes "hand back" and
"admin re-dispatch to a different org" as two concepts, but both are "move the current holder off this
case, optionally naming a new one" — one route with a nullable target, differing only in whether the
second-admin gate applies, is the same-shape change BA-4/BA's own review already characterized this
whole family as. A partner-initiated hand-back (§3.4 below) calls into the *same* underlying
repository/service transition the admin single-target re-dispatch does, just from the partner router
with no target org (always `case_unassigned`).

### 2.5 `GET /v1/admin/dispatch/cases/:caseId` — detail (specified; was listed in the §8 table with no section)

**[A8]** The admin detail route, unlike the list (2.1), **does** include `lastLocation`/`lastLocationAt`
when present — a single-case decision may legitimately need it — but each call writes a **per-subject**
Trail B row (not the list's per-page bulk-disclosure row), naming the admin, the case, and the customer
`accountId`, so "who viewed this customer's location and why" is always answerable. Query/param
validation per SE-1 (`caseIdParamsSchema`, existing convention). No new rate-limiter name beyond the
per-route `createRateLimiter` default, since this is a single-record read, not a bulk one.

### 2.6 `PATCH /v1/security/cases/:caseId` — status (new route; [A3])

**[A3]** This route was missing from the prior draft entirely — the route table listed partner `messages`
as "unchanged" but omitted status transitions altogether. It is **partner-facing**, mounted on
`security-cases.ts` (not this admin router), and is specified in full in §3.1a below. Listed here only
so the admin-side dispatch-status lifecycle this section describes is cross-referenced from the point a
reader would expect to find it.

---

## 3. Partner-facing changes — `security-cases.ts`

Per R-1 (cto ratification): `claim`, `release`-to-pool, and `reassign` are **removed in lockstep**, same
`/v1` path, same release as the admin router above, gated on `DIRECTED_DISPATCH_ENABLED`. No 410
deprecation window (no real partner traffic — `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR="false"`). Mobile
operator app and web security dashboard builds ship the same release, gated on the same flag.

**[SE-1] Validation.** Every route in this section parses its body through a named `zod` schema before
any value reaches `buildPartnerOrgQuery`/a repository filter, same convention as §2's admin router:
`acceptBodySchema` (empty body, just the `caseId` param), `declineBodySchema = z.object({ reason:
z.enum(['no_capacity','outside_service_area','other']) })`, `releaseBodySchema = z.object({ reason:
z.enum(['recovered_independently','unable_to_proceed','agreement_lapsed','other']) })`,
`statusPatchBodySchema` (§3.1a below). `caseId` params continue through the existing
`caseIdParamsSchema`.

### 3.1 `POST /v1/security/cases/:caseId/accept` (replaces `claim`)
- Precondition: case is held by caller's org (`partnerOrganizationId === callerOrgId`),
  `dispatchStatus === 'pending'`. Same compare-and-set idiom as today's `claim`
  (`recovery-cases.ts:878-917`), guarded on `dispatchStatus` instead of `partnerOrganizationId: null`.
  **[A2]** Re-checks the org's eligibility against the same source named in §2.3's A2 fix (registry
  `agreementStatus`/allowlist) — an org may have been terminated between dispatch and accept.
- On success: `dispatchStatus: 'accepted'`, `acceptedAt` set, case `status` moves to `investigating` if
  still `open`. Writes a **Trail B row** (per the global [A6] note — no OB-04 write in Tier A).
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
- Body: validated by `declineBodySchema` above — `{ reason: DeclineReason }`, fixed enum (`no_capacity`,
  `outside_service_area`, `other`) — CS-6: no free-text location-adjacent reason.
- On success: case returns to the admin dispatch queue — same underlying transition as admin
  re-dispatch-to-null (§2.4's single-admin path, including that transition's A4 state-keyed gate check),
  `dispatchStatus: null`, `partnerOrganizationId: null`. Writes a **Trail B row**, `action:
  'dispatch_declined'` (per [A6] — no OB-04 write in Tier A; kept distinct from `case_unassigned` in the
  action-name vocabulary so a later Feature 019 addition can still tell "declined" apart from "handed
  back after acceptance"). No grant existed yet at `pending` (D3.2: grants activate on acceptance only),
  so no grant-end step applies here. **[CO-OB03-6]** customer-facing case status updates to reflect
  "returned to queue" / "no partner currently assigned" immediately, not "assigned".
- Response: `200 { data: { caseId, status: 'returned_to_queue' } }` to the declining org. `404`
  (CS-8 oracle) if the case is not dispatched to the caller's org.

### 3.3 `POST /v1/security/cases/:caseId/release` (hand-back, repurposed — "becomes hand back" per D1)
- Precondition: case is held by caller's org, `dispatchStatus === 'accepted'`.
- Body: validated by `releaseBodySchema` above — `{ reason: HandBackReason }`, fixed enum
  (`recovered_independently`, `unable_to_proceed`, `agreement_lapsed`, `other`).
- On success: same underlying transition as admin re-dispatch-to-null (§2.4, including A4's state-keyed
  gate), `dispatchStatus: null`, `partnerOrganizationId: null`, any active grant ended with `endReason:
  'case_unassigned'` (compliance OQ-2 — a hand-back is not a reassignment to a new org; Tier B only).
  Writes a **Trail B row**, `action: 'case_handed_back'` (per [A6] — no OB-04 write in Tier A).
  **[CO-OB03-6]** customer-facing case status updates to "returned to queue" / "no partner currently
  assigned" immediately — this is the review's explicit example of a hand-back that must not leave the
  customer's view reading "assigned".
- Response: `200 { data: { caseId, status: 'returned_to_queue' } }`. `404` (CS-8 oracle) otherwise.

### 3.4 `reassign` — removed
No route. Calling it after the flag flip returns `404` (unmounted, not merely unimplemented — same
"literally not mounted" treatment as the flag-gating rule in §0, since real traffic does not exist to
protect with a softer deprecation response per R-1).

### 3.1a `PATCH /v1/security/cases/:caseId` — status [new route; A3]

**Missing from the prior draft entirely** — the route table listed `messages` as "unchanged" and said
nothing about status transitions at all, despite the existing `security-cases.ts` status route being one
of the routes this feature changes the guard on.

- Body: validated by `statusPatchBodySchema = z.object({ status: z.enum(['investigating','tracking','recovered','closed']) })`.
- **Precondition, Tier A: the compare-and-set filter requires `partnerOrganizationId === callerOrgId`
  AND `dispatchStatus === 'accepted'`** — not `partnerOrganizationId` alone, which is this route's share
  of the A1 predicate fix below (a pending-not-yet-accepted org must not be able to move a case's status
  any more than it can message the customer). Forward transitions follow the existing
  `RECOVERY_CASE_FORWARD_TRANSITIONS` table, unchanged.
- **Precondition, Tier B only:** a transition to a terminal status (`recovered`/`closed`) additionally
  calls `endGrant(..., 'case_terminal')` synchronously as part of the same write, per D3.4 — out of scope
  for this Tier A pass (B7), named here only so the call site is not invented ad hoc when B7 is designed.
- On success: writes a **Trail B row** (per [A6] — no OB-04 write in Tier A). **[CO-OB03-6]** a terminal
  transition updates the customer-facing view/any status push to match (already true of the existing
  route; restated here because this document now specifies the route for the first time).
- Response: `200 { data: ClaimedTierRecoveryCaseView }`. `404` (CS-8 oracle) if the case is not
  dispatched-and-accepted for the caller's org. `409` if the requested transition is not in
  `RECOVERY_CASE_FORWARD_TRANSITIONS` for the case's current status.

### 3.5 List / count / detail — predicate change only, same routes

**[A1] The shared predicate itself changes, not just a list branch — this is the review's highest-severity
Tier A finding.** `GET /v1/security/cases`, `/count`, `/:caseId` keep their existing paths, serializers,
and tier-selection logic (`serializePartnerCase`), but the fix is in the **shared**
`claimedCaseVisiblePredicate()` (`recovery-cases.ts:457`) — the single predicate behind list, count,
**detail** (`findByIdForPartnerOrg`), and therefore **messages** (`security-cases.ts:604`, which gates on
`tier === 'claimed'`) and the new status-PATCH route above (§3.1a). The prior draft described the fix as
a change to `buildPartnerOrgQuery`'s claimed branch only, which would leave the shared predicate matching
on `partnerOrganizationId` alone — giving a **pending, not-yet-accepted** org Tier 2 detail and message
access before it ever accepts the case, and dropping the existing PDM-4 90-day wrap-up `$or` clause in
the process. **Required shape, replacing the single predicate with two:**
- **Pending predicate (new):** `{ partnerOrganizationId: callerOrgId, dispatchStatus: 'pending', status: 'open' }`
  — offer tier, no location, same `OFFER_TIER_FIELD_EXCLUSION_PROJECTION` as before.
- **Claimed predicate (fixed, wrap-up clause restored):**
  `{ partnerOrganizationId: callerOrgId, dispatchStatus: 'accepted', $or: [<the existing PDM-4 wrap-up clauses, unchanged>] }`
  — claimed tier, unchanged projection, but now gated on `dispatchStatus: 'accepted'` in addition to the
  org match, and with the wrap-up `$or` preserved rather than dropped.
- **[CO-OB03-3]** Both predicates are additionally scoped by the org's agreement status: a **terminated**
  org (per §2.3's A2 eligibility source) must not match either predicate, including within the 90-day
  wrap-up window — termination ends Tier 2 access immediately, not after wrap-up expires, since once a
  POPIA s21 agreement has ended the operator has no basis for continued access. In practice this means
  the claimed predicate's org match is evaluated against the *current* agreement status at query time
  (not cached), or equivalently the termination transition (§2.3(a)) proactively clears
  `partnerOrganizationId` on every case the org holds, closed or open, wrap-up window or not — either
  implementation is acceptable as long as the contract test below passes.
- **All three of list, count and detail use these two functions** (C-012-3), and the new status-PATCH
  route (§3.1a) and `messages` (§3.6) both route through the claimed predicate for their own access check.
- `unclaimedCaseVisiblePredicate()`'s OR-branch is still removed entirely (not narrowed), so **no org ever
  sees another org's pending or accepted case** — the literal "no partner org can see an undispatched
  case in any form" requirement (D1).
- **Tests (qa-architect):** a pending org's detail call returns the offer tier; its `messages` and
  status-PATCH calls return `404`. An accepted case closed 30 days ago is still visible at Tier 2
  (wrap-up restored). Terminate that org and the same case returns `404` immediately, even inside the
  90-day window (CO-OB03-3).

### 3.6 Messages (`POST /v1/security/cases/:caseId/messages`) — unchanged contract, gated by the fixed predicate
No change to the route's request/response contract. CS-6's template rule (no coordinate/place-name in
message bodies) is an existing free-text field already covered by that condition, not a new route
concern. What changes is upstream: this route gates on `tier === 'claimed'`, so it inherits §3.5's A1 fix
automatically — a pending org can no longer reach it, closing the pre-acceptance messaging gap the review
found.

### 3.7 Customer push suppression on reported-stolen devices [CO-OB03-1] — binds Tier A

**New control, required before either flag's first non-development switch-on** (whichever of
`DIRECTED_DISPATCH_ENABLED` or `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR` flips first), per compliance's
ruling that CR-8 was never limited to the location flow it was first written for: the underlying ground
is POPIA s19 (reasonable measures against disclosure to an unauthorised recipient), which applies the
moment a device is reported stolen, with or without location sharing. Today's `claim`-path behavior
(unfiltered push to every enabled token) does no harm only because there is no real partner traffic yet;
directed dispatch makes partner-driven status changes and messages real, so the control must land in the
same change that makes them real.

- **(a) Scope.** Every customer push sent through `sendTheftEmailAndPush` for a recovery case:
  `recovery.case.created`, `.assigned`, `.updated`, `.recovered`, `.closed`, `.message`, and any new Tier
  A template this document adds (accept/decline/hand-back status pushes, §3.1–3.3). Implemented in one
  place in the recovery notification path — e.g. an `excludeDeviceIds` parameter threaded through
  `sendToAccount` — so no individual call site can forget it.
- **(b) Which device, evaluated at send time.** The reported device is the case asset's
  `reportingDeviceId` (`backend/src/repositories/assets.ts:268`). Evaluated fresh on every send, not
  cached from report time. A push token is skipped when `token.deviceId === reportingDeviceId`. An asset
  with no binding (laptop, vehicle, TV — not a phone) suppresses nothing.
- **(c) CR-7 carve-out.** If the theft report was filed from the reported device itself, suppression does
  not apply — the person holding it is presumed to be the customer, and CR-7 forbids demoting the
  reporting session. The case does not currently record the reporting session's device;
  `backend-architect` adds `reportedFromDeviceId` on case creation (`database-architect` appends the
  field to the Stage 6/`recovery_cases` schema) to make this check possible.
- **(d) Fail closed.** A binding-lookup error suppresses the push entirely for that event (no push sent).
  Email still sends unconditionally — a missed push is recoverable, a disclosure to the person holding
  the stolen device is not.
- **(e) Email is not device-targeted — accepted residual.** Email may be read on the stolen phone's mail
  app; the push-specific controls in (f) below are what keeps it safe to fall back to, together with the
  existing CR-8 deep-link-to-sign-in behavior on email.
- **(f) No partner free text in any push payload.** `recovery.case.message`'s push body becomes generic
  ("New message about case [reference]"); the partner's actual text is shown only after authentication,
  in-app or in the email body. This also covers the cases where device identity cannot be resolved (a
  null `reportingDeviceId` binding, or a thief's own second device signed in with stolen credentials) —
  s10 minimality: a notification only needs to say that something happened.
- **(g) Tests (qa-architect).** A reported-device token receives no push for a case event while a second
  token on the same account does. A null binding suppresses nothing and the payload is the generic form.
  A binding-lookup failure sends no push and still sends the email.
- **(h) Out of scope for this control.** Non-case pushes (login alerts, plan notices) to the stolen device
  remain CS-3/CR-1's untrusted-session scope (Tier B, `authentication-engineer`) — not pulled in here.
- **Breach classification.** Once this control is live, a case push delivered to a reported device's
  token is logged and root-caused as a POPIA s19 incident via the INC runbook. It is not automatically a
  s22 notification event; s22 is assessed case-by-case only if the device holder is shown to have read
  the content. Before this control is live there must be no real partner traffic, so the question does
  not arise in practice.
- Owners: `notification-engineer` (transport), `backend-engineer` (implementation), `qa-architect` (tests).

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
`admin-case-dispatch` (queue list/count/detail/dispatch/re-dispatch/approve), `security-cases-accept-decline`
(amendment to the existing `backend-security-cases` entry, not a new one, since it is the same router —
now also covering the new status-PATCH route, §3.1a), `security-cases-location` (the partner location
route — flagged by CS-9 as a **mandated threat-model workshop item** before its own Stage 8, not just a
manifest line), `recovery-location-share-grants` (the customer grant/pre-auth routes),
`dispatch-location-sweeper` (the sweeper, as a job rather than an HTTP route, still gets an entry per
CS-9's "each new ... route" read broadly to cover the equivalent privileged-write surface), and
**`recovery-case-push-suppression`** (new — the CO-OB03-1 device-filtered push path and the CO-OB03-2
removal of the unfiltered theft-report broadcast push, §3.7/§2.3, both merge conditions for Tier A).

---

## 8. Summary — route list

| Method | Path | Router | Flag |
|---|---|---|---|
| GET | `/v1/admin/dispatch/cases` | `admin-case-dispatch.ts` (new, list — no `lastLocation`, [A8]) | `DIRECTED_DISPATCH_ENABLED` |
| GET | `/v1/admin/dispatch/cases/count` | same | same |
| GET | `/v1/admin/dispatch/cases/:caseId` | same (detail, §2.5 — includes `lastLocation` + per-subject Trail B row, [A8]) | same |
| POST | `/v1/admin/dispatch/cases/:caseId/dispatch` | same | same, + step-up |
| POST | `/v1/admin/dispatch/cases/:caseId/re-dispatch` | same | same, + step-up (+2nd admin if cross-org) |
| POST | `/v1/admin/dispatch/cases/:caseId/re-dispatch/approve` | same | same |
| GET | `/v1/security/cases` | `security-cases.ts` (predicate change only) | `DIRECTED_DISPATCH_ENABLED` |
| GET | `/v1/security/cases/count` | same | same |
| GET | `/v1/security/cases/:caseId` | same | same |
| POST | `/v1/security/cases/:caseId/accept` | same (replaces `claim`) | same |
| POST | `/v1/security/cases/:caseId/decline` | same (new) | same |
| POST | `/v1/security/cases/:caseId/release` | same (repurposed: hand-back) | same |
| PATCH | `/v1/security/cases/:caseId` | same (new, status — §3.1a, [A3]) | same |
| POST | `/v1/security/cases/:caseId/messages` | same (unchanged, gated by fixed predicate — §3.6) | n/a |
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

---

## 3.8 `dispatchStatus` as the client's mode signal (append-only addition, 2026-11-03)

Formalizes the `cto` disposition on the Stage 10 QA report's Finding 1
(`qa-report-ob03-dispatch-tier-a.md`): the field/client-flag choice is decided in favor of a
server-authoritative field, not a client-side build/`featureEnabled()` flag — rejected because
mobile's `featureEnabled()` fails open in local dev, and a client flag would create client/server
skew on long-lived mobile binaries. This section is additive to §3.5/§3.1/§3.2 above, not a
redesign of any route already specified there.

- **The field:** `dispatchStatus: 'pending' | 'accepted'`, added to the partner-visible list and
  detail response rows — i.e. the objects returned by `serializeOfferTierRecoveryCase` (pending
  tier) and `serializeClaimedTierRecoveryCase` (claimed tier) in
  `backend/src/repositories/recovery-cases.ts`. Both functions gain the field **only** when
  `DIRECTED_DISPATCH_ENABLED` is `'true'`; in pool mode (flag off) the field is **omitted
  entirely** from both serializers' output — not `null`, not absent-but-typed, not present with an
  `'undispatched'` value. Omission itself is the pool-mode signal.
- **Values, exhaustive:**
  - `'pending'` — the case is offered to the caller's org (`dispatchStatus: 'pending'` in the
    underlying document, §3.5's pending predicate) and the row came from
    `serializeOfferTierRecoveryCase`. The client renders the accept/decline affordances.
  - `'accepted'` — the case is held-and-accepted by the caller's org (§3.5's claimed predicate)
    and the row came from `serializeClaimedTierRecoveryCase`. The client renders the
    release/hand-back and status-update affordances, never accept/decline.
  - **Absent (key not present on the object at all):** dispatch mode is off for this
    deployment/environment. The client falls back to today's pool-mode claim affordance. A client
    must branch on `'dispatchStatus' in row` (or equivalent key-presence check), never on
    `row.dispatchStatus === undefined`, since JSON serialization and any intermediate client
    cache must not be relied on to preserve the distinction between "absent key" and "key present
    with value `undefined`" — the server never sends the latter.
  - No other string value is ever present on this field in a partner-visible response. (The
    underlying document's `dispatchStatus: null`/`'undispatched'` document states are never
    themselves serialized onto a partner-visible row — a case in those states does not match
    either §3.5 predicate and so is not returned to this org as a row at all.)
- **Decline/release response shape (confirms §3.2/§3.3 above, restated for `backend-engineer`'s
  convenience, not a change to either):** both `POST /v1/security/cases/:caseId/decline` and
  `POST /v1/security/cases/:caseId/release` return exactly
  `{ data: { caseId: string, status: 'returned_to_queue' } }` — a deliberately minimal shape,
  structurally distinct from both `OfferTierRecoveryCase` and `ClaimedTierRecoveryCase`, carrying
  no `dispatchStatus` field at all. This is the signal to the calling client that the case has
  left its list entirely: the client navigates back to the list view rather than attempting to
  re-render the same case in place (there is nothing left for it to hold a tier-typed row for —
  the org no longer has any claim on this case per §3.5's predicates).
