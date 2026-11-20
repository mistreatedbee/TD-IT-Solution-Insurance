/**
 * Feature 023 Phase A item 3 — email + push when an admin decides a customer's identity
 * verification (approve / decline / action required). The in-app alert is still written by
 * `syncAccountAlerts`; this adds the other two channels. Both respect the customer's
 * `account` category notification preferences. Customer-safe reason only — never the
 * internal admin note, reviewer identity, or any ID detail.
 */
import type { Env } from '../config/env.js';
import type { AccountsRepo } from '../repositories/accounts.js';
import type { NotificationPreferencesRepo } from '../repositories/notification-preferences.js';
import type { PushNotificationService } from './push-notification-service.js';
import type { PushTemplateId } from './notification-brand.js';
import { buildVerificationDecisionEmail, type VerificationDecisionValue } from './domain-email-templates.js';
import { isResendConfigured, sendResendEmail } from './resend-email.js';

export interface VerificationNotificationService {
  notifyVerificationDecision(params: {
    accountId: string;
    decision: VerificationDecisionValue;
    reasonCustomerSafe: string | null;
  }): Promise<void>;
}

const PUSH_TEMPLATE: Record<VerificationDecisionValue, PushTemplateId> = {
  verified: 'account.verification.verified',
  action_required: 'account.verification.action_required',
  rejected: 'account.verification.rejected',
};

export function createVerificationNotificationService(deps: {
  env: Env;
  accounts: AccountsRepo;
  notificationPreferences: NotificationPreferencesRepo;
  pushNotifications: PushNotificationService;
}): VerificationNotificationService {
  return {
    async notifyVerificationDecision({ accountId, decision, reasonCustomerSafe }) {
      const account = await deps.accounts.findById(accountId);
      if (!account || account.userType !== 'customer') return;

      const prefs = await deps.notificationPreferences.getOrCreate(accountId);
      const tasks: Promise<unknown>[] = [];

      if (prefs.channels.account?.email !== false && isResendConfigured(deps.env)) {
        const email = buildVerificationDecisionEmail({ decision, reasonCustomerSafe });
        tasks.push(sendResendEmail(deps.env, { to: account.email, subject: email.subject, html: email.html }));
      }

      // pushNotifications.sendToAccount re-checks the category preference itself; the
      // explicit check here keeps the intent obvious and skips the token lookup.
      if (prefs.channels.account?.push !== false) {
        tasks.push(
          deps.pushNotifications.sendToAccount({ accountId, templateId: PUSH_TEMPLATE[decision] }),
        );
      }

      await Promise.allSettled(tasks);
    },
  };
}
