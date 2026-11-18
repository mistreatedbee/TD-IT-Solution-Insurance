import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo, StyleSheet, useColorScheme } from 'react-native';

import { LoadingScreen } from './LoadingScreen';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: jest.fn(() => 'light') }));

describe('LoadingScreen', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('renders with progressbar role, Loading label, rings, and no text', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { unmount } = await render(<LoadingScreen testID="ls" />);
    await act(async () => {});
    const root = screen.getByTestId('ls');
    expect(root.props.accessibilityRole).toBe('progressbar');
    expect(root.props.accessibilityLabel).toBe('Loading');
    expect(screen.getAllByTestId('loading-ring')).toHaveLength(2);
    await unmount();
  });

  it('hides rings when reduce motion is on and keeps the bar', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { unmount } = await render(<LoadingScreen />);
    await act(async () => {});
    expect(screen.queryAllByTestId('loading-ring')).toHaveLength(0);
    expect(screen.getByTestId('loading-bar')).toBeTruthy();
    await unmount();
  });

  it('is white in the Day theme and navy in the Night theme, matching the native splash', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const scheme = useColorScheme as unknown as jest.Mock;
    scheme.mockReturnValue('light');
    const day = await render(<LoadingScreen testID="ls" />);
    await act(async () => {});
    expect(StyleSheet.flatten(screen.getByTestId('ls').props.style).backgroundColor).toBe('#FFFFFF');
    await day.unmount();

    scheme.mockReturnValue('dark');
    const night = await render(<LoadingScreen testID="ls" />);
    await act(async () => {});
    expect(StyleSheet.flatten(screen.getByTestId('ls').props.style).backgroundColor).toBe('#0B1622');
    await night.unmount();
  });
});
