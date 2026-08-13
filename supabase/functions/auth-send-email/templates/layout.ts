import { EMAIL_BRAND, EMAIL_THEMES, type EmailThemeKey, emailLogoUrl } from './brand.ts';
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
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL_BRAND.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${EMAIL_BRAND.text};">
  <span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_BRAND.background};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:${EMAIL_BRAND.card};border-radius:12px;overflow:hidden;border:1px solid ${EMAIL_BRAND.border};">
          <tr>
            <td style="height:4px;background:${themeTokens.stripeColor};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background:${EMAIL_BRAND.primary};padding:24px 28px;">
              <img
                src="${logoUrl}"
                alt="${escapeHtml(EMAIL_BRAND.name)}"
                width="132"
                style="display:block;max-width:132px;height:auto;border:0;"
              />
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 24px;">
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${EMAIL_BRAND.primary};font-weight:700;">${escapeHtml(title)}</h1>
              <div style="font-size:15px;line-height:1.6;color:${EMAIL_BRAND.muted};">${bodyHtml}</div>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 0;">
                <tr>
                  <td style="border-radius:8px;background:${EMAIL_BRAND.accent};">
                    <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#1C1917;text-decoration:none;">${escapeHtml(actionLabel)}</a>
                  </td>
                </tr>
              </table>
              ${
                hideFallbackLink
                  ? ''
                  : `<p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:${EMAIL_BRAND.mutedLight};">
                Or copy this link into your browser:<br />
                <a href="${escapeHtml(actionUrl)}" style="color:${EMAIL_BRAND.secondary};word-break:break-all;">${escapeHtml(actionUrl)}</a>
              </p>`
              }
              ${footerNote ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${EMAIL_BRAND.muted};">${footerNote}</p>` : ''}
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
