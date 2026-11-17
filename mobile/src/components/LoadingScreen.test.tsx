import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { AccessibilityInfo } from 'react-native';

import { ThemeProvider } from '../theme/ThemeProvider';
import { LoadingScreen } from './LoadingScreen';

function renderLoading(testID?: string) {
  return render(
    <ThemeProvider>
      <LoadingScreen testID={testID} />
    </ThemeProvider>,
  );
}

describe('LoadingScreen', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('is a labelled progress indicator with no message at first', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    const { unmount } = await renderLoading('ls');
    await act(async () => {});
    const root = screen.getByTestId('ls');
    expect(root.props.accessibilityRole).toBe('progressbar');
    expect(root.props.accessibilityLabel).toBe('Loading');
    expect(screen.getByTestId('loading-glow')).toBeTruthy();
    expect(screen.queryByTestId('loading-message')).toBeNull();
    await unmount();
  });

  it('tells the person when loading takes longer than usual', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    const { unmount } = await renderLoading();
    await act(async () => {});

    await act(async () => {
      jest.advanceTimersByTime(1700);
    });
    expect(screen.getByText('Getting things ready')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(3600);
    });
    expect(
      screen.getByText(/first start can take a little longer/),
    ).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(8000);
    });
    expect(screen.getByText(/servers are waking up/)).toBeTruthy();
    await unmount();
  });

  it('keeps the bar full and still when reduce motion is on', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    const { unmount } = await renderLoading();
    await act(async () => {});
    expect(screen.getByTestId('loading-bar')).toBeTruthy();
    await unmount();
  });
});
