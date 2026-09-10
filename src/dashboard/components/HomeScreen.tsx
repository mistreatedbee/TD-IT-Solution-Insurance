import { Link } from 'react-router-dom';
import { ArrowRightIcon } from 'lucide-react';
import { Badge, Card, SectionHeading } from '../../components';
import { InlineAlert } from './ui';
import type { HomeAnnouncement } from '../content/homeAnnouncements';

/**
 * Feature 012 — Shared Employee Home screen.
 *
 * Structural non-negotiable (business-requirements.md §9.2 C-012-A1, re-affirmed as
 * SR-012-4 at Stage 8): this module is **presentational only**. It receives the signed-in
 * account's identity, announcements, and quick-link/count configuration entirely as props
 * from the role's own route file (`src/admin`, `src/security`, `src/call-centre`) — it does
 * not call, import, or know about any role's API client, directly or transitively. The
 * *only* role-branching permitted inside this file is the two the security review names
 * explicitly harmless (SR-012-4 item 3): none live here at all — even the FR-1 label
 * lookup and the FR-3 role filter are resolved by the caller (each role's Home wrapper
 * page + `announcementsForRole`) before this component ever sees them, which is a stronger
 * (not weaker) reading of that permission.
 *
 * Enforced as a build error by the `no-restricted-imports` override in `.eslintrc.cjs`
 * (scoped to `src/dashboard/**`, not just this file — see CTO-2,
 * `docs/features/012-employee-dashboard/cto-review.md` §1.2(b)/§2.1), which fails
 * `eslint` on any import of a `src/admin/**`, `src/security/**`, or `src/call-centre/**`
 * module from this file or from `src/dashboard/hooks/useHomeCount.ts` /
 * `src/dashboard/content/homeAnnouncements.ts` — the AC-6 guarantee this component
 * exists to make structural, not just reviewed. That rule catches only **direct**
 * imports (ESLint cannot see transitive import graphs), so it is not a guarantee
 * against a role-specific import arriving indirectly through some other module these
 * files import.
 */

export interface HomeQuickLinkCount {
  status: 'loading' | 'loaded' | 'error';
  count: number | null;
  /** e.g. `(n) => \`${n} pending\`` */
  formatLabel: (count: number) => string;
  /** Copy shown when the loaded count is exactly 0 (a real, positive state — not "no data"). */
  zeroLabel?: string;
  /** Single-shot, user-initiated retry only (SR-012-3.3) — never auto-retried by this component. */
  onRetry?: () => void;
}

export interface HomeQuickLinkCard {
  key: string;
  to: string;
  title: string;
  description: string;
  ctaText: string;
  /**
   * 'primary' — bordered `Card`, carries the visual weight (admin's verification queue).
   * 'standard' — bordered `Card`, equal weight to its siblings (security's one card,
   *   call-centre's two cards).
   * 'link' — no `Card`; a plain, lighter-weight text row (admin's "View analytics").
   */
  emphasis: 'primary' | 'standard' | 'link';
  count?: HomeQuickLinkCount;
}

export interface HomeScreenProps {
  roleLabel: string;
  email: string;
  announcements: HomeAnnouncement[];
  cards: HomeQuickLinkCard[];
  /**
   * Tailwind grid classes for the quick-link section container. Purely presentational
   * layout configuration supplied by the mounting route (each role's own arrangement
   * differs per `ui-design.md` §3.3) — carries no data and no role logic.
   */
  gridClassName?: string;
  /** Optional per-card grid-cell className, keyed by card `key` (e.g. `lg:col-span-2`). */
  cardSpanClassName?: Record<string, string>;
}

function CountBadge({ count }: { count: HomeQuickLinkCount }) {
  if (count.status === 'loading') {
    return <Badge tone="neutral">Loading…</Badge>;
  }
  if (count.status === 'error') {
    // Only the neutral "count unavailable" badge renders here. The Retry control is
    // deliberately *not* rendered as a child of this badge (see `QuickLinkCard` below):
    // the whole card is wrapped in a `<Link>`, and a `<button>` nested inside an `<a>`
    // is invalid per the HTML5 content model and a screen-reader footgun (CTO-1,
    // `docs/features/012-employee-dashboard/cto-review.md` §2.2 / `qa-report.md` §8.4).
    return (
      <Badge tone="neutral">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Count unavailable</span>
      </Badge>
    );
  }
  // status === 'loaded'
  const n = count.count ?? 0;
  if (n === 0) {
    return <Badge tone="emerald">{count.zeroLabel ?? count.formatLabel(0)}</Badge>;
  }
  return <Badge tone="gold">{count.formatLabel(n)}</Badge>;
}

function QuickLinkCard({
  card,
  spanClassName,
}: {
  card: HomeQuickLinkCard;
  spanClassName?: string;
}) {
  if (card.emphasis === 'link') {
    return (
      <Link
        to={card.to}
        className={`group flex flex-col justify-center rounded-2xl border border-transparent px-1 py-2 text-text-secondary transition-colors hover:text-primary ${spanClassName ?? ''}`}
      >
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          {card.ctaText}
          <ArrowRightIcon
            aria-hidden="true"
            className="h-4 w-4 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-1"
          />
        </span>
        <span className="mt-1 text-xs text-text-secondary">{card.description}</span>
      </Link>
    );
  }

  // CTO-1 (`cto-review.md` §2.2, `qa-report.md` §8.4): the FR-4 error-state Retry
  // control must not be a DOM descendant of the whole-card `<Link>` — interactive
  // content nested inside interactive content is invalid HTML5 and a plausible
  // screen-reader trap. Retry is rendered here as a *sibling* of the `<Link>`,
  // positioned to sit visually where the count badge already is (top-right of the
  // card's padded area), rather than inside the anchor. This only changes markup for
  // the (rare, transient) error state — every other state keeps the exact whole-card
  // `<Link>` structure `ui-design.md` §3.3/§4.2 specifies.
  const retry = card.count?.status === 'error' ? card.count.onRetry : undefined;

  return (
    <div className={`relative ${spanClassName ?? ''}`}>
      <Link to={card.to} className="block">
        <Card padding="lg" interactive as="div">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold text-text-primary">{card.title}</h3>
            {card.count ? <CountBadge count={card.count} /> : null}
          </div>
          <p className="mt-2 text-sm text-text-secondary">{card.description}</p>
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            {card.ctaText}
            <ArrowRightIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
          </p>
        </Card>
      </Link>
      {retry ? (
        <button
          type="button"
          onClick={() => retry()}
          className="absolute right-8 top-8 text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function HomeScreen({
  roleLabel,
  email,
  announcements,
  cards,
  gridClassName = 'grid grid-cols-1 gap-4',
  cardSpanClassName,
}: HomeScreenProps) {
  return (
    <div className="space-y-8">
      <div>
        <SectionHeading as="h1" title="Welcome back" size="md" className="mb-1" />
        <p className="text-sm text-text-secondary">
          Signed in as {email} · {roleLabel}
        </p>
      </div>

      {announcements.length > 0 ? (
        <div className="space-y-3">
          {announcements.map((a) => (
            <InlineAlert key={a.id} tone="info">
              {a.text}
            </InlineAlert>
          ))}
        </div>
      ) : null}

      <div className={gridClassName}>
        {cards.map((card) => (
          <QuickLinkCard key={card.key} card={card} spanClassName={cardSpanClassName?.[card.key]} />
        ))}
      </div>
    </div>
  );
}
