/**
 * Feature 021 stage (c) - adapters binding the dispatcher's ports to EXISTING infrastructure only
 * (Expo push service, Resend, accounts repo, audit log, Redis-class KeyValueStore). No vendor-specific
 * code, and no SMS adapter (open vendor decision: use `NotConfiguredSmsSender`).
 */
import type { Env } from '../config/env.js';
import type { KeyValueStore } from '../db/redis.js';
import { RATE_LIMIT_KEY_PREFIX } from '../db/redis.js';
import type { AccountsRepo } from '../repositories/accounts.js';
import type { createAuditLogRepo } from '../repositories/audit-log.js';
import type {
  AlertAuditSink,
  AlertContactLookup,
  AlertThrottle,
  EmailAlertSender,
  PushAlertSender,
} from './safety-alert-dispatcher.js';
import type { PushNotificationService } from './push-notification-service.js';
import { checkRateLimit } from './rate-limit.js';
import { sendResendEmail } from './resend-email.js';

export function createKeyValueAlertThrottle(store: KeyValueStore): AlertThrottle {
  return {
    async hit(key, config) {
      return (await checkRateLimit(store, key, config)).allowed;
    },
    async release(key) {
      await store.del(`${RATE_LIMIT_KEY_PREFIX}${key}`);
    },
  };
}

export function createExpoPushAlertSender(push: PushNotificationService): PushAlertSender {
  return {
    async send({ accountId, alert, copy }) {
      const result = await push.sendToAccount({
        accountId,
        templateId: 'safety.alert',
        variables: { statusLabel: copy.title, message: copy.pushBody, ...(alert.assetId ? { assetId: alert.assetId } : {}) },
      });
      if (result.tickets.length === 0) return 'unavailable'; // no enabled token
      // 'ok' means Expo accepted it, not that the handset displayed it.
      return result.tickets.some((t) => t.status === 'ok') ? 'delivered' : 'not_delivered';
    },
  };
}

export function createResendAlertSender(env: Env): EmailAlertSender {
  return { send: (email) => sendResendEmail(env, email) };
}

export function createAccountContactLookup(accounts: Pick<AccountsRepo, 'findById'>): AlertContactLookup {
  return {
    async getContact(accountId) {
      const account = await accounts.findById(accountId);
      if (!account || account.userType !== 'customer') return null;
      return { email: account.email, phone: account.phone };
    },
  };
}

export function createAuditLogAlertSink(auditLog: Pick<ReturnType<typeof createAuditLogRepo>, 'record'>): AlertAuditSink {
  return {
    async record({ accountId, detail }) {
      await auditLog.record({
        accountId,
        actorService: 'safety-alert-dispatcher',
        eventType: 'safety_alert_dispatch',
        safetyAlertDetail: detail,
      });
    },
  };
}
