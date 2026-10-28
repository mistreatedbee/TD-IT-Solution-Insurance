import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteStaffPage } from './InviteStaffPage';
import { ApiError } from '../../dashboard/api/errors';

vi.mock('../api/admin-invitations', () => ({
  createInvitation: vi.fn(),
  requestStepUpChallenge: vi.fn(),
  verifyStepUp: vi.fn(),
}));

vi.mock('../api/admin-partner-organizations', () => ({
  listPartnerOrganizations: vi.fn(),
}));

import { createInvitation, requestStepUpChallenge, verifyStepUp } from '../api/admin-invitations';
import { listPartnerOrganizations } from '../api/admin-partner-organizations';

function renderPage() {
  return render(
    <MemoryRouter>
      <InviteStaffPage />
    </MemoryRouter>,
  );
}

/**
 * `screen.getByLabelText` relies on jsdom's `HTMLInputElement.labels`, which
 * returns an empty NodeList for `required` inputs in this environment (a
 * known jsdom/React-`useId` interaction, unrelated to this component) — so
 * label association is verified visually in the component itself and these
 * tests target fields by their `name` attribute instead, per the existing
 * convention in InvitationAcceptPage.test.tsx.
 */
function byName(name: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!el) throw new Error(`no input[name="${name}"] found`);
  return el;
}

function stepUpRequiredError() {
  return new ApiError(401, { error: { code: 'STEP_UP_REQUIRED', message: 'step-up required' } });
}

function mfaInvalidError(attemptsRemaining: number) {
  return new ApiError(401, {
    error: { code: 'MFA_CHALLENGE_INVALID', message: 'wrong code', details: { attemptsRemaining } },
  });
}

describe('InviteStaffPage (Feature 017 D-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPartnerOrganizations).mockResolvedValue({
      data: [
        {
          id: 'org-1',
          name: 'Acme Recovery',
          status: 'active',
          contactEmail: 'ops@acme.example',
          notes: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('sends the invitation immediately when the session is already fresh (no step-up needed)', async () => {
    const user = userEvent.setup();
    vi.mocked(createInvitation).mockResolvedValueOnce({
      id: 'inv-1',
      status: 'pending',
      expiresAt: '2026-10-01T00:00:00.000Z',
    });

    renderPage();

    await user.type(byName('email'), 'newadmin@example.com');
    await user.click(screen.getByRole('radio', { name: 'Admin' }));
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => expect(screen.getByText(/Invitation sent to newadmin@example\.com/)).toBeInTheDocument());
    expect(requestStepUpChallenge).not.toHaveBeenCalled();
    expect(createInvitation).toHaveBeenCalledTimes(1);
    expect(createInvitation).toHaveBeenCalledWith(
      { email: 'newadmin@example.com', userType: 'admin' },
      expect.any(String),
    );
  });

  it('handles STEP_UP_REQUIRED: opens the step-up dialog, verifies, and automatically retries with the same Idempotency-Key', async () => {
    const user = userEvent.setup();
    vi.mocked(createInvitation)
      .mockRejectedValueOnce(stepUpRequiredError())
      .mockResolvedValueOnce({ id: 'inv-2', status: 'pending', expiresAt: '2026-10-01T00:00:00.000Z' });
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-1', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockResolvedValueOnce({
      mfaVerifiedAt: '2026-09-23T00:00:00.000Z',
      stepUpExpiresAt: '2026-09-23T00:15:00.000Z',
    });

    renderPage();

    await user.type(byName('email'), 'support@example.com');
    await user.click(screen.getByRole('radio', { name: 'Support agent' }));
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await waitFor(() => expect(requestStepUpChallenge).toHaveBeenCalledTimes(1));

    await user.type(byName('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and send' }));

    await waitFor(() => expect(screen.getByText(/Invitation sent to support@example\.com/)).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    expect(verifyStepUp).toHaveBeenCalledWith('chal-1', '123456');
    expect(createInvitation).toHaveBeenCalledTimes(2);
    const firstKey = vi.mocked(createInvitation).mock.calls[0][1];
    const secondKey = vi.mocked(createInvitation).mock.calls[1][1];
    expect(secondKey).toBe(firstKey);
    expect(createInvitation).toHaveBeenNthCalledWith(
      2,
      { email: 'support@example.com', userType: 'support_agent' },
      firstKey,
    );
  });

  it('shows an error and does not retry the invitation when the step-up code is wrong', async () => {
    const user = userEvent.setup();
    vi.mocked(createInvitation).mockRejectedValueOnce(stepUpRequiredError());
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-2', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockRejectedValueOnce(mfaInvalidError(2));

    renderPage();

    await user.type(byName('email'), 'admin2@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify and send' }));

    await waitFor(() => expect(screen.getByText(/2 attempts remaining/)).toBeInTheDocument());
    // Still inside the dialog — no automatic retry happened.
    expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument();
    expect(createInvitation).toHaveBeenCalledTimes(1);
  });

  it('offers security_company_operator alongside admin and support agent', async () => {
    renderPage();

    expect(screen.getByRole('radio', { name: 'Admin' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Support agent' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Security company operator' })).toBeEnabled();
  });

  it('sends a security_company_operator invitation with the selected partner organization', async () => {
    const user = userEvent.setup();
    vi.mocked(createInvitation).mockResolvedValueOnce({
      id: 'inv-3',
      status: 'pending',
      expiresAt: '2026-10-01T00:00:00.000Z',
    });

    renderPage();

    await user.type(byName('email'), 'operator@example.com');
    await user.click(screen.getByRole('radio', { name: 'Security company operator' }));

    await waitFor(() => expect(listPartnerOrganizations).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Acme Recovery' })).toBeInTheDocument());

    const select = document.querySelector<HTMLSelectElement>('select[name="partnerOrganizationId"]');
    if (!select) throw new Error('no partnerOrganizationId select found');
    await user.selectOptions(select, 'org-1');

    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => expect(screen.getByText(/Invitation sent to operator@example\.com/)).toBeInTheDocument());
    expect(createInvitation).toHaveBeenCalledWith(
      { email: 'operator@example.com', userType: 'security_company_operator', partnerOrganizationId: 'org-1' },
      expect.any(String),
    );
  });

  it('blocks submission of a security_company_operator invite with no partner org selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(byName('email'), 'operator2@example.com');
    await user.click(screen.getByRole('radio', { name: 'Security company operator' }));
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => expect(screen.getByText(/Choose a partner organization/)).toBeInTheDocument());
    expect(createInvitation).not.toHaveBeenCalled();
  });
});
