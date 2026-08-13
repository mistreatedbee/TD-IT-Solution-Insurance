/**
 * Mobile app store links — optional until App Store / Play listings go live.
 * Set in Vercel (or .env locally) when URLs are available:
 *   VITE_IOS_APP_STORE_URL
 *   VITE_ANDROID_PLAY_STORE_URL
 */
export const MOBILE_APP = {
  name: 'TD IT Solution Insurance',
  shortLabel: 'Mobile Asset Tracking App',
  iosBundleId: 'co.za.tditsolutions.insurance',
  androidPackage: 'co.za.tditsolutions.insurance',
  iosStoreUrl: import.meta.env.VITE_IOS_APP_STORE_URL as string | undefined,
  androidStoreUrl: import.meta.env.VITE_ANDROID_PLAY_STORE_URL as string | undefined,
} as const;

export function hasMobileStoreLinks(): boolean {
  return Boolean(MOBILE_APP.iosStoreUrl || MOBILE_APP.androidStoreUrl);
}

export function scrollToMobileAppSection() {
  document.getElementById('mobile-app')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
