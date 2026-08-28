import { MongoClient, type Db } from 'mongodb';

/**
 * Resolve the MongoDB database name for this process.
 *
 * `MONGODB_DB_NAME` overrides the database embedded in `MONGODB_URI`, enabling
 * separate staging data on the same Atlas cluster (MP-8 / sprint 2.3) without
 * a second connection string.
 */
export function resolveMongoDatabaseName(uri: string, override?: string): string | undefined {
  const trimmed = override?.trim();
  if (trimmed) return trimmed;

  try {
    const parsed = new URL(uri);
    const path = parsed.pathname.replace(/^\//, '').split('/')[0]?.trim();
    return path || undefined;
  } catch {
    return undefined;
  }
}

export function openMongoDatabase(client: MongoClient, dbName?: string): Db {
  return dbName ? client.db(dbName) : client.db();
}
