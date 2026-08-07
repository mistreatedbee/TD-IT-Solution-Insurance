# Feature 002 — Public Landing Page: UI Design

**Lifecycle stage:** 4 — UI Design
**Stage owner (A):** `ui-designer`
**Input:** `docs/features/002-landing-page/business-requirements.md` (Stage 1, incl. Section 12 Compliance Review), `docs/features/002-landing-page/ux-research.md` (Stage 3)
**Status:** Draft — ready for `product-manager` sign-off and `frontend-engineer` handoff. Copy strings in this document are **design-stage copy**, written to satisfy Section 12.1.1/12.1.2's safe-language list; per Section 12.8 condition #3, `compliance-specialist` + `technical-writer` must re-review the final production copy string-by-string before publish. This document does not override that gate.
**Component source of truth:** `src/components/index.ts`. Every component/prop referenced below is verified against each component's `Context.md` as of this writing. No new component is introduced except by explicit gap flag routed to `design-system-manager`.

---

## 0. Visual Direction (applies page-wide)

**Brand read:** premium, trustworthy, calm insurance brand — not a startup-flavored SaaS page (Section 12.5.3 explicitly warns against "insurtech platform" phrasing/visual tone; this is a licensed insurer's own site).

- **Palette:** `background` (white) / `background-alt` or the `Section` `warm` background alternate down the page, so each section reads as a distinct block without hard dividers. Primary actions use the `primary`/gradient tokens (`accent-gradient-start/mid/end`) via `Button variant="primary"`. Reserve `accent-gold` for the Pricing teaser's highlighted tier `Badge`, consistent with `Badge`'s documented "gold for plan/accent highlights" use case — nowhere else, so gold doesn't get diluted into generic decoration.
- **Surfaces:** `Card` (white, `radius-card`, `shadow-resting` → `shadow-hover` on interactive) for FAQ context and pricing tiers; `Section` `background="warm"` for alternating rhythm. No `GlassCard` on this page — glass/frosted treatment is reserved for dashboard overlay contexts per the design system's existing usage pattern; a public marketing page over solid content doesn't need it, and introducing it here without a dashboard-style backdrop would look inconsistent.
- **Typography:** `SectionHeading` for every section's header — `eyebrow` + `title` + `subtitle` triplet used consistently so all 9 sections share the same hierarchy rhythm. `size="lg"` for Hero only; `size="md"` (default) elsewhere.
- **Motion:** `Reveal` wraps each section's primary content block (not nested — stagger siblings per its own guidance) with `direction="up"`, default `duration=0.6`. `StepItem` and `LogoCloud`/`StatBlock` motion already ships reduced-motion-safe per their own Context.md — no page-level override needed. Keep `Reveal` delays ≤0.4s per its guidance, and stagger grids (Asset Types, FAQ) at `delay={i * 0.08}` so a fast scroller isn't kept waiting.
- **Elevation logic:** `Card` `interactive` (default true) only where the card is actually clickable/linked (Pricing tier if it links out); `interactive={false}` for static info cards (e.g., a static FAQ intro card if used) so hover affordance never lies about clickability.
- **Tone discipline:** No decorative stock photography of "happy customers" (nothing to substantiate it, Section 12.6). Iconography stays within `lucide-react` icons already used by `StepItem`/`FeatureCard`/`AssetBadge`/`IndustryCard` — no new icon set.

---

## 1. Hero

**Components:** `Section` (`bleed`, `spacing="none"` for the hero band, or `spacing="default"` with `width="wide"` — see responsive notes), `Logo` (`variant="full"`, `tone="navy"`, `href="/"`, in the page header above the hero, not inside the hero block itself), `SectionHeading` (`as="h1"`, `size="lg"`, `align="left"` desktop / effectively centered on mobile via container width), `Button` (`variant="primary"`, `size="lg"` — primary CTA), `ArrowLink` (`tone="default"`, secondary anchor CTA), `Reveal`.

**Layout:** Header bar (not one of the 9 numbered sections, but required chrome): `Logo` left, no nav links required for v1 (single-page scroll — optional in-page anchor nav can reuse `ArrowLink` if `product-manager` wants it, not required by business-requirements.md). Hero content is a single centered column on mobile, two-thirds-width left-aligned column with right-side illustrative space (not stock photography — an abstract geometric/shield motif consistent with `Logo`'s glyph, or simply empty/whitespace at v1 since no illustration asset exists) on desktop ≥1024px.

**Copy (safe-language checked against Section 12.1.1/12.1.2):**

- Eyebrow: `Asset insurance, built for recovery`
- H1 (headline): **`Insurance that helps you get your stuff back.`**
  - Checked: no absolute-outcome language ("helps," not "will" or "guarantees"). No "always/never/100%."
- Subtitle (subhead): **`TD IT Solution Insurance covers your vehicles, laptops, phones, tablets, TVs, desktops and business equipment — and works with GPS-assisted recovery and security-company partners when something is lost or stolen. Cover is subject to policy terms, underwriting and claims assessment.`**
  - Checked: names asset categories (matches Section 2.3/Section 3 vocabulary exactly), uses the approved phrase "GPS-assisted recovery, coordinated with security-company partners" in substance, and carries the mandatory "subject to..." qualifier **in the same visual block** as the benefit claim per Section 12.1.3 and Section 12.2(b)(1) — not a footnote.
- Primary CTA button label: **`Get Notified`** (per business-requirements.md Section 6's recommendation; identical action/label reused verbatim in Section 8 Final CTA per the hard consistency requirement).
- Secondary CTA (ArrowLink, low commitment, anchor-scrolls to Section 2): **`See how it works`**

**Responsive notes:** Mobile-first — H1 wraps to 2–3 lines comfortably at `text-3xl`/`text-4xl` scale (defer exact scale to `SectionHeading`'s own responsive type ramp); subtitle max-width caps per `SectionHeading`'s documented `max-w-2xl` so it doesn't stretch full-bleed on tablet. CTA button and ArrowLink stack vertically full-width on mobile (`Button fullWidth` on <640px), sit side-by-side on ≥640px. Hero must render its full value proposition + CTA above the fold on a 375×667 viewport without requiring horizontal scroll (Persona A's "understand within seconds" bar from ux-research.md Section 1).

---

## 2. How It Works

**Components:** `Section` (`background="warm"`), `SectionHeading`, `StepItem` ×3 inside `<ol>`, `Reveal` (wrapping the `<ol>`, or staggered per `StepItem`'s own `delay` prop — prefer the latter since `StepItem` already supports staggered entrance natively).

**Structure:** 3 steps (not 4 — ux-research.md flags `StepItem`'s doc example shows 4-step usage; this page uses 3, with `isLast` set on step 3, `orientation="horizontal"` so the connector renders at `lg` and up, falls back to vertical stacking below `lg`).

**Copy:**

- Eyebrow: `How It Works`
- Title: **`Three steps, from sign-up to recovery`**
- Subtitle: `Here's the model we're building — clearly, so you know exactly what you're signing up for.`

| Step | `title` | `description` | `icon` |
|---|---|---|---|
| 1 | `Subscribe to a plan` | `Choose a plan that fits what you want covered.` | e.g. `ClipboardCheckIcon` |
| 2 | `Register your assets` | `Add the vehicles, devices and equipment you want protected.` | e.g. `LaptopIcon` |
| 3 | `GPS-assisted recovery` | `If something's lost or stolen, we work with our security-company partners to try to recover it. Recovery is best-effort and depends on the asset's tracking status and on-the-ground conditions — subject to policy terms, underwriting and claims assessment.` | e.g. `ShieldCheckIcon` |

**Compliance check:** step 3's description is deliberately the longest — it carries the mandatory best-effort hedge **inline, same size as the claim itself**, per Section 12.1.3's explicit instruction that this exact step must state the limitation in body copy, not a footnote. This is the single highest-scrutiny copy block on the page (Section 12.1's "prominence rule" names this section by number).

**Responsive notes:** Mobile stacks steps vertically with `orientation="vertical"` connector (per `StepItem`'s own documented horizontal/vertical switch — actually confirm with `frontend-engineer`: `StepItem`'s horizontal connector "only renders at `lg` and up" per its own Context.md, meaning at `orientation="horizontal"` prop value the component itself suppresses the connector below `lg`; no separate vertical variant needs to be manually swapped in per breakpoint — pass `orientation="horizontal"` uniformly and let the component handle the responsive connector visibility). Numeral watermark should not overflow the step title column at 375px width — verify against `StepItem`'s own responsive padding.

---

## 3. Asset Types Covered

**Components:** `Section` (`background="white"`), `SectionHeading`, `AssetBadge` ×8 in a responsive grid, `Reveal` (staggered per badge, `delay={i * 0.05}`).

**Copy:**

- Eyebrow: `What's Covered`
- Title: **`Cover for the assets you actually own`**
- Subtitle: `From the car in your driveway to the laptop on your desk. Cover is subject to policy terms, underwriting and claims assessment.`

**Grid — 8 `AssetBadge` items, `size="md"`, none `selected` (this is an informational grid, not a selector — no `onClick`, so each renders as a static `div` per the component's own documented behavior), no `description` prop (no per-asset coverage caps or figures per Section 2.3's hard constraint):**

| # | `type` | Display label |
|---|---|---|
| 1 | `vehicle` | Vehicles |
| 2 | `laptop` | Laptops |
| 3 | `phone` | Smartphones |
| 4 | `tablet` | Tablets |
| 5 | `tv` | TVs |
| 6 | **`desktop`** (gap — see below) | Desktop computers |
| 7 | `business` | Business equipment |
| 8 | **`other`** (gap — see below) | Other electronics |

**Component gap — carried forward from ux-research.md, not resolved here:** `AssetBadge`'s `type` prop today only supports `vehicle \| laptop \| phone \| tablet \| tv \| business` (6 values). This section needs 2 more: **desktop computers** and **other electronics**. Per the task brief, `design-system-manager` is concurrently extending `AssetBadge` to cover these — this design references the two additional types **by name only** (`desktop`, `other`, table above) and does not invent their icon choice, exact label string, or visual treatment; that is `design-system-manager`'s call, to be slotted into the grid above once the extended component ships. **Do not build this section by mixing `AssetBadge` with a fallback `Card`/`FeatureCard` for just these two items** — ux-research.md correctly flags that as visual fragmentation; hold this section pending the `AssetBadge` extension rather than shipping a mismatched grid.

**Grid layout:** `grid grid-cols-2 gap-3` on mobile (4 rows of 2), `sm:grid-cols-3` (tablet), `lg:grid-cols-4` (desktop, 2 rows of 4) — keeps "business equipment" visually equal-weight with consumer categories per ux-research.md's Persona B note (no end-of-list afterthought placement; alphabetical-adjacent-to-category ordering above, not "consumer items first, business last").

**Responsive notes:** All 8 badges must be scannable without requiring interaction (tap/hover) — `AssetBadge`'s label is always visible text, satisfying the "no icon-only meaning" accessibility requirement from ux-research.md Section 5 by default.

---

## 4. Trust / Credibility

**Components:** `Section` (`background="warm"`), `SectionHeading`, `Badge` (`tone="neutral"`, "Coming soon" labels), `FeatureCard` ×2 (soft trust framing), `LogoCloud` — **conditionally omitted**, `Reveal`.

**Copy:**

- Eyebrow: `Why Trust Us`
- Title: **`Built to be transparent about what's live and what's coming`**
- Subtitle: `We'd rather tell you exactly where we are than oversell it.`

**Content blocks (two `FeatureCard`s, `align="left"`, `grid md:grid-cols-2 gap-6`):**

1. `FeatureCard` — icon `ShieldCheckIcon` — title **`Licensed insurer`** — description: **`TD IT Solution Insurance is the underwriter — not a broker or a platform placing your business with someone else. Full regulatory details are in the footer of every page.`** — this is the **soft** trust signal for this section; the full legal disclosure block (entity name, CIPC reg no., FSP number, insurer licence statement, complaints/Ombud route) lives exclusively in the Footer (Section 9 below) per Section 12.5.2's placement ruling. This card must not restate the FSP number or licence text itself — no duplicate/partial disclosure that could drift out of sync with the footer's authoritative block.
2. `FeatureCard` — icon `MapPinIcon` (or similar) — title **`GPS-assisted recovery, coordinated with security-company partners`** — description: **`When you report an asset stolen, we work with security-company partners to try to recover it. This is best-effort, not a guarantee — recovery depends on tracking status and on-the-ground conditions.`** — reuses the exact approved phrase from Section 12.1.1's safe-language list, with the hedge inline per 12.1.3.

**Partner logos — explicitly NOT included at v1.** Per ux-research.md Section 4 and business-requirements.md Section 2.4's hard no-fabrication rule: **do not render `LogoCloud` on this page at launch.** `LogoCloud`'s own default behavior (`DEFAULT_LOGOS` fallback when no real `logos` prop is supplied) would read as real partner logos to a fast-scanning visitor, which is exactly the near-real-placeholder problem both documents prohibit. If/when real, confirmed security-company partnerships exist, this section can add a `LogoCloud` with real `src` logos and a title such as "Working alongside" — that is a future content update, not a Stage 4 deliverable, and requires `product-manager` confirmation the partnerships are real before any logo (even monochrome) is added.

**Data-handling line (small, body-size, below the two `FeatureCard`s, not a footnote):** **`We only collect what we need, and we handle personal information under South African data protection law (POPIA). See our Privacy Policy for details.`** — `ArrowLink` to `/privacy` (route must exist per Footer spec below).

**No `StatBlock` in this section** — no real, ratified figure exists to animate (ux-research.md explicitly warns against inventing one just to fill space); omit rather than fabricate.

**Responsive notes:** Two `FeatureCard`s stack single-column on mobile, 2-up from `md:` up. `Badge` "Coming soon" (if used inline near any Phase-2-only mention) sits directly adjacent to the relevant text, same line where possible, not in a separate legend.

---

## 5. Pricing / Plans Teaser

**Components:** `Section` (`background="white"`), `SectionHeading`, `Card` (`interactive={false}` — these are informational tier cards, not yet clickable products) ×3, `Badge` (`tone="gold"`, on the middle/highlighted tier only), `Button` (`variant="secondary"`, routes to the same waitlist action as the primary CTA — reuses the CTA, does not invent a 4th distinct action per ux-research.md's explicit guidance), `Reveal`.

**Copy:**

- Eyebrow: `Plans`
- Title: **`Plans for every asset type`**
- Subtitle: **`We're finalizing pricing. Join the waitlist and you'll be the first to see it — before anyone else.`**
  - Deliberately generic per business-requirements.md Section 2.5 / OQ-2: no ratified pricing exists at time of this design. No "starting from R___" figure appears anywhere in this section.

**Three tier `Card`s (names/positioning only, no numbers, per Section 2.5):**

| Tier | `CardHeader title` | `CardHeader description` | Badge |
|---|---|---|---|
| 1 | `Basic` | `Core cover for a single asset.` | — |
| 2 | `Standard` | `Cover for multiple everyday assets.` | `Badge tone="gold"` "Most popular" — **only include this label if/when it's substantiated by actual signup data; at v1 with no customers, omit the "Most popular" badge entirely and show the card unbadged.** Flagged here as a v1 build note, not shipped copy. |
| 3 | `Premium` | `Broader cover, including business equipment.` | — |

Each `Card`'s `CardFooter`: **`Coming soon`** as plain text (no fake "From R99/month" pricing) — no per-tier CTA button; the single page-level CTA (Section 5's `Button variant="secondary"` below the three cards, label **`Get Notified When Plans Launch`**) is the only actionable element in this section, satisfying "reuse the primary CTA action, don't invent a fourth CTA target."

**Compliance check:** zero numeric figures anywhere in this section (no premiums, no coverage limits, no excess amounts) — this keeps CQ-2(a)'s conditional policy-wording-link requirement dormant (Section 12.2(a)). If `product-manager`/`OQ-2` later ratifies real pricing, this section **must** be redesigned with a visible link to full policy wording per Section 12.2(a) — flagged here as a trigger condition, not resolved by this document.

**Responsive notes:** 3 `Card`s stack single-column on mobile, `sm:grid-cols-3` from tablet up, equal height via grid (`items-stretch`).

---

## 6. What to Expect (Testimonials placeholder — Option B chosen)

**Decision: Option B — reframe as "What to expect," not Option A (omit) or Option C (substitute-true-statement).** Rationale in the report below; design spec follows.

**Components:** `Section` (`background="warm"`), `SectionHeading`, `Card` (`interactive={false}`) ×3 as a mini numbered narrative — **not** `StepItem` (this isn't a process timeline, it's an illustrative "if this happens, here's the flow" narrative, and re-using `StepItem` here would visually collide with Section 2's "How It Works" steps and confuse the two). **`TestimonialCard` is explicitly NOT used** — its documented contract (`quote` + `authorName` + `authorTitle` + `company`, optional `avatar`) is built for a real attributed person, which this feature cannot lawfully supply (Section 12.6). Reaching for `TestimonialCard` and hand-waving fake author fields is exactly the anti-pattern both compliance-specialist and ux-researcher flag.

**Copy — second person, future/conditional tense throughout, explicitly framed as "how the product is designed to work," per Section 12.6 Option B's condition:**

- Eyebrow: `What to Expect`
- Title: **`Here's what happens if your laptop is stolen`**
- Subtitle: **`This is how the product is designed to work — not a customer story, since we're pre-launch.`** — this framing sentence is **mandatory**, not optional styling; it is the exact condition Section 12.6 attaches to Option B ("clearly framed as how the product is designed to work, not as reported customer experience").

**Three `Card`s, small numeral or icon (reuse `lucide-react` icons already established, e.g. `AlertTriangleIcon` / `PhoneCallIcon` / `CheckCircleIcon`), body copy:**

1. **`You report it.`** — `You'd flag the laptop as stolen in the app, in a couple of taps.` *(no present-tense claim it exists today — conditional "would," consistent with Section 5's roadmap-honesty rule since the in-app theft-report flow is Phase 2, not shipped)*
2. **`We coordinate.`** — `We'd notify our security-company partners and start working the case.`
3. **`You're kept in the loop.`** — `You'd get updates as things progress — recovery is best-effort and depends on tracking status and on-the-ground conditions, subject to policy terms, underwriting and claims assessment.`

**Compliance check:** no guaranteed outcome anywhere in the three cards (12.1.2(a)); no present-tense claim that the in-app report flow or live tracking exists today (Section 5, 12.1.2(d)) — all three use conditional "would," matching the subtitle's explicit "designed to work" framing; the hedge appears in the same card as the claim (card 3), not a separate disclaimer card.

**Responsive notes:** 3 `Card`s single column on mobile, `md:grid-cols-3` from tablet up — same grid rhythm as Section 5 for visual consistency.

---

## 7. FAQ

**Components:** `Section` (`background="white"`), `SectionHeading`, `Accordion` (`allowMultiple={false}`, `defaultOpen={[]}`) with `AccordionItem` ×5, `Reveal`.

**Copy:**

- Eyebrow: `Questions`
- Title: **`Frequently asked questions`**

| `value` | `title` (question) | Answer body |
|---|---|---|
| `covered` | `What does TD IT Solution Insurance cover?` | `Vehicles, laptops, smartphones, tablets, TVs, desktop computers, business equipment and other electronics. Cover is subject to policy terms, underwriting and claims assessment — full policy wording is available at signup.` |
| `recovery` | `What affects whether my asset is recovered?` | `Recovery is best-effort, coordinated with security-company partners, and depends on things like whether the asset's tracking hardware is active, its signal/power state, and on-the-ground conditions at the time. It isn't guaranteed — no insurer can promise that.` *(this is the explicit "What affects whether my asset is recovered?" entry Section 12.1.3 directs be included, with a non-optimistic-only framing.)* |
| `cancel` | `Can I cancel any time?` | `We're finalizing the exact cancellation terms for launch — they'll be set out in full in your policy documents. Join the waitlist and we'll make sure you see them before you commit to anything.` *(no invented cancellation rule stated as fact — Section 2.7's "link out rather than invent specifics" instruction.)* |
| `gps` | `How does GPS-assisted recovery actually work?` | `The model: your asset has GPS tracking hardware, and if it's reported lost or stolen, we work with security-company partners to try to locate and recover it. This is a coordinated, best-effort process, not real-time live tracking you can watch yourself today.` |
| `privacy` | `How do you handle my personal information?` | `We collect only what we need, for the purpose we tell you about at the time — for example, just an email address for the waitlist. We handle personal information under POPIA. Full details are in our Privacy Policy.` |

*(5 questions — within the requested 4–6 range; a 6th, e.g. "Is TD IT Solution Insurance a licensed insurer?", may be added and should answer with the same soft-signal language as Section 4, pointing to the footer for the formal disclosure — left optional for `technical-writer` to size against final page length.)*

**Responsive notes:** `Accordion` full width within `Section`'s default container (`width="default"`, not `wide` — FAQ reads better at a narrower max-width for line length). Triggers are already full-width tap targets per `Accordion`'s own a11y notes — no additional mobile tap-target work needed.

---

## 8. Final CTA

**Components:** `Section` (`background="warm"` or a subtle gradient band — reuse `accent-gradient-start/mid/end` tokens at low opacity if a distinct "closing" visual moment is wanted, otherwise plain `warm`), `SectionHeading` (`align="center"`), `Input` ×2 (waitlist form, repeated — see form spec below), `Button` (`variant="primary"`, `size="lg"`), `Reveal`.

**Copy:**

- Eyebrow: `Join the Waitlist`
- Title: **`Be first to know when we launch`**
- Subtitle: **`Get notified the moment TD IT Solution Insurance opens up — no spam, ever.`**

**Waitlist form spec (identical form used here and can be reused/anchored-to from the Hero's primary CTA — see note below):**

- `Input label="Email address" type="email" required` — **mandatory.**
- `Input label="Full name (optional)" type="text"` — **NOT `required`.** Per Section 12.3.2's minimality ruling, name is optional; the label text itself says "(optional)" so the optionality is visible on the field, not just implied by the absence of an asterisk (asterisk-only optionality cues are easy to miss — explicit label text is the safer a11y/UX choice here).
- No other fields. No phone, no address, no asset-details dropdown — explicitly prohibited by Section 12.3.2.
- **No pre-ticked or bundled marketing checkbox** (Section 12.3.4). If `product-manager` later wants a marketing opt-in, it must be a separate, unticked checkbox that does not gate form submission — not part of this Stage 4 spec; omitted per compliance's stated default.
- **POPIA notice, visible directly under the form fields, above the submit button, in body-size text (not fine print, not a tooltip):**

  > `We'll only use your email to let you know when TD IT Solution Insurance launches. We won't send you marketing, and we won't share your details with anyone else. You can ask us to delete them at any time — see our Privacy Policy.`

  This is the model copy approved verbatim in Section 12.3.3 of business-requirements.md. Do not shorten it into a footer link only — Section 12.3.3 requires items 1–7 (who/what/why/purpose-limit/voluntary/opt-out/retention) be visible at the form itself, and this sentence plus the adjacent "Privacy Policy" `ArrowLink` are the vehicle for that.

- Submit button label: **`Get Notified`** (same label/action as the Hero CTA — Section 2.8's hard consistency requirement).
- **Success state (inline, not a redirect):** form area transforms in place to: `Badge tone="emerald"` + text **`You're on the list — we'll email you at [email] when we launch.`** Must be wrapped so the state change is announced via `aria-live="polite"` per ux-research.md Section 5's accessibility flag (implementation detail for `frontend-engineer`, called out here so it isn't dropped at handoff).
- **Error state:** `Input error="..."` inline per-field for validation errors (e.g., invalid email format), plus a page-level fallback message if submission itself fails: **`Something went wrong submitting the form. Try again, or email us directly at [SUPPORT EMAIL — pending] and we'll add you to the list.`** — bracket-placeholder pattern intentionally mirrors the footer's `— pending` convention so it's equally greppable/non-fabricated (real support email TBD from `product-manager`, not invented here).

**Relationship to Hero CTA:** the Hero's `Button` may either (a) anchor-scroll down to this Final CTA section's form, or (b) open the same form inline/in a lightweight expand within the Hero itself. **Recommendation: (a), anchor-scroll to Section 8's form**, so there is exactly one form instance on the page (simpler build, avoids two independent form-state implementations drifting out of sync) — `frontend-engineer` to confirm feasibility; if two form instances are technically simpler to ship, both must share identical copy/validation/success-state behavior per this spec.

**Responsive notes:** Two `Input`s stack vertically full-width on mobile; may sit side-by-side with the button stacked below on tablet+, but never sacrifice the POPIA notice's visibility — it must never be scrolled out of view or collapsed behind a "more info" toggle at any breakpoint.

---

## 9. Footer — Full Compliance-Mandated Disclosure Block

**Components:** `Section` (`as="footer"`, `background` — use the navy surface via `className` override with `surface-navy`/`surface-navy-deep` tokens, since `Section`'s own `background` prop only offers `white`/`warm` — a navy footer needs a `className` addition, not a new component; e.g. `<Section as="footer" className="bg-surface-navy-deep text-text-inverse">`), `Logo` (`tone="light"`, `size="lg"`, per its own documented footer example), plain text blocks + `ArrowLink` (`tone="inverse"`) for legal links.

This is the single most legally load-bearing section on the page (Section 12.5, 12.8 conditions #1 and #2 are hard publish blockers here). **Every element below is required; nothing here is optional styling.**

### 9.1 Layout (mobile: single stacked column; desktop `lg:` up: 3–4 column grid)

**Column A — Brand**
- `Logo tone="light" size="lg"` with `label="TD IT Solution Insurance"` (default, matches Logo's documented default `label`).
- One-line tagline (non-claims): `Insurance for the things you can't afford to lose.` *(checked: no outcome claim, purely descriptive.)*

**Column B — Company / Legal**
- `[REGISTERED ENTITY NAME — pending]` `(Pty) Ltd`, trading as **TD IT Solution Insurance** — literal placeholder string per Section 12.5.2 item 1, rendered exactly as specified, not paraphrased, not filled with an invented name.
- Company registration number: **`Reg. No. [COMPANY REG NO — pending]`**
- **`TD IT Solution Insurance is a licensed non-life insurer in terms of the Insurance Act 18 of 2017.`** — insurer statement, exact wording pending 12.5.1's licence-category confirmation but this sentence is the approved placeholder form.
- **`[INSURER LICENCE — pending confirmation]`** — literal placeholder string, sits directly adjacent to the insurer statement above (not a separate hidden line).
- **`Authorised financial services provider, FSP No. [FSP NUMBER — pending]`** — literal placeholder string.
- All four placeholder strings above **must match Section 12.5.2's exact literal text** — `[FSP NUMBER — pending]`, `[INSURER LICENCE — pending confirmation]`, `[COMPANY REG NO — pending]`, `[REGISTERED ENTITY NAME — pending]` — verbatim, so they remain greppable for the CI build-gate check specified in Section 12.8 condition #8 (`— pending` string absence check before production publish). **Do not invent, round, or "example-ify" any of these values at any stage of implementation.**

**Column C — Contact**
- Registered/physical address: `[REGISTERED ADDRESS — pending]` *(placeholder added here by `ui-designer` for consistency with the other pending items — business-requirements.md Section 12.5.2 item 5 requires a physical/registered address but Section 12.5's literal-placeholder list in the doc doesn't enumerate one explicitly; using the same bracket convention here rather than inventing a fake address is the only compliant option. Flag to `business-analyst`/platform owner alongside the other pending items.)*
- Contact email: `[SUPPORT EMAIL — pending]` *(same reasoning — no support email address has been supplied to this document; using the placeholder convention rather than fabricating one, e.g. not defaulting to a guessed `support@...` address.)*
- Contact phone (optional if not yet assigned): omit rather than fabricate if none exists.

**Column D — Legal & Complaints**
- `ArrowLink tone="inverse" href="/privacy"` — **`Privacy Policy`** *(per Section 12.2(b)(2), this must NOT ship as a "coming soon" stub once the waitlist form is live — route must exist and `technical-writer`/`frontend-engineer` must treat this as a real, if minimal, page, not a dead link.)*
- `ArrowLink tone="inverse" href="/terms"` — **`Terms of Service`** *(may launch as a genuinely minimal real page per Section 12.2(b)(2) — website-use terms, not policy wording.)*
- **Complaints route**, plain text (not a link-only treatment — Section 12.5.2 item 6 wants this visible, not one click removed): **`Not happy with something? Contact us at [SUPPORT EMAIL — pending] first. If we can't resolve it, you can escalate to the [OMBUD FOR SHORT-TERM INSURANCE — pending] .`** — bracket-placeholder pattern applied identically to the Ombud reference since business-requirements.md doesn't supply the exact Ombud body name/contact details either; same no-fabrication rule applies (do not guess "the FAIS Ombud" vs. "the Ombudsman for Short-Term Insurance" — these are different bodies and picking the wrong one is itself a misrepresentation risk per 12.5's stated severity).

### 9.2 Bottom bar

- Copyright: **`© 2026 TD IT Solution Insurance. All rights reserved.`** (current year per `currentDate`, dynamically generated by `frontend-engineer`, not hardcoded).
- No cookie-consent banner (Section 12.4's ruling — no analytics ships, so nothing to consent to; do not add a banner "just in case").

### 9.3 Legibility requirement (binding, not a style suggestion)

Per Section 12.5.2: the entire Column B disclosure block must be **legible** — it may be smaller than body copy (e.g., `text-sm`) but must clear WCAG AA contrast (4.5:1) against the navy footer background using `text-inverse`/`text-inverse-muted` tokens correctly (verify `text-inverse-muted` specifically clears 4.5:1 at footer's actual navy value — ux-research.md flags this exact token pairing as a contrast risk to double-check). **It must not be:**
- inside a collapsed `Accordion`,
- behind a modal/tooltip trigered by hover or click,
- a lower-contrast/smaller treatment than the rest of the footer,
- or a link labelled generically "Legal" that hides the actual text.

It renders as static, always-visible footer text on every page load, matching Section 12.5.2's explicit placement ruling.

### 9.4 Production build gate (flag to `frontend-engineer`/`devops-engineer`, not a design decision but a required cross-reference)

Per Section 12.8 condition #8: a CI/build check must assert the literal string `— pending` is absent from the production bundle before publish. This design intentionally uses that exact string across all placeholders so the single greppable check covers the whole footer disclosure block, plus the two additional placeholders this document adds (`[REGISTERED ADDRESS — pending]`, `[SUPPORT EMAIL — pending]`, `[OMBUD FOR SHORT-TERM INSURANCE — pending]`) for the same mechanical check to catch.

**Responsive notes:** 4-column desktop grid collapses to a single stacked column on mobile in the order Brand → Company/Legal → Contact → Legal & Complaints → bottom bar, so the disclosure block (Column B) is never the last, easiest-to-skip thing on a long mobile scroll — keep it second, immediately after the brand mark, not buried after contact/legal links.

---

## 10. Component Gaps Summary (routed onward, not resolved here)

1. **`AssetBadge` — 2 missing asset types (`desktop`, `other`).** Already in flight with `design-system-manager` per the task brief; this document references both by name (Section 3 table) without specifying icon/exact-label choice, which remains `design-system-manager`'s call. **Blocking** for Section 3 to ship pixel-complete — Section 3's grid cannot render all 8 badges correctly until the extension lands.
2. **No other new component is required.** Confirmed by cross-checking every section above against `src/components/index.ts`'s authoritative export list — `Section`, `SectionHeading`, `FeatureCard`, `StepItem`, `AssetBadge`, `Card`, `Button`, `Input`, `ArrowLink`, `Badge`, `Reveal`, `Logo`, and (unused on this page, confirmed intentionally) `Avatar`, `Carousel`, `GlassCard`, `IndustryCard`, `LogoCloud`, `StatBlock`, `TestimonialCard` all exist and cover this page's needs, with `TestimonialCard` and `LogoCloud` deliberately **not used** at v1 for the reasons in Sections 4 and 6 above (not a gap — a deliberate non-use).
3. **Minor styling note, not a component gap:** the Footer's navy background requires a `className` override on `Section` (`bg-surface-navy-deep` or similar) since `Section`'s own `background` prop only exposes `white`/`warm`. This is within `ui-designer`'s authority to compose via `className` per the component's own documented `className` prop — does not require a new `Section` background variant from `design-system-manager`, but flagging so `frontend-engineer` doesn't read it as an oversight.

---

## 11. Redline / Handoff State Matrix (per component used)

| Component | Default | Hover | Focus | Error | Loading | Empty |
|---|---|---|---|---|---|---|
| `Button` (CTA) | `variant="primary"` gradient pill | scale/opacity per component default | visible focus ring (native, not overridden) | n/a (buttons don't error) | `loading` prop → spinner + `aria-busy` on form submit | n/a |
| `Input` (email) | default border | n/a (inputs don't hover-state) | blue-600 border + ring per component default | `error` prop, red-500/600, `aria-invalid`, message via `aria-describedby` | n/a | placeholder text only, no dummy pre-filled value |
| `AssetBadge` | static `div`, neutral | n/a (non-interactive, no `onClick` passed) | n/a (not focusable, no `onClick`) | n/a | n/a | n/a — all 8 always rendered, no empty state |
| `Accordion`/`AccordionItem` | collapsed, `defaultOpen={[]}` | trigger hover per component default | visible focus ring on trigger `button` | n/a | n/a | n/a |
| `ArrowLink` | default tone per section background (`default` on white/warm, `inverse` on navy footer) | arrow slide-in per component default | same slide-in triggered by focus (already unified per component docs) | n/a | n/a | n/a |
| `StepItem` | fade-up entrance via own animation | n/a | n/a (no direct interactive element beyond none) | n/a | n/a | n/a |
| Waitlist form (composed) | two `Input`s + `Button`, POPIA notice visible | n/a | tab order: email → name → submit | inline per-field `Input error`, plus page-level fallback message (Section 8) | `Button loading` on submit | n/a — form always has both fields visible, never conditionally hidden |

---

## 12. Pre-Approval Checklist (ui-designer self-review)

- [x] **Screen composed primarily from existing component library; any new component request routed to `design-system-manager`.** Only outstanding gap is the already-in-flight `AssetBadge` 2-type extension (Section 10, item 1); everything else uses existing components/props verified against each `Context.md`.
- [x] **Status/state indicators use accessible, redundant (not color-only) cues.** `AssetBadge` labels are always visible text (no icon-only meaning); success state (Section 8) pairs `Badge tone="emerald"` with explicit confirmation text, not color alone; "Coming soon" labeling (Section 4) is text, not a color dot.
- [x] **High-stress flows validated for minimal steps and visible support escalation.** This page has no theft-report/claim flow (out of scope, Feature 001/Phase 2). Its one interactive flow — the waitlist form — is 2 fields, 1 step, with an explicit error-state fallback to a direct support email (Section 8), consistent with ux-research.md Section 3's requirement.
- [ ] **Contrast ratios and tap target sizes meet WCAG 2.1 AA.** Specified as a requirement throughout (Section 9.3 footer legibility, Section 0 palette notes flagging `ArrowLink tone="muted"` and footer `text-inverse-muted` as specific tokens to verify), but **not independently measured against rendered hex values in this document** — this is a design-stage flag, not a verified pass; `frontend-engineer` must confirm actual computed contrast at build, and ux-research.md Section 7's accessibility pass should still occur post-build.
- [x] **Design reviewed against `ux-researcher`'s journey map/persona findings.** All 9 sections cross-checked against ux-research.md Section 2's scroll-depth table; Persona A (price-sensitive), B (legitimacy-scanning), and C (skeptical/differentiation) needs are addressed at the specific sections ux-research.md identified (Hero/How-It-Works for A & C, Footer/Trust for B, Pricing framed as non-dead-end for A).
- [x] **Redline/handoff spec includes states (default, hover, focus, error, loading, empty) for each component used.** Section 11.
- [x] **Design reviewed against brand tone: premium, trustworthy, calm.** Section 0; explicit avoidance of "insurtech platform" framing per Section 12.5.3's warning; no stock-photo/fabricated social proof anywhere on the page.
- [ ] **Sign-off obtained from `product-manager` (or delegate) before Development handoff.** Pending — this document is the artifact submitted for that sign-off, along with the still-open OQ-1 (CTA approach — this design assumes business-analyst's waitlist recommendation is accepted) and OQ-2 (pricing scope — this design assumes "plans coming soon," no ratified pricing) from business-requirements.md Section 10.

**Additional compliance cross-check (beyond the standard checklist, given Section 12's binding weight on this specific feature):**
- [x] Every benefit/recovery claim in this document carries its "subject to policy terms, underwriting and claims assessment" qualifier **in the same visual block**, not a footnote (Hero subtitle, How It Works step 3, Trust card 2, What-to-Expect card 3, FAQ `covered`/`recovery` answers).
- [x] No language anywhere in this document appears on the Section 12.1.2 prohibited list (checked: no "guarantee," "always," "never," "100%," unqualified "free," "eliminate risk," or present-tense live-tracking claim).
- [x] Footer disclosure block fully specified per Section 12.5.2's 6 required elements, using the exact literal placeholder strings mandated (Section 9 above).
- [x] Testimonials section resolved to an approved option (B) with the mandatory framing condition met (Section 6).
- [x] Waitlist form specified with email mandatory, name explicitly optional, no bundled/pre-ticked marketing consent, and the approved POPIA model copy placed at the form itself (Section 8).
- [x] No analytics/cookie-consent UI specified anywhere on the page, consistent with Section 12.4's ruling.

**Net status:** Stage 4 artifact complete for `product-manager` review and `frontend-engineer`/`technical-writer` handoff, gated on (a) the `AssetBadge` extension landing for Section 3, (b) `product-manager` resolving OQ-1/OQ-2, and (c) all footer placeholder values being supplied by the platform owner before this page may ever reach production (Section 12.8 — this document does not, and cannot, resolve that blocker; it only ensures the design is structurally ready to receive the real values the moment they exist).
