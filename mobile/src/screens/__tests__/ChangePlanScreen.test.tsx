import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../../api/errors';
import { ChangePlanScreen } from '../policy/ChangePlanScreen';

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
      disabled,
    }: {
      children: string;
      onPress?: () => void;
      disabled?: boolean;
    }) => (
      <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button">
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: '507f1f77bcf86cd799439011' }),
}));

jest.mock('../../api/hooks/usePlans', () => ({
  usePlansQuery: jest.fn(),
}));

jest.mock('../../api/hooks/usePolicies', () => ({
  usePolicyQuery: jest.fn(),
  useChangePolicyPlanMutation: jest.fn(),
}));

jest.mock('../../api/hooks/useAssets', () => ({
  useAssetsQuery: jest.fn(),
}));

const { usePlansQuery } = jest.requireMock('../../api/hooks/usePlans') as {
  usePlansQuery: jest.Mock;
};

const { usePolicyQuery, useChangePolicyPlanMutation } = jest.requireMock(
  '../../api/hooks/usePolicies',
) as {
  usePolicyQuery: jest.Mock;
  useChangePolicyPlanMutation: jest.Mock;
};

const { useAssetsQuery } = jest.requireMock('../../api/hooks/useAssets') as {
  useAssetsQuery: jest.Mock;
};

const essentialPlan = {
  id: 'plan-essential',
  slug: 'essential',
  name: 'Essential',
  tagline: 'Protection',
  maxAssets: 5,
  monthlyAmountCents: 19900,
  currency: 'ZAR',
  isCustomPricing: false,
  isActive: true,
  sortOrder: 1,
  features: ['Up to 5 registered assets'],
  accountTypes: ['both'],
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
  features: ['Up to 10 registered assets'],
  accountTypes: ['both'],
};

async function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ChangePlanScreen', () => {
  const mockMutateAsync = jest.fn();

  beforeEach(() => {
    mockMutateAsync.mockReset();
    useChangePolicyPlanMutation.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      error: null,
    });
    usePolicyQuery.mockReturnValue({
      data: {
        id: '507f1f77bcf86cd799439011',
        planTier: 'essential',
        planCatalogId: 'plan-essential',
      },
      isLoading: false,
      isError: false,
    });
    usePlansQuery.mockReturnValue({
      data: { data: [essentialPlan, plusPlan] },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    useAssetsQuery.mockReturnValue({
      data: { data: [{ id: 'asset-1' }] },
      isLoading: false,
      isError: false,
    });
  });

  it('shows current plan and available upgrade options', async () => {
    await renderWithClient(<ChangePlanScreen />);

    expect(screen.getByText('Change protection plan')).toBeTruthy();
    expect(screen.getAllByText('Essential').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Current plan').length).toBeGreaterThan(0);
    expect(screen.getByText('Switch to this plan')).toBeTruthy();
  });

  it('patches the policy plan when a new tier is selected', async () => {
    mockMutateAsync.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      planTier: 'plus',
    });

    await renderWithClient(<ChangePlanScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Switch to this plan'));
    });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        policyId: '507f1f77bcf86cd799439011',
        planCatalogId: 'plan-plus',
      });
    });
  });

  it('surfaces PLAN_DOWNGRADE_NOT_ALLOWED when downgrade is blocked', async () => {
    usePolicyQuery.mockReturnValue({
      data: {
        id: '507f1f77bcf86cd799439011',
        planTier: 'plus',
        planCatalogId: 'plan-plus',
      },
      isLoading: false,
      isError: false,
    });
    useAssetsQuery.mockReturnValue({
      data: { data: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' }, { id: 'a5' }, { id: 'a6' }] },
      isLoading: false,
      isError: false,
    });
    mockMutateAsync.mockRejectedValue(
      new ApiError(409, {
        error: {
          code: 'PLAN_DOWNGRADE_NOT_ALLOWED',
          message:
            'This plan change is not allowed while you have more registered assets than the new plan allows.',
          requestId: 'req-1',
        },
      }),
    );

    await renderWithClient(<ChangePlanScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Switch to this plan'));
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          'You have more registered assets than this plan allows. Remove assets first, then try again.',
        ),
      ).toBeTruthy();
    });
  });
});
