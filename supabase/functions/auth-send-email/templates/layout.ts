const BRAND = {
  name: 'TD IT Solution Insurance',
  primary: '#2C3E50',
  accent: '#F5A022',
  text: '#1a1a1a',
  muted: '#5c6670',
  background: '#f4f6f8',
  card: '#ffffff',
};

export interface LayoutParams {
  preheader: string;
  title: string;
  bodyHtml: string;
  actionLabel: string;
  actionUrl: string;
  footerNote?: string;
}

export function renderEmailLayout(params: LayoutParams): string {
  const { preheader, title, bodyHtml, actionLabel, actionUrl, footerNote } = params;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text};">
  <span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.background};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:${BRAND.card};border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(44,62,80,0.08);">
          <tr>
            <td style="background:${BRAND.primary};padding:24px 32px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.2px;">${BRAND.name}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${BRAND.primary};">${escapeHtml(title)}</h1>
              <div style="font-size:15px;line-height:1.6;color:${BRAND.muted};">${bodyHtml}</div>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 8px;">
                <tr>
                  <td style="border-radius:8px;background:${BRAND.accent};">
                    <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#1a1a1a;text-decoration:none;">${escapeHtml(actionLabel)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${BRAND.muted};">
                If the button does not work, copy and paste this link into your browser:<br />
                <a href="${escapeHtml(actionUrl)}" style="color:${BRAND.primary};word-break:break-all;">${escapeHtml(actionUrl)}</a>
              </p>
              ${footerNote ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:${BRAND.muted};">${footerNote}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #e8ecef;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};text-align:center;">
                &copy; ${year} ${BRAND.name}. Asset protection &amp; recovery platform.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
