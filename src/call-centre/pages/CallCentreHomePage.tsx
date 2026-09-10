import { useDashboardAuth } from '../../dashboard/auth/DashboardAuthProvider';
import { useHomeCount } from '../../dashboard/hooks/useHomeCount';
import { announcementsForRole } from '../../dashboard/content/homeAnnouncements';
import { HomeScreen, type HomeQuickLinkCard } from '../../dashboard/components/HomeScreen';
import { countMySupportCases } from '../api/support-cases';

/**
 * Feature 012 — Call centre Home. Owns the FR-4 fetch and FR-2 quick-link config for this
 * role; injects both into the shared `HomeScreen` as props (C-012-A1 / SR-012-4).
 */
export function CallCentreHomePage() {
  const { account } = useDashboardAuth();
  const myOpen = useHomeCount(() => countMySupportCases({ status: 'open' }));

  const cards: HomeQuickLinkCard[] = [
    {
      key: 'lookup',
      to: '/call-centre/lookup',
      title: 'Look up a customer',
      description: 'Find a caller by email, policy, or phone.',
      ctaText: 'Look up a customer',
      emphasis: 'standard',
    },
    {
      key: 'cases',
      to: '/call-centre/cases',
      title: 'My cases',
      description: 'Support cases assigned to you that are still open.',
      ctaText: 'My cases',
      emphasis: 'standard',
      count: {
        status: myOpen.status,
        count: myOpen.count,
        formatLabel: (n) => `${n} open`,
        zeroLabel: 'No open cases',
        onRetry: myOpen.retry,
      },
    },
  ];

  return (
    <HomeScreen
      roleLabel="Call Centre Agent"
      email={account?.email ?? ''}
      announcements={announcementsForRole('support_agent')}
      cards={cards}
      gridClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
    />
  );
}
