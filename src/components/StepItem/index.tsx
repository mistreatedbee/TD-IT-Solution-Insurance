import React from 'react';
import { motion } from 'framer-motion';

export type StepItemOrientation = 'horizontal' | 'vertical';

export interface StepItemProps {
  /** Step position in the timeline, rendered as the large watermark numeral. */
  step: number;
  /** Short step title. */
  title: string;
  /** Supporting copy explaining the step. */
  description: string;
  /** Optional icon rendered above the title. */
  icon?: React.ReactNode;
  /** Hide the dashed connector — use on the last step. */
  isLast?: boolean;
  /** Marks the step as the active/current one. */
  isActive?: boolean;
  /** Connector direction. Horizontal is the default 4-across timeline. */
  orientation?: StepItemOrientation;
  /** Stagger delay (seconds) for the entrance animation. */
  delay?: number;
  className?: string;
}

export function StepItem({
  step,
  title,
  description,
  icon,
  isLast = false,
  isActive = false,
  orientation = 'horizontal',
  delay = 0,
  className = ''
}: StepItemProps) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <motion.li
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.6, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={`relative flex-1 ${isHorizontal ? 'pb-0' : 'pl-0'} ${className}`}>
      
      {/* Watermark numeral */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -top-4 left-0 select-none font-heading text-[80px] font-bold leading-none tracking-tight sm:text-[96px] ${
        isActive ? 'text-secondary/20' : 'text-card-elevated/70'}`
        }>
        
        {step}
      </span>

      <div className="relative pl-6 pt-8 sm:pl-8 sm:pt-10">
        {icon ?
        <div
          className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-button)] ${
          isActive ?
          'bg-secondary text-secondary-foreground' :
          'bg-card text-primary'}`
          }>
          
            {icon}
          </div> :
        null}

        <p className="mb-2 font-body text-xs font-semibold uppercase tracking-[0.14em] text-secondary">
          Step {step}
        </p>
        <h3 className="font-heading text-lg font-semibold leading-snug text-text-primary sm:text-xl">
          {title}
        </h3>
        <p className="mt-2 max-w-xs font-body text-sm leading-relaxed text-text-secondary">
          {description}
        </p>
      </div>

      {!isLast ?
      <span
        aria-hidden="true"
        className={
        isHorizontal ?
        'absolute right-0 top-14 hidden h-px w-16 translate-x-1/2 overflow-hidden lg:block' :
        'absolute bottom-0 left-3 h-10 w-px translate-y-full overflow-hidden'
        }>
        
          <motion.span
          className={`block ${isHorizontal ? 'h-px w-full' : 'h-full w-px'}`}
          style={{
            backgroundImage: isHorizontal ?
            'repeating-linear-gradient(to right, var(--secondary) 0 6px, transparent 6px 12px)' :
            'repeating-linear-gradient(to bottom, var(--secondary) 0 6px, transparent 6px 12px)',
            backgroundSize: isHorizontal ? '12px 1px' : '1px 12px',
            opacity: 0.5
          }}
          animate={{
            backgroundPositionX: isHorizontal ? ['0px', '12px'] : undefined,
            backgroundPositionY: isHorizontal ? undefined : ['0px', '12px']
          }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
        
        </span> :
      null}
    </motion.li>);

}