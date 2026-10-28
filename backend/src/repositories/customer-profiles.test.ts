/**
 * DEFECT-001 (docs/organization/defect-fixes/DEFECT-001-customer-verification-integrity.md)
 * — repository-level coverage for the verify-then-swap (Defect 1) and approval-race
 * (Defect 2) fixes, against the real `createCustomerProfilesRepo()` logic, using a
 * minimal in-memory fake of the `Collection` surface it calls (find/findOne/
 * findOneAndUpdate/insertOne, with real filter matching, `$set`/`$inc`/`$setOnInsert`,
 * and `upsert`) — same style as `recovery-cases.test.ts`, not a live-Mongo integration
 * test.
 */
import { describe, it, expect, vi } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { createCustomerProfilesRepo, ProfileVerificationLockedError } from './customer-profiles.js';
import type { AuditLogRepo, AuditEventInput } from './audit-log.js';

type RawDoc = Record<string, unknown> & { _id: ObjectId };

function matches(doc: RawDoc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, value]) => doc[key] === value);
}

function createFakeDb(seed: RawDoc[] = []): { db: Db; docs: RawDoc[] } {
  const docs = seed.map((d) => ({ ...d }));

  const collection = {
    async insertOne(doc: Omit<RawDoc, '_id'> & { _id?: ObjectId }) {
      const _id = doc._id ?? new ObjectId();
      docs.push({ ...doc, _id } as RawDoc);
      return { insertedId: _id };
    },
    async findOne(filter: Record<string, unknown>) {
      return docs.find((d) => matches(d, filter)) ?? null;
    },
    async countDocuments(filter: Record<string, unknown>) {
      return docs.filter((d) => matches(d, filter)).length;
    },
    find(filter: Record<string, unknown>) {
      let results = docs.filter((d) => matches(d, filter));
      const cursor = {
        sort() {
          return cursor;
        },
        limit(n: number) {
          results = results.slice(0, n);
          return cursor;
        },
        async toArray() {
          return results;
        },
      };
      return cursor;
    },
    async findOneAndUpdate(
      filter: Record<string, unknown>,
      update: {
        $set?: Record<string, unknown>;
        $inc?: Record<string, number>;
        $setOnInsert?: Record<string, unknown>;
      },
      opts?: { upsert?: boolean },
    ) {
      const idx = docs.findIndex((d) => matches(d, filter));
      if (idx < 0) {
        if (!opts?.upsert) return null;
        const created: RawDoc = { _id: new ObjectId(), ...(update.$setOnInsert ?? {}) } as RawDoc;
        if (update.$set) Object.assign(created, update.$set);
        if (update.$inc) {
          for (const [key, delta] of Object.entries(update.$inc)) {
            created[key] = ((created[key] as number) ?? 0) + delta;
          }
        }
        docs.push(created);
        return created;
      }
      const current = docs[idx]!;
      if (update.$set) Object.assign(current, update.$set);
      if (update.$inc) {
        for (const [key, delta] of Object.entries(update.$inc)) {
          current[key] = ((current[key] as number) ?? 0) + delta;
        }
      }
      docs[idx] = current;
      return current;
    },
  };

  const db = { collection: () => collection } as unknown as Db;
  return { db, docs };
}

function createFakeAuditLog(): { auditLog: AuditLogRepo; events: AuditEventInput[] } {
  const events: AuditEventInput[] = [];
  const auditLog = {
    record: vi.fn(async (event: AuditEventInput) => {
      events.push(event);
    }),
    recordBulkDisclosure: vi.fn(async () => undefined),
    listForAdmin: vi.fn(async () => []),
  } as unknown as AuditLogRepo;
  return { auditLog, events };
}

function seedVerifiedProfile(overrides: Partial<RawDoc> = {}): RawDoc {
  const now = new Date('2026-10-01T00:00:00.000Z');
  return {
    _id: new ObjectId(),
    accountId: 'acct-1',
    firstName: 'Jane',
    middleName: null,
    lastName: 'Doe',
    dateOfBirth: null,
    phone: '+27000000000',
    idNumberLast4: '1234',
    residentialAddress: { line1: '1 Main', city: 'Cape Town', province: 'WC', postalCode: '8000', country: 'ZA' },
    emergencyContact: null,
    verificationStatus: 'verified',
    verificationSubmittedAt: now,
    verificationReviewedAt: now,
    rejectionReasonCustomerSafe: null,
    profilePictureUpdatedAt: null,
    verificationRevision: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('repositories/customer-profiles — DEFECT-001', () => {
  it('verified profile + identity-bearing edit -> in_progress, cleared review fields, revision bumped, customer_identity_reset audit row', async () => {
    const { db, docs } = createFakeDb([seedVerifiedProfile()]);
    const { auditLog, events } = createFakeAuditLog();
    const repo = createCustomerProfilesRepo(db, auditLog);

    const updated = await repo.updateForAccount('acct-1', { lastName: 'Smith' });

    expect(updated.verificationStatus).toBe('in_progress');
    expect(updated.verificationReviewedAt).toBeNull();
    expect(updated.rejectionReasonCustomerSafe).toBeNull();
    expect(updated.verificationRevision).toBe(1);
    expect(updated.lastName).toBe('Smith');
    expect(docs[0]!.verificationRevision).toBe(1);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      accountId: 'acct-1',
      actorAccountId: 'acct-1',
      eventType: 'customer_identity_reset',
    });
  });

  it('verified profile + phone/emergencyContact-only edit -> status stays verified, no revision bump, no audit row', async () => {
    const { db, docs } = createFakeDb([seedVerifiedProfile()]);
    const { auditLog, events } = createFakeAuditLog();
    const repo = createCustomerProfilesRepo(db, auditLog);

    const updated = await repo.updateForAccount('acct-1', {
      phone: '+27111111111',
      emergencyContact: { name: 'Pat', relationship: 'Sibling', phone: '+27222222222' },
    });

    expect(updated.verificationStatus).toBe('verified');
    expect(updated.verificationRevision).toBe(0);
    expect(docs[0]!.verificationRevision).toBe(0);
    expect(events).toHaveLength(0);
  });

  it('pending_review profile + identity-bearing edit -> throws ProfileVerificationLockedError, no mutation', async () => {
    const { db, docs } = createFakeDb([
      seedVerifiedProfile({ verificationStatus: 'pending_review', verificationRevision: 3 }),
    ]);
    const { auditLog } = createFakeAuditLog();
    const repo = createCustomerProfilesRepo(db, auditLog);

    await expect(repo.updateForAccount('acct-1', { firstName: 'Changed' })).rejects.toBeInstanceOf(
      ProfileVerificationLockedError,
    );

    expect(docs[0]!.firstName).toBe('Jane');
    expect(docs[0]!.verificationRevision).toBe(3);
  });

  it('pending_review profile + phone/emergencyContact-only edit -> succeeds, status untouched', async () => {
    const { db } = createFakeDb([seedVerifiedProfile({ verificationStatus: 'pending_review' })]);
    const { auditLog } = createFakeAuditLog();
    const repo = createCustomerProfilesRepo(db, auditLog);

    const updated = await repo.updateForAccount('acct-1', { phone: '+27333333333' });
    expect(updated.verificationStatus).toBe('pending_review');
    expect(updated.phone).toBe('+27333333333');
  });

  it('pre-existing documents with no verificationRevision field read back as 0', async () => {
    const seeded = seedVerifiedProfile();
    delete (seeded as Record<string, unknown>).verificationRevision;
    const { db } = createFakeDb([seeded]);
    const { auditLog } = createFakeAuditLog();
    const repo = createCustomerProfilesRepo(db, auditLog);

    const profile = await repo.findByAccountId('acct-1');
    expect(profile?.verificationRevision).toBe(0);
  });

  describe('ABA resubmission race (§4.3)', () => {
    it('submit (rev 1) -> admin action_required -> edit+resubmit (rev 2) -> stale expectedRevision 1 -> REVISION_MISMATCH; expectedRevision 2 -> succeeds', async () => {
      const now = new Date('2026-10-01T00:00:00.000Z');
      const { db } = createFakeDb([
        {
          _id: new ObjectId(),
          accountId: 'acct-1',
          firstName: 'Jane',
          middleName: null,
          lastName: 'Doe',
          dateOfBirth: null,
          phone: '+27000000000',
          idNumberLast4: '1234',
          residentialAddress: {
            line1: '1 Main',
            city: 'Cape Town',
            province: 'WC',
            postalCode: '8000',
            country: 'ZA',
          },
          emergencyContact: null,
          verificationStatus: 'not_started',
          verificationSubmittedAt: null,
          verificationReviewedAt: null,
          rejectionReasonCustomerSafe: null,
          profilePictureUpdatedAt: null,
          verificationRevision: 0,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      const { auditLog } = createFakeAuditLog();
      const repo = createCustomerProfilesRepo(db, auditLog);

      // Genuine first submission -> rev 1.
      const submitted = await repo.submitVerification('acct-1');
      expect(submitted.verificationStatus).toBe('pending_review');
      expect(submitted.verificationRevision).toBe(1);

      // Admin requests changes (reviewVerification against rev 1 — matches).
      await repo.reviewVerification('acct-1', 'action_required', 'Please update your address.', 1);

      // Customer edits (non-identity, allowed while action_required) and resubmits -> rev 2.
      await repo.updateForAccount('acct-1', { phone: '+27999999999' });
      const resubmitted = await repo.submitVerification('acct-1');
      expect(resubmitted.verificationStatus).toBe('pending_review');
      expect(resubmitted.verificationRevision).toBe(2);

      // A stale admin page, still holding rev 1 (opened against the FIRST
      // pending_review instance), tries to approve -> REVISION_MISMATCH.
      await expect(repo.reviewVerification('acct-1', 'verified', null, 1)).rejects.toThrow(
        'REVISION_MISMATCH',
      );

      // The correct, current revision succeeds.
      const approved = await repo.reviewVerification('acct-1', 'verified', null, 2);
      expect(approved.verificationStatus).toBe('verified');
    });
  });

  describe('CAS retry (§4.1 concurrency note)', () => {
    it('retries once when the CAS filter misses on the first attempt, then succeeds', async () => {
      const { db, docs } = createFakeDb([seedVerifiedProfile()]);
      const { auditLog } = createFakeAuditLog();
      const repo = createCustomerProfilesRepo(db, auditLog);

      // Simulate the CAS filter missing on the first findOneAndUpdate attempt
      // (status flipped between the read and the write by a concurrent
      // writer) — the first call returns null, as a real Mongo
      // findOneAndUpdate would when its filter no longer matches anything;
      // the second (retried) call behaves normally.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fakeCollection = db.collection('x') as any;
      const realFindOneAndUpdate = fakeCollection.findOneAndUpdate.bind(fakeCollection);
      let calls = 0;
      fakeCollection.findOneAndUpdate = async (...args: unknown[]) => {
        calls += 1;
        if (calls === 1) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return realFindOneAndUpdate(...(args as any[]));
      };

      const updated = await repo.updateForAccount('acct-1', { lastName: 'Smith' });
      expect(updated.lastName).toBe('Smith');
      expect(updated.verificationStatus).toBe('in_progress');
      expect(calls).toBe(2);
      expect(docs[0]!.verificationRevision).toBe(1);
    });
  });
});
