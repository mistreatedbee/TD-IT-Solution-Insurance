/**
 * Claims API client — Feature 018 backend contract paths and headers.
 */
import { useSessionStore } from '../../auth/session-store';
import { createClaim, getClaim, listClaims, respondToClaim, withdrawClaim } from '../claims';
import { ApiError } from '../errors';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('api/claims', () => {
  beforeEach(() => {
    useSessionStore.getState().setSignedIn({ accessToken: 'access-token', sessionId: 'sess-1' });
    jest.restoreAllMocks();
  });

  it('GET /claims uses the bearer token and /api/v1 prefix', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { data: [], pagination: { nextCursor: null, hasMore: false } }),
    );

    await listClaims();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/v1/claims');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
  });

  it('POST /claims sends Idempotency-Key and full body', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(201, {
        id: '507f1f77bcf86cd799439011',
        status: 'submitted',
      }),
    );

    await createClaim({
      policyId: '507f1f77bcf86cd799439012',
      assetId: '507f1f77bcf86cd799439013',
      incidentDescription: 'My laptop was stolen from my car overnight in the driveway.',
      incidentDate: '2026-10-01',
      claimedAmount: 1000,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/v1/claims');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      '00000000-0000-4000-8000-000000000000',
    );
    expect(JSON.parse(init?.body as string)).toEqual({
      policyId: '507f1f77bcf86cd799439012',
      assetId: '507f1f77bcf86cd799439013',
      incidentDescription: 'My laptop was stolen from my car overnight in the driveway.',
      incidentDate: '2026-10-01',
      claimedAmount: 1000,
    });
  });

  it('GET /claims/:claimId builds the detail path', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { id: '507f1f77bcf86cd799439011', status: 'submitted' }),
    );

    await getClaim('507f1f77bcf86cd799439011');

    expect(fetchMock.mock.calls[0]![0]).toBe(
      'http://localhost:3000/api/v1/claims/507f1f77bcf86cd799439011',
    );
  });

  it('PATCH /claims/:claimId/respond sends the response text', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { id: '507f1f77bcf86cd799439011', status: 'under_review' }),
    );

    await respondToClaim('507f1f77bcf86cd799439011', { text: 'Here is more detail.' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/v1/claims/507f1f77bcf86cd799439011/respond');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ text: 'Here is more detail.' });
  });

  it('PATCH /claims/:claimId/withdraw sends no body', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { id: '507f1f77bcf86cd799439011', status: 'closed' }),
    );

    await withdrawClaim('507f1f77bcf86cd799439011');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/v1/claims/507f1f77bcf86cd799439011/withdraw');
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBeUndefined();
  });

  it('surfaces DUPLICATE_OPEN_CLAIM 409 with the existing claimId', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(409, {
        error: {
          code: 'DUPLICATE_OPEN_CLAIM',
          message: 'An open claim already exists for this asset.',
          requestId: 'req-1',
          claimId: '507f1f77bcf86cd799439099',
        },
      }),
    );

    await expect(
      createClaim({
        policyId: '507f1f77bcf86cd799439012',
        assetId: '507f1f77bcf86cd799439013',
        incidentDescription: 'My laptop was stolen from my car overnight in the driveway.',
        incidentDate: '2026-10-01',
        claimedAmount: 1000,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_OPEN_CLAIM', claimId: '507f1f77bcf86cd799439099' });
  });

  it('surfaces WAITING_PERIOD_NOT_MET 422 with waitingPeriodClearsAt', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(422, {
        error: {
          code: 'WAITING_PERIOD_NOT_MET',
          message: 'Waiting period not met.',
          requestId: 'req-2',
          waitingPeriodClearsAt: '2026-11-01T00:00:00.000Z',
        },
      }),
    );

    try {
      await createClaim({
        policyId: '507f1f77bcf86cd799439012',
        assetId: '507f1f77bcf86cd799439013',
        incidentDescription: 'My laptop was stolen from my car overnight in the driveway.',
        incidentDate: '2026-10-01',
        claimedAmount: 1000,
      });
      throw new Error('expected rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).waitingPeriodClearsAt).toBe('2026-11-01T00:00:00.000Z');
    }
  });
});
