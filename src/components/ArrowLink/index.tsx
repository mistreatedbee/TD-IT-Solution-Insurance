import React from 'react';
import { ArrowRightIcon } from 'lucide-react';

export type ArrowLinkSize = 'sm' | 'md' | 'lg';
export type ArrowLinkTone = 'default' | 'muted' | 'inverse';

export interface ArrowLinkProps extends
  React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Link label text */
  children: React.ReactNode;
  /** Destination URL */
  href?: string;
  /** Text size scale */
  size?: ArrowLinkSize;
  /** Color treatment */
  tone?: ArrowLinkTone;
  /** Renders the arrow before the label, pointing left */
  reverse?: boolean;
  /** Disables interaction */
  disabled?: boolean;
}

const sizeClasses: Record<ArrowLinkSize, string> = {
  sm: 'text-xs gap-1',
  md: 'text-sm gap-1.5',
  lg: 'text-base gap-2'
};

const iconSizeClasses: Record<ArrowLinkSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5'
};

const toneClasses: Record<ArrowLinkTone, string> = {
  default:
  'text-blue-600 hover:text-blue-700 focus-visible:outline-blue-600 dark:text-blue-400 dark:hover:text-blue-300',
  muted:
  'text-gray-600 hover:text-gray-900 focus-visible:outline-gray-600 dark:text-gray-400 dark:hover:text-gray-100',
  inverse:
  'text-white hover:text-white/80 focus-visible:outline-white'
};

export function ArrowLink({
  children,
  href,
  size = 'md',
  tone = 'default',
  reverse = false,
  disabled = false,
  className = '',
  ...rest
}: ArrowLinkProps) {
  const arrow =
  <ArrowRightIcon
    aria-hidden="true"
    className={[
    iconSizeClasses[size],
    'shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none',
    reverse ?
    'rotate-180 group-hover:-translate-x-1 group-focus-visible:-translate-x-1' :
    'group-hover:translate-x-1 group-focus-visible:translate-x-1'].
    join(' ')} />;



  return (
    <a
      href={disabled ? undefined : href}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : rest.tabIndex}
      className={[
      'group inline-flex items-center font-medium',
      'rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
      'transition-colors duration-200',
      sizeClasses[size],
      toneClasses[tone],
      disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer',
      className].

      filter(Boolean).
      join(' ')}
      {...rest}>
      
      {reverse && arrow}
      <span className="underline-offset-4 group-hover:underline">
        {children}
      </span>
      {!reverse && arrow}
    </a>);

}