import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CustomerDashboardLayout } from './CustomerDashboardLayout';

const signOut = vi.fn(() => Promise.resolve());
vi.mock('../auth/CustomerAuthProvider', () => ({
  useCustomerAuth: () => ({
    status: 'signed-in',
    accessToken: 'token',
    account: { id: 'u1', email: 'thandi@example.com', userType: 'customer', accountState: 'active', mfaRequired: false, mfaEnrolled: true, partnerOrganizationId: null },
    signOut,
  }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<CustomerDashboardLayout />}>
          <Route path="/dashboard" element={<p>overview content</p>} />
          <Route path="/dashboard/plan" element={<p>plan content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('CustomerDashboardLayout (R5.2 shell)', () => {
  it('mounts the page ground with no pattern and marks the active route in the nav', () => {
    const { container } = renderAt('/dashboard/plan');
    const ground = container.querySelector('[data-td-backdrop="ground"]');
    expect(ground).not.toBeNull();
    expect(ground?.getAttribute('data-pattern')).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Customer dashboard' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change plan' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { level: 1, name: 'Customer dashboard' })).toBeInTheDocument();
    expect(screen.getByText('thandi@example.com')).toBeInTheDocument();
    expect(screen.getByText('plan content')).toBeInTheDocument();
  });

  it('keeps all nine destinations and navigates in-SPA via react-router', async () => {
    renderAt('/dashboard');
    for (const label of ['Overview', 'Change plan', 'Map', 'Alerts', 'Verification', 'Add coverage', 'Profile', 'Notifications', 'Account']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole('link', { name: 'Change plan' }));
    expect(screen.getByText('plan content')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change plan' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the Log out action wired to signOut', async () => {
    renderAt('/dashboard');
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
