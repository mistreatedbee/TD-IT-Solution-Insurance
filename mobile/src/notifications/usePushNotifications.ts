/**
 * Registers push notifications when the customer enters the authenticated app shell.
 */
import { useEffect } from 'react';
import { syncPushTokenWithBackend } from './push';

export function usePushNotifications(): void {
  useEffect(() => {
    syncPushTokenWithBackend().catch(() => {
      // Non-blocking — permission denied or no EAS projectId in local dev.
    });
  }, []);
}
