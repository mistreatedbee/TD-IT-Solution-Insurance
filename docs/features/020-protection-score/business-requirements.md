# Feature 020 — Protection Score (OB-09, Ruling A: non-pricing)

**Stage:** 1 — Business Requirements
**Owner:** `business-analyst`
**Date:** 2026-10-29
**Status:** Draft, ready for Stage 2 (`product-manager`) and Stage 1 compliance/QA sign-off checks below.

**Scope boundary.** This document specifies **only** the version of the protection score that does
**not** affect price, premium, discount or claim outcome ("Ruling A" in
`docs/organization/compliance-rulings-ob-items-2026-10.md` §3.2). The pricing-linked version
("Ruling B", conditions D-1…D-9) is explicitly **out of scope** here: it is blocked on the payment
gateway decision, on the insurer-licence question (C-011-6/G-17), and on `pricing-model-v2.md`.
Nothing in this document may be read as authorizing that version. Any future pricing-linked spec
is a **separate** Stage 1 document, not an amendment to this one, and must re-run the full
compliance/Stage 8 gate under Ruling B.

**Traceability.** Roadmap: `docs/organization/08-roadmap.md` Addendum §C "Different from others"
row OB-09, and §F item 8 ("Rulings from `compliance-specialist` on OB-05, OB-12 and OB-09, then
OB-09 Stage 1 (`business-analyst`). No build."). Compliance ruling:
`docs/organization/compliance-rulings-ob-items-2026-10.md` §3.2, conditions R09-1 through R09-4.
This is **paper only** — no engineering, no UI design, per the roadmap directive. Stage 2
(`product-manager`) must schedule UX Research/UI Design (Stages 3–4), Architecture/Database/API
Design (Stages 5–7), and Security Review (Stage 8) before any code exists.

---

## 1. Problem / opportunity

Customers have no in-app signal for how well they are using the protection features they already
pay for. A "protection score" (also acceptable name: "setup score" or "protection checklist", per
R09-1) gives customers a simple, motivating number that reflects **how completely they have set
up and used the platform's protection features** — nothing about their insurance risk, and
nothing that changes what they pay or what a claim is worth.

## 2. What this is, and what it explicitly is not

| | |
|---|---|
| **Is** | An account-completeness / engagement indicator. Encourages customers to finish registering assets, enable MFA, keep their policy active, and (once available) link hardware trackers. |
| **Is not** | An insurance risk rating. Not used in underwriting. Not used in pricing, premiums, or discounts (that is Ruling B, out of scope — see above). Not visible to or usable by claims adjudicators. Not an input to any claim decision (same principle as Feature 018 CC-6). Not a credit-style score shared with any third party. |

This distinction must be stated to the customer wherever the score appears (see §5).

## 3. Score inputs (data-driven configuration — not hardcoded per R09-style review)

Per compliance R09-3 and R09-4, an input is **disqualified** if it is consent-based (anything the
customer can opt in/out of, including Feature 008 self-device location consent, marketing opt-in,
analytics opt-in, OB-03 partner location-sharing grants) or if it is an area/geographic factor or
other proxy for special personal information (POPIA s26). The inputs below were screened against
both exclusions.

| ID | Input | Definition | Why it's fair/legitimate | Points model (illustrative — final weights are `product-manager` call) |
|---|---|---|---|---|
| **IN-1** | MFA enabled | Account has an active MFA factor (`backend/src/routes` auth/session state) | Security hygiene the customer controls directly; not consent-gated, not a proxy | Binary: on/off |
| **IN-2** | Profile complete | Required profile fields populated per `customer-profile-validation.ts` (excludes emergency-contact opt-in items under OB-12 review) | Data completeness supports faster service; no special-information fields involved | Binary or % complete |
| **IN-3** | Policy active (not lapsed) | Current policy status = active, no payment lapse | Directly reflects whether protection is actually in force | Binary: on/off |
| **IN-4** | Policy tenure | Time since policy start date, banded (e.g. 0–3mo / 3–12mo / 12mo+) | Reflects platform familiarity/engagement, not risk; same banding applies to every customer regardless of location or any protected characteristic | Banded, capped contribution |
| **IN-5** | Assets registered with required identifiers | Count of registered assets that have serial/IMEI captured per `asset-validation.ts`, as a proportion of assets owned (self-reported asset count) | Rewards action customer takes directly (entering data they already have); no consent dependency | Proportional, capped |
| **IN-6** | Theft/loss report filed and resolved without reopening | A prior recovery case (per `recovery.ts`) reached a resolved state and was not reopened/disputed | This is a **completion-of-process** signal (did the customer follow through with reporting/police-report capture per OB-11), **not** an outcome-based risk signal — it must not be read as "fewer claims = better." It measures administrative follow-through, not loss history, and carries low weight for that reason | Small, capped bonus; must not penalize customers with zero reports (zero reports = neutral, not negative) |
| **IN-7** | Identity verified | `verificationStatus: verified`, through the real admin/KYC review path only (per R05-3: never through the client-side ID checksum/DOB check, which is explicitly barred from being called "verification") | Confirms a real, non-consent administrative state; does not depend on any voluntary grant | Binary: on/off |
| **IN-8 (future, gated)** | Hardware tracker linked | A third-party GPS hardware device is linked and active, once a GPS vendor exists (per `tracking-profile.ts`'s "pending hardware" gating) and G-6 is answered | Deliberate hardware purchase/installation is an action, not a consent toggle, under R09-3's explicit list of permitted items | Not implementable until GPS vendor chosen — **do not build this input yet**; placeholder in the model only |

**Explicitly excluded inputs (must never be added without a fresh compliance ruling):**

- Feature 008 self-device location-sharing consent (any flavor) — R09-3.
- Any marketing or analytics opt-in — R09-3.
- OB-03 partner location-sharing grant — R09-3.
- Residential area, suburb, postcode, or any location-derived factor — R09-4 (known race proxy in South Africa).
- Any special personal information or proxy under POPIA s26 (health, biometrics beyond the
  liveness-check identity flow itself, religion, etc.) — R09-4.
- Claim frequency, claim value, or any claims-outcome-based factor — R09-1 (must not touch claims
  at all) and consistent with Feature 018 CC-6.
- Anything that functions as a reward for a voluntary grant of any kind (R09-3's general
  principle, not just the named examples).

## 4. Presentation to the customer

**Naming.** Displayed as "Protection checklist" or "Setup score" (R09-1) — never "risk score,"
"safety rating," or language implying insurance risk assessment.

**Required disclosure, shown adjacent to the score every time it is displayed** (exact copy is a
`ui-designer`/`technical-writer` deliverable at Stage 4/12, but the *content* is fixed here):

1. States plainly: "This does not affect your premium or your claims."
2. States what it *is for*: helping the customer see how fully they've set up their protection.
3. Each contributing item shown to the customer explains, in one sentence, what it does for the
   customer (R09-2) — e.g. "Enable MFA — keeps your account safer from unauthorized access,"
   not "Enable MFA to boost your score."

**Anti-dark-pattern constraints (R09-2), binding on UI/UX design at Stages 3–4:**

- No fear-based or untrue copy ("Your phone is at risk!").
- No false urgency or countdown pressure.
- No shaming language for a low score or missing items.
- No score decay designed purely to drive re-engagement (score may legitimately drop if, e.g.,
  policy lapses or MFA is disabled — that is a true-state change, not manufactured decay).
- No gamified streak mechanics.

**Access restriction:** the score and its component values must **not** be visible in any admin
view used for claims adjudication, and must **not** be passed as a field/parameter into any
claims API or workflow (R09-1). It may be visible to the customer themselves and, for support
purposes, to customer-support/account-admin views that are unrelated to claims decisioning — that
distinction must be enforced in the API/data design at Stage 6–7 and verified at Stage 8.

## 5. Acceptance criteria

**AC-1 (Non-pricing boundary)**
Given the protection score feature,
When any part of the system computes, stores, or displays it,
Then no code path connects the score to premium calculation, discount calculation, or claim
eligibility/adjudication — verified by Stage 8 security/architecture review confirming no shared
data path between the score service and `claims.ts`/`admin-claims.ts`/billing code.

**AC-2 (Input whitelist enforcement)**
Given the defined input list (IN-1 through IN-7, plus the gated placeholder IN-8),
When an engineer or future ticket proposes adding a new input,
Then the input is rejected unless it passes both exclusion screens in §3 (not consent-based, not
an area/geography or special-information proxy) and receives a dated compliance sign-off before
implementation.

**AC-3 (Zero-claims neutrality)**
Given a customer with zero recovery cases/claims ever filed,
When their score is computed,
Then IN-6 contributes a neutral (not negative) value — the customer is not penalized for having
nothing to report.

**AC-4 (Disclosure presence)**
Given the score is displayed anywhere in the customer-facing app,
Then the "does not affect your premium or your claims" disclosure is shown adjacent to it, every
time, with no dismiss-and-never-show-again state that removes the disclosure while the score
remains visible.

**AC-5 (No claims visibility)**
Given a claims adjudicator or any claims admin view,
When they review a claim,
Then the protection score and its component values are not present in that view, in the claim API
response, or in any claim-decision audit log entry.

**AC-6 (No dark patterns — content review)**
Given any UI copy string associated with the score (labels, item descriptions, empty/low-score
states),
When reviewed against R09-2,
Then no string uses fear, false urgency, shaming, or streak/decay-for-engagement framing — checked
by `compliance-specialist` and `ux-researcher` before Stage 4 sign-off, and spot-checked again at
Stage 10 (QA) against the final shipped copy.

**AC-7 (Verification source integrity)**
Given IN-7 (identity verified),
When the score is computed,
Then the value is sourced only from `verificationStatus: verified` set via the real
admin/KYC-review path, never from the client-side SA-ID checksum/DOB consistency check (R05-3).

**AC-8 (Vendor-gated input stays off)**
Given IN-8 (hardware tracker linked),
When no GPS hardware vendor has been selected,
Then IN-8 is absent from the computed score entirely (not shown as 0/unavailable in a way that
implies the customer is missing something they cannot yet obtain) — consistent with
`tracking-profile.ts`'s existing "pending hardware" honesty pattern.

**AC-9 (Data-driven configuration)**
Given the input weights and bands in §3 are illustrative,
When implementation begins (Stage 6/7),
Then weights/bands are stored as configuration (not hardcoded conditionals), so `product-manager`
can adjust weighting without a code deploy, per standard practice for tier/coverage rule tables.

## 6. Open items for downstream stages

- **Stage 2 (`product-manager`):** confirm final point weights/bands per input (§3's "points
  model" column is illustrative only); confirm whether IN-6 ships at all in v1 given its low
  signal value, or is deferred.
- **Stage 3/4 (`ux-researcher`/`ui-designer`):** exact score presentation (number vs. tier labels
  vs. checklist-only, no numeric score) and exact copy for each item and the disclosure, bound by
  §4's constraints.
- **Stage 5–7 (`solution-architect`/`backend-architect`/`database-architect`):** confirm the score
  computation has no shared code path or data access with `claims.ts`/`admin-claims.ts`/billing,
  satisfying AC-1 and AC-5 at the design level before Stage 8 review.
- **Stage 8 (`cybersecurity-architect`/`compliance-specialist`):** verify AC-1, AC-5, AC-7 at
  implementation; confirm no new consent-based or proxy input was introduced during build.
- **IN-8 (hardware tracker)** stays a documented placeholder only, per the GPS-vendor open
  decision (`08-roadmap.md` §D) — do not implement until a vendor is ratified and G-6 is answered.
- Pricing-linked version (Ruling B) is a **separate future Stage 1 document**, not an extension of
  this one, gated on payment gateway + G-17/C-011-6 per the compliance ruling.
