/**
 * Single source of truth for "was this a network-layer failure, not a real API response"
 * on web. The browser `fetch` API rejects with an untyped `Error` (usually a `TypeError`)
 * for everything from DNS failure to a genuinely mid-flight dropped connection, so this is
 * necessarily a heuristic substring match on known cross-browser rejection messages — the
 * same heuristic `mapNetworkLike` in `user-facing-errors.ts` used before being refactored to
 * call this function instead. Do not duplicate this list elsewhere.
 *
 * This is the web analogue of `err instanceof NetworkUnavailableError` on mobile
 * (`mobile/src/api/errors.ts`).
 */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('network request failed')
  );
}
