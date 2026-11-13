/**
 * Design System rollout R5.1 — smoke tests for the restyled auth screens that
 * had no test of their own (welcome, forgot-password, mfa-challenge,
 * verify-pending). Each renders on the design Backdrop with its text on a
 * card, in both Day and Night, and keeps the labels/links behaviour relies on.
 */
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { renderWithProviders } from '../../../src/test/renderWithProviders';
import WelcomeScreen from '../welcome';
import ForgotPasswordScreen from '../forgot-password';
import MfaChallengeScreen from '../mfa-challenge';
import VerifyPendingScreen from '../verify-pending';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), setParams: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ email: 'new@example.com', mfaChallengeToken: 'tok' }),
}));
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: jest.fn() }));

const mockResetRequest = jest.fn(async () => ({}));
jest.mock('../../../src/api/auth', () => ({
  resetPasswordRequest: (...a: unknown[]) => (mockResetRequest as (...x: unknown[]) => unknown)(...a),
  mfaChallenge: jest.fn(),
  login: jest.fn(),
  isMfaChallenge: () => false,
  getAccountWithAccessToken: jest.fn(),
  resendVerification: jest.fn(async () => ({ retryAfterSeconds: 60 })),
}));
jest.mock('../../../src/forms/pendingSignupAuth', () => ({
  loadPendingSignupAuth: jest.fn(async () => null),
  clearPendingSignupAuth: jest.fn(async () => {}),
}));
jest.mock('../../../src/auth/device', () => ({
  getOrCreateDeviceId: jest.fn(async () => 'dev'),
  getDeviceName: () => 'phone',
}));
jest.mock('../../../src/auth/secure-storage', () => ({ setRefreshToken: jest.fn(async () => {}) }));

const HID = { includeHiddenElements: true };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderIn(mode: 'light' | 'dark', ui: React.ReactElement) {
  (useColorScheme as jest.Mock).mockReturnValue(mode);
  // Standard project wrapper (as login-waking.test uses). A hand-rolled SafeAreaProvider with initialMetrics
  // re-mounted the screen after each state change and wiped typed input.
  const view = await renderWithProviders(ui);
  await act(async () => {});
  return view;
}

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockResetRequest.mockClear();
});

describe.each(['light', 'dark'] as const)('auth restyle smoke (%s)', (mode) => {
  it('welcome: hero copy on glass over a chevron backdrop; actions navigate as before', async () => {
    // Welcome reads the safe-area insets directly, so it needs a provider; it has no text input, so the
    // re-mount that affected typing screens (see renderIn) does not matter here.
    await renderIn(
      mode,
      <SafeAreaProvider initialMetrics={metrics}>
        <WelcomeScreen />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('auth-page')).toBeTruthy();
    expect(screen.getByTestId('td-backdrop-pattern-chevron', HID)).toBeTruthy();
    expect(screen.getByTestId('welcome-hero-card')).toBeTruthy();
    expect(screen.getByText('Protect what matters most.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Get started'));
    expect(mockPush).toHaveBeenLastCalledWith('/(auth)/intro');
    await fireEvent.press(screen.getByText('Log in'));
    expect(mockPush).toHaveBeenLastCalledWith('/(auth)/login');
    await fireEvent.press(screen.getByText('Explore first'));
    expect(mockPush).toHaveBeenLastCalledWith('/(auth)/intro');
  });

  it('forgot-password: request form on a card, then the anti-enumeration confirmation', async () => {
    await renderIn(mode, <ForgotPasswordScreen />);
    expect(screen.getByTestId('forgot-password-card')).toBeTruthy();
    expect(screen.getByTestId('td-backdrop-gradient', HID)).toBeTruthy();
    expect(screen.queryByTestId('td-backdrop-pattern-chevron', HID)).toBeNull();

    await fireEvent.changeText(screen.getByTestId('input-email'), 'a@b.co');
    await fireEvent.press(screen.getByText('Send reset link'));
    await act(async () => {});
    expect(mockResetRequest).toHaveBeenCalledWith('a@b.co');
    expect(screen.getByText('Check your email.')).toBeTruthy();
    expect(screen.getByTestId('forgot-password-sent-card')).toBeTruthy();

    await fireEvent.press(screen.getByText('Back to log in'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('mfa-challenge: OtpInput stays accessible inside the card', async () => {
    await renderIn(mode, <MfaChallengeScreen />);
    expect(screen.getByTestId('mfa-card')).toBeTruthy();
    expect(screen.getByText('Enter your verification code')).toBeTruthy();
    expect(screen.getByLabelText('6-digit verification code')).toBeTruthy();
  });

  it('verify-pending: email, resend and back link render on a card', async () => {
    await renderIn(mode, <VerifyPendingScreen />);
    expect(screen.getByTestId('verify-pending-card')).toBeTruthy();
    expect(screen.getByText('Check your email')).toBeTruthy();
    expect(screen.getByText('new@example.com')).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
    expect(screen.getByText('Resend email')).toBeTruthy();

    await fireEvent.press(screen.getByText('Wrong email? Go back'));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(auth)/signup' });
  });
});
