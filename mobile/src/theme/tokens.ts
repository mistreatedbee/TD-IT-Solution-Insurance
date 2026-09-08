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
