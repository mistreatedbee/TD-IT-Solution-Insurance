/**
 * Feature 021 stage (c) - safety-alert types and fixed customer-facing wording (design note section 7).
 *
 * Wording rules applied here: a went-dark alert says "we stopped hearing from this device", never that
 * anything was stolen; nothing here can imply the app blocks power-off; no location, no score, no verdict.
 * The push title/body are deliberately generic ("this device", no asset name) because they show on a lock
 * screen; the email may name the asset because it is read after sign-in to a mailbox the customer owns.
 */

export const SAFETY_ALERT_TYPES = [
  'went_dark',
  // Reserved for later stages; the dispatcher already carries them so those stages add rules, not plumbing.
  'unusual_location',
  'sim_removed',
  'airplane_mode_moving',
  'wrong_unlock',
  'tag_separation',
  'last_gasp',
] as const;
export type SafetyAlertType = (typeof SAFETY_ALERT_TYPES)[number];

export type SafetyAlertSeverity = 'quiet' | 'lost_contact';

export interface SafetyAlert {
  type: SafetyAlertType;
  accountId: string;
  assetId: string | null;
  deviceId: string;
  /** Customer's own asset name, email body only. Never logged, never in audit. */
  assetLabel?: string | null;
  severity?: SafetyAlertSeverity;
  priority: 'normal' | 'high';
  occurredAt: Date;
  /** Distinguishes alerts of one type that must not suppress each other (e.g. quiet then lost_contact). */
  dedupeVariant?: string;
}

export interface SafetyAlertCopy {
  title: string;
  /** Lock-screen safe: no asset name. */
  pushBody: string;
  emailHeadline: string;
  emailParagraphs: string[];
  smsText: string;
}

const NOT_A_VERDICT =
  'This is not a confirmation that anything has happened to it. TD IT cannot stop someone switching a device off.';

export function buildSafetyAlertCopy(alert: SafetyAlert): SafetyAlertCopy {
  const who = alert.assetLabel ? `your device "${alert.assetLabel}"` : 'one of your devices';
  switch (alert.type) {
    case 'went_dark': {
      const lost = alert.severity === 'lost_contact';
      return {
        title: 'We stopped hearing from this device',
        pushBody: lost
          ? 'We have not heard from one of your protected devices for some time. Open the app to check on it.'
          : 'We have not heard from one of your protected devices for a while. Open the app to check on it.',
        emailHeadline: 'We stopped hearing from this device',
        emailParagraphs: [
          `We stopped hearing from ${who}${lost ? ' some time ago' : ''}. It may be switched off, out of battery or out of coverage.`,
          'If you know where it is, you do not need to do anything. If you are unsure, open the app to check on it.',
          NOT_A_VERDICT,
        ],
        smsText: 'TD IT Insurance: we stopped hearing from one of your protected devices. Open the app to check. Not a confirmation of loss.',
      };
    }
    default:
      return {
        title: 'Safety alert for one of your devices',
        pushBody: 'We noticed something you may want to look at. Open the app for the plain facts.',
        emailHeadline: 'Safety alert for one of your devices',
        emailParagraphs: [`We noticed something about ${who} that you may want to look at. Open the app for details.`, NOT_A_VERDICT],
        smsText: 'TD IT Insurance: we noticed something about one of your devices. Open the app for details.',
      };
  }
}
