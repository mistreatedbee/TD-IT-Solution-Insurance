import { useEffect } from 'react';

/**
 * Calls `onAdvance` once, `dwellMs` after the active slide settles, while `enabled` is true.
 * Any change of `index` or `cycle` (bumped after a manual swipe) restarts the wait, so a slide is never cut short.
 * It never advances past the last slide.
 */
export function useAutoAdvance({
  enabled,
  index,
  count,
  dwellMs,
  cycle = 0,
  onAdvance,
}: {
  enabled: boolean;
  index: number;
  count: number;
  dwellMs: number;
  cycle?: number;
  onAdvance: (next: number) => void;
}): void {
  useEffect(() => {
    if (!enabled || index >= count - 1) return;
    const id = setTimeout(() => onAdvance(index + 1), dwellMs);
    return () => clearTimeout(id);
  }, [enabled, index, count, dwellMs, cycle, onAdvance]);
}
