/**
 * `claims` collection — Feature 018 (claims filing and adjudication).
 *
 * SR-018-5 (security-review.md) — the "one open claim per asset" rule
 * (business-requirements.md §1.5) was enforced only as an application-layer
 * check-then-insert (`repositories/claims.ts`'s `findNonTerminalByAssetForAccount`
 * followed by `createForAccount`), with no database-level constraint. Two
 * concurrent `POST /v1/claims` requests for the same asset could both pass
 * the pre-insert check before either insert landed, producing two open
 * claims. This partial unique index closes that window: the database itself
 * rejects the second concurrent insert, and `createForAccount` translates
 * the resulting duplicate-key error into the same `DUPLICATE_OPEN_CLAIM`
 * response the pre-insert check already returns (see `DuplicateOpenClaimError`
 * in `repositories/claims.ts`).
 *
 * No `$jsonSchema` validator is added here — unlike `recovery-collections.ts`,
 * the `claims` collection predates this file (created implicitly by
 * `repositories/claims.ts`'s first `insertOne`) and already has data/tests
 * written against it without one; adding strict validation retroactively is
 * out of scope for this fix and is a separate, larger change if ever wanted.
 */
import { type Db, type IndexDescription } from 'mongodb';
import { NON_TERMINAL_CLAIM_STATUSES } from '../lib/claim-rules.js';

export const CLAIMS_COLLECTION = 'claims';

export const claimsIndexes: IndexDescription[] = [
  { key: { accountId: 1, createdAt: -1 }, name: 'accountId_1_createdAt_-1' },
  { key: { status: 1, createdAt: -1 }, name: 'status_1_createdAt_-1' },
  // SR-018-5 — the database-level backstop for §1.5. Partial: only one
  // non-terminal claim can exist per asset at a time; terminal claims
  // (`rejected`/`closed`/`awaiting_payout`) and any number of them never
  // collide with each other or with a later new claim on the same asset.
  {
    key: { assetId: 1 },
    unique: true,
    name: 'claims_one_open_claim_per_asset',
    partialFilterExpression: { status: { $in: [...NON_TERMINAL_CLAIM_STATUSES] } },
  },
];

export async function bootstrapClaimsCollections(db: Db): Promise<{ collection: string; indexes: string[] }> {
  const indexResults = await db.collection(CLAIMS_COLLECTION).createIndexes(claimsIndexes);
  return { collection: CLAIMS_COLLECTION, indexes: indexResults };
}
