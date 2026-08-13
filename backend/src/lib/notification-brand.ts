/**
 * Brand tokens for push notifications — aligned with auth email templates
 * (supabase/functions/auth-send-email/templates/brand.ts) and mobile theme.
 */
export const NOTIFICATION_BRAND = {
  name: 'TD IT Solution Insurance',
  shortName: 'TD Insurance',
  tagline: 'Asset Protection & Recovery',
  primary: '#0B2A4A',
  primaryMid: '#2C3E50',
  secondary: '#2780B8',
  accent: '#F5A022',
  logoUrl: 'https://www.tditsolutionsinsurance.co.za/logo.png',
  siteUrl: 'https://www.tditsolutionsinsurance.co.za',
} as const;

export type PushNotificationCategory =
  | 'theft_critical'
  | 'device_status'
  | 'billing'
  | 'account'
  | 'claims'
  | 'general'
  | 'marketing';

export type PushTemplateId =
  | 'recovery.case.created'
  | 'recovery.case.updated'
  | 'recovery.case.assigned'
  | 'recovery.case.recovered'
  | 'recovery.case.closed'
  | 'policy.created'
  | 'policy.pending_activation'
  | 'asset.created'
  | 'asset.updated'
  | 'asset.removed'
  | 'asset.recovered'
  | 'auth.password.changed'
  | 'auth.login.new_device'
  | 'auth.mfa.enabled'
  | 'auth.account.locked'
  | 'account.security.test'
  | 'general.welcome'
  | 'onboarding.incomplete'
  | 'policy.activated'
  | 'policy.renewal.upcoming';

export interface PushTemplateVariables {
  assetName?: string;
  assetType?: string;
  planName?: string;
  policyId?: string;
  deviceName?: string;
  ipAddress?: string;
  referenceNumber?: string;
  caseId?: string;
  assetId?: string;
  effectiveDate?: string;
  renewalDate?: string;
  daysUntil?: string;
  amount?: string;
  statusLabel?: string;
}

export interface BrandedPushContent {
  eventId: PushTemplateId;
  title: string;
  body: string;
  subtitle: string;
  category: PushNotificationCategory;
  deepLink?: string;
  priority: 'default' | 'high';
  data: Record<string, string>;
}

function deepLink(path: string): string {
  return `tditinsurance://${path.replace(/^\//, '')}`;
}

export function buildBrandedPushMessage(
  templateId: PushTemplateId,
  variables: PushTemplateVariables = {},
): BrandedPushContent {
  const subtitle = NOTIFICATION_BRAND.name;

  switch (templateId) {
    case 'recovery.case.created':
      return {
        eventId: templateId,
        title: 'Theft case opened',
        body: variables.assetName
          ? `Tracking is active for ${variables.assetName}. Open the app for live recovery status.`
          : 'Your theft report was received. Open the app for live recovery status.',
        subtitle,
        category: 'theft_critical',
        deepLink: variables.caseId ? deepLink(`live-tracking/${variables.caseId}`) : undefined,
        priority: 'high',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          ...(variables.caseId ? { caseId: variables.caseId } : {}),
          ...(variables.assetId ? { assetId: variables.assetId } : {}),
          ...(variables.referenceNumber ? { referenceNumber: variables.referenceNumber } : {}),
          ...(variables.caseId ? { deepLink: deepLink(`live-tracking/${variables.caseId}`) } : {}),
        },
      };
    case 'recovery.case.updated':
      return {
        eventId: templateId,
        title: variables.statusLabel ?? 'Recovery update',
        body: variables.assetName
          ? `There is an update on your case for ${variables.assetName}. Open the app for details.`
          : 'There is an update on your recovery case. Open the app for details.',
        subtitle,
        category: 'theft_critical',
        deepLink: variables.caseId ? deepLink(`live-tracking/${variables.caseId}`) : undefined,
        priority: 'high',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          ...(variables.caseId ? { caseId: variables.caseId, deepLink: deepLink(`live-tracking/${variables.caseId}`) } : {}),
        },
      };
    case 'recovery.case.assigned':
      return {
        eventId: templateId,
        title: 'Recovery partner assigned',
        body: variables.assetName
          ? `A security partner is now handling your case for ${variables.assetName}.`
          : 'A security partner is now handling your recovery case.',
        subtitle,
        category: 'theft_critical',
        deepLink: variables.caseId ? deepLink(`live-tracking/${variables.caseId}`) : undefined,
        priority: 'high',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          ...(variables.referenceNumber ? { referenceNumber: variables.referenceNumber } : {}),
          ...(variables.caseId ? { caseId: variables.caseId, deepLink: deepLink(`live-tracking/${variables.caseId}`) } : {}),
        },
      };
    case 'recovery.case.recovered':
      return {
        eventId: templateId,
        title: 'Asset recovered',
        body: variables.assetName
          ? `Great news — ${variables.assetName} has been marked recovered. Open the app for case details.`
          : 'Your asset has been marked recovered. Open the app for case details.',
        subtitle,
        category: 'theft_critical',
        deepLink: variables.caseId ? deepLink(`live-tracking/${variables.caseId}`) : undefined,
        priority: 'high',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          ...(variables.caseId ? { caseId: variables.caseId, deepLink: deepLink(`live-tracking/${variables.caseId}`) } : {}),
        },
      };
    case 'recovery.case.closed':
      return {
        eventId: templateId,
        title: 'Recovery case closed',
        body: variables.assetName
          ? `Your recovery case for ${variables.assetName} has been closed. Contact support if you need further help.`
          : 'Your recovery case has been closed. Contact support if you need further help.',
        subtitle,
        category: 'theft_critical',
        deepLink: variables.caseId ? deepLink(`live-tracking/${variables.caseId}`) : undefined,
        priority: 'high',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          ...(variables.caseId ? { caseId: variables.caseId, deepLink: deepLink(`live-tracking/${variables.caseId}`) } : {}),
        },
      };
    case 'account.security.test':
      return {
        eventId: templateId,
        title: 'Notifications are working',
        body: `${NOTIFICATION_BRAND.name} push alerts are enabled on this device.`,
        subtitle: NOTIFICATION_BRAND.tagline,
        category: 'account',
        deepLink: deepLink('profile'),
        priority: 'default',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          deepLink: deepLink('profile'),
        },
      };
    case 'policy.created':
      return {
        eventId: templateId,
        title: 'Policy created',
        body: variables.planName
          ? `Your ${variables.planName} policy is ready. Open the app to review and add assets.`
          : 'Your policy is ready. Open the app to review coverage.',
        subtitle,
        category: 'general',
        deepLink: variables.policyId ? deepLink(`policy/${variables.policyId}`) : deepLink('policy'),
        priority: 'default',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          ...(variables.planName ? { planName: variables.planName } : {}),
          ...(variables.policyId ? { policyId: variables.policyId, deepLink: deepLink(`policy/${variables.policyId}`) } : {}),
        },
      };
    case 'policy.pending_activation':
      return {
        eventId: templateId,
        title: 'Policy pending activation',
        body: variables.planName
          ? `Your ${variables.planName} policy is awaiting payment activation. Open the app when billing is ready.`
          : 'Your policy is awaiting payment activation.',
        subtitle,
        category: 'billing',
        deepLink: variables.policyId ? deepLink(`policy/${variables.policyId}`) : deepLink('policy'),
        priority: 'default',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          ...(variables.planName ? { planName: variables.planName } : {}),
          ...(variables.policyId ? { policyId: variables.policyId, deepLink: deepLink(`policy/${variables.policyId}`) } : {}),
        },
      };
    case 'asset.created':
      return {
        eventId: templateId,
        title: 'Asset registered',
        body: variables.assetName
          ? `${variables.assetName} is now on your protection plan.`
          : 'A new asset was registered on your account.',
        subtitle,
        category: 'general',
        deepLink: variables.assetId ? deepLink(`assets/${variables.assetId}`) : deepLink('assets'),
        priority: 'default',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          ...(variables.assetName ? { assetName: variables.assetName } : {}),
          ...(variables.assetId ? { assetId: variables.assetId, deepLink: deepLink(`assets/${variables.assetId}`) } : {}),
        },
      };
    case 'asset.updated':
      return {
        eventId: templateId,
        title: 'Asset updated',
        body: variables.assetName
          ? `Details were updated for ${variables.assetName}.`
          : 'An asset on your account was updated.',
        subtitle,
        category: 'general',
        deepLink: variables.assetId ? deepLink(`assets/${variables.assetId}`) : deepLink('assets'),
        priority: 'default',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          ...(variables.assetId ? { assetId: variables.assetId, deepLink: deepLink(`assets/${variables.assetId}`) } : {}),
        },
      };
    case 'asset.removed':
      return {
        eventId: templateId,
        title: 'Asset removed',
        body: variables.assetName
          ? `${variables.assetName} was removed from your protection plan.`
          : 'An asset was removed from your account.',
        subtitle,
        category: 'general',
        deepLink: deepLink('assets'),
        priority: 'default',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
        },
      };
    case 'asset.recovered':
      return {
        eventId: templateId,
        title: 'Asset recovered',
        body: variables.assetName
          ? `${variables.assetName} has been marked recovered on your account.`
          : 'Your asset has been marked recovered.',
        subtitle,
        category: 'theft_critical',
        deepLink: variables.assetId ? deepLink(`assets/${variables.assetId}`) : deepLink('assets'),
        priority: 'high',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          ...(variables.assetId ? { assetId: variables.assetId, deepLink: deepLink(`assets/${variables.assetId}`) } : {}),
        },
      };
    case 'auth.password.changed':
      return {
        eventId: templateId,
        title: 'Password updated',
        body: 'Your account password was changed. If this was not you, contact support immediately.',
        subtitle,
        category: 'account',
        deepLink: deepLink('profile'),
        priority: 'high',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          deepLink: deepLink('profile'),
        },
      };
    case 'auth.login.new_device':
      return {
        eventId: templateId,
        title: 'New sign-in',
        body: variables.deviceName
          ? `A new sign-in to your account from ${variables.deviceName}.`
          : 'A new sign-in to your account was detected.',
        subtitle,
        category: 'account',
        deepLink: deepLink('profile'),
        priority: 'high',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          deepLink: deepLink('profile'),
          ...(variables.deviceName ? { deviceName: variables.deviceName } : {}),
        },
      };
    case 'auth.mfa.enabled':
      return {
        eventId: templateId,
        title: 'Two-factor authentication enabled',
        body: 'An authenticator app is now required for sign-in on protected actions.',
        subtitle,
        category: 'account',
        deepLink: deepLink('profile'),
        priority: 'default',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          deepLink: deepLink('profile'),
        },
      };
    case 'auth.account.locked':
      return {
        eventId: templateId,
        title: 'Account temporarily locked',
        body: 'Too many failed sign-in attempts. Try again later or reset your password.',
        subtitle,
        category: 'account',
        deepLink: deepLink('profile'),
        priority: 'high',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          deepLink: deepLink('profile'),
        },
      };
    case 'general.welcome':
      return {
        eventId: templateId,
        title: `Welcome to ${NOTIFICATION_BRAND.shortName}`,
        body: 'Your assets are protected. We will alert you here for theft, billing, and account updates.',
        subtitle: NOTIFICATION_BRAND.tagline,
        category: 'general',
        deepLink: deepLink(''),
        priority: 'default',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          deepLink: deepLink(''),
        },
      };
    case 'onboarding.incomplete':
      return {
        eventId: templateId,
        title: 'Complete your setup',
        body: 'You have not added a protection policy yet. Open the app to choose a plan and register your first asset.',
        subtitle,
        category: 'general',
        deepLink: deepLink('onboarding'),
        priority: 'default',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          deepLink: deepLink('onboarding'),
        },
      };
    case 'policy.activated':
      return {
        eventId: templateId,
        title: 'Policy activated',
        body: variables.planName
          ? `Your ${variables.planName} policy is now active${variables.effectiveDate ? ` from ${variables.effectiveDate}` : ''}.`
          : 'Your protection policy is now active.',
        subtitle,
        category: 'billing',
        deepLink: variables.policyId ? deepLink(`policy/${variables.policyId}`) : deepLink('policy'),
        priority: 'default',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          ...(variables.planName ? { planName: variables.planName } : {}),
          ...(variables.policyId ? { policyId: variables.policyId, deepLink: deepLink(`policy/${variables.policyId}`) } : {}),
        },
      };
    case 'policy.renewal.upcoming':
      return {
        eventId: templateId,
        title: 'Policy renewal coming up',
        body: variables.planName && variables.renewalDate
          ? `Your ${variables.planName} policy renews on ${variables.renewalDate}${variables.daysUntil ? ` (${variables.daysUntil} days)` : ''}.`
          : 'Your policy renewal date is approaching. Open the app for details.',
        subtitle,
        category: 'billing',
        deepLink: variables.policyId ? deepLink(`policy/${variables.policyId}`) : deepLink('policy'),
        priority: 'default',
        data: {
          event: templateId,
          brand: NOTIFICATION_BRAND.name,
          logoUrl: NOTIFICATION_BRAND.logoUrl,
          ...(variables.planName ? { planName: variables.planName } : {}),
          ...(variables.policyId ? { policyId: variables.policyId, deepLink: deepLink(`policy/${variables.policyId}`) } : {}),
        },
      };
    default: {
      const _exhaustive: never = templateId;
      throw new Error(`Unknown push template: ${_exhaustive}`);
    }
  }
}
