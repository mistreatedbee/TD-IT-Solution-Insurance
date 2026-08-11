/**
 * Transactional email dispatch — Brevo-ready (C-5 / smtp-vendor-selection.md).
 *
 * When BREVO_API_KEY and EMAIL_FROM are configured, sends via Brevo REST API.
 * Otherwise logs a dev stand-in (same honesty as prior console.warn-only paths).
 */
import type { Env } from '../config/env.js';

export type TransactionalEmailKind =
  | 'verification'
  | 'password_reset'
  | 'invitation';

export interface TransactionalEmailPayload {
  to: string;
  kind: TransactionalEmailKind;
  actionLink: string;
}

function subjectFor(kind: TransactionalEmailKind): string {
  switch (kind) {
    case 'verification':
      return 'Verify your TD IT Solution Insurance account';
    case 'password_reset':
      return 'Reset your TD IT Solution Insurance password';
    case 'invitation':
      return 'You have been invited to TD IT Solution Insurance';
  }
}

function htmlBody(kind: TransactionalEmailKind, actionLink: string): string {
  const intro =
    kind === 'verification'
      ? 'Please verify your email address to activate your account.'
      : kind === 'password_reset'
        ? 'Use the link below to reset your password.'
        : 'Use the link below to accept your invitation and set up your account.';
  return `<p>${intro}</p><p><a href="${actionLink}">${actionLink}</a></p>`;
}

export function isEmailConfigured(env: Env): boolean {
  return Boolean(env.brevoApiKey && env.emailFrom);
}

/** Returns true when a send was attempted (configured), false when dev stand-in only. */
export async function sendTransactionalEmail(
  env: Env,
  payload: TransactionalEmailPayload,
): Promise<boolean> {
  if (!isEmailConfigured(env)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[email] ${payload.kind} NOT sent (BREVO_API_KEY or EMAIL_FROM not configured, C-5). ` +
        `Dev-only action link for ${payload.to}: ${payload.actionLink}`,
    );
    return false;
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.brevoApiKey!,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: env.emailFrom!,
        name: env.emailFromName ?? 'TD IT Solution Insurance',
      },
      to: [{ email: payload.to }],
      subject: subjectFor(payload.kind),
      htmlContent: htmlBody(payload.kind, payload.actionLink),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`[email] Brevo API error (${response.status}): ${detail.slice(0, 200)}`);
  }

  return true;
}
