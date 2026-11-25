/**
 * "Confirm it's you" sheet: TOTP code when the account has an authenticator, password when it
 * has none (MFA_NOT_ENROLLED), switch to the code on MFA_STEP_UP_REQUIRED, honest error copy.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../test/renderWithProviders';
import { ApiError } from '../../api/errors';
import { reauthWithPassword, requestStepUpChallenge, verifyStepUp } from '../../api/step-up';
import { ProtectionStepUpSheet, STEP_UP_SHEET_COPY } from '../ProtectionStepUpSheet';

jest.mock('../../api/step-up', () => ({
  requestStepUpChallenge: jest.fn(),
  verifyStepUp: jest.fn(),
  reauthWithPassword: jest.fn(),
}));
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  const MockKav = ({ children, ...rest }: { children: React.ReactNode }) => (
    <View testID="step-up-keyboard-avoiding" {...rest}>
      {children}
    </View>
  );
  return { __esModule: true, default: MockKav };
});
const challenge = requestStepUpChallenge as jest.Mock;
const verify = verifyStepUp as jest.Mock;
const reauth = reauthWithPassword as jest.Mock;

const apiErr = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  new ApiError(status, { error: { code, message: 'x', requestId: 'r', ...extra } } as never);

describe('ProtectionStepUpSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('verifies a TOTP code and reports success', async () => {
    challenge.mockResolvedValue({ stepUpChallengeToken: 'tok', expiresIn: 300 });
    verify.mockResolvedValue({ mfaVerifiedAt: 'now', stepUpExpiresAt: 'later' });
    const onVerified = jest.fn();
    await renderWithProviders(<ProtectionStepUpSheet visible onVerified={onVerified} onCancel={jest.fn()} />);
    await waitFor(() => expect(screen.getByText(STEP_UP_SHEET_COPY.mfaBody)).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123 456');
    await fireEvent.press(screen.getByTestId('step-up-confirm'));
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(verify).toHaveBeenCalledWith('tok', '123456');
  });

  it('falls back to the password when the account has no authenticator', async () => {
    challenge.mockRejectedValue(apiErr(409, 'MFA_NOT_ENROLLED'));
    reauth.mockRejectedValueOnce(apiErr(401, 'INVALID_CREDENTIALS', { attemptsRemaining: 2 }));
    reauth.mockResolvedValueOnce({ reauthAt: 'now', reauthExpiresAt: 'later' });
    const onVerified = jest.fn();
    await renderWithProviders(<ProtectionStepUpSheet visible onVerified={onVerified} onCancel={jest.fn()} />);
    await waitFor(() => expect(screen.getByText(STEP_UP_SHEET_COPY.passwordBody)).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    await fireEvent.press(screen.getByTestId('step-up-confirm'));
    await waitFor(() => expect(screen.getByText(`${STEP_UP_SHEET_COPY.wrongPassword} 2 tries left.`)).toBeTruthy());
    expect(onVerified).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Password'), 'right');
    await fireEvent.press(screen.getByTestId('step-up-confirm'));
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(reauth).toHaveBeenLastCalledWith('right');
  });

  it('switches to the code when the password route says an authenticator exists', async () => {
    challenge
      .mockRejectedValueOnce(apiErr(409, 'MFA_NOT_ENROLLED'))
      .mockResolvedValueOnce({ stepUpChallengeToken: 'tok', expiresIn: 300 });
    reauth.mockRejectedValue(apiErr(409, 'MFA_STEP_UP_REQUIRED'));
    await renderWithProviders(<ProtectionStepUpSheet visible onVerified={jest.fn()} onCancel={jest.fn()} />);
    await waitFor(() => expect(screen.getByText(STEP_UP_SHEET_COPY.passwordBody)).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Password'), 'pw');
    await fireEvent.press(screen.getByTestId('step-up-confirm'));
    await waitFor(() => expect(screen.getByText(STEP_UP_SHEET_COPY.mfaBody)).toBeTruthy());
  });

  it('cancel sends nothing', async () => {
    challenge.mockResolvedValue({ stepUpChallengeToken: 'tok', expiresIn: 300 });
    const onCancel = jest.fn();
    await renderWithProviders(<ProtectionStepUpSheet visible onVerified={jest.fn()} onCancel={onCancel} />);
    await fireEvent.press(screen.getByTestId('step-up-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(verify).not.toHaveBeenCalled();
    expect(reauth).not.toHaveBeenCalled();
  });

  it('says "too many attempts" when the password re-auth locks the session out', async () => {
    challenge.mockRejectedValue(apiErr(409, 'MFA_NOT_ENROLLED'));
    reauth.mockRejectedValue(apiErr(401, 'UNAUTHORIZED'));
    const onVerified = jest.fn();
    await renderWithProviders(<ProtectionStepUpSheet visible onVerified={onVerified} onCancel={jest.fn()} />);
    await waitFor(() => expect(screen.getByText(STEP_UP_SHEET_COPY.passwordBody)).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText('Password'), 'x');
    await fireEvent.press(screen.getByTestId('step-up-confirm'));
    await waitFor(() => expect(screen.getByText(STEP_UP_SHEET_COPY.tooMany)).toBeTruthy());
    expect(screen.queryByText(STEP_UP_SHEET_COPY.unavailable)).toBeNull();
    expect(screen.queryByText('Try again')).toBeNull();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('says "too many attempts" when the challenge itself is rate limited', async () => {
    challenge.mockRejectedValue(apiErr(429, 'RATE_LIMITED'));
    await renderWithProviders(<ProtectionStepUpSheet visible onVerified={jest.fn()} onCancel={jest.fn()} />);
    await waitFor(() => expect(screen.getByText(STEP_UP_SHEET_COPY.tooMany)).toBeTruthy());
  });

  it('focuses the field, is modal for screen readers and avoids the keyboard', async () => {
    challenge.mockResolvedValue({ stepUpChallengeToken: 'tok', expiresIn: 300 });
    await renderWithProviders(<ProtectionStepUpSheet visible onVerified={jest.fn()} onCancel={jest.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('6-digit code').props.autoFocus).toBe(true));
    expect(screen.getByTestId('step-up-keyboard-avoiding')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain('"accessibilityViewIsModal":true');
  });

  it('does not dismiss when the backdrop is tapped (Cancel is the only way out)', async () => {
    challenge.mockResolvedValue({ stepUpChallengeToken: 'tok', expiresIn: 300 });
    const onCancel = jest.fn();
    await renderWithProviders(<ProtectionStepUpSheet visible onVerified={jest.fn()} onCancel={onCancel} />);
    await waitFor(() => expect(screen.getByText(STEP_UP_SHEET_COPY.mfaBody)).toBeTruthy());
    expect(screen.queryByLabelText('Dismiss')).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
