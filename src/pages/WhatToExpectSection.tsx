import {
  AlertTriangleIcon,
  CheckCircleIcon,
  PhoneCallIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { AssetBadge } from '../components/AssetBadge';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';

const RECOVERY_STEPS = [
  {
    step: 1,
    title: 'You report it.',
    description: "You'd flag the laptop as stolen in the app, in a couple of taps.",
    icon: AlertTriangleIcon,
    direction: 'left' as const,
    delay: 0,
  },
  {
    step: 2,
    title: 'We coordinate.',
    description: "We'd notify our security-company partners and start working the case.",
    icon: PhoneCallIcon,
    direction: 'right' as const,
    delay: 0.1,
  },
  {
    step: 3,
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
    <span
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-gold-tint text-primary ring-1 ring-accent-gold-deep/20"
      aria-hidden="true"
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function WhatToExpectSection() {
  return (
    <Section background="warm" className="relative scroll-mt-20 overflow-hidden">
      <div className="relative mx-auto max-w-3xl">
        <SectionHeading
          align="center"
          eyebrow="What to Expect"
          title="Here's what happens if your laptop is stolen"
          subtitle="This is how the product is designed to work — not a customer story, since we're pre-launch."
        />

        <Reveal delay={0.05}>
          <p className="mx-auto mt-6 flex max-w-md flex-wrap items-center justify-center gap-2 text-center text-sm text-text-secondary sm:justify-center">
            <AssetBadge type="laptop" size="sm" selected />
            <span>Example: a registered laptop reported stolen</span>
          </p>
        </Reveal>

        <div className="mt-10 flex flex-col gap-5">
          {RECOVERY_STEPS.map((step) => (
            <Reveal key={step.title} direction={step.direction} delay={step.delay}>
              <div
                className={`rounded-2xl border border-border bg-white p-5 shadow-resting sm:p-6 ${
                  step.direction === 'right' ? 'sm:ml-8' : 'sm:mr-8'
                }`}
              >
                <div
                  className={`flex items-start gap-5 ${
                    step.direction === 'right' ? 'sm:flex-row-reverse sm:text-right' : ''
                  }`}
                >
                  <IconTile icon={step.icon} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-gold-deep">
                      Step {step.step}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-text-primary">{step.title}</h3>
                    <p className="mt-2 text-base leading-relaxed text-text-secondary">{step.description}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Section>
  );
}
