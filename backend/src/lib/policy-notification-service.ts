/**
 * POL-002 activation and POL-003 renewal-upcoming notifications.
 */
import type { Env } from '../config/env.js';
import type { AccountsRepo } from '../repositories/accounts.js';
import type { NotificationPreferencesRepo, NotificationCategory } from '../repositories/notification-preferences.js';
import type {
  NotificationDeliveryStateRepo,
  RenewalReminderThreshold,
} from '../repositories/notification-delivery-state.js';
import type { PolicyDocument } from '../repositories/policies.js';
import type { PushNotificationService } from './push-notification-service.js';
import { buildPolicyActivatedEmail, buildPolicyRenewalUpcomingEmail } from './domain-email-templates.js';
import { isResendConfigured, sendResendEmail } from './resend-email.js';

export interface PolicyNotificationService {
  notifyPolicyActivated(params: {
    accountId: string;
    policyId: string;
    planName: string;
    effectiveDate: Date;
  }): Promise<void>;
  maybeNotifyRenewalReminders(params: {
    accountId: string;
    activePolicies: PolicyDocument[];
  }): Promise<void>;
}

function isEmailEnabled(
  channels: Awaited<ReturnType<NotificationPreferencesRepo['getOrCreate']>>['channels'],
  category: NotificationCategory,
): boolean {
  return channels[category]?.email !== false;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
}

function daysUntil(date: Date): number {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000));
}

function renewalThresholdForDays(days: number): RenewalReminderThreshold | null {
  if (days <= 1 && days >= 0) return 1;
  if (days <= 7 && days > 1) return 7;
  if (days <= 30 && days > 7) return 30;
  return null;
}

function formatAmount(currency: string, amount: number | null): string | null {
  if (amount == null) return null;
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(amount);
}

export function createPolicyNotificationService(deps: {
  env: Env;
  accounts: AccountsRepo;
  notificationPreferences: NotificationPreferencesRepo;
  deliveryState: NotificationDeliveryStateRepo;
  pushNotifications: PushNotificationService;
}): PolicyNotificationService {
  return {
    async notifyPolicyActivated({ accountId, policyId, planName, effectiveDate }) {
      const account = await deps.accounts.findById(accountId);
      if (!account || account.userType !== 'customer') return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const effectiveLabel = formatDate(effectiveDate);
      const tasks: Promise<unknown>[] = [];

      if (isEmailEnabled(prefs.channels, 'billing') && isResendConfigured(deps.env)) {
        const email = buildPolicyActivatedEmail({ planName, policyId, effectiveDate: effectiveLabel });
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      tasks.push(
        deps.pushNotifications.sendToAccount({
          accountId,
          templateId: 'policy.activated',
          variables: { planName, policyId, effectiveDate: effectiveLabel },
        }),
      );

      await Promise.allSettled(tasks);
    },

    async maybeNotifyRenewalReminders({ accountId, activePolicies }) {
      const account = await deps.accounts.findById(accountId);
      if (!account || account.userType !== 'customer') return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);

      for (const policy of activePolicies) {
        if (!policy.renewalDate) continue;

        const days = daysUntil(policy.renewalDate);
        if (days < 0) continue;

        const threshold = renewalThresholdForDays(days);
        if (!threshold) continue;

        const marked = await deps.deliveryState.tryMarkRenewalReminderSent(accountId, policy.id, threshold);
        if (!marked) continue;

        const renewalLabel = formatDate(policy.renewalDate);
        const amount = formatAmount(policy.billing.currency, policy.billing.amount);
        const tasks: Promise<unknown>[] = [];

        if (isEmailEnabled(prefs.channels, 'billing') && isResendConfigured(deps.env)) {
          const email = buildPolicyRenewalUpcomingEmail({
            planName: policy.planTier,
            policyId: policy.id,
            renewalDate: renewalLabel,
            daysUntil: days,
            amount,
          });
          tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
        }

        tasks.push(
          deps.pushNotifications.sendToAccount({
            accountId,
            templateId: 'policy.renewal.upcoming',
            variables: {
              planName: policy.planTier,
              policyId: policy.id,
              renewalDate: renewalLabel,
              daysUntil: String(days),
              amount: amount ?? undefined,
            },
          }),
        );

        await Promise.allSettled(tasks);
      }
    },
  };
}
