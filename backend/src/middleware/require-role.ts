/**
 * Coarse RBAC gate — `user_type` checked from the verified access-token
 * claim (populated by authenticate.ts). This is intentionally the ONLY
 * layer that trusts the claim for a yes/no admin-or-not decision: for
 * anything cross-account (audit-log read, invitation issuance), the route
 * handler itself is responsible for emitting the SR-10 audit event — a
 * `privileged_data_access` row per subject whose data was disclosed (via
 * `recordBulkDisclosure()` for a list call, ADR-0006 AUD-3(b)), or
 * `privilege_granted` for a privilege-granting action like invitation
 * issuance, which reads nobody's data — and for any additional live
 * re-derivation the specific endpoint's contract requires — this
 * middleware only answers "is this caller even the right role," per
 * rulings C4/C8.
 */
import type { NextFunction, Request, Response } from 'express';
import { apiError } from '../lib/errors.js';

export function requireUserType(...allowed: string[]) {
  return function requireUserTypeMiddleware(req: Request, _res: Response, next: NextFunction): void {
    if (!req.auth) {
      next(apiError('UNAUTHORIZED'));
      return;
    }
    if (!allowed.includes(req.auth.userType)) {
      next(apiError('FORBIDDEN'));
      return;
    }
    next();
  };
}
