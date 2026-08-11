import { renderInviteEmail } from './invite.ts';
import { renderRecoveryEmail } from './recovery.ts';
import { renderReauthenticationEmail } from './reauthentication.ts';
import { renderSignupEmail } from './signup.ts';
import { subjectFor } from './subjects.ts';
import { renderEmailLayout } from './layout.ts';

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
          preheader: 'Use this secure link to sign in.',
          title: 'Sign in to your account',
          bodyHtml: '<p style="margin:0;">Use the button below to sign in. This link expires shortly and can only be used once.</p>',
          actionLabel: 'Sign in',
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
          preheader: 'Account notification from TD IT Solution Insurance.',
          title: 'Account notification',
          bodyHtml: '<p style="margin:0;">Please use the link below to continue.</p>',
          actionLabel: 'Continue',
          actionUrl: confirmationUrl,
        }),
      };
  }
}
