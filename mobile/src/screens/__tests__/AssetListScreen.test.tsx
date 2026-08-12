import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetListScreen } from '../assets/AssetListScreen';

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

jest.mock('../../api/hooks/useAssets', () => ({
  useAssetsQuery: jest.fn(),
}));

jest.mock('../../auth/gateWriteAction', () => ({
  gateWriteAction: jest.fn(),
}));

const { useAssetsQuery } = jest.requireMock('../../api/hooks/useAssets') as {
  useAssetsQuery: jest.Mock;
};

async function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('AssetListScreen', () => {
  beforeEach(() => {
    useAssetsQuery.mockReset();
  });

  it('shows empty state when the API returns no assets', async () => {
    useAssetsQuery.mockReturnValue({
      data: { data: [], pagination: { nextCursor: null, hasMore: false } },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    await renderWithClient(<AssetListScreen />);

    expect(screen.getByText('Your assets')).toBeTruthy();
    expect(screen.getByLabelText('Register asset')).toBeTruthy();
    expect(screen.getByText(/No assets registered yet/i)).toBeTruthy();
  });

  it(
    'renders asset cards when data exists',
    async () => {
      useAssetsQuery.mockReturnValue({
        data: {
          data: [
            {
              id: '507f1f77bcf86cd799439011',
              displayName: 'My laptop',
              assetType: 'laptop',
              status: 'registered',
            },
          ],
          pagination: { nextCursor: null, hasMore: false },
        },
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: jest.fn(),
      });

      await renderWithClient(<AssetListScreen />);

      await waitFor(
        () => {
          expect(screen.getByText('My laptop')).toBeTruthy();
        },
        { timeout: 10000 },
      );
      expect(screen.getByText('Laptop')).toBeTruthy();
    },
    15000,
  );
});
