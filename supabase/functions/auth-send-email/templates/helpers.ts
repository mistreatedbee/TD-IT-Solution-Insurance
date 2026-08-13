import { EMAIL_BRAND } from './brand.ts';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Styled OTP / verification code block. */
export function renderOtpBox(token: string): string {
  const safe = escapeHtml(token);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:12px 0 0;">
    <tr>
      <td align="center" style="background:${EMAIL_BRAND.background};border:1px solid ${EMAIL_BRAND.border};border-radius:8px;padding:20px 16px;">
        <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:8px;color:${EMAIL_BRAND.primary};font-family:'Courier New',Courier,monospace;">${safe}</p>
      </td>
    </tr>
  </table>`;
}
