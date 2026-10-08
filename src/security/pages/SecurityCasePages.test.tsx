import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaseDetailPage } from './SecurityCasePages';
import type { SecurityRecoveryCase } from '../api/cases';

function renderCaseDetail(caseId = 'case-1') {
  return render(
    <MemoryRouter initialEntries={[`/security/cases/${caseId}`]}>
      <Routes>
        <Route path="/security/cases/:caseId" element={<CaseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const baseCase: SecurityRecoveryCase = {
  id: 'case-1',
  assetId: 'asset-1',
  status: 'open',
  referenceNumber: 'REF-001',
  reportedAt: '2026-01-01T00:00:00.000Z',
  notes: null,
  partnerOrganizationId: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PDM-1: no customer account identifier on the web case detail page', () => {
  it('never renders a "Customer account" label/value, and the type has no accountId field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => jsonResponse(baseCase)));

    renderCaseDetail();

    await waitFor(() => expect(screen.getByText('REF-001')).toBeInTheDocument());

    expect(screen.queryByText('Customer account')).not.toBeInTheDocument();

    // Type-level regression: this line fails to compile (and therefore fails
    // `tsc --noEmit`) if `accountId` is ever re-added to `SecurityRecoveryCase`.
    // @ts-expect-error accountId must not exist on SecurityRecoveryCase
    const _typeCheck: { accountId: string } = baseCase;
    void _typeCheck;
  });
});

describe('Security Dashboard offline-tolerance (CaseDetailPage setStatus/claimCase)', () => {
  it('setStatus: blocks with a definite message when known offline, without calling fetch', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(baseCase));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: false });

    renderCaseDetail();
    await waitFor(() => expect(screen.getByText('REF-001')).toBeInTheDocument());

    const callsBeforeAction = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Start investigating' }));

    expect(
      screen.getByText("You're offline. This status change has not been saved — reconnect and try again."),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBeforeAction);
  });

  it('setStatus: gives non-committal "couldn\'t confirm" messaging on an ambiguous network failure', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(baseCase))
      .mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: true });

    renderCaseDetail();
    await waitFor(() => expect(screen.getByText('REF-001')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Start investigating' }));

    await waitFor(() =>
      expect(
        screen.getByText("We couldn't confirm this status change was saved. Check your connection and try again."),
      ).toBeInTheDocument(),
    );
  });

  it('claimCase: blocks with a definite message when known offline, without calling fetch', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse(baseCase));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: false });

    renderCaseDetail();
    await waitFor(() => expect(screen.getByText('REF-001')).toBeInTheDocument());

    const callsBeforeAction = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Claim case' }));

    expect(
      screen.getByText("You're offline. This case has not been claimed — reconnect and try again."),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBeforeAction);
  });

  it('claimCase: gives non-committal messaging on an ambiguous network failure and does not auto-retry', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(baseCase))
      .mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: true });

    renderCaseDetail();
    await waitFor(() => expect(screen.getByText('REF-001')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Claim case' }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "We couldn't confirm this claim was received. Check your connection, then refresh before retrying — retrying a claim that already succeeded will show as unavailable, not as success.",
        ),
      ).toBeInTheDocument(),
    );
    // Exactly one GET (initial load) + one POST (claim attempt) — no auto-retry.
    expect(fetchMock.mock.calls.length).toBe(2);
  });

  it('claimCase: on 404, refetches and reconciles to the case\'s current (no-longer-open) state as success', async () => {
    const refreshedCase: SecurityRecoveryCase = {
      ...baseCase,
      status: 'investigating',
      partnerOrganizationId: 'org-1',
    };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(baseCase)) // initial GET
      .mockImplementationOnce(() => jsonResponse({ error: { code: 'NOT_FOUND', message: 'not found' } }, 404)) // claim POST
      .mockImplementationOnce(() => jsonResponse(refreshedCase)); // reconciling GET
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: true });

    renderCaseDetail();
    await waitFor(() => expect(screen.getByText('REF-001')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Claim case' }));

    // Reconciled silently to the refreshed, already-claimed state — no error shown.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Claim case' })).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.length).toBe(3);
  });

  it('claimCase: on 404 where the case is still open, shows the generic error (claim genuinely failed)', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(baseCase)) // initial GET
      .mockImplementationOnce(() => jsonResponse({ error: { code: 'NOT_FOUND', message: 'not found' } }, 404)) // claim POST
      .mockImplementationOnce(() => jsonResponse(baseCase)); // reconciling GET — still open
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: true });

    renderCaseDetail();
    await waitFor(() => expect(screen.getByText('REF-001')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Claim case' }));

    await waitFor(() =>
      expect(screen.getByText('This case could not be found. It may have been closed or reassigned.')).toBeInTheDocument(),
    );
  });
});
