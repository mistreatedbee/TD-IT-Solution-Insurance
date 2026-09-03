/**
 * `support_cases` — Feature 010 Phase 2 (FR-11–17) call-centre support-case records.
 *
 * Structurally separate from `recovery_cases` (database-design.md §2) — never share a
 * collection, never share a query path with `listForPartnerOrg`.
 *
 * FR-18–21 (escalation) fields exist on the schema (see support-case-collections.ts) but
 * this repository intentionally exposes NO method that writes `escalatedToRecoveryCaseId`,
 * `escalatedAt`, or transitions `status` to `'escalated'` — that endpoint is NOT AUTHORIZED
 * FOR IMPLEMENTATION (C-010-4 blocked). Do not add one here without a fresh Stage 8 review.
 */
import { ObjectId, type Db, type Collection, type Document } from 'mongodb';
import { mongoCursorFilter, type MongoDecodedCursor } from '../lib/mongo-pagination.js';
import type { SupportCaseCategory, SupportCaseChannel, SupportCaseStatus } from '../db/support-case-collections.js';

export interface SupportCaseNote {
  agentAccountId: string;
  text: string;
  createdAt: Date;
}

export interface SupportCaseDocument {
  id: string;
  accountId: string;
  category: SupportCaseCategory | string;
  description: string;
  channel: SupportCaseChannel;
  status: SupportCaseStatus;
  referenceNumber: string;
  resolutionSummary: string | null;
  notes: SupportCaseNote[];
  createdByAgentAccountId: string;
  assignedAgentAccountId: string | null;
  callerVerified: boolean;
  callerVerificationMethod: string | null;
  callerVerifiedAt: Date | null;
  escalatedToRecoveryCaseId: string | null;
  escalatedAt: Date | null;
  closedAt: Date | null;
  legalHold: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface SupportCaseDbRow {
  _id: ObjectId;
  accountId: string;
  category: string;
  description: string;
  channel: SupportCaseChannel;
  status: SupportCaseStatus;
  referenceNumber: string;
  resolutionSummary: string | null;
  notes: SupportCaseNote[];
  createdByAgentAccountId: string;
  assignedAgentAccountId: string | null;
  callerVerified: boolean;
  callerVerificationMethod: string | null;
  callerVerifiedAt: Date | null;
  escalatedToRecoveryCaseId: string | null;
  escalatedAt: Date | null;
  closedAt: Date | null;
  legalHold?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toCase(row: SupportCaseDbRow): SupportCaseDocument {
  return {
    id: row._id.toHexString(),
    accountId: row.accountId,
    category: row.category,
    description: row.description,
    channel: row.channel,
    status: row.status,
    referenceNumber: row.referenceNumber,
    resolutionSummary: row.resolutionSummary ?? null,
    notes: row.notes ?? [],
    createdByAgentAccountId: row.createdByAgentAccountId,
    assignedAgentAccountId: row.assignedAgentAccountId ?? null,
    callerVerified: row.callerVerified,
    callerVerificationMethod: row.callerVerificationMethod ?? null,
    callerVerifiedAt: row.callerVerifiedAt ?? null,
    escalatedToRecoveryCaseId: row.escalatedToRecoveryCaseId ?? null,
    escalatedAt: row.escalatedAt ?? null,
    closedAt: row.closedAt ?? null,
    legalHold: row.legalHold ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function generateReferenceNumber(): string {
  const date = new Date();
  const ymd =
    String(date.getUTCFullYear()) +
    String(date.getUTCMonth() + 1).padStart(2, '0') +
    String(date.getUTCDate()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SC-${ymd}-${suffix}`;
}

/**
 * FR-15's fixed state machine (api-design.md §5): open -> in_progress -> resolved ->
 * closed. `closed` and `escalated` are terminal. No transition to the current status
 * (a no-op is a 409, not a silent 200). `escalated` has no entry here at all — the only
 * path to it is the (not-authorized) escalate endpoint, which this repository does not
 * implement.
 */
const VALID_STATUS_TRANSITIONS: Record<SupportCaseStatus, SupportCaseStatus[]> = {
  open: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['closed'],
  closed: [],
  escalated: [],
};

export const OPEN_SUPPORT_CASE_STATUSES = new Set<SupportCaseStatus>(['open', 'in_progress']);

export function serializeSupportCaseSummary(doc: SupportCaseDocument) {
  return {
    id: doc.id,
    referenceNumber: doc.referenceNumber,
    accountId: doc.accountId,
    category: doc.category,
    description: doc.description,
    status: doc.status,
    callerVerified: doc.callerVerified,
    createdByAgentAccountId: doc.createdByAgentAccountId,
    assignedAgentAccountId: doc.assignedAgentAccountId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function serializeSupportCaseDetail(doc: SupportCaseDocument) {
  return {
    ...serializeSupportCaseSummary(doc),
    resolutionSummary: doc.resolutionSummary,
    notes: doc.notes.map((note) => ({
      agentAccountId: note.agentAccountId,
      text: note.text,
      createdAt: note.createdAt.toISOString(),
    })),
    escalatedToRecoveryCaseId: doc.escalatedToRecoveryCaseId,
    escalatedAt: doc.escalatedAt?.toISOString() ?? null,
    closedAt: doc.closedAt?.toISOString() ?? null,
  };
}

/** FR-11 addendum's `supportCases[]` summary — support-lookup.ts's own shape, distinct
 * from the agent-facing `SupportCaseSummary` above (api-design.md §3). */
export function serializeSupportCaseLookupSummary(doc: SupportCaseDocument) {
  return {
    id: doc.id,
    referenceNumber: doc.referenceNumber,
    status: doc.status,
    category: doc.category,
    createdAt: doc.createdAt.toISOString(),
    callerVerified: doc.callerVerified,
  };
}

export function createSupportCasesRepo(db: Db) {
  const collection = (): Collection<SupportCaseDbRow> =>
    db.collection<SupportCaseDbRow>('support_cases');

  return {
    async createForAccount(input: {
      accountId: string;
      category: string;
      description: string;
      channel: SupportCaseChannel;
      createdByAgentAccountId: string;
    }): Promise<SupportCaseDocument> {
      const now = new Date();
      const doc: Omit<SupportCaseDbRow, '_id'> = {
        accountId: input.accountId,
        category: input.category,
        description: input.description,
        channel: input.channel,
        status: 'open',
        referenceNumber: generateReferenceNumber(),
        resolutionSummary: null,
        notes: [],
        createdByAgentAccountId: input.createdByAgentAccountId,
        assignedAgentAccountId: null,
        // C-010-2 — every support_cases row created under this scope is
        // `callerVerified: false` until a Tier 2 verification mechanism (C-010-4) exists.
        // No code path in this repository can set it `true`.
        callerVerified: false,
        callerVerificationMethod: null,
        callerVerifiedAt: null,
        escalatedToRecoveryCaseId: null,
        escalatedAt: null,
        closedAt: null,
        legalHold: false,
        createdAt: now,
        updatedAt: now,
      };
      const result = await collection().insertOne(doc as SupportCaseDbRow);
      return toCase({ _id: result.insertedId, ...doc });
    },

    async findById(caseId: string): Promise<SupportCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      const row = await collection().findOne({ _id: new ObjectId(caseId) });
      return row ? toCase(row) : null;
    },

    /** FR-11 addendum — open (`open`/`in_progress`) support cases for a customer account,
     * mirroring `OPEN_RECOVERY_STATUSES`'s existing pattern in support-lookup.ts. */
    async listOpenByAccount(accountId: string, limit: number): Promise<SupportCaseDocument[]> {
      const rows = await collection()
        .find({ accountId, status: { $in: [...OPEN_SUPPORT_CASE_STATUSES] } })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map(toCase);
    },

    /** FR-17 — `scope=mine` only (SR-010-2: `scope=all` is WITHHELD and has no method
     * here at all — there is nothing for a route to accidentally call). */
    async listMine(
      agentAccountId: string,
      filters: { status?: SupportCaseStatus; category?: string; accountId?: string },
      limit: number,
      cursor: MongoDecodedCursor | null,
    ): Promise<SupportCaseDocument[]> {
      const query: Document = {
        createdByAgentAccountId: agentAccountId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.accountId ? { accountId: filters.accountId } : {}),
        ...mongoCursorFilter(cursor),
      };
      const rows = await collection()
        .find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map(toCase);
    },

    async appendNote(caseId: string, agentAccountId: string, text: string): Promise<SupportCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      const note: SupportCaseNote = { agentAccountId, text, createdAt: new Date() };
      const result = await collection().findOneAndUpdate(
        { _id: new ObjectId(caseId) },
        { $push: { notes: note }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after' },
      );
      return result ? toCase(result) : null;
    },

    /**
     * FR-15/16 status transition. Validates the fixed state graph against the document's
     * CURRENT status (read-then-conditionally-write, guarding the write with a filter on
     * that same status to close the race window) — `escalated` is not a reachable target
     * from this method under any input (VALID_STATUS_TRANSITIONS has no entry pointing to
     * it), independent of whatever the route layer's Zod schema also rejects.
     */
    async updateStatus(
      caseId: string,
      targetStatus: Exclude<SupportCaseStatus, 'escalated'>,
      resolutionSummary: string | null,
    ): Promise<
      | { ok: true; case: SupportCaseDocument }
      | { ok: false; reason: 'not_found' }
      | { ok: false; reason: 'invalid_transition' }
    > {
      if (!ObjectId.isValid(caseId)) return { ok: false, reason: 'not_found' };
      const current = await collection().findOne({ _id: new ObjectId(caseId) });
      if (!current) return { ok: false, reason: 'not_found' };

      const allowed = VALID_STATUS_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(targetStatus)) {
        return { ok: false, reason: 'invalid_transition' };
      }

      const now = new Date();
      const setFields: Partial<SupportCaseDbRow> = { status: targetStatus, updatedAt: now };
      if (targetStatus === 'resolved' || targetStatus === 'closed') {
        setFields.resolutionSummary = resolutionSummary;
      }
      if (targetStatus === 'closed') {
        setFields.closedAt = now;
      }

      const result = await collection().findOneAndUpdate(
        { _id: new ObjectId(caseId), status: current.status },
        { $set: setFields },
        { returnDocument: 'after' },
      );
      if (!result) {
        // Lost a race against a concurrent transition — same observable outcome as a
        // pre-checked invalid transition from the caller's point of view.
        return { ok: false, reason: 'invalid_transition' };
      }
      return { ok: true, case: toCase(result) };
    },
  };
}

export type SupportCasesRepo = ReturnType<typeof createSupportCasesRepo>;
