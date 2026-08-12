import { BriefcaseIcon, CheckIcon, LayersIcon, ShieldCheckIcon, type LucideIcon } from 'lucide-react';
import { Card, CardBody, CardFooter, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';
import { ChevronMotif } from './ChevronMotif';

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

function PlanCard({
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
    <Card interactive={false} className="relative flex h-full flex-col">
      <ChevronMotif
        tone="navy"
        className="pointer-events-none absolute right-0 top-0 h-8 w-14 opacity-[0.06]"
      />
      <CardHeader
        title={title}
        description={description}
        icon={
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-gold-tint text-primary">
            <Icon className="h-5 w-5" />
          </span>
        }
      />
      <CardBody>
        <ul className="space-y-2.5">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-text-secondary">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary"
                aria-hidden="true"
              >
                <CheckIcon className="h-3 w-3" strokeWidth={3} />
              </span>
              {feature}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-text-secondary">
          Pricing finalizing at launch · per registered asset, billed monthly
        </p>
      </CardBody>
      <CardFooter className="mt-auto">
        <span className="text-sm font-medium text-text-secondary">Coming soon</span>
      </CardFooter>
    </Card>
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
            <PlanCard {...tier} />
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.18}>
        <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-4 rounded-2xl border border-border bg-white px-6 py-5 text-center shadow-resting sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-sm font-semibold text-text-primary">Be first to see pricing</p>
            <p className="mt-1 text-sm text-text-secondary">
              One email when plans go live — no spam, no commitment today.
            </p>
          </div>
          <Button variant="primary" size="md" onClick={onJoinWaitlist} className="shrink-0">
            Get Notified When Plans Launch
          </Button>
        </div>
      </Reveal>
    </Section>
  );
}
