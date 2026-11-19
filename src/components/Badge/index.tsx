import React from 'react';

export type BadgeTone = 'neutral' | 'gold' | 'emerald';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Visual tone of the badge. */
  tone?: BadgeTone;
  /** Size of the badge. */
  size?: BadgeSize;
  /** Optional leading icon or dot. */
  icon?: React.ReactNode;
  /** Badge label. */
  children: React.ReactNode;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-td-bg-sunken text-td-ink-muted ring-1 ring-inset ring-td-border-subtle',
  gold: 'bg-td-warning-bg text-td-warning',
  emerald: 'bg-td-success-bg text-td-success'
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-xs leading-4 px-2 py-0.5 gap-1',
  md: 'text-sm leading-5 px-2.5 py-1 gap-1.5'
};

export function Badge({
  tone = 'neutral',
  size = 'sm',
  icon,
  children,
  className = '',
  ...rest
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${toneClasses[tone]} ${sizeClasses[size]} ${className}`}
      {...rest}>
      
      {icon ?
      <span aria-hidden="true" className="inline-flex shrink-0 items-center">
          {icon}
        </span> :
      null}
      {children}
    </span>);

}