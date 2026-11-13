import React from 'react';
import { cx } from './cx';

export type TdGlassCardVariant = 'glass' | 'solid';

export interface TdGlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** glass for cards on a backdrop; solid for long text or forms. */
  variant?: TdGlassCardVariant;
  /** Marks the chosen item (2px focus-ring outline, 2px offset). */
  selected?: boolean;
  /** Force the opaque fallback (bg-raised, no blur, border kept), e.g. low-end Android or user setting. */
  forceSolid?: boolean;
  /** Use the larger hero radius. */
  hero?: boolean;
  as?: 'div' | 'section' | 'article';
}

const GLASS =
  'bg-td-glass-fill border-td-glass-border shadow-[var(--td-shadow-glass),inset_0_1px_0_var(--td-glass-border)] backdrop-blur-td-glass backdrop-saturate-[1.4] ' +
  '[@media(prefers-reduced-transparency:reduce)]:bg-td-bg-raised [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none [@media(prefers-reduced-transparency:reduce)]:backdrop-saturate-100';
const SOLID = 'bg-td-bg-raised border-td-border-subtle shadow-[var(--td-shadow-glass)]';

export const TdGlassCard = React.forwardRef<HTMLDivElement, TdGlassCardProps>(function TdGlassCard(
  { variant = 'glass', selected = false, forceSolid = false, hero = false, as: Tag = 'div', className, children, ...rest },
  ref,
) {
  const solid = variant === 'solid' || forceSolid;
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      data-surface={solid ? 'solid' : 'glass'}
      data-selected={selected ? 'true' : undefined}
      className={cx(
        'border p-td-5 text-td-ink',
        hero ? 'rounded-td-xl' : 'rounded-td-lg',
        solid ? SOLID : GLASS,
        selected && 'outline outline-2 outline-offset-2 outline-td-focus-ring',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
});
