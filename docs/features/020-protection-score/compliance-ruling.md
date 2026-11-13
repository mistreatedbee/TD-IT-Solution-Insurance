# Feature 020 — Protection Score (Ruling A, non-pricing): Compliance Ruling (Stage 1 → Stage 2 gate)

**Owner:** `compliance-specialist`
**Date:** 2026-11-13
**Status:** Ruling issued. **Stage 2 UNBLOCKED** on the conditions in §8.
**Not legal advice.** Items marked **COUNSEL TO CONFIRM** are not settled here.
**Builds on, does not replace:** `docs/organization/compliance-rulings-ob-items-2026-10.md` §3.2
(R09-1…R09-4), as cited by `business-requirements.md` ("BRD"). Ruling B (pricing-linked score)
remains out of scope and is not authorised by anything here.

---

## 1. Regime determination

| Regime | Applies? | Note |
|---|---|---|
| POPIA s71 (automated decision-making) | **Not triggered, if and only if the §3 guardrails hold** | §2 |
| POPIA s18 (notice), s10/s13 (minimality, specific purpose), s15 (further processing), s26 (special PI) | **Yes** | §4, §5 |
| POPIA Regulations 2018 reg 4(1)(b) (personal information impact assessment by the Information Officer) | **Yes** — §6 | |
| Insurance Act 18/2017, PPR (Short-term), TCF outcomes, FAIS General Code (advertising/representations) | **Yes, as a representation constraint**, subject to the unconfirmed licence position (C-011-6/G-17) | §3 |
| TDIT-2026-09 §19(a)/(e) | **Yes** — a new processing purpose needs a Client instruction (CT-4d Register A row); no monetisation | §8 |
| GDPR Art 22 / Art 35 | Not confirmed applicable. If EU subjects ever appear, the same analysis applies; Art 22 is likewise not triggered without a significant-effect decision | — |

---

## 2. Is it profiling / automated decision-making under s71?

**s71(1)** prohibits subjecting a data subject to a **decision** that has **legal consequences** or
**affects them to a substantial degree**, based **solely** on automated processing intended to
build a profile (including of their *conduct* or *reliability*).

**Ruling:**
- **It is profiling in the ordinary sense.** It is an automated evaluation of the customer's own
  conduct on the platform. Treat it as profiling for transparency, minimality and DPIA purposes.
  Don't argue it away.
- **It is not an s71 decision**, because under Ruling A it produces **no decision about the
  customer**: no effect on price, cover, eligibility, claims, service level, priority, or access to
  any feature. A number shown only to the customer, which they can change by their own action, has
  no legal consequence and no substantial effect.
- **That conclusion is conditional.** It fails, and s71 attaches (requiring s71(3) safeguards:
  representations, sufficient information about the logic, and human review), the moment the score
  or any of its components does any of the following:
  - feeds pricing, discount, cover, underwriting, renewal or claims (that is Ruling B);
  - gates or ranks a service (e.g. support queue priority, recovery-case dispatch priority, partner
    response order);
  - is shared with any third party, insurer or security partner;
  - triggers adverse account action (suspension, verification demands).
  **Any of these needs a fresh compliance ruling before design starts. They are not changes a
  Stage 7 API review can approve.**

---

## 3. Insurance-regulation guardrail (binding)

The score **must not state, imply or be reasonably read as implying** anything about:
1. claim outcomes ("a higher score helps your claim"; "verified customers get paid faster");
2. pricing, premium, discounts or rewards;
3. cover eligibility, underwriting, renewal or acceptance;
4. the customer's insurance risk ("risk", "safety rating", "risk level", "insurability").

Rationale: under the TCF outcomes and the PPR/FAIS rules on representations, a customer-facing
indicator built by the insurer's own platform will be read as an insurer signal. If it implies a
benefit that does not exist, that is a misleading representation. If it implies a benefit that
*does* exist, then it is Ruling B. **COUNSEL TO CONFIRM** which PPR (Short-term) rules govern this
once the licence position is known.

**Operational corollaries:**
- **No architectural path** from the score to claims, pricing or billing (BRD AC-1/AC-5 adopted).
  Not stored on the claim, policy or asset documents. Not returned by any claims or admin-claims
  endpoint. Not in any claim-decision audit entry.
- **Support/admin visibility is limited to account-support views** (BRD §4). It must never be
  shown in the recovery/security-partner dashboards, so that it can't drive dispatch priority.
- **IN-3 / IN-7 wording risk.** "Policy active" and "identity verified" are true states with real
  insurance meaning. The item copy must describe **what the customer gets from the platform**,
  never what an insurer decides. Permitted: "Your plan is active, so your registered devices are
  covered under it." Forbidden: "Verify your identity so your claim can be approved."

---

## 4. Inputs — allowed vs forbidden

**Allowed** (BRD §3, screened against R09-3/R09-4 and the tests below):

| ID | Input | Ruling |
|---|---|---|
| IN-1 | MFA enabled | **Allowed** |
| IN-2 | Profile complete | **Allowed**, but **exclude** emergency-contact fields (third-party PI; OB-12) and **exclude** address-derived data. Count "field present" only, never field *values* |
| IN-3 | Policy active | **Allowed**, with the §3 wording constraint |
| IN-4 | Policy tenure (banded) | **Allowed**. Bands must be identical for all customers. Cap the contribution so that a new customer can still reach the maximum score band by their own actions (otherwise tenure becomes a de facto loyalty penalty) |
| IN-5 | Assets with identifiers captured | **Allowed**, proportional and capped. Must not weight by asset value or type (value is a wealth proxy) |
| IN-6 | Recovery case resolved, not reopened | **NOT allowed in v1. Deferred.** It requires the score service to read `recovery_cases` (incident history), which sits next to the claims data path AC-1 forbids. Even "neutral at zero" invites the inference "customers with resolved thefts score higher", which is loss history in disguise, and a reopened or disputed case is exactly where a customer is already in conflict with us. Low signal value (BRD §6 already questions it) does not justify that risk. Needs a fresh ruling to reinstate |
| IN-7 | Identity verified (admin/KYC path only, R05-3) | **Allowed**, with the §3 wording constraint |
| IN-8 | Hardware tracker linked | **Placeholder only**. Not built until a GPS vendor exists **and G-6 is answered**. When it is, it is the *fact of linkage* only, never any location data |

**Forbidden** (BRD §3 exclusions adopted, plus additions):
- Any consent-gated or opt-in state (location sharing, marketing, analytics, OB-03 grants) (R09-3).
- Any location data or location-derived factor, including GPS history, `lastLocation`, home or
  work inference, suburb, postcode or area (R09-4; area is a known race proxy in South Africa).
- s26 special personal information or proxies (race, health, religion, biometrics, etc.), and any
  children's data (s34).
- Claim frequency, value or outcome; fraud flags (018 CC-6); recovery-case history (IN-6 above).
- Payment behaviour, arrears or payment method (pricing/credit-adjacent; payments not built anyway).
- Asset value, asset type mix, device price (wealth proxy).
- Age, DOB, gender, ID-number-derived attributes.
- Behavioural or engagement telemetry: app opens, session time, `product_events` (CT-9 §19(e); also
  turns the score into an engagement lever, which R09-2 forbids).
- Anything sourced from a third party (partner, insurer, bureau).

**Change control:** inputs and weights are configuration (BRD AC-9), but **adding or reweighting
an input is a compliance change**, not a product toggle. Config changes to the input list need a
dated `compliance-specialist` sign-off recorded with the change (BRD AC-2). Weight-only changes
within allowed inputs can be made by `product-manager`, but each change must be logged.

---

## 5. Transparency and display wording rules

**s18 notice:** the privacy notice must describe the score as a processing purpose: what it uses
(the allowed inputs), that it is computed automatically, that it is not used for any insurance
decision, and that the customer can see the breakdown. This is a **new purpose** (s13/s15). It must
appear in the notice **before launch**, and the Client must instruct it (CT-4d).

**Display rules (content binding; exact copy is for `technical-writer`/`ui-designer`):**
- **W-1. Name:** "Protection checklist" or "Setup score" only (R09-1). Recommend **checklist-first**:
  a list of items with done/not-done is more honest than a number and avoids implying precision or
  rank. If a number is shown, the breakdown must be one tap away and show every contributing item.
- **W-2. Adjacent disclosure every time** (BRD AC-4): *"This does not affect your premium, your
  cover or your claims."* (I add **"cover"** to the BRD's wording.) It cannot be permanently dismissed.
- **W-3. Explain the logic** (s18 transparency, s71(3)(b) good practice even though s71 is not
  triggered): one sentence per item on what it does **for the customer** (R09-2).
- **W-4. No comparison or ranking:** no "better than 80% of customers", no leaderboard, no percentile.
- **W-5. No insurer vocabulary:** forbidden terms include risk, rating, insurable, eligible, qualify,
  approved, premium (except inside the W-2 disclaimer), discount, reward, benefit tier.
- **W-6. R09-2 anti-dark-pattern rules adopted** (no fear, urgency, shaming, streaks or engineered decay).
- **W-7. Unavailable items** (IN-8) are omitted entirely, not shown as missing (BRD AC-8).
- **W-8. Access right:** the customer can see every input value that went into their score (s23).
  Support staff see what the customer sees, nothing more.

---

## 6. DPIA / personal information impact assessment

**Ruling: yes. A proportionate PIA is required before Stage 8.** It is not optional.
- POPIA reg 4(1)(b) requires the Information Officer to ensure a personal information impact
  assessment is done. This is a new profiling purpose over existing PI.
- It does not need to be heavyweight. Cover: purpose and Register A authority; input list with the
  §4 screen; proof of data-path separation from claims/pricing/billing (AC-1/AC-5); retention (§7);
  misrepresentation risk (§3); and the s71 trip-wires in §2.
- The PIA is **reopened mandatorily** on any §2 trip-wire, any new input, or any move toward Ruling B.
  Ruling B needs a full DPIA.
- Owner: `compliance-specialist` drafts; `cybersecurity-architect` contributes the data-flow section.
  The Client's Information Officer signs it (Responsible Party).

---

## 7. Retention and minimisation

- **Compute on read; do not persist score history.** If a cache is needed for performance, it holds
  current value only, with no time series. A stored history becomes a behavioural profile with no
  purpose that justifies it.
- On account deletion: hard delete (`015-account-deletion/compliance-ruling.md` §3 D-15).
- Not included in analytics exports or `product_events` (CT-9).

---

## 8. Gate decision

**Stage 2: UNBLOCKED**, conditional on:
(a) IN-6 removed from v1 scope;
(b) the §3 guardrail and §5 wording rules carried into Stage 3–4 briefs;
(c) the Register A instruction for this new purpose requested from the Client (CT-4d) in the next
consolidated schedule;
(d) the PIA (§6) scheduled to complete before Stage 8.

**Stage 8 will verify:** AC-1/AC-5 data-path separation in code; the input list matches §4 exactly;
no stored history; disclosure present on every render; the privacy notice updated; the PIA signed.

## 9. Questions for admitted counsel

1. Once the licence position is known, which PPR (Short-term) / FAIS General Code provisions govern
   customer-facing indicators issued by an insurer's or FSP's platform, and does the W-2 disclaimer
   suffice to stop the score being read as a representation about cover?
2. Does the Information Regulator treat a customer-only, no-consequence score as falling outside
   s71 entirely? (I rule that it does; I want confirmation that "affects to a substantial degree"
   excludes motivational display.)
3. Is a reg 4(1)(b) PIA the Client's Information Officer's to sign, or can the Operator's be relied on?

**Filed by:** `compliance-specialist`, 2026-11-13. Not committed.
