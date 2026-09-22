/**
 * `location_consent_events` collection bootstrap — INC-002 §13.2 handoff
 * (`docs/organization/incidents/INC-002-play-internal-location-reenablement.md`
 * §13.2, filed by `backend-engineer`, 2026-09-22).
 *
 * Declares the spec that `backend/src/repositories/location-consent-log.ts`
 * writes/reads against (`LocationConsentEventDocument`), following the same
 * pattern as every other `*-collections.ts` module wired into
 * `mongo-bootstrap.ts` (`location-events-collections.ts` is the closest
 * sibling — same `accountId`/`assetId` shape).
 *
 * This collection is the server-side POPIA s18 consent-grant/withdrawal
 * evidentiary record (see `location-consent-log.ts` header for the full
 * provenance). It deliberately holds PII (`ipAddress`, `userAgent`) beyond
 * what a purely operational log would need, because that PII *is* the
 * evidentiary content — who requested the consent action, from where.
 *
 * RETENTION: not decided by this module. See `LOCATION_CONSENT_EVENTS_TTL_SECONDS`
 * below — `compliance-specialist`'s call per INC-002 §11.2/§13.2, not
 * `database-architect`'s to invent. Do not treat the placeholder value as a
 * decision; it exists only so the TTL index has a value to compile against.
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const LOCATION_CONSENT_EVENTS_COLLECTION = 'location_consent_events';

/**
 * TODO(compliance-specialist): retention period pending — see INC-002 §13.2.
 *
 * `backend-engineer`'s recommendation at INC-002 §11.2 is to retain for "the
 * prescription window applicable to a POPIA complaint, stated explicitly" —
 * that is a statutory-prescription-period lookup, which is
 * `compliance-specialist`'s determination, not an engineering default.
 *
 * The value below is a CONSERVATIVE PLACEHOLDER ONLY, set purely so this
 * file and the TTL index it declares compile and can be bootstrapped without
 * silently defaulting to "indefinite" (the exact s14 failure mode INC-001
 * §4.3 already found once — see INC-002 §13.2's explicit warning against
 * inventing a number here). It is deliberately set long (10 years) so that,
 * if this placeholder is accidentally left in place, the failure mode is
 * "retained too long" (a compliance review finding) rather than "evidence
 * silently deleted before a complaint's prescription period runs" (a
 * potential POPIA s14/evidentiary failure). Do not cite this number as a
 * decision in any compliance artefact — it is not one.
 */
export const LOCATION_CONSENT_EVENTS_TTL_SECONDS_PLACEHOLDER = 10 * 365 * 24 * 60 * 60; // 10 years — PLACEHOLDER, see TODO above

export const locationConsentEventsJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['accountId', 'assetId', 'eventType', 'purgedEventCount', 'createdAt'],
    properties: {
      accountId: { bsonType: 'string' },
      assetId: { bsonType: 'string' },
      eventType: { enum: ['granted', 'withdrawn'] },
      purgedEventCount: { bsonType: ['int', 'long', 'double', 'null'] },
      actorSessionId: { bsonType: ['string', 'null'] },
      ipAddress: { bsonType: ['string', 'null'] },
      userAgent: { bsonType: ['string', 'null'] },
      createdAt: { bsonType: 'date' },
    },
  },
};

/**
 * Non-TTL query indexes, matching `listByAsset()`'s query shape in
 * `location-consent-log.ts` (`{ accountId, assetId }`, sorted `createdAt: -1`).
 */
export const locationConsentEventsIndexes: IndexDescription[] = [
  {
    key: { accountId: 1, assetId: 1, createdAt: -1 },
    name: 'location_consent_events_account_asset_created',
  },
];

/**
 * TTL index on `createdAt`. `expireAfterSeconds` is the placeholder constant
 * above — see its doc comment. This index is declared here so the
 * bootstrap/catalog-verify machinery has a single source of truth once the
 * real retention period is set; changing the number is a one-line edit here
 * (plus, per ADR-0008 Decision item 4, an explicit migration script if the
 * change needs to *tighten* an already-live TTL rather than widen it).
 */
export const locationConsentEventsTtlIndex: IndexDescription = {
  key: { createdAt: 1 },
  name: 'location_consent_events_created_ttl',
  expireAfterSeconds: LOCATION_CONSENT_EVENTS_TTL_SECONDS_PLACEHOLDER,
};

export async function bootstrapLocationConsentCollections(db: Db): Promise<{
  collectionsEnsured: string[];
}> {
  const collectionsEnsured: string[] = [];
  const existing = await db
    .listCollections({ name: LOCATION_CONSENT_EVENTS_COLLECTION })
    .toArray();

  if (existing.length === 0) {
    await db.createCollection(LOCATION_CONSENT_EVENTS_COLLECTION, {
      validator: locationConsentEventsJsonSchemaValidator,
    });
    collectionsEnsured.push(LOCATION_CONSENT_EVENTS_COLLECTION);
  }

  await db
    .collection(LOCATION_CONSENT_EVENTS_COLLECTION)
    .createIndexes([...locationConsentEventsIndexes, locationConsentEventsTtlIndex]);

  return { collectionsEnsured };
}
