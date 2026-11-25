/**
 * "Locate now" durable audit (Feature 008, Stage 8 review 2026-11-25 F-4 / F-5).
 *
 * Two dedicated event types on Trail A (`app.account_audit_log`, migrations/043):
 *   - `location_locate_requested`  detail `method|assetId|requestId`
 *   - `location_locate_answered`   detail `outcome|assetId|requestId`, outcome in
 *     answered / declined / expired
 *
 * Never coordinates, never a contact detail. `recordLocateRequested` and `recordLocateOutcome`
 * THROW on failure: callers write them BEFORE the state change they describe, so a failed audit
 * write means nothing happens (fail closed). Until migrations/043 is applied, Postgres rejects
 * the new enum values, every write here throws, and Locate now refuses with 500.
 */
import type { Request } from 'express';
import type { AppContext } from '../context.js';
import type { LocateAuditOutcome } from '../repositories/audit-log.js';
import { clientIp } from '../middleware/rate-limit.js';

export type LocateRequestMethod = 'mfa' | 'password' | 'bypass';

function actor(req: Request) {
  return {
    actorAccountId: req.auth!.accountId,
    actorSessionId: req.auth!.sessionId,
    auditRequestId: req.auditRequestId ?? null,
    ipAddress: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  };
}

/** Throws on failure (fail closed). */
export async function recordLocateRequested(
  ctx: AppContext,
  req: Request,
  params: { assetId: string; requestId: string; method: LocateRequestMethod },
): Promise<void> {
  await ctx.auditLog.record({
    accountId: req.auth!.accountId,
    ...actor(req),
    eventType: 'location_locate_requested',
    protectionDetail: `${params.method}|${params.assetId}|${params.requestId}`,
  });
}

/** Throws on failure (fail closed). The actor is the answering (or declining) session. */
export async function recordLocateOutcome(
  ctx: AppContext,
  req: Request,
  params: { assetId: string; requestId: string; outcome: Exclude<LocateAuditOutcome, 'expired'> },
): Promise<void> {
  await ctx.auditLog.record({
    accountId: req.auth!.accountId,
    ...actor(req),
    eventType: 'location_locate_answered',
    protectionDetail: `${params.outcome}|${params.assetId}|${params.requestId}`,
  });
}

/**
 * One outcome row per open (pending, unexpired) request on the asset - `resolvePendingForAsset`
 * resolves them all at once, so each gets its own row. Throws on the first failure (fail
 * closed): callers run this BEFORE resolving / storing anything. Returns the ids audited.
 */
export async function auditLocateOutcomeForOpenRequests(
  ctx: AppContext,
  req: Request,
  accountId: string,
  assetId: string,
  outcome: Exclude<LocateAuditOutcome, 'expired'>,
): Promise<string[]> {
  const open = await ctx.locateRequests.listPendingForAsset(accountId, assetId);
  for (const row of open) await recordLocateOutcome(ctx, req, { assetId, requestId: row.id, outcome });
  return open.map((row) => row.id);
}

/**
 * Lazy `expired` outcome audit, run on the owner's next read of the asset's locate status and on
 * the next request for the asset. Never throws and never fails the caller: a row whose audit
 * write fails is released and retried on the next read. Expiry has no actor (nobody did
 * anything), so only the subject account and the server request id are recorded.
 *
 * Residual: a request nobody reads again within the 1 h purge window gets no `expired` row. Its
 * `location_locate_requested` row with no matching `location_locate_answered` row still shows,
 * durably, that it was never answered.
 */
export async function auditExpiredLocateRequests(
  ctx: AppContext,
  req: Request,
  accountId: string,
  assetId: string,
): Promise<void> {
  let rows: Awaited<ReturnType<AppContext['locateRequests']['listExpiredUnaudited']>>;
  try {
    rows = await ctx.locateRequests.listExpiredUnaudited(accountId, assetId);
  } catch {
    // eslint-disable-next-line no-console
    console.error('[locate-audit] expired lookup failed');
    return;
  }
  for (const row of rows) {
    try {
      if (!(await ctx.locateRequests.claimExpiryAudit(row.id))) continue;
    } catch {
      continue;
    }
    try {
      await ctx.auditLog.record({
        accountId,
        auditRequestId: req.auditRequestId ?? null,
        eventType: 'location_locate_answered',
        protectionDetail: `expired|${assetId}|${row.id}`,
      });
    } catch {
      // eslint-disable-next-line no-console
      console.error('[locate-audit] expired outcome audit failed; will retry on next read');
      await ctx.locateRequests.releaseExpiryAudit(row.id).catch(() => undefined);
    }
  }
}
