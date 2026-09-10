import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { HomeScreen, type HomeQuickLinkCard } from './HomeScreen';

function renderHome(props: Partial<React.ComponentProps<typeof HomeScreen>> = {}) {
  return render(
    <MemoryRouter>
      <HomeScreen
        roleLabel="Admin"
        email="operator@example.com"
        announcements={[]}
        cards={[]}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('HomeScreen — FR-1 identity greeting (AC-2)', () => {
  it('renders the signed-in email and role label from props, no fetch involved', () => {
    renderHome({ roleLabel: 'Security Partner Operator', email: 'ops@partner.example' });
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText(/Signed in as ops@partner\.example · Security Partner Operator/)).toBeInTheDocument();
  });
});

describe('HomeScreen — FR-3 announcements (AC-4)', () => {
  it('renders nothing — no heading, no empty box — when announcements is empty', () => {
    const { container } = renderHome({ announcements: [] });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('renders one InlineAlert per announcement as plain text when present', () => {
    renderHome({
      announcements: [
        { id: 'a1', text: 'Scheduled maintenance Sunday 2am-4am.' },
        { id: 'a2', text: 'New SAPS case-number field now required.' },
      ],
    });
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent('Scheduled maintenance Sunday 2am-4am.');
    expect(alerts[1]).toHaveTextContent('New SAPS case-number field now required.');
  });
});

describe('HomeScreen — FR-2/FR-4 quick-link cards + counts (AC-3, AC-9)', () => {
  it('renders every card as a navigable link to an existing route, whole-card focus stop', () => {
    const cards: HomeQuickLinkCard[] = [
      {
        key: 'verification',
        to: '/admin/verification',
        title: 'Verification queue',
        description: 'Review pending identity submissions.',
        ctaText: 'Review verification queue',
        emphasis: 'primary',
        count: { status: 'loaded', count: 14, formatLabel: (n) => `${n} pending`, zeroLabel: 'Queue clear' },
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
    renderHome({ cards });

    const verificationLink = screen.getByRole('link', { name: /Verification queue/ });
    expect(verificationLink).toHaveAttribute('href', '/admin/verification');
    expect(screen.getByText('14 pending')).toBeInTheDocument();

    const analyticsLink = screen.getByRole('link', { name: /View analytics/ });
    expect(analyticsLink).toHaveAttribute('href', '/admin/analytics');
  });

  it('renders a zero count as a real, positive state — not an "empty" state', () => {
    renderHome({
      cards: [
        {
          key: 'cases',
          to: '/security/cases',
          title: 'Case queue',
          description: 'Assigned and unassigned recovery cases.',
          ctaText: 'Go to case queue',
          emphasis: 'standard',
          count: { status: 'loaded', count: 0, formatLabel: (n) => `${n} open`, zeroLabel: 'No open cases' },
        },
      ],
    });
    expect(screen.getByText('No open cases')).toBeInTheDocument();
  });

  it('shows a loading placeholder while the count is in flight', () => {
    renderHome({
      cards: [
        {
          key: 'cases',
          to: '/security/cases',
          title: 'Case queue',
          description: 'desc',
          ctaText: 'Go to case queue',
          emphasis: 'standard',
          count: { status: 'loading', count: null, formatLabel: (n) => `${n} open` },
        },
      ],
    });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('AC-9: on error, shows a neutral placeholder + retry, and the card link still navigates', () => {
    const onRetry = vi.fn();
    renderHome({
      cards: [
        {
          key: 'verification',
          to: '/admin/verification',
          title: 'Verification queue',
          description: 'desc',
          ctaText: 'Review verification queue',
          emphasis: 'primary',
          count: { status: 'error', count: null, formatLabel: (n) => `${n} pending`, onRetry },
        },
      ],
    });

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Count unavailable')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /Verification queue/ });
    expect(link).toHaveAttribute('href', '/admin/verification');

    screen.getByRole('button', { name: 'Retry' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
