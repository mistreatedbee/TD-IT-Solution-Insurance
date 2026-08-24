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

// Release Gate A default: claims flag is enabled unless a build profile
// explicitly turns it off (see src/config/features.ts) — this test file
// covers the enabled case; the disabled case is covered by a sibling file
// so each gets its own module registry (jest.mock is per-file).
jest.mock('../../../config/features', () => ({ FEATURE_CLAIMS_ENABLED: true }));

describe('ReportTheftSuccessScreen — claims flag enabled', () => {
  it('shows "File a claim"', async () => {
    await render(<ReportTheftSuccessScreen />);
    expect(screen.getByText('File a claim')).toBeTruthy();
  });
});
