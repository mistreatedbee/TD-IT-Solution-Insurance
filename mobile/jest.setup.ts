/// <reference types="jest" />
/**
 * Global Jest setup for the mobile app.
 *
 * `jest-expo`'s preset already mocks most of the Expo SDK, but a few
 * native modules this app depends on directly (SecureStore, Crypto) are
 * given explicit, deterministic in-memory mocks here so unit tests don't
 * depend on jest-expo's mock coverage happening to include them.
 */

// A deterministic test-only API host, so src/api/config.ts's "not set"
// warning doesn't fire on every test run.
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';

// --- expo-secure-store -----------------------------------------------
// In-memory stand-in for the iOS Keychain / Android Keystore-backed store.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

// --- expo-crypto --------------------------------------------------------
// Deterministic-enough UUID for tests (not cryptographically random —
// tests should never rely on this being unpredictable).
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
}));

// --- expo-device ----------------------------------------------------
jest.mock('expo-device', () => ({
  modelName: 'jest-test-device',
  osName: 'jest',
  osVersion: '0.0.0',
  isDevice: true,
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  setNotificationChannelAsync: jest.fn(async () => {}),
  setNotificationCategoryAsync: jest.fn(async () => {}),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  AndroidImportance: {
    MAX: 5,
    HIGH: 4,
    DEFAULT: 3,
    LOW: 2,
  },
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'test-project-id' } } },
  easConfig: { projectId: 'test-project-id' },
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  hasServicesEnabledAsync: jest.fn(async () => true),
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: -26.2041, longitude: 28.0473, accuracy: 12 },
    timestamp: Date.now(),
  })),
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockMap = React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
    React.createElement(View, { ...props, ref }),
  );
  return {
    __esModule: true,
    default: MockMap,
    Marker: View,
    PROVIDER_DEFAULT: 'default',
  };
});

// --- lucide-react-native -----------------------------------------------
// Icon components are SVG-native; mock as empty Views for unit tests.
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockIcon = (props: Record<string, unknown>) =>
    React.createElement(View, props);
  return new Proxy(
    {},
    {
      get: () => MockIcon,
    },
  );
});
