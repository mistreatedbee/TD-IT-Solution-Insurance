/**
 * ADR-0012 SU-FU-1 — step-up coverage for the identity-verification Tier A
 * gap (`PATCH /v1/admin/accounts/:id/profile/verification`). Same four
 * scenarios as `AdminDataPages.test.tsx`.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerificationReviewPage } from './AdminVerificationPages';
import { ApiError } from '../../dashboard/api/errors';
import type { AdminCustomerProfileResponse } from '../api/admin-verification';

vi.mock('../api/admin-verification', () => ({
  listVerificationRequests: vi.fn(),
  getAdminCustomerProfile: vi.fn(),
  reviewCustomerVerification: vi.fn(),
  getVerificationHistory: vi.fn(),
  addVerificationNote: vi.fn(),
}));
vi.mock('../api/step-up', () => ({
  requestStepUpChallenge: vi.fn(),
  verifyStepUp: vi.fn(),
}));

import {
  addVerificationNote,
  getAdminCustomerProfile,
  getVerificationHistory,
  reviewCustomerVerification,
} from '../api/admin-verification';
import { requestStepUpChallenge, verifyStepUp } from '../api/step-up';

function byName(name: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!el) throw new Error(`no input[name="${name}"] found`);
  return el;
}

function profileResponse(
  overrides: Partial<AdminCustomerProfileResponse['profile']> = {},
): AdminCustomerProfileResponse {
  return {
    account: { id: 'acct-1', email: 'customer@example.com', accountState: 'active' },
    profile: {
      verificationStatus: 'pending_review',
      verificationSubmittedAt: '2026-10-01T00:00:00.000Z',
      idNumberMasked: '**** 1234',
      phone: '+27000000000',
      firstName: 'Jane',
      middleName: null,
      lastName: 'Doe',
      dateOfBirth: '1990-01-01',
      residentialAddress: null,
      emergencyContact: null,
      completionPercent: 100,
      rejectionReasonCustomerSafe: null,
      verificationRevision: 0,
      ...overrides,
    } as AdminCustomerProfileResponse['profile'],
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

async function renderReview() {
  vi.mocked(getAdminCustomerProfile).mockResolvedValue(profileResponse());
  if (!vi.mocked(getVerificationHistory).getMockImplementation()) {
    vi.mocked(getVerificationHistory).mockResolvedValue({ decisions: [], notes: [] });
  }
  render(
    <MemoryRouter initialEntries={['/admin/verification/acct-1']}>
      <Routes>
        <Route path="/admin/verification/:accountId" element={<VerificationReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument());
}

describe('VerificationReviewPage step-up (ADR-0012 SU-FU-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('(a) blocked by step-up, verifies, and automatically retries the approval', async () => {
    const user = userEvent.setup();
    vi.mocked(reviewCustomerVerification)
      .mockRejectedValueOnce(stepUpRequiredError())
      .mockResolvedValueOnce(profileResponse({ verificationStatus: 'verified' }));
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-1', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockResolvedValueOnce({
      mfaVerifiedAt: '2026-10-02T00:00:00.000Z',
      stepUpExpiresAt: '2026-10-02T00:15:00.000Z',
    });

    await renderReview();
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '123456');
    // The 6th digit auto-submits the code (no Verify click needed).

    await waitFor(() => expect(screen.getByText('Identity verified successfully.')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(reviewCustomerVerification).toHaveBeenCalledTimes(2);
  });

  it('(b) cancelling the dialog performs no mutation and shows no success indication', async () => {
    const user = userEvent.setup();
    vi.mocked(reviewCustomerVerification).mockRejectedValueOnce(stepUpRequiredError());
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-2', expiresIn: 60 });

    await renderReview();
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Identity verified successfully.')).not.toBeInTheDocument();
    expect(reviewCustomerVerification).toHaveBeenCalledTimes(1);
    expect(verifyStepUp).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('(c) a wrong TOTP code shows an inline error, keeps the dialog open, and does not retry', async () => {
    const user = userEvent.setup();
    vi.mocked(reviewCustomerVerification).mockRejectedValueOnce(stepUpRequiredError());
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-3', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockRejectedValueOnce(mfaInvalidError(2));

    await renderReview();
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '000000');
    // The 6th digit auto-submits the code (no Verify click needed).

    await waitFor(() => expect(screen.getByText(/2 attempts remaining/)).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument();
    expect(reviewCustomerVerification).toHaveBeenCalledTimes(1);
  });

  it('(d) no sign-out happens anywhere in the STEP_UP_REQUIRED flow', async () => {
    const user = userEvent.setup();
    vi.mocked(reviewCustomerVerification)
      .mockRejectedValueOnce(stepUpRequiredError())
      .mockResolvedValueOnce(profileResponse({ verificationStatus: 'verified' }));
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-4', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockResolvedValueOnce({
      mfaVerifiedAt: '2026-10-02T00:00:00.000Z',
      stepUpExpiresAt: '2026-10-02T00:15:00.000Z',
    });

    await renderReview();
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '123456');
    // The 6th digit auto-submits the code (no Verify click needed).

    await waitFor(() => expect(reviewCustomerVerification).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'Verification review' })).toBeInTheDocument();
  });
});

describe('VerificationReviewPage history and internal notes (Feature 023 Phase A)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows past decisions with reviewer and existing notes', async () => {
    vi.mocked(getVerificationHistory).mockResolvedValue({
      decisions: [
        {
          id: 'd1',
          decision: 'action_required',
          decidedAt: '2026-11-01T10:00:00.000Z',
          reviewer: { accountId: 'admin-1', email: 'reviewer@example.com' },
        },
      ],
      notes: [
        {
          id: 'n1',
          text: 'Called customer about surname.',
          createdAt: '2026-11-01T11:00:00.000Z',
          author: { accountId: 'admin-1', email: 'reviewer@example.com' },
        },
      ],
    });
    await renderReview();
    expect(await screen.findByText('Action required')).toBeInTheDocument();
    expect(screen.getAllByText(/reviewer@example.com/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Called customer about surname.')).toBeInTheDocument();
    expect(screen.getByText(/The customer never sees these notes/)).toBeInTheDocument();
  });

  it('adds an internal note and shows it at the top of the list', async () => {
    const user = userEvent.setup();
    vi.mocked(getVerificationHistory).mockResolvedValue({ decisions: [], notes: [] });
    vi.mocked(addVerificationNote).mockResolvedValue({
      id: 'n2',
      text: 'Spoke to customer.',
      createdAt: '2026-11-02T09:00:00.000Z',
      author: { accountId: 'admin-1', email: 'reviewer@example.com' },
    });
    await renderReview();
    await screen.findByText('No internal notes yet.');
    expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled();

    await user.type(byName('internalNote'), '  Spoke to customer.  ');
    await user.click(screen.getByRole('button', { name: 'Add note' }));

    await waitFor(() => expect(addVerificationNote).toHaveBeenCalledWith('acct-1', 'Spoke to customer.'));
    expect(await screen.findByText('Spoke to customer.')).toBeInTheDocument();
    expect(byName('internalNote').value).toBe('');
  });
});
