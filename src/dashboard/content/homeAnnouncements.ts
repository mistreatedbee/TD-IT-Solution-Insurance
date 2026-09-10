/**
 * Feature 012 — FR-3 static staff announcements.
 *
 * Per `docs/features/012-employee-dashboard/business-requirements.md` §3.1 and
 * `ui-design.md` §3.2: v1 ships with **no backend notices feature**. This file is the
 * entire content source — a versioned, PR-reviewed constant, not an API response.
 *
 * Governance (carried forward, not enforced by code): any PR touching this file requires
 * `product-manager` (or delegate) review before merge — same bar as customer-facing copy —
 * per business-requirements.md §3.1's amendment and ui-design.md §3.2's governance note.
 *
 * Content rule (security-review.md §10 item 12, SR-012-4 item 4): plain text only. No
 * markdown, no HTML, no links. `HomeScreen` renders `text` as a plain string child of
 * `InlineAlert` — it is never interpreted as markup.
 */
export type StaffRole = 'admin' | 'security_company_operator' | 'support_agent';

export interface HomeAnnouncement {
  /** Stable key, e.g. "2026-09-maintenance". */
  id: string;
  /** Plain text only — no markdown/HTML, no links. */
  text: string;
  /** Omit = shown to all three roles; present = shown only to the listed roles. */
  roles?: StaffRole[];
}

/** Empty by default — PR-reviewed additions only, see governance note above. */
export const HOME_ANNOUNCEMENTS: HomeAnnouncement[] = [];

/** FR-3's permitted role-branch (security-review.md §10 item 12 / SR-012-4 item 3). */
export function announcementsForRole(role: StaffRole): HomeAnnouncement[] {
  return HOME_ANNOUNCEMENTS.filter((a) => !a.roles || a.roles.includes(role));
}
