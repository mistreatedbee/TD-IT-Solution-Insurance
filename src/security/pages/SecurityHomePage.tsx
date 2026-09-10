import { useDashboardAuth } from '../../dashboard/auth/DashboardAuthProvider';
import { useHomeCount } from '../../dashboard/hooks/useHomeCount';
import { announcementsForRole } from '../../dashboard/content/homeAnnouncements';
import { HomeScreen, type HomeQuickLinkCard } from '../../dashboard/components/HomeScreen';
import { countSecurityCases } from '../api/cases';

/**
 * Feature 012 — Security operator Home. Owns the FR-4 fetch and FR-2 quick-link config for
 * this role; injects both into the shared `HomeScreen` as props (C-012-A1 / SR-012-4).
 */
export function SecurityHomePage() {
  const { account } = useDashboardAuth();
  const open = useHomeCount(() => countSecurityCases({ status: 'open' }));

  const cards: HomeQuickLinkCard[] = [
    {
      key: 'cases',
      to: '/security/cases',
      title: 'Case queue',
      description: 'Assigned and unassigned recovery cases.',
      // Literal spec (ui-design.md §3.3) — "Go to case queue", not "Open case queue",
      // to avoid colliding with the live case-status value "open" that may sit right
      // next to it in the Badge.
      ctaText: 'Go to case queue',
      emphasis: 'standard',
      count: {
        status: open.status,
        count: open.count,
        formatLabel: (n) => `${n} open`,
        zeroLabel: 'No open cases',
        onRetry: open.retry,
      },
    },
  ];

  return (
    <HomeScreen
      roleLabel="Security Partner Operator"
      email={account?.email ?? ''}
      announcements={announcementsForRole('security_company_operator')}
      cards={cards}
      gridClassName="grid grid-cols-1 gap-4 max-w-md lg:max-w-lg"
    />
  );
}
