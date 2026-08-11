import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreatePolicyScreen } from '../policy/CreatePolicyScreen';

jest.mock('../../theme/primitives', () => {
  const React = require('react');
  const { Text, View, Pressable, TextInput } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Alert: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({
      children,
      onPress,
    }: {
      children: string;
      onPress?: () => void;
    }) => (
      <Pressable onPress={onPress} accessibilityRole="button">
        <Text>{children}</Text>
      </Pressable>
    ),
    Input: ({
      label,
      value,
      onChangeText,
      error,
    }: {
      label: string;
      value: string;
      onChangeText: (v: string) => void;
      error?: string;
    }) => (
      <View>
        <Text>{label}</Text>
        <TextInput value={value} onChangeText={onChangeText} />
        {error ? <Text>{error}</Text> : null}
      </View>
    ),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../api/hooks/usePolicies', () => ({
  useCreatePolicyMutation: jest.fn(),
}));

const { useCreatePolicyMutation } = jest.requireMock('../../api/hooks/usePolicies') as {
  useCreatePolicyMutation: jest.Mock;
};

async function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function pressSubmitButton() {
  fireEvent.press(screen.getAllByRole('button')[0]!);
}

describe('CreatePolicyScreen', () => {
  const mockMutateAsync = jest.fn();

  beforeEach(() => {
    mockMutateAsync.mockReset();
    useCreatePolicyMutation.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      error: null,
    });
  });

  it('shows validation error when plan tier is empty', async () => {
    await renderWithClient(<CreatePolicyScreen />);

    await act(async () => {
      pressSubmitButton();
    });

    await waitFor(() => {
      expect(screen.getByText('Enter a plan tier label.')).toBeTruthy();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('submits trimmed plan tier', async () => {
    mockMutateAsync.mockResolvedValue({ id: '507f1f77bcf86cd799439011' });

    await renderWithClient(<CreatePolicyScreen />);

    await act(async () => {
      fireEvent.changeText(screen.getByDisplayValue(''), '  premium  ');
    });
    await act(async () => {
      pressSubmitButton();
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ planTier: 'premium' });
    });
  });
});
