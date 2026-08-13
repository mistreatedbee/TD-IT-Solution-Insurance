import { renderInviteEmail } from './invite.ts';
import { renderRecoveryEmail } from './recovery.ts';
import { renderReauthenticationEmail } from './reauthentication.ts';
import { renderSignupEmail } from './signup.ts';
import { subjectFor } from './subjects.ts';
import { renderEmailLayout } from './layout.ts';
import { EMAIL_BRAND } from './brand.ts';

export { subjectFor };

export function renderAuthEmail(
  actionType: string,
  confirmationUrl: string,
  otpToken?: string,
): { subject: string; html: string } {
  switch (actionType) {
    case 'signup':
      return { subject: subjectFor(actionType), html: renderSignupEmail(confirmationUrl) };
    case 'recovery':
      return { subject: subjectFor(actionType), html: renderRecoveryEmail(confirmationUrl) };
    case 'invite':
      return { subject: subjectFor(actionType), html: renderInviteEmail(confirmationUrl) };
    case 'magiclink':
      return {
        subject: subjectFor(actionType),
        html: renderEmailLayout({
          theme: 'magiclink',
          preheader: 'Sign in to your TD IT Solution Insurance account.',
          title: 'Sign in',
          showHeroIcon: false,
          bodyHtml: `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${EMAIL_BRAND.text};">
              Use the button below to sign in. This link expires shortly and can only be used once.
            </p>
            <p style="margin:0;font-size:14px;line-height:1.55;color:${EMAIL_BRAND.muted};">
              If you did not request this, you can ignore this email.
            </p>`,
          actionLabel: 'Sign in',
          actionUrl: confirmationUrl,
        }),
      };
    case 'email_change':
      return {
        subject: subjectFor(actionType),
        html: renderEmailLayout({
          theme: 'email_change',
          preheader: 'Confirm your new email address.',
          title: 'Confirm your new email',
          showHeroIcon: false,
          bodyHtml: `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${EMAIL_BRAND.text};">
              You requested to change the email address on your account.
            </p>
            <p style="margin:0;font-size:14px;line-height:1.55;color:${EMAIL_BRAND.muted};">
              If you did not request this change, contact us immediately.
            </p>`,
          actionLabel: 'Confirm email',
          actionUrl: confirmationUrl,
        }),
      };
    case 'reauthentication':
      return {
        subject: subjectFor(actionType),
        html: renderReauthenticationEmail(otpToken ?? ''),
      };
    default:
      return {
        subject: subjectFor(actionType),
        html: renderEmailLayout({
          theme: 'default',
          preheader: 'Action required on your TD IT Solution Insurance account.',
          title: 'Continue',
          showHeroIcon: false,
          bodyHtml: `<p style="margin:0;font-size:16px;line-height:1.6;color:${EMAIL_BRAND.text};">
              Please use the secure link below to continue.
            </p>`,
          actionLabel: 'Continue',
          actionUrl: confirmationUrl,
        }),
      };
  }
}
