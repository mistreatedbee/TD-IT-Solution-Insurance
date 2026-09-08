import type { ReactNode } from 'react';
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
}

/** Elevated white surface for grouped account/profile content. */
export function CustomerSurfaceGroup({
  children,
  className = '',
  padded = false,
}: CustomerSurfaceGroupProps) {
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
