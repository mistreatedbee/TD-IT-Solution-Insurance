import { useDashboardAuth } from '../../dashboard/auth/DashboardAuthProvider';
import { useHomeCount } from '../../dashboard/hooks/useHomeCount';
import { announcementsForRole } from '../../dashboard/content/homeAnnouncements';
import { HomeScreen, type HomeQuickLinkCard } from '../../dashboard/components/HomeScreen';
import { countPendingVerifications } from '../api/admin-verification';

/**
 * Feature 012 — Admin Home. Owns the FR-4 fetch and the FR-2 quick-link config for this
 * role; injects both into the shared, role-agnostic `HomeScreen` as props (C-012-A1 /
 * SR-012-4) rather than letting `HomeScreen` branch on role or import an API client itself.
 */
export function AdminHomePage() {
  const { account } = useDashboardAuth();
  const pending = useHomeCount(countPendingVerifications);

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
      key: 'analytics',
      to: '/admin/analytics',
      title: 'Analytics',
      description: 'Daily active user trends.',
      ctaText: 'View analytics',
      emphasis: 'link',
    },
  ];

  return (
    <HomeScreen
      roleLabel="Admin"
      email={account?.email ?? ''}
      announcements={announcementsForRole('admin')}
      cards={cards}
      gridClassName="grid grid-cols-1 gap-4 lg:grid-cols-3"
      cardSpanClassName={{ verification: 'lg:col-span-2' }}
    />
  );
}
