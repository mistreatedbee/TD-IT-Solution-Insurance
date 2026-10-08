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

function matchesOperatorValue(actual: unknown, expected: unknown): boolean {
  if (
    expected !== null &&
    typeof expected === 'object' &&
    !(expected instanceof Date) &&
    !Array.isArray(expected) &&
    !(expected instanceof ObjectId)
  ) {
    return Object.entries(expected as Record<string, unknown>).every(([op, opVal]) => {
      switch (op) {
        case '$nin':
          return !(opVal as unknown[]).includes(actual);
        case '$in':
          return (opVal as unknown[]).includes(actual);
        case '$ne':
          return actual !== opVal;
        case '$gt':
          return actual instanceof Date && opVal instanceof Date
            ? actual.getTime() > opVal.getTime()
            : (actual as number) > (opVal as number);
        case '$lt':
          return actual instanceof Date && opVal instanceof Date
            ? actual.getTime() < opVal.getTime()
            : (actual as number) < (opVal as number);
        default:
          return actual === expected;
      }
    });
  }
  if (expected === null) return actual === null || actual === undefined;
  return actual === expected;
}

function matches(doc: RawDoc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') {
      return (value as Array<Record<string, unknown>>).some((sub) => matches(doc, sub));
    }
    if (key === '$and') {
      return (value as Array<Record<string, unknown>>).every((sub) => matches(doc, sub));
    }
    if (key === '_id') {
      if (value instanceof ObjectId) {
        return doc._id instanceof ObjectId && value.equals(doc._id);
      }
      // Operator form, e.g. `{ $lt: new ObjectId(cursor.id) }` (lib/mongo-pagination.ts's
      // `mongoCursorFilter`) — compare via hex-string ordering, which matches real
      // MongoDB ObjectId ordering for ids generated in creation order (SR-009S-5).
      const operatorValue = value as Record<string, unknown>;
      const asHexOperators = Object.fromEntries(
        Object.entries(operatorValue).map(([op, opVal]) => [
          op,
          opVal instanceof ObjectId ? opVal.toHexString() : opVal,
        ]),
      );
      return matchesOperatorValue(doc._id.toHexString(), asHexOperators);
    }
    return matchesOperatorValue(doc[key], value);
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
    async countDocuments(filter: Record<string, unknown>) {
      return docs.filter((d) => matches(d, filter)).length;
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
      expect(row.tier).toBe('claimed');
      // Police-report fields are projected out at the query level — they are never
      // fetched into the row at all, so they cannot be present on the returned `case`
      // shape (not merely null-by-convention).
      expect(row.case).not.toHaveProperty('sapsCaseNumber');
      expect(row.case).not.toHaveProperty('reportingStation');
      expect(row.case).not.toHaveProperty('reportedToPoliceAt');
      expect(row.case).not.toHaveProperty('policeReportHistory');
      expect(row.case).not.toHaveProperty('policeReportReminderSentAt');
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
      expect(row!.tier).toBe('claimed');
      expect(row!.case).not.toHaveProperty('sapsCaseNumber');
      expect(row!.case).not.toHaveProperty('reportingStation');
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

      const row = await repo.updateStatusForPartnerOrg(
        'org-1',
        id.toHexString(),
        'tracking',
        'investigating',
      );

      expect(row).not.toBeNull();
      expect(row!.sapsCaseNumber).toBeNull();
    });
  });

  describe('SR-011-4 + C-011-11: closedAt setter', () => {
    it('sets closedAt on the transition into "closed"', async () => {
      const id = new ObjectId();
      const { db, docs } = createFakeDb([
        baseDoc({ _id: id, partnerOrganizationId: 'org-1', status: 'investigating', closedAt: null }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const tracking = await repo.updateStatusForPartnerOrg('org-1', id.toHexString(), 'tracking', 'investigating');
      expect(tracking!.closedAt).toBeNull();
      expect(docs[0]!.closedAt).toBeNull();

      const closed = await repo.updateStatusForPartnerOrg('org-1', id.toHexString(), 'closed', 'tracking');
      expect(closed).not.toBeNull();
      expect(docs[0]!.closedAt).toBeInstanceOf(Date);
    });

    it('C-011-11: also sets closedAt on the transition into "recovered", not just "closed"', async () => {
      // security-review.md §9.2/§9.6 — the retention clock starts on entry to ANY
      // terminal state. A case that reaches "recovered" and is never separately,
      // administratively "closed" must still start its retention clock.
      const id = new ObjectId();
      const { db, docs } = createFakeDb([
        baseDoc({ _id: id, partnerOrganizationId: 'org-1', status: 'tracking', closedAt: null }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const recovered = await repo.updateStatusForPartnerOrg('org-1', id.toHexString(), 'recovered', 'tracking');
      expect(recovered).not.toBeNull();
      expect(docs[0]!.closedAt).toBeInstanceOf(Date);
    });

    it('does not overwrite an already-set closedAt on a subsequent terminal-to-terminal transition', async () => {
      // A case can legitimately move recovered -> closed (operator administratively
      // closes a case whose asset was already recovered). closedAt must not be reset
      // by that second terminal transition, or the retention clock would silently
      // extend past what C-011-11's ruling intends (database-design.md §5.2 already
      // ruled out resetting the retention clock on edit).
      const id = new ObjectId();
      const closedAt = new Date('2026-01-01T00:00:00.000Z');
      const { db, docs } = createFakeDb([
        baseDoc({ _id: id, partnerOrganizationId: 'org-1', status: 'recovered', closedAt }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      await repo.updateStatusForPartnerOrg('org-1', id.toHexString(), 'closed', 'recovered');
      expect(docs[0]!.closedAt).toEqual(closedAt);
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

      await repo.updateStatusForPartnerOrg('org-1', id.toHexString(), 'recovered', 'closed');
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

  describe('PDM-1: accountId never reaches a partner-facing `case` shape', () => {
    it('listForPartnerOrg exposes accountId only at the top level of the result, never inside `case`', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({ _id: id, accountId: 'real-customer-account-id', partnerOrganizationId: 'org-1' }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const rows = await repo.listForPartnerOrg('org-1', {}, 10, null);

      expect(rows).toHaveLength(1);
      expect(rows[0]!.accountId).toBe('real-customer-account-id');
      expect(rows[0]!.case).not.toHaveProperty('accountId');
    });

    it('findByIdForPartnerOrg exposes accountId only at the top level, never inside `case` (claimed tier)', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({ _id: id, accountId: 'real-customer-account-id', partnerOrganizationId: 'org-1' }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.findByIdForPartnerOrg('org-1', id.toHexString());

      expect(result).not.toBeNull();
      expect(result!.tier).toBe('claimed');
      expect(result!.accountId).toBe('real-customer-account-id');
      expect(result!.case).not.toHaveProperty('accountId');
    });

    it('findByIdForPartnerOrg exposes accountId only at the top level, never inside `case` (offer tier)', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({
          _id: id,
          accountId: 'real-customer-account-id',
          partnerOrganizationId: null,
          status: 'open',
        }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.findByIdForPartnerOrg('org-1', id.toHexString());

      expect(result).not.toBeNull();
      expect(result!.tier).toBe('offer');
      expect(result!.accountId).toBe('real-customer-account-id');
      expect(result!.case).not.toHaveProperty('accountId');
    });
  });

  describe('PDM-2: tiered projections by claim state', () => {
    it('offer tier (unclaimed) excludes notes, assetId, lastLocation, lastLocationAt, callCentreNotes', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({
          _id: id,
          partnerOrganizationId: null,
          status: 'open',
          notes: 'Stolen from my car outside Sandton City, SAPS case 123/01/2026',
          assetId: 'asset-sensitive',
          lastLocation: { latitude: -26.1, longitude: 28.0, recordedAt: new Date(), accuracyMeters: 10 },
          lastLocationAt: new Date(),
          callCentreNotes: [{ agentAccountId: 'agent-1', text: 'called customer', createdAt: new Date() }],
        }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.findByIdForPartnerOrg('org-1', id.toHexString());

      expect(result).not.toBeNull();
      expect(result!.tier).toBe('offer');
      for (const key of ['notes', 'assetId', 'lastLocation', 'lastLocationAt', 'callCentreNotes']) {
        expect(result!.case).not.toHaveProperty(key);
      }
    });

    it('claimed tier (Tier 1) excludes callCentreNotes and lastLocation but keeps notes/assetId/lastLocationAt', async () => {
      const id = new ObjectId();
      const lastLocationAt = new Date('2026-08-01T00:00:00.000Z');
      const { db } = createFakeDb([
        baseDoc({
          _id: id,
          partnerOrganizationId: 'org-1',
          notes: 'Stolen laptop, last seen at the office',
          assetId: 'asset-1',
          lastLocation: { latitude: -26.1, longitude: 28.0, recordedAt: new Date(), accuracyMeters: 10 },
          lastLocationAt,
          callCentreNotes: [{ agentAccountId: 'agent-1', text: 'called customer', createdAt: new Date() }],
        }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.findByIdForPartnerOrg('org-1', id.toHexString());

      expect(result).not.toBeNull();
      expect(result!.tier).toBe('claimed');
      expect(result!.case).not.toHaveProperty('callCentreNotes');
      expect(result!.case).not.toHaveProperty('lastLocation');
      const claimedCase = result!.case as { notes: string | null; assetId: string; lastLocationAt: Date | null };
      expect(claimedCase.notes).toBe('Stolen laptop, last seen at the office');
      expect(claimedCase.assetId).toBe('asset-1');
      expect(claimedCase.lastLocationAt).toEqual(lastLocationAt);
    });
  });

  describe('PDM-3: list/count/detail share the same narrowed visibility predicate', () => {
    it('findByIdForPartnerOrg matches listForPartnerOrg exactly for an unclaimed, open case (F-4)', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([baseDoc({ _id: id, partnerOrganizationId: null, status: 'open' })]);
      const repo = createRecoveryCasesRepo(db);

      const [listRows, detail] = await Promise.all([
        repo.listForPartnerOrg('org-1', {}, 10, null),
        repo.findByIdForPartnerOrg('org-1', id.toHexString()),
      ]);

      expect(listRows).toHaveLength(1);
      expect(detail).not.toBeNull();
      expect(detail!.tier).toBe('offer');
    });

    it('findByIdForPartnerOrg returns null for an unclaimed case that is NOT open (e.g. investigating by nobody is impossible, but a stale non-open/null-org row must not leak)', async () => {
      // Regression for the pre-PDM-3 bug: findByIdForPartnerOrg's unclaimed branch used
      // to be `{ partnerOrganizationId: null }` with no status constraint — wider than
      // buildPartnerOrgQuery's list filter. A null-org case in any non-'open' status
      // (e.g. data migrated from a legacy state) must now be invisible via detail too.
      const id = new ObjectId();
      const { db } = createFakeDb([baseDoc({ _id: id, partnerOrganizationId: null, status: 'closed' })]);
      const repo = createRecoveryCasesRepo(db);

      const detail = await repo.findByIdForPartnerOrg('org-1', id.toHexString());

      expect(detail).toBeNull();
    });

    it('countForPartnerOrg equals listForPartnerOrg length for the same filters (C-012-3 extended)', async () => {
      const orgId = 'org-1';
      const { db } = createFakeDb([
        baseDoc({ _id: new ObjectId(), partnerOrganizationId: null, status: 'open' }),
        baseDoc({ _id: new ObjectId(), partnerOrganizationId: orgId, status: 'investigating' }),
        baseDoc({ _id: new ObjectId(), partnerOrganizationId: 'org-2', status: 'investigating' }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const [rows, count] = await Promise.all([
        repo.listForPartnerOrg(orgId, {}, 10, null),
        repo.countForPartnerOrg(orgId, {}),
      ]);

      expect(count).toBe(2);
      expect(rows).toHaveLength(2);
    });
  });

  describe('PDM-4: 90-day wrap-up window', () => {
    it('a claimed case still shows in list/count/detail within the 90-day window after closedAt', async () => {
      const recentlyClosed = new Date();
      recentlyClosed.setUTCDate(recentlyClosed.getUTCDate() - 10);
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({ _id: id, partnerOrganizationId: 'org-1', status: 'closed', closedAt: recentlyClosed }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const [rows, count, detail] = await Promise.all([
        repo.listForPartnerOrg('org-1', {}, 10, null),
        repo.countForPartnerOrg('org-1', {}),
        repo.findByIdForPartnerOrg('org-1', id.toHexString()),
      ]);

      expect(rows).toHaveLength(1);
      expect(count).toBe(1);
      expect(detail).not.toBeNull();
    });

    it('a claimed case drops out of list/count/detail once closedAt is more than 90 days ago', async () => {
      const longAgo = new Date();
      longAgo.setUTCDate(longAgo.getUTCDate() - 91);
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({ _id: id, partnerOrganizationId: 'org-1', status: 'closed', closedAt: longAgo }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const [rows, count, detail] = await Promise.all([
        repo.listForPartnerOrg('org-1', {}, 10, null),
        repo.countForPartnerOrg('org-1', {}),
        repo.findByIdForPartnerOrg('org-1', id.toHexString()),
      ]);

      expect(rows).toHaveLength(0);
      expect(count).toBe(0);
      expect(detail).toBeNull();
    });

    it('a claimed case past the 90-day window but still open-status (not terminal) remains visible', async () => {
      // The wrap-up window only applies to terminal statuses (recovered/closed) that
      // have actually closed — a long-running 'investigating'/'tracking' case with no
      // closedAt must not be dropped merely because it is old.
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({ _id: id, partnerOrganizationId: 'org-1', status: 'investigating', closedAt: null }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const detail = await repo.findByIdForPartnerOrg('org-1', id.toHexString());

      expect(detail).not.toBeNull();
    });

    it('a recovered (not yet closed) case past 90 days also drops out (closedAt is set on entry to recovered too)', async () => {
      const longAgo = new Date();
      longAgo.setUTCDate(longAgo.getUTCDate() - 120);
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({ _id: id, partnerOrganizationId: 'org-1', status: 'recovered', closedAt: longAgo }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const detail = await repo.findByIdForPartnerOrg('org-1', id.toHexString());

      expect(detail).toBeNull();
    });
  });

  describe('SR-009S-5: listForPartnerOrg preserves the full visibility predicate across a non-null cursor', () => {
    it('a page-2 request with a real cursor still hides a wrap-up-window-expired case (andFilters regression)', async () => {
      // Regression for the pre-fix bug `andFilters()` replaced: `claimedCaseVisiblePredicate()`
      // returns `{ partnerOrganizationId, $or: [...wrap-up-window conditions...] }`. A naive
      // object spread of that together with `mongoCursorFilter()`'s own `$or` (used whenever
      // a cursor is present) makes the LATER spread's `$or` key silently replace the EARLIER
      // one — the org-id key survives (it isn't inside the `$or`), but the entire PDM-3/PDM-4
      // wrap-up-window `$or` is lost. The visible symptom: a page-1 request (cursor: null,
      // no $or collision) correctly hides an org's own case once it is more than 90 days past
      // closure, but a page-2+ request (cursor present) would have let it reappear. All prior
      // tests in this suite pass `cursor: null`, so this is the only test exercising the
      // merged-`$and`-of-two-`$or`s path this org-scoping bug actually lived in.
      const now = new Date('2026-08-10T00:00:00.000Z');
      const longAgo = new Date(now);
      longAgo.setUTCDate(longAgo.getUTCDate() - 120); // outside the 90-day wrap-up window
      const newest = { _id: new ObjectId(), createdAt: new Date(now.getTime()) }; // org-1, page 1
      const expired = { _id: new ObjectId(), createdAt: new Date(now.getTime() - 60_000) }; // org-1, must stay hidden on every page
      const stillVisible = { _id: new ObjectId(), createdAt: new Date(now.getTime() - 120_000) }; // org-1, legitimately visible page-2 case

      const { db } = createFakeDb([
        baseDoc({ ...newest, partnerOrganizationId: 'org-1', status: 'investigating' }),
        baseDoc({ ...expired, partnerOrganizationId: 'org-1', status: 'closed', closedAt: longAgo }),
        baseDoc({ ...stillVisible, partnerOrganizationId: 'org-1', status: 'investigating' }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const page1 = await repo.listForPartnerOrg('org-1', {}, 1, null);
      expect(page1).toHaveLength(1);
      expect(page1[0]!.case.id).toBe(newest._id.toHexString());

      const cursor = { createdAt: page1[0]!.createdAt, id: page1[0]!.case.id };
      const page2 = await repo.listForPartnerOrg('org-1', {}, 10, cursor);

      // Must contain org-1's other legitimately-visible older case, and must NOT contain the
      // wrap-up-window-expired case, even though it sorts between the cursor position and the
      // still-visible case — exactly where the lost `$or` would have let it leak back in.
      expect(page2.map((r) => r.case.id)).toEqual([stillVisible._id.toHexString()]);
      expect(page2.map((r) => r.case.id)).not.toContain(expired._id.toHexString());

      // The detail route must agree with list — PDM-3's "cannot structurally diverge" guarantee.
      const detail = await repo.findByIdForPartnerOrg('org-1', expired._id.toHexString());
      expect(detail).toBeNull();
    });
  });

  describe('ADR-0006 §18.8 C-A: updateStatusForPartnerOrg compare-and-set on expectedStatus', () => {
    it('applies the update when expectedStatus matches the document’s current status', async () => {
      const id = new ObjectId();
      const { db } = createFakeDb([
        baseDoc({ _id: id, partnerOrganizationId: 'org-1', status: 'investigating' }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.updateStatusForPartnerOrg('org-1', id.toHexString(), 'tracking', 'investigating');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('tracking');
    });

    it('rejects (returns null) when expectedStatus no longer matches — the race-condition regression case', async () => {
      // Simulates two operators retrying a status change: the first call already moved
      // the case from 'investigating' to 'tracking'; a second, stale request still
      // believes the case is 'investigating' and must fail its compare-and-set rather
      // than silently applying an update derived from stale state.
      const id = new ObjectId();
      const { db, docs } = createFakeDb([
        baseDoc({ _id: id, partnerOrganizationId: 'org-1', status: 'tracking' }),
      ]);
      const repo = createRecoveryCasesRepo(db);

      const result = await repo.updateStatusForPartnerOrg('org-1', id.toHexString(), 'recovered', 'investigating');

      expect(result).toBeNull();
      // The document must be left exactly as it was — no partial/incorrect mutation.
      expect(docs[0]!.status).toBe('tracking');
    });
  });
});
