/**
 * Admin identity verification review — Feature 009 Phase 2.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { serializeCustomerProfile } from '../lib/customer-profile-serializer.js';
import { apiError } from '../lib/errors.js';
import { syncAccountAlerts } from '../lib/sync-account-alerts.js';
import { AUDIT_LOG_READ_LIMIT, DEFAULT_AUTHENTICATED_LIMIT } from '../lib/policy.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';

const idParamsSchema = z.object({ id: z.string().uuid() });

const reviewBodySchema = z.object({
  decision: z.enum(['verified', 'rejected', 'action_required']),
  rejectionReasonCustomerSafe: z.string().trim().min(1).max(500).optional(),
});

export function createAdminVerificationRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/admin/verification-requests',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: AUDIT_LOG_READ_LIMIT.attempts, windowSeconds: AUDIT_LOG_READ_LIMIT.windowSeconds },
      (req) => `admin-verification-list:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>);
        const rows = await ctx.customerProfiles.listByVerificationStatus(
          'pending_review',
          limit + 1,
          cursor,
        );
        const page = buildPage(rows, limit);

        const enriched = await Promise.all(
          page.data.map(async (profile) => {
            const account = await ctx.accounts.findById(profile.accountId);
            return {
              accountId: profile.accountId,
              email: account?.email ?? null,
              firstName: profile.firstName,
              lastName: profile.lastName,
              phone: profile.phone,
              idNumberMasked: profile.idNumberLast4 ? `********${profile.idNumberLast4}` : null,
              verificationStatus: profile.verificationStatus,
              verificationSubmittedAt: profile.verificationSubmittedAt?.toISOString() ?? null,
            };
          }),
        );

        await ctx.auditLog.recordBulkDisclosure({
          disclosedAccountIds: page.data.map((row) => row.accountId),
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json({
          data: enriched,
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // Feature 012 FR-4 — GET /v1/admin/verification-requests/count. No `:id`/`:caseId`
  // sibling exists on the `/admin/verification-requests` path today (SR-012-2 checked
  // this file explicitly and found it clean), but this is registered alongside the
  // list route, above the unrelated `/admin/accounts/:id/profile` path, for readability.
  router.get(
    '/admin/verification-requests/count',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: AUDIT_LOG_READ_LIMIT.attempts, windowSeconds: AUDIT_LOG_READ_LIMIT.windowSeconds },
      (req) => `admin-verification-count:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const count = await ctx.customerProfiles.countByVerificationStatus('pending_review');

        // compliance-specialist ruling (api-design.md §9.4, security-review.md §10.6):
        // exactly one privileged_bulk_access row, resultCount 0, empty array literal
        // (never a variable). Ordering is count -> audit -> respond, audit write
        // precedes serialisation (AUD-10 fail-closed). The returned `count` is NEVER
        // written into `resultCount`.
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
    '/admin/accounts/:id/profile',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      DEFAULT_AUTHENTICATED_LIMIT,
      (req) => `admin-profile-detail:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const parsed = idParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }

        const account = await ctx.accounts.findByIdForAdminDetail(parsed.data.id);
        if (!account) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const profile = await ctx.customerProfiles.findByAccountId(account.id);
        if (!profile) {
          next(apiError('NOT_FOUND'));
          return;
        }

        await ctx.auditLog.record({
          accountId: account.id,
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          eventType: 'privileged_data_access',
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        const status = await ctx.accounts.getAccountStatus(account.id);
        const [policies, assets] = await Promise.all([
          ctx.policies.listByAccount(account.id, 1, null),
          ctx.assets.listByAccount(account.id, 1, null, 'active'),
        ]);

        res.status(200).json({
          account: {
            id: account.id,
            email: account.email,
            accountState: account.accountState,
          },
          profile: serializeCustomerProfile(profile, {
            accountState: status?.accountState ?? 'pending_verification',
            mfaEnrolled: false,
            hasPolicy: policies.length > 0,
            hasAsset: assets.length > 0,
          }),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/admin/accounts/:id/profile/verification',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: 30, windowSeconds: 900 },
      (req) => `admin-profile-review:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const paramsParsed = idParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }

        const bodyParsed = reviewBodySchema.safeParse(req.body);
        if (!bodyParsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }

        if (
          (bodyParsed.data.decision === 'rejected' ||
            bodyParsed.data.decision === 'action_required') &&
          !bodyParsed.data.rejectionReasonCustomerSafe
        ) {
          next(apiError('VALIDATION_ERROR', { message: 'A customer-safe reason is required.' }));
          return;
        }

        const accountId = paramsParsed.data.id;
        const account = await ctx.accounts.findById(accountId);
        if (!account || account.userType !== 'customer') {
          next(apiError('NOT_FOUND'));
          return;
        }

        try {
          const profile = await ctx.customerProfiles.reviewVerification(
            accountId,
            bodyParsed.data.decision,
            bodyParsed.data.rejectionReasonCustomerSafe ?? null,
          );

          await ctx.auditLog.record({
            accountId,
            actorAccountId: req.auth!.accountId,
            actorSessionId: req.auth!.sessionId,
            auditRequestId: req.auditRequestId ?? null,
            eventType: 'privileged_data_access',
            ipAddress: clientIp(req),
            userAgent: req.header('user-agent') ?? null,
          });

          await syncAccountAlerts(ctx, accountId);

          const status = await ctx.accounts.getAccountStatus(accountId);
          const [policies, assets] = await Promise.all([
            ctx.policies.listByAccount(accountId, 1, null),
            ctx.assets.listByAccount(accountId, 1, null, 'active'),
          ]);

          res.status(200).json({
            account: { id: account.id, email: account.email },
            profile: serializeCustomerProfile(profile, {
              accountState: status?.accountState ?? 'pending_verification',
              mfaEnrolled: false,
              hasPolicy: policies.length > 0,
              hasAsset: assets.length > 0,
            }),
          });
        } catch (err) {
          if (err instanceof Error && err.message === 'INVALID_VERIFICATION_STATE') {
            next(apiError('CONFLICT', { message: 'Profile is not pending review.' }));
            return;
          }
          if (err instanceof Error && err.message === 'PROFILE_NOT_FOUND') {
            next(apiError('NOT_FOUND'));
            return;
          }
          throw err;
        }
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
