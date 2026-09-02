import {
  BriefcaseIcon,
  CarIcon,
  ChevronDownIcon,
  CpuIcon,
  LaptopIcon,
  MonitorIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  SparklesIcon,
  TabletIcon,
  TvIcon,
  CrownIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { type AssetType } from '../components/AssetBadge';
import { Button } from '../components/Button';
import { PlanMarketingCard } from '../components/PlanMarketingCard';
import { InlineAlert } from '../dashboard/components/ui';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';
import { usePublicPlans } from '../hooks/usePublicPlans';
import { MARKETING_ASSET_TYPES, MARKETING_COVERAGE_BY_ASSET } from '../lib/marketing-asset-pricing';

const PLAN_ICONS: Record<string, LucideIcon> = {
  essential: ShieldCheckIcon,
  plus: SparklesIcon,
  pro: CrownIcon,
  business: BriefcaseIcon,
  starter: ShieldCheckIcon,
  standard: SparklesIcon,
  enterprise: BriefcaseIcon,
};

const ASSET_CHIP_ICONS: Record<AssetType, LucideIcon> = {
  vehicle: CarIcon,
  laptop: LaptopIcon,
  phone: SmartphoneIcon,
  tablet: TabletIcon,
  tv: TvIcon,
  desktop: MonitorIcon,
  business: BriefcaseIcon,
  other: CpuIcon,
};

function AssetTypeChips() {
  return (
    <div className="mx-auto mt-6 flex max-w-3xl flex-wrap items-center justify-center gap-2">
      {MARKETING_ASSET_TYPES.map(({ type, label }) => {
        const Icon = ASSET_CHIP_ICONS[type as AssetType];
        return (
          <span
            key={type}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/10 bg-white/80 px-3 py-1.5 text-xs font-medium text-text-secondary shadow-sm backdrop-blur-sm"
          >
            <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            {label}
          </span>
        );
      })}
    </div>
  );
}

function CoverageLimitsAccordion() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl border border-primary/10 bg-white shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-background-alt/50"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <p className="font-heading text-base font-semibold text-primary">Illustrative cover limits by asset type</p>
          <p className="mt-0.5 text-sm text-text-secondary">
            Same plan price for every category — limits shown are not guarantees.
          </p>
        </div>
        <ChevronDownIcon
          className={`h-5 w-5 shrink-0 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <ul className="divide-y divide-primary/8 border-t border-primary/8 px-5 py-2">
          {MARKETING_ASSET_TYPES.map(({ type, label }) => {
            const Icon = ASSET_CHIP_ICONS[type as AssetType];
            return (
              <li key={type} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span className="flex items-center gap-2.5 text-text-primary">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  {label}
                </span>
                <span className="font-medium text-text-secondary">
                  Up to {MARKETING_COVERAGE_BY_ASSET[type as AssetType]}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function PlansSection({ onJoinWaitlist }: { onJoinWaitlist: () => void }) {
  const { plans, loading, error, usingFallback, retry } = usePublicPlans();

  return (
    <Section background="warm" id="plans" className="scroll-mt-20">
      <SectionHeading
        align="center"
        eyebrow="Plans & pricing"
        title="Simple monthly plans. One price, every asset type."
        subtitle="Pick a tier by how many items you want to protect — vehicles, laptops, phones and more on the same plan. Insurance cover and claims follow your policy terms, not the subscription tier alone."
      />

      <AssetTypeChips />

      {error ? (
        <div className="mx-auto mt-6 max-w-2xl">
          <InlineAlert tone={usingFallback ? 'info' : 'warning'}>
            {error}
            {!usingFallback ? (
              <button
                type="button"
                className="ml-2 font-semibold underline"
                onClick={() => void retry()}
              >
                Retry
              </button>
            ) : null}
          </InlineAlert>
        </div>
      ) : null}

      {loading ? (
        <p className="mt-10 text-center text-sm text-text-secondary">Loading plans…</p>
      ) : (
        <>
          <div className="mx-auto mt-10 grid max-w-6xl items-end gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan, index) => (
              <Reveal key={plan.id} delay={index * 0.05} className="h-full">
                <PlanMarketingCard plan={plan} icon={PLAN_ICONS[plan.slug] ?? ShieldCheckIcon} />
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.1}>
            <CoverageLimitsAccordion />
          </Reveal>

          <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-5 text-text-secondary">
            Prices are monthly platform subscriptions in ZAR. GPS hardware, connectivity and insurance premiums
            may be quoted separately. Activation completes during account setup — payment integration is coming
            soon.
          </p>
        </>
      )}

      <Reveal delay={0.15}>
        <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-4 rounded-2xl bg-primary px-6 py-6 text-center text-text-inverse sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-sm font-semibold">Ready to protect your assets?</p>
            <p className="mt-1 text-sm text-text-inverse-muted">
              Create your account, choose a plan and register your first item in minutes.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <Link to="/get-started">
              <Button variant="ghost" size="md">
                Get started
              </Button>
            </Link>
            <Button variant="secondary" size="md" onClick={onJoinWaitlist}>
              Join waitlist
            </Button>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
