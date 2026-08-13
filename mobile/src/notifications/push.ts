/**
 * Feature 007 — Expo push notification registration (customer mobile).
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken, revokePushToken, type PushPlatform } from '../api/notifications';
import { getOrCreateDeviceId } from '../auth/device';
import { PUSH_BRAND } from './brand';
import { configureBrandedNotificationChannels } from './channels';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const category = notification.request.content.data?.category;
    const isCritical = category === 'theft_critical';

    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: isCritical,
    };
  },
});

function resolvePlatform(): PushPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'unknown';
}

export async function requestPushPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    return false;
  }

  await configureBrandedNotificationChannels();

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  return requested.granted === true;
}

export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export async function syncPushTokenWithBackend(): Promise<void> {
  const granted = await requestPushPermissions();
  if (!granted) return;

  const expoPushToken = await getExpoPushToken();
  if (!expoPushToken) return;

  const deviceId = await getOrCreateDeviceId();
  await registerPushToken({
    deviceId,
    expoPushToken,
    platform: resolvePlatform(),
    appVersion: Constants.expoConfig?.version ?? null,
  });
}

export async function revokePushTokenFromBackend(): Promise<void> {
  const deviceId = await getOrCreateDeviceId();
  await revokePushToken(deviceId);
}

/** Brand metadata attached to locally scheduled notifications (if used). */
export function brandedNotificationContent(title: string, body: string) {
  return {
    title,
    body,
    subtitle: PUSH_BRAND.name,
    data: {
      brand: PUSH_BRAND.name,
      logoUrl: PUSH_BRAND.logoUrl,
      brandColor: PUSH_BRAND.primaryMid,
    },
  };
}
