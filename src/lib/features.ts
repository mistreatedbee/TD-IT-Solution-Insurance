/**
 * Build-time feature flags — `VITE_FEATURE_*` convention, mirroring
 * `VITE_API_BASE_URL` in `src/dashboard/api/config.ts` and the mobile app's
 * `EXPO_PUBLIC_FEATURE_*` flags in `mobile/src/config/features.ts`.
 *
 * Unlike the mobile convention (which defaults gated surfaces to enabled in
 * local dev and only fails closed on EAS builds), web flags here default to
 * **disabled** unless explicitly set to `"true"` — Vite env vars are set per
 * deployment target (Vercel), so there is no separate "local vs. CI build"
 * distinction to fail open for.
 *
 * INC-002 (docs/organization/incidents/INC-002-play-internal-location-reenablement.md):
 * `src/security/` (Security Company Dashboard case pages) had no feature-flag
 * gate at all, unlike the equivalent mobile surface
 * (`EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR`). This flag closes that gap.
 */
function featureEnabled(raw: string | undefined): boolean {
  return raw === 'true';
}

/**
 * INC-002: security-company operator dashboard (`src/security/`) — recovery
 * case queue and case-detail pages. Off by default pending the
 * partner-agreement workstream (matches mobile's current posture).
 *
 * Deliberately a function (evaluated per call, not cached at module-eval
 * time) so tests can flip `import.meta.env.VITE_FEATURE_SECURITY_OPERATOR`
 * between cases without needing `vi.resetModules()`.
 */
export function isSecurityOperatorEnabled(): boolean {
  return featureEnabled(import.meta.env.VITE_FEATURE_SECURITY_OPERATOR as string | undefined);
}

/**
 * "Locate now" (owner-test only, OWNER-EXCEPTION-2026-11-17 addendum 2026-11-25): the button on
 * the customer protection map that asks the account's bound phone for one fresh location. Needs
 * REMOTE_LOCATE_ENABLED=true on the backend. Off unless exactly "true". No Stage 8 review has been
 * performed - see the waiver in docs/organization/gates/stage8-manifest.json.
 */
export function isRemoteLocateEnabled(): boolean {
  return featureEnabled(import.meta.env.VITE_FEATURE_REMOTE_LOCATE as string | undefined);
}
