import { CrownIcon, LayersIcon, ShieldCheckIcon } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';
import { ChevronMotif } from './ChevronMotif';
import { PlanTierCard } from './PlanTierCard';

const PLAN_TIERS = [
  {
    name: 'Basic',
    tagline: 'Core cover for a single asset.',
    icon: ShieldCheckIcon,
    features: [
      'One registered asset on your account',
      'Theft reporting from the mobile app',
      'GPS tracking hardware ready',
    ] as const,
    featured: false,
  },
  {
    name: 'Standard',
    tagline: 'Cover for multiple everyday assets.',
    icon: LayersIcon,
    features: [
      'Multiple phones, laptops and tablets',
      'GPS-assisted recovery coordination',
      'Security-company partner handoff',
    ] as const,
    featured: true,
    badge: 'Most popular',
  },
  {
    name: 'Premium',
    tagline: 'Broader cover, including business equipment.',
    icon: CrownIcon,
    features: [
      'Business equipment and high-value items',
      'Broader asset category coverage',
      'Priority recovery coordination',
    ] as const,
    featured: false,
  },
] as const;

export function PlansSection({ onJoinWaitlist }: { onJoinWaitlist: () => void }) {
  return (
    <Section background="warm" id="plans" className="relative overflow-hidden">
      <ChevronMotif
        tone="gold"
        className="pointer-events-none absolute -left-24 top-20 hidden h-28 w-48 rotate-[-8deg] opacity-[0.06] lg:block"
      />
      <ChevronMotif
        tone="navy"
        className="pointer-events-none absolute -right-20 bottom-16 hidden h-24 w-40 rotate-12 opacity-[0.05] lg:block"
      />

      <div className="relative">
        <div className="flex flex-col items-center text-center">
          <Badge tone="gold" size="md">
            Flexible monthly cover
          </Badge>
          <SectionHeading
            align="center"
            eyebrow="Plans"
            title="Simple monthly plans per asset"
            subtitle="Pay monthly for each appliance or device you register with us. We're finalizing tier pricing — join the waitlist to see plans first."
            className="mt-4 !items-center !text-center [&>div:first-child]:!items-center [&>div:first-child]:!text-center"
          />
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl items-end gap-6 lg:grid-cols-3 lg:gap-5">
          {PLAN_TIERS.map((tier, index) => (
            <Reveal key={tier.name} delay={index * 0.08} className="h-full">
              <PlanTierCard
                name={tier.name}
                tagline={tier.tagline}
                icon={tier.icon}
                features={tier.features}
                featured={tier.featured}
                badge={'badge' in tier ? tier.badge : undefined}
                onNotify={onJoinWaitlist}
              />
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2}>
          <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-4 rounded-2xl border border-slate-200/80 bg-white/90 px-6 py-5 text-center shadow-sm backdrop-blur-sm sm:flex-row sm:justify-between sm:text-left">
            <div>
              <p className="text-sm font-semibold text-text-primary">Want pricing as soon as it drops?</p>
              <p className="mt-1 text-sm text-text-secondary">
                Join the waitlist — one email when plans go live, no spam.
              </p>
            </div>
            <Button variant="primary" size="md" onClick={onJoinWaitlist} className="shrink-0">
              Get Notified When Plans Launch
            </Button>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
