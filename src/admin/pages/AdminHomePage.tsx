import { useEffect, useState } from 'react';
import { Card, SectionHeading, StatBlock } from '../../components';
import { useDashboardAuth } from '../../dashboard/auth/DashboardAuthProvider';
import { useHomeCount } from '../../dashboard/hooks/useHomeCount';
import { announcementsForRole } from '../../dashboard/content/homeAnnouncements';
import { HomeScreen, type HomeQuickLinkCard } from '../../dashboard/components/HomeScreen';
import { countPendingVerifications } from '../api/admin-verification';
import { getActiveAssetCount, getActiveCustomerCount, getActivePolicyCount } from '../api/admin-home-stats';
import { getAdminDau, type AdminDauResponse } from '../api/admin-analytics';

/**
 * Feature 012 — Admin Home. Owns the FR-4 fetch and the FR-2 quick-link config for this
 * role; injects both into the shared, role-agnostic `HomeScreen` as props (C-012-A1 /
 * SR-012-4) rather than letting `HomeScreen` branch on role or import an API client itself.
 *
 * The KPI row and DAU trend panel below are NOT threaded through `HomeScreen` — that
 * component is presentational-only by explicit, ESLint-enforced design constraint
 * (see its own header comment, C-012-A1/SR-012-4/AC-6) and accepts no data-fetching
 * props beyond the single `HomeQuickLinkCount` shape it already had. Composing
 * `Card`/`StatBlock` directly here, around `<HomeScreen>`, keeps that boundary intact
 * instead of extending a security-reviewed shared component's API for one role.
 */

/** Local to this page — a KPI tile with its own loading/error rendering, composed from
 * `StatBlock` rather than a new shared primitive (matches `CountBadge`'s loading/error
 * states in `HomeScreen.tsx` for visual consistency across the dashboard). */
function KpiTile({
  status,
  value,
  label,
  size = 'md',
}: {
  status: 'loading' | 'loaded' | 'error';
  value: number | null;
  label: string;
  size?: 'md' | 'lg';
}) {
  if (status !== 'loaded') {
    return (
      <div className="flex flex-col items-start text-left">
        <div
          className={`font-bold leading-none tracking-tight text-slate-300 ${
            size === 'lg' ? 'text-5xl sm:text-6xl' : 'text-4xl sm:text-5xl'
          }`}
          aria-hidden="true"
        >
          {status === 'loading' ? '···' : '—'}
        </div>
        <span className="mt-4 block h-1 w-10 rounded-full bg-slate-200" aria-hidden="true" />
        <span className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-sm">
          {status === 'loading' ? 'Loading…' : `${label} unavailable`}
        </span>
      </div>
    );
  }
  return <StatBlock size={size} value={value ?? 0} label={label} animate={false} />;
}

/** Hand-rolled inline SVG sparkline — no charting library in this codebase today, and
 * a glance-level 14-day trend doesn't need one (axes/gridlines/tooltips would be noise
 * at this size). Matches `AdminAnalyticsPage`'s existing plain-numbers DAU treatment. */
function Sparkline({ series }: { series: AdminDauResponse['series'] }) {
  const width = 280;
  const height = 56;
  const values = series.map((row) => row.distinctAccounts);
  const max = Math.max(1, ...values);
  const points = values
    .map((v, i) => {
      const x = values.length > 1 ? (i / (values.length - 1)) * width : width / 2;
      const y = height - (v / max) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  if (values.length === 0) {
    return (
      <div className="flex h-14 w-full items-center justify-center text-xs text-text-secondary">
        No data yet
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-14 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Daily active users, last 14 days"
    >
      <polyline points={points} fill="none" stroke="var(--accent-gold-deep)" strokeWidth="2" />
    </svg>
  );
}

function last14DayRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 13);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

export function AdminHomePage() {
  const { account } = useDashboardAuth();
  const pending = useHomeCount(countPendingVerifications);
  const customers = useHomeCount(getActiveCustomerCount);
  const policies = useHomeCount(getActivePolicyCount);
  const assets = useHomeCount(getActiveAssetCount);

  const [dauStatus, setDauStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [dau, setDau] = useState<AdminDauResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdminDau(last14DayRange())
      .then((data) => {
        if (cancelled) return;
        setDau(data);
        setDauStatus('loaded');
      })
      .catch(() => {
        if (cancelled) return;
        setDauStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const latestDau = dau?.series.length ? dau.series[dau.series.length - 1]!.distinctAccounts : 0;

  const cards: HomeQuickLinkCard[] = [
    {
      key: 'verification',
      to: '/admin/verification',
      title: 'Verification queue',
      description: 'Review pending identity submissions.',
      ctaText: 'Review verification queue',
      emphasis: 'primary',
      count: {
        status: pending.status,
        count: pending.count,
        formatLabel: (n) => `${n} pending`,
        zeroLabel: 'Queue clear',
        onRetry: pending.retry,
      },
    },
    {
      key: 'customers',
      to: '/admin/customers',
      title: 'Customers',
      description: 'Look up and manage customer accounts.',
      ctaText: 'View customers',
      emphasis: 'standard',
    },
    {
      key: 'staff',
      to: '/admin/staff',
      title: 'Staff',
      description: 'Manage admin, support, and security-operator accounts.',
      ctaText: 'View staff',
      emphasis: 'standard',
    },
    {
      key: 'plans',
      to: '/admin/plans',
      title: 'Plan catalog',
      description: 'Review and edit coverage plans and pricing.',
      ctaText: 'Manage plans',
      emphasis: 'standard',
    },
    {
      key: 'invite',
      to: '/admin/accounts/invite',
      title: 'Invite staff',
      description: 'Send a new admin or support agent an invitation.',
      ctaText: 'Invite a staff member',
      emphasis: 'standard',
    },
    {
      key: 'analytics',
      to: '/admin/analytics',
      title: 'Analytics',
      description: 'Full daily active user history and date-range queries.',
      ctaText: 'View full analytics',
      emphasis: 'link',
    },
  ];

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <SectionHeading as="h1" title="Overview" size="md" className="mb-4" />
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile status={pending.status} value={pending.count} label="Pending verifications" size="lg" />
          <KpiTile status={customers.status} value={customers.count} label="Active customers" />
          <KpiTile status={policies.status} value={policies.count} label="Active policies" />
          <KpiTile status={assets.status} value={assets.count} label="Registered assets" />
        </div>
      </Card>

      <Card padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <SectionHeading as="h2" title="Daily active users" size="md" className="mb-1" />
            <p className="text-sm text-text-secondary">Last 14 days, session-start events.</p>
          </div>
          <a href="/admin/analytics" className="text-sm font-medium text-primary hover:text-primary/80">
            View full analytics →
          </a>
        </div>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="shrink-0">
            <KpiTile status={dauStatus} value={latestDau} label="Latest day" />
          </div>
          <div className="flex-1">
            {dauStatus === 'loaded' ? (
              <Sparkline series={dau?.series ?? []} />
            ) : (
              <div className="flex h-14 w-full items-center text-xs text-text-secondary">
                {dauStatus === 'loading' ? 'Loading trend…' : 'Trend unavailable'}
              </div>
            )}
          </div>
        </div>
      </Card>

      <HomeScreen
        roleLabel="Admin"
        email={account?.email ?? ''}
        announcements={announcementsForRole('admin')}
        cards={cards}
        gridClassName="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      />
    </div>
  );
}
