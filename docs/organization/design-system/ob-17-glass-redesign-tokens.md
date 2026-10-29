# OB-17 — Frosted-Glass Redesign: Design Tokens + Component List

Owner: `design-system-manager` (A). Hand-off: `ui-designer` (R, screens).
Status: tokens + component list ratified 2026-10-29. Screens not started (see
`docs/organization/08-roadmap.md` OB-17 entry).

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

### 2.1 Accent colour — PROVISIONAL pending owner's reference image

The brief calls for **one** accent colour, used consistently (replacing the current two-accent
gold/blue split visible in `--accent-gold*` and `accentBlue*`/`accentGold*` mobile tokens, which
predates OB-17 and was never meant as the "calm, modern, trustworthy, different-from-typical-
insurance" identity the brief now asks for).

Provisional pick, to be confirmed or replaced once the reference image lands:

- `--glass-accent`: `#4F7CFF` (a cool, desaturated indigo-blue — reads as calm/trustworthy,
  distinct from typical insurance red/orange, distinct from the current gold accent which skews
  "premium/luxury" rather than "calm/modern")
- `--glass-accent-deep`: `#3659D6` (hover/active/pressed state, also the Android flat-fallback
  fill tint source — see §5)
- `--glass-accent-tint`: `#EAF0FF` (light-mode accent-wash background, e.g. selected chip)

This supersedes neither `--accent-gold*` nor mobile `accentGold*`/`accentBlue*` yet — those stay
in place for anything OB-17 hasn't touched, per the visuals-only/incremental-rollout rule. New
`--glass-*` tokens are additive until `ui-designer`'s screens migrate consumers over screen by
screen.

### 2.2 Background gradient — PROVISIONAL pending owner's reference image

One soft gradient behind the glass, per surface mode:

| Token | Light | Dark |
|---|---|---|
| `--glass-bg-gradient-start` | `#F3F6FF` | `#0B0F1A` |
| `--glass-bg-gradient-mid` | `#E8EEFF` | `#121A2E` |
| `--glass-bg-gradient-end` | `#FFFFFF` | `#070A12` |

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

1. **Owner's reference image is still outstanding.** Everything marked PROVISIONAL in §2.1/§2.2
   is a placeholder, not a ratified brand decision, and should not be treated as final once
   `ui-designer` starts screens — flag back to `product-manager`/`cto` to request it.
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
