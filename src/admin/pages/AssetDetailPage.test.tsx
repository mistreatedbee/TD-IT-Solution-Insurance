/**
 * Admin asset detail: every section the admin may see, masked identifiers, related links, and the
 * audited location section (map pin, freshness, history, tracking-off and empty states).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetDetailPage } from './AdminDataPages';
import { ApiError } from '../../dashboard/api/errors';
import type { AdminAssetDetail } from '../api/admin-data';
import type { AdminAssetLocation } from '../api/admin-locations';

vi.mock('../api/admin-data', () => ({
  getAdminAsset: vi.fn(),
  listAdminPolicies: vi.fn(),
  archiveAdminAsset: vi.fn(),
  setAdminAssetLegalHold: vi.fn(),
}));
vi.mock('../api/admin-plans', () => ({ listAdminPlans: vi.fn().mockResolvedValue({ data: [] }) }));
vi.mock('../api/step-up', () => ({ requestStepUpChallenge: vi.fn(), verifyStepUp: vi.fn() }));
vi.mock('../api/admin-locations', () => ({ getAdminAssetLocation: vi.fn() }));
vi.mock('../../customer/map/ProtectionMapCanvas', () => ({
  ProtectionMapCanvas: ({ pins }: { pins: Array<{ latitude: number }> }) => (
    <div data-testid="map" data-pins={pins.length} data-lat={pins[0]?.latitude} />
  ),
}));

import { getAdminAsset, listAdminPolicies } from '../api/admin-data';
import { getAdminAssetLocation } from '../api/admin-locations';

const asset = (over: Partial<AdminAssetDetail> = {}): AdminAssetDetail => ({
  id: 'asset-1',
  accountId: 'acct-1',
  assetType: 'smartphone',
  displayName: 'iPhone 15',
  status: 'active',
  legalHold: false,
  gpsDeviceId: null,
  registeredAt: '2026-01-01T00:00:00.000Z',
  estimatedValue: { amount: 18000, currency: 'ZAR', asOf: '2026-01-01T00:00:00.000Z' },
  photos: [],
  details: { brand: 'Apple', model: 'iPhone 15', imei: '356938035643809' },
  gpsPairedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  related: { openClaim: { id: 'claim-1', status: 'under_review' }, openRecoveryCase: { id: 'case-1', referenceNumber: 'RC-2026-0001', status: 'reported' } },
  ...over,
});

const location = (over: Partial<AdminAssetLocation> = {}): AdminAssetLocation => ({
  assetId: 'asset-1',
  accountId: 'acct-1',
  trackingOff: false,
  source: 'phone',
  freshness: 'online',
  lastLocation: { latitude: -26.20412, longitude: 28.04731, accuracyMeters: 12, recordedAt: new Date(Date.now() - 120_000).toISOString() },
  history: [
    { id: 'e1', latitude: -26.2, longitude: 28.04, accuracyMeters: 12, recordedAt: new Date(Date.now() - 120_000).toISOString(), source: 'phone' },
    { id: 'e2', latitude: -26.21, longitude: 28.05, accuracyMeters: null, recordedAt: new Date(Date.now() - 3_600_000).toISOString(), source: 'phone' },
  ],
  trackingDevice: null,
  ...over,
});

const renderPage = () => render(<MemoryRouter><AssetDetailPage assetId="asset-1" /></MemoryRouter>);
const section = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listAdminPolicies).mockResolvedValue({
    data: [{ id: 'pol-1', accountId: 'acct-1', planTier: 'standard', planCatalogId: null, status: 'active', legalHold: false, billingStatus: 'current', effectiveDate: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z' }],
    pagination: { nextCursor: null, hasMore: false },
  });
});

describe('AssetDetailPage (full detail)', () => {
  it('shows identity with the IMEI masked, owner, policy, tracking method and related links', async () => {
    vi.mocked(getAdminAsset).mockResolvedValue(asset());
    vi.mocked(getAdminAssetLocation).mockResolvedValue(location());
    renderPage();
    await screen.findByRole('heading', { name: 'iPhone 15', level: 1 });
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('•••• 3809')).toBeInTheDocument();
    expect(screen.queryByText('356938035643809')).not.toBeInTheDocument();
    expect(screen.getByText(/ZAR 18/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'acct-1' })).toHaveAttribute('href', '/admin/accounts/acct-1');
    await waitFor(() => expect(document.querySelector('a[href="/admin/policies/pol-1"]')).not.toBeNull());
    expect(listAdminPolicies).toHaveBeenCalledWith({ accountId: 'acct-1' });
    expect(screen.getByText('Our app on the phone')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'RC-2026-0001' })).toHaveAttribute('href', '/admin/dispatch/cases/case-1');
    expect(screen.getByRole('link', { name: 'View claim' })).toHaveAttribute('href', '/admin/claims/claim-1');
    expect(screen.getByText('No photos on file.')).toBeInTheDocument();
  });

  it('shows the last known location on a single-pin map with accuracy, source, freshness and history', async () => {
    vi.mocked(getAdminAsset).mockResolvedValue(asset());
    vi.mocked(getAdminAssetLocation).mockResolvedValue(location());
    renderPage();
    await waitFor(() => expect(screen.getByTestId('map')).toHaveAttribute('data-pins', '1'));
    const loc = section('Location');
    expect(within(loc).getByText('-26.20412, 28.04731')).toBeInTheDocument();
    expect(within(loc).getAllByText('± 12 m').length).toBeGreaterThan(0);
    expect(within(loc).getAllByText('Phone (reported by our app)').length).toBeGreaterThan(0);
    expect(within(loc).getAllByText(/2 min ago/).length).toBeGreaterThan(0);
    expect(within(loc).getByText('Not reported')).toBeInTheDocument(); // history row with no accuracy
    expect(within(loc).getByText(/written to the audit log/)).toBeInTheDocument();
    expect(getAdminAssetLocation).toHaveBeenCalledWith('asset-1');
  });

  it('shows the linked GPS tracker with a masked serial', async () => {
    vi.mocked(getAdminAsset).mockResolvedValue(asset({ assetType: 'vehicle', gpsDeviceId: 'dev-1', details: {} }));
    vi.mocked(getAdminAssetLocation).mockResolvedValue(
      location({ source: 'hardware', trackingDevice: { id: 'dev-1', serialOrImei: '869890083100051', label: 'Hilux tracker', status: 'active', activatedAt: '2026-11-01T00:00:00.000Z', lastTelemetryAt: null } }),
    );
    renderPage();
    expect(await screen.findByText('Hilux tracker')).toBeInTheDocument();
    expect(screen.getByText('•••• 0051')).toBeInTheDocument();
    expect(screen.getByText('GPS tracker (paired)')).toBeInTheDocument();
  });

  it('says tracking is off after consent withdrawal, with no map', async () => {
    vi.mocked(getAdminAsset).mockResolvedValue(asset());
    vi.mocked(getAdminAssetLocation).mockResolvedValue(location({ trackingOff: true, source: null, lastLocation: null, history: [] }));
    renderPage();
    expect(await screen.findByText(/No location — tracking is off/)).toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });

  it('empty state when nothing has reported yet', async () => {
    vi.mocked(getAdminAsset).mockResolvedValue(asset({ assetType: 'other', related: { openClaim: null, openRecoveryCase: null } }));
    vi.mocked(getAdminAssetLocation).mockResolvedValue(location({ source: null, lastLocation: null, history: [], freshness: 'never' }));
    renderPage();
    expect(await screen.findByText(/has not reported a position/)).toBeInTheDocument();
    expect(screen.getByText('Not tracked')).toBeInTheDocument();
    expect(screen.getAllByText('None')).toHaveLength(2);
  });

  it('explains when the location view is switched off on the server (404)', async () => {
    vi.mocked(getAdminAsset).mockResolvedValue(asset());
    vi.mocked(getAdminAssetLocation).mockRejectedValue(new ApiError(404, { error: { code: 'NOT_FOUND', message: 'nf' } }));
    renderPage();
    expect(await screen.findByText(/not switched on for this environment/)).toBeInTheDocument();
  });
});
