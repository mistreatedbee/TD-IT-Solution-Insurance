/**
 * INC-001 A-12: `AlertsScreen` must not mount when the flag is off.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import AlertsLayout from '../_layout';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: Object.assign(
    ({ children }: { children?: React.ReactNode }) => children ?? null,
    { Screen: () => null },
  ),
}));

jest.mock('../../../../src/theme/primitives', () => {
  const React = require('react');
  const { Text, View, Pressable } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Alert: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children, onPress }: { children: string; onPress?: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});

jest.mock('../../../../src/config/features', () => ({ FEATURE_ALERTS_ENABLED: false }));

describe('AlertsLayout — alerts flag disabled (preview/production)', () => {
  it('renders the gated fallback instead of the alerts screen', async () => {
    await render(<AlertsLayout />);
    expect(screen.getByText('Alerts are coming soon.')).toBeTruthy();
  });
});
