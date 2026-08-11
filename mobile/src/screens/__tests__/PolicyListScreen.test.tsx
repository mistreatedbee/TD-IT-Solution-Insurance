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

jest.mock('../../auth/gateWriteAction', () => ({
  gateWriteAction: jest.fn(),
}));

const { usePoliciesQuery } = jest.requireMock('../../api/hooks/usePolicies') as {
  usePoliciesQuery: jest.Mock;
};

async function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('PolicyListScreen', () => {
  beforeEach(() => {
    usePoliciesQuery.mockReset();
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

    expect(screen.getByText('Your policy')).toBeTruthy();
    expect(screen.getByText('Create policy')).toBeTruthy();
    expect(screen.getByText(/don't have a policy yet/i)).toBeTruthy();
  });

  it('renders policy cards when data exists', async () => {
    usePoliciesQuery.mockReturnValue({
      data: {
        data: [
          {
            id: '507f1f77bcf86cd799439011',
            planTier: 'premium',
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

    expect(screen.getByText('premium')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
  });
});
