/**
 * Supabase Auth Send Email Hook — branded transactional templates.
 *
 * Invoked by GoTrue when signup verification, password recovery, or staff
 * invitation emails are triggered (backend still calls /resend, /recover,
 * inviteUserByEmail; this hook replaces Supabase's built-in SMTP send).
 *
 * Deploy with verify_jwt = false — webhook signature is verified instead.
 */
import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { buildConfirmationUrl } from './lib/confirmation-url.ts';
import { sendOutboundEmail } from './lib/send-email.ts';
import { renderAuthEmail } from './templates/index.ts';

interface HookPayload {
  user: { email: string };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const hookSecretRaw = Deno.env.get('SEND_EMAIL_HOOK_SECRET');
  if (!hookSecretRaw) {
    return new Response(JSON.stringify({ error: { message: 'Hook secret not configured' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) {
    return new Response(JSON.stringify({ error: { message: 'SUPABASE_URL not configured' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const hookSecret = hookSecretRaw.replace(/^v1,whsec_/, '');

  try {
    const wh = new Webhook(hookSecret);
    const { user, email_data } = wh.verify(payload, headers) as HookPayload;

    const confirmationUrl = buildConfirmationUrl(supabaseUrl, email_data);
    const { subject, html } = renderAuthEmail(
      email_data.email_action_type,
      confirmationUrl,
      email_data.token,
    );

    await sendOutboundEmail({
      to: user.email,
      subject,
      html,
    });

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[auth-send-email]', error);
    const message = error instanceof Error ? error.message : 'Failed to send email';
    return new Response(
      JSON.stringify({
        error: {
          http_code: 500,
          message,
        },
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
});
