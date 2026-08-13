/**
 * Branded HTML emails for domain notifications — aligned with auth email brand.
 */
import { NOTIFICATION_BRAND } from './notification-brand.js';
import { renderDomainEmailFooter, renderDomainEmailSignature } from './email-footer.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapBrandedEmail(params: {
  preheader: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const { preheader, title, bodyHtml, ctaLabel, ctaUrl } = params;
  const logoUrl = escapeHtml(NOTIFICATION_BRAND.logoUrl);
  const ctaHtml =
    ctaLabel && ctaUrl
      ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 0;">
          <tr>
            <td style="border-radius:8px;background:${NOTIFICATION_BRAND.accent};">
              <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:14px 24px;font-size:15px;font-weight:700;color:#1C1917;text-decoration:none;">${escapeHtml(ctaLabel)}</a>
            </td>
          </tr>
        </table>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#FAF8F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1C1917;">
  <span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FAF8F5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #E4DDD1;">
        <tr><td style="height:4px;background:${NOTIFICATION_BRAND.accent};font-size:0;">&nbsp;</td></tr>
        <tr><td style="background:${NOTIFICATION_BRAND.primary};padding:24px 28px;">
          <img src="${logoUrl}" alt="${escapeHtml(NOTIFICATION_BRAND.name)}" width="132" style="display:block;max-width:132px;height:auto;border:0;" />
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${NOTIFICATION_BRAND.primary};font-weight:700;">${escapeHtml(title)}</h1>
          ${bodyHtml}
          ${ctaHtml}
          ${renderDomainEmailSignature()}
        </td></tr>
        <tr><td style="padding:0;">
          ${renderDomainEmailFooter()}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildPolicyCreatedEmail(params: {
  planName: string;
  policyId: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = `Your ${params.planName} policy has been created.`;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    Your <strong>${escapeHtml(params.planName)}</strong> policy is set up.
    Open the app to review coverage and register your first asset.
  </p>
  <p style="margin:0;font-size:14px;color:#6B6156;">Reference: ${escapeHtml(params.policyId)}</p>`;

  return {
    preheader,
    subject: `Your ${params.planName} policy is ready — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Policy created',
      bodyHtml,
      ctaLabel: 'View in app',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

/** POL-001 — policy created, payment / activation still pending. */
export function buildPolicyPendingActivationEmail(params: {
  planName: string;
  policyId: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = `Your ${params.planName} policy is pending activation.`;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    Your <strong>${escapeHtml(params.planName)}</strong> policy has been created and is
    <strong>pending activation</strong>. Coverage starts once billing is configured and payment is confirmed.
  </p>
  <p style="margin:0 0 12px;font-size:14px;color:#6B6156;">You can register assets in the app while activation is pending.</p>
  <p style="margin:0;font-size:14px;color:#6B6156;">Reference: ${escapeHtml(params.policyId)}</p>`;

  return {
    preheader,
    subject: `Policy pending activation — ${params.planName}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Pending activation',
      bodyHtml,
      ctaLabel: 'View in app',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildAssetCreatedEmail(params: {
  assetName: string;
  assetType: string;
  assetId: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = `${params.assetName} is now on your protection plan.`;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    <strong>${escapeHtml(params.assetName)}</strong> (${escapeHtml(params.assetType.replace(/_/g, ' '))})
    has been registered on your account.
  </p>
  <p style="margin:0;font-size:14px;color:#6B6156;">We will notify you here if tracking or recovery action is needed.</p>`;

  return {
    preheader,
    subject: `Asset registered — ${params.assetName}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Asset registered',
      bodyHtml,
      ctaLabel: 'View asset',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildAssetUpdatedEmail(params: {
  assetName: string;
  assetId: string;
  changedSummary: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = `${params.assetName} was updated (${params.changedSummary}).`;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    <strong>${escapeHtml(params.assetName)}</strong> was updated: ${escapeHtml(params.changedSummary)}.
  </p>
  <p style="margin:0;font-size:14px;color:#6B6156;">Open the app to review the latest details.</p>`;

  return {
    preheader,
    subject: `Asset updated — ${params.assetName}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Asset updated',
      bodyHtml,
      ctaLabel: 'View asset',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildAssetRemovedEmail(params: {
  assetName: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = `${params.assetName} was removed from your account.`;
  const bodyHtml = `<p style="margin:0;font-size:16px;line-height:1.6;color:#1C1917;">
    <strong>${escapeHtml(params.assetName)}</strong> has been removed from your protection plan.
    It will no longer appear in your active asset list.
  </p>`;

  return {
    preheader,
    subject: `Asset removed — ${params.assetName}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Asset removed',
      bodyHtml,
      ctaLabel: 'View assets',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildAssetRecoveredEmail(params: {
  assetName: string;
  referenceNumber: string | null;
}): { subject: string; html: string; preheader: string } {
  const preheader = `${params.assetName} has been marked recovered.`;
  const refLine = params.referenceNumber
    ? `<p style="margin:0;font-size:14px;color:#6B6156;">Case reference: ${escapeHtml(params.referenceNumber)}</p>`
    : '';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    Great news — <strong>${escapeHtml(params.assetName)}</strong> has been marked
    <strong>recovered</strong> on your account.
  </p>
  ${refLine}`;

  return {
    preheader,
    subject: `Asset recovered — ${params.assetName}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Asset recovered',
      bodyHtml,
      ctaLabel: 'View asset',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildPasswordChangedEmail(): { subject: string; html: string; preheader: string } {
  const preheader = 'Your account password was updated.';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    Your password was changed successfully. If you did not make this change, contact us immediately.
  </p>`;

  return {
    preheader,
    subject: `Password updated — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Password changed',
      bodyHtml,
      ctaLabel: 'Contact support',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildNewDeviceLoginEmail(params: {
  deviceName: string;
  ipAddress: string | null;
}): { subject: string; html: string; preheader: string } {
  const preheader = `New sign-in from ${params.deviceName}.`;
  const ipLine = params.ipAddress
    ? `<p style="margin:0 0 8px;font-size:14px;color:#6B6156;">IP address: ${escapeHtml(params.ipAddress)}</p>`
    : '';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    We detected a new sign-in to your account from <strong>${escapeHtml(params.deviceName)}</strong>.
  </p>
  ${ipLine}
  <p style="margin:0;font-size:14px;color:#6B6156;">If this was not you, reset your password and contact support.</p>`;

  return {
    preheader,
    subject: `New sign-in detected — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'New device sign-in',
      bodyHtml,
      ctaLabel: 'Review account',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildMfaEnabledEmail(): { subject: string; html: string; preheader: string } {
  const preheader = 'Two-factor authentication is now enabled on your account.';
  const bodyHtml = `<p style="margin:0;font-size:16px;line-height:1.6;color:#1C1917;">
    Authenticator-based two-factor authentication is now active. You will need your authenticator app for future sign-ins.
  </p>`;

  return {
    preheader,
    subject: `Two-factor authentication enabled — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: '2FA enabled',
      bodyHtml,
    }),
  };
}

export function buildAccountLockedEmail(): { subject: string; html: string; preheader: string } {
  const preheader = 'Your account is temporarily locked after too many failed sign-in attempts.';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    Your account has been temporarily locked to protect it from unauthorised access.
  </p>
  <p style="margin:0;font-size:14px;color:#6B6156;">Wait a few minutes and try again, or use the password reset flow if you forgot your password.</p>`;

  return {
    preheader,
    subject: `Account temporarily locked — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Account locked',
      bodyHtml,
      ctaLabel: 'Reset password',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildWelcomeEmail(): { subject: string; html: string; preheader: string } {
  const preheader = `Welcome to ${NOTIFICATION_BRAND.name}.`;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    Welcome to ${escapeHtml(NOTIFICATION_BRAND.name)}. Your account is ready — choose a protection plan and register your first asset in the app.
  </p>
  <p style="margin:0;font-size:14px;color:#6B6156;">We will send alerts here for theft reports, billing, and account security.</p>`;

  return {
    preheader,
    subject: `Welcome — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Your account is ready',
      bodyHtml,
      ctaLabel: 'Get started',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildEmailAlreadyVerifiedEmail(): { subject: string; html: string; preheader: string } {
  const preheader = 'Your email address is already verified.';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    Your email address is already verified on your ${escapeHtml(NOTIFICATION_BRAND.name)} account.
    Sign in to continue onboarding or manage your assets.
  </p>
  <p style="margin:0;font-size:14px;color:#6B6156;">If you did not request this, you can ignore this email.</p>`;

  return {
    preheader,
    subject: `Email verified — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Email already verified',
      bodyHtml,
      ctaLabel: 'Sign in',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}/login`,
    }),
  };
}

export function buildOnboardingIncompleteEmail(): { subject: string; html: string; preheader: string } {
  const preheader = 'Finish setting up your asset protection in the app.';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    You have not added a protection policy yet. It only takes a few minutes to choose a plan and register your first asset.
  </p>
  <p style="margin:0;font-size:14px;color:#6B6156;">Open the app to continue onboarding.</p>`;

  return {
    preheader,
    subject: `Complete your setup — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Complete your setup',
      bodyHtml,
      ctaLabel: 'Continue onboarding',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildPolicyActivatedEmail(params: {
  planName: string;
  policyId: string;
  effectiveDate: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = `Your ${params.planName} policy is now active.`;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    Your <strong>${escapeHtml(params.planName)}</strong> policy is active as of
    <strong>${escapeHtml(params.effectiveDate)}</strong>.
  </p>
  <p style="margin:0;font-size:14px;color:#6B6156;">Reference: ${escapeHtml(params.policyId)}</p>`;

  return {
    preheader,
    subject: `Policy activated — ${params.planName}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Policy activated',
      bodyHtml,
      ctaLabel: 'View policy',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildPolicyRenewalUpcomingEmail(params: {
  planName: string;
  policyId: string;
  renewalDate: string;
  daysUntil: number;
  amount: string | null;
}): { subject: string; html: string; preheader: string } {
  const preheader = `Your ${params.planName} policy renews in ${params.daysUntil} day${params.daysUntil === 1 ? '' : 's'}.`;
  const amountLine = params.amount
    ? `<p style="margin:0 0 8px;font-size:14px;color:#6B6156;">Estimated renewal amount: ${escapeHtml(params.amount)}</p>`
    : '';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    Your <strong>${escapeHtml(params.planName)}</strong> policy renews on
    <strong>${escapeHtml(params.renewalDate)}</strong> (${params.daysUntil} day${params.daysUntil === 1 ? '' : 's'} from now).
  </p>
  ${amountLine}
  <p style="margin:0;font-size:14px;color:#6B6156;">Payment collection is not yet live — this is an advance notice only.</p>`;

  return {
    preheader,
    subject: `Renewal reminder — ${params.planName}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Renewal coming up',
      bodyHtml,
      ctaLabel: 'View policy',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildTheftReportSubmittedEmail(params: {
  assetName: string;
  referenceNumber: string;
  caseId: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = `Theft report received for ${params.assetName}. Reference ${params.referenceNumber}.`;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    We received your theft report for <strong>${escapeHtml(params.assetName)}</strong>.
    Our recovery team and security partners have been alerted.
  </p>
  <p style="margin:0;font-size:14px;color:#6B6156;">Case reference: ${escapeHtml(params.referenceNumber)}</p>`;

  return {
    preheader,
    subject: `Theft report received — ${params.referenceNumber}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Theft report submitted',
      bodyHtml,
      ctaLabel: 'Track recovery',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildRecoveryCaseAssignedEmail(params: {
  assetName: string;
  referenceNumber: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = `A security partner is now handling case ${params.referenceNumber}.`;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    A security partner has been assigned to your recovery case for
    <strong>${escapeHtml(params.assetName)}</strong>.
  </p>
  <p style="margin:0;font-size:14px;color:#6B6156;">Reference: ${escapeHtml(params.referenceNumber)}</p>`;

  return {
    preheader,
    subject: `Recovery partner assigned — ${params.referenceNumber}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Partner assigned',
      bodyHtml,
      ctaLabel: 'View case',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildRecoveryCaseUpdateEmail(params: {
  assetName: string;
  referenceNumber: string;
  statusLabel: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = `Update on case ${params.referenceNumber}: ${params.statusLabel}.`;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    Your recovery case for <strong>${escapeHtml(params.assetName)}</strong> is now
    <strong>${escapeHtml(params.statusLabel)}</strong>.
  </p>
  <p style="margin:0;font-size:14px;color:#6B6156;">Reference: ${escapeHtml(params.referenceNumber)}</p>`;

  return {
    preheader,
    subject: `Recovery update — ${params.referenceNumber}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Case update',
      bodyHtml,
      ctaLabel: 'Open app',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildRecoverySuccessfulEmail(params: {
  assetName: string;
  referenceNumber: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = `${params.assetName} has been marked recovered.`;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    Your asset <strong>${escapeHtml(params.assetName)}</strong> has been marked
    <strong>recovered</strong>. Thank you for working with our recovery team.
  </p>
  <p style="margin:0;font-size:14px;color:#6B6156;">Reference: ${escapeHtml(params.referenceNumber)}</p>`;

  return {
    preheader,
    subject: `Asset recovered — ${params.referenceNumber}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Recovery successful',
      bodyHtml,
      ctaLabel: 'View case',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildRecoveryCaseClosedEmail(params: {
  assetName: string;
  referenceNumber: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = `Recovery case ${params.referenceNumber} has been closed.`;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1C1917;">
    Your recovery case for <strong>${escapeHtml(params.assetName)}</strong> has been closed.
    If you still need assistance, contact our support team.
  </p>
  <p style="margin:0;font-size:14px;color:#6B6156;">Reference: ${escapeHtml(params.referenceNumber)}</p>`;

  return {
    preheader,
    subject: `Case closed — ${params.referenceNumber}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Case closed',
      bodyHtml,
      ctaLabel: 'Contact support',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}
