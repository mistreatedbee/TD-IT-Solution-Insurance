import React from 'react';
import { cx } from './cx';

export type TdBackdropPattern = 'chevron' | 'rings' | 'dots';

export interface TdBackdropProps extends React.HTMLAttributes<HTMLDivElement> {
  /** ONE repeating pattern per backdrop (chevron 80px, rings 200px, dots 24px). */
  pattern?: TdBackdropPattern;
  /** Use the prepared 1920x1080 background (cover) instead of the rebuilt gradient, for full-bleed heroes. */
  image?: boolean;
  as?: 'div' | 'section';
}

const TILE: Record<TdBackdropPattern, number> = { chevron: 80, rings: 200, dots: 24 };
const BASE = '/images/design';

const GROUND = [
  'radial-gradient(60% 46% at 92% 6%, var(--td-glow-blue), transparent 70%)',
  'radial-gradient(54% 42% at 4% 98%, var(--td-glow-orange), transparent 70%)',
  'linear-gradient(180deg, var(--td-bg-top), var(--td-bg-bottom))',
].join(', ');

/**
 * Page ground (the design system's .td-page recipe) with an optional pattern or full-bleed image.
 * Light assets show on Day, dark assets on Night; the swap is pure CSS keyed on html[data-theme],
 * so it follows runtime theme changes. The decoration layers are aria-hidden and static.
 *
 * IMPORTANT: this is decoration. Text must never sit directly on a glow. Put content on
 * TdGlassCard (or variant="solid") surfaces.
 */
export const TdBackdrop = React.forwardRef<HTMLDivElement, TdBackdropProps>(function TdBackdrop(
  { pattern, image = false, as: Tag = 'div', className, children, style, ...rest },
  ref,
) {
  const size = pattern ? TILE[pattern] : 0;
  const css = pattern
    ? `.td-bd-${pattern}{background-image:url(${BASE}/pattern-${pattern}-light.svg);background-size:${size}px ${size}px;background-repeat:repeat}` +
      `[data-theme="night"] .td-bd-${pattern}{background-image:url(${BASE}/pattern-${pattern}-dark.svg)}`
    : '';
  const imgCss = image
    ? `.td-bd-img{background-image:url(${BASE}/bg-day-1920x1080.svg);background-size:cover;background-position:center}` +
      `[data-theme="night"] .td-bd-img{background-image:url(${BASE}/bg-night-1920x1080.svg)}`
    : '';
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      data-td-backdrop={image ? 'image' : 'ground'}
      data-pattern={pattern}
      className={cx('relative isolate text-td-ink', className)}
      style={style}
      {...rest}
    >
      {(css || imgCss) && <style>{css + imgCss}</style>}
      <div
        aria-hidden="true"
        data-td-layer="ground"
        className={cx('pointer-events-none absolute inset-0 -z-10', image && 'td-bd-img')}
        style={image ? undefined : { background: GROUND }}
      />
      {pattern && (
        <div
          aria-hidden="true"
          data-td-layer="pattern"
          className={cx('pointer-events-none absolute inset-0 -z-10', `td-bd-${pattern}`)}
        />
      )}
      {children}
    </Tag>
  );
});
