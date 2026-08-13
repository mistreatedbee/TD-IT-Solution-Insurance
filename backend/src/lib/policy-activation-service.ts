/**
 * Activates a pending policy — wired for future payment webhooks (POL-002).
 */
import type { PolicyDocument, PoliciesRepo } from '../repositories/policies.js';
import type { PolicyStatusHistoryRepo } from '../repositories/policy-status-history.js';
import type { PolicyNotificationService } from './policy-notification-service.js';

export interface PolicyActivationService {
  activatePolicy(params: {
    accountId: string;
    policyId: string;
    reason: string;
  }): Promise<PolicyDocument | null>;
}

export function createPolicyActivationService(deps: {
  policies: PoliciesRepo;
  policyStatusHistory: PolicyStatusHistoryRepo;
  policyNotifications: PolicyNotificationService;
}): PolicyActivationService {
  return {
    async activatePolicy({ accountId, policyId, reason }) {
      const policy = await deps.policies.activateForAccount(accountId, policyId);
      if (!policy) return null;

      await deps.policyStatusHistory.recordTransition({
        policyId,
        accountId,
        fromStatus: 'pending_activation',
        toStatus: 'active',
        reason,
      });

      await deps.policyNotifications.notifyPolicyActivated({
        accountId,
        policyId,
        planName: policy.planTier,
        effectiveDate: policy.effectiveDate,
      });

      return policy;
    },
  };
}
