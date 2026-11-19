import { Platform } from 'react-native';

const mockExtra: { value: Record<string, unknown> | undefined } = { value: undefined };
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra.value };
    },
  },
}));

import { nativeMapsAvailable, webMapFallbackActive } from '../nativeMaps';

describe('nativeMapsAvailable', () => {
  const original = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: original });
    mockExtra.value = undefined;
  });

  it('is false on Android without a Google Maps key (native MapView would crash the app)', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    mockExtra.value = { androidMapsKeyConfigured: false };
    expect(nativeMapsAvailable()).toBe(false);
    mockExtra.value = undefined;
    expect(nativeMapsAvailable()).toBe(false);
  });

  it('is true on Android when the build has a key', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    mockExtra.value = { androidMapsKeyConfigured: true };
    expect(nativeMapsAvailable()).toBe(true);
  });

  it('is true on iOS (Apple Maps needs no key) and false on web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    expect(nativeMapsAvailable()).toBe(true);
    Object.defineProperty(Platform, 'OS', { value: 'web' });
    expect(nativeMapsAvailable()).toBe(false);
  });

  it('uses the OpenStreetMap web map only on Android without a key', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    mockExtra.value = { androidMapsKeyConfigured: false };
    expect(webMapFallbackActive()).toBe(true);
    mockExtra.value = { androidMapsKeyConfigured: true };
    expect(webMapFallbackActive()).toBe(false);
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    expect(webMapFallbackActive()).toBe(false);
    Object.defineProperty(Platform, 'OS', { value: 'web' });
    expect(webMapFallbackActive()).toBe(false);
  });
});
