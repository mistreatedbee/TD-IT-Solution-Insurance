/**
 * Security Company Dashboard — partner-scoped recovery case reads/updates.
 *
 * PDM-1/PDM-2/PDM-3/PDM-4 (compliance-review-security-partner-data-minimisation.md) +
 * ADR-0006 §18/§18.8 (PDM-8, RR-012-2 closure) are implemented here:
 *  - `accountId` never reaches an HTTP response from this router (PDM-1).
 *  - List/detail reads are tiered by claim state — unclaimed ("offer") rows and
 *    claimed ("Tier 1") rows are built from separately-projected queries and
 *    serialized by separate, narrower serializers (PDM-2).
 *  - List, count, and detail share one partner-visibility predicate, including the
 *    90-day post-closure wrap-up window (PDM-3/PDM-4, `recovery-cases.ts`).
 *  - Every list/detail read and every claim/status-change decision is written to
 *    `admin_access_log` (Trail B) before the response is built (PDM-8).
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import {
  serializeOfferTierRecoveryCase,
  serializeClaimedTierRecoveryCase,
  toClaimedTierView,
  type PartnerVisibleCaseResult,
} from '../repositories/recovery-cases.js';
import { scheduleCustomerRecoveryCaseChange } from '../lib/recovery-case-notifications.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';

const listFiltersSchema = z.object({
  status: z.enum(['open', 'investigating', 'tracking', 'recovered', 'closed']).optional(),
});

const caseIdParamsSchema = z.object({
  caseId: z.string().regex(/^[0-9a-f]{24}$/i),
});

const updateStatusSchema = z.object({
  status: z.enum(['investigating', 'tracking', 'recovered', 'closed']),
});

const ENDPOINT_LIST = 'GET /v1/security/cases';
const ENDPOINT_DETAIL = 'GET /v1/security/cases/:caseId';
const ENDPOINT_CLAIM = 'POST /v1/security/cases/:caseId/claim';
const ENDPOINT_UPDATE = 'PATCH /v1/security/cases/:caseId';

/** PDM-2 — picks the matching serializer for a tagged partner-visible result; keeps
 * every call site from having to re-derive which serializer applies to which tier. */
function serializePartnerCase(result: PartnerVisibleCaseResult) {
  return result.tier === 'claimed'
    ? serializeClaimedTierRecoveryCase(result.case)
    : serializeOfferTierRecoveryCase(result.case);
}

export function createSecurityCasesRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  function requirePartnerOrg(req: Request, _res: Response, next: NextFunction) {
    const orgId = req.auth?.partnerOrganizationId;
    if (!orgId) {
      next(apiError('FORBIDDEN', { message: 'Security operator account is not scoped to a partner organization.' }));
      return;
    }
    next();
  }

  router.get(
    '/security/cases',
    authenticate,
    requireUserType('security_company_operator'),
    requirePartnerOrg,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-list:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const filtersParsed = listFiltersSchema.safeParse(req.query);
        if (!filtersParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: filtersParsed.error.issues.map((i) => i.message) }));
          return;
        }
        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>);
        const orgId = req.auth!.partnerOrganizationId!;
        const results = await ctx.recoveryCases.listForPartnerOrg(orgId, filtersParsed.data, limit + 1, cursor);
        const page = buildPage(
          results.map((r) => ({ ...r, id: r.case.id })),
          limit,
        );

        // ADR-0006 §18.3 — per-case, NOT per-subject (C-16(b)): a customer with two
        // cases on this page produces two disclosure rows, not one. Ordering: query
        // -> materialise page -> derive disclosedCases -> write -> serialise (AUD-10).
        await ctx.adminAccessLog.recordCaseBulkDisclosure({
          disclosedCases: page.data.map((r) => ({ accountId: r.accountId, caseId: r.case.id })),
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
          endpoint: ENDPOINT_LIST,
        });

        res.status(200).json({
          data: page.data.map(serializePartnerCase),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Feature 012 FR-4 — GET /v1/security/cases/count. Registered ABOVE
  // '/security/cases/:caseId' (SR-012-2): Express matches GET routes in registration
  // order, and `:caseId`'s single-segment wildcard param would otherwise swallow
  // `/count` first and fail its 24-hex regex, returning 400 instead of running this
  // handler. Do not move this below the `:caseId` route.
  router.get(
    '/security/cases/count',
    authenticate,
    requireUserType('security_company_operator'),
    requirePartnerOrg,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-count:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const filtersParsed = listFiltersSchema.safeParse(req.query);
        if (!filtersParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: filtersParsed.error.issues.map((i) => i.message) }));
          return;
        }
        const orgId = req.auth!.partnerOrganizationId!;
        const count = await ctx.recoveryCases.countForPartnerOrg(orgId, filtersParsed.data);

        // security-review.md §14.1 (C-012-1, superseding §10.6's original "no audit
        // call"): exactly one privileged_bulk_access row, resultCount 0, empty array
        // literal (never a variable) — this is the ONLY GET .../count handler in this
        // router; ordering is count -> audit -> respond, audit write precedes
        // serialisation (AUD-10 fail-closed — a throw here must 5xx, not return count).
        // The returned `count` is NEVER written into `resultCount`, and the `status`
        // filter is never recorded (§9.4(e)/C-17). ADR-0006 §18.7 footer: RR-012-1 (this
        // unlogged, cheap, cross-tenant aggregate signal) is explicitly out of PDM-8's
        // scope and remains governed by Feature 012 §9/§11 as written — this call stays
        // on the pre-existing Trail A (`ctx.auditLog`), not the Trail B extension below.
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

  router.get(
    '/security/cases/:caseId',
    authenticate,
    requireUserType('security_company_operator'),
    requirePartnerOrg,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-detail:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const parsed = caseIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const orgId = req.auth!.partnerOrganizationId!;
        const result = await ctx.recoveryCases.findByIdForPartnerOrg(orgId, parsed.data.caseId);
        if (!result) {
          // AUD-10 / ADR-0006 §18.3: a 404 discloses nothing and must not be logged as
          // if it did — no audit write on this branch.
          next(apiError('NOT_FOUND'));
          return;
        }

        await ctx.adminAccessLog.recordDetail({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: result.accountId,
          resourceType: 'recovery_case',
          resourceId: result.case.id,
          endpoint: ENDPOINT_DETAIL,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json(serializePartnerCase(result));
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/security/cases/:caseId/claim',
    authenticate,
    requireUserType('security_company_operator'),
    requirePartnerOrg,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-claim:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const parsed = caseIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const orgId = req.auth!.partnerOrganizationId!;
        const caseId = parsed.data.caseId;

        // ADR-0006 §18.8 C-B sequence: (1) pre-read.
        const existing = await ctx.recoveryCases.findByIdForPartnerOrg(orgId, caseId);
        // (2) precondition: only an unclaimed ("offer" tier) case is claimable here —
        // a case already claimed (by this org or another) is not this decision. Fail
        // with no audit row.
        if (!existing || existing.tier !== 'offer') {
          next(apiError('NOT_FOUND', { message: 'Case is not available to claim.' }));
          return;
        }

        // (3) write the decision record BEFORE the mutation — §18.8 ruling (b):
        // write-audit-before-mutate for state changes, a deliberate departure from
        // AUD-10's literal "before serialising" text, accepted for the pilot together
        // with C-A (the mutation's own compare-and-set, enforced inside
        // claimForPartnerOrg's match clause) and C-B (this ordering). `fromStatus` is
        // the literal 'open', not a value re-derived from `existing` — claims only ever
        // transition open -> investigating, and the match clause inside
        // `claimForPartnerOrg` already requires `status: 'open'`, so the audited
        // `fromStatus` and the mutation's own precondition cannot disagree (§18.8(a)(1)).
        // `resourceId` comes from the database row (`existing.case.id`), never the
        // `:caseId` path parameter.
        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: existing.accountId,
          resourceType: 'recovery_case',
          resourceId: existing.case.id,
          fromStatus: 'open',
          toStatus: 'investigating',
          endpoint: ENDPOINT_CLAIM,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        // (4) the conditional mutation. If the audit write above throws, this line is
        // never reached (the handler's catch/`next(err)` 5xxs first).
        const claimed = await ctx.recoveryCases.claimForPartnerOrg(orgId, caseId);
        if (!claimed) {
          // Compare-and-set miss (a concurrent claim by another operator won the race
          // between the pre-read and this call) — must not return 2xx (§18.8 C-B). The
          // already-written audit row is reconciled via the AUD-8 chain check (§18.8
          // C-C), not by retracting it here.
          next(apiError('NOT_FOUND', { message: 'Case is not available to claim.' }));
          return;
        }

        scheduleCustomerRecoveryCaseChange(ctx, {
          recoveryCase: claimed,
          previousStatus: 'open',
          event: 'claimed',
        });
        // (5) respond — PDM-1: `toClaimedTierView` structurally drops `accountId`
        // before the serializer ever sees the document.
        res.status(200).json(serializeClaimedTierRecoveryCase(toClaimedTierView(claimed)));
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/security/cases/:caseId',
    authenticate,
    requireUserType('security_company_operator'),
    requirePartnerOrg,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-update:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const paramsParsed = caseIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const bodyParsed = updateStatusSchema.safeParse(req.body);
        if (!bodyParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: bodyParsed.error.issues.map((i) => i.message) }));
          return;
        }
        const orgId = req.auth!.partnerOrganizationId!;
        const caseId = paramsParsed.data.caseId;

        // §18.8 C-B sequence: (1) pre-read.
        const existing = await ctx.recoveryCases.findByIdForPartnerOrg(orgId, caseId);
        // (2) precondition: a status change may only act on a case already claimed by
        // THIS org (Tier 1). An unclaimed case must go through /claim first. Fail with
        // no audit row.
        if (!existing || existing.tier !== 'claimed') {
          next(apiError('NOT_FOUND'));
          return;
        }
        const expectedStatus = existing.case.status;

        // (3) write the decision record before the mutation (§18.8 ruling (b)).
        // `fromStatus` is the status this handler's own pre-read observed —
        // `updateStatusForPartnerOrg`'s compare-and-set filter (C-A) is given the same
        // value, so the audited transition and the mutation's own precondition cannot
        // disagree. `resourceId` is `existing.case.id`, from the database row, never the
        // `:caseId` path parameter (§18.8(a)(1)).
        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: existing.accountId,
          resourceType: 'recovery_case',
          resourceId: existing.case.id,
          fromStatus: expectedStatus,
          toStatus: bodyParsed.data.status,
          endpoint: ENDPOINT_UPDATE,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        // (4) the conditional mutation — compare-and-set on `expectedStatus` (§18.8 C-A).
        const updated = await ctx.recoveryCases.updateStatusForPartnerOrg(
          orgId,
          caseId,
          bodyParsed.data.status,
          expectedStatus,
        );
        if (!updated) {
          // A concurrent status change between the pre-read and this call (the race
          // condition this ruling's regression test exercises) — must not return 2xx.
          next(apiError('NOT_FOUND'));
          return;
        }

        scheduleCustomerRecoveryCaseChange(ctx, {
          recoveryCase: updated,
          previousStatus: expectedStatus,
          event: 'status_updated',
        });
        // (5) respond.
        res.status(200).json(serializeClaimedTierRecoveryCase(toClaimedTierView(updated)));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
