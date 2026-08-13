/**
 * Resend API — domain transactional email (Feature 007).
 * Auth email remains on Supabase auth-send-email hook.
 */
import type { Env } from '../config/env.js';

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
}

export function isResendConfigured(env: Env): boolean {
  return Boolean(env.resendApiKey?.trim() && env.emailFrom?.trim());
}

export async function sendResendEmail(env: Env, email: OutboundEmail): Promise<boolean> {
  if (!isResendConfigured(env)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[email] NOT sent to ${email.to} — RESEND_API_KEY or EMAIL_FROM not configured on backend.`,
    );
    return false;
  }

  const fromName = env.emailFromName ?? 'TD IT Solution Insurance';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${env.emailFrom}>`,
      to: [email.to],
      subject: email.subject,
      html: email.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`[resend] API error (${response.status}): ${detail.slice(0, 200)}`);
  }

  return true;
}
