/**
 * Phase 2 — recovery_cases MongoDB collection bootstrap.
 * Minimal schema for theft-report → security-partner handoff (mobile + Security Dashboard).
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const RECOVERY_COLLECTIONS = {
  recoveryCases: 'recovery_cases',
} as const;

export const recoveryCasesJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'accountId',
      'assetId',
      'status',
      'referenceNumber',
      'reportedAt',
      'legalHold',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      accountId: { bsonType: 'string' },
      assetId: { bsonType: 'string' },
      partnerOrganizationId: { bsonType: ['string', 'null'] },
      status: {
        enum: ['open', 'investigating', 'tracking', 'recovered', 'closed'],
      },
      referenceNumber: { bsonType: 'string', minLength: 8, maxLength: 32 },
      reportedAt: { bsonType: 'date' },
      notes: { bsonType: ['string', 'null'] },
      callCentreNotes: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['agentAccountId', 'text', 'createdAt'],
          properties: {
            agentAccountId: { bsonType: 'string' },
            text: { bsonType: 'string', maxLength: 2000 },
            createdAt: { bsonType: 'date' },
          },
        },
      },
      lastLocationAt: { bsonType: ['date', 'null'] },
      lastLocation: {
        bsonType: ['object', 'null'],
        properties: {
          latitude: { bsonType: 'double' },
          longitude: { bsonType: 'double' },
          recordedAt: { bsonType: 'date' },
          accuracyMeters: { bsonType: ['double', 'null'] },
        },
      },
      legalHold: { bsonType: 'bool' },
      // Feature 011 (database-design.md §5.2) — set once, when `status` transitions to
      // `'closed'` (see `updateStatusForPartnerOrg`). Drives the police-report retention
      // clock. `updatedAt` is NOT a safe substitute (editing police-report fields would
      // otherwise reset the clock — database-design.md §5.2 explains why).
      closedAt: { bsonType: ['date', 'null'] },
      // Feature 011 (SAPS case-number capture) — docs/features/011-saps-case-reporting/.
      // Customer-only fields (C-011-9 / SR-011-1/-1a): the partner/security-company read
      // paths in repositories/recovery-cases.ts project these OUT of the query — never
      // add them to serializeSecurityRecoveryCase or any partner/support-agent response.
      sapsCaseNumber: { bsonType: ['string', 'null'], minLength: 3, maxLength: 50 },
      reportingStation: { bsonType: ['string', 'null'], minLength: 1, maxLength: 200 },
      reportedToPoliceAt: { bsonType: ['date', 'null'] },
      policeReportHistory: {
        bsonType: 'array',
        // SR-011-3: bounded to prevent unbounded customer-controlled growth on a
        // document every partner-dashboard page load fetches.
        maxItems: 50,
        items: {
          bsonType: 'object',
          required: ['actorAccountId', 'field', 'previousValue', 'newValue', 'changedAt'],
          properties: {
            actorAccountId: { bsonType: 'string' },
            field: { enum: ['sapsCaseNumber', 'reportingStation', 'reportedToPoliceAt'] },
            previousValue: { bsonType: ['string', 'null'] },
            newValue: { bsonType: ['string', 'null'] },
            changedAt: { bsonType: 'date' },
          },
        },
      },
      policeReportReminderSentAt: { bsonType: ['date', 'null'] },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

export const recoveryCaseIndexes: IndexDescription[] = [
  { key: { accountId: 1, createdAt: -1 } },
  { key: { partnerOrganizationId: 1, status: 1, createdAt: -1 } },
  { key: { referenceNumber: 1 }, unique: true },
  { key: { assetId: 1, status: 1 } },
  // Feature 011 (database-design.md §4) — supports the (not-yet-scheduled) police-report
  // retention-expiry job: find closed cases past the retention floor that still have at
  // least one police-report field set. Partial so it costs nothing on the (currently:
  // all) documents that never had these fields populated.
  {
    key: { status: 1, closedAt: 1 },
    name: 'recovery_cases_closed_at_retention',
    partialFilterExpression: {
      $or: [
        { sapsCaseNumber: { $ne: null } },
        { reportingStation: { $ne: null } },
        { reportedToPoliceAt: { $ne: null } },
      ],
    },
  },
];

export async function bootstrapRecoveryCollections(db: Db): Promise<{
  collection: string;
  created: boolean;
  indexes: string[];
}> {
  const name = RECOVERY_COLLECTIONS.recoveryCases;
  const collections = await db.listCollections({ name }).toArray();
  let created = false;
  if (collections.length === 0) {
    await db.createCollection(name, {
      validator: recoveryCasesJsonSchemaValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    created = true;
  } else {
    await db.command({
      collMod: name,
      validator: recoveryCasesJsonSchemaValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }
  const indexResults = await db.collection(name).createIndexes(recoveryCaseIndexes);
  return {
    collection: name,
    created,
    indexes: indexResults,
  };
}
