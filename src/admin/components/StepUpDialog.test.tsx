/**
 * StepUpDialog generalisation (2026-11-25, customer Locate now): the optional password fallback
 * must never appear for an admin caller (no `passwordReauth`), and the anti-downgrade answer from
 * the password route switches the customer back to the authenticator-code step.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../dashboard/api/errors';
import { StepUpDialog } from './StepUpDialog';

const notEnrolled = () => new ApiError(409, { error: { code: 'MFA_NOT_ENROLLED', message: 'not enrolled' } });

describe('StepUpDialog', () => {
  it('admin default: MFA_NOT_ENROLLED shows an error, never a password field', async () => {
    const requestChallenge = vi.fn().mockRejectedValue(notEnrolled());
    render(<StepUpDialog onVerified={vi.fn()} onCancel={vi.fn()} requestChallenge={requestChallenge} verify={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument();
    await waitFor(() => expect(requestChallenge).toHaveBeenCalledTimes(1));
    // The refusal is surfaced as an error (unchanged admin behaviour) ...
    await waitFor(() => expect(screen.getByText(/not enrolled/i)).toBeInTheDocument());
    // ... and there is never a password field for an admin caller.
    expect(screen.queryByLabelText(/^Password/)).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it('switches back to the authenticator code when the password route says MFA_STEP_UP_REQUIRED', async () => {
    const requestChallenge = vi
      .fn()
      .mockRejectedValueOnce(notEnrolled())
      .mockResolvedValueOnce({ stepUpChallengeToken: 'tok', expiresIn: 300 });
    const passwordReauth = vi
      .fn()
      .mockRejectedValue(new ApiError(409, { error: { code: 'MFA_STEP_UP_REQUIRED', message: 'use code' } }));
    render(
      <StepUpDialog
        onVerified={vi.fn()}
        onCancel={vi.fn()}
        requestChallenge={requestChallenge}
        verify={vi.fn()}
        passwordReauth={passwordReauth}
      />,
    );
    fireEvent.change(await screen.findByLabelText(/^Password/), { target: { value: 'pw' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
    });
    await waitFor(() => expect(requestChallenge).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText(/6-digit code/)).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});
