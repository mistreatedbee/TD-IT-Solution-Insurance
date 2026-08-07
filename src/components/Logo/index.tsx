import React from 'react';

export type LogoSize = 'sm' | 'md' | 'lg';
export type LogoVariant = 'full' | 'glyph' | 'wordmark';
export type LogoTone = 'navy' | 'light';

export interface LogoProps {
  /** Which parts of the mark to render. */
  variant?: LogoVariant;
  /** Overall scale of the mark. */
  size?: LogoSize;
  /** Color treatment — navy for light backgrounds, light for navy backgrounds. */
  tone?: LogoTone;
  /** Optional href — renders the mark as a link when provided. */
  href?: string;
  /** Accessible label for the mark. */
  label?: string;
  className?: string;
}

const GLYPH_SIZE: Record<LogoSize, string> = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-11 w-11'
};

const PRIMARY_TEXT: Record<LogoSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl'
};

const SECONDARY_TEXT: Record<LogoSize, string> = {
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm'
};

const GAP: Record<LogoSize, string> = {
  sm: 'gap-2',
  md: 'gap-2.5',
  lg: 'gap-3'
};

export function LogoGlyph({
  className = '',
  tone = 'navy'



}: {className?: string;tone?: LogoTone;}) {
  const stroke = tone === 'navy' ? '#0B2A4A' : '#FFFFFF';
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}>
      
      <path
        d="M16 2.5 27.5 6.5v9.2c0 6.9-4.7 12-11.5 13.8C9.2 27.7 4.5 22.6 4.5 15.7V6.5L16 2.5Z"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round" />
      
      <path
        d="M12.5 15.5v-2.2a3.5 3.5 0 1 1 7 0v2.2"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round" />
      
      <rect
        x="11"
        y="15.5"
        width="10"
        height="7.5"
        rx="1.5"
        stroke={stroke}
        strokeWidth="2" />
      
    </svg>);

}

export function Logo({
  variant = 'full',
  size = 'md',
  tone = 'navy',
  href,
  label = 'TD IT Solution Insurance',
  className = ''
}: LogoProps) {
  const textColor = tone === 'navy' ? 'text-[#0B2A4A]' : 'text-white';
  const subColor = tone === 'navy' ? 'text-[#5A7492]' : 'text-white/70';

  const content =
  <span
    className={`inline-flex items-center ${GAP[size]} ${
    href ? 'transition-opacity hover:opacity-80' : ''} ${
    className}`}>
    
      {variant !== 'wordmark' &&
    <LogoGlyph tone={tone} className={GLYPH_SIZE[size]} />
    }
      {variant !== 'glyph' &&
    <span className="flex flex-col leading-none">
          <span
        className={`font-semibold tracking-tight ${PRIMARY_TEXT[size]} ${textColor}`}>
        
            TD IT Solution
          </span>
          <span
        className={`mt-1 font-medium uppercase tracking-[0.18em] ${SECONDARY_TEXT[size]} ${subColor}`}>
        
            Insurance
          </span>
        </span>
    }
    </span>;


  if (href) {
    return (
      <a
        href={href}
        aria-label={label}
        className="inline-flex rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B2A4A] focus-visible:ring-offset-2">
        
        {content}
      </a>);

  }

  return (
    <span role="img" aria-label={label}>
      {content}
    </span>);

}