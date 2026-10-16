/**
 * INC-003 C-8 / G-4 (link parameters) and A-25(i) (customer TOTP step) for
 * the mobile reset-password screen.
 */
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import ResetPasswordScreen from '../reset-password';
import { renderWithProviders } from '../../../src/test/renderWithProviders';
import { ApiError, NetworkUnavailableError } from '../../../src/api/errors';

let mockParams: Record<string, string | undefined> = {};
const mockReplace = jest.fn();
const mockSetParams = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn(), setParams: mockSetParams }),
}));

const mockConfirm = jest.fn();
const mockMfaVerify = jest.fn();
jest.mock('../../../src/api/auth', () => ({
  resetPasswordConfirm: (...args: unknown[]) => mockConfirm(...args),
  resetPasswordMfaVerify: (...args: unknown[]) => mockMfaVerify(...args),
  isMfaVerificationRequired: (r: object) => 'mfaVerificationRequired' in r,
}));

function apiError(status: number, code: string) {
  return new ApiError(status, { error: { code, message: code, requestId: 'req-1' } });
}

const HOOK_LINK = { token_hash: 'hash-recovery-1', type: 'recovery', email: 'Cust@Example.com' };
const GOOD_PASSWORD = 'correct-horse-9';

async function fillAndSubmit(password = GOOD_PASSWORD, confirm = password) {
  await fireEvent.changeText(screen.getByLabelText('New password'), password);
  await fireEvent.changeText(screen.getByLabelText('Confirm new password'), confirm);
  await fireEvent.press(screen.getByText('Reset password'));
}

beforeEach(() => {
  mockParams = {};
  mockReplace.mockReset();
  mockSetParams.mockReset();
  mockConfirm.mockReset();
  mockMfaVerify.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

// Kept above the fake-timer TTL test: a real-timer render placed after it hangs
// the suite (pre-existing order dependence in the TTL test, not investigated).
describe('reset-password length hint (INC-003 §30 advisory)', () => {
  it('states the security partner minimum in the hint without blocking a valid customer password', async () => {
    mockParams = { ...HOOK_LINK };
    mockConfirm.mockResolvedValue({ message: 'Password reset complete.', allSessionsRevoked: true });
    await renderWithProviders(<ResetPasswordScreen />);
    expect(
      screen.getByText('At least 10 characters. Security partner accounts need at least 14.'),
    ).toBeTruthy();
    await fillAndSubmit('abcdefghi1');
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
  });
});

describe('reset-password deep link parameters (C-8 / G-4)', () => {
  it('sends the hook token_hash as resetToken with the normalised email, then scrubs the route params', async () => {
    mockParams = { ...HOOK_LINK };
    mockConfirm.mockResolvedValue({ message: 'Password reset complete.', allSessionsRevoked: true });
    await renderWithProviders(<ResetPasswordScreen />);

    expect(mockSetParams).toHaveBeenCalledWith(
      expect.objectContaining({ token_hash: undefined, type: undefined, email: undefined, access_token: undefined }),
    );

    await fillAndSubmit();
    expect(mockConfirm).toHaveBeenCalledWith({
      resetToken: 'hash-recovery-1',
      email: 'cust@example.com',
      newPassword: GOOD_PASSWORD,
    });
    expect(screen.getByText(/Password updated/)).toBeTruthy();
  });

  it('still accepts a legacy `token` link', async () => {
    mockParams = { token: 'legacy-token', email: 'a@b.co' };
    mockConfirm.mockResolvedValue({ message: 'ok', allSessionsRevoked: true });
    await renderWithProviders(<ResetPasswordScreen />);
    await fillAndSubmit();
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ resetToken: 'legacy-token', email: 'a@b.co' }));
  });

  it('still maps the legacy access_token parameter to recoveryAccessToken (A-12, unchanged)', async () => {
    mockParams = { access_token: 'gotrue-access' };
    mockConfirm.mockResolvedValue({ message: 'ok', allSessionsRevoked: true });
    await renderWithProviders(<ResetPasswordScreen />);
    await fillAndSubmit();
    expect(mockConfirm).toHaveBeenCalledWith({ recoveryAccessToken: 'gotrue-access', newPassword: GOOD_PASSWORD });
  });

  it('shows the expired state straight away for no link, a wrong type, or a missing email', async () => {
    for (const params of [{}, { ...HOOK_LINK, type: 'signup' }, { token_hash: 'h', type: 'recovery' }]) {
      mockParams = params;
      const view = await renderWithProviders(<ResetPasswordScreen />);
      expect(screen.getByText('This link has expired')).toBeTruthy();
      await view.unmount();
    }
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('blocks a too-short password locally so the single-use link is not spent', async () => {
    mockParams = { ...HOOK_LINK };
    await renderWithProviders(<ResetPasswordScreen />);
    await fillAndSubmit('short');
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Password must be at least 10 characters.')).toBeTruthy();
  });

  it('keeps the link for a retry after a pre-redemption failure (offline / cold start)', async () => {
    mockParams = { ...HOOK_LINK };
    mockConfirm
      .mockRejectedValueOnce(new NetworkUnavailableError())
      .mockResolvedValueOnce({ message: 'ok', allSessionsRevoked: true });
    await renderWithProviders(<ResetPasswordScreen />);
    await fillAndSubmit();
    expect(screen.getByText(/Could not reach the server/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Reset password'));
    expect(mockConfirm).toHaveBeenCalledTimes(2);
    expect(mockConfirm.mock.calls[1][0]).toMatchObject({ resetToken: 'hash-recovery-1' });
    expect(screen.getByText(/Password updated/)).toBeTruthy();
  });

  it('drops the link once it is spent: 410 goes to expired; VALIDATION_ERROR cannot be resubmitted', async () => {
    mockParams = { ...HOOK_LINK };
    mockConfirm.mockRejectedValueOnce(apiError(410, 'RESET_TOKEN_EXPIRED'));
    const view = await renderWithProviders(<ResetPasswordScreen />);
    await fillAndSubmit();
    expect(screen.getByText('This link has expired')).toBeTruthy();
    await view.unmount();

    mockConfirm.mockReset();
    mockConfirm.mockRejectedValueOnce(apiError(400, 'VALIDATION_ERROR'));
    await renderWithProviders(<ResetPasswordScreen />);
    await fillAndSubmit();
    expect(screen.getByText(/can only be used once/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Reset password'));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText('This link has expired')).toBeTruthy();
  });
});

describe('reset-password TOTP second step (A-25(i))', () => {
  async function reachMfaStep() {
    mockParams = { ...HOOK_LINK };
    mockConfirm.mockResolvedValue({ mfaVerificationRequired: true, mfaVerificationToken: 'mfa-tok-1' });
    await renderWithProviders(<ResetPasswordScreen />);
    await fillAndSubmit();
    expect(screen.getByText('Verify it’s you')).toBeTruthy();
  }

  async function enterCode(code: string) {
    await fireEvent.changeText(screen.getByLabelText('6-digit verification code'), code);
  }

  it('shows a code step (not an error) and completes the reset with a valid code', async () => {
    await reachMfaStep();
    mockMfaVerify.mockResolvedValue({ message: 'Password reset complete.', allSessionsRevoked: true });
    await enterCode('123456');
    expect(mockMfaVerify).toHaveBeenCalledWith({ mfaVerificationToken: 'mfa-tok-1', code: '123456' });
    expect(screen.getByText(/Password updated/)).toBeTruthy();
  });

  it('on a wrong code shows the error and lets the user try again with the same token', async () => {
    await reachMfaStep();
    mockMfaVerify
      .mockRejectedValueOnce(apiError(400, 'MFA_CHALLENGE_INVALID'))
      .mockResolvedValueOnce({ message: 'ok', allSessionsRevoked: true });
    await enterCode('000000');
    expect(screen.getByText(/That code is incorrect/)).toBeTruthy();
    await enterCode('654321');
    expect(mockMfaVerify).toHaveBeenLastCalledWith({ mfaVerificationToken: 'mfa-tok-1', code: '654321' });
    expect(screen.getByText(/Password updated/)).toBeTruthy();
  });

  it('on a server-side expiry (RESET_TOKEN_EXPIRED) shows the expired step and offers a new link', async () => {
    await reachMfaStep();
    mockMfaVerify.mockRejectedValueOnce(apiError(410, 'RESET_TOKEN_EXPIRED'));
    await enterCode('123456');
    expect(screen.getByText(/This verification step has expired/)).toBeTruthy();
    expect(screen.queryByLabelText('6-digit verification code')).toBeNull();
    await fireEvent.press(screen.getByText('Request a new link'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/forgot-password');
  });

  it('never writes the link token or the second-step token to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => {}),
    );
    try {
      await reachMfaStep();
      mockMfaVerify.mockRejectedValueOnce(apiError(400, 'MFA_CHALLENGE_INVALID'));
      await enterCode('000000');
      const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
      expect(logged).not.toContain('hash-recovery-1');
      expect(logged).not.toContain('mfa-tok-1');
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });

  it('shows a rate-limit message without leaving the step', async () => {
    await reachMfaStep();
    mockMfaVerify.mockRejectedValueOnce(apiError(429, 'RATE_LIMITED'));
    await enterCode('123456');
    expect(screen.getByText(/Too many attempts/)).toBeTruthy();
    expect(screen.getByLabelText('6-digit verification code')).toBeTruthy();
  });

  it('expires locally after the 5-minute TTL without calling the backend', async () => {
    jest.useFakeTimers();
    await reachMfaStep();
    expect(screen.getByText(/expires in 5:00/)).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(5 * 60 * 1000 + 1000);
    });
    await waitFor(() => expect(screen.getByText(/This verification step has expired/)).toBeTruthy());
    expect(screen.queryByLabelText('6-digit verification code')).toBeNull();
    expect(mockMfaVerify).not.toHaveBeenCalled();
  });
});
