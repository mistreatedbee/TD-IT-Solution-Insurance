/**
 * SR-19 (no upstream/driver message leakage on 4xx) and SR-18 (x-request-id
 * must be UUID-shaped or regenerated) unit tests, against fake
 * Express req/res objects — no real HTTP server required.
 */
import { describe, it, expect, vi } from 'vitest';
import { MongoNetworkError } from 'mongodb';
import { errorHandler, requestIdMiddleware } from './error-handler.js';
import { apiError } from '../lib/errors.js';
import type { Request, Response } from 'express';

function fakeRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown; headers: Record<string, string> } = {
    headers: {},
  };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as unknown as Response['status'];
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  }) as unknown as Response['json'];
  res.setHeader = vi.fn((name: string, value: string) => {
    res.headers[name] = value;
    return res as Response;
  }) as unknown as Response['setHeader'];
  return res as Response & { statusCode?: number; body?: unknown; headers: Record<string, string> };
}

describe('errorHandler (SR-19: fixed message catalogue only)', () => {
  it('returns the catalogued message for an ApiError', () => {
    const req = { requestId: 'req-1' } as unknown as Request;
    const res = fakeRes();
    const err = apiError('INVALID_CREDENTIALS');

    errorHandler(err, req, res, () => undefined);

    expect(res.statusCode).toBe(401);
    expect((res.body as { error: { code: string; message: string } }).error.code).toBe('INVALID_CREDENTIALS');
    expect((res.body as { error: { message: string } }).error.message).toBe('Incorrect email or password.');
  });

  it('NEVER returns an arbitrary upstream/driver message, even if one is attached to a plain Error with a spoofed statusCode/code', () => {
    const req = { requestId: 'req-2' } as unknown as Request;
    const res = fakeRes();

    // Simulates what a raw Postgres/Supabase driver error looks like if a
    // call site ever forgot to wrap it in apiError() — e.g. a duplicate-key
    // violation whose message contains the literal, existence-confirming
    // email address (exactly the anti-enumeration leak FR-5/AC-2 forbids).
    const upstream = Object.assign(new Error('duplicate key value violates unique constraint "accounts_email_unique": Key (email)=(victim@example.com) already exists.'), {
      statusCode: 409,
      code: 'SOME_DRIVER_CODE',
    });

    errorHandler(upstream, req, res, () => undefined);

    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.message).not.toContain('victim@example.com');
    expect(body.error.message).toBe('An internal error occurred.');
  });

  it('a 500 with no ApiError wrapper also collapses to the generic message', () => {
    const req = { requestId: 'req-3' } as unknown as Request;
    const res = fakeRes();
    errorHandler(new Error('some internal stack detail'), req, res, () => undefined);
    const body = res.body as { error: { message: string } };
    expect(body.error.message).toBe('An internal error occurred.');
  });

  it('carries the requestId through into the error envelope', () => {
    const req = { requestId: 'abc-123' } as unknown as Request;
    const res = fakeRes();
    errorHandler(apiError('NOT_FOUND'), req, res, () => undefined);
    const body = res.body as { error: { requestId: string } };
    expect(body.error.requestId).toBe('abc-123');
  });

  it('P-12: maps Mongo connectivity errors to UPSTREAM_UNAVAILABLE (503)', () => {
    const req = { requestId: 'req-mongo' } as unknown as Request;
    const res = fakeRes();
    const mongoErr = new MongoNetworkError('connection refused');

    errorHandler(mongoErr, req, res, () => undefined);

    expect(res.statusCode).toBe(503);
    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.error.message).toBe(
      'The service is temporarily unavailable. Please try again shortly.',
    );
    expect(res.headers['Retry-After']).toBe('5');
  });
});

describe('requestIdMiddleware (SR-18: reject non-UUID x-request-id; ADR-0006 AUD-4/AUD-5: a separate server-only audit id)', () => {
  function run(headerValue: string | undefined) {
    const req = {
      header: (name: string) => (name.toLowerCase() === 'x-request-id' ? headerValue : undefined),
    } as unknown as Request;
    const res = fakeRes();
    const next = vi.fn();
    requestIdMiddleware(req, res, next);
    return { req: req as Request & { requestId?: string; auditRequestId?: string }, res, next };
  }

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  it('accepts a well-formed UUID as-is', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    const { req, res } = run(uuid);
    expect(req.requestId).toBe(uuid);
    expect(res.headers['x-request-id']).toBe(uuid);
  });

  it('generates a fresh UUID when the header is absent', () => {
    const { req } = run(undefined);
    expect(req.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('rejects a log-injection attempt (non-UUID, e.g. containing a newline) and generates a fresh UUID instead', () => {
    const malicious = 'abc\n[FAKE] login_success account_id=admin-0';
    const { req } = run(malicious);
    expect(req.requestId).not.toBe(malicious);
    expect(req.requestId).toMatch(UUID);
  });

  it('AUD-4: a client-supplied x-request-id is never adopted as the audit id, even when it is a valid UUID', () => {
    // SR-18 legitimately echoes a well-formed caller-supplied request id. That
    // is exactly why it cannot be audit-correlation evidence: an insider could
    // split one sitting across unrelated ids, or merge their activity into a
    // colliding id shared with an innocent session.
    const clientChosen = '123e4567-e89b-12d3-a456-426614174000';
    const { req } = run(clientChosen);
    expect(req.requestId).toBe(clientChosen);
    expect(req.auditRequestId).not.toBe(clientChosen);
    expect(req.auditRequestId).toMatch(UUID);
  });

  it('AUD-5: the audit id is generated on every request and never echoed to the client', () => {
    const { req, res } = run(undefined);
    expect(req.auditRequestId).toMatch(UUID);
    expect(req.auditRequestId).not.toBe(req.requestId);
    expect(Object.values(res.headers)).not.toContain(req.auditRequestId);
  });

  it('AUD-5: two requests never share an audit id', () => {
    expect(run(undefined).req.auditRequestId).not.toBe(run(undefined).req.auditRequestId);
  });
});
