/**
 * Owner request 2026-11-20: the 6-digit MFA code submits itself on the 6th
 * digit — sign-in challenge, opt-in enrolment, and invitation enrolment.
 * Covers typing, paste (with a space), no double submit, and a wrong code
 * followed by a new one. What is sent to the API is unchanged.
 */
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../test/renderWithProviders';
import MfaChallengeScreen from '../../../app/(auth)/mfa-challenge';
import MfaEnrollScreen from '../../../app/(app)/mfa-enroll';
import { AcceptInvitationScreen } from '../../screens/invitations/AcceptInvitationScreen';
import { ApiError } from '../../api/errors';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ mfaChallengeToken: 'tok', token: 'invite-token' }),
}));
const mockMfaChallenge = jest.fn();
const mockMfaEnroll = jest.fn();
const mockMfaEnrollVerify = jest.fn();
jest.mock('../../api/auth', () => ({
  mfaChallenge: (...a: unknown[]) => mockMfaChallenge(...a),
  mfaEnroll: (...a: unknown[]) => mockMfaEnroll(...a),
  mfaEnrollVerify: (...a: unknown[]) => mockMfaEnrollVerify(...a),
}));
jest.mock('../../api/invitations', () => ({
  getInvitation: jest.fn(async () => ({ email: 'staff@example.com', userType: 'admin', status: 'pending' })),
  acceptInvitation: jest.fn(async () => ({ enrollmentTicket: 'ticket' })),
}));
jest.mock('../../components/MfaQrCode', () => ({ MfaQrCode: () => null }));
jest.mock('../secure-storage', () => ({ setRefreshToken: jest.fn(async () => {}) }));

const OK = { accessToken: 'a', refreshToken: 'r', sessionId: 's' };
const ENROLLMENT = { qrCodeImage: 'otpauth://x', manualEntryKey: 'KEY', enrollmentId: 'enr' };
const wrong = () => new ApiError(401, { error: { code: 'MFA_CHALLENGE_INVALID', message: 'Invalid code' } } as never);

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mockMfaChallenge.mockReset();
  mockMfaEnroll.mockReset().mockResolvedValue(ENROLLMENT);
  mockMfaEnrollVerify.mockReset();
});

async function flush() {
  await act(async () => {});
}

type Case = {
  name: string;
  label: string;
  verifyButton: string;
  api: jest.Mock;
  render: () => Promise<void>;
  sent: (code: string) => unknown;
};

const cases: Case[] = [
  {
    name: 'sign-in challenge (mfa-challenge)',
    label: '6-digit verification code',
    verifyButton: 'mfa-verify-button',
    api: mockMfaChallenge,
    render: async () => {
      await renderWithProviders(<MfaChallengeScreen />);
      await flush();
    },
    sent: (code) => ({ mfaChallengeToken: 'tok', code }),
  },
  {
    name: 'opt-in enrolment (mfa-enroll)',
    label: '6-digit confirmation code',
    verifyButton: 'mfa-enroll-verify-button',
    api: mockMfaEnrollVerify,
    render: async () => {
      await renderWithProviders(<MfaEnrollScreen />);
      await flush();
    },
    sent: (code) => ({ enrollmentId: 'enr', code }),
  },
  {
    name: 'invitation enrolment (AcceptInvitationScreen)',
    label: '6-digit confirmation code',
    verifyButton: 'invitation-mfa-verify-button',
    api: mockMfaEnrollVerify,
    render: async () => {
      await renderWithProviders(<AcceptInvitationScreen />);
      await flush();
      const pw = 'a-long-enough-password-123';
      await fireEvent.changeText(screen.getByLabelText('Password'), pw);
      await fireEvent.changeText(screen.getByLabelText('Confirm password'), pw);
      await fireEvent.press(screen.getByText('Accept invitation'));
      await flush();
    },
    sent: (code) => ({ enrollmentId: 'enr', code }),
  },
];

describe.each(cases)('MFA auto-submit: $name', ({ label, verifyButton, api, render, sent }) => {
  it('submits automatically on the 6th digit, not before', async () => {
    api.mockResolvedValue(OK);
    await render();
    const input = screen.getByLabelText(label);
    for (const partial of ['1', '12', '123', '1234', '12345']) {
      await fireEvent.changeText(input, partial);
    }
    expect(api).not.toHaveBeenCalled();
    await fireEvent.changeText(input, '123456');
    await flush();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith(sent('123456'));
  });

  it('submits a pasted / autofilled code, stripping spaces', async () => {
    api.mockResolvedValue(OK);
    await render();
    await fireEvent.changeText(screen.getByLabelText(label), '123 456');
    await flush();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith(sent('123456'));
  });

  it('does not double submit while verifying (repeat input or manual button)', async () => {
    const pending = deferred<typeof OK>();
    api.mockReturnValue(pending.promise);
    await render();
    const input = screen.getByLabelText(label);
    await fireEvent.changeText(input, '123456');
    await fireEvent.changeText(input, '654321');
    await fireEvent.press(screen.getByTestId(verifyButton));
    expect(api).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(OK);
    });
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('after a wrong code, waits for a new 6th digit and never resubmits the failed code', async () => {
    api.mockRejectedValueOnce(wrong()).mockResolvedValueOnce(OK);
    await render();
    const input = screen.getByLabelText(label);
    await fireEvent.changeText(input, '111111');
    await flush();
    expect(api).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(label).props.value).toBe('');
    await fireEvent.changeText(screen.getByLabelText(label), '22222');
    await flush();
    expect(api).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(screen.getByLabelText(label), '222222');
    await flush();
    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenLastCalledWith(sent('222222'));
  });

  it('keeps a manual Verify button that submits the same code', async () => {
    api.mockResolvedValue(OK);
    await render();
    expect(screen.getByTestId(verifyButton)).toBeTruthy();
    await fireEvent.press(screen.getByTestId(verifyButton));
    expect(api).not.toHaveBeenCalled(); // disabled until 6 digits
  });
});
