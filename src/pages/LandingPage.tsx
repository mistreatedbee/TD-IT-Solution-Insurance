import {
  ClipboardCheckIcon,
  LaptopIcon,
  ShieldCheckIcon,
  MapPinIcon,
  AlertTriangleIcon,
  PhoneCallIcon,
  CheckCircleIcon
} from 'lucide-react';
import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';
import { FeatureCard } from '../components/FeatureCard';
import { StepItem } from '../components/StepItem';
import { Card, CardHeader, CardFooter } from '../components/Card';
import { Button } from '../components/Button';
import { ArrowLink } from '../components/ArrowLink';
import { Reveal } from '../components/Reveal';
import { Logo } from '../components/Logo';
import { AssetBadge, type AssetType } from '../components/AssetBadge';
import { WaitlistForm } from './WaitlistForm';
import {
  Accordion,
  AccordionItem
} from '../components/Accordion';

const ASSET_TYPES: AssetType[] = ['vehicle', 'laptop', 'phone', 'tablet', 'tv', 'desktop', 'business', 'other'];

function scrollToWaitlist() {
  document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Move focus to the email field once it's in view so keyboard/screen-reader
  // users land in the form, not just visually near it.
  window.setTimeout(() => {
    document.getElementById('waitlist-email')?.focus();
  }, 400);
}

export function LandingPage() {
  return (
    <>
      {/* Header chrome — not one of the 9 numbered sections */}
      <Section spacing="compact" as="header">
        <div className="flex items-center justify-between">
          <Logo variant="full" tone="navy" href="/" />
        </div>
      </Section>

      {/* 1. Hero */}
      <Section spacing="default" width="wide">
        <Reveal>
          <div className="max-w-2xl">
            <SectionHeading
              as="h1"
              size="lg"
              eyebrow="Asset insurance, built for recovery"
              title="Insurance that helps you get your stuff back."
              subtitle="TD IT Solution Insurance covers your vehicles, laptops, phones, tablets, TVs, desktops and business equipment — and works with GPS-assisted recovery and security-company partners when something is lost or stolen. Cover is subject to policy terms, underwriting and claims assessment."
            />
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Button variant="primary" size="lg" fullWidth onClick={scrollToWaitlist} className="sm:w-auto">
                Get Notified
              </Button>
              <ArrowLink href="#how-it-works" tone="default">
                See how it works
              </ArrowLink>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* 2. How It Works */}
      <Section background="warm" id="how-it-works">
        <SectionHeading
          eyebrow="How It Works"
          title="Three steps, from sign-up to recovery"
          subtitle="Here's the model we're building — clearly, so you know exactly what you're signing up for."
        />
        <ol className="mt-10 flex flex-col gap-12 lg:flex-row lg:gap-6">
          <StepItem
            step={1}
            title="Subscribe to a plan"
            description="Choose a plan that fits what you want covered."
            icon={<ClipboardCheckIcon className="h-5 w-5" />}
            orientation="horizontal"
            delay={0}
          />
          <StepItem
            step={2}
            title="Register your assets"
            description="Add the vehicles, devices and equipment you want protected."
            icon={<LaptopIcon className="h-5 w-5" />}
            orientation="horizontal"
            delay={0.1}
          />
          <StepItem
            step={3}
            title="GPS-assisted recovery"
            description="If something's lost or stolen, we work with our security-company partners to try to recover it. Recovery is best-effort and depends on the asset's tracking status and on-the-ground conditions — subject to policy terms, underwriting and claims assessment."
            icon={<ShieldCheckIcon className="h-5 w-5" />}
            orientation="horizontal"
            isLast
            delay={0.2}
          />
        </ol>
      </Section>

      {/* 3. Asset Types Covered */}
      <Section background="white">
        <SectionHeading
          eyebrow="What's Covered"
          title="Cover for the assets you actually own"
          subtitle="From the car in your driveway to the laptop on your desk. Cover is subject to policy terms, underwriting and claims assessment."
        />
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ASSET_TYPES.map((type, i) => (
            <Reveal key={type} delay={i * 0.05}>
              <AssetBadge type={type} size="md" />
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 4. Trust / Credibility */}
      <Section background="warm">
        <SectionHeading
          eyebrow="Why Trust Us"
          title="Built to be transparent about what's live and what's coming"
          subtitle="We'd rather tell you exactly where we are than oversell it."
        />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Reveal>
            <FeatureCard
              icon={ShieldCheckIcon}
              title="Licensed insurer"
              description="TD IT Solution Insurance is the underwriter — not a broker or a platform placing your business with someone else. Full regulatory details are in the footer of every page."
              align="left"
            />
          </Reveal>
          <Reveal delay={0.08}>
            <FeatureCard
              icon={MapPinIcon}
              title="GPS-assisted recovery, coordinated with security-company partners"
              description="When you report an asset stolen, we work with security-company partners to try to recover it. This is best-effort, not a guarantee — recovery depends on tracking status and on-the-ground conditions."
              align="left"
            />
          </Reveal>
        </div>
        <p className="mt-8 text-base text-text-secondary">
          We only collect what we need, and we handle personal information under South African
          data protection law (POPIA). See our{' '}
          <ArrowLink href="/privacy" size="sm">
            Privacy Policy
          </ArrowLink>{' '}
          for details.
        </p>
      </Section>

      {/* 5. Pricing / Plans Teaser */}
      <Section background="white">
        <SectionHeading
          eyebrow="Plans"
          title="Plans for every asset type"
          subtitle="We're finalizing pricing. Join the waitlist and you'll be the first to see it — before anyone else."
        />
        <div className="mt-10 grid items-stretch gap-6 sm:grid-cols-3">
          <Reveal>
            <Card interactive={false} className="h-full">
              <CardHeader title="Basic" description="Core cover for a single asset." />
              <CardFooter>
                <span className="text-sm text-text-secondary">Coming soon</span>
              </CardFooter>
            </Card>
          </Reveal>
          <Reveal delay={0.06}>
            <Card interactive={false} className="h-full">
              <CardHeader title="Standard" description="Cover for multiple everyday assets." />
              <CardFooter>
                <span className="text-sm text-text-secondary">Coming soon</span>
              </CardFooter>
            </Card>
          </Reveal>
          <Reveal delay={0.12}>
            <Card interactive={false} className="h-full">
              <CardHeader title="Premium" description="Broader cover, including business equipment." />
              <CardFooter>
                <span className="text-sm text-text-secondary">Coming soon</span>
              </CardFooter>
            </Card>
          </Reveal>
        </div>
        <div className="mt-8">
          <Button variant="secondary" size="md" onClick={scrollToWaitlist}>
            Get Notified When Plans Launch
          </Button>
        </div>
      </Section>

      {/* 6. What to Expect (testimonials placeholder, Option B) */}
      <Section background="warm">
        <SectionHeading
          eyebrow="What to Expect"
          title="Here's what happens if your laptop is stolen"
          subtitle="This is how the product is designed to work — not a customer story, since we're pre-launch."
        />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <Reveal>
            <Card interactive={false} className="h-full">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <AlertTriangleIcon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">You report it.</h3>
              <p className="mt-2 text-base text-text-secondary">
                You'd flag the laptop as stolen in the app, in a couple of taps.
              </p>
            </Card>
          </Reveal>
          <Reveal delay={0.08}>
            <Card interactive={false} className="h-full">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <PhoneCallIcon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">We coordinate.</h3>
              <p className="mt-2 text-base text-text-secondary">
                We'd notify our security-company partners and start working the case.
              </p>
            </Card>
          </Reveal>
          <Reveal delay={0.16}>
            <Card interactive={false} className="h-full">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                <CheckCircleIcon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary">You're kept in the loop.</h3>
              <p className="mt-2 text-base text-text-secondary">
                You'd get updates as things progress — recovery is best-effort and depends on
                tracking status and on-the-ground conditions, subject to policy terms,
                underwriting and claims assessment.
              </p>
            </Card>
          </Reveal>
        </div>
      </Section>

      {/* 7. FAQ */}
      <Section background="white" width="default">
        <SectionHeading eyebrow="Questions" title="Frequently asked questions" />
        <div className="mt-10">
          <Reveal>
            <Accordion allowMultiple={false} defaultOpen={[]}>
              <AccordionItem value="covered" title="What does TD IT Solution Insurance cover?">
                Vehicles, laptops, smartphones, tablets, TVs, desktop computers, business
                equipment and other electronics. Cover is subject to policy terms, underwriting
                and claims assessment — full policy wording is available at signup.
              </AccordionItem>
              <AccordionItem value="recovery" title="What affects whether my asset is recovered?">
                Recovery is best-effort, coordinated with security-company partners, and depends
                on things like whether the asset's tracking hardware is active, its signal/power
                state, and on-the-ground conditions at the time. It isn't guaranteed — no insurer
                can promise that.
              </AccordionItem>
              <AccordionItem value="cancel" title="Can I cancel any time?">
                We're finalizing the exact cancellation terms for launch — they'll be set out in
                full in your policy documents. Join the waitlist and we'll make sure you see them
                before you commit to anything.
              </AccordionItem>
              <AccordionItem value="gps" title="How does GPS-assisted recovery actually work?">
                The model: your asset has GPS tracking hardware, and if it's reported lost or
                stolen, we work with security-company partners to try to locate and recover it.
                This is a coordinated, best-effort process, not real-time live tracking you can
                watch yourself today.
              </AccordionItem>
              <AccordionItem value="privacy" title="How do you handle my personal information?">
                We collect only what we need, for the purpose we tell you about at the time — for
                example, just an email address for the waitlist. We handle personal information
                under POPIA. Full details are in our Privacy Policy.
              </AccordionItem>
            </Accordion>
          </Reveal>
        </div>
      </Section>

      {/* 8. Final CTA */}
      <Section background="warm" id="waitlist">
        <SectionHeading
          align="center"
          eyebrow="Join the Waitlist"
          title="Be first to know when we launch"
          subtitle="Get notified the moment TD IT Solution Insurance opens up — no spam, ever."
        />
        <div className="mx-auto mt-10 max-w-xl">
          <Reveal>
            <WaitlistForm />
          </Reveal>
        </div>
      </Section>

      {/* 9. Footer */}
      <Section as="footer" spacing="default" background="navy" className="text-text-inverse">
        <h2 id="footer-heading" className="sr-only">
          Site footer
        </h2>
        <div className="grid gap-10 lg:grid-cols-4">
          {/* Column A — Brand */}
          <div>
            <Logo tone="light" size="lg" label="TD IT Solution Insurance" />
            <p className="mt-4 text-sm text-text-inverse-muted">
              Insurance for the things you can't afford to lose.
            </p>
          </div>

          {/* Column B — Company / Legal (compliance-mandated disclosure block) */}
          <div className="text-sm text-text-inverse-muted">
            <p>
              [REGISTERED ENTITY NAME — pending] (Pty) Ltd, trading as{' '}
              <span className="text-text-inverse">TD IT Solution Insurance</span>
            </p>
            <p className="mt-2">Reg. No. [COMPANY REG NO — pending]</p>
            <p className="mt-2">
              TD IT Solution Insurance is a licensed non-life insurer in terms of the Insurance
              Act 18 of 2017. [INSURER LICENCE — pending confirmation]
            </p>
            <p className="mt-2">
              Authorised financial services provider, FSP No. [FSP NUMBER — pending]
            </p>
          </div>

          {/* Column C — Contact */}
          <div className="text-sm text-text-inverse-muted">
            <p>[REGISTERED ADDRESS — pending]</p>
            <p className="mt-2">[SUPPORT EMAIL — pending]</p>
          </div>

          {/* Column D — Legal & Complaints */}
          <div className="text-sm text-text-inverse-muted">
            <div className="flex flex-col gap-2">
              <ArrowLink tone="inverse" href="/privacy" size="sm">
                Privacy Policy
              </ArrowLink>
              <ArrowLink tone="inverse" href="/terms" size="sm">
                Terms of Service
              </ArrowLink>
            </div>
            <p className="mt-4">
              Not happy with something? Contact us at [SUPPORT EMAIL — pending] first. If we
              can't resolve it, you can escalate to the{' '}
              [OMBUD FOR SHORT-TERM INSURANCE — pending].
            </p>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-sm text-text-inverse-muted">
          © {new Date().getFullYear()} TD IT Solution Insurance. All rights reserved.
        </div>
      </Section>
    </>
  );
}
