/**
 * Feature 010 (Phase 2, FR-11–17) — call-centre support-case routes.
 *
 * CONDITIONALLY SIGNED OFF at Stage 8 (security-review.md) for FR-12/14/15/16, and for
 * FR-17's `GET /v1/support-cases` scoped to `scope=mine` ONLY — `scope=all` is WITHHELD
 * (SR-010-2) and MUST NOT be implemented; this router rejects it with 400
 * VALIDATION_ERROR rather than silently accepting it.
 *
 * FR-18–21 (escalation to a recovery case) are NOT AUTHORIZED FOR IMPLEMENTATION
 * (C-010-4 blocked, Stage 1). No route, schema, or repository method for escalation
 * exists anywhere in this file or `repositories/support-cases.ts` — see
 * docs/features/010-call-centre-dashboard/api-design.md §7 /
 * docs/features/010-call-centre-dashboard/security-review.md §6.
 *
 * Auth model note (api-design.md §2.2, security-review.md §1 — SR-010-1): `accountId` on
 * `POST /support-cases` is a deliberate, reviewed exception to the platform's
 * never-client-supplied-accountId rule (Feature 004 api-design.md §4.2), because this is
 * an agent-on-behalf-of-customer creation endpoint. The three mitigating controls,
 * enforced below:
 *   1. `accountId` MUST resolve via `ctx.accounts.findById` — 404 otherwise.
 *   2. The resolved account's `userType` MUST be `customer` — 404 otherwise.
 *   3. Every write is attributed via `createdByAgentAccountId`/note `agentAccountId` =
 *      `req.auth!.accountId` (from the bearer token) — never from the request body.
 * These controls do not, by themselves, restrict which customer an agent may act on
 * (SR-010-1's own finding) — the compensating control is SR-010-1a/b: every write, every
 * detail read, and every list call on this router is audit-logged with the SUBJECT
 * accountId, per ADR-0006 Trail A, making "agent acted on an account they never looked
 * up" a queryable fact rather than an unrecorded assumption.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { buildPage, parseMongoPaginationQuery } from '../lib/mongo-pagination.js';
import {
  serializeSupportCaseDetail,
  serializeSupportCaseSummary,
  type SupportCaseDocument,
} from '../repositories/support-cases.js';
import { SUPPORT_CASE_CATEGORIES } from '../db/support-case-collections.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';
import { requireIdempotencyKey } from '../middleware/idempotency.js';

const CATEGORY_VALUES = SUPPORT_CASE_CATEGORIES as readonly string[];

const caseIdParamsSchema = z.object({
  caseId: z.string().regex(/^[0-9a-f]{24}$/i),
});

const createSupportCaseSchema = z.object({
  accountId: z.string().uuid(),
  category: z.enum(SUPPORT_CASE_CATEGORIES),
  description: z.string().trim().min(1).max(2000),
  channel: z.literal('phone').optional().default('phone'),
});

const addNoteSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

// 'escalated' is deliberately NOT in this enum — the only path to that status is the
// (not-authorized) escalate endpoint, api-design.md §5.
const updateStatusSchema = z
  .object({
    status: z.enum(['in_progress', 'resolved', 'closed']),
    resolutionSummary: z.string().trim().min(1).max(2000).optional(),
  })
  .refine(
    (v) => !(v.status === 'resolved' || v.status === 'closed') || Boolean(v.resolutionSummary),
    { message: 'resolutionSummary is required when status is resolved or closed' },
  );

// SR-010-2 — `scope` is required with NO default, and `all` is WITHHELD. This schema
// only ever accepts `'mine'`; any other value (including the string `'all'`) fails
// validation and returns 400 VALIDATION_ERROR — there is no code path past this point
// that can return another agent's cases.
const listQuerySchema = z.object({
  scope: z.literal('mine'),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed', 'escalated']).optional(),
  category: z.string().optional(),
  accountId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.union([z.string(), z.number()]).optional(),
});

function validateCategory(category: string): void {
  if (!CATEGORY_VALUES.includes(category)) {
    throw apiError('VALIDATION_ERROR', {
      message: `category must be one of: ${CATEGORY_VALUES.join(', ')}`,
    });
  }
}

export function createSupportCasesRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);
  // Reuses support-lookup.ts's existing limiter class verbatim (api-design.md §4) — no
  // new limiter tier introduced for this router.
  const rateLimit = createRateLimiter(
    ctx.kv,
    { attempts: 30, windowSeconds: 60 },
    (req) => `support-cases:${req.auth!.accountId}:${clientIp(req)}`,
  );

  async function recordCaseAudit(req: Request, subjectAccountId: string): Promise<void> {
    await ctx.auditLog.record({
      accountId: subjectAccountId,
      actorAccountId: req.auth!.accountId,
      actorSessionId: req.auth!.sessionId,
      auditRequestId: req.auditRequestId ?? null,
      eventType: 'privileged_data_access',
      ipAddress: clientIp(req),
      userAgent: req.header('user-agent') ?? null,
    });
  }

  // FR-12 — POST /v1/support-cases
  router.post(
    '/support-cases',
    authenticate,
    requireUserType('support_agent'),
    rateLimit,
    requireIdempotencyKey('POST /v1/support-cases', ctx.idempotency),
    async (req, res, next) => {
      try {
        const parsed = createSupportCaseSchema.safeParse(req.body);
        if (!parsed.success) {
          throw apiError('VALIDATION_ERROR', {
            message: parsed.error.issues[0]?.message ?? 'Invalid request body',
          });
        }
        // category is already constrained by createSupportCaseSchema's z.enum — no
        // separate validateCategory() call needed here (unlike the list endpoint's
        // free-form `category` filter, below).

        // Mitigating control 1 + 2 (SR-010-1 / api-design.md §2.2): accountId must
        // resolve to a real, customer-type account. Uniform 404 either way — no
        // existence-oracle distinction between "no such account" and "not a customer".
        const account = await ctx.accounts.findById(parsed.data.accountId);
        if (!account || account.userType !== 'customer') {
          throw apiError('NOT_FOUND');
        }

        const supportCase = await ctx.supportCases.createForAccount({
          accountId: account.id,
          category: parsed.data.category,
          description: parsed.data.description,
          channel: parsed.data.channel,
          // Mitigating control 3: actor attribution always server-derived from the
          // bearer token, never trusted from the request body.
          createdByAgentAccountId: req.auth!.accountId,
        });

        // SR-010-1a — audit the write, recording the SUBJECT accountId (the customer
        // the case is about), not only the acting agent.
        await recordCaseAudit(req, account.id);

        res.status(201).json({ data: serializeSupportCaseDetail(supportCase) });
      } catch (err) {
        next(err);
      }
    },
  );

  // FR-17 — GET /v1/support-cases?scope=mine (scope=all WITHHELD, SR-010-2)
  router.get(
    '/support-cases',
    authenticate,
    requireUserType('support_agent'),
    rateLimit,
    async (req, res, next) => {
      try {
        const rawScope = req.query.scope;
        if (rawScope === undefined) {
          throw apiError('VALIDATION_ERROR', { message: 'scope is required' });
        }
        if (rawScope !== 'mine') {
          // Covers `scope=all` explicitly and any other value. SR-010-2: `scope=all`
          // is WITHHELD at Stage 8 — this is not a placeholder, there is no
          // `listAll`-shaped repository method for this branch to call even if the
          // validation below were bypassed.
          throw apiError('VALIDATION_ERROR', {
            message: "scope must be 'mine'. 'all' is not available on this endpoint.",
          });
        }

        const parsed = listQuerySchema.safeParse(req.query);
        if (!parsed.success) {
          throw apiError('VALIDATION_ERROR', {
            message: parsed.error.issues[0]?.message ?? 'Invalid query',
          });
        }
        if (parsed.data.category !== undefined) {
          validateCategory(parsed.data.category);
        }

        const { limit, cursor } = parseMongoPaginationQuery(req.query as Record<string, unknown>);

        const rows = await ctx.supportCases.listMine(
          req.auth!.accountId,
          {
            status: parsed.data.status,
            category: parsed.data.category,
            accountId: parsed.data.accountId,
          },
          limit + 1,
          cursor,
        );
        const page = buildPage(rows, limit);

        // SR-010-1b — audit list calls: one privileged_bulk_access row (result count)
        // plus one privileged_data_access row per distinct disclosed subject.
        await ctx.auditLog.recordBulkDisclosure({
          disclosedAccountIds: page.data.map((row: SupportCaseDocument) => row.accountId),
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json({
          data: page.data.map(serializeSupportCaseSummary),
          pagination: { nextCursor: page.nextCursor, hasMore: page.hasMore },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // FR-17 (detail) — GET /v1/support-cases/:caseId
  router.get(
    '/support-cases/:caseId',
    authenticate,
    requireUserType('support_agent'),
    rateLimit,
    async (req, res, next) => {
      try {
        const parsed = caseIdParamsSchema.safeParse(req.params);
        if (!parsed.success) {
          throw apiError('VALIDATION_ERROR');
        }
        const supportCase = await ctx.supportCases.findById(parsed.data.caseId);
        if (!supportCase) {
          throw apiError('NOT_FOUND');
        }

        // SR-010-1a — audit every case detail read, subject accountId recorded.
        await recordCaseAudit(req, supportCase.accountId);

        res.status(200).json({ data: serializeSupportCaseDetail(supportCase) });
      } catch (err) {
        next(err);
      }
    },
  );

  // FR-14 — POST /v1/support-cases/:caseId/notes
  router.post(
    '/support-cases/:caseId/notes',
    authenticate,
    requireUserType('support_agent'),
    rateLimit,
    async (req, res, next) => {
      try {
        const params = caseIdParamsSchema.safeParse(req.params);
        if (!params.success) {
          throw apiError('VALIDATION_ERROR', { message: 'Invalid case ID' });
        }
        const parsed = addNoteSchema.safeParse(req.body);
        if (!parsed.success) {
          throw apiError('VALIDATION_ERROR', {
            message: parsed.error.issues[0]?.message ?? 'Invalid note body',
          });
        }

        const updated = await ctx.supportCases.appendNote(
          params.data.caseId,
          req.auth!.accountId,
          parsed.data.text,
        );
        if (!updated) {
          throw apiError('NOT_FOUND');
        }

        const note = updated.notes[updated.notes.length - 1];
        if (!note) {
          throw apiError('INTERNAL_ERROR');
        }

        // SR-010-1a — audit the write, subject accountId recorded.
        await recordCaseAudit(req, updated.accountId);

        res.status(201).json({
          data: {
            caseId: updated.id,
            note: { agentAccountId: note.agentAccountId, text: note.text, createdAt: note.createdAt.toISOString() },
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // FR-15/16 — PATCH /v1/support-cases/:caseId/status
  router.patch(
    '/support-cases/:caseId/status',
    authenticate,
    requireUserType('support_agent'),
    rateLimit,
    async (req, res, next) => {
      try {
        const params = caseIdParamsSchema.safeParse(req.params);
        if (!params.success) {
          throw apiError('VALIDATION_ERROR', { message: 'Invalid case ID' });
        }
        const parsed = updateStatusSchema.safeParse(req.body);
        if (!parsed.success) {
          throw apiError('VALIDATION_ERROR', {
            message: parsed.error.issues[0]?.message ?? 'Invalid status update',
          });
        }

        const result = await ctx.supportCases.updateStatus(
          params.data.caseId,
          parsed.data.status,
          parsed.data.resolutionSummary ?? null,
        );

        if (!result.ok) {
          if (result.reason === 'not_found') {
            throw apiError('NOT_FOUND');
          }
          throw apiError('CONFLICT', { message: 'Invalid status transition for this case.' });
        }

        // SR-010-1a — audit the write, subject accountId recorded.
        await recordCaseAudit(req, result.case.accountId);

        res.status(200).json({ data: serializeSupportCaseDetail(result.case) });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
