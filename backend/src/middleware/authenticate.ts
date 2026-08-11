/**
 * Bearer-token authentication middleware.
 *
 * Implements api-design.md §2.1 Mechanism 1 on every authenticated request:
 * verify the backend-minted JWT's signature, THEN check the `jti` against
 * the Redis-backed revocation set — a revoked token is rejected on the very
 * next request, not at its next natural expiry (AC-8).
 *
 * Does NOT re-derive account_state/user_type from the database on every
 * request (that would defeat the whole point of a locally-verifiable JWT) —
 * those claims are trusted for the bounded 10-minute staleness window
 * Mechanism 2 defines, except at the specific chokepoints
 * (`/session/refresh`, `/account/me`, `/internal/accounts/{id}/status`)
 * that always re-read `app.account_status_cache` directly, implemented in
 * their own route handlers, not here.
 */
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env.js';
import type { KeyValueStore } from '../db/redis.js';
import { REVOCATION_KEY_PREFIX } from '../db/redis.js';
import { verifyAccessToken, JwtVerificationError, type VerifiedAccessToken } from '../lib/jwt.js';
import { apiError } from '../lib/errors.js';

export interface AuthContext {
  accountId: string;
  userType: string;
  mfaRequired: boolean;
  accountState: string;
  partnerOrganizationId: string | null;
  sessionId: string;
  mfaVerifiedRecently: boolean;
  claims: VerifiedAccessToken;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Same verification as `createAuthenticateMiddleware`, but never rejects the
 * request for a missing/invalid token — it simply leaves `req.auth`
 * undefined so the handler can implement its own dual-mode logic (used by
 * `POST /mfa/enroll`, which is legitimately callable either bearer-
 * authenticated (customer opt-in) or via an SR-1 enrollment ticket
 * pre-session — api-design.md's own contract is ambiguous about which, and
 * SR-1 requires the ambiguity be resolved in code, not papered over).
 */
export function createOptionalAuthenticateMiddleware(env: Env, revocationStore: KeyValueStore) {
  return async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const header = req.header('authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      next();
      return;
    }
    const token = header.slice(7).trim();
    try {
      const claims = verifyAccessToken(token, env.jwtSigningKeys);
      const revoked = await revocationStore.exists(`${REVOCATION_KEY_PREFIX}${claims.jti}`);
      if (revoked) {
        next();
        return;
      }
      req.auth = {
        accountId: claims.sub,
        userType: claims.user_type,
        mfaRequired: claims.mfa_required,
        accountState: claims.account_state,
        partnerOrganizationId: claims.partner_organization_id,
        sessionId: claims.session_id,
        mfaVerifiedRecently: false,
        claims,
      };
    } catch {
      // Malformed/invalid token on the optional path is treated the same
      // as "no token" — the pre-session enrollment-ticket branch handles it.
    }
    next();
  };
}

export function createAuthenticateMiddleware(env: Env, revocationStore: KeyValueStore) {
  return async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const header = req.header('authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      next(apiError('UNAUTHORIZED'));
      return;
    }
    const token = header.slice(7).trim();

    let claims: VerifiedAccessToken;
    try {
      claims = verifyAccessToken(token, env.jwtSigningKeys);
    } catch (err) {
      if (err instanceof JwtVerificationError) {
        next(apiError('UNAUTHORIZED'));
        return;
      }
      next(err);
      return;
    }

    let revoked: boolean;
    try {
      revoked = await revocationStore.exists(`${REVOCATION_KEY_PREFIX}${claims.jti}`);
    } catch (err) {
      next(err);
      return;
    }
    if (revoked) {
      next(apiError('UNAUTHORIZED'));
      return;
    }

    req.auth = {
      accountId: claims.sub,
      userType: claims.user_type,
      mfaRequired: claims.mfa_required,
      accountState: claims.account_state,
      partnerOrganizationId: claims.partner_organization_id,
      sessionId: claims.session_id,
      mfaVerifiedRecently: false, // step-up check is a separate, endpoint-specific concern (see lib/step-up.ts)
      claims,
    };
    next();
  };
}
