/**
 * OB-03 [A7] — DB-5 dispatch-queue index. Pure unit test against the exported
 * `recoveryCaseIndexes` array (no live MongoDB required) — confirms the index spec
 * referenced by api-design-ob03-dispatch-location-grants.md §0 actually shipped in
 * this file, in the exact key order the (not-yet-built) admin dispatch-queue list/
 * count routes filter/sort by.
 */
import { describe, it, expect } from 'vitest';
import { recoveryCaseIndexes } from './recovery-collections.js';

describe('recoveryCaseIndexes — OB-03 DB-5 dispatch-queue index', () => {
  it('includes { partnerOrganizationId, dispatchStatus, status, createdAt } named recovery_cases_dispatch_queue', () => {
    const dispatchQueueIndex = recoveryCaseIndexes.find((idx) => idx.name === 'recovery_cases_dispatch_queue');
    expect(dispatchQueueIndex).toBeDefined();
    expect(dispatchQueueIndex?.key).toEqual({
      partnerOrganizationId: 1,
      dispatchStatus: 1,
      status: 1,
      createdAt: -1,
    });
  });
});
