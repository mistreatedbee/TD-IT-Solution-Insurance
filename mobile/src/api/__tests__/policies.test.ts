/**
 * Policy API client — PATCH /policies/:policyId/plan and error envelope handling.
 */
import { useSessionStore } from '../../auth/session-store';
import { changePolicyPlan } from '../policies';
import { ApiError } from '../errors';

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

  describe('changePolicyPlan', () => {
    it('PATCH /policies/:policyId/plan sends planCatalogId and returns updated policy', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(200, {
          id: '507f1f77bcf86cd799439011',
          planTier: 'plus',
          planCatalogId: '507f1f77bcf86cd799439089',
          status: 'active',
        }),
      );

      const result = await changePolicyPlan('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439089');

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('http://localhost:3000/api/v1/policies/507f1f77bcf86cd799439011/plan');
      expect(init?.method).toBe('PATCH');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
      expect(JSON.parse(String(init?.body))).toEqual({ planCatalogId: '507f1f77bcf86cd799439089' });
      expect(result.planTier).toBe('plus');
      expect(result.planCatalogId).toBe('507f1f77bcf86cd799439089');
    });

    it('throws ApiError with PLAN_DOWNGRADE_NOT_ALLOWED on blocked downgrade', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(409, {
          error: {
            code: 'PLAN_DOWNGRADE_NOT_ALLOWED',
            message:
              'This plan change is not allowed while you have more registered assets than the new plan allows.',
            requestId: 'r1',
          },
        }),
      );

      await expect(
        changePolicyPlan('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439089'),
      ).rejects.toMatchObject({
        status: 409,
        code: 'PLAN_DOWNGRADE_NOT_ALLOWED',
      });
      await expect(
        changePolicyPlan('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439089'),
      ).rejects.toBeInstanceOf(ApiError);
    });

    it('throws ApiError with PLAN_REQUIRES_QUOTE for business plan', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(422, {
          error: {
            code: 'PLAN_REQUIRES_QUOTE',
            message: 'This plan requires a custom quote. Please contact us to continue.',
            requestId: 'r2',
          },
        }),
      );

      await expect(
        changePolicyPlan('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439087'),
      ).rejects.toMatchObject({
        status: 422,
        code: 'PLAN_REQUIRES_QUOTE',
      });
    });
  });
});
