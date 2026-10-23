// @vitest-environment node
/**
 * ADR-0014 A-11 — capability guard (§2 item 5, §5.3, exit-criteria row A-11).
 *
 * docs/organization/adr/0014-web-identity-through-backend-remove-browser-supabase-sdk.md
 *
 * ADR-0014 §2 item 5: "SR-4 becomes an enforced invariant, not a review note.
 * CI fails the web build if the bundle or lockfile contains `@supabase/`,
 * `supabase.co`, or a string that matches a Supabase API key." §5.3 repeats
 * the same scope: `package.json` or the lockfile listing `@supabase/*` for
 * the web package, or `dist/` containing a Supabase API key or a
 * `*.supabase.co` URL. This file is that check, made machine-enforceable
 * instead of a line in a review doc — the thing A-11 names "the capability
 * check", which replaces the old F-9(b) call-site grep
 * (`inc-003-no-direct-password-mutation.test.ts`, relabelled as code hygiene
 * alongside this file per the same A-11 action) as the control that matters.
 *
 * Scope is deliberately strict, per §5.3's wording ("lists @supabase/*"),
 * not just the direct `@supabase/supabase-js` entry: any `@supabase/*`
 * package anywhere in the web app's dependency tree (direct or transitive)
 * fails this guard, and any Supabase project URL or API-key-shaped string
 * anywhere in a production build output fails it too.
 *
 * IMPORTANT — current repo state, read before "fixing" a red run here:
 * ADR-0014 Phase 1 (deleting `src/customer/supabase/` and removing
 * `@supabase/supabase-js` from the web `package.json`) has **not shipped
 * yet** as of this guard's addition (see the ADR's own §16.1 ratification
 * note: "`@supabase/supabase-js` is still in `package.json:22`. Phase 1 has
 * not started, as expected."). Until that Phase 1 cutover PR lands, the
 * dependency and bundle assertions below are EXPECTED TO FAIL for real,
 * not flaky — that failure accurately reports that the browser Supabase SDK
 * is still present. Do not weaken or loosen these assertions to force green;
 * they only pass once ADR-0014 Phase 1 actually ships.
 *
 * Per ADR-0014 §20 (cto ruling, 2026-10-23): this file IS excluded from the
 * default `npm test` run (see vitest.config.ts's `exclude`) and so from the
 * blocking frontend CI `Test` step, because §16.3 names A-11 as a required
 * Stage 8 check on the Phase 1 cutover PR, not a check required on main
 * before that cutover exists. It still runs — informational, non-blocking,
 * expected red — in its own `adr-0014-a11-guard` CI job (vitest.config.a11-
 * guard.ts). The Phase 1 cutover PR must remove both the vitest.config.ts
 * exclusion and that job's `continue-on-error`, and show this green, before
 * its Stage 8 review can sign off.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('ADR-0014 A-11 — capability guard: no browser Supabase SDK in the web app', () => {
  it('package.json declares no @supabase/* dependency (direct or dev)', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const offenders = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ].filter((name) => name.startsWith('@supabase/'));

    expect(offenders).toEqual([]);
  });

  it('package-lock.json resolves no @supabase/* package anywhere in the tree', () => {
    const lockfile = readFileSync(join(root, 'package-lock.json'), 'utf8');
    const matches = Array.from(new Set(lockfile.match(/"@supabase\/[a-z0-9-]+"/gi) ?? []));

    expect(matches).toEqual([]);
  });

  it('a production build contains no Supabase project URL and no Supabase-API-key-shaped string', () => {
    const out = mkdtempSync(join(tmpdir(), 'adr-0014-a11-'));
    mkdirSync(out, { recursive: true });
    execFileSync(process.execPath, [viteBin, 'build', '--outDir', out, '--emptyOutDir'], {
      cwd: root,
      env: process.env,
      stdio: 'pipe',
    });

    const hay = walk(out)
      .filter((file) => /\.(js|css|html)$/.test(file))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    // §2 item 5 / §5.3: a Supabase project host, or a JWT-shaped string (the
    // format both the legacy anon/service-role keys and GoTrue access
    // tokens use: three base64url segments separated by dots).
    expect(hay).not.toMatch(/[a-z0-9-]+\.supabase\.co/i);
    expect(hay).not.toMatch(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/);
  }, 240_000);
});
