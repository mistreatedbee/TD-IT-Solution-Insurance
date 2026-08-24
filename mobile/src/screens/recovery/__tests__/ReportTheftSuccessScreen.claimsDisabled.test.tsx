import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ReportTheftSuccessScreen } from '../ReportTheftSuccessScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ reference: 'REF-123' }),
}));

jest.mock('../../../theme/primitives', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Alert: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    Button: ({ children }: { children: string }) => <Text>{children}</Text>,
  };
});

// Release Gate A: preview/production build profiles set
// EXPO_PUBLIC_FEATURE_CLAIMS="false" — this covers the disabled case, i.e.
// the entry point into the (now-gated) claims flow must not render.
jest.mock('../../../config/features', () => ({ FEATURE_CLAIMS_ENABLED: false }));

describe('ReportTheftSuccessScreen — claims flag disabled (preview/production)', () => {
  it('hides "File a claim"', async () => {
    await render(<ReportTheftSuccessScreen />);
    expect(screen.queryByText('File a claim')).toBeNull();
  });
});
