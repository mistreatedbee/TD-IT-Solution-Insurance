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
  toOfferTierView,
  isForwardStatusTransition,
  isTerminalRecoveryCaseStatus,
  RECOVERY_CASE_CLOSE_REASONS,
  type PartnerVisibleCaseResult,
} from '../repositories/recovery-cases.js';
import {
  scheduleCustomerRecoveryCaseChange,
  scheduleCustomerRecoveryCaseMessage,
} from '../lib/recovery-case-notifications.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';

const listFiltersSchema = z.object({
  status: z.enum(['open', 'investigating', 'tracking', 'recovered', 'closed']).optional(),
});

const caseIdParamsSchema = z.object({
  caseId: z.string().regex(/^[0-9a-f]{24}$/i),
});

// Product-differentiation research, "structured close reasons" — `closeReason` is
// required exactly when `status` is terminal (`'recovered'`/`'closed'`), and must be
// absent/undefined otherwise (a non-terminal transition has no "reason it closed").
const updateStatusSchema = z
  .object({
    status: z.enum(['investigating', 'tracking', 'recovered', 'closed']),
    closeReason: z.enum(RECOVERY_CASE_CLOSE_REASONS).optional(),
  })
  .refine(
    (v) => !isTerminalRecoveryCaseStatus(v.status) || v.closeReason !== undefined,
    { message: 'closeReason is required when transitioning to a terminal status (recovered/closed)', path: ['closeReason'] },
  )
  .refine(
    (v) => isTerminalRecoveryCaseStatus(v.status) || v.closeReason === undefined,
    { message: 'closeReason may only be provided when transitioning to a terminal status (recovered/closed)', path: ['closeReason'] },
  );

const contactCustomerSchema = z.object({
  message: z.string().trim().min(1).max(500),
});

const reassignCaseSchema = z.object({
  targetPartnerOrganizationId: z.string().uuid(),
});

const ENDPOINT_LIST = 'GET /v1/security/cases';
const ENDPOINT_DETAIL = 'GET /v1/security/cases/:caseId';
const ENDPOINT_CLAIM = 'POST /v1/security/cases/:caseId/claim';
const ENDPOINT_UPDATE = 'PATCH /v1/security/cases/:caseId';
const ENDPOINT_RELEASE = 'POST /v1/security/cases/:caseId/release';
const ENDPOINT_REASSIGN = 'POST /v1/security/cases/:caseId/reassign';
const ENDPOINT_CONTACT = 'POST /v1/security/cases/:caseId/messages';

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

        // SR-009S-6 — reject a backward/sideways status transition (e.g. closed ->
        // investigating) BEFORE writing any audit row: this is a semantic validation
        // failure, not a "the case isn't visible to you" case, so it is reported as
        // CONFLICT (409), distinct from the NOT_FOUND branches above/below.
        if (!isForwardStatusTransition(expectedStatus, bodyParsed.data.status)) {
          next(apiError('CONFLICT', { message: 'Case status cannot move backward.' }));
          return;
        }

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
          bodyParsed.data.closeReason ?? null,
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

  // Gap-closure #1 — release to the shared unassigned pool. An operator releases a
  // case they've claimed back to the pool (`releaseForPartnerOrg`), where any
  // partner org — including this one — can claim it again via the existing
  // POST /security/cases/:caseId/claim. See the dedicated `/reassign` route below
  // for handing a case directly to a specific target org instead.
  router.post(
    '/security/cases/:caseId/release',
    authenticate,
    requireUserType('security_company_operator'),
    requirePartnerOrg,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-release:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const parsed = caseIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const orgId = req.auth!.partnerOrganizationId!;
        const caseId = parsed.data.caseId;

        // §18.8 C-B sequence: (1) pre-read.
        const existing = await ctx.recoveryCases.findByIdForPartnerOrg(orgId, caseId);
        // (2) precondition: only a case claimed by THIS org, still mid-investigation
        // (not recovered/closed), can be released. Fail with no audit row.
        if (
          !existing ||
          existing.tier !== 'claimed' ||
          (existing.case.status !== 'investigating' && existing.case.status !== 'tracking')
        ) {
          next(apiError('NOT_FOUND', { message: 'Case is not available to release.' }));
          return;
        }

        // (3) write the decision record before the mutation (§18.8 ruling (b)).
        // `resourceId` is `existing.case.id` from the database row, never the
        // `:caseId` path parameter (§18.8(a)(1)).
        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: existing.accountId,
          resourceType: 'recovery_case',
          resourceId: existing.case.id,
          fromStatus: existing.case.status,
          toStatus: 'open',
          endpoint: ENDPOINT_RELEASE,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        // (4) the conditional mutation — compare-and-set inside releaseForPartnerOrg
        // (still owned by this org, still investigating/tracking).
        const released = await ctx.recoveryCases.releaseForPartnerOrg(orgId, caseId);
        if (!released) {
          // Concurrent status change / release between pre-read and this call — must
          // not return 2xx (§18.8 C-B).
          next(apiError('NOT_FOUND', { message: 'Case is not available to release.' }));
          return;
        }

        // (5) respond — offer-tier view: the case is unclaimed again, so this
        // response must not leak `accountId`, `notes`, `assetId`, or location data to
        // this (or any) operator (PDM-1/PDM-2).
        res.status(200).json(serializeOfferTierRecoveryCase(toOfferTierView(released)));
      } catch (err) {
        next(err);
      }
    },
  );

  // Case reassignment — now that `partner_organizations` (repositories/
  // partner-organizations.ts) exists as a real directory, a case the caller's org
  // holds can be handed directly to a specific target org, without an intermediate
  // trip through the shared unassigned pool (which would let any other org snipe it
  // mid-reassignment, since `claim` matches ANY unclaimed case).
  router.post(
    '/security/cases/:caseId/reassign',
    authenticate,
    requireUserType('security_company_operator'),
    requirePartnerOrg,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-reassign:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const paramsParsed = caseIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const bodyParsed = reassignCaseSchema.safeParse(req.body);
        if (!bodyParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: bodyParsed.error.issues.map((i) => i.message) }));
          return;
        }
        const orgId = req.auth!.partnerOrganizationId!;
        const caseId = paramsParsed.data.caseId;
        const { targetPartnerOrganizationId } = bodyParsed.data;

        if (targetPartnerOrganizationId === orgId) {
          next(apiError('VALIDATION_ERROR', { details: ['targetPartnerOrganizationId must differ from the caller\'s own organization'] }));
          return;
        }

        // Validate the target org exists and is active — same check/error pattern as
        // `routes/invitations.ts`'s `partnerOrganizationId` validation.
        const targetOrg = await ctx.partnerOrganizations.findById(targetPartnerOrganizationId);
        if (!targetOrg) {
          next(apiError('VALIDATION_ERROR', { details: ['targetPartnerOrganizationId does not refer to a known partner organization'] }));
          return;
        }
        if (targetOrg.status !== 'active') {
          next(apiError('VALIDATION_ERROR', { details: ['targetPartnerOrganizationId refers to a suspended partner organization'] }));
          return;
        }

        // §18.8 C-B sequence: (1) pre-read.
        const existing = await ctx.recoveryCases.findByIdForPartnerOrg(orgId, caseId);
        // (2) precondition: only a case claimed by THIS org, still mid-investigation
        // (not recovered/closed), can be reassigned. Fail with no audit row.
        if (
          !existing ||
          existing.tier !== 'claimed' ||
          (existing.case.status !== 'investigating' && existing.case.status !== 'tracking')
        ) {
          next(apiError('NOT_FOUND', { message: 'Case is not available to reassign.' }));
          return;
        }

        // (3) write the decision record before the mutation (§18.8 ruling (b)).
        // `resourceId` is `existing.case.id` from the database row, never the
        // `:caseId` path parameter (§18.8(a)(1)). The org transition itself is
        // carried in `reason` (free-text, same slot `/messages` uses for its action
        // label) since `fromStatus`/`toStatus` are case-status fields, not org ids.
        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: existing.accountId,
          resourceType: 'recovery_case',
          resourceId: existing.case.id,
          fromStatus: existing.case.status,
          toStatus: 'investigating',
          endpoint: ENDPOINT_REASSIGN,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
          reason: `reassigned_from_partner_org:${orgId}_to_partner_org:${targetPartnerOrganizationId}`,
        });

        // (4) the conditional mutation — compare-and-set inside reassignForPartnerOrg
        // (still owned by this org, still investigating/tracking).
        const reassigned = await ctx.recoveryCases.reassignForPartnerOrg(orgId, caseId, targetPartnerOrganizationId);
        if (!reassigned) {
          // Concurrent status change / release/claim/reassign between pre-read and
          // this call — must not return 2xx (§18.8 C-B).
          next(apiError('NOT_FOUND', { message: 'Case is not available to reassign.' }));
          return;
        }

        scheduleCustomerRecoveryCaseChange(ctx, {
          recoveryCase: reassigned,
          previousStatus: existing.case.status,
          event: 'status_updated',
        });

        // (5) respond — claimed-tier view, scoped to the CALLER's org. The target
        // org now holds the case; the caller (who initiated the reassignment) gets a
        // confirmation of the resulting state, matching what `/claim` and `/release`
        // already return to their respective callers.
        res.status(200).json(serializeClaimedTierRecoveryCase(toClaimedTierView(reassigned)));
      } catch (err) {
        next(err);
      }
    },
  );

  // Gap-closure #2 — contact customer. Reuses the existing recovery-notification
  // infrastructure (`ctx.recoveryNotifications`, the same email+push dispatch path
  // every other recovery-case event already uses) rather than a new delivery
  // channel, so the customer's `theft_critical` notification preferences/opt-outs
  // are respected exactly as they already are for status-change notifications.
  router.post(
    '/security/cases/:caseId/messages',
    authenticate,
    requireUserType('security_company_operator'),
    requirePartnerOrg,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-contact:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const paramsParsed = caseIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const bodyParsed = contactCustomerSchema.safeParse(req.body);
        if (!bodyParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: bodyParsed.error.issues.map((i) => i.message) }));
          return;
        }
        const orgId = req.auth!.partnerOrganizationId!;
        const caseId = paramsParsed.data.caseId;

        // A message may only be sent on a case claimed by THIS org — an operator may
        // not message a customer on a case it hasn't claimed (no audit row on a
        // NOT_FOUND here, matching every other read-first branch in this router).
        const existing = await ctx.recoveryCases.findByIdForPartnerOrg(orgId, caseId);
        if (!existing || existing.tier !== 'claimed') {
          next(apiError('NOT_FOUND'));
          return;
        }

        // Audit trail — not a state change (status doesn't move), so fromStatus/
        // toStatus are both the case's current, unchanged status; the `reason` field
        // (already optional/additive on this row shape) carries the action label.
        // The message's own free text is NOT written to the audit row — only that an
        // operator contacted the customer, consistent with not logging full PII/
        // message content (backend-engineer best practice / compliance posture).
        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: existing.accountId,
          resourceType: 'recovery_case',
          resourceId: existing.case.id,
          fromStatus: existing.case.status,
          toStatus: existing.case.status,
          endpoint: ENDPOINT_CONTACT,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
          reason: 'security_operator_contacted_customer',
        });

        // Dispatch in the background via the shared recovery-case notification path —
        // `notifyCaseMessage` -> `sendTheftEmailAndPush`, which already checks
        // `notificationPreferences` (email) and push-category opt-out before sending.
        // `existing`'s claimed-tier result carries `accountId` (PDM-8 audit-only
        // field, per the tier types' doc comments) and `case.assetId` even though
        // neither reaches this route's own HTTP response.
        scheduleCustomerRecoveryCaseMessage(ctx, {
          recoveryCase: {
            id: existing.case.id,
            accountId: existing.accountId,
            assetId: existing.case.assetId,
            referenceNumber: existing.case.referenceNumber,
          },
          message: bodyParsed.data.message,
        });

        res.status(202).json({ data: { accepted: true } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
