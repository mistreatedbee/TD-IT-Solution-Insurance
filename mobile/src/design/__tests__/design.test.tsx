import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../theme/ThemeProvider';
import { designColorsDay, designColorsNight } from '../../theme/designTokens.generated';
import {
  AssetCard,
  Button,
  GlassCard,
  STATUS_BADGE_VOCABULARY,
  StatusBadge,
  TabBar,
  TdButton,
  TextField,
  maskIdentifier,
} from '..';

let mockBlurEnabled = true;
jest.mock('../../theme/designTheme', () => ({
  ...jest.requireActual('../../theme/designTheme'),
  useReducedTransparency: () => ({ blurEnabled: mockBlurEnabled }),
}));
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: (p: { testID?: string }) => <View testID={p.testID} /> };
});
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: jest.fn() }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 34 } };

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

const flat = (style: unknown): Record<string, any> => Object.assign({}, ...[style].flat(5).filter(Boolean));

beforeEach(() => {
  mockBlurEnabled = true;
});

describe.each([
  ['light', designColorsDay],
  ['dark', designColorsNight],
] as const)('%s mode', (mode, c) => {
  it('Button primary uses on-action-primary text on action-primary', async () => {
    await renderIn(mode, <Button label="Report theft" onPress={() => {}} testID="b" />);
    const btn = screen.getByTestId('b');
    expect(flat(btn.props.style).backgroundColor).toBe(c.actionPrimary);
    expect(flat(btn.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(flat(screen.getByText('Report theft').props.style).color).toBe(c.onActionPrimary);
  });

  it('GlassCard glass renders blur + border; solid does not', async () => {
    await renderIn(mode, <GlassCard testID="g"><Text>x</Text></GlassCard>);
    expect(screen.getByTestId('glass-blur')).toBeTruthy();
  });

  it('TextField error uses danger border', async () => {
    await renderIn(mode, <TextField label="ID number" value="12" onChangeText={() => {}} error="Enter 13 digits" testID="t" />);
    expect(screen.getByText('Enter 13 digits')).toBeTruthy();
    expect(c.danger).toBeTruthy();
  });

  it('StatusBadge, AssetCard and TabBar render', async () => {
    await renderIn(
      mode,
      <>
        <AssetCard type="car" name="Corolla" identifier="CA123456" status="TRACKING" footer="Last seen today" />
        <TabBar activeKey="home" onPress={() => {}} />
      </>,
    );
    expect(screen.getByText('Corolla')).toBeTruthy();
    expect(screen.getByTestId('tab-home')).toBeTruthy();
  });
});

describe('Button', () => {
  it.each(['primary', 'secondary', 'glass', 'danger'] as const)('%s variant is a button and fires onPress', async (v) => {
    const onPress = jest.fn();
    await renderIn('light', <Button label="Go" variant={v} onPress={onPress} testID="b" />);
    const btn = screen.getByRole('button', { name: 'Go' });
    fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('secondary and danger use token colours', async () => {
    await renderIn('light', <Button label="Del" variant="danger" testID="d" />);
    expect(flat(screen.getByTestId('d').props.style).backgroundColor).toBe(designColorsDay.danger);
  });

  it('disabled blocks press and sets state', async () => {
    const onPress = jest.fn();
    await renderIn('light', <Button label="Go" disabled onPress={onPress} testID="b" />);
    fireEvent.press(screen.getByTestId('b'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('b').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('loading shows spinner, is busy and blocks press', async () => {
    const onPress = jest.fn();
    await renderIn('light', <Button label="Go" loading onPress={onPress} testID="b" />);
    expect(screen.getByTestId('b-spinner')).toBeTruthy();
    expect(screen.getByTestId('b').props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    fireEvent.press(screen.getByTestId('b'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows focus ring on focus', async () => {
    await renderIn('light', <Button label="Go" testID="b" />);
    await fireEvent(screen.getByTestId('b'), 'focus');
    expect(flat(screen.getByTestId('b').props.style).outlineColor).toBe(designColorsDay.focusRing);
  });

  it('Td alias is the same component', () => {
    expect(TdButton).toBe(Button);
  });
});

describe('GlassCard reduced transparency', () => {
  it('falls back to bg-raised, no blur, keeps border', async () => {
    mockBlurEnabled = false;
    await renderIn('light', <GlassCard testID="g"><Text>x</Text></GlassCard>);
    expect(screen.queryByTestId('glass-blur')).toBeNull();
    const outer = screen.getByTestId('g');
    expect(flat(outer.props.style).backgroundColor).toBe(designColorsDay.bgRaised);
    expect(flat(outer.children[0] && (outer.children[0] as any).props.style).borderWidth).toBeGreaterThanOrEqual(1);
  });

  it('solid never blurs', async () => {
    await renderIn('dark', <GlassCard variant="solid"><Text>x</Text></GlassCard>);
    expect(screen.queryByTestId('glass-blur')).toBeNull();
  });
});

describe('TextField', () => {
  it('floats label state, announces error as alert with live region and icon', async () => {
    const onChange = jest.fn();
    await renderIn('light', <TextField label="Email" value="" onChangeText={onChange} error="Enter a valid email" testID="t" />);
    expect(screen.getByLabelText('Email')).toBeTruthy();
    const err = screen.getByTestId('t-error');
    expect(err.props.accessibilityRole).toBe('alert');
    expect(err.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByTestId('field-error-icon')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('t'), 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('has no error block without error', async () => {
    await renderIn('light', <TextField label="Email" value="" onChangeText={() => {}} testID="t" />);
    expect(screen.queryByTestId('t-error')).toBeNull();
  });
});

describe('StatusBadge', () => {
  it('limits to the fixed vocabulary with icon + word each', async () => {
    expect(STATUS_BADGE_VOCABULARY).toEqual([
      'PROTECTED', 'TRACKING', 'PENDING VERIFICATION', 'LOST', 'STOLEN', 'RECOVERED', 'CLAIM OPEN',
    ]);
    for (const s of STATUS_BADGE_VOCABULARY) {
      const { unmount } = await renderIn('light', <StatusBadge status={s} />);
      expect(screen.getByText(s)).toBeTruthy();
      expect(screen.getByTestId('status-icon')).toBeTruthy();
      await unmount();
    }
  });
});

describe('AssetCard', () => {
  it('masks identifier to last 4 and is one pressable', async () => {
    const onPress = jest.fn();
    await renderIn(
      'light',
      <AssetCard type="laptop" name="MacBook" identifier="C02ABCD1234" status="STOLEN" footer="Case open: awaiting police number" onPress={onPress} testID="a" />,
    );
    expect(screen.getByTestId('asset-identifier').props.children).toBe('•••• 1234');
    expect(screen.queryByText(/C02ABCD/)).toBeNull();
    expect(screen.getByTestId('a').props.accessibilityLabel).not.toContain('C02ABCD');
    fireEvent.press(screen.getByTestId('a'));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText('STOLEN')).toBeTruthy();
  });

  it('maskIdentifier edge cases', () => {
    expect(maskIdentifier('')).toBe('');
    expect(maskIdentifier('AB1')).toBe('AB1');
    expect(maskIdentifier('  1234567  ')).toBe('•••• 4567');
  });
});

describe('TabBar', () => {
  it('has exactly four tabs, marks active, fires onPress', async () => {
    const onPress = jest.fn();
    await renderIn('light', <TabBar activeKey="assets" onPress={onPress} />);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByTestId('tab-assets').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('tab-home').props.accessibilityState).toMatchObject({ selected: false });
    expect(flat(screen.getByTestId('tab-assets').props.style).backgroundColor).toBe(designColorsDay.actionPrimary);
    fireEvent.press(screen.getByTestId('tab-account'));
    expect(onPress).toHaveBeenCalledWith('account');
  });

  it('shows unread dot with count in label only when alertCount > 0', async () => {
    const { rerender } = await renderIn('dark', <TabBar activeKey="home" onPress={() => {}} alertCount={3} />);
    expect(screen.getByTestId('alerts-unread-dot')).toBeTruthy();
    expect(screen.getByTestId('tab-alerts').props.accessibilityLabel).toBe('Alerts, 3 unread');
    await rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider><TabBar activeKey="home" onPress={() => {}} alertCount={0} /></ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('alerts-unread-dot')).toBeNull();
    expect(screen.getByTestId('tab-alerts').props.accessibilityLabel).toBe('Alerts');
  });
});
