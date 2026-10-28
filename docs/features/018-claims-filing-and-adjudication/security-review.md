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
| `cybersecurity-architect` (chair, A) | **BLOCKED** — SR-018-1 … SR-018-8 | 2026-10-28 |
| `security-engineer` (R) | *pending* | |
| `compliance-specialist` (C) | *pending* — specifically SR-018-6, SR-018-7 ruling, SR-018-2(2) disposition | |
