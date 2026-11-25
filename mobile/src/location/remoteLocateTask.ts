/**
 * "Locate now" push wake-up (owner-test, FEATURE_REMOTE_LOCATE_ENABLED). Imported from the app
 * entry (`mobile/entry.ts`) so the task is defined at module scope before the root component
 * registers: Android may start the JS runtime headlessly just to deliver the data-only push.
 * iOS is not relied on (silent pushes are throttled and background location from one is not
 * dependable); there the phone answers on its next open/periodic check-in.
 */
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { answerPendingLocateRequests, isLocateRequestPayload, isRemoteLocateEnabled } from './remoteLocate';

export const REMOTE_LOCATE_NOTIFICATION_TASK = 'td-insurance-remote-locate';

export async function runRemoteLocateNotificationTask(body: { data?: unknown; error?: unknown }): Promise<void> {
  try {
    if (body.error || !isLocateRequestPayload(body.data)) return;
    await answerPendingLocateRequests(AppState.currentState === 'active' ? 'foreground' : 'background');
  } catch {
    // A task body must never throw into the native side.
  }
}

if (isRemoteLocateEnabled()) {
  TaskManager.defineTask(REMOTE_LOCATE_NOTIFICATION_TASK, (body) =>
    runRemoteLocateNotificationTask(body as { data?: unknown; error?: unknown }),
  );
  void Promise.resolve()
    .then(() => Notifications.registerTaskAsync(REMOTE_LOCATE_NOTIFICATION_TASK))
    .catch(() => undefined);
}
