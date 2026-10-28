/**
 * Business-owner gap report items 2–4 — cancel policy / archive asset /
 * legal-hold toggles. Covers the step-up-required happy path (same pattern
 * as `AdminDataPages.test.tsx`'s account-state coverage) plus the
 * terminal-state guard (no Cancel/Archive action once already
 * cancelled/expired/removed).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetDetailPage, PolicyDetailPage } from './AdminDataPages';
import { ApiError } from '../../dashboard/api/errors';
import type { AdminAssetDetail, AdminPolicyDetail } from '../api/admin-data';

vi.mock('../api/admin-data', () => ({
  getAdminPolicy: vi.fn(),
  getAdminAsset: vi.fn(),
  cancelAdminPolicy: vi.fn(),
  setAdminPolicyLegalHold: vi.fn(),
  archiveAdminAsset: vi.fn(),
  setAdminAssetLegalHold: vi.fn(),
  listAdminPlans: vi.fn().mockResolvedValue({ data: [] }),
  listAdminAssets: vi.fn().mockResolvedValue({ data: [], pagination: { nextCursor: null, hasMore: false } }),
}));
vi.mock('../api/admin-plans', () => ({
  listAdminPlans: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock('../api/step-up', () => ({
  requestStepUpChallenge: vi.fn(),
  verifyStepUp: vi.fn(),
}));

import {
  archiveAdminAsset,
  cancelAdminPolicy,
  getAdminAsset,
  getAdminPolicy,
  setAdminAssetLegalHold,
  setAdminPolicyLegalHold,
} from '../api/admin-data';
import { requestStepUpChallenge, verifyStepUp } from '../api/step-up';

function byName(name: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!el) throw new Error(`no input[name="${name}"] found`);
  return el;
}

function policy(overrides: Partial<AdminPolicyDetail> = {}): AdminPolicyDetail {
  return {
    id: 'pol-1',
    accountId: 'acct-1',
    planTier: 'standard',
    planCatalogId: null,
    status: 'active',
    legalHold: false,
    billingStatus: 'current',
    effectiveDate: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    coverageLimits: [],
    billing: {},
    renewalDate: null,
    cancelledAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function asset(overrides: Partial<AdminAssetDetail> = {}): AdminAssetDetail {
  return {
    id: 'asset-1',
    accountId: 'acct-1',
    assetType: 'laptop',
    displayName: 'Work laptop',
    status: 'active',
    legalHold: false,
    gpsDeviceId: null,
    registeredAt: '2026-01-01T00:00:00.000Z',
    estimatedValue: null,
    photos: [],
    details: {},
    gpsPairedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function stepUpRequiredError() {
  return new ApiError(401, { error: { code: 'STEP_UP_REQUIRED', message: 'step-up required' } });
}

describe('PolicyDetailPage actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('cancels an active policy via the step-up flow', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminPolicy).mockResolvedValue(policy());
    vi.mocked(cancelAdminPolicy)
      .mockRejectedValueOnce(stepUpRequiredError())
      .mockResolvedValueOnce(policy({ status: 'cancelled' }));
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-1', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockResolvedValueOnce({
      mfaVerifiedAt: '2026-10-02T00:00:00.000Z',
      stepUpExpiresAt: '2026-10-02T00:15:00.000Z',
    });

    render(
      <MemoryRouter>
        <PolicyDetailPage policyId="pol-1" />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Cancel policy' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(screen.getByText('Policy cancelled.')).toBeInTheDocument());
    expect(cancelAdminPolicy).toHaveBeenCalledTimes(2);
    expect(cancelAdminPolicy).toHaveBeenCalledWith('pol-1', { status: 'cancelled' });
  });

  it('hides the Cancel policy action once the policy is already cancelled', async () => {
    vi.mocked(getAdminPolicy).mockResolvedValue(policy({ status: 'cancelled' }));

    render(
      <MemoryRouter>
        <PolicyDetailPage policyId="pol-1" />
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Place legal hold' });
    expect(screen.queryByRole('button', { name: 'Cancel policy' })).not.toBeInTheDocument();
  });

  it('toggles legal hold on a policy via the step-up flow', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminPolicy).mockResolvedValue(policy({ legalHold: false }));
    vi.mocked(setAdminPolicyLegalHold)
      .mockRejectedValueOnce(stepUpRequiredError())
      .mockResolvedValueOnce(policy({ legalHold: true }));
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-2', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockResolvedValueOnce({
      mfaVerifiedAt: '2026-10-02T00:00:00.000Z',
      stepUpExpiresAt: '2026-10-02T00:15:00.000Z',
    });

    render(
      <MemoryRouter>
        <PolicyDetailPage policyId="pol-1" />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Place legal hold' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(screen.getByText('Legal hold placed on this policy.')).toBeInTheDocument());
    expect(setAdminPolicyLegalHold).toHaveBeenCalledWith('pol-1', { legalHold: true });
    await screen.findByRole('button', { name: 'Remove legal hold' });
  });
});

describe('AssetDetailPage actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('archives an active asset via the step-up flow', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminAsset).mockResolvedValue(asset());
    vi.mocked(archiveAdminAsset)
      .mockRejectedValueOnce(stepUpRequiredError())
      .mockResolvedValueOnce(asset({ status: 'removed' }));
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-3', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockResolvedValueOnce({
      mfaVerifiedAt: '2026-10-02T00:00:00.000Z',
      stepUpExpiresAt: '2026-10-02T00:15:00.000Z',
    });

    render(
      <MemoryRouter>
        <AssetDetailPage assetId="asset-1" />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Archive asset' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(screen.getByText('Asset archived.')).toBeInTheDocument());
    expect(archiveAdminAsset).toHaveBeenCalledWith('asset-1', { status: 'removed' });
  });

  it('hides the Archive asset action once the asset is already removed', async () => {
    vi.mocked(getAdminAsset).mockResolvedValue(asset({ status: 'removed' }));

    render(
      <MemoryRouter>
        <AssetDetailPage assetId="asset-1" />
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Place legal hold' });
    expect(screen.queryByRole('button', { name: 'Archive asset' })).not.toBeInTheDocument();
  });

  it('toggles legal hold on an asset via the step-up flow', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminAsset).mockResolvedValue(asset({ legalHold: true }));
    vi.mocked(setAdminAssetLegalHold)
      .mockRejectedValueOnce(stepUpRequiredError())
      .mockResolvedValueOnce(asset({ legalHold: false }));
    vi.mocked(requestStepUpChallenge).mockResolvedValueOnce({ stepUpChallengeToken: 'chal-4', expiresIn: 60 });
    vi.mocked(verifyStepUp).mockResolvedValueOnce({
      mfaVerifiedAt: '2026-10-02T00:00:00.000Z',
      stepUpExpiresAt: '2026-10-02T00:15:00.000Z',
    });

    render(
      <MemoryRouter>
        <AssetDetailPage assetId="asset-1" />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Remove legal hold' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Verify your identity' })).toBeInTheDocument());
    await user.type(byName('code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and continue' }));

    await waitFor(() => expect(screen.getByText('Legal hold removed from this asset.')).toBeInTheDocument());
    expect(setAdminAssetLegalHold).toHaveBeenCalledWith('asset-1', { legalHold: false });
  });
});
