/**
 * BR-2-equivalent live account gate for policy/asset writes — api-design.md §4.3.
 * In-process today: calls ctx.accounts.getAccountStatus (same data path as
 * GET /v1/internal/accounts/{id}/status), not an HTTP round-trip.
 */
import type { AccountsRepo } from '../repositories/accounts.js';
import { apiError } from './errors.js';

export async function requireActiveAccount(accounts: AccountsRepo, accountId: string): Promise<void> {
  const status = await accounts.getAccountStatus(accountId);
  if (!status) {
    throw apiError('NOT_FOUND');
  }
  if (status.accountState !== 'active') {
    throw apiError('ACCOUNT_NOT_ACTIVE');
  }
}
