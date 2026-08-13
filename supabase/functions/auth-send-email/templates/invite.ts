import { renderEmailLayout } from './layout.ts';
import { EMAIL_BRAND } from './brand.ts';

export function renderInviteEmail(confirmationUrl: string): string {
  return renderEmailLayout({
    theme: 'invite',
    preheader: 'You have been invited to TD IT Solution Insurance.',
    title: 'Accept your invitation',
    showHeroIcon: false,
    bodyHtml: `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${EMAIL_BRAND.text};">
        You have been invited to join <strong style="color:${EMAIL_BRAND.primary};">${EMAIL_BRAND.name}</strong>.
      </p>
      <p style="margin:0;font-size:14px;line-height:1.55;color:${EMAIL_BRAND.muted};">
        Use the button below to set up your credentials. If you were not expecting this invitation, you can ignore this email.
      </p>`,
    actionLabel: 'Accept invitation',
    actionUrl: confirmationUrl,
  });
}
