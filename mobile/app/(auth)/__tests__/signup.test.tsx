/**
 * INC-003 §29.5 low item: the signup length row and submit gate use the
 * backend customer minimum (10, `PASSWORD_MIN_LENGTH.customer`), not 8.
 */
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import SignupScreen from '../signup';
import { renderWithProviders } from '../../../src/test/renderWithProviders';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false }),
  useLocalSearchParams: () => ({}),
}));

const mockSignup = jest.fn();
jest.mock('../../../src/api/auth', () => ({
  signup: (...args: unknown[]) => mockSignup(...args),
}));

jest.mock('../../../src/forms/signupDraft', () => ({
  loadSignupDraft: jest.fn(async () => null),
  saveSignupDraft: jest.fn(async () => {}),
  clearSignupDraft: jest.fn(async () => {}),
}));
jest.mock('../../../src/forms/pendingSignupAuth', () => ({
  savePendingSignupAuth: jest.fn(async () => {}),
}));

async function fill(password: string) {
  await fireEvent.changeText(screen.getByTestId('input-email'), 'new@example.com');
  await fireEvent.changeText(screen.getByTestId('input-password'), password);
  await fireEvent.changeText(screen.getByTestId('input-confirm-password'), password);
  await fireEvent.press(
    screen.getByLabelText('I agree to the Terms of Service and Privacy Notice'),
  );
}

beforeEach(() => {
  mockSignup.mockReset();
  mockSignup.mockResolvedValue({ message: 'ok' });
});

describe('signup password length', () => {
  it('shows the 10-character requirement and does not submit a 9-character password', async () => {
    await renderWithProviders(<SignupScreen />);
    await fill('abcdefgh1');
    expect(screen.getByText('At least 10 characters')).toBeTruthy();
    expect(screen.queryByText('At least 8 characters')).toBeNull();
    await fireEvent.press(screen.getByText('Create account'));
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('submits a 10-character password', async () => {
    await renderWithProviders(<SignupScreen />);
    await fill('abcdefghi1');
    await fireEvent.press(screen.getByText('Create account'));
    await waitFor(() => expect(mockSignup).toHaveBeenCalledTimes(1));
  });
});
