/**
 * Single source of truth mapping a non-customer account's `userType`
 * (the `user_type` claim on every access token `POST /auth/login` mints,
 * and the `userType` field `GET /account/me` returns) to:
 *
 *   - the sessionStorage key that account type's dedicated
 *     `DashboardAuthProvider` instance reads/writes refresh tokens under
 *     (AdminRoutes, SecurityRoutes, CallCentreRoutes each import this
 *     rather than re-hardcoding the same string), and
 *   - the base path of that dashboard's route tree.
 *
 * `src/pages/CustomerLoginPage.tsx` is the other consumer: after a generic
 * `POST /auth/login` succeeds for ANY role, it decodes the resulting
 * access token's `user_type` claim and, for a privileged type, seeds that
 * role's sessionStorage slot with the refresh token and navigates to its
 * `homePath` — the target `DashboardAuthProvider` then hydrates from that
 * slot exactly as it would for a returning session, independently
 * re-verifying the role server-side via `GET /account/me` before it ever
 * renders privileged UI.
 *
 * Customer accounts are deliberately excluded from this map — they use
 * `CustomerAuthProvider`'s own localStorage-backed session, not this
 * sessionStorage-per-privileged-role scheme.
 */
export type PrivilegedUserType = 'admin' | 'security_company_operator' | 'support_agent';

export const PRIVILEGED_DASHBOARD_CONFIG: Record<
  PrivilegedUserType,
  { storageKey: string; homePath: string }
> = {
  admin: { storageKey: 'td-admin-refresh-token', homePath: '/admin' },
  security_company_operator: { storageKey: 'td-security-refresh-token', homePath: '/security' },
  support_agent: { storageKey: 'td-call-centre-refresh-token', homePath: '/call-centre' },
};

export function isPrivilegedUserType(value: string): value is PrivilegedUserType {
  return Object.prototype.hasOwnProperty.call(PRIVILEGED_DASHBOARD_CONFIG, value);
}
