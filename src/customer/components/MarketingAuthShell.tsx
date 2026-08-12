import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Section } from '../../components/Section';
import { Logo } from '../../components/Logo';
import { Card } from '../../components/Card';

export function MarketingAuthShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Section spacing="compact" as="header">
        <div className="flex items-center justify-between">
          <Logo variant="full" tone="navy" size="lg" href="/" />
          <Link to="/" className="text-sm font-medium text-text-secondary hover:text-text-primary">
            Back to home
          </Link>
        </div>
      </Section>
      <Section width="narrow" className="pb-16 pt-8">
        <div className="mx-auto w-full max-w-md">
          <Card padding="lg" interactive={false}>
            {children}
          </Card>
        </div>
      </Section>
    </>
  );
}
