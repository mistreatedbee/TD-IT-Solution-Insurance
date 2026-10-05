import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminHomePage } from './AdminHomePage';

vi.mock('../../dashboard/auth/DashboardAuthProvider', () => ({
  useDashboardAuth: () => ({ account: { email: 'admin@example.com' } }),
}));
vi.mock('../api/admin-verification', () => ({
  countPendingVerifications: vi.fn(),
}));
vi.mock('../api/admin-home-stats', () => ({
  getActiveCustomerCount: vi.fn(),
  getActivePolicyCount: vi.fn(),
  getActiveAssetCount: vi.fn(),
}));
vi.mock('../api/admin-analytics', () => ({
  getAdminDau: vi.fn(),
}));

import { countPendingVerifications } from '../api/admin-verification';
import { getActiveAssetCount, getActiveCustomerCount, getActivePolicyCount } from '../api/admin-home-stats';
import { getAdminDau } from '../api/admin-analytics';

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminHomePage />
    </MemoryRouter>,
  );
}

function mockHappyStats() {
  vi.mocked(countPendingVerifications).mockResolvedValue(14);
  vi.mocked(getActiveCustomerCount).mockResolvedValue(312);
  vi.mocked(getActivePolicyCount).mockResolvedValue(287);
  vi.mocked(getActiveAssetCount).mockResolvedValue(601);
  vi.mocked(getAdminDau).mockResolvedValue({
    timezone: 'Africa/Johannesburg',
    event: 'session_start',
    series: [
      { dayBucket: '2026-10-01', distinctAccounts: 10 },
      { dayBucket: '2026-10-02', distinctAccounts: 12 },
    ],
  });
}

describe('AdminHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the KPI row with all four counts once loaded', async () => {
    mockHappyStats();
    renderPage();

    await waitFor(() => expect(screen.getByText('14')).toBeInTheDocument());
    expect(screen.getByText('Pending verifications')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('312')).toBeInTheDocument());
    expect(screen.getByText('Active customers')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('287')).toBeInTheDocument());
    expect(screen.getByText('Active policies')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('601')).toBeInTheDocument());
    expect(screen.getByText('Registered assets')).toBeInTheDocument();
  });

  it('renders the DAU trend panel with the latest-day number and a link to full analytics', async () => {
    mockHappyStats();
    renderPage();

    expect(screen.getByText('Daily active users')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.getByText('Latest day')).toBeInTheDocument();

    const fullAnalyticsLinks = screen.getAllByRole('link', { name: /View full analytics/ });
    for (const link of fullAnalyticsLinks) {
      expect(link).toHaveAttribute('href', '/admin/analytics');
    }
  });

  it('renders quick-link cards for verification, accounts, plans, and invite-staff', async () => {
    mockHappyStats();
    renderPage();

    const verificationLink = screen.getByRole('link', { name: /Review verification queue/ });
    expect(verificationLink).toHaveAttribute('href', '/admin/verification');
    await waitFor(() => expect(screen.getByText('14 pending')).toBeInTheDocument());

    expect(screen.getByRole('link', { name: /View accounts/ })).toHaveAttribute('href', '/admin/accounts');
    expect(screen.getByRole('link', { name: /Manage plans/ })).toHaveAttribute('href', '/admin/plans');
    expect(screen.getByRole('link', { name: /Invite a staff member/ })).toHaveAttribute(
      'href',
      '/admin/accounts/invite',
    );
  });

  it('AC-9: a failed verification count degrades to a neutral placeholder + retry without blocking the quick link', async () => {
    vi.mocked(countPendingVerifications).mockRejectedValueOnce(new Error('network error'));
    vi.mocked(getActiveCustomerCount).mockResolvedValue(0);
    vi.mocked(getActivePolicyCount).mockResolvedValue(0);
    vi.mocked(getActiveAssetCount).mockResolvedValue(0);
    vi.mocked(getAdminDau).mockResolvedValue({ timezone: 'Africa/Johannesburg', event: 'session_start', series: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Count unavailable')).toBeInTheDocument());
    const verificationLink = screen.getByRole('link', { name: /Review verification queue/ });
    expect(verificationLink).toHaveAttribute('href', '/admin/verification');

    vi.mocked(countPendingVerifications).mockResolvedValueOnce(5);
    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });
    await waitFor(() => expect(screen.getByText('5 pending')).toBeInTheDocument());
  });

  it('a failed KPI count shows an unavailable placeholder rather than crashing the page', async () => {
    vi.mocked(countPendingVerifications).mockResolvedValue(0);
    vi.mocked(getActiveCustomerCount).mockRejectedValue(new Error('network error'));
    vi.mocked(getActivePolicyCount).mockResolvedValue(0);
    vi.mocked(getActiveAssetCount).mockResolvedValue(0);
    vi.mocked(getAdminDau).mockResolvedValue({ timezone: 'Africa/Johannesburg', event: 'session_start', series: [] });
    renderPage();

    await waitFor(() => expect(screen.getByText('Active customers unavailable')).toBeInTheDocument());
  });
});
