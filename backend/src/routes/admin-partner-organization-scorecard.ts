/**
 * `GET /v1/admin/partner-organizations/:id/scorecard` — partner-organization
 * recovery-performance scorecard (product-differentiation research, "highest
 * buildability" item: every underlying field already exists on
 * `recovery_cases` / `admin_access_log`, so this is a read-only aggregation,
 * not a new workflow).
 *
 * Read-only reporting, no mutation — gated the same way `GET
 * /v1/admin/analytics/dau` is (admin-only + rate limit, no step-up MFA). That
 * precedent is deliberately followed here rather than requiring step-up: this
 * endpoint cannot change any state, claim any case, or disclose a customer's
 * own PII beyond what's already visible via the partner-org/case list
 * endpoints an admin can already read.
 *
 * Internal composition only — there is no new write path and no new
 * collection. See `repositories/recovery-cases.ts`'s `PartnerOrgScorecard`
 * doc comment for the two honest limitations in what the underlying schema
 * can represent (no per-case assignment-history array; no dedicated
 * `claimedAt` timestamp).
 */
import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { apiError } from '../lib/errors.js';
import { AUDIT_LOG_READ_LIMIT } from '../lib/policy.js';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { requireUserType } from '../middleware/require-role.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

const ENDPOINT_RELEASE = 'POST /v1/security/cases/:caseId/release';
const ENDPOINT_REASSIGN = 'POST /v1/security/cases/:caseId/reassign';

// Internal cap on how many of this org's own operator accounts get resolved
// to attribute release/reassign audit rows to it — not a customer-facing
// pagination ceiling. A partner org having more than this many operator
// accounts would be unusual; if it ever happens this undercounts rather than
// erroring, which is the right failure mode for a reporting endpoint.
const MAX_ORG_OPERATOR_ACCOUNTS = 1000;

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const querySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export function createAdminPartnerOrganizationScorecardRouter(ctx: AppContext): Router {
  const router = Router();
  const authenticate = createAuthenticateMiddleware(ctx.env, ctx.kv);

  router.get(
    '/admin/partner-organizations/:id/scorecard',
    authenticate,
    requireUserType('admin'),
    createRateLimiter(
      ctx.kv,
      AUDIT_LOG_READ_LIMIT,
      (req) => `admin-partner-org-scorecard:${req.auth!.accountId}`,
    ),
    async (req, res, next) => {
      try {
        const paramsParsed = paramsSchema.safeParse(req.params);
        if (!paramsParsed.success) {
          next(apiError('NOT_FOUND'));
          return;
        }
        const queryParsed = querySchema.safeParse(req.query);
        if (!queryParsed.success) {
          next(apiError('VALIDATION_ERROR', { message: 'from and to must be YYYY-MM-DD' }));
          return;
        }
        const { from, to } = queryParsed.data;
        if (from !== undefined && to !== undefined && from > to) {
          next(apiError('VALIDATION_ERROR', { message: 'from must be on or before to' }));
          return;
        }

        const org = await ctx.partnerOrganizations.findById(paramsParsed.data.id);
        if (!org) {
          next(apiError('NOT_FOUND'));
          return;
        }

        const range = {
          from: from !== undefined ? new Date(`${from}T00:00:00.000Z`) : undefined,
          to: to !== undefined ? new Date(`${to}T23:59:59.999Z`) : undefined,
        };

        const caseMetrics = await ctx.recoveryCases.getScorecardForPartnerOrg(org.id, range);

        // Release/reassign counts are attributed to this org via its own
        // operator accounts' actorAccountId on the privileged_state_change
        // audit rows those endpoints write (routes/security-cases.ts) — the
        // audit row itself carries no direct `partnerOrganizationId` field.
        const operatorAccounts = await ctx.accounts.listForAdmin(
          { partnerOrganizationId: org.id },
          MAX_ORG_OPERATOR_ACCOUNTS,
          null,
        );
        const operatorAccountIds = operatorAccounts.map((a) => a.id);
        const stateChangeCounts = await ctx.adminAccessLog.countStateChangesByEndpointForActors(
          operatorAccountIds,
          [ENDPOINT_RELEASE, ENDPOINT_REASSIGN],
          range,
        );

        res.status(200).json({
          data: {
            partnerOrganizationId: org.id,
            partnerOrganizationName: org.name,
            range: { from: from ?? null, to: to ?? null },
            totalCasesClaimed: caseMetrics.totalCasesClaimed,
            activeCases: caseMetrics.activeCases,
            recoveredCount: caseMetrics.recoveredCount,
            closedOtherCount: caseMetrics.closedOtherCount,
            recoveryRatePercent: caseMetrics.recoveryRatePercent,
            averageTimeToTerminalStatusHours: caseMetrics.averageTimeToTerminalStatusHours,
            releasedCount: stateChangeCounts[ENDPOINT_RELEASE] ?? 0,
            reassignedAwayCount: stateChangeCounts[ENDPOINT_REASSIGN] ?? 0,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
