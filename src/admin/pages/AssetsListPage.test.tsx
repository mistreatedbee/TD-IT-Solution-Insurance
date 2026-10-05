import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AssetsListPage } from './AdminDataPages';
import type { AdminAssetSummary } from '../api/admin-data';

vi.mock('../api/admin-data', () => ({
  listAdminAssets: vi.fn(),
}));
vi.mock('../api/admin-home-stats', () => ({
  getActiveAssetCount: vi.fn(),
}));

import { listAdminAssets } from '../api/admin-data';
import { getActiveAssetCount } from '../api/admin-home-stats';

function asset(overrides: Partial<AdminAssetSummary> = {}): AdminAssetSummary {
  return {
    id: '1',
    displayName: 'Test laptop',
    assetType: 'laptop',
    status: 'active',
    gpsDeviceId: null,
    ...overrides,
  } as AdminAssetSummary;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AssetsListPage />
    </MemoryRouter>,
  );
}

describe('AssetsListPage (modernized)', () => {
  it('renders the KPI strip, type icons, and a GPS-paired indicator', async () => {
    vi.mocked(getActiveAssetCount).mockResolvedValue(601);
    vi.mocked(listAdminAssets).mockResolvedValue({
      data: [
        asset({ id: '1', displayName: 'QA Test Laptop', assetType: 'laptop' }),
        asset({ id: '2', displayName: 'Iphone', assetType: 'smartphone', gpsDeviceId: 'gps-1' }),
      ],
      pagination: { nextCursor: null, hasMore: false },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('QA Test Laptop')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('601')).toBeInTheDocument());
    expect(screen.getByText('Registered assets')).toBeInTheDocument();
    expect(screen.getByText('Paired')).toBeInTheDocument();
  });

  it('re-fetches with the selected type and status filters', async () => {
    const user = userEvent.setup();
    vi.mocked(getActiveAssetCount).mockResolvedValue(0);
    vi.mocked(listAdminAssets).mockResolvedValue({
      data: [asset()],
      pagination: { nextCursor: null, hasMore: false },
    });

    renderPage();
    await waitFor(() => expect(listAdminAssets).toHaveBeenCalled());

    await user.selectOptions(screen.getByDisplayValue('All types'), 'smartphone');
    await waitFor(() =>
      expect(listAdminAssets).toHaveBeenLastCalledWith(
        expect.objectContaining({ assetType: 'smartphone' }),
      ),
    );

    await user.selectOptions(screen.getByDisplayValue('All statuses'), 'active');
    await waitFor(() =>
      expect(listAdminAssets).toHaveBeenLastCalledWith(
        expect.objectContaining({ assetType: 'smartphone', status: 'active' }),
      ),
    );
  });

  it('shows an empty state instead of a blank table when no assets match', async () => {
    vi.mocked(getActiveAssetCount).mockResolvedValue(0);
    vi.mocked(listAdminAssets).mockResolvedValue({
      data: [],
      pagination: { nextCursor: null, hasMore: false },
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('No assets match these filters')).toBeInTheDocument());
  });
});
