/**
 * Customer account/profile surfaces — warm canvas + grouped white panels.
 * Mirrors the mobile app's Material-style layout using existing web tokens.
 */

/** Full-bleed warm canvas behind account/profile content. */
export const customerCanvas =
  '-mx-4 min-h-full bg-background-pattern px-4 pb-8 pt-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8';

/** Elevated white group (borderless, soft shadow). */
export const customerSurfaceGroup =
  'overflow-hidden rounded-2xl bg-background shadow-resting';

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
