import React from 'react';

export type GlassCardTone = 'light' | 'dark';
export type GlassCardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type GlassCardRadius = 'card' | 'card-lg';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional icon or visual slot rendered above the heading. */
  icon?: React.ReactNode;
  /**
   * Card heading. Named `heading` (not `title`) because this component
   * extends `HTMLAttributes<HTMLDivElement>`, whose native `title` is a
   * plain-string tooltip attribute — an incompatible, unrelated meaning.
   */
  heading?: React.ReactNode;
  /** Supporting copy under the heading. */
  description?: React.ReactNode;
  /** Surface tint. `light` sits on dark/gradient backgrounds, `dark` on light ones. */
  tone?: GlassCardTone;
  /** Inner spacing. `xl` (new, OB-17) maps to `--glass-card-padding` (24px),
   * the redesign's default "generous" card interior space. */
  padding?: GlassCardPadding;
  /** Corner radius. OB-17 default is `card` (24px, `--glass-radius-card`);
   * use `card-lg` (28px, `--glass-radius-card-lg`) for hero/feature cards
   * and modals per the ratified glass-blur scope (hero/header/modal only). */
  radius?: GlassCardRadius;
  /** Adds hover lift + brighter border. Use for clickable cards. */
  interactive?: boolean;
  /** Custom body content, rendered after title/description. */
  children?: React.ReactNode;
}

const paddingClasses: Record<GlassCardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
  // OB-17: --glass-card-padding (24px) default "generous" interior space.
  xl: 'p-6 sm:p-[var(--glass-card-padding)]'
};

const radiusClasses: Record<GlassCardRadius, string> = {
  card: 'rounded-glass-card',
  'card-lg': 'rounded-glass-card-lg'
};

const toneClasses: Record<GlassCardTone, string> = {
  light: 'bg-white/10 border-white/20 text-white shadow-lg shadow-black/20',
  // design system glass: white translucent fill, white edge, ink text
  dark: 'bg-td-glass-fill border-td-glass-border text-td-ink shadow-td-glass'
};

const descriptionToneClasses: Record<GlassCardTone, string> = {
  light: 'text-white/75',
  dark: 'text-td-ink-muted'
};

const iconToneClasses: Record<GlassCardTone, string> = {
  light: 'bg-white/15 text-white ring-1 ring-white/20',
  dark: 'bg-td-info-bg text-td-link ring-1 ring-td-border-subtle'
};

export function GlassCard({
  icon,
  heading,
  description,
  tone = 'light',
  padding = 'xl',
  radius = 'card',
  interactive = false,
  className = '',
  children,
  ...rest
}: GlassCardProps) {
  const interactiveClasses = interactive ?
  'transition duration-200 hover:-translate-y-1 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 cursor-pointer' :
  'transition duration-200';

  return (
    <div
      // `glass-surface` + `data-glass-tone` opt this card into the OB-17
      // `prefers-reduced-transparency` fallback defined in src/index.css,
      // which swaps the translucent fill for a flat opaque one without
      // touching layout, border, or shadow.
      data-glass-tone={tone}
      className={[
      'glass-surface relative overflow-hidden border backdrop-blur-xl backdrop-saturate-150',
      radiusClasses[radius],
      toneClasses[tone],
      paddingClasses[padding],
      interactiveClasses,
      className].

      filter(Boolean).
      join(' ')}
      {...rest}>

      {icon ?
      <div
        className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${iconToneClasses[tone]}`}
        aria-hidden="true">
        
          {icon}
        </div> :
      null}

      {heading ?
      <h3 className="text-base font-semibold leading-6 tracking-tight">{heading}</h3> :
      null}

      {description ?
      <p className={`mt-2 text-sm leading-6 ${descriptionToneClasses[tone]}`}>{description}</p> :
      null}

      {children ? <div className={heading || description || icon ? 'mt-4' : ''}>{children}</div> : null}
    </div>);

}