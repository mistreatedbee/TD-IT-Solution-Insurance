import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminHomePage } from '../../admin/pages/AdminHomePage';
import { SecurityHomePage } from '../../security/pages/SecurityHomePage';
import { CallCentreHomePage } from '../../call-centre/pages/CallCentreHomePage';

/**
 * Feature 012 — AC-6 explicit negative test: "No data belonging to a different role is
 * fetched, requested, or rendered anywhere on any role's Home screen." This is a
 * network-level assertion, not a UI-visibility one (`business-requirements.md` AC-6),
 * checking exactly the property `security-review.md` SR-012-4/C-012-A1 makes structural via
 * props injection + the `no-restricted-imports` fence on `HomeScreen.tsx` — this test is the
 * regression guard for that structural guarantee.
 */

vi.mock('../../admin/api/admin-verification', () => ({
  countPendingVerifications: vi.fn().mockResolvedValue(14),
}));
vi.mock('../../security/api/cases', () => ({
  countSecurityCases: vi.fn().mockResolvedValue(6),
}));
vi.mock('../../call-centre/api/support-cases', () => ({
  countMySupportCases: vi.fn().mockResolvedValue(3),
}));
vi.mock('../auth/DashboardAuthProvider', () => ({
  useDashboardAuth: () => ({ account: { email: 'staff@example.com' } }),
}));

import { countPendingVerifications } from '../../admin/api/admin-verification';
import { countSecurityCases } from '../../security/api/cases';
import { countMySupportCases } from '../../call-centre/api/support-cases';

function renderWithRouter(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe('AC-6 — no cross-role fetches from any role Home screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AdminHomePage calls only the admin count client', async () => {
    renderWithRouter(<AdminHomePage />);
    await waitFor(() => expect(countPendingVerifications).toHaveBeenCalledTimes(1));
    expect(countSecurityCases).not.toHaveBeenCalled();
    expect(countMySupportCases).not.toHaveBeenCalled();
  });

  it('SecurityHomePage calls only the security count client', async () => {
    renderWithRouter(<SecurityHomePage />);
    await waitFor(() => expect(countSecurityCases).toHaveBeenCalledTimes(1));
    expect(countPendingVerifications).not.toHaveBeenCalled();
    expect(countMySupportCases).not.toHaveBeenCalled();
  });

  it('CallCentreHomePage calls only the support-cases count client', async () => {
    renderWithRouter(<CallCentreHomePage />);
    await waitFor(() => expect(countMySupportCases).toHaveBeenCalledTimes(1));
    expect(countPendingVerifications).not.toHaveBeenCalled();
    expect(countSecurityCases).not.toHaveBeenCalled();
  });
});
