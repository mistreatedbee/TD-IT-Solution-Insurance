# Feature 018 — Claims Filing and Adjudication (No Payout Execution)

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst` (this filing) — CTO-authorized top priority per business
owner direction, 2026-10-28.
**Contributors required before Stage 2:** `product-manager` (scope sign-off), `backend-architect`
/`database-architect` (data model + Mongo collection design), `payment-engineer` (consulted only —
confirms the "approved amount tracked, no payout trigger" boundary is clean for later wiring),
`cybersecurity-architect` (Stage 8, hard gate), `qa-architect` (Stage 10, hard gate),
`compliance-specialist` (review of rejection/eligibility rules before Stage 2 exit).
**Status:** Draft, ready for Stage 2 architecture handoff.

**Problem being solved:** the mobile app ships a claims UI stub
(`mobile/app/(app)/claims/index.tsx`, `new.tsx`, `[id].tsx`, `_layout.tsx`) that points at nothing.
No `backend/src/routes/claims.ts` exists, no `claims` repository/collection exists. This is
currently the single biggest gap between the shipped UI and a usable product.

---

## 0. Explicit scope boundary — read this before building

**This feature is claim filing, review, and adjudication only.** It is deliberately decoupled
from payment execution because the payment gateway is an open vendor decision owned by
`integration-architect` (per `docs/organization/adr/` open-decisions tracking and ADR-0001/0002
baseline). Nothing in this feature charges a customer or pays out a claim.

A claim's terminal "approved" outcome is `awaiting_payout` — the system records that a claim was
approved and for how much (`approvedAmount`), but **no payout, transfer, ledger entry, or
integration call happens.** When a payment gateway is selected, a future feature wires
`awaiting_payout` → an actual disbursement; that is explicitly out of scope here and must not be
anticipated by hardcoding a vendor-specific flow.

**Out of scope for this spec (do not build):**
- Payment/payout execution of any kind.
- Document/photo upload for evidence — no object-storage vendor exists yet (MP-5, open). This
  spec decides claims launch with **text-only evidence description** (§3).
- Any AI-based or automated fraud scoring. §5 below defines only simple, deterministic flags.
- Coverage-limit *amounts* per asset type — `PolicyDocument.coverageLimits` exists in the schema
  (`backend/src/repositories/policies.ts`) but is seeded empty (`coverageLimits: []`) for every
  policy today; no admin surface populates it. D-03/D-08 (coverage limits, claims payout caps) are
  still open decisions per the business-analyst backlog. This spec defines how a claim behaves
  **when** a coverage limit is present and **when** it is absent (§1.4) — it does not set limit
  values.

---

## 1. Eligibility — when can a customer file a claim?

### 1.1 Policy status gate
- The policy referenced by the claim (`policyId`) **must have `status: 'active'`** at the moment
  of submission. Reject with `POLICY_NOT_ACTIVE` otherwise.
  - `pending_activation`, `past_due`, `suspended`, `cancelled`, `expired` are all non-active and
    all block new claim submission. This explicitly includes a policy cancelled via the admin
    cancellation path shipped in commit `77b9dc1` (`PoliciesRepo.cancelForAdmin`) — a cancelled
    policy cannot have new claims filed against it, full stop, regardless of why it was
    cancelled.
  - A policy on `legalHold: true` **may still have claims filed against it** — legal hold freezes
    administrative policy changes (per its existing use elsewhere), not customer-initiated claim
    filing. An existing claim on a legal-hold policy still proceeds through review normally.

### 1.2 Asset status gate
- The asset referenced by the claim (`assetId`) must belong to the same `accountId` as the policy
  and must have `status: 'active'`. A `removed` or `inactive` asset cannot have a new claim filed
  against it — reject with `ASSET_NOT_ELIGIBLE`.
  - Rationale: an asset the customer has already archived/removed from their account is not being
    actively insured; if it was stolen/lost before removal, the claim should have been filed
    before removal. (If a customer removes an asset *after* filing a claim, see §1.6 — the claim
    itself is unaffected.)

### 1.3 Waiting period
- A claim may not be filed within **30 days of the policy's `effectiveDate`** (first activation),
  UNLESS the claim is linked to a recovery case (§1.5) whose `reportedAt` is itself at least 30
  days after `effectiveDate`. Reject with `WAITING_PERIOD_NOT_MET` (customer-facing message
  surfaces the exact date the waiting period ends).
  - Rationale: a standard anti-fraud waiting period so a customer cannot subscribe and immediately
    claim on a pre-existing loss. 30 days is a placeholder figure in line with industry-standard
    short-tail asset insurance waiting periods — `product-manager`/`compliance-specialist` may
    tune this constant; it must live as a single named constant
    (`CLAIM_WAITING_PERIOD_DAYS`), not inlined, so it is a one-line change.
  - This gate uses the **policy's** `effectiveDate`, not the asset's `registeredAt`. If the asset
    was registered after the policy went active, see §1.3a.

### 1.3a Asset registered after policy activation
- If `asset.registeredAt` is later than `policy.effectiveDate`, the waiting period is computed
  from `asset.registeredAt` instead (whichever is later governs) — reject with
  `WAITING_PERIOD_NOT_MET` if fewer than `CLAIM_WAITING_PERIOD_DAYS` have elapsed since asset
  registration. Rationale: adding an asset to an existing active policy should not instantly carry
  full claim eligibility either.

### 1.4 Coverage-limit interaction (forward-compatible, not yet populated)
- At claim-approval time (not filing time), if `policy.coverageLimits` contains an entry whose
  `assetType` matches the claimed asset's `assetType`, the admin-set `approvedAmount` **must not
  exceed** that limit's `amount` — attempting to approve above it is rejected by the API with
  `APPROVED_AMOUNT_EXCEEDS_COVERAGE_LIMIT` (admin must either approve at-or-below the limit or
  reject/request more info).
  - If no matching `coverageLimits` entry exists for that `assetType` (the case for every policy
    today, since the array is seeded empty), **no cap is enforced** — this is a known, explicit
    gap tracked under D-03/D-08, not a bug. The admin review UI must surface this absence plainly
    (e.g. "No coverage limit configured for this asset type — approval amount is admin
    discretion") so an approving admin is never silently unaware the guardrail is off.
  - `claimedAmount` (customer-proposed, §3) is NEVER capped at filing time — a customer may claim
    any amount; capping only applies to the admin's `approvedAmount` at adjudication.

### 1.5 One open claim per asset at a time
- An asset may have **at most one claim in a non-terminal state** (`submitted`,
  `under_review`, `more_info_requested`) at any time. A second claim filed against the same
  `assetId` while one is already non-terminal is rejected with `DUPLICATE_OPEN_CLAIM`, and the
  response includes the existing open claim's id so the mobile UI can route the customer to it
  instead of leaving them stuck.
  - Once a claim reaches a terminal state (`approved`/`awaiting_payout`/`rejected`/`closed`,
    §2), a new claim may be filed against the same asset (e.g. a second, unrelated loss of a
    replaced item, or a claim resubmitted after being rejected and the customer disputes/adds new
    information — modeled as a new claim, not a reopen; see §2.5 on why there is no reopen
    transition).

### 1.6 Recovery-case linkage is optional, not required
- A claim MAY reference an existing `recoveryCaseId` (from `recovery_cases`, owned by the same
  `accountId` and `assetId`) if the loss was theft/loss already reported through the existing
  theft-reporting flow. This is **optional, not required** — not every claim is theft/loss (e.g.
  accidental damage is a valid claim with no recovery case). When supplied, the backend validates
  the recovery case belongs to the same account and asset (`RECOVERY_CASE_MISMATCH` otherwise) but
  does **not** duplicate or re-derive theft-report fields (`sapsCaseNumber`, etc.) — the claim
  only stores the `recoveryCaseId` as a foreign reference for the admin reviewer to cross-check,
  per the instruction not to duplicate theft-reporting, which `recovery_cases` already owns in
  full.

### 1.7 Asset removed after a claim is already open
- If a customer removes/archives the asset (`markRemovedForAccount`) while a claim on it is
  non-terminal, the claim is **unaffected** — it continues through review on its existing
  snapshot of asset/policy references (claims capture `assetType`/`displayName` as of filing
  time, §3, precisely so later asset removal cannot retroactively invalidate an in-flight claim
  or blank out what the admin is reviewing).

---

## 2. Claim lifecycle / state machine

### 2.1 States

| State | Meaning |
|---|---|
| `submitted` | Customer has filed the claim. Awaiting first admin look. |
| `under_review` | An admin has started reviewing; distinguishes "nobody has looked yet" from "actively being worked" in admin queue views. |
| `more_info_requested` | Admin needs additional information from the customer before a decision can be made. Non-terminal. |
| `approved` | Admin has approved the claim and set `approvedAmount`. Immediately auto-transitions to `awaiting_payout` (see 2.4) — `approved` exists as an audit-trail state, not a resting state. |
| `awaiting_payout` | Terminal for this feature. Claim is approved; no payout has been triggered because no payment integration exists. A future feature reads claims in this state to drive actual disbursement. |
| `rejected` | Admin has denied the claim with a required reason (§4.2). Terminal. |
| `closed` | Customer withdrew the claim, or admin closed it administratively (e.g. duplicate, filed in error). Terminal. |

### 2.2 Transition table

| From | To | Triggered by | Notes |
|---|---|---|---|
| — | `submitted` | customer (`POST /v1/claims`) | Initial creation only. |
| `submitted` | `under_review` | admin (`PATCH /v1/admin/claims/{id}`, action `start_review`) | First admin engagement. System MAY also auto-transition on the admin's first `GET` of claim detail (implementation choice, not a business rule) — if automatic, it must still write the same audit trail as an explicit action. |
| `submitted` / `under_review` | `more_info_requested` | admin | Requires `reviewNote` (free text, required — mirrors the "customer-safe reason is required" pattern already used in `admin-verification.ts`). |
| `more_info_requested` | `under_review` | customer (`PATCH /v1/claims/{id}/respond`) | Customer supplies additional text and/or an updated incident description; moves back into the review queue. No count limit on how many times this round-trips — simplicity over abuse-proofing for v1, but each round-trip is audit-logged (§5 notes this as a flag-worthy pattern if abused). |
| `submitted` / `under_review` / `more_info_requested` | `approved` → auto → `awaiting_payout` | admin | Requires `approvedAmount` (number > 0, in the policy's billing currency) and is subject to §1.4's coverage-limit check. The `approved` state is written and then immediately re-written to `awaiting_payout` in the same request/transaction — both transitions share one audit entry pair so the trail shows both, matching the "first entry into terminal state" discipline `recovery-cases.ts` already uses for `closedAt`. |
| `submitted` / `under_review` / `more_info_requested` | `rejected` | admin | Requires `rejectionReason` (free text, required, customer-safe — same pattern as `more_info_requested`'s `reviewNote` and the existing `admin-verification.ts` precedent). |
| `submitted` / `under_review` / `more_info_requested` | `closed` | customer (withdraw, `PATCH /v1/claims/{id}/withdraw`) or admin (administrative close, requires a reason, same pattern) | |

**No transition ever moves backward out of a terminal state** (`awaiting_payout`, `rejected`,
`closed`) — mirrors `recovery-cases.ts`'s `RECOVERY_CASE_FORWARD_TRANSITIONS` precedent exactly.
A customer who disputes a `rejected` claim files a **new** claim (§1.5 permits this once the prior
claim is terminal); there is no "reopen" action. This keeps the audit trail honest: a rejection
decision is never silently erased, only superseded by a fresh claim that can reference the
rejected one (`supersedesClaimId`, optional field, customer-supplied, informational only — not
validated against anything, purely for the admin reviewer's context).

### 2.3 Who can trigger what
- **Customer:** create (`submitted`), respond to info request, withdraw. Nothing else — a
  customer cannot self-approve, self-reject, or move into `under_review`.
- **Admin:** every review/decision transition (`under_review`, `more_info_requested`, `approved`,
  `rejected`, administrative `closed`). No dedicated "claims reviewer" role is introduced in this
  spec — **any authenticated admin account may review and adjudicate any claim.** This mirrors
  the existing admin model (`admin-policies.ts`, `admin-assets.ts`, `admin-verification.ts` are
  all single-tier "any admin" today, no reviewer sub-role exists in the account/session system).
  If the business owner later wants a segregation-of-duties control (e.g. a second admin must
  countersign approvals above a threshold), that is a new, separate feature — flagged here, not
  built.
- **System:** the `approved` → `awaiting_payout` auto-transition only. No other system-triggered
  transition exists in this feature (no auto-expiry, no auto-close — simplicity for v1).

### 2.4 Why `approved` auto-advances to `awaiting_payout`
Modeling `approved` as a resting state would imply there is a separate "approve" action and then a
separate "release for payout" action — but there is no payout mechanism to release *to* yet.
Collapsing them avoids inventing a fake intermediate step with no real gate behind it. When
payment-gateway integration lands, that future feature is expected to introduce the actual
payout-trigger transition (e.g. `awaiting_payout` → `paid`), which is explicitly NOT part of this
spec's state machine.

### 2.5 No reopen transition
Already covered in §2.2 — called out again here because it's a common review question: there is
deliberately no `rejected`/`closed` → anything transition. This is a design choice, not an
oversight.

---

## 3. Claim data model

Mongo collection `claims`, polyglot-consistent with the existing domain-data collections
(`policies`, `assets`, `recovery_cases`) per ADR-0002.

```
ClaimDocument {
  id: string;                        // ObjectId hex
  accountId: string;                 // owner — every query scoped by this, same pattern as assets/policies
  policyId: string;                  // FK into policies, validated active at filing (§1.1)
  assetId: string;                   // FK into assets, validated active at filing (§1.2)
  recoveryCaseId: string | null;     // optional FK into recovery_cases (§1.6)
  supersedesClaimId: string | null;  // optional, informational only (§2.2)

  status: ClaimStatus;               // §2.1 enum

  // Snapshot fields — captured at filing time so later asset/policy edits or
  // removal cannot retroactively change what's under review (§1.7).
  assetTypeSnapshot: AssetType;
  assetDisplayNameSnapshot: string;
  policyPlanTierSnapshot: string;

  incidentDescription: string;       // free text, required, min length enforced (e.g. 20 chars)
  incidentDate: Date;                // customer-supplied, must be <= now and >= policy.effectiveDate
  evidenceDescription: string | null;// free-text-only evidence per MP-5 gap (§0) — NOT a file/photo field
  claimedAmount: number;             // customer-proposed, > 0, currency = policy.billing.currency
  claimedAmountCurrency: string;

  approvedAmount: number | null;     // admin-set, only non-null once status reaches approved/awaiting_payout
  rejectionReason: string | null;    // admin-set, required when status = rejected
  reviewNotes: ClaimReviewNote[];    // append-only log: { actorAccountId, text, createdAt } — mirrors recovery_cases' CallCentreNote pattern
  statusHistory: ClaimStatusChange[]; // append-only: { fromStatus, toStatus, actorAccountId, actorRole, reason: string | null, changedAt }

  submittedAt: Date;
  decidedAt: Date | null;            // set once, first entry into any terminal state — mirrors recovery_cases.closedAt discipline
  createdAt: Date;
  updatedAt: Date;
}
```

Notes:
- `evidenceDescription` is the deliberate MP-5 decision (§0): **claims launch without file/photo
  upload.** Customers describe supporting evidence in text (e.g. "have original receipt dated
  2024-03-01, serial number photo on my phone") until an object-storage vendor is chosen. This is
  a conscious, named gap — not a silent omission — and the mobile claim-detail screen must say so
  explicitly ("Photo/document upload isn't available yet — describe your evidence below") rather
  than presenting a disabled-looking upload button.
- `statusHistory` is required on every transition (append, never overwrite), independent of the
  free-text `reviewNotes` log, mirroring the existing split in `recovery_cases.ts` between
  `policeReportHistory` (structured, machine-checkable) and `callCentreNotes` (free text).
- `decidedAt` set-once-on-first-terminal-entry directly reuses the `closedAt` discipline already
  established and commented in `recovery-cases.ts`'s `updateStatusForPartnerOrg` — same rationale
  (a later terminal-to-terminal transition, if one ever existed, must not reset a retention/audit
  clock). Today there is no terminal→terminal transition in this state machine (§2.2), so this is
  forward-hardening, not a currently-exercised path.

---

## 4. Admin review requirements

### 4.1 Visibility
- Any admin can list/filter claims (`GET /v1/admin/claims` — filters: `status`, `accountId`,
  `policyId`). Any admin can view full claim detail (`GET /v1/admin/claims/{id}`), including
  linked policy/asset/recovery-case summaries (resolved server-side, not left to the client to
  stitch together from three separate calls).
- Admin detail view must show: full snapshot fields, `coverageLimits` match status for the
  claimed asset type (§1.4 — including the explicit "no limit configured" state), waiting-period
  check result, and whether `DUPLICATE_OPEN_CLAIM`/fraud flags (§5) fired at filing time.

### 4.2 Required reason/justification — mirrors existing pattern
Every negative or information-seeking admin action requires a non-empty, customer-safe text
field, exactly matching the precedent already set in `backend/src/routes/admin-verification.ts`
("A customer-safe reason is required."):
- `more_info_requested` → `reviewNote` required.
- `rejected` → `rejectionReason` required.
- administrative `closed` → `closeReason` required.
- `approved` has no reason field (approval is self-explanatory; `approvedAmount` is the record).

### 4.3 No dedicated reviewer role (restated from §2.3)
Any admin may adjudicate. Flagged as a follow-up candidate, not built here, if the business owner
wants segregation of duties later.

---

## 5. Fraud/abuse guardrails (light, deterministic — not a scoring system)

These are simple flags surfaced to the admin reviewer alongside the claim, not automatic
rejections. None of them block filing; all of them annotate the claim for the human reviewer.

1. **Filed suspiciously soon after policy activation or asset registration** — flagged
   (`FLAG_NEAR_WAITING_PERIOD_BOUNDARY`) if the claim is filed within 15 days of clearing the
   waiting-period gate in §1.3/§1.3a (i.e. right at the earliest legally-filable moment).
2. **Filed suspiciously soon after a policy status change** — flagged
   (`FLAG_RECENT_POLICY_REINSTATEMENT`) if the policy's `updatedAt` reflects a status change
   (e.g. reactivation from `past_due`/`suspended` back to `active`) within the prior 7 days of
   claim filing. (This requires a policy status-change timestamp the current schema doesn't
   explicitly separate from `updatedAt` — flagged to `database-architect` at Stage 2/4 as a
   possible need for a lightweight `statusHistory` on `PolicyDocument` itself, same shape as this
   feature's own `ClaimStatusChange`; until that exists, this flag uses `updatedAt` as an
   approximation and must be documented in code as such.)
3. ~~**Repeat-claim rate limiting per account** — reject new submissions with `CLAIM_RATE_LIMITED`
   if the same `accountId` has filed more than 3 claims (any status) in a rolling 30-day window.
   This is a hard block, not just a flag, since it's cheap, unambiguous abuse-pattern protection
   with no legitimate-customer cost in the ordinary case.~~ **VOID — superseded 2026-10-28, per
   `compliance-specialist`'s §8 note below.** The "no legitimate-customer cost" reasoning was
   wrong: one incident (e.g. a burglary) can produce several genuine per-asset claims the same
   day, and blocking the 4th at intake functions as an undisclosed rejection without the
   Policyholder Protection Rules safeguards (written reasons, decision notice, representation
   window, Ombud referral) a real rejection requires. **Corrected:** this is now rate *flagging*,
   not a block — if the same `accountId` has filed more than 3 claims (any status) in a rolling
   30-day window, the new claim is still accepted and recorded; it is flagged
   (`FLAG_RATE_THRESHOLD`) for priority admin review instead. A plain request-rate throttle
   against API abuse (not claim-count-based) remains fine and is unaffected.
4. **Claimed amount far exceeds any historical claim on the same asset type for this account** —
   flagged (`FLAG_AMOUNT_OUTLIER`) if `claimedAmount` is more than 3x the account's own average
   `claimedAmount` across its prior claims (only computed when the account has ≥ 2 prior claims;
   otherwise not evaluated — no baseline).

Flags are stored as `fraudFlags: string[]` on the claim document at filing time (computed once,
not re-evaluated), surfaced in the admin list/detail view, and never shown to the customer.

---

## 6. Explicitly out of scope (restated for traceability)

- Payment/payout execution (§0).
- Document/photo upload (§0, §3).
- AI-based or ML-based fraud scoring (§5 is deterministic rule checks only).
- A dedicated claims-reviewer admin sub-role (§2.3, §4.3).
- Populating actual `coverageLimits` values per asset type (D-03/D-08, separate open items).
- Any change to `recovery_cases` theft-reporting fields or flow — this feature only reads/
  references `recoveryCaseId`, never writes to that collection.

---

## 7. Acceptance criteria (Given/When/Then — selected, highest-risk paths)

**AC-1 — Policy status gate**
Given a policy with `status: 'cancelled'`
When a customer submits `POST /v1/claims` referencing that policy
Then the API returns `422 POLICY_NOT_ACTIVE` and no claim document is created.

**AC-2 — Waiting period, policy path**
Given a policy with `effectiveDate` 10 days ago and `CLAIM_WAITING_PERIOD_DAYS = 30`
When a customer submits a claim referencing an asset registered before the policy's
`effectiveDate`
Then the API returns `422 WAITING_PERIOD_NOT_MET` with the date the window clears.

**AC-3 — Waiting period, asset-added-later path**
Given a policy active for 60 days, and an asset registered 5 days ago under that policy
When a customer submits a claim for that asset
Then the API returns `422 WAITING_PERIOD_NOT_MET`, computed from the asset's `registeredAt`, not
the policy's `effectiveDate`.

**AC-4 — Duplicate open claim**
Given asset X has a claim in `under_review`
When a customer submits a second claim for asset X
Then the API returns `409 DUPLICATE_OPEN_CLAIM` with the existing claim's id, and no new claim
document is created.

**AC-5 — New claim after prior terminal claim**
Given asset X has a claim in `rejected`
When a customer submits a second claim for asset X
Then the claim is created successfully in `submitted`, optionally carrying
`supersedesClaimId` pointing at the rejected claim.

**AC-6 — Coverage-limit enforcement when configured**
Given a policy with `coverageLimits: [{ assetType: 'laptop', amount: 5000, currency: 'ZAR' }]`
and a claim on a laptop asset
When an admin attempts to set `approvedAmount: 6000`
Then the API returns `422 APPROVED_AMOUNT_EXCEEDS_COVERAGE_LIMIT` and the claim remains in its
pre-approval status.

**AC-7 — Coverage-limit absent (today's default)**
Given a policy with `coverageLimits: []` (the default for every policy today)
When an admin sets `approvedAmount: 50000` on a claim for any asset type on that policy
Then the approval succeeds, and the admin detail view displayed "No coverage limit configured"
before the admin acted.

**AC-8 — Rejection requires reason**
Given a claim in `under_review`
When an admin attempts to PATCH status to `rejected` with no `rejectionReason` or an empty string
Then the API returns `400 VALIDATION_ERROR` ("A customer-safe reason is required.") and the claim
status is unchanged.

**AC-9 — Approval auto-advances**
Given a claim in `under_review`
When an admin approves with `approvedAmount: 1200`
Then the claim's persisted status is `awaiting_payout` (not left resting at `approved`), with a
`statusHistory` containing both the `under_review → approved` and `approved → awaiting_payout`
entries, and no payout-related side effect (no call to any payment integration) occurs.

**AC-10 — Terminal states cannot be reopened**
Given a claim in `awaiting_payout`, `rejected`, or `closed`
When any actor attempts any further status-changing request against that claim id
Then the API returns `409` (status-transition conflict) and the claim is unchanged.

**AC-11 — Rate limiting**
~~Given an account with 3 claims already filed within the last 30 days
When that account submits a 4th claim within the same window
Then the API returns `429 CLAIM_RATE_LIMITED` (or `422`, per the project's existing error-code
convention for rate limits — to be confirmed against `backend-architect`'s existing precedent at
Stage 2) and no claim is created.~~ **VOID — superseded 2026-10-28, per §5 item 3's correction
above.** Corrected:
Given an account with 3 claims already filed within the last 30 days
When that account submits a 4th claim within the same window
Then the API accepts and creates the claim normally (`201`, `submitted` status) with
`fraudFlags` including `FLAG_RATE_THRESHOLD` — no claim is ever refused by this check. The HTTP
status-code question this AC previously raised is moot; there is no rejection response to design.

**AC-12 — Customer cannot self-adjudicate**
Given a claim in `submitted`, owned by customer account A
When account A calls any admin-only PATCH route for that claim (approve/reject/more-info/admin
close)
Then the API returns `403` (route is admin-session-gated, same as every other `/v1/admin/*`
route) — this must be enforced by route-level auth middleware, not by a body-field check.

---

## 8. Open items for Stage 2+ (flagged, not resolved here)

- `database-architect`: confirm `claims` as a new top-level Mongo collection vs. an embedded
  sub-array — recommend top-level collection given independent lifecycle and admin-queue query
  patterns (list/filter by status across accounts), same reasoning that put `recovery_cases` and
  `policies` in their own collections rather than embedding.
- ~~`backend-architect`: confirm HTTP status code convention for `CLAIM_RATE_LIMITED` against
  existing project precedent (AC-11).~~ **VOID — moot as of 2026-10-28**: AC-11 no longer
  refuses a claim, per the correction at §5 item 3 / AC-11 above, so there is no rejection
  response whose status code needs confirming.
- `database-architect`: evaluate adding a lightweight `statusHistory` to `PolicyDocument` to make
  §5 flag 2 exact rather than an `updatedAt` approximation.
- `compliance-specialist`: review §1.3's 30-day waiting-period constant and §5's rate-limit
  threshold (3 claims / 30 days) before Stage 2 exit — these are business-analyst placeholders
  pending regulatory/product confirmation, not final numbers.
- `payment-engineer` (consulted): confirm nothing about the `awaiting_payout` terminal state
  creates rework when payout wiring eventually lands.
- **`compliance-specialist` note (2026-10-28, quick check, not a full Stage 8 review):** Neither
  number conflicts with anything already decided. Feature 004 BR §5 D-04 left "waiting periods"
  open and §11 discharged only the per-tier asset-count part, so this spec is the first place any
  waiting period is defined. As far as I know, South African short-term insurance law sets no
  minimum or maximum waiting period; it is a contract term. Two conditions follow from that.
  (1) **The waiting period (§1.3/§1.3a) is only enforceable if it is disclosed.** It must appear in
  the policy wording and the pre-contract disclosure that customers see before they buy. Per
  Feature 002 BR §12.2 it also may not be stated on marketing pages unless the full policy wording
  is linked. The 30-day figure itself is fine. (2) **The rate limit (§5 item 3) should not be a hard
  block on lodging a claim.** First, the "no legitimate-customer cost" rationale does not hold for
  a multi-asset account: one burglary can produce 4 or more genuine per-asset claims on the same
  day, and the 4th would be refused at intake. Second, refusing a claim at intake works like a
  rejection without the safeguards that the Policyholder Protection Rules (Short-term) attach to a
  rejection, and it sits poorly with TCF Outcome 6, which forbids unreasonable post-sale barriers
  to submitting a claim. Those safeguards are written reasons, notice of the decision, the 90-day
  window for representations, and Ombud referral details. **Recommendation:** accept and record
  the claim, then raise a `FLAG_RATE_THRESHOLD` fraud flag for priority admin review instead of
  returning `CLAIM_RATE_LIMITED`. A plain request-rate throttle against API abuse is still fine.
  The same reasoning applies to `WAITING_PERIOD_NOT_MET`. Because it is a disclosed contract term,
  blocking it at intake is acceptable, provided the customer gets the written reason and the date
  the window clears (as AC-2 already requires). Both points need confirmation from the insurer's
  legal/compliance function before Stage 8, because the licence position is still unconfirmed
  (Feature 013 compliance review §2) and the current PPR rule numbering and wording were not
  re-verified for this quick check.
