/**
 * Admin dispatch router — OB-03
 * (`docs/features/009-customer-experience-redesign/api-design-ob03-dispatch-location-grants.md`
 * §2.1-§2.6, Tier A). Gated on `DIRECTED_DISPATCH_ENABLED` (unmounted entirely
 * while the flag is off — see `index.ts`, not a 404 inside this router).
 *
 * No partner org can reach any route in this router — `requireUserType('admin')`
 * only, same posture as `admin-partner-organizations.ts`/`admin-claims.ts`.
 *
 * [SE-1] Every route's `req.query`/`req.body` is parsed through a named zod
 * schema before any value reaches a repository filter — closes the NoSQL
 * query-operator injection opening (`?dispatchStatus[$ne]=null` style) the
 * security review found.
 *
 * [A6] Every mutating route here writes a Trail B row (`admin_access_log` via
 * `recordStateChange`/`recordDetail`/`recordBulkDisclosure`) — NOT an OB-04
 * event (`recovery_case_events` doesn't exist in code; Feature 019's future
 * deliverable, additive when it ships).
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import type { RecoveryCaseDocument } from '../repositories/recovery-cases.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';
import { validateBody } from '../lib/validation.js';
import { requireStepUp, STEP_UP_WINDOW_SECONDS } from '../lib/step-up.js';

const ENDPOINT_LIST = 'GET /v1/admin/dispatch/cases';
const ENDPOINT_DETAIL = 'GET /v1/admin/dispatch/cases/:caseId';
const ENDPOINT_DISPATCH = 'POST /v1/admin/dispatch/cases/:caseId/dispatch';
const ENDPOINT_REDISPATCH = 'POST /v1/admin/dispatch/cases/:caseId/re-dispatch';
const ENDPOINT_APPROVE = 'POST /v1/admin/dispatch/cases/:caseId/re-dispatch/approve';

const caseIdParamsSchema = z.object({
  caseId: z.string().regex(/^[0-9a-f]{24}$/i),
});

// [SE-1] Named schema, §2's exact shape. `z.enum` rejects any object-shaped
// value outright (e.g. `{ "$ne": null }`), which is what closes the
// query-operator injection opening — a bare truthy check would not.
const adminDispatchListQuerySchema = z.object({
  status: z.enum(['open', 'investigating', 'tracking', 'recovered', 'closed']).optional(),
  dispatchStatus: z.enum(['undispatched', 'pending', 'accepted']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

const dispatchCaseBodySchema = z.object({
  partnerOrganizationId: z.string().uuid(),
});

const RE_DISPATCH_REASONS = [
  'partner_declined',
  'partner_handed_back',
  'agreement_ended',
  'admin_recall',
  'other',
] as const;

const reDispatchBodySchema = z.object({
  targetPartnerOrganizationId: z.string().uuid().nullable(),
  reason: z.enum(RE_DISPATCH_REASONS),
});

const approveBodySchema = z.object({
  pendingApprovalId: z.string(),
});

const PENDING_APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

function serializeAdminDispatchCase(doc: RecoveryCaseDocument) {
  // [A8] — list/count/detail-adjacent serializer. Carries the admin-visible
  // dispatch-lifecycle fields the partner-tier serializers deliberately omit.
  // Detail (2.5) separately decides whether `lastLocation`/`lastLocationAt`
  // are present on `doc` at all (list/count never fetch them — see the
  // repository's own projection).
  return {
    id: doc.id,
    status: doc.status,
    referenceNumber: doc.referenceNumber,
    reportedAt: doc.reportedAt.toISOString(),
    partnerOrganizationId: doc.partnerOrganizationId,
    dispatchStatus: doc.dispatchStatus === null ? 'undispatched' : doc.dispatchStatus,
    dispatchedAt: doc.dispatchedAt?.toISOString() ?? null,
    dispatchedBy: doc.dispatchedBy,
    acceptedAt: doc.acceptedAt?.toISOString() ?? null,
    firstDispatchedAt: doc.firstDispatchedAt?.toISOString() ?? null,
    dispatchCount: doc.dispatchCount,
    pendingApproval: doc.pendingApproval
      ? {
          id: doc.pendingApproval.id,
          requestedBy: doc.pendingApproval.requestedBy,
          requestedTargetOrgId: doc.pendingApproval.requestedTargetOrgId,
          requestedAt: doc.pendingApproval.requestedAt.toISOString(),
          expiresAt: doc.pendingApproval.expiresAt.toISOString(),
        }
      : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    // [A8] present only when the caller fetched a document that carried it
    // (detail route) — absent (undefined, dropped by JSON.stringify) on the
    // list/count paths, whose repository query never fetches these fields.
    lastLocation: doc.lastLocation,
    lastLocationAt: doc.lastLocationAt?.toISOString() ?? null,
  };
}

/** [A8] — the list/count serializer must NEVER carry `lastLocation`/
 * `lastLocationAt`, even though the repository row object happens to have
 * those keys present as `undefined` (not fetched) rather than absent from
 * the TS type. Strips them explicitly rather than relying on `undefined`
 * dropping silently from `JSON.stringify` (which is true today, but not a
 * contract this file should depend on). */
function serializeAdminDispatchListItem(doc: RecoveryCaseDocument) {
  const full = serializeAdminDispatchCase(doc);
  const { lastLocation: _lastLocation, lastLocationAt: _lastLocationAt, ...rest } = full;
  return rest;
}

export function createAdminCaseDispatchRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  function parseListFilters(query: Record<string, unknown>) {
    const parsed = adminDispatchListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw apiError('VALIDATION_ERROR', { details: parsed.error.issues.map((i) => i.message) });
    }
    return parsed.data;
  }

  async function isTargetOrgEligible(partnerOrganizationId: string): Promise<boolean> {
    const org = await ctx.partnerOrganizations.findById(partnerOrganizationId);
    if (!org) return false;
    return org.agreementStatus === 'executed' && org.terminatedAt === null;
  }

  // 2.1 GET /admin/dispatch/cases — registered above /count and /:caseId per
  // BA-4 (count's own literal segment still needs to win over :caseId's
  // wildcard; list's own path has no sibling ambiguity, but all three are
  // declared together, in the order the design document lists them).
  router.get(
    '/admin/dispatch/cases',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `admin-dispatch-list:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const filters = parseListFilters(req.query as Record<string, unknown>);
        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>);
        const rows = await ctx.recoveryCases.listForAdminDispatchQueue(
          { status: filters.status, dispatchStatus: filters.dispatchStatus },
          limit + 1,
          cursor,
        );
        const page = buildPage(rows, limit);

        // [A8] bulk-disclosure row per page, same pattern as
        // security-cases.ts's list handler — keyed per-case, not per-subject.
        await ctx.adminAccessLog.recordCaseBulkDisclosure({
          disclosedCases: page.data.map((c) => ({ accountId: c.accountId, caseId: c.id })),
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
          endpoint: ENDPOINT_LIST,
        });

        res.status(200).json({
          data: page.data.map(serializeAdminDispatchListItem),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // 2.2 GET /admin/dispatch/cases/count — MUST be registered before
  // /admin/dispatch/cases/:caseId (BA-4): Express matches in registration
  // order and :caseId's single-segment wildcard would otherwise swallow
  // "count" and fail its 24-hex regex.
  router.get(
    '/admin/dispatch/cases/count',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `admin-dispatch-count:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const filters = parseListFilters(req.query as Record<string, unknown>);
        const count = await ctx.recoveryCases.countForAdminDispatchQueue({
          status: filters.status,
          dispatchStatus: filters.dispatchStatus,
        });

        // Trail A — same RR-012-1 precedent as security-cases.ts's own
        // /count handler: unlogged-subject, cheap aggregate signal, not a
        // Trail B disclosure (no case content is returned).
        await ctx.auditLog.recordBulkDisclosure({
          disclosedAccountIds: [],
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json({ data: { count } });
      } catch (err) {
        next(err);
      }
    },
  );

  // 2.5 GET /admin/dispatch/cases/:caseId — detail. [A8]: DOES include
  // location, with its own per-subject Trail B row.
  router.get(
    '/admin/dispatch/cases/:caseId',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `admin-dispatch-detail:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const parsed = caseIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const found = await ctx.recoveryCases.findByIdForAdmin(parsed.data.caseId);
        if (!found) {
          next(apiError('NOT_FOUND'));
          return;
        }

        await ctx.adminAccessLog.recordDetail({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: found.accountId,
          resourceType: 'recovery_case',
          resourceId: found.id,
          endpoint: ENDPOINT_DETAIL,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json({ data: serializeAdminDispatchCase(found) });
      } catch (err) {
        next(err);
      }
    },
  );

  // 2.3 POST /admin/dispatch/cases/:caseId/dispatch — requires step-up.
  router.post(
    '/admin/dispatch/cases/:caseId/dispatch',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `admin-dispatch-dispatch:${req.auth!.accountId}`),
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
    validateBody(dispatchCaseBodySchema),
    async (req, res, next) => {
      try {
        const paramsParsed = caseIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }
        const caseId = paramsParsed.data.caseId;
        const { partnerOrganizationId } = req.body as z.infer<typeof dispatchCaseBodySchema>;

        // (1) pre-read.
        const existing = await ctx.recoveryCases.findByIdForAdmin(caseId);
        if (!existing) {
          next(apiError('NOT_FOUND'));
          return;
        }
        // (2) precondition — no audit row on failure.
        if (existing.dispatchStatus !== null) {
          next(apiError('CONFLICT'));
          return;
        }
        // [A2] eligibility check.
        const eligible = await isTargetOrgEligible(partnerOrganizationId);
        if (!eligible) {
          next(apiError('DISPATCH_TARGET_NOT_ELIGIBLE'));
          return;
        }

        // (3) write the decision record before the mutation (§18.8 ruling b).
        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: existing.accountId,
          resourceType: 'recovery_case',
          resourceId: existing.id,
          fromStatus: 'undispatched',
          toStatus: 'pending',
          endpoint: ENDPOINT_DISPATCH,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
          reason: `dispatched_to_partner_org:${partnerOrganizationId}`,
        });

        // (4) conditional mutation.
        const dispatched = await ctx.recoveryCases.dispatchCase(caseId, {
          partnerOrganizationId,
          dispatchedBy: req.auth!.accountId,
        });
        if (!dispatched) {
          // CAS miss — a concurrent dispatch won the race between the
          // pre-read and this call. Must not return 2xx.
          next(apiError('CONFLICT'));
          return;
        }

        // [CO-OB03-2] — the ONLY partner push for a case, from report through
        // dispatch while DIRECTED_DISPATCH_ENABLED is on: target-org-only,
        // asset category + reference number only, never `assetId`. Fired
        // alongside the Trail B write already made above, not blocking the
        // response on delivery.
        try {
          const dispatchedAsset = await ctx.assets.findByIdForAdmin(existing.assetId);
          await ctx.recoveryNotifications.notifyPartnerOrgCaseDispatched({
            caseId: dispatched.id,
            referenceNumber: dispatched.referenceNumber,
            assetType: dispatchedAsset?.assetType ?? 'asset',
            partnerOrganizationId,
          });
        } catch {
          // Delivery failure must never fail the dispatch mutation itself —
          // the case is already dispatched and its Trail B row already
          // written; a push is a best-effort notice, not part of the
          // write-before-mutate contract.
        }

        res.status(200).json({ data: serializeAdminDispatchCase(dispatched) });
      } catch (err) {
        next(err);
      }
    },
  );

  // 2.4 POST /admin/dispatch/cases/:caseId/re-dispatch — requires step-up.
  router.post(
    '/admin/dispatch/cases/:caseId/re-dispatch',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `admin-dispatch-redispatch:${req.auth!.accountId}`),
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
    validateBody(reDispatchBodySchema),
    async (req, res, next) => {
      try {
        const paramsParsed = caseIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }
        const caseId = paramsParsed.data.caseId;
        const { targetPartnerOrganizationId, reason } = req.body as z.infer<typeof reDispatchBodySchema>;

        const existing = await ctx.recoveryCases.findByIdForAdmin(caseId);
        if (!existing) {
          next(apiError('NOT_FOUND'));
          return;
        }

        // [A9(iii)] same-holder target rejected outright, before any audit row.
        if (
          targetPartnerOrganizationId !== null &&
          existing.partnerOrganizationId !== null &&
          targetPartnerOrganizationId === existing.partnerOrganizationId
        ) {
          next(apiError('NO_OP_TARGET'));
          return;
        }

        // targetPartnerOrganizationId: null — single-admin "return to queue"
        // path, regardless of [A4]'s gate (the gate only applies to the
        // cross-org branch below).
        if (targetPartnerOrganizationId === null) {
          await ctx.adminAccessLog.recordStateChange({
            actorAccountId: req.auth!.accountId,
            actorSessionId: req.auth!.sessionId,
            auditRequestId: req.auditRequestId ?? null,
            targetAccountId: existing.accountId,
            resourceType: 'recovery_case',
            resourceId: existing.id,
            fromStatus: existing.dispatchStatus ?? 'undispatched',
            toStatus: 'undispatched',
            endpoint: ENDPOINT_REDISPATCH,
            ipAddress: clientIp(req),
            userAgent: req.header('user-agent') ?? null,
            reason: `case_unassigned:${reason}`,
          });
          const updated = await ctx.recoveryCases.reDispatchToNull(caseId);
          if (!updated) {
            next(apiError('CONFLICT'));
            return;
          }
          res.status(200).json({ data: serializeAdminDispatchCase(updated) });
          return;
        }

        // targetPartnerOrganizationId names a different org.
        const eligible = await isTargetOrgEligible(targetPartnerOrganizationId);
        if (!eligible) {
          next(apiError('DISPATCH_TARGET_NOT_ELIGIBLE'));
          return;
        }

        // [A4] state-keyed two-admin gate: a case dispatched before (ever)
        // requires second-admin approval for a cross-org move. Tier B's
        // additional "live/consumed pre-authorization" clause is a no-op
        // while PARTNER_LOCATION_SHARING_ENABLED is off (no pre-auth can
        // exist), so under Tier A alone this reduces to firstDispatchedAt.
        const requiresApproval = existing.firstDispatchedAt !== null;

        if (!requiresApproval) {
          await ctx.adminAccessLog.recordStateChange({
            actorAccountId: req.auth!.accountId,
            actorSessionId: req.auth!.sessionId,
            auditRequestId: req.auditRequestId ?? null,
            targetAccountId: existing.accountId,
            resourceType: 'recovery_case',
            resourceId: existing.id,
            fromStatus: existing.dispatchStatus ?? 'undispatched',
            toStatus: 'pending',
            endpoint: ENDPOINT_REDISPATCH,
            ipAddress: clientIp(req),
            userAgent: req.header('user-agent') ?? null,
            reason: `redispatched_to_partner_org:${targetPartnerOrganizationId}:${reason}`,
          });
          const updated = await ctx.recoveryCases.reDispatchToOrgDirect(caseId, {
            targetPartnerOrganizationId,
            actorAccountId: req.auth!.accountId,
          });
          if (!updated) {
            next(apiError('CONFLICT'));
            return;
          }
          res.status(200).json({ data: serializeAdminDispatchCase(updated) });
          return;
        }

        // Cross-org, gate required — create a pendingApproval record. Not a
        // mutation of dispatchStatus/partnerOrganizationId yet.
        const now = new Date();
        const pendingApprovalId = randomUUID();
        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: existing.accountId,
          resourceType: 'recovery_case',
          resourceId: existing.id,
          fromStatus: existing.dispatchStatus ?? 'undispatched',
          toStatus: existing.dispatchStatus ?? 'undispatched',
          endpoint: ENDPOINT_REDISPATCH,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
          reason: `pending_approval_requested:${pendingApprovalId}:target=${targetPartnerOrganizationId}:${reason}`,
        });
        const withPending = await ctx.recoveryCases.createPendingDispatchApproval(caseId, {
          id: pendingApprovalId,
          requestedBy: req.auth!.accountId,
          requestedTargetOrgId: targetPartnerOrganizationId,
          requestedAt: now,
          expiresAt: new Date(now.getTime() + PENDING_APPROVAL_WINDOW_MS),
          snapshot: {
            partnerOrganizationId: existing.partnerOrganizationId,
            dispatchStatus: existing.dispatchStatus,
            status: existing.status,
          },
        });
        if (!withPending) {
          next(apiError('CONFLICT'));
          return;
        }
        res.status(202).json({ data: { pendingApprovalId } });
      } catch (err) {
        next(err);
      }
    },
  );

  // 2.4 POST /admin/dispatch/cases/:caseId/re-dispatch/approve — the second
  // admin's approval. Also requires step-up (the approving admin is the one
  // who actually discloses the case to the new org).
  router.post(
    '/admin/dispatch/cases/:caseId/re-dispatch/approve',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `admin-dispatch-approve:${req.auth!.accountId}`),
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
    validateBody(approveBodySchema),
    async (req, res, next) => {
      try {
        const paramsParsed = caseIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }
        const caseId = paramsParsed.data.caseId;
        const { pendingApprovalId } = req.body as z.infer<typeof approveBodySchema>;

        const existing = await ctx.recoveryCases.findByIdForAdmin(caseId);
        if (!existing) {
          next(apiError('NOT_FOUND'));
          return;
        }
        if (!existing.pendingApproval || existing.pendingApproval.id !== pendingApprovalId) {
          next(apiError('PENDING_APPROVAL_INVALID'));
          return;
        }
        const pending = existing.pendingApproval;

        // Rejects same-admin approval before any audit row.
        if (pending.requestedBy === req.auth!.accountId) {
          next(apiError('CSA_SAME_ADMIN'));
          return;
        }

        // [A9(iii)] Same-holder approval requests are rejected the same way.
        if (
          existing.partnerOrganizationId !== null &&
          pending.requestedTargetOrgId === existing.partnerOrganizationId
        ) {
          next(apiError('NO_OP_TARGET'));
          return;
        }

        // TOCTOU snapshot check — the case must not have changed since the
        // request, and the request must not have expired.
        const snapshotStillMatches =
          pending.expiresAt.getTime() >= Date.now() &&
          pending.snapshot.partnerOrganizationId === existing.partnerOrganizationId &&
          pending.snapshot.dispatchStatus === existing.dispatchStatus &&
          pending.snapshot.status === existing.status;
        if (!snapshotStillMatches) {
          next(apiError('PENDING_APPROVAL_INVALID'));
          return;
        }

        // Write the decision record BEFORE the mutation, naming both admins.
        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: existing.accountId,
          resourceType: 'recovery_case',
          resourceId: existing.id,
          fromStatus: existing.dispatchStatus ?? 'undispatched',
          toStatus: 'pending',
          endpoint: ENDPOINT_APPROVE,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
          reason: `redispatch_approved:requestedBy=${pending.requestedBy}:approvedBy=${req.auth!.accountId}:target=${pending.requestedTargetOrgId}`,
        });

        const outcome = await ctx.recoveryCases.approvePendingDispatch(caseId, {
          pendingApprovalId,
          approvingAdminAccountId: req.auth!.accountId,
        });
        if (outcome.outcome !== 'ok') {
          next(apiError('PENDING_APPROVAL_INVALID'));
          return;
        }

        res.status(200).json({ data: serializeAdminDispatchCase(outcome.case) });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
