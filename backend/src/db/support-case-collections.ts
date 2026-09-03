/**
 * Feature 010 (Phase 2, FR-11–17) — support_cases MongoDB collection bootstrap.
 *
 * Non-theft call-centre support cases (billing, app issues, policy questions, etc.),
 * kept structurally separate from recovery_cases per
 * docs/features/010-call-centre-dashboard/database-design.md §2 — a support case
 * inserted into recovery_cases with `status: 'open'` would surface on every security
 * company partner's unclaimed-case queue (`listForPartnerOrg`'s existing `$or` clause),
 * which is exactly the leakage a separate collection makes structurally impossible.
 *
 * FR-18–21 (escalation) fields (`escalatedToRecoveryCaseId`, `escalatedAt`, the
 * `'escalated'` status value) are formalized here per database-design.md §3 so the
 * schema is right when C-010-4 (Tier 2 caller-verification design) unblocks that work —
 * but NO WRITE PATH to them exists anywhere in this codebase. Do not add one without a
 * fresh Stage 8 review; see docs/features/010-call-centre-dashboard/security-review.md §6.
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const SUPPORT_CASES_COLLECTION = 'support_cases';

/**
 * FR-13 starter set — NOT ratified (business-requirements.md §6 item 4). Kept as an
 * API-layer-only validation list (see routes/support-cases.ts) — the Mongo schema below
 * only constrains `category` to `bsonType: 'string'`, per database-design.md §4.1's
 * ruling, so adding a category is a code change, not a migration.
 */
export const SUPPORT_CASE_CATEGORIES = [
  'billing',
  'app_technical_issue',
  'policy_question',
  'asset_registration_help',
  'account_access',
  'other',
] as const;

export type SupportCaseCategory = (typeof SUPPORT_CASE_CATEGORIES)[number];

export type SupportCaseStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'escalated';

export type SupportCaseChannel = 'phone';

export const supportCasesJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'accountId',
      'category',
      'description',
      'channel',
      'status',
      'referenceNumber',
      'notes',
      'createdByAgentAccountId',
      'callerVerified',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      accountId: { bsonType: 'string' },
      category: {
        // API-LAYER ENUM, NOT SCHEMA-LEVEL — database-design.md §4.1 (ruled). bsonType is
        // still constrained to string so a malformed non-string category can never be
        // inserted even though the value set isn't locked at the schema layer.
        bsonType: 'string',
        minLength: 1,
        maxLength: 64,
      },
      description: { bsonType: 'string', maxLength: 2000 },
      channel: { enum: ['phone'] },
      status: { enum: ['open', 'in_progress', 'resolved', 'closed', 'escalated'] },
      referenceNumber: { bsonType: 'string', minLength: 8, maxLength: 32 },
      resolutionSummary: { bsonType: ['string', 'null'], maxLength: 2000 },
      notes: {
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
      createdByAgentAccountId: { bsonType: 'string' },
      assignedAgentAccountId: { bsonType: ['string', 'null'] },
      callerVerified: { bsonType: 'bool' },
      callerVerificationMethod: { bsonType: ['string', 'null'] },
      callerVerifiedAt: { bsonType: ['date', 'null'] },
      // Written ONLY by the (not-yet-authorized) escalate endpoint — see file header.
      escalatedToRecoveryCaseId: { bsonType: ['string', 'null'] },
      escalatedAt: { bsonType: ['date', 'null'] },
      closedAt: { bsonType: ['date', 'null'] },
      // database-design.md §6 — optional, app-default false on create, so it doesn't
      // force every existing/legacy insert path to remember it explicitly. Not in
      // `required` deliberately (mirrors `assignedAgentAccountId`, unlike
      // `recovery_cases.legalHold`, which IS required there — a named, accepted
      // inconsistency between the two collections, database-design.md §6).
      legalHold: { bsonType: 'bool' },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

export const supportCaseIndexes: IndexDescription[] = [
  { key: { accountId: 1, createdAt: -1 }, name: 'support_cases_account_created' }, // FR-11 lookup-enrichment
  { key: { status: 1, category: 1, createdAt: -1 }, name: 'support_cases_status_category_created' }, // FR-17 triage/list
  { key: { referenceNumber: 1 }, unique: true, name: 'support_cases_reference_number_unique' },
  {
    key: { createdByAgentAccountId: 1, status: 1, createdAt: -1 },
    name: 'support_cases_created_by_agent_status_created',
  }, // scope=mine
  {
    key: { escalatedToRecoveryCaseId: 1 },
    sparse: true,
    name: 'support_cases_escalated_to_recovery_case_sparse',
  },
  { key: { status: 1, closedAt: 1 }, name: 'support_cases_status_closed_at_retention' }, // §6 retention job
];

export async function bootstrapSupportCaseCollections(db: Db): Promise<{
  collection: string;
  created: boolean;
  indexes: string[];
}> {
  const name = SUPPORT_CASES_COLLECTION;
  const existing = await db.listCollections({ name }).toArray();
  let created = false;
  if (existing.length === 0) {
    await db.createCollection(name, {
      validator: supportCasesJsonSchemaValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    created = true;
  } else {
    await db.command({
      collMod: name,
      validator: supportCasesJsonSchemaValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }
  const indexResults = await db.collection(name).createIndexes(supportCaseIndexes);
  return { collection: name, created, indexes: indexResults };
}
