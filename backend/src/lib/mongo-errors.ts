/**
 * Feature 004 / P-12 — MongoDB connectivity failure classification.
 *
 * When Atlas is unreachable (network partition, credential failure, cluster
 * down), route handlers must return `503 UPSTREAM_UNAVAILABLE` with the fixed
 * catalogue message — not a raw driver string and not a generic 500. Analogous
 * in spirit to Feature 001's Supabase-outage contract (api-design.md §7).
 */
import { MongoNetworkError, MongoServerSelectionError } from 'mongodb';

export class MongoUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`[db/mongodb] MongoDB operation failed: ${String(cause)}`);
    this.name = 'MongoUnavailableError';
  }
}

/** True when the driver error indicates connectivity/selection failure, not a business rule. */
export function isMongoConnectivityError(err: unknown): boolean {
  if (err instanceof MongoUnavailableError) return true;
  if (err instanceof MongoNetworkError) return true;
  if (err instanceof MongoServerSelectionError) return true;
  return false;
}
