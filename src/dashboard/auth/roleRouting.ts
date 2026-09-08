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
import { API_BASE_URL } from '../api/config';
import { CUSTOMER_REFRESH_STORAGE_KEY } from '../../customer/auth/sessionStorageKey';

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

// ---------------------------------------------------------------------------
// SR-LU-4 (docs/features/001-authentication/security-review-login-unification.md)
// / standing constraint C-LU-2: "Establishing a session for role X must first
// terminate any session for role Y held by the same browser — locally *and*
// server-side." This is the single shared implementation of that rule, used
// by every place a new role's session gets established:
//   - `DashboardAuthProvider.signInWithTokens` (PrivilegedLoginPage's own
//     login/MFA flow, for all three privileged roles)
//   - `CustomerAuthProvider.signInWithTokens` (the unified `/login` page's
//     customer branch, and `/dashboard`-side login)
//   - `CustomerLoginPage.routeTokensByRole`'s privileged branch, which seeds
//     a privileged `sessionStorage` slot directly and therefore does not run
//     through `DashboardAuthProvider.signInWithTokens` at all.
// ---------------------------------------------------------------------------

interface RoleSessionSlot {
  key: string;
  area: 'localStorage' | 'sessionStorage';
}

function allRoleSessionSlots(): RoleSessionSlot[] {
  return [
    { key: CUSTOMER_REFRESH_STORAGE_KEY, area: 'localStorage' },
    ...Object.values(PRIVILEGED_DASHBOARD_CONFIG).map((c) => ({
      key: c.storageKey,
      area: 'sessionStorage' as const,
    })),
  ];
}

function readSlot(slot: RoleSessionSlot): string | null {
  try {
    const store = slot.area === 'localStorage' ? localStorage : sessionStorage;
    return store.getItem(slot.key);
  } catch {
    return null;
  }
}

function clearSlot(slot: RoleSessionSlot): void {
  try {
    const store = slot.area === 'localStorage' ? localStorage : sessionStorage;
    store.removeItem(slot.key);
  } catch {
    // R-LU-5-adjacent: storage disabled entirely — nothing to clear either.
  }
}

/**
 * Best-effort server-side revocation of a stale refresh token this browser
 * is about to drop locally. `POST /session/logout` (backend/src/routes/
 * session.ts:33) only accepts a Bearer *access* token — it reads
 * `req.auth.sessionId`, not the request body — so a bare refresh token from
 * a role this tab is no longer configured for has to be exchanged first via
 * `POST /session/refresh` (session.ts:79, unauthenticated, takes exactly a
 * refresh token) to obtain a short-lived access token, which is then used
 * once to call `/session/logout`. Both endpoints already exist; this does
 * not add a new one. Deliberately fire-and-forget from the caller's
 * perspective — failure here must never block establishing the new session.
 */
async function revokeStaleRefreshToken(refreshToken: string): Promise<void> {
  try {
    const refreshRes = await fetch(`${API_BASE_URL}/session/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, deviceId: null }),
    });
    if (!refreshRes.ok) return;
    const tokens = (await refreshRes.json()) as { accessToken?: string };
    if (!tokens.accessToken) return;
    await fetch(`${API_BASE_URL}/session/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    });
  } catch {
    // Best effort. The previous session's refresh token has already been
    // removed from local storage by the caller regardless of this outcome —
    // it will simply expire on its own (idle/absolute TTL) if this network
    // call fails. That is a materially better outcome than blocking the new
    // login on it, and matches the explicit requirement in SR-LU-4.
  }
}

/**
 * Clears every role's local session slot EXCEPT `exceptStorageKey` (pass the
 * slot the caller is about to write, or `null` if none should be preserved),
 * and fires best-effort server-side revocation for each cleared slot that
 * held a token. Synchronous local clear, fire-and-forget remote revocation —
 * call this before writing the new session's own token.
 */
export function clearOtherRoleSessions(exceptStorageKey: string | null): void {
  for (const slot of allRoleSessionSlots()) {
    if (slot.key === exceptStorageKey) continue;
    const token = readSlot(slot);
    clearSlot(slot);
    if (token) {
      void revokeStaleRefreshToken(token);
    }
  }
}
