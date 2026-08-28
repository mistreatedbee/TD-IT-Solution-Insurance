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

import { openMongoDatabase } from './mongo-connection.js';

let client: MongoClient | undefined;
let db: Db | undefined;
let connectedDatabaseName: string | undefined;

export async function connectMongo(uri: string, dbName?: string): Promise<Db> {
  if (db) {
    return db;
  }

  client = new MongoClient(uri, {
    // Fail fast rather than hanging indefinitely if Atlas is unreachable.
    serverSelectionTimeoutMS: 10_000,
  });

  await client.connect();
  db = openMongoDatabase(client, dbName);
  connectedDatabaseName = db.databaseName;
  // Verify connectivity eagerly so startup fails loudly on bad credentials/network.
  await db.command({ ping: 1 });

  return db;
}

export function getConnectedMongoDatabaseName(): string | undefined {
  return connectedDatabaseName;
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
  if (!db) {
    return false;
  }
  try {
    await db.command({ ping: 1 });
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
    connectedDatabaseName = undefined;
  }
}
