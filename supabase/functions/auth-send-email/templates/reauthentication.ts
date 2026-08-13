import { renderEmailLayout } from './layout.ts';
import { escapeHtml, renderOtpBox } from './helpers.ts';
import { EMAIL_BRAND } from './brand.ts';

export function renderReauthenticationEmail(token: string): string {
  return renderEmailLayout({
    theme: 'reauthentication',
    preheader: `Your verification code is ${escapeHtml(token)}.`,
    title: 'Your verification code',
    showHeroIcon: false,
    bodyHtml: `<p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:${EMAIL_BRAND.text};">
        Enter this code to confirm your identity:
      </p>
      ${renderOtpBox(token)}
      <p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:${EMAIL_BRAND.muted};">
        This code expires shortly. Do not share it with anyone — we will never ask for it by phone or message.
      </p>`,
    actionLabel: 'Open the app',
    actionUrl: 'tditinsurance://',
    hideFallbackLink: true,
  });
}
