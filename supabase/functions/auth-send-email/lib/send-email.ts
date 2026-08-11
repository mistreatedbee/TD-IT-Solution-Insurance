export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
}

export async function sendOutboundEmail(email: OutboundEmail): Promise<void> {
  const fromEmail = Deno.env.get('EMAIL_FROM');
  const fromName = Deno.env.get('EMAIL_FROM_NAME') ?? 'TD IT Solution Insurance';
  if (!fromEmail) {
    throw new Error('EMAIL_FROM secret is not configured');
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (resendKey) {
    await sendViaResend(resendKey, fromEmail, fromName, email);
    return;
  }

  const brevoKey = Deno.env.get('BREVO_API_KEY');
  if (brevoKey) {
    await sendViaBrevo(brevoKey, fromEmail, fromName, email);
    return;
  }

  throw new Error('Configure RESEND_API_KEY or BREVO_API_KEY for auth-send-email');
}

async function sendViaResend(
  apiKey: string,
  fromEmail: string,
  fromName: string,
  email: OutboundEmail,
): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [email.to],
      subject: email.subject,
      html: email.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend API error (${response.status}): ${detail.slice(0, 200)}`);
  }
}

async function sendViaBrevo(
  apiKey: string,
  fromEmail: string,
  fromName: string,
  email: OutboundEmail,
): Promise<void> {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: email.to }],
      subject: email.subject,
      htmlContent: email.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Brevo API error (${response.status}): ${detail.slice(0, 200)}`);
  }
}
