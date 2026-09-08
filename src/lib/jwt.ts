/**
 * Minimal, dependency-free JWT payload decoder for **client-side routing
 * hints only** — e.g. reading the `user_type` claim off an access token
 * fresh from `POST /auth/login` to decide which dashboard to send a browser
 * tab to next.
 *
 * This performs NO signature verification and must never be treated as an
 * authorization decision. The server is the sole authority on role: every
 * privileged route tree (AdminRoutes/SecurityRoutes/CallCentreRoutes) still
 * independently calls `GET /account/me` via its own `DashboardAuthProvider`
 * and gates on the server-returned `userType` before rendering anything —
 * this decode is only used to pick which of those trees to navigate into.
 */
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;

    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const json = decodeURIComponent(
      binary
        .split('')
        .map((char) => '%' + char.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );

    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
