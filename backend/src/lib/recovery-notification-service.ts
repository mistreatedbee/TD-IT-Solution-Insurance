/**
 * Recovery / theft notifications — Feature 007 Group 3 (REC-001, REC-002, REC-005, REC-006).
 */
import type { Env } from '../config/env.js';
import type { AccountsRepo } from '../repositories/accounts.js';
import type { AssetsRepo } from '../repositories/assets.js';
import type { NotificationPreferencesRepo } from '../repositories/notification-preferences.js';
import type { RecoveryCaseStatus } from '../repositories/recovery-cases.js';
import type { PushNotificationService } from './push-notification-service.js';
import {
  buildRecoveryCaseAssignedEmail,
  buildRecoveryCaseClosedEmail,
  buildRecoveryCaseMessageEmail,
  buildRecoveryCaseUpdateEmail,
  buildRecoverySuccessfulEmail,
  buildTheftReportSubmittedEmail,
} from './domain-email-templates.js';
import { isResendConfigured, sendResendEmail } from './resend-email.js';

const THEFT_CATEGORY = 'theft_critical' as const;

/**
 * [CO-OB03-1] Threaded onto every customer-facing recovery-case push call so
 * the device-suppression check (§3.7) can run at send time. `assetId` is
 * required to resolve the asset's bound `reportingDeviceId` (the "reported
 * device"); `reportedFromDeviceId` is the case's own CR-7 carve-out field —
 * when it equals the reported device, suppression does not apply.
 */
interface DeviceSuppressionParams {
  assetId: string;
  reportedFromDeviceId: string | null;
}

export interface RecoveryNotificationService {
  notifyTheftReportSubmitted(
    params: {
      accountId: string;
      assetName: string;
      caseId: string;
      referenceNumber: string;
      assetId: string;
    } & Partial<DeviceSuppressionParams>,
  ): Promise<void>;
  notifySecurityOperatorsTheftReported(params: {
    caseId: string;
    referenceNumber: string;
    // PDM-5 (compliance-review-security-partner-data-minimisation.md F-7):
    // the partner-facing push must not carry the customer-authored asset
    // display name. Asset category (an enum, not free text) is the most
    // identifying detail permitted in this notification.
    assetType: string;
    assetId: string;
  }): Promise<void>;
  /**
   * [CO-OB03-2] The ONLY partner push for a case, from report through
   * dispatch, once `DIRECTED_DISPATCH_ENABLED` is on: fired at the moment of
   * dispatch, to the target org's operators only. Never carries `assetId`.
   */
  notifyPartnerOrgCaseDispatched(params: {
    caseId: string;
    referenceNumber: string;
    assetType: string;
    partnerOrganizationId: string;
  }): Promise<void>;
  notifyCaseAssigned(
    params: {
      accountId: string;
      assetName: string;
      caseId: string;
      referenceNumber: string;
    } & Partial<DeviceSuppressionParams>,
  ): Promise<void>;
  notifyCaseStatusUpdated(
    params: {
      accountId: string;
      assetName: string;
      caseId: string;
      referenceNumber: string;
      status: RecoveryCaseStatus;
    } & Partial<DeviceSuppressionParams>,
  ): Promise<void>;
  notifyRecoverySuccessful(
    params: {
      accountId: string;
      assetName: string;
      caseId: string;
      referenceNumber: string;
    } & Partial<DeviceSuppressionParams>,
  ): Promise<void>;
  notifyCaseClosed(
    params: {
      accountId: string;
      assetName: string;
      caseId: string;
      referenceNumber: string;
    } & Partial<DeviceSuppressionParams>,
  ): Promise<void>;
  /** Security-operator-authored "contact customer" message (Security Company
   * Dashboard). Reuses this service's existing email+push dispatch path, which
   * already resolves/respects the customer's `theft_critical` notification
   * preferences (`isEmailEnabled`/`isPushEnabledForCategory`) — this is not a new
   * delivery channel. */
  notifyCaseMessage(
    params: {
      accountId: string;
      assetName: string;
      caseId: string;
      referenceNumber: string;
      message: string;
    } & Partial<DeviceSuppressionParams>,
  ): Promise<void>;
}

function isEmailEnabled(
  channels: Awaited<ReturnType<NotificationPreferencesRepo['getOrCreate']>>['channels'],
): boolean {
  return channels[THEFT_CATEGORY]?.email !== false;
}

function statusLabel(status: RecoveryCaseStatus): string {
  switch (status) {
    case 'investigating':
      return 'Under investigation';
    case 'tracking':
      return 'Active tracking';
    case 'recovered':
      return 'Recovered';
    case 'closed':
      return 'Closed';
    default:
      return 'Updated';
  }
}

/**
 * [CO-OB03-1] Resolves which device id(s), if any, must be excluded from a
 * case push, and whether the push must be suppressed entirely (fail-closed
 * per (d)).
 *
 * - No `assetId` supplied (a call site that predates this control, or a case
 *   event with nothing meaningfully device-bound) → no suppression.
 * - The asset has no `reportingDeviceId` binding (laptop/vehicle/TV, not a
 *   phone) → suppression does not apply — "suppresses nothing" per (b).
 * - The asset's `reportingDeviceId` equals `reportedFromDeviceId` (CR-7
 *   carve-out: the report was filed from the reported device itself) →
 *   suppression does not apply to that device.
 * - Otherwise, the reported device's token(s) are excluded.
 * - Any lookup failure → suppress the push entirely (no push sent at all for
 *   this event) rather than guess; the caller still sends email.
 */
async function resolveDeviceSuppression(
  deps: { accounts: AccountsRepo; assets: AssetsRepo },
  accountId: string,
  params: Partial<DeviceSuppressionParams> | undefined,
): Promise<{ suppressPush: boolean; excludeDeviceIds: string[] }> {
  if (!params?.assetId) {
    return { suppressPush: false, excludeDeviceIds: [] };
  }
  try {
    const asset =
      (await deps.assets.findByIdForAdmin(params.assetId)) ??
      (await deps.assets.findByIdForAccount(accountId, params.assetId));
    const reportingDeviceId = asset?.reportingDeviceId ?? null;
    if (!reportingDeviceId) {
      return { suppressPush: false, excludeDeviceIds: [] };
    }
    if (reportingDeviceId === params.reportedFromDeviceId) {
      // CR-7 carve-out — the reporting session's own device is never demoted.
      return { suppressPush: false, excludeDeviceIds: [] };
    }
    return { suppressPush: false, excludeDeviceIds: [reportingDeviceId] };
  } catch {
    // (d) Fail closed — a binding-lookup error suppresses the push entirely.
    return { suppressPush: true, excludeDeviceIds: [] };
  }
}

async function sendTheftEmailAndPush(
  deps: {
    env: Env;
    accounts: AccountsRepo;
    assets: AssetsRepo;
    notificationPreferences: NotificationPreferencesRepo;
    pushNotifications: PushNotificationService;
  },
  params: {
    accountId: string;
    email?: { subject: string; html: string };
    push: {
      templateId:
        | 'recovery.case.created'
        | 'recovery.case.updated'
        | 'recovery.case.assigned'
        | 'recovery.case.recovered'
        | 'recovery.case.closed'
        | 'recovery.case.message';
      variables: Record<string, string | undefined>;
    };
    deviceSuppression?: Partial<DeviceSuppressionParams>;
  },
): Promise<void> {
  const account = await deps.accounts.findById(params.accountId);
  if (!account || account.userType !== 'customer') return;

  const prefs = await deps.notificationPreferences.getOrCreate(params.accountId);
  const tasks: Promise<unknown>[] = [];

  if (params.email && isEmailEnabled(prefs.channels) && isResendConfigured(deps.env)) {
    tasks.push(
      sendResendEmail(deps.env, {
        to: account.email,
        subject: params.email.subject,
        html: params.email.html,
      }),
    );
  }

  const { suppressPush, excludeDeviceIds } = await resolveDeviceSuppression(
    deps,
    params.accountId,
    params.deviceSuppression,
  );

  if (!suppressPush) {
    tasks.push(
      deps.pushNotifications.sendToAccount({
        accountId: params.accountId,
        templateId: params.push.templateId,
        variables: params.push.variables,
        excludeDeviceIds,
      }),
    );
  }

  await Promise.allSettled(tasks);
}

export function createRecoveryNotificationService(deps: {
  env: Env;
  accounts: AccountsRepo;
  assets: AssetsRepo;
  notificationPreferences: NotificationPreferencesRepo;
  pushNotifications: PushNotificationService;
}): RecoveryNotificationService {
  return {
    async notifyTheftReportSubmitted({
      accountId,
      assetName,
      caseId,
      referenceNumber,
      assetId,
      reportedFromDeviceId,
    }) {
      const email = buildTheftReportSubmittedEmail({ assetName, referenceNumber, caseId });
      await sendTheftEmailAndPush(deps, {
        accountId,
        email: { subject: email.subject, html: email.html },
        push: {
          templateId: 'recovery.case.created',
          variables: { assetName, caseId, referenceNumber, assetId },
        },
        deviceSuppression: { assetId, reportedFromDeviceId: reportedFromDeviceId ?? null },
      });
    },

    async notifySecurityOperatorsTheftReported({ caseId, referenceNumber, assetType, assetId }) {
      const operatorIds = await deps.accounts.listActiveSecurityOperatorIds();
      const tasks = operatorIds.map((accountId) =>
        deps.pushNotifications.sendToAccount({
          accountId,
          templateId: 'recovery.case.partner.new',
          // PDM-5: no `assetName` here — see interface note above.
          variables: { assetType, caseId, referenceNumber, assetId },
        }),
      );
      await Promise.allSettled(tasks);
    },

    async notifyPartnerOrgCaseDispatched({ caseId, referenceNumber, assetType, partnerOrganizationId }) {
      // [CO-OB03-2] Target-org-only, and `assetId` is never passed here.
      const operatorIds = await deps.accounts.listActiveSecurityOperatorIdsForOrg(partnerOrganizationId);
      const tasks = operatorIds.map((accountId) =>
        deps.pushNotifications.sendToAccount({
          accountId,
          templateId: 'recovery.case.partner.new',
          variables: { assetType, caseId, referenceNumber },
        }),
      );
      await Promise.allSettled(tasks);
    },

    async notifyCaseAssigned({ accountId, assetName, caseId, referenceNumber, assetId, reportedFromDeviceId }) {
      const email = buildRecoveryCaseAssignedEmail({ assetName, referenceNumber });
      await sendTheftEmailAndPush(deps, {
        accountId,
        email: { subject: email.subject, html: email.html },
        push: {
          templateId: 'recovery.case.assigned',
          variables: { assetName, caseId, referenceNumber },
        },
        deviceSuppression: assetId ? { assetId, reportedFromDeviceId: reportedFromDeviceId ?? null } : undefined,
      });
    },

    async notifyCaseStatusUpdated({
      accountId,
      assetName,
      caseId,
      referenceNumber,
      status,
      assetId,
      reportedFromDeviceId,
    }) {
      const label = statusLabel(status);
      const email = buildRecoveryCaseUpdateEmail({ assetName, referenceNumber, statusLabel: label });
      await sendTheftEmailAndPush(deps, {
        accountId,
        email: { subject: email.subject, html: email.html },
        push: {
          templateId: 'recovery.case.updated',
          variables: { assetName, caseId, referenceNumber, statusLabel: label },
        },
        deviceSuppression: assetId ? { assetId, reportedFromDeviceId: reportedFromDeviceId ?? null } : undefined,
      });
    },

    async notifyRecoverySuccessful({ accountId, assetName, caseId, referenceNumber, assetId, reportedFromDeviceId }) {
      const email = buildRecoverySuccessfulEmail({ assetName, referenceNumber });
      await sendTheftEmailAndPush(deps, {
        accountId,
        email: { subject: email.subject, html: email.html },
        push: {
          templateId: 'recovery.case.recovered',
          variables: { assetName, caseId, referenceNumber },
        },
        deviceSuppression: assetId ? { assetId, reportedFromDeviceId: reportedFromDeviceId ?? null } : undefined,
      });
    },

    async notifyCaseClosed({ accountId, assetName, caseId, referenceNumber, assetId, reportedFromDeviceId }) {
      const email = buildRecoveryCaseClosedEmail({ assetName, referenceNumber });
      await sendTheftEmailAndPush(deps, {
        accountId,
        email: { subject: email.subject, html: email.html },
        push: {
          templateId: 'recovery.case.closed',
          variables: { assetName, caseId, referenceNumber },
        },
        deviceSuppression: assetId ? { assetId, reportedFromDeviceId: reportedFromDeviceId ?? null } : undefined,
      });
    },

    async notifyCaseMessage({
      accountId,
      assetName,
      caseId,
      referenceNumber,
      message,
      assetId,
      reportedFromDeviceId,
    }) {
      const email = buildRecoveryCaseMessageEmail({ assetName, referenceNumber, message });
      await sendTheftEmailAndPush(deps, {
        accountId,
        email: { subject: email.subject, html: email.html },
        push: {
          templateId: 'recovery.case.message',
          // [CO-OB03-1(f)] No partner free text in the push payload — the
          // template itself (notification-brand.ts) ignores `message` for
          // the push body unconditionally; `message` is still passed through
          // so the email (not device-targeted) keeps the real content.
          variables: { assetName, caseId, referenceNumber },
        },
        deviceSuppression: assetId ? { assetId, reportedFromDeviceId: reportedFromDeviceId ?? null } : undefined,
      });
    },
  };
}
