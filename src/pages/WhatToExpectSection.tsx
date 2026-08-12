import {
  AlertTriangleIcon,
  CheckCircleIcon,
  PhoneCallIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';

const RECOVERY_STEPS = [
  {
    title: 'You report it.',
    description: "You'd flag the laptop as stolen in the app, in a couple of taps.",
    icon: AlertTriangleIcon,
    direction: 'left' as const,
    delay: 0,
  },
  {
    title: 'We coordinate.',
    description: "We'd notify our security-company partners and start working the case.",
    icon: PhoneCallIcon,
    direction: 'right' as const,
    delay: 0.1,
  },
  {
    title: "You're kept in the loop.",
    description:
      "You'd get updates as things progress — recovery is best-effort and depends on tracking status and on-the-ground conditions, subject to policy terms, underwriting and claims assessment.",
    icon: CheckCircleIcon,
    direction: 'left' as const,
    delay: 0.2,
  },
] as const;

function IconTile({ icon: Icon }: { icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
      <Icon className="h-5 w-5" />
    </div>
  );
}

export function WhatToExpectSection() {
  return (
    <Section background="warm" className="relative overflow-hidden scroll-mt-20">
      <div className="relative mx-auto max-w-3xl">
        <SectionHeading
          align="center"
          eyebrow="What to Expect"
          title="Here's what happens if your laptop is stolen"
          subtitle="This is how the product is designed to work — not a customer story, since we're pre-launch."
        />

        <div className="mt-12 flex flex-col gap-8">
          {RECOVERY_STEPS.map((step) => (
            <Reveal key={step.title} direction={step.direction} delay={step.delay}>
              <div
                className={`flex items-start gap-6 ${
                  step.direction === 'right' ? 'sm:flex-row-reverse sm:text-right' : ''
                }`}
              >
                <IconTile icon={step.icon} />
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">{step.title}</h3>
                  <p className="mt-2 text-base text-text-secondary">{step.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}
