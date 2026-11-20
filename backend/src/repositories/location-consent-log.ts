/**
 * `location_consent_events` writes — INC-002 §9.6 C-5 / INC-001-C-8-adjacent
 * remediation. This is the server-side POPIA s18 withdrawal record: the
 * missing artefact both incidents identified — `LocationConsentModal.tsx`
 * tells a customer "you can turn this off anytime" but, until this route,
 * nothing recorded (or acted on) that withdrawal server-side.
 *
 * Deliberately its own Mongo collection rather than Postgres
 * `app.account_audit_log` (repositories/audit-log.ts), following the same
 * reasoning `repositories/push-token-security-log.ts` already documents for
 * this codebase: `app.account_audit_log`'s `event_type` is a fixed Postgres
 * enum (`app.audit_event_type`, migrations/030+) gated behind a schema
 * migration, and consent/location data is domain data (ADR-0002 polyglot
 * split) that already lives in Mongo alongside `assets` and
 * `location_events`. Deferred, same as that precedent: full ADR-0006 Trail
 * A/B integration once this event type earns a migration slot.
 */
import { ObjectId, type Db, type Collection } from 'mongodb';

export type LocationConsentEventType = 'granted' | 'withdrawn';

/**
 * INC-001 A-7 / ADR-0009 SDL-4. What a grant covers. `background` is never implied by the
 * others: it must be in the grant's own list (the background trigger is refused otherwise).
 */
export const LOCATION_CONSENT_SCOPES = ['foreground', 'periodic', 'background'] as const;
export type LocationConsentScope = (typeof LOCATION_CONSENT_SCOPES)[number];

export interface LocationConsentEventDocument {
  id: string;
  accountId: string;
  assetId: string;
  eventType: LocationConsentEventType;
  /** Count of `location_events` rows purged as part of this withdrawal —
   * always recorded (including zero) for `'withdrawn'` events, so the record
   * is self-describing even without cross-referencing the (now-deleted)
   * history it purged. Not applicable to `'granted'` events — `null` there. */
  purgedEventCount: number | null;
  actorSessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  /** INC-001 A-7: the session's bound device (SDL-10). `null` on rows written before A-7. */
  deviceId: string | null;
  /** Consent-copy version the client showed. `null` on pre-A-7 rows / old clients. */
  consentTextVersion: string | null;
  /** Scopes granted (grants only; `[]` on withdrawals and pre-A-7 rows). */
  scopes: LocationConsentScope[];
  createdAt: Date;
}

interface LocationConsentEventDbRow {
  _id: ObjectId;
  accountId: string;
  assetId: string;
  eventType: LocationConsentEventType;
  purgedEventCount: number | null;
  actorSessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceId?: string | null;
  consentTextVersion?: string | null;
  scopes?: LocationConsentScope[];
  createdAt: Date;
}

function toDocument(row: LocationConsentEventDbRow): LocationConsentEventDocument {
  return {
    id: row._id.toHexString(),
    accountId: row.accountId,
    assetId: row.assetId,
    eventType: row.eventType,
    purgedEventCount: row.purgedEventCount,
    actorSessionId: row.actorSessionId,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    deviceId: row.deviceId ?? null,
    consentTextVersion: row.consentTextVersion ?? null,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    createdAt: row.createdAt,
  };
}

export interface RecordLocationConsentWithdrawalInput {
  accountId: string;
  assetId: string;
  purgedEventCount: number;
  actorSessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
}

export interface RecordLocationConsentGrantInput {
  accountId: string;
  assetId: string;
  actorSessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
  consentTextVersion?: string | null;
  scopes?: LocationConsentScope[];
}

export function createLocationConsentLogRepo(db: Db) {
  const collection = (): Collection<LocationConsentEventDbRow> =>
    db.collection<LocationConsentEventDbRow>('location_consent_events');

  return {
    /** W1 (INC-002 §11) — server-side proof that consent was given, closing
     * the INC-001 §4.2(c) gap the withdrawal-only collection left open.
     * Recorded on every call, including a repeat grant while already
     * granted: same reasoning as `recordWithdrawal` — the *request* is
     * itself the s18-adjacent consent artefact, so each call gets its own
     * timestamped record rather than upserting over a prior one. */
    async recordGrant(input: RecordLocationConsentGrantInput): Promise<LocationConsentEventDocument> {
      const now = new Date();
      const doc: Omit<LocationConsentEventDbRow, '_id'> = {
        accountId: input.accountId,
        assetId: input.assetId,
        eventType: 'granted',
        purgedEventCount: null,
        actorSessionId: input.actorSessionId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        deviceId: input.deviceId ?? null,
        consentTextVersion: input.consentTextVersion ?? null,
        scopes: [...new Set(input.scopes ?? [])],
        createdAt: now,
      };
      const result = await collection().insertOne(doc as LocationConsentEventDbRow);
      return toDocument({ _id: result.insertedId, ...doc });
    },

    /** Recorded on every call to the withdrawal endpoint, including a
     * no-op/idempotent re-call — the *request* to withdraw is itself the s18
     * artefact, whether or not there was anything left to clear. */
    async recordWithdrawal(input: RecordLocationConsentWithdrawalInput): Promise<LocationConsentEventDocument> {
      const now = new Date();
      const doc: Omit<LocationConsentEventDbRow, '_id'> = {
        accountId: input.accountId,
        assetId: input.assetId,
        eventType: 'withdrawn',
        purgedEventCount: input.purgedEventCount,
        actorSessionId: input.actorSessionId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        deviceId: input.deviceId ?? null,
        consentTextVersion: null,
        scopes: [],
        createdAt: now,
      };
      const result = await collection().insertOne(doc as LocationConsentEventDbRow);
      return toDocument({ _id: result.insertedId, ...doc });
    },

    /**
     * INC-001 A-7: the current consent state for (account, asset) is its newest event —
     * the collection stays append-only; a withdrawal or a newer grant (other device,
     * other scopes) supersedes older grants. Served by
     * `location_consent_events_account_asset_created`. Ties on `createdAt` break on `_id`.
     */
    async findLatestByAsset(accountId: string, assetId: string): Promise<LocationConsentEventDocument | null> {
      const row = await collection().findOne({ accountId, assetId }, { sort: { createdAt: -1, _id: -1 } });
      return row ? toDocument(row) : null;
    },

    async listByAsset(accountId: string, assetId: string): Promise<LocationConsentEventDocument[]> {
      const rows = await collection()
        .find({ accountId, assetId })
        .sort({ createdAt: -1 })
        .toArray();
      return rows.map(toDocument);
    },
  };
}

export type LocationConsentLogRepo = ReturnType<typeof createLocationConsentLogRepo>;
