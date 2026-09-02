import { CrownIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, SectionHeading } from '../../components';
import { InlineAlert, LoadingState } from '../../dashboard/components/ui';
import { changePolicyPlan, listPolicies, type Policy } from '../../customer/api/policies';
import { formatPlanPrice, listPlans, type PlanCatalogItem } from '../../customer/api/plans';
import {
  formatAssetUsage,
  formatSupportLevel,
  resolvePlanFromCatalog,
} from '../../lib/plan-catalog-display';
import { COMPANY_CONTACT } from '../../lib/companyContact';
import { mapUserFacingError } from '../../lib/user-facing-errors';

export function CustomerChangePlanPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changingPlanId, setChangingPlanId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [policiesRes, plansRes] = await Promise.all([
          listPolicies({ includePlanSummary: true }),
          listPlans(),
        ]);
        if (!cancelled) {
          setPolicies(policiesRes.data);
          setPlans(plansRes.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(mapUserFacingError(err, { context: 'policy' }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activePolicy = policies[0] ?? null;
  const planSummary = activePolicy?.planSummary;
  const currentPlan = useMemo(
    () => (activePolicy ? resolvePlanFromCatalog(plans, activePolicy) : undefined),
    [activePolicy, plans],
  );

  const visiblePlans = useMemo(
    () => plans.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [plans],
  );

  async function handleSelectPlan(plan: PlanCatalogItem) {
    if (!activePolicy) return;

    if (plan.isCustomPricing) {
      window.location.href = `mailto:${COMPANY_CONTACT.email}?subject=Business%20plan%20quote`;
      return;
    }

    if (plan.id === activePolicy.planCatalogId) return;

    setChangingPlanId(plan.id);
    setError(null);
    setSuccessMessage(null);

    try {
      const updated = await changePolicyPlan(activePolicy.id, plan.id);
      setPolicies([updated]);
      setSuccessMessage(`Your plan is now ${plan.name}. Billing integration is coming soon — no payment was taken.`);
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'policy' }));
    } finally {
      setChangingPlanId(null);
    }
  }

  if (loading) {
    return <LoadingState label="Loading plans…" />;
  }

  if (!activePolicy) {
    return (
      <div className="space-y-4">
        <InlineAlert tone="info">
          You do not have an active policy yet.{' '}
          <Link to="/get-started" className="font-medium text-primary underline">
            Complete setup
          </Link>{' '}
          to choose a plan first.
        </InlineAlert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <SectionHeading
          as="h1"
          title="Change plan"
          size="md"
          subtitle="Compare Essential, Plus, Pro, and Business. Prices are for planning — payment is not configured yet."
        />
        <p className="mt-2 text-sm text-text-secondary">
          <Link to="/dashboard" className="text-primary hover:underline">Back to overview</Link>
        </p>
      </div>

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {successMessage ? <InlineAlert tone="info">{successMessage}</InlineAlert> : null}

      <Card padding="lg" interactive={false}>
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Current plan</p>
        <p className="mt-2 text-xl font-bold text-text-primary">
          {planSummary?.planName ?? currentPlan?.name ?? activePolicy.planTier}
        </p>
        {planSummary?.monthlyAmountCents != null ? (
          <p className="mt-1 text-sm text-text-secondary">
            R{(planSummary.monthlyAmountCents / 100).toFixed(0)}/month
          </p>
        ) : currentPlan ? (
          <p className="mt-1 text-sm text-text-secondary">{formatPlanPrice(currentPlan)}</p>
        ) : null}
        <p className="mt-3 text-sm text-text-secondary">
          Asset usage:{' '}
          {planSummary?.assetUsageLabel ??
            formatAssetUsage(planSummary?.activeAssetCount ?? 0, currentPlan?.maxAssets)}
        </p>
        {planSummary?.supportLevel ? (
          <p className="mt-1 text-sm text-text-secondary">
            Support: {planSummary.supportLevel}
          </p>
        ) : null}
        {activePolicy.billing.billingStatus === 'not_configured' ? (
          <p className="mt-2 text-xs text-text-secondary">
            Billing is not live yet — plan changes update your entitlement limits only.
          </p>
        ) : null}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visiblePlans.map((plan) => {
          const isCurrent = plan.id === activePolicy.planCatalogId;
          const isMostPopular = plan.isMostPopular === true;
          const isChanging = changingPlanId === plan.id;

          return (
            <Card
              key={plan.id}
              className={`flex flex-col overflow-hidden p-0 ${
                isCurrent ? 'ring-2 ring-primary' : ''
              } ${isMostPopular && !isCurrent ? 'ring-2 ring-accent-gold-deep/50 lg:scale-[1.02]' : ''}`}
            >
              <div className="bg-primary px-4 py-3 text-white">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{plan.name}</p>
                  {isMostPopular ? (
                    <Badge tone="gold" className="!bg-accent-gold-deep !text-white text-[10px]">
                      <CrownIcon className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
                      Most popular
                    </Badge>
                  ) : null}
                  {isCurrent ? (
                    <Badge tone="gold" className="!bg-white/20 !text-white text-[10px]">Current</Badge>
                  ) : null}
                </div>
                <p className="text-sm text-white/80">{plan.positioning ?? plan.tagline}</p>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="text-2xl font-bold text-text-primary">{formatPlanPrice(plan)}</p>
                {plan.maxAssets != null ? (
                  <p className="mt-1 text-xs text-text-secondary">Up to {plan.maxAssets} assets</p>
                ) : (
                  <p className="mt-1 text-xs text-text-secondary">Custom asset limits</p>
                )}
                {plan.supportLevel ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    Support: {formatSupportLevel(plan.supportLevel)}
                  </p>
                ) : null}
                <ul className="mt-3 flex-1 space-y-1 text-sm text-text-secondary">
                  {plan.features.slice(0, 4).map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                  {plan.features.length > 4 ? (
                    <li className="text-xs text-text-secondary">+ {plan.features.length - 4} more</li>
                  ) : null}
                </ul>
                {plan.isCustomPricing ? (
                  <Button
                    className="mt-4"
                    variant="secondary"
                    fullWidth
                    onClick={() => {
                      window.location.href = `mailto:${COMPANY_CONTACT.email}?subject=Business%20plan%20quote`;
                    }}
                  >
                    Request a quote
                  </Button>
                ) : (
                  <Button
                    className="mt-4"
                    variant={isMostPopular && !isCurrent ? 'primary' : 'primary'}
                    fullWidth
                    loading={isChanging}
                    disabled={isCurrent || changingPlanId !== null}
                    onClick={() => void handleSelectPlan(plan)}
                  >
                    {isCurrent ? 'Current plan' : 'Switch to this plan'}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
