import React from 'react';

export type SectionHeadingAlign = 'left' | 'center';
export type SectionHeadingTone = 'light' | 'dark';
export type SectionHeadingSize = 'md' | 'lg';

export interface SectionHeadingProps {
  /** Small uppercase label rendered above the title */
  eyebrow?: string;
  /** Main section title */
  title: string;
  /** Supporting copy rendered below the title */
  subtitle?: string;
  /** Horizontal alignment of the block */
  align?: SectionHeadingAlign;
  /** Color tone, for light or dark section backgrounds */
  tone?: SectionHeadingTone;
  /** Visual scale of the title */
  size?: SectionHeadingSize;
  /** Heading level for correct document outline */
  as?: 'h1' | 'h2' | 'h3';
  /** Optional actions (buttons, links) aligned with the block */
  actions?: React.ReactNode;
  className?: string;
}

const titleSizes: Record<SectionHeadingSize, string> = {
  md: 'text-2xl sm:text-3xl',
  lg: 'text-3xl sm:text-4xl'
};

const subtitleSizes: Record<SectionHeadingSize, string> = {
  md: 'text-base',
  lg: 'text-lg'
};

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'left',
  tone = 'light',
  size = 'md',
  as: Heading = 'h2',
  actions,
  className = ''
}: SectionHeadingProps) {
  const isCenter = align === 'center';
  const isDark = tone === 'dark';

  return (
    <div
      className={[
      'flex w-full flex-col gap-6',
      isCenter ?
      'items-center text-center' :
      'items-start text-left sm:flex-row sm:items-end sm:justify-between',
      className].

      filter(Boolean).
      join(' ')}>
      
      <div
        className={[
        'flex flex-col',
        isCenter ? 'items-center max-w-2xl' : 'items-start max-w-2xl'].
        join(' ')}>
        
        {eyebrow ?
        <span
          className={[
          'text-xs font-semibold uppercase tracking-widest',
          isDark ? 'text-blue-300' : 'text-blue-600'].
          join(' ')}>
          
            {eyebrow}
          </span> :
        null}

        <Heading
          className={[
          'font-semibold tracking-tight',
          eyebrow ? 'mt-3' : '',
          titleSizes[size],
          isDark ? 'text-white' : 'text-slate-900'].

          filter(Boolean).
          join(' ')}>
          
          {title}
        </Heading>

        {subtitle ?
        <p
          className={[
          'mt-3 leading-relaxed',
          subtitleSizes[size],
          isDark ? 'text-slate-300' : 'text-slate-600'].
          join(' ')}>
          
            {subtitle}
          </p> :
        null}
      </div>

      {actions ?
      <div className="flex shrink-0 flex-wrap items-center gap-3">
          {actions}
        </div> :
      null}
    </div>);

}