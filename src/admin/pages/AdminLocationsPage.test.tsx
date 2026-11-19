import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../dashboard/api/errors';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminLocationsPage } from './AdminLocationsPage';
import type { AdminLocation } from '../api/admin-locations';

vi.mock('../api/admin-locations', () => ({ listAdminLocations: vi.fn() }));
vi.mock('../../customer/map/ProtectionMapCanvas', () => ({
  ProtectionMapCanvas: ({ pins }: { pins: unknown[] }) => <div data-testid="map" data-pins={pins.length} />,
}));
import { listAdminLocations } from '../api/admin-locations';

const loc = (over: Partial<AdminLocation> = {}): AdminLocation => ({
  assetId: 'x1',
  accountId: 'a1',
  assetName: 'iPhone 15',
  assetType: 'smartphone',
  source: 'phone',
  freshness: 'online',
  lastLocation: { latitude: -26.2, longitude: 28.04, recordedAt: new Date(Date.now() - 120_000).toISOString() },
  device: null,
  ...over,
});
const page = (data: AdminLocation[]) => ({ data, pagination: { nextCursor: null, hasMore: false } });
const renderPage = () => render(<MemoryRouter><AdminLocationsPage /></MemoryRouter>);

describe('AdminLocationsPage', () => {
  it('shows phones and trackers together with a pin each, the source', async () => {
    vi.mocked(listAdminLocations).mockResolvedValue(
      page([
        loc(),
        loc({ assetId: 'x2', assetName: 'Toyota Hilux', assetType: 'vehicle', source: 'hardware', freshness: 'quiet',
          device: { id: 'd1', serialOrImei: '869890083100051', label: 'Hilux tracker', status: 'active' } }),
      ]),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('iPhone 15')).toBeInTheDocument());
    expect(screen.getByTestId('map')).toHaveAttribute('data-pins', '2');
    expect(screen.getByText('Phone (reported by the app)')).toBeInTheDocument();
    expect(screen.getByText('GPS tracker')).toBeInTheDocument();
    expect(screen.getByText('Hilux tracker')).toBeInTheDocument();
    expect(screen.getByText(/written to the audit log/)).toBeInTheDocument();
  });

  it('asks the server for one source when the filter changes', async () => {
    const user = userEvent.setup();
    vi.mocked(listAdminLocations).mockResolvedValue(page([loc()]));
    vi.mocked(listAdminLocations).mockClear();
    renderPage();
    await waitFor(() => expect(screen.getByText('iPhone 15')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Filter by source'), 'hardware');
    await waitFor(() => expect(listAdminLocations).toHaveBeenLastCalledWith({ source: 'hardware' }));
  });

  it('says so when nothing has reported a position', async () => {
    vi.mocked(listAdminLocations).mockResolvedValue(page([]));
    renderPage();
    await waitFor(() => expect(screen.getByText(/has reported a position yet/)).toBeInTheDocument());
  });

  it('shows an error when loading fails', async () => {
    vi.mocked(listAdminLocations).mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('treats 404 as not enabled, then refresh loads, links the customer and shows the note', async () => {
    vi.mocked(listAdminLocations).mockRejectedValueOnce(new ApiError(404, { error: { message: 'nf' } } as never));
    renderPage();
    await waitFor(() => expect(screen.getByText(/not enabled in this environment/)).toBeInTheDocument());
    vi.mocked(listAdminLocations).mockResolvedValue(page([loc()]));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByText('iPhone 15')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Customer' })).toHaveAttribute('href', '/admin/accounts/a1');
    expect(screen.getByText(/not verified; no dispatch from here/)).toBeInTheDocument();
  });
});
