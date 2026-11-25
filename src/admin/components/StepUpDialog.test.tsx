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
    expect(screen.queryByText('Preparing verification…')).toBeNull();
  });

  it('offers Retry when the challenge request fails, and a retry requests a new challenge', async () => {
    const requestChallenge = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'down' } }))
      .mockResolvedValueOnce({ stepUpChallengeToken: 'tok', expiresIn: 300 });
    render(<StepUpDialog onVerified={vi.fn()} onCancel={vi.fn()} requestChallenge={requestChallenge} verify={vi.fn()} />);
    const retry = await screen.findByRole('button', { name: 'Retry' });
    await act(async () => {
      fireEvent.click(retry);
    });
    expect(await screen.findByLabelText(/6-digit code/)).toBeInTheDocument();
    expect(requestChallenge).toHaveBeenCalledTimes(2);
  });

  it('names the dialog from its title, moves focus in, and restores it on close', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = render(
      <StepUpDialog
        title="Confirm it's you"
        onVerified={vi.fn()}
        onCancel={vi.fn()}
        requestChallenge={vi.fn().mockResolvedValue({ stepUpChallengeToken: 'tok', expiresIn: 300 })}
        verify={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: "Confirm it's you" });
    expect(dialog.getAttribute('aria-label')).toBeNull();
    expect(document.activeElement).toBe(dialog);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('password mode uses a password input with current-password autocomplete and clears it on success', async () => {
    const passwordReauth = vi.fn().mockResolvedValue({ reauthAt: 'x', reauthExpiresAt: 'y' });
    const onVerified = vi.fn();
    render(
      <StepUpDialog
        onVerified={onVerified}
        onCancel={vi.fn()}
        requestChallenge={vi.fn().mockRejectedValue(notEnrolled())}
        verify={vi.fn()}
        passwordReauth={passwordReauth}
      />,
    );
    const input = (await screen.findByLabelText(/^Password/)) as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.autocomplete).toBe('current-password');
    fireEvent.change(input, { target: { value: 'secret' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
    });
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(input.value).toBe('');
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
