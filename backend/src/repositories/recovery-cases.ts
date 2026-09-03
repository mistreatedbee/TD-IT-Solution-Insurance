/**
 * `recovery_cases` — theft/recovery case records for mobile + Security Dashboard.
 *
 * Feature 011 (SAPS case-number capture) note — SR-011-1 / C-011-9: this file is the
 * ONLY place `sapsCaseNumber` / `reportingStation` / `reportedToPoliceAt` /
 * `policeReportHistory` / `policeReportReminderSentAt` (collectively "police-report
 * fields") may be read off the raw document. The partner/security-company-facing read
 * paths (`listForPartnerOrg`, `findByIdForPartnerOrg`) apply a Mongo projection that
 * EXCLUDES these fields at the query level — they are never fetched into the row object
 * on that path, so `serializeSecurityRecoveryCase` structurally cannot see them even if
 * a future edit adds a field to that function. Do not "fix" the projection to include
 * these fields without a fresh security-review sign-off (security-review.md SR-011-1a).
 */
import { ObjectId, type Db, type Collection, type Document } from 'mongodb';
import { mongoCursorFilter, type MongoDecodedCursor } from '../lib/mongo-pagination.js';

export type RecoveryCaseStatus =
  | 'open'
  | 'investigating'
  | 'tracking'
  | 'recovered'
  | 'closed';

export interface LastKnownLocation {
  latitude: number;
  longitude: number;
  recordedAt: Date;
  accuracyMeters: number | null;
}

export interface CallCentreNote {
  agentAccountId: string;
  text: string;
  createdAt: Date;
}

/** Feature 011 (compliance-review-saps-case-data.md C-011-8) — append-only change
 * history for the police-report triple. One entry per field that ACTUALLY changed
 * value (api-design.md §2.5 no-op suppression — see setPoliceReportFields below). */
export interface PoliceReportChange {
  actorAccountId: string;
  field: 'sapsCaseNumber' | 'reportingStation' | 'reportedToPoliceAt';
  previousValue: string | null;
  newValue: string | null;
  changedAt: Date;
}

/** database-design.md §3 bounds — SR-011-3: caps unbounded customer-controlled growth
 * on a document every partner-dashboard page load fetches (with these fields projected
 * out, per SR-011-1a, but the array itself must still be bounded on write). Chosen as a
 * generous-but-finite ceiling: a real customer edits this triple a handful of times
 * (station first, case number once SMS'd, an occasional correction) — 50 entries is
 * roughly an order of magnitude above any plausible legitimate use, while still cheap
 * to store and cheap to reject well before the 16MB BSON document ceiling is a concern. */
export const MAX_POLICE_REPORT_HISTORY_ITEMS = 50;

/** compliance-review-saps-case-data.md §5 — retention floor for the police-report
 * triple: 5 years from case closure (`closedAt`), subject to `legalHold`/CT-4 override. */
export const POLICE_REPORT_RETENTION_YEARS = 5;

export interface RecoveryCaseDocument {
  id: string;
  accountId: string;
  assetId: string;
  partnerOrganizationId: string | null;
  status: RecoveryCaseStatus;
  referenceNumber: string;
  reportedAt: Date;
  notes: string | null;
  callCentreNotes: CallCentreNote[];
  lastLocationAt: Date | null;
  lastLocation: LastKnownLocation | null;
  legalHold: boolean;
  /** Feature 011 — set once, when `status` transitions to `'closed'`
   * (see `updateStatusForPartnerOrg`). Drives the police-report retention clock
   * (database-design.md §5.2) — do NOT substitute `updatedAt` for this field. */
  closedAt: Date | null;
  /** Feature 011 (SAPS case-number capture) — customer-only fields. NEVER add these to
   * `serializeSecurityRecoveryCase` or any security-company/support-agent surface
   * without a fresh compliance + security review (C-011-9 / SR-011-1 / SR-011-7). */
  sapsCaseNumber: string | null;
  reportingStation: string | null;
  reportedToPoliceAt: Date | null;
  policeReportHistory: PoliceReportChange[];
  policeReportReminderSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RecoveryCaseDbRow {
  _id: ObjectId;
  accountId: string;
  assetId: string;
  partnerOrganizationId: string | null;
  status: RecoveryCaseStatus;
  referenceNumber: string;
  reportedAt: Date;
  notes: string | null;
  callCentreNotes?: CallCentreNote[];
  lastLocationAt: Date | null;
  lastLocation: LastKnownLocation | null;
  legalHold: boolean;
  closedAt?: Date | null;
  // Optional because the partner-scoped read paths deliberately project these fields
  // OUT of the query (SR-011-1a) — on those rows, these keys are simply absent, not null.
  sapsCaseNumber?: string | null;
  reportingStation?: string | null;
  reportedToPoliceAt?: Date | null;
  policeReportHistory?: PoliceReportChange[];
  policeReportReminderSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** SR-011-1a — Mongo exclusion projection applied to every partner/security-company
 * read of `recovery_cases`. A field excluded here is never fetched into the row object
 * at all, so it cannot be serialised, logged, or spread by any code downstream of the
 * query — this is what makes C-011-9 a structural guarantee rather than a convention.
 * DO NOT remove a field from this projection without a fresh Stage 8 review. */
export const POLICE_REPORT_FIELD_EXCLUSION_PROJECTION: Document = {
  sapsCaseNumber: 0,
  reportingStation: 0,
  reportedToPoliceAt: 0,
  policeReportHistory: 0,
  policeReportReminderSentAt: 0,
};

function toCase(row: RecoveryCaseDbRow): RecoveryCaseDocument {
  return {
    id: row._id.toHexString(),
    accountId: row.accountId,
    assetId: row.assetId,
    partnerOrganizationId: row.partnerOrganizationId,
    status: row.status,
    referenceNumber: row.referenceNumber,
    reportedAt: row.reportedAt,
    notes: row.notes,
    callCentreNotes: row.callCentreNotes ?? [],
    lastLocationAt: row.lastLocationAt,
    lastLocation: row.lastLocation,
    legalHold: row.legalHold,
    closedAt: row.closedAt ?? null,
    sapsCaseNumber: row.sapsCaseNumber ?? null,
    reportingStation: row.reportingStation ?? null,
    reportedToPoliceAt: row.reportedToPoliceAt ?? null,
    policeReportHistory: row.policeReportHistory ?? [],
    policeReportReminderSentAt: row.policeReportReminderSentAt ?? null,
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
  return `RC-${ymd}-${suffix}`;
}

export function serializeRecoveryCase(doc: RecoveryCaseDocument) {
  return {
    id: doc.id,
    assetId: doc.assetId,
    status: doc.status,
    referenceNumber: doc.referenceNumber,
    reportedAt: doc.reportedAt.toISOString(),
    notes: doc.notes,
    lastLocationAt: doc.lastLocationAt?.toISOString() ?? null,
  };
}

export function serializeSecurityRecoveryCase(doc: RecoveryCaseDocument) {
  return {
    ...serializeRecoveryCase(doc),
    accountId: doc.accountId,
    partnerOrganizationId: doc.partnerOrganizationId,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function createRecoveryCasesRepo(db: Db) {
  const collection = (): Collection<RecoveryCaseDbRow> =>
    db.collection<RecoveryCaseDbRow>('recovery_cases');

  return {
    async createForAccount(
      accountId: string,
      assetId: string,
      notes: string | null,
      partnerOrganizationId: string | null,
    ): Promise<RecoveryCaseDocument> {
      const now = new Date();
      const doc: Omit<RecoveryCaseDbRow, '_id'> = {
        accountId,
        assetId,
        partnerOrganizationId,
        status: 'open',
        referenceNumber: generateReferenceNumber(),
        reportedAt: now,
        notes,
        callCentreNotes: [],
        lastLocationAt: null,
        lastLocation: null,
        legalHold: false,
        closedAt: null,
        sapsCaseNumber: null,
        reportingStation: null,
        reportedToPoliceAt: null,
        policeReportHistory: [],
        policeReportReminderSentAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const result = await collection().insertOne(doc as RecoveryCaseDbRow);
      return toCase({ _id: result.insertedId, ...doc });
    },

    async listByAccount(
      accountId: string,
      limit: number,
      cursor: MongoDecodedCursor | null,
    ): Promise<RecoveryCaseDocument[]> {
      const rows = await collection()
        .find({ accountId, ...mongoCursorFilter(cursor) })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map(toCase);
    },

    async findByIdForAccount(accountId: string, caseId: string): Promise<RecoveryCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      const row = await collection().findOne({ _id: new ObjectId(caseId), accountId });
      return row ? toCase(row) : null;
    },

    async listForPartnerOrg(
      partnerOrganizationId: string,
      filters: { status?: RecoveryCaseStatus },
      limit: number,
      cursor: MongoDecodedCursor | null,
    ): Promise<RecoveryCaseDocument[]> {
      const statusFilter = filters.status ? { status: filters.status } : {};
      const query = {
        $or: [
          { partnerOrganizationId },
          { partnerOrganizationId: null, status: 'open' as RecoveryCaseStatus },
        ],
        ...statusFilter,
        ...mongoCursorFilter(cursor),
      };
      // SR-011-1a: police-report fields are excluded at the query level — never fetched
      // into `rows`, so `serializeSecurityRecoveryCase` structurally cannot see them.
      const rows = await collection()
        .find(query)
        .project<RecoveryCaseDbRow>(POLICE_REPORT_FIELD_EXCLUSION_PROJECTION)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map(toCase);
    },

    async claimForPartnerOrg(
      partnerOrganizationId: string,
      caseId: string,
    ): Promise<RecoveryCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      // SR-011-1a: project police-report fields out of this write-path read-back too —
      // every partner-facing response (`serializeSecurityRecoveryCase`) must be built
      // from a row that never had these fields loaded.
      const result = await collection().findOneAndUpdate(
        { _id: new ObjectId(caseId), partnerOrganizationId: null, status: 'open' },
        { $set: { partnerOrganizationId, status: 'investigating', updatedAt: new Date() } },
        { returnDocument: 'after', projection: POLICE_REPORT_FIELD_EXCLUSION_PROJECTION },
      );
      return result ? toCase(result as unknown as RecoveryCaseDbRow) : null;
    },

    async findByIdForPartnerOrg(
      partnerOrganizationId: string,
      caseId: string,
    ): Promise<RecoveryCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      // SR-011-1a: police-report fields excluded at the query level.
      const row = await collection().findOne(
        {
          _id: new ObjectId(caseId),
          $or: [{ partnerOrganizationId }, { partnerOrganizationId: null }],
        },
        { projection: POLICE_REPORT_FIELD_EXCLUSION_PROJECTION },
      );
      return row ? toCase(row as unknown as RecoveryCaseDbRow) : null;
    },

    async updateStatusForPartnerOrg(
      partnerOrganizationId: string,
      caseId: string,
      status: RecoveryCaseStatus,
    ): Promise<RecoveryCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      // SR-review fix: a case must already be claimed by this org (partnerOrganizationId
      // must already equal the caller's org) before its status can be changed here. Claiming
      // an unclaimed case (partnerOrganizationId: null) is only permitted via
      // claimForPartnerOrg, which enforces the open -> investigating transition. Without this
      // restriction an operator could claim AND close/resolve an unclaimed case in one PATCH,
      // bypassing the investigation step entirely.
      //
      // Feature 011 / SR-011-4: `closedAt` is set here, once, ONLY on the transition into
      // `'closed'` — this is the sole status-transition write path for recovery_cases
      // today (no customer-side or admin-side close path exists). Without this, the
      // police-report retention-expiry job (database-design.md §5) would never match any
      // document, and the police-report triple would be retained indefinitely.
      const setFields: { status: RecoveryCaseStatus; updatedAt: Date; closedAt?: Date } = {
        status,
        updatedAt: new Date(),
      };
      if (status === 'closed') {
        setFields.closedAt = new Date();
      }
      const result = await collection().findOneAndUpdate(
        {
          _id: new ObjectId(caseId),
          partnerOrganizationId,
        },
        { $set: setFields },
        { returnDocument: 'after', projection: POLICE_REPORT_FIELD_EXCLUSION_PROJECTION },
      );
      return result ? toCase(result as unknown as RecoveryCaseDbRow) : null;
    },

    async getLocationForCase(
      accountId: string,
      caseId: string,
    ): Promise<LastKnownLocation | null> {
      const doc = await this.findByIdForAccount(accountId, caseId);
      return doc?.lastLocation ?? null;
    },

    async appendCallCentreNote(
      caseId: string,
      agentAccountId: string,
      text: string,
    ): Promise<RecoveryCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      const note: CallCentreNote = {
        agentAccountId,
        text,
        createdAt: new Date(),
      };
      const result = await collection().findOneAndUpdate(
        { _id: new ObjectId(caseId) },
        {
          $push: { callCentreNotes: note },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: 'after' },
      );
      return result ? toCase(result) : null;
    },

    /**
     * Feature 011 (SAPS case-number capture) — customer-only. Sets/clears one or more of
     * `sapsCaseNumber` / `reportingStation` / `reportedToPoliceAt` on a caller-owned case,
     * appending one `PoliceReportChange` history entry per field that actually changed
     * value (api-design.md §2.5 — no-op suppression: a field re-submitted with the same
     * value produces no history entry and does not count against the maxItems cap).
     *
     * Read-modify-write inside the repository (not a bare `$set`) because `previousValue`
     * has to be computed from the current document — architecture-review.md §5.
     */
    async setPoliceReportFields(
      accountId: string,
      caseId: string,
      actorAccountId: string,
      changes: Partial<{
        sapsCaseNumber: string | null;
        reportingStation: string | null;
        reportedToPoliceAt: Date | null;
      }>,
    ): Promise<
      | { ok: true; case: RecoveryCaseDocument }
      | { ok: false; reason: 'not_found' }
      | { ok: false; reason: 'retention_expired' }
      | { ok: false; reason: 'history_limit_exceeded' }
    > {
      if (!ObjectId.isValid(caseId)) return { ok: false, reason: 'not_found' };
      const current = await collection().findOne({ _id: new ObjectId(caseId), accountId });
      if (!current) return { ok: false, reason: 'not_found' };

      // SR-011-2: reject rather than accept-then-silently-purge on a case whose
      // police-report retention window has already expired (database-design.md §5.3's
      // purge job would clear this on its next run with no user-visible signal).
      if (
        current.status === 'closed' &&
        current.closedAt != null &&
        !current.legalHold &&
        current.closedAt <= retentionCutoff()
      ) {
        return { ok: false, reason: 'retention_expired' };
      }

      const toDateOnlyString = (d: Date | null): string | null =>
        d ? d.toISOString().slice(0, 10) : null;

      const existingHistory = current.policeReportHistory ?? [];
      const newEntries: PoliceReportChange[] = [];
      const setUpdate: Record<string, string | Date | null> = {};

      if ('sapsCaseNumber' in changes) {
        const previousValue = current.sapsCaseNumber ?? null;
        const newValue = changes.sapsCaseNumber ?? null;
        if (previousValue !== newValue) {
          newEntries.push({
            actorAccountId,
            field: 'sapsCaseNumber',
            previousValue,
            newValue,
            changedAt: new Date(),
          });
          setUpdate.sapsCaseNumber = newValue;
        }
      }
      if ('reportingStation' in changes) {
        const previousValue = current.reportingStation ?? null;
        const newValue = changes.reportingStation ?? null;
        if (previousValue !== newValue) {
          newEntries.push({
            actorAccountId,
            field: 'reportingStation',
            previousValue,
            newValue,
            changedAt: new Date(),
          });
          setUpdate.reportingStation = newValue;
        }
      }
      if ('reportedToPoliceAt' in changes) {
        const previousValue = toDateOnlyString(current.reportedToPoliceAt ?? null);
        const newValue = toDateOnlyString(changes.reportedToPoliceAt ?? null);
        if (previousValue !== newValue) {
          newEntries.push({
            actorAccountId,
            field: 'reportedToPoliceAt',
            previousValue,
            newValue,
            changedAt: new Date(),
          });
          setUpdate.reportedToPoliceAt = changes.reportedToPoliceAt ?? null;
        }
      }

      // Nothing actually changed (every provided field was a no-op resubmission) —
      // return the current state as-is, no write, no history entry.
      if (newEntries.length === 0) {
        return { ok: true, case: toCase(current) };
      }

      if (existingHistory.length + newEntries.length > MAX_POLICE_REPORT_HISTORY_ITEMS) {
        return { ok: false, reason: 'history_limit_exceeded' };
      }

      const result = await collection().findOneAndUpdate(
        { _id: new ObjectId(caseId), accountId },
        {
          $set: { ...setUpdate, updatedAt: new Date() },
          $push: { policeReportHistory: { $each: newEntries } },
        },
        { returnDocument: 'after' },
      );
      if (!result) return { ok: false, reason: 'not_found' };
      return { ok: true, case: toCase(result) };
    },
  };
}

function retentionCutoff(): Date {
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - POLICE_REPORT_RETENTION_YEARS);
  return cutoff;
}

export type RecoveryCasesRepo = ReturnType<typeof createRecoveryCasesRepo>;
