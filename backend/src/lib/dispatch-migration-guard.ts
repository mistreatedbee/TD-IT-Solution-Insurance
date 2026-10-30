/**
 * OB-03 — boot-time guard for the `DIRECTED_DISPATCH_ENABLED` flag-flip migration.
 *
 * Design: docs/features/009-customer-experience-redesign/
 * api-design-ob03-dispatch-location-grants.md §1's "[A5] 'Runs before the flag is
 * read as true': the mechanism, stated" — this is the SECOND, INDEPENDENT guard (a
 * deploy-ordering step running the migration script to completion is the first).
 * Refuses to start the service if `DIRECTED_DISPATCH_ENABLED==='true'` and any
 * `recovery_cases` document in scope (held, any status including the 90-day wrap-up
 * window — [A5]) still has `dispatchStatus` unset, which would otherwise let such a
 * case silently fall through §3.5's new dispatch-status-gated predicate.
 *
 * Called once, at boot, from `backend/src/index.ts` — never per-request (matches the
 * CS-7 flag-combination check's own "checked once at boot" posture in
 * `backend/src/config/env.ts`).
 */
import type { Db } from 'mongodb';
import { buildDispatchFlagFlipCandidateFilter } from './dispatch-flag-flip-migration.js';

/**
 * Throws if `directedDispatchEnabled` is true and the migration has not been run
 * against every in-scope `recovery_cases` document. Resolves (no-op) otherwise —
 * including when `directedDispatchEnabled` is false/undefined, since the check is
 * meaningless while the flag is off.
 */
export async function assertDirectedDispatchMigrationApplied(
  db: Db,
  directedDispatchEnabled: boolean | undefined,
): Promise<void> {
  if (!directedDispatchEnabled) return;

  const unmigratedCount = await db
    .collection('recovery_cases')
    .countDocuments(buildDispatchFlagFlipCandidateFilter());

  if (unmigratedCount > 0) {
    throw new Error(
      `[dispatch-migration-guard] DIRECTED_DISPATCH_ENABLED=true but ${unmigratedCount} ` +
        "recovery_cases document(s) with partnerOrganizationId set still have no " +
        "dispatchStatus (unmigrated). Refusing to start (OB-03 api-design-ob03-dispatch-" +
        'location-grants.md §1 — the flag-flip migration script ' +
        '(backend/scripts/ob03-dispatch-flag-flip-migration.ts) must run to completion ' +
        'BEFORE this flag is applied to the running service).',
    );
  }
}
