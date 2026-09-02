/**
 * Policy & Asset API client — Feature 004 contract paths and headers.
 */
import { useSessionStore } from '../../auth/session-store';
import { changePolicyPlan, createPolicy, listPolicies } from '../policies';
import { createAsset, listAssets } from '../assets';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('api/policies', () => {
  beforeEach(() => {
    useSessionStore.getState().setSignedIn({ accessToken: 'access-token', sessionId: 'sess-1' });
    jest.restoreAllMocks();
  });

  it('GET /policies uses the bearer token and /api/v1 prefix', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { data: [], pagination: { nextCursor: null, hasMore: false } }),
    );

    await listPolicies();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/v1/policies');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
  });

  it('POST /policies sends Idempotency-Key and planTier body', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(201, {
        id: '507f1f77bcf86cd799439011',
        planTier: 'plus',
        status: 'pending_activation',
      }),
    );

    await createPolicy({ planTier: 'plus' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/v1/policies');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ planTier: 'plus' });
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      '00000000-0000-4000-8000-000000000000',
    );
  });

  it('PATCH /policies/:policyId/plan sends planCatalogId body', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        id: '507f1f77bcf86cd799439011',
        planTier: 'plus',
        status: 'pending_activation',
      }),
    );

    await changePolicyPlan('507f1f77bcf86cd799439011', 'plan-plus-id');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/v1/policies/507f1f77bcf86cd799439011/plan');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ planCatalogId: 'plan-plus-id' });
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
  });
});

describe('api/assets', () => {
  beforeEach(() => {
    useSessionStore.getState().setSignedIn({ accessToken: 'access-token', sessionId: 'sess-1' });
    jest.restoreAllMocks();
  });

  it('GET /assets uses the bearer token', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { data: [], pagination: { nextCursor: null, hasMore: false } }),
    );

    await listAssets();

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/v1/assets');
  });

  it('POST /assets sends Idempotency-Key and never includes accountId', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(201, {
        id: '507f1f77bcf86cd799439012',
        assetType: 'laptop',
        displayName: 'Work laptop',
        status: 'active',
      }),
    );

    await createAsset({
      assetType: 'laptop',
      displayName: 'Work laptop',
      details: { brand: 'Dell', model: 'XPS', serialNumber: 'SN-1' },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('accountId');
    expect(body.assetType).toBe('laptop');
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBeDefined();
  });
});
