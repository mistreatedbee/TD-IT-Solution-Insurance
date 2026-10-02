/**
 * Unit tests for `requireStepUp` in isolation — ADR-0012 §8.3 scope-note R-5.
 *
 * R-5 flagged that no `backend/src/lib/step-up.test.ts` unit-tested
 * `requireStepUp` directly; coverage existed only at the route level
 * (`routes/step-up.test.ts`, and now `routes/admin-accounts.test.ts` /
 * `admin-verification.test.ts` / `admin-plans.test.ts` for SU-FU-1). This
 * file closes that gap with direct calls against a fake `AppContext`,
 * exercising the middleware's own decision logic — not an HTTP round trip —
 * for the fresh / stale / null / revoked / missing-`req.auth` cases.
 */
import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { requireStepUp } from './step-up.js';
import type { AppContext } from '../context.js';

type SessionLookupResult = { revokedAt: Date | null; mfaVerifiedAt: Date | null } | null;

function fakeCtx(session: SessionLookupResult): AppContext {
  return {
    sessions: {
      async findById(_id: string) {
        return session;
      },
    },
  } as unknown as AppContext;
}

function fakeReq(auth: { sessionId: string } | undefined): Request {
  return { auth } as unknown as Request;
}

const WINDOW_SECONDS = 15 * 60;

describe('lib/step-up requireStepUp (unit, no HTTP)', () => {
  it('missing req.auth -> UNAUTHORIZED, never touches the session store', async () => {
    const findById = vi.fn();
    const ctx = { sessions: { findById } } as unknown as AppContext;
    const middleware = requireStepUp(ctx, WINDOW_SECONDS);
    const next = vi.fn();

    await middleware(fakeReq(undefined), {} as Response, next);

    expect(findById).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0] as { code?: string };
    expect(err?.code).toBe('UNAUTHORIZED');
  });

  it('session not found -> STEP_UP_REQUIRED', async () => {
    const ctx = fakeCtx(null);
    const middleware = requireStepUp(ctx, WINDOW_SECONDS);
    const next = vi.fn();

    await middleware(fakeReq({ sessionId: randomUUID() }), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0] as { code?: string };
    expect(err?.code).toBe('STEP_UP_REQUIRED');
  });

  it('revoked session -> STEP_UP_REQUIRED even if mfaVerifiedAt is fresh', async () => {
    const ctx = fakeCtx({ revokedAt: new Date(), mfaVerifiedAt: new Date() });
    const middleware = requireStepUp(ctx, WINDOW_SECONDS);
    const next = vi.fn();

    await middleware(fakeReq({ sessionId: randomUUID() }), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0] as { code?: string };
    expect(err?.code).toBe('STEP_UP_REQUIRED');
  });

  it('null mfaVerifiedAt -> STEP_UP_REQUIRED', async () => {
    const ctx = fakeCtx({ revokedAt: null, mfaVerifiedAt: null });
    const middleware = requireStepUp(ctx, WINDOW_SECONDS);
    const next = vi.fn();

    await middleware(fakeReq({ sessionId: randomUUID() }), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0] as { code?: string };
    expect(err?.code).toBe('STEP_UP_REQUIRED');
  });

  it('stale mfaVerifiedAt (just outside window) -> STEP_UP_REQUIRED', async () => {
    const ctx = fakeCtx({
      revokedAt: null,
      mfaVerifiedAt: new Date(Date.now() - (WINDOW_SECONDS + 1) * 1000),
    });
    const middleware = requireStepUp(ctx, WINDOW_SECONDS);
    const next = vi.fn();

    await middleware(fakeReq({ sessionId: randomUUID() }), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0] as { code?: string };
    expect(err?.code).toBe('STEP_UP_REQUIRED');
  });

  it('fresh mfaVerifiedAt (well inside window) -> calls next() with no error', async () => {
    const ctx = fakeCtx({ revokedAt: null, mfaVerifiedAt: new Date() });
    const middleware = requireStepUp(ctx, WINDOW_SECONDS);
    const next = vi.fn();

    await middleware(fakeReq({ sessionId: randomUUID() }), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]![0]).toBeUndefined();
  });

  it('mfaVerifiedAt exactly at the window boundary is still fresh (inclusive <=)', async () => {
    const ctx = fakeCtx({
      revokedAt: null,
      mfaVerifiedAt: new Date(Date.now() - WINDOW_SECONDS * 1000),
    });
    const middleware = requireStepUp(ctx, WINDOW_SECONDS);
    const next = vi.fn();

    await middleware(fakeReq({ sessionId: randomUUID() }), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]![0]).toBeUndefined();
  });

  it('propagates unexpected session-store errors to next() rather than throwing', async () => {
    const boom = new Error('db unavailable');
    const ctx = {
      sessions: {
        async findById() {
          throw boom;
        },
      },
    } as unknown as AppContext;
    const middleware = requireStepUp(ctx, WINDOW_SECONDS);
    const next = vi.fn();

    await middleware(fakeReq({ sessionId: randomUUID() }), {} as Response, next);

    expect(next).toHaveBeenCalledWith(boom);
  });
});
