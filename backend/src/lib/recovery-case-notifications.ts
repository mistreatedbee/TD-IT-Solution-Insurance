/**
 * Dispatches customer recovery notifications after security partner actions.
 */
import type { AppContext } from '../context.js';
import type { RecoveryCaseDocument, RecoveryCaseStatus } from '../repositories/recovery-cases.js';
import { notifyInBackground } from './customer-notification-service.js';

async function resolveAssetName(
  ctx: Pick<AppContext, 'assets'>,
  accountId: string,
  assetId: string,
): Promise<{ name: string; id: string }> {
  const asset =
    (await ctx.assets.findByIdForAdmin(assetId)) ??
    (await ctx.assets.findByIdForAccount(accountId, assetId));
  return { name: asset?.displayName ?? 'Your asset', id: asset?.id ?? assetId };
}

export async function notifyCustomerRecoveryCaseChange(
  ctx: Pick<AppContext, 'recoveryNotifications' | 'customerNotifications' | 'assets'>,
  params: {
    recoveryCase: RecoveryCaseDocument;
    previousStatus: RecoveryCaseStatus;
    event: 'claimed' | 'status_updated';
  },
): Promise<void> {
  const { recoveryCase, previousStatus, event } = params;
  const asset = await resolveAssetName(ctx, recoveryCase.accountId, recoveryCase.assetId);
  const base = {
    accountId: recoveryCase.accountId,
    assetName: asset.name,
    caseId: recoveryCase.id,
    referenceNumber: recoveryCase.referenceNumber,
  };

  if (event === 'claimed') {
    await ctx.recoveryNotifications.notifyCaseAssigned(base);
    return;
  }

  const { status } = recoveryCase;
  if (status === previousStatus) return;

  if (status === 'recovered') {
    await ctx.recoveryNotifications.notifyRecoverySuccessful(base);
    await ctx.customerNotifications.notifyAssetRecovered({
      accountId: recoveryCase.accountId,
      assetId: asset.id,
      assetName: asset.name,
      referenceNumber: recoveryCase.referenceNumber,
    });
    return;
  }

  if (status === 'closed') {
    await ctx.recoveryNotifications.notifyCaseClosed(base);
    return;
  }

  if (status === 'investigating' || status === 'tracking') {
    await ctx.recoveryNotifications.notifyCaseStatusUpdated({ ...base, status });
  }
}

export function scheduleCustomerRecoveryCaseChange(
  ctx: Pick<AppContext, 'recoveryNotifications' | 'customerNotifications' | 'assets'>,
  params: {
    recoveryCase: RecoveryCaseDocument;
    previousStatus: RecoveryCaseStatus;
    event: 'claimed' | 'status_updated';
  },
): void {
  notifyInBackground(
    'recovery.case.change',
    notifyCustomerRecoveryCaseChange(ctx, params),
  );
}

/** Minimal case identity `notifyCustomerRecoveryCaseMessage` needs — deliberately
 * narrower than `RecoveryCaseDocument` so a security-dashboard caller working from
 * a claimed-tier (PDM-1/PDM-2-projected) read result doesn't need to fabricate the
 * police-report/call-centre-note fields that read never fetched. */
export interface RecoveryCaseMessageTarget {
  id: string;
  accountId: string;
  assetId: string;
  referenceNumber: string;
}

/** Security Company Dashboard "contact customer" action — reuses the same
 * email+push dispatch path (and the same preference/opt-out gating) as every
 * other recovery-case notification above, rather than a new delivery channel. */
export async function notifyCustomerRecoveryCaseMessage(
  ctx: Pick<AppContext, 'recoveryNotifications' | 'assets'>,
  params: { recoveryCase: RecoveryCaseMessageTarget; message: string },
): Promise<void> {
  const { recoveryCase, message } = params;
  const asset = await resolveAssetName(ctx, recoveryCase.accountId, recoveryCase.assetId);
  await ctx.recoveryNotifications.notifyCaseMessage({
    accountId: recoveryCase.accountId,
    assetName: asset.name,
    caseId: recoveryCase.id,
    referenceNumber: recoveryCase.referenceNumber,
    message,
  });
}

export function scheduleCustomerRecoveryCaseMessage(
  ctx: Pick<AppContext, 'recoveryNotifications' | 'assets'>,
  params: { recoveryCase: RecoveryCaseMessageTarget; message: string },
): void {
  notifyInBackground(
    'recovery.case.message',
    notifyCustomerRecoveryCaseMessage(ctx, params),
  );
}
