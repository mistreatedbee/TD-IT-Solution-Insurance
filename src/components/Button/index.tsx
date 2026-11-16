import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'tertiary';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends
  React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

const base =
'inline-flex items-center justify-center gap-2 font-semibold tracking-tight transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-td-focus-ring disabled:opacity-50 disabled:pointer-events-none select-none';

const sizes: Record<ButtonSize, string> = {
  sm: 'text-sm px-4 py-2',
  md: 'text-sm px-6 py-2.5',
  lg: 'text-base px-8 py-3.5'
};

const variants: Record<ButtonVariant, string> = {
  // Matches TdButton: the one main action is brand orange with dark text, pill-shaped, with an orange glow.
  primary:
  'rounded-td-pill border-[1.5px] border-transparent bg-td-action-primary text-td-on-action-primary shadow-[0_6px_20px_var(--td-glow-orange)] enabled:hover:-translate-y-px enabled:hover:brightness-105 active:scale-[0.98]',
  secondary:
  'rounded-td-pill border-[1.5px] border-td-border-control bg-transparent text-td-ink hover:bg-td-bg-sunken active:scale-[0.98]',
  ghost:
  'rounded-td-pill border border-white/70 text-white bg-white/10 backdrop-blur-sm hover:bg-white hover:text-td-ink focus-visible:ring-white focus-visible:ring-offset-transparent',
  tertiary:
  'rounded-md px-1 py-1 text-td-link bg-transparent underline-offset-4 hover:underline hover:text-td-ink'
};

const Spinner = () =>
<svg
  className="h-4 w-4 animate-spin"
  viewBox="0 0 24 24"
  fill="none"
  aria-hidden="true">
  
    <circle
    className="opacity-25"
    cx="12"
    cy="12"
    r="10"
    stroke="currentColor"
    strokeWidth="4" />
  
    <path
    className="opacity-90"
    fill="currentColor"
    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
  
  </svg>;


export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  leadingIcon,
  trailingIcon,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const sizeClasses = variant === 'tertiary' ? sizes[size].replace(/px-\d+(\.\d+)?/, 'px-0') : sizes[size];

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
      base,
      sizeClasses,
      variants[variant],
      fullWidth ? 'w-full' : '',
      className].

      filter(Boolean).
      join(' ')}
      {...rest}>
      
      {loading ? <Spinner /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>);

}