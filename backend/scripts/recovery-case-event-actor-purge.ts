#!/usr/bin/env node
/**
 * OB-04 — `recovery_case_events` operator-identity retention-purge script.
 *
 * Design: docs/features/019-case-history-timeline/backend-architecture-event-model.md
 * §11.1/§11.2 (compliance-specialist ruling, RR-019-B). §11.4 item 2 requires this
 * job to be built, tested, and ACTUALLY SCHEDULED before the
 * `recovery_case_events` append path may be enabled in production — "nothing
 * reaches 12 months for a year" is explicitly not an acceptable reason to ship
 * without it.
 *
 * WHAT THIS DOES: field-level clear (never a whole-document delete) of
 * `actor.accountId` on `recovery_case_events` documents whose `actor.type` is
 * `'security_company_operator'`, whose `occurredAt` is more than
 * ADMIN_ACCESS_LOG_RETENTION_MONTHS (12) months in the past, and whose PARENT case
 * is not on `legalHold`. Idempotent.
 *
 * Mirrors `admin-access-log-retention-purge.ts`'s/`police-report-retention-purge.ts`'s
 * CLI shape exactly — same `--dry-run` safety convention, same stdout JSON summary,
 * same `retention_job_runs` durable run-log write (done inside
 * `runRecoveryCaseEventActorPurge`).
 *
 * USAGE (run from repo root; requires MONGODB_URI in repo-root `.env`/`.env.local`):
 *
 *   npx tsx backend/scripts/recovery-case-event-actor-purge.ts --dry-run
 *   npx tsx backend/scripts/recovery-case-event-actor-purge.ts
 */
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

import { openMongoDatabase, resolveMongoDatabaseName } from '../src/db/mongo-connection.js';
import { runRecoveryCaseEventActorPurge } from '../src/lib/recovery-case-event-actor-purge.js';

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

  // eslint-disable-next-line no-console
  console.error(
    `[recovery-case-event-actor-purge] mode=${dryRun ? 'DRY-RUN (no writes)' : 'LIVE (will write)'} ` +
      `resolvedDatabaseName=${resolvedDbName ?? '(driver default — no db name in URI or MONGODB_DB_NAME)'}`,
  );

  try {
    await mongo.connect();
    const db = openMongoDatabase(mongo, mongoDbNameOverride);

    const summary = await runRecoveryCaseEventActorPurge(db, { dryRun });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));

    if (summary.error) {
      // eslint-disable-next-line no-console
      console.error(`[recovery-case-event-actor-purge] Run completed with an error: ${summary.error}`);
      process.exitCode = 1;
    }
  } finally {
    await mongo.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[recovery-case-event-actor-purge] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
