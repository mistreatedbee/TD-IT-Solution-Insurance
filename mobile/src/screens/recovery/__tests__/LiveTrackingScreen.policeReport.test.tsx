/**
 * Feature 011 — confirms the recovery-case detail screen (LiveTrackingScreen)
 * wires the police-report section to the loaded case's `policeReport` field.
 */
import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { LiveTrackingScreen } from '../LiveTrackingScreen';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ caseId: 'case-1' }),
}));

jest.mock('../../../api/hooks/useRecovery', () => ({
  useRecoveryCaseQuery: () => ({
    data: {
      id: 'case-1',
      assetId: 'asset-1',
      status: 'open',
      referenceNumber: 'REC-001',
      reportedAt: '2026-08-01T00:00:00.000Z',
      notes: null,
      lastLocationAt: null,
      policeReport: {
        sapsCaseNumber: 'CAS 42/1/2026',
        reportingStation: 'Rosebank SAPS',
        reportedToPoliceAt: '2026-08-02',
        history: [],
      },
    },
    isLoading: false,
    isError: false,
  }),
  useRecoveryLocationQuery: () => ({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useUpdatePoliceReportMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('../MapPlaceholder', () => ({
  MapPlaceholder: () => null,
}));

describe('LiveTrackingScreen — police report section', () => {
  it('shows the saved SAPS case number for the loaded case', async () => {
    await renderWithProviders(<LiveTrackingScreen />);

    expect(screen.getByText('CAS 42/1/2026')).toBeTruthy();
    expect(screen.getByText('Rosebank SAPS')).toBeTruthy();
    expect(screen.getByText('Update police report')).toBeTruthy();
  });
});
