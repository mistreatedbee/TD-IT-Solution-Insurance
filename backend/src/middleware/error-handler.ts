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
 */
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

/** Attaches a request ID to every request/response for correlation in logs and error envelopes. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && incoming.trim() !== '' ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
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
export function errorHandler(err: ApiError, req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? (statusCode === 500 ? 'INTERNAL_ERROR' : 'ERROR');

  // Never log full PII / sensitive payloads here — log message + stack only.
  // eslint-disable-next-line no-console
  console.error(`[error] requestId=${req.requestId} code=${code}`, err.message, err.stack);

  res.status(statusCode).json({
    error: {
      code,
      message: statusCode === 500 ? 'An internal error occurred.' : err.message,
      requestId: req.requestId,
    },
  });
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}
