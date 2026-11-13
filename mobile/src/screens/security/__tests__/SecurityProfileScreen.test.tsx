import React from 'react';
import { render } from '@testing-library/react-native';
import { SecurityProfileScreen } from '../SecurityProfileScreen';

jest.mock('../../../theme/primitives', () => {
  const { Text, View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Badge: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../../api/auth', () => ({ logout: jest.fn(), logoutAll: jest.fn() }));
jest.mock('../../../notifications/push', () => ({
  revokePushTokenFromBackend: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../../auth/secure-storage', () => ({ clearRefreshToken: jest.fn() }));
jest.mock('../../../auth/session-store', () => ({
  useSessionStore: (sel: (s: unknown) => unknown) => sel({ setSignedOut: jest.fn() }),
}));
jest.mock('../../../query/queryClient', () => ({ queryClient: { clear: jest.fn() } }));
jest.mock('../../../auth/useAccountQuery', () => ({
  useAccountQuery: () => ({
    data: { email: 'op@example.com', accountState: 'active' },
    isLoading: false,
  }),
}));

describe('SecurityProfileScreen', () => {
  it('shows preferences and sign-out rows but no test-notification row', async () => {
    const view = await render(<SecurityProfileScreen />);
    expect(view.getByText('Notification preferences')).toBeTruthy();
    expect(view.getByText('Log out')).toBeTruthy();
    expect(view.queryByText('Send test notification')).toBeNull();
  });
});
