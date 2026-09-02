/**
 * Feature 010 — support-agent customer lookup (call-centre dashboard backend).
 *
 * Purpose-limited search — no bulk list. Uses existing `support_agent` user type.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';

const phoneQuerySchema = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .regex(/^\+?[0-9\s()-]+$/);

const lookupQuerySchema = z
  .object({
    email: z.string().email().optional(),
    policyId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    phone: phoneQuerySchema.optional(),
  })
  .refine((value) => Boolean(value.email ?? value.policyId ?? value.phone), {
    message: 'Provide email, policyId, or phone',
  });

const OPEN_RECOVERY_STATUSES = new Set(['open', 'investigating', 'tracking']);

const caseIdParamsSchema = z.object({
  caseId: z.string().regex(/^[a-f0-9]{24}$/i),
});

const callCentreNoteBodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

function serializeCallCentreNotes(notes: { agentAccountId: string; text: string; createdAt: Date }[]) {
  return notes.map((note) => ({
    agentAccountId: note.agentAccountId,
    text: note.text,
    createdAt: note.createdAt.toISOString(),
  }));
}

export function createSupportLookupRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);
  const rateLimit = createRateLimiter(
    ctx.kv,
    { attempts: 30, windowSeconds: 60 },
    (req) => `support-lookup:${req.auth!.accountId}:${clientIp(req)}`,
  );

  router.get(
    '/customer-lookup',
    authenticate,
    requireUserType('support_agent'),
    rateLimit,
    async (req, res, next) => {
      try {
        const parsed = lookupQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          throw apiError('VALIDATION_ERROR', {
            message: parsed.error.issues[0]?.message ?? 'Invalid query',
          });
        }

        let accountId: string | null = null;
        let email: string | null = null;

        if (parsed.data.email) {
          const account = await ctx.accounts.findByEmail(parsed.data.email);
          if (!account || account.userType !== 'customer') {
            throw apiError('NOT_FOUND');
          }
          accountId = account.id;
          email = account.email;
        } else if (parsed.data.phone) {
          const account = await ctx.accounts.findByPhone(parsed.data.phone);
          if (!account || account.userType !== 'customer') {
            throw apiError('NOT_FOUND');
          }
          accountId = account.id;
          email = account.email;
        } else if (parsed.data.policyId) {
          // Uses the non-admin, projection-limited findAccountIdByPolicyId lookup rather than
          // ctx.policies.findByIdForAdmin — this route only needs to resolve the owning
          // accountId, and findByIdForAdmin is reserved for audited admin routes per
          // SR-004-admin-12 (see admin-policies.ts / admin-assets.ts).
          const resolvedAccountId = await ctx.policies.findAccountIdByPolicyId(parsed.data.policyId!);
          if (!resolvedAccountId) {
            throw apiError('NOT_FOUND');
          }
          const account = await ctx.accounts.findById(resolvedAccountId);
          if (!account || account.userType !== 'customer') {
            throw apiError('NOT_FOUND');
          }
          accountId = account.id;
          email = account.email;
        }

        if (!accountId) {
          throw apiError('NOT_FOUND');
        }

        const [policyCount, assets, cases] = await Promise.all([
          ctx.policies.countByAccount(accountId),
          ctx.assets.listByAccount(accountId, 50, null),
          ctx.recoveryCases.listByAccount(accountId, 20, null),
        ]);

        const openRecoveryCases = cases.filter((c) => OPEN_RECOVERY_STATUSES.has(c.status));

        await ctx.auditLog.record({
          accountId,
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          eventType: 'privileged_data_access',
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.json({
          data: {
            accountId,
            email,
            accountState: (await ctx.accounts.getAccountStatus(accountId))?.accountState ?? 'unknown',
            policyCount,
            assetCount: assets.length,
            assets: assets.map((asset) => ({
              id: asset.id,
              assetType: asset.assetType,
              displayName: asset.displayName,
              status: asset.status,
            })),
            openRecoveryCaseCount: openRecoveryCases.length,
            recoveryCases: openRecoveryCases.map((c) => ({
              id: c.id,
              referenceNumber: c.referenceNumber,
              status: c.status,
              reportedAt: c.reportedAt.toISOString(),
              callCentreNotes: serializeCallCentreNotes(c.callCentreNotes),
            })),
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/recovery-cases/:caseId/notes',
    authenticate,
    requireUserType('support_agent'),
    rateLimit,
    async (req, res, next) => {
      try {
        const params = caseIdParamsSchema.safeParse(req.params);
        if (!params.success) {
          throw apiError('VALIDATION_ERROR', { message: 'Invalid case ID' });
        }

        const parsed = callCentreNoteBodySchema.safeParse(req.body);
        if (!parsed.success) {
          throw apiError('VALIDATION_ERROR', {
            message: parsed.error.issues[0]?.message ?? 'Invalid note body',
          });
        }

        const updated = await ctx.recoveryCases.appendCallCentreNote(
          params.data.caseId,
          req.auth!.accountId,
          parsed.data.text,
        );
        if (!updated) {
          throw apiError('NOT_FOUND');
        }

        const note = updated.callCentreNotes[updated.callCentreNotes.length - 1];
        if (!note) {
          throw apiError('INTERNAL_ERROR');
        }

        await ctx.auditLog.record({
          accountId: updated.accountId,
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          eventType: 'privileged_data_access',
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(201).json({
          data: {
            caseId: updated.id,
            note: {
              agentAccountId: note.agentAccountId,
              text: note.text,
              createdAt: note.createdAt.toISOString(),
            },
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
