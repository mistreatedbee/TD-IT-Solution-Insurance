import { EMAIL_BRAND } from './brand.ts';
import { escapeHtml } from './helpers.ts';

/** Compact sign-off and contact block with subtle brand tint. */
export function renderEmailSignature(): string {
  const { director, phones, registrationNumber, legalName, email, addressLines, siteUrl, siteDisplay, officeHours } =
    EMAIL_BRAND;
  const phoneLinks = phones
    .map(
      (p) =>
        `<a href="${escapeHtml(p.href)}" style="color:${EMAIL_BRAND.secondary};text-decoration:none;">${escapeHtml(p.display)}</a>`,
    )
    .join(' · ');
  const addressHtml = addressLines.map((line) => escapeHtml(line)).join(', ');

  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:28px;padding-top:20px;border-top:1px solid ${EMAIL_BRAND.border};">
  <tr>
    <td style="padding:16px 18px;background:${EMAIL_BRAND.primaryTint};border-radius:8px;border:1px solid ${EMAIL_BRAND.border};">
      <p style="margin:0 0 4px;font-size:13px;color:${EMAIL_BRAND.text};">Kind regards,</p>
      <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:${EMAIL_BRAND.primary};">
        ${escapeHtml(director.honorific)} ${escapeHtml(director.name)}
      </p>
      <p style="margin:0 0 14px;font-size:12px;color:${EMAIL_BRAND.mutedLight};">
        ${escapeHtml(director.title)}, ${escapeHtml(EMAIL_BRAND.name)}
      </p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:${EMAIL_BRAND.muted};">${addressHtml}</p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:${EMAIL_BRAND.muted};">Tel: ${phoneLinks}</p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.55;">
        <a href="mailto:${escapeHtml(email)}" style="color:${EMAIL_BRAND.secondary};text-decoration:none;font-weight:600;">${escapeHtml(email)}</a>
      </p>
      <p style="margin:0 0 10px;font-size:13px;line-height:1.55;">
        <a href="${escapeHtml(siteUrl)}" style="color:${EMAIL_BRAND.secondary};text-decoration:none;font-weight:600;">${escapeHtml(siteDisplay)}</a>
      </p>
      <p style="margin:0 0 12px;font-size:12px;color:${EMAIL_BRAND.mutedLight};">${escapeHtml(officeHours)}</p>
      <p style="margin:0;font-size:11px;color:${EMAIL_BRAND.mutedLight};">
        Reg. No. ${escapeHtml(registrationNumber)} · ${escapeHtml(legalName)}
      </p>
    </td>
  </tr>
</table>`;
}
