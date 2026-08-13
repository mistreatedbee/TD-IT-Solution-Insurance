import { renderEmailLayout } from './layout.ts';
import { EMAIL_BRAND } from './brand.ts';

export function renderSignupEmail(confirmationUrl: string): string {
  return renderEmailLayout({
    theme: 'signup',
    preheader: 'Confirm your email to activate your TD IT Solution Insurance account.',
    title: 'Verify your email',
    showHeroIcon: false,
    bodyHtml: `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${EMAIL_BRAND.text};">
        Please confirm your email address to activate your account.
      </p>
      <p style="margin:0;font-size:14px;line-height:1.55;color:${EMAIL_BRAND.muted};">
        This link expires after a limited time and can only be used once. If you did not create an account, you can ignore this email.
      </p>`,
    actionLabel: 'Verify email',
    actionUrl: confirmationUrl,
  });
}
