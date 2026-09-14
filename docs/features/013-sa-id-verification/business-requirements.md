# Feature 013 — South African ID Number Verification (Checksum + Duplicate Detection)

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst`
**Contributors:** `compliance-specialist` (required before Stage 2 — see §6), `integration-architect`
(required before Stage 2 scopes the vendor question — see §6), `database-architect`,
`backend-engineer`
**Status:** Draft — new platform-owner request (2026-09-14): *"a way to verify users with their
South African ID number, to verify if it's a legit ID number... valid to that specific user...
so that we don't get any duplicate users or any fake users on the site."*
**Related system areas (RACI):** Feature 009 Phase 2 KYC/identity-verification surface (Backend
`backend/src/routes/customer-profile.ts` + `admin-verification.ts`, Mobile
`app/(app)/(tabs)/account/verification.tsx`, `profile.tsx`) — this feature **extends** that
existing surface, it does not create a new one.

---

## 0. Framing the ask — and what this document does NOT re-propose

The platform owner's request bundles three genuinely different capabilities under one sentence.
This document does not treat them as one problem. Before scoping any of them, it was necessary to
establish what already exists, because this platform already ships a KYC/identity-verification
surface (Feature 009 Phase 2) — re-proposing it would be a real failure of this role's discipline.

### 0.1 What already exists (verified in code, not assumed)

- **Collection.** `PATCH /v1/customer/profile` accepts an `idNumber` field
  (`backend/src/lib/customer-profile-validation.ts`), currently validated by Zod as
  `/^[0-9]{13}$/` only — **a shape check, not a legitimacy check.** Any 13-digit string passes,
  including `0000000000000` or a keyboard-mashed sequence.
- **Storage.** `backend/src/db/customer-profile-collections.ts` and
  `backend/src/repositories/customer-profiles.ts` persist only `idNumberLast4` (the JSON-schema
  validator has no field for a full number at all). The full 13-digit number the customer submits
  is truncated to its last 4 digits before it reaches the domain database and is never stored in
  reversible form anywhere in this codebase. This is a real design constraint the rest of this
  document has to work within (see §2.2).
- **Review workflow.** `backend/src/routes/admin-verification.ts` already implements a full
  manual admin review loop: `GET /admin/verification-requests` (paginated queue) and
  `GET /admin/verification-requests/count` (Feature 012), `GET /admin/accounts/:id/profile`
  (detail, masked ID `********1234`), `PATCH /admin/accounts/:id/profile/verification` (decision:
  `verified` / `rejected` / `action_required`, with a mandatory customer-safe reason on
  rejection). `verificationStatus` is a first-class enum (`not_started` / `in_progress` /
  `pending_review` / `verified` / `rejected` / `action_required`) with a matching UI
  (`src/admin/pages/AdminVerificationPages.tsx`, `mobile/app/(app)/(tabs)/account/verification.tsx`).
- **Feature flag.** `FEATURE_KYC_ENABLED` (`mobile/src/config/features.ts`) gates the KYC profile
  edit / identity-verification mobile screens. Its own comment records an open item this document
  does not resolve: *"INC-001 A-12 / F009-1: KYC profile edit and identity verification collect SA
  ID number, address, and emergency contact — no Stage 8 record."* This feature inherits that
  flag rather than introducing a new one, and inherits the open INC-001 A-12 item — flagged again
  in §6, not silently absorbed.
- **Existing docs.** No prior `docs/features/*/business-requirements.md` addresses SA ID
  algorithmic validation or duplicate detection specifically. Feature 006's onboarding
  requirements explicitly scope identity fields as **out of scope for Phase 1** ("First/last name
  are collected for personalization copy only... not identity verification, not KYC"), and Feature
  009 built the collection/review *workflow* described above without building legitimacy
  validation of the number itself. This is a genuine, previously unaddressed gap — not a
  duplicate of prior work.

**What this means for scope:** the manual-review workflow (human looks at submitted data, admin
approves/rejects) already exists and is not being rebuilt. This feature adds **machine-checkable
signal an admin reviewer sees before deciding**, and, separately, an **automated block on
mathematically invalid or exact-duplicate ID numbers** — it does not replace the human review
step, and it does not add a new vendor integration by default (see §2.3).

### 0.2 The three distinct things bundled in the owner's request

| Owner's phrase | What it actually is | Buildable today? |
|---|---|---|
| "verify if it's a legit ID number" | Algorithmic **checksum validation** of the 13-digit number (a Luhn-style check digit, plus a structurally-embedded date-of-birth and citizenship digit) | **Yes — zero external dependency (§2.1)** |
| "valid to that specific user" | Two separate consistency checks: (a) does the number's embedded date-of-birth match the profile's own `dateOfBirth` field, (b) is this exact number already registered to a *different* account | (a) **Yes** once checksum decoding exists (§2.1); (b) **Blocked on a storage-approach decision — not decided here (§2.2)** |
| "no duplicate users or fake users" | Conflates two different failure modes: a **duplicate account** (same real person, two accounts — a uniqueness problem) vs. a **fake/synthetic ID number** (a number that is not any real living person's, even if checksum-valid) | Duplicate detection: **blocked on §2.2.** Fake-person detection: **blocked on a vendor decision, not buildable from data already in this repo (§2.3)** |

---

## 1. Domain background — the SA ID number checksum (for spec precision only, not a tutorial)

A South African ID number is 13 digits: `YYMMDD SSSS C A Z`.

- `YYMMDD` — date of birth.
- `SSSS` — sequence number; digit 7 (first of the four) is conventionally `0-4` for female, `5-9`
  for male (historically; not treated as authoritative gender data by this platform — flagged in
  §5 as a non-goal).
- `C` (digit 11) — citizenship: `0` SA citizen, `1` permanent resident.
- `A` (digit 12) — historically a race-classification digit under apartheid-era legislation, long
  since defaulted to `8` on all numbers issued post-1994 and not meaningful data. **This platform
  must not read, store, display, or infer anything from this digit** — flagged explicitly for
  `compliance-specialist` in §6 as a POPIA special-personal-information avoidance point, not left
  implicit.
- `Z` (digit 13) — the **check digit**, computed via a Luhn-style algorithm over the preceding 12
  digits.

Checksum validity and date-of-birth extraction are **pure arithmetic over the 13 digits already
being collected today** — no new field, no new input, no network call, no vendor. This is what
makes §2.1 buildable now while §2.2/§2.3 are not.

---

## 2. Scope

### 2.1 Tier 1 — Algorithmic checksum validation (buildable now, no vendor, this feature's committed scope)

Replace the current regex-only `idNumber` check with a validator that:

- **FR-1.** Confirms the string is exactly 13 digits (retains current behavior).
- **FR-2.** Computes the Luhn-style check digit over digits 1–12 and confirms it equals digit 13.
  A number that is the correct length but fails the checksum is **rejected at submission**, not
  merely flagged for a reviewer later — this is the one part of "legit ID number" that requires no
  judgment call and no reviewer.
- **FR-3.** Decodes digits 1–6 as a calendar date (`YYMMDD`) and confirms it resolves to a real
  calendar date (rejects e.g. `991332`). Century disambiguation (19xx vs 20xx) is inherently
  ambiguous from the number alone — this feature does **not** attempt to guess it silently; see
  FR-5 for how it's used instead.
- **FR-4.** Decodes digit 11 (citizenship) as `0` (citizen) or `1` (permanent resident) only. Any
  other value fails validation (there is no third defined value).
- **FR-5 — date-of-birth consistency check.** If the profile has (or the same submission also
  includes) a `dateOfBirth`, compares its month and day against the ID number's decoded `MMDD`,
  and its year against the decoded `YY` under **both** plausible centuries (19xx and 20xx),
  accepting if either century matches. A mismatch on both is a validation failure returned to the
  caller (not silently accepted, not silently auto-corrected). If no `dateOfBirth` is present
  anywhere in the submission, this check is skipped (cannot fail a check with no data to check
  against) — not treated as a pass.
- **FR-6.** Digit 12 (the historical race-classification digit, §1) is read by the checksum
  algorithm internally (it is part of the 12 digits the check digit is computed over) but **is
  never extracted, stored, logged, or exposed** in any API response, admin UI field, or audit
  record. This is a hard constraint on implementation, not a nice-to-have.
- **Where this runs.** Server-side, in `updateCustomerProfileBodySchema`
  (`backend/src/lib/customer-profile-validation.ts`) or an equivalent shared validator function it
  calls — this is a Zod-schema-level or pre-persistence check, returned as the existing
  `VALIDATION_ERROR` shape the API already uses, so no new error taxonomy is needed. Exact
  function boundary and error-code naming is a Stage 6/7 `backend-engineer`/`api-design` call, not
  decided here.
- **Client-side mirror.** Mobile's profile/verification screens should run the same check-digit
  logic client-side for immediate inline feedback (UX only — the server-side check in FR-2 remains
  the authoritative, non-bypassable gate). This is a Stage 4 UI design item, not committed detail
  here.

**Tier 1 is entirely self-contained, requires no new data collection, no new storage field beyond
what §2.2 may separately require, and no vendor decision. It is this feature's committed Stage 2
scope.**

### 2.2 Tier 2 — Duplicate-detection (uniqueness across the customer base) — scoped, NOT decided

The owner's "no duplicate users" concern cannot be satisfied today, for a structural reason: **the
platform never stores the full ID number, only the last 4 digits.** Last-4-only is not a reliable
duplicate key — at national scale, last-4-digit collisions across unrelated ID numbers are
plausible (the last 4 digits are 3 sequence digits + citizenship digit, not independently random
across the population), so an `idNumberLast4` equality check would produce both false-positive
"possible duplicate" flags (different people, same last 4) and miss real duplicates only
distinguishable by the full number.

This document identifies the problem and the real tradeoff, and explicitly declines to pick an
answer, because it has direct POPIA/compliance implications outside this role's authority:

- **Option A — store a one-way hash (e.g. HMAC-SHA256 with a server-held secret pepper) of the
  full ID number, used solely for equality comparison at write time.** The full number itself is
  never stored, never reversible, never displayed — only a hash used for a uniqueness lookup. This
  is the direction that best matches the platform's existing minimal-storage posture
  (`idNumberLast4`-only today).
- **Option B — store the full ID number (encrypted at rest) to allow duplicate detection plus
  richer future verification.** Reintroduces a new class of reversible special-personal-information
  storage the platform has so far deliberately avoided.
- **Option C — do not store any full-number-derived key; instead run duplicate detection only at
  admin-review time by comparing submissions as they arrive against other `pending_review`/
  `verified` records within a short window**, accepting that this catches fewer cases and does not
  scale, but adds nothing to storage.

**Flag for `compliance-specialist` (§6): pick between A/B/C (or another option) before Stage 2
commits Tier 2 to a sprint.** This document also flags `database-architect` to confirm the chosen
option's indexing and migration shape once compliance rules on it. **Tier 2 is not committed
scope in this Stage 1 document** — it is scoped and blocked, pending that ruling.

Separately, once a storage approach is chosen, the **behavioral** rule this feature should enforce
is straightforward and can be pre-specified now regardless of which storage option wins (see
acceptance criteria §4, AC-D1–AC-D3): a submission whose ID number matches an existing *different*
account's ID number is rejected with a distinct, non-PII-leaking error — it must not reveal *which*
other account holds the number, only that a match exists, and must route to an admin-reviewable
state rather than a hard, un-appealable block (a false-positive match, e.g. two accounts for the
same person after a legitimate account-recovery flow, must be resolvable by a human, not just an
error message).

### 2.3 Tier 3 — "Is this a real living person's real ID" (true KYC / anti-fraud) — explicitly out of scope, vendor decision required

Checksum validity (§2.1) proves the number is *mathematically well-formed* — it does not prove the
number was ever issued by Home Affairs, is not expired/deceased, or belongs to the person
submitting it. Catching a deliberately fabricated-but-checksum-valid number (trivial to construct
once the algorithm is public, which it is) requires an authoritative external source: a real-time
Department of Home Affairs (DHA) lookup, or a commercial identity-verification API (e.g. the kind
of service offering SA ID + selfie/liveness matching).

**This document does not recommend for or against any such vendor, and does not assume one is
needed.** That is explicitly a build-vs-buy decision belonging to `integration-architect` (vendor
evaluation, cost, data-residency/POPIA implications of a third party handling special personal
information) with `compliance-specialist` concurrence, per this repo's existing pattern for the
payment-gateway and GPS-hardware-vendor decisions (both currently open, owned by
`integration-architect`, per root `CLAUDE.md`). **Flagged in §6, not scoped further here.**

---

## 3. Non-goals (explicit, per this role's edge-case discipline)

- **Not attempting to infer or store gender or race from the ID number.** §1 already forbids
  extracting the race digit; the sequence-number gender convention is historical/non-authoritative
  and this feature does not surface it anywhere.
- **Not changing the existing manual admin-review workflow's states or transitions.** Tier 1
  output is additional *signal* the existing `pending_review` flow can use (e.g. an admin seeing
  "checksum: valid" / "checksum: invalid — flagged" alongside the masked ID), not a new workflow.
  Whether checksum failure should auto-route to `rejected` vs. surface in the existing
  `pending_review` queue for a human decision is a Stage 2 product-manager call — this document
  recommends **auto-reject at submission (FR-2)** only for a *mathematically impossible* number
  (never a valid checksum, ever, for any real person), and recommends **human review, not
  auto-reject**, for the duplicate-match case (§2.2) and the date-of-birth mismatch case (FR-5),
  since both are capable of legitimate false positives (data-entry error, legitimate re-registration
  after account recovery) that a hard block would wrongly foreclose.
- **Not building any third-party/vendor integration in this feature's committed scope** (§2.3).
- **Not applicable to non-SA-ID-holders.** This platform's `idNumber` field is SA-ID-specific
  today (13-digit-only regex); passport numbers or other national ID formats for non-citizens are
  out of scope for this feature and not addressed by this document.

---

## 4. Acceptance criteria — Tier 1 only (committed scope)

Per this role's testability standard, each criterion below has a clear pass/fail condition. Tier
2/3 acceptance criteria are deliberately **not** written here — writing testable criteria for a
storage approach that hasn't been chosen (§2.2) or a vendor that hasn't been selected (§2.3) would
violate this role's own "don't leave rule intent as prose" standard by pretending precision exists
where a real open decision does not. Tier 2 gets its own acceptance criteria once
`compliance-specialist` rules in §6.

1. **AC-1:** Submitting an `idNumber` that is 13 digits but fails the Luhn-style check digit
   (FR-2) is rejected with `VALIDATION_ERROR` at `PATCH /v1/customer/profile` — the profile's
   `idNumberLast4` is not updated, and `verificationStatus` does not advance.
2. **AC-2:** Submitting an `idNumber` whose first 6 digits do not resolve to a real calendar date
   (e.g. month `13`, day `32`) is rejected with `VALIDATION_ERROR`, independent of whether its
   check digit happens to be arithmetically correct.
3. **AC-3:** Submitting an `idNumber` whose citizenship digit (position 11) is not `0` or `1` is
   rejected with `VALIDATION_ERROR`.
4. **AC-4:** Submitting a checksum-valid, real-date, valid-citizenship-digit `idNumber` succeeds
   exactly as today (no regression) — this is the "known-good" control case QA must include
   alongside the negative cases above.
5. **AC-5:** When the profile submission includes both `idNumber` and `dateOfBirth` (same request
   or `dateOfBirth` already on file) and the ID number's decoded date does not match `dateOfBirth`
   under either plausible century, the submission is rejected with `VALIDATION_ERROR` and a
   message distinct from AC-1–AC-3's (date-of-birth mismatch, not malformed number) so the client
   can show the right inline copy.
6. **AC-6:** When `dateOfBirth` is not present anywhere (neither in the request nor already on the
   profile), FR-5's check is skipped and does not block submission on that basis alone — absence of
   comparison data is not treated as a mismatch.
7. **AC-7:** No API response, admin UI element, log line, or audit record at any point contains
   the decoded race-classification digit (digit 12) or any value derived from it. This is a
   negative test — `automation-qa-engineer` should grep response payloads and log output for this,
   not just confirm the UI doesn't render a field.
8. **AC-8:** The existing masking behavior (`idNumberMasked: "********1234"` in the admin queue,
   `idNumberLast4` storage-only) is unchanged by this feature — Tier 1 validates the full number
   in-flight, at submission time, before truncation, and never persists it in full. This is the
   explicit boundary between Tier 1 (stateless validation of data already in transit) and Tier 2
   (§2.2, which would require a stored comparison key and is not committed here).
9. **AC-9:** A pre-existing account whose `idNumberLast4` was captured before this feature shipped
   is unaffected — this feature validates on write (new/changed submissions only), it does not
   retroactively re-validate or lock out existing verified profiles. (Whether a backfill/re-prompt
   campaign for existing unverified profiles is warranted is a Stage 2 product decision, not
   assumed here.)

---

## 5. Flags for review before Stage 2

- **`compliance-specialist` — required, blocking Tier 2.** Rule on the storage-approach options in
  §2.2 (one-way hash / encrypted-full-number / no-new-storage) before Tier 2 (duplicate detection)
  can be scoped into any sprint. This has direct POPIA special-personal-information implications
  and is explicitly outside this role's authority to decide. Also asked to confirm this document's
  race-digit exclusion (§1, FR-6, AC-7) is sufficient, or whether any additional data-minimisation
  step is needed given SA ID numbers are themselves widely treated as sensitive/special personal
  information in their own right (not just the embedded digits).
- **`integration-architect` — required before any Tier 3 work is scoped.** Build-vs-buy evaluation
  of a DHA/commercial identity-verification vendor for "is this a real person" verification (§2.3).
  This document takes no position on whether such a vendor is needed at all at current scale (per
  `north-star-2000-dau.md`'s pre-launch posture) — flagged as an open question, not a requirement.
- **`database-architect` — light, non-blocking today; blocking once compliance rules on §2.2.**
  Confirm indexing/migration shape for whichever Tier 2 storage option is chosen (e.g. a unique
  index on a hashed-ID field in `customer_profiles`, per ADR-0002's Mongo-domain-data placement).
- **`backend-engineer` — Tier 1 implementation review.** Confirm the checksum/date/citizenship
  validator is written as a small, independently unit-testable pure function (no I/O), consistent
  with this role's "data-driven, not hardcoded prose" preference, and shared (not duplicated)
  between the Zod schema check and any mobile-mirrored client-side check (§2.1).
- **`product-manager` — sign-off that Tier 1's scope (checksum + date-of-birth consistency only,
  no duplicate detection, no vendor) matches the intended near-term product scope**, and a decision
  on whether checksum-invalid submissions should hard-block (this document's FR-2 recommendation)
  or route to human review instead, before Stage 2 locks the behavior.
- **`ux-researcher`/`ui-designer` — light pass at Stage 4** on how checksum-failure and
  date-of-birth-mismatch errors are surfaced inline on the mobile profile/verification screens
  (`mobile/app/(app)/(tabs)/account/profile.tsx`, `verification.tsx`), and on how an admin reviewer
  sees Tier 1 signal in the existing verification queue (`AdminVerificationPages.tsx`) without
  overloading the existing masked-ID column.
- **Carry-forward: INC-001 A-12 / F009-1.** `FEATURE_KYC_ENABLED`'s own code comment records that
  the KYC profile-edit/identity-verification surface this feature extends has **no Stage 8 security
  review on record**. This document does not resolve that gap — it is inherited, not created, by
  Feature 013 — but Stage 2 sequencing should account for the likelihood that Stage 8 for this
  feature needs to close both the pre-existing gap and this feature's own new validation logic in
  one pass, not treat them as unrelated.

---

## 6. Out of scope (this feature folder)

- Duplicate/uniqueness detection across the customer base (§2.2) — scoped, not committed, pending
  `compliance-specialist` ruling.
- Any third-party ID-verification/KYC vendor integration, DHA lookup, or liveness/selfie matching
  (§2.3) — pending `integration-architect` build-vs-buy decision.
- Any change to the existing manual admin-review workflow's states, transitions, or endpoints.
- Passport numbers or non-SA national ID formats.
- Gender or race inference/storage of any kind (§1, §3).
- Retroactive re-validation of existing profiles (§4 AC-9).

---

**Next lifecycle step:** Stage 1 business-requirements — Tier 1 (§2.1) is ready for `product-manager`
Stage 2 scoping once the FR-2 hard-block-vs-human-review question (§5) is answered. Tier 2 (§2.2) and
Tier 3 (§2.3) remain blocked on `compliance-specialist` and `integration-architect` input
respectively and should not be scoped into Stage 2 sprint planning until those rulings land.
