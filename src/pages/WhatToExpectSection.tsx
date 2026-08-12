import {
  AlertTriangleIcon,
  BellRingIcon,
  CheckCircleIcon,
  PhoneCallIcon,
} from 'lucide-react';
import { AssetBadge } from '../components/AssetBadge';
import { Badge } from '../components/Badge';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';
import { ChevronMotif } from './ChevronMotif';

const RECOVERY_STEPS = [
  {
    step: 1,
    title: 'You report it',
    description: "You'd flag the laptop as stolen in the app, in a couple of taps.",
    icon: AlertTriangleIcon,
    hint: 'Takes under a minute',
    accent: 'from-amber-500 to-orange-600',
    tint: 'bg-amber-50 text-amber-800 ring-amber-100',
  },
  {
    step: 2,
    title: 'We coordinate',
    description: "We'd notify our security-company partners and start working the case.",
    icon: PhoneCallIcon,
    hint: 'Partners alerted immediately',
    accent: 'from-primary to-slate-800',
    tint: 'bg-slate-100 text-primary ring-slate-200',
  },
  {
    step: 3,
    title: "You're kept in the loop",
    description:
      "You'd get updates as things progress — recovery is best-effort and depends on tracking status and on-the-ground conditions, subject to policy terms, underwriting and claims assessment.",
    icon: BellRingIcon,
    hint: 'Status updates in the app',
    accent: 'from-emerald-600 to-teal-700',
    tint: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
  },
] as const;

function RecoveryStepCard({
  step,
  title,
  description,
  icon: Icon,
  hint,
  accent,
  tint,
  isLast,
}: (typeof RECOVERY_STEPS)[number] & { isLast?: boolean }) {
  return (
    <article className="relative flex h-full flex-col">
      {!isLast ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[4.5rem] hidden h-px w-[calc(100%+1.5rem)] bg-gradient-to-r from-accent-gold-deep/40 via-accent-gold/30 to-transparent lg:block"
        />
      ) : null}

      <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-resting transition-shadow duration-300 hover:shadow-elevated">
        <div aria-hidden="true" className={`h-1.5 w-full bg-gradient-to-r ${accent}`} />

        <div className="relative flex flex-1 flex-col p-6">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-2 -top-3 select-none font-heading text-7xl font-bold leading-none text-slate-100"
          >
            {step}
          </span>

          <div className="relative flex items-start justify-between gap-3">
            <span
              className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-md`}
              aria-hidden="true"
            >
              <Icon className="h-6 w-6" />
            </span>
            <Badge tone="neutral" size="sm" className={tint}>
              Step {step}
            </Badge>
          </div>

          <h3 className="mt-5 text-xl font-semibold tracking-tight text-text-primary">{title}</h3>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-accent-gold-deep">
            {hint}
          </p>
          <p className="mt-3 flex-1 text-sm leading-6 text-text-secondary">{description}</p>

          {step === 3 ? (
            <div className="mt-5 flex items-start gap-2 rounded-xl bg-stone-50 px-3 py-2.5 ring-1 ring-slate-100">
              <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <p className="text-xs leading-5 text-text-secondary">
                Recovery is coordinated and best-effort — never guaranteed.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function WhatToExpectSection() {
  return (
    <Section background="white" className="relative overflow-hidden">
      <ChevronMotif
        tone="gold"
        className="pointer-events-none absolute -right-16 top-24 hidden h-24 w-40 opacity-[0.05] lg:block"
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="flex flex-col items-center text-center">
          <Badge tone="gold" size="md">
            Recovery journey
          </Badge>
          <SectionHeading
            align="center"
            eyebrow="What to Expect"
            title="Here's what happens if your laptop is stolen"
            subtitle="This is how the product is designed to work — not a customer story, since we're pre-launch."
            className="mt-4 !items-center !text-center [&>div:first-child]:!items-center [&>div:first-child]:!text-center"
          />
        </div>

        <Reveal delay={0.05}>
          <div className="mx-auto mt-8 flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-stone-50/80 px-5 py-4 text-center sm:flex-row sm:text-left">
            <AssetBadge type="laptop" size="md" selected className="shrink-0" />
            <div>
              <p className="text-sm font-semibold text-text-primary">Example scenario</p>
              <p className="mt-0.5 text-sm text-text-secondary">
                Your registered laptop is reported stolen — here&apos;s the designed response flow.
              </p>
            </div>
          </div>
        </Reveal>

        <ol className="relative mt-12 grid gap-6 lg:grid-cols-3 lg:gap-5">
          {RECOVERY_STEPS.map((item, index) => (
            <Reveal key={item.step} delay={index * 0.08} className="h-full list-none">
              <RecoveryStepCard {...item} isLast={index === RECOVERY_STEPS.length - 1} />
            </Reveal>
          ))}
        </ol>

        <Reveal delay={0.24}>
          <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-slate-200/80 bg-gradient-to-br from-stone-50 to-white px-6 py-5 text-center shadow-sm">
            <p className="text-sm font-semibold text-text-primary">Designed for clarity under stress</p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              The mobile app is built so you can report theft quickly, while our team and security
              partners coordinate recovery in the background — with updates pushed back to you as the
              case moves forward.
            </p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
