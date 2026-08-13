/**
 * Shared SEO copy for the marketing landing page — keep index.html and
 * runtime meta updates in sync.
 */
export const LANDING_SEO = {
  documentTitle: 'TD IT Solution Insurance | Recover Your Insured Items',
  description:
    'Insurance that helps you recover your insured items. Monthly plans from R200/mo for vehicles, laptops, phones, tablets, TVs, desktops and business equipment — with GPS-assisted recovery in Nelspruit, South Africa.',
  ogTitle: 'TD IT Solution Insurance — Insurance that helps you recover your insured items',
  ogDescription:
    'Recover your insured items with monthly plans, GPS-assisted tracking and security-partner coordination. Cover vehicles, devices and business equipment — Nelspruit, South Africa.',
  twitterDescription:
    'Insurance that helps you recover your insured items. Monthly plans, GPS-assisted recovery and security-partner support across all asset types.',
  /** Bump when og-image.png changes so link previews refresh. */
  ogImageVersion: '20260813',
} as const;

export function landingOgImageUrl(origin = 'https://www.tditsolutionsinsurance.co.za'): string {
  return `${origin}/og-image.png?v=${LANDING_SEO.ogImageVersion}`;
}

function upsertMeta(
  attribute: 'name' | 'property',
  key: string,
  content: string,
): void {
  let el = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attribute, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Ensures live DOM meta tags match LANDING_SEO (SPA + dev preview safety net). */
export function applyLandingPageMeta(origin?: string): void {
  document.title = LANDING_SEO.documentTitle;
  upsertMeta('name', 'description', LANDING_SEO.description);
  upsertMeta('property', 'og:title', LANDING_SEO.ogTitle);
  upsertMeta('property', 'og:description', LANDING_SEO.ogDescription);
  upsertMeta('property', 'og:image', landingOgImageUrl(origin ?? window.location.origin));
  upsertMeta('name', 'twitter:title', LANDING_SEO.ogTitle);
  upsertMeta('name', 'twitter:description', LANDING_SEO.twitterDescription);
  upsertMeta('name', 'twitter:image', landingOgImageUrl(origin ?? window.location.origin));
}
