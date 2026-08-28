import { useEffect, useRef } from 'react';
import { recordAnalyticsEvents } from '../api/analytics';
import { useSessionStore } from '../auth/session-store';

/**
 * Fire one deduped session_start per app launch when the customer is signed in.
 * Server dedupes further within the Africa/Johannesburg day bucket.
 */
export function useSessionAnalytics(): void {
  const status = useSessionStore((s) => s.status);
  const sentRef = useRef(false);

  useEffect(() => {
    if (status !== 'signed-in' || sentRef.current) return;
    sentRef.current = true;
    void recordAnalyticsEvents([{ eventName: 'session_start' }]).catch(() => {
      // Analytics must never block the app shell — swallow network errors.
    });
  }, [status]);
}
