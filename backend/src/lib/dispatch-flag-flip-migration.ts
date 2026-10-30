/**
 * OB-03 — the `DIRECTED_DISPATCH_ENABLED` flag-flip migration.
 *
 * Design: docs/features/009-customer-experience-redesign/
 * api-design-ob03-dispatch-location-grants.md §1 ("Flag-flip migration (BA-1, DB-1,
 * CS-4)"), folding in the Tier A addendum's [A5] widened scope.
 *
 * WHAT THIS DOES: for every `recovery_cases` document with `partnerOrganizationId`
 * set (regardless of `status` — [A5]: this includes `recovered`/`closed` cases still
 * inside the PDM-4 90-day wrap-up window, not only `open`/`investigating`/`tracking`)
 * AND `dispatchStatus` currently unset (the field is absent — idempotency check, §1):
 *
 *   - Re-checks the holder's eligibility against the PDM-6 registry fields on
 *     `partner_organizations` (`agreementStatus === 'executed' && terminatedAt ===
 *     null`), per §2.3(a)'s named eligibility source.
 *   - Eligible: sets `dispatchStatus: 'accepted'`, `acceptedAt`, `dispatchedAt` (all to
 *     the migration timestamp), `dispatchedBy: 'system:migration-ddflip'`. Writes a
 *     Trail B row, `action: 'dispatch_accepted'`.
 *   - Not eligible (including a terminated-org holder, CO-OB03-3): clears
 *     `partnerOrganizationId: null`, `dispatchStatus: null`, `acceptedAt: null` — the
 *     single canonical "not held" shape. Writes a Trail B row, `action:
 *     'case_unassigned'` (compliance OQ-2 ruling — never `case_reassigned`).
 *
 * WHAT THIS DOES NOT DO: write any OB-04 (`recovery_case_events`) row — that
 * collection does not exist in `backend/` (§0 [A6]) — only a Trail B
 * (`admin_access_log`) row per case, per the global [A6] note. Does not itself flip
 * the environment variable; a deploy step runs this script to completion BEFORE
 * `DIRECTED_DISPATCH_ENABLED='true'` is applied to the running service (§1's
 * "mechanism, stated"); `assertDirectedDispatchMigrationApplied`
 * (`backend/src/lib/dispatch-migration-guard.ts`) is the second, independent boot-time
 * guard.
 *
 * Idempotent: re-running against already-migrated cases is a no-op (DB-1) — the query
 * only matches documents where `dispatchStatus` is absent.
 */
import { type Collection, type Db, type Document, ObjectId } from 'mongodb';
import {
  createAdminAccessLogRepo,
  type AdminAccessLogRepo,
} from '../repositories/admin-access-log.js';
import {
  createPartnerOrganizationsRepo,
  type PartnerOrganizationsRepo,
} from '../repositories/partner-organizations.js';

/** The system actor identity recorded on every Trail B row this migration writes. */
export const MIGRATION_SYSTEM_ACTOR_ACCOUNT_ID = 'system:migration-ddflip';
const MIGRATION_SYSTEM_SESSION_ID = 'system:migration-ddflip-session';

export interface DispatchFlagFlipMigrationSummary {
  runAt: string;
  dryRun: boolean;
  /** Total `recovery_cases` documents matched by the "held, dispatchStatus unset"
   * idempotency filter — [A5] scope includes the 90-day wrap-up window. */
  candidatesFound: number;
  eligibleMigratedCaseIds: string[];
  notEligibleUnassignedCaseIds: string[];
  /** Case ids this run attempted to touch but failed to write (left unset for a
   * later, safe re-run — idempotency is preserved either way). */
  errors: Array<{ caseId: string; message: string }>;
}

interface MigrationCandidateRow {
  _id: ObjectId;
  accountId: string;
  partnerOrganizationId: string | null;
}

/**
 * [A5]-widened idempotency filter — `partnerOrganizationId` set, ANY `status`
 * (unlike a narrower filter that would act only on `open`/`investigating`/`tracking`
 * and silently skip `recovered`/`closed` cases still inside their wrap-up window),
 * `dispatchStatus` absent (field never set — the idempotency guard per §1).
 */
export function buildDispatchFlagFlipCandidateFilter(): Document {
  return {
    partnerOrganizationId: { $ne: null },
    dispatchStatus: { $exists: false },
  };
}

async function isHolderEligible(
  partnerOrganizations: PartnerOrganizationsRepo,
  partnerOrganizationId: string,
): Promise<boolean> {
  const org = await partnerOrganizations.findById(partnerOrganizationId);
  if (!org) return false;
  return org.agreementStatus === 'executed' && org.terminatedAt === null;
}

export interface RunDispatchFlagFlipMigrationOptions {
  dryRun: boolean;
  /** Injectable for deterministic tests; defaults to `new Date()`. */
  now?: Date;
}

/**
 * Runs one migration pass. Safe to call more than once (idempotent per the filter
 * above) and safe to call against a case still inside its 90-day wrap-up window
 * (included in scope per [A5]).
 */
export async function runDispatchFlagFlipMigration(
  db: Db,
  options: RunDispatchFlagFlipMigrationOptions,
): Promise<DispatchFlagFlipMigrationSummary> {
  const now = options.now ?? new Date();
  const collection: Collection<Document> = db.collection('recovery_cases');
  const partnerOrganizations = createPartnerOrganizationsRepo(db);
  const adminAccessLog: AdminAccessLogRepo = createAdminAccessLogRepo(db);

  const candidates = (await collection
    .find(buildDispatchFlagFlipCandidateFilter())
    .project({ _id: 1, accountId: 1, partnerOrganizationId: 1 })
    .toArray()) as unknown as MigrationCandidateRow[];

  const eligibleMigratedCaseIds: string[] = [];
  const notEligibleUnassignedCaseIds: string[] = [];
  const errors: Array<{ caseId: string; message: string }> = [];

  for (const candidate of candidates) {
    const caseId = candidate._id.toHexString();
    const holderOrgId = candidate.partnerOrganizationId;
    try {
      const eligible = holderOrgId !== null && (await isHolderEligible(partnerOrganizations, holderOrgId));

      if (eligible) {
        if (!options.dryRun) {
          await collection.updateOne(
            { _id: candidate._id },
            {
              $set: {
                dispatchStatus: 'accepted',
                acceptedAt: now,
                dispatchedAt: now,
                dispatchedBy: MIGRATION_SYSTEM_ACTOR_ACCOUNT_ID,
                updatedAt: now,
              },
            },
          );
          await adminAccessLog.recordStateChange({
            actorAccountId: MIGRATION_SYSTEM_ACTOR_ACCOUNT_ID,
            actorSessionId: MIGRATION_SYSTEM_SESSION_ID,
            targetAccountId: candidate.accountId,
            resourceType: 'recovery_case',
            resourceId: caseId,
            fromStatus: 'undispatched',
            toStatus: 'dispatch_accepted',
            endpoint: 'migration:ob03-dispatch-flag-flip',
          });
        }
        eligibleMigratedCaseIds.push(caseId);
      } else {
        if (!options.dryRun) {
          await collection.updateOne(
            { _id: candidate._id },
            {
              $set: {
                partnerOrganizationId: null,
                dispatchStatus: null,
                acceptedAt: null,
                updatedAt: now,
              },
            },
          );
          await adminAccessLog.recordStateChange({
            actorAccountId: MIGRATION_SYSTEM_ACTOR_ACCOUNT_ID,
            actorSessionId: MIGRATION_SYSTEM_SESSION_ID,
            targetAccountId: candidate.accountId,
            resourceType: 'recovery_case',
            resourceId: caseId,
            fromStatus: holderOrgId ?? 'unknown',
            toStatus: 'case_unassigned',
            endpoint: 'migration:ob03-dispatch-flag-flip',
          });
        }
        notEligibleUnassignedCaseIds.push(caseId);
      }
    } catch (err) {
      errors.push({ caseId, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    runAt: now.toISOString(),
    dryRun: options.dryRun,
    candidatesFound: candidates.length,
    eligibleMigratedCaseIds,
    notEligibleUnassignedCaseIds,
    errors,
  };
}
