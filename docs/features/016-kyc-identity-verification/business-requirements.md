# Feature 016 — Customer KYC (Identity Verification) for Real Policy Issuance

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst`
**Contributors required before Stage 2:** `compliance-specialist` (blocking — see §6), `integration-architect`
(blocking on §3 vendor question), `product-manager` (gating rule sign-off, §4), `payment-engineer`
(interaction with billing, §4.3), `backend-engineer`, `database-architect`
**Status:** Draft — owner directive (2026-09-21): real KYC is required before the platform issues
real policies, citing FICA and general SA insurance-industry practice. `mobile-kyc` is currently
feature-flagged off (`EXPO_PUBLIC_FEATURE_KYC=false` in `mobile/eas.json`) with scaffolded UI only.
**Related work — read before treating anything below as new:** `docs/features/013-sa-id-verification/business-requirements.md`
(SA ID checksum validation + duplicate-detection scoping, Tier 1 committed / Tier 2 blocked / Tier 3
explicitly deferred to this exact vendor question) and Feature 009 Phase 2 (existing
collection/review surface this feature extends, not replaces).

---

## 0. What this document is and is not

This is the **gating and completeness** spec for KYC as a precondition of real policy issuance —
it answers "what must a verified customer have provided, and what does verification block."
Feature 013 already owns the **algorithmic validity** of the SA ID number itself (checksum, DOB
consistency) and has already scoped, but not committed, duplicate-detection (its Tier 2) and
third-party/vendor "is this a real living person" verification (its Tier 3). This document does
**not** re-litigate those — it treats Feature 013 Tier 1 as a prerequisite input this feature
consumes, and treats the Tier 3 vendor question as the same open decision, cross-referenced rather
than re-opened.

What this document adds that Feature 013 does not cover:
1. The **full data set** required for KYC completeness (not just the ID number).
2. The **verification method** for the non-ID-number parts (proof of address, document authenticity).
3. The **gating rule** — what a customer can and cannot do before/after verification.
4. A gap assessment of `admin-verification.ts` / `customer-profile.ts` against what full KYC needs.

---

## 1. What identity data must be collected

### 1.1 Already collected today (verified in code)

`backend/src/lib/customer-profile-validation.ts` / `customer-profile.ts` (`PATCH /v1/customer/profile`)
today accepts and the `customer_profiles` Mongo collection stores:

- `firstName`, `middleName` (optional), `lastName`
- `dateOfBirth`
- `idNumber` — 13-digit SA ID, shape-validated only until Feature 013 Tier 1 ships; **only the last
  4 digits (`idNumberLast4`) are persisted**, the full number is never stored in reversible form
- `phone`
- `residentialAddress` (structured object, `country` defaults to `ZA`)
- `emergencyContact`
- profile picture (`PUT /v1/account/profile/picture`, JPEG/PNG/WebP, 512KB cap) — currently a
  vanity/profile field, not wired to any verification logic

There is **no field or endpoint today for uploading a photo of the ID document itself, a selfie for
liveness/face-match, or a proof-of-address document** (utility bill, bank statement, etc.) — profile
picture upload exists but is architecturally and behaviorally unrelated (no verification linkage,
no document-type tagging, no review-queue surfacing).

### 1.2 What FICA / SA insurance practice plausibly requires — confidence-graded

I am not a compliance authority and FICA's Schedules (particularly Schedule 1, "single easy
verification" categories, and FSCA-issued guidance for short-term/long-term insurers) are detailed
and amended periodically. The items below are graded by confidence so `compliance-specialist` knows
exactly where to focus, rather than this document silently asserting legal fact:

| Requirement | Confidence | Basis |
|---|---|---|
| Full name, date of birth, SA ID number (or passport number + nationality for non-citizens) | **High** — standard across FICA-regulated financial institutions, not insurance-specific | General FICA CDD (customer due diligence) knowledge |
| Residential address, verified independently of self-attestation (e.g. a supporting document) | **High** — FICA has historically required proof of residential address as a distinct CDD element, though the "single easy verification" simplification (residence in RSA + income below a threshold) has relaxed strict documentary proof in some categories | General FICA knowledge — **exact current threshold/category rules need compliance-specialist confirmation**, they've changed via amendment |
| A source-of-funds / source-of-income question for premium payment | **Medium** — more typically associated with higher-value transactions/AML risk-rating than a standard monthly retail insurance premium, but FICA risk-rating in principle applies to any accountable-institution relationship | **Not asserted as required — flagged as a compliance-specialist question, not assumed** |
| Whether TD IT Solution Insurance is itself an "accountable institution" under FICA Schedule 1, or whether that obligation sits with an underwriting insurer/reinsurer partner it operates under | **Low / unknown** — this depends on the platform's actual regulatory and underwriting structure (is it selling policies directly, or acting as an intermediary/broker for a licensed insurer?), which is not established anywhere in this repo | **This is the single most important open question — flagged as blocking in §6.** If TD IT Solution Insurance is an intermediary rather than the accountable institution itself, FICA CDD obligations may sit contractually with the underwriter, changing what this platform is legally required to collect versus what it collects for its own risk/fraud purposes |
| Document authenticity check on the ID itself (not just the number's checksum) | **High confidence this is industry-standard practice, not a hard legal mandate for the checksum alone** — see Feature 013 §2.3, this is the "Tier 3" vendor question | Cross-referenced, not re-derived here |
| POPIA special-personal-information handling for the ID number and any document images | **High** — POPIA (not FICA) governs this directly, and this platform already treats it carefully (Feature 013 §1's race-digit exclusion, `idNumberLast4`-only storage) | Established platform posture, extend the same discipline to document images |

**FR-1.** The data set this feature specifies for collection is: full name (existing), date of
birth (existing), SA ID number or passport number + nationality (existing, ID-number path only —
passport path is a new field, see §5 non-goals), residential address (existing field, currently
unverified), and — **pending `compliance-specialist` confirmation of §1.2's open questions** — a
proof-of-address document and a photo/scan of the ID document. This document does **not** commit
proof-of-address or ID-document-photo as required fields until compliance confirms they're needed
under the platform's actual regulatory posture (accountable-institution status, above) rather than
assumed by analogy to generic FICA guidance.

---

## 2. Verification method

### 2.1 Options — not decided here

| Method | What it is | Where it sits today |
|---|---|---|
| **Self-attestation** | Customer types in name/DOB/ID number/address; platform trusts the input beyond format/checksum validation | **This is what exists today** — `PATCH /v1/customer/profile` + manual admin review of the typed values, no document evidence at all |
| **Document upload + manual admin review** | Customer photographs/scans an ID document (and optionally a proof-of-address document); an admin visually reviews it via the existing `pending_review` queue | **Partially buildable today** — `admin-verification.ts`'s review workflow (queue, decision states, customer-safe rejection reason) already exists and generalizes to "review an uploaded document" with no state-machine change; the **upload/storage mechanism does not exist** (no object-storage vendor selected — MP-5, per root `CLAUDE.md` "Not built" list) |
| **Third-party identity-verification API** (e.g. Smile ID, Youverify, or a DHA-integrated SA-specific vendor) — document OCR + liveness/selfie face-match + optionally a real-time Home Affairs lookup | Automates what a human reviewer would otherwise do, with materially higher confidence against synthetic/fabricated documents | **Not built, not selected** — this is exactly Feature 013 §2.3's Tier 3 question, owned by `integration-architect` for build-vs-buy, with `compliance-specialist` concurrence on data-residency/POPIA implications of a third party processing special personal information |

**This document does not recommend one of these three as final.** It recommends a **staged
default**, consistent with this platform's existing "degrade honestly, don't fake a capability"
posture (the same posture used for GPS/tracking-provider abstraction per ADR-0009):

- **FR-2.** Ship document upload + manual admin review as the near-term default (requires an
  object-storage decision — flagged to `cloud-infrastructure-architect`/`integration-architect`,
  not decided here, and explicitly blocked on that vendor choice per MP-5's existing open status).
  This reuses `admin-verification.ts`'s existing review state machine rather than building a new
  one.
- **FR-3.** Treat third-party automated verification as a **future upgrade path**, not a Stage-2
  commitment — `integration-architect` should evaluate it against real verification volume once the
  platform has enough KYC throughput that manual review becomes a bottleneck, per the same
  pre-launch/low-scale posture Feature 013 §5 already applies to its own Tier 3 question.
- **FR-4.** Self-attestation of the ID **number** remains layered underneath both of the above —
  Feature 013 Tier 1's checksum/DOB-consistency validation still runs regardless of which document
  method is chosen; it is a cheap, zero-vendor first filter, not a replacement for document
  evidence.

### 2.2 What is explicitly not decided by this document

Whether the platform requires a physical/scanned ID document, a proof-of-address document, both, or
neither beyond the existing typed fields is a direct function of §1.2's unresolved
accountable-institution question. **This document declines to assert a specific document
requirement list as final** — see §6.

---

## 3. What blocks on KYC completion — the gating rule

### 3.1 Current state (verified in code)

**There is no gating today.** Grepping `backend/src/routes` for verification-status gating on
policy/asset creation returns nothing outside `customer-profile.ts` and `admin-verification.ts`
themselves — `verificationStatus` is tracked and displayed but **does not block** registering an
asset, viewing a policy, or (per the "Not built" list) making a payment, because payments don't
exist yet either. `verification.tsx` and `profile.tsx` are themselves gated off entirely by
`FEATURE_KYC_ENABLED=false` in production/preview builds — so today, in a real build, a customer
cannot even reach the verification screens; they default straight to full, ungated product use.

### 3.2 Proposed gating rule — recommendation, pending product-manager/compliance sign-off

Given the owner's framing ("required before real policy issuance"), and consistent with how this
platform already treats `maxAssets` as a hard, data-driven gate (`ASSET_LIMIT_REACHED`, per
`pricing-model-v2.md`), this document recommends a **staged gate**, not a single all-or-nothing
block, because a single hard gate at signup would block even low-risk actions (browsing plans,
reading coverage docs) that carry no insurance liability:

| Action | Gated on KYC? | Rationale |
|---|---|---|
| Create account, browse plan tiers, view marketing/coverage content | **No** | No liability or coverage exists yet |
| Complete profile fields (name/DOB/ID/address) | **No** — this *is* part of how KYC gets completed, can't be gated on itself | — |
| Subscribe to a plan / enter a billing relationship | **Open question, flagged to `product-manager`/`payment-engineer`** — see §4.3 | Billing exists independent of asset coverage in principle, but the owner's framing is "before real policy issuance," which could mean at subscription or at first covered asset |
| **Register a covered asset (vehicle, laptop, phone, etc.)** | **Yes — recommended hard gate** | This is the moment a real insurable interest and coverage obligation attaches; matches the owner's literal framing ("before we issue policies") most directly |
| **File a claim** | **Yes — hard gate, independent of the asset-registration gate** | Even if asset registration were ever allowed unverified (it is not, under this recommendation), claims must never pay out against an unverified identity |
| View own registered assets/policy after having registered them pre-gate (migration case) | **Not blocked retroactively** — see §5 edge case EC-4 | Consistent with Feature 013 AC-9's precedent: new rules apply to new writes, not retroactive lockout, unless a product decision explicitly reverses this |

**FR-5.** `verificationStatus` must reach `verified` (not `pending_review`, not `action_required`,
not `not_started`/`in_progress`) before `POST /v1/customer/assets` (or its Feature-004-successor
route family) succeeds. A customer attempting to register an asset while unverified receives a
distinct, actionable error (not a generic 403) — recommend a new error code, e.g.
`KYC_VERIFICATION_REQUIRED`, following the existing `apiError()` taxonomy pattern already used
across this backend.

**FR-6.** The same gate applies to claims filing once a claims backend exists (Feature per
`CLAUDE.md`'s "Not built" list) — this document pre-specifies the rule now so `backend-engineer`
doesn't have to re-derive it when that feature starts, but does not create the claims route itself.

### 4.3 Open question — does the gate apply at subscription/billing time too

The owner's phrase "before we issue policies" is ambiguous between "before you can pay for a plan"
and "before a specific asset becomes covered." This document recommends the **asset-registration**
gate (FR-5) as the safer literal reading (a "policy" in this platform's data model is a
subscription-tier container; actual insurable exposure attaches per-asset), but flags this
explicitly for `product-manager` sign-off rather than asserting it, since it has direct revenue and
conversion-funnel implications `payment-engineer` and `product-manager` are better positioned to
weigh than this role.

---

## 4. Gap assessment — `admin-verification.ts` / `customer-profile.ts` vs. what full KYC needs

### 4.1 Already supports (verified in code, §ref to file read above)

- Full CRUD-style profile field collection and update (`customer-profile.ts`).
- A first-class `verificationStatus` enum: `not_started` / `in_progress` / `pending_review` /
  `verified` / `rejected` / `action_required`.
- Customer-initiated submission (`POST /account/profile/verification/submit`), which fails closed
  with `PROFILE_INCOMPLETE` if required fields are missing (exact required-field list not read in
  full here — `backend-engineer` should confirm against §1's FR-1 data set at Stage 2).
- A paginated admin review queue (`GET /admin/verification-requests`, plus a `count` endpoint) with
  masked ID display (`idNumberMasked: "********1234"`) — no raw ID number ever surfaces to an admin.
- A full account/profile detail view for a specific pending case (`GET /admin/accounts/:id/profile`).
- A review-decision endpoint (`PATCH /admin/accounts/:id/profile/verification`) supporting
  `verified` / `rejected` / `action_required`, with a **mandatory, customer-safe rejection reason**
  enforced server-side on the two non-approval decisions — this is good practice already in place,
  not something this feature needs to add.
- Audit logging on every privileged read/write in this flow (`ctx.auditLog.record` /
  `recordBulkDisclosure`), including the fail-closed empty-array-on-zero-results discipline
  documented inline (§ comments citing `security-review.md` §10.6/AUD-10).
- Alert sync on status change (`syncAccountAlerts`) — so a customer is notified when their status
  changes, assuming the notification layer (Feature 007) delivers it.

### 4.2 Missing — required for this feature's full scope, not present today

- **No document/photo upload endpoint or storage** for an ID document or proof-of-address (§2.1) —
  blocked on the same object-storage vendor gap as MP-5.
- **No gating enforcement anywhere** — `verificationStatus` is tracked but not read by any
  asset/policy-creation route (§3.1, FR-5/FR-6 not yet implemented).
- **No `KYC_VERIFICATION_REQUIRED`-equivalent error code** in the current `apiError()` taxonomy.
- **No linkage between the profile-picture upload path and verification** — architecturally
  separate today, should stay separate (a vanity photo is not proof-of-identity) unless a future
  liveness/selfie-match vendor is chosen, at which point it would need its own dedicated
  endpoint/field, not reuse of the profile-picture path.
- **No Stage 8 security review on record** for the existing collection/review surface — carried
  forward from Feature 013 §5, not created by this document, but this feature's Stage 8 will need to
  cover both the pre-existing gap and any new document-upload surface in one pass.
- **No re-verification / expiry policy** — e.g. whether a `verified` status ever needs re-confirmation
  (address changes, ID document expiry) is unaddressed by the current state machine and not
  committed here — flagged as a non-goal in §5, open for a future feature if the owner wants it.

---

## 5. Non-goals / edge cases

- **EC-1 — lapsed payment after verification.** KYC status and billing status are independent state
  machines; a `verified` customer whose payment lapses does not lose `verified` status, only
  whatever billing-driven access controls apply separately (out of scope here, see plan-tier docs).
- **EC-2 — customer resubmits after `rejected`.** Not specified here whether resubmission creates a
  new `pending_review` cycle or requires admin un-blocking first — `admin-verification.ts`'s current
  `reviewVerification` throws `INVALID_VERIFICATION_STATE` if not `pending_review`, meaning the
  resubmission path's state transition needs explicit design at Stage 2, not assumed.
- **EC-3 — passport-holder / non-SA-citizen customers.** Feature 013 explicitly scopes SA-ID-only;
  this document inherits that same non-goal — passport-based KYC is out of scope for this feature
  too, flagged as a gap the owner should be aware of if the platform intends to serve non-SA-ID
  holders at all.
- **EC-4 — assets registered before this gate ships.** Not retroactively locked — matches Feature
  013 AC-9's precedent. If the owner wants existing unverified customers with existing assets
  prompted/required to verify retroactively, that is a separate product decision (a "grace period"
  or "verify by date X" campaign), not assumed as part of this feature's committed scope.
- **EC-5 — duplicate/fake-identity detection.** Explicitly out of scope here — owned by Feature 013
  Tiers 2/3, cross-referenced not duplicated.
- **Not in scope:** gender/race inference (inherits Feature 013 §1/§3's exclusion), any specific
  document-retention-period policy (a `compliance-specialist`/legal question, not asserted here),
  and any claims-backend implementation (claims route doesn't exist — FR-6 only pre-specifies the
  rule for whenever it does).

---

## 6. Acceptance criteria

1. **AC-1.** A customer with `verificationStatus` other than `verified` receives
   `KYC_VERIFICATION_REQUIRED` (or equivalent, exact code TBD at Stage 2) on any asset-creation
   request, and no asset record is created.
2. **AC-2.** A customer with `verificationStatus: verified` can create assets exactly as today (no
   regression to Feature 004 asset-creation behavior for already-verified accounts).
3. **AC-3.** Profile field collection, browsing plan tiers, and viewing marketing/coverage content
   remain fully accessible regardless of `verificationStatus` — the gate applies only where §3.2's
   table marks "Yes."
4. **AC-4.** Submitting a verification request with an incomplete required-field set (per whatever
   field list Stage 2 finalizes from §1's FR-1) is rejected with `PROFILE_INCOMPLETE`, unchanged
   from current behavior — this feature does not weaken that existing check.
5. **AC-5.** An admin rejection or action-required decision always carries a non-empty,
   customer-safe reason string — unchanged from current `admin-verification.ts` behavior, re-stated
   here as a regression guard since this feature's Stage 8 review will touch this file.
6. **AC-6.** No raw/full ID number or uploaded document content is exposed in any admin list view,
   API response, log line, or audit record beyond what's already masked today (`idNumberMasked`) —
   extends the same discipline to any new document-image field this feature introduces.
7. **AC-7.** Existing assets/policies registered before this feature's gate ships are not
   retroactively blocked or hidden from an unverified customer (EC-4) — this is a negative test:
   confirm `GET /v1/customer/assets` for a pre-existing unverified account still returns existing
   records after the gate ships.
8. **AC-8.** (Conditional on §2.1's document-upload path being chosen at Stage 2) An uploaded
   ID/proof-of-address document is stored only via whatever object-storage vendor is selected
   (MP-5), never inline in the Mongo `customer_profiles` document, and is retrievable only by the
   owning customer and admin reviewers via authenticated, audited endpoints — mirroring the existing
   profile-picture access-control pattern (`GET /account/profile/picture`) but with admin access
   added and audit-logged the same way `admin-verification.ts`'s other privileged reads already are.

---

## 7. Flags for review before Stage 2 — summary

- **`compliance-specialist` — blocking.** (a) Confirm whether TD IT Solution Insurance is itself a
  FICA accountable institution or whether that obligation sits with an underwriting partner (§1.2 —
  the single most consequential open question in this document, changes the required data set).
  (b) Confirm the actual current required-document list under FICA's applicable CDD category for
  this business model. (c) Rule on document-retention period. (d) Confirm §3.2's gating point
  (asset-registration, not signup/billing) is compliant, not just product-reasonable.
- **`integration-architect` — blocking on §2's vendor path and on MP-5 (object storage), both
  already-open decisions this document does not resolve, only depends on.**
- **`product-manager` — sign-off required** on §3.2's gating table and §4.3's
  subscription-vs-asset-registration ambiguity.
- **`payment-engineer` — consulted** on §4.3's billing-relationship interaction.
- **`database-architect` — light today, blocking once §2's document-upload path and §1.2's document
  list are confirmed** — new fields/collections for document metadata, storage references, and
  review linkage.
- **`backend-engineer`** — confirm the exact required-field list `submitVerification`'s
  `PROFILE_INCOMPLETE` check already enforces, against this document's §1 FR-1, before Stage 2
  treats them as equivalent.
- **Carry-forward: INC-001 A-12 / F009-1 and Feature 013's Tier 2/3 flags** — this feature does not
  resolve either, only builds on top of the same open ground.

---

**Next lifecycle step:** blocked on `compliance-specialist` §1.2/§7(a) before Stage 2 can finalize
the required-data-set and gating point with any regulatory confidence. The gating mechanism itself
(§3.2 FR-5/FR-6) and the gap assessment (§4) are independently useful to `product-manager` and
`backend-engineer` today regardless of that ruling, since they describe what exists versus what a
gate requires structurally, not what data-set compliance ultimately requires.
