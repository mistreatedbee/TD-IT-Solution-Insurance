import type { ReactNode } from 'react';
import { GlassCard } from '../../components/GlassCard';
import {
  customerHairlineDivider,
  customerSectionLabel,
  customerSurfaceGroup,
  customerSurfacePadding,
} from '../styles/surfaces';

export interface CustomerSurfaceGroupProps {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  /**
   * OB-17: `hero` renders as a translucent `GlassCard` (radius-card-lg,
   * strong surface) instead of the default flat-white-with-shadow group.
   * Reserve for the one profile-header moment per
   * ob-17-glass-redesign-screens.md §8 — ordinary settings-row groups stay
   * `flat` (default), per the ratified hero/header/modal-only blur scope.
   */
  variant?: 'flat' | 'hero';
}

/** Grouped account/profile content surface. `flat` (default) is an
 * elevated flat-white panel; `hero` is the OB-17 glass header treatment. */
export function CustomerSurfaceGroup({
  children,
  className = '',
  padded = false,
  variant = 'flat',
}: CustomerSurfaceGroupProps) {
  if (variant === 'hero') {
    return (
      <GlassCard tone="dark" radius="card-lg" padding={padded ? 'xl' : 'none'} interactive={false} className={className}>
        {children}
      </GlassCard>
    );
  }

  return (
    <div
      className={[customerSurfaceGroup, padded ? customerSurfacePadding : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

export function CustomerInsetDivider({ className = '' }: { className?: string }) {
  return <div className={[customerHairlineDivider, className].filter(Boolean).join(' ')} aria-hidden />;
}

export interface CustomerScreenSectionProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/** Section with uppercase label above grouped content. */
export function CustomerScreenSection({ title, children, className = '' }: CustomerScreenSectionProps) {
  return (
    <section className={className}>
      <h3 className={customerSectionLabel}>{title}</h3>
      {children}
    </section>
  );
}
