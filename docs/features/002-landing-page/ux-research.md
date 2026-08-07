# Feature 002 — Public Landing Page: UX Research

**Lifecycle stage:** 3 — UX Research
**Stage owner (A):** `ux-researcher`
**Input:** `docs/features/002-landing-page/business-requirements.md` (Stage 1), `docs/organization/08-roadmap.md`
**Status:** Draft — ready for `ui-designer` and `product-manager` review. No usability testing was possible pre-build (no prototype exists yet); this document is heuristic/desk research plus component-inventory audit, and flags where post-wireframe usability validation should still happen before this ships to production (see Section 7).
**Related:** `docs/features/001-authentication/ux-research.md` (sibling artifact, different surface — that one is an authenticated multi-screen flow; this one is a single anonymous scroll page)

---

## 0. Scope Note

This is a **static, unauthenticated, single-page marketing surface** with one meaningful interaction (the waitlist form) and one conversion goal (lead capture). It does not carry the "worst-day" stakes of a theft report, but it does carry a **first-impression trust stake**: for a security-and-recovery insurance product, this page is often a visitor's *only* data point before deciding whether TD IT Solution Insurance is credible enough to hand a laptop's IMEI or a car's VIN to, later. Research here is proportionate to that risk — lighter than Feature 001, not absent.

---

## 1. Visitor Personas

Lightweight, scroll-behavior-oriented (not full journey personas — this is a single page, not a multi-stage flow).

### Persona A — "Post-Incident Zanele" (prospective customer, trust-seeking, price-sensitive)
- A friend/family member recently had a laptop or car broken into/stolen; she's now actively searching "insurance that helps recover stolen electronics" or similar.
- **Arrives with elevated anxiety already** (secondhand, not first-hand — but primed to distrust vague promises after hearing "the police never found it").
- Skims fast. Needs the value proposition and "how it works" mechanism in the first two scroll depths, or she bounces to a competitor tab already open.
- Price-sensitive: wants a rand figure or at least tier *names* before she'll consider giving an email.
- Success = she understands *what actually happens* if her phone is stolen under this plan, in plain language, within ~15 seconds of landing.

### Persona B — "Business-Owner Thabo" (SMB equipment coverage, needs credibility signals)
- Owns a small business (e.g., a contracting firm, an agency) with 5–20 laptops/tablets/vehicles as company assets. Evaluating this as a fleet/equipment-coverage line, not a personal purchase.
- Reads more carefully than Persona A; scrolls to FAQ and footer looking for legal/registration legitimacy before doing anything else — checks "who actually runs this company," registration name, contact info, whether there's a real underwriter behind it.
- Higher tolerance for "coming soon" honesty *if it's clearly labeled* (B2B buyers are used to phased rollouts), but zero tolerance for anything that reads as smoke-and-mirrors (fake logos, vague "trusted by thousands" claims with no evidence).
- Success = he finds enough legitimacy signals to submit a business email to the waitlist, or at minimum bookmarks the page to reassess at MVP launch.

### Persona C — "Skeptical Comparator Priya" (comparing against traditional insurers)
- Already has, or is evaluating, a traditional household/gadget insurance policy. Landed here via a search comparison or a link from a friend.
- Core question: **"What's actually different about GPS-assisted recovery vs. my existing insurer just paying out a claim?"** If the page doesn't answer this crisply, she assumes it's marketing fluff over an ordinary policy and leaves.
- Highly sensitive to overclaiming — she has seen "AI-powered," "military-grade," "guaranteed recovery" copy before and distrusts it by reflex. Precise, honest, hedged claims ("GPS-assisted recovery, coordinated with security-company partners — best-effort, not a guarantee") read as *more* credible to her than confident absolute claims would.
- Success = she can articulate, after reading "How It Works," one concrete mechanism difference (device-tracking-hardware + security-company dispatch model) versus a standard payout-only policy.

**Shared implication for design:** all three personas need the differentiator and the honesty signal in the first 1–2 sections, not buried after a pricing pitch. None of them are the actual asset-owner completing a claim (that's Feature 001/future product surface) — they are all pre-trust, pre-conversion visitors. This reframes "success" for this page as *comprehension + a captured lead*, not task completion in the Feature-001 sense.

---

## 2. Single-Page Scroll Journey

Ordered per business-requirements.md §2. For each depth: what the visitor sees, what they feel/ask, and what the section must deliver to keep them scrolling instead of bouncing.

| Scroll depth | Section | Sees | Feels / asks | Must deliver |
|---|---|---|---|---|
| 0 (above fold) | **Hero (§2.1)** | Logo, one-sentence value prop, primary CTA ("Get Notified"), secondary low-commitment link ("See how it works") | "What is this, in one sentence? Is it for me?" (all personas) | Value prop names the product category (subscription insurance), the assets covered category-level, and the recovery mechanism — without overclaiming live tracking. Secondary CTA gives Persona C (skeptical, not ready to give an email) a no-commitment way to keep engaging instead of leaving. |
| 1 | **How It Works (§2.2)** | 3-step Subscribe → Register Assets → GPS-Assisted Recovery | "How does the mechanism actually work?" (Persona A, C's core question) | This is the single highest-leverage section per business-requirements.md §2.2 — must resolve Persona C's differentiation question and Persona A's "what actually happens" question in the same breath. Copy must read as *designed model*, not *live capability* (roadmap honesty constraint). |
| 2 | **Asset Types Covered (§2.3)** | Grid/list of 8 categories (vehicles, laptops, phones, tablets, TVs, desktops, business equipment, other electronics) | "Do they cover what I actually own?" (self-qualification moment, all personas — Persona B specifically scanning for "business equipment") | Fast visual scan, no reading required. No dollar figures (per §2.3 constraint). Persona B needs "business equipment" to be visually as prominent as the consumer categories, not an afterthought at the end of the list. |
| 3 | **Trust / Credibility Signals (§2.4)** | GPS + security-company-partner model explanation, data-handling/POPIA posture statement, reserved space for future partner logos/accreditations (empty or honestly labeled "coming soon" today) | "Can I trust this company with my property and eventually my location data?" (core question for all personas, most acute for Persona B) | This section carries the page's actual trust burden. No fabricated logos (hard constraint). If no real partner/accreditation content exists yet, an honest "we're building these partnerships — here's our approach to data protection today" framing is preferable to an empty visual hole. |
| 4 | **Pricing / Plans Teaser (§2.5)** | Tier *names* only (e.g., Basic/Standard/Premium framing) or "plans coming soon — join the waitlist for pricing" if no ratified pricing exists (per OQ-2) | "Roughly what tier am I in, and can I afford this?" (Persona A specifically) | Must not read as a dead end for the price-sensitive persona — even without numbers, tier *names* + "starting from" framing (if ratified) or an honest "waitlist members get pricing first" hook keeps Persona A moving toward the CTA instead of leaving to search for a number elsewhere. |
| 5 | **Testimonials / What-to-Expect (§2.6)** | Structural placeholder: no fabricated quotes. Neutral "just getting started" framing or true non-testimonial social proof (e.g., "built by an insurance and asset-recovery team") | Risk: if this section is empty or feels like a broken layout, it reads as *more* suspicious than no section at all, especially to Persona C who is actively pattern-matching for fake social proof | Reframe this block's job from "prove others trust us" (impossible pre-launch) to "show who's behind this and what to expect at launch" — see §4 below for specific framing options. |
| 6 | **FAQ (§2.7)** | Accordion answering: what's covered, how claims work at a high level, cancellation flexibility, how GPS recovery works, data privacy | Last-chance objection handling before the ask — this is where Persona C decides whether to trust the earlier claims, and where Persona B looks for legal/contractual specificity | Answers must not restate unfinalized coverage rules (link out to future policy-terms content instead of inventing specifics). Cancellation-flexibility answer matters disproportionately to Persona A (subscription commitment anxiety). |
| 7 | **Final CTA (§2.8)** | Same CTA as hero, restated once before the footer | "Okay, I'm convinced enough to leave my email — is this the same ask as before?" | Must be the identical action to the hero CTA (not a second, different ask) — per §2.8, this is a hard requirement to avoid confusing the visitor about what "the" next step is. |
| 8 | **Footer (§2.9)** | Legal links (Privacy/Terms, even if "coming soon"), contact info, company legal name, regulatory disclosures (pending compliance-specialist), copyright | Persona B in particular treats this as a legitimacy checklist — a thin or missing footer is a red flag for a B2B buyer | Footer is not decorative; treat it as the last, and for skeptical/B2B visitors sometimes the *first*, credibility check. |

**Anxiety curve note:** unlike Feature 001's theft-report flow (which starts high-anxiety and must resolve it), this page's anxiety curve is a slow *build* of trust-testing questions (Sections 0→4) that must resolve by Section 4 (Trust/Credibility), after which the remaining sections (Pricing → Testimonials → FAQ → CTA) are about *removing final objections*, not building trust from scratch. If Trust/Credibility (Section 3, §2.4) fails to land, no later section — including the CTA — will recover the visitor.

---

## 3. Waitlist CTA — UX Detail and Technical Flag

### Form fields
Per business-requirements.md §6/§9 and POPIA minimality (CQ-3, pending compliance-specialist confirmation): **name + email only.** No phone, no address, no asset details at this stage — collecting more than needed to send a "we've launched" notification is both a POPIA minimality risk and a conversion-killer (every extra field lowers completion rate on a page whose only ask should be low-friction).

- `Input` component (existing, `src/components/Input`) covers this directly: `label="Full name"` (text) + `label="Email address"` (type="email"), both with native `required`.
- Inline validation should use the `Input` component's existing `error` prop (e.g., "Enter a valid email address") rather than a page-level alert — keeps the error next to the field that caused it, standard low-friction form practice.
- A single-sentence consent/purpose line directly under the form (e.g., "We'll only email you when we launch — no spam, unsubscribe anytime") — content/wording pending compliance-specialist's CQ-3 review, but the *UX placement* (visible at point of collection, not buried in a linked policy) should be decided now regardless of final wording.

### Post-submission state
The form needs a real, honest completion state — not a fake "Success!" that goes nowhere, since business-requirements.md explicitly flags dead-end CTAs as *worse* than no CTA (§6, "avoids the dead button anti-pattern"). Design for:

- **Inline confirmation state** (not a redirect to a separate "thank you" page — adds friction and a route that must be maintained): the form area transforms into a confirmation message ("You're on the list — we'll email you at [address] when we launch") with a subtle success visual treatment. This should use existing tokens (e.g., `Badge tone="emerald"` or an inline check icon) rather than introducing new success-state styling.
- **Error state**: if submission fails (network error, third-party service down), show a clear retry message and an alternate path (e.g., "Trouble submitting? Email us at [support address] instead") — never a silent failure. This matters more here than on a typical SaaS site because a failed submission on a trust-focused insurance page reads as "even their form doesn't work," compounding distrust rather than being a neutral bug.

### TECHNICAL FLAG for frontend-engineer / backend-engineer (raised now, not deferred)

**There is currently no backend for this form to submit to.** Business-requirements.md §8 (Stage 5–8 disposition) explicitly notes the waitlist form is the one narrow exception to "no backend" and defers the persistence decision to build time. From a UX standpoint, three realistic options exist and **the UX design should not assume a full first-party backend that doesn't exist**, but it does need to know which option before finalizing the confirmation-state copy and error-handling design:

1. **Third-party form/email service** (e.g., Formspree, a CRM's embedded form endpoint, Mailchimp/Brevo signup API) — smallest build lift, no first-party endpoint, but the UX needs to account for that service's own latency/error patterns (some return delayed confirmation emails, not instant success) and its own privacy posture (POPIA implications of routing SA visitors' PII through a third-party US/EU service — flag to compliance-specialist alongside CQ-3/CQ-4).
2. **Single lightweight first-party endpoint** (e.g., a serverless function that emails the team and/or writes to a minimal store) — re-enters Stage 7 (API Design) narrowly, per business-requirements.md §8's carve-out, without re-running the whole lifecycle for this feature.
3. **`mailto:` fallback with no real capture** — explicitly the *worst* option from a lead-capture and professionalism standpoint (opens the visitor's mail client, unreliable, easy to abandon) and should only be a stopgap, not the shipped MVP behavior.

**Recommendation from a UX standpoint:** option 1 or 2, not 3 — whichever frontend-engineer/backend-engineer determines is fastest to build correctly. **This choice must be resolved before the confirmation-state and error-state copy is finalized**, because the two realistic options have different honest things to say (e.g., "check your inbox for a confirmation" only works if the chosen service actually sends one). Flagging this now so it isn't discovered as a gap during development.

---

## 4. Trust-Building UX Specifics

Given the elevated trust bar named in business-requirements.md §1 ("can I trust this company with my property and my money"):

- **"What's live today vs. coming soon" framing, stated explicitly on the page** — not just avoided-overclaiming in copy, but a visible UX pattern (e.g., small "Coming soon" `Badge` next to GPS/live-tracking mentions, or an explicit line in the Trust section: *"Today: subscribe and register your assets. Coming: GPS-assisted recovery hardware integration."*). This turns the roadmap-honesty constraint from a copy-writing rule into a visible trust *signal* — transparency about phasing is itself a credibility builder for a skeptical audience (Persona C), not just a compliance box to check.
- **Data-handling messaging tied to POPIA, in plain language, at the point of the form** (not only in a linked Privacy Policy) — e.g., "We collect only your name and email, used solely to notify you at launch. Full privacy details: [link]." Placement matters as much as wording: POPIA disclosure that only lives in a footer link three sections away from the form doesn't functionally reassure anyone at the moment they're deciding whether to type their email.
- **No fabricated trust signals, and no near-real ones either** — this extends business-requirements.md §2.4's hard rule to a UX pattern: an *empty* LogoCloud slot with a label like "Security-company partners — coming soon" is honest; a LogoCloud populated with generic default placeholder logos (the component's own `DEFAULT_LOGOS` fallback) risks reading as real to a fast-scanning visitor. **Recommend not using `LogoCloud`'s default placeholder logos on this page at all** — either populate with real, confirmed partner logos, or omit the section/replace with text, per business-requirements.md's explicit "no placeholder that reads as real" instruction.
- **Recovery-claim hedging visible in the UI, not just in fine print** — CQ-1 (compliance-specialist to confirm exact disclaimer language) aside, the UX pattern should be: any sentence near "GPS-assisted recovery" gets a visually adjacent, same-size (not tiny-footnote) qualifier like "best-effort, coordinated with security-company partners" rather than a large bold claim with a de-emphasized disclaimer underneath. Burying the hedge in small type is a known dark pattern and would undercut the exact trust goal this page exists to build.
- **Concrete, checkable specifics over vague trust language** — "TD IT Solution Insurance" (exact legal name), a real contact email, a real (even if minimal) Privacy Policy stub, and honest "coming soon" framing collectively do more trust work for Persona B (B2B, legitimacy-scanning) than generic marketing phrases like "trusted and secure" with nothing behind them.

---

## 5. Accessibility Considerations (WCAG 2.1 AA)

Audience is broader and less predictable than Feature 001's authenticated users — first-time visitors, unknown assistive-tech usage, unknown device/network conditions, no assumption of prior product familiarity.

- **Color contrast:** verify the design system's navy/electric-blue/warm-gray palette (used across `Section`, `Button`, `StatBlock`, `Card`) meets 4.5:1 for body text and 3:1 for large text/UI components at every section background variant (`white` and `warm`) — confirm specifically for `Button` `ghost` variant on gradient sections and `ArrowLink` `tone="muted"`, which are the two treatments most likely to fail contrast at default opacity.
- **Alt text:** `Logo` component's `label` prop ("TD IT Solution Insurance") must be present everywhere the logo appears (header, footer). Icons throughout (`FeatureCard`, `StepItem`, `AssetBadge`) are correctly `aria-hidden` per their Context.md docs, provided the adjacent text label always carries the meaning — verify this discipline holds in the actual page copy (e.g., an asset-type grid item must never rely on the icon alone to convey "laptop").
- **Keyboard navigation:** full page must be traversable via Tab/Shift+Tab in visual order: header nav → hero CTA(s) → secondary "see how it works" anchor link → through each section's interactive elements (Accordion triggers, waitlist form fields, final CTA, footer links) with visible focus rings throughout (Button, Input, ArrowLink, and Accordion triggers all specify focus-visible treatment in their Context.md — confirm this is not overridden by page-level CSS). The anchor-link jump to "How It Works" should move keyboard focus to that section's heading, not just scroll visually, so keyboard/screen-reader users land in the right place.
- **Reduced motion:** `StatBlock`'s count-up, `LogoCloud`'s marquee, `StepItem`'s connector animation, and `ArrowLink`'s slide-on-hover all already respect `prefers-reduced-motion` per their component docs — confirm this holds when composed together on one page (motion-heavy pages can still feel overwhelming even with each component individually compliant if several animate simultaneously on load).
- **Readable type scale:** `SectionHeading` and body copy should be tested at 200% browser zoom without horizontal scroll or content clipping — a public marketing page draws lower-vision and older visitors more than an authenticated app tends to, and this page has no onboarding assumption that visitors are already comfortable with the product's UI conventions.
- **Form accessibility:** `Input` component already wires label/`htmlFor`, `aria-describedby` for hints/errors, and `aria-invalid` — confirm the waitlist form's confirmation state (post-submit) is announced to screen readers (e.g., via an `aria-live="polite"` region), since a purely visual state swap would be silent for screen-reader users, and a failed/successful waitlist submission is exactly the kind of thing that shouldn't require sight to notice.
- **Accordion (FAQ):** already documented as using real buttons with `aria-expanded`/`aria-controls` and `role="region"` panels — no gap identified, carry forward as-is.

---

## 6. Handoff Notes for ui-designer — Component Mapping

| Page section | Existing component(s) | Fit | Gaps / flags |
|---|---|---|---|
| Hero | `Section` (bleed, spacing="none"), `SectionHeading` (size="lg"), `Button` (variant="primary", the "Get Notified" CTA), `ArrowLink` (secondary "See how it works" anchor) | Good fit as-is | None. Confirm hero CTA and final-CTA (§2.8) use the exact same label/action per the §2.8 requirement — a small but easy-to-miss consistency risk during build. |
| How It Works | `Section`, `SectionHeading`, `StepItem` (×3, inside an `<ol>`) | Good fit — `StepItem` is purpose-built for exactly this 3-step pattern | `StepItem`'s doc example shows a 4-step usage; confirm 3-step (Subscribe → Register → GPS-Assisted Recovery) renders cleanly with `isLast` set correctly on step 3. No component gap. |
| Asset Types Covered | `AssetBadge` (grid) | **Partial fit — gap.** `AssetBadge`'s `type` prop only supports 6 values: `vehicle, laptop, phone, tablet, tv, business`. Business-requirements.md §2.3 requires **8** categories: vehicles, laptops, smartphones, tablets, TVs, desktop computers, business equipment, **and other electronics**. | **Flag to design-system-manager:** `AssetBadge` needs either a `desktop` type (distinct from `laptop`) and an `other`/generic-electronics type added, or this section needs to fall back to a generic `Card`/`FeatureCard` grid for the two uncovered categories, which would visually fragment the section. Recommend extending `AssetBadge` rather than mixing components in one grid. |
| Trust / Credibility Signals | `Section`, `SectionHeading`, `LogoCloud` (if/when real partner logos exist — do not ship with default placeholder logos, see §4), `Badge` (for "coming soon" labeling on unshipped capabilities), `StatBlock` (only if there is a real, honest number to show — e.g., not "10,000 happy customers" pre-launch, but potentially something legitimately true like founding-team years of experience, if product-manager confirms such a figure exists and is real) | Mostly fits, with the placeholder-logo caveat above | If no real stat exists yet, **do not use `StatBlock` here just to fill visual space** — an empty or text-only trust section is more honest than an invented number, consistent with business-requirements.md's hard "no fabricated trust signals" rule extending in spirit to fabricated statistics. |
| Pricing / Plans Teaser | `Card` (×3 for tier names) or `FeatureCard`, `Badge` (tone="gold" for a "Premium" tier highlight, per Badge's documented use case), `Button`/`ArrowLink` to waitlist if pricing isn't ratified (OQ-2) | Good fit | If OQ-2 resolves to "no ratified pricing yet," this section should route back to the same waitlist CTA rather than a dead pricing-page link — reuse the primary CTA action, don't invent a fourth CTA target on the page. |
| Testimonials / What-to-Expect | `TestimonialCard` — **flagged for reframing, not removal** | `TestimonialCard`'s component contract (quote + authorName + authorTitle + company, optionally avatar/logo) is built for real client quotes, which this feature explicitly cannot supply pre-launch (business-requirements.md §2.6, hard rule). | **Do not force real-testimonial-shaped content into `TestimonialCard` with placeholder names.** Two acceptable paths: (a) omit this section's component entirely and replace with a `SectionHeading` + short paragraph ("we're just getting started" or "built by an insurance and asset-recovery team," only if verifiably true), or (b) flag to `design-system-manager`/`ui-designer` whether a distinct "we're building this" / pre-launch social-proof pattern is worth adding to the system, since this is likely to recur for other pre-launch marketing surfaces, not just this one page. |
| FAQ | `Accordion` / `AccordionItem` | Good fit, purpose-built | None. Content must stay within Section 5/roadmap honesty bounds (see business-requirements.md §2.7). |
| Final CTA | `Section`, `Button` (identical to hero CTA) | Good fit | Enforce identical CTA copy/action to hero, not a restyled duplicate with different wording. |
| Footer | `Logo` (`tone="light"` on navy, per its documented footer example), plain links/text | Good fit, no new component needed | Content (legal entity name, regulatory disclosures) is pending compliance-specialist per CQ-2/CQ-5 — structure can be designed now, final text cannot. |

**No new components appear strictly required** to build this page, with one clear gap (`AssetBadge` category coverage) and one pattern question (pre-launch social-proof block) to raise with `design-system-manager` before high-fidelity design locks in the Asset Types and Testimonials sections.

---

## 7. Usability Validation Plan (Post-Wireframe)

No prototype exists yet, so no moderated/unmoderated testing has occurred for this document. Recommend, once `ui-designer` produces wireframes/high-fidelity mockups:

- **5-second test** (value-prop comprehension): show the hero alone for 5 seconds, ask "what does this company do, and who is it for" — target: correct identification by ≥4/5 participants, consistent with Persona A's "understand within seconds" bar in business-requirements.md §1.
- **Differentiation task** (Persona C proxy): after viewing Hero + How It Works only, ask "how is this different from a normal gadget/car insurance policy" — target: participant can name the GPS/security-company-partner mechanism unprompted.
- **Legitimacy scan task** (Persona B proxy): "would you trust this company enough to give them your business email" with a think-aloud — capture *why not*, if not, with severity-rated findings (missing legal name, no contact info found, footer skipped, etc.).
- **Form completion task**: time-to-complete the waitlist form and clarity of the post-submit state, including a deliberately-broken network condition to confirm the error-state messaging (per §3) doesn't silently fail.
- **Accessibility pass**: keyboard-only full-page traversal and a screen-reader pass (VoiceOver/NVDA) once markup exists, checked against §5 above.

This should happen before production launch, not after — business-requirements.md's honesty and trust requirements are precisely the kind of thing that reads fine to the team internally and lands very differently with an outside skeptical visitor (Persona C's whole reason for existing in this persona set).

---

## 8. Pre-Approval Checklist (ux-researcher self-review)

- [x] Journey map covers happy path (smooth scroll-through-conversion), edge cases (no ratified pricing, no real testimonials/logos, no live GPS capability to show), and the closest analog to a "worst-case" scenario for this surface type — a skeptical, fast-bouncing visitor (Persona C) and a failed form submission (§3 error state) — a marketing page has no true panic scenario like Feature 001's theft report, so this is scoped proportionately.
- [x] Persona(s) affected are identified (Section 1) and their needs are explicitly addressed at each relevant scroll depth (Section 2) and in the trust-building recommendations (Section 4).
- [ ] Usability testing completed with severity-rated findings — **not yet done; documented rationale: no prototype exists at Stage 3 for this feature.** A concrete validation plan (Section 7) is specified for post-wireframe execution, consistent with this being new-build UX research rather than an audit of a shipped feature.
- [x] Accessibility check performed against WCAG 2.1 AA for the affected flow — desk-audit against existing component documentation (Section 5); full check requires built markup, flagged as a Stage 9/10 follow-up.
- [ ] Findings shared with ui-designer and product-manager with clear recommendations — **pending distribution of this document**; recommendations are written and ready to hand off (Sections 2, 4, 6).
- [x] Anxiety/trust-sensitive moments have visible next steps and human-support escalation paths — waitlist form failure state includes a direct-email fallback (Section 3); footer contact info is treated as a required legitimacy signal, not decorative (Section 2, depth 8).
- [ ] Success metrics defined and baseline captured before launch — **partially open**; proposed metrics below, no baseline possible pre-launch (no traffic yet). Recommend product-manager/analytics-specialist confirm instrumentation before go-live:
  - Hero-to-waitlist-form scroll/click-through rate.
  - Waitlist form completion rate (started vs. submitted).
  - Time-on-page for "How It Works" and "Trust/Credibility" sections (proxy for comprehension engagement, given no analytics baseline exists yet).
  - Bounce rate segmented by entry point, once traffic exists to segment.

**Net status:** Stage 3 artifact complete for a pre-prototype marketing page. Not blocking Stage 4 (UI Design) — component mapping and journey structure are actionable now — but flags two decisions that should resolve before production sign-off: (1) the waitlist form's backend/service choice (Section 3, technical flag), and (2) the `AssetBadge` category gap (Section 6), both of which affect what `ui-designer` and `frontend-engineer` can actually build without inventing scope.
