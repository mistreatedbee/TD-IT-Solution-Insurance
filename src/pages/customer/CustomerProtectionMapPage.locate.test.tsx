/**
 * "Locate now" on the web protection map (owner-test, VITE_FEATURE_REMOTE_LOCATE).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../customer/api/errors';
import { CustomerProtectionMapPage } from './CustomerProtectionMapPage';

vi.mock('../../customer/api/assets', () => ({ listAssets: vi.fn() }));
vi.mock('../../customer/api/asset-location', () => ({ listAssetLocationSummary: vi.fn() }));
vi.mock('../../customer/api/locate-requests', () => ({ requestLocate: vi.fn(), getLatestLocateRequest: vi.fn() }));
vi.mock('../../customer/api/step-up', () => ({
  requestCustomerStepUpChallenge: vi.fn(),
  verifyCustomerStepUp: vi.fn(),
  reauthWithPassword: vi.fn(),
}));
vi.mock('../../customer/map/ProtectionMapCanvas', () => ({
  ProtectionMapCanvas: () => <div data-testid="map" />,
}));
import { listAssets } from '../../customer/api/assets';
import { listAssetLocationSummary } from '../../customer/api/asset-location';
import { getLatestLocateRequest, requestLocate, type LocateRequestStatus } from '../../customer/api/locate-requests';
import {
  reauthWithPassword,
  requestCustomerStepUpChallenge,
  verifyCustomerStepUp,
} from '../../customer/api/step-up';

const asset = { id: 'a1', displayName: 'My Android', assetType: 'smartphone' };
const summary = {
  data: [
    {
      assetId: 'a1',
      displayName: 'My Android',
      assetType: 'smartphone',
      reportingDeviceId: 'device-phone',
      lastLocation: { latitude: -26.2, longitude: 28.04, source: 'self_device', recordedAt: new Date().toISOString() },
    },
  ],
};
const req = (status: LocateRequestStatus) => ({
  requestId: 'r1',
  assetId: 'a1',
  status,
  requestedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  answeredAt: null,
  locationRecordedAt: null,
  notificationSent: true,
});

const renderPage = () => render(<MemoryRouter><CustomerProtectionMapPage /></MemoryRouter>);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('CustomerProtectionMapPage - Locate now', () => {
  it('is hidden while the flag is off', async () => {
    vi.mocked(listAssets).mockResolvedValue({ data: [asset] } as never);
    vi.mocked(listAssetLocationSummary).mockResolvedValue(summary as never);
    renderPage();
    await waitFor(() => expect(screen.getByText('My Android')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Locate now' })).toBeNull();
  });

  it('asks the phone, shows progress, then refreshes the map when answered', async () => {
    vi.stubEnv('VITE_FEATURE_REMOTE_LOCATE', 'true');
    vi.mocked(listAssets).mockResolvedValue({ data: [asset] } as never);
    vi.mocked(listAssetLocationSummary).mockResolvedValue(summary as never);
    vi.mocked(requestLocate).mockResolvedValue(req('pending'));
    vi.mocked(getLatestLocateRequest).mockResolvedValue(req('answered'));
    renderPage();
    const button = await screen.findByRole('button', { name: 'Locate now' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const loadsBefore = vi.mocked(listAssetLocationSummary).mock.calls.length;
    await act(async () => {
      fireEvent.click(button);
    });
    expect(await screen.findByText('Asking your phone…')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    await waitFor(() => expect(screen.getByText('Updated just now.')).toBeInTheDocument());
    expect(vi.mocked(listAssetLocationSummary).mock.calls.length).toBeGreaterThan(loadsBefore);
  });

  it("says when the phone didn't answer", async () => {
    vi.stubEnv('VITE_FEATURE_REMOTE_LOCATE', 'true');
    vi.mocked(listAssets).mockResolvedValue({ data: [asset] } as never);
    vi.mocked(listAssetLocationSummary).mockResolvedValue(summary as never);
    vi.mocked(requestLocate).mockResolvedValue(req('pending'));
    vi.mocked(getLatestLocateRequest).mockResolvedValue(req('expired'));
    renderPage();
    const button = await screen.findByRole('button', { name: 'Locate now' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => {
      fireEvent.click(button);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    await waitFor(() => expect(screen.getByText(/didn't answer/)).toBeInTheDocument());
  });
});

describe('CustomerProtectionMapPage - Locate now step-up', () => {
  const stepUpRequired = () =>
    new ApiError(401, { error: { code: 'STEP_UP_REQUIRED', message: 'Please re-verify your identity to continue.' } });
  const notEnrolled = () => new ApiError(409, { error: { code: 'MFA_NOT_ENROLLED', message: 'not enrolled' } });

  async function openPage() {
    vi.stubEnv('VITE_FEATURE_REMOTE_LOCATE', 'true');
    vi.mocked(listAssets).mockResolvedValue({ data: [asset] } as never);
    vi.mocked(listAssetLocationSummary).mockResolvedValue(summary as never);
    vi.mocked(getLatestLocateRequest).mockResolvedValue(req('pending'));
    renderPage();
    return screen.findByRole('button', { name: 'Locate now' });
  }

  async function click(el: HTMLElement) {
    await act(async () => {
      fireEvent.click(el);
    });
  }

  beforeEach(() => {
    vi.mocked(requestLocate).mockReset();
    vi.mocked(requestCustomerStepUpChallenge).mockReset();
    vi.mocked(verifyCustomerStepUp).mockReset();
    vi.mocked(reauthWithPassword).mockReset();
  });

  it('does not prompt when the server does not require step-up', async () => {
    vi.mocked(requestLocate).mockResolvedValue(req('pending'));
    await click(await openPage());
    expect(await screen.findByText('Asking your phone…')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requestCustomerStepUpChallenge).not.toHaveBeenCalled();
  });

  it('asks for the authenticator code, then retries the locate request once', async () => {
    vi.mocked(requestLocate).mockRejectedValueOnce(stepUpRequired()).mockResolvedValueOnce(req('pending'));
    vi.mocked(requestCustomerStepUpChallenge).mockResolvedValue({ stepUpChallengeToken: 'tok', expiresIn: 300 });
    vi.mocked(verifyCustomerStepUp).mockResolvedValue({ mfaVerifiedAt: 'x', stepUpExpiresAt: 'y' });
    await click(await openPage());
    const dialog = await screen.findByRole('dialog', { name: "Confirm it's you" });
    expect(within(dialog).getByText(/Confirm it's you to locate this device/)).toBeInTheDocument();
    const code = await within(dialog).findByLabelText(/6-digit code/);
    await act(async () => {
      fireEvent.change(code, { target: { value: '123456' } });
    });
    await waitFor(() => expect(verifyCustomerStepUp).toHaveBeenCalledWith('tok', '123456'));
    expect(await screen.findByText('Asking your phone…')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requestLocate).toHaveBeenCalledTimes(2);
    expect(vi.mocked(requestLocate).mock.calls[1]).toEqual(['a1']);
  });

  it('falls back to the password when the account has no authenticator app', async () => {
    vi.mocked(requestLocate).mockRejectedValueOnce(stepUpRequired()).mockResolvedValueOnce(req('pending'));
    vi.mocked(requestCustomerStepUpChallenge).mockRejectedValue(notEnrolled());
    vi.mocked(reauthWithPassword).mockResolvedValue({ reauthAt: 'x', reauthExpiresAt: 'y' });
    await click(await openPage());
    const dialog = await screen.findByRole('dialog', { name: "Confirm it's you" });
    fireEvent.change(await within(dialog).findByLabelText(/^Password/), { target: { value: 'my-password' } });
    await click(within(dialog).getByRole('button', { name: 'Confirm and locate' }));
    await waitFor(() => expect(reauthWithPassword).toHaveBeenCalledWith('my-password'));
    expect(await screen.findByText('Asking your phone…')).toBeInTheDocument();
    expect(requestLocate).toHaveBeenCalledTimes(2);
  });

  it('shows a wrong password and keeps the dialog open', async () => {
    vi.mocked(requestLocate).mockRejectedValueOnce(stepUpRequired());
    vi.mocked(requestCustomerStepUpChallenge).mockRejectedValue(notEnrolled());
    vi.mocked(reauthWithPassword).mockRejectedValue(
      new ApiError(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect', details: { attemptsRemaining: 4 } } }),
    );
    await click(await openPage());
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(await within(dialog).findByLabelText(/^Password/), { target: { value: 'nope' } });
    await click(within(dialog).getByRole('button', { name: 'Confirm and locate' }));
    expect(await within(dialog).findByText(/That password is not right\. \(4 attempts remaining\)/)).toBeInTheDocument();
    expect(requestLocate).toHaveBeenCalledTimes(1);
  });

  it('cancel closes the dialog without asking the phone', async () => {
    vi.mocked(requestLocate).mockRejectedValueOnce(stepUpRequired());
    vi.mocked(requestCustomerStepUpChallenge).mockResolvedValue({ stepUpChallengeToken: 'tok', expiresIn: 300 });
    await click(await openPage());
    const dialog = await screen.findByRole('dialog');
    await click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requestLocate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Locate now' })).not.toBeDisabled();
  });

  it('retries only once: a second step-up refusal shows an error, not another prompt', async () => {
    vi.mocked(requestLocate).mockRejectedValue(stepUpRequired());
    vi.mocked(requestCustomerStepUpChallenge).mockResolvedValue({ stepUpChallengeToken: 'tok', expiresIn: 300 });
    vi.mocked(verifyCustomerStepUp).mockResolvedValue({ mfaVerifiedAt: 'x', stepUpExpiresAt: 'y' });
    await click(await openPage());
    const code = await within(await screen.findByRole('dialog')).findByLabelText(/6-digit code/);
    await act(async () => {
      fireEvent.change(code, { target: { value: '123456' } });
    });
    expect(await screen.findByText('Could not ask your phone right now. Try again.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requestLocate).toHaveBeenCalledTimes(2);
  });
});
