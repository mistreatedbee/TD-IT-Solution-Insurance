/**
 * Shared email footer + confidentiality disclaimer for domain notification HTML.
 * Visual language aligned with supabase/functions/auth-send-email/templates/.
 */
import { EMAIL_COLORS as C } from './email-style.js';
import { NOTIFICATION_BRAND } from './notification-brand.js';

export const EMAIL_CONFIDENTIALITY_DISCLAIMER =
  'The information in this message is confidential and may be legally privileged. It is intended solely for the addressee. Access to this message by anyone else is unauthorised. If you are not the intended recipient, any disclosure, copying or distribution of the message, or any action or omission taken by you in reliance on it, is prohibited and may be unlawful. Please contact the sender immediately if you received this message in error.';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const EMAIL_COLORS = {
  text: C.ink,
  muted: C.muted,
  mutedLight: C.subtle,
  link: C.link,
  background: C.page,
  card: C.card,
  border: C.border,
  primaryTint: C.sunken,
  registrationNumber: '2019/565817/07',
  legalName: 'TD IT Solution (Pty) Ltd',
  tagline: 'Asset Protection & Recovery',
} as const;

export function renderDomainEmailSignature(): string {
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;padding-top:20px;border-top:1px solid ${EMAIL_COLORS.border};">
  <tr>
    <td style="padding:16px;background:${EMAIL_COLORS.primaryTint};border-radius:16px;">
      <p style="margin:0 0 4px;font-size:13px;color:${EMAIL_COLORS.text};">Kind regards,</p>
      <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:${C.navy};">
        Mr Thabo Derrick Magagula
      </p>
      <p style="margin:0 0 10px;font-size:12px;color:${EMAIL_COLORS.mutedLight};">
        Director, ${escapeHtml(NOTIFICATION_BRAND.name)}
      </p>
      <p style="margin:0;font-size:12px;line-height:1.55;color:${EMAIL_COLORS.muted};">
        <a href="mailto:info@tditsolutionsinsurance.co.za" style="color:${EMAIL_COLORS.link};text-decoration:none;">info@tditsolutionsinsurance.co.za</a>
        ·
        <a href="${escapeHtml(NOTIFICATION_BRAND.siteUrl)}" style="color:${EMAIL_COLORS.link};text-decoration:none;">${escapeHtml(NOTIFICATION_BRAND.siteUrl.replace(/^https:\/\//, ''))}</a>
      </p>
    </td>
  </tr>
</table>`;
}

export function renderDomainEmailFooter(): string {
  const year = new Date().getFullYear();
  const logoUrl = escapeHtml(NOTIFICATION_BRAND.logoUrl);
  const disclaimer = escapeHtml(EMAIL_CONFIDENTIALITY_DISCLAIMER);

  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
  <tr>
    <td style="padding:24px 28px 20px;background:${EMAIL_COLORS.primaryTint};border-top:1px solid ${EMAIL_COLORS.border};">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" style="padding-bottom:16px;">
            <img src="${logoUrl}" alt="${escapeHtml(NOTIFICATION_BRAND.name)}" width="108" style="display:block;max-width:108px;height:auto;border:0;border-radius:12px;" />
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:16px;">
            <table role="presentation" cellspacing="0" cellpadding="0" align="center">
              <tr>
                <td style="width:40px;height:2px;background:${C.orange};font-size:0;">&nbsp;</td>
                <td style="width:8px;font-size:0;">&nbsp;</td>
                <td style="width:40px;height:2px;background:${C.brandBlue};font-size:0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 16px;background:${EMAIL_COLORS.card};border-radius:12px;border-left:3px solid ${C.orange};">
            <p style="margin:0 0 8px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.navy};">
              Disclaimer
            </p>
            <p style="margin:0;font-size:10px;line-height:1.6;color:${EMAIL_COLORS.muted};">
              ${disclaimer}
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:16px;">
            <p style="margin:0 0 4px;font-size:11px;line-height:1.5;color:${EMAIL_COLORS.muted};">
              ${escapeHtml(EMAIL_COLORS.tagline)}
            </p>
            <p style="margin:0;font-size:10px;line-height:1.5;color:${EMAIL_COLORS.mutedLight};">
              &copy; ${year} ${escapeHtml(NOTIFICATION_BRAND.name)} · Reg. ${EMAIL_COLORS.registrationNumber}
            </p>
            <p style="margin:4px 0 0;font-size:10px;line-height:1.4;color:${EMAIL_COLORS.mutedLight};">
              ${escapeHtml(EMAIL_COLORS.legalName)}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}
