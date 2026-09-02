import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreatePolicyScreen } from '../policy/CreatePolicyScreen';

jest.mock('../../theme/primitives', () => {
  const React = require('react');
  const { Text, View, Pressable } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Alert: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Badge: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
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
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../api/hooks/usePlans', () => ({
  usePlansQuery: jest.fn(),
}));

jest.mock('../../api/hooks/usePolicies', () => ({
  useCreatePolicyMutation: jest.fn(),
}));

const { usePlansQuery } = jest.requireMock('../../api/hooks/usePlans') as {
  usePlansQuery: jest.Mock;
};

const { useCreatePolicyMutation } = jest.requireMock('../../api/hooks/usePolicies') as {
  useCreatePolicyMutation: jest.Mock;
};

const plusPlan = {
  id: 'plan-plus',
  slug: 'plus',
  name: 'Plus',
  tagline: 'Protection + Monitoring',
  maxAssets: 10,
  monthlyAmountCents: 39900,
  currency: 'ZAR',
  isCustomPricing: false,
  isMostPopular: true,
  isActive: true,
  sortOrder: 2,
  features: ['Up to 10 registered assets', 'Enhanced GPS monitoring'],
  accountTypes: ['both'],
};

async function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
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
    usePlansQuery.mockReturnValue({
      data: { data: [plusPlan] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('lists available plans for the customer to choose from', async () => {
    await renderWithClient(<CreatePolicyScreen />);

    expect(screen.getByText('Choose a protection plan')).toBeTruthy();
    expect(screen.getByText('Plus')).toBeTruthy();
    expect(screen.getByText('R399')).toBeTruthy();
    expect(screen.getByText('/month')).toBeTruthy();
    expect(screen.getByText('Choose this plan')).toBeTruthy();
  });

  it('subscribes with the selected catalog plan', async () => {
    mockMutateAsync.mockResolvedValue({ id: '507f1f77bcf86cd799439011' });

    await renderWithClient(<CreatePolicyScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Choose this plan'));
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        planCatalogId: 'plan-plus',
        planTier: 'plus',
      });
    });
  });
});
