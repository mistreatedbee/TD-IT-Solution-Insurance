import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR-0011 SR-12(a) / INC-003 §19.4 condition 1 (A-15).
 *
 * The web app (src/) is a single Vite SPA — marketing, customer, admin,
 * security-company and call-centre dashboards all ship in one bundle, on one
 * Vercel deployment, with every path rewritten to the same `index.html`
 * (`vercel.json`'s `rewrites`). There is no server-rendering step and no
 * per-route document here, so the only place a browser-facing
 * Content-Security-Policy / Referrer-Policy can be applied for the deployed
 * site is Vercel's static-response `headers` config — this test is a
 * config-shape smoke test against that file, not a live HTTP request,
 * because there is no local server to query for Vercel's deployed response
 * headers.
 *
 * If this test breaks because a route now needs a capability the policy
 * doesn't allow (a new third-party script/style/image/connect host), that's
 * the CSP doing its job — widen the specific directive deliberately, don't
 * delete the header.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadVercelConfig(): {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
} {
  const raw = readFileSync(resolve(repoRoot, 'vercel.json'), 'utf8');
  return JSON.parse(raw);
}

function findHeaderValue(
  config: ReturnType<typeof loadVercelConfig>,
  source: string,
  key: string,
): string | undefined {
  const block = config.headers?.find((entry) => entry.source === source);
  return block?.headers.find((h) => h.key === key)?.value;
}

describe('vercel.json security headers (ADR-0011 / INC-003 A-15)', () => {
  const config = loadVercelConfig();

  it('applies a header block to every route (same source pattern as the SPA rewrite)', () => {
    expect(config.headers?.some((entry) => entry.source === '/(.*)')).toBe(true);
  });

  it('sets Referrer-Policy: no-referrer on every route', () => {
    expect(findHeaderValue(config, '/(.*)', 'Referrer-Policy')).toBe('no-referrer');
  });

  describe('Content-Security-Policy', () => {
    const csp = findHeaderValue(config, '/(.*)', 'Content-Security-Policy') ?? '';
    const directives = new Map<string, string>(
      csp
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const [name, ...rest] = d.split(/\s+/);
          return [name, rest.join(' ')];
        }),
    );

    it('is present', () => {
      expect(csp.length).toBeGreaterThan(0);
    });

    it('defaults every fetch-type directive to same-origin only', () => {
      expect(directives.get('default-src')).toBe("'self'");
    });

    it('never tolerates inline or eval script execution (XSS is the live token-theft path — ADR-0014 §4.2 RR-1)', () => {
      const scriptSrc = directives.get('script-src') ?? '';
      expect(scriptSrc).toContain("'self'");
      expect(scriptSrc).not.toContain('unsafe-inline');
      expect(scriptSrc).not.toContain('unsafe-eval');
      expect(csp).not.toContain('script-src-elem');
    });

    it('denies framing of every route — the dashboards ADR-0011 is worried about included', () => {
      expect(directives.get('frame-ancestors')).toBe("'none'");
    });

    it('disallows legacy plugin content', () => {
      expect(directives.get('object-src')).toBe("'none'");
    });

    it('allow-lists exactly the Google Fonts hosts the app actually loads (src/index.tsx, src/index.css)', () => {
      expect(directives.get('style-src')).toContain('https://fonts.googleapis.com');
      expect(directives.get('font-src')).toContain('https://fonts.gstatic.com');
    });

    it('allow-lists exactly the backend API and Supabase Auth hosts the app actually calls', () => {
      const connectSrc = directives.get('connect-src') ?? '';
      expect(connectSrc).toContain("'self'");
      expect(connectSrc).toContain('onrender.com');
      // src/customer/supabase/client.ts still runs the browser Supabase SDK
      // directly (ADR-0014 Phase 1 not yet deployed). Narrow this allowance
      // to 'self' once that migration ships.
      expect(connectSrc).toContain('supabase.co');
    });

    it('constrains base-uri and form-action to same-origin', () => {
      expect(directives.get('base-uri')).toBe("'self'");
      expect(directives.get('form-action')).toBe("'self'");
    });
  });
});
