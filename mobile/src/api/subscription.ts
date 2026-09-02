import { apiFetch } from './client';

export interface SubscriptionSnapshot {
  planCatalogId: string | null;
  planSlug: string;
  planName: string | null;
  positioning: string | null;
  monthlyAmountCents: number | null;
  currency: string | null;
  isCustomPricing: boolean;
  supportLevel: string;
  maxAssets: number | null;
  maxUsers: number | null;
  activeAssetCount: number;
  assetUsageLabel: string;
  entitlements: Record<string, boolean> | null;
}

export function getSubscription() {
  return apiFetch<{ data: SubscriptionSnapshot }>('/subscription', { method: 'GET' });
}
