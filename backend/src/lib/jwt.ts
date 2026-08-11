/**
 * Backend-minted access-token signing/verification.
 *
 * api-design.md §1 (ratified by security-review.md §0): the backend mints
 * its own opaque access-token JWT, signed with a backend-owned key —
 * never a Supabase-issued token. `kid`-rotatable: config/env.ts already
 * parses a set of signing keys plus one active kid; every listed key
 * remains valid for verification so a rotation has a grace period.
 */
import jwt from 'jsonwebtoken';
import type { JwtSigningKey } from '../config/env.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './policy.js';

export interface AccessTokenClaims {
  sub: string; // account_id
  user_type: string;
  mfa_required: boolean;
  account_state: string;
  partner_organization_id: string | null;
  session_id: string; // == jti
}

export interface VerifiedAccessToken extends AccessTokenClaims {
  iat: number;
  exp: number;
  jti: string;
}

export class JwtVerificationError extends Error {
  constructor(reason: string) {
    super(`[lib/jwt] access token verification failed: ${reason}`);
  }
}

export function signAccessToken(
  claims: AccessTokenClaims,
  keys: JwtSigningKey[],
  activeKid: string,
): { token: string; expiresIn: number } {
  const activeKey = keys.find((k) => k.kid === activeKid);
  if (!activeKey) {
    throw new Error(`[lib/jwt] active kid "${activeKid}" not found among signing keys`);
  }
  const token = jwt.sign(claims, activeKey.secret, {
    algorithm: 'HS256',
    keyid: activeKey.kid,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    jwtid: claims.session_id,
  });
  return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyAccessToken(token: string, keys: JwtSigningKey[]): VerifiedAccessToken {
  let decoded;
  try {
    decoded = jwt.decode(token, { complete: true });
  } catch {
    throw new JwtVerificationError('malformed');
  }
  if (!decoded || typeof decoded === 'string') {
    throw new JwtVerificationError('malformed');
  }
  const kid = decoded.header.kid;
  const key = kid ? keys.find((k) => k.kid === kid) : undefined;
  if (!key) {
    throw new JwtVerificationError('unknown_kid');
  }
  try {
    const payload = jwt.verify(token, key.secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string') {
      throw new JwtVerificationError('malformed_payload');
    }
    if (!payload.jti || !payload.sub) {
      throw new JwtVerificationError('missing_required_claims');
    }
    return payload as VerifiedAccessToken;
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      throw err;
    }
    throw new JwtVerificationError(err instanceof Error ? err.message : 'unknown');
  }
}
