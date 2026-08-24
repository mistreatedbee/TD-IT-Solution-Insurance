import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { NotificationPreferencesScreen } from '../notifications/NotificationPreferencesScreen';
import type { NotificationPreferencesResponse } from '../../api/notifications';

jest.mock('../../theme/primitives', () => {
  const React = require('react');
  const { Text, View, Pressable } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Alert: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Button: ({ children, onPress }: { children: string; onPress?: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
    Toggle: ({
      value,
      onValueChange,
      disabled,
      accessibilityLabel,
    }: {
      value: boolean;
      onValueChange: (next: boolean) => void;
      disabled?: boolean;
      accessibilityLabel: string;
    }) => (
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        onPress={() => onValueChange(!value)}
      >
        <Text>{value ? 'On' : 'Off'}</Text>
      </Pressable>
    ),
  };
});

jest.mock('../../api/notifications', () => ({
  getNotificationPreferences: jest.fn(),
  updateNotificationPreferences: jest.fn(),
}));

// Release Gate A: preview/production build profiles set
// EXPO_PUBLIC_FEATURE_CLAIMS="false" — offering preferences for a
// notification category the app can never send is the same defect as a
// dead nav link (see src/config/features.ts).
jest.mock('../../config/features', () => ({ FEATURE_CLAIMS_ENABLED: false }));

const { getNotificationPreferences } = jest.requireMock('../../api/notifications') as {
  getNotificationPreferences: jest.Mock;
};

function buildPreferences(): NotificationPreferencesResponse {
  return {
    accountId: 'acc-1',
    updatedAt: '2026-08-01T00:00:00.000Z',
    channels: {
      theft_critical: { push: true, email: true, sms: false },
      device_status: { push: true, email: false, sms: false },
      billing: { push: false, email: true, sms: false },
      account: { push: true, email: true, sms: false },
      claims: { push: true, email: true, sms: false },
      general: { push: false, email: false, sms: false },
      marketing: { push: false, email: false, sms: false },
    },
  };
}

describe('NotificationPreferencesScreen — claims flag disabled (preview/production)', () => {
  it('does not render the Claims category', async () => {
    getNotificationPreferences.mockResolvedValue(buildPreferences());

    await render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Theft alerts')).toBeTruthy();
    });

    expect(screen.queryByText('Claims')).toBeNull();
    // Every other category is unaffected by the flag.
    expect(screen.getByText('Device status')).toBeTruthy();
    expect(screen.getByText('Billing')).toBeTruthy();
    expect(screen.getByText('Account & security')).toBeTruthy();
    expect(screen.getByText('General')).toBeTruthy();
    expect(screen.getByText('Marketing')).toBeTruthy();
  });
});
