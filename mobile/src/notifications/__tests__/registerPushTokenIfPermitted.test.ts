import * as Notifications from 'expo-notifications';
import { registerPushToken } from '../../api/notifications';
import { registerPushTokenIfPermitted } from '../push';

jest.mock('../../api/notifications', () => ({
  registerPushToken: jest.fn(async () => ({})),
  revokePushToken: jest.fn(async () => undefined),
}));
jest.mock('../../auth/device', () => ({ getOrCreateDeviceId: jest.fn(async () => 'device-1') }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'proj-1' } } } },
}));

describe('registerPushTokenIfPermitted', () => {
  beforeEach(() => jest.clearAllMocks());

  it('never shows a permission dialog and registers nothing when not granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false, canAskAgain: true });
    await expect(registerPushTokenIfPermitted()).resolves.toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('registers through the Feature 007 push-token client when already granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: true });
    await expect(registerPushTokenIfPermitted()).resolves.toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(registerPushToken).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'device-1', expoPushToken: 'ExponentPushToken[test]' }),
    );
  });
});
