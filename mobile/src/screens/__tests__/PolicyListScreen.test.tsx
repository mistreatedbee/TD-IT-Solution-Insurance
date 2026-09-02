import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PolicyListScreen } from '../policy/PolicyListScreen';

jest.mock('../../theme/primitives', () => {
  const React = require('react');
  const { Text, View, Pressable } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Alert: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Badge: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({
      children,
      onPress,
    }: {
      children: string;
      onPress?: () => void;
    }) => (
      <Pressable onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
    Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../api/hooks/usePolicies', () => ({
  usePoliciesQuery: jest.fn(),
}));

jest.mock('../../api/hooks/usePlans', () => ({
  usePlansQuery: jest.fn(),
}));

jest.mock('../../api/hooks/useAssets', () => ({
  useAssetsQuery: jest.fn(),
}));

jest.mock('../../auth/gateWriteAction', () => ({
  gateWriteAction: jest.fn(),
}));

const { usePoliciesQuery } = jest.requireMock('../../api/hooks/usePolicies') as {
  usePoliciesQuery: jest.Mock;
};

const { usePlansQuery } = jest.requireMock('../../api/hooks/usePlans') as {
  usePlansQuery: jest.Mock;
};

const { useAssetsQuery } = jest.requireMock('../../api/hooks/useAssets') as {
  useAssetsQuery: jest.Mock;
};

async function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('PolicyListScreen', () => {
  beforeEach(() => {
    usePoliciesQuery.mockReset();
    usePlansQuery.mockReturnValue({
      data: {
        data: [
          {
            id: 'plan-plus',
            slug: 'plus',
            name: 'Plus',
            tagline: 'Protection + Monitoring',
            maxAssets: 10,
            monthlyAmountCents: 39900,
            currency: 'ZAR',
            isCustomPricing: false,
            isActive: true,
            sortOrder: 2,
            features: [],
            accountTypes: ['both'],
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    useAssetsQuery.mockReturnValue({
      data: { data: [{ id: 'asset-1' }, { id: 'asset-2' }], pagination: { nextCursor: null, hasMore: false } },
      isLoading: false,
      isError: false,
    });
  });

  it('shows empty state when the API returns no policies', async () => {
    usePoliciesQuery.mockReturnValue({
      data: { data: [], pagination: { nextCursor: null, hasMore: false } },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    await renderWithClient(<PolicyListScreen />);

    expect(screen.getByText('Your protection plan')).toBeTruthy();
    expect(screen.getByText('Choose a plan')).toBeTruthy();
    expect(screen.getByText(/don't have a protection plan yet/i)).toBeTruthy();
  });

  it('renders policy cards with plan pricing and asset usage', async () => {
    usePoliciesQuery.mockReturnValue({
      data: {
        data: [
          {
            id: '507f1f77bcf86cd799439011',
            planTier: 'plus',
            status: 'active',
            billing: { billingStatus: 'not_configured' },
            effectiveDate: '2026-08-01T00:00:00.000Z',
            coverageLimits: [],
          },
        ],
        pagination: { nextCursor: null, hasMore: false },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    await renderWithClient(<PolicyListScreen />);

    expect(screen.getByText('Plus')).toBeTruthy();
    expect(screen.getByText('R399/month')).toBeTruthy();
    expect(screen.getByText('2 / 10 assets')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
  });
});
