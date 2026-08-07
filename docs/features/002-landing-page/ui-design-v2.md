# Feature 002 — Public Landing Page: UI Design v2 (Composition Revision)

**Lifecycle stage:** 4 — UI Design (revision)
**Stage owner (A):** `ui-designer`
**Supersedes:** nothing in `ui-design.md` — this is an *additive* composition/layout revision. `ui-design.md` remains the copy, compliance-placement, component-selection, and redline-state source of truth. **Do not duplicate its content here; where this document is silent, `ui-design.md` governs.**
**Trigger:** `design-system-manager` commit `8ef9aa0` landed new typography tokens (Fraunces/Public Sans replacing Inter/Inter) and a navy/blue/orange palette anchored to `public/logo.png`, replacing the generic blue→cyan gradient. That fixed the "generic AI template" tell at the *token* layer. This document fixes the same tell at the **composition** layer: today's `src/pages/LandingPage.tsx` is a uniform vertical stack of centered `Section`s — eyebrow → centered heading → centered body → centered content, alternating white/warm background, same rhythm all the way down. That uniformity is itself a template signature, independent of color.
**Scope:** Layout/composition only. **No copy changes.** Every string in `ui-design.md` Sections 1–9 (headline, subtitle, step copy, FAQ questions/answers, footer disclosure block, POPIA notice, etc.) ships verbatim. No compliance placement rule from `ui-design.md` / `business-requirements.md` §12 is weakened, hidden, shrunk, or demoted — several are made *more* prominent by the new composition (noted per section).
**Status:** Draft — ready for `product-manager` sign-off and `frontend-engineer` handoff, gated on the same open items `ui-design.md` §12 already flags (AssetBadge `desktop`/`other` extension, OQ-1/OQ-2, footer placeholder values).

---

## 0. What changes and why

Five things, in order of visual impact:

1. **Hero breaks from centered-stack-with-whitespace-below** to an asymmetric split: copy left, a large-scale decorative brand-motif field right, bleeding to the viewport edge.
2. **Section rhythm is deliberately varied**, not uniform. Of the 8 content sections, only 2 keep the plain centered `eyebrow → title → subtitle` pattern from `ui-design.md`; the rest alternate two-column asymmetric layouts, a full-bleed dark band, and a staggered/uneven grid.
3. **One recurring graphic motif — the "open chevron" from `public/logo.png`** — is extracted as a reusable inline SVG and used structurally (not just as the header logo) across five sections: hero background field, a section-transition divider, Asset Types card accents, FAQ accordion markers, and the footer.
4. **Motion direction/timing is varied per section** using `Reveal`'s existing `direction`/`delay`/`distance` props — alternating left/right/up entrances and larger stagger spread on grid sections — instead of the uniform `direction="up"` used everywhere today.
5. **No new components.** Everything below composes `Section`, `SectionHeading`, `FeatureCard`, `StepItem`, `Card`/`CardHeader`/`CardFooter`, `Button`, `ArrowLink`, `Reveal`, `Logo`, `AssetBadge`, `Accordion`/`AccordionItem`, plus one **flagged, documented gap**: a page-local decorative SVG component (`ChevronMotif`, not a design-system primitive) — see §7.

**Compliance guardrail restated up front:** the footer disclosure block (`ui-design.md` §9), the anti-fabrication rules (no `TestimonialCard`, no `LogoCloud` with placeholder logos — §4 and §6 of `ui-design.md`), the mandatory "subject to..." qualifiers living in the *same visual block* as each claim, and the waitlist form's POPIA notice/optionality rules are **unchanged in wording and unchanged in "same block, not a footnote" placement**. Where a section's layout changes from single-column to two-column, the qualifier text stays welded to its claim inside the same column/card — it never moves to a separate column, a tooltip, or a collapsed element. This is checked per-section below and re-affirmed in §8.

---

## 1. Hero — asymmetric split, not centered stack

**Today:** single centered-left column (`max-w-2xl`), nothing on the right, large empty space below on desktop.

**v2 layout:**

```
<Section spacing="none" width="full" bleed className="relative overflow-hidden bg-white">
  <div className="mx-auto grid w-full max-w-7xl grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] lg:items-center px-6 lg:px-8 pt-16 pb-20 lg:pt-24 lg:pb-28 gap-12 lg:gap-8">
    {/* Left: copy column, unchanged content/copy from ui-design.md §1 */}
    <Reveal direction="left" distance={32}>
      <div className="max-w-xl">
        <SectionHeading as="h1" size="lg" align="left" eyebrow="Asset insurance, built for recovery"
          title="Insurance that helps you get your stuff back."
          subtitle="TD IT Solution Insurance covers your vehicles, laptops, phones, tablets, TVs, desktops and business equipment — and works with GPS-assisted recovery and security-company partners when something is lost or stolen. Cover is subject to policy terms, underwriting and claims assessment." />
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button variant="primary" size="lg" fullWidth onClick={scrollToWaitlist} className="sm:w-auto">Get Notified</Button>
          <ArrowLink href="#how-it-works" tone="default">See how it works</ArrowLink>
        </div>
      </div>
    </Reveal>

    {/* Right: large-scale chevron motif field, decorative, aria-hidden */}
    <Reveal direction="right" delay={0.1} distance={32} className="relative hidden lg:block">
      <ChevronMotifField />
    </Reveal>
  </div>
  {/* Motif bleeds past the grid on very wide viewports */}
</Section>
```

- `ChevronMotifField` (see §7) is a large (≈480–600px) composition of 3–4 nested open-chevron strokes at different scales/opacities/rotations, in `primary`/`secondary`/`accent-gold` tones on a `bg-background-alt` or very-pale `secondary-tint` rounded field (`rounded-[40px]`), echoing the nested-chevron structure already in `public/logo.png` (large orange outer chevron, smaller blue inner chevron, mirrored below) but abstracted to a single large upward mark rather than a literal small logo redraw — this is the "oversized abstract treatment of the shield/diamond motif" the brief calls for, built from the same stroke geometry as the real mark, not stock-photo-adjacent decoration.
- Mobile (< `lg`): the motif field is **not** rendered (`hidden lg:block`) — no compressed/illegible version forced into a tight column; mobile hero stays the clean single copy column, keeping `ui-design.md`'s "above-the-fold on 375×667" requirement intact (motif addition never threatens that constraint, since it doesn't exist below `lg`).
- Text stays left-aligned (`align="left"`) as `ui-design.md` already specifies — the *change* is that the second column is no longer empty whitespace, it's a designed element, so the hero reads as a considered two-up composition instead of "centered text, then a lot of blank space."
- Qualifier text ("Cover is subject to policy terms...") stays inside the `SectionHeading` subtitle in the same left column as the headline — unchanged placement, per `ui-design.md` §1 and BR §12.1.3.

---

## 2. How It Works — full-width dark band (first rhythm break)

**Today:** `background="warm"`, centered `SectionHeading`, 3 horizontal `StepItem`s.

**v2:** promote this to the page's first **full-bleed navy band**, using the token already shipped for this purpose (`Section background="navy"`, which is `bg-surface-navy-deep bg-grain`). This is the single biggest rhythm break on the page — after a white hero, dropping straight into a dark, textured band signals "this page was composed," not "template default alternating white/gray."

```
<Section background="navy" id="how-it-works" className="text-text-inverse relative overflow-hidden">
  <ChevronDivider tone="gold" className="absolute -top-px left-1/2 -translate-x-1/2" />
  <SectionHeading tone="dark" eyebrow="How It Works" title="Three steps, from sign-up to recovery"
    subtitle="Here's the model we're building — clearly, so you know exactly what you're signing up for." />
  <ol className="mt-10 flex flex-col gap-12 lg:flex-row lg:gap-6">
    <StepItem step={1} ... delay={0} />
    <StepItem step={2} ... delay={0.12} />
    <StepItem step={3} ... delay={0.24} isLast />
  </ol>
</Section>
```

- `StepItem` already renders correctly against dark backgrounds via its own tokens (`text-text-primary`/`text-secondary` on the numeral, `bg-card`/`bg-secondary` icon tile) — **verify with `frontend-engineer`** whether `StepItem`'s hardcoded `text-text-primary` title color needs a `tone` prop for legibility on navy (flagged as an open verification item, not assumed solved by this document — if contrast fails, the fix is `design-system-manager` adding a `tone` prop to `StepItem`, not a one-off override here).
- `ChevronDivider` (see §7) sits at the seam between the white hero and this navy band — a thin horizontal strip using the open-chevron stroke repeated as a zigzag/dash pattern in `accent-gold`, replacing a hard flat color-block edge with a branded transition line. This is the "section divider" use of the motif called for in the brief.
- Step 3's mandatory best-effort hedge stays inline in the `description` string, unchanged from `ui-design.md` §2 — same size as the rest of the step body, still the highest-scrutiny copy block on the page; moving this section to a dark background does not change its type scale or de-emphasize it (verify against WCAG AA on navy, `text-text-secondary` on `surface-navy-deep` — flag to `frontend-engineer` for contrast check per `ui-design.md`'s own open checklist item).
- Stagger delays increased slightly (`0`, `0.12`, `0.24` vs. today's `0`, `0.1`, `0.2`) — negligible functional change, intentional to feel distinct from the tighter grid staggers used elsewhere (§6, §3).

---

## 3. Asset Types Covered — staggered/uneven grid, not uniform 4-col

**Today:** `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3`, all 8 `AssetBadge`s identical size, uniform rows.

**v2:** keep `background="white"` and the centered `SectionHeading` (this is one of the two sections deliberately left in the "plain" rhythm per §0 point 2 — not every section needs to be reinvented, and a scannable, non-fussy grid is correct for a checklist-style "what's covered" section per `ux-research.md`'s Persona B legibility need). The grid itself becomes asymmetric:

```
<div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
  {/* vehicle + business rendered larger — 2-col span each on lg — as the two
      highest-value/most differentiating categories (vehicle = biggest-ticket
      asset; business = the category ux-research.md flags must not read as an
      afterthought). Everything else is 1-col span. */}
  <Reveal className="col-span-2 sm:col-span-2 lg:col-span-2" delay={0}>
    <AssetBadge type="vehicle" size="md" className="h-full" />
  </Reveal>
  <Reveal className="col-span-1 sm:col-span-1 lg:col-span-1" delay={0.05}><AssetBadge type="laptop" size="md" /></Reveal>
  <Reveal delay={0.1}><AssetBadge type="phone" size="md" /></Reveal>
  <Reveal delay={0.15}><AssetBadge type="tablet" size="md" /></Reveal>
  <Reveal delay={0.2}><AssetBadge type="tv" size="md" /></Reveal>
  <Reveal delay={0.25}><AssetBadge type="desktop" size="md" /></Reveal>
  <Reveal className="col-span-2 sm:col-span-2 lg:col-span-2" delay={0.3}>
    <AssetBadge type="business" size="md" className="h-full" />
  </Reveal>
  <Reveal delay={0.35}><AssetBadge type="other" size="md" /></Reveal>
</div>
```

- This uses only `AssetBadge`'s existing `className`/`size` props plus grid `col-span` utilities on the wrapping `Reveal`/grid cell — **no change to `AssetBadge` itself** beyond the already-in-flight `desktop`/`other` extension `ui-design.md` §10 already flags as a pending gap from `design-system-manager`. That gap is unchanged and still blocking; this document doesn't add a new one.
- On mobile (`grid-cols-2`), the `col-span-2` badges (vehicle, business) naturally become full-width rows, which reads as intentional emphasis rather than breaking — verified visually against a 2-col base.
- A small `ChevronMotif` corner accent (single small stroke, `absolute -top-2 -right-2`, `opacity-10`, `pointer-events-none`) sits behind the vehicle and business cards only (the two emphasized cells) — the "card accent" use of the motif called for in the brief. Not applied to all 8 badges, so it reads as deliberate emphasis, not wallpaper.
- Reveal stagger delay spread (`0` → `0.35`) is wider than today's `i*0.05` used uniformly; still within `ui-design.md`'s "keep delays ≤0.4s" guidance.

---

## 4. Trust / Credibility — two-column asymmetric (text block + stacked cards)

**Today:** centered `SectionHeading`, then `grid md:grid-cols-2` of two equal `FeatureCard`s below it, full width.

**v2:** break the "heading spans full width above a symmetric grid" pattern into a genuine asymmetric two-column composition — heading and framing copy in a narrower left column, the two `FeatureCard`s stacked (not side-by-side) in a right column, so the section reads left-to-right rather than top-to-bottom-centered:

```
<Section background="warm">
  <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
    <Reveal direction="left">
      <SectionHeading align="left" eyebrow="Why Trust Us"
        title="Built to be transparent about what's live and what's coming"
        subtitle="We'd rather tell you exactly where we are than oversell it." />
      <p className="mt-6 text-base text-text-secondary max-w-md">
        We only collect what we need, and we handle personal information under South African
        data protection law (POPIA). See our <ArrowLink href="/privacy" size="sm">Privacy Policy</ArrowLink> for details.
      </p>
    </Reveal>
    <div className="flex flex-col gap-6">
      <Reveal direction="right" delay={0.05}>
        <FeatureCard icon={ShieldCheckIcon} title="Licensed insurer" description="..." align="left" />
      </Reveal>
      <Reveal direction="right" delay={0.15}>
        <FeatureCard icon={MapPinIcon} title="GPS-assisted recovery, coordinated with security-company partners" description="..." align="left" />
      </Reveal>
    </div>
  </div>
</Section>
```

- Copy content is byte-for-byte identical to `ui-design.md` §4, including the data-handling line — it's just relocated from "full-width paragraph below the grid" to "under the heading in the left column." It is still visible body text, same size, not a footnote, satisfying `ui-design.md`'s placement intent even though its literal DOM position moved.
- `FeatureCard`s go from side-by-side to stacked — this is a legitimate use of the component (no prop changes) and, combined with the left column, gives the section a left-text/right-stack asymmetry instead of top-heading/bottom-grid symmetry.
- No `LogoCloud`, no `TestimonialCard` — unchanged from `ui-design.md` §4's explicit prohibition.

---

## 5. Pricing / Plans Teaser — kept close to original rhythm, intentionally

This is the second of the two sections deliberately left mostly as-is (§0 point 2): centered `SectionHeading`, `sm:grid-cols-3` of three `Card`s, `Button` below. Reasoning: three comparison tiers *should* read as visually equal and scannable side-by-side — imposing asymmetry here (e.g., making one card bigger) would either (a) require a "Most popular" signal `ui-design.md` §5 explicitly says **not** to ship at v1 (no real signup data to substantiate it), or (b) be arbitrary favoritism with no backing content. Forcing variation into every section for its own sake is exactly the "over-designing" risk this role is supposed to monitor — so this section stays plain by design, not by oversight. One small change for motif consistency: a `ChevronMotif` hairline accent (`absolute top-0 right-0 opacity-[0.06]`, single stroke) in each `Card`'s top-right corner, echoing §3's corner treatment, so the recurring motif still touches this section without changing its layout logic.

---

## 6. What to Expect — reversed alternating two-column, one per row

**Today:** `background="warm"`, centered `SectionHeading`, `grid md:grid-cols-3` of three equal `Card`s.

**v2:** turn the 3-step narrative into three **alternating left/right rows** (icon+numeral on one side, text on the other, flipping each row) rather than a 3-up grid — this reinforces it as a *sequence* (report → coordinate → follow up) rather than three parallel options, which better matches what the content actually is, and gives the section a distinct rhythm from both §2's `StepItem` timeline and §5's card grid:

```
<Section background="warm">
  <SectionHeading align="center" eyebrow="What to Expect"
    title="Here's what happens if your laptop is stolen"
    subtitle="This is how the product is designed to work — not a customer story, since we're pre-launch." />
  <div className="mt-12 flex flex-col gap-8 max-w-3xl mx-auto">
    <Reveal direction="left">
      <div className="flex items-start gap-6">
        <IconTile icon={AlertTriangleIcon} />
        <div><h3 className="text-lg font-semibold text-text-primary">You report it.</h3>
          <p className="mt-2 text-base text-text-secondary">You'd flag the laptop as stolen in the app, in a couple of taps.</p></div>
      </div>
    </Reveal>
    <Reveal direction="right" delay={0.1}>
      <div className="flex items-start gap-6 sm:flex-row-reverse sm:text-right">
        <IconTile icon={PhoneCallIcon} />
        <div><h3 className="text-lg font-semibold text-text-primary">We coordinate.</h3>
          <p className="mt-2 text-base text-text-secondary">We'd notify our security-company partners and start working the case.</p></div>
      </div>
    </Reveal>
    <Reveal direction="left" delay={0.2}>
      <div className="flex items-start gap-6">
        <IconTile icon={CheckCircleIcon} />
        <div><h3 className="text-lg font-semibold text-text-primary">You're kept in the loop.</h3>
          <p className="mt-2 text-base text-text-secondary">You'd get updates as things progress — recovery is best-effort and depends on tracking status and on-the-ground conditions, subject to policy terms, underwriting and claims assessment.</p></div>
      </div>
    </Reveal>
  </div>
</Section>
```

- `IconTile` here is **not** a new component — it's the same inline icon-tile markup already used inline in today's `LandingPage.tsx` (`<div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">`), just extracted as a named JSX fragment for readability in this spec; no new export required.
- Dropping `Card` wrappers here in favor of plain rows is a deliberate choice to differentiate this section from §5's card grid immediately above/below it in scroll order — two consecutive "grid of 3 cards" sections back-to-back is itself part of the uniform-rhythm problem this revision targets.
- Card 3's mandatory best-effort hedge stays inline in that row's paragraph, unchanged wording, same visual weight as the rest of the sentence — per `ui-design.md` §6's compliance check, unaffected by the row-vs-card change.
- `direction="left"`/`direction="right"` alternation is the clearest "varied entrance direction" opportunity on the page (§0 point 4) because the layout itself now has a left/right axis to justify it — this is not motion for its own sake, it reinforces the alternating row layout.

---

## 7. The recurring visual motif — "open chevron," derived from `public/logo.png`

`public/logo.png` is built from two open, nested chevrons (a wider orange stroke and a narrower blue stroke) mirrored top and bottom to form a diamond/rhombus silhouette. Rather than reusing the literal `LogoGlyph` SVG (which today renders a shield-and-padlock icon, not the diamond/chevron mark — **flagging this mismatch to `design-system-manager`/`frontend-engineer` as a separate, pre-existing observation, out of scope to fix here**), this revision proposes a small, page-local decorative primitive built from the chevron stroke itself:

**Component gap (documented, page-local only, not a design-system request):**

```tsx
// src/pages/landing/ChevronMotif.tsx  (page-local, not exported from src/components/index.ts)
interface ChevronMotifProps {
  tone?: 'navy' | 'secondary' | 'gold';
  className?: string;
}
// Renders a single open chevron (viewBox 0 0 100 60, stroke-based, currentColor)
// — the same angle/proportions as the outer stroke in public/logo.png.
export function ChevronMotif({ tone = 'gold', className }: ChevronMotifProps) { /* ... */ }

// Composed variants built from the same base stroke:
export function ChevronMotifField(props): JSX.Element   // §1 — 3–4 nested chevrons, large scale
export function ChevronDivider(props): JSX.Element       // §2 — repeated small chevrons as a horizontal seam
```

**Why this doesn't need to go through `design-system-manager` as a new base component:** it is a single-purpose decorative SVG with no interactive states, no accessibility surface beyond `aria-hidden="true"` (it is never the sole conveyor of information — every use is paired with real text/icons per the redundant-cue rule), and no reuse target outside this page today. It is composed *by* `ui-designer` using only `currentColor` + the existing brand color tokens (`text-accent-gold-deep`, `text-secondary`, `text-primary`), not a new token. If a future feature (e.g., Admin Dashboard empty states) wants this same motif, *that* is the trigger to promote it into `src/components/` proper via `design-system-manager` — flagged here so it isn't silently duplicated ad hoc elsewhere later.

**Where it appears (five uses, per the brief's "structural/decorative element throughout the page" ask):**

| Location | Form | Notes |
|---|---|---|
| Hero (§1) | `ChevronMotifField` — large nested composition | Desktop only |
| Hero → How It Works seam (§2) | `ChevronDivider` — zigzag seam line, `accent-gold` | Marks the white→navy transition |
| Asset Types (§3) | Single small `ChevronMotif`, `opacity-10`, corner accent | Only on the 2 emphasized cells (vehicle, business) |
| Pricing cards (§5) | Single small `ChevronMotif`, `opacity-[0.06]`, top-right corner | All 3 cards, for motif continuity in the one section kept plain |
| Footer (§8) | `ChevronMotif`, `tone="gold"`, small, beside the `Logo` in Column A only | Decorative only — does not touch, overlap, or reduce contrast on the disclosure block in Column B |

All instances are `aria-hidden="true"`, `pointer-events-none`, and positioned so they never sit behind or reduce contrast against real text (verified per-section above; footer placement explicitly called out as isolated from Column B in §8).

---

## 8. FAQ and Final CTA and Footer — minimal composition changes, explicit compliance re-confirmation

- **FAQ (§7 of `ui-design.md`):** layout unchanged (`Accordion`, `width="default"`, centered heading) — an accordion is already a distinct rhythm from the sections around it once §2/§3/§6 are varied, so no further change needed here. One motif touch: `AccordionItem` trigger's default expand/collapse chevron icon (if `Accordion`'s own chevron icon is swappable via prop — **verify with `design-system-manager`**; if not swappable, skip this rather than fork the component) could visually rhyme with the brand chevron. **Not required** — flagged as optional polish only, not to be pursued if it requires touching `Accordion` internals.
- **Final CTA (§8 of `ui-design.md`):** layout unchanged — centered `SectionHeading`, centered form, `background="warm"`. This is intentionally the "calm center" of the page: after the varied rhythm above, a final CTA that is plain, centered, and unambiguous is the *correct* choice for a conversion moment, not a missed opportunity for variation. The waitlist form's field order, optional-name labeling, and POPIA notice placement (visible above the submit button, in body text, not collapsed) are **unchanged verbatim** from `ui-design.md` §8.
- **Footer (§9 of `ui-design.md`):** layout unchanged (4-column desktop grid → single stacked column mobile, Brand → Company/Legal → Contact → Legal & Complaints → bottom bar order). The only addition is the small `ChevronMotif` beside the `Logo` in Column A (§7 table above) — Columns B/C/D (the disclosure block, contact, and complaints text) are untouched: same exact literal placeholder strings (`[REGISTERED ENTITY NAME — pending]`, `[COMPANY REG NO — pending]`, `[INSURER LICENCE — pending confirmation]`, `[FSP NUMBER — pending]`, `[REGISTERED ADDRESS — pending]`, `[SUPPORT EMAIL — pending]`, `[OMBUD FOR SHORT-TERM INSURANCE — pending]`), same `text-inverse-muted`-on-navy legibility requirement, same "not in an accordion, not behind a tooltip, not smaller than body copy" rule from `ui-design.md` §9.3. **This document changes zero pixels of Column B.**

---

## 9. Motion summary (per `Reveal`'s existing API — no new prop needed)

| Section | Direction(s) used | Rationale |
|---|---|---|
| Hero | `left` (copy), `right` (motif field), slight delay stagger | Reinforces the new left/right split |
| How It Works | `StepItem`'s own built-in entrance (unchanged), wider stagger (0/.12/.24) | Distinct pacing from the grid sections |
| Asset Types | `up` (default), wide stagger 0→0.35 across uneven grid | Matches the staggered visual sizing |
| Trust | `left` (heading column), `right` (card stack) | Reinforces the new two-column split |
| Pricing | `up` (default), tight stagger, unchanged from today | Intentionally plain, see §5 |
| What to Expect | Alternating `left`/`right` per row | Reinforces the new alternating-row layout |
| FAQ | `up` (default), unchanged | No layout change |
| Final CTA | `up` (default), unchanged | Calm, conversion-focused, no variation needed |

No section uses more than one non-default direction pairing, and every direction choice is justified by that section's own layout axis (not applied decoratively) — consistent with this role's mandate to avoid gimmicky motion.

---

## 10. Pre-Approval Checklist (ui-designer self-review, v2)

- [x] Screen composed primarily from existing component library; only new element is a documented, page-local, non-design-system decorative SVG (`ChevronMotif` family, §7), with explicit reasoning for not routing it through `design-system-manager` and an explicit promotion trigger if reuse emerges elsewhere.
- [x] Status/state indicators unchanged from `ui-design.md` (`AssetBadge`, `Badge` usage not modified by this document).
- [x] High-stress flows: this page still has no theft-report/claim flow; waitlist form unchanged, still 2 fields/1 step with error fallback per `ui-design.md` §8.
- [ ] Contrast ratios and tap target sizes meet WCAG 2.1 AA — **new item to verify beyond `ui-design.md`'s existing open flag:** `StepItem` and `SectionHeading` text on the new `background="navy"` band in §2 (existing `tone="dark"` support in `SectionHeading` should cover the heading; `StepItem`'s own text tokens need contrast verification against `surface-navy-deep`, flagged to `frontend-engineer`).
- [x] High-stress/compliance flows validated: footer disclosure block, POPIA notice, and all "subject to..." qualifiers confirmed to retain their exact wording and same-visual-block placement in every section above (§8 explicit re-confirmation).
- [x] Design reviewed against brand tone: premium, trustworthy, calm — the navy band (§2) and asymmetric hero (§1) push toward "considered editorial insurer site," not more decoration; Pricing (§5) and Final CTA (§8) deliberately stay plain so the page doesn't tip into over-designed for its most transactional moments.
- [ ] Sign-off obtained from `product-manager` before `frontend-engineer` handoff — pending, same as `ui-design.md`.

**Net status:** Composition revision ready for review. Gated on the same open items as `ui-design.md` (§12 of that document), plus one new verification item (`StepItem` text contrast on navy, §10 above) and one new observation for `design-system-manager`/`frontend-engineer` to track separately (`LogoGlyph`'s SVG doesn't currently match the diamond/chevron mark in `public/logo.png` — not blocking this document, noted in §7).
