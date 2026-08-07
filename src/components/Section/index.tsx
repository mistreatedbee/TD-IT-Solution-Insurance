import React from 'react';

export type SectionBackground = 'white' | 'warm' | 'navy';
export type SectionSpacing = 'default' | 'compact' | 'none';
export type SectionWidth = 'default' | 'narrow' | 'wide' | 'full';

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  /** Alternating page background: plain white or warm gray. */
  background?: SectionBackground;
  /** Vertical rhythm. `default` = 80px mobile / 120px desktop. */
  spacing?: SectionSpacing;
  /** Max width of the inner container. */
  width?: SectionWidth;
  /** Render the inner container without horizontal padding/max-width. */
  bleed?: boolean;
  /** Element to render as. Defaults to `section`. */
  as?: 'section' | 'div' | 'header' | 'footer' | 'main' | 'article';
  children?: React.ReactNode;
}

const backgroundClasses: Record<SectionBackground, string> = {
  white: 'bg-white',
  warm: 'bg-stone-50',
  // Dark inverse background (e.g. footers). Pair with `text-text-inverse` /
  // `text-text-inverse-muted` on child text — this variant only sets the
  // section's own background, it doesn't flip descendant text color.
  // `bg-grain` layers a subtle noise texture (2026-08-07 refresh) so large
  // flat navy blocks read as considered surfaces, not flat vector fills.
  navy: 'bg-surface-navy-deep bg-grain'
};

const spacingClasses: Record<SectionSpacing, string> = {
  default: 'py-20 lg:py-[120px]',
  compact: 'py-12 lg:py-20',
  none: 'py-0'
};

const widthClasses: Record<SectionWidth, string> = {
  narrow: 'max-w-3xl',
  default: 'max-w-6xl',
  wide: 'max-w-7xl',
  full: 'max-w-none'
};

export function Section({
  background = 'white',
  spacing = 'default',
  width = 'default',
  bleed = false,
  as: Tag = 'section',
  className = '',
  children,
  ...rest
}: SectionProps) {
  return (
    <Tag
      className={`w-full ${backgroundClasses[background]} ${spacingClasses[spacing]} ${className}`.trim()}
      {...rest}>
      
      {bleed ?
      children :

      <div className={`mx-auto w-full px-6 lg:px-8 ${widthClasses[width]}`}>
          {children}
        </div>
      }
    </Tag>);

}