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
  NON_TERMINAL_CLAIM_STATUSES,
  type ClaimStatus,
  type FraudFlag,
} from '../lib/claim-rules.js';
import type { ClaimDecisionNotice } from '../lib/claim-decision-notice.js';

export interface ClaimReviewNote {
  actorAccountId: string;
  /** SR-018-6 — distinguishes an admin's more-info request from the
   * customer's own response so the customer-facing serializer can surface
   * the admin's text without ever exposing `actorAccountId`. */
  authorRole: 'admin' | 'customer';
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
  /** SR-018-6 — administrative close reason (admin-initiated `closed` only;
   * left null for a customer withdrawal, which already carries its own
   * fixed statusHistory reason). Customer-visible, like `rejectionReason`. */
  closeReason: string | null;
  /** security-review.md §12.3 N-3 — the admin's reason for disputing the
   * amount on a partial approval (`approvedAmount < claimedAmount`).
   * Required by the route layer whenever that condition holds. Customer-
   * visible, like `rejectionReason`. */
  quantumReason: string | null;
  /** security-review.md §12.3 N-1 — append-only, server-composed decision
   * notices (one per admin `rejected`, administrative `closed`, or partial
   * `approved` shortfall). Each entry pins its own `templateVersion` so a
   * later template change never retroactively alters an already-issued
   * notice. Customer-visible. */
  decisionNotices: ClaimDecisionNotice[];
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
    closeReason: row.closeReason ?? null,
    quantumReason: row.quantumReason ?? null,
    decisionNotices: row.decisionNotices ?? [],
    reviewNotes: row.reviewNotes ?? [],
    statusHistory: row.statusHistory ?? [],
    fraudFlags: row.fraudFlags ?? [],
    submittedAt: row.submittedAt,
    decidedAt: row.decidedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class InvalidClaimStatusTransitionError extends Error {
  constructor(
    readonly fromStatus: ClaimStatus,
    readonly toStatus: ClaimStatus,
  ) {
    super(`invalid claim status transition: ${fromStatus} -> ${toStatus}`);
    this.name = 'InvalidClaimStatusTransitionError';
  }
}

/**
 * SR-018-5 — thrown when `createForAccount`'s insert collides with the
 * `claims_one_open_claim_per_asset` partial unique index (`db/claims-collections.ts`).
 * This is the database-level backstop for the same §1.5 rule
 * `findNonTerminalByAssetForAccount`'s pre-insert check already enforces at the
 * application layer: two concurrent requests can both pass that check before
 * either insert lands, but only one insert can win against the index. The
 * route layer (`routes/claims.ts`) catches this and re-resolves it into the
 * same `DUPLICATE_OPEN_CLAIM` response the pre-insert check already returns,
 * so a client never sees a raw database error.
 */
export class DuplicateOpenClaimError extends Error {
  constructor(readonly assetId: string) {
    super(`duplicate open claim for asset: ${assetId}`);
    this.name = 'DuplicateOpenClaimError';
  }
}

/** Mongo duplicate-key error — code 11000, including inside a `WriteError` wrapper. */
function isMongoDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === 11000;
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
        closeReason: null,
        quantumReason: null,
        decisionNotices: [],
        reviewNotes: [],
        statusHistory: [],
        fraudFlags: input.fraudFlags,
        submittedAt: now,
        decidedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      try {
        const result = await collection().insertOne(doc as ClaimDbRow);
        return toClaim({ _id: result.insertedId, ...doc });
      } catch (err) {
        if (isMongoDuplicateKeyError(err)) {
          throw new DuplicateOpenClaimError(input.assetId);
        }
        throw err;
      }
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
        status: { $in: NON_TERMINAL_CLAIM_STATUSES },
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
     * Foundational claim <-> recovery-case linkage (product-manager research,
     * 2026-10-28) — `claims.recoveryCaseId` is already set at filing time
     * (`routes/claims.ts`) when the customer supplies a `recoveryCaseId`; this
     * is the read-side join. Admin-only consumer (`admin-claims.ts`'s claim
     * detail response) — never exposed to the customer serializer, since the
     * point is letting an adjudicator see an asset's already-open recovery
     * case, not surfacing recovery-case internals to the claimant.
     *
     * Queries the `recovery_cases` collection directly (by `_id`, no
     * `accountId` scoping) rather than going through `RecoveryCasesRepo`, to
     * avoid a repo-to-repo dependency — this repo is constructed from a bare
     * `Db` the same way `recovery-cases.ts` is (see `context.ts`), and only a
     * minimal, already-public-shaped summary is read back.
     */
    async getLinkedRecoveryCaseSummary(claimId: string): Promise<{
      id: string;
      status: string;
      partnerOrganizationId: string | null;
      referenceNumber: string;
    } | null> {
      if (!ObjectId.isValid(claimId)) return null;
      const claimRow = await collection().findOne(
        { _id: new ObjectId(claimId) },
        { projection: { recoveryCaseId: 1 } },
      );
      if (!claimRow?.recoveryCaseId || !ObjectId.isValid(claimRow.recoveryCaseId)) return null;

      const recoveryCaseRow = await db
        .collection<{
          _id: ObjectId;
          status: string;
          partnerOrganizationId: string | null;
          referenceNumber: string;
        }>('recovery_cases')
        .findOne(
          { _id: new ObjectId(claimRow.recoveryCaseId) },
          { projection: { status: 1, partnerOrganizationId: 1, referenceNumber: 1 } },
        );
      if (!recoveryCaseRow) return null;

      return {
        id: recoveryCaseRow._id.toHexString(),
        status: recoveryCaseRow.status,
        partnerOrganizationId: recoveryCaseRow.partnerOrganizationId,
        referenceNumber: recoveryCaseRow.referenceNumber,
      };
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
        /** security-review.md §12.3 N-1 — the server-composed notice for a
         * `rejected` or administrative `closed` transition. Appended to
         * `decisionNotices[]` in the same atomic write as the status change.
         * Omitted for `start_review`/`more_info_requested`, which are not
         * adverse decisions. */
        notice?: ClaimDecisionNotice;
        /** security-review.md §12.3 N-5 — for `more_info_requested` only:
         * the admin's `reviewNote` with the fixed "claim stays open" /
         * "won't be rejected without further notice" boilerplate already
         * appended. The raw admin text (without boilerplate) is still what
         * goes into `statusHistory`/the audit trail's `reason` field. */
        customerFacingReviewNoteText?: string;
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
      // SR-018-6 — administrative close reason, customer-visible like rejectionReason.
      if (input.toStatus === 'closed') $set.closeReason = input.reason;
      if (isTerminalClaimStatus(input.toStatus)) {
        // decidedAt set-once-on-first-terminal-entry (§3 notes, mirrors recovery_cases.closedAt).
        $set.decidedAt = now;
      }
      // SR-018-6 — surface the admin's more-info-request text to the customer
      // via reviewNotes (authorRole: 'admin'), not just statusHistory, which
      // the customer-facing serializer never reads.
      const $push: Record<string, unknown> = { statusHistory: entry };
      if (input.toStatus === 'more_info_requested' && input.reason) {
        $push.reviewNotes = {
          actorAccountId: input.actorAccountId,
          authorRole: 'admin',
          // §12.3 N-5 — the customer sees the admin's text PLUS fixed
          // boilerplate, never the admin's free text alone.
          text: input.customerFacingReviewNoteText ?? input.reason,
          createdAt: now,
        } satisfies ClaimReviewNote;
      }
      if (input.notice) {
        $push.decisionNotices = input.notice;
      }
      const row = await collection().findOneAndUpdate(
        { _id: new ObjectId(claimId), status: input.expectedStatus },
        { $set, $push },
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
      input: {
        expectedStatus: ClaimStatus;
        approvedAmount: number;
        actorAccountId: string;
        /** §12.2 R7-3 — recorded ONLY when the claim carries
         * `FLAG_INCIDENT_BEFORE_ELIGIBILITY`. Admin-only; must never be
         * exposed to the customer serializer. */
        eligibilityDetermination?: string | null;
        /** security-review.md §12.3 N-3 — required by the route layer
         * whenever `approvedAmount < claimedAmount`. Customer-visible. */
        quantumReason?: string | null;
        /** §12.3 N-3 — the server-composed shortfall notice, appended to
         * `decisionNotices[]` in the same atomic write as the approval,
         * whenever this is a partial approval. */
        notice?: ClaimDecisionNotice | null;
      },
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
          reason: input.eligibilityDetermination
            ? `eligibilityDetermination=${input.eligibilityDetermination}`
            : null,
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
      const $push: Record<string, unknown> = { statusHistory: { $each: entries } };
      if (input.notice) {
        $push.decisionNotices = input.notice;
      }
      const row = await collection().findOneAndUpdate(
        { _id: new ObjectId(claimId), status: input.expectedStatus },
        {
          $set: {
            status: 'awaiting_payout',
            approvedAmount: input.approvedAmount,
            quantumReason: input.quantumReason ?? null,
            decidedAt: now,
            updatedAt: now,
          },
          $push,
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
      const note: ClaimReviewNote = {
        actorAccountId: accountId,
        authorRole: 'customer',
        text: input.text,
        createdAt: now,
      };
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
