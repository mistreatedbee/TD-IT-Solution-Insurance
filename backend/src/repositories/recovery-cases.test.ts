/**
 * Feature 011 (SAPS case-number capture) — repository-level tests.
 *
 * SR-011-1a (security-review.md): the partner/security-company read paths
 * (`listForPartnerOrg`, `findByIdForPartnerOrg`, and the write-path read-backs in
 * `claimForPartnerOrg`/`updateStatusForPartnerOrg`) must apply a Mongo projection that
 * EXCLUDES the police-report fields at the query level — never even fetching them into
 * the row object the serializer touches. This file exercises that against a small
 * in-memory fake of the subset of the MongoDB driver surface this repository actually
 * uses (find/findOne/findOneAndUpdate + real `projection`/`$or` semantics), so the
 * guarantee is a genuine, always-runs, merge-blocking regression test — not an
 * integration test that silently no-ops when no local MongoDB is available (the
 * weakness of this repo's existing `plan-catalog.test.ts` "skip if unreachable"
 * pattern, deliberately not repeated here for this specific guarantee).
 *
 * Also covers: C-011-8 append-only history, no-op suppression (api-design.md §2.5),
 * SR-011-3 maxItems cap, SR-011-2 retention-expiry rejection, and SR-011-4's `closedAt`
 * setter on the `'closed'` transition.
 */
import { describe, it, expect } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import {
  createRecoveryCasesRepo,
  MAX_POLICE_REPORT_HISTORY_ITEMS,
  type RecoveryCaseDocument,
} from './recovery-cases.js';

type RawDoc = Record<string, unknown> & { _id: ObjectId };

function matches(doc: RawDoc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') {
      return (value as Array<Record<string, unknown>>).some((sub) => matches(doc, sub));
    }
    if (key === '_id') {
      return doc._id instanceof ObjectId && (value as ObjectId).equals(doc._id);
    }
    return doc[key] === value;
  });
}

function applyExclusionProjection(doc: RawDoc, projection?: Record<string, 0 | 1>): RawDoc {
  if (!projection) return doc;
  const result: RawDoc = { ...doc };
  for (const key of Object.keys(projection)) {
    delete result[key];
  }
  return result;
}

/**
 * Minimal fake of the `Collection` surface `createRecoveryCasesRepo` calls, with real
 * `$or` filter matching and real projection-exclusion semantics — deliberately not a
 * full MongoDB driver reimplementation, just enough to make the projection guarantee
 * genuinely testable without live infrastructure.
 */
function createFakeDb(seed: RawDoc[]): { db: Db; docs: RawDoc[] } {
  const docs = seed.map((d) => ({ ...d }));

  const collection = {
    async insertOne(doc: Omit<RawDoc, '_id'> & { _id?: ObjectId }) {
      const _id = doc._id ?? new ObjectId();
      docs.push({ ...doc, _id } as RawDoc);
      return { insertedId: _id };
    },
    find(filter: Record<string, unknown>) {
      let results = docs.filter((d) => matches(d, filter));
      let projection: Record<string, 0 | 1> | undefined;
      const cursor = {
        project(p: Record<string, 0 | 1>) {
          projection = p;
          return cursor;
        },
        sort() {
          return cursor;
        },
        limit(n: number) {
          results = results.slice(0, n);
          return cursor;
        },
        async toArray() {
          return results.map((d) => applyExclusionProjection(d, projection));
        },
      };
      return cursor;
    },
    async findOne(filter: Record<string, unknown>, opts?: { projection?: Record<string, 0 | 1> }) {
      const found = docs.find((d) => matches(d, filter));
      if (!found) return null;
      return applyExclusionProjection(found, opts?.projection);
    },
    async findOneAndUpdate(
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown>; $push?: Record<string, unknown> },
      opts?: { projection?: Record<string, 0 | 1> },
    ) {
      const idx = docs.findIndex((d) => matches(d, filter));
      if (idx < 0) return null;
      const current = docs[idx]!;
      if (update.$set) Object.assign(current, update.$set);
      if (update.$push) {
        for (const [key, pushVal] of Object.entries(update.$push)) {
          const existing = (current[key] as unknown[]) ?? [];
          const toAdd =
            pushVal && typeof pushVal === 'object' && '$each' in (pushVal as Record<string, unknown>)
              ? ((pushVal as Record<string, unknown>).$each as unknown[])
              : [pushVal];
          current[key] = [...existing, ...toAdd];
        }
      }
      docs[idx] = current;
      return applyExclusionProjection(current, opts?.projection);
    },
  };

  const db = {
    collection: () => collection,
  } as unknown as Db;

  return { db, docs };
}

function baseDoc(overrides: Partial<RawDoc> = {}): RawDoc {
  const now = new Date('2026-08-01T12:00:00.000Z');
  return {
    _id: new ObjectId(),
    accountId: 'acct-1',
    assetId: 'asset-1',
    partnerOrganizationId: null,
    status: 'open',
    referenceNumber: 'RC-20260801-ABCD',
    reportedAt: now,
    notes: null,
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
    ...overrides,
  };
}

describe('recovery-cases repository — Feature 011 (SAPS case-number capture)', () => {
  describe('SR-011-1a: partner-facing reads project police-report fields out', () => {
    it('listForPartnerOrg never returns police-report fields, even when they are set', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({
          _id: id,
          partnerOrganizationId: 'org-1',
          sapsCaseNumber: 'CAS-123/01/2026',
          reportingStation: 'Sandton SAPS',
          reportedToPoliceAt: new Date('2026-08-02T00:00:00.000Z'),
          policeReportHistory: [
            {
              actorAccountId: 'acct-1',
              field: 'sapsCaseNumber',
              previousValue: null,
              newValue: 'CAS-123/01/2026',
              changedAt: new Date('2026-08-02T00:00:00.000Z'),
            },
          ],
          policeReportReminderSentAt: new Date('2026-08-04T00:00:00.000Z'),
        }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const rows = await repo.listForPartnerOrg('org-1', {}, 10, null);

      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.sapsCaseNumber).toBeNull();
      expect(row.reportingStation).toBeNull();
      expect(row.reportedToPoliceAt).toBeNull();
      expect(row.policeReportHistory).toEqual([]);
      expect(row.policeReportReminderSentAt).toBeNull();
    });

    it('findByIdForPartnerOrg never returns police-report fields, even when they are set', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({
          _id: id,
          partnerOrganizationId: 'org-1',
          sapsCaseNumber: 'CAS-999/02/2026',
          reportingStation: 'Rosebank SAPS',
        }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const row = await repo.findByIdForPartnerOrg('org-1', id.toHexString());

      expect(row).not.toBeNull();
      expect(row!.sapsCaseNumber).toBeNull();
      expect(row!.reportingStation).toBeNull();
    });

    it('claimForPartnerOrg (write-path read-back) never returns police-report fields', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({
          _id: id,
          partnerOrganizationId: null,
          status: 'open',
          sapsCaseNumber: 'CAS-1/1/2026',
        }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const row = await repo.claimForPartnerOrg('org-1', id.toHexString());

      expect(row).not.toBeNull();
      expect(row!.sapsCaseNumber).toBeNull();
    });

    it('updateStatusForPartnerOrg (write-path read-back) never returns police-report fields', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({
          _id: id,
          partnerOrganizationId: 'org-1',
          status: 'investigating',
          sapsCaseNumber: 'CAS-1/1/2026',
        }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const row = await repo.updateStatusForPartnerOrg('org-1', id.toHexString(), 'tracking');

      expect(row).not.toBeNull();
      expect(row!.sapsCaseNumber).toBeNull();
    });
  });

  describe('SR-011-4: closedAt setter', () => {
    it('sets closedAt only on the transition into "closed"', async () => {
      const id = new ObjectId();
      const { db, docs } = createFakeDb([
        baseDoc({ _id: id, partnerOrganizationId: 'org-1', status: 'investigating', closedAt: null }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const tracking = await repo.updateStatusForPartnerOrg('org-1', id.toHexString(), 'tracking');
      expect(tracking!.closedAt).toBeNull();
      expect(docs[0]!.closedAt).toBeNull();

      const closed = await repo.updateStatusForPartnerOrg('org-1', id.toHexString(), 'closed');
      expect(closed).not.toBeNull();
      expect(docs[0]!.closedAt).toBeInstanceOf(Date);
    });

    it('does not overwrite closedAt on a subsequent non-closing status change', async () => {
      // Not directly reachable via updateStatusForPartnerOrg (status enum has no
      // "reopen" transition today), but confirms the setter is conditional, not
      // unconditional, so a future status vocabulary change doesn't silently start
      // clobbering an already-set closedAt.
      const id = new ObjectId();
      const closedAt = new Date('2026-01-01T00:00:00.000Z');
      const { db, docs } = createFakeDb([
        baseDoc({ _id: id, partnerOrganizationId: 'org-1', status: 'closed', closedAt }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      await repo.updateStatusForPartnerOrg('org-1', id.toHexString(), 'recovered');
      expect(docs[0]!.closedAt).toEqual(closedAt);
    });
  });

  describe('setPoliceReportFields', () => {
    it('sets fields and appends one history entry per changed field, actor from the caller', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([baseDoc({ _id: id, accountId: 'acct-1' })]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.setPoliceReportFields('acct-1', id.toHexString(), 'acct-1', {
        sapsCaseNumber: '123/01/2026',
        reportingStation: 'Sandton SAPS',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.case.sapsCaseNumber).toBe('123/01/2026');
      expect(result.case.reportingStation).toBe('Sandton SAPS');
      expect(result.case.policeReportHistory).toHaveLength(2);
      expect(result.case.policeReportHistory.every((h) => h.actorAccountId === 'acct-1')).toBe(true);
      expect(result.case.policeReportHistory.map((h) => h.field).sort()).toEqual(
        ['reportingStation', 'sapsCaseNumber'].sort(),
      );
    });

    it('returns not_found for a case owned by a different account', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([baseDoc({ _id: id, accountId: 'acct-1' })]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.setPoliceReportFields('acct-2', id.toHexString(), 'acct-2', {
        sapsCaseNumber: '123/01/2026',
      });

      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });

    it('suppresses no-op history entries when a field is resubmitted unchanged (api-design.md §2.5)', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({ _id: id, accountId: 'acct-1', sapsCaseNumber: '123/01/2026' }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.setPoliceReportFields('acct-1', id.toHexString(), 'acct-1', {
        sapsCaseNumber: '123/01/2026',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.case.policeReportHistory).toHaveLength(0);
    });

    it('does not append a history entry for null === null (already-cleared field resubmitted)', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([baseDoc({ _id: id, accountId: 'acct-1' })]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.setPoliceReportFields('acct-1', id.toHexString(), 'acct-1', {
        reportingStation: null,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.case.policeReportHistory).toHaveLength(0);
    });

    it('rejects once the history cap would be exceeded (SR-011-3)', async () => {
      const id = new ObjectId();
      const existingHistory: RecoveryCaseDocument['policeReportHistory'] = Array.from(
        { length: MAX_POLICE_REPORT_HISTORY_ITEMS },
        (_, i) => ({
          actorAccountId: 'acct-1',
          field: 'sapsCaseNumber' as const,
          previousValue: i === 0 ? null : String(i - 1),
          newValue: String(i),
          changedAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
      );
      const { db } = createFakeDb([
        baseDoc({
          _id: id,
          accountId: 'acct-1',
          sapsCaseNumber: String(MAX_POLICE_REPORT_HISTORY_ITEMS - 1),
          policeReportHistory: existingHistory,
        }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.setPoliceReportFields('acct-1', id.toHexString(), 'acct-1', {
        sapsCaseNumber: 'one-more-change',
      });

      expect(result).toEqual({ ok: false, reason: 'history_limit_exceeded' });
    });

    it('rejects a PATCH on a case whose retention window has already expired (SR-011-2)', async () => {
      const id = new ObjectId();
      const longAgo = new Date();
      longAgo.setUTCFullYear(longAgo.getUTCFullYear() - 6);
      const { db } = createFakeDb([
        baseDoc({ _id: id, accountId: 'acct-1', status: 'closed', closedAt: longAgo, legalHold: false }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.setPoliceReportFields('acct-1', id.toHexString(), 'acct-1', {
        sapsCaseNumber: '1/1/2026',
      });

      expect(result).toEqual({ ok: false, reason: 'retention_expired' });
    });

    it('does not reject a retention-expired case that is under legalHold', async () => {
      const id = new ObjectId();
      const longAgo = new Date();
      longAgo.setUTCFullYear(longAgo.getUTCFullYear() - 6);
      const { db } = createFakeDb([
        baseDoc({ _id: id, accountId: 'acct-1', status: 'closed', closedAt: longAgo, legalHold: true }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.setPoliceReportFields('acct-1', id.toHexString(), 'acct-1', {
        sapsCaseNumber: '1/1/2026',
      });

      expect(result.ok).toBe(true);
    });

    it('accepts edits on a closed (not-yet-retention-expired) case — api-design.md §2.3', async () => {
      const id = new ObjectId();
      const recentlyClosed = new Date();
      recentlyClosed.setUTCMonth(recentlyClosed.getUTCMonth() - 1);
      const { db } = createFakeDb([
        baseDoc({ _id: id, accountId: 'acct-1', status: 'closed', closedAt: recentlyClosed }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.setPoliceReportFields('acct-1', id.toHexString(), 'acct-1', {
        sapsCaseNumber: '1/1/2026',
      });

      expect(result.ok).toBe(true);
    });

    it('accepts edits on a recovered case', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([baseDoc({ _id: id, accountId: 'acct-1', status: 'recovered' })]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.setPoliceReportFields('acct-1', id.toHexString(), 'acct-1', {
        sapsCaseNumber: '1/1/2026',
      });

      expect(result.ok).toBe(true);
    });
  });
});
