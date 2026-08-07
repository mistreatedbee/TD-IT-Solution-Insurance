import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

export type StatBlockAlign = 'left' | 'center';
export type StatBlockSize = 'md' | 'lg';

export interface StatBlockProps {
  /** Target numeric value to count up to. */
  value: number;
  /** Uppercase label rendered beneath the numeral. */
  label: string;
  /** Optional text rendered before the numeral (e.g. "$"). */
  prefix?: string;
  /** Optional text rendered after the numeral (e.g. "%", "+"). */
  suffix?: string;
  /** Decimal places to display. Defaults to 0. */
  decimals?: number;
  /** Count-up duration in milliseconds. Defaults to 1600. */
  duration?: number;
  /** Skip the animation and render the final value immediately. */
  animate?: boolean;
  align?: StatBlockAlign;
  size?: StatBlockSize;
  className?: string;
}

// Tokenized (2026-08-07 design refresh): pulls from the shared brand
// palette instead of hardcoded hex literals so this component tracks
// future token updates automatically.
const NAVY = 'var(--primary)';
const ELECTRIC = 'var(--accent-gold-deep)';

const sizeClasses: Record<StatBlockSize, string> = {
  md: 'text-4xl sm:text-5xl',
  lg: 'text-5xl sm:text-6xl'
};

const underlineWidth: Record<StatBlockSize, string> = {
  md: 'w-10',
  lg: 'w-14'
};

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function StatBlock({
  value,
  label,
  prefix,
  suffix,
  decimals = 0,
  duration = 1600,
  animate = true,
  align = 'left',
  size = 'lg',
  className = ''
}: StatBlockProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animate && !prefersReducedMotion;
  const [displayValue, setDisplayValue] = useState(shouldAnimate ? 0 : value);

  useEffect(() => {
    if (!shouldAnimate) {
      setDisplayValue(value);
      return;
    }
    if (!inView) return;

    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setDisplayValue(value * easeOutCubic(progress));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, duration, shouldAnimate]);

  const formatted = displayValue.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  return (
    <div
      ref={ref}
      className={[
      'flex flex-col',
      align === 'center' ? 'items-center text-center' : 'items-start text-left',
      className].

      filter(Boolean).
      join(' ')}>
      
      <div
        className={`font-bold leading-none tracking-tight tabular-nums ${sizeClasses[size]}`}
        style={{ color: NAVY }}
        aria-label={`${prefix ?? ''}${value.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        })}${suffix ?? ''}`}>
        
        <span aria-hidden="true">
          {prefix}
          {formatted}
          {suffix}
        </span>
      </div>

      <span
        aria-hidden="true"
        className={`mt-4 block h-1 rounded-full transition-all duration-700 ease-out ${
        inView || !shouldAnimate ? underlineWidth[size] : 'w-0'}`
        }
        style={{ backgroundColor: ELECTRIC }} />
      

      <span
        className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-sm">
        
        {label}
      </span>
    </div>);

}