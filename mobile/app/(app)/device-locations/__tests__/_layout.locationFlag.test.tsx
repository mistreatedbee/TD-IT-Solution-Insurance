/**
 * INC-001 §9.3 / ADR-0009 §18.7(a): `DeviceLocationsScreen` reads
 * `GET /v1/assets/location-summary` and renders `latitude`/`longitude`
 * pins with no gate of its own — only the capture path was ever flag-gated.
 * This asserts the *layout*-level guard (mirrors `claims/_layout.tsx`)
 * actually stops the screen — and therefore its location-read query —
 * from mounting at all when `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING` is off,
 * not merely that some button or pin is hidden after the fact.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import DeviceLocationsLayout from '../_layout';
import { listAssetLocationSummary } from '../../../../src/api/asset-location';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Stack: Object.assign(
    ({ children }: { children?: React.ReactNode }) => children ?? null,
    { Screen: () => null },
  ),
}));

jest.mock('../../../../src/api/asset-location', () => ({
  listAssetLocationSummary: jest.fn(),
  getAssetLocation: jest.fn(),
  getAssetLocationHistory: jest.fn(),
  reportAssetLocation: jest.fn(),
}));

jest.mock('../../../../src/theme/primitives', () => {
  const React = require('react');
  const { Text, View, Pressable } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Alert: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children, onPress }: { children: string; onPress?: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});

jest.mock('../../../../src/config/features', () => ({ FEATURE_LOCATION_TRACKING_ENABLED: false }));

describe('DeviceLocationsLayout — location tracking flag disabled (preview/production)', () => {
  it('renders the "coming soon" fallback instead of the device-locations screen', async () => {
    await render(<DeviceLocationsLayout />);
    expect(screen.getByText('Live location tracking is coming soon.')).toBeTruthy();
  });

  it('never calls the location-summary read endpoint', async () => {
    await render(<DeviceLocationsLayout />);
    expect(listAssetLocationSummary).not.toHaveBeenCalled();
  });

  it('renders no coordinate data anywhere on screen', async () => {
    await render(<DeviceLocationsLayout />);
    // A latitude/longitude pair as rendered by DeviceLocationRow, e.g. "-26.2041, 28.0473".
    expect(screen.queryByText(/-?\d+\.\d{4},\s*-?\d+\.\d{4}/)).toBeNull();
    expect(screen.queryByText('Live map')).toBeNull();
    expect(screen.queryByText('All registered devices')).toBeNull();
  });
});
