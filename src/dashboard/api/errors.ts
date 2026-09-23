export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    /** Extra catalogue fields some routes attach (e.g. VALIDATION_ERROR's `details`). */
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;
  /** Populated from a `Retry-After` response header when present (e.g. RATE_LIMITED). */
  readonly retryAfterSeconds?: number;

  constructor(status: number, body: ApiErrorBody, retryAfterSeconds?: number) {
    const message = body.error?.message ?? `Request failed (${status})`;
    super(message);
    this.status = status;
    this.code = body.error?.code ?? 'UNKNOWN';
    this.requestId = body.error?.requestId;
    this.details = body.error?.details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class SessionTerminatedError extends Error {
  constructor(readonly reason: 'session-invalid' | 'account-suspended') {
    super(reason);
  }
}
