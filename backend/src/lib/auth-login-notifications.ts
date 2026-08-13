/**
 * After successful login — detect first-seen device and notify (AUTH-008).
 */
import type { SessionRepo } from './refresh-session.js';
import type { AuthNotificationService } from './auth-notification-service.js';
import { notifyInBackground } from './customer-notification-service.js';

export async function notifyNewDeviceLoginIfNeeded(
  deps: {
    sessions: SessionRepo;
    authNotifications: AuthNotificationService;
  },
  params: {
    accountId: string;
    userType: string;
    deviceId: string | null;
    deviceName: string | null;
    ipAddress: string | null;
  },
): Promise<void> {
  if (!params.deviceId) return;

  const seenBefore = await deps.sessions.hasPriorSessionForDevice(params.accountId, params.deviceId);
  if (seenBefore) return;

  notifyInBackground(
    'auth.login.new_device',
    deps.authNotifications.notifyNewDeviceLogin({
      accountId: params.accountId,
      userType: params.userType,
      deviceName: params.deviceName,
      ipAddress: params.ipAddress,
    }),
  );
}
