/**
 * TEMPORARY BRIDGE — mobile/src/theme/tokens.ts
 *
 * Per docs/features/003-mobile-app-foundation/architecture.md §1.5:
 * this is a manual, documented-in-code mirror of the web design system's
 * Tailwind tokens (root `tailwind.config.js` + `src/index.css` custom
 * properties), not an independently invented palette.
 *
 * Do NOT add new tokens/variants here independently of `src/components/*`'s
 * web equivalents. If a screen needs a color/spacing/radius value that
 * doesn't exist below, that's a signal to go add it to the web token
 * source first (and flag `design-system-manager`), not to invent one here.
 *
 * Replace this file wholesale once `design-system-manager` ships the
 * platform-agnostic token package (architecture.md §1.5, M-04) that both
 * `tailwind.config.js` and this app are meant to consume from one place.
 *
 * Mirrored from (as of 2026-08-08):
 *   - root `tailwind.config.js` (color/radius/shadow keys)
 *   - root `src/index.css` (the `--*` custom-property values those keys
 *     resolve to — light mode only; the web app's dark-mode tokens are not
 *     mirrored here because no mobile screen currently needs a dark theme)
 *   - `docs/features/001-authentication/design-system-additions.md` §2/§3
 *     (the info/success/warning/danger tone-to-Tailwind-color mapping for
 *     the not-yet-built `Alert`/`Badge` danger+warning tones — this file
 *     mirrors those Tailwind palette hex values directly since RN has no
 *     Tailwind class runtime to resolve them from).
 */

import { lightColors } from './colorSchemes';

/** Static light palette — tests and non-React modules. Prefer `useColors()` in UI. */
export const colors = lightColors;

export const radius = {
  input: 8,
  card: 16,
  cardLg: 20,
  full: 9999,
  /**
   * OB-17 glass-redesign radius scale (ob-17-glass-redesign-tokens.md §5.1).
   * `glassCard`/`glassCardLg` raise the pre-OB-17 `card`/`cardLg` values into
   * the brief's required 20-28px range; `glassChip`/`glassInput` are new.
   * Additive — old `card`/`cardLg` stay for any call site not yet migrated.
   */
  glassCard: 24,
  glassCardLg: 28,
  glassChip: 20,
  glassInput: 16,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

/**
 * OB-17 glass-redesign semantic spacing alias (tokens doc §4). Values
 * mirror the existing `spacing` scale exactly (no new unit system) —
 * `glassCardPadding` is the one genuinely new semantic alias: the default
 * "generous" interior padding for glass/flat content cards, replacing
 * ad hoc per-card `sm`/`md`/`lg` padding choices.
 */
export const glassSpacing = {
  xs: spacing.xs,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
  '2xl': spacing['2xl'],
  cardPadding: spacing.xl,
} as const;

/**
 * OB-17 glass-redesign motion tokens (tokens doc §5.3) — the brief's
 * "soft spring on button presses" and skeleton shimmer duration. No
 * equivalent existed anywhere in the mobile token system before OB-17.
 */
export const glassMotion = {
  springPress: { damping: 15, stiffness: 180, mass: 1 } as const,
  skeletonShimmerDurationMs: 1200,
} as const;

/**
 * OB-17 glass-redesign type scale (tokens doc §3) — additive `glass-text-*`
 * namespace so screens can migrate off the pre-OB-17 `typography.sizes`
 * scale one at a time. Font family stays OS-default per tokens doc §3's
 * note that Inter loading is a separate `mobile-engineer` follow-up not
 * done in this visuals pass (no `expo-font`/`@expo-google-fonts/inter`
 * wiring added here).
 */
export const glassTypography = {
  fontFamily: undefined,
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 22,
    '2xl': 28,
    '3xl': 34,
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

/**
 * Minimum touch target, per ui-design.md §6 accessibility redline
 * ("Tap targets ≥44×44pt on mobile screens throughout").
 */
export const minTouchTarget = 44;

export const typography = {
  // The web app uses `Fraunces` (heading) / `Public Sans` (body) as custom
  // web fonts (tailwind.config.js `fontFamily`). Neither is loaded as a
  // native font in this app yet — no `expo-font` loading step exists in
  // Phase 1 — so mobile screens use the OS system font for now. Flagged
  // here rather than silently diverging: loading the same brand fonts via
  // `expo-font`/`@expo-google-fonts` is a `design-system-manager` +
  // `mobile-engineer` follow-up, not done in this pass.
  fontFamily: undefined,
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
  },
} as const;
