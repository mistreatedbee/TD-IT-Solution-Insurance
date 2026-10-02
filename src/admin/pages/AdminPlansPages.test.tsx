/**
 * ADR-0012 SU-FU-1 — step-up coverage for the plan-catalog Tier A gap
 * (`PATCH /v1/admin/plans/:planId`). Same four scenarios as
 * `AdminDataPages.test.tsx`.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanEditPage } from './AdminPlansPages';
import { ApiError } from '../../dashboard/api/errors';
import type { AdminPlanCatalogItem } from '../api/admin-plans';

vi.mock('../api/admin-plans', () => ({
  listAdminPlans: vi.fn(),
  updateAdminPlan: vi.fn(),
  formatPlanPrice: () => 'R100/month',
}));
vi.mock('../api/step-up', () => ({
  requestStepUpChallenge: vi.fn(),
  verifyStepUp: vi.fn(),
}));

import { listAdminPlans, updateAdminPlan } from '../api/admin-plans';
import { requestStepUpChallenge, verifyStepUp } from '../api/step-up';

function byName(name: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!el) throw new Error(`no input[name="${name}"] found`);
  return el;
}

function plan(overrides: Partial<AdminPlanCatalogItem> = {}): AdminPlanCatalogItem {
  return {
    id: 'plan-1',
    slug: 'standard',
    name: 'Standard',
    tagline: 'Everyday protection',
    positioning: undefined,
    maxAssets: 5,
    maxUsers: null,
    monthlyAmountCents: 10000,
    currency: 'ZAR',
    isCustomPricing: false,
    isMostPopular: false,
    isActive: true,
    sortOrder: 1,
    supportLevel: undefined,
    features: ['Feature 1'],
    accountTypes: ['individual'],
    createdAt: '2026-01-01T00:00:00.000Z',
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

async function renderAndSave() {
  vi.mocked(listAdminPlans).mockResolvedValue({ data: [plan()] });
  render(
    <MemoryRouter>
      <PlanEditPage planId="plan-1" />
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument());
}

describe('PlanEditPage step-up (ADR-0012 SU-FU-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(a) blocked by step-up, verifies, and automatically retries the plan update', async () => {
    const user = userEvent.setup();
    vi.mocked(updateAdminPlan)
      .mockRejectedValueOnce(stepUpRequiredError())
      .mockResolvedValueOnce(plan({ name: 'Standard Plus' }));
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-1', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockResolvedValueOnce({
      mfaVerifiedAt: '2026-10-02T00:00:00.000Z',
      stepUpExpiresAt: '2026-10-02T00:15:00.000Z',
    });

    await renderAndSave();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(screen.getByText('Plan updated.')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateAdminPlan).toHaveBeenCalledTimes(2);
  });

  it('(b) cancelling the dialog performs no mutation and shows no success indication', async () => {
    const user = userEvent.setup();
    vi.mocked(updateAdminPlan).mockRejectedValueOnce(stepUpRequiredError());
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-2', expiresIn: 60 });

    await renderAndSave();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Plan updated.')).not.toBeInTheDocument();
    expect(updateAdminPlan).toHaveBeenCalledTimes(1);
    expect(verifyStepUp).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('(c) a wrong TOTP code shows an inline error, keeps the dialog open, and does not retry', async () => {
    const user = userEvent.setup();
    vi.mocked(updateAdminPlan).mockRejectedValueOnce(stepUpRequiredError());
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-3', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockRejectedValueOnce(mfaInvalidError(2));

    await renderAndSave();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(screen.getByText(/2 attempts remaining/)).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument();
    expect(updateAdminPlan).toHaveBeenCalledTimes(1);
  });

  it('(d) no sign-out happens anywhere in the STEP_UP_REQUIRED flow', async () => {
    const user = userEvent.setup();
    vi.mocked(updateAdminPlan)
      .mockRejectedValueOnce(stepUpRequiredError())
      .mockResolvedValueOnce(plan({ name: 'Standard Plus' }));
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-4', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockResolvedValueOnce({
      mfaVerifiedAt: '2026-10-02T00:00:00.000Z',
      stepUpExpiresAt: '2026-10-02T00:15:00.000Z',
    });

    await renderAndSave();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(updateAdminPlan).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: /Edit plan/ })).toBeInTheDocument();
  });
});
