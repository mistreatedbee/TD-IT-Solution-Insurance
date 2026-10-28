/**
 * `claims` collection — Feature 018 (claims filing and adjudication),
 * business-requirements.md §3/§8. New top-level Mongo collection per the
 * spec's §8 recommendation, mirroring `policies`/`assets`/`recovery_cases`'s
 * own independent-lifecycle/admin-queue-filtering reasoning.
 */
import { ObjectId, type Db, type Collection, type Document } from 'mongodb';
import { mongoCursorFilter, type MongoDecodedCursor } from '../lib/mongo-pagination.js';
import {
  isForwardClaimTransition,
  isTerminalClaimStatus,
  type ClaimStatus,
  type FraudFlag,
} from '../lib/claim-rules.js';

export interface ClaimReviewNote {
  actorAccountId: string;
  text: string;
  createdAt: Date;
}

export interface ClaimStatusChange {
  fromStatus: ClaimStatus;
  toStatus: ClaimStatus;
  actorAccountId: string;
  actorRole: 'customer' | 'admin' | 'system';
  reason: string | null;
  changedAt: Date;
}

export interface ClaimDocument {
  id: string;
  accountId: string;
  policyId: string;
  assetId: string;
  recoveryCaseId: string | null;
  supersedesClaimId: string | null;

  status: ClaimStatus;

  assetTypeSnapshot: string;
  assetDisplayNameSnapshot: string;
  policyPlanTierSnapshot: string;

  incidentDescription: string;
  incidentDate: Date;
  evidenceDescription: string | null;
  claimedAmount: number;
  claimedAmountCurrency: string;

  approvedAmount: number | null;
  rejectionReason: string | null;
  reviewNotes: ClaimReviewNote[];
  statusHistory: ClaimStatusChange[];
  /** §5 — computed once at filing, admin-only, never shown to the customer. */
  fraudFlags: FraudFlag[];

  submittedAt: Date;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ClaimDbRow extends Omit<ClaimDocument, 'id'> {
  _id: ObjectId;
}

export interface CreateClaimInput {
  accountId: string;
  policyId: string;
  assetId: string;
  recoveryCaseId: string | null;
  supersedesClaimId: string | null;
  assetTypeSnapshot: string;
  assetDisplayNameSnapshot: string;
  policyPlanTierSnapshot: string;
  incidentDescription: string;
  incidentDate: Date;
  evidenceDescription: string | null;
  claimedAmount: number;
  claimedAmountCurrency: string;
  fraudFlags: FraudFlag[];
}

function toClaim(row: ClaimDbRow): ClaimDocument {
  return {
    id: row._id.toHexString(),
    accountId: row.accountId,
    policyId: row.policyId,
    assetId: row.assetId,
    recoveryCaseId: row.recoveryCaseId ?? null,
    supersedesClaimId: row.supersedesClaimId ?? null,
    status: row.status,
    assetTypeSnapshot: row.assetTypeSnapshot,
    assetDisplayNameSnapshot: row.assetDisplayNameSnapshot,
    policyPlanTierSnapshot: row.policyPlanTierSnapshot,
    incidentDescription: row.incidentDescription,
    incidentDate: row.incidentDate,
    evidenceDescription: row.evidenceDescription ?? null,
    claimedAmount: row.claimedAmount,
    claimedAmountCurrency: row.claimedAmountCurrency,
    approvedAmount: row.approvedAmount ?? null,
    rejectionReason: row.rejectionReason ?? null,
    reviewNotes: row.reviewNotes ?? [],
    statusHistory: row.statusHistory ?? [],
    fraudFlags: row.fraudFlags ?? [],
    submittedAt: row.submittedAt,
    decidedAt: row.decidedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** NON_TERMINAL set — §1.5 "at most one claim in a non-terminal state" per asset. */
const NON_TERMINAL_STATUSES: readonly ClaimStatus[] = ['submitted', 'under_review', 'more_info_requested'];

export class InvalidClaimStatusTransitionError extends Error {
  constructor(
    readonly fromStatus: ClaimStatus,
    readonly toStatus: ClaimStatus,
  ) {
    super(`invalid claim status transition: ${fromStatus} -> ${toStatus}`);
    this.name = 'InvalidClaimStatusTransitionError';
  }
}

export function createClaimsRepo(db: Db) {
  const collection = (): Collection<ClaimDbRow> => db.collection<ClaimDbRow>('claims');

  return {
    async createForAccount(input: CreateClaimInput): Promise<ClaimDocument> {
      const now = new Date();
      const doc: Omit<ClaimDbRow, '_id'> = {
        accountId: input.accountId,
        policyId: input.policyId,
        assetId: input.assetId,
        recoveryCaseId: input.recoveryCaseId,
        supersedesClaimId: input.supersedesClaimId,
        status: 'submitted',
        assetTypeSnapshot: input.assetTypeSnapshot,
        assetDisplayNameSnapshot: input.assetDisplayNameSnapshot,
        policyPlanTierSnapshot: input.policyPlanTierSnapshot,
        incidentDescription: input.incidentDescription,
        incidentDate: input.incidentDate,
        evidenceDescription: input.evidenceDescription,
        claimedAmount: input.claimedAmount,
        claimedAmountCurrency: input.claimedAmountCurrency,
        approvedAmount: null,
        rejectionReason: null,
        reviewNotes: [],
        statusHistory: [],
        fraudFlags: input.fraudFlags,
        submittedAt: now,
        decidedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const result = await collection().insertOne(doc as ClaimDbRow);
      return toClaim({ _id: result.insertedId, ...doc });
    },

    async listByAccount(
      accountId: string,
      limit: number,
      cursor: MongoDecodedCursor | null,
    ): Promise<ClaimDocument[]> {
      const rows = await collection()
        .find({ accountId, ...mongoCursorFilter(cursor) })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map(toClaim);
    },

    async findByIdForAccount(accountId: string, claimId: string): Promise<ClaimDocument | null> {
      if (!ObjectId.isValid(claimId)) return null;
      const row = await collection().findOne({ _id: new ObjectId(claimId), accountId });
      return row ? toClaim(row) : null;
    },

    /** §1.5 — the one open claim per asset gate. */
    async findNonTerminalByAssetForAccount(accountId: string, assetId: string): Promise<ClaimDocument | null> {
      const row = await collection().findOne({
        accountId,
        assetId,
        status: { $in: NON_TERMINAL_STATUSES },
      });
      return row ? toClaim(row) : null;
    },

    /** §5.3 rate limit + §5.4 outlier baseline — every claim (any status) in the window. */
    async listSinceForAccount(accountId: string, since: Date): Promise<ClaimDocument[]> {
      const rows = await collection()
        .find({ accountId, submittedAt: { $gte: since } })
        .toArray();
      return rows.map(toClaim);
    },

    /** §5.4 historical baseline — all prior claims on this account for one asset type, any time window. */
    async listByAccountAndAssetType(accountId: string, assetTypeSnapshot: string): Promise<ClaimDocument[]> {
      const rows = await collection().find({ accountId, assetTypeSnapshot }).toArray();
      return rows.map(toClaim);
    },

    async listForAdmin(
      filters: { status?: ClaimStatus; accountId?: string; policyId?: string },
      limit: number,
      cursor: MongoDecodedCursor | null,
    ): Promise<ClaimDocument[]> {
      const filter: Document = { ...mongoCursorFilter(cursor) };
      if (filters.status) filter.status = filters.status;
      if (filters.accountId) filter.accountId = filters.accountId;
      if (filters.policyId) filter.policyId = filters.policyId;
      const rows = await collection()
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map(toClaim);
    },

    async findByIdForAdmin(claimId: string): Promise<ClaimDocument | null> {
      if (!ObjectId.isValid(claimId)) return null;
      const row = await collection().findOne({ _id: new ObjectId(claimId) });
      return row ? toClaim(row) : null;
    },

    /**
     * Admin review transitions (`under_review` entry, `more_info_requested`,
     * `rejected`, administrative `closed`) — §2.2/§2.3. Compare-and-set on
     * `expectedStatus` (the caller's pre-read), same C-A discipline
     * `recovery-cases.ts`'s `updateStatusForPartnerOrg` uses. Defense-in-depth
     * forward-only check mirrors `isForwardStatusTransition`'s precedent.
     */
    async transitionForAdmin(
      claimId: string,
      input: {
        expectedStatus: ClaimStatus;
        toStatus: ClaimStatus;
        actorAccountId: string;
        reason: string | null;
      },
    ): Promise<ClaimDocument | null> {
      if (!ObjectId.isValid(claimId)) return null;
      if (!isForwardClaimTransition(input.expectedStatus, input.toStatus)) {
        throw new InvalidClaimStatusTransitionError(input.expectedStatus, input.toStatus);
      }
      const now = new Date();
      const entry: ClaimStatusChange = {
        fromStatus: input.expectedStatus,
        toStatus: input.toStatus,
        actorAccountId: input.actorAccountId,
        actorRole: 'admin',
        reason: input.reason,
        changedAt: now,
      };
      const $set: Record<string, unknown> = { status: input.toStatus, updatedAt: now };
      if (input.toStatus === 'rejected') $set.rejectionReason = input.reason;
      if (isTerminalClaimStatus(input.toStatus)) {
        // decidedAt set-once-on-first-terminal-entry (§3 notes, mirrors recovery_cases.closedAt).
        $set.decidedAt = now;
      }
      const row = await collection().findOneAndUpdate(
        { _id: new ObjectId(claimId), status: input.expectedStatus },
        { $set, $push: { statusHistory: entry } },
        { returnDocument: 'after' },
      );
      return row ? toClaim(row) : null;
    },

    /**
     * §2.2/§2.4 — approval auto-advances to `awaiting_payout` in one write,
     * carrying BOTH statusHistory entries (`-> approved` and
     * `approved -> awaiting_payout`), per the spec's explicit instruction
     * that both transitions share one audit entry pair. `approved` itself is
     * never the persisted resting status.
     */
    async approveAndAdvance(
      claimId: string,
      input: { expectedStatus: ClaimStatus; approvedAmount: number; actorAccountId: string },
    ): Promise<ClaimDocument | null> {
      if (!ObjectId.isValid(claimId)) return null;
      if (!isForwardClaimTransition(input.expectedStatus, 'approved')) {
        throw new InvalidClaimStatusTransitionError(input.expectedStatus, 'approved');
      }
      const now = new Date();
      const entries: ClaimStatusChange[] = [
        {
          fromStatus: input.expectedStatus,
          toStatus: 'approved',
          actorAccountId: input.actorAccountId,
          actorRole: 'admin',
          reason: null,
          changedAt: now,
        },
        {
          fromStatus: 'approved',
          toStatus: 'awaiting_payout',
          actorAccountId: input.actorAccountId,
          actorRole: 'system',
          reason: null,
          changedAt: now,
        },
      ];
      const row = await collection().findOneAndUpdate(
        { _id: new ObjectId(claimId), status: input.expectedStatus },
        {
          $set: {
            status: 'awaiting_payout',
            approvedAmount: input.approvedAmount,
            decidedAt: now,
            updatedAt: now,
          },
          $push: { statusHistory: { $each: entries } },
        },
        { returnDocument: 'after' },
      );
      return row ? toClaim(row) : null;
    },

    /** §2.2 — customer responds to an info request; moves back into the review queue. */
    async respondToInfoRequest(
      accountId: string,
      claimId: string,
      input: { text: string; incidentDescription?: string },
    ): Promise<ClaimDocument | null> {
      if (!ObjectId.isValid(claimId)) return null;
      const now = new Date();
      const note: ClaimReviewNote = { actorAccountId: accountId, text: input.text, createdAt: now };
      const entry: ClaimStatusChange = {
        fromStatus: 'more_info_requested',
        toStatus: 'under_review',
        actorAccountId: accountId,
        actorRole: 'customer',
        reason: null,
        changedAt: now,
      };
      const $set: Record<string, unknown> = { status: 'under_review', updatedAt: now };
      if (input.incidentDescription !== undefined) $set.incidentDescription = input.incidentDescription;
      const row = await collection().findOneAndUpdate(
        { _id: new ObjectId(claimId), accountId, status: 'more_info_requested' },
        { $set, $push: { reviewNotes: note, statusHistory: entry } },
        { returnDocument: 'after' },
      );
      return row ? toClaim(row) : null;
    },

    /** §2.2 — customer withdrawal. */
    async withdrawForAccount(
      accountId: string,
      claimId: string,
      expectedStatus: ClaimStatus,
    ): Promise<ClaimDocument | null> {
      if (!ObjectId.isValid(claimId)) return null;
      if (!isForwardClaimTransition(expectedStatus, 'closed')) {
        throw new InvalidClaimStatusTransitionError(expectedStatus, 'closed');
      }
      const now = new Date();
      const entry: ClaimStatusChange = {
        fromStatus: expectedStatus,
        toStatus: 'closed',
        actorAccountId: accountId,
        actorRole: 'customer',
        reason: 'Withdrawn by customer.',
        changedAt: now,
      };
      const row = await collection().findOneAndUpdate(
        { _id: new ObjectId(claimId), accountId, status: expectedStatus },
        { $set: { status: 'closed', decidedAt: now, updatedAt: now }, $push: { statusHistory: entry } },
        { returnDocument: 'after' },
      );
      return row ? toClaim(row) : null;
    },
  };
}

export type ClaimsRepo = ReturnType<typeof createClaimsRepo>;
