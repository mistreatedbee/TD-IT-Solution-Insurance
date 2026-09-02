import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { listPlans } from '../plans';

export const PLANS_QUERY_KEY = ['plans'] as const;

type PlansQueryData = Awaited<ReturnType<typeof listPlans>>;

export function usePlansQuery(options?: Pick<UseQueryOptions<PlansQueryData>, 'enabled'>) {
  return useQuery<PlansQueryData>({
    queryKey: PLANS_QUERY_KEY,
    queryFn: () => listPlans(),
    enabled: options?.enabled ?? true,
  });
}
