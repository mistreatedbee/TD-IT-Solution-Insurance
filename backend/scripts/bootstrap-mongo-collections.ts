#!/usr/bin/env node
/**
 * Feature 004 — MongoDB collection bootstrap (Atlas / local).
 *
 * Idempotently creates policies, policy_status_history, and assets collections;
 * applies the assets $jsonSchema validator (polymorphic details); and ensures
 * secondary indexes from database-design.md §5.
 *
 * admin_access_log is intentionally omitted — customer path does not require
 * it yet (see database-addendum-001.md; bootstrap when admin routes ship).
 *
 * Run from repo root (requires MONGODB_URI in repo-root .env.local):
 *
 *   npx tsx backend/scripts/bootstrap-mongo-collections.ts
 *
 * Source: docs/features/004-policy-asset-management/database-design.md
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

import { bootstrapFeature004Collections } from '../src/db/feature004-collections.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRootEnvPath = path.resolve(__dirname, '../../.env.local');

dotenv.config({ path: repoRootEnvPath });

function requireMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error(
      '[bootstrap-mongo] Missing MONGODB_URI. Set it in the repo-root .env.local before running.',
    );
  }
  return uri;
}

async function main(): Promise<void> {
  const uri = requireMongoUri();
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });

  try {
    await client.connect();
    await client.db().command({ ping: 1 });

    const db = client.db();
    const dbName = db.databaseName;

    // eslint-disable-next-line no-console
    console.log(`[bootstrap-mongo] Connected to database "${dbName}".`);

    const result = await bootstrapFeature004Collections(db);

    // eslint-disable-next-line no-console
    console.log('[bootstrap-mongo] Collections created this run:', result.collectionsEnsured.length
      ? result.collectionsEnsured.join(', ')
      : '(none — already existed)');

    // eslint-disable-next-line no-console
    console.log('[bootstrap-mongo] Validator applied/updated on:', result.validatorApplied.join(', '));

    // eslint-disable-next-line no-console
    console.log('[bootstrap-mongo] Indexes ensured:');
    for (const idx of result.indexesEnsured) {
      // eslint-disable-next-line no-console
      console.log(`  - ${idx.collection}.${idx.name}`);
    }

    // eslint-disable-next-line no-console
    console.log('[bootstrap-mongo] Done.');
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error('[bootstrap-mongo] Failed:', message);
  process.exitCode = 1;
});
