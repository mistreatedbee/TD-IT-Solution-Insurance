import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DispatchApprovalPage, DispatchCaseDetailPage, DispatchQueuePage } from './AdminCaseDispatchPages';
import type { AdminDispatchCase } from '../api/admin-case-dispatch';
import { ApiError } from '../../dashboard/api/errors';

vi.mock('../../dashboard/auth/DashboardAuthProvider', () => ({
  useDashboardAuth: () => ({ account: { id: 'admin-1', email: 'admin1@example.com' } }),
}));

vi.mock('../api/admin-case-dispatch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/admin-case-dispatch')>();
  return {
    ...actual,
    listAdminDispatchCases: vi.fn(),
    getAdminDispatchCase: vi.fn(),
    dispatchCase: vi.fn(),
    reDispatchCase: vi.fn(),
    approveCaseDispatch: vi.fn(),
  };
});

vi.mock('../api/admin-partner-organizations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/admin-partner-organizations')>();
  return {
    ...actual,
    listPartnerOrganizations: vi.fn(),
  };
});

import {
  approveCaseDispatch,
  dispatchCase,
  getAdminDispatchCase,
  listAdminDispatchCases,
  reDispatchCase,
} from '../api/admin-case-dispatch';
import { listPartnerOrganizations } from '../api/admin-partner-organizations';

function dispatchCaseFixture(overrides: Partial<AdminDispatchCase> = {}): AdminDispatchCase {
  return {
    id: 'case-1',
    status: 'open',
    referenceNumber: 'REF-0091',
    reportedAt: '2026-11-01T00:00:00.000Z',
    partnerOrganizationId: null,
    dispatchStatus: 'undispatched',
    dispatchedAt: null,
    dispatchedBy: null,
    acceptedAt: null,
    firstDispatchedAt: null,
    dispatchCount: 0,
    pendingApproval: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderQueue() {
  return render(
    <MemoryRouter>
      <DispatchQueuePage />
    </MemoryRouter>,
  );
}

function renderDetail(caseId = 'case-1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/dispatch/cases/${caseId}`]}>
      <Routes>
        <Route path="/admin/dispatch/cases/:caseId" element={<DispatchCaseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderApproval(caseId = 'case-1', pendingApprovalId = 'pa-1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/dispatch/cases/${caseId}/approve/${pendingApprovalId}`]}>
      <Routes>
        <Route path="/admin/dispatch/cases/:caseId/approve/:pendingApprovalId" element={<DispatchApprovalPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DispatchQueuePage', () => {
  it('renders cases with status and dispatch badges', async () => {
    vi.mocked(listAdminDispatchCases).mockResolvedValue({
      data: [
        dispatchCaseFixture({ id: 'case-1', referenceNumber: 'REF-0091', dispatchStatus: 'undispatched' }),
        dispatchCaseFixture({
          id: 'case-2',
          referenceNumber: 'REF-0088',
          status: 'investigating',
          dispatchStatus: 'pending',
          partnerOrganizationId: 'org-1',
        }),
      ],
      pagination: { nextCursor: null, hasMore: false },
    });

    renderQueue();

    await waitFor(() => expect(screen.getByText('REF-0091')).toBeInTheDocument());
    expect(screen.getByText('REF-0088')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('undispatched')).toBeInTheDocument();
    expect(within(table).getByText('pending')).toBeInTheDocument();
  });

  it('shows the empty-queue message', async () => {
    vi.mocked(listAdminDispatchCases).mockResolvedValue({
      data: [],
      pagination: { nextCursor: null, hasMore: false },
    });

    renderQueue();

    await waitFor(() => expect(screen.getByText('No cases match these filters.')).toBeInTheDocument());
  });
});

describe('DispatchCaseDetailPage', () => {
  it('shows only the dispatch form for an undispatched case', async () => {
    vi.mocked(getAdminDispatchCase).mockResolvedValue(dispatchCaseFixture());
    vi.mocked(listPartnerOrganizations).mockResolvedValue({
      data: [
        { id: 'org-1', name: 'Acme Security', status: 'active', contactEmail: 'a@acme.co', notes: null, createdAt: '', updatedAt: '' },
      ],
    });

    renderDetail();

    await waitFor(() => expect(screen.getByText('Dispatch to a partner organization')).toBeInTheDocument());
    expect(screen.queryByText('Re-dispatch')).not.toBeInTheDocument();
  });

  it('shows the re-dispatch form and an awaiting-approval banner when a pendingApproval exists', async () => {
    vi.mocked(getAdminDispatchCase).mockResolvedValue(
      dispatchCaseFixture({
        dispatchStatus: 'accepted',
        partnerOrganizationId: 'org-1',
        firstDispatchedAt: '2026-10-30T14:02:00.000Z',
        pendingApproval: {
          id: 'pa-1',
          requestedBy: 'admin-1',
          requestedTargetOrgId: 'org-2',
          requestedAt: '2026-11-02T09:14:00.000Z',
          expiresAt: '2026-11-03T09:14:00.000Z',
        },
      }),
    );
    vi.mocked(listPartnerOrganizations).mockResolvedValue({ data: [] });

    renderDetail();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Re-dispatch' })).toBeInTheDocument());
    expect(screen.getByText(/awaiting a second admin/)).toBeInTheDocument();
  });

  it('renders the 202 pending-approval banner as a distinct success-shaped state on dispatch', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminDispatchCase).mockResolvedValue(dispatchCaseFixture());
    vi.mocked(listPartnerOrganizations).mockResolvedValue({
      data: [
        { id: 'org-1', name: 'Acme Security', status: 'active', contactEmail: 'a@acme.co', notes: null, createdAt: '', updatedAt: '' },
      ],
    });
    vi.mocked(dispatchCase).mockResolvedValue({ kind: 'pending_approval', pendingApprovalId: 'pa-9' });

    renderDetail();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Acme Security' })).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Dispatch to organization'), 'org-1');
    await user.click(screen.getByRole('button', { name: 'Dispatch' }));

    await waitFor(() => expect(screen.getByText(/awaiting a second admin/)).toBeInTheDocument());
    expect(screen.getByText('Review and approve')).toBeInTheDocument();
  });
});

describe('DispatchApprovalPage', () => {
  it('pre-emptively blocks the same admin who requested the re-dispatch', async () => {
    vi.mocked(getAdminDispatchCase).mockResolvedValue(
      dispatchCaseFixture({
        dispatchStatus: 'accepted',
        partnerOrganizationId: 'org-1',
        pendingApproval: {
          id: 'pa-1',
          requestedBy: 'admin-1', // matches the mocked current admin account id
          requestedTargetOrgId: 'org-2',
          requestedAt: '2026-11-02T09:14:00.000Z',
          expiresAt: '2026-11-03T09:14:00.000Z',
        },
      }),
    );
    vi.mocked(listPartnerOrganizations).mockResolvedValue({
      data: [{ id: 'org-2', name: 'Beta Secure', status: 'active', contactEmail: 'b@beta.co', notes: null, createdAt: '', updatedAt: '' }],
    });

    renderApproval();

    await waitFor(() =>
      expect(
        screen.getByText('You requested this re-dispatch yourself — a different admin must approve it.'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });

  it('shows "no longer pending" when the case has no matching pendingApproval', async () => {
    vi.mocked(getAdminDispatchCase).mockResolvedValue(dispatchCaseFixture({ pendingApproval: null }));
    vi.mocked(listPartnerOrganizations).mockResolvedValue({ data: [] });

    renderApproval();

    await waitFor(() =>
      expect(screen.getByText(/This approval request is no longer pending/)).toBeInTheDocument(),
    );
  });

  it('renders a distinct snapshot-mismatch message on a 409 from the approve submission', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminDispatchCase).mockResolvedValue(
      dispatchCaseFixture({
        dispatchStatus: 'accepted',
        partnerOrganizationId: 'org-1',
        pendingApproval: {
          id: 'pa-1',
          requestedBy: 'admin-2', // different admin, so Approve is not pre-blocked
          requestedTargetOrgId: 'org-2',
          requestedAt: '2026-11-02T09:14:00.000Z',
          expiresAt: '2026-11-03T09:14:00.000Z',
        },
      }),
    );
    vi.mocked(listPartnerOrganizations).mockResolvedValue({
      data: [{ id: 'org-2', name: 'Beta Secure', status: 'active', contactEmail: 'b@beta.co', notes: null, createdAt: '', updatedAt: '' }],
    });
    vi.mocked(approveCaseDispatch).mockRejectedValue(
      new ApiError(409, { error: { code: 'PENDING_APPROVAL_INVALID', message: 'stale' } }),
    );

    renderApproval();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(
        screen.getByText('This case changed since the dispatch was requested — refresh and start the dispatch again.'),
      ).toBeInTheDocument(),
    );
  });
});

// Keep reDispatchCase imported so eslint/no-unused doesn't flag the mock
// wiring if a future edit removes a direct usage above.
void reDispatchCase;
