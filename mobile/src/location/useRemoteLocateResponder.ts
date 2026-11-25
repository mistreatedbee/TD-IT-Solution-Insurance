/**
 * "Locate now" - foreground side of the target phone (owner-test, FEATURE_REMOTE_LOCATE_ENABLED).
 * Mounted in the signed-in shell. Checks for open locate requests on open/resume, every
 * 2 minutes while the app is in the foreground, and immediately when a wake-up push arrives
 * while the app is open. Stops when the app leaves the foreground or the shell unmounts.
 */
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { answerPendingLocateRequests, isLocateRequestPayload, isRemoteLocateEnabled } from './remoteLocate';

export const REMOTE_LOCATE_CHECK_INTERVAL_MS = 2 * 60 * 1000;

export function useRemoteLocateResponder(): void {
  useEffect(() => {
    if (!isRemoteLocateEnabled()) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const check = () => {
      void answerPendingLocateRequests('foreground');
    };
    const start = () => {
      if (timer !== null) clearInterval(timer);
      timer = setInterval(check, REMOTE_LOCATE_CHECK_INTERVAL_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };

    if (AppState.currentState === 'active') {
      check();
      start();
    }
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        check();
        start();
      } else {
        stop();
      }
    });
    const received = Notifications.addNotificationReceivedListener?.((notification) => {
      if (isLocateRequestPayload(notification.request.content.data)) check();
    });

    return () => {
      stop();
      appState.remove();
      received?.remove();
    };
  }, []);
}
