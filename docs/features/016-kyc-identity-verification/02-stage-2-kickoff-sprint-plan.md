# Feature 016 — Stage 2 Kickoff & Sprint Sequencing Plan

**Lifecycle stage:** 2 — Product Planning (opening sprint work; exit artifact per
`docs/organization/02-feature-lifecycle.md` row 2: "Prioritized backlog item, scoped, target
milestone assigned")
**Stage owner (A) for this artifact:** `technical-project-manager`
**Date:** 2026-10-23
**Authorizing decision:** CTO approval, today, of the scope ratified in
[`product-scope-decision.md`](product-scope-decision.md) §2/§3 — this document does not reopen
or restate that ruling, it operationalizes it into sprint sequencing and a downstream dispatch
order per that decision's own line: *"Sequencing owner: `technical-project-manager` slots Stage 2
design work now; `cto`/owner and `compliance-specialist` own closing CT-1/CT-15/CT-16."*
**Reads required before this doc:** `product-scope-decision.md` §2 (scope: Tier 1 only, data
only, no documents) and §3 (sequencing: roadmap/build now, behind a flag, activate only on
dependency close).

---

## 1. Scope committed for this kickoff — no broader than this

Per `product-scope-decision.md` §2, the **only** increment this kickoff opens design/build
sequencing for is:

- Feature 013 **Tier 1** (SA ID checksum/DOB-consistency — already committed) as the
  verification-depth substrate consumed by this feature's gating layer.
- FR-5/FR-6 gating enforcement (`business-requirements.md` §3.2) wired into asset creation only
  — claims-filing gating is **pre-specified, not built**, since no claims backend exists.
- The `KYC_VERIFICATION_REQUIRED` error code (FR-5).

**Explicitly not in scope for this kickoff, and not to be silently re-added by any Stage 3–7
design work that follows:**
- Feature 013 **Tier 2** (peppered-HMAC duplicate detection) **design may proceed** (see §3 below
  for why it's sequenced in, carefully) but its **write path does not activate** this pass —
  bounded by the hard constraint in §2.
- ID-document upload, proof-of-address upload, selfie/liveness capture, any third-party
  verification vendor call. **Tier 3 / documents are out of scope for this entire feature pass**,
  not deferred to a later sprint within this kickoff — per `product-scope-decision.md` §2, that
  requires its own infra feature (object storage + KMS, MP-5 / KYC-R-4) and its own Stage-8 review,
  independently of this one.

If any architect's Stage 5–7 output reaches for documents, Tier 3, or a vendor call, that is scope
creep against a CTO-approved ruling and must be flagged back to `technical-project-manager`/
`product-manager` before proceeding, not absorbed silently.

---

## 2. Hard constraint — binding on every stage of this feature, not a suggestion

**Nobody sends the full ID number to the backend, writes a peppered-HMAC key, or turns on gating
enforcement until `CT-1`, `CT-15`, and `CT-16` close.**

These are tracked at `docs/organization/10-data-protection-contract-obligations.md`:
- **`CT-1`** (§9–§10) — cross-border consent for personal information processed in Frankfurt.
  Status as of this doc's last recorded entry: sent 2026-09-14, informally acknowledged, **consent
  not confirmed in the required form** — i.e. **not closed**.
- **`CT-15`** (§14.1) — supplementary §19(c) disclosure covering transmission of the **full
  13-digit SA ID number** to Frankfurt for verification/duplicate detection. Explicitly **blocks
  any widening of `customer-profile-validation.ts`'s 4-digit `idNumber` schema**. Depends on CT-1
  closing in the required form first.
- **`CT-16`** (§14.1) — re-putting Register B item G-11 (widened) plus new G-15/G-16 to the Client:
  whether the Client instructs collection of the full ID number, identity documents/proof of
  address, and any biometric/liveness data at all.

All three are owned outside this feature (`cto`/owner + `compliance-specialist`) and this feature
**does not reopen them** — it only depends on their closure, per `product-scope-decision.md` §3.

### 2.1 What this means concretely for design and build

Everything in Feature 016 ships **dark behind a feature flag** until CT-1, CT-15, and CT-16 all
close. This reuses the platform's existing pattern (`FEATURE_KYC_ENABLED`,
`mobile/src/config/features.ts`), not a new mechanism:

| Allowed now (design + build, flag OFF in all real builds) | Blocked until CT-1/CT-15/CT-16 close |
|---|---|
| Schema design, validators, UI copy, state-machine wiring, Tier 1 checksum logic, the `KYC_VERIFICATION_REQUIRED` error code and its asset-creation gate check | Transmitting the **full** (13-digit) ID number from client to backend in any request payload |
| Tier 2 **design** (peppered-HMAC approach, key-management plan, duplicate-detection query shape) | **Writing** a peppered-HMAC key, or deriving/storing any HMAC value from a real customer's full ID number |
| Admin-review wiring against the existing `pending_review` queue | **Enforcing** the FR-5/FR-6 gate against real customer traffic (flag stays OFF; code path may exist, dark) |

### 2.2 Enforcement mechanism required — not optional, not verbal

Both of the following are **mandatory deliverables of this feature**, not aspirational:

1. **Code comments at every implementation point** that touches the three blocked actions above
   (full-ID-number transmission, HMAC key write, gate-enforcement flip), each comment citing
   `CT-1`, `CT-15`, and `CT-16` by number and stating the flag must remain off until all three
   close — following the existing precedent at `backend/src/lib/customer-profile-validation.ts`'s
   CT-11 comment ("Do not widen this back to a 13-digit regex") and
   `mobile/src/config/features.ts`'s `FEATURE_KYC_ENABLED` doc comment (INC-001 A-12 / F009-1
   citation style). `backend-engineer`/`backend-architect` own naming the concrete flag(s) at
   Stage 7 (API Design) — this document does not prescribe the flag's exact name or location, only
   that it must exist, default OFF, and carry this citation at every call site a reviewer could
   plausibly flip without reading documentation first.
2. **A Stage 8 (Security Review) manifest entry** — `cybersecurity-architect` must record, as part
   of this feature's Stage 8 sign-off artifact, an explicit line item: *"Full-ID-number
   transmission / HMAC key write / gate enforcement BLOCKED pending CT-1, CT-15, CT-16 — verified
   flag default is OFF in all non-local build profiles."* This is a hard-gate condition of Stage 8
   sign-off for this feature, consistent with CT-4d's standing rule (10-data-protection... §14.1
   row) that *"every feature review must cite the Register A row authorising its processing, or
   block."* Stage 8 cannot sign off this feature without this line item present.

`technical-project-manager` will check for both artifacts at the Stage 8 gate review before this
feature is allowed into Stage 9 (Development) proper for the two blocked actions — Tier 1 gating
logic that never touches the full ID number may proceed to Stage 9 independently (see §3).

---

## 3. Sequencing — Stage 2 now, then domain architects, in this order

Per `product-scope-decision.md` §3's reasoning (the gating mechanism has zero dependency on CT-1;
only the full-ID-number transmission and HMAC write do), this kickoff splits the work into two
tracks so the CT-1/15/16 dependency blocks only what it must:

### Track A — Tier 1 gating mechanism (no dependency on CT-1/CT-15/CT-16)
Pure application logic consuming the existing `verificationStatus` enum. No full ID number
involved anywhere in this track.

1. **Stage 2 (this document)** — `technical-project-manager` — scope and sequencing. **Done, this
   artifact.**
2. **Stage 3/4 (UX Research / UI Design) — fast-pathed, not skipped.** This track introduces no
   new screens: it reuses the existing `admin-verification.ts` review surface and adds one new
   client-facing error state (`KYC_VERIFICATION_REQUIRED` on asset creation), following the same
   existing pattern as `ASSET_LIMIT_REACHED`. Recommend `ui-designer` confirm the error-message
   treatment in a short async review rather than a full research/design cycle — flag to
   `product-manager` if they disagree this qualifies for the lifecycle doc's fast-path language
   (`02-feature-lifecycle.md` "Fast path for small changes"), since Stage 8/10 remain hard gates
   regardless either way.
3. **Stage 5 (Architecture Review)** — `solution-architect`, with `backend-architect`,
   `database-architect` as primary contributors; `cybersecurity-architect` consulted early rather
   than waiting for Stage 8, given this is PII-adjacent even in Track A (reads `verificationStatus`
   and `idNumberLast4`-scoped data, never the full number).
4. **Stage 6 (Database Design)** — `database-architect` — confirm no new fields needed for Track A
   beyond what Feature 013 Tier 1 already defines; this is a read-and-gate pattern, not new
   storage.
5. **Stage 7 (API Design)** — `backend-architect` — `KYC_VERIFICATION_REQUIRED` error code,
   asset-creation gate check, flag-naming decision for the §2.2 enforcement mechanism (names the
   concrete flag(s) that must default OFF).
6. **Stage 8 (Security Review) — hard gate** — `cybersecurity-architect` — must include the §2.2
   manifest entry. Can complete independently of CT-1/CT-15/CT-16 closing, since Track A never
   transmits or writes against those conditions — but the manifest entry documenting that
   boundary is itself a precondition of sign-off.
7. **Stage 9 (Development)** onward proceeds normally once Stage 8 signs off.

### Track B — Tier 2 design only (peppered-HMAC approach), write path stays dark
Design proceeds now per `product-scope-decision.md` §3's "design/build now, in parallel" call —
but "build" here means scaffolding the dark code path, never executing the write.

1. Stage 5–7 (Architecture/Database/API Design) for Track B run **after** Track A's Stage 5 is
   underway, not blocking it — `backend-architect`, `database-architect`,
   `cybersecurity-architect` jointly own the HMAC key-management design (where the pepper lives,
   rotation, and the fact that it is not written in any environment until CT-15 closes).
2. Stage 8 for Track B is **the same Stage 8 pass as Track A** (one feature, one security review,
   per `business-requirements.md`'s own expectation that Stage 8 "will need to cover both the
   pre-existing gap and any new... surface in one pass") — but Track B's sign-off explicitly
   conditions activation on CT-1/CT-15/CT-16 per §2.2 item 2 above.
3. Track B's code may merge to `main` **dark** (flag OFF) once Stage 8 clears; it does not go live
   until the flag flips, which is a CT-1/CT-15/CT-16-closure event, not a deployment event.

### Proposed architect dispatch order (for `cto`/dispatcher to action next — not dispatched by this role)

1. **`backend-architect`** — Stage 5 input for Track A (gating mechanism feasibility against
   Feature 004 asset-creation routes) and Track B (HMAC design feasibility) in the same pass.
2. **`database-architect`** — Stage 6 input, run right after/alongside `backend-architect` — confirm
   Track A needs no schema change, scope Track B's eventual HMAC-index storage shape (design only).
3. **`cybersecurity-architect`** — brought in early (not held until Stage 8) given this is
   identity/PII-adjacent from the first architecture conversation — confirms the §2.2 flag
   boundary is architecturally sound before Stage 7 API contracts are drafted, then owns the
   formal Stage 8 gate later.

This order lets Track A move fastest (it has no CT-1/15/16 dependency) while keeping Track B's
design work visibly bounded by the same three architects in one coordinated pass, rather than
reopening architecture review twice for one feature.

---

## 4. Milestone

Target: Track A (gating mechanism, flag OFF, Stage 8-reviewed) ready for Stage 9 Development
within this sprint cycle, contingent on Stage 5–8 artifacts landing on schedule. Track B merges
dark in the same or the following sprint. **No milestone commits to a live-activation date** —
activation is gated on CT-1/CT-15/CT-16 closing, which this role does not own or control the
timeline of, per `product-scope-decision.md` §3.

---

## 5. Risk register entries (for `technical-project-manager`'s standing risk register)

| Risk | Owner | Status |
|---|---|---|
| CT-1/CT-15/CT-16 remain open; no committed close date as of this writing | `cto`/owner, `compliance-specialist` | Open — tracked at `10-data-protection-contract-obligations.md` §9/§10/§14.1, not duplicated here |
| Scope creep toward Tier 3/documents during Stage 5–7 design | `technical-project-manager` (monitor), `product-manager` (arbiter) | Open — guarded by §1 above |
| Flag-default-OFF regression (the INC-002 fail-open class of bug already seen once on `FEATURE_KYC_ENABLED`'s EAS profile handling) | `backend-architect`/`mobile-architect` at Stage 7, `cybersecurity-architect` at Stage 8 | Open — must be explicitly tested, not assumed, per §2.2 |

---

**Next step:** `cto` dispatches `backend-architect`, `database-architect`, and
`cybersecurity-architect` per §3's order to open Stage 5 (Architecture Review). This document does
not dispatch them.
