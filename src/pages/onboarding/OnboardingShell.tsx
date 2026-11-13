import type { ReactNode } from 'react';
import { MarketingAuthShell } from '../../customer/components/MarketingAuthShell';

/**
 * Onboarding wizard chrome. Design System R5.1: the same TdBackdrop "dots"
 * ground + solid form card as the other auth pages, just wider for the plan
 * and asset grids. The marketing LandingHeader is no longer mounted here (it
 * belongs to the marketing site, which is restyled in a later round).
 */
export function OnboardingShell({ children }: { children: ReactNode }) {
  return <MarketingAuthShell wide>{children}</MarketingAuthShell>;
}
