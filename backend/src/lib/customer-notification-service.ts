/**
 * Customer domain notifications — email (Resend) + push (Expo).
 */
import type { Env } from '../config/env.js';
import type { AccountsRepo } from '../repositories/accounts.js';
import type { NotificationPreferencesRepo } from '../repositories/notification-preferences.js';
import type { PushNotificationService } from './push-notification-service.js';
import type { NotificationCategory } from '../repositories/notification-preferences.js';
import { buildAssetCreatedEmail, buildPolicyCreatedEmail, buildAssetUpdatedEmail, buildAssetRemovedEmail, buildAssetRecoveredEmail, buildPolicyPendingActivationEmail } from './domain-email-templates.js';
import { isResendConfigured, sendResendEmail } from './resend-email.js';

export interface CustomerNotificationService {
  notifyPolicyCreated(params: {
    accountId: string;
    policyId: string;
    planName: string;
  }): Promise<void>;
  notifyAssetCreated(params: {
    accountId: string;
    assetId: string;
    assetName: string;
    assetType: string;
  }): Promise<void>;
  notifyPolicyPendingActivation(params: {
    accountId: string;
    policyId: string;
    planName: string;
  }): Promise<void>;
  notifyAssetUpdated(params: {
    accountId: string;
    assetId: string;
    assetName: string;
    changedSummary: string;
  }): Promise<void>;
  notifyAssetRemoved(params: {
    accountId: string;
    assetName: string;
  }): Promise<void>;
  notifyAssetRecovered(params: {
    accountId: string;
    assetId: string;
    assetName: string;
    referenceNumber: string | null;
  }): Promise<void>;
}

function isEmailEnabled(
  channels: Awaited<ReturnType<NotificationPreferencesRepo['getOrCreate']>>['channels'],
  category: NotificationCategory,
): boolean {
  return channels[category]?.email !== false;
}

export function createCustomerNotificationService(deps: {
  env: Env;
  accounts: AccountsRepo;
  notificationPreferences: NotificationPreferencesRepo;
  pushNotifications: PushNotificationService;
}): CustomerNotificationService {
  return {
    async notifyPolicyCreated({ accountId, policyId, planName }) {
      const account = await deps.accounts.findById(accountId);
      if (!account || account.userType !== 'customer') return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const tasks: Promise<unknown>[] = [];

      if (isEmailEnabled(prefs.channels, 'general') && isResendConfigured(deps.env)) {
        const email = buildPolicyCreatedEmail({ planName, policyId });
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      tasks.push(
        deps.pushNotifications.sendToAccount({
          accountId,
          templateId: 'policy.created',
          variables: { planName, policyId },
        }),
      );

      await Promise.allSettled(tasks);
    },

    async notifyAssetCreated({ accountId, assetId, assetName, assetType }) {
      const account = await deps.accounts.findById(accountId);
      if (!account || account.userType !== 'customer') return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const tasks: Promise<unknown>[] = [];

      if (isEmailEnabled(prefs.channels, 'general') && isResendConfigured(deps.env)) {
        const email = buildAssetCreatedEmail({ assetName, assetType, assetId });
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      tasks.push(
        deps.pushNotifications.sendToAccount({
          accountId,
          templateId: 'asset.created',
          variables: { assetName, assetId, assetType },
        }),
      );

      await Promise.allSettled(tasks);
    },

    async notifyPolicyPendingActivation({ accountId, policyId, planName }) {
      const account = await deps.accounts.findById(accountId);
      if (!account || account.userType !== 'customer') return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const tasks: Promise<unknown>[] = [];

      if (isEmailEnabled(prefs.channels, 'billing') && isResendConfigured(deps.env)) {
        const email = buildPolicyPendingActivationEmail({ planName, policyId });
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      await Promise.allSettled(tasks);
    },

    async notifyAssetUpdated({ accountId, assetId, assetName, changedSummary }) {
      const account = await deps.accounts.findById(accountId);
      if (!account || account.userType !== 'customer') return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const tasks: Promise<unknown>[] = [];

      if (isEmailEnabled(prefs.channels, 'general') && isResendConfigured(deps.env)) {
        const email = buildAssetUpdatedEmail({ assetName, assetId, changedSummary });
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      if (prefs.channels.general?.push !== false) {
        tasks.push(
          deps.pushNotifications.sendToAccount({
            accountId,
            templateId: 'asset.updated',
            variables: { assetName, assetId },
          }),
        );
      }

      await Promise.allSettled(tasks);
    },

    async notifyAssetRemoved({ accountId, assetName }) {
      const account = await deps.accounts.findById(accountId);
      if (!account || account.userType !== 'customer') return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const tasks: Promise<unknown>[] = [];

      if (isEmailEnabled(prefs.channels, 'general') && isResendConfigured(deps.env)) {
        const email = buildAssetRemovedEmail({ assetName });
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      if (prefs.channels.general?.push !== false) {
        tasks.push(
          deps.pushNotifications.sendToAccount({
            accountId,
            templateId: 'asset.removed',
            variables: { assetName },
          }),
        );
      }

      await Promise.allSettled(tasks);
    },

    async notifyAssetRecovered({ accountId, assetId, assetName, referenceNumber }) {
      const account = await deps.accounts.findById(accountId);
      if (!account || account.userType !== 'customer') return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const tasks: Promise<unknown>[] = [];

      if (isEmailEnabled(prefs.channels, 'theft_critical') && isResendConfigured(deps.env)) {
        const email = buildAssetRecoveredEmail({ assetName, referenceNumber });
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      tasks.push(
        deps.pushNotifications.sendToAccount({
          accountId,
          templateId: 'asset.recovered',
          variables: { assetName, assetId },
        }),
      );

      await Promise.allSettled(tasks);
    },
  };
}

/** Non-blocking notification dispatch from route handlers. */
export function notifyInBackground(label: string, work: Promise<unknown>): void {
  void work.catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[notifications:${label}]`, err instanceof Error ? err.message : err);
  });
}
