import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetsListPage } from './AssetsListPage';
import type { AdminAssetSummary } from '../api/admin-data';

vi.mock('../api/admin-data', () => ({
  listAdminAssets: vi.fn(),
  getAdminAssetCounts: vi.fn(),
}));
vi.mock('../api/admin-home-stats', () => ({
  getActiveAssetCount: vi.fn(),
}));

import { getAdminAssetCounts, listAdminAssets } from '../api/admin-data';
import { getActiveAssetCount } from '../api/admin-home-stats';

function asset(overrides: Partial<AdminAssetSummary> = {}): AdminAssetSummary {
  return {
    id: '1',
    accountId: 'acc-1',
    displayName: 'Test laptop',
    assetType: 'laptop',
    status: 'active',
    legalHold: false,
    gpsDeviceId: null,
    registeredAt: '2026-11-12T12:00:00.000Z',
    ...overrides,
  };
}

function page(data: AdminAssetSummary[], hasMore = false, nextCursor: string | null = null) {
  return { data, pagination: { nextCursor, hasMore } };
}

function renderPage(path = '/admin/assets') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AssetsListPage />
    </MemoryRouter>,
  );
}

function rowFor(name: string) {
  return screen.getByText(name).closest('tr') as HTMLElement;
}

beforeEach(() => {
  vi.mocked(listAdminAssets).mockReset();
  vi.mocked(getActiveAssetCount).mockReset();
  vi.mocked(getActiveAssetCount).mockResolvedValue(0);
  vi.mocked(getAdminAssetCounts).mockReset();
  // Default: counts endpoint fails, so tiles use the labelled loaded-rows fallback.
  vi.mocked(getAdminAssetCounts).mockRejectedValue(new Error('counts unavailable'));
});

describe('AssetsListPage (true counts)', () => {
  it('shows true per-category, GPS and legal-hold totals without the (loaded) label', async () => {
    vi.mocked(getAdminAssetCounts).mockResolvedValue({
      total: 47,
      byAssetType: { laptop: 30, desktop: 10, vehicle: 4, smartphone: 3 },
      byStatus: { active: 40, inactive: 5, removed: 2 },
      legalHold: 2,
      gpsPaired: 6,
    });
    vi.mocked(listAdminAssets).mockResolvedValue(page([asset({ displayName: 'Only loaded row' })]));
    renderPage();

    expect(await screen.findByRole('button', { name: 'Computers: 40' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vehicles: 4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Phones & tablets: 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TVs: 0' })).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument(); // GPS paired (true total)
    expect(screen.getByText('On legal hold')).toBeInTheDocument();
    expect(screen.queryByText(/\(loaded\)/)).not.toBeInTheDocument();
    expect(getAdminAssetCounts).toHaveBeenCalledTimes(1);
  });

  it('falls back to loaded-row counts, labelled (loaded), when the counts call fails', async () => {
    vi.mocked(listAdminAssets).mockResolvedValue(
      page([asset({ id: '1', assetType: 'laptop' }), asset({ id: '2', assetType: 'laptop', legalHold: true })]),
    );
    renderPage();
    expect(await screen.findByRole('button', { name: 'Computers (loaded): 2' })).toBeInTheDocument();
    expect(screen.getByText('On legal hold (loaded)')).toBeInTheDocument();
    expect(screen.getByText(/Totals are unavailable/)).toBeInTheDocument();
  });

  it('does not fetch counts on an account-filtered view (tiles are hidden)', async () => {
    vi.mocked(listAdminAssets).mockResolvedValue(page([]));
    renderPage('/admin/assets?accountId=acc-1');
    await waitFor(() => expect(listAdminAssets).toHaveBeenCalled());
    expect(getAdminAssetCounts).not.toHaveBeenCalled();
  });
});

describe('AssetsListPage (categories)', () => {
  it('renders the KPI strip, plain type labels, and a GPS-paired indicator', async () => {
    vi.mocked(getActiveAssetCount).mockResolvedValue(601);
    vi.mocked(listAdminAssets).mockResolvedValue(
      page([
        asset({ id: '1', displayName: 'QA Test Laptop', assetType: 'laptop' }),
        asset({ id: '2', displayName: 'Iphone', assetType: 'smartphone', gpsDeviceId: 'gps-1' }),
      ]),
    );

    renderPage();

    await waitFor(() => expect(screen.getByText('QA Test Laptop')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('601')).toBeInTheDocument());
    expect(screen.getByText('Registered assets')).toBeInTheDocument();
    expect(screen.getByText('GPS tracker (paired)')).toBeInTheDocument();
    expect(within(rowFor('Iphone')).getByText('Phone')).toBeInTheDocument();
    expect(within(rowFor('QA Test Laptop')).getByText('12 Nov 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'QA Test Laptop' })).toHaveAttribute('href', '/admin/assets/1');
  });

  it('fetches both types for a two-type group chip, then applies the status filter', async () => {
    const user = userEvent.setup();
    vi.mocked(listAdminAssets).mockImplementation(async (p) =>
      page(
        p?.assetType === 'desktop'
          ? [asset({ id: 'd', displayName: 'Old desktop', assetType: 'desktop', registeredAt: '2026-01-01T00:00:00Z' })]
          : [asset({ id: 'l', displayName: 'New laptop', registeredAt: '2026-06-01T00:00:00Z' })],
      ),
    );

    renderPage();
    await waitFor(() => expect(listAdminAssets).toHaveBeenCalled());
    vi.mocked(listAdminAssets).mockClear();

    await user.click(screen.getByRole('button', { name: 'Computers' }));
    await waitFor(() => {
      expect(listAdminAssets).toHaveBeenCalledWith(expect.objectContaining({ assetType: 'laptop' }));
      expect(listAdminAssets).toHaveBeenCalledWith(expect.objectContaining({ assetType: 'desktop' }));
    });
    await waitFor(() => expect(screen.getByText('Old desktop')).toBeInTheDocument());
    // Merged newest first.
    const names = screen.getAllByRole('link').map((a) => a.textContent);
    expect(names).toEqual(['New laptop', 'Old desktop']);
    // Sub-chips appear for the two-type group.
    expect(screen.getByRole('button', { name: 'Laptops' })).toBeInTheDocument();

    vi.mocked(listAdminAssets).mockClear();
    await user.selectOptions(screen.getByDisplayValue('All statuses'), 'active');
    await waitFor(() => {
      expect(listAdminAssets).toHaveBeenCalledWith(expect.objectContaining({ assetType: 'laptop', status: 'active' }));
      expect(listAdminAssets).toHaveBeenCalledWith(expect.objectContaining({ assetType: 'desktop', status: 'active' }));
    });
  });

  it('shows the filtered empty state with a Clear filters button', async () => {
    vi.mocked(listAdminAssets).mockResolvedValue(page([]));
    renderPage('/admin/assets?status=active');
    await waitFor(() => expect(screen.getByText('No assets match these filters')).toBeInTheDocument());
    expect(screen.getByText('Try another group, status or tracking filter.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Clear filters' }).length).toBeGreaterThan(0);
  });

  it('shows a plain empty state when no assets exist and no filters are set', async () => {
    vi.mocked(listAdminAssets).mockResolvedValue(page([]));
    renderPage();
    await waitFor(() => expect(screen.getByText('No assets registered yet.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('labels every tracking-method branch and the status/legal-hold badges', async () => {
    vi.mocked(listAdminAssets).mockResolvedValue(
      page([
        asset({ id: '1', displayName: 'Paired van', assetType: 'vehicle', gpsDeviceId: 'gps-9' }),
        asset({ id: '2', displayName: 'My phone', assetType: 'smartphone', status: 'inactive' }),
        asset({ id: '3', displayName: 'Lounge TV', assetType: 'tv', status: 'removed' }),
        asset({ id: '4', displayName: 'Bakkie', assetType: 'vehicle', legalHold: true }),
        asset({ id: '5', displayName: 'Drone', assetType: 'other_electronics' }),
      ]),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('Paired van')).toBeInTheDocument());

    expect(within(rowFor('Paired van')).getByText('GPS tracker (paired)')).toBeInTheDocument();
    expect(within(rowFor('My phone')).getByText('Our app on the phone')).toBeInTheDocument();
    expect(within(rowFor('Lounge TV')).getByText('Our software (coming soon)')).toBeInTheDocument();
    expect(within(rowFor('Bakkie')).getByText('GPS tracker (not paired)')).toBeInTheDocument();
    expect(within(rowFor('Drone')).getByText('Not tracked')).toBeInTheDocument();

    expect(within(rowFor('My phone')).getByText('Inactive')).toBeInTheDocument();
    expect(within(rowFor('Lounge TV')).getByText('Archived (removed)')).toBeInTheDocument();
    expect(within(rowFor('Bakkie')).getByText('Legal hold')).toBeInTheDocument();
  });

  it('filters loaded rows by tracking chip', async () => {
    const user = userEvent.setup();
    vi.mocked(listAdminAssets).mockResolvedValue(
      page([
        asset({ id: '1', displayName: 'Bakkie', assetType: 'vehicle' }),
        asset({ id: '2', displayName: 'My phone', assetType: 'smartphone' }),
      ]),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('Bakkie')).toBeInTheDocument());
    const callsBefore = vi.mocked(listAdminAssets).mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'GPS not paired' }));
    expect(screen.getByText('Bakkie')).toBeInTheDocument();
    expect(screen.queryByText('My phone')).not.toBeInTheDocument();
    // Browser-side filter: no extra list call.
    expect(vi.mocked(listAdminAssets).mock.calls.length).toBe(callsBefore);
  });

  it('selects a group when its summary tile is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(listAdminAssets).mockResolvedValue(page([asset({ assetType: 'vehicle', displayName: 'Bakkie' })]));
    renderPage();
    await waitFor(() => expect(screen.getByText('Bakkie')).toBeInTheDocument());

    const tile = screen.getByRole('button', { name: 'Vehicles (loaded): 1' });
    expect(tile).toHaveAttribute('aria-pressed', 'false');
    await user.click(tile);
    await waitFor(() =>
      expect(listAdminAssets).toHaveBeenLastCalledWith(expect.objectContaining({ assetType: 'vehicle' })),
    );
    expect(screen.getByRole('button', { name: 'Vehicles' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('searches loaded rows by name and Clear filters resets everything but accountId', async () => {
    const user = userEvent.setup();
    vi.mocked(listAdminAssets).mockResolvedValue(
      page([
        asset({ id: '1', displayName: 'Bedroom Samsung TV', assetType: 'tv' }),
        asset({ id: '2', displayName: 'Lounge LG TV', assetType: 'tv' }),
      ]),
    );
    renderPage('/admin/assets?accountId=acc-7&group=tvs&tracking=software');
    await waitFor(() => expect(screen.getByText('Bedroom Samsung TV')).toBeInTheDocument());
    expect(screen.getByText('Filtered to account acc-7')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search by asset name'), 'samsung');
    expect(screen.getByText('Bedroom Samsung TV')).toBeInTheDocument();
    expect(screen.queryByText('Lounge LG TV')).not.toBeInTheDocument();

    vi.mocked(listAdminAssets).mockClear();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(screen.getByText('Lounge LG TV')).toBeInTheDocument());
    expect(screen.getByLabelText('Search by asset name')).toHaveValue('');
    expect(listAdminAssets).toHaveBeenLastCalledWith(
      expect.objectContaining({ accountId: 'acc-7', assetType: undefined, status: undefined }),
    );
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('warns that more assets may match when browser filters are active and more pages exist', async () => {
    const user = userEvent.setup();
    vi.mocked(listAdminAssets)
      .mockResolvedValueOnce(page([asset({ id: '1', displayName: 'Bakkie', assetType: 'vehicle' })], true, 'c1'))
      .mockResolvedValueOnce(page([asset({ id: '2', displayName: 'Truck', assetType: 'vehicle' })]));
    renderPage();
    await waitFor(() => expect(screen.getByText('Bakkie')).toBeInTheDocument());
    expect(screen.queryByText(/More assets may match/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Search by asset name'), 'truck');
    expect(screen.getByText('More assets may match. Load more to search further.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getByText('Truck')).toBeInTheDocument());
    expect(listAdminAssets).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c1' }));
    expect(screen.queryByText(/More assets may match/)).not.toBeInTheDocument();
  });

  it('shows an error with Try again, which re-fetches', async () => {
    const user = userEvent.setup();
    vi.mocked(listAdminAssets)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(page([asset({ displayName: 'Recovered row' })]));
    renderPage();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    await user.click(retry);
    await waitFor(() => expect(screen.getByText('Recovered row')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
