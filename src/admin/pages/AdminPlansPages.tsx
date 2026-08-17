import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, Input, SectionHeading } from '../../components';
import { DataTable, DetailGrid, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import {
  formatPlanPrice,
  listAdminPlans,
  updateAdminPlan,
  type AdminPlanCatalogItem,
  type UpdateAdminPlanRequest,
} from '../api/admin-plans';
import { AdminNavLink } from '../layout/AdminLayout';
import { mapUserFacingError } from '../../lib/user-facing-errors';

const ACCOUNT_TYPE_OPTIONS = ['individual', 'business', 'both'] as const;

export function PlansListPage() {
  const [rows, setRows] = useState<AdminPlanCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAdminPlans()
      .then((res) => {
        if (!cancelled) setRows(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(mapUserFacingError(err, { context: 'admin' }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title="Insurance plans" size="md" className="mb-2" />
      <p className="mb-4 text-sm text-text-secondary">
        Configure pricing, asset limits, and visibility for customer onboarding plan cards.
      </p>
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            {
              key: 'name',
              header: 'Plan',
              render: (row) => (
                <AdminNavLink to={`/admin/plans/${row.id}`}>{String(row.name)}</AdminNavLink>
              ),
            },
            { key: 'slug', header: 'Slug' },
            {
              key: 'price',
              header: 'Price',
              render: (row) => formatPlanPrice(row as unknown as AdminPlanCatalogItem),
            },
            {
              key: 'maxAssets',
              header: 'Max assets',
              render: (row) => {
                const plan = row as unknown as AdminPlanCatalogItem;
                return plan.maxAssets == null ? '—' : String(plan.maxAssets);
              },
            },
            {
              key: 'isActive',
              header: 'Status',
              render: (row) => (
                <StatusBadge value={(row as unknown as AdminPlanCatalogItem).isActive ? 'active' : 'inactive'} />
              ),
            },
            { key: 'sortOrder', header: 'Order' },
          ]}
          rows={rows.map((row) => row as unknown as Record<string, unknown>)}
        />
      )}
    </Card>
  );
}

export function PlanEditPage({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<AdminPlanCatalogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [maxAssets, setMaxAssets] = useState('');
  const [monthlyPrice, setMonthlyPrice] = useState('');
  const [isCustomPricing, setIsCustomPricing] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState('0');
  const [features, setFeatures] = useState<string[]>([]);
  const [accountTypes, setAccountTypes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    listAdminPlans()
      .then((res) => {
        const found = res.data.find((p) => p.id === planId) ?? null;
        if (cancelled) return;
        if (!found) {
          setError('Plan not found.');
          setLoading(false);
          return;
        }
        setPlan(found);
        setName(found.name);
        setTagline(found.tagline);
        setMaxAssets(found.maxAssets == null ? '' : String(found.maxAssets));
        setMonthlyPrice(
          found.monthlyAmountCents == null ? '' : String(found.monthlyAmountCents / 100),
        );
        setIsCustomPricing(found.isCustomPricing);
        setIsActive(found.isActive);
        setSortOrder(String(found.sortOrder));
        setFeatures([...found.features]);
        setAccountTypes([...found.accountTypes]);
      })
      .catch((err) => {
        if (!cancelled) setError(mapUserFacingError(err, { context: 'admin' }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  function toggleAccountType(type: (typeof ACCOUNT_TYPE_OPTIONS)[number]) {
    setAccountTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  function updateFeature(index: number, value: string) {
    setFeatures((prev) => prev.map((f, i) => (i === index ? value : f)));
  }

  function addFeature() {
    setFeatures((prev) => [...prev, '']);
  }

  function removeFeature(index: number) {
    setFeatures((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);

    const trimmedName = name.trim();
    const trimmedTagline = tagline.trim();
    if (!trimmedName || !trimmedTagline) {
      setError('Name and tagline are required.');
      return;
    }

    const patch: UpdateAdminPlanRequest = {
      name: trimmedName,
      tagline: trimmedTagline,
      isCustomPricing,
      isActive,
      sortOrder: Number.parseInt(sortOrder, 10) || 0,
      features: features.map((f) => f.trim()).filter(Boolean),
      accountTypes: accountTypes as UpdateAdminPlanRequest['accountTypes'],
    };

    if (isCustomPricing) {
      patch.maxAssets = maxAssets.trim() ? Number.parseInt(maxAssets, 10) : null;
      patch.monthlyAmountCents = null;
    } else {
      const max = maxAssets.trim() ? Number.parseInt(maxAssets, 10) : null;
      const price = monthlyPrice.trim() ? Math.round(Number.parseFloat(monthlyPrice) * 100) : null;
      if (maxAssets.trim() && (max == null || max <= 0)) {
        setError('Max assets must be a positive number.');
        return;
      }
      if (monthlyPrice.trim() && (price == null || price < 0 || Number.isNaN(price))) {
        setError('Monthly price must be a valid amount in ZAR.');
        return;
      }
      patch.maxAssets = max;
      patch.monthlyAmountCents = price;
    }

    setSaving(true);
    try {
      const updated = await updateAdminPlan(planId, patch);
      setPlan(updated);
      setSuccess('Plan updated.');
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card padding="lg">
        <LoadingState />
      </Card>
    );
  }

  if (!plan) {
    return (
      <Card padding="lg">
        <InlineAlert tone="danger">{error ?? 'Plan not found.'}</InlineAlert>
        <Link to="/admin/plans" className="mt-4 inline-block text-sm text-primary hover:underline">
          Back to plans
        </Link>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title={`Edit plan — ${plan.name}`} size="md" className="mb-4" />
      <Link to="/admin/plans" className="mb-6 inline-block text-sm text-primary hover:underline">
        ← Back to plans
      </Link>

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {success ? <InlineAlert tone="info">{success}</InlineAlert> : null}

      <div className="mb-6">
        <DetailGrid
          rows={[
            { label: 'ID', value: plan.id },
            { label: 'Slug', value: plan.slug },
            { label: 'Currency', value: plan.currency },
            { label: 'Updated', value: new Date(plan.updatedAt).toLocaleString() },
          ]}
        />
      </div>

      <div className="space-y-4">
        <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} required />

        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" checked={isCustomPricing} onChange={(e) => setIsCustomPricing(e.target.checked)} />
          Custom pricing (enterprise-style — no fixed monthly price)
        </label>

        {!isCustomPricing ? (
          <Input
            label="Monthly price (ZAR)"
            value={monthlyPrice}
            onChange={(e) => setMonthlyPrice(e.target.value)}
            hint="Whole rands — stored as cents on the server."
          />
        ) : null}

        <Input
          label="Max assets"
          value={maxAssets}
          onChange={(e) => setMaxAssets(e.target.value)}
          hint="Leave empty for unlimited / quote-only plans."
        />

        <Input label="Sort order" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />

        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active (visible to customers on onboarding)
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-text-primary">Account types</legend>
          <div className="flex flex-wrap gap-4">
            {ACCOUNT_TYPE_OPTIONS.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm capitalize text-text-secondary">
                <input
                  type="checkbox"
                  checked={accountTypes.includes(type)}
                  onChange={() => toggleAccountType(type)}
                />
                {type}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-text-primary">Features (bullet list)</legend>
          <div className="space-y-2">
            {features.map((feature, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  label={`Feature ${index + 1}`}
                  value={feature}
                  onChange={(e) => updateFeature(index, e.target.value)}
                  className="flex-1"
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => removeFeature(index)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={addFeature}>
            Add feature
          </Button>
        </fieldset>
      </div>

      <div className="mt-8 flex gap-3">
        <Button loading={saving} onClick={() => void handleSave()}>
          Save changes
        </Button>
        <Link to="/admin/plans">
          <Button variant="secondary">Cancel</Button>
        </Link>
      </div>
    </Card>
  );
}

export function PlanEditRoute() {
  const { planId } = useParams();
  if (!planId) return <NavigateToPlans />;
  return <PlanEditPage planId={planId} />;
}

function NavigateToPlans() {
  return (
    <Card padding="lg">
      <InlineAlert tone="danger">Missing plan id.</InlineAlert>
      <Link to="/admin/plans" className="mt-4 inline-block text-sm text-primary hover:underline">
        Back to plans
      </Link>
    </Card>
  );
}
