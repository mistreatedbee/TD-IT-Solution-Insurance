/**
 * INC-003 F-9(b) regression guard — relabelled code hygiene per ADR-0014 A-11.
 *
 * docs/organization/incidents/INC-003-web-password-reset-control-bypass.md
 * §2.2: the web client mutated Supabase Auth credentials directly
 * (`supabase.auth.updateUser({ password })`), bypassing the backend's SR-6
 * MFA gate, session revocation, and password-length policy entirely. F-5
 * removed the one call site (`updatePasswordWithSupabase`,
 * `src/customer/supabase/auth.ts`) as a capability, not just as a caller.
 *
 * Relabelling note (ADR-0014 §2 item 5 / §5.3 / exit-criteria row A-11):
 * ADR-0014's capability guard (`adr-0014-a11-capability-guard.test.ts`) is
 * now "the control that matters" for this class of bypass — it asserts the
 * browser holds no Supabase SDK and no Supabase-reachable credential at
 * all, which is the thing that actually makes a direct `.updateUser()` call
 * possible in the first place. This file stays as a narrower, file-pattern
 * grep: a structural guard against recurrence, catching any file under
 * `src/` that calls `.updateUser({ password` (or the loosely spaced/quoted
 * variants) again, rather than going through
 * `POST /v1/auth/reset-password/confirm` + `/mfa-verify`
 * (`src/customer/api/auth.ts`). Per ADR-0014, this is now **code hygiene**,
 * not a live security control in its own right — once ADR-0014 Phase 1
 * ships (deleting `src/customer/supabase/` and removing
 * `@supabase/supabase-js` from `package.json`), there is no SDK left for any
 * file to call `.updateUser()` on, and the capability guard above would
 * catch its reintroduction before this pattern-grep ever would. The
 * assertion itself is unchanged and is not weakened by this relabel.
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
