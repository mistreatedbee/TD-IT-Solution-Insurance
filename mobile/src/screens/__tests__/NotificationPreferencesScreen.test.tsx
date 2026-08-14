import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import { NotificationPreferencesScreen } from '../notifications/NotificationPreferencesScreen';
import type { NotificationPreferencesResponse } from '../../api/notifications';

jest.mock('../../theme/primitives', () => {
  const React = require('react');
  const { Text, View, Pressable } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Alert: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
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
    Toggle: ({
      value,
      onValueChange,
      disabled,
      accessibilityLabel,
      disabledHint,
    }: {
      value: boolean;
      onValueChange: (next: boolean) => void;
      disabled?: boolean;
      accessibilityLabel: string;
      disabledHint?: string;
    }) => (
      <View>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ checked: value, disabled }}
          disabled={disabled}
          onPress={() => onValueChange(!value)}
        >
          <Text>{value ? 'On' : 'Off'}</Text>
        </Pressable>
        {disabled && disabledHint ? <Text>{disabledHint}</Text> : null}
      </View>
    ),
  };
});

jest.mock('../../api/notifications', () => ({
  getNotificationPreferences: jest.fn(),
  updateNotificationPreferences: jest.fn(),
}));

const { getNotificationPreferences, updateNotificationPreferences } = jest.requireMock(
  '../../api/notifications',
) as {
  getNotificationPreferences: jest.Mock;
  updateNotificationPreferences: jest.Mock;
};

function buildPreferences(
  overrides?: Partial<NotificationPreferencesResponse['channels']>,
): NotificationPreferencesResponse {
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
      ...overrides,
    },
  };
}

describe('NotificationPreferencesScreen', () => {
  beforeEach(() => {
    getNotificationPreferences.mockReset();
    updateNotificationPreferences.mockReset();
  });

  it('loads and renders every category with its channel toggles', async () => {
    getNotificationPreferences.mockResolvedValue(buildPreferences());

    await render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Theft alerts')).toBeTruthy();
    });

    expect(screen.getByText('Device status')).toBeTruthy();
    expect(screen.getByText('Billing')).toBeTruthy();
    expect(screen.getByText('Account & security')).toBeTruthy();
    expect(screen.getByText('Claims')).toBeTruthy();
    expect(screen.getByText('General')).toBeTruthy();
    expect(screen.getByText('Marketing')).toBeTruthy();
  });

  it('renders the theft_critical push toggle locked with an explanatory note', async () => {
    getNotificationPreferences.mockResolvedValue(buildPreferences());

    await render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Theft alerts')).toBeTruthy();
    });

    const lockedToggle = screen.getByLabelText('Push notifications for Theft alerts');
    expect(lockedToggle.props.accessibilityState.disabled).toBe(true);
    expect(lockedToggle.props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('Required — cannot be turned off')).toBeTruthy();
  });

  it('leaves the theft_critical email toggle freely editable', async () => {
    getNotificationPreferences.mockResolvedValue(buildPreferences());

    await render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Theft alerts')).toBeTruthy();
    });

    const emailToggle = screen.getByLabelText('Email notifications for Theft alerts');
    expect(emailToggle.props.accessibilityState.disabled).toBeFalsy();
  });

  it('saves a toggle change and reflects the server response', async () => {
    getNotificationPreferences.mockResolvedValue(buildPreferences());
    updateNotificationPreferences.mockResolvedValue(
      buildPreferences({ billing: { push: true, email: true, sms: false } }),
    );

    await render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Billing')).toBeTruthy();
    });

    const billingPushToggle = screen.getByLabelText('Push notifications for Billing');
    await act(async () => {
      fireEvent.press(billingPushToggle);
    });

    await waitFor(() => {
      expect(updateNotificationPreferences).toHaveBeenCalledWith({ billing: { push: true } });
    });
    expect(billingPushToggle.props.accessibilityState.checked).toBe(true);
  });

  it('reverts an optimistic toggle and surfaces an error when saving fails', async () => {
    getNotificationPreferences.mockResolvedValue(buildPreferences());
    // A plain rejection (neither ApiError nor NetworkUnavailableError) falls
    // through to the screen's generic fallback message — asserting on that
    // fallback text, not the rejection's own message, since the screen
    // deliberately does not trust an arbitrary thrown value's message.
    updateNotificationPreferences.mockRejectedValue(new Error('some internal detail'));

    await render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Billing')).toBeTruthy();
    });

    const billingPushToggle = screen.getByLabelText('Push notifications for Billing');
    expect(billingPushToggle.props.accessibilityState.checked).toBe(false);

    await act(async () => {
      fireEvent.press(billingPushToggle);
    });

    await waitFor(() => {
      expect(screen.getByText('Could not save that change. Please try again.')).toBeTruthy();
    });
    expect(billingPushToggle.props.accessibilityState.checked).toBe(false);
  });

  it('shows a retry action when the initial load fails', async () => {
    getNotificationPreferences.mockRejectedValueOnce(new Error('boom'));

    await render(<NotificationPreferencesScreen />);

    await waitFor(() => {
      expect(
        screen.getByText('Could not load your notification preferences. Please try again.'),
      ).toBeTruthy();
    });

    getNotificationPreferences.mockResolvedValueOnce(buildPreferences());
    await act(async () => {
      fireEvent.press(screen.getByText('Retry'));
    });

    await waitFor(() => {
      expect(screen.getByText('Theft alerts')).toBeTruthy();
    });
  });
});
