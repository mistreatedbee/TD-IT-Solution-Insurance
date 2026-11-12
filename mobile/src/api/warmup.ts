/**
 * Fire-and-forget backend warm-up. The production API sits on a host that
 * sleeps when idle; pinging the readiness endpoint at launch starts the
 * cold start while the user is still typing. No auth, no body, no PII;
 * all failures are ignored. Fires at most once per app session.
 */
import { API_HOST } from './config';

let fired = false;

export function warmUpBackend(): void {
  if (fired) return;
  fired = true;
  try {
    fetch(`${API_HOST}/api/health/ready`, { method: 'GET' }).catch(() => {});
  } catch {
    // ignore
  }
}

/** Test-only. */
export function _resetWarmUpForTests(): void {
  fired = false;
}
