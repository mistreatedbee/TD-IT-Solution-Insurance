/**
 * MongoDB connection singleton.
 *
 * Per the MongoDB Node.js driver's recommended practice, a single
 * `MongoClient` instance should be created once and reused for the lifetime
 * of the process (the driver maintains its own internal connection pool) —
 * never instantiated per-request. This module exposes connect/get/close
 * functions around exactly one shared client instance.
 *
 * System of record for: policies, assets, GPS/location history, claims —
 * per ADR-0001 and ADR-0002. Identity/account/session data is NOT stored
 * here (see src/db/supabase.ts and ADR-0002).
 */
import { MongoClient, type Db } from 'mongodb';

let client: MongoClient | undefined;
let db: Db | undefined;

export async function connectMongo(uri: string): Promise<Db> {
  if (db) {
    return db;
  }

  client = new MongoClient(uri, {
    // Fail fast rather than hanging indefinitely if Atlas is unreachable.
    serverSelectionTimeoutMS: 10_000,
  });

  await client.connect();
  // Verify connectivity eagerly so startup fails loudly on bad credentials/network.
  await client.db().command({ ping: 1 });

  db = client.db();
  return db;
}

export function getDb(): Db {
  if (!db) {
    throw new Error(
      '[db/mongodb] getDb() called before connectMongo() completed. ' +
        'Ensure the server startup sequence awaits connectMongo() first.',
    );
  }
  return db;
}

export async function pingMongo(): Promise<boolean> {
  if (!client) {
    return false;
  }
  try {
    await client.db().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = undefined;
    db = undefined;
  }
}
