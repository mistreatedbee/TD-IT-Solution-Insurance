import '@testing-library/jest-dom/vitest';

// jsdom has no IntersectionObserver. `StatBlock` (src/components/StatBlock)
// calls framer-motion's `useInView` unconditionally — even with `animate={false}`
// — so any test rendering a page that uses StatBlock needs this polyfilled,
// not just pages that explicitly animate. A no-op stub is sufficient: tests
// don't depend on real viewport-intersection timing, only that mounting
// doesn't throw.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
}
