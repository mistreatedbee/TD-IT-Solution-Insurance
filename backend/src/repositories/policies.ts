/**
 * `policies` collection — database-design.md §3.1.
 */
import { ObjectId, type Db, type Collection } from 'mongodb';
import { mongoCursorFilter, type MongoDecodedCursor } from '../lib/mongo-pagination.js';
import { normalizePlanSlug } from '../lib/plan-catalog-defaults.js';

export type PolicyStatus =
  | 'pending_activation'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'cancelled'
  | 'expired';

export type BillingStatus = 'not_configured' | 'active' | 'past_due' | 'canceled';

export interface PolicyBilling {
  provider: string | null;
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
  billingStatus: BillingStatus;
  currency: string;
  amount: number | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  nextBillingAt: Date | null;
  cancelAt: Date | null;
}

export interface CoverageLimit {
  assetType: string;
  amount: number;
  currency: string;
}

export interface PolicyDocument {
  id: string;
  accountId: string;
  planTier: string;
  planCatalogId: string | null;
  status: PolicyStatus;
  coverageLimits: CoverageLimit[];
  billing: PolicyBilling;
  effectiveDate: Date;
  renewalDate: Date | null;
  cancelledAt: Date | null;
  legalHold: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PolicyDbRow {
  _id: ObjectId;
  accountId: string;
  planTier: string;
  planCatalogId?: string | null;
  status: PolicyStatus;
  coverageLimits: CoverageLimit[];
  billing: PolicyBilling;
  effectiveDate: Date;
  renewalDate: Date | null;
  cancelledAt: Date | null;
  legalHold: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toPolicy(row: PolicyDbRow): PolicyDocument {
  return {
    id: row._id.toHexString(),
    accountId: row.accountId,
    planTier: row.planTier,
    planCatalogId: row.planCatalogId ?? null,
    status: row.status,
    coverageLimits: row.coverageLimits,
    billing: row.billing,
    effectiveDate: row.effectiveDate,
    renewalDate: row.renewalDate,
    cancelledAt: row.cancelledAt,
    legalHold: row.legalHold,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createPoliciesRepo(db: Db) {
  const collection = (): Collection<PolicyDbRow> => db.collection<PolicyDbRow>('policies');

  return {
    async createForAccount(
      accountId: string,
      input: { planTier: string; planCatalogId?: string | null; monthlyAmountCents?: number | null },
    ): Promise<PolicyDocument> {
      const now = new Date();
      const doc: Omit<PolicyDbRow, '_id'> = {
        accountId,
        planTier: input.planTier,
        planCatalogId: input.planCatalogId ?? null,
        status: 'pending_activation',
        coverageLimits: [],
        billing: {
          provider: null,
          externalCustomerId: null,
          externalSubscriptionId: null,
          billingStatus: 'not_configured',
          currency: 'ZAR',
          amount:
            input.monthlyAmountCents != null && input.monthlyAmountCents > 0
              ? input.monthlyAmountCents / 100
              : null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          nextBillingAt: null,
          cancelAt: null,
        },
        effectiveDate: now,
        renewalDate: null,
        cancelledAt: null,
        legalHold: false,
        createdAt: now,
        updatedAt: now,
      };
      const result = await collection().insertOne(doc as PolicyDbRow);
      return toPolicy({ _id: result.insertedId, ...doc });
    },

    /** @deprecated Use createForAccount with structured input */
    async createForAccountLegacy(accountId: string, planTier: string): Promise<PolicyDocument> {
      return this.createForAccount(accountId, { planTier });
    },

    async listByAccount(
      accountId: string,
      limit: number,
      cursor: MongoDecodedCursor | null,
    ): Promise<PolicyDocument[]> {
      const filter = { accountId, ...mongoCursorFilter(cursor) };
      const rows = await collection()
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map(toPolicy);
    },

    async findByIdForAccount(accountId: string, policyId: string): Promise<PolicyDocument | null> {
      if (!ObjectId.isValid(policyId)) return null;
      const row = await collection().findOne({ _id: new ObjectId(policyId), accountId });
      return row ? toPolicy(row) : null;
    },

    async listForAdmin(
      filters: { accountId?: string; status?: PolicyStatus },
      limit: number,
      cursor: MongoDecodedCursor | null,
    ): Promise<PolicyDocument[]> {
      const filter: Record<string, unknown> = { ...mongoCursorFilter(cursor) };
      if (filters.accountId) filter.accountId = filters.accountId;
      if (filters.status) filter.status = filters.status;
      const rows = await collection()
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map(toPolicy);
    },

    async findByIdForAdmin(policyId: string): Promise<PolicyDocument | null> {
      if (!ObjectId.isValid(policyId)) return null;
      const row = await collection().findOne({ _id: new ObjectId(policyId) });
      return row ? toPolicy(row) : null;
    },

    /**
     * Resolves only the owning accountId for a policyId, with no other admin-only fields
     * (billing, coverage limits, legal hold, etc.) exposed. Intended for cross-role lookups
     * (e.g. support-agent customer lookup) that need to pivot from a policyId to an accountId
     * without requiring the SR-004-admin-12 admin-route contract that guards
     * `findByIdForAdmin`.
     */
    async findAccountIdByPolicyId(policyId: string): Promise<string | null> {
      if (!ObjectId.isValid(policyId)) return null;
      const row = await collection().findOne(
        { _id: new ObjectId(policyId) },
        { projection: { accountId: 1 } },
      );
      return row?.accountId ?? null;
    },

    async countByAccount(accountId: string): Promise<number> {
      return collection().countDocuments({ accountId });
    },

    async listActiveForAccount(accountId: string): Promise<PolicyDocument[]> {
      const rows = await collection().find({ accountId, status: 'active' }).toArray();
      return rows.map(toPolicy);
    },

    /** Called when payment confirms — sets renewalDate one month ahead. */
    async activateForAccount(accountId: string, policyId: string): Promise<PolicyDocument | null> {
      if (!ObjectId.isValid(policyId)) return null;
      const now = new Date();
      const renewalDate = new Date(now);
      renewalDate.setMonth(renewalDate.getMonth() + 1);

      const row = await collection().findOneAndUpdate(
        { _id: new ObjectId(policyId), accountId, status: 'pending_activation' },
        {
          $set: {
            status: 'active',
            effectiveDate: now,
            renewalDate,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' },
      );
      return row ? toPolicy(row) : null;
    },

    async updatePlanForAccount(
      accountId: string,
      policyId: string,
      input: { planTier: string; planCatalogId: string; monthlyAmountCents?: number | null },
    ): Promise<PolicyDocument | null> {
      if (!ObjectId.isValid(policyId)) return null;
      const now = new Date();
      const amount =
        input.monthlyAmountCents != null && input.monthlyAmountCents > 0
          ? input.monthlyAmountCents / 100
          : null;

      const row = await collection().findOneAndUpdate(
        { _id: new ObjectId(policyId), accountId },
        {
          $set: {
            planTier: input.planTier,
            planCatalogId: input.planCatalogId,
            'billing.amount': amount,
            updatedAt: now,
          },
        },
        { returnDocument: 'after' },
      );
      return row ? toPolicy(row) : null;
    },

    /** Idempotent migration: starter→essential, standard→plus, enterprise→business. */
    async migrateLegacyPlanTiers(): Promise<number> {
      const legacySlugs = ['starter', 'standard', 'enterprise'] as const;
      let modified = 0;
      const now = new Date();
      for (const legacySlug of legacySlugs) {
        const normalized = normalizePlanSlug(legacySlug);
        if (normalized === legacySlug) continue;
        const result = await collection().updateMany(
          { planTier: legacySlug },
          { $set: { planTier: normalized, updatedAt: now } },
        );
        modified += result.modifiedCount;
      }
      return modified;
    },
  };
}

export type PoliciesRepo = ReturnType<typeof createPoliciesRepo>;
