import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PartnerOrganizationScorecardPage, PartnerOrganizationsListPage } from './PartnerOrganizationPages';
import { ApiError } from '../../dashboard/api/errors';
import type {
  AdminPartnerOrganization,
  AdminPartnerOrganizationScorecard,
} from '../api/admin-partner-organizations';

vi.mock('../api/admin-partner-organizations', () => ({
  listPartnerOrganizations: vi.fn(),
  getPartnerOrganizationScorecard: vi.fn(),
}));

import { getPartnerOrganizationScorecard, listPartnerOrganizations } from '../api/admin-partner-organizations';

function org(overrides: Partial<AdminPartnerOrganization> = {}): AdminPartnerOrganization {
  return {
    id: 'org-1',
    name: 'Acme Recovery',
    status: 'active',
    contactEmail: 'ops@acme.example',
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function scorecard(
  overrides: Partial<AdminPartnerOrganizationScorecard> = {},
): AdminPartnerOrganizationScorecard {
  return {
    partnerOrganizationId: 'org-1',
    partnerOrganizationName: 'Acme Recovery',
    range: { from: null, to: null },
    totalCasesClaimed: 10,
    activeCases: 3,
    recoveredCount: 5,
    closedOtherCount: 2,
    recoveryRatePercent: (5 / 7) * 100,
    averageTimeToTerminalStatusHours: 48.5,
    releasedCount: 4,
    reassignedAwayCount: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PartnerOrganizationsListPage', () => {
  it('renders partner orgs with a link into the scorecard', async () => {
    vi.mocked(listPartnerOrganizations).mockResolvedValue({ data: [org()] });

    render(
      <MemoryRouter>
        <PartnerOrganizationsListPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Acme Recovery')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /scorecard|Acme Recovery/ });
    expect(links.some((link) => link.getAttribute('href') === '/admin/partner-organizations/org-1/scorecard')).toBe(
      true,
    );
  });

  it('renders an empty state when there are no partner organizations', async () => {
    vi.mocked(listPartnerOrganizations).mockResolvedValue({ data: [] });

    render(
      <MemoryRouter>
        <PartnerOrganizationsListPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/No partner organizations yet/)).toBeInTheDocument();
  });

  it('surfaces a mapped error when the list request fails', async () => {
    vi.mocked(listPartnerOrganizations).mockRejectedValue(new ApiError(500, { error: { code: 'SERVER_ERROR', message: 'boom' } }));

    render(
      <MemoryRouter>
        <PartnerOrganizationsListPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('PartnerOrganizationScorecardPage', () => {
  it('loads the full-range scorecard by default and renders metric tiles', async () => {
    vi.mocked(getPartnerOrganizationScorecard).mockResolvedValue(scorecard());

    render(
      <MemoryRouter>
        <PartnerOrganizationScorecardPage partnerOrganizationId="org-1" />
      </MemoryRouter>,
    );

    await waitFor(() => expect(getPartnerOrganizationScorecard).toHaveBeenCalledWith('org-1', {}));
    expect(await screen.findByText(/Acme Recovery — recovery scorecard/)).toBeInTheDocument();
    expect(screen.getByText('Total cases claimed')).toBeInTheDocument();
    expect(screen.getByText('Recovered')).toBeInTheDocument();
    expect(screen.getByText('Cases released')).toBeInTheDocument();
    expect(screen.getByText('Cases reassigned away')).toBeInTheDocument();
  });

  it('renders a dash for null recovery-rate / avg-time-to-terminal metrics instead of zero', async () => {
    vi.mocked(getPartnerOrganizationScorecard).mockResolvedValue(
      scorecard({ recoveryRatePercent: null, averageTimeToTerminalStatusHours: null }),
    );

    render(
      <MemoryRouter>
        <PartnerOrganizationScorecardPage partnerOrganizationId="org-1" />
      </MemoryRouter>,
    );

    await screen.findByText('Recovery rate');
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('applies a from/to date-range filter', async () => {
    vi.mocked(getPartnerOrganizationScorecard).mockResolvedValue(scorecard());
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <PartnerOrganizationScorecardPage partnerOrganizationId="org-1" />
      </MemoryRouter>,
    );

    await waitFor(() => expect(getPartnerOrganizationScorecard).toHaveBeenCalledWith('org-1', {}));

    await user.type(screen.getByLabelText('From'), '2026-01-01');
    await user.type(screen.getByLabelText('To'), '2026-10-28');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(getPartnerOrganizationScorecard).toHaveBeenCalledWith('org-1', {
        from: '2026-01-01',
        to: '2026-10-28',
      }),
    );
  });

  it('surfaces a mapped error when the scorecard request fails', async () => {
    vi.mocked(getPartnerOrganizationScorecard).mockRejectedValue(new ApiError(500, { error: { code: 'SERVER_ERROR', message: 'boom' } }));

    render(
      <MemoryRouter>
        <PartnerOrganizationScorecardPage partnerOrganizationId="org-1" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
