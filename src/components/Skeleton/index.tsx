import React from 'react';

export type SkeletonShape = 'bar' | 'circle' | 'rect';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual shape of the placeholder. `bar` (default, rounded text-line),
   * `rect` (card-shaped block, uses the OB-17 24px card radius), or
   * `circle` (avatar-shaped). */
  shape?: SkeletonShape;
  /** Width, any valid CSS value (defaults to 100%). */
  width?: string | number;
  /** Height, any valid CSS value (defaults to 1em for `bar`, 48px otherwise). */
  height?: string | number;
  /** Accessible label announced while the skeleton is visible. */
  label?: string;
}

/**
 * OB-17 skeleton-loading primitive — replaces ad hoc spinners project-wide
 * per the frosted-glass redesign brief. CSS shimmer keyframe
 * (`--glass-skeleton-shimmer-duration`) lives in `src/index.css`
 * (`.glass-skeleton` / `@keyframes glass-skeleton-shimmer`), honoring
 * `prefers-reduced-motion`. See
 * docs/organization/design-system/ob-17-glass-redesign-tokens.md §5.3/§6.
 */
export function Skeleton({
  shape = 'bar',
  width,
  height,
  label = 'Loading…',
  className = '',
  style,
  ...rest
}: SkeletonProps) {
  const shapeClasses =
    shape === 'circle'
      ? 'rounded-full'
      : shape === 'rect'
        ? 'rounded-glass-card'
        : 'rounded-full';

  const defaultHeight = shape === 'bar' ? '1em' : shape === 'circle' ? 48 : 48;
  const defaultWidth = shape === 'circle' ? 48 : '100%';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`glass-skeleton ${shapeClasses} ${className}`.trim()}
      style={{
        width: width ?? defaultWidth,
        height: height ?? defaultHeight,
        ...style,
      }}
      {...rest}
    >
      <span className="sr-only">{label}</span>
    </div>
  );
}

export interface SkeletonGroupProps {
  /** Number of skeleton rows/cards to render. */
  count?: number;
  shape?: SkeletonShape;
  width?: string | number;
  height?: string | number;
  className?: string;
  gapClassName?: string;
}

/** Convenience wrapper for the common "N shimmer rows" pattern used across
 * screen specs (asset list, alerts, account rows). */
export function SkeletonGroup({
  count = 4,
  shape = 'rect',
  width,
  height = 64,
  className = '',
  gapClassName = 'space-y-3',
}: SkeletonGroupProps) {
  return (
    <div className={`${gapClassName} ${className}`.trim()}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} shape={shape} width={width} height={height} />
      ))}
    </div>
  );
}
