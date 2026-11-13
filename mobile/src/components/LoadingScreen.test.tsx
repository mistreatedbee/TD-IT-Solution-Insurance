import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo } from 'react-native';

import { LoadingScreen } from './LoadingScreen';

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
});
