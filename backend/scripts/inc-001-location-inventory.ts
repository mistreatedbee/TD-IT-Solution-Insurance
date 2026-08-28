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
  const mongoUri = process.env.MONGODB_URI?.trim();
  if (!mongoUri) throw new Error('Missing MONGODB_URI');
  const pgConnString = process.env.DATABASE_URL?.trim() ?? process.env.PG_CONNECTION_STRING?.trim();
  if (!pgConnString) throw new Error('Missing Postgres connection string (DATABASE_URL)');

  const mongo = new MongoClient(mongoUri);
  const pool = new Pool({ connectionString: pgConnString });

  try {
    await mongo.connect();
    const db = mongo.db();

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

    // ---- cross-reference against Postgres accounts ----------------------
    const allAccountIds = Array.from(
      new Set([...distinctAccountIds, ...assetsWithLocation.map((a) => a.accountId as string)]),
    );
    const emailByAccountId = new Map<string, string | null>();
    if (allAccountIds.length > 0) {
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
    for (const id of distinctAccountIds) {
      eventAccountBreakdown[classify(emailByAccountId.get(id) ?? null)]++;
    }

    const assetLocationBreakdown = { test: 0, real: 0, unresolved: 0 };
    for (const a of assetsWithLocation) {
      assetLocationBreakdown[classify(emailByAccountId.get(a.accountId as string) ?? null)]++;
    }

    const summary = {
      generatedAt: new Date().toISOString(),
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
        'Read-only. No documents were modified or deleted by this script. ' +
        '"unresolved" accountIds are ones with no matching row in app.accounts ' +
        '(deleted account, or malformed/test data) — treat as needing manual review, not as "real".',
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongo.close();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[inc-001-location-inventory] Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
