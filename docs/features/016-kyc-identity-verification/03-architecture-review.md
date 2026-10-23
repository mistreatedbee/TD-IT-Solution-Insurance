# Feature 016 — Stage 5 Architecture Review (Track A service/API shape; Track B design-only)

**Lifecycle stage:** 5 — Architecture Review
**Stage owner (A) for this artifact:** `backend-architect` (service/API shape). `solution-architect`
retains overall Stage 5 sign-off per `02-stage-2-kickoff-sprint-plan.md` §3 Track A step 3;
`database-architect` and `cybersecurity-architect` are producing the data-model and threat-model
angles in parallel, cross-referenced here, not restated.
**Date:** 2026-10-23
**Reads required before this doc:** `02-stage-2-kickoff-sprint-plan.md` (binding scope and the §2
hard constraint), `product-scope-decision.md` (§2/§3 ruling this operationalizes),
`business-requirements.md` §3–§4 (FR-5/FR-6, gap assessment), Feature 013
`business-requirements.md` §2.1–§2.2 and `compliance-review-kyc-identity-documents.md` §6 (the
C-013-7 correction that Tier 1 is **client-side-authoritative today**, not server-side, and that
Tier 2's peppered HMAC is blocked at the border, not just at the write).

**Scope boundary for this document:** service/API architecture only. Mongo schema/index shape is
`database-architect`'s lane (flagged to them in §5 below, not designed here). Threat modeling,
consent/legal-basis analysis, and the Stage 8 manifest entry are `cybersecurity-architect`'s lane
(flagged in §6, not performed here). This document does not re-litigate the CT-1/CT-15/CT-16
ruling or the Tier 1/2/3 compliance ruling — both are treated as fixed inputs from
`compliance-review-kyc-identity-documents.md`.

---

## 1. Track A — Tier 1 gating mechanism — service/API shape

> **Correction (`backend-architect`, 2026-10-23, filed against `cybersecurity-architect`'s
> `03c-security-review-stage5.md` §"Disagreements"/§3.1/M-4):** this section's original heading
> read ~~"Track A — Tier 1 gating mechanism — service/API shape (no CT-1/15/16 dependency)"~~ —
> **void, do not rely on this wording.** It conflated two distinct claims: (a) the gate's
> *mechanism* never touches full-ID-number data (true — see §1.1 below, unchanged), and (b)
> *enabling enforcement* carries no compliance dependency (false). Enforcement turns optional KYC
> processing into a condition of service for every customer, which implicates CT-1 (cross-border
> processing consent), CT-16 (Register B client instruction on ID-number/document/biometric
> collection), the §9.3 containment rule, and the never-reviewed `/account/profile*` surface
> (F009-1/INC-001 A-12). The kickoff doc's own §2.1 row 3 already states this correctly: the
> "Blocked until CT-1/CT-15/CT-16 close" column includes *"Enforcing the FR-5/FR-6 gate against
> real customer traffic (flag stays OFF; code path may exist, dark)."* Corrected statement for
> this section and for every reference to the same claim below: **the gate's mechanism has no
> full-ID-number dependency; enabling enforcement against real customers is blocked pending
> CT-1/CT-16 resolution regardless.** See the superseded passages below, each marked void in
> place, with corrected text following.

### 1.1 What this track actually touches

Per the kickoff doc's own framing, Track A is "pure application logic consuming the existing
`verificationStatus` enum." Verified against code: `verificationStatus` lives on
`CustomerProfileDocument` (`backend/src/repositories/customer-profiles.ts:39`), is a closed enum
(`not_started | in_progress | pending_review | verified | rejected | action_required`,
`customer-profiles.ts:5-11`), and is already read-and-written exclusively via
`CustomerProfilesRepo`. **Track A adds exactly one new read of this existing field at one new call
site — it does not add a new field, a new collection, or a new write path.**

This also means Track A never touches the full ID number anywhere in its call graph: the asset-
creation route (`backend/src/routes/assets.ts`) has no parameter, body field, or dependency that
carries `idNumber` — only `idNumberLast4` exists anywhere in `customer-profiles.ts`, and the gate
check reads `verificationStatus`, not `idNumberLast4` or any ID-derived value.

> ~~This is the basis for the kickoff doc's claim that Track A has zero CT-1/CT-15/CT-16
> dependency, and this review confirms it by tracing the actual call graph, not just repeating the
> claim.~~ **Void (corrected 2026-10-23, per `03c-security-review-stage5.md` §3.1, see §1 banner
> above).** The kickoff doc makes no such claim about *enforcement* — its §2.1 row 3 explicitly
> places "Enforcing the FR-5/FR-6 gate against real customer traffic" in the blocked column. What
> the call-graph trace above actually establishes, correctly, is the narrower fact that the gate's
> *mechanism* carries no full-ID-number dependency. It does not establish, and was never entitled
> to establish, that *flipping enforcement on* is free of CT-1/CT-16 dependency — that is a
> processing/consent question about what enforcement does to real customers, not a call-graph
> question about what data the function reads.

### 1.2 Service boundary — no new service, extend an existing boundary

Per ADR-0001's Node.js/TypeScript baseline and this platform's existing service-decomposition
pattern (`lib/plan-enforcement.ts`, `lib/account-gate.ts`), Track A is a **new assertion module in
the same family**, not a new service and not a new route file:

- **New file:** `backend/src/lib/kyc-gate.ts` — exports `assertKycVerifiedForAssetRegistration()`,
  mirroring the existing shape of `assertAssetRegistrationAllowed()` in
  `backend/src/lib/plan-enforcement.ts`:

```ts
// backend/src/lib/kyc-gate.ts (Stage 5 shape — Stage 7 owns exact naming/signature)
import type { AppContext } from '../context.js';
import { apiError } from './errors.js';

export async function assertKycVerifiedForAssetRegistration(
  ctx: Pick<AppContext, 'customerProfiles'>,
  accountId: string,
): Promise<void> {
  // FEATURE_KYC_GATING_ENABLED default OFF — Stage 7 names the concrete flag.
  //
  // CORRECTED 2026-10-23 (backend-architect, per cybersecurity-architect's
  // 03c-security-review-stage5.md §3.1/M-4 — this must not ship as originally
  // drafted). VOID, do not use — superseded text retained for audit only:
  //   ~~This read-only check against the existing `verificationStatus` enum
  //   never touches a full ID number (only `idNumberLast4` exists in this
  //   collection) and has NO dependency on CT-1/CT-15/CT-16 — see
  //   02-stage-2-kickoff-sprint-plan.md §2.1 row 3. The flag exists to control
  //   ENFORCEMENT timing (product/rollout readiness), not a compliance border
  //   condition — do not conflate the two when naming this flag at Stage 7.~~
  // That conflated two different claims. Corrected:
  //   - The MECHANISM below has no full-ID-number dependency: it reads only
  //     the existing `verificationStatus` enum, never `idNumberLast4` or any
  //     ID-derived value. This part was and remains true.
  //   - ENABLING ENFORCEMENT against real customers is NOT a pure
  //     product/rollout-timing decision. It is BLOCKED pending CT-1 and
  //     CT-16 (02-stage-2-kickoff-sprint-plan.md §2.1 row 3 already states
  //     this: "Enforcing the FR-5/FR-6 gate against real customer traffic"
  //     is listed under "Blocked until CT-1/CT-15/CT-16 close", not under
  //     "Allowed now"). Enforcement makes handing KYC-adjacent verification
  //     data a condition of service, which implicates CT-1 (cross-border
  //     processing consent) and CT-16 (Register B client instruction),
  //     independently of the fact that the mechanism itself never carries a
  //     full ID number. Do not flip this flag true in any non-local
  //     environment until CT-1/CT-16 close per the Stage 8 manifest entry.
  const profile = await ctx.customerProfiles.findByAccountId(accountId);
  if (profile?.verificationStatus !== 'verified') {
    throw apiError('KYC_VERIFICATION_REQUIRED');
  }
}
```

- **Call site:** `backend/src/routes/assets.ts`, inside `POST /assets`, alongside the existing
  `requireActiveAccount` / `assertAssetRegistrationAllowed` calls (`assets.ts:63-64`) — same
  position in the handler, same try/catch, same `next(err)` pattern. No new middleware, no new
  router, no new auth layer: this reuses the existing `authenticate` middleware and
  `req.auth!.accountId` already resolved for that route.

```ts
// backend/src/routes/assets.ts — Stage 5 shape of the new call, inserted after
// requireActiveAccount and before assertAssetRegistrationAllowed (ordering:
// account-standing check first, plan-limit and KYC checks are independent of
// each other and may run in either order — Stage 7 picks one for consistency
// with error-priority conventions elsewhere in this file)
await requireActiveAccount(ctx.accounts, accountId);
await assertKycVerifiedForAssetRegistration(ctx, accountId);   // <-- new
await assertAssetRegistrationAllowed(ctx, accountId);
```

This keeps the gate as a **library-level assertion**, consistent with this backend's existing
pattern of small, independently testable guard functions rather than inline route logic — it is
the same shape `backend-architect` would require of any new mutating-route precondition.

### 1.3 New error code

`KYC_VERIFICATION_REQUIRED` is added to `ERROR_CATALOG` in `backend/src/lib/errors.ts`, following
the existing `ASSET_LIMIT_REACHED` precedent exactly (403, fixed customer-safe message, no
upstream string leakage per SR-19):

```ts
KYC_VERIFICATION_REQUIRED: {
  statusCode: 403,
  message: 'You must complete identity verification before registering an asset.',
},
```

No new field on `extra` is needed/recommended — unlike `ASSET_LIMIT_REACHED`'s `{ maxAssets }`,
there is no safe, non-PII-leaking detail to attach (do not attach `rejectionReasonCustomerSafe` or
any profile field here; the client already has a dedicated verification-status read path at
`GET /account/profile` for that).

### 1.4 Feature-flag shape (Stage 7 names it; this is the boundary Stage 5 must get right)

Per the kickoff doc §2.2's mandatory deliverable, the gate's **enforcement** must be flag-gated,
default OFF, reusing the existing `FEATURE_KYC_ENABLED` pattern family
(`mobile/src/config/features.ts`) rather than inventing a new mechanism. Two architecturally
distinct questions must not be collapsed into one flag:

1. **Does the mobile client show KYC/verification UI at all?** — already governed by
   `FEATURE_KYC_ENABLED` (mobile-only, existing).
2. **Does the backend actually reject `POST /assets` for an unverified account?** — this is a
   **new, backend-side flag**, structurally independent of Track B's flag and of the mobile flag
   (a backend rollout could enable enforcement before a mobile release ships the corresponding UI
   copy, or vice versa — these are two different release trains and must not share one flag).

   > ~~because Track A's enforcement has no CT-1/CT-15/CT-16 dependency and is allowed to flip
   > independently~~ **Void (corrected 2026-10-23, per `03c-security-review-stage5.md` §3.1).**
   > The flag's *structural* independence from Track B's flag and the mobile flag is correct and
   > unchanged — that is purely about which code paths share a boolean. It does not follow, and was
   > wrongly implied here, that the flag may be *flipped true in a real environment* independent of
   > CT-1/CT-16. It may not: per the kickoff doc §2.1 row 3, enforcement against real customer
   > traffic stays in the "Blocked until CT-1/CT-15/CT-16 close" column regardless of this flag's
   > structural independence from Track B.

Recommended shape (Stage 7 owns the final name/env-var convention):

```ts
// backend/src/config/features.ts (new or extended file — Stage 7 confirms
// location against this backend's existing env-var conventions)
//
// Default OFF. This flag controls ENFORCEMENT ROLLOUT TIMING ONLY — it has
// no relationship to CT-1/CT-15/CT-16 (Track A never touches the full ID
// number; see kyc-gate.ts). Do not wire this flag to gate anything in
// Track B (HMAC write / full-ID transmission) — that is a SEPARATE flag,
// see 03-architecture-review.md §2.4, and conflating them would make it
// impossible to enable Track A enforcement while Track B legitimately
// stays dark pending CT-1/CT-15/CT-16.
export const FEATURE_KYC_GATING_ENFORCED =
  process.env.FEATURE_KYC_GATING_ENFORCED === 'true'; // fail-closed-by-omission: unset => false
```

**Fail-open regression risk (the kickoff doc's §5 risk-register row, INC-002-class):** note the
polarity here is **inverted** from `mobile/src/config/features.ts`'s convention. That file
defaults flags to **visible/true** unless explicitly set `false`, because showing a UI screen is
the lower-risk default. Here the lower-risk default is the opposite: an unset/misconfigured
enforcement flag must default to **not enforced** (`false`), because the failure mode of
accidentally defaulting to "enforced" is blocking real customers from registering assets in
production (a functional/availability regression), while the failure mode of accidentally
defaulting to "not enforced" is a silent no-op gate (a product/compliance-posture gap, not a data
leak, since the check never involves the full ID number). **Do not copy the mobile file's
`raw !== 'false'` truthy-by-default helper here — this flag needs an explicit
`=== 'true'`-equals-enable, not a `!== 'false'`-equals-enable convention.** This distinction is a
named line item for `cybersecurity-architect`'s Stage 8 manifest entry (§2.2 item 2 of the kickoff
doc) and for `qa-architect`'s test plan: a unit test asserting the default (no env var set)
resolves to `false` is mandatory, mirroring the INC-002 postmortem's own corrective action.

### 1.5 Pre-existing-asset non-regression (AC-7)

No design change needed — the gate lives entirely inside `POST /assets` (creation). `GET
/v1/customer/assets` (list/read) and all other asset routes in `assets.ts` are untouched by this
design, satisfying AC-7 (pre-existing assets for unverified accounts remain visible) by
construction, not by a special-cased exemption that could regress.

### 1.6 Idempotency interaction

`POST /assets` already requires `requireIdempotencyKey('POST /v1/assets', ctx.idempotency)`
(`assets.ts:58`) ahead of the handler body. The new gate check throws before any mutation and
before idempotency-key storage of a *successful* result, consistent with how
`assertAssetRegistrationAllowed`'s `ASSET_LIMIT_REACHED` throw already behaves today — no new
idempotency design is needed; `KYC_VERIFICATION_REQUIRED` is just another pre-mutation rejection
on an already-idempotency-key-gated route. Confirm at Stage 7/9 that the idempotency middleware's
existing behavior on a thrown pre-mutation error (replay-safe, does not cache the rejection as a
"successful" idempotent response) already handles this correctly — this is existing behavior being
exercised by a new error code, not new idempotency logic.

### 1.7 Claims-filing gate (FR-6) — pre-specified, not built

Per `business-requirements.md` FR-6 and the kickoff doc's scope line, no claims route exists
(`CLAUDE.md` "Not built" list, confirmed current). This document pre-specifies the **shape** for
whenever a claims backend exists: the same `assertKycVerifiedForAssetRegistration`-family function
(renamed/generalized, e.g. `assertKycVerified(ctx, accountId)`, reusable across both call sites)
should be called at the equivalent precondition point in whatever claims-mutation route is
eventually designed — not duplicated inline. No code is written for this today; this is a note for
whichever role designs the claims feature's Stage 7 API, so it does not re-derive the gate
function's shape from scratch.

---

## 2. Track B — Tier 2 peppered-HMAC design — service/API shape (design-only, flag OFF, merges dark)

**Everything in this section is a design artifact. No code implementing it should exist with a
default-reachable path. Every subsection below carries an explicit blocked-action marker per the
task's hard constraint.**

### 2.1 What Track B actually is, scoped correctly against the C-013-7 correction

Per `compliance-review-kyc-identity-documents.md` §6.2/§6.3 (Option A approved in principle,
conditional) and §6.4's correction, Track B is **not** "add server-side duplicate detection to the
existing `idNumber` flow" — the existing flow already rejects anything but 4 digits at the schema
layer (`customer-profile-validation.ts`'s CT-11 comment) and that rejection **stays in place
unconditionally**, including after Track B merges. Track B is a **parallel, additive** code path
that would only ever receive a full 13-digit number through a field that does not exist in any
real request body today and must not be added to `updateCustomerProfileBodySchema`.

### 2.2 Service boundary

A new, separate module — **not** a modification of `customer-profile-validation.ts` or
`customer-profile.ts`'s existing `PATCH /v1/customer/profile` route:

- **New file (design only):** `backend/src/lib/kyc-duplicate-detection.ts` — would export a pure
  function `computeIdNumberHmac(fullIdNumber: string, pepper: string): string` and a repository
  method shape `CustomerProfilesRepo.findByIdNumberHmac(hmac: string): Promise<CustomerProfileDocument | null>`
  (the latter is `database-architect`'s index/schema call, flagged in §5, not designed here).
- **New, separate route-body field (design only, not added to the existing schema):** a
  **dedicated** request body field/endpoint distinct from `idNumber` (last-4-only) — e.g. a
  hypothetical `fullIdNumberForDuplicateCheck` on a **new** endpoint, never merged into
  `updateCustomerProfileBodySchema`. Keeping it a structurally separate schema/endpoint (rather
  than widening the existing field) means the CT-11 boundary comment and its 4-digit regex remain
  true and unmodified by Track B's mere existence in the codebase — the blocked capability is
  additive and off, not a loosening of what already ships.

```ts
// backend/src/lib/kyc-duplicate-detection.ts (DESIGN ONLY — Stage 9 Development
// for this file does not start until CT-1, CT-15, and CT-16 all close; see
// 02-stage-2-kickoff-sprint-plan.md §2).
//
// BLOCKED ACTION MARKER 1 of 3 — FULL ID NUMBER TRANSMISSION:
// Any route handler that accepts a 13-digit `idNumber`-shaped field in a
// request body is the blocked action itself. Per compliance-review-
// kyc-identity-documents.md §6.3 (C-013-7), transmitting the full SA ID
// number to this Frankfurt-hosted API is a NEW cross-border transfer that
// may not occur until: (a) CT-1 closes in the required form; (b) the
// supplementary §19(c) disclosure naming the full ID number is served;
// (c) G-11 is re-answered. DO NOT wire any request schema that accepts
// more than 4 digits in an `idNumber`-shaped field — not even behind a
// flag — until a cybersecurity-architect-countersigned Stage 8 update
// confirms CT-1/CT-15/CT-16 have closed. The flag below gates the WRITE
// (marker 2), not the transmission itself — transmission must not be
// implemented at all until this comment is removed by someone who has
// verified the three conditions, not toggled a flag.

// BLOCKED ACTION MARKER 2 of 3 — HMAC KEY WRITE:
// `computeIdNumberHmac()` below must never be called with a real pepper
// value read from a secret store in any environment until CT-15 closes
// (compliance-review §6.2 Option A conditions + C-013-8 pepper-management
// plan). FEATURE_KYC_DUPLICATE_DETECTION_ENABLED (name TBD Stage 7) stays
// default OFF; cybersecurity-architect + database-architect own the actual
// pepper provisioning plan (C-013-8) as a precondition independent of this
// flag, i.e. flipping this flag true without C-013-8 having separately
// closed is ALSO blocked — the flag alone is not sufficient authorization.
export function computeIdNumberHmac(fullIdNumber: string, pepper: string): string {
  // Implementation intentionally not written at Stage 5 — pure function,
  // HMAC-SHA256(pepper, fullIdNumber), discarded inputs, per §6.2/§5.1-§5.2.
  throw new Error('not implemented — blocked pending CT-1/CT-15/CT-16, see comment above');
}
```

### 2.3 API shape (design only)

If/when CT-1/CT-15/CT-16 close, the intended shape is a **single-purpose, transient** endpoint —
not a general profile-update widening:

- `POST /v1/customer/profile/identity-verification` (name TBD Stage 7) — accepts the full ID
  number in the request body **only**, computes the HMAC server-side in the same request, performs
  the `findByIdNumberHmac` uniqueness lookup, persists only the HMAC value (never the plaintext
  number, never logs it — per §5.1/§5.2 of the compliance review), and returns a
  match/no-match-style result (e.g. `202 { outcome: 'pending_review' }` on a hit, routing to the
  existing `pending_review` human-adjudication flow per the compliance review's explicit
  requirement that a duplicate match must be human-resolvable, not a hard auto-block).
- This endpoint is **separate** from `PATCH /v1/customer/profile` specifically so that the
  existing, already-shipped 4-digit-only route is structurally incapable of regressing into
  accepting 13 digits by a future unrelated change — a reviewer touching the existing route never
  needs to touch this one, and vice versa. This is the architecture-level enforcement of the "do
  not widen `idNumber`'s regex" instruction, not just a comment.
- Idempotency: per this backend's own best-practice (mandatory idempotency key on any
  mutating/device-or-identity-state endpoint), this endpoint would require
  `requireIdempotencyKey` identically to how `POST /assets` does today — flagged here so Stage 7
  doesn't have to re-derive it, not implemented now.

### 2.4 Flag shape (design only — distinct flag from Track A's)

```ts
// backend/src/config/features.ts (same file as §1.4, additional export —
// DESIGN ONLY, do not add this export until Stage 9 for Track B begins)
//
// BLOCKED ACTION MARKER 3 of 3 — GATE/WRITE-PATH ENFORCEMENT ENABLE:
// This flag, even if someone adds it and sets it true in a non-local
// environment, does not by itself authorize anything: CT-1, CT-15, and
// CT-16 (docs/organization/10-data-protection-contract-obligations.md
// §9-10, §14.1) must ALL be closed first, AND C-013-8's pepper-management
// plan must be in place, AND cybersecurity-architect's Stage 8 manifest
// entry (02-stage-2-kickoff-sprint-plan.md §2.2 item 2) must be re-affirmed
// as current. A reviewer must not treat "the flag compiles and defaults
// false" as sufficient Stage 8 clearance to flip it in any shared
// environment config.
export const FEATURE_KYC_DUPLICATE_DETECTION_ENABLED =
  process.env.FEATURE_KYC_DUPLICATE_DETECTION_ENABLED === 'true';
```

Track A's `FEATURE_KYC_GATING_ENFORCED` and Track B's `FEATURE_KYC_DUPLICATE_DETECTION_ENABLED`
are **independent flags by design** (§1.4) — this is the architectural guarantee that Track A can
go live without waiting on Track B's compliance dependency, which is the entire point of splitting
the two tracks in the kickoff doc.

### 2.5 What Track B explicitly does NOT include at this Stage 5 pass

- No implementation of `computeIdNumberHmac`'s body (stubbed to throw, per §2.2).
- No pepper provisioning, no secret-store wiring, no rotation logic — that is
  `cybersecurity-architect` + `database-architect`'s C-013-8, a precondition this design assumes
  but does not perform.
- No modification to `updateCustomerProfileBodySchema` or `customer-profile.ts` — confirmed
  structurally impossible by §2.2/§2.3's separate-endpoint design, not just a promise.
- No index/collection shape for the HMAC field — `database-architect`'s lane, flagged in §5.

---

## 3. Cross-track consistency check

- Both tracks share one error-taxonomy convention (`apiError()` / `ERROR_CATALOG`, SR-19) and one
  feature-flag *family* (boolean, env-var-backed, default OFF for anything enforcement-facing) —
  no new cross-cutting mechanism introduced.
- Track A's flag and Track B's flag are independent, per §2.4 — verified no shared flag, no shared
  gating module between `kyc-gate.ts` (Track A) and `kyc-duplicate-detection.ts` (Track B).
- Neither track introduces a new Express router, a new auth middleware, or a new rate-limiter
  family — both reuse `authenticate`, `createRateLimiter`, and `requireIdempotencyKey` exactly as
  they exist today.

---

## 4. Capacity / throughput note

Track A adds one additional Mongo read (`findByAccountId`, already indexed by `accountId` per
existing `customer-profiles.ts` usage in `admin-verification.ts` and `customer-profile.ts`) to the
existing `POST /assets` handler — negligible against this platform's current throughput targets;
no new capacity planning needed. Track B's eventual HMAC-lookup read path is a single indexed
equality lookup (`database-architect`'s index design, §5) and is not expected to be a throughput
concern at this platform's pre-launch scale (`north-star-2000-dau.md`) — flagged for
`performance-engineer` to revisit only if/when Track B actually activates, not before.

---

## 5. Open items flagged to other roles (not designed here)

- **`database-architect`** — confirm Track A needs **zero** schema change (read-only against
  existing `verificationStatus`); scope Track B's `findByIdNumberHmac` index shape (likely a
  sparse unique index on a new `idNumberHmac` field in `customer_profiles`, written only post-
  activation) — design only, no migration authored now.
- **`cybersecurity-architect`** — confirm (a) the flag-polarity reasoning in §1.4 is sound from a
  fail-safe perspective, (b) the three blocked-action markers in §2.2/§2.4 are sufficient for the
  Stage 8 manifest entry the kickoff doc §2.2 item 2 requires, (c) whether the separate-endpoint
  design in §2.3 is itself sufficient isolation or whether an additional runtime guard (e.g. a
  request-body-size/shape assertion rejecting any 13-digit-looking string anywhere in Track B's
  code paths while dark) should be a Stage 7 requirement.
- **`backend-architect` (Stage 7, this role, next pass)** — final flag names, exact error-code
  value, and the claims-route gate reuse point (§1.7) once that feature exists.
- **`qa-architect`** — the INC-002-class fail-closed-default test (§1.4) should be a named test
  case in the Stage 10 test plan for this feature, not assumed covered by generic flag testing.

---

## 6. Summary — Stage 5 disposition

| Track | Disposition |
|---|---|
| A — Tier 1 gating mechanism | **Architecturally clear to proceed to Stage 6/7.** No new service, no new collection, one new library function, one new error code, one new flag (default OFF, enforcement-timing only, zero CT-1/15/16 dependency confirmed by call-graph trace in §1.1). |
| B — Tier 2 peppered-HMAC | **Design recorded, merges dark only.** Service/API shape isolated into new, separate files/endpoints so the existing 4-digit-only `idNumber` path is structurally unmodified. All three blocked actions (full-ID transmission, HMAC key write, enforcement flip) carry explicit comment markers per the task's hard constraint (§2.2, §2.4) and remain stubbed/throwing or unimplemented pending CT-1/CT-15/CT-16 and C-013-8. |

No code in this document's examples is final implementation — Stage 7 (`backend-architect`) owns
exact naming and signatures; this Stage 5 pass establishes the service/API *shape* and the
blocked-action boundary only.
