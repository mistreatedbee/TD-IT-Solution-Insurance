/**
 * Sends branded push notifications to registered customer devices.
 */
import type { Env } from '../config/env.js';
import type { PushTokensRepo } from '../repositories/push-tokens.js';
import type { NotificationPreferencesRepo } from '../repositories/notification-preferences.js';
import {
  buildBrandedPushMessage,
  type PushTemplateId,
  type PushTemplateVariables,
} from './notification-brand.js';
import {
  buildExpoPushPayload,
  isPushEnabledForCategory,
  sendExpoPushMessages,
  type ExpoPushSendResult,
} from './expo-push.js';

export interface PushNotificationService {
  sendToAccount(params: {
    accountId: string;
    templateId: PushTemplateId;
    variables?: PushTemplateVariables;
    /**
     * [CO-OB03-1] Device ids to exclude from delivery, e.g. a reported-stolen
     * device's own `deviceId` — checked against each enabled push token's
     * `deviceId`, not the account as a whole, so other devices on the same
     * account still receive the push.
     */
    excludeDeviceIds?: string[];
  }): Promise<ExpoPushSendResult>;
}

export function createPushNotificationService(deps: {
  env: Env;
  pushTokens: PushTokensRepo;
  notificationPreferences: NotificationPreferencesRepo;
}): PushNotificationService {
  return {
    async sendToAccount({ accountId, templateId, variables, excludeDeviceIds }) {
      const content = buildBrandedPushMessage(templateId, variables);
      const prefs = await deps.notificationPreferences.getOrCreate(accountId);

      if (!isPushEnabledForCategory(prefs.channels, content.category)) {
        return { tickets: [], invalidTokens: [] };
      }

      const allTokens = await deps.pushTokens.listEnabledForAccount(accountId);
      // [CO-OB03-1] Exclusion is per-token (`deviceId`), not per-account — a
      // second device on the same account still receives the push.
      const excludeSet = new Set(excludeDeviceIds ?? []);
      const tokens = excludeSet.size === 0 ? allTokens : allTokens.filter((row) => !excludeSet.has(row.deviceId));
      if (tokens.length === 0) {
        return { tickets: [], invalidTokens: [] };
      }

      const messages = tokens.map((row) => buildExpoPushPayload(row.expoPushToken, content));
      const result = await sendExpoPushMessages(deps.env, messages);

      for (const invalidToken of result.invalidTokens) {
        const row = tokens.find((t) => t.expoPushToken === invalidToken);
        if (row) {
          await deps.pushTokens.disableForDevice(accountId, row.deviceId);
        }
      }

      return result;
    },
  };
}
