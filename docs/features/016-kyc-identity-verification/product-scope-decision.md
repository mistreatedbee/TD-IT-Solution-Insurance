# Feature 016 — Product Scope Decision (Stage 1 → Stage 2 handoff)

**Author:** `product-manager`
**Date:** 2026-09-21
**Status:** Ratifies scope. Does not open Stage 2 sprint work — that is `technical-project-manager`'s
call once `integration-architect` and `solution-architect` inputs below land, per the CTO's role
sequence (`docs/organization/cto-status/2026-09-21-status-and-dispatch.md` §8).
**Inputs read in full before this ruling:** `business-requirements.md` (this folder, `business-analyst`),
`docs/organization/kyc-identity-verification-security-architecture.md` (`cybersecurity-architect`),
`docs/features/013-sa-id-verification/compliance-review-kyc-identity-documents.md`
(`compliance-specialist`), `docs/features/013-sa-id-verification/business-requirements.md`,
CTO status/dispatch 2026-09-21 §8.

---

## 1. Numbering — Feature 016 stays open, but its scope is narrowed, not duplicated

Feature 013 already owns SA ID **algorithmic verification depth** (Tier 1 checksum/DOB-consistency,
committed; Tier 2 duplicate detection via peppered HMAC, scoped and now compliance-approved in
principle; Tier 3 document/vendor verification, explicitly out of scope pending a vendor decision).
Feature 016, as `business-analyst` drafted it, is a different layer: **what a customer must have on
file, and what verification status blocks**, consuming Feature 013's tiers as an input rather than
re-deriving them.

**Ruling:** keep Feature 016 as its own feature folder — it is not redundant with 013, it sits above
it — but its scope is **narrowed to exactly the gating/completeness layer**, not the "full KYC
including documents" framing in its own header. Feature 016 does not re-open or restate Feature 013's
Tier 1/2 mechanics; it consumes `verificationStatus` as Feature 013 (once Tier 2 ships) produces it.

## 2. First shippable increment — Tier 1 only, data-only, no documents

**Scope for Feature 016's committed Stage 2 build:**
- Feature 013 Tier 1 (already committed) + Tier 2 (peppered-HMAC duplicate detection — compliance
  ruling at `compliance-review-kyc-identity-documents.md` §6.2, "Option A: APPROVED IN PRINCIPLE,
  conditional") as the verification-depth substrate.
- FR-5/FR-6 gating enforcement (`business-requirements.md` §3.2) wired into asset creation, and
  pre-specified (not built) for claims filing once a claims backend exists.
- `KYC_VERIFICATION_REQUIRED` error code, per FR-5.

**Explicitly out of scope for this increment, and not implicitly re-added by any Stage 2/4 design
work:** ID-document upload, proof-of-address upload, selfie/liveness capture, any third-party
verification vendor call. This is a product decision, not a restatement of the blockers — it is made
*because of* them (no object storage or KMS/field-level encryption exists anywhere in this repo per
`cybersecurity-architect`'s note §0, and document-based KYC is a separate infra-dependent build, not
a phase of this feature). Object storage + encryption-at-rest capability is tracked as its own
infrastructure item (MP-5 plus the KMS gap `cybersecurity-architect` raised as KYC-R-4) — Feature 016
does not schedule against it and will not be re-scoped to include documents until that infra lands
and is Stage-8-reviewed independently.

## 3. Sequencing call — roadmap now, build behind a flag, activate on dependency close

Tier 1+2's real dependency chain, per compliance §6.3 (C-013-7): **cannot transmit the full ID number
server-side or write a peppered-HMAC key until CT-1 (cross-border consent) closes in the required
form, plus a supplementary §19(c) disclosure and G-11 are answered.** CT-1 is an existing open item
owned outside this feature (`cto`/owner, tracked in `10-data-protection-contract-obligations.md`) —
Feature 016 does not reopen it, only depends on it. Compliance's own §6.2 conditions additionally
require the CT-15/CT-16 disclosure follow-ons referenced in the task brief to close before Option A's
pepper key can be written in production.

**Decision: roadmap and design/build now, in parallel with CT-1/CT-15/CT-16 closing — not a hard stop
on starting work.** Reasoning:
- The mechanism (gating rule, error taxonomy, admin-review wiring, Tier 1 client/server validators)
  has zero dependency on CT-1 — it is pure application logic consuming a status enum that already
  exists. Blocking design/build entirely on a Client-side compliance closure wastes engineering
  capacity on a dependency this feature does not control the timeline of.
- This platform already has a working pattern for exactly this situation:
  `FEATURE_KYC_ENABLED` ships code dark and activates only once its own gate (Stage 8, here also
  CT-1/CT-15/CT-16) clears. Feature 016 reuses that pattern rather than inventing a new one — build
  and Stage 8 review proceed now; the peppered-HMAC **write path** and the gating **enforcement**
  stay behind the flag, off, until CT-1/CT-15/CT-16 close.
- What must NOT start now: any transmission of the full ID number to the backend, and any write of a
  peppered-HMAC key. Those two actions are the actual border-crossing event C-013-7 blocks, and they
  are late in the build sequence (post schema, post validator, post UI) — there is real, safe work to
  do before reaching that line.

**Sequencing owner:** `technical-project-manager` slots Stage 2 design work now; `cto`/owner and
`compliance-specialist` own closing CT-1/CT-15/CT-16; nobody flips the flag or writes a live HMAC key
until that closes, enforced the same way `FEATURE_KYC_ENABLED` is enforced today (code-comment +
Stage 8 manifest entry, not a verbal understanding).

## 4. Gating rule — ruling on `business-requirements.md` §4.3's open question

**Ruling: the gate applies at asset registration and at claims filing (once a claims backend exists).
It does not apply at subscription/billing time.**

Reasoning:
- Real insurable exposure attaches per-asset, not at the point a customer starts paying for a plan
  tier — a subscription today is a billing-and-feature-access relationship (`pricing-model-v2.md`),
  not itself a covered-item commitment. Gating it on KYC would add signup/conversion friction for a
  transaction that carries no coverage obligation yet.
- Payments/billing do not exist on this platform today (`CLAUDE.md` "Not built" list) — there is
  nothing to gate at subscription time in the current build regardless, so ruling otherwise would
  create a rule with no enforcement point until a separate feature (billing) ships.
- This is consistent with how `maxAssets` already gates per-asset rather than per-subscription, and
  with `business-requirements.md` §3.2's own recommended reading of the owner's "before we issue
  policies" framing — a policy's insurable exposure is asset-scoped in this platform's data model.

This closes FR-5/FR-6 as drafted (asset-registration hard gate; claims-filing hard gate,
pre-specified now for when the claims backend exists) with no subscription-time gate added.
`payment-engineer` should treat this as settled unless a future billing-feature PRD surfaces a new
reason to revisit it — not reopened by default when payments work starts.

## 5. FICA s29 — tracked separately, not part of this feature

The FICA §29 suspicious-transaction-reporting gap compliance surfaced (**C-013-9**,
`compliance-review-kyc-identity-documents.md` §8) is **not part of Feature 016's or Feature 013's
scope** and is not gated on, or gating, either. It applies to this business today regardless of
whether KYC ships, because s29 binds any business, not only accountable institutions. It is already
tracked with an owner (`compliance-specialist` + `cto`) and a deadline (2026-10-31) in Feature 013's
conditions register. This document does not duplicate that tracking — it only confirms, as the role
asked to make this call, that it must stay a standalone deliverable (a minimal reporting procedure
doc: who may suspect, who decides, who files) and must not be absorbed into Feature 016's KYC-gating
scope or slipped to wait on CT-1/Tier 2 closing, since it has no dependency on either.

---

## 6. Summary table

| Question | Ruling |
|---|---|
| New Feature 016 vs. fold into 013 | Keep 016 open, scope narrowed to gating/completeness layer only; verification-depth mechanics stay owned by 013 |
| First shippable increment | 013 Tier 1 + Tier 2 (data-only, peppered HMAC) + FR-5/FR-6 gating; documents/biometrics explicitly out of scope pending separate infra feature |
| Roadmap Tier 1/2 now or later | Roadmap and build now, behind a flag; activation (HMAC write + gate enforcement) held until CT-1/CT-15/CT-16 close |
| Gating rule | Asset registration + claims filing only; not subscription/billing |
| FICA s29 (C-013-9) | Own tracked item, `compliance-specialist` owner, 2026-10-31 deadline, independent of this feature — not merged in |
