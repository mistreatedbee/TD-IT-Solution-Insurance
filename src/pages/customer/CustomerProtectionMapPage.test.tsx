import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CustomerProtectionMapPage, formatUpdatedAgo, isStale } from './CustomerProtectionMapPage';

vi.mock('../../customer/api/assets', () => ({ listAssets: vi.fn() }));
vi.mock('../../customer/api/asset-location', () => ({ listAssetLocationSummary: vi.fn() }));
vi.mock('../../customer/map/ProtectionMapCanvas', () => ({
  ProtectionMapCanvas: ({ pins }: { pins: unknown[] }) => <div data-testid="map" data-pins={pins.length} />,
}));
import { listAssets } from '../../customer/api/assets';
import { listAssetLocationSummary } from '../../customer/api/asset-location';

const asset = { id: 'a1', displayName: 'My iPhone', assetType: 'smartphone' };
const renderPage = () => render(<MemoryRouter><CustomerProtectionMapPage /></MemoryRouter>);

describe('CustomerProtectionMapPage', () => {
  it('shows updated-ago and a Stale badge for a position older than 24h', async () => {
    vi.mocked(listAssets).mockResolvedValue({ data: [asset] } as never);
    vi.mocked(listAssetLocationSummary).mockResolvedValue({
      data: [{ assetId: 'a1', displayName: 'My iPhone', assetType: 'smartphone',
        lastLocation: { latitude: -26.2, longitude: 28.04, accuracyMeters: 20, source: 'self_device',
          recordedAt: new Date(Date.now() - 30 * 3600_000).toISOString() } }],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Stale')).toBeInTheDocument());
    expect(screen.getByText(/Updated 30 h ago/)).toBeInTheDocument();
    expect(screen.queryByText(/GPS vendor/)).toBeNull();
  });

  it('explains the empty state', async () => {
    vi.mocked(listAssets).mockResolvedValue({ data: [asset] } as never);
    vi.mocked(listAssetLocationSummary).mockResolvedValue({ data: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText(/location consent/, { selector: 'div,p' })).toBeInTheDocument());
  });

  it('does not report No fix when only the locations call fails', async () => {
    vi.mocked(listAssets).mockResolvedValue({ data: [asset] } as never);
    vi.mocked(listAssetLocationSummary).mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => expect(screen.getByText(/could not load your locations/)).toBeInTheDocument());
    expect(screen.queryByText('No fix')).toBeNull();
  });

  it('formats freshness helpers', () => {
    const now = Date.now();
    expect(formatUpdatedAgo(new Date(now - 5 * 60000).toISOString(), now)).toBe('Updated 5 min ago');
    expect(isStale(new Date(now - 25 * 3600_000).toISOString(), now)).toBe(true);
    expect(isStale(new Date(now - 3600_000).toISOString(), now)).toBe(false);
  });
});
