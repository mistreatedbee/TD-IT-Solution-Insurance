import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../../theme/ThemeProvider';
import { ProtectionMapHero } from '../ProtectionMapHero';

jest.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
// Android build without a Google Maps key.
jest.mock('../../../../lib/nativeMaps', () => ({
  nativeMapsAvailable: () => false,
  webMapFallbackActive: () => true,
}));

describe('ProtectionMapHero on Android without a Google key', () => {
  it('uses a static OpenStreetMap background and keeps the drawn overlay', async () => {
    await render(
      <ThemeProvider>
        <ProtectionMapHero height={300} />
      </ThemeProvider>,
    );
    const map = screen.getByTestId('hero-leaflet-map');
    expect(map.props.pointerEvents).toBe('none');
    expect(screen.getByTestId('hero-leaflet-map-webview')).toBeTruthy();
    expect(screen.getByText('Car')).toBeTruthy();
  });
});
