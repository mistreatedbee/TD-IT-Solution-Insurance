/**
 * Fetch wrapper — architecture.md §2.4.
 *
 * Owns:
 *  - attaching the in-memory access token to authenticated requests
 *  - on a 401 from an authenticated request, transparently refreshing via
 *    POST /session/refresh and retrying the original request once
 *  - single-flight refresh: concurrent 401s share one in-flight refresh
 *    call instead of each independently attempting to rotate the same
 *    refresh token (which would fail every-call-but-the-first as reuse
 *    under api-design.md §3.1's rotation-chain design)
 *  - on a 423 (suspended/deactivated) or a refresh-token-invalid 401,
 *    forcing a full local logout via the registered handler
 *
 * HONEST LIMITATION, flagged rather than silently assumed (see
 * architecture.md §2.4's framing that a 401's "expired" vs "revoked"
 * causes are "distinguishable by the error code in the shared envelope"):
 * api-design.md's published contract does not enumerate a specific error
 * `code` for a plain expired/invalid *access*-token 401 on a generic
 * authenticated endpoint (it only documents the codes for
 * `/session/refresh`'s own 401). Until `backend-architect`/
 * `authentication-engineer` publish that code, this client treats ANY 401
 * from an authenticated, non-refresh request as "try a refresh" — which is
 * safe (a refresh that turns out to be unnecessary is a no-op-equivalent
 * for a still-valid session) and only escalates to a forced logout if the
 * refresh call ITSELF fails. This should be revisited once that code
 * exists, to avoid an unnecessary refresh round-trip on 401s that are
 * actually something else (e.g. a genuinely wrong-permission 401, if that
 * ever becomes distinguishable from an expired token).
 */
import { getOrCreateDeviceId } from '../auth/device';
import { getRefreshToken, setRefreshToken, clearRefreshToken } from '../auth/secure-storage';
import { sessionStore } from '../auth/session-store';
import { API_BASE_URL } from './config';
import { ApiError, NetworkUnavailableError, SessionTerminatedError, type ApiErrorBody } from './errors';
import type { components } from './generated/identity-service';

type SessionTokens = components['schemas']['SessionTokens'];

export type ForcedLogoutReason = 'session-invalid' | 'account-suspended';
type ForcedLogoutHandler = (reason: ForcedLogoutReason) => void | Promise<void>;

let forcedLogoutHandler: ForcedLogoutHandler | null = null;

/** Registered once, by app/_layout.tsx, so this module (outside React) can
 * trigger navigation-to-login + query-cache clearing on a terminal auth
 * failure without importing React Navigation/Router directly. */
export function registerForcedLogoutHandler(handler: ForcedLogoutHandler): void {
  forcedLogoutHandler = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Set false for the handful of unauthenticated endpoints (signup, login, etc). */
  authenticated?: boolean;
  /** Internal — prevents infinite retry loops. Do not set from call sites. */
  _isRetry?: boolean;
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, authenticated = true } = options;

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (authenticated) {
    const accessToken = sessionStore.getState().accessToken;
    if (accessToken) {
      finalHeaders.Authorization = `Bearer ${accessToken}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    throw new NetworkUnavailableError(cause);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const json: unknown = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new ApiError(response.status, json as ApiErrorBody);
  }

  return json as T;
}

let refreshInFlight: Promise<string> | null = null;

/**
 * Exchanges the SecureStore-held refresh token for a new access token,
 * rotating the stored refresh token per api-design.md §3.1. Single-flight:
 * concurrent callers share one in-flight request.
 *
 * Also sends the locally-generated `deviceId` (device.ts, FR-20) on every
 * call, per api-design.md v1.1.0 §11 Amendment C / architecture.md §3.2
 * (M-01) — this is the field the backend's device-consistency chokepoint
 * checks the session's stored device against, ahead of (not instead of)
 * ordinary rotation-reuse detection. A mismatch comes back as an
 * indistinguishable-from-reuse 401 (api-design.md §7's `/session/refresh`
 * contract deliberately does not let the client tell them apart), so it is
 * handled by the exact same forced-logout path below — no separate branch
 * needed here.
 *
 * Throws `SessionTerminatedError` (and performs the forced-logout side
 * effect) if the refresh token is invalid/revoked/reuse-detected/
 * device-mismatched (401) or the account is suspended/deactivated (423).
 */
export async function refreshAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      await performForcedLogout('session-invalid');
      throw new SessionTerminatedError('session-invalid');
    }

    try {
      const deviceId = await getOrCreateDeviceId();
      const tokens = await rawRequest<SessionTokens>('/session/refresh', {
        method: 'POST',
        body: { refreshToken, deviceId },
        authenticated: false,
      });

      // A successful refresh always means "signed in" — this covers both
      // the cold-start silent-refresh case (architecture.md §2.3's
      // "always refresh on launch" posture) and a mid-session 401-
      // triggered refresh, so bootstrap logic doesn't need its own
      // separate status transition.
      sessionStore.getState().setSignedIn({
        accessToken: tokens.accessToken,
        sessionId: tokens.sessionId,
      });
      await setRefreshToken(tokens.refreshToken);
      return tokens.accessToken;
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) {
        await performForcedLogout('account-suspended');
        throw new SessionTerminatedError('account-suspended');
      }
      if (err instanceof ApiError && err.status === 401) {
        await performForcedLogout('session-invalid');
        throw new SessionTerminatedError('session-invalid');
      }
      throw err;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function performForcedLogout(reason: ForcedLogoutReason): Promise<void> {
  // Only invoke the navigation side effect if the app was genuinely
  // signed in before this — avoids an unnecessary/confusing navigation
  // on cold boot when there was simply never a session to refresh
  // (status is 'hydrating' at that point, not 'signed-in'), while still
  // firing for a real mid-session forced logout.
  const wasSignedIn = sessionStore.getState().status === 'signed-in';
  await clearRefreshToken();
  sessionStore.getState().setSignedOut();
  if (wasSignedIn && forcedLogoutHandler) {
    await forcedLogoutHandler(reason);
  }
}

/**
 * The main entry point every typed API call (src/api/auth.ts) goes
 * through. Handles the refresh-on-401-and-retry-once dance for
 * authenticated requests.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { authenticated = true } = options;

  try {
    return await rawRequest<T>(path, options);
  } catch (err) {
    const shouldAttemptRefresh =
      authenticated &&
      !options._isRetry &&
      err instanceof ApiError &&
      err.status === 401 &&
      path !== '/session/refresh';

    if (!shouldAttemptRefresh) throw err;

    await refreshAccessToken(); // throws SessionTerminatedError on failure
    return rawRequest<T>(path, { ...options, _isRetry: true });
  }
}
