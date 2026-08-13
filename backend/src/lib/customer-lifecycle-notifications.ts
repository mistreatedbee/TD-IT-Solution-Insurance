/**
 * Customer lifecycle notifications — ONB-001/002 and POL-003 renewal checks.
 * Invoked on login and GET /account/me (no scheduler yet).
 */
import type { AccountRow } from '../repositories/accounts.js';
import type { AppContext } from '../context.js';

export async function runCustomerLifecycleNotifications(
  ctx: Pick<
    AppContext,
    | 'policies'
    | 'onboardingNotifications'
    | 'policyNotifications'
  >,
  account: AccountRow,
): Promise<void> {
  if (account.userType !== 'customer' || account.accountState !== 'active') {
    return;
  }

  await ctx.onboardingNotifications.notifyWelcomeIfNeeded(account.id);

  const policyCount = await ctx.policies.countByAccount(account.id);
  await ctx.onboardingNotifications.maybeNotifyOnboardingIncomplete({
    accountId: account.id,
    accountCreatedAt: account.createdAt,
    policyCount,
  });

  const activePolicies = await ctx.policies.listActiveForAccount(account.id);
  await ctx.policyNotifications.maybeNotifyRenewalReminders({
    accountId: account.id,
    activePolicies,
  });
}

/** Fire-and-forget wrapper for route handlers. */
export function scheduleCustomerLifecycleNotifications(
  ctx: Pick<
    AppContext,
    | 'policies'
    | 'onboardingNotifications'
    | 'policyNotifications'
  >,
  account: AccountRow,
): void {
  void runCustomerLifecycleNotifications(ctx, account).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[notifications:lifecycle]', err instanceof Error ? err.message : err);
  });
}
