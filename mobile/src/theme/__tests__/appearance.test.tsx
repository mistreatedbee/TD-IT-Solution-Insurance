import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ThemeProvider, useTheme } from '../ThemeProvider';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      mockStore.set(k, v);
    },
  },
}));

function Probe() {
  const { isDark, appearance, setAppearance } = useTheme();
  return (
    <>
      <Text testID="mode">{isDark ? 'night' : 'day'}</Text>
      <Text testID="pref">{appearance}</Text>
      <Text onPress={() => setAppearance('dark')}>choose-dark</Text>
      <Text onPress={() => setAppearance('light')}>choose-light</Text>
    </>
  );
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

describe('appearance preference', () => {
  beforeEach(() => {
    mockStore.clear();
  });
  afterEach(() => jest.restoreAllMocks());

  it('defaults to following the system', async () => {
    await renderProbe();
    expect(screen.getByTestId('pref').props.children).toBe('system');
  });

  it('switches to dark and remembers it', async () => {
    await renderProbe();
    await act(async () => {
      fireEvent.press(screen.getByText('choose-dark'));
    });
    expect(screen.getByTestId('mode').props.children).toBe('night');
    expect(mockStore.get('td-appearance-preference')).toBe('dark');
  });

  it('forces light', async () => {
    await renderProbe();
    await act(async () => {
      fireEvent.press(screen.getByText('choose-light'));
    });
    expect(screen.getByTestId('mode').props.children).toBe('day');
  });

  it('restores a saved choice on start', async () => {
    mockStore.set('td-appearance-preference', 'dark');
    await renderProbe();
    await act(async () => {});
    expect(screen.getByTestId('pref').props.children).toBe('dark');
    expect(screen.getByTestId('mode').props.children).toBe('night');
  });
});
