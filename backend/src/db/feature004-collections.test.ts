/**
 * Static regression coverage for Feature 004 Mongo bootstrap specs —
 * admin_access_log validator/index shape per database-addendum-001.md §1–§2
 * (Amendment A1 / ADR-0006 R-1).
 */
import { describe, it, expect } from 'vitest';
import { ObjectId } from 'mongodb';

import {
  FEATURE004_COLLECTIONS,
  FEATURE004_INDEXES,
  adminAccessLogJsonSchemaValidator,
} from './feature004-collections.js';

describe('db/feature004-collections — admin_access_log bootstrap specs', () => {
  it('registers admin_access_log in FEATURE004_COLLECTIONS', () => {
    expect(FEATURE004_COLLECTIONS.adminAccessLog).toBe('admin_access_log');
  });

  it('defines five named indexes per database-addendum-001.md §2 and ADR-0006 §18.8 C-C (SR-009S-7)', () => {
    const indexes = FEATURE004_INDEXES.adminAccessLog;
    expect(indexes).toHaveLength(5);
    expect(indexes.map((idx) => idx.name)).toEqual([
      'admin_access_log_actorAccountId_createdAt',
      'admin_access_log_actorSessionId_createdAt',
      'admin_access_log_targetAccountId_createdAt_partial',
      'admin_access_log_createdAt_purge_partial',
      'admin_access_log_resourceType_resourceId_createdAt_partial',
    ]);

    const targetPartial = indexes[2];
    expect(targetPartial?.partialFilterExpression).toEqual({
      targetAccountId: { $type: 'string' },
    });

    const purgePartial = indexes[3];
    expect(purgePartial?.partialFilterExpression).toEqual({ legalHold: false });

    // SR-009S-7 — chain-check index for the privileged_state_change applied-iff
    // rule (ADR-0006 §18.8 C-C; docs/organization/runbooks/
    // aud-8-privileged-access-reconstruction.md §14.3), so the chain-check query
    // isn't a collection scan.
    const chainCheckIndex = indexes[4];
    expect(chainCheckIndex?.key).toEqual({ resourceType: 1, resourceId: 1, createdAt: -1 });
    expect(chainCheckIndex?.partialFilterExpression).toEqual({
      resourceId: { $type: 'objectId' },
    });
  });

  it('requires ADR-0006 R-1 correlation fields on every document', () => {
    const validator = adminAccessLogJsonSchemaValidator as {
      $and: Array<{ $jsonSchema?: { required: string[]; properties: Record<string, { enum?: string[] }> } }>;
    };
    const schema = validator.$and[0]?.$jsonSchema;
    expect(schema).toBeDefined();
    if (!schema) {
      throw new Error('admin_access_log validator missing $jsonSchema branch');
    }

    expect(schema.required).toEqual(
      expect.arrayContaining([
        'eventType',
        'actorAccountId',
        'actorSessionId',
        'resourceType',
        'endpoint',
        'legalHold',
        'createdAt',
      ]),
    );
    // ADR-0006 §18.7 item 5 — widened to add 'privileged_state_change' for the
    // Security Company Dashboard partner-case decision audit trail (PDM-8).
    expect(schema.properties.eventType?.enum).toEqual([
      'privileged_data_access',
      'privileged_bulk_access',
      'privileged_state_change',
    ]);
    // ADR-0006 §18.7 item 5 — widened to add 'recovery_case' alongside 'policy'/'asset'.
    expect(schema.properties.resourceType?.enum).toEqual(['policy', 'asset', 'recovery_case']);
  });

  it('encodes R-1 conditional invariants via $expr (MongoDB lacks if/then in $jsonSchema)', () => {
    const validator = adminAccessLogJsonSchemaValidator as {
      $and: Array<Record<string, unknown>>;
    };
    const exprBranch = validator.$and[1];
    expect(exprBranch).toHaveProperty('$or');
    const branches = (exprBranch as { $or: Array<{ $expr?: unknown }> }).$or;
    // ADR-0006 §18.4 — a third branch for privileged_state_change (claim/status-change
    // decision records), alongside the original privileged_data_access/privileged_bulk_access.
    expect(branches).toHaveLength(3);
    expect(branches[0]).toHaveProperty('$expr');
    expect(branches[1]).toHaveProperty('$expr');
    expect(branches[2]).toHaveProperty('$expr');
  });

  describe('schema/$expr actually validates documents (not just TypeScript-level shape)', () => {
    /**
     * Minimal interpreter for the subset of `$jsonSchema` (bsonType/enum/required) and
     * aggregation `$expr` ($and/$or/$eq/$ne/$gte with `$field` references) this
     * validator actually uses — there is no mongodb-memory-server or similar in this
     * repo's dev dependencies to run the real engine against, and this document's
     * validator is simple enough that re-implementing exactly the operators in use is
     * a better regression guard than TypeScript-shape assertions alone (the gap this
     * suite exists to close per SR-009S-1).
     */
    type JsonSchema = {
      bsonType?: string | string[];
      required?: string[];
      properties?: Record<string, { bsonType?: string | string[]; enum?: unknown[] }>;
    };

    function bsonTypeOf(value: unknown): string {
      if (value === null) return 'null';
      if (value instanceof ObjectId) return 'objectId';
      if (value instanceof Date) return 'date';
      if (Array.isArray(value)) return 'array';
      if (typeof value === 'string') return 'string';
      if (typeof value === 'boolean') return 'bool';
      if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double';
      if (typeof value === 'object') return 'object';
      return typeof value;
    }

    function matchesJsonSchema(schema: JsonSchema, doc: Record<string, unknown>): boolean {
      for (const key of schema.required ?? []) {
        if (!(key in doc)) return false;
      }
      for (const [key, propSchema] of Object.entries(schema.properties ?? {})) {
        if (!(key in doc)) continue; // not required, absent is fine
        const value = doc[key];
        if (propSchema.enum && !propSchema.enum.includes(value as never)) return false;
        if (propSchema.bsonType) {
          const allowed = Array.isArray(propSchema.bsonType) ? propSchema.bsonType : [propSchema.bsonType];
          if (!allowed.includes(bsonTypeOf(value))) return false;
        }
      }
      return true;
    }

    type Expr = { $eq?: [string, unknown] } | { $ne?: [string, unknown] } | { $gte?: [string, unknown] } | { $and?: Expr[] } | { $or?: Expr[] };

    function fieldRef(ref: string, doc: Record<string, unknown>): unknown {
      return ref.startsWith('$') ? doc[ref.slice(1)] ?? null : ref;
    }

    function evalExpr(expr: Expr, doc: Record<string, unknown>): boolean {
      if ('$and' in expr && expr.$and) return expr.$and.every((e) => evalExpr(e, doc));
      if ('$or' in expr && expr.$or) return expr.$or.some((e) => evalExpr(e, doc));
      if ('$eq' in expr && expr.$eq) {
        const [a, b] = expr.$eq;
        return fieldRef(a, doc) === b;
      }
      if ('$ne' in expr && expr.$ne) {
        const [a, b] = expr.$ne;
        return fieldRef(a, doc) !== b;
      }
      if ('$gte' in expr && expr.$gte) {
        const [a, b] = expr.$gte;
        return (fieldRef(a, doc) as number) >= (b as number);
      }
      throw new Error(`Unsupported $expr operator in test interpreter: ${JSON.stringify(expr)}`);
    }

    function validatesAgainstMongoValidator(doc: Record<string, unknown>): boolean {
      const validator = adminAccessLogJsonSchemaValidator as {
        $and: [{ $jsonSchema: JsonSchema }, { $or: Array<{ $expr: Expr }> }];
      };
      const [{ $jsonSchema: schema }, { $or: branches }] = validator.$and;
      if (!matchesJsonSchema(schema, doc)) return false;
      return branches.some((branch) => evalExpr(branch.$expr, doc));
    }

    const base = {
      actorAccountId: 'actor-1',
      actorSessionId: 'session-1',
      auditRequestId: null,
      endpoint: 'PATCH /v1/security/cases/:caseId',
      ipAddress: null,
      userAgent: null,
      legalHold: false,
      createdAt: new Date(),
    };

    it('accepts a privileged_state_change / recovery_case row shaped like admin-access-log.ts emits it', () => {
      const row = {
        ...base,
        eventType: 'privileged_state_change',
        resourceType: 'recovery_case',
        targetAccountId: 'account-1',
        resourceId: new ObjectId(),
        resultCount: null,
        fromStatus: 'open',
        toStatus: 'investigating',
      };
      expect(validatesAgainstMongoValidator(row)).toBe(true);
    });

    it('rejects a privileged_state_change row missing toStatus', () => {
      const row = {
        ...base,
        eventType: 'privileged_state_change',
        resourceType: 'recovery_case',
        targetAccountId: 'account-1',
        resourceId: new ObjectId(),
        resultCount: null,
        fromStatus: 'open',
        toStatus: null,
      };
      expect(validatesAgainstMongoValidator(row)).toBe(false);
    });

    it('rejects a privileged_state_change row carrying a non-null resultCount', () => {
      const row = {
        ...base,
        eventType: 'privileged_state_change',
        resourceType: 'recovery_case',
        targetAccountId: 'account-1',
        resourceId: new ObjectId(),
        resultCount: 1,
        fromStatus: 'open',
        toStatus: 'investigating',
      };
      expect(validatesAgainstMongoValidator(row)).toBe(false);
    });

    it('still accepts a pre-existing privileged_data_access / policy row (no regression)', () => {
      const row = {
        ...base,
        eventType: 'privileged_data_access',
        resourceType: 'policy',
        targetAccountId: 'account-1',
        resourceId: new ObjectId(),
        resultCount: null,
        fromStatus: null,
        toStatus: null,
      };
      expect(validatesAgainstMongoValidator(row)).toBe(true);
    });

    it('still accepts a pre-existing privileged_bulk_access / asset row (no regression)', () => {
      const row = {
        ...base,
        eventType: 'privileged_bulk_access',
        resourceType: 'asset',
        targetAccountId: null,
        resourceId: null,
        resultCount: 0,
        fromStatus: null,
        toStatus: null,
      };
      expect(validatesAgainstMongoValidator(row)).toBe(true);
    });

    it('rejects resourceType values outside the enum (e.g. a typo) even for recovery_case event types', () => {
      const row = {
        ...base,
        eventType: 'privileged_state_change',
        resourceType: 'recovery_cases', // typo — not in the enum
        targetAccountId: 'account-1',
        resourceId: new ObjectId(),
        resultCount: null,
        fromStatus: 'open',
        toStatus: 'investigating',
      };
      expect(validatesAgainstMongoValidator(row)).toBe(false);
    });
  });
});
