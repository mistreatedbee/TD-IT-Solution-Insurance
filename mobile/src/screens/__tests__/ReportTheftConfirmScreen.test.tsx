import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ReportTheftConfirmScreen } from '../recovery/ReportTheftConfirmScreen';
import { ApiError, NetworkUnavailableError } from '../../api/errors';

jest.mock('../../theme/primitives', () => {
  const React = require('react');
  const { Text, TextInput, View, Pressable } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Alert: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Input: ({
      label,
      value,
      onChangeText,
      hint,
    }: {
      label: string;
      value: string;
      onChangeText: (text: string) => void;
      hint?: string;
    }) => (
      <View>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
        />
        {hint ? <Text>{hint}</Text> : null}
      </View>
    ),
    Button: ({
      children,
      onPress,
      disabled,
      loading,
    }: {
      children: string;
      onPress?: () => void;
      disabled?: boolean;
      loading?: boolean;
    }) => (
      <Pressable
        onPress={disabled ? undefined : onPress}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled) }}
      >
        <Text>{loading ? 'Loading…' : children}</Text>
      </Pressable>
    ),
  };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ assetId: 'asset-1' }),
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../api/hooks/useAssets', () => ({
  useAssetQuery: () => ({
    data: { id: 'asset-1', displayName: 'Work laptop', assetType: 'laptop', gpsDeviceId: 'gps-1' },
    isLoading: false,
  }),
}));

jest.mock('../../api/hooks/useRecovery', () => ({
  useCreateRecoveryCaseMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

jest.mock('../../network/NetworkProvider', () => ({
  useIsOnline: () => mockIsOnline(),
}));

const mockReplace = jest.fn();
const mockMutateAsync = jest.fn();
const mockIsOnline = jest.fn(() => true);

/** The confirm checkbox is a toggle — press it once per render, not once
 * per retry, or a second press un-checks it and the "disabled" guard
 * silently swallows the retry attempt. */
async function pressConfirmCheckbox() {
  await act(async () => {
    fireEvent.press(screen.getByText(/I confirm this asset was stolen/));
  });
}

async function pressSubmit(submitLabel = 'Submit theft report') {
  await act(async () => {
    fireEvent.press(screen.getByText(submitLabel));
  });
}

describe('ReportTheftConfirmScreen — notes-field data minimisation (PDM-7 / F-9)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutateAsync.mockReset();
    mockIsOnline.mockReturnValue(true);
  });

  it('does not solicit a police case number into the shared notes field, and points to the dedicated police-report flow instead', async () => {
    await render(<ReportTheftConfirmScreen />);

    expect(screen.queryByText(/Any police case number/)).toBeNull();
    expect(
      screen.getByText(/If you've opened a SAPS case, add the case number on the tracking screen/),
    ).toBeTruthy();
  });
});

describe('ReportTheftConfirmScreen — offline-retry policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks does not drain a queued mockResolvedValueOnce/
    // mockRejectedValueOnce implementation left over from a previous test —
    // reset explicitly so one test's queued responses can never leak into
    // the next.
    mockMutateAsync.mockReset();
    mockIsOnline.mockReturnValue(true);
  });

  it('blocks submission when offline with a definite "not sent" message, and never calls the mutation', async () => {
    mockIsOnline.mockReturnValue(false);
    await render(<ReportTheftConfirmScreen />);

    await pressConfirmCheckbox();
    await pressSubmit();

    await waitFor(() =>
      expect(screen.getByText(/Your report has not been sent/)).toBeTruthy(),
    );
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('shows an uncertain-delivery message (not "not sent") on NetworkUnavailableError, since the request may have reached the server', async () => {
    mockMutateAsync.mockRejectedValueOnce(new NetworkUnavailableError());
    await render(<ReportTheftConfirmScreen />);

    await pressConfirmCheckbox();
    await pressSubmit();

    await waitFor(() =>
      expect(screen.getByText(/couldn.t confirm your report was received/)).toBeTruthy(),
    );
    // Must NOT claim the report was definitely not sent — that's only true
    // for the pre-flight offline check, not a network error after sending.
    expect(screen.queryByText(/has not been sent/)).toBeNull();
  });

  it('reuses the same idempotency key across retries of the same submission intent', async () => {
    mockMutateAsync.mockRejectedValueOnce(new NetworkUnavailableError());
    mockMutateAsync.mockResolvedValueOnce({ id: 'case-1', referenceNumber: 'RC-1' });
    await render(<ReportTheftConfirmScreen />);

    await pressConfirmCheckbox();
    await pressSubmit();
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

    await pressSubmit();
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2));

    const firstKey = mockMutateAsync.mock.calls[0][0].idempotencyKey;
    const secondKey = mockMutateAsync.mock.calls[1][0].idempotencyKey;
    expect(firstKey).toBe(secondKey);
  });

  it('mints a new idempotency key if the report content changes between attempts', async () => {
    const Crypto = jest.requireMock('expo-crypto') as { randomUUID: jest.Mock };
    Crypto.randomUUID
      .mockReturnValueOnce('key-1')
      .mockReturnValueOnce('key-2');
    mockMutateAsync.mockRejectedValueOnce(new NetworkUnavailableError());
    mockMutateAsync.mockResolvedValueOnce({ id: 'case-1', referenceNumber: 'RC-1' });
    await render(<ReportTheftConfirmScreen />);

    await pressConfirmCheckbox();
    await pressSubmit();
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Additional details (optional)'), 'Updated details');
    });
    await pressSubmit();
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2));

    const firstKey = mockMutateAsync.mock.calls[0][0].idempotencyKey;
    const secondKey = mockMutateAsync.mock.calls[1][0].idempotencyKey;
    expect(firstKey).not.toBe(secondKey);
  });

  it('routes to the existing case on CONFLICT instead of showing an error', async () => {
    mockMutateAsync.mockRejectedValueOnce(
      new ApiError(409, {
        error: {
          code: 'CONFLICT',
          message: 'An open recovery case already exists for this asset.',
          requestId: 'req-1',
          caseId: 'case-existing',
          referenceNumber: 'RC-EXISTING',
        },
      }),
    );
    await render(<ReportTheftConfirmScreen />);

    await pressConfirmCheckbox();
    await pressSubmit();

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining('caseId=case-existing'),
      ),
    );
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('reference=RC-EXISTING'));
  });
});
