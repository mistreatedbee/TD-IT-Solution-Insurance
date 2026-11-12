import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import LoginScreen from '../login';
import { renderWithProviders } from '../../../src/test/renderWithProviders';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('../../../src/auth/device', () => ({
  getOrCreateDeviceId: jest.fn(async () => 'dev'),
  getDeviceName: () => 'phone',
}));
jest.mock('../../../src/auth/secure-storage', () => ({ setRefreshToken: jest.fn(async () => {}) }));

let resolveLogin: (v: unknown) => void;
const mockLogin = jest.fn(() => new Promise((r) => { resolveLogin = r; }));
jest.mock('../../../src/api/auth', () => ({
  login: (...a: unknown[]) => (mockLogin as (...x: unknown[]) => unknown)(...a),
  isMfaChallenge: () => false,
}));

const MSG = /Waking up the secure server/;

it('shows the waking message after 4s of pending login and clears on response', async () => {
  await renderWithProviders(<LoginScreen />);
  await fireEvent.changeText(screen.getByTestId('input-email'), 'a@b.co');
  await fireEvent.changeText(screen.getByTestId('input-password'), 'pw');
  const buttons = screen.getAllByText('Log in');
  void fireEvent.press(buttons[buttons.length - 1]!);

  expect(screen.queryByText(MSG)).toBeNull();
  await waitFor(() => expect(screen.getByText(MSG)).toBeTruthy(), { timeout: 6000 });

  await act(async () => { resolveLogin({ accessToken: 'a', refreshToken: 'r', sessionId: 's' }); });
  expect(screen.queryByText(MSG)).toBeNull();
}, 15000);
