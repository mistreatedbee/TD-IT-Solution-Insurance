import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerDashboardPage } from './CustomerDashboardPage';

const listPolicies = vi.fn();
const listAssets = vi.fn();
const listPlans = vi.fn();

vi.mock('../../customer/api/policies', () => ({ listPolicies: (...a: unknown[]) => listPolicies(...a) }));
vi.mock('../../customer/api/assets', () => ({ listAssets: (...a: unknown[]) => listAssets(...a) }));
vi.mock('../../customer/api/plans', async (orig) => ({
  ...(await orig<typeof import('../../customer/api/plans')>()),
  listPlans: (...a: unknown[]) => listPlans(...a),
}));
vi.mock('../../customer/auth/CustomerAuthProvider', () => ({
  useCustomerAuth: () => ({
    status: 'signed-in',
    accessToken: 'token',
    account: { id: 'u1', email: 't@example.com', userType: 'customer', accountState: 'active', mfaRequired: false, mfaEnrolled: true, partnerOrganizationId: null },
    signOut: vi.fn(),
  }),
}));

const page = (data: unknown[]) => ({ data, pagination: { nextCursor: null, hasMore: false } });

const policy = {
  id: 'pol-12345678-abcd',
  planTier: 'standard',
  planCatalogId: 'plan-1',
  status: 'active',
  billing: { billingStatus: 'current', currency: 'ZAR', amount: 189 },
  planSummary: {
    planSlug: 'standard',
    planName: 'Standard',
    positioning: null,
    maxAssets: 5,
    maxUsers: 1,
    activeAssetCount: 2,
    assetUsageLabel: '2 of 5 assets',
    supportLevel: 'Email',
    monthlyAmountCents: 18900,
    entitlements: null,
  },
};

const assets = [
  { id: 'as-1', assetType: 'laptop', displayName: 'Work laptop', status: 'active', details: { brand: 'Apple', model: 'MBP', serialNumber: 'C02XK12345674K2F' } },
  { id: 'as-2', assetType: 'vehicle', displayName: 'Bakkie', status: 'removed', details: { make: 'Toyota', model: 'Hilux', year: 2020, vin: 'VIN0001', licensePlate: 'CA 123 456' } },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <CustomerDashboardPage />
    </MemoryRouter>,
  );
}

describe('CustomerDashboardPage (R5.2 smoke)', () => {
  beforeEach(() => {
    listPolicies.mockReset();
    listAssets.mockReset();
    listPlans.mockReset();
  });

  it('shows plan figures, policy details and masked asset cards with honest badges', async () => {
    listPolicies.mockResolvedValue(page([policy]));
    listAssets.mockResolvedValue(page(assets));
    renderPage();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Your policy' })).toBeInTheDocument());
    expect(listPolicies).toHaveBeenCalledWith({ includePlanSummary: true });
    expect(listPlans).not.toHaveBeenCalled(); // plan summary present: catalog not fetched

    expect(screen.getAllByText('Standard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 of 5 assets').length).toBeGreaterThan(0);
    expect(screen.getAllByText('R189/month').length).toBeGreaterThan(0);
    expect(screen.getByText('Policy ID pol-1234…')).toBeInTheDocument();

    // Asset cards: masked identifiers, PROTECTED only for the active asset, nothing invented for "removed".
    const list = screen.getByRole('list', { name: 'Registered assets' });
    expect(list).toHaveTextContent('Work laptop');
    expect(list).toHaveTextContent('Serial ending 4K2F');
    expect(list).not.toHaveTextContent('C02XK');
    expect(list).toHaveTextContent('Registration ending 3456');
    expect(screen.getAllByText('PROTECTED')).toHaveLength(1);
    expect(list).toHaveTextContent('Vehicle · removed');
    expect(list.querySelectorAll('a, button')).toHaveLength(0); // no asset-detail route exists yet

    // Headings and all text sit on glass surfaces, never on the ground.
    for (const h of screen.getAllByRole('heading', { level: 2 })) {
      expect(h.closest('[data-surface]')).not.toBeNull();
    }
    // Exactly one primary action on the page.
    const primaries = Array.from(document.querySelectorAll('button')).filter((b) => b.className.includes('bg-td-action-primary'));
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent('Register asset');
    expect(screen.getByRole('link', { name: 'Change plan' })).toHaveAttribute('href', '/dashboard/plan');
    expect(screen.getByRole('link', { name: 'Register asset' })).toHaveAttribute('href', '/get-started');
    expect(screen.getByRole('link', { name: 'Download the app' })).toHaveAttribute('href', '/#mobile-app');
    expect(screen.getByRole('link', { name: 'Account settings' })).toHaveAttribute('href', '/dashboard/account');
  });

  it('shows the setup prompt and empty states when there is no policy and no assets', async () => {
    listPolicies.mockResolvedValue(page([]));
    listAssets.mockResolvedValue(page([]));
    listPlans.mockResolvedValue(page([]));
    renderPage();

    await waitFor(() => expect(screen.getByText(/You have not selected a protection plan yet/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Complete setup' })).toHaveAttribute('href', '/get-started');
    expect(screen.getByText('No policy on file yet.')).toBeInTheDocument();
    expect(screen.getByText(/Register laptops, phones, vehicles/)).toBeInTheDocument();
    const primaries = Array.from(document.querySelectorAll('button')).filter((b) => b.className.includes('bg-td-action-primary'));
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent('Choose a plan');
  });

  it('surfaces a user-facing error when loading fails', async () => {
    listPolicies.mockRejectedValue(new Error('boom'));
    listAssets.mockResolvedValue(page([]));
    renderPage();
    // Both the error (danger) and the no-policy setup prompt (info) are role="alert".
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1));
    const danger = screen.getAllByRole('alert').find((el) => el.className.includes('text-td-danger'));
    expect(danger).toBeDefined();
    expect(danger?.textContent?.trim().length).toBeGreaterThan(0);
  });
});
