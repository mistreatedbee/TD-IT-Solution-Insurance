import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { listPlans } from '../plans';

export const PLANS_QUERY_KEY = ['plans'] as const;

export function usePlansQuery(options?: Pick<UseQueryOptions, 'enabled'>) {
  return useQuery({
    queryKey: PLANS_QUERY_KEY,
    queryFn: () => listPlans(),
    enabled: options?.enabled ?? true,
  });
}
