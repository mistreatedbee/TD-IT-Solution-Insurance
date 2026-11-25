/**
 * "Locate now" on the web protection map (owner-test, VITE_FEATURE_REMOTE_LOCATE).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerProtectionMapPage } from './CustomerProtectionMapPage';

vi.mock('../../customer/api/assets', () => ({ listAssets: vi.fn() }));
vi.mock('../../customer/api/asset-location', () => ({ listAssetLocationSummary: vi.fn() }));
vi.mock('../../customer/api/locate-requests', () => ({ requestLocate: vi.fn(), getLatestLocateRequest: vi.fn() }));
vi.mock('../../customer/map/ProtectionMapCanvas', () => ({
  ProtectionMapCanvas: () => <div data-testid="map" />,
}));
import { listAssets } from '../../customer/api/assets';
import { listAssetLocationSummary } from '../../customer/api/asset-location';
import { getLatestLocateRequest, requestLocate, type LocateRequestStatus } from '../../customer/api/locate-requests';

const asset = { id: 'a1', displayName: 'My Android', assetType: 'smartphone' };
const summary = {
  data: [
    {
      assetId: 'a1',
      displayName: 'My Android',
      assetType: 'smartphone',
      reportingDeviceId: 'device-phone',
      lastLocation: { latitude: -26.2, longitude: 28.04, source: 'self_device', recordedAt: new Date().toISOString() },
    },
  ],
};
const req = (status: LocateRequestStatus) => ({
  requestId: 'r1',
  assetId: 'a1',
  status,
  requestedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  answeredAt: null,
  locationRecordedAt: null,
  notificationSent: true,
});

const renderPage = () => render(<MemoryRouter><CustomerProtectionMapPage /></MemoryRouter>);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('CustomerProtectionMapPage - Locate now', () => {
  it('is hidden while the flag is off', async () => {
    vi.mocked(listAssets).mockResolvedValue({ data: [asset] } as never);
    vi.mocked(listAssetLocationSummary).mockResolvedValue(summary as never);
    renderPage();
    await waitFor(() => expect(screen.getByText('My Android')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Locate now' })).toBeNull();
  });

  it('asks the phone, shows progress, then refreshes the map when answered', async () => {
    vi.stubEnv('VITE_FEATURE_REMOTE_LOCATE', 'true');
    vi.mocked(listAssets).mockResolvedValue({ data: [asset] } as never);
    vi.mocked(listAssetLocationSummary).mockResolvedValue(summary as never);
    vi.mocked(requestLocate).mockResolvedValue(req('pending'));
    vi.mocked(getLatestLocateRequest).mockResolvedValue(req('answered'));
    renderPage();
    const button = await screen.findByRole('button', { name: 'Locate now' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const loadsBefore = vi.mocked(listAssetLocationSummary).mock.calls.length;
    await act(async () => {
      fireEvent.click(button);
    });
    expect(await screen.findByText('Asking your phone…')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    await waitFor(() => expect(screen.getByText('Updated just now.')).toBeInTheDocument());
    expect(vi.mocked(listAssetLocationSummary).mock.calls.length).toBeGreaterThan(loadsBefore);
  });

  it("says when the phone didn't answer", async () => {
    vi.stubEnv('VITE_FEATURE_REMOTE_LOCATE', 'true');
    vi.mocked(listAssets).mockResolvedValue({ data: [asset] } as never);
    vi.mocked(listAssetLocationSummary).mockResolvedValue(summary as never);
    vi.mocked(requestLocate).mockResolvedValue(req('pending'));
    vi.mocked(getLatestLocateRequest).mockResolvedValue(req('expired'));
    renderPage();
    const button = await screen.findByRole('button', { name: 'Locate now' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => {
      fireEvent.click(button);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    await waitFor(() => expect(screen.getByText(/didn't answer/)).toBeInTheDocument());
  });
});
