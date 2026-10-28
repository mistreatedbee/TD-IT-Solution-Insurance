# Feature 018 — Claims Filing and Adjudication — Security Review (Stage 8)

**Status:** **BLOCKED.** The feature flag (`EXPO_PUBLIC_FEATURE_CLAIMS`) must not be flipped in any
non-development profile until SR-018-1 through SR-018-8 are closed and re-verified. SR-018-2 also needs
action **now**, whether or not the flag is ever flipped. The backend claims API is already live and
reachable without the mobile flag (§2).
**Date:** 2026-10-28
**Lifecycle stage:** 8 — Security Review (hard gate). **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate status — INCOMPLETE:** `security-engineer` (R) concurrence **not yet recorded**.
`compliance-specialist` (C) concurrence **not yet recorded**. Their quick check at
`business-requirements.md` §8 says it is not a Stage 8 review. Under `02-feature-lifecycle.md` and root
`CLAUDE.md`, Stage 8 is discharged only when all three roles sign. **Stage 8 is not discharged.**

**Scope of this gate (what was reviewed):**
- `POST /v1/claims`, `GET /v1/claims`, `GET /v1/claims/:claimId`, `PATCH /v1/claims/:claimId/respond`,
  `PATCH /v1/claims/:claimId/withdraw` (customer)
- `GET /v1/admin/claims`, `GET /v1/admin/claims/:claimId`, `PATCH /v1/admin/claims/:claimId` (admin, step-up
  gated per commit `177730f`)
- The `claims` Mongo collection as the repository writes it
- The `admin_access_log` `'claim'` resourceType extension (Trail B)

**Out of scope (no sign-off implied):** any payout/disbursement path from `awaiting_payout` (not built; a future
feature that **must** get its own Stage 8 — see C-018-4); evidence upload (MP-5, not built); the admin web UI
(`src/admin/pages/AdminClaimsPages.tsx`) beyond confirming it handles `STEP_UP_REQUIRED`; mobile screen UX.

**Running code read (2026-10-28, not inferred from the spec or commit messages):**
`backend/src/lib/claim-rules.ts` · `backend/src/repositories/claims.ts` · `backend/src/routes/claims.ts` ·
`backend/src/routes/admin-claims.ts` · `backend/src/lib/claim-serializers.ts` · `backend/src/lib/step-up.ts` ·
`backend/src/middleware/idempotency.ts` · `backend/src/repositories/idempotency.ts` ·
`backend/src/middleware/require-role.ts` · `backend/src/repositories/admin-access-log.ts` ·
`backend/src/db/feature004-collections.ts` · `backend/src/index.ts` (router mount) · `backend/src/lib/policy.ts` ·
`backend/src/routes/claims.test.ts` / `admin-claims.test.ts` (test names and assertions) ·
`backend/package.json` (zod `^4.4.3`) · `mobile/src/config/features.ts` · `mobile/eas.json` ·
`mobile/src/screens/claims/ClaimDetailScreen.tsx` · `src/admin/AdminRoutes.tsx` ·
`docs/organization/gates/stage8-manifest.json` · `backend/src/repositories/recovery-cases.ts` (CAS precedent).

I did not run the test suite or query the live Atlas cluster. This review is a code read. Where a finding
depends on production state (SR-018-1), that dependency is stated explicitly.

---

## 0. Verdict

**BLOCKED — eight must-fix items before the flag flips.** The core authorization model is sound:

- **No IDOR.** Every customer read and write predicates the Mongo query on the token-derived `accountId`. The
  policy, asset and recovery-case lookups on `POST /v1/claims` are account-scoped too. A foreign claim id
  returns a uniform 404.
- **AC-12 holds.** A customer cannot self-adjudicate. `requireUserType('admin')` runs as route middleware
  before any body is parsed, and a test exists (`admin-claims.test.ts:375`).
- **The step-up fix in `177730f` is correctly wired** (§1.3). I found no bypass.
- **The state machine is race-safe at the single-document level.** All four writers are compare-and-set on
  `status`, matching `recovery-cases.ts`'s C-A discipline (§1.4).
- **`fraudFlags` does not reach any customer response today** (§1.5). The rate-threshold correction is
  implemented as flag-only, with no residual block path (§1.6).

The blockers are mostly not in that model. One defect will stop the admin side working at all in
production. One is a gating gap that makes "pending this review" untrue today. The rest are missing
guardrails around money, currency, duplicates and the customer's ability to see why their claim is waiting.

| ID | Severity | Must close before flag flip? | Code fix? | Summary |
|---|---|---|---|---|
| SR-018-1 | **Critical** | Yes | **Yes** | `admin_access_log` DB validator rejects `resourceType: 'claim'`. Every admin claim read and decision will 5xx in production |
| SR-018-2 | **High** | **Immediately** | **Yes** | Backend claims routes are mounted unconditionally. The mobile flag is not a trust boundary |
| SR-018-3 | **High** | Yes | **Yes** | `approvedAmount` has no ceiling, no relation to `claimedAmount`, no precision rule, and is not in the audit trail |
| SR-018-4 | Medium-High | Yes | **Yes** | Currency is customer-controlled and unvalidated. The coverage-limit check ignores currency and fails open if the policy is missing |
| SR-018-5 | Medium-High | Yes | **Yes** | "One open claim per asset" is check-then-insert with no unique index. Idempotency does not reserve the key. Duplicate open claims are possible |
| SR-018-6 | Medium (compliance) | Yes | **Yes** | The customer never sees the admin's more-info request text or administrative close reason |
| SR-018-7 | Medium (fraud) | Yes | **Yes** | The waiting period gates the filing date, not the incident date. A pre-existing loss can be claimed after waiting 30 days |
| SR-018-8 | Medium (process) | Yes | No (manifest + tests) | Stage 8 manifest does not cover the claims surfaces. Several required regression tests are missing |
| C-018-1 … C-018-11 | Low–Medium | No (tracked) | Mixed | §3 |

---

## 1. Verified-correct properties

### 1.1 IDOR / cross-account access

- `ClaimsRepo.findByIdForAccount`, `listByAccount`, `findNonTerminalByAssetForAccount`, `respondToInfoRequest`
  and `withdrawForAccount` all include `accountId` in the Mongo filter. The respond and withdraw mutations do
  this in the `findOneAndUpdate` predicate itself, not only in the pre-read. So a TOCTOU swap between pre-read
  and write cannot cross accounts.
- `POST /v1/claims` resolves `policyId`, `assetId` and `recoveryCaseId` through `*ForAccount` lookups. A
  customer cannot attach another customer's policy, asset or recovery case. The recovery case is also checked
  for `assetId` equality (§1.6 `RECOVERY_CASE_MISMATCH`).
- **Mass assignment: not possible.** `createClaimSchema` is a non-passthrough `z.object` (unknown keys
  stripped). `createForAccount` builds every field explicitly. Sending `status`, `approvedAmount` or
  `fraudFlags` in the body has no effect.
- Exception: `supersedesClaimId` is stored unvalidated. See C-018-6.

### 1.2 AC-12 — customer cannot self-adjudicate

`admin-claims.ts` applies `authenticate` → `requireUserType('admin')` on all three routes. `userType` comes
from the verified access-token claim, not the body. `security_company_operator` and `support_agent` (the other
`PRIVILEGED_USER_TYPES`) are also excluded. Enforcement is route-level, as AC-12 requires. **Verified.**

### 1.3 Step-up gate (commit `177730f`) — verified, no bypass found

- Order on `PATCH /admin/claims/:claimId`: `authenticate` → `requireUserType('admin')` → rate limiter →
  `requireStepUp(ctx, 900s)` → `validateBody` → handler. Step-up runs before the body is even validated,
  so a malformed body cannot reach the handler without a fresh step-up.
- `requireStepUp` re-reads `app.sessions` live (INV-3). It fails closed on a missing or revoked session and on
  a null or stale `mfa_verified_at`.
- **Single mutation entry point.** All five admin actions (`start_review`, `more_info_requested`,
  `approved`, `rejected`, `closed`) go through this one PATCH. No other route mutates a claim. `ctx.claims`
  is referenced only in `claims.ts` and `admin-claims.ts`. So the gate covers every adjudication path.
- `STEP_UP_ACTIONS` registers `claim_adjudication` as `enforced`, which matches the router.
- The admin web UI handles `STEP_UP_REQUIRED` via `useStepUpRetry` (`AdminClaimsPages.tsx:236`).
- Tests cover a stale `mfaVerifiedAt`, a null one, and a fresh one. **Gap:** there is no revoked-session test.
  Add one under SR-018-8.
- Design note, not a defect: per ADR-0012, the login MFA challenge writes `mfa_verified_at`. An admin is
  therefore step-up-satisfied for 15 minutes after an MFA login without a second prompt. That is the ratified
  ADR-0012 posture, applied consistently.
- Minor: the call site reuses `STEP_UP_WINDOW_SECONDS.invitationIssuance`. ADR-0012/`step-up.ts` say to add a
  named window per action class. This is cosmetic (same 900s value as every other Tier-A row) and is noted in
  C-018-11.

### 1.4 State-machine integrity and concurrency

- `CLAIM_FORWARD_TRANSITIONS` has no edge out of `awaiting_payout`, `rejected` or `closed`. `approved` only
  reaches `awaiting_payout`. The admin body schema cannot name `awaiting_payout` (or any other status) as a
  target. Admins can only name an `action`, and the server maps it to a status.
- The forward check runs twice: once in the route (pre-read status) and again in the repository
  (`InvalidClaimStatusTransitionError`).
- **Compare-and-set.** `transitionForAdmin`, `approveAndAdvance`, `respondToInfoRequest` and
  `withdrawForAccount` are each a single `findOneAndUpdate` whose filter includes `status: <expected>`. This
  is the same C-A pattern as `recovery-cases.ts`'s `updateStatusForPartnerOrg` (`status: expectedStatus` in
  the filter at `:788`). Concurrent admin-approve and customer-withdraw on one claim: exactly one write
  matches, and the loser gets `null` → 409. Two admins approving at once: one wins, so `approvedAmount` is
  set once. **Equivalent to the precedent. Verified.**
- `decidedAt` is set unconditionally on terminal entry rather than "only if null". That is safe here because
  every CAS predicate is a non-terminal status, so a write can only ever be the first terminal entry. This
  differs from `recovery-cases.ts`, which needs the null check because it has terminal→terminal edges.
  Acceptable. If a terminal→terminal edge is ever added, the null guard becomes mandatory.
- Approval writes both `statusHistory` entries (`→ approved`, `approved → awaiting_payout`) in one atomic
  update. AC-9 is satisfied.
- Residual race outside the state machine: duplicate creation. See SR-018-5.

### 1.5 `fraudFlags` leakage — none found on any customer path

Every customer response path:

| Path | Serializer | `fraudFlags` present? |
|---|---|---|
| `POST /v1/claims` 201 | `serializeClaimForCustomer` | No |
| `POST /v1/claims` idempotent replay | stored body of the above (customer-shaped) | No |
| `POST /v1/claims` 409 `DUPLICATE_OPEN_CLAIM` | error body carries only the caller's own `claimId` | No |
| `GET /v1/claims` | `serializeClaimForCustomer` per row | No |
| `GET /v1/claims/:claimId` | `serializeClaimForCustomer` | No |
| `PATCH …/respond` | `serializeClaimForCustomer` | No |
| `PATCH …/withdraw` | `serializeClaimForCustomer` | No |

`serializeClaimForAdmin` is imported only by `admin-claims.ts`. The customer serializer is an explicit
allowlist and does not spread the document. It also strips `actorAccountId` from `reviewNotes` and omits
`statusHistory` (which carries admin account ids) and `accountId`. **Verified clean today.**

This is still convention, not construction (same ruling as Feature 011 SR-011-1). The customer serializer
receives the full `ClaimDocument` with `fraudFlags` in scope, and **no test asserts its absence**. Fix:
SR-018-8(b) adds the test (required). C-018-10 adds the repository projection (recommended).

### 1.6 Rate-threshold correction — implemented as flag-only

- `isOverClaimRateThreshold(prior >= 3)` only feeds `computeFraudFlags` → `FLAG_RATE_THRESHOLD`. The 4th
  claim in a 30-day window is flagged, which matches the corrected AC-11.
- I searched `backend/`, `mobile/` and `src/` for `CLAIM_RATE_LIMITED`: no matches. The error code does not
  exist in `errors.ts`, and no branch in `POST /v1/claims` returns early on the count. **No residual hard-block
  path.**
- The test at `claims.test.ts:428` asserts the 201 but **not** that `FLAG_RATE_THRESHOLD` was persisted.
  Covered by SR-018-8(c).

### 1.7 Idempotency-Key — enforced, not just documented

`requireIdempotencyKey('POST /v1/claims', ...)` is in the middleware chain. A missing key, or one that is not
UUID-shaped, gets 400 `IDEMPOTENCY_KEY_REQUIRED`. The lookup is account-scoped (no cross-account replay). Same
key with a different body gets 409. **Enforced.** But there is no test for the missing-header case
(SR-018-8(d)), and the middleware does not reserve the key against concurrent use (SR-018-5).

### 1.8 Input validation — what holds

- `incidentDescription` is 20–5000 characters. `evidenceDescription` is ≤5000, `respond.text` is 1–5000, and
  admin reasons are 1–2000 (trimmed, so whitespace-only is rejected, satisfying AC-8). `express.json` caps
  bodies at 100 kb.
- `incidentDate` must parse, must not be in the future, and must not be before `policy.effectiveDate`.
- Amounts: `z.number().positive()` under **zod 4**, which rejects `NaN` and `±Infinity`. JSON `1e400` (which
  parses to `Infinity`) is therefore refused. Zero and negative values are refused. **No upper bound and no
  precision rule.** See SR-018-3 and SR-018-4.
- Claim ids are regex-validated as 24-hex before reaching `new ObjectId`.

---

## 2. Must-fix findings (block the flag flip)

### SR-018-1 (Critical, code fix) — the `admin_access_log` validator rejects `'claim'`, so every admin claim operation fails closed

`repositories/admin-access-log.ts:26` widened the TypeScript `AdminAccessResourceType` to include `'claim'`.
The **database-side** `$jsonSchema` in `backend/src/db/feature004-collections.ts:272-279` was not widened:

```ts
resourceType: {
  enum: ['policy', 'asset', 'recovery_case', 'plan'],
```

That collection is created with `validationLevel: 'strict'`, `validationAction: 'error'` (`:385-389`). On any
cluster where `bootstrapFeature004Collections` has applied this validator, which is the intended production
state, every `insertOne`/`insertMany` with `resourceType: 'claim'` is rejected by MongoDB. Consequences:

- `GET /v1/admin/claims`: `recordBulkDisclosure` throws → 5xx. Admins cannot list claims.
- `GET /v1/admin/claims/:claimId`: `recordDetail` throws → 5xx. Admins cannot view a claim.
- `PATCH /v1/admin/claims/:claimId`: `recordStateChange` throws before the mutation (AUD-10 fail-closed,
  correctly) → 5xx. **No claim can ever be adjudicated.**

This is fail-closed, so nothing leaks. But with the flag flipped, customers could file claims that no admin
can review. `DUPLICATE_OPEN_CLAIM` would then stop them re-filing on that asset, because the stuck claim is
non-terminal. That is a TCF Outcome 6 problem, not only an outage.

The unit tests do not catch it because they use in-memory repositories. `feature004-collections.test.ts:81`
actually pins the old enum.

**Required:**
1. Add `'claim'` to the validator enum. Update the `resourceId` description to mention `claims._id`, and
   update `feature004-collections.test.ts:81`.
2. Re-run the bootstrap/`collMod` against Atlas (owner: `database-architect`/`devops-engineer`). Record the
   applied validator, read back with `db.getCollectionInfos({name:'admin_access_log'})`, in the closure note.
3. Add a test that runs a real `'claim'` row through `adminAccessLogJsonSchemaValidator`, the same way the
   existing `rejects resourceType values outside the enum` test does (`feature004-collections.test.ts:257`).

Process note: this is the "extend, don't fork" widening done in one of its two places. Any future
`AdminAccessResourceType` addition must change both files in the same commit. I recommend a test asserting
the TS union and the validator enum are equal.

### SR-018-2 (High, act immediately, code fix) — the backend claims API is live and ungated

`index.ts:182-183` mounts `createClaimsRouter` and `createAdminClaimsRouter` unconditionally. The only gate is
`FEATURE_CLAIMS_ENABLED` in `mobile/src/config/features.ts`, which is a **client rendering decision**. Any
customer holding a valid access token can call `POST /v1/claims` against the deployed Render API today. The
admin web UI (`src/admin/AdminRoutes.tsx:83-84`) is also unflagged.

"Nothing goes live to real customers until this passes" is therefore not true at the API layer. This is the
same lesson as INC-002-B (`stage8-manifest.json`, R-INC002B-1): *a feature flag is a rendering decision; it is
not a trust boundary.*

**Required:**
1. Add a server-side kill switch, e.g. `CLAIMS_API_ENABLED`, default `false` in `render.yaml` production.
   When it is off, all eight claims routes (customer and admin) return 404 `NOT_FOUND`, and the check runs
   before `authenticate` so the surface is not even enumerable. Keep it off until this gate is discharged.
2. Query production `claims` for any documents created since `4a16ced` was deployed, and report the count in
   the closure note. If any exist, `compliance-specialist` decides how to handle them. They are real claims
   lodged by real customers and cannot simply be deleted.

### SR-018-3 (High, code fix) — `approvedAmount` has no guardrail and is not in the decision record

`patchBodySchema` accepts `approvedAmount: z.number().positive()` and nothing else. Today, with
`coverageLimits` always empty (§1.4 of the spec), an admin can approve `1e15` on a R1 200 claim, or 120000
instead of 1200 by fat-finger. A compromised admin session that passes step-up can do the same. Nothing
rejects it.

No payout executes today, so there is no direct financial loss. But:

- The customer is shown `approvedAmount` as the insurer's decision. That is a representation the insurer has
  to stand behind.
- `awaiting_payout` + `approvedAmount` is exactly the input the future payout feature will read.

Making the guardrail structural now is far cheaper than retrofitting it when money moves.

The Trail B decision row (`recordStateChange`) also records `fromStatus`/`toStatus` and `reason: null` for
approvals. **The approved figure is recorded only on the mutable domain document.** The privileged-access
trail, which is what AUD-8 reconstruction uses, cannot answer "which admin approved what amount".

**Required:**
1. `approvedAmount <= claim.claimedAmount`, enforced in the route, returning 422
   `APPROVED_AMOUNT_EXCEEDS_CLAIMED`. An insurer settling above the claimed amount is not a v1 workflow. If
   the business wants it, that is a new spec with its own control.
2. A platform hard ceiling, `CLAIM_APPROVAL_HARD_CEILING` (a named constant, value set by `product-manager`
   with `compliance-specialist`). It applies regardless of `coverageLimits`, so the "no coverage limit
   configured" state is never literally unbounded.
3. Monetary precision: reject values with more than 2 decimal places on both `claimedAmount` and
   `approvedAmount`. Also apply an upper bound to `claimedAmount` (same ceiling, or a separate named one).
   This blocks `1e300`-style values that skew the `FLAG_AMOUNT_OUTLIER` baseline for every later claim on
   that account.
4. Record the approved amount and currency in the `privileged_state_change` row. Use the existing optional
   `reason` field (e.g. `approvedAmount=1200.00 ZAR`) or add an additive `amount` field under the same
   "widen, don't fork" posture. Either is acceptable. Omitting it is not.

### SR-018-4 (Medium-High, code fix) — currency is customer-controlled, and the coverage-limit check is currency-blind and fails open

1. `claimedAmountCurrency` is an optional, customer-supplied 3-character string, accepted as-is. The spec
   (§3) says the currency **is** `policy.billing.currency`. A customer can file `claimedAmount: 5000,
   claimedAmountCurrency: "USD"` against a ZAR policy, or use any 3-character string (`"zzz"`, `"<b>"`). The
   admin then sees a figure in a currency the policy is not written in.
2. `exceedsCoverageLimit` compares `approvedAmount` to `limit.amount` and ignores `limit.currency`.
   `approvedAmount` carries no currency at all.
3. In the admin PATCH, `policy?.coverageLimits ?? []` means that if the policy lookup returns null, the check
   silently becomes "no cap" and the approval proceeds. That is fail-open on the one financial guardrail
   that exists.
4. With multiple entries for one `assetType`, `find` takes the first one, not the strictest.

**On the spec's question (will the check stay a no-op forever, or fail safe once limits are configured?):**
when a matching entry exists, the check is correctly enforced before the mutation and the claim is left
unchanged (AC-6, tested at `admin-claims.test.ts:278`). So it does **not** stay a no-op once a limit is
populated for that asset type. It does fail **open** in three cases:

- the policy is missing,
- the currency is mismatched,
- limits are configured for other asset types but not this one. (The spec says no cap applies here. I
  accept that only because SR-018-3(2) adds a hard ceiling underneath it.)

**Required:**
1. Remove `claimedAmountCurrency` from the request schema. Always store `policy.billing.currency`.
   Alternatively, accept it only if it equals the policy currency (case-normalized) and return 422 otherwise.
2. A missing policy at approval time returns 409/422, never an uncapped approval.
3. `exceedsCoverageLimit` matches on `assetType` **and** currency. A matching `assetType` with a mismatched
   currency fails closed (treated as exceeded). With duplicate entries, it uses the minimum amount.

### SR-018-5 (Medium-High, code fix) — duplicate open claims are possible; the `claims` collection has no bootstrap

There are two independent race paths to two non-terminal claims on one asset, which means two approvals for
one loss once payout exists:

- **Different idempotency keys:** two concurrent `POST /v1/claims` both pass
  `findNonTerminalByAssetForAccount` and then both `insertOne`. Nothing at the database level prevents this.
  No unique index exists, and there is **no `claims` collection bootstrap at all** in `backend/src/db/` or
  `scripts/bootstrap-mongo-collections.ts`: no validator and no indexes.
- **Same idempotency key:** `requireIdempotencyKey` is find → execute → store-after-response. Nothing is
  reserved up front. A double-tap or client retry that overlaps the first request executes twice, and
  `on conflict do nothing` keeps only the first stored response. This is a pre-existing, platform-wide
  property of the middleware (C-018-9). It matters more here because the endpoint creates a financial claim.

**Required:**
1. Add a `claims` collection bootstrap (`db/claims-collections.ts`, wired into the bootstrap script). It should
   include:
   - a `$jsonSchema` validator covering at least `status` enum, `accountId`, `assetId`, `claimedAmount`
     (double, > 0), `fraudFlags` array, `statusHistory` array;
   - indexes for the query patterns in use: `{accountId, createdAt:-1}`, `{accountId, submittedAt}`,
     `{accountId, assetTypeSnapshot}`, `{status, createdAt:-1}`, `{policyId}`.
2. **Database-level uniqueness for "one open claim per asset".** Recommended pattern: an `openClaimAssetKey`
   field set to `assetId` on create, `$unset` on every terminal transition (inside the same CAS update), with
   a unique index partial on `{openClaimAssetKey: {$type: 'string'}}`. On `E11000`, map to
   `DUPLICATE_OPEN_CLAIM` with the existing claim's id. This makes §1.5 structural instead of
   check-then-insert. `database-architect` may choose an equivalent mechanism.
3. Add a concurrency test: two parallel creates on one asset produce exactly one 201 and one 409.

### SR-018-6 (Medium, compliance-relevant, code fix) — the customer cannot see why the claim is waiting or closed

- The admin's `more_info_requested` `reviewNote` is stored only in `statusHistory[].reason`.
  `respondToInfoRequest` is the only writer to `reviewNotes`, so `reviewNotes` contains only the
  **customer's own** responses. The customer serializer omits `statusHistory`. The customer therefore sees
  "More info requested" with no indication of what is being asked (confirmed in
  `mobile/src/screens/claims/ClaimDetailScreen.tsx`, which renders only `rejectionReason` and `reviewNotes`).
- The administrative `closeReason` is likewise stored only in `statusHistory` and never reaches the customer.
  An admin close is functionally an adverse decision on the claim. `compliance-specialist`'s §8 note
  (written reasons and decision notice per the Policyholder Protection Rules) applies to it as much as to
  `rejected`.

§4.2 requires these reasons to be "customer-safe", which only makes sense if they are delivered.

**Required:** append the admin's `reviewNote` to `reviewNotes` with an author role marker (`authorRole:
'admin' | 'customer'`, never the admin's account id), and expose `closeReason` on the customer shape, like
`rejectionReason`. `compliance-specialist` to confirm the closed-claim notice content.

### SR-018-7 (Medium, fraud, code fix + product/compliance ruling) — the waiting period does not protect against pre-existing loss

The spec's own rationale for §1.3 is "so a customer cannot subscribe and immediately claim on a **pre-existing
loss**". The implementation follows the spec's wording (it gates the **filing** time), and that defeats the
rationale:

- **Scenario A:** policy active for a year. A laptop is stolen on day 0. The customer registers it as a new
  asset on day 1, waits 30 days, then files on day 31 with `incidentDate` = day 0. Every gate passes,
  because `incidentDate >= policy.effectiveDate` is the only incident-date check and the asset's
  `registeredAt` is never compared.
- **Scenario B:** subscribe on day 0, loss on day 3, file on day 31 with `incidentDate` = day 3. All gates
  pass.

**Required before flip (code, cheap, consistent with §5's flag-don't-block philosophy):** add a deterministic
flag, `FLAG_INCIDENT_BEFORE_ELIGIBILITY`, raised when `incidentDate < waitingPeriodClearsAt(...)` or
`incidentDate < asset.registeredAt`, so the human reviewer always sees it.

**Required ruling (`product-manager` + `compliance-specialist`, not a code item):** should an incident
predating asset registration, or falling inside the waiting period, be an intake rejection like
`WAITING_PERIOD_NOT_MET`, a disclosed exclusion applied at adjudication, or a flag only? Under the §8
compliance note, an intake refusal is only acceptable if it is a disclosed contract term with a written
reason. Until that ruling is made, the flag is the minimum.

Related, fails safe: the §1.3 recovery-case exception ("UNLESS linked to a recovery case whose `reportedAt` is
≥30 days after `effectiveDate`") is **not implemented**. The code always applies the waiting period. That is
stricter than the spec, so it is not a security defect, but it is a functional gap. See C-018-8.

### SR-018-8 (Medium, process) — Stage 8 manifest coverage and missing regression tests

**Manifest (`docs/organization/gates/stage8-manifest.json`):**
- There is no entry for the backend `/claims*` route group.
- `/admin/claims*` is silently absorbed into the `backend-admin` (`/admin/*`) group, whose doc is the Feature
  004 admin-surface review. That is the exact SR-012-5 anti-pattern: a Feature 004 review is not a review of
  Feature 018 adjudication.
- The `mobile-claims` entry is still `waived: true` with reason "Release Gate A — no claims backend". That
  reason has been false since `4a16ced`.
- There is no `web_route` entry for `/admin/claims*`.

**Required:** add distinct entries for `/claims*`, `/admin/claims*` (backend), `/admin/claims*` (web), and
replace the stale `mobile-claims` waiver. All of them point at this document, with the verdict updated when
this gate is discharged. The owner is `cybersecurity-architect` and I will make the change at re-review. I did
not edit the manifest in this pass because CI-1 semantics for a "blocked" verdict should be confirmed with
`devops-engineer` first.

**Missing tests (required, `automation-qa-engineer` / `backend-engineer`):**
- (a) A revoked session on the admin PATCH returns `STEP_UP_REQUIRED` (§1.3).
- (b) `fraudFlags` is absent from the live JSON of **every** customer response in the §1.5 table, including
  the idempotent replay. Populate `fraudFlags` non-empty in the fixture, because the current fixtures use
  `fraudFlags: []`, which proves nothing.
- (c) The 4th claim in the window persists `FLAG_RATE_THRESHOLD` (assert on the repo or admin view, not only
  the 201).
- (d) A missing or non-UUID `Idempotency-Key` returns 400 `IDEMPOTENCY_KEY_REQUIRED`, and no claim is created.
- (e) A `privileged_state_change` row with `resourceType: 'claim'` is written for each of the five admin
  actions, and **no** mutation occurs when that write throws (AUD-10).
- (f) SR-018-1's validator test and SR-018-5's concurrency test.

---

## 3. Conditions (tracked, do not block the flag flip)

| ID | Owner | Condition |
|---|---|---|
| C-018-1 | `backend-engineer` | **`incidentDescription` is overwritable on respond.** `respondToInfoRequest` `$set`s `incidentDescription` and the original is lost. That destroys exactly the evidence a fraud reviewer needs: a customer changing their account of the loss. Preserve prior values (push the superseded text into an `incidentDescriptionHistory[]` or into the `reviewNotes` entry). Due before the payout feature's Stage 8. |
| C-018-2 | `backend-engineer` | **Tighter create throttle.** `POST /v1/claims` uses `DEFAULT_AUTHENTICATED_LIMIT` (100/min). A file→withdraw→file loop is unbounded, and each create runs an unindexed `listByAccountAndAssetType` scan over all of the account's claims. Add a claims-specific request throttle (e.g. 10/hour/account). The compliance note explicitly permits this, because it is a request throttle, not a claim-count block. |
| C-018-3 | `backend-engineer` | **The initial `— → submitted` transition is not in `statusHistory`.** `createForAccount` writes `statusHistory: []`. Spec §3 requires an entry on every transition, and §2.2 lists creation as one. Append the creation entry (`actorRole: 'customer'`). |
| C-018-4 | `cto` / `payment-engineer` | **Insider / dual-control risk before money moves.** Any single admin can approve any amount for any claim, and an admin can collude with a customer account. That is accepted for v1 **only** because `awaiting_payout` triggers nothing (spec §2.3/§4.3). **Precondition on the future payout feature's Stage 8:** second-admin countersign above a threshold, approver ≠ any admin who touched the claim's account, and payout destination change controls. Recorded as RR-018-1. |
| C-018-5 | `notification-engineer` | **Account-takeover detection.** An attacker holding a customer session can file claims in the victim's name or withdraw the victim's genuine claim (irreversible; the victim must re-file). No claim notification is emitted today (the `claims` notification category exists, but the backend emits nothing). Add out-of-band email/push notification on claim create, withdraw and decision before the payout feature. Consider step-up re-auth on withdraw once customer MFA is widely enrolled. |
| C-018-6 | `backend-engineer` | **`supersedesClaimId` is unvalidated.** A customer can reference another account's claim id, which could mislead a reviewer who opens it. Either validate ownership (`findByIdForAccount`, 422 on mismatch) or show it in the admin UI as "customer-supplied, unverified". Validation is preferred. |
| C-018-7 | `product-manager` | **Spec deviation:** the admin `start_review` action is accepted from `more_info_requested` (the forward table permits `more_info_requested → under_review` for any actor). Spec §2.2 assigns that edge to the customer. Rule on whether an admin may resume review without a customer response. If yes, amend the spec. If no, split the table per actor. Low security impact either way, because the step is audited. |
| C-018-8 | `product-manager` | §1.3 recovery-case waiting-period exception not implemented. The code is stricter than the spec (fails safe). Implement it or strike it from the spec. |
| C-018-9 | `backend-architect` | **Platform-wide:** `requireIdempotencyKey` does not reserve the key before execution, so concurrent same-key requests both execute. The `app.idempotency_keys` unique constraint is `(endpoint, idempotency_key)` without `account_id`, so a second account that collides on a key never gets its response stored. 5xx responses are cached and replayed for the key's lifetime. None of this is Feature 018-specific, but it should be addressed as a shared-middleware item (insert-reservation row first, scope uniqueness by account, do not cache 5xx). |
| C-018-10 | `backend-engineer` | **Exclusion by construction** (Feature 011 SR-011-1 precedent). The customer-only repo reads (`findByIdForAccount`, `listByAccount`, and the `findOneAndUpdate` returns in `respondToInfoRequest`/`withdrawForAccount`) should project out `fraudFlags` and `statusHistory`, so the customer path never loads them. Recommended, not required, once SR-018-8(b)'s test exists. |
| C-018-11 | `backend-engineer` | Cosmetic: add a named `STEP_UP_WINDOW_SECONDS.claimAdjudication` instead of reusing `invitationIssuance` (ADR-0012 guidance in `step-up.ts`). Same value is fine. **Also:** the admin list writes subject-level Trail B rows (`recordBulkDisclosure`). An account can have several claims, so consider per-claim rows (`§18.3`-style) so AUD-8 reconstruction can say which claims were disclosed. |

---

## 4. Audit completeness

| Action | In-document `statusHistory` | Trail B `admin_access_log` | Gap |
|---|---|---|---|
| Customer create | **No** (C-018-3) | n/a (customer) | `submittedAt` exists, but the transition entry is missing |
| Customer respond | Yes (`more_info_requested → under_review`) + `reviewNotes` | n/a | Overwrites `incidentDescription` (C-018-1) |
| Customer withdraw | Yes (`→ closed`, reason "Withdrawn by customer.") | n/a | No out-of-band notice (C-018-5) |
| Admin `start_review` / `more_info_requested` / `rejected` / `closed` | Yes, with reason | `privileged_state_change`, written **before** the mutation (AUD-10) | **Fails in prod until SR-018-1** |
| Admin `approved` | Yes, two entries (`→ approved`, `approved → awaiting_payout`) | One `privileged_state_change` row (`from → awaiting_payout`) | **Amount not recorded (SR-018-3(4))**. Fails in prod until SR-018-1 |
| Admin list | n/a | `privileged_bulk_access` + per-subject `privileged_data_access` | Subject-level, not per-claim (C-018-11). Fails until SR-018-1 |
| Admin detail | n/a | `privileged_data_access` with `resourceId` = claim id | Fails until SR-018-1 |

Because the decision record is written before the mutation, a CAS loss (409) leaves a Trail B row for a
decision that did not apply. That is expected under ADR-0006 §18.8 C-C. AUD-8 reconstruction uses the
chain-check "applied-iff" rule (runbook §13) against `statusHistory`. Not a defect.

---

## 5. Threat-model delta and risk register

New surface: a customer-to-insurer **financial decision channel**. It is the first surface on the platform
where an admin action produces a monetary figure that will later drive disbursement.

Attack trees considered:

- **(T1) Customer inflates or duplicates a claim:** blocked by SR-018-3, SR-018-4 and SR-018-5.
- **(T2) Customer claims a pre-existing loss:** blocked by SR-018-7.
- **(T3) Account takeover files or withdraws claims:** C-018-5.
- **(T4) Compromised admin session approves an absurd amount:** step-up holds (§1.3). The amount ceiling is
  SR-018-3.
- **(T5) Malicious insider admin colludes with a customer:** C-018-4 / RR-018-1, accepted for v1 because no
  payout exists.
- **(T6) Fraud-heuristic disclosure lets a fraudster learn to evade flags:** §1.5 holds today; SR-018-8(b)
  locks it in.
- **(T7) Concurrent transition race:** CAS holds (§1.4).

No location data is added to any claims surface. `recoveryCaseId` is a reference only, and no recovery-case
fields are copied into a claim response.

| Risk ID | Description | Rating (pre-fix) | Owner | Disposition |
|---|---|---|---|---|
| RR-018-1 | Single-admin approval with no segregation of duties | High once payout exists / Low today | `cto` | **Accepted for v1 only, explicitly by spec §2.3**. Becomes a hard precondition on the payout feature's Stage 8 (C-018-4). Review 2027-01-31 or at payout-feature Stage 1, whichever is first. |
| RR-018-2 | Claims API reachable in production before the gate is discharged | High | `cto` / `devops-engineer` | **Not accepted.** SR-018-2. |
| RR-018-3 | Pre-existing-loss claims pass intake | Medium | `product-manager` / `compliance-specialist` | Flag (SR-018-7) required. Block-vs-flag ruling pending. |
| RR-018-4 | Audit trail rejects claim rows (outage, fail-closed) | Critical availability | `database-architect` | **Not accepted.** SR-018-1. |

---

## 6. Re-review and sign-off

Re-review is triggered when SR-018-1 … SR-018-8 are each marked closed, with commit hashes, in an appended
§7. For SR-018-1 and SR-018-2, the closure note must include production evidence: the validator read-back,
the claims-API kill switch state, and the count of production `claims` documents.

On re-review, `cybersecurity-architect` re-reads the running code (not the closure note) and updates the Stage
8 manifest entries. `security-engineer` and `compliance-specialist` record their concurrence in sections
appended below. The flag may flip only when all three signatures are recorded.

| Role | Decision | Date |
|---|---|---|
| `cybersecurity-architect` (chair, A) | ~~**BLOCKED** — SR-018-1 … SR-018-8~~ *[VOID — superseded at re-review, §11]* → **BLOCKED (narrowed)** — SR-018-1 … SR-018-7 verified closed in code; still blocked on **SR-018-9** (new, Critical, production-impacting) and the **SR-018-8** test remainder (§11.4) | 2026-10-28 (orig.) / 2026-10-28 (re-review) |
| `security-engineer` (R) | *pending* | |
| `compliance-specialist` (C) | *pending* — specifically SR-018-6, SR-018-7 ruling, SR-018-2(2) disposition | |

### 6.1 `compliance-specialist` sign-off record (appended 2026-10-28)

I am not editing the table row above, because the chair wrote it. This subsection is my entry in it.

| Role | Decision | Date |
|---|---|---|
| `compliance-specialist` (C) | **Concur with BLOCKED.** The rulings that were pending on me are now made: SR-018-7 in §12.2, SR-018-6 in §12.3, and SR-018-2(2) in §12.1. The ceiling and currency check is in §12.4. I will concur with discharge only when CR-018-1 … CR-018-9 (§12.6) are closed and I have re-read the running code. | 2026-10-28 |

(Section numbering: §10 is `security-engineer`'s, and the chair's row above reserves §11 for the re-review, so my rulings are in §12.)

Short form of the two rulings:
- **SR-018-7:** neither a hard block nor flag-only. The ruling is **accept, flag, and hold approval until an eligibility determination is recorded**. No claim is refused at intake because of its incident date.
- **SR-018-6:** **a server-composed, versioned decision-notice template is required.** Free text plus admin training is not enough. The admin's text fills one slot in the notice and is never the whole notice.

## 7. SR-018-1 / SR-018-2 production closure (orchestrator, 2026-10-28)

Both urgent code fixes (commit `c2ff720`) are deployed. Production evidence, gathered by the owner
running the fix script directly (per INC-003 §39 — not an agent connecting to production):

- **SR-018-2 (kill switch):** `CLAIMS_API_ENABLED` was never set in Render's environment, confirmed
  by the owner. The code now fails closed on any unset/non-`"true"` value, so all 8 claims routes
  return 404 in production as of the `c2ff720` deploy. Closed.
- **SR-018-1 (validator):** owner ran a `collMod` against the production Atlas cluster
  (`tditsolutions.xtlqvx2.mongodb.net`, database `test` — confirmed as the correct production
  database via `MONGODB_DB_NAME` being unset in Render, so the driver default applies). Read-back
  before the `collMod` already showed `resourceType`'s enum including `'claim'` — something had
  already applied this fix before the owner's run (cause not identified; the owner's run was a
  verified no-op, not a failed write). **Production evidence requested by §6: the `claims`
  collection holds 0 documents** — no claim, real or test, was ever created during the exposure
  window. No compliance referral needed per §2 item 2's contingency; that contingency did not
  trigger.

Both items are CLOSED with production evidence. SR-018-3 through SR-018-7 remain open and are not
addressed by this section.

## 8. SR-018-5 fix (backend-engineer, 2026-10-28)

Addresses the check-then-insert "one open claim per asset" race and the non-atomic idempotency-key
reservation §1.5/§1.7 flagged. Not yet re-reviewed by `cybersecurity-architect` — this section records
the implementation only; §6 sign-off for SR-018-5 is still pending that re-review.

- **Database-level backstop (the primary fix):** a partial unique index,
  `claims_one_open_claim_per_asset`, on `{ assetId: 1 }`, scoped to
  `status: { $in: NON_TERMINAL_CLAIM_STATUSES } }` (`'submitted' | 'under_review' |
  'more_info_requested'` — `lib/claim-rules.ts`, the same set `findNonTerminalByAssetForAccount`
  already used, now exported as a single source of truth). Defined in a new
  `db/claims-collections.ts`, wired into the existing `db/mongo-bootstrap.ts` startup sequence
  (non-fatal on failure, matching every other collection bootstrap's try/catch there). No
  `$jsonSchema` validator was added — the `claims` collection predates this file and already has
  data/tests against it without one; retrofitting strict validation is a separate, larger change,
  out of scope here.
- **Graceful error translation:** `repositories/claims.ts`'s `createForAccount` now catches a Mongo
  duplicate-key error (code `11000`) against that index and throws a new `DuplicateOpenClaimError`
  (DB-aware, not a route-layer concern). `routes/claims.ts`'s `POST /v1/claims` catches it, re-resolves
  the actual winning claim via the existing `findNonTerminalByAssetForAccount` lookup, and returns the
  same `409 DUPLICATE_OPEN_CLAIM` shape (with `claimId`) the pre-insert check already returns on a
  non-concurrent duplicate — never a raw database error reaching the client.
- **Idempotency-key reservation — confirmed to be a real gap, now fixed.** Read the shared
  `middleware/idempotency.ts` directly before assuming the finding: it stored a replay record only
  when the ORIGINAL response finished (`res.json` patched to call `repo.store()` at response time),
  with no reservation step at request-arrival time. Two requests sharing an `Idempotency-Key` could
  both miss the Postgres `find()` lookup and both run the full handler body before either stored a
  cached response — confirmed as a genuine gap, not a finding to dismiss. Fixed by adding an atomic
  claim step using the existing Redis-class `KeyValueStore.incrWithTtl` (the same primitive the
  fixed-window rate limiter already uses for "am I first" semantics, chosen over a Postgres schema
  change because `app.idempotency_keys`' `response_status`/`response_body` columns are `not null`
  — see `database-addendum-001.md` §2 — so a nullable "pending" placeholder row isn't a one-line
  change there). A concurrent duplicate that hasn't finished yet now gets a new `409
  IDEMPOTENCY_KEY_IN_PROGRESS` (distinct from the existing `IDEMPOTENCY_KEY_REUSE`, which is same-key-
  different-body); a duplicate that arrives after the first finished still replays the cached response
  exactly as before. All 11 `requireIdempotencyKey(...)` call sites across the backend (`policies.ts`,
  `assets.ts`, `session.ts`, `support-cases.ts`, `invitations.ts` x2, `claims.ts`, `auth.ts` x2, `mfa.ts`,
  `recovery.ts`) were updated to pass `ctx.kv` — a signature change to shared middleware, flagged here
  per the CLAUDE.md escalation norm even though it is additive/non-breaking to callers outside this repo
  (no external API contract changed).
- **Test:** `routes/claims.test.ts` ("SR-018-5: two simultaneous claim-filing requests...") fires two
  concurrent `POST /v1/claims` requests (different `Idempotency-Key`s, so it isolates the asset-race
  guard from the idempotency-key guard) against a harness whose fake `createForAccount` reproduces the
  real check-then-insert interleaving and throws the real `DuplicateOpenClaimError` class. Asserts
  exactly one `201` and one `409 DUPLICATE_OPEN_CLAIM` (never a `500`), and that the `claims` array
  ends with exactly one row for the asset. A second, real-MongoDB integration test,
  `db/claims-collections.test.ts`, proves the actual partial unique index against a live `mongod`
  (connect-or-skip, same pattern as `repositories/plan-catalog.test.ts`; skipped in this sandbox, which
  has no local Mongo — not run against production or Atlas).
- **Verification:** `tsc --noEmit` clean; full suite `857/857` passing across `76` test files
  (`npm test`), including the new tests above.
- Commit: see this section's accompanying commit hash in `git log` for `fix(claims): SR-018-5 ...`.

## 9. SR-018-6 / SR-018-7 fix (backend-engineer, 2026-10-28)

Both are code-level fixes landed in commit `c2e2f24` (`fix(claims): SR-018-5 close check-then-insert
duplicate-claim race` — see that commit's message for why these two unrelated SR-018 fixes could not be
split out separately: `routes/claims.ts` and `claim-rules.ts` had already been edited in the same
working tree by a concurrent fix for SR-018-5, and the changes shared the same files down to
adjacent lines). Not yet re-reviewed by `cybersecurity-architect` — this section records the
implementation only; §6 sign-off for SR-018-6/SR-018-7 is still pending that re-review, and
SR-018-7's own required **block-vs-flag ruling** (`product-manager` + `compliance-specialist`) remains
open and is explicitly NOT made by this section.

**SR-018-6 — customer now sees the admin's more-info request and close reason:**

- `repositories/claims.ts`'s `ClaimReviewNote` gained `authorRole: 'admin' | 'customer'`.
  `transitionForAdmin` now pushes a `reviewNotes` entry with `authorRole: 'admin'` (text = the admin's
  `reviewNote`) whenever the transition is to `more_info_requested`, in addition to the existing
  `statusHistory` entry — the customer-facing serializer reads `reviewNotes`, never `statusHistory`.
  `respondToInfoRequest`'s own note-push now tags `authorRole: 'customer'`.
- `ClaimDocument` gained `closeReason: string | null`, set by `transitionForAdmin` only when
  `toStatus === 'closed'` (i.e. an *administrative* close via the admin PATCH action). A customer's own
  `withdrawForAccount` close does not set it — a customer already knows why they withdrew their own
  claim, and withdrawal was never the admin adverse-decision case §4.2/§8 is about.
- `claim-serializers.ts`'s `serializeClaimForCustomer` now returns both `closeReason` and the mapped
  `reviewNotes` (with `authorRole`, never `actorAccountId`). `fraudFlags` remains customer-serializer-only
  absent — confirmed by test, not just by omission from the object literal.
- `compliance-specialist`'s required confirmation of the closed-claim notice content (end of the
  original SR-018-6 finding) is **not addressed by this section** — only the code path to deliver
  whatever text an admin writes is built; the wording itself is still the admin's own free-text
  `closeReason`/`reviewNote` input, unreviewed for Policyholder Protection Rules compliance.
- **Tests:** new `lib/claim-serializers.test.ts` — asserts the admin's more-info text and close reason
  are present in the customer shape when relevant, absent (`null`/no extra notes) when not, that
  `actorAccountId` never appears in the serialized output, and that `fraudFlags` never does either.

**SR-018-7 — new `FLAG_INCIDENT_BEFORE_ELIGIBILITY` fraud flag (flag only, not a block):**

- `claim-rules.ts`'s `computeFraudFlags` gained an `incidentDate` input and now flags when
  `incidentDate < waitingPeriodAnchor(policyEffectiveDate, assetRegisteredAt)` — the same "later of the
  two" anchor the waiting-period check itself already uses, per this finding's own recommendation. This
  is **additive only** — it does not change `isWaitingPeriodMet`/the `WAITING_PERIOD_NOT_MET` intake
  gate, which still measures the filing date. Scenario A/B in the original finding (pre-existing loss
  surviving the 30-day wait) still files successfully; it is now flagged for admin attention instead of
  passing silently.
- `routes/claims.ts`'s `POST /v1/claims` now passes the claim's own `incidentDate` into
  `computeFraudFlags`.
- The **required product/compliance ruling** on whether an incident predating eligibility should be an
  intake rejection, a disclosed exclusion at adjudication, or a flag-only is explicitly **not made
  here** — this is the "minimum" the finding called for pending that ruling.
- The related §1.3 recovery-case waiting-period exception (C-018-8) remains unimplemented, unchanged by
  this fix.
- **Tests:** three new cases in `lib/claim-rules.test.ts` ("SR-018-7: ...") — flags an incident before
  `assetRegisteredAt` (later anchor), flags one before `policyEffectiveDate` (later anchor), and does
  not flag a legitimate incident after both.

**Verification:** `tsc --noEmit` clean; full suite `857/857` passing across `76` test files (`npm test`).

## 10. `security-engineer` hands-on verification and concurrence (2026-10-28)

Recorded per §6's required three-signature gate. This is an independent code read against the
running source, not a review of §7–§9's prose. I ran `cd backend && npx tsc --noEmit && npm test`
myself: `tsc --noEmit` clean; full suite `857/857` passing across `76` test files on a solo re-run
(one unrelated flake observed in a mixed full-suite run — `admin-accounts.test.ts`'s stale-
`mfaVerifiedAt` step-up test failed with `SyntaxError: Unexpected token 'U', "Unauthorized" is not
valid JSON` under `vitest run`'s default parallelism, then passed 23/23 on an isolated re-run of
that file alone. That test touches Feature 001 admin-accounts step-up, not any file this gate
covers — not a Feature 018 regression, flagged here for `backend-engineer`/`automation-qa-engineer`
to look at as a cross-file timing issue, not blocking this sign-off).

**1. SR-018-2 kill switch — verified, no bypass found.** Read `src/routes/claims.ts:65-79` and
`src/routes/admin-claims.ts:67-81` directly. In both files, `router.use((_req, _res, next) => { if
(ctx.env.claimsApiEnabled !== true) { next(apiError('NOT_FOUND')); return; } next(); })` is
registered as the *first* middleware on the router, before `authenticate` is constructed or applied
on any of the router's routes. `ctx.env.claimsApiEnabled` is sourced in `src/config/env.ts:439-445`
as `true` only when `process.env.CLAIMS_API_ENABLED === 'true'` exactly — missing, empty, `"1"`,
`"True"`, or any other value all resolve to `false`/`undefined`, both of which fail the `!== true`
check and 404. This is the same fail-closed convention as the existing `locationIngestionEnabled`
(INC-001) switch, reusing a pattern already in production. I traced every one of the 8 routes
(`POST /claims`, `GET /claims`, `GET /claims/:claimId`, `PATCH /claims/:claimId/respond`, `PATCH
/claims/:claimId/withdraw`, `GET /admin/claims`, `GET /admin/claims/:claimId`, `PATCH
/admin/claims/:claimId`) and confirmed each is registered on one of these two routers, with no
third mount point and no route-specific exemption from the `router.use` guard. No bypass path
found. §7's production evidence (switch never set in Render, so already defaulting to the fail-
closed `false`) is consistent with what the code does when unset. **Verified.**

**2. SR-018-5 idempotency reservation — verified correct, with one accepted residual risk
documented.** Read `src/middleware/idempotency.ts` end to end and `src/db/redis.ts`'s
`incrWithTtl` (both `RedisKeyValueStore` and `InMemoryKeyValueStore` implementations).
- **Store unavailable/slow → fails closed.** Both the `repo.find` lookup and `kv.incrWithTtl` call
  are inside a single `try { ... } catch (err) { next(err); return; }`. A Redis or Postgres outage
  or timeout propagates as an error to Express's error handler (a 5xx to the caller) rather than
  falling through to `next()` and letting the handler run unprotected. No request executes its side
  effects without either a successful reservation or a successful replay lookup. This is the
  correct choice per this project's "fail closed, not open" standard for a financial-claim-creating
  endpoint, at the cost of availability during a KV outage — an acceptable trade here.
- **Crashed-without-completing request → TTL-bounded, not permanently stuck.** The reservation is
  `kv.incrWithTtl(lockKey, 60)`. Redis's real `EXPIRE` (and the in-memory store's `expiresAt`) is
  set unconditionally on the *first* `INCR` to reach count 1 (`redis.ts:70-71`), so if the original
  request crashes before calling `res.json` (and therefore before `repo.store()` ever runs), the
  lock key still expires 60 seconds after it was first claimed — a concurrent or retried request
  gets `409 IDEMPOTENCY_KEY_IN_PROGRESS` for at most 60s, then a fresh attempt can claim the key and
  proceed normally. No permanent wedge. I checked the comment's own stated rationale
  (`idempotency.ts:43-46`) against the actual TTL value and it matches the code.
  - **Residual, non-blocking:** a legitimate request that genuinely takes longer than 60s (the
    comment calls out "the slowest claims-filing path's several sequential Mongo reads" as the
    reason for picking 60s) could have its lock expire while still running, letting a retry claim
    the key and execute a second time before the first finishes — reopening the exact race SR-018-5
    closes, just on a longer time budget. I did not find evidence any current claims-filing path
    approaches 60s (it's a handful of account-scoped Mongo lookups plus one insert), so I accept
    this as a reasonable engineering trade rather than a new finding, but flag it as a condition:
    **C-018-12 (new, `backend-engineer`, low priority):** instrument/alert if `POST /v1/claims`
    p99 latency approaches the 60s lock TTL, since that would silently reopen SR-018-5.
- **`IDEMPOTENCY_KEY_IN_PROGRESS` 409 case** is correctly distinguished from `IDEMPOTENCY_KEY_REUSE`
  (different body) — confirmed both error codes are distinct and neither masks the other via a
  shared code path.
- The reservation is scoped per `endpoint:accountId:key`, which also closes the cross-account key
  collision the file's own header comment describes, consistent with the account-scoped
  `repo.find` lookup already in place.
- **Verified correct**, with C-018-12 tracked, not blocking.

**3. SR-018-3 financial guardrail bypass check — no bypass found.** Read the full
`admin-claims.ts` PATCH handler (`:179-330`) and `claim-rules.ts`'s amount helpers.
- `approvedAmount > existing.claimedAmount` → `422 APPROVED_AMOUNT_EXCEEDS_CLAIMED`, checked before
  any write. `claimedAmount` itself is bounded the same way at creation (`claims.ts`'s
  `createClaimSchema`), so there is no way to get an oversized `claimedAmount` on record to approve
  against in the first place.
- Both `claimedAmount` and `approvedAmount` are `z.number().positive().max(MAX_CLAIM_APPROVED_AMOUNT
  = 10_000_000).refine(hasAtMostTwoDecimalPlaces)` under **zod 4**. I specifically checked zod 4's
  `z.number()` coercion behavior: it does not coerce strings, so `"1e300"` or any string-typed body
  value fails type validation outright (zod 4 numbers require an actual JSON number token, not a
  numeric string) — I did not find a coercion path in this schema (no `z.coerce.number()` is used
  here). A literal JSON `1e300` parses to a `number` exceeding `MAX_CLAIM_APPROVED_AMOUNT` and is
  rejected by `.max()`. A literal JSON `1e400` parses to `Infinity`, which `Number.isFinite` inside
  `hasAtMostTwoDecimalPlaces` explicitly rejects, and separately `.positive()` under zod 4 also
  rejects non-finite values. I could not construct a request that reaches the handler with an
  out-of-bound or non-2-decimal amount.
- `hasAtMostTwoDecimalPlaces` uses an integer-cents comparison with a `1e-6` epsilon specifically to
  avoid float-drift false negatives/positives (e.g. `19.99`) — read the implementation and it is
  correct for the stated purpose; I could not find an edge value (tested mentally against values
  near cent boundaries, e.g. `0.005`, `99999999.99`) that both passes the precision check and lands
  outside the ceiling undetected.
- The amount is now recorded in the Trail B `privileged_state_change` row via the `reason` field
  (`admin-claims.ts:266-280`) for every `approved` action — confirmed present, addressing the
  original "cannot answer which admin approved what amount" gap. Minor, non-blocking observation:
  this is a free-text `reason` string (`approvedAmount=1200.00 ZAR`), not a structured/queryable
  field — fine for AUD-8 manual reconstruction, awkward for any future automated reconciliation
  against `claims.approvedAmount`. Not a new finding; `cybersecurity-architect`'s §2 item 4 already
  accepted either approach.
- **No bypass found. SR-018-3 verified closed.**

**4. Audit trail completeness — verified consistent, confirms §4's table.** Checked the `'claim'`
resourceType end to end: TS union in `repositories/admin-access-log.ts`, the Mongo `$jsonSchema`
enum in `feature004-collections.ts:272-279` (now includes `'claim'`, with a comment instructing
future widenings to touch both files together — a reasonable process guard against SR-018-1
recurring), and all three call sites in `admin-claims.ts` (`recordBulkDisclosure` on list,
`recordDetail` on single read, `recordStateChange` on every PATCH action, written *before* the
mutation per AUD-10, matching the existing `admin-policies.ts`/`recovery-cases.ts` convention). Every
state transition (customer create/respond/withdraw via `statusHistory`, admin action via both
`statusHistory` and Trail B) produces a traceable row, with the exceptions already disclosed and
tracked as conditions (not blocking) in §4 and C-018-3 (missing creation entry in `statusHistory`)
— I re-confirm that gap still exists (`createForAccount` still writes `statusHistory: []`) and is
correctly left as a tracked condition, not a Stage-8 blocker, since the `submittedAt` timestamp and
the Mongo `_id`'s own ObjectId timestamp already anchor "when" even without an explicit transition
row. No inconsistency found between the TS union and the DB validator as of this read — recommend,
as §2's SR-018-1 fix already does, the equality test it calls for actually land under SR-018-8(f)
so this cannot drift again silently.

**Items not independently re-verified in this pass (explicitly out of scope for hands-on
verification, deferred to the parties the open findings already name):** SR-018-4's live Atlas
`collMod`/read-back (owner-run per INC-003 §39 restriction — I do not have production DB access and
did not attempt to simulate it); SR-018-6/7's compliance wording ruling (`compliance-specialist`'s
open item, §9); SR-018-8's manifest/test-backlog items (process, not code, tracked against
`automation-qa-engineer`/`cybersecurity-architect`); C-018-1 through C-018-11 (tracked conditions,
not blockers, unchanged by this pass except for the new C-018-12 above).

**Concurrence:** I concur with `cybersecurity-architect`'s verdict in §0/§6. SR-018-1, SR-018-2,
SR-018-3, and SR-018-5 are hands-on verified closed in running code, with no bypass found on any of
the four areas I was asked to check. SR-018-6 and SR-018-7's code paths are present and consistent
with their closure notes (§9) on a read of `claim-serializers.ts`/`claim-rules.ts`, though I did not
re-derive their test coverage line-by-line beyond confirming the suite is green. SR-018-4's
code-side fix (currency pinned server-side, policy-missing fails closed, see
`admin-claims.ts:242-263`) reads correctly, but its required production `collMod`/read-back evidence
is outside this role's access and is not claimed here. **The flag must remain unflipped
(`CLAIMS_API_ENABLED` stays unset/`false` in all non-development profiles) until SR-018-8's process
items are closed and `compliance-specialist` records concurrence**, per §6's three-signature
requirement — my concurrence on the code-level findings does not by itself discharge Stage 8.

| Role | Decision | Date |
|---|---|---|
| `security-engineer` (R) | **CONCUR** with `cybersecurity-architect`'s BLOCKED verdict; SR-018-1/2/3/5 hands-on verified closed in code; SR-018-8 and `compliance-specialist`'s concurrence remain outstanding before the flag may flip | 2026-10-28 |

## 11. Chair re-review (`cybersecurity-architect`, 2026-10-28)

**Verdict: still BLOCKED, on a narrower list.** SR-018-1 … SR-018-7 are closed in running code. A new
Critical defect, **SR-018-9**, was introduced by the SR-018-2 fix itself. It is breaking unrelated
production routes **today**, independent of whether the claims flag is ever flipped. SR-018-8 is
partially closed. I closed the manifest half in this pass; the test half remains open.

**What I read (running code, not §7–§10 prose):** `routes/claims.ts`, `routes/admin-claims.ts`,
`lib/claim-rules.ts`, `lib/claim-serializers.ts`, `repositories/claims.ts`, `db/claims-collections.ts`,
`db/mongo-bootstrap.ts`, `db/feature004-collections.ts` (validator), `repositories/admin-access-log.ts`,
`middleware/idempotency.ts`, `middleware/rate-limit.ts`, `db/redis.ts`, `lib/errors.ts`, `config/env.ts`,
`index.ts` (router mount order), the 11 `requireIdempotencyKey(...)` call sites, test names in
`claims.test.ts`/`admin-claims.test.ts`/`claim-serializers.test.ts`/`feature004-collections.test.ts`,
`scripts/verify-stage8-manifest.mjs`, `mobile/scripts/verify-eas-feature-flags.mjs`, and the manifest.

**Not done by me in this pass. Stated plainly so nobody cites it as done:** I had no shell in this
session. I did **not** run `npm test` or `tsc --noEmit`, and I did **not** commit. The only test/tsc
evidence on record is `security-engineer`'s run in §10 (857/857, `tsc` clean), which I have not
independently reproduced. The caller asked for an independent run. It is still owed, and it must
include the new regression test in §11.2.

### 11.1 Per-finding disposition

| ID | Disposition | Evidence (code) |
|---|---|---|
| SR-018-1 | **Closed** | `feature004-collections.ts:273` enum includes `'claim'`. `resourceId` description updated. `feature004-collections.test.ts:81` pins the new enum, and `:261-292` run real `'claim'` rows through the validator. The repository converts `resourceId` to `ObjectId` (`admin-access-log.ts:187,313`), which matches the `objectId` bsonType. Production read-back per §7 is accepted. The recommended union-equals-enum test was not added (C-018-13 below). |
| SR-018-2 | **Closed as a gate. Defective as built, see SR-018-9.** | `env.ts:439-440`: only the exact string `"true"` enables. Both routers check `claimsApiEnabled !== true` first, before `authenticate`, so the gate fails closed. All 8 routes sit behind it, and tests cover each route disabled and the no-token 404. The gate is correct for the claims routes. Its **scope** is wrong. |
| SR-018-3 | **Closed** | `approvedAmount > claimedAmount` → 422 (`admin-claims.ts:237`). `MAX_CLAIM_APPROVED_AMOUNT` (10,000,000) plus the 2-dp refine apply to **both** amounts (`claims.ts:47-51`, `admin-claims.ts:57-61`). The Trail B `reason` carries `approvedAmount=<2dp> <currency>` (`:273-279`). The ceiling value is an engineering backstop, not a business number. `product-manager`/`compliance-specialist` still own the real value (see compliance §12.4). |
| SR-018-4 | **Closed** | `claimedAmountCurrency` is gone from `createClaimSchema` (non-passthrough, so it is stripped). It is set server-side from `policy.billing.currency` (`claims.ts:197`). `exceedsCoverageLimit` filters on asset type and then currency: a mismatched currency fails closed, and duplicate entries resolve to the minimum (`claim-rules.ts:232-251`). A missing policy at approval returns 409 `CLAIM_POLICY_NOT_FOUND` before the audit write and before the mutation (`admin-claims.ts:248-251`). Correction to §10's closing paragraph: SR-018-4 never needed a production `collMod`. That requirement belonged to SR-018-1, so nothing on SR-018-4 is outstanding for lack of production access. Residual, non-blocking: `coverageLimitStatusFor` (the admin display helper) still uses `find`, the first match, for the displayed `limitAmount`. Enforcement uses the strict path, so this is a display inconsistency only (C-018-14). |
| SR-018-5 | **Closed, with conditions** | The partial unique index `claims_one_open_claim_per_asset` on `{assetId}` is partial on `status ∈ NON_TERMINAL_CLAIM_STATUSES` (`claims-collections.ts:34-39`). It is bootstrapped (`mongo-bootstrap.ts:90-97`). E11000 maps to `DuplicateOpenClaimError` and then to 409 `DUPLICATE_OPEN_CLAIM` (`repositories/claims.ts:191-199`, `claims.ts:200-213`). This is equivalent to the mechanism I recommended: terminal transitions change `status`, which takes the row out of the partial index inside the same CAS write. Two conditions: (i) bootstrap is **non-fatal**, so if index creation fails in production (for example, pre-existing duplicate open claims), the app starts without the backstop and only logs. With 0 production documents (§7) that cannot happen today, but the index's existence must be read back in production before the flag flips (§11.5). (ii) The `$jsonSchema` validator I asked for was not added. I accept the deferral because the collection is empty and the repository builds every field explicitly; tracked as C-018-15. Idempotency blast radius: see §11.3. |
| SR-018-6 | **Closed in code.** Notice content is now governed by compliance §12.3. | The customer serializer returns `closeReason` and `reviewNotes[]` as `{authorRole, text, createdAt}` only, so `actorAccountId` is dropped (`claim-serializers.ts:31-39`). `fraudFlags`, `statusHistory` and `accountId` are still absent from the explicit allowlist. Admin more-info text is pushed with `authorRole:'admin'` (`repositories/claims.ts:309-316`). `closeReason` is set only on an admin close. `compliance-specialist`'s §12.3 ruling (server-composed versioned notice template) is a **new** requirement on top of this, and I defer to it as a compliance determination. |
| SR-018-7 | **Closed as specified (flag-only).** Superseding ruling in compliance §12.2. | `computeFraudFlags` raises `FLAG_INCIDENT_BEFORE_ELIGIBILITY` when `incidentDate < waitingPeriodAnchor(effectiveDate, registeredAt)`, the later of the two (`claim-rules.ts:207-213`). Nothing in `claims.ts` returns early on it, so it is flag-only. It covers Scenario A (registered after the loss) and Scenario B (loss inside the policy's first days). I asked for an alternative `incidentDate < waitingPeriodClearsAt(...)` condition; the implementation uses the anchor instead, so an incident inside the 30-day window is **not** flagged. Combined with the filing-date gate, a loss on day 3 of a fresh policy is caught by the anchor only if the asset was registered later. Otherwise it files unflagged. I accept the anchor as the minimum flag because `FLAG_NEAR_WAITING_PERIOD_BOUNDARY` covers the filing side. `compliance-specialist`'s §12.2 "hold approval until an eligibility determination" ruling must define which window it uses, and I recommend `waitingPeriodClearsAt`. |
| SR-018-8 | **Partially closed** | Manifest: done in this pass (§11.4). Tests: see §11.4. |

### 11.2 SR-018-9 (Critical, act immediately, code fix) — the kill switch 404s every `/v1` route mounted after the claims routers

Both kill switches are registered as **path-less** router middleware:
`router.use((_req, _res, next) => { if (ctx.env.claimsApiEnabled !== true) { next(apiError('NOT_FOUND')); … } })`
(`claims.ts:73-79`, `admin-claims.ts:75-81`). Both routers are mounted at the `v1` root with no path
(`index.ts:182-183`). In Express, a path-less `router.use` runs for **every** request that reaches that
router, not only for the routes the router defines. Any `/api/v1` request not already terminated by a
router mounted earlier (lines 159-181) enters the claims router. With the switch off, which is the
production state per §7, it is turned into a 404. The routers mounted after it are therefore unreachable
in production:

- `v1.use('/analytics', …)`: `POST /v1/analytics/events`
- `v1.use('/admin/analytics', …)`: `GET /v1/admin/analytics/dau`
- `v1.use('/support', …)`: support customer lookup, recovery-case notes and lookup, notification-preferences lookup
- `v1.use(createSupportCasesRouter(ctx))`: all six `/v1/support-cases*` routes

This has been live since `c2ff720` was deployed. The direction is fail-closed, so no data is exposed, but
the Customer Support Portal / Call Centre case surface and product analytics are down. That is an
availability incident. The 857 green tests do not catch it because every route test builds an isolated
router, and no test exercises the real `index.ts` mount order. §10 item 1 checked that the gate covers all
8 claims routes, which it does, but did not check what else it covers.

**Do not "fix" this by setting `CLAIMS_API_ENABLED=true`.** That reopens RR-018-2.

**Required (`backend-engineer`, same-day; `site-reliability-engineer` to confirm production recovery):**
1. Scope the gate to the claims paths. In `claims.ts`, use `router.use('/claims', gate)`. In
   `admin-claims.ts`, use `router.use('/admin/claims', gate)`. Express matches `'/claims'` on segment
   boundaries, so `/claims` and `/claims/*` match and `/claimsX` does not. Keep the gate ahead of every
   route and before `authenticate`. An equivalent alternative is to mount the routers under their own
   prefixes in `index.ts`.
2. Add a regression test (**SR-018-8(g)**) that builds the app with the **real `index.ts` mount
   order**, or a faithful extraction of it, with `claimsApiEnabled: false`. It must assert that (a) every
   claims route returns 404, and (b) at least one route from each router mounted **after** the claims
   routers (`/analytics`, `/admin/analytics`, `/support`, `/support-cases`) does **not** return the
   kill-switch 404.
3. Platform lesson for `backend-architect`: path-less `router.use` inside a root-mounted router is
   a cross-router side effect. Grep the other root-mounted routers for the same pattern. The INC-001
   `locationIngestionEnabled` switch cited as precedent in §10 should be checked for the same defect.
4. File an incident record (`site-reliability-engineer`) with the outage window, which starts at the
   `c2ff720` deploy.

### 11.3 Idempotency change: blast radius across the 11 call sites

I read the middleware diff in full against all 11 call sites: `auth.ts` ×2, which are pre-session so
`accountId` is null and the lock is keyed `anon`; `invitations.ts` ×2, where the accept route is
pre-session; `mfa.ts`, `session.ts`, `policies.ts`, `assets.ts`, `recovery.ts`, `support-cases.ts` and
`claims.ts`. **No regression found that blocks this gate.** Reasoning:

- **No new availability dependency.** Every one of these routes already runs a Redis-backed
  `createRateLimiter` that fails closed on a KV error (`rate-limit.ts:33-35`), and production refuses to
  boot without real Redis (`redis.ts:87-92`). The lock adds a second KV call on a dependency the route
  already had.
- **Lock key is not injectable.** The key is UUID-validated before use and namespaced
  `idem-lock:<endpoint>:<accountId|anon>:<key>`.
- **Pre-session routes (`anon`).** Two unrelated anonymous callers collide only if they send the same
  random v4 UUID. An attacker cannot pre-lock a victim's reset-password or invitation-accept call without
  knowing the victim's client-generated key. Acceptable.
- **The replay path is unchanged.** Same key and same body after completion still replays. Same key
  with a different body still returns `IDEMPOTENCY_KEY_REUSE`.

Conditions (non-blocking, `backend-engineer`):
- **C-018-16: no direct test of the new branch.** No test in the repo asserts
  `IDEMPOTENCY_KEY_IN_PROGRESS` on any route, and the shared middleware has no unit test file. A
  shared-middleware change touching 11 routes, including password reset and MFA enrolment, needs
  middleware-level tests: concurrent same key (one executes, one 409), sequential retry after completion
  (replays), and KV throw (5xx, handler not run). This is **SR-018-8(h)** and is required.
- **C-018-17: the stored response is written fire-and-forget after `res.json`.** A client retrying
  immediately after a lost response can get 409 `IN_PROGRESS` instead of the replay for up to 60s. No
  mobile or web client handles `IDEMPOTENCY_KEY_IN_PROGRESS` (a repo-wide grep finds it only in
  `backend/`), so users see a generic error. On password-reset confirm, the INC-003 §30 "do not offer
  try again" contract makes this mostly moot. On `logout-all` and `mfa/enroll/verify`, clients should
  treat it as retry-after-delay. `mobile-engineer`/`frontend-engineer` should add handling.
- **C-018-18: `RedisKeyValueStore.incrWithTtl` is `INCR` then `EXPIRE` as two calls**
  (`redis.ts:68-73`). A process death between them leaves a lock key with no TTL, which wedges that one
  idempotency key permanently. §10 describes the TTL as set "unconditionally". It is set only if the
  second call happens. For a lock, `SET key 1 NX EX 60` is the correct atomic primitive. The rate
  limiter has the same pre-existing property. Low impact, because the client mints a new key per user
  action, but fix it.
- C-018-12 (§10, slow request outliving the 60s lock) is accepted as written.
- C-018-9 (do not cache 5xx; Postgres uniqueness not account-scoped) is **not** addressed by this change
  and stays open.

### 11.4 SR-018-8: what is closed and what is still owed

**Manifest: closed in this pass** (`docs/organization/gates/stage8-manifest.json`):
- Added `backend-claims-customer` (`/claims*`), `backend-admin-claims` (`/admin/claims*`) and
  `web-admin-claims` (`/admin/claims*`). Each points at this document with verdict
  `blocked-re-review-2026-10-28-sr-018-9-sr-018-8`. The narrow `/admin/claims*` entry outranks
  `backend-admin` (`/admin/*`) under the CI-1 specificity rule, so Feature 018 adjudication is no longer
  attributed to the Feature 004 review.
- `mobile-claims`: the stale "no claims backend" reason is marked VOID in place, with the original text
  retained, and the doc and verdict are added. The waiver **stands**. `gated via FEATURE_CLAIMS` is kept
  so `verify-eas-feature-flags.mjs` still maps the flag. There is no `flagEnableApproved`, so any
  real-build flip of `EXPO_PUBLIC_FEATURE_CLAIMS` still fails CI.
- On my original CI-1 semantics question: `verify-stage8-manifest.mjs` is a coverage check only. A
  `blocked` verdict string is not a release approval. Enforcement is the server kill switch plus the
  absence of `flagEnableApproved`. Before this pass, `/claims*` matched **no** manifest entry, so CI-1
  should have been failing on `main` since `4a16ced`. `devops-engineer` should confirm whether CI-1 is
  actually enforced on `main`.

**Tests still owed (required before flip):**

| Item | Status |
|---|---|
| (a) Revoked session on admin PATCH → `STEP_UP_REQUIRED` | **Open.** Only stale/null `mfaVerifiedAt` is tested. |
| (b) `fraudFlags` absent from customer JSON | **Accepted as closed.** `claim-serializers.test.ts:95` uses a non-empty fixture, and every customer path, including the replay of the stored 201 body, goes through that one serializer. Route-level golden tests remain recommended (C-018-10). |
| (c) 4th claim persists `FLAG_RATE_THRESHOLD` | **Open.** |
| (d) Missing or non-UUID `Idempotency-Key` → 400, no claim created | **Open.** |
| (e) One `privileged_state_change` `'claim'` row per admin action, and no mutation when that write throws (AUD-10) | **Open.** |
| (f) Validator test and concurrency test | **Closed.** The validator test exists, the route-level race test uses the real error class, and the real-`mongod` index test is connect-or-skip (it was skipped where it ran, so it is **not yet evidence**; run it once against a local `mongod`). |
| (g) Real-mount-order kill-switch test | **New, required** (SR-018-9). |
| (h) Idempotency middleware tests | **New, required** (C-018-16). |

### 11.5 Before the flag flips

1. SR-018-9 is fixed, deployed, and production recovery of `/v1/support-cases*` and `/v1/analytics/*` is confirmed.
2. SR-018-8 (a), (c), (d), (e), (g), (h) are landed. A fresh `npm test` and `tsc --noEmit` are run and recorded by whoever lands them, and I re-check them.
3. A production read-back of `db.claims.getIndexes()` shows `claims_one_open_claim_per_asset` (owner-run, INC-003 §39), because bootstrap failure is non-fatal.
4. `compliance-specialist`'s CR-018-1 … CR-018-9 (§12) are closed. Their §12.2 eligibility hold and §12.3 notice template are code changes, and I will review them as part of the same re-review.
5. `security-engineer` re-confirms concurrence after SR-018-9, since the §10 concurrence predates it.

New tracked conditions, none blocking:
- C-018-13 (`backend-engineer`): a test that the TS `AdminAccessResourceType` union equals the validator enum.
- C-018-14: make `coverageLimitStatusFor` display the strictest matching limit in the matching currency, consistent with enforcement.
- C-018-15 (`database-architect`): add the `claims` `$jsonSchema` validator while the collection is still empty, which is cheapest now.
- C-018-16 … C-018-18: as in §11.3.

| Role | Decision | Date |
|---|---|---|
| `cybersecurity-architect` (chair, A) | **BLOCKED (narrowed).** SR-018-1 … SR-018-7 verified closed in code. Blocked on SR-018-9 (Critical, production availability) and the SR-018-8 test remainder. `CLAIMS_API_ENABLED` stays unset. | 2026-10-28 |

## 12. `compliance-specialist` rulings and Stage 8 sign-off (2026-10-28)

This is my entry under §6's three-signature gate. Its summary row is in §6.1. I read §0 to §10 of this
document and BR §1, §4, §5 and §8. I also read the running code: `backend/src/routes/claims.ts`,
`routes/admin-claims.ts`, `lib/claim-rules.ts` with `claim-rules.test.ts`, `lib/claim-serializers.ts`,
`repositories/claims.ts`, `repositories/policies.ts` and `repositories/assets.ts`. I did not run the test
suite. §10 records that `security-engineer` did.

### 12.0 Regulatory basis for this feature

| Regime | Applies? | Basis |
|---|---|---|
| POPIA | **Yes** | The data subjects are South African customers. Claims hold personal information: incident narratives, evidence descriptions and amounts. `fraudFlags` are risk annotations about an identifiable person. |
| Insurance Act 18/2017 + Policyholder Protection Rules (Short-term) + TCF; FAIS General Code | **Yes, subject to the unconfirmed licence position** (Feature 013 compliance review §2, Feature 002 §12.5.1) | Claim decisions are the core subject matter of the PPR claims rules. |
| GDPR | **Not applied** | No EU footprint is confirmed. Every policy is written in ZAR (`policies.ts:138`). Reassess if anyone decides to enter an EU market or sell to EU residents. |
| PCI-DSS | **Out of scope here** | No card or payment data is in this feature. The payout feature must make its own determination. |

**Source caveat:** I checked the PPR content below against secondary sources only, not the current
gazetted text. Those sources cover the representation window, the time-bar, Ombud referral, and the
decision-communication period, plus enforcement precedent for rejection notices that omit the 90-day and
Ombud rights. So the requirements below are stated **by content, not by rule number**. The insurer's
legal function must confirm them against the gazetted rules before the template goes live (CR-018-8).

### 12.1 SR-018-2(2) disposition

§7 records that production `claims` holds **0 documents**. No real customer's claim was lodged during the
exposure window, so there is nothing to handle. **Closed from the compliance side.**

### 12.2 SR-018-7 ruling: accept, flag, and hold approval until eligibility is determined

**What the code actually does today.** It differs from both the original finding and the §9 closure
note:

- **(a) An incident dated before `policy.effectiveDate` is already refused at intake.** The check at
  `routes/claims.ts:127` returns a generic `400 VALIDATION_ERROR` ("incidentDate must not be earlier than
  the policy effectiveDate"). This is exactly the mistyped-date refusal that the hard-block option worries
  about, and it is live in the code now. As a result, the flag branch tested at
  `claim-rules.test.ts:162` (incident before `effectiveDate`) can never fire in production, because the
  route rejects that request first.
- **(b) Scenario B is not flagged.** `computeFraudFlags` compares `incidentDate` to
  `waitingPeriodAnchor(...)`, which is the *start* of the waiting period. SR-018-7 asked for a comparison
  against `waitingPeriodClearsAt(...)`, its *end*. Take a loss on day 3 of a policy whose asset was
  registered on day 0, filed on day 31. It is on or after the anchor, so it is not flagged. §9 says
  "Scenario A/B … is now flagged". That is correct for A and incorrect for B.

**Ruling.** An incident date that falls before eligibility is handled the same way in every case: the
claim is **accepted, flagged, and blocked from approval until an admin records an eligibility
determination**. That holds whether the incident is before policy inception, before the asset was
registered, or inside the waiting period. It is neither a hard block nor flag-only.

- **R7-1. No intake refusal based on the incident date.** Replace the `claims.ts:127` refusal with
  "accept and flag". The filing-date `WAITING_PERIOD_NOT_MET` gate stays as it is. It enforces a
  disclosed contract term and returns a written reason and the date the waiting period clears, as I
  already accepted in BR §8.
- **R7-2. Widen the flag condition** to `incidentDate < waitingPeriodClearsAt(policy.effectiveDate,
  asset.registeredAt)`. This covers all three cases. Recommended: store which boundary was crossed
  (`before_inception` / `before_registration` / `within_waiting_period`) in an admin-only field. Add a
  Scenario B test.
- **R7-3. Hold approval.** If an admin sends `approved` for a claim that carries
  `FLAG_INCIDENT_BEFORE_ELIGIBILITY`, return `422 ELIGIBILITY_DETERMINATION_REQUIRED` unless the body
  includes `eligibilityDetermination` (trimmed, 1–2000 characters). That text states why the admin is
  satisfied the loss falls within cover, for example "customer confirmed in response of <date> that the
  incident date was mistyped; actual date <date>; corroborated by <evidence>".
  - It is recorded in `statusHistory` and in the Trail B `reason`, next to the existing
    `approvedAmount=` string.
  - It is admin-only and never serialized to the customer.
  - If the admin instead rejects on this ground, the rejection goes through the §12.3 notice with ground
    `LOSS_OUTSIDE_PERIOD_OF_COVER`.
  - Rejecting and administratively closing are not held, because neither pays anything. A close cannot be
    used for this ground (N-4).
- **R7-4. Disclosure precondition.** "Losses that happened before cover started, before the item was
  added, or during the waiting period are not covered" must be in the policy wording and in the
  pre-contract disclosure. The waiting period itself must be there too (BR §8 condition 1). This must be
  in place before any customer can receive a rejection on this ground, so it is required before the flag
  flips.

**Reasoning.**

1. **A hard block is an intake refusal without the PPR rejection safeguards.** The customer gets no
   written decision, no representation window and no Ombud referral. It also catches honest typos. This
   is the same defect I ruled against for the rate limit (BR §5 item 3, AC-11), and TCF Outcome 6 applies
   in the same way.
2. **POPIA s71 (automated decision-making).** A hard block driven only by an automated date comparison is
   a decision with legal effect on the data subject, based solely on automated processing of their
   information. Flagging plus a recorded human determination keeps the platform clearly outside s71. That
   is the same reason every BR §5 guardrail is flag-only. The s71 exceptions might cover a block, but they
   are not needed if no block exists.
3. **The reviewer is right that flag-only depends on admin diligence.** The hold in R7-3 makes that
   diligence a mandatory, recorded and auditable step. Nothing is refused, and no flagged claim can be
   paid on autopilot. The cost is one body field and one route branch.

### 12.3 SR-018-6 ruling: a server-composed, versioned decision-notice template is required

Free text plus admin training is **not sufficient**, for three reasons:

- Training cannot be enforced or audited.
- The required disclosures are identical on every adverse decision, so they belong in a template, not in
  each admin's memory.
- The enforcement precedent I found was for exactly this omission: rejection notices that left out the
  90-day representation right and the Ombud right.

The admin's text is **one slot** in the notice, never the whole notice. Copy will be drafted by
`technical-writer` (N-7). The structure is ruled now:

- **N-1. Persisted, immutable notice record.** Every admin `rejected`, administrative `closed`,
  `more_info_requested` and partial `approved` (N-3) appends an entry to `decisionNotices[]`:
  - fields: `{ kind, templateVersion, groundCode, renderedText, issuedAt, deliveries[] }`;
  - the server renders it from the versioned template plus the admin's inputs;
  - the list is append-only and is exposed on the customer serializer;
  - the notice text is the record. A later template change must never re-render old notices.
- **N-2. Minimum content of a rejection notice** (full or partial):
  1. **Decision statement:** claim reference, asset, filing date, that the claim is rejected in full or
     in part, and the decision date.
  2. **Ground:** a structured `groundCode` and the admin's specific plain-language reason (the existing
     `rejectionReason`). Where the ground rests on a policy term, cite the clause.
     - v1 codes: `LOSS_OUTSIDE_PERIOD_OF_COVER`, `EXCLUDED_EVENT_OR_CAUSE`, `INSUFFICIENT_EVIDENCE_OF_LOSS`,
       `INSUFFICIENT_EVIDENCE_OF_OWNERSHIP`, `MISREPRESENTATION_OR_NON_DISCLOSURE`,
       `POLICY_NOT_IN_FORCE_AT_INCIDENT`, `QUANTUM_DISPUTED`, and `OTHER` (which needs a longer minimum
       text).
     - Fraud-flag names and heuristics never appear in a notice.
  3. **Representations:** the customer may make representations to the insurer about the decision, or
     about the amount, within **not less than 90 days of receiving the notice**. State how (channel and
     address), and that the insurer will consider them.
  4. **Internal complaints:** the insurer's internal complaints process and contact.
  5. **Ombud referral:** the free right to complain to the **National Financial Ombud Scheme South Africa
     (NFO)**, which absorbed the Short-term Insurance Ombud on 1 March 2024. Give its name, website, phone
     and email. Where the complaint concerns advice or intermediary service, also give the FAIS Ombud.
     - Contact details come from configuration, not hard-coded template text.
     - They are re-verified at go-live; sources disagree on phone format and addresses.
  6. **Time-bar:** any time limit the policy sets for legal action, and that the 90-day representation
     period does not count against it. The secondary sources state a floor of at least 6 months after
     that period. If the policy has no time-bar clause, leave this line out rather than invent one.
  7. **Re-filing:** the customer may file a new claim with new information (the BR §2.5 supersede path),
     and this does not replace their representation right.
  8. **Insurer identity:** registered insurer name, licence number and FSP number. These are placeholders
     until Feature 002 §12.5.1 is closed. A rejection notice with blank licence details must not be
     issued.
- **N-3. A partial approval is a partial rejection.** This gap is not covered by any SR item.
  - If `approvedAmount < claimedAmount`, the admin is disputing the amount. Today the `approved` action
    has no reason field, so the customer would see a lower figure with no explanation.
  - **Required:** in that case, require `quantumReason` (1–2000 characters) and set `groundCode
    QUANTUM_DISPUTED`. Issue the N-2 notice for the shortfall, alongside the approval.
- **N-4. Administrative close is for non-merits grounds only.** Add a `closeGround` enum:
  - `DUPLICATE_CLAIM`: must reference the surviving claim id, validated as belonging to the same account.
  - `FILED_IN_ERROR_CONFIRMED_BY_CUSTOMER`.
  - `WITHDRAWN_AT_CUSTOMER_REQUEST`.

  Ending a claim on its merits, on eligibility, or because the customer did not respond is a rejection.
  It must use `rejected` with the full N-2 notice. The close notice must contain:
  - the closure and its date, the ground and the admin's text;
  - an explicit statement that "this is not a decision on whether your claim is covered";
  - how to file again;
  - the internal complaints and NFO contacts (N-2 items 4 and 5).
- **N-5. More-information notice:**
  - what is needed (the admin's `reviewNote`) and how to respond in the app;
  - that the claim stays open;
  - that it **will not be rejected for lack of a response without a further written notice**.

  Today there is no auto-close or auto-expiry. If one is ever added, it is equivalent to a rejection and
  needs its own compliance review first.
- **N-6. Written delivery.** In-app display alone is **not sufficient** for rejected, partially approved
  or administratively closed claims.
  - The notice must also be sent to the customer's verified email, and each delivery attempt recorded in
    `deliveries[]` with a timestamp. "Receipt of the notice" starts the 90-day clock, so the platform must
    be able to evidence delivery.
  - The secondary sources set a deadline of 10 days after the decision to communicate it. Sending at
    decision time meets that trivially.
  - Production email delivery is still unconfirmed (Resend owner action). **The flag cannot flip until an
    adverse-decision notice can actually be emailed.** This makes the decision-notification part of
    C-018-5 required for claims decisions.
- **N-7. Copy and approval route.**
  - `technical-writer` drafts template v1 in plain language to N-2 … N-5.
  - `compliance-specialist` reviews it.
  - The insurer's legal function confirms it against the current gazetted PPR text and supplies the
    licence details.
  - `ui-designer` decides how the notice appears in `ClaimDetailScreen`. It must be the primary content,
    not hidden behind a link.
- **N-8. Full approval** (not adverse, a condition only). The notice states the amount and currency and,
  honestly, that the claim is "approved — payment not yet scheduled". `awaiting_payout` triggers nothing
  today (BR §0), so the notice must not suggest a payment date.

The same notices apply to every claimant, including business-equipment claims by juristic persons, who
may fall outside the personal-lines PPR scope. A uniform notice costs nothing and avoids running a second
code path.

### 12.4 Independent check of SR-018-3 and SR-018-4

**The R10,000,000 ceiling is not acceptable as the approval ceiling. I am not accepting it as-is.**

- **It does not do its job.** Every policy is ZAR-only, and the product is personal-lines cover for
  phones, laptops, TVs, desktops and vehicles under a monthly subscription. Now that `approvedAmount ≤
  claimedAmount` is enforced, the approval ceiling's only job is to bound a claim whose `claimedAmount` is
  itself inflated, plus a compromised or colluding admin (T4/T5). R10m is roughly two orders of magnitude
  above almost any realistic consumer asset claim, so it bounds nothing realistic.
- **It has no currency.** The constant `MAX_CLAIM_APPROVED_AMOUNT` is implicitly ZAR. If a non-ZAR policy
  ever existed, the same number would silently mean something else.
- **An undisclosed internal ceiling cannot be a ground for paying less.** If it is not in the policy
  wording, reducing or rejecting a claim because of it would apply an undisclosed contract term. So the
  ceiling must work as an **operational control**: one admin cannot approve above it alone. It must never
  be a coverage limit.

**CR-018-9 (required):**
- Split the constant into two:
  - `MAX_CLAIMED_AMOUNT_ZAR = 10_000_000`. This is an input-sanity bound, acceptable because it is not a
    statement about cover. The customer-facing message must be plain language, not a generic validation
    error.
  - `MAX_CLAIM_APPROVED_AMOUNT_ZAR`.
- Set `MAX_CLAIM_APPROVED_AMOUNT_ZAR` to an interim value that `product-manager` confirms against the plan
  catalogue and records with reasoning. **My recommendation is R1,000,000.** `product-manager` may choose
  differently but must justify it; R10m is not accepted by default.
- A claim above the approval ceiling stays in `under_review` and is escalated to `cto` and the insurer. It
  is never rejected or reduced because of the ceiling.

**Conditions (tracked, not blocking the flip):**

- **CC-1. Snapshot the asset's value at filing.** Assets carry a customer-declared `estimatedValue`
  (`repositories/assets.ts:20,33`), with its own customer-supplied currency. Claims do not snapshot it,
  and the customer can edit it after filing.
  - Snapshot it at filing and show it to the admin.
  - Raise an admin-only flag when `claimedAmount > estimatedValue`.
  - Validate the `estimatedValue` currency as ZAR. This is the SR-018-4 defect on the asset side.
- **CC-2. Configuration errors must never cause a rejection.** Today a currency mismatch fails closed with
  `APPROVED_AMOUNT_EXCEEDS_COVERAGE_LIMIT`, which misleads the admin into thinking the amount is the
  problem.
  - Give it a distinct code, `COVERAGE_LIMIT_CURRENCY_MISMATCH`.
  - Add a runbook rule: `CLAIM_POLICY_NOT_FOUND` and a currency mismatch are **never grounds for
    rejecting a claim**. They are escalated and fixed.
  - Show aging for claims stuck behind either error. The PPR requires a decision within a reasonable
    time.
- **CC-3. Fail closed on non-ZAR.** Claims filing and approval refuse any policy whose currency is not ZAR
  until per-currency ceilings exist. This is an internal config guard, so return a 5xx/409 and escalate.
  It is not a customer-facing rejection.
- **CC-4. Sums insured before the payout feature.** No policy states a sum insured or per-asset limit
  (`coverageLimits: []`, D-03/D-08), and none states the settlement basis (replacement or indemnity). The
  policy wording must state these before the payout feature's Stage 8. `approvedAmount` is a
  representation the insurer must stand behind, and without disclosed limits the insurer cannot defend
  any figure below the claimed amount. Owner: `product-manager`.
- **Accepted as built:** the 2-decimal precision rule and the server-pinned claim currency (SR-018-4).

### 12.5 Other compliance conditions (tracked)

- **CC-5. Retention.**
  - Claim documents, `decisionNotices[]`, `statusHistory`, `reviewNotes` and the Trail B `'claim'` rows
    are insurance records. Keep them for **at least 5 years after the claim reaches a terminal state**.
    This is the FAIS General Code record-keeping floor; the insurer's legal function confirms the
    Insurance Act floor.
  - No TTL on `claims`.
  - An erasure request is deferred for these records under POPIA s14(1)(a), retention required by law,
    and the deferral is recorded.
  - Owners: `database-architect` adds this to the retention schedule, and
    `docs/organization/runbooks/account-deletion-request-runbook.md` gets a claims step. Due before the
    first erasure request that touches a claim.
- **CC-6. Standing s71 posture.** `fraudFlags` and `FLAG_INCIDENT_BEFORE_ELIGIBILITY` must stay
  non-determinative. Any change that makes a flag block, auto-reject, auto-reduce or auto-close a claim
  needs compliance re-review first.
- **CC-7. Mobile entry warning (typo mitigation, the companion to R7-1).** If the entered incident date is
  before the asset's registration or before the waiting period clears, show a plain-language confirmation
  before submit. It is not a block. Copy by `technical-writer` and `ui-designer`; I review it.
- **CC-8. Customer date correction.** Let the customer amend `incidentDate` through `respond`, keeping the
  original value (this extends C-018-1), so a typo can be corrected on the record and not only narrated in
  free text.
- **Reaffirmed from BR §8:** the 30-day waiting period and the 3-claims-in-30-days rate *flag* are
  acceptable, subject to disclosure.

### 12.6 Sign-off

**Decision: concur with BLOCKED.** These items must close before the flag flips:

| ID | Requirement | Owner | Ref |
|---|---|---|---|
| CR-018-1 | Remove the `claims.ts:127` intake refusal; accept and flag instead | `backend-engineer` | R7-1 |
| CR-018-2 | Flag condition → `incidentDate < waitingPeriodClearsAt(...)`; add a Scenario B test | `backend-engineer` | R7-2 |
| CR-018-3 | `ELIGIBILITY_DETERMINATION_REQUIRED` approval hold, recorded in `statusHistory` and Trail B; with test | `backend-engineer` | R7-3 |
| CR-018-4 | Waiting period and "loss before cover / registration / within waiting period" exclusion in the policy wording and pre-contract disclosure | `product-manager` / `technical-writer` / insurer legal | R7-4 |
| CR-018-5 | Structured `groundCode` / `closeGround`, server-composed versioned notices, `decisionNotices[]` on the customer shape | `backend-engineer` / `database-architect` | N-1, N-2, N-4, N-5 |
| CR-018-6 | Partial approval requires `quantumReason` and issues a rejection notice for the shortfall | `backend-engineer` | N-3 |
| CR-018-7 | Adverse notices emailed with delivery recorded (depends on production email) | `notification-engineer` / owner (Resend) | N-6 |
| CR-018-8 | Template v1 copy drafted, reviewed by compliance, confirmed by insurer legal against gazetted PPR; licence and FSP numbers supplied | `technical-writer` / `compliance-specialist` / owner | N-7, N-2(8) |
| CR-018-9 | Split the ceiling constants; approval ceiling set to an interim value `product-manager` confirms (recommended R1,000,000) and treated as an operational control, not a coverage ground | `product-manager` / `backend-engineer` | §12.4 |

CC-1 … CC-8 are tracked and do not block the flip. RR-018-3 (§5): the disposition is now "flag, plus a
mandatory recorded eligibility determination before approval; no intake refusal". It closes when
CR-018-1 … CR-018-3 close.

| Role | Decision | Date |
|---|---|---|
| `compliance-specialist` (C) | **CONCUR with BLOCKED.** SR-018-7 and SR-018-6 rulings made (§12.2, §12.3). SR-018-2(2) closed (§12.1). Concurrence with discharge requires CR-018-1 … CR-018-9 to be closed and re-read in code | 2026-10-28 |
