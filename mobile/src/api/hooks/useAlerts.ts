import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FEATURE_ALERTS_ENABLED } from '../../config/features';
import { listAlerts, patchAlert, type AlertListPage } from '../alerts';
import { isMissingApiRouteError } from '../errors';
import { deriveDashboardAlerts } from '../../tracking/deriveAlerts';
import type { DashboardAlert } from '../../tracking/types';

export const ALERTS_QUERY_KEY = ['alerts'] as const;

function mapMobileAlertHref(href?: string | null): string | undefined {
  if (!href) return undefined;
  if (href.startsWith('/(app)')) return href;
  if (href === '/verification-gate') return '/verification-gate';
  if (href.startsWith('/account/')) return `/(app)${href}`;
  if (href === '/assets/register') return '/(app)/assets/register';
  if (href.startsWith('/assets/')) return `/(app)${href}`;
  if (href === '/policies') return '/(app)/policy';
  if (href.startsWith('/policies/')) return href.replace('/policies/', '/policy/');
  if (href === '/recovery') return '/(app)/live-tracking';
  return href;
}

function mapServerAlert(alert: AlertListPage['data'][number]): DashboardAlert {
  return {
    id: alert.id,
    severity: alert.severity,
    category: alert.category,
    title: alert.title,
    body: alert.body,
    href: mapMobileAlertHref(alert.href),
  };
}

export function useAlertsQuery(params?: { limit?: number }) {
  return useQuery({
    queryKey: [...ALERTS_QUERY_KEY, params?.limit ?? 50],
    enabled: FEATURE_ALERTS_ENABLED,
    queryFn: () => listAlerts({ limit: params?.limit ?? 50 }),
    select: (page) => page.data.map(mapServerAlert),
  });
}

export function useDismissAlertMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => patchAlert(alertId, { dismissed: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY });
    },
  });
}

/** Server alerts with client-derived fallback when API route is unavailable. */
export function useAlertsWithFallback(fallbackAlerts: DashboardAlert[]) {
  const query = useAlertsQuery({ limit: 50 });
  const useFallback =
    query.isError && isMissingApiRouteError(query.error);
  const alerts = useFallback ? fallbackAlerts : (query.data ?? fallbackAlerts);
  return {
    alerts,
    isLoading: query.isLoading && !useFallback,
    isError: query.isError && !useFallback,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
    source: useFallback ? ('client' as const) : ('server' as const),
  };
}

export { deriveDashboardAlerts };
