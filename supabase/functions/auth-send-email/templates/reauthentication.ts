import { renderEmailLayout } from './layout.ts';
import { renderOtpBox } from './helpers.ts';
import { EMAIL_BRAND } from './brand.ts';

export function renderReauthenticationEmail(token: string): string {
  return renderEmailLayout({
    theme: 'reauthentication',
    // C-R-3(a) audit, 2026-09-10: the preheader is rendered in inbox previews and
    // lock-screen notifications. It must never carry the OTP itself — that puts a
    // live credential on a locked screen and into every preview-scanning
    // intermediary. The code stays in the body only.
    preheader: 'Your verification code is inside this message.',
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
