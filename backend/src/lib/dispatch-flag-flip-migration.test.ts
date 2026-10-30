/**
 * OB-03 — flag-flip migration tests.
 *
 * Live-Mongo integration test (skip if unavailable locally), same posture as
 * `repositories/partner-organizations.test.ts`/`plan-catalog.test.ts` — this module
 * writes through two repositories (`partner_organizations`, `admin_access_log`) and a
 * raw `recovery_cases` collection, which is awkward to fake faithfully end-to-end.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MongoClient, ObjectId } from 'mongodb';
import {
  runDispatchFlagFlipMigration,
  buildDispatchFlagFlipCandidateFilter,
  MIGRATION_SYSTEM_ACTOR_ACCOUNT_ID,
} from './dispatch-flag-flip-migration.js';
import { createPartnerOrganizationsRepo } from '../repositories/partner-organizations.js';

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const DB_NAME_PREFIX = 'tdit_ob03_migration_test';

describe('OB-03 dispatch flag-flip migration', () => {
  let client: MongoClient;
  let dbName: string;

  beforeEach(async () => {
    dbName = `${DB_NAME_PREFIX}_${Math.random().toString(36).slice(2)}`;
    client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 2_000 });
    try {
      await client.connect();
    } catch {
      return;
    }
    await client.db(dbName).dropDatabase().catch(() => undefined);
  });

  afterEach(async () => {
    if (client?.topology?.isConnected()) await client.close();
  });

  function connected(): boolean {
    return !!client.topology?.isConnected();
  }

  it('migrates a held case whose org has an executed, non-terminated agreement to dispatchStatus accepted, with a Trail B row', async () => {
    if (!connected()) return;
    const db = client.db(dbName);
    const orgsRepo = createPartnerOrganizationsRepo(db);
    const org = await orgsRepo.create({ name: 'Eligible Org', contactEmail: 'ops@eligible.example', notes: null });
    await orgsRepo.updateById(org.id, {
      agreementStatus: 'executed',
      agreementReference: 'AGR-1',
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    });

    const caseId = new ObjectId();
    await db.collection('recovery_cases').insertOne({
      _id: caseId,
      accountId: 'acct-eligible',
      assetId: 'asset-1',
      partnerOrganizationId: org.id,
      status: 'investigating',
      referenceNumber: 'RC-20260101-AAAA',
      createdAt: new Date(),
      updatedAt: new Date(),
      // no dispatchStatus — pre-migration shape
    });

    const summary = await runDispatchFlagFlipMigration(db, { dryRun: false });
    expect(summary.candidatesFound).toBe(1);
    expect(summary.eligibleMigratedCaseIds).toEqual([caseId.toHexString()]);
    expect(summary.notEligibleUnassignedCaseIds).toEqual([]);
    expect(summary.errors).toEqual([]);

    const migrated = await db.collection('recovery_cases').findOne({ _id: caseId });
    expect(migrated?.dispatchStatus).toBe('accepted');
    expect(migrated?.acceptedAt).toBeInstanceOf(Date);
    expect(migrated?.dispatchedAt).toBeInstanceOf(Date);
    expect(migrated?.dispatchedBy).toBe(MIGRATION_SYSTEM_ACTOR_ACCOUNT_ID);
    expect(migrated?.partnerOrganizationId).toBe(org.id);

    const trailB = await db.collection('admin_access_log').findOne({
      resourceId: caseId,
      toStatus: 'dispatch_accepted',
    });
    expect(trailB).not.toBeNull();
    expect(trailB?.targetAccountId).toBe('acct-eligible');
    expect(trailB?.eventType).toBe('privileged_state_change');
  });

  it('[CO-OB03-3] unassigns a held case whose org is terminated, writing case_unassigned Trail B', async () => {
    if (!connected()) return;
    const db = client.db(dbName);
    const orgsRepo = createPartnerOrganizationsRepo(db);
    const org = await orgsRepo.create({ name: 'Terminated Org', contactEmail: 'ops@terminated.example', notes: null });
    await orgsRepo.updateById(org.id, {
      agreementStatus: 'terminated',
      terminatedAt: new Date('2026-02-01T00:00:00Z'),
    });

    const caseId = new ObjectId();
    await db.collection('recovery_cases').insertOne({
      _id: caseId,
      accountId: 'acct-terminated',
      assetId: 'asset-2',
      partnerOrganizationId: org.id,
      // [A5] widened scope — a closed case still in its 90-day wrap-up window is
      // in scope, not only open/investigating/tracking.
      status: 'closed',
      closedAt: new Date(),
      referenceNumber: 'RC-20260101-BBBB',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const summary = await runDispatchFlagFlipMigration(db, { dryRun: false });
    expect(summary.notEligibleUnassignedCaseIds).toEqual([caseId.toHexString()]);

    const migrated = await db.collection('recovery_cases').findOne({ _id: caseId });
    expect(migrated?.partnerOrganizationId).toBeNull();
    expect(migrated?.dispatchStatus).toBeNull();
    expect(migrated?.acceptedAt).toBeNull();

    const trailB = await db.collection('admin_access_log').findOne({
      resourceId: caseId,
      toStatus: 'case_unassigned',
    });
    expect(trailB).not.toBeNull();
  });

  it('is idempotent — a second run against already-migrated cases is a no-op', async () => {
    if (!connected()) return;
    const db = client.db(dbName);
    const orgsRepo = createPartnerOrganizationsRepo(db);
    const org = await orgsRepo.create({ name: 'Idempotent Org', contactEmail: 'ops@idempotent.example', notes: null });
    await orgsRepo.updateById(org.id, { agreementStatus: 'executed', effectiveFrom: new Date() });

    const caseId = new ObjectId();
    await db.collection('recovery_cases').insertOne({
      _id: caseId,
      accountId: 'acct-1',
      assetId: 'asset-1',
      partnerOrganizationId: org.id,
      status: 'open',
      referenceNumber: 'RC-20260101-CCCC',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const first = await runDispatchFlagFlipMigration(db, { dryRun: false });
    expect(first.candidatesFound).toBe(1);

    const second = await runDispatchFlagFlipMigration(db, { dryRun: false });
    expect(second.candidatesFound).toBe(0);
    expect(second.eligibleMigratedCaseIds).toEqual([]);
    expect(second.notEligibleUnassignedCaseIds).toEqual([]);
  });

  it('dry-run reports candidates without writing anything', async () => {
    if (!connected()) return;
    const db = client.db(dbName);
    const orgsRepo = createPartnerOrganizationsRepo(db);
    const org = await orgsRepo.create({ name: 'DryRun Org', contactEmail: 'ops@dryrun.example', notes: null });
    await orgsRepo.updateById(org.id, { agreementStatus: 'executed', effectiveFrom: new Date() });

    const caseId = new ObjectId();
    await db.collection('recovery_cases').insertOne({
      _id: caseId,
      accountId: 'acct-1',
      assetId: 'asset-1',
      partnerOrganizationId: org.id,
      status: 'open',
      referenceNumber: 'RC-20260101-DDDD',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const summary = await runDispatchFlagFlipMigration(db, { dryRun: true });
    expect(summary.eligibleMigratedCaseIds).toEqual([caseId.toHexString()]);

    const untouched = await db.collection('recovery_cases').findOne({ _id: caseId });
    expect(untouched?.dispatchStatus).toBeUndefined();
    const trailB = await db.collection('admin_access_log').findOne({ resourceId: caseId });
    expect(trailB).toBeNull();
  });

  it('buildDispatchFlagFlipCandidateFilter matches held, dispatchStatus-unset docs regardless of status', () => {
    const filter = buildDispatchFlagFlipCandidateFilter();
    expect(filter).toEqual({
      partnerOrganizationId: { $ne: null },
      dispatchStatus: { $exists: false },
    });
  });
});
