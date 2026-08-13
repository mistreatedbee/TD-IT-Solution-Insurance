/**
 * Auth security notifications — email (Resend) + push (Expo), Feature 007 Group 2.
 */
import type { Env } from '../config/env.js';
import type { AccountsRepo } from '../repositories/accounts.js';
import type { NotificationPreferencesRepo } from '../repositories/notification-preferences.js';
import type { PushNotificationService } from './push-notification-service.js';
import {
  buildAccountLockedEmail,
  buildEmailAlreadyVerifiedEmail,
  buildMfaEnabledEmail,
  buildNewDeviceLoginEmail,
  buildPasswordChangedEmail,
} from './domain-email-templates.js';
import { isResendConfigured, sendResendEmail } from './resend-email.js';

export interface AuthNotificationService {
  notifyPasswordChanged(params: { accountId: string }): Promise<void>;
  notifyNewDeviceLogin(params: {
    accountId: string;
    userType: string;
    deviceName: string | null;
    ipAddress: string | null;
  }): Promise<void>;
  notifyMfaEnabled(params: { accountId: string }): Promise<void>;
  notifyAccountLocked(params: { accountId: string }): Promise<void>;
  notifyEmailAlreadyVerified(params: { accountId: string; email: string }): Promise<boolean>;
}

function isEmailEnabled(
  channels: Awaited<ReturnType<NotificationPreferencesRepo['getOrCreate']>>['channels'],
): boolean {
  return channels.account?.email !== false;
}

function shouldSendPush(userType: string): boolean {
  return userType === 'customer';
}

export function createAuthNotificationService(deps: {
  env: Env;
  accounts: AccountsRepo;
  notificationPreferences: NotificationPreferencesRepo;
  pushNotifications: PushNotificationService;
}): AuthNotificationService {
  return {
    async notifyPasswordChanged({ accountId }) {
      const account = await deps.accounts.findById(accountId);
      if (!account) return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const tasks: Promise<unknown>[] = [];

      if (isEmailEnabled(prefs.channels) && isResendConfigured(deps.env)) {
        const email = buildPasswordChangedEmail();
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      if (shouldSendPush(account.userType)) {
        tasks.push(
          deps.pushNotifications.sendToAccount({
            accountId,
            templateId: 'auth.password.changed',
          }),
        );
      }

      await Promise.allSettled(tasks);
    },

    async notifyNewDeviceLogin({ accountId, userType, deviceName, ipAddress }) {
      const account = await deps.accounts.findById(accountId);
      if (!account) return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const tasks: Promise<unknown>[] = [];
      const label = deviceName ?? 'Unknown device';

      if (isEmailEnabled(prefs.channels) && isResendConfigured(deps.env)) {
        const email = buildNewDeviceLoginEmail({ deviceName: label, ipAddress });
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      if (shouldSendPush(userType)) {
        tasks.push(
          deps.pushNotifications.sendToAccount({
            accountId,
            templateId: 'auth.login.new_device',
            variables: { deviceName: label, ipAddress: ipAddress ?? undefined },
          }),
        );
      }

      await Promise.allSettled(tasks);
    },

    async notifyMfaEnabled({ accountId }) {
      const account = await deps.accounts.findById(accountId);
      if (!account) return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const tasks: Promise<unknown>[] = [];

      if (isEmailEnabled(prefs.channels) && isResendConfigured(deps.env)) {
        const email = buildMfaEnabledEmail();
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      if (shouldSendPush(account.userType)) {
        tasks.push(
          deps.pushNotifications.sendToAccount({
            accountId,
            templateId: 'auth.mfa.enabled',
          }),
        );
      }

      await Promise.allSettled(tasks);
    },

    async notifyAccountLocked({ accountId }) {
      const account = await deps.accounts.findById(accountId);
      if (!account) return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const tasks: Promise<unknown>[] = [];

      if (isEmailEnabled(prefs.channels) && isResendConfigured(deps.env)) {
        const email = buildAccountLockedEmail();
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      if (shouldSendPush(account.userType)) {
        tasks.push(
          deps.pushNotifications.sendToAccount({
            accountId,
            templateId: 'auth.account.locked',
          }),
        );
      }

      await Promise.allSettled(tasks);
    },

    async notifyEmailAlreadyVerified({ accountId, email }) {
      const account = await deps.accounts.findById(accountId);
      if (!account) return false;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      if (!isEmailEnabled(prefs.channels) || !isResendConfigured(deps.env)) {
        return false;
      }

      const message = buildEmailAlreadyVerifiedEmail();
      await sendResendEmail(deps.env, { to: email, subject: message.subject, html: message.html });
      return true;
    },
  };
}
