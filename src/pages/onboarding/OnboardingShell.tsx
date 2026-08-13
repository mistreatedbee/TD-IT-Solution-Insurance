import type { ReactNode } from 'react';
import { LandingHeader } from '../LandingHeader';
import { Section } from '../../components/Section';

export function OnboardingShell({ children }: { children: ReactNode }) {
  return (
    <>
      <LandingHeader />
      <Section background="warm" width="default" className="min-h-[70vh] pb-20 pt-10">
        <div className="mx-auto max-w-3xl">{children}</div>
      </Section>
    </>
  );
}
