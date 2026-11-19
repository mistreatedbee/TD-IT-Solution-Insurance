import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { ProtectionMapView } from '../ProtectionMapView';

const mockWebFallback = { value: true };
jest.mock('../../../lib/nativeMaps', () => ({
  nativeMapsAvailable: () => !mockWebFallback.value,
  webMapFallbackActive: () => mockWebFallback.value,
}));

const PINS = [{ id: 'p1', title: 'Phone', latitude: -26.1, longitude: 28.0 }];

describe('ProtectionMapView map choice', () => {
  it('uses the OpenStreetMap web map on Android without a Google key', async () => {
    mockWebFallback.value = true;
    await render(
      <ThemeProvider>
        <ProtectionMapView pins={PINS} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('leaflet-map-webview')).toBeTruthy();
  });

  it('keeps the native map when it is available (iOS, or Android with a key)', async () => {
    mockWebFallback.value = false;
    await render(
      <ThemeProvider>
        <ProtectionMapView pins={PINS} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('leaflet-map-webview')).toBeNull();
  });
});
