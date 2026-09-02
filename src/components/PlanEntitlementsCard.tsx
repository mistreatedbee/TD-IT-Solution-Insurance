import { Link } from 'react-router-dom';
import { CheckIcon, LockIcon } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';
import {
  DASHBOARD_ENTITLEMENT_ITEMS,
  hasPlanEntitlement,
} from '../lib/plan-entitlements-display';

export interface PlanEntitlementsCardProps {
  planName: string;
  entitlements: Record<string, boolean> | null | undefined;
  changePlanHref?: string;
}

export function PlanEntitlementsCard({
  planName,
  entitlements,
  changePlanHref = '/dashboard/plan',
}: PlanEntitlementsCardProps) {
  const lockedCount = DASHBOARD_ENTITLEMENT_ITEMS.filter(
    (item) => !hasPlanEntitlement(entitlements, item.key),
  ).length;

  return (
    <Card padding="lg" interactive={false}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-text-primary">What your plan includes</p>
          <p className="mt-1 text-sm text-text-secondary">
            {planName} — platform subscription entitlements (not insurance payout guarantees).
          </p>
        </div>
        {lockedCount > 0 ? (
          <Link to={changePlanHref}>
            <Button variant="secondary" size="sm">
              Upgrade plan
            </Button>
          </Link>
        ) : null}
      </div>

      <ul className="mt-5 divide-y divide-primary/8">
        {DASHBOARD_ENTITLEMENT_ITEMS.map((item) => {
          const included = hasPlanEntitlement(entitlements, item.key);
          return (
            <li key={item.key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <span
                className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  included ? 'bg-emerald-100 text-emerald-700' : 'bg-background-alt text-text-secondary'
                }`}
                aria-hidden="true"
              >
                {included ? <CheckIcon className="h-3.5 w-3.5" /> : <LockIcon className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">{item.label}</p>
                <p className="mt-0.5 text-xs text-text-secondary">{item.description}</p>
                {!included ? (
                  <p className="mt-1 text-xs font-medium text-accent-gold-deep">
                    Available on {item.minPlan} and above
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
