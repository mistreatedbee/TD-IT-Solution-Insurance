import { renderEmailLayout } from './layout.ts';

export function renderRecoveryEmail(confirmationUrl: string): string {
  return renderEmailLayout({
    preheader: 'Reset your password using the secure link below.',
    title: 'Reset your password',
    bodyHtml: `<p style="margin:0 0 12px;">We received a request to reset the password for your account. Use the button below to choose a new password.</p>
<p style="margin:0;">If you did not request this, you can safely ignore this email — your password will not change.</p>`,
    actionLabel: 'Reset password',
    actionUrl: confirmationUrl,
    footerNote: 'For your security, this link expires after a limited time.',
  });
}
