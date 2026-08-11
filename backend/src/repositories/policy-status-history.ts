/**
 * `policy_status_history` collection — database-design.md §3.2.
 */
import { ObjectId, type Db } from 'mongodb';
import type { PolicyStatus } from './policies.js';

export function createPolicyStatusHistoryRepo(db: Db) {
  const collection = () => db.collection('policy_status_history');

  return {
    async recordInitial(params: {
      policyId: string;
      accountId: string;
      toStatus: PolicyStatus;
      reason: string;
    }): Promise<void> {
      await collection().insertOne({
        policyId: new ObjectId(params.policyId),
        accountId: params.accountId,
        fromStatus: null,
        toStatus: params.toStatus,
        reason: params.reason,
        actorAccountId: null,
        createdAt: new Date(),
      });
    },
  };
}

export type PolicyStatusHistoryRepo = ReturnType<typeof createPolicyStatusHistoryRepo>;
