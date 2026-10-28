/**
 * Admin `/admin/claims` endpoints — Feature 018 (claims filing and
 * adjudication), business-requirements.md §2.3, §4.
 *
 * Any authenticated admin may review/adjudicate any claim (§2.3/§4.3 — no
 * dedicated claims-reviewer role exists). Every negative/information-seeking
 * action requires a non-empty, customer-safe reason, mirroring
 * `admin-verification.ts`'s "A customer-safe reason is required." precedent.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { serializeClaimForAdmin } from '../lib/claim-serializers.js';
import {
  exceedsCoverageLimit,
  hasAtMostTwoDecimalPlaces,
  isForwardClaimTransition,
  MAX_CLAIM_APPROVED_AMOUNT,
  type ClaimStatus,
} from '../lib/claim-rules.js';
import { InvalidClaimStatusTransitionError } from '../repositories/claims.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';
import { validateBody } from '../lib/validation.js';
import { requireStepUp, STEP_UP_WINDOW_SECONDS } from '../lib/step-up.js';

const ENDPOINT_LIST = 'GET /v1/admin/claims';
const ENDPOINT_DETAIL = 'GET /v1/admin/claims/{claimId}';
const ENDPOINT_PATCH = 'PATCH /v1/admin/claims/{claimId}';

const claimIdParamsSchema = z.object({ claimId: z.string().regex(/^[0-9a-f]{24}$/i) });

const listFiltersSchema = z.object({
  status: z
    .enum(['submitted', 'under_review', 'more_info_requested', 'approved', 'awaiting_payout', 'rejected', 'closed'])
    .optional(),
  accountId: z.string().uuid().optional(),
  policyId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
});

const requiredReasonSchema = z.string().trim().min(1).max(2000);

const patchBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start_review') }),
  z.object({ action: z.literal('more_info_requested'), reviewNote: requiredReasonSchema }),
  z.object({
    action: z.literal('approved'),
    // SR-018-3: a hard platform ceiling (safety backstop, not a real
    // business/coverage limit — see MAX_CLAIM_APPROVED_AMOUNT's doc comment)
    // plus a 2-decimal-place precision rule (currency has no fractional
    // cents). The approvedAmount <= claimedAmount check needs the claim
    // itself, so it is enforced in the handler below, not here.
    approvedAmount: z
      .number()
      .positive()
      .max(MAX_CLAIM_APPROVED_AMOUNT, { message: `approvedAmount must not exceed ${MAX_CLAIM_APPROVED_AMOUNT}` })
      .refine(hasAtMostTwoDecimalPlaces, { message: 'approvedAmount must have at most 2 decimal places' }),
  }),
  z.object({ action: z.literal('rejected'), rejectionReason: requiredReasonSchema }),
  z.object({ action: z.literal('closed'), closeReason: requiredReasonSchema }),
]);

export function createAdminClaimsRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  // SR-018-2: fail-closed kill switch. Runs before authentication so the
  // surface is not even enumerable while the claims API is disabled. The
  // mobile FEATURE_CLAIMS_ENABLED flag is a client rendering decision only
  // and is not a trust boundary — this is the server-side gate.
  router.use((_req, _res, next) => {
    if (ctx.env.claimsApiEnabled !== true) {
      next(apiError('NOT_FOUND'));
      return;
    }
    next();
  });

  async function loadAdminSerializationContext(claim: Awaited<ReturnType<typeof ctx.claims.findByIdForAdmin>>) {
    if (!claim) return null;
    const [policy, asset, duplicate] = await Promise.all([
      ctx.policies.findByIdForAdmin(claim.policyId),
      ctx.assets.findByIdForAdmin(claim.assetId),
      ctx.claims.findNonTerminalByAssetForAccount(claim.accountId, claim.assetId),
    ]);
    return serializeClaimForAdmin(claim, {
      accountId: claim.accountId,
      coverageLimits: policy?.coverageLimits ?? [],
      policyEffectiveDate: policy?.effectiveDate ?? claim.submittedAt,
      assetRegisteredAt: asset?.registeredAt ?? claim.submittedAt,
      duplicateOpenClaimId: duplicate && duplicate.id !== claim.id ? duplicate.id : null,
    });
  }

  router.get(
    '/admin/claims',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `admin-claims-list:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const filtersParsed = listFiltersSchema.safeParse(req.query);
        if (!filtersParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: filtersParsed.error.issues.map((i) => i.message) }));
          return;
        }
        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>);
        const rows = await ctx.claims.listForAdmin(filtersParsed.data, limit + 1, cursor);
        const page = buildPage(rows, limit);

        await ctx.adminAccessLog.recordBulkDisclosure({
          disclosedAccountIds: page.data.map((row) => row.accountId),
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          resourceType: 'claim',
          endpoint: ENDPOINT_LIST,
          resultCount: page.data.length,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        const enriched = await Promise.all(page.data.map((claim) => loadAdminSerializationContext(claim)));
        res.status(200).json({
          data: enriched,
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/admin/claims/:claimId',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `admin-claims-detail:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const parsed = claimIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }
        const claim = await ctx.claims.findByIdForAdmin(parsed.data.claimId);
        if (!claim) {
          next(apiError('NOT_FOUND'));
          return;
        }

        await ctx.adminAccessLog.recordDetail({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: claim.accountId,
          resourceType: 'claim',
          resourceId: claim.id,
          endpoint: ENDPOINT_DETAIL,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json(await loadAdminSerializationContext(claim));
      } catch (err) {
        next(err);
      }
    },
  );

  // §2.2/§2.3/§4.2 — the single admin-adjudication entrypoint. Sequence
  // mirrors admin-policies.ts: pre-read -> precondition (fail, no audit row)
  // -> write the decision record before the mutation (§18.8 ruling (b)) ->
  // conditional mutation -> respond.
  router.patch(
    '/admin/claims/:claimId',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `admin-claims-patch:${req.auth!.accountId}`),
    // ADR-0012 SU-FU-1 posture: claim adjudication sets approvedAmount, a real
    // financial figure, and is as consequential as the other Tier-A admin
    // actions gated this way (account state, policy cancel, asset legal-hold,
    // plan catalog edits, verification decisions).
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
    validateBody(patchBodySchema),
    async (req, res, next) => {
      try {
        const paramsParsed = claimIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }
        const claimId = paramsParsed.data.claimId;
        const body = req.body as z.infer<typeof patchBodySchema>;

        const existing = await ctx.claims.findByIdForAdmin(claimId);
        if (!existing) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const fromStatus: ClaimStatus = existing.status;
        let toStatus: ClaimStatus;
        switch (body.action) {
          case 'start_review':
            toStatus = 'under_review';
            break;
          case 'more_info_requested':
            toStatus = 'more_info_requested';
            break;
          case 'approved':
            toStatus = 'approved';
            break;
          case 'rejected':
            toStatus = 'rejected';
            break;
          case 'closed':
            toStatus = 'closed';
            break;
        }

        // Precondition — forward-only, no reopening a terminal claim (§2.2/§2.5,
        // AC-10). Fails with no audit row, same posture admin-policies.ts takes.
        if (!isForwardClaimTransition(fromStatus, toStatus)) {
          next(apiError('CONFLICT'));
          return;
        }

        // §1.4 / SR-018-3 / SR-018-4 — approval guardrails, admin-set
        // approvedAmount only.
        if (body.action === 'approved') {
          // SR-018-3: an admin cannot approve more than what was claimed.
          if (body.approvedAmount > existing.claimedAmount) {
            next(apiError('APPROVED_AMOUNT_EXCEEDS_CLAIMED'));
            return;
          }

          // SR-018-4: a missing policy at approval time must fail CLOSED —
          // never silently treated as "no coverage limit configured". A
          // claim's policyId is set from a `findByIdForAccount` lookup at
          // filing time (claims.ts), but policies can later be deleted/
          // migrated; this is not a case the earlier filing-time check
          // already rules out, so it needs its own guard here.
          const policy = await ctx.policies.findByIdForAdmin(existing.policyId);
          if (!policy) {
            next(apiError('CLAIM_POLICY_NOT_FOUND'));
            return;
          }
          if (
            exceedsCoverageLimit(
              body.approvedAmount,
              existing.claimedAmountCurrency,
              policy.coverageLimits,
              existing.assetTypeSnapshot,
            )
          ) {
            next(apiError('APPROVED_AMOUNT_EXCEEDS_COVERAGE_LIMIT'));
            return;
          }
        }

        const reason =
          body.action === 'more_info_requested'
            ? body.reviewNote
            : body.action === 'rejected'
              ? body.rejectionReason
              : body.action === 'closed'
                ? body.closeReason
                : body.action === 'approved'
                  // SR-018-3: the approved figure was missing from the
                  // privileged-access decision record — only the mutable
                  // domain document carried it. Reuse the existing optional
                  // `reason` field (same "widen, don't fork" posture already
                  // used for this column) rather than add a new one.
                  ? `approvedAmount=${body.approvedAmount.toFixed(2)} ${existing.claimedAmountCurrency}`
                  : null;

        // Write the decision record BEFORE the mutation (§18.8 ruling (b)).
        await ctx.adminAccessLog.recordStateChange({
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          targetAccountId: existing.accountId,
          resourceType: 'claim',
          resourceId: existing.id,
          fromStatus,
          toStatus: body.action === 'approved' ? 'awaiting_payout' : toStatus,
          reason,
          endpoint: ENDPOINT_PATCH,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        let updated;
        try {
          if (body.action === 'approved') {
            updated = await ctx.claims.approveAndAdvance(claimId, {
              expectedStatus: fromStatus,
              approvedAmount: body.approvedAmount,
              actorAccountId: req.auth!.accountId,
            });
          } else {
            updated = await ctx.claims.transitionForAdmin(claimId, {
              expectedStatus: fromStatus,
              toStatus,
              actorAccountId: req.auth!.accountId,
              reason,
            });
          }
        } catch (err) {
          if (err instanceof InvalidClaimStatusTransitionError) {
            next(apiError('CONFLICT'));
            return;
          }
          throw err;
        }
        if (!updated) {
          next(apiError('CONFLICT'));
          return;
        }

        res.status(200).json(await loadAdminSerializationContext(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
