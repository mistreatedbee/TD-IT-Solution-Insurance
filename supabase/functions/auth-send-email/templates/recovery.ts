import { renderEmailLayout } from './layout.ts';
import { EMAIL_BRAND } from './brand.ts';

export function renderRecoveryEmail(confirmationUrl: string): string {
  return renderEmailLayout({
    theme: 'recovery',
    preheader: 'Reset your TD IT Solution Insurance password.',
    title: 'Reset your password',
    showHeroIcon: false,
    bodyHtml: `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${EMAIL_BRAND.text};">
        We received a request to reset the password for your account.
      </p>
      <p style="margin:0;font-size:14px;line-height:1.55;color:${EMAIL_BRAND.muted};">
        If you did not request this, no action is needed. Your password will stay the same.
      </p>`,
    actionLabel: 'Reset password',
    actionUrl: confirmationUrl,
    footerNote: 'This link expires after a limited time.',
  });
}
