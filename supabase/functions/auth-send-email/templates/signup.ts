import { renderEmailLayout } from './layout.ts';

export function renderSignupEmail(confirmationUrl: string): string {
  return renderEmailLayout({
    preheader: 'Confirm your email to activate your account.',
    title: 'Verify your email address',
    bodyHtml: `<p style="margin:0 0 12px;">Thanks for signing up. Please confirm your email address to activate your account and start protecting your assets.</p>
<p style="margin:0;">This link expires after a limited time and can only be used once.</p>`,
    actionLabel: 'Verify email address',
    actionUrl: confirmationUrl,
  });
}
