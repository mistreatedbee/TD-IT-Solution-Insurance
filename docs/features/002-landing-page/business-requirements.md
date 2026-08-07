# Feature 002 — Public Landing Page

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst`
**Contributors:** `product-manager`, `compliance-specialist`
**Status:** Draft — pending product-manager sign-off on CTA approach and compliance-specialist review of flagged items (Section 4)
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
- **OQ-3 (compliance-specialist):** Resolve CQ-1 through CQ-6 (Section 4) — insurance marketing-claim constraints, policy-terms linking requirement, POPIA notice for the waitlist form, cookie-consent requirement, insurer/FSP disclosure requirement, and advertising-standards constraints on social proof.
- **OQ-4 (product-manager):** Does TD IT Solution Insurance operate as or with a licensed South African insurer/underwriter, and if so, should that be disclosed on this page even pre-launch? (Feeds CQ-5.)

---

## 11. Pre-Approval Checklist (business-analyst self-review)

- [x] Every acceptance criterion is testable (clear pass/fail condition) — Section 9's checklist items are each independently verifiable against the page as built.
- [x] Edge cases enumerated: no functioning signup flow to link to (Section 6), no ratified pricing (Section 2.5, OQ-2), no real testimonials/partnerships to display (Sections 2.4, 2.6), roadmap-stage capabilities that must not be overclaimed (Section 5).
- [ ] Coverage limits and policy tier rules cross-checked against the current tier/asset-type matrix — **N/A for this feature**; this page only names asset *categories* (Section 2.3), not limits, and explicitly defers pricing/tier specifics (Section 2.5, OQ-2).
- [ ] Compliance-specialist has reviewed rules touching cancellation, refunds, or regulated disclosures — **not yet done**; CQ-1 through CQ-6 (Section 4) are flagged and pending compliance-specialist review before copy is finalized for production. This does not block initial structural drafting per Section 4's closing note.
- [x] Terminology matches the domain glossary and existing UI/help-center copy — cross-checked against `docs/organization/README.md` and Feature 001's vocabulary (Section 3); no formal glossary file exists yet, same gap noted in Feature 001, flagged again here as a `technical-writer` follow-up.
- [x] Spec reviewed with backend-engineer and database-architect for technical feasibility — **N/A by design**: Section 8 explicitly dispositions Stages 5–8 as not applicable to a static marketing page, with the narrow exception of the waitlist form's persistence choice, which is a small, separately-scoped follow-on decision, not a blocker to this Stage 1 artifact.
- [ ] QA has reviewed acceptance criteria and confirmed testability before development starts — **deferred to Stage 10 entry**, consistent with lifecycle sequencing; Section 9's criteria are written testable now.
- [ ] Product-manager has signed off that the spec matches intended product scope — **pending**; this draft is submitted for that sign-off along with OQ-1 through OQ-4.

**Net status:** Stage 1 artifact complete and internally consistent for a static marketing page of this scope. Not yet fully approved — pending product-manager sign-off on CTA approach (OQ-1) and pricing-teaser scope (OQ-2), and compliance-specialist review of CQ-1–CQ-6 (Section 4) before production copy is finalized. Structural drafting and non-claims content work is not blocked by these open items.
