/**
 * Centralized Express error-handling middleware.
 *
 * Follows the platform-wide error-envelope convention:
 * docs/organization/05-development-standards.md — "Consistent envelope for
 * errors (code, message, request ID) across all services" — and
 * docs/features/001-authentication/architecture/backend-approach.md §2.3,
 * which specifies the same `{ error: { code, message } }` shape plus a
 * request ID for traceability.
 *
 * Response shape:
 * {
 *   "error": {
 *     "code": "INTERNAL_ERROR",
 *     "message": "Human-readable message",
 *     "requestId": "..."
 *   }
 * }
 *
 * security-review.md SR-19: 4xx messages must come from the fixed catalogue
 * in lib/errors.ts, never an upstream/driver string. Enforced here by
 * trusting `err.message` ONLY when the error is an instance of `ApiError`
 * (i.e. it was explicitly constructed via `apiError()`, which can only ever
 * hold a catalogued message) — any other error, regardless of the
 * statusCode a caller may have set on it, gets the generic 500-style
 * message. This makes SR-19 structurally true rather than reliant on every
 * call site remembering not to pass an upstream message through.
 *
 * SR-18: `x-request-id` is only trusted from the client if it is UUID-
 * shaped; otherwise generated, so a client cannot forge an arbitrary string
 * into log lines (log-injection).
 */
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError, ERROR_CATALOG, apiError } from '../lib/errors.js';
import { isMongoConnectivityError } from '../lib/mongo-errors.js';

export interface LegacyApiError extends Error {
  statusCode?: number;
  code?: string;
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Attaches a request ID to every request/response for correlation in logs and error envelopes. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && UUID_SHAPE.test(incoming.trim()) ? incoming.trim() : randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  // ADR-0006 AUD-4/AUD-5: a second, always-server-generated id, never read
  // from any header and never echoed to the client. `requestId` above may be
  // caller-supplied (SR-18, unchanged), which disqualifies it from being
  // audit-correlation evidence — an insider could split one sitting across
  // unrelated ids or merge their activity into a colliding one. Audit writers
  // record only this value.
  req.auditRequestId = randomUUID();
  next();
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route matches ${req.method} ${req.originalUrl}`,
      requestId: req.requestId,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: ApiError | LegacyApiError | Error, req: Request, res: Response, _next: NextFunction): void {
  // P-12: Mongo connectivity failures → 503 UPSTREAM_UNAVAILABLE (Feature 004).
  if (isMongoConnectivityError(err)) {
    errorHandler(apiError('UPSTREAM_UNAVAILABLE', undefined, 5), req, res, _next);
    return;
  }

  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : ((err as LegacyApiError).statusCode ?? 500);
  const code = isApiError ? err.code : ((err as LegacyApiError).code ?? 'INTERNAL_ERROR');
  // SR-19: only an ApiError's message (always drawn from ERROR_CATALOG) is
  // ever returned to the client. Everything else — including a legacy
  // statusCode/code pair set directly on a plain Error, and any upstream
  // driver/vendor error — collapses to the generic message.
  const message = isApiError ? err.message : ERROR_CATALOG.INTERNAL_ERROR.message;

  // Never log full PII / sensitive payloads here — log message + stack only.
  // eslint-disable-next-line no-console
  console.error(`[error] requestId=${req.requestId} code=${code}`, err.message, err.stack);

  if (isApiError && err.retryAfterSeconds !== undefined) {
    res.setHeader('Retry-After', String(err.retryAfterSeconds));
  }

  const body: { error: Record<string, unknown> } = {
    error: {
      code,
      message,
      requestId: req.requestId,
      ...(isApiError && err.extra ? err.extra : {}),
    },
  };

  res.status(statusCode).json(body);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
      /** ADR-0006 AUD-5: server-generated only, never client-supplied, never
       * echoed in a response. The only request id an audit writer may record. */
      auditRequestId?: string;
    }
  }
}
