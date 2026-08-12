/**
 * Feature 004 — MongoDB collection names, validators, and index specs.
 *
 * Source of truth:
 * - docs/features/004-policy-asset-management/database-design.md
 *   (§3 policies/assets/policy_status_history, §5 indexes)
 * - docs/features/004-policy-asset-management/database-addendum-001.md
 *   (§1–§2 admin_access_log — Amendment A1 / ADR-0006 R-1)
 *
 * Consumed by backend/scripts/bootstrap-mongo-collections.ts and intended for
 * backend-engineer repositories/routes implementing Policy & Asset Service.
 */
import {
  type Db,
  type Document,
  type IndexDescription,
  type CreateCollectionOptions,
} from 'mongodb';

export const FEATURE004_COLLECTIONS = {
  policies: 'policies',
  policyStatusHistory: 'policy_status_history',
  assets: 'assets',
  adminAccessLog: 'admin_access_log',
} as const;

/** §3.3 — full polymorphic assets validator (all eight assetType branches). */
export const assetsJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'accountId',
      'assetType',
      'displayName',
      'status',
      'registeredAt',
      'details',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      accountId: {
        bsonType: 'string',
        description:
          'Soft reference to Supabase app.accounts.id (UUID string). Not FK-enforced at the database layer.',
      },
      assetType: {
        enum: [
          'vehicle',
          'laptop',
          'smartphone',
          'tablet',
          'tv',
          'desktop',
          'business_equipment',
          'other_electronics',
        ],
      },
      displayName: { bsonType: 'string', minLength: 1, maxLength: 120 },
      status: { enum: ['active', 'inactive', 'removed'] },
      registeredAt: { bsonType: 'date' },
      estimatedValue: {
        bsonType: ['object', 'null'],
        properties: {
          amount: { bsonType: 'number', minimum: 0 },
          currency: { bsonType: 'string', minLength: 3, maxLength: 3 },
          asOf: { bsonType: 'date' },
        },
      },
      photos: { bsonType: 'array', items: { bsonType: 'string' } },
      gpsDeviceId: { bsonType: ['string', 'null'] },
      gpsPairedAt: { bsonType: ['date', 'null'] },
      legalHold: { bsonType: 'bool' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
      details: { bsonType: 'object' },
    },
    oneOf: [
      {
        properties: {
          assetType: { enum: ['vehicle'] },
          details: {
            bsonType: 'object',
            required: ['make', 'model', 'year', 'vin'],
            properties: {
              make: { bsonType: 'string' },
              model: { bsonType: 'string' },
              year: { bsonType: 'int' },
              vin: { bsonType: 'string' },
              licensePlate: { bsonType: ['string', 'null'] },
              color: { bsonType: ['string', 'null'] },
              mileage: { bsonType: ['int', 'null'] },
            },
            additionalProperties: false,
          },
        },
      },
      {
        properties: {
          assetType: { enum: ['laptop'] },
          details: {
            bsonType: 'object',
            required: ['brand', 'model', 'serialNumber'],
            properties: {
              brand: { bsonType: 'string' },
              model: { bsonType: 'string' },
              serialNumber: { bsonType: 'string' },
              operatingSystem: { bsonType: ['string', 'null'] },
            },
            additionalProperties: false,
          },
        },
      },
      {
        properties: {
          assetType: { enum: ['smartphone'] },
          details: {
            bsonType: 'object',
            required: ['brand', 'model', 'imei'],
            properties: {
              brand: { bsonType: 'string' },
              model: { bsonType: 'string' },
              imei: { bsonType: 'string' },
              serialNumber: { bsonType: ['string', 'null'] },
            },
            additionalProperties: false,
          },
        },
      },
      {
        properties: {
          assetType: { enum: ['tablet'] },
          details: {
            bsonType: 'object',
            required: ['brand', 'model', 'serialNumber'],
            properties: {
              brand: { bsonType: 'string' },
              model: { bsonType: 'string' },
              serialNumber: { bsonType: 'string' },
              imei: { bsonType: ['string', 'null'] },
            },
            additionalProperties: false,
          },
        },
      },
      {
        properties: {
          assetType: { enum: ['tv'] },
          details: {
            bsonType: 'object',
            required: ['brand', 'model', 'serialNumber'],
            properties: {
              brand: { bsonType: 'string' },
              model: { bsonType: 'string' },
              serialNumber: { bsonType: 'string' },
              screenSizeInches: { bsonType: ['number', 'null'] },
            },
            additionalProperties: false,
          },
        },
      },
      {
        properties: {
          assetType: { enum: ['desktop'] },
          details: {
            bsonType: 'object',
            required: ['brand', 'model', 'serialNumber'],
            properties: {
              brand: { bsonType: 'string' },
              model: { bsonType: 'string' },
              serialNumber: { bsonType: 'string' },
              components: { bsonType: ['string', 'null'] },
            },
            additionalProperties: false,
          },
        },
      },
      {
        properties: {
          assetType: { enum: ['business_equipment'] },
          details: {
            bsonType: 'object',
            required: ['category', 'brand', 'model', 'serialNumber'],
            properties: {
              category: { bsonType: 'string' },
              brand: { bsonType: 'string' },
              model: { bsonType: 'string' },
              serialNumber: { bsonType: 'string' },
              description: { bsonType: ['string', 'null'] },
            },
            additionalProperties: false,
          },
        },
      },
      {
        properties: {
          assetType: { enum: ['other_electronics'] },
          details: {
            bsonType: 'object',
            required: ['category', 'brand', 'model', 'serialNumber'],
            properties: {
              category: { bsonType: 'string' },
              brand: { bsonType: 'string' },
              model: { bsonType: 'string' },
              serialNumber: { bsonType: 'string' },
              description: { bsonType: ['string', 'null'] },
            },
            additionalProperties: false,
          },
        },
      },
    ],
  },
};

/** database-addendum-001.md §1.3 — admin privileged-read audit trail (ADR-0006 R-1). */
const adminAccessLogJsonSchemaBase: Document = {
  bsonType: 'object',
  required: [
    'eventType',
    'actorAccountId',
    'actorSessionId',
    'resourceType',
    'endpoint',
    'legalHold',
    'createdAt',
  ],
  properties: {
    eventType: {
      enum: ['privileged_data_access', 'privileged_bulk_access'],
      description:
        'Row-type discriminator. Same two values as app.audit_event_type after migrations/032.',
    },
    actorAccountId: {
      bsonType: 'string',
      description:
        'Soft reference to Supabase app.accounts.id (UUID string) — the admin who performed the read. Never null: every entry in this collection exists because an authenticated admin request was made.',
    },
    actorSessionId: {
      bsonType: 'string',
      description:
        'AUD-1. Soft reference to Supabase app.sessions.id — sitting element of the join key. Required; no FK (referent routinely ages out).',
    },
    auditRequestId: {
      bsonType: ['string', 'null'],
      description:
        'AUD-5. Server-generated only (req.auditRequestId). Not the cross-store join key. Best-effort within-call grouping.',
    },
    targetAccountId: {
      bsonType: ['string', 'null'],
      description:
        'Soft reference to Supabase app.accounts.id. Non-null on privileged_data_access; null on privileged_bulk_access (enforced below).',
    },
    resourceType: { enum: ['policy', 'asset'] },
    resourceId: {
      bsonType: ['objectId', 'null'],
      description:
        'References policies._id or assets._id per resourceType. Null for list-level / call-scoped rows.',
    },
    resultCount: {
      bsonType: ['int', 'long', 'null'],
      minimum: 0,
      description:
        'R-1. Set on privileged_bulk_access only (including 0); null on every privileged_data_access row.',
    },
    endpoint: {
      bsonType: 'string',
      minLength: 1,
      description:
        'Method + path TEMPLATE only (e.g. GET /v1/admin/policies). Never req.originalUrl — C-17.',
    },
    ipAddress: {
      bsonType: ['string', 'null'],
      description:
        'AUD-12: behavioural PII about an internal user; retention-bounded; not field-encrypted.',
    },
    userAgent: {
      bsonType: ['string', 'null'],
      description: 'AUD-12: same class as ipAddress.',
    },
    legalHold: { bsonType: 'bool' },
    createdAt: { bsonType: 'date' },
  },
};

/**
 * Full collection validator. MongoDB $jsonSchema does not support JSON Schema
 * `if`/`then` — R-1 row-type invariants use $expr (aggregation syntax) instead.
 */
export const adminAccessLogJsonSchemaValidator: Document = {
  $and: [
    { $jsonSchema: adminAccessLogJsonSchemaBase },
    {
      $or: [
        {
          $expr: {
            $and: [
              { $eq: ['$eventType', 'privileged_data_access'] },
              { $ne: ['$targetAccountId', null] },
              { $eq: ['$resultCount', null] },
            ],
          },
        },
        {
          $expr: {
            $and: [
              { $eq: ['$eventType', 'privileged_bulk_access'] },
              { $eq: ['$targetAccountId', null] },
              { $ne: ['$resultCount', null] },
              { $gte: ['$resultCount', 0] },
            ],
          },
        },
      ],
    },
  ],
};

const assetsCollectionOptions: CreateCollectionOptions = {
  validator: assetsJsonSchemaValidator,
  validationLevel: 'strict',
  validationAction: 'error',
};

const adminAccessLogCollectionOptions: CreateCollectionOptions = {
  validator: adminAccessLogJsonSchemaValidator,
  validationLevel: 'strict',
  validationAction: 'error',
};

/** §5 — named secondary indexes (comments cite query patterns from database-design.md). */
export const FEATURE004_INDEXES: Record<
  keyof typeof FEATURE004_COLLECTIONS,
  IndexDescription[]
> = {
  policies: [
    {
      // Customer Mobile GET /policy; Admin "policies for this customer"
      key: { accountId: 1, status: 1 },
      name: 'policies_accountId_status',
    },
    {
      // Admin ops triage — policies by status, most recent first
      key: { status: 1, createdAt: -1 },
      name: 'policies_status_createdAt',
    },
    {
      // Forward-readiness: PSP webhook reconciliation by external subscription id
      key: { 'billing.externalSubscriptionId': 1 },
      name: 'policies_billing_externalSubscriptionId_sparse',
      sparse: true,
    },
  ],
  policyStatusHistory: [
    {
      // "History for this policy" — admin policy-detail view
      key: { policyId: 1, createdAt: -1 },
      name: 'policy_status_history_policyId_createdAt',
    },
    {
      // "Recent policy changes for this account" — audit reconstruction
      key: { accountId: 1, createdAt: -1 },
      name: 'policy_status_history_accountId_createdAt',
    },
  ],
  assets: [
    {
      // Customer GET /assets; Admin "this customer's assets", newest registered first
      key: { accountId: 1, status: 1, createdAt: -1 },
      name: 'assets_accountId_status_createdAt',
    },
    {
      // §6 GPS-readiness — one device pairs to at most one asset (Phase 2)
      key: { gpsDeviceId: 1 },
      name: 'assets_gpsDeviceId_unique_partial',
      unique: true,
      partialFilterExpression: { gpsDeviceId: { $type: 'string' } },
    },
  ],
  adminAccessLog: [
    {
      // AUD-8 actor half — "Show me all actions by admin Y."
      key: { actorAccountId: 1, createdAt: -1 },
      name: 'admin_access_log_actorAccountId_createdAt',
    },
    {
      // AUD-1 / AUD-8 sitting reconstruction — "Reconstruct one sitting."
      key: { actorSessionId: 1, createdAt: -1 },
      name: 'admin_access_log_actorSessionId_createdAt',
    },
    {
      // Subject-keyed reconstruction — detail reads and bulk-derived per-subject rows
      key: { targetAccountId: 1, createdAt: -1 },
      name: 'admin_access_log_targetAccountId_createdAt_partial',
      partialFilterExpression: { targetAccountId: { $type: 'string' } },
    },
    {
      // Purge job scan — createdAt < cutoff AND legalHold == false
      key: { createdAt: 1 },
      name: 'admin_access_log_createdAt_purge_partial',
      partialFilterExpression: { legalHold: false },
    },
  ],
};

async function collectionExists(db: Db, name: string): Promise<boolean> {
  const found = await db.listCollections({ name }, { nameOnly: true }).toArray();
  return found.length > 0;
}

export interface BootstrapFeature004Result {
  collectionsEnsured: string[];
  validatorApplied: string[];
  indexesEnsured: Array<{ collection: string; name: string }>;
}

/**
 * Idempotently creates Feature 004 collections, applies validators (assets,
 * admin_access_log), and ensures indexes. Safe to re-run.
 */
export async function bootstrapFeature004Collections(db: Db): Promise<BootstrapFeature004Result> {
  const collectionsEnsured: string[] = [];
  const validatorApplied: string[] = [];
  const indexesEnsured: Array<{ collection: string; name: string }> = [];

  const { policies, policyStatusHistory, assets, adminAccessLog } = FEATURE004_COLLECTIONS;

  if (!(await collectionExists(db, policies))) {
    await db.createCollection(policies);
    collectionsEnsured.push(policies);
  }

  if (!(await collectionExists(db, policyStatusHistory))) {
    await db.createCollection(policyStatusHistory);
    collectionsEnsured.push(policyStatusHistory);
  }

  if (!(await collectionExists(db, assets))) {
    await db.createCollection(assets, assetsCollectionOptions);
    collectionsEnsured.push(assets);
    validatorApplied.push(assets);
  } else {
    await db.command({
      collMod: assets,
      validator: assetsJsonSchemaValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    validatorApplied.push(assets);
  }

  if (!(await collectionExists(db, adminAccessLog))) {
    await db.createCollection(adminAccessLog, adminAccessLogCollectionOptions);
    collectionsEnsured.push(adminAccessLog);
    validatorApplied.push(adminAccessLog);
  } else {
    await db.command({
      collMod: adminAccessLog,
      validator: adminAccessLogJsonSchemaValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    validatorApplied.push(adminAccessLog);
  }

  const ensureIndexes = async (
    collectionName: string,
    specs: IndexDescription[],
  ): Promise<void> => {
    for (const spec of specs) {
      const indexName = spec.name;
      if (indexName === undefined) {
        throw new Error(`Index spec for ${collectionName} is missing name`);
      }
      const options: Omit<IndexDescription, 'key'> = { name: indexName };
      if (spec.sparse === true) options.sparse = true;
      if (spec.unique === true) options.unique = true;
      if (spec.partialFilterExpression !== undefined) {
        options.partialFilterExpression = spec.partialFilterExpression;
      }
      await db.collection(collectionName).createIndex(spec.key, options);
      indexesEnsured.push({ collection: collectionName, name: indexName });
    }
  };

  await ensureIndexes(policies, FEATURE004_INDEXES.policies);
  await ensureIndexes(policyStatusHistory, FEATURE004_INDEXES.policyStatusHistory);
  await ensureIndexes(assets, FEATURE004_INDEXES.assets);
  await ensureIndexes(adminAccessLog, FEATURE004_INDEXES.adminAccessLog);

  return { collectionsEnsured, validatorApplied, indexesEnsured };
}
