/**
 * Security partner recovery case API client tests.
 */
import { useSessionStore } from '../../auth/session-store';
import {
  claimSecurityCase,
  getSecurityCase,
  listSecurityCases,
  updateSecurityCaseStatus,
} from '../security-cases';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

const sampleCase = {
  id: '507f1f77bcf86cd799439011',
  assetId: '507f1f77bcf86cd799439012',
  accountId: 'acc-001',
  status: 'open',
  referenceNumber: 'RC-2026-0001',
  reportedAt: '2026-08-14T08:00:00.000Z',
  partnerOrganizationId: null,
};

describe('api/security-cases', () => {
  beforeEach(() => {
    useSessionStore.getState().setSignedIn({ accessToken: 'access-token', sessionId: 'sess-1' });
    jest.restoreAllMocks();
  });

  it('GET /security/cases uses bearer token and /api/v1 prefix', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { data: [sampleCase], pagination: { nextCursor: null, hasMore: false } }),
    );

    await listSecurityCases();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/v1/security/cases');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
  });

  it('GET /security/cases forwards cursor and status query params', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { data: [], pagination: { nextCursor: null, hasMore: false } }),
    );

    await listSecurityCases({ cursor: 'abc123', status: 'tracking' });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'http://localhost:3000/api/v1/security/cases?cursor=abc123&status=tracking',
    );
  });

  it('GET /security/cases/:id fetches a single case', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, sampleCase),
    );

    const result = await getSecurityCase(sampleCase.id);

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`http://localhost:3000/api/v1/security/cases/${sampleCase.id}`);
    expect(result.referenceNumber).toBe('RC-2026-0001');
  });

  it('POST /security/cases/:id/claim claims an unassigned case', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { ...sampleCase, partnerOrganizationId: 'org-1', status: 'investigating' }),
    );

    await claimSecurityCase(sampleCase.id);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`http://localhost:3000/api/v1/security/cases/${sampleCase.id}/claim`);
    expect(init?.method).toBe('POST');
  });

  it('PATCH /security/cases/:id updates case status', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { ...sampleCase, status: 'tracking' }),
    );

    await updateSecurityCaseStatus(sampleCase.id, 'tracking');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`http://localhost:3000/api/v1/security/cases/${sampleCase.id}`);
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ status: 'tracking' });
  });
});
