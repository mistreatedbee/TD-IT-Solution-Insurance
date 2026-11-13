import React from 'react';
import { LoaderCircle } from 'lucide-react';
import { cx, TD_FOCUS } from './cx';

export type TdButtonVariant = 'primary' | 'secondary' | 'glass' | 'danger';

export interface TdButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = the one main action; danger only for reporting a loss or deleting. */
  variant?: TdButtonVariant;
  /** Optional 20px line icon shown before the label (decorative). */
  icon?: React.ReactNode;
  /** Verb-first label, one to three words, sentence case. */
  children: React.ReactNode;
  /**
   * Busy state for submit actions: disables the button, sets aria-busy and swaps the icon
   * slot for a spinner (still when the user prefers reduced motion). The label stays put so
   * the control keeps its accessible name.
   */
  loading?: boolean;
}

const VARIANT: Record<TdButtonVariant, string> = {
  primary: 'bg-td-action-primary text-td-on-action-primary shadow-[0_6px_20px_var(--td-glow-orange)]',
  secondary: 'bg-td-action-secondary text-td-on-action-secondary',
  glass:
    'bg-td-glass-fill text-td-ink border-td-border-control backdrop-blur-td-glass [@media(prefers-reduced-transparency:reduce)]:bg-td-bg-raised [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none',
  danger: 'bg-td-danger-bg text-td-danger border-td-danger',
};

export const TdButton = React.forwardRef<HTMLButtonElement, TdButtonProps>(function TdButton(
  { variant = 'primary', icon, loading = false, disabled, className, type = 'button', children, ...rest },
  ref,
) {
  const slot = loading ? (
    <LoaderCircle strokeWidth={1.75} className="motion-safe:animate-spin" />
  ) : (
    icon
  );
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex min-h-[48px] items-center justify-center gap-td-2 rounded-td-pill border-[1.5px] border-transparent px-td-6',
        'font-td-sans text-[14px] font-semibold leading-[18px] transition duration-200',
        'enabled:hover:-translate-y-px enabled:hover:brightness-105 enabled:active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        TD_FOCUS,
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {slot ? (
        <span aria-hidden="true" className="inline-flex h-5 w-5 flex-none items-center justify-center [&>svg]:h-5 [&>svg]:w-5">
          {slot}
        </span>
      ) : null}
      {children}
    </button>
  );
});
