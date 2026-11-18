import { useEffect, useState } from 'react';

/**
 * True once `active` has stayed true for `afterMs`. Used to explain a long wait (for example a server
 * waking up) instead of leaving a lone spinner. Resets as soon as `active` goes false.
 */
export function useSlowRequestHint(active: boolean, afterMs = 4000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), afterMs);
    return () => clearTimeout(t);
  }, [active, afterMs]);
  return slow;
}

export const SLOW_LOGIN_MESSAGE =
  'Still signing you in. The server may be waking up after a quiet period, which can take up to a minute the first time. Please keep this page open.';
