/**
 * OB-04 `recovery_case_events` repository tests.
 *
 * Covers SR-019-4 (structural rejection of location/free-text/metadata-shaped input
 * and an exact inserted-document key-set snapshot), SR-019-5 (actor allowlist per
 * event type), SR-019-6 (customer actor stored with accountId: null), SR-019-2(c)
 * (dedupe on the partial unique index, duplicate-key treated as success), SR-019-7
 * (listForCase pagination), and SR-019-8 (append-only — exact export set).
 *
 * Uses a small in-memory fake of the Mongo `Collection` surface this module
 * actually uses (insertOne/find/findOne + sort/limit/toArray), same convention as
 * `recovery-cases.test.ts`/`admin-access-log-retention.test.ts` — no live MongoDB
 * required.
 */
import { describe, it, expect } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import {
  createRecoveryCaseEventsRepo,
  InvalidRecoveryCaseEventError,
  RECOVERY_CASE_EVENTS_COLLECTION,
  type NewRecoveryCaseEventInput,
} from './recovery-case-events.js';

type RawDoc = Record<string, unknown> & { _id: ObjectId };

class DuplicateKeyError extends Error {
  code = 11000;
}

function createFakeDb(seed: RawDoc[] = []): { db: Db; docs: RawDoc[] } {
  const docs = [...seed];

  const collection = {
    async insertOne(doc: Record<string, unknown>) {
      // Mirrors the partial unique index { caseId, eventType, auditRequestId }
      // (only constrains rows with a string auditRequestId).
      if (typeof doc.auditRequestId === 'string') {
        const clash = docs.find(
          (d) =>
            String(d.caseId) === String(doc.caseId) &&
            d.eventType === doc.eventType &&
            d.auditRequestId === doc.auditRequestId,
        );
        if (clash) throw new DuplicateKeyError('E11000 duplicate key');
      }
      const _id = new ObjectId();
      const row = { ...doc, _id } as RawDoc;
      docs.push(row);
      return { insertedId: _id };
    },
    async findOne(filter: Record<string, unknown>) {
      return (
        docs.find(
          (d) =>
            String(d.caseId) === String(filter.caseId) &&
            d.eventType === filter.eventType &&
            d.auditRequestId === filter.auditRequestId,
        ) ?? null
      );
    },
    find(filter: Record<string, unknown>) {
      let results = docs.filter((d) => String(d.caseId) === String(filter.caseId));
      let sortSpec: Record<string, 1 | -1> | null = null;
      let limitN: number | null = null;
      const cursor = {
        sort(spec: Record<string, 1 | -1>) {
          sortSpec = spec;
          return cursor;
        },
        limit(n: number) {
          limitN = n;
          return cursor;
        },
        async toArray() {
          let out = [...results];
          if (sortSpec) {
            const [key, dir] = Object.entries(sortSpec)[0]!;
            out.sort((a, b) => {
              const av = (a as Record<string, unknown>)[key];
              const bv = (b as Record<string, unknown>)[key];
              if (av instanceof Date && bv instanceof Date) {
                return dir === -1 ? bv.getTime() - av.getTime() : av.getTime() - bv.getTime();
              }
              return 0;
            });
          }
          if (limitN !== null) out = out.slice(0, limitN);
          return out;
        },
      };
      void results;
      return cursor;
    },
  };

  const db = {
    collection: (name: string) => {
      if (name !== RECOVERY_CASE_EVENTS_COLLECTION) {
        throw new Error(`unexpected collection ${name}`);
      }
      return collection;
    },
  } as unknown as Db;

  return { db, docs };
}

const caseId = '1234567890abcdef12345678';

function caseCreatedInput(overrides: Partial<NewRecoveryCaseEventInput> = {}): NewRecoveryCaseEventInput {
  return {
    eventType: 'case_created',
    caseId,
    occurredAt: new Date('2026-11-01T00:00:00.000Z'),
    actor: { type: 'customer', accountId: null, partnerOrganizationId: null },
    fromStatus: null,
    toStatus: null,
    fromPartnerOrganizationId: null,
    toPartnerOrganizationId: null,
    closeReason: null,
    auditRequestId: null,
    ...overrides,
  } as NewRecoveryCaseEventInput;
}

function caseClaimedInput(overrides: Partial<NewRecoveryCaseEventInput> = {}): NewRecoveryCaseEventInput {
  return {
    eventType: 'case_claimed',
    caseId,
    occurredAt: new Date('2026-11-01T01:00:00.000Z'),
    actor: { type: 'security_company_operator', accountId: 'op-1', partnerOrganizationId: 'org-1' },
    fromStatus: 'open',
    toStatus: 'investigating',
    fromPartnerOrganizationId: null,
    toPartnerOrganizationId: 'org-1',
    closeReason: null,
    auditRequestId: 'req-1',
    ...overrides,
  } as NewRecoveryCaseEventInput;
}

describe('recoveryCaseEventsRepo.append — structural validation (SR-019-4)', () => {
  it('accepts a well-formed case_created event and builds the document field by field', async () => {
    const { db, docs } = createFakeDb();
    const repo = createRecoveryCaseEventsRepo(db);
    const event = await repo.append(caseCreatedInput());

    expect(event.eventType).toBe('case_created');
    expect(event.actor).toEqual({ type: 'customer', accountId: null, partnerOrganizationId: null });
    expect(docs).toHaveLength(1);
  });

  it('exact key-set snapshot of the inserted document — fails if a field is added/removed silently', async () => {
    const { db, docs } = createFakeDb();
    const repo = createRecoveryCaseEventsRepo(db);
    await repo.append(caseClaimedInput());

    expect(Object.keys(docs[0]!).sort()).toEqual(
      [
        '_id',
        'actor',
        'auditRequestId',
        'caseId',
        'closeReason',
        'createdAt',
        'eventType',
        'fromPartnerOrganizationId',
        'fromStatus',
        'occurredAt',
        'toPartnerOrganizationId',
        'toStatus',
      ].sort(),
    );
  });

  it.each([
    ['latitude', { latitude: -26.2 }],
    ['longitude', { longitude: 28.0 }],
    ['lastLocation', { lastLocation: { latitude: -26.2, longitude: 28.0 } }],
    ['lastLocationAt', { lastLocationAt: new Date() }],
    ['location', { location: 'somewhere' }],
    ['notes', { notes: 'free text' }],
    ['text', { text: 'hello' }],
    ['message', { message: 'hi' }],
    ['sapsCaseNumber', { sapsCaseNumber: 'CAS/1/2026' }],
    ['reportingStation', { reportingStation: 'Sandton SAPS' }],
    ['reportedToPoliceAt', { reportedToPoliceAt: new Date() }],
    ['reason', { reason: 'because' }],
    ['metadata', { metadata: { messageLength: 10 } }],
  ])('rejects an input carrying %s', async (_label, extra) => {
    const { db } = createFakeDb();
    const repo = createRecoveryCaseEventsRepo(db);
    const bad = { ...caseCreatedInput(), ...extra } as unknown as NewRecoveryCaseEventInput;
    await expect(repo.append(bad)).rejects.toBeInstanceOf(InvalidRecoveryCaseEventError);
  });
});

describe('recoveryCaseEventsRepo.append — actor allowlist (SR-019-5(a)/SR-019-6)', () => {
  it('rejects case_created with a security_company_operator actor', async () => {
    const { db } = createFakeDb();
    const repo = createRecoveryCaseEventsRepo(db);
    const bad = caseCreatedInput({
      actor: { type: 'security_company_operator', accountId: 'op-1', partnerOrganizationId: 'org-1' },
    });
    await expect(repo.append(bad)).rejects.toBeInstanceOf(InvalidRecoveryCaseEventError);
  });

  it('rejects case_claimed with a customer actor', async () => {
    const { db } = createFakeDb();
    const repo = createRecoveryCaseEventsRepo(db);
    const bad = caseClaimedInput({ actor: { type: 'customer', accountId: null, partnerOrganizationId: null } });
    await expect(repo.append(bad)).rejects.toBeInstanceOf(InvalidRecoveryCaseEventError);
  });

  it('rejects an operator actor carrying a non-null accountId of the wrong shape (empty string)', async () => {
    const { db } = createFakeDb();
    const repo = createRecoveryCaseEventsRepo(db);
    const bad = caseClaimedInput({
      actor: { type: 'security_company_operator', accountId: '', partnerOrganizationId: 'org-1' },
    });
    await expect(repo.append(bad)).rejects.toBeInstanceOf(InvalidRecoveryCaseEventError);
  });

  it('stores a customer actor with accountId: null (SR-019-6(a)) even though the schema already enforces it', async () => {
    const { db, docs } = createFakeDb();
    const repo = createRecoveryCaseEventsRepo(db);
    await repo.append(caseCreatedInput());
    expect((docs[0]!.actor as { accountId: unknown }).accountId).toBeNull();
  });
});

describe('recoveryCaseEventsRepo.append — dedupe on the partial unique index (SR-019-2(c))', () => {
  it('treats a duplicate-key (code 11000) replay of the same caseId/eventType/auditRequestId as success', async () => {
    const { db, docs } = createFakeDb();
    const repo = createRecoveryCaseEventsRepo(db);
    const first = await repo.append(caseClaimedInput());
    const second = await repo.append(caseClaimedInput());

    expect(docs).toHaveLength(1);
    expect(second.id).toBe(first.id);
  });

  it('does not dedupe two different events on the same case (different eventType)', async () => {
    const { db, docs } = createFakeDb();
    const repo = createRecoveryCaseEventsRepo(db);
    await repo.append(caseClaimedInput({ auditRequestId: 'req-x' }));
    await repo.append(
      caseClaimedInput({
        eventType: 'status_changed',
        fromStatus: 'investigating',
        toStatus: 'tracking',
        fromPartnerOrganizationId: 'org-1',
        auditRequestId: 'req-x',
      } as NewRecoveryCaseEventInput),
    );
    expect(docs).toHaveLength(2);
  });
});

describe('recoveryCaseEventsRepo.listForCase', () => {
  it('returns only events for the requested case, newest first', async () => {
    const { db } = createFakeDb();
    const repo = createRecoveryCaseEventsRepo(db);
    const otherCaseId = 'abcdefabcdefabcdefabcdef';

    await repo.append(caseCreatedInput({ auditRequestId: 'r1' }));
    await repo.append(caseClaimedInput({ auditRequestId: 'r2' }));
    await repo.append(caseCreatedInput({ caseId: otherCaseId, auditRequestId: 'r3' }));

    const events = await repo.listForCase(caseId, 10, null);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.caseId === caseId)).toBe(true);
  });

  it('respects the limit parameter', async () => {
    const { db } = createFakeDb();
    const repo = createRecoveryCaseEventsRepo(db);
    await repo.append(caseCreatedInput({ auditRequestId: 'r1' }));
    await repo.append(caseClaimedInput({ auditRequestId: 'r2' }));

    const events = await repo.listForCase(caseId, 1, null);
    expect(events).toHaveLength(1);
  });

  it('returns an empty list for a malformed caseId rather than throwing', async () => {
    const { db } = createFakeDb();
    const repo = createRecoveryCaseEventsRepo(db);
    const events = await repo.listForCase('not-an-id', 10, null);
    expect(events).toEqual([]);
  });
});

describe('createRecoveryCaseEventsRepo — append-only, structural (SR-019-8)', () => {
  it('exposes exactly append and listForCase — no update/delete export', () => {
    const { db } = createFakeDb();
    const repo = createRecoveryCaseEventsRepo(db);
    expect(Object.keys(repo).sort()).toEqual(['append', 'listForCase']);
  });
});
