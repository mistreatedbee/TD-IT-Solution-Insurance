/**
 * ChevronMotif — page-local decorative primitive derived from the open
 * chevron stroke that makes up `public/logo.png`'s diamond/rhombus mark
 * (a wide outer stroke + a narrower inner stroke, mirrored top/bottom).
 *
 * This is intentionally NOT part of `src/components/*` — see
 * `docs/features/002-landing-page/ui-design-v2.md` §7 for the full
 * reasoning (single-purpose decorative SVG, no interactive states, no
 * reuse target outside this page today; promote to the design system via
 * `design-system-manager` only if/when another surface wants it).
 *
 * Every export here is purely decorative: always render with
 * `aria-hidden="true"` (baked in below) and never as the sole conveyor of
 * information — pair with real text/icons at the call site.
 */

export type ChevronMotifTone = 'navy' | 'secondary' | 'gold';

const TONE_CLASSES: Record<ChevronMotifTone, string> = {
  navy: 'text-primary',
  secondary: 'text-secondary',
  gold: 'text-accent-gold-deep'
};

export interface ChevronMotifProps {
  tone?: ChevronMotifTone;
  className?: string;
}

/**
 * A single open chevron stroke — the same angle/proportions as the outer
 * stroke in `public/logo.png`. `currentColor`-based so it inherits the
 * `tone` color via Tailwind text-color classes.
 */
export function ChevronMotif({ tone = 'gold', className = '' }: ChevronMotifProps) {
  return (
    <svg
      viewBox="0 0 100 60"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`${TONE_CLASSES[tone]} ${className}`}>
      <path
        d="M4 4 L50 52 L96 4"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface ChevronMotifFieldProps {
  className?: string;
}

/**
 * Large-scale composition of nested open chevrons used in the hero (§1 of
 * ui-design-v2.md) — an oversized abstract treatment of the logo's
 * diamond/chevron mark, not a literal small redraw of it.
 */
export function ChevronMotifField({ className = '' }: ChevronMotifFieldProps) {
  return (
    <div
      aria-hidden="true"
      className={`relative aspect-square w-full max-w-[560px] overflow-hidden rounded-[40px] bg-background-alt ${className}`}>
      {/* Outer, largest chevron — gold, mirrored to echo the diamond silhouette */}
      <ChevronMotif
        tone="gold"
        className="absolute left-1/2 top-[8%] h-[42%] w-[80%] -translate-x-1/2 opacity-90"
      />
      <ChevronMotif
        tone="gold"
        className="absolute bottom-[8%] left-1/2 h-[42%] w-[80%] -translate-x-1/2 rotate-180 opacity-40"
      />
      {/* Middle chevron — navy */}
      <ChevronMotif
        tone="navy"
        className="absolute left-1/2 top-[22%] h-[30%] w-[58%] -translate-x-1/2 opacity-70"
      />
      {/* Innermost, smallest chevron — secondary blue */}
      <ChevronMotif
        tone="secondary"
        className="absolute left-1/2 top-[34%] h-[20%] w-[38%] -translate-x-1/2 opacity-80"
      />
    </div>
  );
}

export interface ChevronDividerProps {
  tone?: ChevronMotifTone;
  className?: string;
}

/**
 * A thin horizontal seam of repeated small open chevrons — used at the
 * white→navy transition between the hero and "How It Works" (§2).
 */
export function ChevronDivider({ tone = 'gold', className = '' }: ChevronDividerProps) {
  const items = Array.from({ length: 14 });
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none flex w-full max-w-xs items-center justify-center gap-1 ${className}`}>
      {items.map((_, i) => (
        <ChevronMotif key={i} tone={tone} className="h-2.5 w-2.5 shrink-0 opacity-70" />
      ))}
    </div>
  );
}
