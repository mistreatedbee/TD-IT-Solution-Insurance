import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';

const RECOVERY_STEPS = [
  {
    title: 'You report it.',
    description: "You'd flag the laptop as stolen in the app, in a couple of taps.",
  },
  {
    title: 'We coordinate.',
    description: "We'd notify our security-company partners and start working the case.",
  },
  {
    title: "You're kept in the loop.",
    description:
      "You'd get updates as things progress — recovery is best-effort and depends on tracking status and on-the-ground conditions, subject to policy terms, underwriting and claims assessment.",
  },
] as const;

export function WhatToExpectSection() {
  return (
    <Section background="white" className="scroll-mt-20">
      <div className="mx-auto max-w-2xl">
        <SectionHeading
          align="center"
          eyebrow="What to Expect"
          title="Here's what happens if your laptop is stolen"
          subtitle="This is how the product is designed to work — not a customer story, since we're pre-launch."
        />

        <ol className="mt-12">
          {RECOVERY_STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 0.08}>
              <li className="relative flex gap-5 pb-10 last:pb-0">
                {index < RECOVERY_STEPS.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-5 top-10 h-[calc(100%-2.5rem)] w-px bg-border"
                  />
                ) : null}

                <span
                  className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-accent-gold-deep bg-white text-sm font-semibold tabular-nums text-primary"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1 pt-1">
                  <h3 className="text-lg font-semibold text-text-primary">{step.title}</h3>
                  <p className="mt-2 text-base leading-relaxed text-text-secondary">{step.description}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}
