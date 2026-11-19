/**
 * Feature 021 stage (c) / TP-14 - SMS channel port.
 *
 * SMS is a NEW OPEN VENDOR DECISION (paid, third-party, cross-border operator agreement; owner cost
 * decision). Only the port and an honest not-configured implementation exist. A real vendor adapter
 * implements `SmsSender` after the decision and compliance sign-off; nothing else changes.
 */
export type SmsSendStatus = 'sent' | 'not_configured' | 'failed';

export interface SmsSendResult {
  status: SmsSendStatus;
}

export interface SmsSender {
  /** Must not throw for an unconfigured or failing vendor: report it. `text` carries no location. */
  send(params: { toPhone: string; text: string }): Promise<SmsSendResult>;
}

/** Default until a vendor is chosen. Never pretends to send and never throws. */
export class NotConfiguredSmsSender implements SmsSender {
  async send(): Promise<SmsSendResult> {
    return { status: 'not_configured' };
  }
}
