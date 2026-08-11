import { renderEmailLayout } from './layout.ts';

export function renderReauthenticationEmail(token: string): string {
  return renderEmailLayout({
    preheader: `Your verification code is ${token}.`,
    title: 'Your verification code',
    bodyHtml: `<p style="margin:0 0 16px;">Use this one-time code to verify your identity:</p>
<p style="margin:0;font-size:28px;font-weight:700;letter-spacing:6px;color:#2C3E50;font-family:monospace;">${token}</p>
<p style="margin:16px 0 0;">This code expires shortly. Do not share it with anyone.</p>`,
    actionLabel: 'Open app',
    actionUrl: 'tditinsurance://',
    footerNote: 'If you did not request this code, contact support immediately.',
  });
}
