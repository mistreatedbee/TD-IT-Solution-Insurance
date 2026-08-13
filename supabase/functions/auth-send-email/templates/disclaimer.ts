import { EMAIL_BRAND, EMAIL_THEMES, type EmailThemeKey, emailLogoUrl } from './brand.ts';
import { escapeHtml } from './helpers.ts';

/** Standard confidentiality notice — included on all outbound transactional email. */
export const EMAIL_CONFIDENTIALITY_DISCLAIMER =
  'The information in this message is confidential and may be legally privileged. It is intended solely for the addressee. Access to this message by anyone else is unauthorised. If you are not the intended recipient, any disclosure, copying or distribution of the message, or any action or omission taken by you in reliance on it, is prohibited and may be unlawful. Please contact the sender immediately if you received this message in error.';

export function renderEmailFooter(theme: EmailThemeKey = 'default'): string {
  const themeTokens = EMAIL_THEMES[theme];
  const year = new Date().getFullYear();
  const logoUrl = escapeHtml(emailLogoUrl());
  const disclaimer = escapeHtml(EMAIL_CONFIDENTIALITY_DISCLAIMER);

  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
  <tr>
    <td style="padding:24px 28px 20px;background:${EMAIL_BRAND.primaryTint};border-top:1px solid ${EMAIL_BRAND.border};">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" style="padding-bottom:16px;">
            <img
              src="${logoUrl}"
              alt="${escapeHtml(EMAIL_BRAND.name)}"
              width="108"
              style="display:block;max-width:108px;height:auto;border:0;"
            />
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:16px;">
            <table role="presentation" cellspacing="0" cellpadding="0" align="center">
              <tr>
                <td style="width:40px;height:2px;background:${themeTokens.stripeColor};font-size:0;line-height:0;">&nbsp;</td>
                <td style="width:8px;font-size:0;">&nbsp;</td>
                <td style="width:40px;height:2px;background:${EMAIL_BRAND.secondary};font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 16px;background:${EMAIL_BRAND.card};border-radius:8px;border-left:3px solid ${themeTokens.stripeColor};">
            <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${EMAIL_BRAND.primary};">
              Disclaimer
            </p>
            <p style="margin:0;font-size:10px;line-height:1.6;color:${EMAIL_BRAND.muted};">
              ${disclaimer}
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:16px;">
            <p style="margin:0 0 4px;font-size:11px;line-height:1.5;color:${EMAIL_BRAND.muted};">
              ${escapeHtml(EMAIL_BRAND.tagline)}
            </p>
            <p style="margin:0;font-size:10px;line-height:1.5;color:${EMAIL_BRAND.mutedLight};">
              &copy; ${year} ${escapeHtml(EMAIL_BRAND.name)} · Reg. ${escapeHtml(EMAIL_BRAND.registrationNumber)}
            </p>
            <p style="margin:4px 0 0;font-size:10px;line-height:1.4;color:${EMAIL_BRAND.mutedLight};">
              ${escapeHtml(EMAIL_BRAND.legalName)}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}
