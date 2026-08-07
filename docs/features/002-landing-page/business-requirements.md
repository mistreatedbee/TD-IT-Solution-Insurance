# Feature 002 — Public Landing Page

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst`
**Contributors:** `product-manager`, `compliance-specialist`
**Status:** Draft — **compliance-specialist review complete and signed off (CQ-1 through CQ-6 all resolved — see Section 12)**; still pending product-manager sign-off on CTA approach (OQ-1) and pricing-teaser scope (OQ-2). One item carries a hard pre-production blocker: the FSP/insurer licence numbers in Section 12.5 are placeholders and must be replaced with real registration numbers before this page is published (Section 12.5, Section 12.8).
**Related system areas (RACI):** none (static marketing page — no backend, no database, no auth surface)

**Process note:** this feature is intentionally scoped lighter than Feature 001. It has no coverage/eligibility/payment logic, no PII collection beyond an optional contact/waitlist form, and no database. The lifecycle in `docs/organization/02-feature-lifecycle.md` is still followed honestly — see Section 6 for the explicit disposition of Stages 5–8, which do not apply here and are recorded as skipped-with-reason rather than silently omitted.

---

## 1. Business Goal

TD IT Solution Insurance currently has **no real public-facing page** — the only thing deployed is an internal design-system component showcase at `/components/*`. There is nothing on the internet that tells a prospective customer what the company does, what it covers, or how to engage with it. This feature delivers the first real page: the public landing/home page.

The landing page must accomplish three things:

1. **Explain the product clearly.** A visitor with zero context should understand, within seconds, that this is a monthly-subscription insurance product that protects valuable physical assets (vehicles, laptops, phones, tablets, TVs, desktops, business equipment) and helps recover them if lost or stolen, working with GPS tracking hardware and security-company partners.
2. **Establish trust.** This is an insurance company asking people to eventually hand over financial information, details about valuable possessions, and (in a later phase) real-time location data. A landing page for a company like this carries a materially higher trust bar than a generic SaaS marketing page — visitors are implicitly being asked "can I trust this company with my property and my money." Trust signals (security-partner credibility, data-handling posture, transparent legal/contact information) are a functional requirement, not a nice-to-have.
3. **Convert visitor interest into a captured lead**, calibrated to what the product can actually deliver today (see Section 5 — there is no live signup flow yet, so "convert" means "capture interest," not "complete a purchase").

**Non-goal:** this page does not need to sell a specific plan/price point today (see Section 2.5) — pricing details are a teaser, not a checkout flow.

---

## 2. Required Page Sections / Content Blocks

This section specifies *what must be present and why*, not visual design (that is Stage 3/4 — UX Research / UI Design — territory).

### 2.1 Hero
- Value proposition stated in one sentence: what the product is, who it's for, what problem it solves.
- Primary CTA (see Section 5 for what it should actually do).
- Secondary, lower-commitment action (e.g., "See how it works" scroll/anchor link) for visitors not ready to convert.
- Must not overstate current capability — see Section 4.

### 2.2 How It Works
- A simple 3-step explanation: **Subscribe** to a plan → **Register your assets** → **GPS-assisted recovery** if something is lost or stolen.
- Each step's copy must reflect what is actually buildable/planned per the roadmap (Section 4), not an idealized end-state presented as current.
- Purpose: this is the single highest-value trust/comprehension block on the page — insurance products fail to convert when the mechanism is unclear.

### 2.3 Asset Types Covered
- Explicit list, matching the domain vocabulary already established in `docs/organization/README.md` and Feature 001: vehicles, laptops, smartphones, tablets, TVs, desktop computers, business equipment, other electronics.
- Purpose: lets a visitor self-qualify ("do they cover what I own") without reading a policy document.
- Must not state per-asset coverage caps or dollar/rand amounts here — those are policy-tier specifics owned by product-manager/cto and not yet finalized; this section names *categories*, not limits.

### 2.4 Trust / Credibility Signals
- Mention of GPS-tracking + security-company-partner recovery model (framed accurately per Section 4 — as the product's model, not as "your device is being tracked live right now" if that capability isn't shipped).
- A statement about data-handling posture appropriate for a South African company handling personal information (see Section 4.1 — compliance-specialist to confirm exact wording/claims).
- Space reserved for eventual: security-company partner logos, underwriting/insurer-backing disclosure (if applicable — flagged to product-manager/compliance-specialist, not assumed), industry accreditation marks.
- **No fabricated trust signals.** If a specific security-company partnership, insurer backing, or accreditation is not yet real/confirmed, it must not appear on the page, including as a placeholder that reads as real (e.g., no fake partner logos "to fill space").

### 2.5 Pricing / Plans Teaser
- High-level plan tiers (names/positioning only — e.g., "Basic / Standard / Premium" style framing) with a clear "starting from" framing if any price anchor is shown at all.
- Must explicitly avoid presenting this as final, binding pricing if the tier/pricing matrix has not been ratified by product-manager/cto. If no ratified pricing exists yet at build time, this section should read as "plans coming soon" / "join the waitlist for pricing," not display invented numbers.
- Links through to more detail only if that detail exists; otherwise this is a teaser block, not a pricing page.

### 2.6 Testimonials (Placeholder)
- Structural placeholder only. **No fabricated testimonials, quotes, names, or star ratings.** This platform has no customers yet (Phase 0/pre-MVP) — any testimonial content would be false advertising.
- Acceptable content for this block pre-launch: omit entirely, or a neutral "we're just getting started" framing, or social-proof substitutes that are actually true (e.g., "built by an insurance and asset-recovery team" if true) rather than invented customer quotes.
- Flagged explicitly so `ui-designer`/`technical-writer` do not fill this block with placeholder-that-looks-real content during implementation.

### 2.7 FAQ
- Should address the questions a skeptical prospective insurance customer actually has: what's covered, how claims work at a high level, cancellation flexibility, how GPS recovery works, data privacy.
- Answers must be consistent with Section 4 (no overstated capability) and must not restate specific coverage/claims business rules that haven't been finalized elsewhere (link out to future policy-terms/help-center content rather than inventing answers here).

### 2.8 Final CTA
- Restate the primary CTA (Section 5) once more before the footer, standard marketing-page convention — same action, not a different one, to avoid confusing the visitor about what "the" next step is.

### 2.9 Footer
- Legal links: Privacy Policy, Terms of Service (even if these are placeholder/"coming soon" documents at this stage — the *links* and *disclosure that they're pending* should exist rather than nothing).
- Contact information (support email/contact form).
- Regulatory disclosures if applicable — **flagged to compliance-specialist, not asserted here** (Section 4.1).
- Company registration/legal entity name, matching what's on `public/logo.png` branding ("TD IT Solution Insurance") consistently.
- Copyright line, current year.

---

## 3. Domain Vocabulary Used On This Page

Per the domain-glossary consistency practice, this page must use terminology consistent with `docs/organization/README.md` and Feature 001, not invented synonyms:

| Term used on page | Must match |
|---|---|
| "Assets" (not "items"/"belongings" inconsistently) | Vehicles, laptops, smartphones, tablets, TVs, desktop computers, business equipment, other electronics |
| "Policy" / "Plan" | Consistent with subscription-tier language product-manager will formalize |
| "GPS-assisted recovery" (not "live tracking" pre-Phase 2 — see Section 4) | Matches roadmap phasing |
| "Security-company partner" | Matches `README.md`'s "security-company partners" language, not "recovery agents"/"field team" or other unratified terms |

No formal domain glossary file exists yet in `docs/` (also noted as a gap in Feature 001's Pre-Approval Checklist). This page's copy should be treated as an early input to that glossary once `technical-writer` stands one up, not a one-off wording exercise.

---

## 4. Regulatory / Compliance Content Requirements — Flagged for compliance-specialist Confirmation

The following are **requirements-gathering questions and likely obligations**, not asserted facts — business-analyst does not have authority to finalize regulatory content and is flagging these for compliance-specialist review per the Pre-Approval Checklist. None of these should be treated as "probably fine, ship it" without that review:

- **CQ-1 (Insurance marketing claims):** South African insurance marketing content is typically subject to constraints on not overstating coverage, guarantees, or outcomes (e.g., no "we will recover your stolen device" absolute-guarantee language — recovery is best-effort, dependent on GPS hardware, tracking status, and security-company action). Compliance-specialist to confirm whether specific disclaimer language is required near any recovery-related claim on this page (Section 2.2, 2.4).
- **CQ-2 (Link to actual policy terms):** If the page references coverage, plans, or claims at all, compliance-specialist to confirm whether a visible link/reference to full policy terms and conditions is required even at the marketing stage, or whether "terms available at signup" is acceptable pre-launch.
- **CQ-3 (POPIA-compliant privacy notice):** The footer's Privacy Policy link and any contact/waitlist form (Section 2.9, Section 5) will collect personal information (at minimum an email address). Compliance-specialist to confirm what POPIA requires to be disclosed at the point of that collection (purpose, lawful basis, referencing the same s11/s13 minimality principles already ratified for Feature 001) even for a simple lead-capture form, and whether a full Privacy Policy document must exist before the form goes live or whether an interim notice is acceptable.
- **CQ-4 (Cookie / tracking consent):** If any analytics, marketing pixels, or cookies are used on the landing page (e.g., for conversion tracking), compliance-specialist to confirm whether a cookie-consent banner or equivalant POPIA-aligned notice is required before those scripts fire, and what the minimum viable mechanism is for a static marketing page.
- **CQ-5 (Regulatory/insurer disclosures):** Compliance-specialist and product-manager to confirm whether TD IT Solution Insurance operates as, or in partnership with, a licensed insurer/underwriter in South Africa, and if so, whether standard insurance-marketing disclosures (FSP number, underwriter name, etc.) are legally required on a marketing page even before checkout exists. Business-analyst does not assume an answer either way — this is flagged as a real open question, not resolved here.
- **CQ-6 (Testimonials/social proof honesty):** Confirmed above (Section 2.6) as a hard rule (no fabricated testimonials) — this is asserted as a general advertising-honesty principle, but compliance-specialist should confirm whether South African advertising standards (e.g., ASA-equivalent) impose additional specific constraints beyond general honesty.

**None of CQ-1 through CQ-6 block drafting the page structure and non-claims copy**, but **CQ-1, CQ-3, and CQ-5 should be resolved before the page's recovery-claims and lead-capture-form copy is finalized for production**, consistent with the Pre-Approval Checklist requirement that compliance-specialist reviews rules touching regulated disclosures before sign-off.

---

## 5. What NOT to Claim Yet

Cross-checked against `docs/organization/08-roadmap.md`. The product roadmap places GPS tracking, theft-report flow, live tracking map, and Security Company Dashboard recovery handoff in **Phase 2 — GPS & Recovery**, not Phase 1 (MVP) and certainly not the current state (Phase 0 — no product code beyond the design-system showcase). This has direct, binding consequences for landing-page copy:

- **Must NOT claim:** "Live GPS tracking," "track your device in real time," "see your assets on a map right now," or any present-tense claim that GPS ingestion, geofencing, or live tracking is an available feature today. These are Phase 2 roadmap items, not shipped or even architected yet.
- **Must NOT claim:** an active theft-report → recovery workflow exists today (also Phase 2).
- **Must NOT claim:** a working signup, login, or account system exists today. Feature 001 (Authentication) is at Stage 1 (Business Requirements) as of this writing — designed, not built. The page must not present "Sign Up" as if it leads to a functioning account-creation flow, because no backend or database exists yet (per `docs/organization/README.md`'s "Current reality check").
- **Must NOT claim:** specific coverage payout amounts, per-asset coverage caps, or finalized pricing, since no coverage/tier matrix has been ratified by product-manager/cto at the time of this writing (Section 2.5).
- **Must NOT claim:** existing named security-company partnerships, insurer backing, or accreditations that are not confirmed real (Section 2.4).
- **Acceptable framing instead:** describe the product's *model* and *intent* honestly — "GPS-assisted recovery, coordinated with security-company partners" as how the product is designed to work, without asserting the tracking/recovery pipeline is live and operable by a customer today. Roadmap-stage features may be described as "coming" or omitted, but never presented in present tense as already operable.
- This is a hard requirement, not a style preference: an insurance company that markets capabilities it doesn't have is both a false-advertising exposure and a direct trust-and-reputation risk for a company whose entire pitch is "trust us with your valuables." `business-analyst` will block sign-off on any copy draft that violates this section, and will re-flag to compliance-specialist for CQ-1 review regardless.

---

## 6. Primary CTA — Recommendation

**Problem:** there is no functioning signup flow to send a visitor to. Feature 001 (Authentication) is designed but not built; there is no backend, no database, no account system (per `docs/organization/README.md`'s current-reality-check and Feature 001's own status). A "Sign Up" or "Get Started" button that either 404s, links to nothing, or drops a visitor into an unfinished/fake flow is worse than no CTA — it directly damages the trust goal in Section 1.

**Recommendation: the primary CTA should be a lead-capture action, not a signup action.**

Concretely: **"Get Notified" / "Join the Waitlist"**, backed by a lightweight contact/waitlist form (name + email, minimal fields per POPIA minimality — see CQ-3) that captures interest and, ideally, sends a confirmation. This should be framed as *"be first to know when we launch"* rather than implying immediate account creation or coverage purchase.

Rationale:
- **Honest about current state** — directly consistent with Section 5; nothing about "join the waitlist" overstates what's live today.
- **Still captures the business value of the page** — product-manager and marketing get a real lead list to convert once Phase 1 (MVP: auth, asset registration, payment) actually ships, rather than losing every visitor who arrives before launch.
- **Low compliance surface** — a name+email waitlist form is a much smaller POPIA footprint than an account-creation flow, and doesn't require Feature 001 to exist first, so this feature is not blocked waiting on auth.
- **Avoids the "dead button" anti-pattern** — a CTA that goes nowhere (disabled button, placeholder "#" link, or a link to `/components/*`) is explicitly worse than a smaller, honest ask, because it's a visible broken promise on a company's own homepage.

**What to explicitly avoid:**
- A CTA labeled "Sign Up" or "Get Started" that routes to a nonfunctional or stubbed signup page.
- A CTA that silently does nothing (unwired button) shipped to production.
- Any implication that submitting the waitlist form is itself a policy application, purchase, or binding action of any kind.

**Escalation:** this is a recommendation, not a unilateral decision — product-manager owns final call on go-to-market timing and whether an early-access/waitlist strategy fits the launch plan, and should confirm or override this before Stage 2 (Product Planning). If product-manager decides the launch strategy is "hold the landing page until Feature 001 ships, then launch page + real signup together," that is also a valid resolution — but it should be a deliberate decision, not a default caused by nobody choosing a CTA behavior.

---

## 7. Out of Scope for This Feature

- Actual account creation / signup logic (Feature 001, separate feature, not yet built).
- Actual pricing/policy-tier matrix finalization (product-manager/cto decision, referenced but not authored here).
- Full Privacy Policy / Terms of Service document authorship (compliance-specialist / legal, referenced but not authored here — this feature only requires that the *links and disclosure structure* exist).
- Help-center / claims-process detail content (future `technical-writer` deliverable, seeded by this doc's terminology).
- Any backend, database, or API work — this is a static marketing page.
- Localization/multi-language support (not raised as a requirement here; flag to product-manager if needed).

---

## 8. Stages 5–8 Disposition — Explicitly Skipped, With Reasoning

Per `docs/organization/02-feature-lifecycle.md`, no stage is silently skipped — dispositions are recorded, not omitted:

- **Stage 5 (Architecture Review) — N/A.** This feature is a static marketing page built with the existing React 18 + Vite + TypeScript + Tailwind stack already in the repo. There is no new architectural surface (no new service, no new data flow, no integration) beyond adding routes/pages to the existing frontend. `solution-architect` involvement is not required; if the page later needs analytics/tracking integration (CQ-4) or a real backend-connected waitlist form, that specific addition should trigger its own lightweight review, not this whole feature.
- **Stage 6 (Database Design) — N/A.** No database exists in this repo, and this feature does not introduce one. If the waitlist form (Section 6) needs persistent storage rather than a third-party form service, that is a small follow-on decision for `database-architect`/`backend-architect`, scoped separately and only if a third-party form/email service is not used instead.
- **Stage 7 (API Design) — N/A.** No new API contract is introduced by a static page. A waitlist form may call a third-party service (e.g., an email/CRM tool) rather than a first-party API; if a first-party endpoint is later chosen, that specific piece re-enters Stage 7 on its own, scoped narrowly (one endpoint, not a re-review of this whole feature).
- **Stage 8 (Security Review) — N/A for the static page itself.** There is no auth, no payment processing, and no sensitive data handling in the page shell. The **narrow exception** is the waitlist/contact form (if built as first-party, Section 6) and any analytics/cookie tooling (CQ-4) — those specific pieces should get a lightweight security/compliance look proportionate to their actual risk (a name+email form field), not a full Security Review gate re-run for the whole landing page. This exception is noted here so it isn't mistaken for "security review was forgotten."

Stages 9 (Development) through 15 (Continuous Improvement) proceed normally and are not addressed in this Stage 1 document.

---

## 9. Acceptance Criteria (Lightweight Checklist)

Given the lower stakes of this feature (no money, no coverage, no claims logic), acceptance criteria are expressed as a scannable pass/fail checklist rather than full Given/When/Then, consistent with this document's "appropriately lighter" scope:

**Content presence**
- [ ] Hero section present with one-sentence value proposition and a primary CTA.
- [ ] "How It Works" section present, covering subscribe → register assets → GPS-assisted recovery, phrased per Section 5 (no present-tense overclaim).
- [ ] Asset-types-covered section lists all eight categories from Section 2.3, matching domain vocabulary (Section 3).
- [ ] Trust/credibility section present, contains no fabricated partner names, logos, or accreditation marks.
- [ ] Pricing/plans teaser present, does not display unratified/invented pricing figures.
- [ ] Testimonials block contains zero fabricated quotes, names, or ratings.
- [ ] FAQ section present, answers consistent with Section 5's honesty constraints.
- [ ] Final CTA present and identical in action to the hero CTA (Section 2.8).
- [ ] Footer present with: Privacy Policy link, Terms of Service link, contact info, company legal name, copyright line.

**Honesty / roadmap-accuracy**
- [ ] No copy anywhere on the page claims live GPS tracking, live device location, or an active theft-report/recovery workflow as available today.
- [ ] No copy implies a working signup/account/login system exists.
- [ ] No copy states specific coverage payout amounts or finalized pricing not yet ratified by product-manager/cto.

**CTA behavior**
- [ ] Primary CTA is a waitlist/lead-capture action per Section 6 (or an explicit, documented product-manager override of that recommendation).
- [ ] No CTA button is unwired/dead (links to nothing, `#`, or a nonfunctional stub) in production.
- [ ] Waitlist form, if built, collects only name + email (or lesser), consistent with POPIA minimality, pending compliance-specialist confirmation (CQ-3).

**Compliance flags carried forward**
- [ ] CQ-1 through CQ-6 (Section 4) have been sent to compliance-specialist for review before this page's copy is finalized for production, even though they don't block initial drafting.

**Branding/consistency**
- [ ] `public/logo.png` is used as the actual logo asset (not a placeholder), and the company name "TD IT Solution Insurance" is used consistently in header/footer.
- [ ] Terminology matches Section 3's table; no ad hoc synonyms introduced for "assets," "policy/plan," "GPS-assisted recovery," or "security-company partner."

---

## 10. Open Questions (for product-manager / compliance-specialist)

- **OQ-1 (product-manager):** Confirm or override the recommended CTA approach (Section 6) — waitlist/lead-capture vs. holding the landing page until Feature 001 ships.
- **OQ-2 (product-manager):** Is there a ratified pricing/tier structure to tease in Section 2.5, or should that section ship as "plans coming soon" for initial launch?
- ~~**OQ-3 (compliance-specialist):**~~ **RESOLVED — see Section 12.** CQ-1 through CQ-6 are all closed.
- ~~**OQ-4 (product-manager):**~~ **RESOLVED by platform owner.** TD IT Solution Insurance operates as a licensed insurer in its own right (not a broker/intermediary placing business with a separate underwriter). Disclosure *is* required on this page even pre-launch — see Section 12.5. **The licence number(s) themselves have not been supplied and are recorded as placeholders; this is now a pre-production blocker, not an open requirements question.**

---

## 11. Pre-Approval Checklist (business-analyst self-review)

- [x] Every acceptance criterion is testable (clear pass/fail condition) — Section 9's checklist items are each independently verifiable against the page as built.
- [x] Edge cases enumerated: no functioning signup flow to link to (Section 6), no ratified pricing (Section 2.5, OQ-2), no real testimonials/partnerships to display (Sections 2.4, 2.6), roadmap-stage capabilities that must not be overclaimed (Section 5).
- [ ] Coverage limits and policy tier rules cross-checked against the current tier/asset-type matrix — **N/A for this feature**; this page only names asset *categories* (Section 2.3), not limits, and explicitly defers pricing/tier specifics (Section 2.5, OQ-2).
- [x] Compliance-specialist has reviewed rules touching cancellation, refunds, or regulated disclosures — **done**; CQ-1 through CQ-6 (Section 4) are all resolved in Section 12. One residual pre-production blocker remains: the real FSP/insurer licence number(s) (Section 12.5).
- [x] Terminology matches the domain glossary and existing UI/help-center copy — cross-checked against `docs/organization/README.md` and Feature 001's vocabulary (Section 3); no formal glossary file exists yet, same gap noted in Feature 001, flagged again here as a `technical-writer` follow-up.
- [x] Spec reviewed with backend-engineer and database-architect for technical feasibility — **N/A by design**: Section 8 explicitly dispositions Stages 5–8 as not applicable to a static marketing page, with the narrow exception of the waitlist form's persistence choice, which is a small, separately-scoped follow-on decision, not a blocker to this Stage 1 artifact.
- [ ] QA has reviewed acceptance criteria and confirmed testability before development starts — **deferred to Stage 10 entry**, consistent with lifecycle sequencing; Section 9's criteria are written testable now.
- [ ] Product-manager has signed off that the spec matches intended product scope — **pending**; this draft is submitted for that sign-off along with OQ-1 through OQ-4.

**Net status:** Stage 1 artifact complete and internally consistent for a static marketing page of this scope. **Compliance-specialist sign-off is complete (CQ-1 through CQ-6 resolved — Section 12), conditional on the pre-production items in Section 12.8.** Not yet fully approved — still pending product-manager sign-off on CTA approach (OQ-1) and pricing-teaser scope (OQ-2). Structural drafting and non-claims content work is not blocked.

---

## 12. Compliance Review (compliance-specialist)

**Reviewer:** compliance-specialist
**Date of review:** 2026-08-07
**Stage:** 1 — Business Requirements (compliance sign-off on flagged items CQ-1 through CQ-6, Section 4)

### 12.0 Regulatory Regime Determination For This Feature

Per this role's standing practice of not defaulting to a single assumed regime, the applicable frameworks for *this specific artifact* (a public marketing page with an optional name+email lead-capture form) are determined as follows:

| Framework | Applies to Feature 002? | Basis |
|---|---|---|
| **POPIA** (Protection of Personal Information Act 4 of 2013) | **Yes** | Jurisdiction confirmed as South Africa by the platform owner (same determination ratified for Feature 001, Section 9). The waitlist form collects personal information (name, email) from South African data subjects. Applies to the form, and to any analytics/cookies that process personal information. |
| **Insurance Act 18 of 2017 + Policyholder Protection Rules (Short-term) — advertising & disclosure rules** | **Yes** | Now directly triggered by the platform owner's confirmation that TD IT Solution Insurance is a licensed insurer rather than an intermediary. Insurer advertising is a regulated activity; a marketing page is an "advertisement" regardless of whether a purchase flow exists yet. This is the framework that governs CQ-1, CQ-2, CQ-5 and CQ-6. |
| **FAIS Act 37 of 2002 + General Code of Conduct (advertising/disclosure)** | **Likely yes — see licence-category flag in 12.5** | Applies where the entity renders financial advice or intermediary services. The platform owner used the phrase "FSP-licensed," which points at FAIS. See 12.5 for why this needs one more confirmation. |
| **ECTA 25 of 2002 (s43 — information to be provided by electronic-transaction suppliers)** | **Yes, lightly** | The page offers goods/services electronically; s43 requires identity, legal status and contact details be available on the site. Already largely satisfied by Section 2.9's footer requirements. |
| **ARB Code of Advertising Practice** (Advertising Regulatory Board, successor to the ASA) | **Yes, as a self-regulatory standard** | Governs honesty, substantiation and testimonials — the answer to CQ-6. Note the ARB binds members directly and non-members indirectly via media/publisher rules; it is treated here as binding for practical purposes. |
| **GDPR** | **No — not currently** | No confirmed EU establishment and no confirmed offering of services to EU data subjects. **However:** a public landing page is globally reachable, and a waitlist form will accept an EU-resident email if one is entered. This does not by itself trigger GDPR (Art. 3(2) requires *targeting*, not mere accessibility), so the determination is "does not apply" — but it is conditional. If the page ever adds EU-country selectors, EUR pricing, EU-language variants, or the waitlist is actively marketed into the EU, this determination must be reopened. Recorded so this is a documented decision, not a silent assumption. |
| **PCI-DSS** | **No** | This feature handles no cardholder data. There is no checkout, no payment field, and none may be added to this page. If a "pay now"/card field is ever proposed for the landing page, that is a scope change requiring a fresh PCI determination — the correct answer will almost certainly be "redirect/iframe to a PSP-hosted page," never a card field on the marketing page. |

**Net:** POPIA + insurance advertising/disclosure rules + ARB advertising standards are the governing set for Feature 002. GDPR and PCI-DSS are explicitly assessed and excluded, with the trigger conditions for reopening each recorded above.

---

### 12.1 CQ-1 — Insurance Marketing Claims: RESOLVED (binding copy guardrails)

**Ruling:** Yes, claim constraints apply, and they are stronger than generic advertising honesty because the entity is a licensed insurer. The governing standard is that an insurer's advertisement must be **fair, clear and not misleading**, must not create **unrealistic expectations**, and must not emphasise benefits without giving comparable prominence to the limitations and conditions attached to them.

Rather than requiring a legal disclaimer paragraph bolted onto every recovery claim (which tends to produce fine print nobody reads, and which does not actually cure a misleading headline), the requirement is **structural: the claim itself must be written in best-effort terms.** A correctly-worded claim needs no disclaimer; an absolute claim cannot be rescued by one.

#### 12.1.1 SAFE language (approved for use)

Best-effort, mechanism-describing, process-describing:

- "We help recover stolen and lost assets."
- "GPS-assisted recovery, coordinated with security-company partners."
- "Designed to improve your chances of getting your property back."
- "When you report an asset stolen, we work with our security-company partners to try to recover it."
- "Cover for vehicles, laptops, phones, tablets, TVs, desktops and business equipment." (naming *categories* — consistent with Section 2.3)
- "Recovery depends on the asset's tracking status and on-the-ground conditions." (honest limitation, safe and encouraged)
- "Subject to policy terms, underwriting and claims assessment." (safe qualifier — see CQ-2)

#### 12.1.2 UNSAFE language (prohibited — blocks copy sign-off)

**(a) Absolute-outcome guarantees.** Prohibited: "We *will* recover your stolen device." "Guaranteed recovery." "Your asset is *always* protected." "Never lose your laptop again." "100% recovery rate." "Get your money back, guaranteed." Any construction using *guarantee*, *always*, *never*, *100%*, *any* or a bare future-tense promise of a recovery outcome. Recovery is contingent on GPS hardware being fitted and functioning, the asset being powered/in-signal, and third-party security-company action — none of which the insurer controls. Promising a contingent outcome as certain is the textbook "unrealistic expectations" breach.

**(b) Unqualified payout/claims-outcome promises.** Prohibited: "All claims paid." "We pay out every time." "No questions asked." "Instant payout." Every insurance policy has exclusions, waiting periods and an assessment process; asserting otherwise misrepresents the product. Claim-handling speed may only be described if the stated turnaround is a real, measured commitment — and today no such measurement exists (Phase 0), so **no claims-turnaround figure may appear on this page at all.**

**(c) Unsubstantiated statistics and superlatives.** Prohibited without documentary substantiation held on file *before publication*: "South Africa's leading asset-recovery insurer," "the most trusted," "#1," "over X assets recovered," "Y% recovery rate," "trusted by thousands." The platform has no customers (Section 2.6) — every such figure would be fabricated. This is the same rule as CQ-6, applied to numbers rather than quotes.

**(d) Present-tense capability overclaim.** Already prohibited by Section 5; compliance-specialist ratifies Section 5 in full as a compliance requirement, not merely a business-analyst style preference. Marketing a capability that does not exist is a misleading-advertising breach on top of the trust problem Section 5 identifies. "Live tracking," "see your asset on a map," "real-time location" are prohibited in present tense until Phase 2 ships.

**(e) "Free"/"no cost" framing.** Prohibited unless something is genuinely free with no attached obligation. "Free quote" is acceptable only if a quote genuinely costs nothing and requires no purchase.

**(f) Risk-elimination framing.** Prohibited: "Never worry about theft again," "eliminate the risk of loss." Insurance transfers financial consequence; it does not eliminate risk. Acceptable substitute: "Reduce the financial impact if the worst happens."

#### 12.1.3 The prominence rule (applies to Sections 2.1, 2.2, 2.4, 2.7)

Where a benefit is stated, any material condition attached to that benefit must be **presented with comparable prominence — same visual block, same reading flow — not relegated to a footnote, a hover tooltip, an accordion, or a footer asterisk.** Concretely, for this page:

- The "How It Works" GPS-assisted-recovery step (Section 2.2) must state, inline and in body copy, that recovery is best-effort and depends on tracking status and security-company action.
- The hero (Section 2.1) may state the value proposition without a full conditions list, provided the hero itself contains no absolute-outcome language per 12.1.2(a).
- The FAQ (Section 2.7) is the right home for the fuller explanation of what affects recovery outcomes, and should include a "What affects whether my asset is recovered?" entry rather than only optimistic entries.

**Enforcement:** `technical-writer` and `ui-designer` draft against 12.1.1/12.1.2 as a checklist; compliance-specialist re-reviews the final production copy string-by-string before publish (Section 12.8).

---

### 12.2 CQ-2 — Linking to Policy Terms: RESOLVED (conditional requirement, plus one unconditional requirement)

**Ruling — split into two parts.**

**(a) Full policy wording / T&Cs link: CONDITIONALLY required, and the condition is currently NOT met, so it is NOT required for the initial launch of this page.**

The obligation to make full policy terms accessible attaches to the point where a person is being asked to make a decision about, apply for, or purchase a specific policy — and to any advertisement that states *specific* coverage terms (limits, premiums, excesses, exclusions, waiting periods). This page, as scoped, does neither: it names asset *categories* only (Section 2.3), shows no ratified pricing (Section 2.5), and its CTA is a waitlist signup, not an application (Section 6). On those facts, **"full policy terms available at signup" is acceptable pre-launch.**

**This permission is conditional and self-revoking.** The moment the page displays **any** of the following, a link to the actual policy wording becomes mandatory *on the same page*, not deferred to signup:
- a premium or price figure (including "from R___/month");
- a coverage limit, payout cap, excess, or sum insured;
- a named exclusion or waiting period;
- a specific named plan/tier with attached benefits;
- any CTA that constitutes an application or purchase rather than an expression of interest.

If OQ-2 resolves toward showing real pricing in Section 2.5, **CQ-2 automatically reopens** and the policy-wording link becomes a blocker. `business-analyst` and `product-manager` are asked to treat this as a linked decision, not two independent ones.

**(b) UNCONDITIONALLY required now, regardless of (a):**

1. **A general "subject to" qualifier.** Wherever the page describes cover or recovery, it must carry a plain-language qualifier such as *"Cover is subject to policy terms, underwriting and claims assessment."* Once per relevant section is sufficient; it need not be repeated per sentence.
2. **Working Privacy Policy and Terms of Service links in the footer** (Section 2.9). Compliance-specialist **rejects the "placeholder/coming soon" option in Section 2.9 for the Privacy Policy specifically.** A dead or "coming soon" Privacy Policy link is not acceptable once the waitlist form is live, because POPIA s18 requires the data subject to be given the required information *at the time of collection* — a promise of a future privacy policy does not satisfy a present obligation. See 12.3.
   - **Terms of Service** may launch as a genuinely minimal but real page (website terms of use: acceptable use, limitation of liability, governing law, contact) — it must be a real page with real content, not a stub reading "coming soon." Website terms are not the same document as policy wording and can validly exist before any policy is sold.
   - **Privacy Policy** must be a real, substantive page before the form goes live — non-negotiable. See 12.3.3.
3. **No dead legal links.** A 404 or `#` on a legal link on an insurer's site is worse than a plain-text notice. If a document genuinely does not exist yet, state that in plain text rather than linking to nothing.

---

### 12.3 CQ-3 — POPIA Notice for the Waitlist Form: RESOLVED (mandatory notice content specified)

**Ruling:** POPIA applies to the waitlist form. The operative obligation is **s18 (notification to data subject when personal information is collected)**, supported by **s10 (minimality)**, **s11 (lawful basis)**, **s13 (purpose specification)**, **s14 (retention limitation)** and **s69 (direct marketing by electronic communication)**.

#### 12.3.1 Lawful basis determination

| Processing purpose | Lawful basis | Notes |
|---|---|---|
| Storing name + email to notify the person when the product launches | **Consent — POPIA s11(1)(a)** | This is *not* contract-necessity: no contract exists or is being concluded, and the person is not yet a policyholder. Submitting the form is itself the affirmative consent action, provided the notice at the form makes the purpose unmistakable. |
| Sending the single launch-notification email the person asked for | Same consent as above | This is the fulfilment of the request, not marketing. |
| Any *other* marketing — newsletters, promotions, product updates beyond the launch notice | **Separate s11(1)(a) consent + POPIA s69 direct-marketing consent** | Must be a distinct, unbundled, opt-in action. See 12.3.4. |

#### 12.3.2 Data minimality ruling (s10)

**Approved fields: email address (mandatory) and name (optional).** Compliance-specialist ratifies Section 9's acceptance criterion and tightens it: **name should be optional, not mandatory**, because a launch notification can be delivered with an email address alone — a mandatory name field collects data not strictly necessary for the stated purpose.

**Prohibited on this form:** phone number, ID number, date of birth, physical/home address, asset details, asset value, current insurer, vehicle registration, income, or any dropdown that profiles the visitor ("what do you want to insure?", "how many assets do you own?"). These are all tempting for marketing segmentation and all fail minimality for a launch-notification purpose. If product-manager wants segmentation data, that is a separate request requiring its own lawful basis, its own notice, and its own compliance review — it is **not** approved by this sign-off.

#### 12.3.3 Mandatory notice content at the point of collection (s18)

The following must be **visible at the form itself** — adjacent to the submit button, in readable body-size text, not behind a link, not in a collapsed accordion, and not only in the Privacy Policy:

1. **Who is collecting it** — "TD IT Solution Insurance" (the responsible party), matching the legal entity name used elsewhere on the page (Section 2.9).
2. **What is collected** — "your email address (and your name, if you choose to give it)."
3. **Why — the specific purpose, stated narrowly** — "so we can email you once when we launch."
4. **The purpose-limitation promise** — "We'll only use this to notify you at launch. We won't send you marketing, and we won't share it or sell it to anyone else."
5. **That it is voluntary** — "Giving us this is voluntary; you just won't get the launch email if you don't."
6. **How to get out / get it deleted** — "You can ask us to delete your details at any time at [contact address]" plus an unsubscribe link in any email sent.
7. **How long it's kept** — see 12.3.5.
8. **A link to the full Privacy Policy** — in addition to, never instead of, items 1–7.

**Model copy (approved for use as-is, subject to `technical-writer` polish that does not change meaning):**

> We'll only use your email to let you know when TD IT Solution Insurance launches. We won't send you marketing, and we won't share your details with anyone else. You can ask us to delete them at any time — see our Privacy Policy.

**Ruling on "is an interim notice acceptable, or must a full Privacy Policy exist first?"** — The **at-the-form notice (items 1–7) is the legally load-bearing artifact and is mandatory**. A full Privacy Policy document is *also* required before the form goes live, but for this narrow processing it can legitimately be short and specific to what is actually collected today — it does not need to pre-describe the future policy/GPS/payment platform. **A "coming soon" Privacy Policy stub is not acceptable once the form is live.** Compliance-specialist will supply the Privacy Policy content requirements to `technical-writer` as a separate deliverable; a short, accurate policy is strongly preferred over a long, aspirational, copy-pasted one that describes processing that does not yet happen (describing data handling you do not do is itself a misrepresentation).

#### 12.3.4 No bundled marketing consent — carried forward from Feature 001

The unbundled-consent principle ratified in **Feature 001, Section 9.2** applies here identically and is restated as binding for Feature 002:

- **There must be no pre-ticked marketing checkbox.** Pre-ticked boxes are not consent under POPIA.
- **There must be no bundled consent** — no "by joining the waitlist you agree to receive marketing from us and our partners." Submitting the waitlist form may only consent to the launch notification.
- **If a marketing opt-in is offered at all, it must be a separate, unticked, clearly-labelled checkbox**, and submitting the form must work identically whether or not it is ticked. It may not be a condition of joining the waitlist.
- **Recommended for this feature: omit the marketing checkbox entirely.** It adds friction, adds a POPIA s69 obligation, and the launch notification already delivers the business value the waitlist exists for. If product-manager wants it, it is permitted under the constraints above — but it is not required and not the default.
- **Consent must be recorded** — whatever stores the waitlist entries must capture the timestamp and what was consented to, so consent is demonstrable rather than asserted. If a third-party form/CRM service is used (Section 8), this is a requirement on the vendor selection.

#### 12.3.5 Retention for waitlist data (s14)

- **Retention period: delete waitlist entries 12 months after collection, or 90 days after the launch notification is sent, whichever comes first.** The purpose is exhausted once the launch email is sent; and a waitlist entry that has sat unconverted for a year has no defensible purpose for continued retention.
- The 90-day post-notification window exists only to handle bounces, resends and follow-up on delivery failures — not to build a long-term marketing list.
- **Entries where the person opted into marketing separately** (if 12.3.4's optional checkbox is used) may be retained on the marketing list under that separate consent, with its own retention clock and a working unsubscribe. Those two datasets should not be conflated.
- **Deletion must be an actual job, not a policy statement.** If the waitlist is stored first-party, this is a scheduled purge with a logged execution record (same mechanism ratified in Feature 001 Section 9.3). If a third-party form/CRM service is used, the retention setting must be configured in that service and evidenced — "we'll remember to clean it up" is not acceptable.
- **This retention period must be stated in the Privacy Policy** and summarised at the form (12.3.3 item 7), e.g. *"We'll delete your details within 12 months, or shortly after we've let you know we've launched."*

#### 12.3.6 Vendor flag (third-party form/CRM services)

Section 8 leaves open that the waitlist may be handled by a third-party email/CRM/form service rather than a first-party endpoint. **If a third-party service is used, it is an operator (POPIA s20/s21) processing personal information on TD IT Solution Insurance's behalf, and requires:**
- a written agreement establishing it processes only on instruction and maintains appropriate security safeguards;
- a check on **where the data is stored** — most such services host in the US/EU, which makes this a **POPIA s72 cross-border transfer**, requiring an adequate-protection basis (contractual safeguards, or the data subject's consent to the transfer). This is not a blocker but it **must be resolved before the vendor is chosen, not after**, and the privacy notice must not claim data stays in South Africa if it does not;
- confirmation the vendor supports the retention/deletion configuration required by 12.3.5.

`solution-architect`/`product-manager`: please route the vendor choice past compliance-specialist before implementation. This is the "narrow exception" Section 8's Stage 8 disposition anticipated, and it is the single largest hidden compliance surface in an otherwise low-risk feature.

---

### 12.4 CQ-4 — Cookies / Analytics: RESOLVED (ruling made)

**Ruling: the landing page ships with NO analytics, NO marketing pixels, and NO non-essential cookies for initial launch.**

This is a deliberate call, not a deferral. Reasoning:

1. **POPIA has no cookie-specific regime** (unlike the EU ePrivacy Directive), but that does not make cookies unregulated — where a cookie or pixel processes personal information (which IP addresses, device identifiers and advertising IDs generally are), the ordinary POPIA machinery applies: **s18 notification, s11 lawful basis, s13 purpose specification, s72 if the data leaves South Africa.** Third-party advertising/analytics pixels are the hardest of these to justify, because they involve disclosure to a third party for that third party's own purposes.
2. **The business value at Phase 0 is close to zero.** There is no funnel to optimise, no ad spend to attribute, and no traffic volume to segment. Conversion tracking on a pre-launch waitlist page buys very little.
3. **The compliance cost is not zero.** Adding analytics pulls in a consent mechanism, a cookie notice, a cross-border transfer assessment, and a vendor review — real work, for a page whose entire point is to exist quickly and honestly.
4. **A "no third-party scripts" page is also the strongest version of the trust argument in Section 1.2.** An insurance company that does not quietly load ad-tech on its homepage can say so.

**Concrete requirement statement (binding, testable):**

> The landing page must load **no third-party analytics, advertising, or tracking scripts**, and must set **no cookies other than strictly-necessary ones** (e.g. a CSRF token or session cookie required for the waitlist form to function). No Google Analytics, no Meta Pixel, no Hotjar, no LinkedIn Insight tag, no TikTok pixel, no Google Ads remarketing tag, no chat widget that sets tracking cookies, and no embedded third-party fonts/media that phone home with visitor IPs unnecessarily. If this holds, **no cookie-consent banner is required**, because there is nothing to consent to.

**Conditional requirement if this ruling is overridden by product-manager** (permitted, but it changes the obligations):

- **No script that processes personal information may fire before the visitor has given consent.** Consent-on-page-load, consent-by-scrolling, and "by continuing to use this site you agree" banners do not satisfy POPIA's requirement for a voluntary, specific, informed and *expressed* consent. The scripts must be genuinely blocked until an affirmative click.
- The consent mechanism must offer a **reject option that is as easy to action as the accept option** — a banner with "Accept" and no equally-prominent "Reject" is not a real choice.
- Strictly-necessary cookies may be exempt from the consent gate but must still be disclosed in a cookie notice.
- A **cookie notice** listing each cookie/script, its purpose, its provider, its duration, and whether data leaves South Africa must exist and be linked from the banner.
- Each analytics/ad vendor must be run through the operator + cross-border-transfer review in 12.3.6.
- **Compliance-specialist must re-review before any such script is added.** Adding analytics is a scope change to this sign-off, not an implementation detail.

**Preferred middle path if measurement is genuinely needed later:** a privacy-preserving, cookieless, aggregate-only analytics tool with EU/SA hosting and no cross-site tracking (self-hosted or a POPIA-friendly vendor). That materially reduces — though does not automatically eliminate — the consent obligation, and should be assessed on its specific configuration rather than assumed compliant because it is marketed as "privacy-friendly."

---

### 12.5 CQ-5 — FSP / Insurer Disclosure: RESOLVED (mandatory disclosure specified) — **CONTAINS A PRE-PRODUCTION BLOCKER**

**Input received:** the platform owner has confirmed TD IT Solution Insurance is an **FSP-licensed insurer** — underwriting in its own right, **not** a broker or intermediary placing business with a separate underwriter. This resolves OQ-4 and materially changes the answer to CQ-5: business-analyst was right not to assume, and the answer is that disclosure **is** required.

#### 12.5.1 Licence-category clarification needed (flagged, does not block drafting)

Compliance-specialist must flag a real distinction rather than paper over it, because the phrase "FSP-licensed insurer" combines two different South African licences:

- An **insurer licence** under the **Insurance Act 18 of 2017**, granted by the **Prudential Authority**, is what authorises an entity to *underwrite* insurance business.
- An **FSP licence** under the **FAIS Act 37 of 2002**, granted by the **FSCA**, with an **FSP number**, is what authorises an entity to render *financial advice and/or intermediary services*.

These are separate authorisations. Many South African insurers hold **both** — the insurer licence to underwrite, and an FSP licence because they also deal directly with the public. An entity selling its own product direct-to-consumer online, as described here, would typically need both.

**Action for platform owner / product-manager (not a drafting blocker, but a publish blocker):** confirm and supply
1. the **insurer licence** details under the Insurance Act (licensed insurer status, licence class/sub-class), and
2. the **FSP number and licence category** under FAIS,
   and confirm whether both are **already granted** or whether either is **still in application**.

**This last point is critical and is called out in its own right: if either licence is pending rather than granted, the page must not describe the entity as licensed.** Advertising authorised financial-services status that has not yet been granted is a materially more serious problem than an incomplete footer — it is a misrepresentation of regulatory status. In that scenario the correct handling is to **omit the disclosure and delay the page's launch-facing claims**, not to publish an optimistic version. Compliance-specialist has no information either way today and is not assuming the licences are in place.

#### 12.5.2 Required on-page disclosure

**Placement: the footer (Section 2.9), on every page of the site, in legible text.** "Legible" means it may be smaller than body copy but must not be a size, colour or contrast that renders it effectively unreadable — a disclosure a visitor cannot read is not a disclosure. It must be static text in the footer, not hidden behind a modal, tooltip, accordion or a link labelled "legal."

**Required elements:**

1. **Full registered legal entity name** — the name as registered with CIPC, including the entity suffix (e.g. "(Pty) Ltd"), which may differ from the trading/brand name "TD IT Solution Insurance." **Both** should appear if they differ, in the form *"[Registered Name] (Pty) Ltd, trading as TD IT Solution Insurance."*
2. **Company registration number** (CIPC), format `YYYY/NNNNNN/07`.
3. **Licensed-insurer statement**, e.g. *"TD IT Solution Insurance is a licensed non-life insurer in terms of the Insurance Act 18 of 2017."* (Exact insurer class/wording to be finalised once 12.5.1 is answered.)
4. **FSP status and number**, e.g. *"...and an authorised financial services provider, FSP No. [FSP NUMBER — pending]."*
5. **Physical/registered address and contact details** (also required by ECTA s43 and satisfying Section 2.9's contact requirement).
6. **Complaints route** — how a customer complains, and a reference to the relevant Ombud. Compliance-specialist recommends including this from day one rather than adding it at launch, since it costs one line and is a genuine trust signal.

**Exact placeholder format to use in the codebase until real numbers arrive** — use these literal strings so they are greppable and cannot be mistaken for real values:

```
[FSP NUMBER — pending]
[INSURER LICENCE — pending confirmation]
[COMPANY REG NO — pending]
[REGISTERED ENTITY NAME — pending]
```

**Rules governing the placeholders (binding on `ui-designer`, `technical-writer`, `frontend-engineer`):**

- **Do not invent, guess, or use an "example" number.** A plausible-looking fake FSP number in a footer is a fabricated regulatory credential — the single worst failure mode available on this page, and categorically more serious than the fake-partner-logo problem Section 2.4 already prohibits. The same no-fabrication rule in Section 2.4 and Section 2.6 applies to licence numbers with the highest severity.
- Placeholders are acceptable in development, staging and design mockups. **They are not acceptable in production.**
- **Production build gate:** the page must not be published while any `— pending` string is present in the footer. This should be enforced mechanically where possible (a build/CI check or a test asserting the string `— pending` does not appear in the production bundle), not by memory. `frontend-engineer`/`devops-engineer` to implement; compliance-specialist to verify at publish.
- If the real numbers are unavailable at publish time, the correct resolution is **to delay publishing**, or to publish a page that makes **no insurance claims at all** (a pure "coming soon" holding page with company contact details only) — not to publish an insurer-marketing page without its mandatory disclosures.

#### 12.5.3 Consequences of the licensed-insurer confirmation beyond the footer

- **Section 2.4's "underwriting/insurer-backing disclosure (if applicable)" is now resolved as applicable** — but the disclosure is *"we are the insurer,"* not *"underwritten by [third party]."* No third-party underwriter may be named, because there isn't one.
- Copy must **not** describe TD IT Solution Insurance as a broker, intermediary, comparison service, or "insurtech platform partnering with insurers" — those would now be inaccurate descriptions of the entity's regulatory role, in the opposite direction from the usual overclaim risk. Watch for this in "About us" and hero copy, where startup-flavoured phrasing tends to creep in.
- Being the insurer **raises** the bar on CQ-1: the recovery/coverage claims in 12.1 are being made by the risk carrier itself, so there is no "we're just a platform" distance to fall back on.

---

### 12.6 CQ-6 — Testimonials and Social Proof: RESOLVED (hard rule, plus a concrete reframe for Section 2.6)

**Ruling:** business-analyst's Section 2.6 rule is **correct and is ratified as binding**, and advertising standards do impose specific requirements beyond general honesty. The additional constraints are:

1. **Testimonials must be genuine, and documentary proof must be held on file before publication.** The substantiation must exist *at the time of publishing*, not be obtainable later if challenged. In practice: a written, signed or otherwise verifiable permission from the named person, retained by the business.
2. **Testimonials must be attributable and current.** A quote attributed to "J.M., Johannesburg" is acceptable only if a real J.M. in Johannesburg actually said it and consented to its use. Anonymous or stock-photo-attached quotes are not acceptable. Testimonials must not be so old as to be misleading about the current product.
3. **Testimonials must not make claims the advertiser could not lawfully make directly.** A customer saying *"they guaranteed they'd get my car back and they did"* imports the exact absolute-guarantee claim prohibited by 12.1.2(a) — putting a prohibited claim in quotation marks does not launder it. **All of 12.1.2 applies to quoted testimonial text.**
4. **Testimonial use is itself POPIA processing.** A named customer's name, photo, location and quote are personal information. Using them requires that person's specific consent for that purpose (s11(1)(a)), and the consent must cover publication on a public website. Consent to be insured is not consent to be advertised.
5. **The same standards apply to star ratings, review counts, "trusted by X customers" figures, partner logos and accreditation marks** — all are social proof and all require substantiation. Section 2.4's no-fabricated-partner-logos rule and 12.1.2(c)'s no-unsubstantiated-statistics rule are the same principle.
6. **Aggregated review scores** may only be shown if they come from a real review platform with real reviews and are presented accurately (correct score, correct sample size, correct date range).

**Applied to Feature 002 as it stands today: there are no customers.** Therefore **there are no lawful testimonials available**, and the Testimonials block cannot be filled — not because the copy would be hard to substantiate, but because any content in it would necessarily be fabricated.

**Ruling on the block itself — pick one of these three, all approved:**

- **Option A (recommended): omit the Testimonials section entirely for initial launch.** An absent section reads as a page that hasn't got there yet. An empty or hedged section draws attention to the absence. This is the cleanest option and compliance-specialist's recommendation.
- **Option B: reframe the block as "What to expect"** — describe the intended customer experience in second person and future/conditional tense ("Here's what happens if your laptop is stolen: you report it in the app, we notify our security-company partners, and we keep you updated while they work on recovery"). This preserves the layout rhythm the designer wants, delivers real comprehension value, and asserts nothing false — **provided it is clearly framed as *how the product is designed to work*, not as reported customer experience, and complies with 12.1 (no guaranteed outcomes, no present-tense Phase 2 capability).**
- **Option C: substitute genuinely-true social proof.** Only statements that are actually true and substantiable — e.g. *"Built by a team with backgrounds in insurance and asset recovery"* (**only if true**, and `product-manager` must confirm rather than `ui-designer` assuming), or the licensed-insurer status from 12.5, which is a stronger and more verifiable trust signal than any testimonial. **A licensed-insurer footer disclosure plus a clear "how it works" explanation is better social proof for an insurer than invented quotes, and is the single best trust asset this page has.**

**Prohibited absolutely, restating Section 2.6 with compliance authority behind it:** invented quotes; invented names; stock photos presented as customers; placeholder Lorem-ipsum testimonials shipped to production by accident; star ratings with no reviews behind them; "as seen in" media logos where no such coverage exists; "trusted by 10,000+ South Africans" or any variant. `ui-designer` and `technical-writer` are directed to Option A, B or C explicitly so the block is never filled with placeholder-that-looks-real content — the exact risk Section 2.6 anticipated.

---

### 12.7 Compliance-Specialist Pre-Approval Checklist (self-review for Feature 002)

- [x] **Regulatory regime(s) applicable to this feature/data flow confirmed and documented** — Section 12.0. POPIA + insurance advertising/disclosure rules + ARB standards apply. GDPR and PCI-DSS explicitly assessed, excluded, and given documented reopening triggers. Not defaulted to a single assumed regime.
- [x] **Lawful basis / consent confirmed for any new or expanded personal data collection** — Section 12.3.1. Waitlist = consent (POPIA s11(1)(a)); marketing = separate unbundled consent (s11(1)(a) + s69) if offered at all. No location data, no special personal information, and no children's data is collected by this feature.
- [x] **Data classified and mapped to correct retention and deletion timelines** — Section 12.3.5. Waitlist name+email classified as low-sensitivity contact PII; retention set at 12 months from collection or 90 days post-launch-notification, whichever is first; deletion required to be an automated/configured job with evidence, not a manual promise.
- [x] **Audit logging specified for any new access path to sensitive data** — assessed and **scoped down with reason**: this feature creates no admin dashboard, no staff access path, and no sensitive-record retrieval surface. The only requirement is that **consent capture is recorded with a timestamp** (12.3.4) so consent is demonstrable. Full audit-logging requirements attach to Feature 001's authenticated surfaces, not here. Recorded as a reasoned scoping decision rather than an omission.
- [x] **PCI-DSS scope reviewed — no unnecessary raw card data handling introduced** — Section 12.0. Zero cardholder data on this page; no payment field may be added to it. Any future "pay now" on the landing page is a scope change requiring PSP-hosted redirect/iframe, never a first-party card field.
- [ ] **Third-party/vendor data-sharing covered by compliant agreement** — **OPEN, and the largest residual risk in this feature.** Section 12.3.6. The waitlist form's storage/CRM vendor is undecided (Section 8). Operator agreement (POPIA s20/s21) and cross-border-transfer basis (s72) must be resolved **before** vendor selection is finalised. Does not block Stage 1 sign-off; **does** block the form going live.
- [x] **Breach notification procedure applicable to this data type reviewed and current** — assessed. A waitlist of names and email addresses is still personal information, so **POPIA s22 breach notification applies** — a compromise requires notification to the Information Regulator and to affected data subjects as soon as reasonably possible after discovery. The practical exposure is low (no financial, identity or location data), but it is **not zero**, and the relevant scenario is a third-party form-vendor breach (12.3.6) rather than a first-party one. Flagged to `security-engineer`: the vendor's own breach-notification SLA to us must be a selection criterion, because we cannot meet our s22 obligation if our operator tells us late. No separate runbook is required for this feature beyond the platform-level procedure.
- [x] **Consent/disclosure copy reviewed and accurately reflects actual data handling** — Sections 12.1 (marketing claims), 12.3.3 (form notice, with approved model copy), 12.5.2 (regulatory footer disclosure). **Caveat:** this is approval of the *requirements*; the final production copy strings do not exist yet and require a second compliance pass before publish (12.8).

---

### 12.8 Sign-Off

**COMPLIANCE SIGN-OFF: GRANTED for Stage 1 (Business Requirements).** CQ-1 through CQ-6 are resolved; Section 4's open compliance items are closed; OQ-3 and OQ-4 in Section 10 are closed. This feature may proceed through Stage 2 and onward on compliance grounds.

Sign-off is on the **requirements**, and is conditional on the following, each of which must be satisfied **before the page is published to production**:

| # | Pre-production condition | Owner | Blocking? |
|---|---|---|---|
| 1 | **Real FSP number and insurer licence details supplied and verified**, and confirmation that both licences are **granted, not pending** (12.5.1). All `— pending` placeholder strings removed. | platform owner / product-manager | **YES — hard blocker** |
| 2 | Registered legal entity name and CIPC registration number supplied for the footer (12.5.2). | platform owner | **YES — hard blocker** |
| 3 | Final production copy re-reviewed line-by-line against the 12.1.1 / 12.1.2 safe/unsafe lists. | compliance-specialist, with technical-writer | **YES** |
| 4 | Real (not stub) Privacy Policy page live, and the at-form s18 notice (12.3.3) implemented as visible text at the form. | compliance-specialist + technical-writer + frontend-engineer | **YES, if the waitlist form ships** |
| 5 | Waitlist vendor operator agreement + cross-border transfer basis resolved (12.3.6); retention configured per 12.3.5. | product-manager / solution-architect, reviewed by compliance-specialist | **YES, if the waitlist form ships** |
| 6 | Confirmed no third-party analytics/tracking scripts and no non-essential cookies in the production bundle (12.4). | frontend-engineer, verified by compliance-specialist | **YES** |
| 7 | Testimonials block resolved to Option A, B or C (12.6) — never fabricated content. | ui-designer / product-manager | **YES** |
| 8 | CI/build check asserting the literal string `— pending` is absent from the production bundle (12.5.2). | frontend-engineer / devops-engineer | Recommended, strongly |

**Re-review triggers — this sign-off lapses and CQ items reopen if any of the following happen:**
- Real pricing, coverage limits, excesses or named exclusions are added to the page (reopens **CQ-2**; policy-wording link becomes mandatory).
- Any analytics, pixel or tracking script is proposed (reopens **CQ-4**; consent gate becomes mandatory).
- The waitlist form collects any field beyond name + email (reopens **CQ-3**; minimality reassessment required).
- The CTA changes from lead-capture to an application or purchase action (reopens **CQ-1, CQ-2 and PCI scope**).
- The company begins targeting EU data subjects — EU languages, EUR pricing, EU country targeting (reopens the **GDPR determination** in 12.0).
- Licence status changes, or either licence turns out to be pending rather than granted (reopens **CQ-5** and blocks publication of insurer claims).

**Standing note for the record:** the FSP and insurer licence numbers referenced throughout Section 12.5 are **explicit placeholders**. Compliance-specialist has deliberately not fabricated, guessed, or supplied an "illustrative" number, because a false regulatory credential in an insurer's footer is a misrepresentation of authorised status — a more serious failure than any other risk identified in this document. The real numbers must come from the platform owner.
