/**
 * Customer claims routes — Feature 018 (claims filing and adjudication),
 * business-requirements.md §1-§3, §7.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { requireActiveAccount } from '../lib/account-gate.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import { DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { serializeClaimForCustomer } from '../lib/claim-serializers.js';
import {
  computeFraudFlags,
  hasAtMostTwoDecimalPlaces,
  isForwardClaimTransition,
  isWaitingPeriodMet,
  MAX_CLAIMED_AMOUNT_SANITY_BOUND,
  rateThresholdWindowStart,
  waitingPeriodClearsAt,
  type ClaimStatus,
} from '../lib/claim-rules.js';
import { DuplicateOpenClaimError, InvalidClaimStatusTransitionError } from '../repositories/claims.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { requireIdempotencyKey } from '../middleware/idempotency.js';

const objectIdSchema = z.string().regex(/^[0-9a-f]{24}$/i);

const createClaimSchema = z.object({
  policyId: objectIdSchema,
  assetId: objectIdSchema,
  recoveryCaseId: objectIdSchema.optional(),
  supersedesClaimId: objectIdSchema.optional(),
  incidentDescription: z.string().trim().min(20).max(5000),
  incidentDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  evidenceDescription: z.string().trim().max(5000).optional(),
  // SR-018-3 / security-review.md §12.4: this is an anti-garbage-input
  // sanity bound only — NOT the approval ceiling (see
  // `MAX_CLAIM_APPROVED_AMOUNT_ZAR` in admin-claims.ts) — kept high and
  // currency-agnostic so an absurd claimedAmount (e.g. `1e300`) doesn't skew
  // every later FLAG_AMOUNT_OUTLIER baseline for this account. SR-018-4:
  // `claimedAmountCurrency` is intentionally NOT a field here — currency is
  // never a customer choice; see the handler, which always sets it from
  // `policy.billing.currency` server-side. Any `claimedAmountCurrency` sent
  // in the request body is stripped by this non-passthrough schema and has
  // no effect.
  claimedAmount: z
    .number()
    .positive()
    .max(MAX_CLAIMED_AMOUNT_SANITY_BOUND, {
      message: `claimedAmount must not exceed ${MAX_CLAIMED_AMOUNT_SANITY_BOUND}`,
    })
    .refine(hasAtMostTwoDecimalPlaces, { message: 'claimedAmount must have at most 2 decimal places' }),
});

const claimIdParamsSchema = z.object({ claimId: objectIdSchema });

const respondBodySchema = z.object({
  text: z.string().trim().min(1).max(5000),
  incidentDescription: z.string().trim().min(20).max(5000).optional(),
});

function parseIncidentDate(raw: string): Date {
  return raw.length === 10 ? new Date(`${raw}T00:00:00.000Z`) : new Date(raw);
}

export function createClaimsRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  // SR-018-2 / SR-018-9: fail-closed kill switch. Runs before authentication
  // so the surface is not even enumerable while the claims API is disabled.
  // The mobile FEATURE_CLAIMS_ENABLED flag is a client rendering decision
  // only and is not a trust boundary — this is the server-side gate.
  //
  // SR-018-9: this MUST be scoped to '/claims' (not path-less). This router
  // is mounted at the v1 root (see index.ts) alongside every other
  // root-mounted router; a path-less `router.use` on a root-mounted router
  // runs for every request that reaches this router instance in Express's
  // middleware chain, not just requests for paths this router defines —
  // which, with the switch off, 404'd every route mounted after this one in
  // index.ts (analytics, admin/analytics, support, support-cases) until this
  // fix. Express matches '/claims' and '/claims/*' on segment boundaries, so
  // this does not also (dis)gate something like a hypothetical '/claimsx'.
  router.use('/claims', (_req, _res, next) => {
    if (ctx.env.claimsApiEnabled !== true) {
      next(apiError('NOT_FOUND'));
      return;
    }
    next();
  });

  router.post(
    '/claims',
    authenticate,
    requireUserType('customer'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `claims-create:${req.auth!.accountId}`),
    requireIdempotencyKey('POST /v1/claims', ctx.idempotency, ctx.kv),
    async (req, res, next) => {
      try {
        const parsed = createClaimSchema.safeParse(req.body);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR', { details: parsed.error.issues.map((i) => i.message) }));
          return;
        }
        const body = parsed.data;
        const accountId = req.auth!.accountId;
        await requireActiveAccount(ctx.accounts, accountId);

        const incidentDate = parseIncidentDate(body.incidentDate);
        if (Number.isNaN(incidentDate.getTime()) || incidentDate.getTime() > Date.now()) {
          next(apiError('VALIDATION_ERROR', { details: ['incidentDate must be a valid date not in the future'] }));
          return;
        }

        // §1.1 — policy status gate.
        const policy = await ctx.policies.findByIdForAccount(accountId, body.policyId);
        if (!policy) {
          next(apiError('NOT_FOUND'));
          return;
        }
        if (policy.status !== 'active') {
          next(apiError('POLICY_NOT_ACTIVE'));
          return;
        }

        // §1.2 — asset status gate (same accountId as the policy, enforced by both
        // lookups being scoped to the same accountId).
        const asset = await ctx.assets.findByIdForAccount(accountId, body.assetId);
        if (!asset) {
          next(apiError('NOT_FOUND'));
          return;
        }
        if (asset.status !== 'active') {
          next(apiError('ASSET_NOT_ELIGIBLE'));
          return;
        }

        // §12.2 R7-1 (compliance ruling 2026-10-28) — an incident dated before
        // the policy's effectiveDate is NOT an intake refusal. It is accepted
        // and flagged (`FLAG_INCIDENT_BEFORE_ELIGIBILITY`, computed below) so
        // a human reviewer must record an eligibility determination before
        // approval. A hard block here would be an undisclosed intake refusal
        // without the PPR rejection safeguards, and would also catch honest
        // date typos.

        // §1.3/§1.3a — waiting period, computed from the LATER of
        // policy.effectiveDate / asset.registeredAt.
        if (!isWaitingPeriodMet(policy.effectiveDate, asset.registeredAt)) {
          next(
            apiError('WAITING_PERIOD_NOT_MET', {
              waitingPeriodClearsAt: waitingPeriodClearsAt(policy.effectiveDate, asset.registeredAt).toISOString(),
            }),
          );
          return;
        }

        // §1.5 — one open claim per asset at a time.
        const duplicate = await ctx.claims.findNonTerminalByAssetForAccount(accountId, body.assetId);
        if (duplicate) {
          next(apiError('DUPLICATE_OPEN_CLAIM', { claimId: duplicate.id }));
          return;
        }

        // §1.6 — optional recovery-case linkage, validated but not duplicated.
        let recoveryCaseId: string | null = null;
        if (body.recoveryCaseId) {
          const recoveryCase = await ctx.recoveryCases.findByIdForAccount(accountId, body.recoveryCaseId);
          if (!recoveryCase || recoveryCase.assetId !== body.assetId) {
            next(apiError('RECOVERY_CASE_MISMATCH'));
            return;
          }
          recoveryCaseId = recoveryCase.id;
        }

        // §5 — fraud flags, computed once at filing, admin-only.
        const rateWindowStart = rateThresholdWindowStart();
        const recentClaims = await ctx.claims.listSinceForAccount(accountId, rateWindowStart);
        const priorClaimsOfSameAssetType = await ctx.claims.listByAccountAndAssetType(accountId, asset.assetType);
        const fraudFlags = computeFraudFlags({
          filedAt: new Date(),
          incidentDate,
          policyEffectiveDate: policy.effectiveDate,
          assetRegisteredAt: asset.registeredAt,
          policyUpdatedAt: policy.updatedAt,
          claimedAmount: body.claimedAmount,
          priorClaimedAmountsSameAssetType: priorClaimsOfSameAssetType.map((c) => c.claimedAmount),
          priorClaimsInRateWindow: recentClaims.length,
        });

        let claim;
        try {
          claim = await ctx.claims.createForAccount({
            accountId,
            policyId: policy.id,
            assetId: asset.id,
            recoveryCaseId,
            supersedesClaimId: body.supersedesClaimId ?? null,
            assetTypeSnapshot: asset.assetType,
            assetDisplayNameSnapshot: asset.displayName,
            policyPlanTierSnapshot: policy.planTier,
            incidentDescription: body.incidentDescription,
            incidentDate,
            evidenceDescription: body.evidenceDescription ?? null,
            claimedAmount: body.claimedAmount,
            // SR-018-4: always the policy's own currency, server-side. The
            // customer never supplies (or overrides) this.
            claimedAmountCurrency: policy.billing.currency,
            fraudFlags,
          });
        } catch (err) {
          // SR-018-5 — the pre-insert `findNonTerminalByAssetForAccount` check above
          // is check-then-insert and can lose a race to a concurrent request for the
          // same asset; the database's partial unique index is the real backstop.
          // Translate the resulting duplicate-key error into the same
          // `DUPLICATE_OPEN_CLAIM` response the pre-insert check returns, instead of
          // letting a raw database error reach the client.
          if (err instanceof DuplicateOpenClaimError) {
            const winner = await ctx.claims.findNonTerminalByAssetForAccount(accountId, body.assetId);
            next(apiError('DUPLICATE_OPEN_CLAIM', winner ? { claimId: winner.id } : undefined));
            return;
          }
          throw err;
        }

        res.status(201).json(serializeClaimForCustomer(claim));
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/claims',
    authenticate,
    requireUserType('customer'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `claims-list:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>);
        const rows = await ctx.claims.listByAccount(req.auth!.accountId, limit + 1, cursor);
        const page = buildPage(rows, limit);
        res.status(200).json({
          data: page.data.map(serializeClaimForCustomer),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    '/claims/:claimId',
    authenticate,
    requireUserType('customer'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `claims-detail:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const parsed = claimIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const claim = await ctx.claims.findByIdForAccount(req.auth!.accountId, parsed.data.claimId);
        if (!claim) {
          next(apiError('NOT_FOUND'));
          return;
        }
        res.status(200).json(serializeClaimForCustomer(claim));
      } catch (err) {
        next(err);
      }
    },
  );

  // §2.2 — customer responds to a `more_info_requested` claim.
  router.patch(
    '/claims/:claimId/respond',
    authenticate,
    requireUserType('customer'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `claims-respond:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const paramsParsed = claimIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const bodyParsed = respondBodySchema.safeParse(req.body);
        if (!bodyParsed.success) {
          next(apiError('VALIDATION_ERROR', { details: bodyParsed.error.issues.map((i) => i.message) }));
          return;
        }
        const accountId = req.auth!.accountId;
        const existing = await ctx.claims.findByIdForAccount(accountId, paramsParsed.data.claimId);
        if (!existing) {
          next(apiError('NOT_FOUND'));
          return;
        }
        if (existing.status !== 'more_info_requested') {
          next(apiError('CONFLICT'));
          return;
        }
        const updated = await ctx.claims.respondToInfoRequest(accountId, paramsParsed.data.claimId, bodyParsed.data);
        if (!updated) {
          next(apiError('CONFLICT'));
          return;
        }
        res.status(200).json(serializeClaimForCustomer(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  // §2.2 — customer withdrawal, any non-terminal status.
  router.patch(
    '/claims/:claimId/withdraw',
    authenticate,
    requireUserType('customer'),
    createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, (req) => `claims-withdraw:${req.auth!.accountId}`),
    async (req, res, next) => {
      try {
        const paramsParsed = claimIdParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const accountId = req.auth!.accountId;
        const existing = await ctx.claims.findByIdForAccount(accountId, paramsParsed.data.claimId);
        if (!existing) {
          next(apiError('NOT_FOUND'));
          return;
        }
        if (!isForwardClaimTransition(existing.status as ClaimStatus, 'closed')) {
          next(apiError('CONFLICT'));
          return;
        }
        let updated;
        try {
          updated = await ctx.claims.withdrawForAccount(accountId, paramsParsed.data.claimId, existing.status);
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
        res.status(200).json(serializeClaimForCustomer(updated));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
