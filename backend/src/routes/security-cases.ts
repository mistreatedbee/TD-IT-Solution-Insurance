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
 *
 * OB-03 (docs/features/009-customer-experience-redesign/
 * api-design-ob03-dispatch-location-grants.md §3, Tier A sub-task 3) — this file now
 * branches, at request time, on `ctx.env.directedDispatchEnabled`:
 *  - **Flag off:** the pre-OB-03 "pool" model, byte-for-byte unchanged — `claim`,
 *    `release`-to-pool, `reassign`, the single `claimedCaseVisiblePredicate`/
 *    `unclaimedCaseVisiblePredicate` pair.
 *  - **Flag on:** the OB-03 dispatch model — `claim`/`reassign` are UNMOUNTED
 *    outright (R-1, no deprecation window), `accept`/`decline` are new, `release`
 *    is repurposed as hand-back-to-queue, and list/count/detail/messages/the new
 *    status-PATCH route (§3.1a) all gate on the split pending/claimed predicates
 *    (`pendingCaseVisiblePredicate`/`dispatchClaimedCaseVisiblePredicate`), each
 *    additionally scoped by the target org's CURRENT agreement status
 *    (`isOrgDispatchEligible` below) so a terminated org loses access immediately,
 *    even inside the 90-day wrap-up window (CO-OB03-3).
 *  - §3.7 (customer push suppression on reported-stolen devices) is a separate,
 *    not-yet-built sub-task — not touched here.
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
import { validateBody } from '../lib/validation.js';
import { appendRecoveryCaseEvent } from '../lib/recovery-case-event-append.js';

const listFiltersSchema = z.object({
  status: z.enum(['open', 'investigating', 'tracking', 'recovered', 'closed']).optional(),
});

const caseIdParamsSchema = z.object({
  caseId: z.string().regex(/^[0-9a-f]{24}$/i),
});

// Product-differentiation research, "structured close reasons" — `closeReason` is
// required exactly when `status` is terminal (`'recovered'`/`'closed'`), and must be
// absent/undefined otherwise (a non-terminal transition has no "reason it closed").
// [SE-1] Reused, under its original name, as OB-03 §3.1a's `statusPatchBodySchema`
// too — same shape, same rule, no behavioural divergence between the pool and
// dispatch models for THIS validation.
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
const statusPatchBodySchema = updateStatusSchema;

const contactCustomerSchema = z.object({
  message: z.string().trim().min(1).max(500),
});

const reassignCaseSchema = z.object({
  targetPartnerOrganizationId: z.string().uuid(),
});

// OB-03 §3/[SE-1] — named schemas, every new/changed dispatch-model route parses
// through one of these before any value reaches a repository filter.
const DECLINE_REASONS = ['no_capacity', 'outside_service_area', 'other'] as const;
const declineBodySchema = z.object({ reason: z.enum(DECLINE_REASONS) });

const HAND_BACK_REASONS = [
  'recovered_independently',
  'unable_to_proceed',
  'agreement_lapsed',
  'other',
] as const;
const releaseBodySchema = z.object({ reason: z.enum(HAND_BACK_REASONS) });

// `accept` takes no body — `z.object({}).strict()` rejects any unexpected key
// (closes the same injection-shaped-body opening [SE-1] names for query params).
const acceptBodySchema = z.object({}).strict();

const ENDPOINT_LIST = 'GET /v1/security/cases';
const ENDPOINT_DETAIL = 'GET /v1/security/cases/:caseId';
const ENDPOINT_CLAIM = 'POST /v1/security/cases/:caseId/claim';
const ENDPOINT_ACCEPT = 'POST /v1/security/cases/:caseId/accept';
const ENDPOINT_DECLINE = 'POST /v1/security/cases/:caseId/decline';
const ENDPOINT_UPDATE = 'PATCH /v1/security/cases/:caseId';
const ENDPOINT_RELEASE = 'POST /v1/security/cases/:caseId/release';
const ENDPOINT_REASSIGN = 'POST /v1/security/cases/:caseId/reassign';
const ENDPOINT_CONTACT = 'POST /v1/security/cases/:caseId/messages';

/** PDM-2 — picks the matching serializer for a tagged partner-visible result; keeps
 * every call site from having to re-derive which serializer applies to which tier. */
function serializePartnerCase(result: PartnerVisibleCaseResult, dispatchMode: boolean) {
  return result.tier === 'claimed'
    ? serializeClaimedTierRecoveryCase(result.case, dispatchMode)
    : serializeOfferTierRecoveryCase(result.case, new Date(), dispatchMode);
}

export function createSecurityCasesRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  function directedDispatchEnabled(): boolean {
    return ctx.env.directedDispatchEnabled === true;
  }

  function requirePartnerOrg(req: Request, _res: Response, next: NextFunction) {
    const orgId = req.auth?.partnerOrganizationId;
    if (!orgId) {
      next(apiError('FORBIDDEN', { message: 'Security operator account is not scoped to a partner organization.' }));
      return;
    }
    next();
  }

  /**
   * OB-03 §3.5 [CO-OB03-3] — the dispatch model's org-eligibility check. Checked
   * fresh on every request (not cached), same source §2.3's A2 admin-side check
   * reads: `agreementStatus === 'executed' && terminatedAt === null`. Every
   * dispatch-gated route (list/count/detail/messages/accept/decline/release/
   * status-PATCH) calls this — an org that has been terminated loses access
   * immediately, including inside the 90-day wrap-up window, because the route
   * layer refuses to proceed at all once this returns false (mapped to the same
   * CS-8 oracle response every other "not visible to you" branch uses).
   */
  async function isOrgDispatchEligible(partnerOrganizationId: string): Promise<boolean> {
    const org = await ctx.partnerOrganizations.findById(partnerOrganizationId);
    if (!org) return false;
    return org.agreementStatus === 'executed' && org.terminatedAt === null;
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

        let results: PartnerVisibleCaseResult[];
        if (directedDispatchEnabled()) {
          // [CO-OB03-3] A terminated org sees nothing — not an error, an empty page.
          const eligible = await isOrgDispatchEligible(orgId);
          results = eligible
            ? await ctx.recoveryCases.listForPartnerOrgDispatch(orgId, filtersParsed.data, limit + 1, cursor)
            : [];
        } else {
          results = await ctx.recoveryCases.listForPartnerOrg(orgId, filtersParsed.data, limit + 1, cursor);
        }
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
          data: page.data.map((r) => serializePartnerCase(r, directedDispatchEnabled())),
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

        let count: number;
        if (directedDispatchEnabled()) {
          const eligible = await isOrgDispatchEligible(orgId);
          count = eligible ? await ctx.recoveryCases.countForPartnerOrgDispatch(orgId, filtersParsed.data) : 0;
        } else {
          count = await ctx.recoveryCases.countForPartnerOrg(orgId, filtersParsed.data);
        }

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

        let result: PartnerVisibleCaseResult | null;
        if (directedDispatchEnabled()) {
          // [CO-OB03-3] Oracle uniformity — an ineligible (terminated) org's lookup
          // must be indistinguishable from "case not found"/"dispatched elsewhere".
          const eligible = await isOrgDispatchEligible(orgId);
          result = eligible ? await ctx.recoveryCases.findByIdForPartnerOrgDispatch(orgId, parsed.data.caseId) : null;
        } else {
          result = await ctx.recoveryCases.findByIdForPartnerOrg(orgId, parsed.data.caseId);
        }
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

        res.status(200).json(serializePartnerCase(result, directedDispatchEnabled()));
      } catch (err) {
        next(err);
      }
    },
  );

  // Pool model only — unmounted (not merely unreachable) once
  // DIRECTED_DISPATCH_ENABLED is on (R-1, no deprecation window): calling this path
  // after the flip returns 404 because Express has no route registered for it.
  if (!directedDispatchEnabled()) {
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

          // OB-04 (§12.2 A2) — case-history append, post-CAS, pre-response (SR-019-1,
          // SR-019-3). `occurredAt` is the result's own `updatedAt`, never a fresh
          // `new Date()`. Never throws (appendRecoveryCaseEvent swallows failures).
          await appendRecoveryCaseEvent(ctx, claimed.id, {
            eventType: 'case_claimed',
            caseId: claimed.id,
            occurredAt: claimed.updatedAt,
            actor: {
              type: 'security_company_operator',
              accountId: req.auth!.accountId,
              partnerOrganizationId: orgId,
            },
            fromStatus: 'open',
            toStatus: 'investigating',
            fromPartnerOrganizationId: null,
            toPartnerOrganizationId: orgId,
            closeReason: null,
            auditRequestId: req.auditRequestId ?? null,
          });

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
  }

  // OB-03 §3.1 — new, dispatch model only. Replaces `claim`.
  if (directedDispatchEnabled()) {
    router.post(
      '/security/cases/:caseId/accept',
      authenticate,
      requireUserType('security_company_operator'),
      requirePartnerOrg,
      createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-accept:${req.auth!.accountId}`),
      validateBody(acceptBodySchema),
      async (req, res, next) => {
        try {
          const parsed = caseIdParamsSchema.safeParse(req.params);
          if (!parsed.success) {
            next(apiError('VALIDATION_ERROR'));
            return;
          }
          const orgId = req.auth!.partnerOrganizationId!;
          const caseId = parsed.data.caseId;

          // [CO-OB03-3] / [A2] — re-checks org eligibility at accept time (an org may
          // have been terminated between dispatch and accept).
          const eligible = await isOrgDispatchEligible(orgId);
          if (!eligible) {
            next(apiError('NOT_FOUND'));
            return;
          }

          // (1) pre-read, scoped to the pending predicate only (an accept must act on
          // a case dispatched-but-not-yet-accepted to THIS org).
          const existing = await ctx.recoveryCases.findByIdForPartnerOrgDispatch(orgId, caseId);
          if (!existing || existing.tier !== 'offer' || existing.case.status !== 'open') {
            // CS-8 oracle — identical NOT_FOUND body regardless of whether the case is
            // undispatched, dispatched elsewhere, already accepted, or nonexistent.
            next(apiError('NOT_FOUND'));
            return;
          }

          // (2)/(3) write the decision record before the mutation (§18.8 ruling b).
          await ctx.adminAccessLog.recordStateChange({
            actorAccountId: req.auth!.accountId,
            actorSessionId: req.auth!.sessionId,
            auditRequestId: req.auditRequestId ?? null,
            targetAccountId: existing.accountId,
            resourceType: 'recovery_case',
            resourceId: existing.case.id,
            fromStatus: 'open',
            toStatus: 'investigating',
            endpoint: ENDPOINT_ACCEPT,
            ipAddress: clientIp(req),
            userAgent: req.header('user-agent') ?? null,
            reason: 'dispatch_accepted',
          });

          // (4) conditional mutation — CAS on dispatchStatus:'pending' + org match.
          const accepted = await ctx.recoveryCases.acceptDispatchedCase(orgId, caseId);
          if (!accepted) {
            // Compare-and-set miss — a true race (CS-1's rare case). 409, not 2xx.
            next(apiError('CONFLICT'));
            return;
          }

          // Pre-authorization consumption / grant creation (D3.1 Path A) is Tier B
          // (PARTNER_LOCATION_SHARING_ENABLED) — out of scope for this Tier A pass; no
          // call is made here (the design's own text: "consumes nothing yet").

          scheduleCustomerRecoveryCaseChange(ctx, {
            recoveryCase: accepted,
            previousStatus: 'open',
            event: 'claimed',
          });

          // (5) respond.
          res.status(200).json({ data: serializeClaimedTierRecoveryCase(toClaimedTierView(accepted), true) });
        } catch (err) {
          next(err);
        }
      },
    );

    // OB-03 §3.2 — new, dispatch model only.
    router.post(
      '/security/cases/:caseId/decline',
      authenticate,
      requireUserType('security_company_operator'),
      requirePartnerOrg,
      createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-decline:${req.auth!.accountId}`),
      validateBody(declineBodySchema),
      async (req, res, next) => {
        try {
          const paramsParsed = caseIdParamsSchema.safeParse(req.params);
          if (!paramsParsed.success) {
            next(apiError('VALIDATION_ERROR'));
            return;
          }
          const orgId = req.auth!.partnerOrganizationId!;
          const caseId = paramsParsed.data.caseId;
          const { reason } = req.body as z.infer<typeof declineBodySchema>;

          const eligible = await isOrgDispatchEligible(orgId);
          if (!eligible) {
            next(apiError('NOT_FOUND'));
            return;
          }

          const existing = await ctx.recoveryCases.findByIdForPartnerOrgDispatch(orgId, caseId);
          if (!existing || existing.tier !== 'offer') {
            // CS-8 oracle.
            next(apiError('NOT_FOUND'));
            return;
          }

          await ctx.adminAccessLog.recordStateChange({
            actorAccountId: req.auth!.accountId,
            actorSessionId: req.auth!.sessionId,
            auditRequestId: req.auditRequestId ?? null,
            targetAccountId: existing.accountId,
            resourceType: 'recovery_case',
            resourceId: existing.case.id,
            fromStatus: existing.case.status,
            toStatus: existing.case.status,
            endpoint: ENDPOINT_DECLINE,
            ipAddress: clientIp(req),
            userAgent: req.header('user-agent') ?? null,
            reason: `dispatch_declined:${reason}`,
          });

          const declined = await ctx.recoveryCases.declineDispatchedCase(orgId, caseId);
          if (!declined) {
            next(apiError('NOT_FOUND', { message: 'Case is not available to decline.' }));
            return;
          }

          // [CO-OB03-6] customer-facing status reflects "returned to queue" / "no
          // partner currently assigned" immediately.
          scheduleCustomerRecoveryCaseChange(ctx, {
            recoveryCase: declined,
            previousStatus: existing.case.status,
            event: 'status_updated',
          });

          res.status(200).json({ data: { caseId: declined.id, status: 'returned_to_queue' } });
        } catch (err) {
          next(err);
        }
      },
    );
  }

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
        const bodyParsed = statusPatchBodySchema.safeParse(req.body);
        if (!bodyParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: bodyParsed.error.issues.map((i) => i.message) }));
          return;
        }
        const orgId = req.auth!.partnerOrganizationId!;
        const caseId = paramsParsed.data.caseId;
        const dispatchMode = directedDispatchEnabled();

        if (dispatchMode) {
          // [CO-OB03-3] Oracle uniformity — ineligible org treated identically to
          // "case not found".
          const eligible = await isOrgDispatchEligible(orgId);
          if (!eligible) {
            next(apiError('NOT_FOUND'));
            return;
          }
        }

        // §18.8 C-B sequence: (1) pre-read.
        const existing = dispatchMode
          ? await ctx.recoveryCases.findByIdForPartnerOrgDispatch(orgId, caseId)
          : await ctx.recoveryCases.findByIdForPartnerOrg(orgId, caseId);
        // (2) precondition: a status change may only act on a case already claimed by
        // THIS org (Tier 1) — in dispatch mode, this additionally means
        // `dispatchStatus: 'accepted'` ([A3]/[A1]: a pending-not-yet-accepted org must
        // not be able to move status, same as it cannot message). An unclaimed/pending
        // case must go through `claim`/`accept` first. Fail with no audit row.
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
        const updated = dispatchMode
          ? await ctx.recoveryCases.updateStatusForPartnerOrgDispatch(
              orgId,
              caseId,
              bodyParsed.data.status,
              expectedStatus,
              bodyParsed.data.closeReason ?? null,
            )
          : await ctx.recoveryCases.updateStatusForPartnerOrg(
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

        // OB-04 (§12.2 A2) — pool model only (dispatch-mode status changes are A4's
        // scope). Post-CAS, pre-response (SR-019-1, SR-019-3): `occurredAt` is
        // `updated.updatedAt`, not a fresh `new Date()`. Org is unchanged by a status
        // change, so both from/to org are the caller's own `orgId`.
        if (!dispatchMode) {
          await appendRecoveryCaseEvent(ctx, updated.id, {
            eventType: 'status_changed',
            caseId: updated.id,
            occurredAt: updated.updatedAt,
            actor: {
              type: 'security_company_operator',
              accountId: req.auth!.accountId,
              partnerOrganizationId: orgId,
            },
            fromStatus: expectedStatus,
            toStatus: updated.status,
            fromPartnerOrganizationId: orgId,
            toPartnerOrganizationId: orgId,
            closeReason: updated.closeReason ?? null,
            auditRequestId: req.auditRequestId ?? null,
          });
        }

        // [CO-OB03-6] (dispatch mode) / pre-existing behaviour (pool mode) — the
        // customer-facing view/push reflects the new status immediately either way.
        scheduleCustomerRecoveryCaseChange(ctx, {
          recoveryCase: updated,
          previousStatus: expectedStatus,
          event: 'status_updated',
        });
        // (5) respond.
        res.status(200).json(serializeClaimedTierRecoveryCase(toClaimedTierView(updated), dispatchMode));
      } catch (err) {
        next(err);
      }
    },
  );

  // OB-03 §3.3 — `release`, repurposed as hand-back-to-queue once the flag is on.
  // Gap-closure #1 (pool mode, flag off) — release to the shared unassigned pool,
  // unchanged.
  router.post(
    '/security/cases/:caseId/release',
    authenticate,
    requireUserType('security_company_operator'),
    requirePartnerOrg,
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `security-cases-release:${req.auth!.accountId}`),
    directedDispatchEnabled() ? validateBody(releaseBodySchema) : (_req, _res, next) => next(),
    async (req, res, next) => {
      try {
        const parsed = caseIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const orgId = req.auth!.partnerOrganizationId!;
        const caseId = parsed.data.caseId;
        const dispatchMode = directedDispatchEnabled();

        if (dispatchMode) {
          const eligible = await isOrgDispatchEligible(orgId);
          if (!eligible) {
            next(apiError('NOT_FOUND'));
            return;
          }

          const { reason } = req.body as z.infer<typeof releaseBodySchema>;

          // §18.8 C-B: (1) pre-read, scoped to the claimed (accepted) predicate only —
          // a hand-back may only act on a case this org has actually accepted.
          const existing = await ctx.recoveryCases.findByIdForPartnerOrgDispatch(orgId, caseId);
          if (!existing || existing.tier !== 'claimed') {
            next(apiError('NOT_FOUND', { message: 'Case is not available to hand back.' }));
            return;
          }

          await ctx.adminAccessLog.recordStateChange({
            actorAccountId: req.auth!.accountId,
            actorSessionId: req.auth!.sessionId,
            auditRequestId: req.auditRequestId ?? null,
            targetAccountId: existing.accountId,
            resourceType: 'recovery_case',
            resourceId: existing.case.id,
            fromStatus: existing.case.status,
            toStatus: existing.case.status,
            endpoint: ENDPOINT_RELEASE,
            ipAddress: clientIp(req),
            userAgent: req.header('user-agent') ?? null,
            reason: `case_handed_back:${reason}`,
          });

          const handedBack = await ctx.recoveryCases.handBackAcceptedCase(orgId, caseId);
          if (!handedBack) {
            next(apiError('NOT_FOUND', { message: 'Case is not available to hand back.' }));
            return;
          }

          // [CO-OB03-6] customer-facing status updates to "returned to queue" / "no
          // partner currently assigned" immediately.
          scheduleCustomerRecoveryCaseChange(ctx, {
            recoveryCase: handedBack,
            previousStatus: existing.case.status,
            event: 'status_updated',
          });

          res.status(200).json({ data: { caseId: handedBack.id, status: 'returned_to_queue' } });
          return;
        }

        // Pool model (flag off) — unchanged release-to-pool behaviour.
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

        // OB-04 (§12.2 A2) — pool model only. Post-CAS, pre-response (SR-019-1,
        // SR-019-3): `occurredAt` is `released.updatedAt`, not a fresh `new Date()`.
        await appendRecoveryCaseEvent(ctx, released.id, {
          eventType: 'case_released',
          caseId: released.id,
          occurredAt: released.updatedAt,
          actor: {
            type: 'security_company_operator',
            accountId: req.auth!.accountId,
            partnerOrganizationId: orgId,
          },
          fromStatus: existing.case.status,
          toStatus: 'open',
          fromPartnerOrganizationId: orgId,
          toPartnerOrganizationId: null,
          closeReason: null,
          auditRequestId: req.auditRequestId ?? null,
        });

        // (5) respond — offer-tier view: the case is unclaimed again, so this
        // response must not leak `accountId`, `notes`, `assetId`, or location data to
        // this (or any) operator (PDM-1/PDM-2).
        res.status(200).json(serializeOfferTierRecoveryCase(toOfferTierView(released)));
      } catch (err) {
        next(err);
      }
    },
  );

  // Pool model only — `reassign` removed outright once the flag is on (R-1), same
  // treatment as `claim` above: literally unmounted, not a softer 410/deprecation
  // response, since there is no real partner traffic to protect (no real traffic =
  // EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR="false" today).
  if (!directedDispatchEnabled()) {
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

          // OB-04 (§12.2 A2) — pool model only (reassign is unmounted in dispatch
          // mode). Post-CAS, pre-response (SR-019-1, SR-019-3): `occurredAt` is
          // `reassigned.updatedAt`. `toPartnerOrganizationId` is echoed back from the
          // result document (SR-019-1's one named exception), not the raw request body.
          await appendRecoveryCaseEvent(ctx, reassigned.id, {
            eventType: 'case_reassigned',
            caseId: reassigned.id,
            occurredAt: reassigned.updatedAt,
            actor: {
              type: 'security_company_operator',
              accountId: req.auth!.accountId,
              partnerOrganizationId: orgId,
            },
            fromStatus: existing.case.status,
            toStatus: 'investigating',
            fromPartnerOrganizationId: orgId,
            toPartnerOrganizationId: reassigned.partnerOrganizationId ?? targetPartnerOrganizationId,
            closeReason: null,
            auditRequestId: req.auditRequestId ?? null,
          });

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
  }

  // Gap-closure #2 — contact customer. Reuses the existing recovery-notification
  // infrastructure (`ctx.recoveryNotifications`, the same email+push dispatch path
  // every other recovery-case event already uses) rather than a new delivery
  // channel, so the customer's `theft_critical` notification preferences/opt-outs
  // are respected exactly as they already are for status-change notifications.
  //
  // OB-03 §3.6 — contract unchanged; gated by the fixed claimed predicate, so a
  // pending-not-yet-accepted org can no longer reach this once the flag is on.
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
        const dispatchMode = directedDispatchEnabled();

        if (dispatchMode) {
          const eligible = await isOrgDispatchEligible(orgId);
          if (!eligible) {
            next(apiError('NOT_FOUND'));
            return;
          }
        }

        // A message may only be sent on a case claimed by THIS org — an operator may
        // not message a customer on a case it hasn't claimed (no audit row on a
        // NOT_FOUND here, matching every other read-first branch in this router).
        const existing = dispatchMode
          ? await ctx.recoveryCases.findByIdForPartnerOrgDispatch(orgId, caseId)
          : await ctx.recoveryCases.findByIdForPartnerOrg(orgId, caseId);
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

        // OB-04 (§12.2 A2) — pool model only (dispatch-mode contact is A4's scope).
        // Appended synchronously after the existing audit write and before the 202
        // response (SR-019-5(b)). Not a status change, so from/to status and org are
        // unchanged. No CAS mutation exists on this path, so `occurredAt` is one
        // `new Date()` captured here, per SR-019-3's `customer_contact_initiated` rule.
        if (!dispatchMode) {
          await appendRecoveryCaseEvent(ctx, existing.case.id, {
            eventType: 'customer_contact_initiated',
            caseId: existing.case.id,
            occurredAt: new Date(),
            actor: {
              type: 'security_company_operator',
              accountId: req.auth!.accountId,
              partnerOrganizationId: orgId,
            },
            fromStatus: existing.case.status,
            toStatus: existing.case.status,
            fromPartnerOrganizationId: orgId,
            toPartnerOrganizationId: orgId,
            closeReason: null,
            auditRequestId: req.auditRequestId ?? null,
          });
        }

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
