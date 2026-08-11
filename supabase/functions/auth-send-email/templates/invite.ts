import { renderEmailLayout } from './layout.ts';

export function renderInviteEmail(confirmationUrl: string): string {
  return renderEmailLayout({
    preheader: 'Accept your invitation to join the platform.',
    title: 'You have been invited',
    bodyHtml: `<p style="margin:0 0 12px;">You have been invited to join TD IT Solution Insurance as a team member. Accept the invitation below to set up your account and sign in.</p>
<p style="margin:0;">If you were not expecting this invitation, you can ignore this email.</p>`,
    actionLabel: 'Accept invitation',
    actionUrl: confirmationUrl,
  });
}
