import React from 'react';

export type GlassCardTone = 'light' | 'dark';
export type GlassCardPadding = 'none' | 'sm' | 'md' | 'lg';

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
  /** Inner spacing. */
  padding?: GlassCardPadding;
  /** Adds hover lift + brighter border. Use for clickable cards. */
  interactive?: boolean;
  /** Custom body content, rendered after title/description. */
  children?: React.ReactNode;
}

const paddingClasses: Record<GlassCardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8'
};

const toneClasses: Record<GlassCardTone, string> = {
  light: 'bg-white/10 border-white/20 text-white shadow-lg shadow-black/20',
  dark: 'bg-slate-900/10 border-slate-900/10 text-slate-900 shadow-lg shadow-slate-900/10'
};

const descriptionToneClasses: Record<GlassCardTone, string> = {
  light: 'text-white/75',
  dark: 'text-slate-600'
};

const iconToneClasses: Record<GlassCardTone, string> = {
  light: 'bg-white/15 text-white ring-1 ring-white/20',
  dark: 'bg-slate-900/5 text-slate-900 ring-1 ring-slate-900/10'
};

export function GlassCard({
  icon,
  heading,
  description,
  tone = 'light',
  padding = 'md',
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
      className={[
      'relative overflow-hidden rounded-2xl border backdrop-blur-xl backdrop-saturate-150',
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