/**
 * Feature 021 stage (b) spec sections 5 and 6 - audit + out-of-band notice for a guarded
 * protection change (and for re-authentication exhaustion).
 *
 * Fired AFTER the change commits. A failure of either never rolls the change back; a notice
 * failure is itself audited as `protection_change_notice_failed`. Nothing here ever receives
 * or logs a password, TOTP code, token, contact name/phone, coordinates or address.
 */
import type { Request } from 'express';
import type { AppContext } from '../context.js';
import type { ProtectionChangeAction, ProtectionChangeMethod } from '../repositories/audit-log.js';
import type { ProtectionChangeNoticeAction } from './domain-email-templates.js';
import { clientIp } from '../middleware/rate-limit.js';

function auditBase(req: Request) {
  return {
    accountId: req.auth!.accountId,
    actorAccountId: req.auth!.accountId,
    actorSessionId: req.auth!.sessionId,
    auditRequestId: req.auditRequestId ?? null,
    ipAddress: clientIp(req),
  };
}

/** Out-of-band notice (SDL-9 pattern). Fire-and-forget: failure is audited, never thrown.
 * Resolves `true` when the notice was handed off successfully, `false` when it failed (so a
 * caller can, e.g., set a dedupe key only after a successful send - Feature 008 F-6). */
export function dispatchProtectionNotice(
  ctx: AppContext,
  req: Request,
  params: {
    action: ProtectionChangeNoticeAction;
    deviceName: string | null;
    assetDisplayName?: string | null;
    contactPhoneMasked?: string | null;
  },
): Promise<boolean> {
  const base = auditBase(req);
  return Promise.resolve()
    .then(() => ctx.authNotifications.notifyProtectionChanged({ ...params, accountId: base.accountId, at: new Date() }))
    .then(() => true)
    .catch(async () => {
      try {
        await ctx.auditLog.record({
          ...base,
          eventType: 'protection_change_notice_failed',
          protectionDetail: params.action,
        });
      } catch {
        // eslint-disable-next-line no-console
        console.error('[protection-change] notice failure could not be audited');
      }
      return false;
    });
}

/** Audit the committed change, then dispatch the notice in the background. */
export async function recordProtectionChange(
  ctx: AppContext,
  req: Request,
  params: {
    action: ProtectionChangeAction;
    method: ProtectionChangeMethod;
    assetId?: string;
    assetDisplayName?: string | null;
    contactPhoneMasked?: string | null;
  },
): Promise<void> {
  const session = await ctx.sessions.findById(req.auth!.sessionId).catch(() => null);
  try {
    await ctx.auditLog.record({
      ...auditBase(req),
      eventType: 'protection_change',
      protectionDetail: [params.action, params.method, params.assetId].filter(Boolean).join('|'),
    });
  } catch {
    // The change is committed; do not turn it into a 500. No PII in this log line.
    // eslint-disable-next-line no-console
    console.error('[protection-change] audit write failed');
  }
  void dispatchProtectionNotice(ctx, req, {
    action: params.action,
    deviceName: session?.deviceName ?? null,
    assetDisplayName: params.assetDisplayName,
    contactPhoneMasked: params.contactPhoneMasked,
  });
}
