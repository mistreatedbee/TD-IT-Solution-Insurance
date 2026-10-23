/**
 * Feature 010 — support-agent customer lookup (call-centre dashboard backend).
 *
 * Purpose-limited search — no bulk list. Uses existing `support_agent` user type.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { buildPlanSubscriptionSummary } from '../lib/plan-subscription-summary.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter, clientIp } from '../middleware/rate-limit.js';
import { serializeSupportCaseLookupSummary } from '../repositories/support-cases.js';
import { serializeNotificationPreferences } from '../repositories/notification-preferences.js';
import { normalizeAccountNumber } from '../repositories/accounts.js';

const phoneQuerySchema = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .regex(/^\+?[0-9\s()-]+$/);

// Business-owner top-priority request (2026-10-23): accountNumber is a fourth valid
// lookup key, same purpose-limited/single-match posture as email/phone/policyId below.
const accountNumberQuerySchema = z
  .string()
  .trim()
  .refine((value) => normalizeAccountNumber(value) !== null, {
    message: 'accountNumber must be in the form TD-XXXXXX',
  });

const lookupQuerySchema = z
  .object({
    email: z.string().email().optional(),
    policyId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    phone: phoneQuerySchema.optional(),
    accountNumber: accountNumberQuerySchema.optional(),
  })
  .refine((value) => Boolean(value.email ?? value.policyId ?? value.phone ?? value.accountNumber), {
    message: 'Provide email, policyId, phone, or accountNumber',
  });

const OPEN_RECOVERY_STATUSES = new Set(['open', 'investigating', 'tracking']);

const caseIdParamsSchema = z.object({
  caseId: z.string().regex(/^[a-f0-9]{24}$/i),
});

// Candidate #2 (04-product-feature-candidates-2026-10.md item 4) — a call-centre
// recovery-case detail lookup accepts either the Mongo ObjectId or the
// customer/partner-facing `RC-YYYYMMDD-XXXX` reference number (support-cases.ts's own
// `SC-...` reference shares the same shape — see `generateReferenceNumber` in
// `repositories/recovery-cases.ts`), since an agent on a call is far more likely to have
// been given the reference number than the internal id.
const caseIdOrReferenceParamsSchema = z.object({
  idOrReference: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^([a-f0-9]{24}|RC-\d{8}-[A-Z0-9]{4})$/i),
});

const notificationPreferencesParamsSchema = z.object({
  accountId: z.string().uuid(),
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

/**
 * Candidate #1 (04-product-feature-candidates-2026-10.md item 1) — the per-type
 * `details` object (`lib/asset-validation.ts`) uses `make` only for `vehicle` and
 * `brand` for every other asset type; `serialNumber` is absent on `vehicle` (which
 * instead carries `vin`, out of scope for this additive change) and `imei` only exists
 * on `smartphone`/`tablet`. Normalizes `brand`/`make` into one `make` field for the
 * agent-facing response rather than exposing the per-type schema shape directly.
 */
function extractAssetIdentifiers(details: Record<string, unknown>): {
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  imei: string | null;
} {
  const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  return {
    make: str(details.make) ?? str(details.brand),
    model: str(details.model),
    serialNumber: str(details.serialNumber),
    imei: str(details.imei),
  };
}

/**
 * Candidate #2 — the call-centre case-detail response. Deliberately excludes
 * `lastLocation` (coordinates — asset-location data, never exposed via this router per
 * this role's pre-approval checklist) and every SAPS police-report field
 * (`sapsCaseNumber`/`reportingStation`/`reportedToPoliceAt`/`policeReportHistory`/
 * `policeReportReminderSentAt` — customer-only, `lib/police-report-serializers.ts`,
 * SR-011-1c/C-011-9). `accountId` IS included: an agent dialing in on a bare case
 * reference needs to confirm which customer it belongs to, and an internal
 * `support_agent` can already resolve this same id via `GET /customer-lookup` — unlike
 * the security-partner routes (PDM-1), there is no cross-tenant minimisation concern
 * here.
 */
function serializeRecoveryCaseForCallCentre(doc: {
  id: string;
  accountId: string;
  assetId: string;
  status: string;
  referenceNumber: string;
  reportedAt: Date;
  closedAt: Date | null;
  notes: string | null;
  lastLocationAt: Date | null;
  callCentreNotes: { agentAccountId: string; text: string; createdAt: Date }[];
}) {
  return {
    id: doc.id,
    accountId: doc.accountId,
    assetId: doc.assetId,
    status: doc.status,
    referenceNumber: doc.referenceNumber,
    reportedAt: doc.reportedAt.toISOString(),
    closedAt: doc.closedAt?.toISOString() ?? null,
    notes: doc.notes,
    lastLocationAt: doc.lastLocationAt?.toISOString() ?? null,
    callCentreNotes: serializeCallCentreNotes(doc.callCentreNotes),
  };
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
        let accountNumber: string | null = null;

        if (parsed.data.email) {
          const account = await ctx.accounts.findByEmail(parsed.data.email);
          if (!account || account.userType !== 'customer') {
            throw apiError('NOT_FOUND');
          }
          accountId = account.id;
          email = account.email;
          accountNumber = account.accountNumber ?? null;
        } else if (parsed.data.phone) {
          const account = await ctx.accounts.findByPhone(parsed.data.phone);
          if (!account || account.userType !== 'customer') {
            throw apiError('NOT_FOUND');
          }
          accountId = account.id;
          email = account.email;
          accountNumber = account.accountNumber ?? null;
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
          accountNumber = account.accountNumber ?? null;
        } else if (parsed.data.accountNumber) {
          // Business-owner top-priority request (2026-10-23) — fourth lookup key.
          const account = await ctx.accounts.findByAccountNumber(parsed.data.accountNumber);
          if (!account || account.userType !== 'customer') {
            throw apiError('NOT_FOUND');
          }
          accountId = account.id;
          email = account.email;
          accountNumber = account.accountNumber ?? null;
        }

        if (!accountId) {
          throw apiError('NOT_FOUND');
        }

        const [policyCount, assets, cases, primaryPolicy, openSupportCases] = await Promise.all([
          ctx.policies.countByAccount(accountId),
          ctx.assets.listByAccount(accountId, 50, null),
          ctx.recoveryCases.listByAccount(accountId, 20, null),
          ctx.policies.listByAccount(accountId, 1, null).then((rows) => rows[0] ?? null),
          // FR-11 addendum (Feature 010 Phase 2, api-design.md §3) — additive field only;
          // no change to this handler's existing auth/audit posture.
          ctx.supportCases.listOpenByAccount(accountId, 20),
        ]);

        const subscription = await buildPlanSubscriptionSummary(ctx, primaryPolicy ?? null);

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
            accountNumber,
            accountState: (await ctx.accounts.getAccountStatus(accountId))?.accountState ?? 'unknown',
            policyCount,
            assetCount: assets.length,
            assets: assets.map((asset) => ({
              id: asset.id,
              assetType: asset.assetType,
              displayName: asset.displayName,
              status: asset.status,
              // Candidate #1 — additive fields on an already-audited disclosure
              // (privileged_data_access, recorded below); no new audit event.
              ...extractAssetIdentifiers(asset.details ?? {}),
            })),
            openRecoveryCaseCount: openRecoveryCases.length,
            recoveryCases: openRecoveryCases.map((c) => ({
              id: c.id,
              referenceNumber: c.referenceNumber,
              status: c.status,
              reportedAt: c.reportedAt.toISOString(),
              callCentreNotes: serializeCallCentreNotes(c.callCentreNotes),
            })),
            subscription: subscription
              ? {
                  planName: subscription.planName,
                  planSlug: subscription.planSlug,
                  assetUsageLabel: subscription.assetUsageLabel,
                  supportLevel: subscription.supportLevel,
                  activeAssetCount: subscription.activeAssetCount,
                  maxAssets: subscription.maxAssets,
                }
              : null,
            // FR-11 addendum — `openSupportCaseCount` counts status IN ('open',
            // 'in_progress') only; `escalated` is excluded (its "open-ness" has moved
            // to the resulting recovery case, already counted by
            // openRecoveryCaseCount) — api-design.md §3.
            openSupportCaseCount: openSupportCases.length,
            supportCases: openSupportCases.map(serializeSupportCaseLookupSummary),
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

  // Candidate #2 (04-product-feature-candidates-2026-10.md item 4) — dedicated,
  // call-centre-scoped recovery-case detail read. Scoped the same way as
  // POST /recovery-cases/:caseId/notes above: `support_agent` role only, no
  // additional per-account ownership check (an agent is not restricted to cases
  // belonging to an account they've already looked up) — the compensating control is
  // the same `privileged_data_access` audit write every other route in this file uses.
  router.get(
    '/recovery-cases/:idOrReference',
    authenticate,
    requireUserType('support_agent'),
    rateLimit,
    async (req, res, next) => {
      try {
        const params = caseIdOrReferenceParamsSchema.safeParse(req.params);
        if (!params.success) {
          throw apiError('VALIDATION_ERROR', { message: 'Invalid case ID or reference number' });
        }

        const recoveryCase = await ctx.recoveryCases.findByIdOrReferenceForCallCentre(
          params.data.idOrReference,
        );
        if (!recoveryCase) {
          throw apiError('NOT_FOUND');
        }

        await ctx.auditLog.record({
          accountId: recoveryCase.accountId,
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          eventType: 'privileged_data_access',
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json({ data: serializeRecoveryCaseForCallCentre(recoveryCase) });
      } catch (err) {
        next(err);
      }
    },
  );

  // Candidate #3 (04-product-feature-candidates-2026-10.md item 6) — read-only
  // notification-preferences view for a looked-up customer. Same access-scoping
  // pattern as GET /customer-lookup above: `support_agent` role, the target account
  // must resolve and be a `customer` (404 otherwise, mirroring support-cases.ts's
  // SR-010-1 controls), and the read is covered by the existing
  // `privileged_data_access` audit event — no new audit event type.
  router.get(
    '/customers/:accountId/notification-preferences',
    authenticate,
    requireUserType('support_agent'),
    rateLimit,
    async (req, res, next) => {
      try {
        const params = notificationPreferencesParamsSchema.safeParse(req.params);
        if (!params.success) {
          throw apiError('VALIDATION_ERROR', { message: 'Invalid account ID' });
        }

        const accountId = params.data.accountId;
        const account = await ctx.accounts.findById(accountId);
        if (!account || account.userType !== 'customer') {
          throw apiError('NOT_FOUND');
        }

        const prefs = await ctx.notificationPreferences.getOrCreate(accountId);

        await ctx.auditLog.record({
          accountId,
          actorAccountId: req.auth!.accountId,
          actorSessionId: req.auth!.sessionId,
          auditRequestId: req.auditRequestId ?? null,
          eventType: 'privileged_data_access',
          ipAddress: clientIp(req),
          userAgent: req.header('user-agent') ?? null,
        });

        res.status(200).json({ data: serializeNotificationPreferences(prefs) });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
