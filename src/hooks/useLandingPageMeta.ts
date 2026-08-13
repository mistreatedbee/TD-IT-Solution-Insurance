import { useEffect } from 'react';
import { applyLandingPageMeta } from '../lib/landing-seo';

/** Sync document title + Open Graph / Twitter meta on the landing page. */
export function useLandingPageMeta(): void {
  useEffect(() => {
    applyLandingPageMeta();
  }, []);
}
