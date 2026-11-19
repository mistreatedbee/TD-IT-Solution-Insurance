/**
 * Feature 021 stage (c1) / TP-14 - safety-alert channel dispatcher.
 *
 * Order: PUSH, then SMS, then EMAIL. A later channel is tried only when the earlier one is unavailable
 * (no token / not configured / no contact), did not deliver, or is switched off in the customer's own
 * `safety_alerts` preferences. Stops at the first delivery. Preferences are always respected (see
 * 04-stage-c doc section 4 for the rule and the compliance question).
 *
 * Every attempt is audited (`safety_alert_dispatch`, fixed vocabulary, no location/message text). An
 * audit failure never blocks delivery. A per-account+type+device de-duplication window and a per-account+type
 * daily cap stop a flapping device flooding a customer.
 *
 * Vendor-agnostic: everything external is a port (see safety-alert-adapters.ts for push/email/KV adapters
 * and sms-sender.ts for the SMS port).
 */
import type { NotificationPreferencesRepo } from '../repositories/notification-preferences.js';
import { buildSafetyAlertEmail } from './domain-email-templates.js';
import { SAFETY_ALERT_ACCOUNT_RATE_LIMIT, SAFETY_ALERT_DEDUPE_WINDOW_SECONDS } from './policy.js';
import { buildSafetyAlertCopy, type SafetyAlert, type SafetyAlertCopy } from './safety-alert-copy.js';
import type { SmsSender } from './sms-sender.js';

export type AlertChannel = 'push' | 'sms' | 'email';
export type ChannelOutcome =
  | 'delivered'
  | 'not_delivered'
  | 'unavailable'
  | 'skipped_preference'
  | 'no_contact'
  | 'not_configured'
  | 'failed';
export type DispatchStatus = 'delivered' | 'undelivered' | 'suppressed_duplicate' | 'rate_limited';

export interface ChannelAttempt {
  channel: AlertChannel;
  outcome: ChannelOutcome;
}

export interface DispatchResult {
  status: DispatchStatus;
  deliveredVia: AlertChannel | null;
  attempts: ChannelAttempt[];
}

export interface PushAlertSender {
  /** 'unavailable' = no registered device/token; 'not_delivered' = sent but not accepted. */
  send(params: { accountId: string; alert: SafetyAlert; copy: SafetyAlertCopy }): Promise<'delivered' | 'not_delivered' | 'unavailable'>;
}
export interface EmailAlertSender {
  /** true = accepted by the provider; false = provider not configured. May throw on provider error. */
  send(params: { to: string; subject: string; html: string }): Promise<boolean>;
}
export interface AlertContactLookup {
  getContact(accountId: string): Promise<{ email: string | null; phone: string | null } | null>;
}
export interface AlertThrottle {
  /** Fixed-window counter: true while this hit is within `attempts` for the window. */
  hit(key: string, config: { attempts: number; windowSeconds: number }): Promise<boolean>;
  release(key: string): Promise<void>;
}
export interface AlertAuditSink {
  record(params: { accountId: string; detail: string }): Promise<void>;
}

export interface SafetyAlertDispatcherDeps {
  preferences: Pick<NotificationPreferencesRepo, 'getOrCreate'>;
  contacts: AlertContactLookup;
  push: PushAlertSender;
  sms: SmsSender;
  email: EmailAlertSender;
  throttle: AlertThrottle;
  audit: AlertAuditSink;
  dedupeWindowSeconds?: number;
  accountRateLimit?: { attempts: number; windowSeconds: number };
}

export interface SafetyAlertDispatcher {
  dispatch(alert: SafetyAlert): Promise<DispatchResult>;
}

export function createSafetyAlertDispatcher(deps: SafetyAlertDispatcherDeps): SafetyAlertDispatcher {
  const dedupeWindow = deps.dedupeWindowSeconds ?? SAFETY_ALERT_DEDUPE_WINDOW_SECONDS;
  const accountLimit = deps.accountRateLimit ?? SAFETY_ALERT_ACCOUNT_RATE_LIMIT;

  async function audit(alert: SafetyAlert, channel: AlertChannel | 'none', outcome: string): Promise<void> {
    try {
      await deps.audit.record({
        accountId: alert.accountId,
        detail: `${alert.type}|${channel}|${outcome}|${alert.deviceId}`,
      });
    } catch {
      // eslint-disable-next-line no-console
      console.error('[safety-alert] audit write failed (delivery not blocked)');
    }
  }

  return {
    async dispatch(alert) {
      const attempts: ChannelAttempt[] = [];
      const dedupeKey = `safety:dd:${alert.accountId}:${alert.type}:${alert.deviceId}:${alert.dedupeVariant ?? ''}`;

      if (!(await deps.throttle.hit(dedupeKey, { attempts: 1, windowSeconds: dedupeWindow }))) {
        await audit(alert, 'none', 'deduplicated');
        return { status: 'suppressed_duplicate', deliveredVia: null, attempts };
      }
      if (!(await deps.throttle.hit(`safety:cap:${alert.accountId}:${alert.type}`, accountLimit))) {
        await deps.throttle.release(dedupeKey); // not sent: let a later run retry once the cap window moves on
        await audit(alert, 'none', 'rate_limited');
        return { status: 'rate_limited', deliveredVia: null, attempts };
      }

      const copy = buildSafetyAlertCopy(alert);
      const prefs = (await deps.preferences.getOrCreate(alert.accountId)).channels.safety_alerts;
      let contact: { email: string | null; phone: string | null } | null | undefined;
      const getContact = async () => (contact === undefined ? (contact = await deps.contacts.getContact(alert.accountId)) : contact);

      const finish = async (channel: AlertChannel, outcome: ChannelOutcome): Promise<boolean> => {
        attempts.push({ channel, outcome });
        await audit(alert, channel, outcome);
        return outcome === 'delivered';
      };

      const steps: Array<[AlertChannel, () => Promise<ChannelOutcome>]> = [
        ['push', async () => {
          if (prefs.push === false) return 'skipped_preference';
          return deps.push.send({ accountId: alert.accountId, alert, copy });
        }],
        ['sms', async () => {
          if (prefs.sms !== true) return 'skipped_preference'; // opt-in only
          const phone = (await getContact())?.phone;
          if (!phone) return 'no_contact';
          const r = await deps.sms.send({ toPhone: phone, text: copy.smsText });
          return r.status === 'sent' ? 'delivered' : r.status === 'not_configured' ? 'not_configured' : 'failed';
        }],
        ['email', async () => {
          if (prefs.email === false) return 'skipped_preference';
          const to = (await getContact())?.email;
          if (!to) return 'no_contact';
          const mail = buildSafetyAlertEmail({ title: copy.emailHeadline, paragraphs: copy.emailParagraphs });
          return (await deps.email.send({ to, subject: mail.subject, html: mail.html })) ? 'delivered' : 'not_configured';
        }],
      ];

      for (const [channel, run] of steps) {
        let outcome: ChannelOutcome;
        try {
          outcome = await run();
        } catch {
          outcome = 'failed';
        }
        if (await finish(channel, outcome)) {
          return { status: 'delivered', deliveredVia: channel, attempts };
        }
      }

      await deps.throttle.release(dedupeKey); // nothing reached the customer: allow a retry
      return { status: 'undelivered', deliveredVia: null, attempts };
    },
  };
}
