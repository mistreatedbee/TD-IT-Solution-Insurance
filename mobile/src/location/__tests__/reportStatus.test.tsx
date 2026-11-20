/** Automatic location-report failures are visible to the user, with honest, sanitized copy. */
import React from 'react';
import { act, renderHook, screen, waitFor } from '@testing-library/react-native';
import { reportAssetLocation } from '../../api/asset-location';
import { ApiError } from '../../api/errors';
import { renderWithProviders } from '../../test/renderWithProviders';
import { LocationReportStatusLine } from '../LocationReportStatusLine';
import {
  __resetLocationReportStatusForTests,
  getLocationReportStatus,
  recordLocationReportFailure,
  recordLocationReportSuccess,
} from '../reportStatus';
import { __resetLocationReporterStateForTests, useLocationReporter } from '../useLocationReporter';
import * as Location from 'expo-location';

jest.mock('../../api/asset-location', () => ({ reportAssetLocation: jest.fn(async () => ({})) }));
jest.mock('../consent', () => ({
  getLocationTrackingConsent: jest.fn(async () => 'granted'),
  getLinkedSmartphoneAssetId: jest.fn(async () => 'asset-1'),
}));
jest.mock('../../config/features', () => ({ FEATURE_LOCATION_TRACKING_ENABLED: true }));

const ingestionOff = () =>
  new ApiError(503, { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'x', requestId: 'r' } });

describe('location report status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetLocationReportStatusForTests();
    __resetLocationReporterStateForTests();
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  });

  it('an automatic report failure is recorded with the honest paused copy', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (reportAssetLocation as jest.Mock).mockRejectedValueOnce(ingestionOff());
    renderHook(() => useLocationReporter());
    await waitFor(() => expect(getLocationReportStatus().lastFailure).not.toBeNull());
    expect(getLocationReportStatus().lastFailure).toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      message: "Location tracking is paused on our side. We'll keep trying.",
    });
    warn.mockRestore();
  });

  it('a successful report records the send time and clears the failure', async () => {
    recordLocationReportFailure(ingestionOff());
    renderHook(() => useLocationReporter());
    await waitFor(() => expect(getLocationReportStatus().lastSentAt).not.toBeNull());
    expect(getLocationReportStatus().lastFailure).toBeNull();
  });

  it('never stores raw error text (which could carry coordinates)', () => {
    recordLocationReportFailure(new Error('lat -26.2041 lon 28.0473'));
    expect(getLocationReportStatus().lastFailure?.message).not.toMatch(/26\.2041/);
  });

  it('status line: nothing before any attempt, then "last update failed" plus last sent time', async () => {
    await renderWithProviders(<LocationReportStatusLine />);
    expect(screen.queryByTestId('location-report-status')).toBeNull();

    act(() => {
      recordLocationReportSuccess(Date.now() - 5 * 60 * 1000);
      recordLocationReportFailure(ingestionOff());
    });
    expect(
      await screen.findByText(
        "Last location update failed: Location tracking is paused on our side. We'll keep trying.",
      ),
    ).toBeTruthy();
    expect(screen.getByText('Location last sent 5 min ago.')).toBeTruthy();
  });
});
