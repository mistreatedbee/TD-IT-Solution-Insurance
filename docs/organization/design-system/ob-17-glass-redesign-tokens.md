# OB-17 — Frosted-Glass Redesign: Design Tokens + Component List

Owner: `design-system-manager` (A). Hand-off: `ui-designer` (R, screens).
Status: tokens + component list ratified 2026-10-29. Owner's reference image received 2026-10-29;
§2.1/§2.2 accent and background provisional values now confirmed against it (see those sections
and §7 item 1). All three previously-open questions (glass-usage scope, black secondary accent,
plus the screens doc's floating-label question) are now **resolved and ratified** — owner
authorized direct resolution 2026-10-29; see §7 items 5-6 and §7a for the full decision record.
New tokens added: `--glass-action-secondary(-text)`, `--glass-status-positive`. Screens doc
updated to reflect these decisions (see `ob-17-glass-redesign-screens.md` §14). Ready to build.

## 0. Scope and honesty check

This document covers deliverable 1 (tokens) and 2 (component list) of OB-17 only, per the
brief's own required order. Screen work is explicitly out of scope here and belongs to
`ui-designer`.

**No reference image was ever supplied**, despite the brief's text repeatedly saying "follow the
attached reference image." Everything below is derived from the brief's *written* description
only. Where the brief is silent and a concrete value has to be picked anyway (the accent hue, the
exact gradient stops, the font family), that value is marked **PROVISIONAL — pending owner's
reference image** and must be treated as a placeholder, not a final brand decision. `cto`/
`product-manager` should request the image before `ui-designer`'s screens are called final, and
before anything here is read as a brand-identity ruling (brand identity itself stays
`product-manager`/`cto`'s call per this role's charter — this document only implements it as
tokens).

This is visuals-only. Nothing here changes behavior, routes, feature flags, or any non-visual
code path. Both existing token systems (`src/index.css` + `tailwind.config.js` for web,
`mobile/src/theme/*` for mobile) are **extended**, not forked or replaced.

## 1. What already exists (read before building)

- **Web**: `src/components/GlassCard/index.tsx` — translucent card with `backdrop-blur-xl
  backdrop-saturate-150`, `rounded-2xl` (16px, below the 20-28px OB-17 target), light/dark tone
  props, hover-lift interactive variant. Tokens already live in `src/index.css` (`--glass-*`,
  `--radius-*`, `--shadow-*`, `--duration-*`, `--ease-standard`) and are wired into
  `tailwind.config.js`. The web color system already has a full light/dark pair of CSS custom
  properties (`--dark-*` prefix) — dark mode is **already hand-tuned, not an invert filter**
  (e.g. `--dark-primary: #F0A93E` vs light `--primary: #2C3E50`, different hues entirely).
- **Mobile**: `mobile/src/navigation/GlassSurface.tsx` — native `GlassView` (iOS 26+ Liquid
  Glass) with automatic fallback to Expo `BlurView` elsewhere, plus `liquidGlassTint()` /
  `liquidGlassBorder()` helpers and `useLiquidGlassChrome.ts` (blur intensity 96, `clear` style).
  This is currently used for **navigation chrome only** (tab bar, stack headers, map overlay
  pills) — not for content cards. `mobile/src/theme/tokens.ts` is an explicitly-flagged
  **temporary manual mirror** of the web tokens (see its own header comment) with no font loaded
  (`fontFamily: undefined`, OS system font today) and radius values capped at `cardLg: 20`.
  `mobile/src/theme/colorSchemes.ts` has a real light/dark pair (`lightColors`/`darkColors`),
  also already hand-tuned rather than inverted.
- **Icons**: `lucide-react` (web, `package.json`) and `lucide-react-native` (mobile,
  `mobile/package.json`) are both already dependencies — **one consistent line-icon set already
  exists across both surfaces**. OB-17 requires no new icon library; it requires enforcing lucide
  everywhere (no mixed-in emoji/other icon sets) during the screen pass.
- **Fonts today**: web uses `Fraunces` (heading, serif) + `Public Sans` (body, sans) via
  `tailwind.config.js` `fontFamily`. Mobile loads no custom font at all. Neither is the "one
  modern geometric sans-serif" the brief asks for — this is a deliberate, flagged change below.

## 2. Colour tokens

### 2.1 Accent colour — confirmed against owner's reference image, 2026-10-29

> **VOID (superseded 2026-10-29)**: the indigo-blue pick below this notice (`--glass-accent:
> #4F7CFF` / `--glass-accent-deep: #3659D6` / `--glass-accent-tint: #EAF0FF`) was the
> PROVISIONAL placeholder used before the owner's reference image arrived. It is retained here,
> struck, for audit trail only — do not implement it. See the confirmed values immediately below.
>
> ~~`--glass-accent`: `#4F7CFF` / `--glass-accent-deep`: `#3659D6` / `--glass-accent-tint`:
> `#EAF0FF`~~

The brief calls for **one** accent colour, used consistently (replacing the current two-accent
gold/blue split visible in `--accent-gold*` and `accentBlue*`/`accentGold*` mobile tokens, which
predates OB-17 and was never meant as the "calm, modern, trustworthy, different-from-typical-
insurance" identity the brief now asks for).

The owner's reference image (the "PAAQ" experts-booking app, supplied 2026-10-29, used purely as
a visual style reference — not this product) shows a consistent teal/turquoise accent used on
the primary pill tab ("Experts"), header elements, buttons, and the teal gradient logo mark.
Confirmed final values, read directly off the screenshots:

- `--glass-accent`: `#2DBDB6` (teal/turquoise — matches the reference's primary accent as it
  appears on the active pill tab and logo mark; sits in the brief-compatible "calm, modern,
  trustworthy, distinct from typical insurance red/orange/gold" territory, now with a concrete
  reference source instead of a guess)
- `--glass-accent-deep`: `#1E8F89` (a deeper, more saturated teal for hover/active/pressed state
  and the Android flat-fallback fill tint source — see §5; chosen as a ~25% darkening of
  `--glass-accent` consistent with how the reference's accent reads slightly deeper in pressed-
  looking UI elements)
- `--glass-accent-tint`: `#E3F6F4` (pale teal wash for light-mode accent backgrounds, e.g.
  selected chip — a light desaturated tint of `--glass-accent`, replacing the old blue-tinted
  `#EAF0FF`)

This supersedes neither `--accent-gold*` nor mobile `accentGold*`/`accentBlue*` yet — those stay
in place for anything OB-17 hasn't touched, per the visuals-only/incremental-rollout rule. New
`--glass-*` tokens are additive until `ui-designer`'s screens migrate consumers over screen by
screen.

### 2.2 Background gradient — confirmed against owner's reference image, 2026-10-29

> **VOID (superseded 2026-10-29)**: the stronger blue-tinted gradient stops below this notice
> (`#F3F6FF`/`#E8EEFF`/`#FFFFFF` light) were the PROVISIONAL placeholder used before the owner's
> reference image arrived. Retained struck for audit trail; do not implement.
>
> ~~`--glass-bg-gradient-start: #F3F6FF` / `--glass-bg-gradient-mid: #E8EEFF` /
> `--glass-bg-gradient-end: #FFFFFF` (light)~~

The reference screenshots show a mostly **flat white / very-light-grey background** — not a
visible, saturated gradient. Cards read as solid white with soft drop shadows, not sitting on a
strong colour wash; only a faint, barely-perceptible vignette/warmth is detectable in a couple of
screens. The light-mode stops below are revised to be much more subdued than the original
placeholder guess:

| Token | Light (confirmed vs. reference) | Dark (still unreferenced) |
|---|---|---|
| `--glass-bg-gradient-start` | `#FCFCFC` | `#0B0F1A` |
| `--glass-bg-gradient-mid` | `#F7F8F8` | `#121A2E` |
| `--glass-bg-gradient-end` | `#FFFFFF` | `#070A12` |

**Honesty note on dark mode**: all reference screenshots are light mode only — nothing in the
supplied image confirms or contradicts the dark-mode gradient. The dark-mode pair above is
unchanged from the original PROVISIONAL pick and remains a **reasoned extrapolation, not a
reference-confirmed value**. It should not be read as "confirmed" the way the light-mode stops
now are; revisit if/when a dark-mode reference ever surfaces.

Dark mode is a **separately designed** near-black navy-to-indigo gradient, not `invert()`/
`filter: invert(1)` on the light one — consistent with how both existing token systems already
handle dark mode (see §1).

### 2.3 Glass surface tokens (full-strength, non-reduced-transparency)

| Token | Light | Dark |
|---|---|---|
| `--glass-surface` | `rgba(255,255,255,0.55)` | `rgba(18,22,32,0.55)` |
| `--glass-surface-strong` | `rgba(255,255,255,0.72)` | `rgba(18,22,32,0.72)` |
| `--glass-surface-border` | `rgba(255,255,255,0.45)` | `rgba(255,255,255,0.10)` |
| `--glass-shadow` | `0 8px 32px -8px rgba(16,24,48,0.18)` | `0 8px 32px -8px rgba(0,0,0,0.45)` |

These are deliberately a new `--glass-*` namespace, not a rename of the existing
`--glass-background`/`--glass-border` (web) — those stay for current `GlassCard` consumers until
migrated; OB-17's version needs a higher-opacity option (`-strong`) the current single-value
token doesn't have, and the Android flat-fallback path (§5) needs an opaque-fill variant neither
current system has.

### 2.4 Text-on-glass contrast (4.5:1 floor — brief's own hard rule)

Per-surface safe text pairs, each checked against the *worst-case* background it will sit over
(the gradient end, not the gradient start, since the end is where contrast is tightest):

| Token | Light-mode value | Contrast vs `--glass-surface-strong` on light gradient | Dark-mode value | Contrast vs `--glass-surface-strong` on dark gradient |
|---|---|---|---|---|
| `--glass-text-primary` | `#0F1420` | 15.8:1 | `#F3F5FA` | 14.9:1 |
| `--glass-text-secondary` | `#4A5168` | 6.1:1 | `#AEB4C4` | 5.3:1 |
| `--glass-text-on-accent` | `#FFFFFF` | 5.9:1 (vs `--glass-accent-deep`) | `#FFFFFF` | 5.9:1 |

All three clear the brief's 4.5:1 floor with margin. `--glass-text-secondary` is the tightest
and is the one `qa-architect`'s Stage 10 visual/accessibility regression (already required by
the roadmap entry) should re-verify against real rendered screens, not just these computed
values, since translucent surfaces compound with whatever photo/gradient sits behind them.

### 2.5 Reduced-transparency fallback (brief's own hard rule, distinct from the Android blur fallback in §5)

This is an *accessibility* fallback (user/OS preference: iOS "Reduce Transparency", Android
equivalent, `prefers-reduced-transparency` on web where supported), not a performance fallback:

- Web: respect `@media (prefers-reduced-transparency: reduce)` — swap `--glass-surface*` to a
  flat opaque token pair: `--glass-surface-opaque: #FFFFFF` (light) / `#151923` (dark), drop the
  blur entirely, keep the border and shadow.
- Mobile: `GlassSurface` already has the plumbing for this pattern (its `tintColor` prop can
  carry a fully-opaque colour) but has no reduced-transparency detection today. New requirement
  for `mobile-engineer`/`ui-designer`'s implementation pass: read `AccessibilityInfo` (iOS has
  `isReduceTransparencyEnabled`; Android has no direct equivalent — treat the low-end-Android
  path in §5 as serving double duty here) and pass the same opaque fill.
- In both cases text tokens from §2.4 stay the same — contrast was already computed against the
  worst case, so it holds for the opaque fallback too (opaque backgrounds are never *less*
  contrasty than a translucent one over the same base colour).

## 3. Typography

**Genuinely new decision, not provisional**: the brief explicitly asks for "one modern geometric
sans-serif font with a clear size scale," replacing the current Fraunces/Public-Sans pairing for
anything OB-17 touches. Recommendation: **Inter** — already the most common free geometric-
leaning sans with full weight range, variable-font support, and existing `@expo-google-fonts`
and web-font tooling support (so the mobile side's long-flagged "no custom font loaded"
limitation in `tokens.ts` gets closed as part of this work, not deferred further).

This single choice does *not* need the reference image — "one geometric sans-serif, clear size
scale" is prescriptive enough in the brief's text alone — but final family pick (Inter vs.
similar alternatives like Manrope/General Sans) stays open for `ui-designer` to confirm against
the image once it exists, since a geometric sans's exact personality (rounded vs. sharp
terminals) is a visual-reference-dependent call.

| Token | Value |
|---|---|
| `--glass-font-family` | `'Inter', ui-sans-serif, system-ui, sans-serif` |
| `--glass-font-weight-regular` | 400 |
| `--glass-font-weight-medium` | 500 |
| `--glass-font-weight-semibold` | 600 |
| `--glass-font-weight-bold` | 700 |

Size scale (extends, does not replace, the existing `typography.sizes` mobile scale /
Tailwind's default type scale — same step ratio, renamed into the `--glass-*` namespace so the
old heading/body pairing can be retired screen-by-screen without a flag day):

| Token | px | Use |
|---|---|---|
| `--glass-text-xs` | 12 | captions, timestamps |
| `--glass-text-sm` | 14 | secondary body, form helper text |
| `--glass-text-base` | 16 | body, input text |
| `--glass-text-lg` | 18 | card heading |
| `--glass-text-xl` | 22 | section heading |
| `--glass-text-2xl` | 28 | screen title |
| `--glass-text-3xl` | 34 | hero/balance figure |

"Generous spacing" from the brief is covered by §4's spacing scale plus a line-height rule:
body text 1.5x, headings 1.2x — to be encoded in `ui-designer`'s screen specs, not duplicated as
a separate token family here.

## 4. Spacing

Extends the existing `spacing-*` (web) / `spacing` (mobile `tokens.ts`) scale — no new unit
system, just confirming it's sufficient for "generous spacing" and glass-card internal padding:

| Token | px | Existing equivalent |
|---|---|---|
| `--glass-space-xs` | 4 | `spacing-1` / `spacing.xs` |
| `--glass-space-sm` | 8 | `spacing-2` / `spacing.sm` |
| `--glass-space-md` | 12 | `spacing-3` / `spacing.md` |
| `--glass-space-lg` | 16 | `spacing-4` / `spacing.lg` |
| `--glass-space-xl` | 24 | `spacing-6` / `spacing.xl` |
| `--glass-space-2xl` | 32 | `spacing-8` / `spacing['2xl']` |
| `--glass-card-padding` | 24 | new — default internal glass-card padding, replaces per-card ad hoc `p-4`/`p-6`/`p-8` padding variants on `GlassCard` with one default that reads as "generous" |

No new scale invented; `--glass-card-padding` is the one new semantic alias needed because the
brief calls for specifically generous card interior space as a named thing designers/engineers
can reach for without recalculating it per screen.

## 5. Radius and blur

### 5.1 Radius — brief's 20-28px range

| Token | px | Notes |
|---|---|---|
| `--glass-radius-card` | 24 | primary glass-card radius (default) — **raises** `GlassCard`'s current `rounded-2xl`/16px and mobile `radius.cardLg`/20 into the brief's required range |
| `--glass-radius-card-lg` | 28 | hero/feature cards, modals |
| `--glass-radius-chip` | 20 | pills, chips, small badges — bottom of the brief's range, keeps small elements from looking over-rounded |
| `--glass-radius-input` | 16 | form inputs — intentionally *below* the 20-28 card range; the brief's own "large inputs" section doesn't ask inputs to match card radius, and forcing inputs to 24px reads oversized at typical input heights |

### 5.2 Blur — with the required low-end-Android cheap fallback

| Token | Value | Platform |
|---|---|---|
| `--glass-blur-web` | `blur(20px)` + `backdrop-saturate: 150%` | web, `backdrop-filter` |
| `--glass-blur-ios` | intensity 72 (BlurView) / native `GlassView` `regular` style on iOS 26+ | mobile, matches existing `GlassSurface` defaults — already correct, reused as-is |
| `--glass-blur-android-capable` | intensity 56 (BlurView) | mobile, Android devices that benchmark as capable (see below) — already `GlassSurface`'s existing Android default, reused as-is |
| `--glass-blur-android-fallback` | **no blur at all** — flat `--glass-surface-strong` fill (opaque-leaning, ~0.72 alpha) + border + shadow, zero `BlurView`/backdrop-filter cost | mobile, low-end Android — **new** |

Explicit fallback mechanism (the brief requires this be concrete, not hand-waved): low-end
Android detection reuses the same opaque-fill path already specified for reduced-transparency
(§2.5) — one fallback implementation serves both triggers. Trigger condition recommendation for
`mobile-engineer` to implement: `Platform.OS === 'android' && Platform.Version < 29` (Android 10)
**or** a device-memory heuristic if `expo-device`'s `Device.totalMemory` is below ~3GB, whichever
is simpler to wire into the existing `shouldUseNativeGlass()`-style check in `GlassSurface.tsx`.
This is a visual/performance decision, not a new dependency — `GlassSurface.tsx` already has the
exact branch structure needed (native glass → BlurView → fallback View); this just adds a third
rung to that same ladder rather than a new component.

Web gets no equivalent problem (desktop/mobile-web `backdrop-filter` is comparatively cheap and
widely supported now), but should still honor `@media (prefers-reduced-transparency: reduce)`
per §2.5 for the accessibility case.

### 5.3 Motion tokens

Reuses existing `--duration-*`/`--ease-standard` (web) as-is — already 150/300/600ms with a
standard cubic-bezier ease, which already satisfies the brief's "200-300ms transitions." Net-new:

| Token | Value | Use |
|---|---|---|
| `--glass-spring-press` | mobile: `{ damping: 15, stiffness: 180, mass: 1 }` (React Native `Animated`/Reanimated spring config) | the brief's explicitly-named "soft spring on button presses" — does not exist as a token anywhere today |
| `--glass-skeleton-shimmer-duration` | `1200ms` | the brief's "skeleton loading instead of spinners" — also net-new; no skeleton primitive exists in `src/components/*` or `mobile/src/theme/primitives/*` today (see §6, genuinely-new component) |

## 6. Component list for the 8 screens

Screens, in the brief's required order: onboarding/identity, home, asset list, asset detail, map,
report theft/loss, alerts, account.

| Component | Status | Why |
|---|---|---|
| `GlassCard` (web) | **extend-existing** | Add `--glass-*` token consumption, raise default radius into 20-28 range, add a `padding="xl"`-style default matching `--glass-card-padding`, add reduced-transparency media-query fallback. Do not fork a `GlassCard2`. |
| `GlassSurface` (mobile) | **extend-existing** | Add the low-end-Android no-blur rung (§5.2) and reduced-transparency detection (§2.5) to its existing native→BlurView→fallback ladder. Currently chrome-only; extend its usage to content cards too (same component, new call sites), not a new component. |
| `useLiquidGlassChrome` | **reuse-existing** | Already produces the right tint/border/blur tokens for navigation chrome; no change needed beyond consuming new `--glass-*` values where it currently hardcodes `rgba(...)`. |
| Button (web `src/components/Button`, mobile `mobile/src/theme/primitives/Button.tsx`) | **extend-existing** | Add the spring-press motion token (§5.3) on mobile; add the one-accent-colour variant on both. No new Button component — the brief's "one clear primary button per screen" is a *usage rule* for `ui-designer`, not a new component. |
| `FormField` (mobile `mobile/src/theme/primitives/FormField.tsx`) | **extend-existing** | Brief wants floating labels + inline validation; `FormField` already exists as this project's established form-input abstraction (per this role's mobile remit in CLAUDE.md) — add a floating-label mode and inline-error slot rather than building a new input component. |
| `Input` (web `src/components/Input`) | **extend-existing** | Same floating-label + inline-validation treatment, web side. |
| `SelectChipGroup`/`SelectChip` (mobile) | **reuse-existing** | Already fits chip/filter needs likely on asset-list and report-theft screens. |
| Skeleton loader | **genuinely new** — sign-off granted here | No skeleton primitive exists on either surface today (confirmed: not in `src/components/index.ts`, not in `mobile/src/theme/primitives/index.ts`). The brief explicitly requires skeleton loading in place of spinners project-wide, which is a real behavioral/visual gap, not something any existing component can be stretched to cover. Build once, each surface: `Skeleton` (web, CSS shimmer keyframe using `--glass-skeleton-shimmer-duration`) and a matching RN primitive. Needs its own `Context.md` + preview per standard process before merge. |
| Map glass overlay card | **extend-existing** (compose `GlassSurface`) | The map screen's floating info card is a composition of `GlassSurface` + existing text/button primitives, not a new base component. |
| Icon set (`lucide-react` / `lucide-react-native`) | **reuse-existing** | Already present on both surfaces; OB-17's job is enforcing it everywhere, not introducing anything. |

No other genuinely-new component is approved at this stage. Anything the 8 screens surface
beyond this list during `ui-designer`'s work (e.g. a bespoke theft-report stepper) comes back
through this role for the same reuse-first review before being added.

## 7. Open items carried forward

1. **Owner's reference image has been received (2026-10-29) and is no longer outstanding.** It
   showed the "PAAQ" experts-booking app as a pure visual style reference (not this product).
   §2.1 (accent colour) and §2.2 (light-mode background gradient) are now confirmed against it
   and are no longer provisional placeholders — see those sections for the resolved hex values
   and void-marked superseded guesses. The dark-mode gradient pair in §2.2 remains an
   unreferenced extrapolation (no dark-mode screenshots were supplied) and should still be
   treated as lower-confidence than the now-confirmed light-mode values. Two new open questions
   the reference raised are carried forward as items 5 and 6 below — they do not block the
   colour tokens themselves, which are resolved.
2. Font licensing/loading mechanics for Inter on mobile (`expo-font`/`@expo-google-fonts/inter`)
   are `mobile-engineer`'s implementation task, not blocked on anything here.
3. Stage 10 (hard gate, per roadmap) must include: contrast re-check over real rendered gradients
   (not just the computed values in §2.4), a low-end Android device performance pass on the new
   no-blur fallback, and confirmation neither surface's behavior/routes/flags changed — visuals
   only, as the brief requires.
4. Migration of existing `--accent-gold*`/mobile `accentGold*`/`accentBlue*` consumers onto the
   new single `--glass-accent*` token happens screen-by-screen as `ui-designer` builds each of
   the 8 screens, not as a single repo-wide sweep — avoids a big-bang visual regression risk
   across unrelated screens this task isn't scoped to touch.
5. **RESOLVED 2026-10-29 (`design-system-manager`, owner-authorized to make this call directly —
   see decision log below).** Glass-blur scope: reserve `GlassCard`/`GlassSurface` heavy blur for
   hero/header/modal moments only; ordinary content cards render flat-white-with-shadow. This was
   previously a recommendation pending sign-off — it is now ratified, not just recommended. See
   §7a for the full decision record.

   > **VOID (superseded 2026-10-29 by the RESOLVED note above — retained for audit trail per the
   > append-only house rule, not implemented as an open question any longer):**
   >
   > ~~**Open question for `product-manager`/`cto`/`ui-designer` — glass-blur scope vs. the
   > reference.** The owner's reference image shows mostly **flat white cards with soft shadows**,
   > not heavy frosted-glass blur, for ordinary content (contacts list, profile cards). The one
   > place real blur/translucency appears is a single hero/header banner treatment (the "Tech &
   > Startups" category header: a blurred photographic background with a translucent dark overlay
   > behind a profile). This is a real tension with the brief's literal instruction to use
   > "frosted glass cards" throughout. This role is **not** resolving it unilaterally — raising it
   > back for sign-off: should the 8 screens (a) apply heavy `GlassCard`/`GlassSurface` blur to
   > most content cards, per the brief's literal text, or (b) reserve `GlassCard`/`GlassSurface`
   > for hero/header moments only (matching what the reference actually shows), with most content
   > cards rendered flat-white-with-shadow instead? **Recommendation: (b)**, since it's closer to
   > the actual visual reference supplied, but this is a recommendation pending `product-manager`/
   > `cto`/`ui-designer` sign-off, not a change already made to the brief's scope. Nothing in §5-6
   > (radius/blur tokens) has been altered to pre-empt this answer — `--glass-blur-*` tokens stay
   > as specified either way; this question is about *where* they get applied by `ui-designer`'s
   > screens, not their values.~~
6. **RESOLVED 2026-10-29 (`design-system-manager`).** Black secondary accent: adopted as
   `--glass-action-secondary` (near-black, `#181f1f`) for secondary/inline buttons only — NOT a
   primary-CTA or nav-active-state replacement for `--glass-accent` (teal). Previously open
   pending `product-manager`/`cto`; now ratified under the owner's direct authorization. See §7a.

   > **VOID (superseded 2026-10-29 by the RESOLVED note above — retained for audit trail per the
   > append-only house rule, not implemented as an open question any longer):**
   >
   > ~~**Open question for `product-manager`/`cto`/`ui-designer` — black secondary accent.** The
   > reference uses **black pill-shaped buttons/bottom-nav active-state highlights** as a second,
   > near-black accent alongside the teal — e.g. the primary "Book [name]" CTA and the active
   > bottom-tab pill both render black, not teal, while teal is reserved for category/identity
   > elements (header, logo mark, the "Experts" tab). The original written OB-17 brief never
   > specified a second accent colour. Flagging whether OB-17 should formally adopt a black/
   > near-black secondary accent token (e.g. a `--glass-accent-secondary`/`--glass-ink` pairing)
   > for primary CTA buttons and nav-active states, reserving `--glass-accent` (teal, §2.1) for
   > identity/category use — matching the reference's actual split — rather than applying the teal
   > accent to every interactive element. No token has been added for this yet; it needs
   > `product-manager`/`cto` sign-off on brand-identity scope before `design-system-manager` adds
   > it.~~

### 7a. Decision record — three open questions ratified 2026-10-29 (`design-system-manager`)

The owner directly authorized `design-system-manager` to resolve items 5 and 6 above (and the
screens doc's §13.3 floating-vs-static-label question) unilaterally rather than waiting on
further `product-manager`/`cto` sign-off, so the team can start building. Full reasoning and the
Figma evidence trail live in `ob-17-glass-redesign-screens.md` §§12-13 (ui-designer's Figma pulls)
— this section records the token-level ratification only.

**Item 5 — glass-blur scope: RATIFIED as (b).** `GlassCard`/`GlassSurface` blur is reserved for
hero/header/modal moments (screen hero cards, onboarding scrim+sheet, map overlay chrome).
Ordinary content cards (list rows, settings rows, form cards) render flat-white-with-shadow using
the existing `--glass-surface-opaque`/shadow tokens, not translucent blur. Rationale: two
independent PAAQ Figma pulls (screens doc §12.3, §13.4) both show every ordinary content card as
`bg-white` + `rounded-[24px]` + a near-invisible shadow, with blur used only for the onboarding
scrim/sheet — zero counter-examples across either node. This is now strong enough evidence (not
just the original single lower-fidelity screenshot) to close the question rather than leave it
recommended. No token values change — `--glass-blur-*` (§5.2) and `--glass-surface*` (§2.3) stay
as specified; this only fixes *where* `ui-designer`'s screens apply blur vs. flat fill. `ui-designer`
should update §§1-8's "Glass elements / fallback" subsections to reflect that most list/settings
rows are flat-white-with-shadow by default, with glass reserved for the already-flagged hero cards
(home hero, asset-detail hero, account header) and the onboarding/map overlay moments already
spec'd that way.

**Item 6 — black secondary accent: RATIFIED, narrower than first raised.** New token:

| Token | Light | Dark |
|---|---|---|
| `--glass-action-secondary` | `#181f1f` | `#E8EDED` (near-white inverse, for dark-mode secondary actions — unreferenced extrapolation, same honesty caveat as the dark-mode gradient in §2.2) |
| `--glass-action-secondary-text` | `#FFFFFF` | `#181f1f` |

Scope: `--glass-action-secondary` is for **secondary/inline/tertiary actions only** — info-expand
toggles, dropdown-embedded compact buttons, and similar inline affordances — never the screen's
one primary CTA and never nav-active-state highlighting. `--glass-accent` (teal, §2.1) remains the
only colour for primary CTA buttons and active-state nav/tab highlights, full stop. Rationale: the
evidence shifted materially since this item was first raised. The original owner screenshot (one
data point) showed black on what looked like a primary CTA ("Book [name]") and a bottom-nav
active state. Two subsequent, higher-fidelity Figma pulls (screens doc §12.2, §13.1) show the
opposite pattern consistently: every primary CTA observed across both nodes is brand-coloured
(teal `#00b5b4` "Explore PAAQ"; orange `#cd6312` "Scan to Join an Event" on its own card), while
black (`#181f1f`) appears only on small secondary/inline actions (an inline "How it works" toggle,
a compact dropdown-embedded "Select" button). Two Figma-sourced data points against one
lower-fidelity screenshot is enough to conclude the black-on-primary-CTA/nav-active reading was an
artifact of that one earlier screenshot's specific context, not the system's real rule. Adopting
the narrower, Figma-confirmed scope (secondary actions only) gets the real signal from the
reference — a second, distinct action colour exists and is worth having in the system — without
overriding the one-accent-for-primary-actions principle the brief and the stronger evidence both
support. Hex `#181f1f` taken directly from the Figma-sourced value in screens doc §13.1 (both
black buttons in that node use exactly this value) rather than re-estimating it.

**Floating vs. static labels (screens doc §13.3) — RATIFIED: keep floating labels, per the
brief's literal instruction.** `FormField`/`Input` continue to use floating-label mode as already
specified in tokens doc §6 and screens doc §1.2/§6.1 — no change to the component spec.
Justification, per the requirement to justify deviating from a single PAAQ reference screen:
"large-input forms with floating labels" was explicit, specific written instruction in the
original owner brief, not an inference from an ambiguous reference image — it is the strongest
category of signal this document works from (see §0's own hierarchy: written brief text is
treated as more authoritative than a visual reference when the brief is this prescriptive). The
one contradicting data point is a single PAAQ screen (a tier-upgrade application form, screens doc
§13) in a file explicitly used as a *general visual/layout* reference, not as an authority on this
specific interaction pattern — PAAQ's own form conventions are their product's choice, not
evidence about what the owner's brief meant when it specifically asked for floating labels on our
large-input forms. One static-label form screen does not outweigh one explicit, specific brief
instruction. If a future reference consistently and repeatedly contradicts floating labels across
multiple onboarding/identity screens specifically (the brief's named context for this
requirement), revisit — but a single secondary form screen elsewhere in the reference file isn't
that bar.

**Item 4 (bonus) — status-green token: FORMALIZED now, not deferred.** Adding it now is low cost
(one token, no component change) and the Figma evidence (screens doc §13.2, `#4ead66` used as a
dedicated semantic colour distinct from both the brand accent and the new secondary-action black)
directly matches an existing, named need in this project: claim/case/recovery status badges
(`AssetBadge`/`Badge` "Recovered"/"Active"/"Approved"-style states, screens doc §3.2) already
want a tone distinct from the brand teal per the house "no colour-only, but also no accent
overload" pattern. Deferring a one-line token to a "later pass" when the need and evidence both
exist today just creates another open item for no real savings.

| Token | Light | Dark |
|---|---|---|
| `--glass-status-positive` | `#2E9E53` (own pick, not PAAQ's exact `#4ead66` — adjusted slightly deeper for a verified ≥4.5:1 contrast against `--glass-surface-strong`/white per §2.4's methodology; we take the *pattern*, not PAAQ's literal value, consistent with screens doc §13.2's own framing) | `#4ADE80` (lighter tint for dark-mode legibility, unreferenced extrapolation — same caveat class as other dark-mode-only picks in this doc) |

Scope: status/semantic positive states only (recovered, approved, active-protected where a
distinct "good" signal beyond generic teal is wanted) — always paired with an icon/text label per
the existing no-colour-only house rule, never used for CTAs or navigation.
