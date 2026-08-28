# Payment Gateway Vendor Scorecard

Owner: `integration-architect`
Status: **In progress — scorecard kickoff.** No vendor selected. Final ratification will be recorded as **ADR-0010** (number reserved by this document — no `0010` file exists elsewhere in `docs/organization/adr/` as of 2026-08-24).
Date opened: 2026-08-24 · Last updated: 2026-08-28 (shortlist correction — see §2 Candidate E)
Target decision date: **2026-09-14** (3 weeks from kickoff)
Deciders on ratification: `integration-architect` (recommendation) → `cto` + `solution-architect` (joint sign-off), per this role's standing authority (see `.claude/agents/integration-architect.md`, "Decision-Making Authority"). Consulted before ratification: `cybersecurity-architect` + `compliance-specialist` (PCI posture, POPIA lawful basis/data residency), `payment-engineer` (implementation feasibility against candidate SDKs), `backend-architect` (internal billing/subscription pipeline fit).

**Current repo state note (honesty check, per `07-documentation-standards.md`):** no payment code exists anywhere in this repository as of this writing. `backend/` has no billing/subscription module, no webhook receiver, and no payment SDK dependency. This document is a pre-build evaluation artifact, not a description of anything integrated.

---

## 0. Hard constraints (given, not open for debate)

These come from the CTO mandate and are non-negotiable filters, not scored criteria — a vendor that fails any one of these is disqualified before scoring begins:

1. **South African market.** Must support ZAR settlement and the payment methods South African cardholders actually use (3-D Secure card, and ideally Instant EFT / local bank-linked methods), with a South African or SA-serving merchant/payout relationship.
2. **POPIA-resident data processing.** Personal and payment-related data the gateway processes on our behalf must be processable under a POPIA-compliant lawful basis — either an SA-domiciled operator, or a foreign operator willing to execute a POPIA-adequate operator agreement (s21) with a defensible s72 cross-border transfer basis. This platform has an established review method for exactly this question (see `docs/features/001-authentication/compliance-review-supabase.md` §4–§6, applied again at `compliance-review-smtp-vendor.md`) — the eventual gateway review must follow the same method, not invent a new one.
3. **Hosted-fields / redirect checkout only.** Card data must never touch TD IT Solution Insurance's own servers, mobile app WebViews with raw field access, or logs — no self-hosted card form (SAQ A / SAQ A-EP-adjacent posture only, never SAQ D). The gateway's hosted-fields iframe, drop-in widget, or full redirect must be the only place a card number is typed. This is a platform-wide constraint (Non-negotiables, `CLAUDE.md` and this role's standing best practice), not vendor-specific.

Any candidate must be able to demonstrate (1) and (3) from public documentation before it is shortlisted at all. (2) is verified in the compliance sub-review before ratification, not assumed at shortlist time.

---

## 1. Scored evaluation criteria

Each candidate is scored 1–5 per criterion at scorecard-completion time (not yet scored below — see §4 for what's filled in now vs. what's pending). Weight reflects this platform's priorities: recurring subscription billing and compliance posture outweigh raw fee percentage, because a monthly-subscription insurance product lives or dies on billing reliability, not on shaving 0.3% off a transaction fee.

| # | Criterion | Weight | What "5" looks like |
|---|---|---|---|
| C1 | Recurring/subscription billing support | 20% | Native subscription/recurring-charge API (tokenized card, scheduled billing, dunning/retry on failed renewal, proration) — not "process a card" bolted onto manual cron jobs. |
| C2 | PCI compliance posture / hosted-fields quality | 20% | True hosted-fields or full-redirect checkout with a documented SAQ A (or A-EP) eligibility path; card data never transits our servers even transiently. |
| C3 | POPIA / data-residency posture | 15% | SA-domiciled entity or a documented, executable operator agreement + defensible cross-border transfer basis; clear sub-processor list. Scored fully only after the compliance sub-review — see §3. |
| C4 | Regional coverage / local payment methods | 15% | ZAR native, 3-D Secure card support, Instant EFT / local bank rails, same-day or T+1 settlement to an SA bank account. |
| C5 | Webhook/API quality for our integration model | 10% | Signed webhooks for payment events (success, failure, refund, dispute, subscription renewal/cancellation), idempotent event delivery, sandbox environment, clear retry semantics on our end. |
| C6 | Refund / dispute / payout handling | 10% | Self-service refund API, clear chargeback/dispute workflow, predictable payout schedule and fees. |
| C7 | Fee structure / cost at our scale | 5% | Transparent published pricing, no punitive minimums for a growing-but-not-yet-large subscriber base, no long lock-in contract. |
| C8 | Exit / portability | 5% | No proprietary tokenization that traps stored payment methods; reasonable data-export and account-closure terms. |

---

## 2. Candidate shortlist (research pass, 2026-08-24)

All four operate in South Africa and publicly document hosted-fields/redirect checkout. None is yet verified against the POPIA operator-agreement bar (C3) — that is explicit follow-up work, not assumed here. Sourced from public vendor documentation and third-party SA payments-market comparisons current as of this research pass; **not yet independently verified to first-party contract text**, matching the honesty standard `compliance-review-smtp-vendor.md` §1 sets for this kind of claim.

### Candidate A — Peach Payments
- **What it is:** Pan-African payment gateway headquartered in Cape Town/Johannesburg, SA-founded, positions itself for subscription/recurring commerce specifically.
- **Fit signal:** Publicly documents recurring billing / tokenization for subscription merchants (C1 strength), hosted checkout page and hosted-fields widget (C2), ZAR + multiple African currencies, card + Instant EFT + mobile money rails (C4), webhook-driven payment-status API (C5). SA-domiciled entity is a plausible POPIA residency advantage (C3) — to be verified.
- **Open questions:** exact SAQ eligibility documentation; whether their subscription API supports dunning/retry natively or requires us to build it; contract minimums at low volume.

### Candidate B — Paystack (South Africa)
- **What it is:** Pan-African gateway (Stripe-owned since 2020), SA entity/market presence, strong developer-facing API and documentation.
- **Fit signal:** Well-documented recurring/subscription API with plans and subscriptions as first-class objects (C1 strong), hosted checkout + inline hosted-fields popup (C2), signed webhooks with clear retry/idempotency docs (C5 strong — this is Paystack's known strength), transparent published SA pricing (C7).
- **Open questions:** Paystack's primary corporate/data-processing domicile is Nigeria/Stripe group — POPIA cross-border transfer basis (C3) needs the same s21/s72 analysis this platform already ran for Supabase and Brevo, not assumed favorable; Instant EFT / local SA bank-rail coverage needs confirmation relative to Peach/PayFast.

### Candidate C — Ozow
- **What it is:** SA-founded, Instant EFT-focused payment gateway (bank-to-bank, not card-first), also supports card processing via partners.
- **Fit signal:** SA-domiciled (POPIA residency advantage, C3), strong local bank-linked payment coverage (C4), redirect-based checkout (no card data touches us by construction for EFT flows, C2 strong for that rail). Popular for SA subscription/recurring debit-order-style billing.
- **Open questions:** recurring/subscription-specific API maturity for a monthly SaaS-style billing model (C1) is less proven than Peach/Paystack/Netcash — needs direct evaluation; card-rail PCI posture depends on which card partner they route through, needs clarification since we need both card and EFT support, not EFT-only.

### Candidate D — Netcash (PayGate)
- **What it is:** Established SA payment service provider (Net1/Netcash group), long operating history in the SA market, supports card, EFT, and debit-order recurring billing.
- **Fit signal:** SA-domiciled (C3 advantage), explicit recurring/debit-order billing product aimed at subscription businesses (C1), hosted PayGate checkout page (C2), broad SA bank/EFT coverage (C4).
- **Open questions:** developer experience/API and webhook quality (C5) is reported as dated relative to Peach/Paystack in third-party comparisons — needs direct sandbox evaluation, not assumed from marketing copy; modern hosted-fields (vs. older redirect-only flow) needs confirmation.

**Re-added to the active shortlist (research pass, 2026-08-28):** **PayFast** — the original 2026-08-24 pass excluded PayFast on the assumption that recurring billing was manual/semi-manual only. A follow-up check (2026-08-28) found PayFast now publishes a dedicated "Recurring Payments & Subscription Billing" feature page with an API that supports create/update/pause/cancel of a subscription schedule (monthly/quarterly/bi-annual/annual), tokenized card storage, and is a PCI DSS Level 1 Service Provider. This materially changes the C1 assessment from the original pass and PayFast is promoted from "fallback" to **Candidate E**, pending the same unresolved items as A–D: dunning/retry-on-failed-renewal behavior (does PayFast retry automatically or does the merchant have to poll and re-trigger — not yet confirmed from public docs), POPIA operator-agreement review (C3), and a direct sandbox trial (§3). SA-domicile (Cape Town-headquartered, part of Network International group) gives it a plausible C3 edge similar to Peach. Not yet scored — do not treat this promotion as a leaning, only as a correction to the shortlist composition.

### Candidate E — PayFast (promoted from fallback, 2026-08-28)
- **What it is:** Long-established generalist SA payment gateway (Network International group), Cape Town-headquartered.
- **Fit signal:** Publicly documented recurring/subscription billing feature and API (revised C1 assessment — see note above), hosted checkout (C2), PCI DSS Level 1 Service Provider, broad SA merchant adoption and WooCommerce/Shopify-ecosystem integration maturity signaling a mature, well-trodden integration path (lower implementation risk than newer entrants).
- **Open questions:** whether the subscription API's retry/dunning behavior on a failed renewal is automatic or requires the merchant to build its own retry logic (needs first-party API-doc read, not the marketing feature page used for this pass); exact SA-domicile/data-processing-location details for the POPIA sub-review; fee schedule at this platform's realistic year-1 volume.

---

## 3. What's still open before scoring can be finalized

| Item | Owner | Needed by |
|---|---|---|
| POPIA operator-agreement / cross-border transfer review for each shortlisted vendor (same method as `compliance-review-supabase.md` / `compliance-review-smtp-vendor.md`) | `compliance-specialist` | Week 2 (by 2026-09-04) |
| PCI SAQ-level confirmation + hosted-fields implementation review for each vendor | `cybersecurity-architect` | Week 2 (by 2026-09-04) |
| Sandbox trial of subscription/recurring API (C1) and webhook signing/idempotency (C5) against a throwaway test integration | `payment-engineer` | Week 2–3 |
| Fee-schedule confirmation at realistic year-1 subscriber volume, from `product-manager`'s subscriber projections | `integration-architect` + `product-manager` | Week 2 |
| Internal billing/subscription pipeline design constraints (what the backend can realistically consume) | `backend-architect` | Week 1–2 |

---

## 4. Working timeline to 2026-09-14

| Week | Dates | Milestone |
|---|---|---|
| 1 | 2026-08-24 – 2026-08-30 | Scorecard kicked off (this document). Candidate shortlist frozen at A–D + PayFast fallback. `backend-architect` briefed on internal pipeline constraints. Compliance and security sub-reviews requested. |
| 2 | 2026-08-31 – 2026-09-06 | `compliance-specialist` POPIA review and `cybersecurity-architect` PCI/hosted-fields review land for each candidate. `payment-engineer` begins sandbox trials of C1/C5 for the two strongest candidates. |
| 3 | 2026-09-07 – 2026-09-13 | Scoring table (§1) fully populated with weighted scores. Draft recommendation written. Joint review session with `cto` + `solution-architect` + `cybersecurity-architect` + `compliance-specialist`. |
| Decision | **2026-09-14** | ADR-0010 drafted and submitted for ratification, following the template in `07-documentation-standards.md`. Status moves from Proposed toward Accepted per normal ADR process (`.cursor/rules/adr-process.mdc`). |

---

## 5. Leading candidate (informal, pre-scoring)

**Not a decision.** Based on the hard-constraint fit and criteria weighting alone (before the POPIA/PCI sub-reviews land), **Peach Payments** and **Paystack** remain the two strongest candidates on paper — both have credible native subscription-billing APIs (this platform's highest-weighted criterion) and modern hosted-fields checkout. Peach has an edge on POPIA residency by virtue of SA domicile pending verification; Paystack has an edge on webhook/developer-experience quality. **Netcash and Ozow remain live candidates** on the strength of SA domicile and local-rail coverage but need direct evidence on subscription-API maturity before they can compete on C1. **PayFast (Candidate E) is now a live candidate, not a fallback**, following the 2026-08-28 correction above — its market maturity and PCI DSS Level 1 status are a genuine edge, but it is not yet a leader until its dunning/retry behavior and POPIA posture are confirmed in Week 2's sub-reviews.

## 6. Revisit triggers

- Any shortlisted vendor fails the POPIA operator-agreement review outright (no defensible s21/s72 basis) — removed from shortlist, not silently kept.
- `payment-engineer`'s sandbox trial reveals a candidate's subscription API cannot support the plan/proration model `product-manager` specifies — re-score C1 down.
- A materially different vendor not on this shortlist is identified before 2026-09-14 with a stronger fit — added to §2 rather than the deadline being used to exclude a better option.
