/**
 * Shared error envelope — matches `Error` schema in
 * openapi/identity-service.yaml / api-design.md §7 verbatim:
 *   { "error": { "code": string, "message": string, "requestId": string } }
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    /** Present on 401s from /auth/login and /auth/mfa/challenge (api-design.md §5). */
    attemptsRemaining?: number | null;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly attemptsRemaining: number | null;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.requestId = body.error.requestId;
    this.attemptsRemaining = body.error.attemptsRemaining ?? null;
  }
}

/**
 * Thrown by src/api/client.ts when a request fails because the local
 * session has just been forcibly torn down (refresh failed as revoked/
 * invalid, or the account is suspended/deactivated). UI code catching this
 * should not render a generic network-error toast — the caller has
 * already been routed to (auth)/login with the appropriate message by the
 * forced-logout handler (architecture.md §2.4).
 */
export class SessionTerminatedError extends Error {
  readonly reason: 'session-invalid' | 'account-suspended';
  constructor(reason: 'session-invalid' | 'account-suspended') {
    super(
      reason === 'account-suspended'
        ? 'Account suspended or deactivated.'
        : 'Session is no longer valid.',
    );
    this.name = 'SessionTerminatedError';
    this.reason = reason;
  }
}

/** Thrown when a request could not reach the backend at all (offline, DNS, timeout). */
export class NetworkUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Could not reach the server. Check your connection and try again.');
    this.name = 'NetworkUnavailableError';
    if (cause instanceof Error) this.cause = cause;
  }
}

/** True when the backend responded 404 because the route is not deployed yet. */
export function isMissingApiRouteError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 404 &&
    err.message.includes('No route matches')
  );
}
