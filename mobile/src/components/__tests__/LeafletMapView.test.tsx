import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import {
  LEAFLET_HTML,
  LeafletMapView,
  OSM_TILE_URL,
  type LeafletPin,
} from '../LeafletMapView';

const injected: string[] = (jest.requireMock('react-native-webview') as { __injected: string[] })
  .__injected;

const PINS: LeafletPin[] = [
  { id: 'a', latitude: -26.1, longitude: 28.0, label: 'Car' },
  { id: 'b', latitude: -26.2, longitude: 28.1, label: 'Laptop' },
];

async function send(data: unknown) {
  const web = screen.getByTestId('leaflet-map-webview');
  await act(async () => {
    (web.props.onMessage as (e: unknown) => void)({
      nativeEvent: { data: typeof data === 'string' ? data : JSON.stringify(data) },
    });
  });
}

async function renderMap(props: Partial<React.ComponentProps<typeof LeafletMapView>> = {}) {
  await render(
    <ThemeProvider>
      <LeafletMapView pins={PINS} fallback={<Text>Drawn map</Text>} {...props} />
    </ThemeProvider>,
  );
}

describe('LeafletMapView', () => {
  beforeEach(() => {
    injected.length = 0;
  });

  it('page pins Leaflet with SRI, uses OSM tiles and shows the OSM attribution', () => {
    expect(LEAFLET_HTML).toContain('unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    expect(LEAFLET_HTML).toMatch(/leaflet\.js" integrity="sha256-/);
    expect(LEAFLET_HTML).toMatch(/leaflet\.css" integrity="sha256-/);
    expect(OSM_TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(LEAFLET_HTML).toContain('OpenStreetMap contributors');
    expect(LEAFLET_HTML).toContain('Content-Security-Policy');
    expect(LEAFLET_HTML).not.toMatch(/console\./);
  });

  it('locks the WebView down (no file access, only the inline page)', async () => {
    await renderMap();
    const web = screen.getByTestId('leaflet-map-webview');
    expect(web.props.originWhitelist).toEqual(['about:blank']);
    expect(web.props.allowFileAccess).toBe(false);
    expect(web.props.allowFileAccessFromFileURLs).toBe(false);
    expect(web.props.allowUniversalAccessFromFileURLs).toBe(false);
    expect(web.props.geolocationEnabled).toBe(false);
    expect(web.props.onShouldStartLoadWithRequest({ url: 'https://evil.example' })).toBe(false);
    expect(web.props.onShouldStartLoadWithRequest({ url: 'about:blank' })).toBe(true);
  });

  it('shows the drawn map while loading, then sends pins once the page is ready', async () => {
    await renderMap({ selectedId: 'b' });
    expect(screen.getByText('Drawn map')).toBeTruthy();
    expect(injected).toHaveLength(0);
    await send({ type: 'ready' });
    expect(injected).toHaveLength(1);
    expect(injected[0]).toContain('__tdMapUpdate');
    expect(injected[0]).toContain('"selectedId":"b"');
    expect(injected[0]).toContain('"label":"Laptop"');
    await send({ type: 'tiles' });
    expect(screen.queryByText('Drawn map')).toBeNull();
  });

  it('falls back to the drawn map when the page reports an error', async () => {
    const onUnavailable = jest.fn();
    await renderMap({ onUnavailable });
    await send({ type: 'error' });
    expect(screen.getByTestId('leaflet-map-fallback')).toBeTruthy();
    expect(screen.getByText('Drawn map')).toBeTruthy();
    expect(screen.queryByTestId('leaflet-map-webview')).toBeNull();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('falls back when no tile loads before the timeout (offline)', async () => {
    jest.useFakeTimers();
    try {
      await renderMap({ loadTimeoutMs: 1000 });
      await send({ type: 'ready' });
      await act(async () => {
        jest.advanceTimersByTime(1100);
      });
      expect(screen.getByTestId('leaflet-map-fallback')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports pin and map taps, ignoring unknown pins and junk messages', async () => {
    const onSelectPin = jest.fn();
    const onMapPress = jest.fn();
    await renderMap({ onSelectPin, onMapPress });
    await send({ type: 'pin', id: 'a' });
    await send({ type: 'pin', id: 'not-a-pin' });
    await send('not json');
    await send({ type: 'mapPress' });
    expect(onSelectPin).toHaveBeenCalledTimes(1);
    expect(onSelectPin).toHaveBeenCalledWith('a');
    expect(onMapPress).toHaveBeenCalledTimes(1);
  });

  it('ignores taps when used as a static background', async () => {
    const onSelectPin = jest.fn();
    await renderMap({ onSelectPin, interactive: false });
    await send({ type: 'pin', id: 'a' });
    expect(onSelectPin).not.toHaveBeenCalled();
  });
});
