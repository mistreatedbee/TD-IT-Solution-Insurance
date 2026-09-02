import { CheckIcon, CrownIcon, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './Button';
import type { PlanCatalogItem } from '../customer/api/plans';
import { COMPANY_CONTACT } from '../lib/companyContact';
import {
  formatPlanAssetLimitLabel,
  formatPlanPriceParts,
  getMarketingPlanFeatures,
} from '../lib/plan-catalog-display';

const VISIBLE_FEATURE_COUNT = 5;

export interface PlanMarketingCardProps {
  plan: PlanCatalogItem;
  icon: LucideIcon;
  /** When set, renders a select button instead of get-started link. */
  onSelect?: () => void;
  selectLabel?: string;
  loading?: boolean;
  selected?: boolean;
  disabled?: boolean;
}

export function PlanMarketingCard({
  plan,
  icon: Icon,
  onSelect,
  selectLabel,
  loading = false,
  selected = false,
  disabled = false,
}: PlanMarketingCardProps) {
  const isPopular = plan.isMostPopular === true;
  const price = formatPlanPriceParts(plan);
  const assetLimit = formatPlanAssetLimitLabel(plan);
  const { inheritsFrom, highlights } = getMarketingPlanFeatures(plan);
  const visibleFeatures = highlights.slice(0, VISIBLE_FEATURE_COUNT);
  const moreCount = highlights.length - visibleFeatures.length;

  const defaultSelectLabel = plan.isCustomPricing
    ? 'Request a quote'
    : selected
      ? 'Selected'
      : 'Select plan';

  return (
    <article
      className={`relative flex h-full flex-col rounded-2xl bg-white transition-shadow duration-300 ${
        isPopular
          ? 'z-10 border-2 border-accent-gold-deep shadow-glow-gold lg:-mt-3 lg:mb-3'
          : selected
            ? 'border-2 border-primary ring-2 ring-primary/20'
            : 'border border-primary/10 shadow-resting hover:shadow-hover'
      }`}
    >
      {isPopular ? (
        <div className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-accent-gold-deep px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
          <CrownIcon className="h-3 w-3" aria-hidden="true" />
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
          {onSelect ? (
            <Button
              variant={isPopular || selected ? 'primary' : 'secondary'}
              fullWidth
              loading={loading}
              disabled={disabled || (selected && !plan.isCustomPricing)}
              onClick={onSelect}
            >
              {selectLabel ?? defaultSelectLabel}
            </Button>
          ) : plan.isCustomPricing ? (
            <a href={`mailto:${COMPANY_CONTACT.email}?subject=Business%20plan%20quote`}>
              <Button variant={isPopular ? 'primary' : 'secondary'} fullWidth>
                Request a quote
              </Button>
            </a>
          ) : (
            <Link to="/get-started">
              <Button variant={isPopular ? 'primary' : 'secondary'} fullWidth>
                Get started
              </Button>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
