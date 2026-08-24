#!/usr/bin/env node
/**
 * MongoDB catalog verification (Atlas / local) — ADR-0008 condition 3.
 *
 * Read-only. Connects to MONGODB_URI, lists the live collections/indexes/
 * validators, and diffs them against the seven collection-spec modules
 * wired into `src/db/mongo-bootstrap.ts` (see `src/db/catalog-verify.ts`
 * for the diff logic — this script is a thin CLI wrapper around the same
 * function `index.ts` calls at server startup, not a second implementation).
 *
 * Never creates, alters, or drops anything — for that, see
 * `backend/scripts/bootstrap-mongo-collections.ts`.
 *
 * Run from repo root (requires MONGODB_URI in repo-root `.env`):
 *
 *   npx tsx backend/scripts/verify-mongo-catalog.ts
 *
 * Exit code 0 = catalog matches declared spec (verified).
 * Exit code 1 = drift found, or the check itself could not run.
 * Intended as a CI/manual-invocation companion to the startup check in
 * `src/index.ts`, and to Render's `[mongo-catalog-verify]` startup logs.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

import { verifyMongoCatalog, formatCatalogReport } from '../src/db/catalog-verify.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(repoRoot, '.env.local'), override: true });

function requireMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error(
      '[verify-mongo-catalog] Missing MONGODB_URI. Set it in the repo-root .env before running.',
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
    // eslint-disable-next-line no-console
    console.log(`[verify-mongo-catalog] Connected to database "${db.databaseName}".`);

    const report = await verifyMongoCatalog(db);
    // eslint-disable-next-line no-console
    console.log(formatCatalogReport(report));

    if (!report.ok) {
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error('[verify-mongo-catalog] Failed:', message);
  process.exitCode = 1;
});
