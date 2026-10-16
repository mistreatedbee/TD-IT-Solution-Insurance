/**
 * INC-003 §26 C-5 / K-5 — TRUST_PROXY_HOPS bounds.
 */
import { describe, it, expect } from 'vitest';
import { parseTrustProxyHops, MAX_TRUST_PROXY_HOPS } from './env.js';

describe('parseTrustProxyHops', () => {
  it('defaults to 1 when unset (unchanged behaviour)', () => {
    expect(parseTrustProxyHops(undefined)).toBe(1);
  });

  it('accepts integers from 0 to the maximum', () => {
    expect(MAX_TRUST_PROXY_HOPS).toBe(5);
    for (let n = 0; n <= MAX_TRUST_PROXY_HOPS; n++) {
      expect(parseTrustProxyHops(String(n))).toBe(n);
    }
  });

  it('fails startup above the maximum', () => {
    expect(() => parseTrustProxyHops('6')).toThrow(/exceeds the maximum of 5/);
    expect(() => parseTrustProxyHops('30')).toThrow(/exceeds the maximum/);
  });

  it('rejects non-integer, negative and non-numeric values (including "true")', () => {
    for (const bad of ['-1', '1.5', 'abc', 'true']) {
      expect(() => parseTrustProxyHops(bad)).toThrow(/Invalid TRUST_PROXY_HOPS/);
    }
  });
});
