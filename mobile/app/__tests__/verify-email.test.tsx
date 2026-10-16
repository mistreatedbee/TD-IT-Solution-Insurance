/**
 * INC-003 C-8 / ADR-0014 G-4: the verify-email deep link carries the hook's
 * `token_hash` / `type` / `email`; legacy `token` links still work.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import VerifyEmailScreen from '../verify-email';
import { renderWithProviders } from '../../src/test/renderWithProviders';
import { ApiError } from '../../src/api/errors';

let mockParams: Record<string, string | undefined> = {};
const mockReplace = jest.fn();
const mockSetParams = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn(), setParams: mockSetParams }),
}));

const mockVerifyEmail = jest.fn();
const mockResend = jest.fn();
jest.mock('../../src/api/auth', () => ({
  verifyEmail: (...args: unknown[]) => mockVerifyEmail(...args),
  resendVerification: (...args: unknown[]) => mockResend(...args),
}));

jest.mock('../../src/auth/session-store', () => ({
  useSessionStore: (selector: (s: { status: string }) => unknown) => selector({ status: 'signed-out' }),
}));

function apiError(status: number, code: string) {
  return new ApiError(status, { error: { code, message: code, requestId: 'req-1' } });
}

beforeEach(() => {
  mockParams = {};
  mockReplace.mockReset();
  mockSetParams.mockReset();
  mockVerifyEmail.mockReset();
  mockResend.mockReset();
});

describe('verify-email deep link (C-8 / G-4)', () => {
  it('verifies with the hook token_hash and normalised email, then scrubs the route params', async () => {
    mockParams = { token_hash: 'hash-signup-1', type: 'signup', email: 'New@Example.com' };
    mockVerifyEmail.mockResolvedValue({ message: 'Email verified.' });
    await renderWithProviders(<VerifyEmailScreen />);

    await waitFor(() => expect(screen.getByText('You’re verified')).toBeTruthy());
    expect(mockVerifyEmail).toHaveBeenCalledTimes(1);
    expect(mockVerifyEmail).toHaveBeenCalledWith('hash-signup-1', 'new@example.com');
    expect(mockSetParams).toHaveBeenCalledWith(
      expect.objectContaining({ token_hash: undefined, token: undefined, email: undefined }),
    );
  });

  it('still accepts a legacy `token` link', async () => {
    mockParams = { token: 'legacy-token', email: 'a@b.co' };
    mockVerifyEmail.mockResolvedValue({ message: 'Email verified.' });
    await renderWithProviders(<VerifyEmailScreen />);
    await waitFor(() => expect(mockVerifyEmail).toHaveBeenCalledWith('legacy-token', 'a@b.co'));
  });

  it('does not call the backend for a link with no email or a non-signup type', async () => {
    for (const params of [
      { token_hash: 'h', type: 'signup' },
      { token_hash: 'h', type: 'recovery', email: 'a@b.co' },
    ]) {
      mockParams = params;
      const view = await renderWithProviders(<VerifyEmailScreen />);
      expect(screen.getByText('This link has expired')).toBeTruthy();
      await view.unmount();
    }
    expect(mockVerifyEmail).not.toHaveBeenCalled();
  });

  it('shows the expired state when the backend rejects the link (410)', async () => {
    mockParams = { token_hash: 'h', type: 'signup', email: 'a@b.co' };
    mockVerifyEmail.mockRejectedValue(apiError(410, 'RESET_TOKEN_EXPIRED'));
    await renderWithProviders(<VerifyEmailScreen />);
    await waitFor(() => expect(screen.getByText('This link has expired')).toBeTruthy());
    await fireEvent.press(screen.getByText('Send a new link'));
    expect(mockResend).toHaveBeenCalledWith('a@b.co');
  });

  it('offers a retry (link not spent) when the backend is waking up, and retries with the same link', async () => {
    mockParams = { token_hash: 'h', type: 'signup', email: 'a@b.co' };
    mockVerifyEmail
      .mockRejectedValueOnce(apiError(503, 'UPSTREAM_UNAVAILABLE'))
      .mockResolvedValueOnce({ message: 'Email verified.' });
    await renderWithProviders(<VerifyEmailScreen />);
    await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy());
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('You’re verified')).toBeTruthy());
    expect(mockVerifyEmail).toHaveBeenCalledTimes(2);
    expect(mockVerifyEmail).toHaveBeenLastCalledWith('h', 'a@b.co');
  });
});
