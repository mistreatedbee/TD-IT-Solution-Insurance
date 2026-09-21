# KYC / Identity-Verification — Security Architecture Note and Stage 8 Pre-Position

**Author:** `cybersecurity-architect` (sole author — this is a new, single-role document, not a
shared lifecycle artefact; nothing here edits or restates another role's record)
**Date:** 2026-09-21
**Status:** Architecture note + **advance Stage 8 pre-position**. This is *not* a Stage 8 sign-off
and does not discharge any gate. It states, before anyone builds, what the gate will require.
**Trigger:** platform owner's decision to proceed with real KYC (identity verification) for
customers, with likely government-ID-number capture and ID-document / proof-of-address image
upload.
**Parallel work, not duplicated here:** `business-analyst` Stage 1 business requirements;
`compliance-specialist` POPIA/FICA review. This document takes no position on legal
determinations — data-class *legal* framing, FICA applicability, and lawful basis are
`compliance-specialist`'s to rule on. What follows is technical control design and gate posture.

---

## 0. What was verified in code before writing this (not assumed)

| Claim | Evidence |
|---|---|
| KYC surface exists, flag-gated, no Stage 8 record | `mobile/app/(app)/(tabs)/account/verification.tsx:6` — its own header comment reads *"INC-001 A-12 / F009-1: verification centre submits SA ID and address with…"*; `mobile/src/config/features.ts` `FEATURE_KYC_ENABLED` |
| Manifest records the gap as **waived, not cleared** | `docs/organization/gates/stage8-manifest.json` — `mobile-tab-account-kyc`, `mobile-kyc`, `backend-customer-profile` (`/account/profile*`), `web-admin-verification`, all `"waived": true`, reason `F009-1 … (INC-001 A-12)` |
| Full SA ID number is **never stored**, only `idNumberLast4` | `backend/src/lib/customer-profile-validation.ts` (now `/^[0-9]{4}$/`); `backend/src/repositories/customer-profiles.ts`; `backend/src/routes/admin-verification.ts:55` builds `idNumberMasked: ********1234` from `idNumberLast4` |
| CT-11 truncation is client-side and shipped | `src/lib/sa-id-number.ts`, `mobile/src/lib/sa-id-number.ts`; disposition at `docs/organization/10-data-protection-contract-obligations.md` §13 |
| **No object-storage vendor exists** | No `@aws-sdk`, no S3/GCS/Cloudinary/UploadThing client, no Supabase Storage bucket, no presigned-URL code anywhere in `backend/`, `src/`, `mobile/`. `backend/src/config/env.ts` has no storage credential of any kind |
| …**but an image-persistence path already shipped** | `backend/src/routes/customer-profile.ts:185-280` — `PUT/GET/DELETE /account/profile/picture`, base64-in-JSON body (`backend/src/lib/profile-picture-validation.ts`, 512 KB cap, magic-byte content-type check), persisted as a **MongoDB `Binary` blob** in `backend/src/repositories/customer-profile-pictures.ts` |
| **No field-level / application-layer encryption capability exists** | Zero occurrences of CSFLE, `ClientEncryption`, queryable encryption, or any KMS client in any `.ts` file in this repo. Secrets are flat env vars on Render (`backend/src/config/env.ts`) |
| Cross-border and vendor-appointment conditions are open | `10-data-protection-contract-obligations.md`: **CT-1** consent sent but not confirmed in required form (§10.3), **CT-13** Render DPA unexecuted, **CT-2** Atlas region still unread, **CT-4c** sub-operator appointment authorisation required *before vendor selection*, **CT-4d** every Stage 8 must cite an authorising Register A row *or block* |

Two of these deserve calling out because they contradict the assumption people are likely to work
from:

1. **"No photo upload exists" is now false.** A profile-picture upload shipped. It stores image
   bytes as Mongo binary. **That precedent must not be extended to ID documents** — see §2.3.
   MP-5 ("no object-storage vendor") is still true as written; "no image ever gets persisted" is
   not.
2. **"Encrypt the full ID number at rest" is not a configuration change.** There is no key
   management in this platform at all. Atlas/Supabase volume encryption is the only encryption at
   rest that exists today, and it protects against stolen disks, not against a compromised
   application credential, a Mongo read from an over-scoped service account, or an admin with DB
   access. See §3.

---

## 1. Threat-model delta introduced by real KYC

New assets: `ID_NUMBER_FULL` (13 digits, uniquely and permanently identifying, non-rotatable),
`ID_DOCUMENT_IMAGE` (face photo + full number + signature + issue data in one artefact),
`PROOF_OF_ADDRESS` (home address, often a utility/bank statement — financial data by side effect),
and, if liveness is added, `SELFIE/BIOMETRIC_TEMPLATE`.

Classification I am setting for control-design purposes (legal characterisation deferred to
`compliance-specialist`): **ID document images and any biometric/liveness artefact are the
highest-sensitivity data class on this platform — above precise asset geolocation.** Rationale:
geolocation is time-bounded and loses value as it ages; an ID document is a permanent,
non-revocable identity credential that enables real-world impersonation, SIM-swap, and account
takeover *at other institutions*, indefinitely. A location breach harms our customer through our
platform; an ID-document breach harms our customer everywhere, forever, and cannot be remediated
by rotation.

### 1.1 STRIDE deltas (abbreviated — full per-surface table is a Stage 5/8 deliverable)

| | Threat | Notes specific to this platform |
|---|---|---|
| **S** | Attacker submits someone else's ID document to bootstrap a verified account | Verification status is a trust signal other surfaces consume; a falsely `verified` account inherits that trust |
| **T** | Document image tampered/substituted between capture and admin review | No integrity binding exists today (no hash-at-capture, no immutable store) |
| **R** | Admin denies having viewed a customer's ID document | ADR-0006 privileged-access trail is **mandatory** here; `admin-verification.ts` audit coverage must be re-verified, not assumed |
| **I** | **Primary risk.** Bulk exfiltration of ID images via (a) compromised admin/support session, (b) over-scoped Mongo credential, (c) IDOR on a document-fetch endpoint, (d) third-party verification vendor breach, (e) Render/Atlas request or error logs capturing base64 payloads | (e) is a live, demonstrated concern on this platform — CT-11's stated motivation was precisely "full number may reach Render request logs" |
| **D** | Upload endpoint as an amplification/storage-exhaustion vector | The profile-picture pattern (base64 in JSON body) makes every upload an in-memory decode |
| **E** | Verified-status elevation; reviewer role reading documents outside an assigned case | Support agents must **not** inherit document read by virtue of reading a profile |

### 1.2 The attack tree that decides the architecture

Goal: *"attacker obtains 10,000 customers' ID documents."* Today's shape of the platform makes the
cheapest branch **"obtain any credential that can read the domain Mongo database"** — because if
documents live in Mongo alongside profiles (the profile-picture precedent), one credential
compromise yields the whole corpus, with no second authorisation boundary and no per-object access
log. Every recommendation in §2 and §3 exists to make that branch expensive rather than free.

---

## 2. Storage architecture: is "no object-storage vendor" a hard blocker?

**Short answer: it is a hard blocker for document-upload KYC, and it is not a blocker for
non-document verification methods.** The two must be separated in planning, because they have
completely different gate costs.

### 2.1 Document-upload KYC — BLOCKED on a storage decision

A document-upload flow cannot pass Stage 8 without a chosen, contracted store, because the
required controls are properties *of the store*, not of our code:

- Per-object access control and short-lived, single-use, scoped read URLs (no long-lived
  fetchable URL, no guessable key).
- Object-level access logging that feeds the ADR-0006 privileged-access trail.
- Server-side encryption with a **customer-managed key we can destroy** — key destruction is the
  only credible "erasure" story for an immutable-ish blob store under a POPIA s.24 deletion
  request.
- Lifecycle/TTL expiry enforced by the store, so retention is structural rather than dependent on
  a cron job someone remembers to write.
- Known data residency (see §2.4).
- Object immutability/versioning so a tampered replacement is detectable.

None of these exist today. This is a genuine vendor decision owned by `integration-architect` +
`cloud-infrastructure-architect`, and per **CT-4c** it additionally requires the Client's
sub-operator appointment authorisation *before* selection — the same condition already attached to
the PSP and GPS-hardware vendors.

### 2.2 Non-document verification — NOT blocked on storage

Feature 013 Tier 1 (`docs/features/013-sa-id-verification/business-requirements.md` §2.1) —
checksum + date-of-birth consistency — is stateless arithmetic over data already in transit,
persists nothing new, and needs no store. A bureau/DHA **data-only** check (submit number + name +
DOB, receive match/no-match, persist only the *outcome* and a correlation reference) likewise needs
no image storage. **Recommended sequencing: ship verification depth that needs no image store
first; treat document upload as a separate feature with its own Stage 8, not as a sub-task.** This
is not a delaying tactic — it is the only path that gets verification value to the owner while the
storage and vendor decisions are still open.

### 2.3 Explicit rejection of the available shortcut

`customer-profile-pictures.ts` shows how to persist images today: base64 in a JSON body, decoded
in-process, written as a Mongo `Binary`. **I am pre-emptively rejecting that pattern for ID
documents, and any Stage 8 submission that uses it will be blocked.** Reasons, in order of weight:

1. **Single blast radius.** Documents would sit in the same database, under the same credential,
   as profiles, assets and cases. One over-scoped connection string yields everything. Object
   storage with its own credential and its own policy is a second authorisation boundary that
   Mongo-blob storage structurally cannot provide.
2. **No per-object access log.** A `findOne` is invisible to ADR-0006's trail unless every call
   path is individually instrumented — exactly the "relies on developers remembering" pattern this
   role is supposed to design out.
3. **Base64 in a JSON body puts the document in the request path**, where Render/Express error
   handlers, body-logging middleware and APM traces can capture it. This is the same log-leak
   mechanism CT-11 was raised to close, at ~1000× the payload sensitivity.
4. **No key-destruction erasure.** `deleteOne` on a replica set with backups/oplog is not erasure;
   a per-object CMK is.
5. **Size/DoS.** 512 KB suits an avatar; a legible ID photo is 2–8 MB, decoded in memory per
   request, stored inline in a document collection.

A note for `database-architect`/`security-engineer` separately from KYC: the existing
profile-picture endpoint deserves its own review pass (blob-in-Mongo, and I did not verify whether
`GET /account/profile/picture` has any privileged read path). Out of scope here; flagged, not
assessed.

### 2.4 Residency is part of the storage decision, not a later detail

Backend and Supabase are in Frankfurt (`eu-central-1`); Atlas region is **still unconfirmed**
(CT-2, overdue since 2026-08-31); CT-1 consent for the existing cross-border transfer is *sent but
not confirmed in the required form* (§10.3 of the register); the Render DPA is unexecuted (CT-13).
Adding SA ID *documents* to a transfer whose lawfulness is presently "a reasoned expectation, not a
verified finding" enlarges the exposure of an open condition rather than working within it.
**Storage-vendor evaluation must include an `af-south-1`/in-SA option and must state residency as a
scored criterion**, following the format of `gps-hardware-vendor-scorecard.md` /
`payment-gateway-vendor-scorecard.md`. Whether in-SA residency is *required* is
`compliance-specialist`'s call, not mine; that it must be a first-class evaluation criterion is
mine.

---

## 3. If the full ID number is stored (the CT-11 tension)

### 3.1 The tension is real, and narrower than it looks

CT-11 established that the full 13-digit number never leaves the device. Real KYC does need the
full number **in transit** — a bureau/DHA check on the last four digits is meaningless. So CT-11's
*transmission* minimisation will be partially reversed by any Tier 3 verification, and that is
unavoidable if the owner wants real verification.

**But transmission and storage are separable, and this is the load-bearing distinction.** Feature
013 §2.2 already frames the storage question as options A (HMAC-SHA256 with a server-held pepper,
for equality/uniqueness only), B (encrypted full number), C (no new storage). My architecture
position:

- **Transmit in full: accept, with conditions** (§3.2) — required for verification to mean
  anything.
- **Store in full: reject by default.** Option A (peppered HMAC) satisfies duplicate detection —
  the owner's actual stated goal — without creating a reversible corpus. Option B should only be
  reached if a named, written requirement that *cannot* be met by a hash is produced, and it would
  need to survive the §3.3 controls.

I am recording this as a **conclusion `compliance-specialist` may independently reach or not**. If
their parallel POPIA/FICA review concludes that FICA record-keeping obligations require retaining
the full number (or the document itself) for a fixed statutory period, that is a legal requirement
that overrides my "reject by default" preference and must be reconciled explicitly — not silently
resolved by whichever document is read last. **Reconciliation owner: me, jointly with
`compliance-specialist`, before Stage 2 scoping closes.** Flagging the divergence now is the point.

### 3.2 Controls required for full-number *transit* (no storage)

1. TLS 1.2+ only, no exceptions (existing standard, `06-security-standards.md`).
2. **Never in a URL, query string or path parameter** — POST/PATCH body only.
3. **Structural log suppression**: the field must be on a deny-list in request logging, the error
   handler, and any APM/trace exporter, and there must be an automated test asserting a full
   number never appears in captured log output (the AC-7 negative-test pattern Feature 013 already
   uses for the race digit). Review-time inspection is not sufficient — CT-11's own motivation was
   a log-leak risk.
4. Zeroed/not retained after use; no full number in any request-replay, debug or support tooling.
5. Client-side checksum validation (`sa-id-number.ts`) retained as a pre-flight so structurally
   invalid numbers never transmit at all — CT-11's validation half survives even where its
   truncation half cannot.

### 3.3 Controls required *if* full-number-at-rest is ever authorised

All of the following are prerequisites, not aspirations. Stage 8 will treat any missing item as
blocking:

- **Encryption at rest beyond volume encryption.** Application-layer or Mongo CSFLE/Queryable
  Encryption with a key held in a real KMS, separate from the application credential. **This
  capability does not exist in this codebase today** (verified: zero CSFLE/KMS references) — so
  "store it encrypted" is a build, owned by `security-engineer` + `database-architect`, with its
  own key-rotation and key-destruction procedure. `cloud-infrastructure-architect` must confirm a
  KMS that works under Render + Atlas.
- **No plaintext read path by default.** Decryption available only to a named, minimal role for a
  named purpose; never returned in a list/collection response; never in an export or analytics
  path; masked (`********1234`) everywhere the existing admin UI masks today
  (`admin-verification.ts:55` — that masking must not regress).
- **Separate credential and separate collection** from general profile data, so a general domain
  read does not imply an identity-document read.
- **ADR-0006 privileged-access trail, with the purpose/case reference extension.**
  `06-security-standards.md` requires a purpose/case reference for location access and for
  partner-org operator access. **I am extending that requirement to identity-document and
  full-ID-number access**: every decrypt/view must record subject, actor, actor session, timestamp
  and a purpose/case reference, in the store holding the data, append-only, **fail-closed** (audit
  write fails → the document is not returned). This is a new trail; per
  `06-security-standards.md` it inherits ADR-0006 by default and any deviation is a re-threat-model
  trigger, not a local design choice.
- **Retention and legal hold** stated before the trail ships, period reserved to
  `compliance-specialist` (AUD-7 symmetry).
- **Rate limiting and volumetric alerting on reviewer access** — a reviewer opening 200 documents
  in an hour is the insider-exfiltration signature and must page someone. We do not have this
  today for any surface.
- **Hash-at-capture integrity binding** for documents, recorded alongside the object reference.

### 3.4 Access model

Four roles exist (`06-security-standards.md`). My position for KYC data:

| Role | Full ID number | ID document image |
|---|---|---|
| customer (self) | write-only in transit; never read back | upload only; may see own submission status, not re-fetch the image by default |
| admin / verification reviewer | masked by default; plaintext only via an audited, purpose-referenced decrypt, and only for a record in `pending_review`/`action_required` | time-boxed, audited, purpose-referenced view; view-only (no download affordance); auto-expiring reference |
| support agent | **never** | **never** |
| security-company operator | **never** — no recovery workflow requires a customer's ID document | **never** |

The security-company operator row is not a judgement call to be revisited during implementation:
per this role's standing assumption that a partner-org operator may be compromised or malicious, a
third-party org must have **no** path to identity documents, and the absence of that path should be
structural (no route, no field in any partner-scoped projection) rather than an authZ check.

---

## 4. Third-party identity-verification vendor: does it change the threat model?

**Yes — substantially, and in both directions.** It is not merely "an API call."

### 4.1 What it improves
Outsourcing document capture/liveness to a vendor that returns only a verdict can mean **we never
store the document at all** — which structurally removes the §1.2 attack tree's main branch and
moots most of §2. A vendor-hosted capture SDK/redirect where the image goes browser/app → vendor
(never through our API) is, from a pure blast-radius standpoint, the strongest available
architecture. That is a real argument for buy over build, and I want it on record as such rather
than framed only as new risk.

### 4.2 What it worsens
- We become dependent on the vendor's breach posture for our customers' most sensitive artefact,
  with no ability to detect their compromise.
- **CT-4c applies directly**: the vendor is a sub-operator processing personal information on the
  Client's behalf; the Client's appointment authorisation is required **before selection**, not
  after integration.
- CT-4d applies: the Stage 8 review must cite the Register A row authorising the processing, **or
  block**.
- Residency: most SA bureau/KYC vendors are in-SA (good for CT-1/CT-2 exposure); several global
  liveness vendors are not. This must be scored, not discovered.
- A vendor DPA + s72(1)(a)-style assessment is required, on the pattern already applied to Supabase
  and pending for Render (CT-13).

### 4.3 The webhook/callback surface — treat exactly as GPS ingestion

If the vendor returns results asynchronously (most do), **that callback is an adversarial
ingestion endpoint carrying an identity-trust assertion**, and it is governed by the same posture
this platform already applies to GPS webhook ingestion and by ADR-0009's trust-boundary reasoning:

1. **Signature verification is mandatory and fail-closed** — verify vendor signature (HMAC or
   asymmetric) over the raw body before parsing; reject unsigned/unverified outright. No IP
   allow-listing as the primary control.
2. **Replay protection** — timestamp window + nonce/event-id idempotency. A replayed
   "verified" callback must be a no-op, not a second state transition.
3. **The callback is a claim, not a fact.** Never trust a payload-supplied account/subject
   identifier to select the record; resolve via a server-issued, single-use correlation reference
   created when *we* initiated the check. An attacker who can forge or replay a callback must not
   be able to point a genuine verdict at a different account.
4. **Verdict is not authority to elevate.** A `verified` callback sets a verification *signal*;
   whether that auto-advances `verificationStatus` or lands in the existing human review queue is a
   product decision I recommend resolving toward **human review for approvals**, and it must never
   grant any entitlement beyond verification status itself.
5. Rate limiting, strict schema validation, size caps, no SSRF-able URL fields in the payload, and
   the callback must not accept an image *inbound* to us unless §2's storage prerequisites are met.
6. Dedicated manifest entry for the callback route, and it is a **re-threat-model trigger** on
   vendor change (a second vendor = a second review; this mirrors the standing "new GPS vendor =
   re-threat-model" rule).
7. **Outbound** calls to the vendor need their own controls: pinned/known egress, credentials in
   KMS-or-env-not-source, no ID data in outbound request logs, and a defined failure mode when the
   vendor is down (fail to `pending_review`, never fail to `verified`).

### 4.4 Consequence for vendor selection
Because the "vendor never lets the image touch us" option (§4.1) materially reduces the storage
problem, **the vendor decision and the object-storage decision are coupled and should be evaluated
together, not sequentially.** Choosing an object-storage vendor first may buy a capability the
right verification vendor would have made unnecessary. Recommendation to
`integration-architect`: one combined scorecard covering (a) verification depth, (b) whether
documents can be kept off our infrastructure entirely, (c) residency, (d) DPA/sub-processor chain,
(e) callback security model — following the existing scorecard format.

---

## 5. Stage 8 Security Review — what the gate will require

This is the kind of feature the gate exists for. Advance notice of requirements, so none of it is a
surprise late in the cycle:

**Entry criteria (review will not start without these):**
- E-1. Stage 1 business requirements naming the exact data fields collected, and the verification
  method (document-based vs data-only) — these are different reviews.
- E-2. `compliance-specialist` POPIA/FICA determination: lawful basis, whether SA ID number and ID
  documents are special personal information here, retention period, and the **CT-4d Register A row
  authorising this processing**. Without that row, the review blocks on arrival.
- E-3. Storage decision (§2) with a named, contracted store, **or** written confirmation that the
  flow persists no image anywhere (vendor-hosted capture).
- E-4. Data-flow diagram showing every hop the ID number and document take, including vendor and
  log paths.

**Required for sign-off:**
- S-1. Threat model updated (STRIDE per new surface + the §1.2 attack tree) — new deliverable, not
  an amendment to a location-era model.
- S-2. ADR-0006-conformant privileged-access trail for ID-number and document access, with the
  purpose/case reference extension (§3.3), fail-closed, with tests.
- S-3. Encryption-at-rest design incl. key custody, rotation and **destruction** procedure
  (`security-engineer` + `database-architect` + `cloud-infrastructure-architect`).
- S-4. Access-model implementation matching §3.4, including the structural absence of any
  security-company-operator and support-agent path — verified by test, not by inspection.
- S-5. Automated negative tests: full ID number and document bytes absent from all log/error/trace
  output; Feature 013 AC-7 race-digit exclusion preserved.
- S-6. IDOR/BOLA tests on every document and verification endpoint across all four roles.
- S-7. Vendor DPA + sub-processor chain + CT-4c Client authorisation (if a vendor is used), and
  callback controls §4.3 implemented and tested.
- S-8. Retention/deletion implemented and demonstrable (including the interaction with the
  `/delete-account` flow — which today is a `mailto:` with no backend erasure endpoint; an ID
  document makes that gap materially worse).
- S-9. Insider-access volumetric alerting (§3.3).
- S-10. Joint gate: `security-engineer` and `compliance-specialist` concurrence recorded in the
  feature's `security-review.md`. My sign-off alone does not discharge the gate.
- S-11. **Pentest**: I am invoking the mandate now — an external pentest of the KYC surface is
  required before it holds real customer documents. This is squarely
  `06-security-standards.md`'s "before any major architecture change that expands the attack
  surface," and adding a new third-party integration is its named example.
- S-12. The pre-existing **F009-1 / INC-001 A-12** gap must be closed in the same pass. The
  existing KYC surface has *never* had a Stage 8 review; building on top of an unreviewed
  foundation and reviewing only the new layer would be a gate bypass in substance. Feature 013 §5
  reaches the same conclusion independently and I concur with it.

---

## 6. Manifest pre-position — answering the question asked

**Any future `stage8-manifest.json` entry for a KYC document-upload flow, or for any surface that
transmits or stores a full SA ID number, must default to `blocked`, not `waived`.** Recorded here,
before anyone builds, so it cannot later be framed as a late objection.

Reasons this must not be a waiver:

1. Every existing KYC waiver (`mobile-kyc`, `mobile-tab-account-kyc`, `backend-customer-profile`,
   `web-admin-verification`) is justified by *"gated via FEATURE_KYC"* — i.e. the waiver is only
   coherent because the surface is **switched off**. Turning KYC on for real customers removes the
   entire basis of those waivers. They do not extend; they expire. `web-admin-verification`'s own
   reason text already says so: *"This waiver documents the gap, it does not clear it — real
   identity-verification data must not reach this surface until Feature 009's A-1 Stage 8 closes."*
2. A waiver is appropriate for a dormant or static surface (cf. `mobile-account-deletion-request`,
   waived only because the screens are static text with no API call, with conditions voiding it on
   the first backend call). An active flow ingesting government identity documents is the opposite
   case on every axis.
3. CT-4d makes it mechanical: no authorising Register A row → block.

**Recommended entry shape when the feature is created** (illustrative; the real entry is written at
review time, by me):

```
"id": "backend-kyc-documents",
"stage8": {
  "blocked": true,
  "verdict": "blocked-pending-security-review",
  "reason": "KYC document upload / full-ID processing. Pre-positioned blocked per
             docs/organization/kyc-identity-verification-security-architecture.md §6.
             Entry criteria E-1..E-4 unmet. Not eligible for a FEATURE_KYC-style waiver:
             those waivers are justified solely by the surface being switched off.",
  "owner": "cybersecurity-architect"
}
```

Note for `security-engineer`/`devops-engineer`: `stage8-manifest.schema.json` should be checked for
whether a `blocked` disposition is expressible at all — the schema today appears to model
`stage8.doc`+`verdict` or `stage8.waived`. If `blocked` is not representable, CI-1 currently forces
every surface into either "reviewed" or "waived," which is itself a gap: **a schema that cannot say
"blocked" will quietly convert a block into a waiver.** Raised as a finding, not fixed here.

---

## 7. Residual risks and open items owned out of this note

| ID | Item | Owner |
|---|---|---|
| KYC-R-1 | Storage/vendor decision coupling (§4.4) — combined scorecard | `integration-architect` + `cloud-infrastructure-architect` |
| KYC-R-2 | CT-4c Client sub-operator authorisation before any verification/storage vendor selection | `cto`/owner + `compliance-specialist` |
| KYC-R-3 | Full-number retention: my §3.1 "reject Option B by default" vs a possible FICA record-keeping requirement — **must be reconciled explicitly, not resolved by document order** | `cybersecurity-architect` + `compliance-specialist` |
| KYC-R-4 | No KMS/field-level-encryption capability exists platform-wide; it is a build | `security-engineer` + `database-architect` |
| KYC-R-5 | Profile-picture blob-in-Mongo pattern needs its own review pass (out of scope here) | `security-engineer` |
| KYC-R-6 | `stage8-manifest.schema.json` may not express a `blocked` disposition (§6) | `security-engineer` / `devops-engineer` |
| KYC-R-7 | Account-deletion flow is a `mailto:` with no backend erasure; storing ID documents raises the stakes on that gap materially | `compliance-specialist` + `backend-architect` |

**Nothing in this document is a sign-off.** It is a pre-position, written before the build, so that
the gate's requirements are known in advance rather than discovered at Stage 8.
