/**
 * Recovery / theft notifications — Feature 007 Group 3 (REC-001, REC-002, REC-005, REC-006).
 */
import type { Env } from '../config/env.js';
import type { AccountsRepo } from '../repositories/accounts.js';
import type { NotificationPreferencesRepo } from '../repositories/notification-preferences.js';
import type { RecoveryCaseStatus } from '../repositories/recovery-cases.js';
import type { PushNotificationService } from './push-notification-service.js';
import {
  buildRecoveryCaseAssignedEmail,
  buildRecoveryCaseClosedEmail,
  buildRecoveryCaseUpdateEmail,
  buildRecoverySuccessfulEmail,
  buildTheftReportSubmittedEmail,
} from './domain-email-templates.js';
import { isResendConfigured, sendResendEmail } from './resend-email.js';

const THEFT_CATEGORY = 'theft_critical' as const;

export interface RecoveryNotificationService {
  notifyTheftReportSubmitted(params: {
    accountId: string;
    assetName: string;
    caseId: string;
    referenceNumber: string;
    assetId: string;
  }): Promise<void>;
  notifyCaseAssigned(params: {
    accountId: string;
    assetName: string;
    caseId: string;
    referenceNumber: string;
  }): Promise<void>;
  notifyCaseStatusUpdated(params: {
    accountId: string;
    assetName: string;
    caseId: string;
    referenceNumber: string;
    status: RecoveryCaseStatus;
  }): Promise<void>;
  notifyRecoverySuccessful(params: {
    accountId: string;
    assetName: string;
    caseId: string;
    referenceNumber: string;
  }): Promise<void>;
  notifyCaseClosed(params: {
    accountId: string;
    assetName: string;
    caseId: string;
    referenceNumber: string;
  }): Promise<void>;
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

async function sendTheftEmailAndPush(
  deps: {
    env: Env;
    accounts: AccountsRepo;
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
        | 'recovery.case.closed';
      variables: Record<string, string | undefined>;
    };
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

  tasks.push(
    deps.pushNotifications.sendToAccount({
      accountId: params.accountId,
      templateId: params.push.templateId,
      variables: params.push.variables,
    }),
  );

  await Promise.allSettled(tasks);
}

export function createRecoveryNotificationService(deps: {
  env: Env;
  accounts: AccountsRepo;
  notificationPreferences: NotificationPreferencesRepo;
  pushNotifications: PushNotificationService;
}): RecoveryNotificationService {
  return {
    async notifyTheftReportSubmitted({ accountId, assetName, caseId, referenceNumber, assetId }) {
      const email = buildTheftReportSubmittedEmail({ assetName, referenceNumber, caseId });
      await sendTheftEmailAndPush(deps, {
        accountId,
        email: { subject: email.subject, html: email.html },
        push: {
          templateId: 'recovery.case.created',
          variables: { assetName, caseId, referenceNumber, assetId },
        },
      });
    },

    async notifyCaseAssigned({ accountId, assetName, caseId, referenceNumber }) {
      const email = buildRecoveryCaseAssignedEmail({ assetName, referenceNumber });
      await sendTheftEmailAndPush(deps, {
        accountId,
        email: { subject: email.subject, html: email.html },
        push: {
          templateId: 'recovery.case.assigned',
          variables: { assetName, caseId, referenceNumber },
        },
      });
    },

    async notifyCaseStatusUpdated({ accountId, assetName, caseId, referenceNumber, status }) {
      const label = statusLabel(status);
      const email = buildRecoveryCaseUpdateEmail({ assetName, referenceNumber, statusLabel: label });
      await sendTheftEmailAndPush(deps, {
        accountId,
        email: { subject: email.subject, html: email.html },
        push: {
          templateId: 'recovery.case.updated',
          variables: { assetName, caseId, referenceNumber, statusLabel: label },
        },
      });
    },

    async notifyRecoverySuccessful({ accountId, assetName, caseId, referenceNumber }) {
      const email = buildRecoverySuccessfulEmail({ assetName, referenceNumber });
      await sendTheftEmailAndPush(deps, {
        accountId,
        email: { subject: email.subject, html: email.html },
        push: {
          templateId: 'recovery.case.recovered',
          variables: { assetName, caseId, referenceNumber },
        },
      });
    },

    async notifyCaseClosed({ accountId, assetName, caseId, referenceNumber }) {
      const email = buildRecoveryCaseClosedEmail({ assetName, referenceNumber });
      await sendTheftEmailAndPush(deps, {
        accountId,
        email: { subject: email.subject, html: email.html },
        push: {
          templateId: 'recovery.case.closed',
          variables: { assetName, caseId, referenceNumber },
        },
      });
    },
  };
}
