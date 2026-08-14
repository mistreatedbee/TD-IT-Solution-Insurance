import {
  BriefcaseIcon,
  CarIcon,
  CheckIcon,
  CpuIcon,
  LaptopIcon,
  LayersIcon,
  MonitorIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TabletIcon,
  TvIcon,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { type AssetType } from '../components/AssetBadge';
import { Button } from '../components/Button';
import { InlineAlert } from '../dashboard/components/ui';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { SectionHeading } from '../components/SectionHeading';
import { type PlanCatalogItem } from '../customer/api/plans';
import { usePublicPlans } from '../hooks/usePublicPlans';
import {
  formatPlanCellPrice,
  MARKETING_ASSET_TYPES,
  MARKETING_COVERAGE_BY_ASSET,
} from '../lib/marketing-asset-pricing';

const PLAN_ICONS: Record<string, LucideIcon> = {
  starter: ShieldCheckIcon,
  standard: LayersIcon,
  enterprise: BriefcaseIcon,
};

/** Mirrors AssetBadge's icon-per-type mapping — used here at avatar size for a
 * compact table row, since AssetBadge itself renders as a full tile/card with
 * its own baked-in label and isn't meant for inline row use. */
const ASSET_TYPE_ICONS: Record<AssetType, LucideIcon> = {
  vehicle: CarIcon,
  laptop: LaptopIcon,
  phone: SmartphoneIcon,
  tablet: TabletIcon,
  tv: TvIcon,
  desktop: MonitorIcon,
  business: BriefcaseIcon,
  other: CpuIcon,
};

function PlanTierPanel({ plan }: { plan: PlanCatalogItem }) {
  const Icon = PLAN_ICONS[plan.slug] ?? ShieldCheckIcon;
  const price = formatPlanCellPrice(plan);

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
            <h3 className="font-heading text-xl font-semibold tracking-tight">{plan.name}</h3>
            <p className="mt-1 text-sm leading-6 text-text-inverse-muted">{plan.tagline}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col bg-card px-5 py-6">
        <div className="rounded-xl border border-accent-gold-deep/30 bg-white px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
            Monthly subscription
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-primary">{price.primary}</p>
          {price.secondary ? (
            <p className="mt-1 text-xs leading-5 text-text-secondary">{price.secondary}</p>
          ) : null}
        </div>

        <ul className="mt-6 flex flex-1 flex-col gap-3">
          {plan.features.map((feature) => (
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
          <Link to="/get-started">
            <Button variant="primary" fullWidth>
              {plan.isCustomPricing ? 'Request a quote' : 'Get started'}
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}

function AssetPricingTable({ plans }: { plans: PlanCatalogItem[] }) {
  return (
    <div className="mt-12 overflow-hidden rounded-2xl border border-primary/15 bg-white shadow-sm">
      <div className="border-b border-primary/10 bg-background-alt px-4 py-4 sm:px-6">
        <h3 className="font-heading text-lg font-semibold text-primary">Monthly pricing by asset type</h3>
        <p className="mt-1 text-sm text-text-secondary">
          All asset categories are available on every plan. Plan fees apply to your account — register
          any mix of items up to your plan limit. Cover and limits are subject to policy terms,
          underwriting and claims assessment.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[640px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-primary/10 bg-white">
              <th scope="col" className="px-4 py-3 font-semibold text-text-primary sm:px-6">
                Asset type
              </th>
              <th scope="col" className="hidden px-4 py-3 font-semibold text-text-secondary sm:table-cell sm:px-6">
                Illustrative cover limit
              </th>
              {plans.map((plan) => (
                <th key={plan.id} scope="col" className="px-4 py-3 font-semibold text-primary sm:px-6">
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MARKETING_ASSET_TYPES.map(({ type, label }, rowIndex) => {
              const AssetIcon = ASSET_TYPE_ICONS[type as AssetType];
              return (
              <tr
                key={type}
                className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-background-alt/40'}
              >
                <td className="px-4 py-3 sm:px-6">
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background-alt text-primary"
                      aria-hidden="true"
                    >
                      <AssetIcon className="h-4 w-4" />
                    </span>
                    <span className="font-medium text-text-primary">{label}</span>
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-text-secondary sm:table-cell sm:px-6">
                  Up to {MARKETING_COVERAGE_BY_ASSET[type as AssetType]}
                </td>
                {plans.map((plan) => {
                  const cell = formatPlanCellPrice(plan);
                  return (
                    <td key={plan.id} className="px-4 py-3 align-top sm:px-6">
                      <p className="font-semibold text-primary">{cell.primary}</p>
                      {cell.secondary ? (
                        <p className="mt-0.5 text-xs leading-5 text-text-secondary">{cell.secondary}</p>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-primary/10 bg-background-alt/60">
              <td colSpan={2 + plans.length} className="px-4 py-3 text-xs leading-5 text-text-secondary sm:px-6">
                Prices shown are monthly plan subscriptions in South African Rand (ZAR). Illustrative
                cover limits are not guarantees. Payment and full activation are completed during
                account setup.
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function PlansSection({ onJoinWaitlist }: { onJoinWaitlist: () => void }) {
  const { plans, loading, error, usingFallback, retry } = usePublicPlans();

  return (
    <Section background="warm" id="plans" className="scroll-mt-20">
      <SectionHeading
        align="center"
        eyebrow="Plans"
        title="Plans and pricing for every asset type"
        subtitle="Choose a plan based on how many items you want to protect. Vehicles, laptops, phones, tablets, TVs, desktops, business equipment and other electronics are all covered."
      />

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
          <div className="mx-auto mt-10 grid max-w-6xl items-stretch gap-6 sm:grid-cols-3">
            {plans.map((plan, index) => (
              <Reveal key={plan.id} delay={index * 0.06} className="h-full">
                <PlanTierPanel plan={plan} />
              </Reveal>
            ))}
          </div>

          {plans.length > 0 ? (
            <Reveal delay={0.12}>
              <AssetPricingTable plans={plans} />
            </Reveal>
          ) : null}
        </>
      )}

      <Reveal delay={0.18}>
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
