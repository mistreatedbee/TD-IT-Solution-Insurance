/**
 * Admin identity verification review — Feature 009 Phase 2.
 */
import { Router, type RequestHandler } from 'express';
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
import { requireStepUp, STEP_UP_WINDOW_SECONDS } from '../lib/step-up.js';
import { notifyInBackground } from '../lib/customer-notification-service.js';
import { VERIFICATION_NOTE_MAX_LENGTH } from '../db/customer-verification-note-collections.js';

/** Feature 023 AC-A9 — bounded history read (no unbounded scan). */
const VERIFICATION_HISTORY_LIMIT = 50;

const noteBodySchema = z.object({
  text: z.string().trim().min(1).max(VERIFICATION_NOTE_MAX_LENGTH),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const reviewBodySchema = z.object({
  decision: z.enum(['verified', 'rejected', 'action_required']),
  rejectionReasonCustomerSafe: z.string().trim().min(1).max(500).optional(),
  // DEFECT-001 §5 — required. Admin must send back the `verificationRevision`
  // it read off the profile it is deciding against; mismatch -> 409
  // CONFLICT (closes the ABA resubmission race, §4.3).
  expectedRevision: z.number().int().nonnegative(),
});

/**
 * Stage 8 KYC-4 — the emergency contact is a third party whose phone number is not
 * needed for an identity decision (POPIA minimality). Admin payloads show only the
 * last 4 digits.
 */
export function maskPhoneLast4(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function serializeForAdmin(...args: Parameters<typeof serializeCustomerProfile>) {
  const serialized = serializeCustomerProfile(...args);
  return {
    ...serialized,
    emergencyContact: serialized.emergencyContact
      ? { ...serialized.emergencyContact, phone: maskPhoneLast4(serialized.emergencyContact.phone) }
      : null,
  };
}

export function createAdminVerificationRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  // Stage 8 KYC-2 — fail-closed KYC_API_ENABLED switch, before authentication, on the
  // verification-workflow routes only (the admin profile detail GET is also used by the
  // account pages and stays available).
  const kycGate: RequestHandler = (_req, _res, next) => {
    if (ctx.env.kycApiEnabled !== true) {
      next(apiError('NOT_FOUND'));
      return;
    }
    next();
  };

  router.get(
    '/admin/verification-requests',
    kycGate,
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
              verificationRevision: profile.verificationRevision,
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
    kycGate,
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
        // Stage 8 KYC-5 — only customer accounts have a verification profile to review.
        if (!account || account.userType !== 'customer') {
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
          profile: serializeForAdmin(profile, {
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
    kycGate,
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: 30, windowSeconds: 900 },
      (req) => `admin-profile-review:${req.auth!.accountId}`,
    ),
    // ADR-0012 SU-FU-1: verification status is a trust primitive other
    // controls key off — same 15-minute window as invitation issuance, run
    // before any read/write of the subject's profile.
    requireStepUp(ctx, STEP_UP_WINDOW_SECONDS.invitationIssuance),
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

        // Stage 8 KYC-1 — audit-first / fail-closed (AUD-10). Postgres (audit) and Mongo
        // (profile) cannot share a transaction, so: (1) pre-check state and revision so a
        // stale or invalid request is refused without writing a decision row; (2) write
        // both audit rows — if that fails the request 500s and the profile is unchanged;
        // (3) apply the decision (still revision-checked atomically). Residual: if a
        // resubmission races between (1) and (3), an audit row exists for a decision that
        // then 409s. That over-logs an attempt, which is the safe direction.
        const current = await ctx.customerProfiles.findByAccountId(accountId);
        if (!current) {
          next(apiError('NOT_FOUND'));
          return;
        }
        if (current.verificationStatus !== 'pending_review') {
          next(apiError('CONFLICT', { message: 'Profile is not pending review.' }));
          return;
        }
        if ((current.verificationRevision ?? 0) !== bodyParsed.data.expectedRevision) {
          next(
            apiError('CONFLICT', {
              message: 'This verification request was updated since you opened it. Refresh and try again.',
            }),
          );
          return;
        }

        try {
          await ctx.auditLog.record({
            accountId,
            actorAccountId: req.auth!.accountId,
            actorSessionId: req.auth!.sessionId,
            auditRequestId: req.auditRequestId ?? null,
            eventType: 'privileged_data_access',
            ipAddress: clientIp(req),
            userAgent: req.header('user-agent') ?? null,
          });

          // DEFECT-001 §3/§5 — records WHAT was decided (the generic
          // privileged_data_access row above records only that the admin
          // accessed the record; it carries no decision value).
          await ctx.auditLog.record({
            accountId,
            actorAccountId: req.auth!.accountId,
            actorSessionId: req.auth!.sessionId,
            auditRequestId: req.auditRequestId ?? null,
            eventType: 'customer_verification_decision',
            decision: bodyParsed.data.decision,
            ipAddress: clientIp(req),
            userAgent: req.header('user-agent') ?? null,
          });

          const profile = await ctx.customerProfiles.reviewVerification(
            accountId,
            bodyParsed.data.decision,
            bodyParsed.data.rejectionReasonCustomerSafe ?? null,
            bodyParsed.data.expectedRevision,
          );

          await syncAccountAlerts(ctx, accountId);

          // Feature 023 Phase A item 3 — email + push in addition to the in-app alert,
          // preference-aware, customer-safe reason only. Non-blocking: a delivery failure
          // must never undo or fail a recorded decision.
          notifyInBackground(
            'verification-decision',
            ctx.verificationNotifications.notifyVerificationDecision({
              accountId,
              decision: bodyParsed.data.decision,
              reasonCustomerSafe:
                bodyParsed.data.decision === 'verified'
                  ? null
                  : (bodyParsed.data.rejectionReasonCustomerSafe ?? null),
            }),
          );

          const status = await ctx.accounts.getAccountStatus(accountId);
          const [policies, assets] = await Promise.all([
            ctx.policies.listByAccount(accountId, 1, null),
            ctx.assets.listByAccount(accountId, 1, null, 'active'),
          ]);

          res.status(200).json({
            account: { id: account.id, email: account.email },
            profile: serializeForAdmin(profile, {
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
          if (err instanceof Error && err.message === 'REVISION_MISMATCH') {
            next(
              apiError('CONFLICT', {
                message: 'This verification request was updated since you opened it. Refresh and try again.',
              }),
            );
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

  // Feature 023 Phase A item 4 / AC-A9 — decision history (from the existing
  // customer_verification_decision audit rows) plus internal admin notes for one customer.
  // Admin-only; internal notes are never returned by any customer route (AC-A8).
  router.get(
    '/admin/accounts/:id/profile/verification-history',
    kycGate,
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      DEFAULT_AUTHENTICATED_LIMIT,
      (req) => `admin-verification-history:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const parsed = idParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const accountId = parsed.data.id;
        const account = await ctx.accounts.findById(accountId);
        if (!account || account.userType !== 'customer') {
          next(apiError('NOT_FOUND'));
          return;
        }

        const [decisions, notes] = await Promise.all([
          ctx.auditLog.listVerificationDecisions(accountId, VERIFICATION_HISTORY_LIMIT),
          ctx.customerVerificationNotes.listByAccount(accountId, VERIFICATION_HISTORY_LIMIT),
        ]);

        const staffIds = [
          ...new Set(
            [...decisions.map((d) => d.actorAccountId), ...notes.map((n) => n.authorAccountId)].filter(
              (id): id is string => typeof id === 'string',
            ),
          ),
        ];
        const staff = new Map<string, string | null>();
        await Promise.all(
          staffIds.map(async (id) => {
            const row = await ctx.accounts.findById(id);
            staff.set(id, row?.email ?? null);
          }),
        );

        // AUD-10: audit write precedes serialisation.
        await ctx.auditLog.record({
          accountId,
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          eventType: 'privileged_data_access',
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json({
          decisions: decisions.map((d) => ({
            id: d.id,
            decision: d.decision,
            decidedAt: d.createdAt.toISOString(),
            reviewer: d.actorAccountId
              ? { accountId: d.actorAccountId, email: staff.get(d.actorAccountId) ?? null }
              : null,
          })),
          notes: notes.map((n) => ({
            id: n.id,
            text: n.text,
            createdAt: n.createdAt.toISOString(),
            author: { accountId: n.authorAccountId, email: staff.get(n.authorAccountId) ?? null },
          })),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/admin/accounts/:id/profile/verification-notes',
    kycGate,
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      { attempts: 30, windowSeconds: 900 },
      (req) => `admin-verification-note:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const paramsParsed = idParamsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('VALIDATION_ERROR'));
          return;
        }
        const bodyParsed = noteBodySchema.safeParse(req.body);
        if (!bodyParsed.success) {
          next(
            apiError('VALIDATION_ERROR', {
              message: `A note must be 1 to ${VERIFICATION_NOTE_MAX_LENGTH} characters.`,
            }),
          );
          return;
        }
        const accountId = paramsParsed.data.id;
        const account = await ctx.accounts.findById(accountId);
        if (!account || account.userType !== 'customer') {
          next(apiError('NOT_FOUND'));
          return;
        }

        // Audited before the write lands (fail-closed: no audit row, no note). The note
        // text itself is never written to the audit log (free text, C-17 spirit).
        await ctx.auditLog.record({
          accountId,
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          eventType: 'privileged_data_access',
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        const note = await ctx.customerVerificationNotes.create({
          accountId,
          authorAccountId: req.auth!.accountId,
          text: bodyParsed.data.text,
        });
        const author = await ctx.accounts.findById(req.auth!.accountId);

        res.status(201).json({
          note: {
            id: note.id,
            text: note.text,
            createdAt: note.createdAt.toISOString(),
            author: { accountId: note.authorAccountId, email: author?.email ?? null },
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
