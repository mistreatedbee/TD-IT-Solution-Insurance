import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ClaimsComingSoonScreen } from '../ClaimsComingSoonScreen';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../../theme/primitives', () => {
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

describe('ClaimsComingSoonScreen', () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it('renders the gated messaging instead of any claims content', async () => {
    await render(<ClaimsComingSoonScreen />);
    expect(screen.getByText('Claims filing is coming soon.')).toBeTruthy();
  });

  it('routes back to the home tab', async () => {
    await render(<ClaimsComingSoonScreen />);
    fireEvent.press(screen.getByText('Back to home'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)');
  });
});
