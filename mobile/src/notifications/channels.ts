/**
 * Android channels + iOS notification categories (Feature 007).
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { PUSH_BRAND, PUSH_CATEGORIES, type PushCategoryId } from './brand';

const ANDROID_CHANNEL_CONFIG: Record<
  PushCategoryId,
  { importance: Notifications.AndroidImportance; lightColor: string; vibrationPattern?: number[] }
> = {
  theft_critical: {
    importance: Notifications.AndroidImportance.MAX,
    lightColor: PUSH_BRAND.accent,
    vibrationPattern: [0, 300, 150, 300],
  },
  device_status: {
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: PUSH_BRAND.secondary,
  },
  billing: {
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: PUSH_BRAND.primaryMid,
  },
  account: {
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: PUSH_BRAND.secondary,
  },
  claims: {
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: PUSH_BRAND.primaryMid,
  },
  general: {
    importance: Notifications.AndroidImportance.LOW,
    lightColor: PUSH_BRAND.primaryMid,
  },
  marketing: {
    importance: Notifications.AndroidImportance.LOW,
    lightColor: PUSH_BRAND.accent,
  },
};

export async function configureBrandedNotificationChannels(): Promise<void> {
  if (Platform.OS === 'android') {
    for (const category of PUSH_CATEGORIES) {
      const config = ANDROID_CHANNEL_CONFIG[category.id];
      await Notifications.setNotificationChannelAsync(category.id, {
        name: category.name,
        description: category.description,
        importance: config.importance,
        lightColor: config.lightColor,
        vibrationPattern: config.vibrationPattern,
        enableVibrate: true,
        showBadge: true,
      });
    }
    return;
  }

  if (Platform.OS === 'ios') {
    for (const category of PUSH_CATEGORIES) {
      await Notifications.setNotificationCategoryAsync(category.id, [
        {
          identifier: 'OPEN',
          buttonTitle: 'Open',
          options: { opensAppToForeground: true },
        },
      ]);
    }
  }
}
