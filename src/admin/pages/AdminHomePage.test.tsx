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

import { countPendingVerifications } from '../api/admin-verification';

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminHomePage />
    </MemoryRouter>,
  );
}

describe('AdminHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders both admin quick-link cards with the correct asymmetric weight and the primary card carrying the count', async () => {
    vi.mocked(countPendingVerifications).mockResolvedValue(14);
    renderPage();

    const verificationLink = screen.getByRole('link', { name: /Review verification queue/ });
    expect(verificationLink).toHaveAttribute('href', '/admin/verification');
    await waitFor(() => expect(screen.getByText('14 pending')).toBeInTheDocument());

    const analyticsLink = screen.getByRole('link', { name: /View analytics/ });
    expect(analyticsLink).toHaveAttribute('href', '/admin/analytics');
    // Secondary link has no paired count (dropped per Stage 3/ui-design.md §5).
    expect(screen.queryByText(/analytics.*pending/i)).not.toBeInTheDocument();
  });

  it('AC-9: a failed count degrades to a neutral placeholder + retry without blocking the quick link', async () => {
    vi.mocked(countPendingVerifications).mockRejectedValueOnce(new Error('network error'));
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
});
