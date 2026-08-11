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

export const colors = {
  // Brand / action
  primary: '#2C3E50',
  primaryHover: '#24333F',
  accentGold: '#F5A022',
  accentGoldDeep: '#D9720A',
  accentGoldTint: '#FDECD2',

  // Privileged-surface backgrounds (web dashboards use these; the mobile
  // app's Phase 1 scope is customer-only, so these are mirrored for
  // completeness/parity but not currently used by any customer screen).
  surfaceNavy: '#0F1A2C',
  surfaceNavyDeep: '#0A1628',

  // Mobile app surfaces (full-bleed, no Card wrapper — ui-design.md §1)
  background: '#FFFFFF',
  card: '#F5F1EA',

  // Status
  success: '#059669',
  successLight: '#10B981',

  // Text
  textPrimary: '#1C1917',
  textSecondary: '#6B6156',
  textInverse: '#FFFFFF',

  // Structure
  border: '#E4DDD1',
  hairline: 'rgba(44,62,80,0.08)',

  // Field error state (Input's existing red-500/600 treatment, reused
  // verbatim per ui-design.md §1's instruction to use Input's built-in
  // error tokens for field-level errors pending the Alert component).
  fieldError: '#EF4444',
  fieldErrorText: '#DC2626',

  // Alert/Badge tone palette — mirrors design-system-additions.md §2/§3's
  // Tailwind color mapping (bg-*-50 / text-*-800 / ring-*-200 / icon *-600
  // families), reused as flat hex values since RN has no Tailwind runtime.
  tones: {
    info: {
      background: '#EFF6FF', // blue-50
      text: '#1E40AF', // blue-800
      border: '#BFDBFE', // blue-200
      icon: '#2563EB', // blue-600
    },
    success: {
      background: '#ECFDF5', // emerald-50
      text: '#065F46', // emerald-800
      border: '#A7F3D0', // emerald-200
      icon: '#059669', // emerald-600
    },
    warning: {
      background: '#FFFBEB', // amber-50
      text: '#92400E', // amber-800
      border: '#FDE68A', // amber-200
      icon: '#D97706', // amber-600
    },
    danger: {
      background: '#FEF2F2', // red-50
      text: '#991B1B', // red-800
      border: '#FECACA', // red-200
      icon: '#DC2626', // red-600
    },
  },

  // Neutral scale (Input placeholder/disabled/border states — Tailwind
  // slate family, matching src/components/Input/index.tsx's own usage).
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
} as const;

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
