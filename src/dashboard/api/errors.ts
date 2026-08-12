export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    const message = body.error?.message ?? `Request failed (${status})`;
    super(message);
    this.status = status;
    this.code = body.error?.code ?? 'UNKNOWN';
    this.requestId = body.error?.requestId;
  }
}

export class SessionTerminatedError extends Error {
  constructor(readonly reason: 'session-invalid' | 'account-suspended') {
    super(reason);
  }
}
