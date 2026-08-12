import { BriefcaseIcon, CheckIcon, LayersIcon, ShieldCheckIcon, type LucideIcon } from 'lucide-react';
import { Button } from '../components/Button';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';

const PLAN_TIERS = [
  {
    title: 'Basic',
    description: 'Core cover for a single asset.',
    icon: ShieldCheckIcon,
    features: [
      'One registered asset on your account',
      'Theft reporting from the mobile app',
      'GPS tracking hardware ready',
    ],
  },
  {
    title: 'Standard',
    description: 'Cover for multiple everyday assets.',
    icon: LayersIcon,
    features: [
      'Multiple phones, laptops and tablets',
      'GPS-assisted recovery coordination',
      'Security-company partner handoff',
    ],
  },
  {
    title: 'Premium',
    description: 'Broader cover, including business equipment.',
    icon: BriefcaseIcon,
    features: [
      'Business equipment and high-value items',
      'Broader asset category coverage',
      'Priority recovery coordination',
    ],
  },
] as const;

function PlanTierPanel({
  title,
  description,
  icon: Icon,
  features,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  features: readonly string[];
}) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-primary/15 shadow-elevated">
      <div className="bg-primary px-5 py-6 text-text-inverse">
        <div className="flex items-start gap-4">
          <span
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-gold-deep text-white shadow-md"
            aria-hidden="true"
          >
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h3 className="font-heading text-xl font-semibold tracking-tight">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-text-inverse-muted">{description}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-card px-5 py-6">
        <div className="rounded-xl border border-dashed border-accent-gold-deep/50 bg-white px-4 py-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
            Monthly pricing
          </p>
          <p className="mt-1 text-xl font-bold tracking-tight text-primary">Finalizing at launch</p>
          <p className="mt-1 text-xs text-text-secondary">Per registered asset · billed monthly</p>
        </div>

        <ul className="mt-6 flex flex-1 flex-col gap-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm leading-6 text-text-secondary">
              <CheckIcon
                className="mt-0.5 h-4 w-4 shrink-0 text-accent-gold-deep"
                strokeWidth={2.5}
                aria-hidden="true"
              />
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-primary/10 pt-4">
          <span className="inline-flex rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-inverse">
            Coming soon
          </span>
        </div>
      </div>
    </article>
  );
}

export function PlansSection({ onJoinWaitlist }: { onJoinWaitlist: () => void }) {
  return (
    <Section background="warm" id="plans" className="scroll-mt-20">
      <SectionHeading
        align="center"
        eyebrow="Plans"
        title="Plans for every asset type"
        subtitle="We're finalizing pricing. Join the waitlist and you'll be the first to see it — before anyone else."
      />

      <div className="mx-auto mt-10 grid max-w-6xl items-stretch gap-6 sm:grid-cols-3">
        {PLAN_TIERS.map((tier, index) => (
          <Reveal key={tier.title} delay={index * 0.06} className="h-full">
            <PlanTierPanel {...tier} />
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.18}>
        <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-4 rounded-2xl bg-primary px-6 py-6 text-center text-text-inverse sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-sm font-semibold">Be first to see pricing</p>
            <p className="mt-1 text-sm text-text-inverse-muted">
              One email when plans go live — no spam, no commitment today.
            </p>
          </div>
          <Button variant="ghost" size="md" onClick={onJoinWaitlist} className="shrink-0">
            Get Notified When Plans Launch
          </Button>
        </div>
      </Reveal>
    </Section>
  );
}
