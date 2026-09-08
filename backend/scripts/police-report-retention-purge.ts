#!/usr/bin/env node
/**
 * Feature 011 (SAPS case-number capture) — police-report retention-purge script.
 *
 * Design: docs/features/011-saps-case-reporting/database-design.md §5 (C-011-10
 * mechanism). Gate: docs/features/011-saps-case-reporting/security-review.md SR-011-4
 * (this script is what makes C-011-10 operable, now that `closedAt` is set by
 * `updateStatusForPartnerOrg` on the transition into `'closed'` — see
 * `backend/src/repositories/recovery-cases.ts`).
 *
 * WHAT THIS DOES: field-level clears (never a whole-document delete) four
 * police-report fields — `sapsCaseNumber`, `reportingStation`, `reportedToPoliceAt`,
 * `policeReportHistory` — plus `policeReportReminderSentAt`, on `recovery_cases`
 * documents that are `status: 'closed'`, whose `closedAt` is more than
 * `POLICE_REPORT_RETENTION_YEARS` (5) years in the past, that are NOT under
 * `legalHold: true`, and that still have at least one of the police-report fields
 * set. Idempotent — an already-cleared document simply stops matching on the next run.
 *
 * WHAT THIS DOES NOT DO: this is a script, not a scheduled job. Actual scheduling
 * (cron, a Render Cron Job, or equivalent) is a separate `devops-engineer`/`cto`
 * decision (database-design.md §5.3) — not made or wired up here.
 *
 * SAFETY: defaults to `--dry-run` is NOT the default — pass `--dry-run` explicitly to
 * report what WOULD be cleared without writing, matching this repo's existing
 * conventions for scripts that touch production data (see `verify-mongo-catalog.ts`'s
 * own dry-run posture). Always run with `--dry-run` first against production data.
 *
 * USAGE (run from repo root; requires MONGODB_URI in repo-root `.env`/`.env.local` —
 * see backend/.env.example):
 *
 *   npx tsx backend/scripts/police-report-retention-purge.ts --dry-run
 *   npx tsx backend/scripts/police-report-retention-purge.ts
 *
 * OUTPUT: a structured JSON summary to stdout
 * (`{ runAt, dryRun, retentionYears, cutoffDate, candidatesFound, cleared, error }`),
 * per C-011-10's "evidenced" requirement and mirroring `inc-001-location-inventory.ts`'s
 * own stdout-summary convention. This repo has no durable, queryable run-log
 * collection for any retention/purge job today (database-design.md §5.3,
 * security-review.md SR-011-4.4 — named, not silently assumed) — stdout-only
 * evidencing is the accepted interim control pending an explicit devops/security/cto
 * decision to build one. Nothing in this script deletes a `recovery_cases` document.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

import { openMongoDatabase, resolveMongoDatabaseName } from '../src/db/mongo-connection.js';
import { runPoliceReportRetentionPurge } from '../src/lib/police-report-retention.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) throw new Error('Missing MONGODB_URI');

  const mongoDbNameOverride = process.env.MONGODB_DB_NAME?.trim() || undefined;
  const resolvedDbName = resolveMongoDatabaseName(mongoUri, mongoDbNameOverride);
  const mongo = new MongoClient(mongoUri);

  // Same discipline as inc-001-location-inventory.ts: print the resolved database name
  // unconditionally, before any query/write runs, so a run against the wrong database
  // is never mistaken for "nothing to clear".
  // eslint-disable-next-line no-console
  console.error(
    `[police-report-retention-purge] mode=${dryRun ? 'DRY-RUN (no writes)' : 'LIVE (will write)'} ` +
      `resolvedDatabaseName=${resolvedDbName ?? '(driver default — no db name in URI or MONGODB_DB_NAME)'}`,
  );

  try {
    await mongo.connect();
    const db = openMongoDatabase(mongo, mongoDbNameOverride);

    const summary = await runPoliceReportRetentionPurge(db, { dryRun });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));

    if (summary.error) {
      // eslint-disable-next-line no-console
      console.error(`[police-report-retention-purge] Run completed with an error: ${summary.error}`);
      process.exitCode = 1;
    }
  } finally {
    await mongo.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[police-report-retention-purge] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
