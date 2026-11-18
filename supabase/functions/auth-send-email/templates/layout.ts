import {
  EMAIL_BRAND,
  EMAIL_DARK_MODE_CSS,
  EMAIL_FONT_DISPLAY,
  EMAIL_FONT_SANS,
  EMAIL_THEMES,
  type EmailThemeKey,
  emailLogoUrl,
} from './brand.ts';
import { escapeHtml } from './helpers.ts';
import { renderEmailFooter } from './disclaimer.ts';
import { renderEmailSignature } from './signature.ts';

export interface LayoutParams {
  preheader: string;
  title: string;
  bodyHtml: string;
  actionLabel: string;
  actionUrl: string;
  footerNote?: string;
  hideFallbackLink?: boolean;
  theme?: EmailThemeKey;
  /** @deprecated Minimal templates omit the hero icon badge. */
  showHeroIcon?: boolean;
}

export function renderEmailLayout(params: LayoutParams): string {
  const {
    preheader,
    title,
    bodyHtml,
    actionLabel,
    actionUrl,
    footerNote,
    hideFallbackLink = false,
    theme = 'default',
  } = params;

  const themeTokens = EMAIL_THEMES[theme];
  const logoUrl = escapeHtml(emailLogoUrl());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(title)}</title>
  <style>${EMAIL_DARK_MODE_CSS}</style>
</head>
<body style="margin:0;padding:0;background:${EMAIL_BRAND.background};font-family:${EMAIL_FONT_SANS};color:${EMAIL_BRAND.text};">
  <span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_BRAND.background};background-image:linear-gradient(180deg,${EMAIL_BRAND.backgroundTop} 0%,${EMAIL_BRAND.backgroundPattern} 100%);padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:${EMAIL_BRAND.card};border-radius:24px;overflow:hidden;border:1px solid ${EMAIL_BRAND.border};box-shadow:0 8px 32px rgba(44,62,82,0.14);">
          <tr>
            <td style="height:4px;background:${themeTokens.stripeColor};background-image:linear-gradient(90deg,${themeTokens.stripeColor} 0%,#4DA6E0 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background:${EMAIL_BRAND.primary};background-image:linear-gradient(135deg,${EMAIL_BRAND.primary} 0%,${themeTokens.headerGradientEnd} 100%);padding:26px 32px;">
              <img
                src="${logoUrl}"
                alt="${escapeHtml(EMAIL_BRAND.name)}"
                width="132"
                style="display:block;max-width:132px;height:auto;border:0;border-radius:14px;"
              />
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 28px;">
              <h1 style="margin:0 0 16px;font-family:${EMAIL_FONT_DISPLAY};font-size:26px;line-height:1.25;letter-spacing:-0.01em;color:${EMAIL_BRAND.primary};font-weight:700;">${escapeHtml(title)}</h1>
              <div style="font-size:15px;line-height:1.65;color:${EMAIL_BRAND.muted};">${bodyHtml}</div>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 0;">
                <tr>
                  <td style="border-radius:16px;background:${EMAIL_BRAND.accent};box-shadow:${themeTokens.buttonShadow};">
                    <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:15px 30px;font-size:15px;font-weight:700;color:${EMAIL_BRAND.text};text-decoration:none;border-radius:16px;">${escapeHtml(actionLabel)}</a>
                  </td>
                </tr>
              </table>
              ${
                hideFallbackLink
                  ? ''
                  : `<p style="margin:22px 0 0;font-size:12px;line-height:1.55;color:${EMAIL_BRAND.mutedLight};">
                Or copy this link into your browser:<br />
                <a href="${escapeHtml(actionUrl)}" style="color:${EMAIL_BRAND.link};word-break:break-all;">${escapeHtml(actionUrl)}</a>
              </p>`
              }
              ${footerNote ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.55;color:${EMAIL_BRAND.muted};">${footerNote}</p>` : ''}
              ${renderEmailSignature()}
            </td>
          </tr>
          <tr>
            <td style="padding:0;">
              ${renderEmailFooter(theme)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
