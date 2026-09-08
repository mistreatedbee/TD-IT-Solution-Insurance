/**
 * Feature 011 (SAPS case-number capture) — police-report retention-purge unit tests.
 *
 * SR-011-4 (security-review.md): confirms the clearing logic actually matches and
 * clears the documents the design intends, is consistent with the
 * `recovery_cases_closed_at_retention` partial index's `$type`-based filter (not the
 * earlier, broken `$ne`-based shape), excludes `legalHold: true` documents, and is a
 * true no-write dry-run. Uses a small in-memory fake of the Mongo `Collection` surface
 * this module actually calls (find/project/toArray + updateMany), following the same
 * pattern as `recovery-cases.test.ts` — no live MongoDB required.
 */
import { describe, it, expect } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import {
  buildRetentionPurgeFilter,
  computeRetentionCutoff,
  runPoliceReportRetentionPurge,
} from './police-report-retention.js';

type RawDoc = Record<string, unknown> & { _id: ObjectId };

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
    const ops = expected as Record<string, unknown>;
    return Object.entries(ops).every(([op, val]) => {
      switch (op) {
        case '$lte':
          return actual instanceof Date && val instanceof Date && actual.getTime() <= val.getTime();
        case '$ne':
          return actual !== val;
        case '$in':
          return Array.isArray(val) && val.includes(actual);
        case '$type': {
          if (val === 'string') return typeof actual === 'string';
          if (val === 'date') return actual instanceof Date;
          return false;
        }
        default:
          throw new Error(`Unsupported operator in fake matcher: ${op}`);
      }
    });
  }
  return actual === expected;
}

function matches(doc: RawDoc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') {
      return (value as Array<Record<string, unknown>>).some((sub) => matches(doc, sub));
    }
    return matchesValue(doc[key], value);
  });
}

function createFakeDb(seed: RawDoc[]): { db: Db; docs: RawDoc[] } {
  const docs = seed.map((d) => ({ ...d }));

  const collection = {
    find(filter: Record<string, unknown>) {
      const results = docs.filter((d) => matches(d, filter));
      const cursor = {
        project() {
          return cursor;
        },
        async toArray() {
          return results;
        },
      };
      return cursor;
    },
    async updateMany(filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) {
      let modifiedCount = 0;
      for (const doc of docs) {
        if (matches(doc, filter)) {
          Object.assign(doc, update.$set);
          modifiedCount += 1;
        }
      }
      return { modifiedCount };
    },
  };

  const db = {
    collection: () => collection,
  } as unknown as Db;

  return { db, docs };
}

function baseDoc(overrides: Partial<RawDoc> = {}): RawDoc {
  const now = new Date('2020-01-01T00:00:00.000Z');
  return {
    _id: new ObjectId(),
    accountId: 'acct-1',
    status: 'closed',
    closedAt: now,
    legalHold: false,
    sapsCaseNumber: 'CAS-1/1/2020',
    reportingStation: 'Sandton SAPS',
    reportedToPoliceAt: now,
    policeReportHistory: [
      {
        actorAccountId: 'acct-1',
        field: 'sapsCaseNumber',
        previousValue: null,
        newValue: 'CAS-1/1/2020',
        changedAt: now,
      },
    ],
    policeReportReminderSentAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const RUN_AT = new Date('2026-09-07T00:00:00.000Z'); // "today" per currentDate context

describe('buildRetentionPurgeFilter — consistency with recovery_cases_closed_at_retention', () => {
  it('uses $type (not $ne) on the three police-report fields, mirroring the partial index', () => {
    const filter = buildRetentionPurgeFilter(new Date('2021-01-01T00:00:00.000Z'));
    expect(filter.$or).toEqual([
      { sapsCaseNumber: { $type: 'string' } },
      { reportingStation: { $type: 'string' } },
      { reportedToPoliceAt: { $type: 'date' } },
    ]);
    // C-011-11: widened from a literal 'closed' to cover both terminal statuses.
    expect(filter.status).toEqual({ $in: ['closed', 'recovered'] });
    expect(filter.legalHold).toEqual({ $ne: true });
  });
});

describe('computeRetentionCutoff', () => {
  it('subtracts the retention-year floor from the given "now"', () => {
    const cutoff = computeRetentionCutoff(new Date('2026-09-07T00:00:00.000Z'), 5);
    expect(cutoff.toISOString()).toBe('2021-09-07T00:00:00.000Z');
  });
});

describe('runPoliceReportRetentionPurge', () => {
  it('clears the police-report fields on a closed case past the 5-year floor', async () => {
    const id = new ObjectId();
    const longAgo = new Date('2019-01-01T00:00:00.000Z'); // > 5y before RUN_AT
    const { db, docs } = createFakeDb([baseDoc({ _id: id, closedAt: longAgo })]);

    const summary = await runPoliceReportRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(1);
    expect(summary.cleared).toBe(1);
    expect(summary.dryRun).toBe(false);
    expect(summary.error).toBeNull();

    const doc = docs[0]!;
    expect(doc.sapsCaseNumber).toBeNull();
    expect(doc.reportingStation).toBeNull();
    expect(doc.reportedToPoliceAt).toBeNull();
    expect(doc.policeReportHistory).toEqual([]);
    expect(doc.policeReportReminderSentAt).toBeNull();
    expect(doc.updatedAt).toEqual(RUN_AT);
  });

  it('does not write anything in --dry-run, but still reports the candidate', async () => {
    const id = new ObjectId();
    const longAgo = new Date('2019-01-01T00:00:00.000Z');
    const { db, docs } = createFakeDb([baseDoc({ _id: id, closedAt: longAgo })]);

    const summary = await runPoliceReportRetentionPurge(db, { dryRun: true, now: RUN_AT });

    expect(summary.candidatesFound).toBe(1);
    expect(summary.cleared).toBe(0);
    expect(summary.dryRun).toBe(true);

    const doc = docs[0]!;
    expect(doc.sapsCaseNumber).toBe('CAS-1/1/2020');
    expect(doc.policeReportHistory).toHaveLength(1);
  });

  it('does not match a case closed less than 5 years ago', async () => {
    const id = new ObjectId();
    const recentlyClosed = new Date('2025-01-01T00:00:00.000Z');
    const { db, docs } = createFakeDb([baseDoc({ _id: id, closedAt: recentlyClosed })]);

    const summary = await runPoliceReportRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(0);
    expect(summary.cleared).toBe(0);
    expect(docs[0]!.sapsCaseNumber).toBe('CAS-1/1/2020');
  });

  it('does not match a case under legalHold, even if otherwise eligible', async () => {
    const id = new ObjectId();
    const longAgo = new Date('2019-01-01T00:00:00.000Z');
    const { db, docs } = createFakeDb([baseDoc({ _id: id, closedAt: longAgo, legalHold: true })]);

    const summary = await runPoliceReportRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(0);
    expect(summary.cleared).toBe(0);
    expect(docs[0]!.sapsCaseNumber).toBe('CAS-1/1/2020');
  });

  it('C-011-11: matches and clears a "recovered" case past the retention floor, not just "closed"', async () => {
    // security-review.md §9.2/§9.6/§10.2 — the retention clock starts on entry to ANY
    // terminal state. A case whose asset was recovered and never separately,
    // administratively "closed" by an operator must still have its police-report
    // triple purged 5 years after it became terminal, or the retention control never
    // fires for what is plausibly the most common terminal state in this product.
    const id = new ObjectId();
    const longAgo = new Date('2019-01-01T00:00:00.000Z');
    const { db, docs } = createFakeDb([
      baseDoc({ _id: id, status: 'recovered', closedAt: longAgo }),
    ]);

    const summary = await runPoliceReportRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(1);
    expect(summary.cleared).toBe(1);
    const doc = docs[0]!;
    expect(doc.sapsCaseNumber).toBeNull();
    expect(doc.reportingStation).toBeNull();
    expect(doc.reportedToPoliceAt).toBeNull();
    expect(doc.policeReportHistory).toEqual([]);
    expect(doc.policeReportReminderSentAt).toBeNull();
  });

  it('does not match a case in a genuinely non-terminal status (e.g. "tracking"), even with an eligible closedAt', async () => {
    // Unrelated statuses must stay excluded — this property must not be lost when
    // "closed" widens to "closed" | "recovered". A non-terminal status should never
    // realistically carry a set closedAt in production (only updateStatusForPartnerOrg
    // sets it, and only on the two terminal transitions), but the purge filter itself
    // must still not match one if it somehow occurred.
    const id = new ObjectId();
    const longAgo = new Date('2019-01-01T00:00:00.000Z');
    const { db, docs } = createFakeDb([
      baseDoc({ _id: id, status: 'tracking', closedAt: longAgo }),
    ]);

    const summary = await runPoliceReportRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(0);
    expect(summary.cleared).toBe(0);
    expect(docs[0]!.sapsCaseNumber).toBe('CAS-1/1/2020');
  });

  it('does not match a case with no police-report fields set at all', async () => {
    const id = new ObjectId();
    const longAgo = new Date('2019-01-01T00:00:00.000Z');
    const { db } = createFakeDb([
      baseDoc({
        _id: id,
        closedAt: longAgo,
        sapsCaseNumber: null,
        reportingStation: null,
        reportedToPoliceAt: null,
        policeReportHistory: [],
        policeReportReminderSentAt: null,
      }),
    ]);

    const summary = await runPoliceReportRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(0);
    expect(summary.cleared).toBe(0);
  });

  it('is idempotent — a second run against an already-cleared document matches nothing', async () => {
    const id = new ObjectId();
    const longAgo = new Date('2019-01-01T00:00:00.000Z');
    const { db } = createFakeDb([baseDoc({ _id: id, closedAt: longAgo })]);

    const first = await runPoliceReportRetentionPurge(db, { dryRun: false, now: RUN_AT });
    expect(first.cleared).toBe(1);

    const second = await runPoliceReportRetentionPurge(db, { dryRun: false, now: RUN_AT });
    expect(second.candidatesFound).toBe(0);
    expect(second.cleared).toBe(0);
  });

  it('clears a case with only one of the three police-report fields set (partial match)', async () => {
    const id = new ObjectId();
    const longAgo = new Date('2019-01-01T00:00:00.000Z');
    const { db, docs } = createFakeDb([
      baseDoc({
        _id: id,
        closedAt: longAgo,
        sapsCaseNumber: null,
        reportedToPoliceAt: null,
        policeReportHistory: [],
        policeReportReminderSentAt: null,
        reportingStation: 'Rosebank SAPS',
      }),
    ]);

    const summary = await runPoliceReportRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.cleared).toBe(1);
    expect(docs[0]!.reportingStation).toBeNull();
  });

  it('processes multiple matching cases in one run', async () => {
    const longAgo = new Date('2019-01-01T00:00:00.000Z');
    const { db } = createFakeDb([
      baseDoc({ _id: new ObjectId(), closedAt: longAgo }),
      baseDoc({ _id: new ObjectId(), closedAt: longAgo }),
      baseDoc({ _id: new ObjectId(), closedAt: new Date('2025-01-01T00:00:00.000Z') }), // not yet eligible
    ]);

    const summary = await runPoliceReportRetentionPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(2);
    expect(summary.cleared).toBe(2);
  });
});
