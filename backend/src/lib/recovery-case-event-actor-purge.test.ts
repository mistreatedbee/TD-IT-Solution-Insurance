/**
 * `recovery_case_events` operator-identity retention-purge unit tests, closing
 * RR-019-B (docs/features/019-case-history-timeline/backend-architecture-event-model.md
 * §11.1/§11.2). Mirrors `admin-access-log-retention.test.ts`'s in-memory fake-Db
 * pattern — no live MongoDB required. Exercises the 12-month cutoff (shared with
 * `ADMIN_ACCESS_LOG_RETENTION_MONTHS`), the field-level clear (not a document
 * delete), and the PARENT-case legal-hold lookup (events have no legalHold field
 * of their own).
 */
import { describe, it, expect } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import {
  buildRecoveryCaseEventActorPurgeBaseFilter,
  computeRecoveryCaseEventActorRetentionCutoff,
  runRecoveryCaseEventActorPurge,
} from './recovery-case-event-actor-purge.js';
import { ADMIN_ACCESS_LOG_RETENTION_MONTHS } from '../repositories/admin-access-log.js';

type RawDoc = Record<string, unknown> & { _id: ObjectId };

function createFakeDb(opts: {
  events: RawDoc[];
  cases: RawDoc[];
}): { db: Db; events: RawDoc[]; runLogRows: Array<Record<string, unknown>> } {
  const events = opts.events.map((d) => ({ ...d }));
  const cases = opts.cases.map((d) => ({ ...d }));
  const runLogRows: Array<Record<string, unknown> & { _id: ObjectId }> = [];

  const eventsCollection = {
    find(filter: Record<string, unknown>) {
      const results = events.filter((d) => {
        if (filter['actor.type'] !== undefined && d.actor && (d.actor as { type: unknown }).type !== filter['actor.type']) {
          return false;
        }
        const accountIdFilter = filter['actor.accountId'] as { $type?: string } | undefined;
        if (accountIdFilter?.$type === 'string') {
          const accountId = d.actor ? (d.actor as { accountId: unknown }).accountId : undefined;
          if (typeof accountId !== 'string') return false;
        }
        const occurredAtFilter = filter.occurredAt as { $lte?: Date } | undefined;
        if (occurredAtFilter?.$lte) {
          const occurredAt = d.occurredAt as Date;
          if (!(occurredAt.getTime() <= occurredAtFilter.$lte.getTime())) return false;
        }
        return true;
      });
      return {
        project() {
          return this;
        },
        async toArray() {
          return results;
        },
      };
    },
    async updateMany(filter: { _id: { $in: ObjectId[] } }, update: { $set: Record<string, unknown> }) {
      let modifiedCount = 0;
      for (const id of filter._id.$in) {
        const row = events.find((e) => String(e._id) === String(id));
        if (row) {
          for (const [dottedKey, value] of Object.entries(update.$set)) {
            const parts = dottedKey.split('.');
            let target: Record<string, unknown> = row;
            for (let i = 0; i < parts.length - 1; i++) {
              const part = parts[i]!;
              target[part] = target[part] ?? {};
              target = target[part] as Record<string, unknown>;
            }
            target[parts[parts.length - 1]!] = value;
          }
          modifiedCount += 1;
        }
      }
      return { modifiedCount };
    },
  };

  const casesCollection = {
    find(filter: { _id: { $in: ObjectId[] }; legalHold: boolean }) {
      const results = cases.filter(
        (c) => filter._id.$in.some((id) => String(id) === String(c._id)) && c.legalHold === filter.legalHold,
      );
      return {
        project() {
          return this;
        },
        async toArray() {
          return results;
        },
      };
    },
  };

  const retentionJobRunsCollection = {
    async insertOne(doc: Record<string, unknown>) {
      const _id = new ObjectId();
      runLogRows.push({ ...doc, _id });
      return { insertedId: _id };
    },
    async updateOne(filter: { _id: ObjectId }, update: { $set: Record<string, unknown> }) {
      const row = runLogRows.find((r) => String(r._id) === String(filter._id));
      if (row) Object.assign(row, update.$set);
      return { modifiedCount: row ? 1 : 0 };
    },
  };

  const db = {
    collection: (name: string) => {
      if (name === 'recovery_case_events') return eventsCollection;
      if (name === 'recovery_cases') return casesCollection;
      if (name === 'retention_job_runs') return retentionJobRunsCollection;
      throw new Error(`unexpected collection ${name}`);
    },
  } as unknown as Db;

  return { db, events, runLogRows };
}

function eventDoc(overrides: Partial<RawDoc> = {}): RawDoc {
  return {
    _id: new ObjectId(),
    caseId: new ObjectId(),
    eventType: 'case_claimed',
    occurredAt: new Date('2024-01-01T00:00:00.000Z'),
    actor: { type: 'security_company_operator', accountId: 'op-1', partnerOrganizationId: 'org-1' },
    fromStatus: 'open',
    toStatus: 'investigating',
    fromPartnerOrganizationId: null,
    toPartnerOrganizationId: 'org-1',
    closeReason: null,
    auditRequestId: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const RUN_AT = new Date('2026-11-03T00:00:00.000Z');

describe('buildRecoveryCaseEventActorPurgeBaseFilter', () => {
  it('matches only security_company_operator actors with a string accountId past the cutoff', () => {
    const cutoff = new Date('2025-11-03T00:00:00.000Z');
    const filter = buildRecoveryCaseEventActorPurgeBaseFilter(cutoff);
    expect(filter).toEqual({
      'actor.type': 'security_company_operator',
      'actor.accountId': { $type: 'string' },
      occurredAt: { $lte: cutoff },
    });
  });
});

describe('computeRecoveryCaseEventActorRetentionCutoff', () => {
  it('defaults to ADMIN_ACCESS_LOG_RETENTION_MONTHS (lockstep, §11.1 item 2)', () => {
    const cutoff = computeRecoveryCaseEventActorRetentionCutoff(RUN_AT);
    const expected = new Date(RUN_AT);
    expected.setUTCMonth(expected.getUTCMonth() - ADMIN_ACCESS_LOG_RETENTION_MONTHS);
    expect(cutoff.toISOString()).toBe(expected.toISOString());
  });
});

describe('runRecoveryCaseEventActorPurge', () => {
  it('clears actor.accountId to null on an event past the cutoff, preserving type/partnerOrganizationId', async () => {
    const caseId = new ObjectId();
    const eventId = new ObjectId();
    const { db, events } = createFakeDb({
      events: [eventDoc({ _id: eventId, caseId })],
      cases: [{ _id: caseId, legalHold: false }],
    });

    const summary = await runRecoveryCaseEventActorPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(1);
    expect(summary.cleared).toBe(1);
    expect(summary.error).toBeNull();
    const row = events.find((e) => String(e._id) === String(eventId))!;
    expect((row.actor as { accountId: unknown }).accountId).toBeNull();
    expect((row.actor as { type: unknown }).type).toBe('security_company_operator');
    expect((row.actor as { partnerOrganizationId: unknown }).partnerOrganizationId).toBe('org-1');
  });

  it('does not write anything in --dry-run, but reports the candidate', async () => {
    const caseId = new ObjectId();
    const { db, events } = createFakeDb({
      events: [eventDoc({ caseId })],
      cases: [{ _id: caseId, legalHold: false }],
    });

    const summary = await runRecoveryCaseEventActorPurge(db, { dryRun: true, now: RUN_AT });

    expect(summary.candidatesFound).toBe(1);
    expect(summary.cleared).toBe(0);
    expect((events[0]!.actor as { accountId: unknown }).accountId).toBe('op-1');
  });

  it('does not match an event less than 12 months old', async () => {
    const caseId = new ObjectId();
    const { db } = createFakeDb({
      events: [eventDoc({ caseId, occurredAt: new Date('2026-06-01T00:00:00.000Z') })],
      cases: [{ _id: caseId, legalHold: false }],
    });

    const summary = await runRecoveryCaseEventActorPurge(db, { dryRun: false, now: RUN_AT });
    expect(summary.candidatesFound).toBe(0);
    expect(summary.cleared).toBe(0);
  });

  it('skips an event whose PARENT case has legalHold: true, surfacing it via legalHoldSkippedIds', async () => {
    const caseId = new ObjectId();
    const eventId = new ObjectId();
    const { db, events } = createFakeDb({
      events: [eventDoc({ _id: eventId, caseId })],
      cases: [{ _id: caseId, legalHold: true }],
    });

    const summary = await runRecoveryCaseEventActorPurge(db, { dryRun: false, now: RUN_AT });

    expect(summary.candidatesFound).toBe(1);
    expect(summary.cleared).toBe(0);
    expect(summary.legalHoldSkippedIds).toEqual([String(eventId)]);
    expect((events[0]!.actor as { accountId: unknown }).accountId).toBe('op-1');
  });

  it('never clears a customer actor (already null, not a security_company_operator) — base filter excludes it', async () => {
    const caseId = new ObjectId();
    const { db } = createFakeDb({
      events: [
        eventDoc({
          caseId,
          eventType: 'case_created',
          actor: { type: 'customer', accountId: null, partnerOrganizationId: null },
        }),
      ],
      cases: [{ _id: caseId, legalHold: false }],
    });

    const summary = await runRecoveryCaseEventActorPurge(db, { dryRun: false, now: RUN_AT });
    expect(summary.candidatesFound).toBe(0);
  });

  it('is idempotent — a second run against an already-cleared event matches nothing', async () => {
    const caseId = new ObjectId();
    const { db } = createFakeDb({
      events: [eventDoc({ caseId })],
      cases: [{ _id: caseId, legalHold: false }],
    });

    const first = await runRecoveryCaseEventActorPurge(db, { dryRun: false, now: RUN_AT });
    expect(first.cleared).toBe(1);

    const second = await runRecoveryCaseEventActorPurge(db, { dryRun: false, now: RUN_AT });
    expect(second.candidatesFound).toBe(0);
    expect(second.cleared).toBe(0);
  });

  it('writes a two-phase retention_job_runs row under jobId recovery_case_event_actor_purge', async () => {
    const caseId = new ObjectId();
    const { db, runLogRows } = createFakeDb({
      events: [eventDoc({ caseId })],
      cases: [{ _id: caseId, legalHold: false }],
    });

    await runRecoveryCaseEventActorPurge(db, { dryRun: false, now: RUN_AT });

    expect(runLogRows).toHaveLength(1);
    const row = runLogRows[0]!;
    expect(row.jobId).toBe('recovery_case_event_actor_purge');
    expect(row.outcome).toBe('success');
    expect(row.matchedCount).toBe(1);
    expect(row.clearedCount).toBe(1);
    expect(row.legalHoldSkippedCount).toBe(0);
  });
});
