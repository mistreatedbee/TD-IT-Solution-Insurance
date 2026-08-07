import type { ComponentType, ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

export type FeatureCardAlign = 'left' | 'center';

export interface FeatureCardProps {
  /** Lucide (or any SVG) icon component rendered in the duotone icon tile. */
  icon: ComponentType<{className?: string;strokeWidth?: number | string;}>;
  /** Card heading. */
  title: string;
  /** Supporting copy shown under the accent rule. */
  description: ReactNode;
  /** Optional footer content, e.g. a link or tag row. */
  footer?: ReactNode;
  /** Content alignment. Defaults to `left`. */
  align?: FeatureCardAlign;
  /** Renders the whole card as an anchor when provided. */
  href?: string;
  /** Extra classes for the card root. */
  className?: string;
}

export function FeatureCard({
  icon: IconComponent,
  title,
  description,
  footer,
  align = 'left',
  href,
  className
}: FeatureCardProps) {
  const isCentered = align === 'center';
  const isInteractive = Boolean(href);

  const content =
  <>
      {/* Duotone icon: soft blue tile + saturated glyph */}
      <span
      aria-hidden="true"
      className={twMerge(
        'relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600 transition-colors duration-200',
        isInteractive && 'group-hover:bg-blue-600 group-hover:text-white'
      )}>
      
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-blue-500/20" />
        <IconComponent className="h-6 w-6" strokeWidth={1.75} />
      </span>

      <h3 className="mt-5 text-base font-semibold leading-6 text-gray-900">
        {title}
      </h3>

      <span
      aria-hidden="true"
      className={twMerge(
        'mt-3 block h-px w-10 bg-blue-500 transition-all duration-200',
        isCentered && 'mx-auto',
        isInteractive && 'group-hover:w-16'
      )} />
    

      <p className="mt-3 text-sm leading-6 text-gray-500">{description}</p>

      {footer ? <div className="mt-5 text-sm">{footer}</div> : null}
    </>;


  const rootClassName = twMerge(
    'group relative flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 text-left transition-shadow duration-200',
    isCentered && 'items-center text-center',
    isInteractive &&
    'hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
    className
  );

  if (href) {
    return (
      <a href={href} className={rootClassName}>
        {content}
      </a>);

  }

  return <article className={rootClassName}>{content}</article>;
}