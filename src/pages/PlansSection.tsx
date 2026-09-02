import {
  BriefcaseIcon,
  CarIcon,
  CheckIcon,
  ChevronDownIcon,
  CpuIcon,
  CrownIcon,
  LaptopIcon,
  MonitorIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  SparklesIcon,
  TabletIcon,
  TvIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { type AssetType } from '../components/AssetBadge';
import { Button } from '../components/Button';
import { InlineAlert } from '../dashboard/components/ui';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';
import { type PlanCatalogItem } from '../customer/api/plans';
import { usePublicPlans } from '../hooks/usePublicPlans';
import { COMPANY_CONTACT } from '../lib/companyContact';
import {
  formatPlanAssetLimit,
  formatPlanPriceDisplay,
  getMarketingPlanFeatures,
  MARKETING_ASSET_TYPES,
  MARKETING_COVERAGE_BY_ASSET,
} from '../lib/marketing-asset-pricing';

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

const VISIBLE_FEATURE_COUNT = 5;

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

function PlanTierCard({ plan }: { plan: PlanCatalogItem }) {
  const Icon = PLAN_ICONS[plan.slug] ?? ShieldCheckIcon;
  const isPopular = plan.isMostPopular === true;
  const price = formatPlanPriceDisplay(plan);
  const assetLimit = formatPlanAssetLimit(plan);
  const { inheritsFrom, highlights } = getMarketingPlanFeatures(plan);
  const visibleFeatures = highlights.slice(0, VISIBLE_FEATURE_COUNT);
  const moreCount = highlights.length - visibleFeatures.length;

  const ctaHref = plan.isCustomPricing
    ? `mailto:${COMPANY_CONTACT.email}?subject=Business%20plan%20quote`
    : '/get-started';
  const ctaLabel = plan.isCustomPricing ? 'Request a quote' : 'Get started';

  return (
    <article
      className={`relative flex h-full flex-col rounded-2xl bg-white transition-shadow duration-300 ${
        isPopular
          ? 'z-10 border-2 border-accent-gold-deep shadow-glow-gold lg:-mt-3 lg:mb-3'
          : 'border border-primary/10 shadow-resting hover:shadow-hover'
      }`}
    >
      {isPopular ? (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent-gold-deep px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
          Most popular
        </div>
      ) : null}

      <div className={`px-6 pt-8 ${isPopular ? 'pb-2' : 'pb-4'}`}>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isPopular ? 'bg-accent-gold-deep text-white' : 'bg-primary/8 text-primary'
            }`}
            aria-hidden="true"
          >
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-heading text-lg font-semibold tracking-tight text-primary">{plan.name}</h3>
            <p className="text-sm text-text-secondary">{plan.positioning ?? plan.tagline}</p>
          </div>
        </div>

        <div className="mt-6">
          {price.isCustom ? (
            <p className="font-heading text-3xl font-bold tracking-tight text-primary">Custom quote</p>
          ) : (
            <p className="flex items-baseline gap-1">
              <span className="font-heading text-4xl font-bold tracking-tight text-primary">{price.amount}</span>
              <span className="text-sm font-medium text-text-secondary">{price.period}</span>
            </p>
          )}
          <p className="mt-2 inline-flex items-center rounded-lg bg-background-alt px-3 py-1.5 text-sm font-semibold text-primary">
            {assetLimit}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col border-t border-primary/8 px-6 py-5">
        {inheritsFrom ? (
          <p className="mb-4 rounded-lg bg-accent-gold-tint/40 px-3 py-2 text-xs font-medium text-primary">
            Everything in {inheritsFrom}, plus:
          </p>
        ) : null}

        <ul className="flex flex-1 flex-col gap-2.5">
          {visibleFeatures.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm leading-snug text-text-secondary">
              <CheckIcon
                className="mt-0.5 h-4 w-4 shrink-0 text-accent-gold-deep"
                strokeWidth={2.5}
                aria-hidden="true"
              />
              <span>{feature}</span>
            </li>
          ))}
          {moreCount > 0 ? (
            <li className="pl-6 text-xs text-text-secondary">+ {moreCount} more included</li>
          ) : null}
        </ul>

        <div className="mt-6">
          {plan.isCustomPricing ? (
            <a href={ctaHref}>
              <Button variant={isPopular ? 'primary' : 'secondary'} fullWidth>
                {ctaLabel}
              </Button>
            </a>
          ) : (
            <Link to={ctaHref}>
              <Button variant={isPopular ? 'primary' : 'secondary'} fullWidth>
                {ctaLabel}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </article>
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
                <PlanTierCard plan={plan} />
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
