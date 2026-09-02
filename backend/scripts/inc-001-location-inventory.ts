#!/usr/bin/env node
/**
 * INC-001 — read-only inventory of `location_events` and `Asset.lastLocation`.
 *
 * Strictly READ-ONLY: no writes, no deletes, no updates. Produces the
 * inventory numbers requested by INC-001 follow-up (count, distinct
 * account/asset IDs, date range, real-vs-test breakdown) so
 * compliance-specialist can make the retain/purge call with real data,
 * without this script or its author making that call.
 *
 * Cross-references location_events.accountId / Asset.accountId (Mongo)
 * against app.accounts.email (Postgres, Supabase-backed) to classify each
 * distinct account as "test" (matches seed-test-accounts.ts emails, the
 * @tditsolutions.dev domain used by that script, or is otherwise unknown
 * because the account no longer resolves in Postgres) vs "real".
 *
 * Run from repo root (requires MONGODB_URI + Postgres env vars in
 * repo-root `.env`/`.env.local` — see backend/.env.example):
 *
 *   npx tsx backend/scripts/inc-001-location-inventory.ts
 *
 * Output: prints a JSON summary to stdout. Does not write to any
 * collection/table. Nothing in this script is capable of deleting data.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { Pool } from 'pg';

import { openMongoDatabase, resolveMongoDatabaseName } from '../src/db/mongo-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

/** Known test-account markers — extend if other seed/employee accounts exist. */
const TEST_EMAIL_DOMAIN = '@tditsolutions.dev';
const TEST_EMAILS = new Set([
  'test.customer@tditsolutions.dev',
  'test.admin@tditsolutions.dev',
  'test.security@tditsolutions.dev',
]);

function classify(email: string | null): 'test' | 'real' | 'unresolved' {
  if (!email) return 'unresolved';
  if (TEST_EMAILS.has(email) || email.endsWith(TEST_EMAIL_DOMAIN)) return 'test';
  return 'real';
}

async function main(): Promise<void> {
  const mongoOnly = process.argv.includes('--mongo-only');
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) throw new Error('Missing MONGODB_URI');
  const pgConnString = process.env.DATABASE_URL?.trim() ?? process.env.PG_CONNECTION_STRING?.trim();
  if (!pgConnString && !mongoOnly) {
    throw new Error(
      'Missing Postgres connection string (DATABASE_URL). Re-run with --mongo-only for counts without account classification.',
    );
  }

  const mongoDbNameOverride = process.env.MONGODB_DB_NAME?.trim() || undefined;
  const resolvedDbName = resolveMongoDatabaseName(mongoUri, mongoDbNameOverride);
  const mongo = new MongoClient(mongoUri);
  const pool = pgConnString ? new Pool({ connectionString: pgConnString }) : null;

  // INC-001-C-13: print the resolved database name unconditionally, before any
  // query runs, so a run against the wrong/empty database is never mistaken
  // for a genuine zero. `resolveMongoDatabaseName` mirrors exactly what
  // `openMongoDatabase` will use below (MONGODB_DB_NAME override, else the
  // path segment embedded in MONGODB_URI, else undefined -> driver default).
  // eslint-disable-next-line no-console
  console.error(
    `[inc-001-location-inventory] resolvedDatabaseName=${resolvedDbName ?? '(driver default — no db name in URI or MONGODB_DB_NAME; almost certainly wrong)'}`,
  );

  try {
    await mongo.connect();
    const db = openMongoDatabase(mongo, mongoDbNameOverride);
    // Guard against openMongoDatabase and resolveMongoDatabaseName ever
    // silently disagreeing (e.g. a future refactor of one without the
    // other) — assert what we actually queried matches what we printed.
    if (db.databaseName !== (resolvedDbName ?? db.databaseName)) {
      throw new Error(
        `Resolved database name (${resolvedDbName}) does not match the database actually opened (${db.databaseName}) — refusing to run.`,
      );
    }

    // ---- location_events ----------------------------------------------
    const locationEvents = db.collection('location_events');
    const totalEvents = await locationEvents.estimatedDocumentCount();
    const distinctAccountIds: string[] = await locationEvents.distinct('accountId');
    const distinctAssetIds: string[] = await locationEvents.distinct('assetId');
    const [oldest] = await locationEvents.find().sort({ recordedAt: 1 }).limit(1).toArray();
    const [newest] = await locationEvents.find().sort({ recordedAt: -1 }).limit(1).toArray();

    // ---- assets.lastLocation --------------------------------------------
    const assets = db.collection('assets');
    const assetsWithLocation = await assets
      .find({ lastLocation: { $ne: null } })
      .project({ accountId: 1, lastLocation: 1 })
      .toArray();

    // ---- INC-001-C-13 positive control -----------------------------------
    // Unfiltered counts on sibling collections known to hold data in any
    // populated environment. If these are also zero, the run reached the
    // wrong/empty database and every location-data zero above is VOID.
    const policies = db.collection('policies');
    const recoveryCases = db.collection('recovery_cases');
    const [positiveControlAssetsTotal, positiveControlPoliciesTotal, recoveryCasesTotal] =
      await Promise.all([
        assets.estimatedDocumentCount(),
        policies.estimatedDocumentCount(),
        recoveryCases.estimatedDocumentCount(),
      ]);
    // D-A-9: confirm recovery_cases carries no location data either, now
    // that we're querying it anyway for the positive control.
    const recoveryCasesWithLocation = await recoveryCases
      .find({ $or: [{ lastLocation: { $ne: null } }, { lastLocationAt: { $ne: null } }] })
      .project({ accountId: 1 })
      .toArray();
    const positiveControlPassed = positiveControlAssetsTotal > 0 || positiveControlPoliciesTotal > 0;

    // ---- cross-reference against Postgres accounts ----------------------
    const allAccountIds = Array.from(
      new Set([...distinctAccountIds, ...assetsWithLocation.map((a) => a.accountId as string)]),
    );
    const emailByAccountId = new Map<string, string | null>();
    if (allAccountIds.length > 0 && pool) {
      const { rows } = await pool.query<{ id: string; email: string }>(
        'select id, email from app.accounts where id = any($1::uuid[])',
        [allAccountIds],
      );
      for (const row of rows) emailByAccountId.set(row.id, row.email);
      for (const id of allAccountIds) {
        if (!emailByAccountId.has(id)) emailByAccountId.set(id, null); // no longer resolves
      }
    }

    const eventAccountBreakdown = { test: 0, real: 0, unresolved: 0 };
    if (pool) {
      for (const id of distinctAccountIds) {
        eventAccountBreakdown[classify(emailByAccountId.get(id) ?? null)]++;
      }
    }

    const assetLocationBreakdown = { test: 0, real: 0, unresolved: 0 };
    if (pool) {
      for (const a of assetsWithLocation) {
        assetLocationBreakdown[classify(emailByAccountId.get(a.accountId as string) ?? null)]++;
      }
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      mode: pool ? 'full' : 'mongo-only',
      resolvedDatabaseName: resolvedDbName ?? db.databaseName,
      positiveControl: {
        description:
          'Unfiltered estimatedDocumentCount() on sibling collections known to hold data. ' +
          'If both are 0, this run reached the wrong/empty database and every location-data ' +
          'figure below (locationEvents.* and assetLastLocation.*) is VOID — do not cite as evidence.',
        assetsTotalDocuments: positiveControlAssetsTotal,
        policiesTotalDocuments: positiveControlPoliciesTotal,
        passed: positiveControlPassed,
      },
      runVoid: !positiveControlPassed,
      recoveryCases: {
        // D-A-9
        totalDocuments: recoveryCasesTotal,
        documentsWithNonNullLastLocation: recoveryCasesWithLocation.length,
      },
      locationEvents: {
        totalDocuments: totalEvents,
        distinctAccountCount: distinctAccountIds.length,
        distinctAssetCount: distinctAssetIds.length,
        dateRange: {
          earliestRecordedAt: oldest?.recordedAt ?? null,
          latestRecordedAt: newest?.recordedAt ?? null,
        },
        accountBreakdown: eventAccountBreakdown,
      },
      assetLastLocation: {
        assetsWithNonNullLastLocation: assetsWithLocation.length,
        accountBreakdown: assetLocationBreakdown,
      },
      note:
        (positiveControlPassed
          ? ''
          : 'RUN VOID — positive control (assets/policies) returned zero. The database queried ' +
            '(see resolvedDatabaseName) is empty or wrong; the location-data zeros above are ' +
            'NOT evidence of anything and must not be cited. Fix MONGODB_URI/MONGODB_DB_NAME and re-run. ') +
        (pool
          ? 'Read-only. No documents were modified or deleted by this script. '
          : 'Read-only mongo-only mode — account test/real breakdown omitted (set DATABASE_URL for full run). ') +
        '"unresolved" accountIds are ones with no matching row in app.accounts ' +
        '(deleted account, or malformed/test data) — treat as needing manual review, not as "real".',
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));
    if (!positiveControlPassed) {
      // eslint-disable-next-line no-console
      console.error(
        '[inc-001-location-inventory] POSITIVE CONTROL FAILED — assets and policies both empty ' +
          `in database "${resolvedDbName ?? db.databaseName}". This run is VOID. Do not treat the ` +
          'location-event zeros above as a real finding.',
      );
    }
  } finally {
    await mongo.close();
    if (pool) await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[inc-001-location-inventory] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
