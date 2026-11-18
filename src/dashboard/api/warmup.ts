import { API_HOST } from './config';

let warmed = false;

/**
 * Wake the API before the user submits. The backend runs on a plan that sleeps when idle, and the first
 * request after a quiet period waits for it to start (can be tens of seconds). Calling this when a login
 * screen opens gives the server a head start while the person types.
 *
 * Fire and forget: `no-cors` means the response is opaque and no CORS rule is needed, and any failure is
 * ignored because the real login request will surface a real error. Runs at most once per page load.
 */
export function warmUpApi(): void {
  if (warmed || typeof fetch === 'undefined') return;
  warmed = true;
  try {
    void fetch(`${API_HOST}/api/health/ready`, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => undefined);
  } catch {
    // ignore: warm-up is best effort
  }
}

/** Test hook: lets a test run the warm-up more than once. */
export function resetWarmUpForTests(): void {
  warmed = false;
}
