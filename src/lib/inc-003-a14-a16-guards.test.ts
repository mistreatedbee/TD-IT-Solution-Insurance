/**
 * INC-003 A-14 / A-16 structural guards (code hygiene, in the same spirit as
 * the F-9(b) guard — see INC-003 §11 A-11: these prove what OUR bundle
 * does, not what the published anon key makes callable).
 *
 * - A-16: no browser-side GoTrue signup or verification resend. Web signup
 *   and resend go through `POST /auth/signup` / `/auth/resend-verification`
 *   (`src/customer/api/auth.ts`).
 * - A-14: no plaintext-password store for the onboarding wizard. The
 *   `pendingSignupAuth` module is gone and nothing writes its key.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(__dirname, '..');

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, acc);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

function offenders(pattern: RegExp): string[] {
  return collectFiles(SRC_ROOT).filter((f) => pattern.test(readFileSync(f, 'utf8')));
}

describe('INC-003 A-16 — no GoTrue-direct signup / resend under src/', () => {
  it('finds no `.auth.signUp(` call site', () => {
    expect(offenders(/\.auth\.signUp\(/)).toEqual([]);
  });
  it('finds no `.auth.resend(` call site', () => {
    expect(offenders(/\.auth\.resend\(/)).toEqual([]);
  });
});

describe('INC-003 A-14 — no plaintext signup password in browser storage', () => {
  it('the pendingSignupAuth module no longer exists', () => {
    expect(existsSync(join(SRC_ROOT, 'onboarding', 'pendingSignupAuth.ts'))).toBe(false);
  });
  it('nothing writes the legacy `td_signup_pending_auth` key', () => {
    expect(offenders(/setItem\(\s*['"`]td_signup_pending_auth/)).toEqual([]);
    expect(offenders(/savePendingSignupAuth/)).toEqual([]);
  });
  it('no Storage.setItem call passes a password-named value', () => {
    expect(offenders(/(sessionStorage|localStorage)\.setItem\([^;\n]*password/i)).toEqual([]);
  });
});
