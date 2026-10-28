/**
 * ADR-0012 SU-FU-1 — step-up coverage for the plan-catalog Tier A gap
 * (`PATCH /v1/admin/plans/:planId`). Same four scenarios as
 * `AdminDataPages.test.tsx`.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanCreatePage, PlanEditPage } from './AdminPlansPages';
import { ApiError } from '../../dashboard/api/errors';
import type { AdminPlanCatalogItem } from '../api/admin-plans';

vi.mock('../api/admin-plans', () => ({
  listAdminPlans: vi.fn(),
  updateAdminPlan: vi.fn(),
  createAdminPlan: vi.fn(),
  deleteAdminPlan: vi.fn(),
  formatPlanPrice: () => 'R100/month',
}));
vi.mock('../api/step-up', () => ({
  requestStepUpChallenge: vi.fn(),
  verifyStepUp: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { createAdminPlan, deleteAdminPlan, listAdminPlans, updateAdminPlan } from '../api/admin-plans';
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

    const dialog = await screen.findByRole('dialog', { name: 'Verify your identity' });
    // Scoped to the dialog: the underlying plan-edit form has its own
    // "Cancel" button rendered behind the overlay (not unmounted while the
    // dialog is open), so an unscoped query is ambiguous.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

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

describe('PlanEditPage — delete plan (business-owner gap report item 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('deletes a plan via the step-up flow and navigates back to the plan list', async () => {
    const user = userEvent.setup();
    vi.mocked(deleteAdminPlan)
      .mockRejectedValueOnce(stepUpRequiredError())
      .mockResolvedValueOnce({ deleted: true });
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-del-1', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockResolvedValueOnce({
      mfaVerifiedAt: '2026-10-02T00:00:00.000Z',
      stepUpExpiresAt: '2026-10-02T00:15:00.000Z',
    });

    await renderAndSave();
    await user.click(screen.getByRole('button', { name: 'Delete plan' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin/plans'));
    expect(deleteAdminPlan).toHaveBeenCalledTimes(2);
  });

  it('shows the backend\'s referenced-by-policy detail, not a generic message, on 409', async () => {
    const user = userEvent.setup();
    vi.mocked(deleteAdminPlan).mockRejectedValueOnce(
      new ApiError(409, {
        error: {
          code: 'CONFLICT',
          message: 'The request conflicts with the current state of the resource.',
          details: ['This plan is referenced by one or more policies and cannot be deleted.'],
        },
      }),
    );

    await renderAndSave();
    await user.click(screen.getByRole('button', { name: 'Delete plan' }));

    await waitFor(() =>
      expect(
        screen.getByText('This plan is referenced by one or more policies and cannot be deleted.'),
      ).toBeInTheDocument(),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('PlanCreatePage (business-owner gap report item 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits the required fields and navigates to the new plan on success', async () => {
    const user = userEvent.setup();
    vi.mocked(createAdminPlan).mockResolvedValueOnce({
      id: 'plan-new',
      slug: 'new-tier',
      name: 'New Tier',
      tagline: 'A new tier',
      positioning: 'For everyone',
      maxAssets: null,
      maxUsers: null,
      monthlyAmountCents: null,
      currency: 'ZAR',
      isCustomPricing: false,
      isMostPopular: false,
      isActive: true,
      sortOrder: 0,
      supportLevel: 'standard',
      features: [],
      accountTypes: ['both'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <PlanCreatePage />
      </MemoryRouter>,
    );

    await user.type(byName('slug'), 'new-tier');
    await user.type(byName('name'), 'New Tier');
    await user.type(byName('tagline'), 'A new tier');
    await user.type(byName('positioning'), 'For everyone');

    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    await waitFor(() => expect(createAdminPlan).toHaveBeenCalledTimes(1));
    expect(createAdminPlan).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'new-tier', name: 'New Tier', tagline: 'A new tier', positioning: 'For everyone' }),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin/plans/plan-new'));
  });

  it('shows a validation error and does not call the API when required fields are missing', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <PlanCreatePage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    await waitFor(() =>
      expect(screen.getByText('Slug, display name, tagline, and positioning are all required.')).toBeInTheDocument(),
    );
    expect(createAdminPlan).not.toHaveBeenCalled();
  });

  it('shows a clear message instead of crashing when the slug is already taken (409)', async () => {
    const user = userEvent.setup();
    vi.mocked(createAdminPlan).mockRejectedValueOnce(
      new ApiError(409, { error: { code: 'CONFLICT', message: 'conflict' } }),
    );

    render(
      <MemoryRouter>
        <PlanCreatePage />
      </MemoryRouter>,
    );

    await user.type(byName('slug'), 'standard');
    await user.type(byName('name'), 'Standard');
    await user.type(byName('tagline'), 'Tagline');
    await user.type(byName('positioning'), 'Positioning');
    await user.click(screen.getByRole('button', { name: 'Create plan' }));

    await waitFor(() =>
      expect(
        screen.getByText('A plan with this slug already exists. Choose a different slug.'),
      ).toBeInTheDocument(),
    );
  });
});
