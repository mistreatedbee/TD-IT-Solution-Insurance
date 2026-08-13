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
  }): Promise<ExpoPushSendResult>;
}

export function createPushNotificationService(deps: {
  env: Env;
  pushTokens: PushTokensRepo;
  notificationPreferences: NotificationPreferencesRepo;
}): PushNotificationService {
  return {
    async sendToAccount({ accountId, templateId, variables }) {
      const content = buildBrandedPushMessage(templateId, variables);
      const prefs = await deps.notificationPreferences.getOrCreate(accountId);

      if (!isPushEnabledForCategory(prefs.channels, content.category)) {
        return { tickets: [], invalidTokens: [] };
      }

      const tokens = await deps.pushTokens.listEnabledForAccount(accountId);
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
