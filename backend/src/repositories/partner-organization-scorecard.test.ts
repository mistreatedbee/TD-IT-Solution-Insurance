/**
 * Repository-level tests for the partner-organization recovery-performance
 * scorecard: `recoveryCasesRepo.getScorecardForPartnerOrg` and
 * `adminAccessLogRepo.countStateChangesByEndpointForActors`.
 *
 * Exercises the REAL aggregation pipelines each method builds, against a
 * small generic $match/$group evaluator (not a full Mongo semantics
 * reimplementation — just the operators these two pipelines actually use:
 * $gte/$lte/$in/$eq/$ne/$and for $match/$cond, $sum/$push/$subtract/$$REMOVE
 * for $group), mirroring the existing in-memory-fake-driver pattern already
 * used by `recovery-cases.test.ts` for this repo (no local MongoDB
 * dependency, always runs, merge-blocking).
 */
import { describe, it, expect } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { createRecoveryCasesRepo, type RecoveryCaseStatus } from './recovery-cases.js';
import { createAdminAccessLogRepo } from './admin-access-log.js';

const REMOVE = Symbol('$$REMOVE');

function getField(doc: Record<string, unknown>, ref: string): unknown {
  return doc[ref.slice(1)];
}

function evalExpr(doc: Record<string, unknown>, expr: unknown): unknown {
  if (typeof expr === 'string' && expr.startsWith('$')) return getField(doc, expr);
  if (expr !== null && typeof expr === 'object' && !(expr instanceof Date)) {
    const obj = expr as Record<string, unknown>;
    if ('$subtract' in obj) {
      const [a, b] = obj.$subtract as [unknown, unknown];
      const av = evalExpr(doc, a);
      const bv = evalExpr(doc, b);
      const an = av instanceof Date ? av.getTime() : (av as number);
      const bn = bv instanceof Date ? bv.getTime() : (bv as number);
      return an - bn;
    }
  }
  return expr;
}

function evalCond(doc: Record<string, unknown>, cond: Record<string, unknown>): boolean {
  if ('$eq' in cond) {
    const [a, b] = cond.$eq as [unknown, unknown];
    return evalExpr(doc, a) === evalExpr(doc, b);
  }
  if ('$ne' in cond) {
    const [a, b] = cond.$ne as [unknown, unknown];
    return evalExpr(doc, a) !== evalExpr(doc, b);
  }
  if ('$in' in cond) {
    const [a, arr] = cond.$in as [unknown, unknown[]];
    return arr.includes(evalExpr(doc, a));
  }
  if ('$and' in cond) {
    return (cond.$and as Record<string, unknown>[]).every((c) => evalCond(doc, c));
  }
  throw new Error(`unsupported $match/$cond operator: ${JSON.stringify(cond)}`);
}

function evalCondExpr(doc: Record<string, unknown>, condExpr: Record<string, unknown>): unknown {
  const [cond, ifTrue, ifFalse] = condExpr.$cond as [Record<string, unknown>, unknown, unknown];
  if (evalCond(doc, cond)) return evalExpr(doc, ifTrue);
  return ifFalse === '$$REMOVE' ? REMOVE : evalExpr(doc, ifFalse);
}

function matchValue(actual: unknown, spec: unknown): boolean {
  if (spec !== null && typeof spec === 'object' && !(spec instanceof Date) && !Array.isArray(spec)) {
    return Object.entries(spec as Record<string, unknown>).every(([op, opVal]) => {
      switch (op) {
        case '$gte':
          return actual instanceof Date && opVal instanceof Date
            ? actual.getTime() >= opVal.getTime()
            : (actual as number) >= (opVal as number);
        case '$lte':
          return actual instanceof Date && opVal instanceof Date
            ? actual.getTime() <= opVal.getTime()
            : (actual as number) <= (opVal as number);
        case '$in':
          return (opVal as unknown[]).includes(actual);
        default:
          throw new Error(`unsupported $match operator: ${op}`);
      }
    });
  }
  return actual === spec;
}

function runMatch(docs: Record<string, unknown>[], match: Record<string, unknown>): Record<string, unknown>[] {
  return docs.filter((doc) => Object.entries(match).every(([key, spec]) => matchValue(doc[key], spec)));
}

function fakeDb(recoveryCaseDocs: Record<string, unknown>[], accessLogDocs: Record<string, unknown>[]): Db {
  const collections: Record<string, Record<string, unknown>[]> = {
    recovery_cases: recoveryCaseDocs,
    admin_access_log: accessLogDocs,
  };
  return {
    collection(name: string) {
      const docs = collections[name] ?? [];
      return {
        aggregate(pipeline: Record<string, unknown>[]) {
          const matchStage = pipeline.find((s) => '$match' in s) as { $match: Record<string, unknown> } | undefined;
          const groupStage = pipeline.find((s) => '$group' in s) as { $group: Record<string, unknown> } | undefined;
          const matched = matchStage ? runMatch(docs, matchStage.$match) : docs;
          if (!groupStage) return { async toArray() { return matched; } };

          const groupSpec = groupStage.$group;
          const groupIdExpr = groupSpec._id;
          const groups = new Map<unknown, Record<string, unknown>[]>();
          for (const doc of matched) {
            const key = groupIdExpr === null ? null : evalExpr(doc, groupIdExpr);
            const bucket = groups.get(key) ?? [];
            bucket.push(doc);
            groups.set(key, bucket);
          }
          const results: Record<string, unknown>[] = [];
          for (const [key, bucket] of groups) {
            const row: Record<string, unknown> = { _id: key };
            for (const [field, aggExpr] of Object.entries(groupSpec)) {
              if (field === '_id') continue;
              const expr = aggExpr as Record<string, unknown>;
              if ('$sum' in expr) {
                const sumExpr = expr.$sum;
                row[field] =
                  sumExpr === 1
                    ? bucket.length
                    : bucket.reduce((acc, doc) => {
                        const v = evalCondExpr(doc, sumExpr as Record<string, unknown>);
                        return acc + (v === REMOVE ? 0 : (v as number));
                      }, 0);
              } else if ('$push' in expr) {
                row[field] = bucket
                  .map((doc) => evalCondExpr(doc, expr.$push as Record<string, unknown>))
                  .filter((v) => v !== REMOVE);
              } else {
                throw new Error(`unsupported $group accumulator: ${JSON.stringify(expr)}`);
              }
            }
            results.push(row);
          }
          return { async toArray() { return results; } };
        },
      };
    },
  } as unknown as Db;
}

function recoveryCase(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    _id: new ObjectId(),
    accountId: 'acc-1',
    assetId: 'asset-1',
    partnerOrganizationId: null,
    status: 'open' as RecoveryCaseStatus,
    referenceNumber: 'RC-20260101-AAAA',
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

describe('repositories/recovery-cases — getScorecardForPartnerOrg', () => {
  it('returns all-zero/null metrics for an org with no cases', async () => {
    const repo = createRecoveryCasesRepo(fakeDb([], []));
    const result = await repo.getScorecardForPartnerOrg('org-1', {});
    expect(result).toEqual({
      totalCasesClaimed: 0,
      activeCases: 0,
      recoveredCount: 0,
      closedOtherCount: 0,
      recoveryRatePercent: null,
      averageTimeToTerminalStatusHours: null,
    });
  });

  it('computes totals, active count, recovery rate, and average terminal duration', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const docs = [
      recoveryCase({ partnerOrganizationId: 'org-1', status: 'investigating', createdAt }),
      recoveryCase({ partnerOrganizationId: 'org-1', status: 'tracking', createdAt }),
      recoveryCase({
        partnerOrganizationId: 'org-1',
        status: 'recovered',
        createdAt,
        closedAt: new Date('2026-01-03T00:00:00.000Z'), // +48h
      }),
      recoveryCase({
        partnerOrganizationId: 'org-1',
        status: 'closed',
        createdAt,
        closedAt: new Date('2026-01-02T00:00:00.000Z'), // +24h
      }),
      // Different org — must not be counted.
      recoveryCase({ partnerOrganizationId: 'org-2', status: 'recovered', createdAt, closedAt: createdAt }),
    ];
    const repo = createRecoveryCasesRepo(fakeDb(docs, []));
    const result = await repo.getScorecardForPartnerOrg('org-1', {});

    expect(result.totalCasesClaimed).toBe(4);
    expect(result.activeCases).toBe(2);
    expect(result.recoveredCount).toBe(1);
    expect(result.closedOtherCount).toBe(1);
    expect(result.recoveryRatePercent).toBeCloseTo(50);
    // Average of 48h and 24h = 36h.
    expect(result.averageTimeToTerminalStatusHours).toBeCloseTo(36);
  });

  it('honours the from/to createdAt range filter', async () => {
    const inRange = recoveryCase({
      partnerOrganizationId: 'org-1',
      status: 'recovered',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      closedAt: new Date('2026-05-02T00:00:00.000Z'),
    });
    const outOfRange = recoveryCase({
      partnerOrganizationId: 'org-1',
      status: 'recovered',
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
      closedAt: new Date('2020-01-02T00:00:00.000Z'),
    });
    const repo = createRecoveryCasesRepo(fakeDb([inRange, outOfRange], []));
    const result = await repo.getScorecardForPartnerOrg('org-1', {
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-12-31T23:59:59.999Z'),
    });
    expect(result.totalCasesClaimed).toBe(1);
  });

  it('treats a case with no closedAt as not contributing a terminal duration', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const docs = [
      recoveryCase({ partnerOrganizationId: 'org-1', status: 'recovered', createdAt, closedAt: null }),
    ];
    const repo = createRecoveryCasesRepo(fakeDb(docs, []));
    const result = await repo.getScorecardForPartnerOrg('org-1', {});
    expect(result.averageTimeToTerminalStatusHours).toBeNull();
    // Still counts toward the recovery rate even without a closedAt.
    expect(result.recoveryRatePercent).toBe(100);
  });
});

function accessLogRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    eventType: 'privileged_state_change',
    actorAccountId: 'operator-1',
    actorSessionId: 'session-1',
    auditRequestId: null,
    targetAccountId: 'customer-1',
    resourceType: 'recovery_case',
    resourceId: new ObjectId(),
    resultCount: null,
    fromStatus: 'investigating',
    toStatus: 'open',
    endpoint: 'POST /v1/security/cases/:caseId/release',
    ipAddress: null,
    userAgent: null,
    legalHold: false,
    reason: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('repositories/admin-access-log — countStateChangesByEndpointForActors', () => {
  it('returns a zero count for every requested endpoint when there are no actor ids', async () => {
    const repo = createAdminAccessLogRepo(fakeDb([], []));
    const result = await repo.countStateChangesByEndpointForActors(
      [],
      ['POST /v1/security/cases/:caseId/release', 'POST /v1/security/cases/:caseId/reassign'],
      {},
    );
    expect(result).toEqual({
      'POST /v1/security/cases/:caseId/release': 0,
      'POST /v1/security/cases/:caseId/reassign': 0,
    });
  });

  it('counts release/reassign rows per endpoint, scoped to the given actor ids', async () => {
    const rows = [
      accessLogRow({ actorAccountId: 'operator-1', endpoint: 'POST /v1/security/cases/:caseId/release' }),
      accessLogRow({ actorAccountId: 'operator-1', endpoint: 'POST /v1/security/cases/:caseId/release' }),
      accessLogRow({ actorAccountId: 'operator-2', endpoint: 'POST /v1/security/cases/:caseId/reassign' }),
      // A different org's operator — must not be counted.
      accessLogRow({ actorAccountId: 'other-org-operator', endpoint: 'POST /v1/security/cases/:caseId/release' }),
      // A different event type entirely — must not be counted even if the actor matches.
      accessLogRow({
        actorAccountId: 'operator-1',
        eventType: 'privileged_data_access',
        endpoint: 'POST /v1/security/cases/:caseId/release',
        fromStatus: null,
        toStatus: null,
      }),
    ];
    const repo = createAdminAccessLogRepo(fakeDb([], rows));
    const result = await repo.countStateChangesByEndpointForActors(
      ['operator-1', 'operator-2'],
      ['POST /v1/security/cases/:caseId/release', 'POST /v1/security/cases/:caseId/reassign'],
      {},
    );
    expect(result).toEqual({
      'POST /v1/security/cases/:caseId/release': 2,
      'POST /v1/security/cases/:caseId/reassign': 1,
    });
  });

  it('honours the from/to createdAt range filter', async () => {
    const rows = [
      accessLogRow({ createdAt: new Date('2026-05-01T00:00:00.000Z') }),
      accessLogRow({ createdAt: new Date('2020-01-01T00:00:00.000Z') }),
    ];
    const repo = createAdminAccessLogRepo(fakeDb([], rows));
    const result = await repo.countStateChangesByEndpointForActors(
      ['operator-1'],
      ['POST /v1/security/cases/:caseId/release'],
      { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2026-12-31T23:59:59.999Z') },
    );
    expect(result['POST /v1/security/cases/:caseId/release']).toBe(1);
  });
});
