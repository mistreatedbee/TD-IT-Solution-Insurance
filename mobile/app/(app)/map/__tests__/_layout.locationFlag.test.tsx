/**
 * INC-001 §9.3 / ADR-0009 §18.7(a): `ProtectionMapScreen` reads
 * `GET /v1/assets/:assetId/location-history` (via
 * `useAssetLocationHistoryQuery`) and the location summary with no gate of
 * its own — only the capture path was ever flag-gated. This asserts the
 * *layout*-level guard (mirrors `claims/_layout.tsx`) actually stops the
 * screen — and therefore its location-read queries — from mounting at all
 * when `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING` is off, not merely that a
 * pin or trail is hidden after the fact.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import MapLayout from '../_layout';
import { listAssetLocationSummary, getAssetLocationHistory } from '../../../../src/api/asset-location';

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

describe('MapLayout — location tracking flag disabled (preview/production)', () => {
  it('renders the "coming soon" fallback instead of the live protection map', async () => {
    await render(<MapLayout />);
    expect(screen.getByText('Live location tracking is coming soon.')).toBeTruthy();
  });

  it('never calls the location-summary or location-history read endpoints', async () => {
    await render(<MapLayout />);
    expect(listAssetLocationSummary).not.toHaveBeenCalled();
    expect(getAssetLocationHistory).not.toHaveBeenCalled();
  });

  it('renders no coordinate data or map chrome anywhere on screen', async () => {
    await render(<MapLayout />);
    expect(screen.queryByText('Live protection map')).toBeNull();
    expect(screen.queryByText(/-?\d+\.\d{5},\s*-?\d+\.\d{5}/)).toBeNull();
  });
});
