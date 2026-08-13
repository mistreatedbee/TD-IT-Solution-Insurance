import {
  ClipboardCheckIcon,
  LaptopIcon,
  ShieldCheckIcon,
  MapPinIcon,
  SmartphoneIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';
import { FeatureCard } from '../components/FeatureCard';
import { StepItem } from '../components/StepItem';
import { Button } from '../components/Button';
import { ArrowLink } from '../components/ArrowLink';
import { Reveal } from '../components/Reveal';
import { Logo } from '../components/Logo';
import { AssetBadge, type AssetType } from '../components/AssetBadge';
import { WaitlistForm } from './WaitlistForm';
import { ChevronDivider } from './ChevronMotif';
import { LandingHeader } from './LandingHeader';
import { HeroVisual } from './HeroVisual';
import { HeroFeatures } from './HeroFeatures';
import { PlansSection } from './PlansSection';
import { WhatToExpectSection } from './WhatToExpectSection';
import { MobileAppDownloadSection } from './MobileAppDownloadSection';
import { COMPANY_CONTACT } from '../lib/companyContact';
import { scrollToMobileAppSection } from '../lib/mobileAppLinks';
import {
  Accordion,
  AccordionItem
} from '../components/Accordion';
import { useLandingPageMeta } from '../hooks/useLandingPageMeta';

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

export function LandingPage() {
  useLandingPageMeta();

  return (
    <>
      <LandingHeader />

      {/* 1. Hero — v2 minimal split: copy left, motif right (desktop) */}
      <Section spacing="none" width="full" bleed className="relative overflow-hidden bg-white">
        <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-8 lg:px-8 lg:pb-28 lg:pt-24">
          <Reveal direction="left" distance={32}>
            <div className="max-w-xl">
              <SectionHeading
                as="h1"
                size="lg"
                align="left"
                eyebrow="Asset insurance, built for recovery"
                title="Insurance that helps you recover your insured items."
                subtitle="TD IT Solution Insurance covers your vehicles, laptops, phones, tablets, TVs, desktops and business equipment — with GPS-assisted recovery and security-company partners when an insured item is lost or stolen. Cover is subject to policy terms, underwriting and claims assessment."
              />
              <div className="mt-8 flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <Link to="/get-started" className="sm:w-auto">
                    <Button variant="primary" size="lg" fullWidth className="sm:w-auto">
                      Get Started
                    </Button>
                  </Link>
                  <Button
                    variant="secondary"
                    size="lg"
                    fullWidth
                    leadingIcon={<SmartphoneIcon className="h-5 w-5" />}
                    onClick={scrollToMobileAppSection}
                    className="sm:w-auto"
                  >
                    Download Mobile Asset Tracking App
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <ArrowLink href="#how-it-works" tone="default">
                    See how it works
                  </ArrowLink>
                  <button
                    type="button"
                    className="text-sm font-semibold text-accent-gold-deep underline-offset-4 hover:underline"
                    onClick={scrollToWaitlist}
                  >
                    Join the waitlist
                  </button>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal direction="right" delay={0.1} distance={32}>
            <HeroVisual />
          </Reveal>
        </div>

        <div className="pb-16 lg:pb-20">
          <HeroFeatures />
        </div>

        <MobileAppDownloadSection />

        <ChevronDivider tone="gold" className="mx-auto" />
      </Section>

      {/* 2. How It Works — full-bleed navy band, first rhythm break */}
      <Section background="navy" id="how-it-works" className="relative scroll-mt-20 overflow-hidden text-text-inverse">
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
      <Section background="white" id="coverage" className="scroll-mt-20">
        <SectionHeading
          eyebrow="What's Covered"
          title="Cover for the assets you actually own"
          subtitle="From the car in your driveway to the laptop on your desk. Cover is subject to policy terms, underwriting and claims assessment."
        />
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {/* vehicle + business span two columns for emphasis */}
          <Reveal className="col-span-2" delay={0}>
            <AssetBadge type="vehicle" size="md" className="h-full" />
          </Reveal>
          {STANDARD_ASSET_TYPES.slice(0, 5).map((type, i) => (
            <Reveal key={type} delay={0.05 + i * 0.05}>
              <AssetBadge type={type} size="md" />
            </Reveal>
          ))}
          <Reveal className="col-span-2" delay={0.3}>
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

      <PlansSection onJoinWaitlist={scrollToWaitlist} />

      <WhatToExpectSection />

      {/* 7. FAQ */}
      <Section background="white" width="default" id="faq" className="scroll-mt-20">
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
      <Section background="white" id="contact" className="scroll-mt-20">
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
              <ArrowLink tone="inverse" href="/get-started" size="sm">
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
