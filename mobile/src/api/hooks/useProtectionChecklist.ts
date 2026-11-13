import { useQuery } from '@tanstack/react-query';
import { FEATURE_PROTECTION_CHECKLIST_ENABLED } from '../../config/features';
import { getProtectionChecklist } from '../protectionChecklist';

export const PROTECTION_CHECKLIST_QUERY_KEY = ['protection-checklist'] as const;

/** In-memory only (excluded in `persistPolicy`); ~60 s stale, refetch on focus. */
export function useProtectionChecklistQuery() {
  return useQuery({
    queryKey: PROTECTION_CHECKLIST_QUERY_KEY,
    enabled: FEATURE_PROTECTION_CHECKLIST_ENABLED,
    queryFn: getProtectionChecklist,
    staleTime: 60_000,
    retry: false,
  });
}
