import { Card, CardFooter, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';
import { ChevronMotif } from './ChevronMotif';

const PLAN_TIERS = [
  { title: 'Basic', description: 'Core cover for a single asset.' },
  { title: 'Standard', description: 'Cover for multiple everyday assets.' },
  { title: 'Premium', description: 'Broader cover, including business equipment.' },
] as const;

export function PlansSection({ onJoinWaitlist }: { onJoinWaitlist: () => void }) {
  return (
    <Section background="white" id="plans" className="scroll-mt-20">
      <SectionHeading
        align="center"
        eyebrow="Plans"
        title="Plans for every asset type"
        subtitle="We're finalizing pricing. Join the waitlist and you'll be the first to see it — before anyone else."
      />

      <div className="mx-auto mt-10 grid items-stretch gap-6 sm:grid-cols-3">
        {PLAN_TIERS.map((tier, index) => (
          <Reveal key={tier.title} delay={index * 0.05} className="h-full">
            <Card interactive={false} className="relative h-full">
              <ChevronMotif
                tone="navy"
                className="pointer-events-none absolute right-0 top-0 h-8 w-14 opacity-[0.06]"
              />
              <CardHeader title={tier.title} description={tier.description} />
              <CardFooter>
                <span className="text-sm text-text-secondary">Coming soon</span>
              </CardFooter>
            </Card>
          </Reveal>
        ))}
      </div>

      <div className="mt-8">
        <Button variant="secondary" size="md" onClick={onJoinWaitlist}>
          Get Notified When Plans Launch
        </Button>
      </div>
    </Section>
  );
}
