/**
 * Regression coverage for migrations/031 (actor vs. subject must be two
 * columns, not one overloaded one) and for ADR-0006's ratified rulings:
 *
 *  - R-1/AUD-3(b): a bulk list call records one `privileged_data_access` row
 *    per disclosed subject, plus one call-scoped `privileged_bulk_access` row
 *    carrying `result_count` — so a subject-keyed query finds a customer whose
 *    data was disclosed in an unfiltered page. This is the QA hand-off case
 *    ADR-0006 §7.2 asks for.
 *  - R-2: `POST /v1/invitations` grants privilege, it does not access data, so
 *    it may not emit the access event type.
 *  - R-3: the writer refuses what migrations/033's CHECK constraints refuse,
 *    so the failure lands in this file rather than as an opaque 23514 in
 *    production.
 *
 * Column order under test (migrations/033, plus `decision` added by
 * migrations/039 for DEFECT-001):
 * [account_id, actor_account_id, actor_service, actor_session_id,
 *  audit_request_id, event_type, attempted_identifier, ip_address,
 *  user_agent, result_count, decision]
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createAuditLogRepo } from './audit-log.js';
import type { Queryable } from './types.js';

const COL = {
  accountId: 0,
  actorAccountId: 1,
  actorService: 2,
  actorSessionId: 3,
  auditRequestId: 4,
  eventType: 5,
  attemptedIdentifier: 6,
  ipAddress: 7,
  userAgent: 8,
  resultCount: 9,
  decision: 10,
} as const;
const COLUMN_COUNT = 11;

function createFakeDb() {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const db: Queryable = {
    async query(text, params = []) {
      calls.push({ text, params });
      return { rows: [], rowCount: 0 };
    },
  };
  return { db, calls };
}

function onlyCall(calls: Array<{ text: string; params: unknown[] }>): { text: string; params: unknown[] } {
  const [first, ...rest] = calls;
  if (!first || rest.length > 0) {
    throw new Error(`[test] expected exactly one recorded db.query() call, got ${calls.length}`);
  }
  return first;
}

/** Splits a multi-row insert's flat parameter list back into rows. */
function rowsOf(call: { params: unknown[] }): unknown[][] {
  expect(call.params.length % COLUMN_COUNT).toBe(0);
  const rows: unknown[][] = [];
  for (let i = 0; i < call.params.length; i += COLUMN_COUNT) {
    rows.push(call.params.slice(i, i + COLUMN_COUNT));
  }
  return rows;
}

describe('repositories/audit-log', () => {
  it('writes both account_id (subject) and actor_account_id (actor) when they differ', async () => {
    const { db, calls } = createFakeDb();
    const repo = createAuditLogRepo(db);
    const adminId = randomUUID();
    const sessionId = randomUUID();
    const auditRequestId = randomUUID();

    // invitations.ts's POST /invitations shape: no subject account exists yet,
    // the admin is the actor. ADR-0006 R-2: privilege_granted, not
    // privileged_data_access.
    await repo.record({
      accountId: null,
      actorAccountId: adminId,
      actorSessionId: sessionId,
      auditRequestId,
      eventType: 'privilege_granted',
      ipAddress: '203.0.113.5',
    });

    const call = onlyCall(calls);
    expect(call.text).toContain('account_id, actor_account_id, actor_service, actor_session_id, audit_request_id');
    expect(call.params[COL.accountId]).toBeNull();
    expect(call.params[COL.actorAccountId]).toBe(adminId);
    expect(call.params[COL.actorSessionId]).toBe(sessionId);
    expect(call.params[COL.auditRequestId]).toBe(auditRequestId);
    expect(call.params[COL.eventType]).toBe('privilege_granted');
  });

  it('records the internal service caller as the actor (AUD-2: no unattributed privileged read)', async () => {
    const { db, calls } = createFakeDb();
    const repo = createAuditLogRepo(db);
    const subjectId = randomUUID();

    // internal.ts's service-to-service shape: a subject, no acting account,
    // and a named caller service.
    await repo.record({
      accountId: subjectId,
      actorAccountId: null,
      actorService: 'policy-asset-service',
      eventType: 'privileged_data_access',
    });

    const call = onlyCall(calls);
    expect(call.params[COL.accountId]).toBe(subjectId);
    expect(call.params[COL.actorAccountId]).toBeNull();
    expect(call.params[COL.actorService]).toBe('policy-asset-service');
    expect(call.params[COL.actorSessionId]).toBeNull();
  });

  it('defaults every new correlation column to null when the call site omits them (backward compatible)', async () => {
    const { db, calls } = createFakeDb();
    const repo = createAuditLogRepo(db);
    const accountId = randomUUID();

    await repo.record({ accountId, eventType: 'login_success' });

    const call = onlyCall(calls);
    expect(call.params[COL.accountId]).toBe(accountId);
    expect(call.params[COL.actorAccountId]).toBeNull();
    expect(call.params[COL.actorService]).toBeNull();
    expect(call.params[COL.actorSessionId]).toBeNull();
    expect(call.params[COL.auditRequestId]).toBeNull();
    expect(call.params[COL.resultCount]).toBeNull();
  });

  it('still enforces attemptedIdentifier for login_failure', async () => {
    const { db } = createFakeDb();
    const repo = createAuditLogRepo(db);
    await expect(repo.record({ accountId: null, eventType: 'login_failure' })).rejects.toThrow(
      /login_failure requires attemptedIdentifier/,
    );
  });

  describe('ADR-0006 R-3: the writer refuses what migrations/033 refuses', () => {
    it('rejects an unattributed privileged read (AUD-2)', async () => {
      const { db, calls } = createFakeDb();
      const repo = createAuditLogRepo(db);
      await expect(
        repo.record({ accountId: randomUUID(), eventType: 'privileged_data_access' }),
      ).rejects.toThrow(/requires an actor/);
      expect(calls).toHaveLength(0);
    });

    it('rejects a subject-less privileged_data_access row — the exact row AUD-3(b) prohibits', async () => {
      const { db, calls } = createFakeDb();
      const repo = createAuditLogRepo(db);
      await expect(
        repo.record({ accountId: null, actorAccountId: randomUUID(), eventType: 'privileged_data_access' }),
      ).rejects.toThrow(/requires a subject accountId/);
      expect(calls).toHaveLength(0);
    });

    it('rejects resultCount on a non-bulk row', async () => {
      const { db } = createFakeDb();
      const repo = createAuditLogRepo(db);
      await expect(
        repo.record({
          accountId: randomUUID(),
          actorAccountId: randomUUID(),
          eventType: 'privileged_data_access',
          resultCount: 12,
        }),
      ).rejects.toThrow(/resultCount is set on privileged_bulk_access rows and only on those rows/);
    });
  });

  describe('ADR-0006 AUD-3(b) / R-1: bulk disclosure', () => {
    const actor = () => ({
      actorAccountId: randomUUID(),
      actorSessionId: randomUUID(),
      auditRequestId: randomUUID(),
      ipAddress: '198.51.100.20',
    });

    it('records one subject row per disclosed account plus one call-scoped row, in a single statement', async () => {
      const { db, calls } = createFakeDb();
      const repo = createAuditLogRepo(db);
      const a = actor();
      const disclosed = [randomUUID(), randomUUID(), randomUUID()];

      await repo.recordBulkDisclosure({ ...a, disclosedAccountIds: disclosed });

      // One round trip, atomic: the call row and its subject rows can never
      // land apart, which is what makes AUD-10's fail-closed ruling cheap.
      const call = onlyCall(calls);
      const rows = rowsOf(call);
      expect(rows).toHaveLength(4);

      const [bulkRow, ...subjectRows] = rows as [unknown[], ...unknown[][]];
      expect(bulkRow[COL.eventType]).toBe('privileged_bulk_access');
      expect(bulkRow[COL.accountId]).toBeNull();
      expect(bulkRow[COL.resultCount]).toBe(3);

      // The whole point of the chosen shape: a subject-keyed query
      // (`where account_id = $1 and event_type = 'privileged_data_access'`)
      // finds every customer in the returned page, with no array containment
      // and no new index.
      expect(subjectRows.map((r) => r[COL.accountId])).toEqual(disclosed);
      for (const row of subjectRows) {
        expect(row[COL.eventType]).toBe('privileged_data_access');
        expect(row[COL.actorAccountId]).toBe(a.actorAccountId);
        expect(row[COL.actorSessionId]).toBe(a.actorSessionId);
        expect(row[COL.auditRequestId]).toBe(a.auditRequestId);
        expect(row[COL.resultCount]).toBeNull();
      }
    });

    it('collapses duplicate subjects — result_count is distinct subjects disclosed', async () => {
      const { db, calls } = createFakeDb();
      const repo = createAuditLogRepo(db);
      const repeated = randomUUID();

      await repo.recordBulkDisclosure({ ...actor(), disclosedAccountIds: [repeated, repeated, randomUUID()] });

      const rows = rowsOf(onlyCall(calls));
      expect(rows).toHaveLength(3);
      expect(rows[0]![COL.resultCount]).toBe(2);
    });

    it('still records the attempt when nothing was disclosed (compliance §14.5.5: no optimising away empty results)', async () => {
      const { db, calls } = createFakeDb();
      const repo = createAuditLogRepo(db);

      await repo.recordBulkDisclosure({ ...actor(), disclosedAccountIds: [] });

      const rows = rowsOf(onlyCall(calls));
      expect(rows).toHaveLength(1);
      expect(rows[0]![COL.eventType]).toBe('privileged_bulk_access');
      expect(rows[0]![COL.resultCount]).toBe(0);
    });

    it('refuses an unattributed bulk disclosure', async () => {
      const { db, calls } = createFakeDb();
      const repo = createAuditLogRepo(db);
      await expect(
        repo.recordBulkDisclosure({ disclosedAccountIds: [randomUUID()] }),
      ).rejects.toThrow(/requires an actor/);
      expect(calls).toHaveLength(0);
    });

    it('accepts a service actor for a bulk read (no session, still attributed)', async () => {
      const { db, calls } = createFakeDb();
      const repo = createAuditLogRepo(db);

      await repo.recordBulkDisclosure({ actorService: 'reporting-service', disclosedAccountIds: [randomUUID()] });

      const rows = rowsOf(onlyCall(calls));
      expect(rows).toHaveLength(2);
      expect(rows[0]![COL.actorService]).toBe('reporting-service');
      expect(rows[0]![COL.actorSessionId]).toBeNull();
    });
  });

  // Business-owner gap report item 6 — GET /admin/audit-log's backing read.
  describe('listForAdmin', () => {
    function createFakeDbWithRows(rows: unknown[]) {
      const calls: Array<{ text: string; params: unknown[] }> = [];
      const db: Queryable = {
        async query(text, params = []) {
          calls.push({ text, params });
          return { rows, rowCount: rows.length };
        },
      };
      return { db, calls };
    }

    it('maps db rows to the AdminAuditLogEntry shape', async () => {
      const id = randomUUID();
      const accountId = randomUUID();
      const createdAt = new Date('2026-10-01T00:00:00.000Z');
      const { db } = createFakeDbWithRows([
        {
          id,
          account_id: accountId,
          event_type: 'login_success',
          attempted_identifier: null,
          ip_address: '203.0.113.5',
          created_at: createdAt,
        },
      ]);
      const repo = createAuditLogRepo(db);

      const result = await repo.listForAdmin({}, 50, null);
      expect(result).toEqual([
        {
          id,
          accountId,
          eventType: 'login_success',
          attemptedIdentifier: null,
          ipAddress: '203.0.113.5',
          createdAt,
        },
      ]);
    });

    it('filters by accountId, eventType, and an inclusive created_at range', async () => {
      const { db, calls } = createFakeDbWithRows([]);
      const repo = createAuditLogRepo(db);
      const accountId = randomUUID();
      const from = new Date('2026-01-01T00:00:00.000Z');
      const to = new Date('2026-02-01T00:00:00.000Z');

      await repo.listForAdmin({ accountId, eventType: 'login_failure', from, to }, 50, null);

      const call = onlyCall(calls);
      expect(call.text).toContain('account_id = $1');
      expect(call.text).toContain('event_type = $2');
      expect(call.text).toContain('created_at >= $3');
      expect(call.text).toContain('created_at <= $4');
      expect(call.params).toEqual([accountId, 'login_failure', from, to, 50]);
    });

    it('applies the cursor as a strict (created_at, id) tuple comparison', async () => {
      const { db, calls } = createFakeDbWithRows([]);
      const repo = createAuditLogRepo(db);
      const cursorId = randomUUID();
      const cursorCreatedAt = new Date('2026-05-01T00:00:00.000Z');

      await repo.listForAdmin({}, 50, { createdAt: cursorCreatedAt, id: cursorId });

      const call = onlyCall(calls);
      expect(call.text).toContain('(created_at, id) <');
      expect(call.params).toEqual([cursorCreatedAt, cursorId, 50]);
    });

    it('issues no filters at all when none are given — still bounded by limit', async () => {
      const { db, calls } = createFakeDbWithRows([]);
      const repo = createAuditLogRepo(db);

      await repo.listForAdmin({}, 25, null);

      const call = onlyCall(calls);
      expect(call.text).not.toContain('where');
      expect(call.params).toEqual([25]);
    });
  });

  // DEFECT-001 §3/migrations/039 — account_audit_log_decision_only_on_verification_decision.
  describe('DEFECT-001 decision column', () => {
    it('writes decision on a customer_verification_decision row and requires an actor (PRIVILEGED_ACCESS_EVENT_TYPES)', async () => {
      const { db, calls } = createFakeDb();
      const repo = createAuditLogRepo(db);
      const accountId = randomUUID();
      const adminId = randomUUID();

      await repo.record({
        accountId,
        actorAccountId: adminId,
        eventType: 'customer_verification_decision',
        decision: 'verified',
      });

      const call = onlyCall(calls);
      expect(call.params[COL.decision]).toBe('verified');
      expect(call.params[COL.eventType]).toBe('customer_verification_decision');
    });

    it('rejects a customer_verification_decision row with no actor', async () => {
      const { db } = createFakeDb();
      const repo = createAuditLogRepo(db);

      await expect(
        repo.record({
          accountId: randomUUID(),
          eventType: 'customer_verification_decision',
          decision: 'verified',
        }),
      ).rejects.toThrow(/requires an actor/);
    });

    it('rejects decision set on any other event type', async () => {
      const { db } = createFakeDb();
      const repo = createAuditLogRepo(db);

      await expect(
        repo.record({
          accountId: randomUUID(),
          actorAccountId: randomUUID(),
          eventType: 'privileged_data_access',
          decision: 'verified',
        }),
      ).rejects.toThrow(/decision is set on customer_verification_decision rows/);
    });

    it('rejects a customer_verification_decision row with no decision', async () => {
      const { db } = createFakeDb();
      const repo = createAuditLogRepo(db);

      await expect(
        repo.record({
          accountId: randomUUID(),
          actorAccountId: randomUUID(),
          eventType: 'customer_verification_decision',
        }),
      ).rejects.toThrow(/decision is set on customer_verification_decision rows/);
    });

    it('customer_identity_reset is self-service — subject === actor, NOT in PRIVILEGED_ACCESS_EVENT_TYPES', async () => {
      const { db, calls } = createFakeDb();
      const repo = createAuditLogRepo(db);
      const accountId = randomUUID();

      // No actorAccountId/actorService at all — would throw for a
      // PRIVILEGED_ACCESS_EVENT_TYPES member, but customer_identity_reset
      // is deliberately not one.
      await repo.record({
        accountId,
        actorAccountId: accountId,
        eventType: 'customer_identity_reset',
      });

      const call = onlyCall(calls);
      expect(call.params[COL.eventType]).toBe('customer_identity_reset');
      expect(call.params[COL.accountId]).toBe(accountId);
      expect(call.params[COL.actorAccountId]).toBe(accountId);
      expect(call.params[COL.decision]).toBeNull();
    });
  });
});
