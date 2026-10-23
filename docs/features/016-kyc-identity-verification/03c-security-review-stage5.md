# Feature 016 — Stage 5 Architecture Review: Security / Threat-Model Angle

**Lifecycle stage:** 5 — Architecture Review (`cybersecurity-architect` consulted early, ahead of the
Stage 8 gate this role chairs, per `02-stage-2-kickoff-sprint-plan.md` §3 item 3)
**Author:** `cybersecurity-architect`
**Date:** 2026-10-23
**Scope:** Track A (Tier 1 gating mechanism) and Track B (Tier 2 peppered-HMAC, design only, dormant).
No documents, no Tier 3, no vendor call — none of those were looked for or designed here.
**Parallel artifacts (not restated, cited where I agree or disagree):**
[`03-architecture-review.md`](03-architecture-review.md) (`backend-architect`),
[`03b-data-model-review.md`](03b-data-model-review.md) (`database-architect`).
**Precedent this extends:** `docs/organization/kyc-identity-verification-security-architecture.md`
(this role, 2026-09-21) — its §5 Stage 8 requirements (E-1…E-4, S-1…S-12) still apply in full.

**Verified in code before writing, not assumed:** `backend/src/routes/customer-profile.ts`,
`backend/src/repositories/customer-profiles.ts`, `backend/src/routes/admin-verification.ts`,
`backend/src/routes/assets.ts`, `backend/src/lib/plan-enforcement.ts`,
`backend/src/lib/customer-profile-validation.ts`, `backend/src/config/env.ts`,
`mobile/src/config/features.ts`, `scripts/check-adr-prohibitions.mjs`,
`mobile/scripts/verify-eas-feature-flags.mjs`, `docs/organization/gates/stage8-manifest.json` +
schema, `render.yaml`, `docs/organization/11-documented-client-instructions.md`.

---

## 0. Disposition (read this first)

| Question | Answer |
|---|---|
| Does anything here block Stage 6/7 from proceeding? | **No.** Stage 6/7 may proceed for both tracks. |
| Is the kickoff's enforcement mechanism (comment markers + Stage 8 manifest line) sufficient? | **No — necessary but not sufficient.** Comments are documentation, not enforcement. Five mechanical controls are added in §3 (M-1…M-5); Stage 8 will not sign off without them. |
| CT-4d — does Track A have a Register A row? | **Dark build: I-1 only (general Schedule A build authorisation), and no personal information is processed while dark — not blocked. Enforcement against real customers: no Register A row authorises it — BLOCKED until CT-16/G-11 is answered by the Client.** Track B: no row — activation BLOCKED. Detail §4. Final CT-4d determination is `compliance-specialist`'s; this is my reading, recorded for their concurrence. |
| Does Track A's enforcement flip really depend on CT-1/CT-15/CT-16? | **Yes — the kickoff (§2.1 row 3) is right and `03-architecture-review.md` §1.2/§1.4 is wrong on this point.** See §3.1. |
| Real defects found in existing code that the gate sits on | **Yes, two (TA-1 verify-then-swap, TA-2 review TOCTOU) and one missing regression test (CT-11).** They do not block Stage 6/7; they must be designed out at Stage 7 or Stage 8 blocks. |

---

## 1. Threat model — Track A (Tier 1 gating mechanism)

### 1.1 What the gate actually does

The gate is a single server-side precondition on `POST /v1/assets` (`assets.ts:50-83`, the only
caller of `ctx.assets.createForAccount`, `assets.ts:66`): if the caller's
`customer_profiles.verificationStatus !== 'verified'`, reject with `KYC_VERIFICATION_REQUIRED`
(FR-5). Pre-specified (not built) for claims filing (FR-6). Note: the real route is `POST /v1/assets`,
not `POST /v1/customer/assets` as `business-requirements.md` FR-5 writes it.

**What the gate does not do — stated so nobody oversells it:**

- **It does not prove identity.** Today `verified` is an admin attestation over *self-asserted*
  name, phone, address and the last 4 ID digits, with no evidence behind it (no documents, no
  vendor, no full number — all out of scope by ruling). It is a **friction + attribution + human
  checkpoint** control, not identity proofing. It must not be described to customers, to the
  Client, or in any compliance artefact as "identity verified" in the proofing sense, and must not
  be cited as FICA customer due diligence (10-… §14 already forbids the FICA framing).
- **The server cannot verify Tier 1.** Under CT-11 the server holds only `idNumberLast4` and
  `dateOfBirth`; the checksum and DOB-consistency checks run client-side only
  (`10-…` §13.1, `sa-id-number.ts`). A modified client sends any 4 digits. **Requirement TA-4:
  the gate must key only on the admin-set `verified` state — never on any client-asserted
  "Tier 1 passed" field.** No such field may be added to any request schema.
- **It does not prove asset ownership.** KYC answers "who is this customer," not "does this
  customer own this vehicle/phone." See abuse case AC-3.

### 1.2 Abuse cases if the gate is bypassed (or never enforced)

| ID | Abuse case | Impact today | Impact once claims / GPS ship |
|---|---|---|---|
| AC-1 | Unattributed account registers assets → insured exposure on an unidentified party; feeds a claims-fraud pipeline (register → report theft → claim) | Low — no claims/payments backend exists | **High** — FR-6 is the second line; FR-5 is the first |
| AC-2 | Unattributed account registers *someone else's* trackable device as its own asset → covert tracking (stalkerware pattern) with no identity attached to the tracker | Low — location ingestion is killed (`LOCATION_INGESTION_ENABLED`, INC-001) | **High** — this is the platform's primary harm class (real-time location of a person) |
| AC-3 | **Recovery-workflow weaponisation:** register a victim's vehicle, file a theft report, and have a security-company partner "recover" it from its real owner | Medium — recovery/security-case routes exist | High. **KYC gating does not mitigate this even when enforced** — a verified identity is not ownership evidence. Recorded as residual risk R-016-1 (§6) |

**Severity conclusion:** bypass impact is low *today* only because claims, payments and location
ingestion are not live. It scales directly with those features, which is why the gate must be
structurally sound now rather than hardened later.

### 1.3 STRIDE — gate and its inputs

| | Threat | Control / requirement |
|---|---|---|
| **S** | Account takeover of a verified customer → register assets under the victim's identity | Gate gives no protection; relies on existing session/MFA controls (Feature 001). Accepted for Track A; revisit step-up on asset creation when claims ship |
| **T** | **TA-1 verify-then-swap** — see §1.4 | Stage 7 must design it out |
| **T** | **TA-2 review TOCTOU** — see §1.4 | Stage 7 must design it out |
| **T** | Customer self-sets `verificationStatus` | Today safe: `updateCustomerProfileBodySchema` is `.strict()` and has no status field; the route never maps one. But `CustomerProfilesRepo.updateForAccount`'s patch type *accepts* `verificationStatus` (`customer-profiles.ts:129`). **TA-8:** add a route test asserting `PATCH /account/profile` with `verificationStatus` → 400, so a future schema edit cannot silently open it |
| **R** | **TA-3** — the admin decision is not attributable from the record | `admin-verification.ts:234-242` writes `privileged_data_access` with no decision value; the profile stores `verificationReviewedAt` but no reviewer. Once the gate exists, the decision is a trust primitive. **Requirement:** record actor + decision + subject as a distinct, ADR-0006-conformant event (or decision field), and persist `verificationReviewedBy`. I disagree with `03b` §1.4's "no change needed" *for the decision event specifically* (its gate-denial point I agree with) |
| **I** | `KYC_VERIFICATION_REQUIRED` leaks profile detail | Agree with `03` §1.3: fixed message, no `extra`, never `rejectionReasonCustomerSafe` |
| **D** | Enforcement + slow admin queue blocks every new customer | Operational, not a security failure. Rollout note for `technical-project-manager`; the polarity rule in §3 M-1 ensures misconfiguration fails to *not enforced*, not to lockout |
| **E** | **TA-6 alternate registration paths** bypass the gate | §1.5 |
| **E** | Insider admin verifies a confederate without evidence | No evidence exists to check in Track A. Step-up already required (`admin-verification.ts:196`); TA-3 makes it attributable; volumetric alerting is S-9 (Stage 8, deferred) |

### 1.4 Defects in the existing code the gate depends on

**TA-1 — Verify-then-swap (HIGH for the gate's meaning).** `PATCH /account/profile`
(`customer-profile.ts:84-143`) lets a customer change `firstName`, `lastName`, `dateOfBirth`,
`idNumber` (last 4) and `residentialAddress` at any time. `deriveVerificationStatus()`
(`customer-profiles.ts:90-98`) and the guard at `customer-profiles.ts:216` explicitly **preserve**
`verified` across those edits. So a customer is verified under one identity and then becomes
another while keeping `verified`. With the gate on, "verified" would mean "was once verified under
*some* details." **Requirement:** while status is `pending_review` or `verified`, a change to any
identity-bearing field must either be refused (409) or reset status to `in_progress` (clearing
`verificationReviewedAt`). Which one is `backend-architect`/`product-manager`'s call at Stage 7;
that one of them happens is a Stage 8 condition.

**TA-2 — Review TOCTOU.** `reviewVerification()` filters only on
`{ accountId, verificationStatus: 'pending_review' }` (`customer-profiles.ts:287-288`). The admin
approves whatever the fields are *at write time*, which may not be what was displayed. Fixed by the
"refuse" option of TA-1 (fields locked while `pending_review`), or by having the decision request
carry the reviewed `updatedAt` as a concurrency precondition.

**CT-11 regression test missing.** The 4-digit `idNumber` schema
(`customer-profile-validation.ts:17-25`) is *the* control that keeps the full number off the
backend — the actual CT-15 chokepoint. **No test asserts a 13-digit value is rejected**
(no 13-digit case in `customer-profile.test.ts`; no `customer-profile-validation.test.ts` exists).
Required in M-3.

### 1.5 Bypass paths — the gate must be a chokepoint, not a call site

- **Today there is exactly one creation path** (`assets.ts:66`). I accept `03` §1.2's placement
  (`kyc-gate.ts`, called next to `assertAssetRegistrationAllowed`). **Requirement TA-6a:** a test
  or CI-2 rule that fails if `createForAccount` gains a caller that does not pass through the gate,
  so the next path (admin-on-behalf creation, bulk import, implicit creation on tracker link) cannot
  ship ungated by omission.
- **TA-6b — re-registration by edit.** `PATCH /assets/:assetId` (`assets.ts:447-496`) can replace
  `details`. If `details` carries the item's identifying attributes (serial/IMEI/VIN —
  `backend-architect` to confirm per asset type), editing them is registering a different item.
  Either those attributes are immutable after creation or the edit is gated identically.
- **Any future reactivation of a `removed` asset** is a registration and must be gated. None exists
  today (verified: no such route in `assets.ts`).
- **TA-7 — fail-safe scope.** The gate must never block: reading own assets/policies, theft
  reporting or recovery on existing assets, location-consent withdrawal, account deletion or
  data-subject requests, or verification submission itself. Blocking a recovery because KYC lapsed
  would cause real harm. `03` §1.5's "creation only, by construction" satisfies this; keep it so.

---

## 2. Track B — security design conditions (design only, dormant)

I agree with the core shape in `03` §2 (separate endpoint and schema; the general
`PATCH /account/profile` 4-digit schema stays unchanged permanently) and `03b` §2.2 (non-unique,
sparse index, so a duplicate is not a database-level oracle). Conditions:

- **TB-1 — Server-side HMAC only.** The pepper never reaches a client bundle. A client-side HMAC
  would disclose the pepper, and the ID keyspace (~10^9) is brute-forceable once the pepper is
  known.
- **TB-2 — Structural absence when off.** The full-ID route is **not registered** when the Track B
  flag is off (404), *and* checks the flag in the handler before parsing the body (defence in depth,
  same as `assets.ts:122`). The pepper is not read into `ctx.env` at all while the flag is off; a
  startup warning is logged if the pepper variable is present while the flag is off.
- **TB-3 — Transit controls** per `kyc-identity-verification-security-architecture.md` §3.2:
  body only; on the deny-list for request logging, the error handler and any trace exporter; an
  automated negative test that the full number never appears in captured logs. Also: **validation
  errors must not echo the submitted value**, and **no full number in the idempotency store or
  rate-limiter keys** if the endpoint uses either.
- **TB-4 — No duplicate oracle.** The customer-visible response must be identical whether or not a
  duplicate is found; a match only raises an admin-only flag inside the existing `pending_review`
  queue. Rate-limit ID submissions per account tightly (each submission is an oracle query against
  "is this person already a customer").
- **TB-5 — The digest is full-ID-equivalent once the pepper leaks.** It must never appear in
  `toProfile()` / `CustomerProfileDocument`, any serializer, admin list, export or log. Expose it
  only through a dedicated repository method that returns a match boolean, never the value.
  Co-location on `customer_profiles` (`03b` §2.1) is **acceptable**: with one Mongo credential, a
  separate collection would be cosmetic. The pepper is the real barrier, not the collection.
- **TB-6 — Canonicalise and domain-separate.** Server-side Tier 1 checksum validation first (the
  server can finally do it here), then `HMAC-SHA256(pepper, "tdit:kyc-dedup:v1:" + 13 digits)`.
- **TB-7 — Correction to `03b` §2.3 option (a).** *"A migration can re-derive old digests under
  the new pepper over time"* **is not possible.** An HMAC cannot be re-keyed without the plaintext,
  and the plaintext is never stored. The version field is still right, but rotation means
  **re-collection at the customer's next verification**. On pepper compromise, delete all
  old-version digests immediately: once the pepper leaks they are equivalent to the full ID numbers.
  No routine rotation is planned. `database-architect` should correct §2.3 in place, keeping the
  superseded text marked void (house rule).
- **TB-8 — Key custody is an activation condition.** The pepper must be ≥256-bit random and
  provisioned by the owner only after CT-15 closes. **Preferred:** a non-exportable KMS HMAC key,
  which depends on KYC-R-4 and is a new sub-operator under CT-4c. **Fallback:** a Render secret
  environment variable, which requires a **`cto`-signed risk acceptance** of a specific consequence.
  `dateOfBirth` and `idNumberLast4` are already stored together, which leaves ≤1,000 candidates per
  person. So any compromise of the application (pepper and database together) recovers **every
  Tier 2 customer's full ID number in seconds**. This does not block Stage 6/7, but Track B cannot
  activate without one of the two.
- **TB-9 — Data classification note for `compliance-specialist`.** Even without Track B,
  `dateOfBirth` and `idNumberLast4` stored together narrow the full SA ID number to ≤1,000
  candidates (the unknown part is SSSS digits 1–3). The existing profile record is therefore close
  to identifying the full number. This sharpens the `03b` §2.2 description, which gives ~20,000
  candidates from DOB alone.

---

## 3. Is the kickoff's enforcement mechanism sufficient? — Corrected plan

The kickoff (§2.2) mandates (1) code-comment markers and (2) a Stage 8 manifest line. Both stay
mandatory. **Neither stops anything on its own.** A comment does not stop a deploy, and the manifest
line records a check without performing it. The decisive fact is this: **flipping the flag is a
change to a Render environment variable, not a code change.** It bypasses PR review and CI entirely
unless the controls below exist. Stage 8 will require all of the following:

- **M-1 — Backend flags, server-side, exact-`"true"`, no local fail-open.**
  - Two separate flags (agree with `03` §2.4): Track A enforcement and Track B write path.
  - Parse them in `backend/src/config/env.ts` and expose them via `ctx.env`, mirroring
    `LOCATION_INGESTION_ENABLED` (`env.ts:407-418`). That includes the warning on an unrecognised
    value. I prefer this to `03` §1.4's module-level `backend/src/config/features.ts` because it is
    testable through `ctx` and matches the existing CI-2 rule. Not blocking; Stage 7 confirms.
  - **`FEATURE_KYC_ENABLED` is not a security control for this feature.** It is a client
    build-time flag, so a direct API call bypasses it. Kickoff §2.1's "reuses `FEATURE_KYC_ENABLED`"
    holds for UI visibility only.
  - **No local-dev fail-open on the backend.** One Atlas cluster backs dev, test and production
    (MP-8), so a "convenient" local default would write against production data.
- **M-2 — CI-2 rules** in `scripts/check-adr-prohibitions.mjs`, the existing mechanical precedent:
  - (a) `customer-profile-validation.ts`'s `idNumber` pattern must remain `^[0-9]{4}$`. This makes
    the CT-15 chokepoint machine-checked.
  - (b) If `kyc-gate.ts` or the Track B module exists, `env.ts` must define the corresponding flag
    with exact-`'true'` parsing (mirrors the location-report rule).
  - (c) `render.yaml` must not set either flag to `"true"`, or declare the pepper variable, unless
    the flag's manifest entry carries `stage8.flagEnableApproved: true`. Today `render.yaml` sets
    neither (verified).
- **M-3 — Tests:**
  - Each flag resolves to off when unset, blank or garbage.
  - Flag off: `POST /v1/assets` succeeds for an unverified account. Flag `"true"`: it returns
    `403 KYC_VERIFICATION_REQUIRED`.
  - CT-11 regression: a 13-digit `idNumber` → 400.
  - TA-8: `verificationStatus` in the PATCH body → 400.
  - TA-1/TA-2 behaviour tests.
  - Track B: route 404 with the flag off, pepper not loaded into `ctx`, and the log negative test.
- **M-4 — Comment markers: required, and they must be accurate.** The draft comment in `03`
  §1.2/§1.4 (*"has NO dependency on CT-1/CT-15/CT-16… do not conflate"*) **must not ship.** It
  states the opposite of the binding constraint (§3.1 below). A marker that tells the next engineer
  the flip is unconstrained is worse than no marker. `backend-architect` should correct it in place
  in `03`.
- **M-5 — Manifest entries:**
  - New, distinct entries for the gate and for the Track B endpoint, with
    `flagEnableApproved: false`. This is the field `verify-eas-feature-flags.mjs` already treats as
    the positive "approved to flip" signal, so it is mechanical rather than prose.
  - **Corrected manifest line wording:** *"Full-ID-number transmission / HMAC key write / gate
    enforcement BLOCKED pending CT-1, CT-15, CT-16 — verified both backend flags resolve OFF when
    unset in every environment including local (backend has no build profiles; MP-8), render.yaml
    sets neither, pepper not provisioned."* The kickoff's "non-local build profiles" wording is a
    mobile concept and would leave the backend unverified.
  - **`PATCH /admin/accounts/:id/profile/verification` needs its own entry.** The gate makes it a
    trust primitive, and I found no distinct manifest entry for that backend route; per SR-012-5 it
    must not be absorbed into a group review.
  - Add a boot-time structured log of each KYC flag's resolved value, so a dashboard flip is visible
    after the fact even though CI cannot see it.

### 3.1 Why Track A enforcement *does* depend on the CT items

`03` §1.2/§1.4 treats the enforcement flip as pure rollout timing. It is not. Enforcement turns
optional KYC processing into a **condition of service**: every customer must hand name, DOB,
address and ID digits to the Frankfurt-hosted API in order to register an asset. That is precisely
the processing for which:
- no Client instruction exists (G-11, re-put via **CT-16**);
- §19(c) consent is unconfirmed (**CT-1**);
- the §9.3 containment rule holds that no real customer personal information may reach any surface
  until CT-1 closes;
- and the surface itself has never had a Stage 8 review (**F009-1 / INC-001 A-12**: the
  `backend-customer-profile` manifest entry is a waiver, not a review).

Strictly, CT-15 (full number) is not a logical prerequisite for Track A. But the CTO-approved
constraint binds all three, and loosening a CTO constraint is not this role's call. **The kickoff
stands as written.** The polarity point in `03` §1.4 (unset → not enforced) is correct and I endorse
it.

---

## 4. CT-4d — Register A citation (standing rule, `10-…` §12.4; `11-…` §7)

Register A lives at `docs/organization/11-documented-client-instructions.md` §3. It holds nine rows
(I-1…I-9), all derived from the contract and none data-specific. Verified today: **no row has been
appended since filing.** Neither has the G-15/G-16 Register B row that CT-16 calls for.

| Increment | Register A row cited | Ruling |
|---|---|---|
| Track A — design and dark build (flag off, no real PI processed) | **I-1** (build and operate the Customer Mobile App and Backend/API, Schedule A) | **Not blocked.** No personal information is processed by a dark code path; I-1 authorises building it. |
| Track A — enforcement against real customers | **None.** I-1 does not itemise data categories or purposes (`11-…` §3, I-1 "scope/limits"). The inputs, `idNumberLast4` and the KYC profile fields, sit in **Register B G-11**: uninstructed. | **BLOCKED** until the Client answers G-11 (CT-16). Resolved by obtaining the instruction, not by adding a row (`11-…` §7). |
| Track B — any write or activation | **None** (G-11 widened, G-15; CT-16 open; CT-15 unserved) | **BLOCKED**; design may proceed, since design is not processing. |

**For `cto` and `compliance-specialist`:**
- CT-16's deadline was 2026-09-26 and it is **four weeks overdue**. Track A's activation sits behind
  it; engineering cannot close that gap.
- The final CT-4d call is `compliance-specialist`'s, and their concurrence is required at Stage 8
  (S-10).

---

## 5. Stage 8 preview — what this feature's gate will check

These are in addition to `kyc-identity-verification-security-architecture.md` §5. For Track A, the
relevant items are E-2, S-1, S-5, S-6, S-10 and **S-12**, and S-12 is not optional. Feature 016's
Stage 8 must close the **F009-1 / INC-001 A-12** backfill for `/account/profile*` and the admin
verification surface in the same pass. Gating on top of an unreviewed surface and reviewing only the
gate would be a gate bypass in substance.

Feature-specific additions:
- TA-1, TA-2, TA-3, TA-4, TA-6a/b, TA-7, TA-8 implemented and tested;
- M-1…M-5 in place;
- TB-1…TB-8 reflected in the dark Track B code;
- TB-8 key custody decided and risk-accepted before activation, not before merge.

---

## 6. Residual risks (for the platform risk register)

| ID | Risk | Owner | Status |
|---|---|---|---|
| R-016-1 | Recovery-workflow weaponisation (AC-3): KYC is not ownership evidence; a verified customer can register and "recover" someone else's asset | `cybersecurity-architect` + `product-manager` (ownership-evidence design before recovery dispatch is live for real customers) | Open — not mitigated by this feature |
| R-016-2 | `verified` is an attestation without evidence (no documents, by ruling). Risk of it being represented as identity proofing | `product-manager` / `compliance-specialist` (copy and Client reporting) | Open — accepted as Track A's design limit, must be stated honestly |
| R-016-3 | Flag flip via Render dashboard bypasses CI/PR review | `devops-engineer` (Render access scope; ties to G-2) | Partially mitigated by M-2(c) + boot log |
| R-016-4 | Pepper co-resident with DB credential (if TB-8 fallback taken): app compromise = full ID recovery | `cto` (risk acceptance) / `security-engineer` + `cloud-infrastructure-architect` (KYC-R-4) | Open — activation condition |
| R-016-5 | CT-16 four weeks overdue; Track A activation indefinitely blocked | `cto`/owner + `compliance-specialist` | Open |

---

## 7. Hand-offs (each owner edits their own document; nothing above was edited in theirs)

- **`backend-architect`** — correct the `03` §1.2/§1.4 comment and the flag-independence claim
  (M-4, §3.1); design TA-1/TA-2/TA-6b at Stage 7; adopt M-1 parsing location or record why not.
- **`database-architect`** — correct `03b` §2.3(a) re-derivation (TB-7); add TA-3
  (`verificationReviewedBy` + decision event) to Stage 6 scope; TB-5 projection rule.
- **`security-engineer`** — M-2 CI-2 rules and M-3 tests are the verification half of Stage 8.
- **`compliance-specialist`** — concur or differ on §4 (CT-4d); note TB-9 classification; append
  G-15/G-16 to Register B (CT-16 precondition, not yet done).
- **`technical-project-manager`** — kickoff §2.2's manifest line wording should be read as corrected
  in M-5; no change to sequencing.

**Filed by:** `cybersecurity-architect`, 2026-10-23.
