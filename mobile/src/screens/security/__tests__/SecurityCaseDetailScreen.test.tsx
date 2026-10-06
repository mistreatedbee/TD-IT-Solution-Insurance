import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SecurityCaseDetailScreen } from '../SecurityCaseDetailScreen';
import { ApiError, NetworkUnavailableError } from '../../../api/errors';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ caseId: 'case-1' }),
}));

jest.mock('../../../theme/primitives', () => {
  const React = require('react');
  const { Text, View, Pressable } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Alert: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Badge: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Button: ({ children, onPress }: { children: string; onPress?: () => void }) => (
      <Pressable onPress={onPress} accessibilityRole="button">
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});

jest.mock('../../recovery/MapPlaceholder', () => ({ MapPlaceholder: () => null }));

jest.mock('../../../api/security-cases', () => ({
  getSecurityCase: (...args: unknown[]) => mockGetSecurityCase(...args),
  claimSecurityCase: (...args: unknown[]) => mockClaimSecurityCase(...args),
  updateSecurityCaseStatus: (...args: unknown[]) => mockUpdateSecurityCaseStatus(...args),
}));

jest.mock('../../../network/NetworkProvider', () => ({
  useIsOnline: () => mockIsOnline(),
}));

const mockGetSecurityCase = jest.fn();
const mockClaimSecurityCase = jest.fn();
const mockUpdateSecurityCaseStatus = jest.fn();
const mockIsOnline = jest.fn(() => true);

function openCase() {
  return {
    id: 'case-1',
    assetId: 'asset-1',
    accountId: 'account-1',
    status: 'open' as const,
    referenceNumber: 'RC-1',
    reportedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('SecurityCaseDetailScreen — offline-tolerance policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOnline.mockReturnValue(true);
    mockGetSecurityCase.mockResolvedValue(openCase());
  });

  it('blocks claiming when offline with a definite "has not been claimed" message', async () => {
    mockIsOnline.mockReturnValue(false);
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Claim case');

    await act(async () => {
      fireEvent.press(screen.getByText('Claim case'));
    });

    await waitFor(() => expect(screen.getByText(/has not been claimed/)).toBeTruthy());
    expect(mockClaimSecurityCase).not.toHaveBeenCalled();
  });

  it('on NetworkUnavailableError, warns that retrying a successful claim will look unavailable, not success', async () => {
    mockClaimSecurityCase.mockRejectedValueOnce(new NetworkUnavailableError());
    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Claim case');

    await act(async () => {
      fireEvent.press(screen.getByText('Claim case'));
    });

    await waitFor(() =>
      expect(screen.getByText(/couldn.t confirm this claim was received/)).toBeTruthy(),
    );
  });

  it('on a 404 after claiming, re-fetches the case and shows it as claimed rather than erroring, if it is no longer open', async () => {
    mockClaimSecurityCase.mockRejectedValueOnce(
      new ApiError(404, { error: { code: 'NOT_FOUND', message: 'not found', requestId: 'req-1' } }),
    );
    mockGetSecurityCase
      .mockResolvedValueOnce(openCase())
      .mockResolvedValueOnce({ ...openCase(), status: 'investigating' });

    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Claim case');

    await act(async () => {
      fireEvent.press(screen.getByText('Claim case'));
    });

    // The claim action's own retry-ambiguity error must not be shown —
    // the refetch confirmed the original attempt actually succeeded.
    await waitFor(() => expect(screen.getByText('investigating')).toBeTruthy());
    expect(screen.queryByText(/couldn.t confirm/)).toBeNull();
  });

  it('still shows an error if a 404 refetch confirms the case really is still open (claim genuinely failed)', async () => {
    mockClaimSecurityCase.mockRejectedValueOnce(
      new ApiError(404, { error: { code: 'NOT_FOUND', message: 'This case could not be found. It may have been closed or reassigned.', requestId: 'req-1' } }),
    );
    mockGetSecurityCase.mockResolvedValueOnce(openCase()).mockResolvedValueOnce(openCase());

    await render(<SecurityCaseDetailScreen />);
    await screen.findByText('Claim case');

    await act(async () => {
      fireEvent.press(screen.getByText('Claim case'));
    });

    await waitFor(() => expect(screen.getByText('This case could not be found. It may have been closed or reassigned.')).toBeTruthy());
  });
});
