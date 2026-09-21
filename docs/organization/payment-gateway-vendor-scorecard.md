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

**Update, 2026-09-21, `integration-architect` — Candidate C card-rail partner + sandbox research (public sources only). Append-only per house rules; nothing above is deleted.**

Researched per §8 Addendum / §9 precondition (b) ahead of the 2026-09-28 report-back deadline.
Sources: `ozow.com/our-products/card-payments`, Ozow's card-payments product-launch blog post,
`signup.ozow.com`, and general web search — no first-party API/integration-guide page or direct
vendor contact yet.

- **Card-rail partner: not identified from public sources.** Ozow's own card-payments page and its
  card-payments launch blog post do **not name an acquiring bank, card-processing partner, or
  payment-rail vendor** behind the card-payments product. The card-payments page states only that
  Ozow "simplif[ies] PCI compliance through Ozow's integration options" and references 3-D Secure
  and PCI DSS compliance generically, without identifying who the acquirer/processor is. A search
  for a "powered by" / partnership announcement for the card-payments product specifically
  returned nothing; the only named banking partnership found (FNB/RMB, August 2026) is for
  **account-to-account/Instant EFT API infrastructure, not card processing** — do not conflate the
  two. **This precondition is not resolved.** Direct vendor contact (Ozow merchant/partnerships
  team, or a signed sandbox account with access to card-payments integration docs, which appear to
  sit behind account creation rather than being public) is required to get a definitive answer.
  Until named, `cybersecurity-architect` cannot scope the PCI review for Ozow's card rail — only
  for its EFT/redirect rail, where Ozow itself is the counterparty and card data structurally never
  reaches us (SAQ-A-adjacent by construction, per §0(3)). The card-payments product is the
  unresolved half.
- **Implication for PCI scope if unresolved stays unresolved:** we cannot currently distinguish
  between (a) a hosted-fields/redirect model where Ozow or its card partner never exposes card data
  to us (consistent with §0(3) and likely SAQ A/A-EP), and (b) an integration model with a deeper
  PCI footprint. Ozow's own marketing language ("simplifying PCI compliance through integration
  options") is consistent with (a) but is not a documented technical guarantee — it is not
  sufficient evidence to close this out. Treat as **open, not favorable-by-default**, until either
  the partner is named and independently checked, or Ozow's own integration/API docs (which likely
  require a signed-up account to view) confirm the checkout model in technical terms.
- **Sandbox/developer-account turnaround (Ozow specifically):** `signup.ozow.com` is a single
  merchant-registration form (name, mobile, email, password, optional Google/Microsoft sign-in) —
  it does **not distinguish a sandbox/test account from a live merchant account**, and states no
  activation/approval timeframe. This means precondition (a) for Ozow cannot be derisked from the
  public site alone: we don't know from public sources whether signing up grants immediate sandbox
  API credentials, requires manual merchant-vetting/approval first, or requires a separate
  developer-portal request. This needs to be tested directly (attempt signup and observe what's
  granted) or confirmed via direct contact with Ozow, not assumed.
- **Net conclusion:** neither half of precondition (b) — nor Ozow's half of precondition (a) — is
  resolvable from public documentation as of 2026-09-21. Recommending direct vendor contact
  (Ozow partnerships/merchant-support channel) this week, in parallel with attempting the public
  signup flow to observe actual sandbox provisioning behavior firsthand, so there is a concrete
  answer — not another "still open" restatement — by 2026-09-28.

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

## 7. T-24 date disposition — 2026-09-21, `integration-architect`. Append-only.

Per the 09-14 CTO re-baseline (sub-reviews due 2026-09-25, decision + ADR-0010 due 2026-10-02)
and this role's standing instruction to confirm or deny by 2026-09-25: **DENY.** As of today, §3's
three commissioned sub-reviews (POPIA/s21/s72 per vendor — `compliance-specialist`; PCI SAQ-level +
hosted-fields — `cybersecurity-architect`; sandbox trial of C1/C5 — `payment-engineer`) have **zero
artefacts on disk** — no per-vendor review doc exists anywhere under `docs/`, matching the CTO's own
09-14 note ("sub-reviews never started"). This document itself has not been updated since 2026-08-28.
No evidence any of the three sub-reviews were commissioned by name in the four days since. §1's
scoring table remains entirely unpopulated (no candidate scored on any of C1–C8).

Five vendors × (POPIA review + PCI review + live sandbox account/trial) in the four working days
remaining to 2026-09-25 is not achievable starting from zero — each POPIA review alone
(`compliance-review-supabase.md`, `compliance-review-smtp-vendor.md`) took multi-day effort per
vendor previously. Sandbox trials additionally depend on obtaining live vendor developer accounts,
which is an access/procurement step not yet started and structurally similar to this org's T-25
infrastructure-access blocker. CT-4c (sub-operator authorisation before a PSP is appointed,
09-14 Appendix 1 §3) also sits upstream of the 2026-10-02 ADR-0010 date and has not been sequenced
with `compliance-specialist`.

**Honest revised estimate:** sub-reviews cannot land before **2026-10-09** at the earliest (assuming
commissioning starts this week and vendor sandbox access is granted within days, not weeks); decision
+ ADR-0010 no earlier than **2026-10-16**. If vendor account access stalls the way infrastructure
access has (T-25), there is currently **no reliable date** — treat 2026-10-09/2026-10-16 as a
re-baseline proposal pending confirmation of sandbox-account turnaround, not a committed date.
Commissioning the three sub-reviews by name starts today.

## 8. Owner steer — PayFast AND Ozow directed as parallel intended vendors, 2026-09-21, `integration-architect`. Append-only.

**What happened:** the platform owner (Ashley) has directed that TD IT Solution Insurance's
payment/billing integration and any client-facing communication should name **both PayFast
(Candidate E) and Ozow (Candidate C)** as directed/preferred vendors to pursue **in parallel** —
this is explicitly not a PayFast-vs-Ozow choice being made; both are being applied for/pursued
together, for distinct reasons (PayFast: recurring/subscription billing API + PCI DSS Level 1
posture; Ozow: SA-founded Instant EFT/bank-to-bank rail, redirect-based checkout). This is a real,
documented steer from the owner — not "still fully open" in the sense §5 described before today,
and this section supersedes §5's "no leaning" framing insofar as vendor *intent* is concerned. It
is recorded here because it changes what can honestly be told to the Client (see the
correspondence draft cross-referenced below), not because it changes the scoring or review
process for either vendor.

**What this steer does NOT do — applies equally to PayFast and Ozow:**

- It does **not** exempt either vendor from the §3 sub-reviews — POPIA operator-agreement/
  cross-border review (`compliance-specialist`), PCI SAQ-level + hosted-fields review
  (`cybersecurity-architect`), and a live sandbox trial of the relevant API
  (`payment-engineer`). Per §7, none of these has started for any candidate; both PayFast and
  Ozow are **not yet scored** on any of C1–C8, and this steer does not change that fact. Ozow's
  own open questions from §2 (recurring/subscription-API maturity less proven than the stronger
  candidates; card-rail PCI posture depends on which partner it routes through) remain
  unresolved and are not waived by this steer.
- It does **not** convert ADR-0010 into a formality for either vendor. `cto` and
  `solution-architect` still hold joint ratification authority per §"Deciders on ratification"
  above; this document records an owner *direction to proceed toward* PayFast and Ozow together,
  not a completed joint sign-off, and not a final choice between them. ADR-0010 will record
  whichever vendor(s) as Accepted only once the sub-reviews land and ratification actually
  happens — the two-vendor parallel pursuit itself may or may not be what ADR-0010 ultimately
  ratifies (e.g. review findings could still narrow this back to one).
- It does **not** authorize silently proceeding to production integration against either vendor
  if its sub-review turns up a disqualifying finding — most importantly, no defensible POPIA
  basis under §0 hard constraint (2), or a PCI posture that cannot support hosted-fields/
  redirect-only checkout under hard constraint (3). Per §6's revisit trigger, a vendor that fails
  those bars outright is removed from consideration, not kept on the strength of an owner steer,
  and **not silently substituted for the other vendor** — any disqualifying finding for either
  PayFast or Ozow must be **escalated back to the owner**, not overridden or quietly resolved by
  whoever is implementing at the time.

**Practical effect today:** `payment-engineer` and any client communication may describe both
PayFast and Ozow as vendors this platform is pursuing integration/application with in parallel,
consistent with the owner's direction. Engineering work that assumes either vendor's SDK/API
shape may reasonably proceed on a provisional basis, but should be written so it can be revisited
if a sub-review disqualifies either one — no billing code should hard-commit to either vendor as
contractually final until ADR-0010 exists.

Status line at the top of this document (§"Status") is not amended by this section — the document
remains **In progress**, no vendor ratified — because that line describes the formal decision
state, which this owner steer does not change.

See also: `docs/organization/correspondence/DRAFT-2026-09-21-client-payfast-direction-update.md`
for the client-facing draft this steer authorizes preparing (not sending — see that file's own
pre-send checklist).

**Addendum, 2026-09-21, `integration-architect`, following §9's CTO sequencing decision:** per §9,
sub-reviews are commissioned for **PayFast and Ozow only** in the near term; Peach, Paystack and
Netcash remain on the §2 shortlist but their sub-reviews are deferred (not cancelled), re-commissioned
only if a directed vendor is disqualified under §6. This role will report the two §9 preconditions
(sandbox/developer-account access; Ozow's card-rail partner identified before `cybersecurity-architect`
scopes its review) by 2026-09-28 as instructed.

## 9. CTO review of §7 and §8 — 2026-09-21, `cto`. Append-only.

**§8 (owner steer): concur as recorded.** The "not exempt from §3 sub-reviews" framing is strong
enough — it names the three sub-reviews, preserves §6's disqualification trigger, blocks silent
substitution of one vendor for the other, and keeps ADR-0010 as a real gate rather than a
formality. I add one binding constraint it does not state: **an owner steer is not a security or
compliance exception.** Any request to begin production billing integration against PayFast or
Ozow before its POPIA and PCI sub-reviews land requires a written CTO security exception under
my standing authority; absent that, provisional work stays behind an abstraction (the pattern
`backend/src/lib/tracking-profile.ts` already sets for the open GPS-vendor decision) and no
merchant credentials are provisioned into any environment.

**§7 (re-baseline proposal): the direction is right, the dates are not yet ratifiable.** I accept
the DENY of 2026-09-25/2026-10-02 — zero artefacts, correctly evidenced. I do **not** ratify
2026-10-09/2026-10-16 as committed dates, for a reason §7 predates: two directed vendors pursued
in parallel does not halve the review load relative to the §7 estimate unless the shortlist is
explicitly sequenced. **Sequencing decision (CTO):** sub-reviews are commissioned for **PayFast
and Ozow first**; Peach, Paystack and Netcash stay on the §2 shortlist but their sub-reviews are
deferred, not cancelled, and are re-commissioned only if a directed vendor is disqualified under
§6. That makes 2 vendors × 3 reviews the near-term load — plausible for 2026-10-09 **only if**
both of the following hold, and neither is currently true:

1. Sandbox/developer-account access is granted for both vendors within days (same procurement
   risk class as T-25); and
2. Ozow's card-rail partner is identified **before** `cybersecurity-architect` starts, because
   §2 Candidate C's PCI posture is inherited from an unnamed third party — that review cannot be
   scoped, let alone completed, until the partner is named. This is a dependency, not an
   unknown, and is the single likeliest cause of the 10-09 date slipping.

`integration-architect` to report both preconditions by **2026-09-28**; the 10-09/10-16 pair
remains a *proposal* until then and must not be quoted to the owner or Client as a commitment.

**ADR-0010: do not open it yet.** Payment gateway is unambiguously architecturally significant and
will require an ADR — but an ADR opened with an owner-directed vendor pair and zero sub-review
evidence documents a conclusion in search of a context, and this org has already had ADR content
misread as settled direction. §8 plus this section are the auditable record of intent in the
interim. Trigger to open ADR-0010 as **Proposed**: the first completed sub-review artefact for
either directed vendor lands on disk. It is then drafted against real findings, with the
two-vendor parallel model itself stated as an option under consideration rather than the premise.
