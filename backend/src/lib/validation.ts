/**
 * Shared zod schemas / validation middleware (SR-21: contract-driven
 * request validation at the edge, not hand-rolled per handler).
 */
import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { apiError } from './errors.js';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './policy.js';

export function validateBody<T>(schema: ZodType<T>) {
  return function validate(req: Request, _res: Response, next: NextFunction): void {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(apiError('VALIDATION_ERROR', { details: result.error.issues.map((i) => i.message) }));
      return;
    }
    req.body = result.data;
    next();
  };
}

/** security-review.md §6: customers >=10 chars, privileged roles >=14,
 * max 128, no composition rules. Composition-rule absence is deliberate,
 * not an oversight — see policy.ts's header comment. */
export function isPasswordValidForUserType(password: string, userType: 'customer' | 'privileged'): boolean {
  const min = userType === 'privileged' ? PASSWORD_MIN_LENGTH.privileged : PASSWORD_MIN_LENGTH.customer;
  return password.length >= min && password.length <= PASSWORD_MAX_LENGTH;
}
