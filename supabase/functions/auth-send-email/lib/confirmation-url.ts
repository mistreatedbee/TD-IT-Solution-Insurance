export interface EmailDataForUrl {
  token_hash: string;
  email_action_type: string;
  redirect_to: string;
}

/** Supabase Auth verify URL — redirects to `redirect_to` after token validation. */
export function buildConfirmationUrl(supabaseUrl: string, emailData: EmailDataForUrl): string {
  const base = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/verify`;
  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: emailData.redirect_to,
  });
  return `${base}?${params.toString()}`;
}
