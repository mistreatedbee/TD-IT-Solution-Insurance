import type { Href } from 'expo-router';
import type { ChecklistAction } from '../../api/protectionChecklist';
import { FEATURE_KYC_ENABLED } from '../../config/features';

/** Closed enum from the server mapped to client routes (never URLs). */
const ROUTES: Record<ChecklistAction, string> = {
  open_security_settings: '/(app)/mfa-enroll',
  open_profile: '/account/profile',
  open_plans: '/(app)/policy',
  add_asset: '/assets/register',
  open_verification: '/account/verification',
};

export function checklistActionHref(action: ChecklistAction): Href {
  return ROUTES[action] as Href;
}

/** Hide a CTA when its target surface is flag-gated off (architecture.md §3). */
export function isChecklistActionAvailable(action: ChecklistAction): boolean {
  if (action === 'open_verification' || action === 'open_profile') return FEATURE_KYC_ENABLED;
  return action in ROUTES;
}
