export interface EmailDataForUrl {
  token_hash: string;
  email_action_type: string;
  redirect_to: string;
}

/**
 * App callback URL carrying token_hash for client-side verifyOtp.
 * Unlike the Supabase /auth/v1/verify redirect (PKCE `code`), this works when the
 * user opens the email on a different browser or device than where they signed up.
 */
export function buildConfirmationUrl(
  _supabaseUrl: string,
  emailData: EmailDataForUrl,
  recipientEmail?: string,
): string {
  const target = new URL(emailData.redirect_to);
  target.searchParams.set('token_hash', emailData.token_hash);
  if (!target.searchParams.get('type')) {
    target.searchParams.set('type', emailData.email_action_type);
  }
  if (recipientEmail) {
    target.searchParams.set('email', recipientEmail);
  }
  return target.toString();
}
