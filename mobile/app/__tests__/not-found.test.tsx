/**
 * INC-003 §30 advisory: the unmatched-route screen never renders the
 * requested path or query (which may carry an email-link token).
 */
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import NotFoundScreen from '../+not-found';
import { renderWithProviders } from '../../src/test/renderWithProviders';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = false;
const mockSearchParams = jest.fn(() => ({ token_hash: 'secret-hash-123', email: 'victim@example.com' }));
const mockPathname = jest.fn(() => '/reset-password-typo/secret-path-segment');
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace, push: jest.fn(), canGoBack: () => mockCanGoBack }),
  useLocalSearchParams: () => mockSearchParams(),
  useGlobalSearchParams: () => mockSearchParams(),
  usePathname: () => mockPathname(),
  useSegments: () => ['reset-password-typo', 'secret-path-segment'],
}));

beforeEach(() => {
  mockBack.mockReset();
  mockReplace.mockReset();
  mockCanGoBack = false;
});

describe('+not-found', () => {
  it('does not render the path or query', async () => {
    await renderWithProviders(<NotFoundScreen />);
    expect(screen.getByText('Page not found')).toBeTruthy();
    const rendered = JSON.stringify(screen.toJSON());
    for (const leaked of ['secret-hash-123', 'victim@example.com', 'secret-path-segment', 'reset-password-typo']) {
      expect(rendered).not.toContain(leaked);
    }
    expect(mockSearchParams).not.toHaveBeenCalled();
    expect(mockPathname).not.toHaveBeenCalled();
  });

  it('continues to the app root when there is no history', async () => {
    await renderWithProviders(<NotFoundScreen />);
    await fireEvent.press(screen.getByText('Continue'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('goes back when there is history', async () => {
    mockCanGoBack = true;
    await renderWithProviders(<NotFoundScreen />);
    await fireEvent.press(screen.getByText('Continue'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
