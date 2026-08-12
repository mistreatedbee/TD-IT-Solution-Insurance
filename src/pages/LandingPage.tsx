import {
  ClipboardCheckIcon,
  LaptopIcon,
  ShieldCheckIcon,
  MapPinIcon,
  AlertTriangleIcon,
  PhoneCallIcon,
  CheckCircleIcon
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
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
import { ChevronMotif, ChevronDivider } from './ChevronMotif';
import { COMPANY_CONTACT } from '../lib/companyContact';
import {
  Accordion,
  AccordionItem
} from '../components/Accordion';

// The two highest-value/most-differentiating categories (vehicle = biggest-
// ticket asset; business = the category that must not read as an
// afterthought) are rendered larger (col-span-2) and separately below;
// this list drives the six standard-size badges in between.
const STANDARD_ASSET_TYPES: AssetType[] = ['laptop', 'phone', 'tablet', 'tv', 'desktop', 'other'];

function scrollToWaitlist() {
  document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Move focus to the email field once it's in view so keyboard/screen-reader
  // users land in the form, not just visually near it.
  window.setTimeout(() => {
    document.getElementById('waitlist-email')?.focus();
  }, 400);
}

/** Small icon tile used in the "What to Expect" alternating rows (§6). Not
 * a new component — this is the same inline markup previously used inline
 * in this file, extracted as a local fragment for readability only. */
function IconTile({ icon: Icon }: {icon: ComponentType<{className?: string;}>;}) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
      <Icon className="h-5 w-5" />
    </div>
  );
}

export function LandingPage() {
  return (
    <>
      {/* Header chrome — not one of the 9 numbered sections */}
      <Section spacing="compact" as="header">
        <div className="flex items-center justify-between gap-4">
          <Logo variant="full" tone="navy" size="lg" href="/" />
          <nav className="flex shrink-0 items-center gap-2 sm:gap-3" aria-label="Account">
            <Link to="/login">
              <Button variant="secondary" size="sm">
                Log in
              </Button>
            </Link>
            <Link to="/signup">
              <Button variant="primary" size="sm">
                Sign up
              </Button>
            </Link>
          </nav>
        </div>
      </Section>

      {/* 1. Hero — asymmetric split: copy left, chevron motif field right */}
      <Section spacing="none" width="full" bleed className="relative overflow-hidden bg-white">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-8 lg:px-8 lg:pb-28 lg:pt-24">
          {/* Left: copy column, unchanged content/copy from ui-design.md §1 */}
          <Reveal direction="left" distance={32}>
            <div className="max-w-xl">
              <Logo
                tone="navy"
                size="xl"
                className="mb-6 lg:hidden"
                label="TD IT Solution Insurance"
              />
              <SectionHeading
                as="h1"
                size="lg"
                align="left"
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

          {/* Right: brand logo at hero scale (desktop) */}
          <Reveal
            direction="right"
            delay={0.1}
            distance={32}
            className="relative hidden lg:flex lg:items-center lg:justify-center"
          >
            <Logo
              tone="navy"
              imageClassName="h-auto max-h-[min(420px,45vh)] w-full max-w-md object-contain"
              label="TD IT Solution Insurance"
            />
          </Reveal>
        </div>
      </Section>

      {/* 2. How It Works — full-bleed navy band, first rhythm break */}
      <Section background="navy" id="how-it-works" className="relative overflow-hidden text-text-inverse">
        <ChevronDivider tone="gold" className="absolute -top-px left-1/2 -translate-x-1/2" />
        <SectionHeading
          tone="dark"
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
            tone="dark"
            delay={0}
          />
          <StepItem
            step={2}
            title="Register your assets"
            description="Add the vehicles, devices and equipment you want protected."
            icon={<LaptopIcon className="h-5 w-5" />}
            orientation="horizontal"
            tone="dark"
            delay={0.12}
          />
          <StepItem
            step={3}
            title="GPS-assisted recovery"
            description="If something's lost or stolen, we work with our security-company partners to try to recover it. Recovery is best-effort and depends on the asset's tracking status and on-the-ground conditions — subject to policy terms, underwriting and claims assessment."
            icon={<ShieldCheckIcon className="h-5 w-5" />}
            orientation="horizontal"
            tone="dark"
            isLast
            delay={0.24}
          />
        </ol>
      </Section>

      {/* 3. Asset Types Covered — staggered/uneven grid */}
      <Section background="white">
        <SectionHeading
          eyebrow="What's Covered"
          title="Cover for the assets you actually own"
          subtitle="From the car in your driveway to the laptop on your desk. Cover is subject to policy terms, underwriting and claims assessment."
        />
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {/* vehicle + business are emphasized (2-col span, small chevron
              corner accent) — everything else is a standard 1-col badge. */}
          <Reveal className="relative col-span-2" delay={0}>
            <ChevronMotif tone="gold" className="pointer-events-none absolute -right-2 -top-2 h-6 w-10 opacity-10" />
            <AssetBadge type="vehicle" size="md" className="h-full" />
          </Reveal>
          {STANDARD_ASSET_TYPES.slice(0, 5).map((type, i) => (
            <Reveal key={type} delay={0.05 + i * 0.05}>
              <AssetBadge type={type} size="md" />
            </Reveal>
          ))}
          <Reveal className="relative col-span-2" delay={0.3}>
            <ChevronMotif tone="gold" className="pointer-events-none absolute -right-2 -top-2 h-6 w-10 opacity-10" />
            <AssetBadge type="business" size="md" className="h-full" />
          </Reveal>
          <Reveal delay={0.35}>
            <AssetBadge type={STANDARD_ASSET_TYPES[5]} size="md" />
          </Reveal>
        </div>
      </Section>

      {/* 4. Trust / Credibility — two-column asymmetric */}
      <Section background="warm">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <Reveal direction="left">
            <SectionHeading
              align="left"
              eyebrow="Why Trust Us"
              title="Recovery-first protection, built in Nelspruit"
              subtitle="TD IT Solution (Pty) Ltd was established by Thabo Derrick Magagula to help South Africans protect electrically movable assets — from TVs and laptops to phones and business equipment — with discreet GPS tracking and coordinated recovery when something goes missing."
            />
            <p className="mt-6 max-w-md text-base text-text-secondary">
              We only collect what we need, and we handle personal information under South African
              data protection law (POPIA). See our{' '}
              <ArrowLink href="/privacy" size="sm">
                Privacy Policy
              </ArrowLink>{' '}
              for details.
            </p>
          </Reveal>
          <div className="flex flex-col gap-6">
            <Reveal direction="right" delay={0.05}>
              <FeatureCard
                icon={ShieldCheckIcon}
                title="Monthly cover for registered assets"
                description="Insure as many appliances and devices as you need. Each registered asset can carry a small, discreet GPS tracker, with a simple monthly subscription per item — subject to policy terms, underwriting and claims assessment."
                align="left"
              />
            </Reveal>
            <Reveal direction="right" delay={0.15}>
              <FeatureCard
                icon={MapPinIcon}
                title="GPS location plus partner-led recovery"
                description="When you report an asset stolen, we use GPS telemetry to guide recovery efforts and work with trained security-company partners. Where appropriate, cases are handed to the South African Police Service (SAPS) for further action. Recovery is best-effort, not guaranteed."
                align="left"
              />
            </Reveal>
          </div>
        </div>
      </Section>

      {/* 5. Pricing / Plans Teaser — kept close to original rhythm, intentionally */}
      <Section background="white">
        <SectionHeading
          eyebrow="Plans"
          title="Simple monthly plans per asset"
          subtitle="Pay monthly for each appliance or device you register with us. We're finalizing tier pricing — join the waitlist to see plans first."
        />
        <div className="mt-10 grid items-stretch gap-6 sm:grid-cols-3">
          <Reveal>
            <Card interactive={false} className="relative h-full">
              <ChevronMotif tone="navy" className="pointer-events-none absolute right-0 top-0 h-8 w-14 opacity-[0.06]" />
              <CardHeader title="Basic" description="Core cover for a single asset." />
              <CardFooter>
                <span className="text-sm text-text-secondary">Coming soon</span>
              </CardFooter>
            </Card>
          </Reveal>
          <Reveal delay={0.06}>
            <Card interactive={false} className="relative h-full">
              <ChevronMotif tone="navy" className="pointer-events-none absolute right-0 top-0 h-8 w-14 opacity-[0.06]" />
              <CardHeader title="Standard" description="Cover for multiple everyday assets." />
              <CardFooter>
                <span className="text-sm text-text-secondary">Coming soon</span>
              </CardFooter>
            </Card>
          </Reveal>
          <Reveal delay={0.12}>
            <Card interactive={false} className="relative h-full">
              <ChevronMotif tone="navy" className="pointer-events-none absolute right-0 top-0 h-8 w-14 opacity-[0.06]" />
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

      {/* 6. What to Expect — alternating left/right rows, one per row */}
      <Section background="warm">
        <SectionHeading
          align="center"
          eyebrow="What to Expect"
          title="Here's what happens if your laptop is stolen"
          subtitle="This is how the product is designed to work — not a customer story, since we're pre-launch."
        />
        <div className="mx-auto mt-12 flex max-w-3xl flex-col gap-8">
          <Reveal direction="left">
            <div className="flex items-start gap-6">
              <IconTile icon={AlertTriangleIcon} />
              <div>
                <h3 className="text-lg font-semibold text-text-primary">You report it.</h3>
                <p className="mt-2 text-base text-text-secondary">
                  You'd flag the laptop as stolen in the app, in a couple of taps.
                </p>
              </div>
            </div>
          </Reveal>
          <Reveal direction="right" delay={0.1}>
            <div className="flex items-start gap-6 sm:flex-row-reverse sm:text-right">
              <IconTile icon={PhoneCallIcon} />
              <div>
                <h3 className="text-lg font-semibold text-text-primary">We coordinate.</h3>
                <p className="mt-2 text-base text-text-secondary">
                  We'd notify our security-company partners and start working the case.
                </p>
              </div>
            </div>
          </Reveal>
          <Reveal direction="left" delay={0.2}>
            <div className="flex items-start gap-6">
              <IconTile icon={CheckCircleIcon} />
              <div>
                <h3 className="text-lg font-semibold text-text-primary">You're kept in the loop.</h3>
                <p className="mt-2 text-base text-text-secondary">
                  You'd get updates as things progress — recovery is best-effort and depends on
                  tracking status and on-the-ground conditions, subject to policy terms,
                  underwriting and claims assessment.
                </p>
              </div>
            </div>
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
                Registered assets can carry a small GPS tracking device that is difficult to spot
                once installed. If an item is reported lost or stolen, we use location data to
                guide recovery and coordinate with security-company partners. Where a crime is
                suspected, matters may be referred to SAPS. Recovery is a coordinated, best-effort
                process — not a guarantee.
              </AccordionItem>
              <AccordionItem value="monthly" title="How does monthly billing work?">
                You pay a monthly subscription for each asset you register and want covered. You
                can insure multiple items on one account. Exact amounts and billing dates will be
                set out in your policy documents at launch.
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

      {/* 8. Contact */}
      <Section background="white" id="contact">
        <SectionHeading
          align="center"
          eyebrow="Contact"
          title="Visit or call our Nelspruit office"
          subtitle="We're happy to answer questions about cover, GPS tracking, and recovery."
        />
        <div className="mx-auto mt-10 grid max-w-3xl gap-8 text-center sm:grid-cols-2 sm:text-left">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Address</p>
            <address className="mt-2 not-italic text-base text-text-primary">
              {COMPANY_CONTACT.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            <p className="mt-4 text-sm text-text-secondary">{COMPANY_CONTACT.officeHours}</p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Phone & email</p>
            <ul className="mt-2 space-y-2 text-base text-text-primary">
              {COMPANY_CONTACT.phones.map((phone) => (
                <li key={phone.href}>
                  <a href={phone.href} className="font-medium text-primary hover:underline">
                    {phone.display}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${COMPANY_CONTACT.email}`}
                  className="font-medium text-primary hover:underline"
                >
                  {COMPANY_CONTACT.email}
                </a>
              </li>
            </ul>
            <p className="mt-4 text-sm text-text-secondary">
              Contact: {COMPANY_CONTACT.founderName}
            </p>
          </div>
        </div>
      </Section>

      {/* 9. Final CTA — calm, centered, unchanged rhythm */}
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

      {/* 10. Footer */}
      <Section as="footer" spacing="default" background="navy" className="text-text-inverse">
        <h2 id="footer-heading" className="sr-only">
          Site footer
        </h2>
        <div className="grid gap-10 lg:grid-cols-4">
          {/* Column A — Brand */}
          <div>
            <div className="inline-flex rounded-xl bg-white px-4 py-3">
              <Logo tone="navy" size="lg" label="TD IT Solution Insurance" />
            </div>
            <p className="mt-4 text-sm text-text-inverse-muted">
              Insurance and GPS-assisted recovery for the assets you can&apos;t afford to lose.
              Based in Nelspruit, Mpumalanga.
            </p>
          </div>

          {/* Column B — Company / Legal (compliance-mandated disclosure block) */}
          <div className="text-sm text-text-inverse-muted">
            <p>
              {COMPANY_CONTACT.legalName}, trading as{' '}
              <span className="text-text-inverse">{COMPANY_CONTACT.tradingName}</span>
            </p>
            <p className="mt-2">Reg. No. [COMPANY REG NO — pending]</p>
            <p className="mt-2">
              {COMPANY_CONTACT.tradingName} is being registered as a licensed non-life insurer in
              terms of the Insurance Act 18 of 2017. [INSURER LICENCE — pending confirmation]
            </p>
            <p className="mt-2">
              Authorised financial services provider, FSP No. [FSP NUMBER — pending]
            </p>
          </div>

          {/* Column C — Contact */}
          <div className="text-sm text-text-inverse-muted">
            <address className="not-italic">
              {COMPANY_CONTACT.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            <p className="mt-2">
              <a href={`mailto:${COMPANY_CONTACT.email}`} className="text-text-inverse hover:underline">
                {COMPANY_CONTACT.email}
              </a>
            </p>
            <p className="mt-2">
              {COMPANY_CONTACT.phones.map((phone, index) => (
                <span key={phone.href}>
                  {index > 0 ? ' · ' : null}
                  <a href={phone.href} className="text-text-inverse hover:underline">
                    {phone.display}
                  </a>
                </span>
              ))}
            </p>
            <p className="mt-2">{COMPANY_CONTACT.officeHours}</p>
          </div>

          {/* Column D — Legal & Complaints */}
          <div className="text-sm text-text-inverse-muted">
            <p className="mb-2 text-xs uppercase tracking-wide text-text-inverse-muted">Customer account</p>
            <div className="flex flex-col gap-2">
              <ArrowLink tone="inverse" href="/login" size="sm">
                Log in
              </ArrowLink>
              <ArrowLink tone="inverse" href="/signup" size="sm">
                Create account
              </ArrowLink>
              <ArrowLink tone="inverse" href="#contact" size="sm">
                Contact us
              </ArrowLink>
              <ArrowLink tone="inverse" href="/privacy" size="sm">
                Privacy Policy
              </ArrowLink>
              <ArrowLink tone="inverse" href="/terms" size="sm">
                Terms of Service
              </ArrowLink>
              <ArrowLink tone="inverse" href="/admin/login" size="sm">
                Admin portal
              </ArrowLink>
              <ArrowLink tone="inverse" href="/security/login" size="sm">
                Security partner portal
              </ArrowLink>
            </div>
            <p className="mt-4">
              Not happy with something? Contact us at{' '}
              <a href={`mailto:${COMPANY_CONTACT.email}`} className="text-text-inverse hover:underline">
                {COMPANY_CONTACT.email}
              </a>{' '}
              first. If we can&apos;t resolve it, you can escalate to the{' '}
              Ombudsman for Short-Term Insurance (OSTI).
            </p>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-sm text-text-inverse-muted">
          © {new Date().getFullYear()} {COMPANY_CONTACT.tradingName}. All rights reserved.
        </div>
      </Section>
    </>
  );
}
