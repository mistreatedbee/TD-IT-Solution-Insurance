/**
 * ONB-001 welcome and ONB-002 onboarding incomplete reminders.
 */
import type { Env } from '../config/env.js';
import type { AccountsRepo } from '../repositories/accounts.js';
import type { NotificationPreferencesRepo, NotificationCategory } from '../repositories/notification-preferences.js';
import type { NotificationDeliveryStateRepo } from '../repositories/notification-delivery-state.js';
import type { PushNotificationService } from './push-notification-service.js';
import { buildOnboardingIncompleteEmail, buildWelcomeEmail } from './domain-email-templates.js';
import { isResendConfigured, sendResendEmail } from './resend-email.js';

const MS_PER_HOUR = 60 * 60 * 1000;

export interface OnboardingNotificationService {
  notifyWelcomeIfNeeded(accountId: string): Promise<void>;
  maybeNotifyOnboardingIncomplete(params: {
    accountId: string;
    accountCreatedAt: Date;
    policyCount: number;
  }): Promise<void>;
}

function isEmailEnabled(
  channels: Awaited<ReturnType<NotificationPreferencesRepo['getOrCreate']>>['channels'],
  category: NotificationCategory,
): boolean {
  return channels[category]?.email !== false;
}

export function createOnboardingNotificationService(deps: {
  env: Env;
  accounts: AccountsRepo;
  notificationPreferences: NotificationPreferencesRepo;
  deliveryState: NotificationDeliveryStateRepo;
  pushNotifications: PushNotificationService;
}): OnboardingNotificationService {
  return {
    async notifyWelcomeIfNeeded(accountId) {
      const newlyMarked = await deps.deliveryState.tryMarkWelcomeSent(accountId);
      if (!newlyMarked) return;

      const account = await deps.accounts.findById(accountId);
      if (!account || account.userType !== 'customer') return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const tasks: Promise<unknown>[] = [];

      if (isEmailEnabled(prefs.channels, 'general') && isResendConfigured(deps.env)) {
        const email = buildWelcomeEmail();
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      tasks.push(
        deps.pushNotifications.sendToAccount({
          accountId,
          templateId: 'general.welcome',
        }),
      );

      await Promise.allSettled(tasks);
    },

    async maybeNotifyOnboardingIncomplete({ accountId, accountCreatedAt, policyCount }) {
      if (policyCount > 0) return;

      const state = await deps.deliveryState.getOrCreate(accountId);
      if (state.onboardingReminderCount >= 2) return;

      const ageHours = (Date.now() - accountCreatedAt.getTime()) / MS_PER_HOUR;
      const dueFirst = ageHours >= 24 && state.onboardingReminderCount === 0;
      const dueSecond = ageHours >= 72 && state.onboardingReminderCount === 1;
      if (!dueFirst && !dueSecond) return;

      const consumed = await deps.deliveryState.tryIncrementOnboardingReminder(accountId);
      if (!consumed) return;

      const account = await deps.accounts.findById(accountId);
      if (!account || account.userType !== 'customer') return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const tasks: Promise<unknown>[] = [];

      if (isEmailEnabled(prefs.channels, 'general') && isResendConfigured(deps.env)) {
        const email = buildOnboardingIncompleteEmail();
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      tasks.push(
        deps.pushNotifications.sendToAccount({
          accountId,
          templateId: 'onboarding.incomplete',
        }),
      );

      await Promise.allSettled(tasks);
    },
  };
}
