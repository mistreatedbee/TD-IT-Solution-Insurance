import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../theme/ThemeProvider';
import { Backdrop, TdBackdrop, type BackdropPattern } from '..';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: jest.fn() }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function renderIn(mode: 'light' | 'dark', ui: React.ReactElement) {
  (useColorScheme as jest.Mock).mockReturnValue(mode);
  const view = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
  await act(async () => {});
  return view;
}

const HID = { includeHiddenElements: true };
const PATTERNS: BackdropPattern[] = ['chevron', 'rings', 'dots'];

describe('Backdrop', () => {
  it('is exported as TdBackdrop too', () => {
    expect(TdBackdrop).toBe(Backdrop);
  });

  describe.each(['light', 'dark'] as const)('%s mode', (mode) => {
    it.each(PATTERNS)('renders the %s pattern, and only that one', async (p) => {
      await renderIn(mode, <Backdrop pattern={p} />);
      expect(screen.getByTestId(`td-backdrop-pattern-${p}`, HID)).toBeTruthy();
      PATTERNS.filter((o) => o !== p).forEach((o) =>
        expect(screen.queryByTestId(`td-backdrop-pattern-${o}`, HID)).toBeNull(),
      );
    });

    it('image variant renders the prepared image, no gradient', async () => {
      await renderIn(mode, <Backdrop />);
      expect(screen.getByTestId('td-backdrop-image', HID)).toBeTruthy();
      expect(screen.queryByTestId('td-backdrop-gradient', HID)).toBeNull();
      expect(screen.queryByTestId('td-backdrop-pattern-chevron', HID)).toBeNull();
    });

    it('gradient variant renders the token gradient, no image', async () => {
      await renderIn(mode, <Backdrop variant="gradient" pattern="dots" />);
      expect(screen.getByTestId('td-backdrop-gradient', HID)).toBeTruthy();
      expect(screen.queryByTestId('td-backdrop-image', HID)).toBeNull();
    });
  });

  it('hides decorative layers from accessibility but keeps children reachable', async () => {
    await renderIn('light', <Backdrop pattern="rings"><Text>content</Text></Backdrop>);
    const decor = screen.getByTestId('td-backdrop-decor', HID);
    expect(decor.props.accessibilityElementsHidden).toBe(true);
    expect(decor.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.getByText('content')).toBeTruthy();
  });
});
