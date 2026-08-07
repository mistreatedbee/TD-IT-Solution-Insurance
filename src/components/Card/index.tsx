import React from 'react';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Content of the card */
  children?: React.ReactNode;
  /** Inner padding scale */
  padding?: CardPadding;
  /** Enables hover lift + electric-blue accent edge */
  interactive?: boolean;
  /** Renders the card as a semantic element other than div */
  as?: 'div' | 'article' | 'section' | 'li';
  className?: string;
}

const paddingClasses: Record<CardPadding, string> = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8'
};

export function Card({
  children,
  padding = 'md',
  interactive = true,
  as: Tag = 'div',
  className = '',
  ...rest
}: CardProps) {
  const isFocusable = typeof rest.onClick === 'function';

  return (
    <Tag
      className={[
      'group relative overflow-hidden rounded-2xl bg-white',
      'border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.15)]',
      'transition-all duration-300 ease-out',
      paddingClasses[padding],
      interactive ?
      'hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_18px_40px_-16px_rgba(37,99,235,0.35)]' :
      '',
      isFocusable ?
      'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2' :
      '',
      className].

      filter(Boolean).
      join(' ')}
      {...isFocusable ? { tabIndex: 0, role: 'button' } : {}}
      {...rest}>
      
      {interactive &&
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1 origin-top scale-y-0 bg-blue-600 transition-transform duration-300 ease-out group-hover:scale-y-100 group-focus-visible:scale-y-100" />

      }
      {children}
    </Tag>);

}

export interface CardHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, description, icon, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-start gap-4 ${className}`}>
      {icon &&
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </span>
      }
      <div className="min-w-0">
        <h3 className="text-base font-semibold leading-6 text-slate-900">{title}</h3>
        {description && <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}
      </div>
    </div>);

}

export interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function CardBody({ children, className = '' }: CardBodyProps) {
  return <div className={`mt-4 text-sm leading-6 text-slate-600 ${className}`}>{children}</div>;
}

export interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function CardFooter({ children, className = '' }: CardFooterProps) {
  return (
    <div className={`mt-6 flex items-center gap-3 border-t border-slate-100 pt-4 ${className}`}>
      {children}
    </div>);

}