import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';

export type RevealDirection = 'up' | 'down' | 'left' | 'right' | 'none';

export interface RevealProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  /** Content to reveal once scrolled into view. */
  children: React.ReactNode;
  /** Direction the content travels from. Defaults to 'up'. */
  direction?: RevealDirection;
  /** Travel distance in pixels. Defaults to 24. */
  distance?: number;
  /** Delay before the animation starts, in seconds. Defaults to 0. */
  delay?: number;
  /** Animation duration in seconds. Defaults to 0.6. */
  duration?: number;
  /** Replay the animation every time the element re-enters the viewport. */
  repeat?: boolean;
  /** How much of the element must be visible before revealing (0–1). Defaults to 0.2. */
  amount?: number;
  /** Render a different underlying element (e.g. 'section', 'li'). Defaults to 'div'. */
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}

// react-refresh/only-export-components: intentionally left as a warning.
// `getRevealOffset` is a small pure helper tightly coupled to `Reveal`'s
// direction/distance props; it's not useful without the component.
export function getRevealOffset(
direction: RevealDirection,
distance: number)
: {x: number;y: number;} {
  switch (direction) {
    case 'up':
      return { x: 0, y: distance };
    case 'down':
      return { x: 0, y: -distance };
    case 'left':
      return { x: distance, y: 0 };
    case 'right':
      return { x: -distance, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

export function Reveal({
  children,
  direction = 'up',
  distance = 24,
  delay = 0,
  duration = 0.6,
  repeat = false,
  amount = 0.2,
  as = 'div',
  className,
  ...rest
}: RevealProps) {
  const prefersReducedMotion = useReducedMotion();
  const offset = getRevealOffset(direction, distance);
  const MotionTag = motion[as as 'div'] as typeof motion.div;

  if (prefersReducedMotion) {
    const Tag = as as 'div';
    return (
      <Tag className={className}>{children}</Tag>);

  }

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, x: offset.x, y: offset.y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: !repeat, amount }}
      transition={{
        duration,
        delay,
        ease: [0.22, 1, 0.36, 1]
      }}
      {...rest}>
      
      {children}
    </MotionTag>);

}