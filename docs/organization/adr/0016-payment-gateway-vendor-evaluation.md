# ADR-0016: Payment Gateway Vendor Evaluation (Candidate Scorecard — Open Decision)

Status: **Proposed — open decision under evaluation, not Accepted.** This document is evaluation
input for a joint `cto`/`solution-architect` go/no-go. It does not select, authorize, or commit
the business to any vendor, and no integration work should start against any candidate named
here until a follow-up ADR records an actual ratified decision with a new status.

Date: 2026-10-29
Author: `integration-architect`
Deciders (final ratification, not yet made): `cto`, `solution-architect`, with
`cybersecurity-architect`/`compliance-specialist` sign-off required before any contractual
commitment.

## Context

ADR-0001 explicitly left the payment gateway as an open decision. As of this writing:

- **Feature 018 (claims)** has been built and stops at an `awaiting_payout` terminal state —
  there is no payout backend route (`backend/src/routes/` has no `payments.ts`, no payout
  adapter) and no vendor wired in.
- **Subscription billing has zero backend** — no recurring-billing routes, no plan→invoice
  logic beyond the Feature 006 plan catalog (which is informational/admin-editable pricing, not
  a billing engine).
- Both gaps need the same underlying decision: a payment gateway capable of (a) recurring
  monthly subscription billing per plan tier, and (b) one-off payouts/disbursements to customer
  bank accounts for claim settlements — these are two different capabilities (collecting money
  vs. paying it out) and not every SA vendor does both well.

### Constraints this vendor must integrate cleanly with (from existing ADRs)

- **Hosting (ADR-0003):** backend is a persistent Node.js/Express process on Render — any vendor
  SDK/webhook model that assumes serverless Functions, or requires a specific PaaS, is not a
  constraint issue; Render can run any outbound HTTPS client and receive any inbound webhook.
  No vendor is ruled out on hosting grounds.
- **Database split (ADR-0002):** identity → Supabase Postgres, domain data (policies, assets,
  claims, cases) → MongoDB Atlas. Payment/subscription state is domain data and would live in
  MongoDB per that split — this favors vendors with a clean webhook-driven state model
  (push events the backend persists into its own domain collections) over vendors that expect
  to be the system of record queried live, since MongoDB is already the domain source of truth
  here.
- **TypeScript-everywhere (ADR-0001):** favors vendors with first-party or well-maintained
  TypeScript/Node SDKs and typed webhook payloads over vendors requiring heavier client
  libraries in other languages.
- **No object-storage vendor yet (MP-5):** irrelevant to payments directly, noted only because
  claim-evidence photo upload and claim payout are adjacent but separate open decisions — don't
  conflate them.

### Two distinct capabilities needed

1. **Recurring subscription billing** (customer → platform, monthly, per plan tier): card and/or
   EFT debit, retries on failed charges, plan upgrade/downgrade proration, dunning.
2. **Claim payout / disbursement** (platform → customer, one-off, irregular amount and timing):
   bank transfer (EFT) to an arbitrary SA bank account, not necessarily card-based — most SA
   gateways built for *collecting* card payments do not natively support *paying out* to
   arbitrary recipients, which is the single biggest differentiator below.

## Evaluation Criteria

| Criterion | Why it matters here |
|---|---|
| Recurring/subscription billing support | Needed for monthly plan-tier billing |
| Payout/disbursement capability | Needed for claim settlement to customer bank accounts |
| SA banking rail integration | EFT/instant-EFT/bank-to-bank rails, not just card rails |
| Pricing/fee structure | Per-transaction cost compounds across subscriptions + payouts |
| Compliance posture / PCI-DSS scope impact | Platform wants to minimize cardholder-data handling scope |
| API quality / SDK maturity | TypeScript/Node support, webhook signing, sandbox quality |
| SA regulatory considerations | Payment facilitation licensing, SARB/PASA rail access, FSCA overlap with insurance payouts |

Research basis: vendor marketing pages, independent comparison write-ups, and press coverage
accessed 2026-10-29 (sources listed per vendor). Several figures below are explicitly flagged
**unverified** where sources conflicted or were third-party, not vendor-primary — confirm against
each vendor's own current docs/pricing page before any commercial conversation.

## Candidate Scorecard

### Paystack (The Stack Group)

- **Recurring billing:** Yes — plan/customer/subscription API model (create plan → customer →
  subscription), interval from hourly to annual, subscription lifecycle endpoints (list,
  enable/disable, card-update links).
- **Payout/disbursement:** Primarily a collections (pay-in) gateway for the SA market; payout/
  transfer-to-bank-account capability is strong in Paystack's Nigeria product but its maturity
  and availability for SA-originated disbursements is **not confirmed** from available sources —
  needs direct vendor confirmation before counting on it for claim payouts.
- **SA banking rails:** Card-first; licensed and operating in SA since the 2022 SA launch, under
  The Stack Group restructuring (Jan 2026).
- **Pricing:** ~2.9% + R1 ex VAT per card transaction for SA merchants (third-party sourced,
  **unverified** — confirm on paystack.com/za pricing).
- **Compliance posture:** Paystack is a payment processor, not a Merchant of Record — tax/
  compliance obligations stay with TD IT Solution Insurance. PCI scope depends on integration
  method (hosted vs. server-to-server), same general principle as Peach below.
  Settlement-delay/account-hold complaints appear in third-party comparisons — a source with a
  commercial interest, so a caveat rather than a finding.
- **API/SDK:** Documented REST API with webhook model; third-party Node/TS usage is common in the
  African SaaS ecosystem. Sandbox and developer docs considered mature.
- **SA regulatory fit:** Operates under SA payment-facilitation licensing per its SA launch.
- **Verdict for this platform:** Strong candidate for the **subscription-billing** half; **weak
  or unconfirmed** for the **claim-payout** half. Would likely need pairing with a
  payout-specialist vendor (Stitch/Ozow) if chosen — i.e., not a single-vendor answer alone.

### Peach Payments

- **Recurring billing:** Supports tokenization/recurring card charges via its standard gateway
  product; recurring-billing-specific documentation not directly reviewed in this pass — flag for
  follow-up with vendor.
- **Payout/disbursement:** **Yes, explicitly** — "Real-Time Clearance (RTC) Payouts" product,
  launched for SA merchants (reported Aug 2025), single API or dashboard, automated bulk
  payments, failed-payment reprocessing, not blocked by a down recipient bank, funds typically
  available to recipient within ~90 seconds, priced at roughly half its prior per-transaction
  payout fee (no absolute rand figure found — **unverified**, confirm with vendor).
- **SA banking rails:** RTC payouts ride SA's real-time clearing rails directly to recipient bank
  accounts — this is the strongest payout-specific fit found among candidates researched.
- **Pricing:** Not independently confirmed for either collections or payouts in rand terms —
  **needs vendor quote**.
- **Compliance posture:** PCI DSS Level 1 certified (vendor claim, from Peach's own marketing).
  Peach's own technical content states PCI scope depends on integration model — hosted checkout
  keeps the platform in the lowest PCI scope tier; server-to-server (sending cardholder data
  through TD IT Solution's own backend) pushes the platform into the highest scope tier. **This
  is the single most actionable finding for `cybersecurity-architect`/`compliance-specialist`
  review: if Peach (or any card-accepting vendor) is chosen, hosted checkout / tokenized
  redirect flow should be the default integration pattern, not server-to-server card collection,
  specifically to avoid pulling the platform's own backend into higher PCI-DSS scope.**
  PCI DSS 4.x requirements effective 31 March 2025 are now baseline, not future-dated.
- **API/SDK:** REST API, payouts available via API or dashboard for merchants not ready to
  integrate programmatically — useful fallback path for an early go-live.
- **SA regulatory fit:** SA-headquartered payments company, operates under SA licensing.
- **Verdict for this platform:** Strongest single candidate found for **claim payout** — worth a
  direct vendor conversation specifically about combining its card-collection product
  (subscriptions) with its RTC payout product (claims) under one commercial relationship, before
  assuming a two-vendor split is necessary.

### PayFast (Network International)

- **Recurring billing:** Vendor announced a native recurring-billing feature (subscription model
  and "ad hoc" model) via its own blog. A third-party billing-integration vendor claims PayFast
  does *not* run recurring logic itself and only offers subscription tokens for use with an
  external billing engine — this directly **conflicts** with PayFast's own announcement; treat as
  unresolved until confirmed directly with PayFast, not something to build a billing design on
  yet.
- **Payout/disbursement:** No payout-to-arbitrary-bank-account product identified in sources
  reviewed — PayFast's core product is card/Instant EFT collection, not disbursement. Likely
  **not fit for claim payouts** without further vendor confirmation.
- **SA banking rails:** Instant EFT supported for collections.
- **Pricing (third-party, unverified):** cards 2.0%–3.5% tiered by volume, Instant EFT 1.5%–2.0%,
  no mandatory monthly fee on basic plan; one review aggregator cites a payout fee of ~R8.70 and
  a dispute fee of ~R250 — note this payout fee likely refers to *merchant settlement payout*
  (PayFast paying the merchant its own collected revenue), not a disbursement-to-customer
  product, which is a different thing from what Feature 018's claim payout needs. This
  distinction needs to be nailed down with the vendor directly, not assumed from a review site.
- **Compliance posture:** Not independently reviewed this pass beyond general PCI-DSS exposure
  implied by card acceptance.
- **API/SDK:** Long-established SA gateway, mature integrations across WooCommerce/major SA
  e-commerce stacks; native TS/Node SDK maturity not directly confirmed.
- **Verdict for this platform:** Plausible **subscription-billing** option pending resolution of
  the recurring-logic conflict above; **not currently a payout candidate**.

### Yoco

- **Recurring billing:** Conflicting evidence — one 2026-dated third-party FAQ states Yoco does
  not support subscriptions/recurring billing; competing third-party integration vendors claim
  they can trigger recurring charges through Yoco (commercial interest, not independent
  confirmation); a subscription-platform vendor says Yoco is unsupported for its product. Net
  read: **recurring billing is not a reliable native Yoco capability today** — treat as
  unsupported until Yoco's own docs say otherwise.
- **Payout/disbursement:** No disbursement-to-customer-account product identified; Yoco's payout
  concept found in sources refers to merchant settlement (next-day payout of Yoco's own
  collected card revenue to the merchant), not disbursement to a third-party (customer) account.
  **Not fit for claim payouts.**
  Marketing cites free next-day payouts including Sundays/public holidays as a merchant-side
  settlement feature.
- **Pricing:** Conflicting figures — 1.95% flat-rate promo vs. 2.95% card-only cited by a 2026
  comparison; both **unverified** against Yoco's own current pricing page.
- **Verdict for this platform:** Primarily an in-person/card POS-oriented gateway; weak fit for
  either requirement as currently evidenced. Lower priority unless Yoco publishes clear
  subscription support.

### Ozow

- **Recurring billing:** Ozow's core product is Instant EFT pay-in (bank-to-bank push payment at
  checkout); no native recurring/subscription billing product identified in sources reviewed.
  **Not currently a subscription-billing fit** on its own.
- **Payout/disbursement:** **Yes** — "Ozow Payouts" product: EFT payout via API to accounts at
  SA's major banks, batched payouts supported, real-time clearing payout option available.
- **SA banking rails:** Directly rail-native (bank-to-bank), which is the point of the product —
  no card network in the loop for either pay-in or payout.
- **Pricing/compliance/API maturity:** Not independently confirmed this pass — needs vendor
  conversation.
- **Verdict for this platform:** Credible **payout-only** candidate, comparable in shape to
  Stitch below; would need pairing with a card/subscription vendor for the billing half.

### Stitch

- **Recurring billing:** Stitch's "Pay by Bank" product supports bank-initiated payment flows
  including recurring debit-order-style use cases in its broader product set, per its own
  product marketing, but a dedicated SA subscription-billing feature parity with Paystack's
  plan/subscription API was not directly confirmed in sources reviewed — flag for vendor
  follow-up rather than assuming parity.
- **Payout/disbursement:** **Yes, enterprise-oriented** — "Stitch Payouts": disbursements to any
  SA bank account, 24/7 operation across available payment rails with fallback routing between
  banks/rails if one is unavailable, instant or same-day (T+1) settlement, scheduled one-off or
  bulk disbursement from a float account. A 2022 secondary source notes Stitch's customer base
  includes insurance-sector companies, though no SA insurance-claims-specific case study was
  found to confirm fit for this exact use case.
- **SA banking rails:** Rail-agnostic by design (routes across available rails), which is
  attractive for payout reliability specifically — directly relevant to claim payouts needing to
  "fail safely, not silently" per this role's own best practices.
- **Pricing/compliance:** Not independently confirmed — enterprise-tier vendor, likely requires a
  direct commercial conversation rather than self-serve sign-up; this itself is a data point
  (longer sales cycle, possibly minimum volume commitments) relevant to a startup-stage platform.
- **Verdict for this platform:** Along with Peach's RTC product, the strongest **payout**
  candidate found — rail-fallback design is a meaningful resilience property for a product whose
  core promise (claims) depends on payout actually landing. Needs direct engagement to confirm
  pricing/minimums are viable at this platform's current scale.

## Summary Table (directional, not final scores — see per-vendor caveats above)

| Vendor | Recurring billing | Claim payout to bank a/c | SA rails | Pricing clarity | Compliance posture confirmed | Overall fit |
|---|---|---|---|---|---|---|
| Paystack | Strong | Unconfirmed/weak | Card-first | Partial (unverified) | Partial | Subscriptions only |
| Peach Payments | Plausible, unconfirmed detail | **Strong (RTC)** | Card + RTC rail | Needs quote | Good (PCI L1, documented scope model) | Best single-vendor candidate overall |
| PayFast | Conflicting evidence | Weak/unclear | Card + Instant EFT | Partial (unverified) | Not reviewed | Subscriptions only, pending clarification |
| Yoco | Weak/unconfirmed | Weak | Card | Conflicting | Not reviewed | Low priority |
| Ozow | Weak | **Strong** | Bank-native EFT | Needs quote | Not reviewed | Payouts only |
| Stitch | Unconfirmed | **Strong (enterprise, rail-fallback)** | Bank-native, multi-rail | Needs quote, enterprise sales cycle | Not reviewed | Payouts only, enterprise-leaning |

## Observations for `cto`/`solution-architect`

1. **No single researched vendor is a confirmed, fully-evidenced fit for both capabilities.**
   Peach Payments is the closest to a one-vendor answer (card collection + its own RTC payout
   product) and deserves the first direct vendor conversation, specifically to confirm recurring-
   billing feature parity and get real SA-rand pricing for both products under one contract.
2. **A two-vendor split (collections + payout specialist) is a realistic fallback**, e.g. Paystack
   or PayFast for subscriptions paired with Stitch or Ozow for claim payouts — this doubles
   integration/webhook-security surface area (two signature schemes, two sets of credentials, two
   retry/idempotency models) and should be weighed against Peach's single-vendor option on
   integration-complexity grounds, not just fee comparison.
3. **PCI-DSS scope is a decision lever, not just a compliance checkbox**: whichever card-based
   vendor is chosen, defaulting to hosted-checkout/tokenized-redirect integration keeps the
   platform's own backend out of higher PCI scope tiers — this should be a hard requirement in
   the eventual integration contract handed to `payment-engineer`, not an implementation detail
   left open.
4. **Claim payout reliability matters more than claim payout cost** for this product's core
   promise — Stitch's explicit rail-fallback design and Peach's RTC "not blocked by a down
   recipient bank" framing both speak to this; Ozow's payout product should be asked the same
   resilience question directly before being treated as equivalent.
5. **All pricing figures above are third-party-sourced and flagged unverified** — before any
   go/no-go, get direct current-rate quotes from Peach, Paystack, and whichever payout specialist
   is shortlisted; do not budget off numbers in this document.
6. **South African regulatory note:** payment facilitation in South Africa sits under SARB/PASA
   payment-system oversight and, for card acquiring, card-scheme rules enforced through acquiring
   banks/PSPs — none of the candidates surfaced an SA-specific insurance-payout regulatory
   wrinkle beyond standard PSP licensing in sources reviewed, but this platform combines
   insurance claim payouts with payment facilitation, which is exactly the kind of overlap
   `compliance-specialist` should confirm doesn't trigger FSCA-adjacent payment-facilitation
   obligations beyond what a pure e-commerce merchant would face. This is flagged, not resolved,
   by this document.

## Next Steps (not authorized by this ADR — recommendation only)

1. `cto`/`solution-architect` review this scorecard and decide whether to proceed to direct vendor
   conversations (recommended: Peach Payments first, given single-vendor potential).
2. Any vendor conversation that produces real pricing/contract terms should be appended to this
   document as a dated section (per this repo's append-only convention for shared lifecycle
   docs) rather than overwriting the research above.
3. `cybersecurity-architect`/`compliance-specialist` review required before any contractual
   commitment, specifically on PCI scope strategy (item 3 above) and the FSCA-overlap question
   (item 6 above).
4. Once a vendor is ratified, this ADR is superseded by a new ADR recording the actual decision
   (status: Accepted) — this document's status remains "Proposed — open decision" until then.

## Revisit Trigger

Reopen/update this document if: any candidate's pricing or feature claims above are confirmed or
contradicted by direct vendor engagement; a new SA vendor becomes relevant; or `cto` sets a
decision deadline that this evaluation needs to be finalized against.
