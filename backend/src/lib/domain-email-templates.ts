/**
 * Branded HTML emails for domain notifications — aligned with auth email brand.
 */
import {
  EMAIL_COLORS as C,
  EMAIL_DARK_MODE_CSS,
  EMAIL_FONT_DISPLAY,
  EMAIL_FONT_SANS,
} from './email-style.js';
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
      ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 0;">
          <tr>
            <td style="border-radius:16px;background:${C.orange};box-shadow:0 6px 20px rgba(245,160,34,0.34);">
              <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:15px 30px;font-size:15px;font-weight:700;color:${C.ink};text-decoration:none;border-radius:16px;">${escapeHtml(ctaLabel)}</a>
            </td>
          </tr>
        </table>`
      : '';

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
<body style="margin:0;padding:0;background:${C.page};font-family:${EMAIL_FONT_SANS};color:${C.ink};">
  <span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.page};background-image:linear-gradient(180deg,${C.pageTop} 0%,${C.pageBottom} 100%);padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:${C.card};border-radius:24px;overflow:hidden;border:1px solid ${C.border};box-shadow:0 8px 32px rgba(44,62,82,0.14);">
        <tr><td style="height:4px;background:${C.orange};background-image:linear-gradient(90deg,${C.orange} 0%,${C.brandBlueBright} 100%);font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="background:${C.navy};background-image:linear-gradient(135deg,${C.navy} 0%,${C.navyEnd} 100%);padding:26px 32px;">
          <img src="${logoUrl}" alt="${escapeHtml(NOTIFICATION_BRAND.name)}" width="132" style="display:block;max-width:132px;height:auto;border:0;border-radius:14px;" />
        </td></tr>
        <tr><td style="padding:32px 32px 28px;">
          <h1 style="margin:0 0 16px;font-family:${EMAIL_FONT_DISPLAY};font-size:26px;line-height:1.25;letter-spacing:-0.01em;color:${C.navy};font-weight:700;">${escapeHtml(title)}</h1>
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
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    Your <strong>${escapeHtml(params.planName)}</strong> policy is set up.
    Open the app to review coverage and register your first asset.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">Reference: ${escapeHtml(params.policyId)}</p>`;

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
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    Your <strong>${escapeHtml(params.planName)}</strong> policy has been created and is
    <strong>pending activation</strong>. Coverage starts once billing is configured and payment is confirmed.
  </p>
  <p style="margin:0 0 12px;font-size:14px;color:#4A5A6C;">You can register assets in the app while activation is pending.</p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">Reference: ${escapeHtml(params.policyId)}</p>`;

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
  assetId: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = `${params.assetName} is now on your protection plan.`;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    <strong>${escapeHtml(params.assetName)}</strong> has been registered on your account.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">We will notify you here if tracking or recovery action is needed.</p>`;

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
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    <strong>${escapeHtml(params.assetName)}</strong> was updated: ${escapeHtml(params.changedSummary)}.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">Open the app to review the latest details.</p>`;

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
  const bodyHtml = `<p style="margin:0;font-size:16px;line-height:1.6;color:#14202D;">
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
  const preheader = 'There is an update on one of your registered items.';
  const refLine = params.referenceNumber
    ? `<p style="margin:0;font-size:14px;color:#4A5A6C;">Case reference: ${escapeHtml(params.referenceNumber)}</p>`
    : '';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    Great news — <strong>${escapeHtml(params.assetName)}</strong> has been marked
    <strong>recovered</strong> on your account.
  </p>
  ${refLine}`;

  return {
    preheader,
    subject: `Good news about your registered item — ${NOTIFICATION_BRAND.name}`,
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
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
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

/** SR-007-2 (security-review.md §7.2) — sent to the LOSING account when a
 * push token it owns is re-registered under a different account. Deliberately
 * says nothing about who registered it (no other account's identifying
 * information belongs in this email) — only that it happened and what to do. */
export function buildPushTokenReregisteredAlertEmail(): { subject: string; html: string; preheader: string } {
  const preheader = 'A device notification token on your account was claimed by another account.';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    A push notification token previously registered to your account was just re-registered under a
    <strong>different account</strong>. As a precaution, that token has been quarantined and will stop
    delivering notifications to your account after a short grace period unless you tell us otherwise.
  </p>
  <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    If this was you setting up a new device or reinstalling the app, no action is needed.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">
    If this was <strong>not</strong> you, contact support immediately — this can happen if your device or
    a copied notification identifier ended up in someone else's hands.
  </p>`;

  return {
    preheader,
    subject: `Security alert: a device notification was re-registered elsewhere — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Device notification re-registered',
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
    ? `<p style="margin:0 0 8px;font-size:14px;color:#4A5A6C;">IP address: ${escapeHtml(params.ipAddress)}</p>`
    : '';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    We detected a new sign-in to your account from <strong>${escapeHtml(params.deviceName)}</strong>.
  </p>
  ${ipLine}
  <p style="margin:0;font-size:14px;color:#4A5A6C;">If this was not you, reset your password and contact support.</p>`;

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
  const bodyHtml = `<p style="margin:0;font-size:16px;line-height:1.6;color:#14202D;">
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
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    Your account has been temporarily locked to protect it from unauthorised access.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">Wait a few minutes and try again, or use the password reset flow if you forgot your password.</p>`;

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

export type VerificationDecisionValue = 'verified' | 'rejected' | 'action_required';

/**
 * Feature 023 Phase A item 3 / §6 — identity verification decision notice. Carries only
 * the decision and the admin's customer-safe reason (never the ID number, internal note,
 * reviewer identity, or any document detail — C-013-6 / §5.2).
 */
export function buildVerificationDecisionEmail(params: {
  decision: VerificationDecisionValue;
  reasonCustomerSafe: string | null;
}): { subject: string; html: string; preheader: string } {
  const copy = {
    verified: {
      subject: 'Your identity is verified',
      title: 'Identity verified',
      lead: 'Good news: our team has verified your identity. Your account now has full protection and recovery support.',
      cta: 'Open the app',
    },
    action_required: {
      subject: 'Action needed on your identity verification',
      title: 'Please update your details',
      lead: 'Our team reviewed your identity details and needs a change before we can verify you. Update your details in the app and submit again.',
      cta: 'Update my details',
    },
    rejected: {
      subject: 'Update on your identity verification',
      title: 'We could not verify your identity',
      lead: 'Our team reviewed your identity details and could not verify them. You can review your details in the app.',
      cta: 'Review my details',
    },
  }[params.decision];
  const reasonHtml =
    params.decision !== 'verified' && params.reasonCustomerSafe
      ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#14202D;"><strong>Reason:</strong> ${escapeHtml(params.reasonCustomerSafe)}</p>`
      : '';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">${escapeHtml(copy.lead)}</p>
  ${reasonHtml}<p style="margin:0;font-size:14px;color:#4A5A6C;">If you did not expect this email, contact support from the app.</p>`;

  return {
    preheader: copy.title,
    subject: copy.subject,
    html: wrapBrandedEmail({
      preheader: copy.title,
      title: copy.title,
      bodyHtml,
      ctaLabel: copy.cta,
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildWelcomeEmail(): { subject: string; html: string; preheader: string } {
  const preheader = `Welcome to ${NOTIFICATION_BRAND.name}.`;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    Welcome to ${escapeHtml(NOTIFICATION_BRAND.name)}. Your account is ready — choose a protection plan and register your first asset in the app.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">We will send alerts here for theft reports, billing, and account security.</p>`;

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
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    Your email address is already verified on your ${escapeHtml(NOTIFICATION_BRAND.name)} account.
    Sign in to continue onboarding or manage your assets.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">If you did not request this, you can ignore this email.</p>`;

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

export function buildSignupAccountExistsEmail(): { subject: string; html: string; preheader: string } {
  const preheader = 'Someone tried to create an account with your email address.';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    Someone tried to create a new ${escapeHtml(NOTIFICATION_BRAND.name)} account with this email address, but you already have one.
    Sign in to continue, or reset your password if you have forgotten it.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">If this was not you, you can ignore this email. Your account has not been changed.</p>`;

  return {
    preheader,
    subject: `You already have an account — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'You already have an account',
      bodyHtml,
      ctaLabel: 'Sign in',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}/login`,
    }),
  };
}

export function buildOnboardingIncompleteEmail(): { subject: string; html: string; preheader: string } {
  const preheader = 'Finish setting up your asset protection in the app.';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    You have not added a protection policy yet. It only takes a few minutes to choose a plan and register your first asset.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">Open the app to continue onboarding.</p>`;

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
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    Your <strong>${escapeHtml(params.planName)}</strong> policy is active as of
    <strong>${escapeHtml(params.effectiveDate)}</strong>.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">Reference: ${escapeHtml(params.policyId)}</p>`;

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
    ? `<p style="margin:0 0 8px;font-size:14px;color:#4A5A6C;">Estimated renewal amount: ${escapeHtml(params.amount)}</p>`
    : '';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    Your <strong>${escapeHtml(params.planName)}</strong> policy renews on
    <strong>${escapeHtml(params.renewalDate)}</strong> (${params.daysUntil} day${params.daysUntil === 1 ? '' : 's'} from now).
  </p>
  ${amountLine}
  <p style="margin:0;font-size:14px;color:#4A5A6C;">Payment collection is not yet live — this is an advance notice only.</p>`;

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
  const preheader = 'We have received your report. Open the app for details.';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    We received your theft report for <strong>${escapeHtml(params.assetName)}</strong>.
    Our recovery team and security partners have been alerted.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">Case reference: ${escapeHtml(params.referenceNumber)}</p>`;

  return {
    preheader,
    subject: `Your report has been received — ${NOTIFICATION_BRAND.name}`,
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
  const preheader = 'There is an update on your case. Open the app for details.';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    A security partner has been assigned to your recovery case for
    <strong>${escapeHtml(params.assetName)}</strong>.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">Reference: ${escapeHtml(params.referenceNumber)}</p>`;

  return {
    preheader,
    subject: `Update on your case — ${NOTIFICATION_BRAND.name}`,
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
  const preheader = 'There is an update on your case. Open the app for details.';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    Your recovery case for <strong>${escapeHtml(params.assetName)}</strong> is now
    <strong>${escapeHtml(params.statusLabel)}</strong>.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">Reference: ${escapeHtml(params.referenceNumber)}</p>`;

  return {
    preheader,
    subject: `Update on your case — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Case update',
      bodyHtml,
      ctaLabel: 'Open app',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildRecoveryCaseMessageEmail(params: {
  assetName: string;
  referenceNumber: string;
  message: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = 'Your recovery partner sent you a message. Open the app for details.';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    Your recovery partner has a message about your case for
    <strong>${escapeHtml(params.assetName)}</strong>:
  </p>
  <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;white-space:pre-wrap;">${escapeHtml(params.message)}</p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">Reference: ${escapeHtml(params.referenceNumber)}</p>`;

  return {
    preheader,
    subject: `Message about your case — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Message from your recovery partner',
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
  const preheader = 'There is an update on your case. Open the app for details.';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    Your asset <strong>${escapeHtml(params.assetName)}</strong> has been marked
    <strong>recovered</strong>. Thank you for working with our recovery team.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">Reference: ${escapeHtml(params.referenceNumber)}</p>`;

  return {
    preheader,
    subject: `Good news about your case — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Recovery successful',
      bodyHtml,
      ctaLabel: 'View case',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

const CLAIM_DECISION_NOTICE_SUBJECT_LABEL: Record<
  'rejection' | 'partial_approval_shortfall' | 'administrative_close',
  string
> = {
  rejection: 'claim rejected',
  partial_approval_shortfall: 'partial approval — shortfall notice',
  administrative_close: 'claim closed',
};

/**
 * SR-018-10/CR-018-7 — the adverse-decision notice email. Carries the
 * stored `renderedText` VERBATIM (never re-rendered) as the body, per
 * security-review.md §16.4 item 2. The subject deliberately carries only
 * the claim reference and decision type — never the notice's text — so the
 * substantive content (ground code, admin reason, rights/contacts) is only
 * ever read inside the authenticated email body, consistent with keeping
 * sensitive detail out of previews/subject lines.
 */
export function buildClaimDecisionNoticeEmail(params: {
  claimId: string;
  kind: 'rejection' | 'partial_approval_shortfall' | 'administrative_close';
  renderedText: string;
}): { subject: string; html: string; preheader: string } {
  const label = CLAIM_DECISION_NOTICE_SUBJECT_LABEL[params.kind];
  const preheader = 'A decision notice has been issued on your claim. Open the app for full details.';
  const bodyHtml = `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#14202D;">
    A decision notice has been issued on your claim (reference ${escapeHtml(params.claimId)}). The full
    notice, verbatim, is below.
  </p>
  <div style="margin:0 0 16px;padding:16px;background:#E3EBF3;border:1px solid #D3DEE9;border-radius:16px;">
    <pre style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#14202D;white-space:pre-wrap;word-break:break-word;">${escapeHtml(params.renderedText)}</pre>
  </div>`;

  return {
    preheader,
    subject: `Claim ${params.claimId} — ${label} — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Decision on your claim',
      bodyHtml,
      ctaLabel: 'Open app',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

export function buildRecoveryCaseClosedEmail(params: {
  assetName: string;
  referenceNumber: string;
}): { subject: string; html: string; preheader: string } {
  const preheader = 'Your case has been closed. Open the app for details.';
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">
    Your recovery case for <strong>${escapeHtml(params.assetName)}</strong> has been closed.
    If you still need assistance, contact our support team.
  </p>
  <p style="margin:0;font-size:14px;color:#4A5A6C;">Reference: ${escapeHtml(params.referenceNumber)}</p>`;

  return {
    preheader,
    subject: `Your case has been closed — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: 'Case closed',
      bodyHtml,
      ctaLabel: 'Contact support',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}

/** Feature 021 stage (b) spec section 5 / ADR-0020 A-3: out-of-band notice on a protection
 * change. A security notice - sent regardless of the customer's email preference. Content is
 * deliberately minimal: what changed, when, which device. NEVER coordinates, an address, the
 * contact's name, or more than the last 3 digits of the contact's phone. */
export type ProtectionChangeNoticeAction =
  | 'asset_removed'
  | 'emergency_contact_changed'
  | 'reauth_exhausted'
  // INC-001 A-7 / ADR-0009 SDL-9: out-of-band notice on location opt-in / opt-out.
  | 'location_tracking_enabled'
  | 'location_tracking_disabled'
  // "Locate now" (owner-test): first remote locate request of the day for the account.
  | 'location_locate_requested';

export function maskPhoneLast3(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length <= 3 ? '***' : `***${digits.slice(-3)}`;
}

export function buildProtectionChangedEmail(params: {
  action: ProtectionChangeNoticeAction;
  assetDisplayName?: string | null;
  contactPhoneMasked?: string | null;
  deviceName: string;
  at: Date;
}): { subject: string; html: string; preheader: string } {
  const when = params.at.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  const device = escapeHtml(params.deviceName);
  let what: string;
  let title: string;
  switch (params.action) {
    case 'asset_removed':
      title = 'Asset removed from your protection';
      what = `<strong>${escapeHtml(params.assetDisplayName ?? 'An asset')}</strong> was removed from your protection plan.`;
      break;
    case 'emergency_contact_changed':
      title = 'Emergency contact changed';
      what = `Your emergency contact was changed${
        params.contactPhoneMasked ? ` (new number ending ${escapeHtml(params.contactPhoneMasked)})` : ''
      }.`;
      break;
    case 'location_tracking_enabled':
      title = 'Location tracking turned on';
      what = `Location tracking was turned on for <strong>${escapeHtml(params.assetDisplayName ?? 'an asset')}</strong> on ${device}. That phone can now send its location to TD Insurance.`;
      break;
    case 'location_tracking_disabled':
      title = 'Location tracking turned off';
      what = `Location tracking was turned off for <strong>${escapeHtml(params.assetDisplayName ?? 'an asset')}</strong>. No further location reports are accepted for it.`;
      break;
    case 'location_locate_requested':
      title = 'Your phone was asked for its location';
      what = `Someone signed in to your account on ${device} asked <strong>${escapeHtml(params.assetDisplayName ?? 'your phone')}</strong> to send its current location. We send this email for the first request each day.`;
      break;
    default:
      title = 'Too many incorrect password attempts';
      what =
        'Someone entered an incorrect password too many times while confirming a protection change. We signed that device out.';
  }
  const preheader = title;
  const bodyHtml = `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">${what}</p>
  <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4A5A6C;">When: ${escapeHtml(when)}<br/>Device: ${device}</p>
  <p style="margin:0;font-size:16px;line-height:1.6;color:#14202D;">Not you? Reset your password and contact support.</p>`;
  return {
    preheader,
    subject: `${title} - ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({ preheader, title, bodyHtml, ctaLabel: 'Contact support', ctaUrl: `${NOTIFICATION_BRAND.siteUrl}` }),
  };
}

/** Feature 021 stage (c) - safety alert email. Wording comes from safety-alert-copy.ts (no location, no verdict). */
export function buildSafetyAlertEmail(params: {
  title: string;
  paragraphs: string[];
}): { subject: string; html: string; preheader: string } {
  const preheader = params.paragraphs[0] ?? params.title;
  const bodyHtml = params.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#14202D;">${escapeHtml(p)}</p>`,
    )
    .join('');
  return {
    preheader,
    subject: `${params.title} — ${NOTIFICATION_BRAND.name}`,
    html: wrapBrandedEmail({
      preheader,
      title: params.title,
      bodyHtml,
      ctaLabel: 'Open the app',
      ctaUrl: `${NOTIFICATION_BRAND.siteUrl}`,
    }),
  };
}
