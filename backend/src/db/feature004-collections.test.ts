/**
 * Static regression coverage for Feature 004 Mongo bootstrap specs —
 * admin_access_log validator/index shape per database-addendum-001.md §1–§2
 * (Amendment A1 / ADR-0006 R-1).
 */
import { describe, it, expect } from 'vitest';

import {
  FEATURE004_COLLECTIONS,
  FEATURE004_INDEXES,
  adminAccessLogJsonSchemaValidator,
} from './feature004-collections.js';

describe('db/feature004-collections — admin_access_log bootstrap specs', () => {
  it('registers admin_access_log in FEATURE004_COLLECTIONS', () => {
    expect(FEATURE004_COLLECTIONS.adminAccessLog).toBe('admin_access_log');
  });

  it('defines four named indexes per database-addendum-001.md §2', () => {
    const indexes = FEATURE004_INDEXES.adminAccessLog;
    expect(indexes).toHaveLength(4);
    expect(indexes.map((idx) => idx.name)).toEqual([
      'admin_access_log_actorAccountId_createdAt',
      'admin_access_log_actorSessionId_createdAt',
      'admin_access_log_targetAccountId_createdAt_partial',
      'admin_access_log_createdAt_purge_partial',
    ]);

    const targetPartial = indexes[2];
    expect(targetPartial?.partialFilterExpression).toEqual({
      targetAccountId: { $type: 'string' },
    });

    const purgePartial = indexes[3];
    expect(purgePartial?.partialFilterExpression).toEqual({ legalHold: false });
  });

  it('requires ADR-0006 R-1 correlation fields on every document', () => {
    const validator = adminAccessLogJsonSchemaValidator as {
      $and: Array<{ $jsonSchema?: { required: string[]; properties: Record<string, { enum?: string[] }> } }>;
    };
    const schema = validator.$and[0]?.$jsonSchema;
    expect(schema).toBeDefined();

    expect(schema!.required).toEqual(
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
    expect(schema!.properties.eventType?.enum).toEqual([
      'privileged_data_access',
      'privileged_bulk_access',
    ]);
  });

  it('encodes R-1 conditional invariants via $expr (MongoDB lacks if/then in $jsonSchema)', () => {
    const validator = adminAccessLogJsonSchemaValidator as {
      $and: Array<Record<string, unknown>>;
    };
    const exprBranch = validator.$and[1];
    expect(exprBranch).toHaveProperty('$or');
    const branches = (exprBranch as { $or: Array<{ $expr?: unknown }> }).$or;
    expect(branches).toHaveLength(2);
    expect(branches[0]).toHaveProperty('$expr');
    expect(branches[1]).toHaveProperty('$expr');
  });
});
