import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { Skeleton, SkeletonGroup } from '../../components';
import { PlanEntitlementsCard } from '../../components/PlanEntitlementsCard';
import { TdAssetCard, TdButton, TdGlassCard } from '../../components/td';
import { TD_FOCUS, cx } from '../../components/td/cx';
import { AuthAlert, AuthLink } from '../../customer/components/MarketingAuthShell';
import { listAssets, type Asset } from '../../customer/api/assets';
import { listPolicies, type Policy } from '../../customer/api/policies';
import { formatPlanPrice, listPlans, type PlanCatalogItem } from '../../customer/api/plans';
import { useCustomerAuth } from '../../customer/auth/CustomerAuthProvider';
import { assetFooter, assetIdentifier, assetStatusToTd, assetTypeToTd } from '../../customer/lib/asset-display';
import {
  formatAssetUsage,
  formatPlanTierLabel,
  formatSupportLevel,
  resolvePlanFromCatalog,
} from '../../lib/plan-catalog-display';
import { mapUserFacingError } from '../../lib/user-facing-errors';

function countRegisteredAssets(assets: Asset[]): number {
  return assets.filter((a) => a.status !== 'removed' && a.status !== 'cancelled').length;
}

/** Uppercase eyebrow for a figure or a definition term (sans, ink-muted on glass). */
const EYEBROW = 'label-sm m-0 uppercase text-td-ink-muted';
/** Router link wrapping a TdButton: the link carries focus (and the ring); the button is presentational. */
const BUTTON_LINK = cx('inline-block rounded-td-pill', TD_FOCUS);

/**
 * Customer dashboard home (Design System R5.2). Every piece of text sits on a TdGlassCard; the
 * page ground comes from CustomerDashboardLayout. Data flow, routes and states are unchanged
 * from the previous version — this is a visual restyle only.
 */
export function CustomerDashboardPage() {
  const auth = useCustomerAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [policiesRes, assetsRes] = await Promise.all([
          listPolicies({ includePlanSummary: true }),
          listAssets(),
        ]);
        if (!cancelled) {
          setPolicies(policiesRes.data);
          setAssets(assetsRes.data);
          const summary = policiesRes.data[0]?.planSummary;
          if (!summary) {
            const plansRes = await listPlans();
            if (!cancelled) setPlans(plansRes.data);
          } else if (!cancelled) {
            setPlans([]);
          }
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
  const registeredAssetCount = useMemo(
    () => planSummary?.activeAssetCount ?? countRegisteredAssets(assets),
    [planSummary, assets],
  );
  const planCatalogEntry = useMemo(
    () => (activePolicy && !planSummary ? resolvePlanFromCatalog(plans, activePolicy) : undefined),
    [activePolicy, plans, planSummary],
  );

  const planDisplayName =
    planSummary?.planName ??
    planCatalogEntry?.name ??
    (activePolicy ? formatPlanTierLabel(activePolicy.planTier) : '—');
  const planPriceLabel = planSummary?.monthlyAmountCents != null
    ? `R${(planSummary.monthlyAmountCents / 100).toFixed(0)}/month`
    : planCatalogEntry
      ? formatPlanPrice(planCatalogEntry)
      : activePolicy?.billing.amount != null
        ? `${activePolicy.billing.currency ?? 'ZAR'} ${activePolicy.billing.amount}/month`
        : null;
  const assetUsageLabel =
    planSummary?.assetUsageLabel ??
    formatAssetUsage(registeredAssetCount, planCatalogEntry?.maxAssets ?? planSummary?.maxAssets);

  if (loading) {
    // Skeleton shapes matching the hero + section-card geometry (no text, so they may sit on the ground).
    return (
      <div className="space-y-td-6">
        <Skeleton shape="rect" height={132} />
        <SkeletonGroup count={3} shape="rect" height={88} gapClassName="grid gap-4 sm:grid-cols-3" />
        <SkeletonGroup count={4} shape="rect" height={64} />
      </div>
    );
  }

  const needsSetup = policies.length === 0;
  // One primary action per page: register an asset when a policy exists, otherwise choose a plan.
  const registerVariant = activePolicy ? 'primary' : 'secondary';

  return (
    <div className="space-y-td-6">
      {/* Hero: plan, usage and account state as figures on the one hero glass surface. */}
      <TdGlassCard hero as="section" aria-labelledby="dashboard-summary-heading" className="p-td-5 sm:p-td-8">
        <h2 id="dashboard-summary-heading" className="sr-only">
          Coverage summary
        </h2>
        {error ? <AuthAlert tone="danger" className="mb-td-4">{error}</AuthAlert> : null}

        {needsSetup ? (
          <AuthAlert tone="info" className="mb-td-4">
            You have not selected a protection plan yet.{' '}
            <AuthLink to="/get-started">Complete setup</AuthLink> to register assets under your account.
          </AuthAlert>
        ) : null}

        <div className="grid gap-td-5 sm:grid-cols-3">
          <div>
            <p className={EYEBROW}>Current plan</p>
            <p className="display-md mt-td-2 text-td-ink">{planDisplayName}</p>
            {planPriceLabel ? <p className="body-sm mt-td-1 text-td-ink-muted">{planPriceLabel}</p> : null}
          </div>
          <div>
            <p className={EYEBROW}>Asset usage</p>
            <p className="figure mt-td-2 text-td-ink">{assetUsageLabel}</p>
          </div>
          <div>
            <p className={EYEBROW}>Account</p>
            <p className="display-md mt-td-2 capitalize text-td-ink">
              {auth.account?.accountState.replace(/_/g, ' ') ?? '—'}
            </p>
          </div>
        </div>
      </TdGlassCard>

      {activePolicy && planSummary?.entitlements ? (
        <PlanEntitlementsCard planName={planDisplayName} entitlements={planSummary.entitlements} />
      ) : null}

      <TdGlassCard as="section" aria-labelledby="dashboard-policy-heading">
        <h2 id="dashboard-policy-heading" className="display-md mb-td-4 text-td-ink">
          Your policy
        </h2>
        {activePolicy ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-td-4">
              <div>
                <p className="title m-0 text-td-ink">{planDisplayName}</p>
                {planCatalogEntry?.positioning ? (
                  <p className="body-sm mt-td-1 text-td-ink-muted">{planCatalogEntry.positioning}</p>
                ) : null}
                <p className="body-sm mt-td-1 text-td-ink-muted">Policy ID {activePolicy.id.slice(0, 8)}…</p>
              </div>
              <span className="label-sm rounded-td-sm bg-td-info-bg px-[10px] py-1 uppercase text-td-link">
                {activePolicy.status.replace(/_/g, ' ')}
              </span>
            </div>
            <dl className="mt-td-4 grid gap-td-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className={EYEBROW}>Monthly subscription</dt>
                <dd className="body mt-td-1 text-td-ink">{planPriceLabel ?? '—'}</dd>
              </div>
              <div>
                <dt className={EYEBROW}>Registered assets</dt>
                <dd className="body mt-td-1 text-td-ink">{assetUsageLabel}</dd>
              </div>
              {(planSummary?.supportLevel ?? planCatalogEntry?.supportLevel) ? (
                <div>
                  <dt className={EYEBROW}>Support level</dt>
                  <dd className="body mt-td-1 text-td-ink">
                    {planSummary?.supportLevel ?? formatSupportLevel(planCatalogEntry!.supportLevel!)}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className={EYEBROW}>Billing</dt>
                <dd className="body mt-td-1 capitalize text-td-ink">
                  {activePolicy.billing.billingStatus.replace(/_/g, ' ')}
                </dd>
              </div>
            </dl>
            {activePolicy.status === 'pending_activation' ? (
              <p className="body-sm mt-td-4 inline-flex items-center gap-td-2 rounded-td-md bg-td-warning-bg px-td-4 py-td-3 font-semibold text-td-warning">
                <Clock aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 flex-none" />
                Pending activation — payment integration coming soon
              </p>
            ) : null}
            <div className="mt-td-4">
              <Link to="/dashboard/plan" className={BUTTON_LINK}>
                <TdButton variant="secondary" tabIndex={-1}>
                  Change plan
                </TdButton>
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="body m-0 text-td-ink-muted">No policy on file yet.</p>
            <Link to="/get-started" className={cx(BUTTON_LINK, 'mt-td-4')}>
              <TdButton variant="primary" tabIndex={-1}>
                Choose a plan
              </TdButton>
            </Link>
          </>
        )}
      </TdGlassCard>

      <TdGlassCard as="section" aria-labelledby="dashboard-assets-heading">
        <div className="mb-td-4 flex flex-wrap items-center justify-between gap-td-3">
          <h2 id="dashboard-assets-heading" className="display-md m-0 text-td-ink">
            Protected assets
          </h2>
          <Link to="/get-started" className={BUTTON_LINK}>
            <TdButton variant={registerVariant} tabIndex={-1}>
              Register asset
            </TdButton>
          </Link>
        </div>

        {assets.length === 0 ? (
          <p className="body m-0 text-td-ink-muted">
            Register laptops, phones, vehicles and other valuables to enable recovery support.
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-td-4 p-0 sm:grid-cols-2" aria-label="Registered assets">
            {assets.map((asset) => {
              const id = assetIdentifier(asset);
              return (
                <li key={asset.id}>
                  <TdAssetCard
                    type={assetTypeToTd(asset.assetType)}
                    name={asset.displayName}
                    detailLabel={id.label}
                    identifier={id.value}
                    status={assetStatusToTd(asset.status) ?? undefined}
                    footer={assetFooter(asset)}
                    forceSolid
                    className="h-full"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </TdGlassCard>

      <TdGlassCard as="section" aria-labelledby="dashboard-mobile-heading">
        <h2 id="dashboard-mobile-heading" className="display-md mb-td-4 text-td-ink">
          Recovery &amp; mobile
        </h2>
        <p className="body m-0 text-td-ink-muted">
          Report theft, track recovery progress, and receive alerts from the TD IT Solution Insurance
          mobile app.
        </p>
        <div className="body-sm mt-td-4 flex flex-wrap gap-td-4">
          {/* Plain anchor (as before): a hash link to the marketing page, not an in-app route. */}
          <a href="/#mobile-app" className={cx('rounded-td-sm font-semibold text-td-link underline-offset-2 hover:underline', TD_FOCUS)}>
            Download the app
          </a>
          <AuthLink to="/dashboard/account">Account settings</AuthLink>
        </div>
      </TdGlassCard>
    </div>
  );
}
