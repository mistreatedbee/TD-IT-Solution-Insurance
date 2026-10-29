import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Section } from '../../components/Section';
import { Logo } from '../../components/Logo';
import { GlassCard } from '../../components/GlassCard';

/**
 * OB-17 screen 1 (onboarding/identity check) — the shared shell behind
 * login/signup/forgot-password/reset-password/email-verified/onboarding.
 * Restyled per
 * docs/organization/design-system/ob-17-glass-redesign-screens.md §1:
 * radial glass-gradient background + one glass hero card (radius-card-lg,
 * strong surface — this is one of the ratified hero/modal moments glass is
 * reserved for, not an ordinary content card). Visuals only — no route,
 * prop, or behavior change for any of this shell's existing consumers.
 */
export function MarketingAuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="font-glass bg-glass-gradient" style={{ backgroundImage: 'radial-gradient(ellipse 120% 60% at 50% -10%, var(--glass-bg-gradient-mid), var(--glass-bg-gradient-end) 70%)' }}>
      <Section spacing="compact" as="header">
        <div className="flex items-center justify-between">
          <Logo variant="full" tone="navy" size="lg" href="/" />
          <Link to="/" className="text-sm font-medium text-glass-text-secondary hover:text-glass-text-primary">
            Back to home
          </Link>
        </div>
      </Section>
      <Section width="narrow" className="pb-16 pt-8">
        <div className="mx-auto w-full max-w-md">
          <GlassCard tone="dark" radius="card-lg" padding="xl" interactive={false}>
            {children}
          </GlassCard>
        </div>
      </Section>
    </div>
  );
}
