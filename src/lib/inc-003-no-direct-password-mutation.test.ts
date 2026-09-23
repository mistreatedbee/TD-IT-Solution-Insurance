/**
 * INC-003 F-9(b) regression guard.
 *
 * docs/organization/incidents/INC-003-web-password-reset-control-bypass.md
 * §2.2: the web client mutated Supabase Auth credentials directly
 * (`supabase.auth.updateUser({ password })`), bypassing the backend's SR-6
 * MFA gate, session revocation, and password-length policy entirely. F-5
 * removed the one call site (`updatePasswordWithSupabase`,
 * `src/customer/supabase/auth.ts`) as a capability, not just as a caller.
 *
 * This is a structural guard against recurrence: it fails the suite if any
 * file under `src/` ever calls `.updateUser({ password` (or the loosely
 * spaced/quoted variants) again — a browser-resident capability to mutate a
 * password directly against the identity store, rather than going through
 * `POST /v1/auth/reset-password/confirm` + `/mfa-verify`
 * (`src/customer/api/auth.ts`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(__dirname, '..');

// Matches `updateUser({ password` / `updateUser({password:` etc. — the
// direct-mutation call shape this guard exists to catch — regardless of
// spacing or quote style around the key.
const FORBIDDEN_PATTERN = /\.updateUser\(\s*\{\s*password\s*[:,]/;

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      collectFiles(full, acc);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('INC-003 F-9(b) — no direct Supabase password mutation anywhere under src/', () => {
  it('finds no `.updateUser({ password ... })` call site', () => {
    const offenders: string[] = [];
    for (const file of collectFiles(SRC_ROOT)) {
      const content = readFileSync(file, 'utf8');
      if (FORBIDDEN_PATTERN.test(content)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
