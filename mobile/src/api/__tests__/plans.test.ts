/**
 * Plan catalog API client — GET /plans, GET /plans/catalog, pricing helpers.
 */
import { useSessionStore } from '../../auth/session-store';
import {
  assetLimitUpgradeMessage,
  formatAssetAllowance,
  formatAssetUsage,
  formatPlanPrice,
  formatPlanTierName,
  listPlans,
  listPublicPlans,
  normalizePlanSlug,
  type PlanCatalogItem,
} from '../plans';
import { ApiError } from '../errors';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

const samplePlan: PlanCatalogItem = {
  id: '507f1f77bcf86cd799439011',
  slug: 'plus',
  name: 'Plus',
  tagline: 'Protection + Monitoring',
  maxAssets: 10,
  monthlyAmountCents: 39_900,
  currency: 'ZAR',
  isCustomPricing: false,
  isMostPopular: true,
  isActive: true,
  sortOrder: 2,
  features: ['Up to 10 registered assets', 'Enhanced GPS monitoring'],
  accountTypes: ['both'],
};

describe('api/plans', () => {
  beforeEach(() => {
    useSessionStore.getState().setSignedIn({ accessToken: 'access-token', sessionId: 'sess-1' });
    jest.restoreAllMocks();
  });

  describe('listPlans', () => {
    it('GET /plans uses the bearer token and returns catalog items', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(200, { data: [samplePlan] }),
      );

      const result = await listPlans();

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('http://localhost:3000/api/v1/plans');
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer access-token');
      expect(result.data).toEqual([samplePlan]);
    });

    it('throws ApiError when the server returns an error envelope', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(503, {
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Plans unavailable', requestId: 'r1' },
        }),
      );

      await expect(listPlans()).rejects.toBeInstanceOf(ApiError);
      await expect(listPlans()).rejects.toThrow('Plans unavailable');
    });
  });

  describe('listPublicPlans', () => {
    it('GET /plans/catalog does not attach Authorization even when signed in', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(200, { data: [samplePlan] }),
      );

      await listPublicPlans();

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('http://localhost:3000/api/v1/plans/catalog');
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
    });

    it('throws ApiError on a 404 from the public catalog endpoint', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(404, {
          error: { code: 'NOT_FOUND', message: 'Catalog not found', requestId: 'r2' },
        }),
      );

      await expect(listPublicPlans()).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    });
  });

  describe('formatPlanPrice', () => {
    it('formats fixed monthly pricing in ZAR', () => {
      expect(formatPlanPrice(samplePlan)).toBe('R399/month');
    });

    it('returns custom pricing label for business-style plans', () => {
      expect(
        formatPlanPrice({
          ...samplePlan,
          isCustomPricing: true,
          monthlyAmountCents: null,
        }),
      ).toBe('Custom pricing');
    });

    it('returns custom pricing when monthlyAmountCents is null', () => {
      expect(
        formatPlanPrice({
          ...samplePlan,
          isCustomPricing: false,
          monthlyAmountCents: null,
        }),
      ).toBe('Custom pricing');
    });
  });

  describe('plan display helpers', () => {
    it('normalizes legacy slugs to the new tier names', () => {
      expect(normalizePlanSlug('starter')).toBe('essential');
      expect(normalizePlanSlug('standard')).toBe('plus');
      expect(normalizePlanSlug('enterprise')).toBe('business');
      expect(normalizePlanSlug('pro')).toBe('pro');
    });

    it('formats tier names for display', () => {
      expect(formatPlanTierName('standard')).toBe('Plus');
      expect(formatPlanTierName('plus')).toBe('Plus');
    });

    it('formats asset allowance and usage', () => {
      expect(formatAssetAllowance(samplePlan)).toBe('Up to 10 assets');
      expect(formatAssetUsage(7, 10)).toBe('7 / 10 assets');
      expect(formatAssetUsage(3, null)).toBe('3 assets registered');
    });

    it('builds asset-limit upgrade messaging', () => {
      expect(assetLimitUpgradeMessage(samplePlan)).toContain('10 assets');
      expect(assetLimitUpgradeMessage(samplePlan)).toContain('Plus');
    });
  });
});
