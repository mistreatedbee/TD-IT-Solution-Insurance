/**
 * Customer account/profile surfaces — OB-17 glass-gradient canvas + grouped
 * flat-white panels. Mirrors the mobile app's layout using existing web
 * tokens. Per the ratified OB-17 glass-blur scope (hero/header/modal only),
 * ordinary grouped rows stay flat-white-with-shadow — only the profile
 * header (see `customerSurfaceGroupHero` in CustomerSurfaceGroup.tsx) uses
 * translucent glass.
 */

/** Full-bleed OB-17 glass-gradient canvas behind account/profile content. */
export const customerCanvas =
  'font-glass -mx-4 min-h-full bg-glass-gradient px-4 pb-8 pt-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8';

/** Elevated flat-white group (borderless, soft shadow, OB-17 24px radius). */
export const customerSurfaceGroup =
  'overflow-hidden rounded-glass-card bg-glass-surface-opaque shadow-glass';

/** Standard inner padding for grouped surfaces. */
export const customerSurfacePadding = 'p-5 sm:p-6';

/** Hairline divider between rows inside a group. */
export const customerHairlineDivider = 'border-t border-hairline';

/** Uppercase section label above a grouped surface. */
export const customerSectionLabel =
  'mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-text-secondary';

/** Row inside a grouped surface. */
export const customerSurfaceRow = 'px-5 py-4 sm:px-6 sm:py-5';

/** Key/value row for account metadata (no nested bordered boxes). */
export const customerDetailRow =
  'flex flex-col gap-0.5 px-5 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:px-6';

export const customerDetailLabel = 'text-xs font-medium uppercase tracking-wide text-text-secondary';

export const customerDetailValue = 'text-sm text-text-primary';
