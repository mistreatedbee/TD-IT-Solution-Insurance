import { useQuery } from '@tanstack/react-query';
import { listPlans } from '../plans';

export const PLANS_QUERY_KEY = ['plans'] as const;

export function usePlansQuery() {
  return useQuery({
    queryKey: PLANS_QUERY_KEY,
    queryFn: () => listPlans(),
  });
}
