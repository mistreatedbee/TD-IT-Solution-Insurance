/**
 * ADR-0012 SU-FU-1 — step-up coverage for the account-state Tier A gap
 * (`PATCH /v1/admin/accounts/:id/state`). Mirrors the four scenarios
 * required by SU-FU-1: (a) blocked → verify → automatic retry succeeds,
 * (b) cancel leaves no mutation and no success indication, (c) wrong code
 * shows an inline error without closing the dialog or retrying, (d) no
 * logout ever happens on STEP_UP_REQUIRED (the client-level guarantee for
 * that is covered by `src/dashboard/api/client.test.ts`; here we only
 * additionally assert no navigation-away/sign-out side effect occurs on
 * this page).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDetailPage } from './AdminDataPages';
import { ApiError } from '../../dashboard/api/errors';
import type { AdminAccountDetail } from '../api/admin-data';

vi.mock('../api/admin-data', () => ({
  getAdminAccount: vi.fn(),
  updateAdminAccountState: vi.fn(),
}));
vi.mock('../api/step-up', () => ({
  requestStepUpChallenge: vi.fn(),
  verifyStepUp: vi.fn(),
}));

import { getAdminAccount, updateAdminAccountState } from '../api/admin-data';
import { requestStepUpChallenge, verifyStepUp } from '../api/step-up';

/**
 * Mirrors `InviteStaffPage.test.tsx`'s `byName` helper: `getByLabelText`
 * relies on jsdom's `HTMLInputElement.labels`, which returns an empty
 * NodeList for `required` inputs in this environment — targeting by `name`
 * attribute is the established convention here instead.
 */
function byName(name: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!el) throw new Error(`no input[name="${name}"] found`);
  return el;
}

function account(overrides: Partial<AdminAccountDetail> = {}): AdminAccountDetail {
  return {
    id: 'acct-1',
    email: 'customer@example.com',
    userType: 'customer',
    accountState: 'active',
    partnerOrganizationId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    phone: null,
    mfaRequired: false,
    invitedBy: null,
    suspendedAt: null,
    deactivatedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stepUpRequiredError() {
  return new ApiError(401, { error: { code: 'STEP_UP_REQUIRED', message: 'step-up required' } });
}

function mfaInvalidError(attemptsRemaining: number) {
  return new ApiError(401, {
    error: { code: 'MFA_CHALLENGE_INVALID', message: 'wrong code', details: { attemptsRemaining } },
  });
}

async function renderAndSuspend() {
  vi.mocked(getAdminAccount).mockResolvedValue(account());
  render(
    <MemoryRouter>
      <AccountDetailPage accountId="acct-1" />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Suspend account' })).toBeInTheDocument());
}

describe('AccountDetailPage account-state step-up (ADR-0012 SU-FU-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('(a) blocked by step-up, verifies, and automatically retries the state change', async () => {
    const user = userEvent.setup();
    vi.mocked(updateAdminAccountState)
      .mockRejectedValueOnce(stepUpRequiredError())
      .mockResolvedValueOnce(account({ accountState: 'suspended', suspendedAt: '2026-10-02T00:00:00.000Z' }));
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-1', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockResolvedValueOnce({
      mfaVerifiedAt: '2026-10-02T00:00:00.000Z',
      stepUpExpiresAt: '2026-10-02T00:15:00.000Z',
    });

    await renderAndSuspend();
    await user.click(screen.getByRole('button', { name: 'Suspend account' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() =>
      expect(screen.getByText(/All sessions were revoked and push tokens disabled/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateAdminAccountState).toHaveBeenCalledTimes(2);
  });

  it('(b) cancelling the dialog performs no mutation and shows no success indication', async () => {
    const user = userEvent.setup();
    vi.mocked(updateAdminAccountState).mockRejectedValueOnce(stepUpRequiredError());
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-2', expiresIn: 60 });

    await renderAndSuspend();
    await user.click(screen.getByRole('button', { name: 'Suspend account' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/All sessions were revoked/)).not.toBeInTheDocument();
    expect(updateAdminAccountState).toHaveBeenCalledTimes(1);
    expect(verifyStepUp).not.toHaveBeenCalled();
    // The account-state buttons are still present, i.e. no navigation away happened.
    expect(screen.getByRole('button', { name: 'Suspend account' })).toBeInTheDocument();
  });

  it('(c) a wrong TOTP code shows an inline error, keeps the dialog open, and does not retry', async () => {
    const user = userEvent.setup();
    vi.mocked(updateAdminAccountState).mockRejectedValueOnce(stepUpRequiredError());
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-3', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockRejectedValueOnce(mfaInvalidError(2));

    await renderAndSuspend();
    await user.click(screen.getByRole('button', { name: 'Suspend account' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(screen.getByText(/2 attempts remaining/)).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument();
    expect(updateAdminAccountState).toHaveBeenCalledTimes(1);
  });

  it('(d) no sign-out happens anywhere in the STEP_UP_REQUIRED flow', async () => {
    const user = userEvent.setup();
    vi.mocked(updateAdminAccountState)
      .mockRejectedValueOnce(stepUpRequiredError())
      .mockResolvedValueOnce(account({ accountState: 'suspended' }));
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-4', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockResolvedValueOnce({
      mfaVerifiedAt: '2026-10-02T00:00:00.000Z',
      stepUpExpiresAt: '2026-10-02T00:15:00.000Z',
    });

    await renderAndSuspend();
    await user.click(screen.getByRole('button', { name: 'Suspend account' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(updateAdminAccountState).toHaveBeenCalledTimes(2));
    // Still on the account detail page — no redirect to a sign-in screen.
    expect(screen.getByRole('heading', { name: 'customer@example.com' })).toBeInTheDocument();
  });
});
