/**
 * INC-003 A-28 — pure trust-proxy measurement logic and runtime alert.
 */
import { describe, it, expect } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  classifyAddress,
  normalizeAddress,
  parseForwardedFor,
  buildChainFromRight,
  resolveIpForHops,
  computeProxyTrustDiagnostic,
  createTrustProxyMonitor,
  TRUST_PROXY_MISCONFIGURED_LOG_TAG,
  TRUST_PROXY_TOO_HIGH_LOG_TAG,
  TRUST_PROXY_ALERT_INTERVAL_MS,
  MAX_CHAIN_ENTRIES,
} from './proxy-trust.js';

const CLIENT = '81.2.69.142';

describe('classifyAddress', () => {
  it.each([
    ['10.1.2.3', 'private'],
    ['172.16.0.1', 'private'],
    ['172.31.255.255', 'private'],
    ['172.32.0.1', 'public'],
    ['192.168.1.1', 'private'],
    ['127.0.0.1', 'loopback'],
    ['169.254.10.1', 'link_local'],
    ['100.64.0.1', 'shared_cgnat'],
    ['0.0.0.0', 'unspecified'],
    ['8.8.8.8', 'public'],
    [CLIENT, 'public'],
    ['::1', 'loopback'],
    ['fe80::1', 'link_local'],
    ['fd00::1', 'unique_local'],
    ['2001:db8::1', 'documentation'],
    ['2606:4700::1111', 'public'],
    ['::ffff:10.0.0.1', 'private'],
    ['::ffff:8.8.8.8', 'public'],
    ['not-an-ip', 'invalid'],
    ['', 'invalid'],
  ])('%s -> %s', (addr, cls) => {
    expect(classifyAddress(addr)).toBe(cls);
  });

  // INC-003 §26 K-6: RFC 6890 special-purpose ranges and alternate encodings are never 'public'.
  it.each([
    ['::ffff:a00:1', 'private'],
    ['::ffff:7f00:1', 'loopback'],
    ['0:0:0:0:0:ffff:a9fe:101', 'link_local'],
    ['::ffff:808:808', 'public'],
    ['::10.0.0.1', 'reserved'],
    ['::a00:1', 'reserved'],
    ['::8.8.8.8', 'reserved'],
    ['64:ff9b::808:808', 'reserved'],
    ['64:ff9b::10.0.0.1', 'reserved'],
    ['64:ff9b:1::1', 'reserved'],
    ['100::1', 'reserved'],
    ['2001::1', 'reserved'],
    ['2001:2::1', 'reserved'],
    ['2001:10::1', 'reserved'],
    ['2002:a00:1::1', 'reserved'],
    ['3fff::1', 'documentation'],
    ['fec0::1', 'reserved'],
    ['ff02::1', 'multicast'],
    ['192.0.0.8', 'reserved'],
    ['192.0.2.1', 'documentation'],
    ['198.51.100.7', 'documentation'],
    ['203.0.113.9', 'documentation'],
    ['192.88.99.1', 'reserved'],
    ['198.18.0.1', 'reserved'],
    ['198.19.255.255', 'reserved'],
    ['198.20.0.1', 'public'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.255', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'reserved'],
    ['2001:4860:4860::8888', 'public'],
  ])('K-6: %s -> %s', (addr, cls) => {
    expect(classifyAddress(addr)).toBe(cls);
  });

  it('treats undefined/null as invalid', () => {
    expect(classifyAddress(undefined)).toBe('invalid');
    expect(classifyAddress(null)).toBe('invalid');
  });
});

describe('normalizeAddress / parseForwardedFor', () => {
  it('strips mapped prefix, zone, brackets and ports', () => {
    expect(normalizeAddress(' ::FFFF:81.2.69.142 ')).toBe(CLIENT);
    expect(normalizeAddress('fe80::1%eth0')).toBe('fe80:0:0:0:0:0:0:1');
    expect(normalizeAddress('[2001:db8::1]:443')).toBe('2001:db8:0:0:0:0:0:1');
    // Differently-compressed spellings of one address compare equal.
    expect(normalizeAddress('2606:4700:0:0::1111')).toBe(normalizeAddress('2606:4700::1111'));
    // INC-003 §26 K-6: hex and fully-expanded IPv4-mapped forms collapse to dotted IPv4.
    expect(normalizeAddress('::ffff:a00:1')).toBe('10.0.0.1');
    expect(normalizeAddress('0:0:0:0:0:ffff:0a00:0001')).toBe('10.0.0.1');
    expect(normalizeAddress('81.2.69.142:5555')).toBe(CLIENT);
  });

  it('splits, trims and drops empties, including array form', () => {
    expect(parseForwardedFor(undefined)).toEqual([]);
    expect(parseForwardedFor(' a , b,,c ')).toEqual(['a', 'b', 'c']);
    expect(parseForwardedFor(['a, b', 'c'])).toEqual(['a', 'b', 'c']);
  });
});

describe('resolveIpForHops mirrors Express numeric trust proxy', () => {
  const chain = buildChainFromRight('10.0.0.9', [CLIENT, '10.0.0.5', '10.0.0.6']);
  it('indexes from the socket outward and clamps at the leftmost entry', () => {
    expect(chain).toEqual(['10.0.0.9', '10.0.0.6', '10.0.0.5', CLIENT]);
    expect(resolveIpForHops(chain, 0)).toBe('10.0.0.9');
    expect(resolveIpForHops(chain, 1)).toBe('10.0.0.6');
    expect(resolveIpForHops(chain, 3)).toBe(CLIENT);
    expect(resolveIpForHops(chain, 99)).toBe(CLIENT);
  });
});

describe('computeProxyTrustDiagnostic', () => {
  it('reports the symptom and the suggested hop count for a 3-hop chain', () => {
    const xff = `${CLIENT}, 10.0.0.5, 10.0.0.6`;
    const r = computeProxyTrustDiagnostic({
      configuredHops: 1,
      socketAddress: '10.0.0.9',
      forwardedFor: xff,
      reqIp: '10.0.0.6',
      expectedClientIp: CLIENT,
    });
    expect(r.forwardedForEntryCount).toBe(3);
    expect(r.socketRemoteAddressClass).toBe('private');
    expect(r.chainClassesFromRight).toEqual(['private', 'private', 'private', 'public']);
    expect(r.reqIp).toEqual({ class: 'private', value: null, matchesExpectedClientIp: false });
    expect(r.expectedClientIpPositionFromRight).toBe(3);
    expect(r.suggestedTrustProxyHops).toBe(3);
    expect(r.rightmostPublicIndex).toBe(3);
    expect(r.currentSettingMatchesSuggestion).toBe(false);
    expect(r.notes.some((n) => n.startsWith('req_ip_not_public'))).toBe(true);
    // No internal address leaks into the output.
    expect(JSON.stringify(r)).not.toMatch(/10\.0\.0\./);
  });

  it('a spoofed leftmost entry does not move the suggestion', () => {
    const r = computeProxyTrustDiagnostic({
      configuredHops: 3,
      socketAddress: '10.0.0.9',
      forwardedFor: `6.6.6.6, ${CLIENT}, 10.0.0.5, 10.0.0.6`,
      reqIp: CLIENT,
      expectedClientIp: CLIENT,
    });
    expect(r.forwardedForEntryCount).toBe(4);
    expect(r.suggestedTrustProxyHops).toBe(3);
    expect(r.rightmostPublicIndex).toBe(3);
    expect(r.currentSettingMatchesSuggestion).toBe(true);
    expect(r.reqIp).toEqual({ class: 'public', value: CLIENT, matchesExpectedClientIp: true });
  });

  it('a caller spoofing their own IP further left still yields the rightmost (nearest) position', () => {
    const r = computeProxyTrustDiagnostic({
      configuredHops: 1,
      socketAddress: '10.0.0.9',
      forwardedFor: `${CLIENT}, ${CLIENT}, 10.0.0.6`,
      reqIp: '10.0.0.6',
      expectedClientIp: CLIENT,
    });
    expect(r.suggestedTrustProxyHops).toBe(2);
  });

  it('flags disagreement when a public address sits between caller and service', () => {
    const r = computeProxyTrustDiagnostic({
      configuredHops: 1,
      socketAddress: '10.0.0.9',
      forwardedFor: `${CLIENT}, 81.2.69.200`,
      reqIp: '81.2.69.200',
      expectedClientIp: CLIENT,
    });
    expect(r.suggestedTrustProxyHops).toBe(2);
    expect(r.rightmostPublicIndex).toBe(1);
    expect(r.notes.some((n) => n.startsWith('suggestion_disagrees_with_rightmost_public'))).toBe(true);
  });

  it('returns null suggestion and a note when the expected IP is absent or not supplied', () => {
    const missing = computeProxyTrustDiagnostic({
      configuredHops: 1,
      socketAddress: '10.0.0.9',
      forwardedFor: '203.0.113.9, 10.0.0.6',
      reqIp: '10.0.0.6',
      expectedClientIp: CLIENT,
    });
    expect(missing.suggestedTrustProxyHops).toBeNull();
    expect(missing.currentSettingMatchesSuggestion).toBeNull();
    expect(missing.notes.some((n) => n.startsWith('expected_client_ip_not_in_chain'))).toBe(true);

    const none = computeProxyTrustDiagnostic({
      configuredHops: 1,
      socketAddress: '127.0.0.1',
      forwardedFor: undefined,
      reqIp: '127.0.0.1',
      expectedClientIp: undefined,
    });
    expect(none.expectedClientIpProvided).toBe(false);
    expect(none.reqIp.matchesExpectedClientIp).toBeNull();
    expect(none.forwardedForEntryCount).toBe(0);
    expect(none.rightmostPublicIndex).toBeNull();
    expect(none.notes.some((n) => n.startsWith('no_forwarded_for_header'))).toBe(true);
  });

  it('K-2: notes a configured count higher than the observed entry count', () => {
    const r = computeProxyTrustDiagnostic({
      configuredHops: 4,
      socketAddress: '10.0.0.9',
      forwardedFor: `${CLIENT}, 10.0.0.5, 10.0.0.6`,
      reqIp: CLIENT,
      expectedClientIp: CLIENT,
    });
    expect(r.suggestedTrustProxyHops).toBe(3);
    expect(r.notes.some((n) => n.startsWith('configured_hops_exceeds_entry_count'))).toBe(true);
    const ok = computeProxyTrustDiagnostic({
      configuredHops: 3,
      socketAddress: '10.0.0.9',
      forwardedFor: `${CLIENT}, 10.0.0.5, 10.0.0.6`,
      reqIp: CLIENT,
      expectedClientIp: CLIENT,
    });
    expect(ok.notes.some((n) => n.startsWith('configured_hops_exceeds_entry_count'))).toBe(false);
  });

  it('caps the examined chain to the rightmost entries', () => {
    const many = Array.from({ length: MAX_CHAIN_ENTRIES + 10 }, () => '6.6.6.6');
    const r = computeProxyTrustDiagnostic({
      configuredHops: 1,
      socketAddress: '10.0.0.9',
      forwardedFor: [...many, CLIENT, '10.0.0.6'].join(', '),
      reqIp: '10.0.0.6',
      expectedClientIp: CLIENT,
    });
    expect(r.forwardedForEntryCount).toBe(MAX_CHAIN_ENTRIES + 12);
    expect(r.chainTruncated).toBe(true);
    expect(r.chainClassesFromRight).toHaveLength(MAX_CHAIN_ENTRIES + 1);
    expect(r.suggestedTrustProxyHops).toBe(2);
  });
});

describe('createTrustProxyMonitor', () => {
  function fakeReq(ip: string, opts: { xff?: string; path?: string } = {}): Request {
    return {
      ip,
      path: opts.path ?? '/api/v1/auth/login',
      headers: opts.xff === undefined ? {} : { 'x-forwarded-for': opts.xff },
    } as unknown as Request;
  }
  function run(mw: ReturnType<typeof createTrustProxyMonitor>, req: Request): boolean {
    let called = false;
    const next: NextFunction = () => {
      called = true;
    };
    mw(req, {} as Response, next);
    return called;
  }

  it('emits one tagged alert per interval in production, with class only and a suppressed count', () => {
    const logs: string[] = [];
    let t = 1_000_000;
    const mw = createTrustProxyMonitor({ isProduction: true, configuredHops: 1, now: () => t, log: (m) => logs.push(m) });

    expect(run(mw, fakeReq('10.0.0.6', { xff: `${CLIENT}, 10.0.0.6` }))).toBe(true);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.startsWith(TRUST_PROXY_MISCONFIGURED_LOG_TAG)).toBe(true);
    expect(logs[0]).toContain('private');
    expect(logs[0]).toContain('TRUST_PROXY_HOPS=1');
    expect(logs[0]).not.toContain('10.0.0.6');
    expect(logs[0]).not.toContain(CLIENT);

    t += 1000;
    run(mw, fakeReq('10.0.0.6', { xff: `${CLIENT}, 10.0.0.6` }));
    run(mw, fakeReq('127.0.0.1', { xff: '127.0.0.1' }));
    expect(logs).toHaveLength(1);

    t += TRUST_PROXY_ALERT_INTERVAL_MS;
    run(mw, fakeReq('169.254.1.1', { xff: '169.254.1.1' }));
    expect(logs).toHaveLength(2);
    expect(logs[1]).toContain('link_local');
    expect(logs[1]).toContain('Suppressed since last alert: 2');
  });

  it('uses the exact stable tags', () => {
    expect(TRUST_PROXY_MISCONFIGURED_LOG_TAG).toBe('[ALERT:trust_proxy_misconfigured]');
    expect(TRUST_PROXY_TOO_HIGH_LOG_TAG).toBe('[ALERT:trust_proxy_too_high]');
  });

  it('K-3/C-4: the too-low alert warns against incrementing and names the too-high cause', () => {
    const logs: string[] = [];
    const mw = createTrustProxyMonitor({ isProduction: true, configuredHops: 1, log: (m) => logs.push(m) });
    run(mw, fakeReq('10.0.0.6', { xff: `${CLIENT}, 10.0.0.6` }));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('Never respond by incrementing TRUST_PROXY_HOPS; re-measure');
    expect(logs[0]).toContain('too HIGH combined with a client-supplied private XFF entry');
  });

  it('K-2/C-3: fires the too-high alert when XFF has fewer entries than configured hops, throttled separately', () => {
    const logs: string[] = [];
    let t = 5_000_000;
    const mw = createTrustProxyMonitor({ isProduction: true, configuredHops: 3, now: () => t, log: (m) => logs.push(m) });

    // Real topology adds 2 hops; client sent no XFF; hops=3 resolves req.ip to the client's (public) address.
    expect(run(mw, fakeReq(CLIENT, { xff: `${CLIENT}, 10.0.0.6` }))).toBe(true);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.startsWith(TRUST_PROXY_TOO_HIGH_LOG_TAG)).toBe(true);
    expect(logs[0]).toContain('carried 2 X-Forwarded-For entries but TRUST_PROXY_HOPS=3');
    expect(logs[0]).toContain('Never respond by incrementing TRUST_PROXY_HOPS; re-measure');
    expect(logs[0]).not.toContain(CLIENT);
    expect(logs[0]).not.toContain('10.0.0.6');

    // Throttled independently of the too-low channel: a non-public req.ip still produces its own alert.
    t += 1000;
    run(mw, fakeReq(CLIENT, { xff: CLIENT }));
    run(mw, fakeReq('10.0.0.6', { xff: '10.0.0.6' }));
    expect(logs).toHaveLength(2);
    expect(logs[1]?.startsWith(TRUST_PROXY_MISCONFIGURED_LOG_TAG)).toBe(true);

    t += TRUST_PROXY_ALERT_INTERVAL_MS;
    run(mw, fakeReq(CLIENT, { xff: CLIENT }));
    expect(logs).toHaveLength(3);
    expect(logs[2]).toContain('carried 1 X-Forwarded-For entry but');
    expect(logs[2]).toContain('Suppressed since last alert: 2');
  });

  it('too-high alert is silent when entries >= configured hops, outside production, without XFF, and on health paths', () => {
    const logs: string[] = [];
    const log = (m: string) => logs.push(m);
    const prod = createTrustProxyMonitor({ isProduction: true, configuredHops: 2, log });
    run(prod, fakeReq(CLIENT, { xff: `${CLIENT}, 10.0.0.6` }));
    run(prod, fakeReq(CLIENT, { xff: `6.6.6.6, ${CLIENT}, 10.0.0.6` }));
    run(prod, fakeReq('10.0.0.9'));
    run(prod, fakeReq(CLIENT, { xff: CLIENT, path: '/api/health' }));
    const dev = createTrustProxyMonitor({ isProduction: false, configuredHops: 5, log });
    run(dev, fakeReq(CLIENT, { xff: CLIENT }));
    expect(logs).toHaveLength(0);
  });

  it('is silent outside production, for public req.ip, without XFF, and on health paths', () => {
    const logs: string[] = [];
    const log = (m: string) => logs.push(m);
    const dev = createTrustProxyMonitor({ isProduction: false, configuredHops: 1, log });
    expect(run(dev, fakeReq('10.0.0.6', { xff: '10.0.0.6' }))).toBe(true);

    const prod = createTrustProxyMonitor({ isProduction: true, configuredHops: 1, log });
    expect(run(prod, fakeReq(CLIENT, { xff: `${CLIENT}, 10.0.0.6` }))).toBe(true);
    expect(run(prod, fakeReq('10.0.0.6'))).toBe(true);
    expect(run(prod, fakeReq('10.0.0.6', { xff: '10.0.0.6', path: '/api/health/ready' }))).toBe(true);
    expect(logs).toHaveLength(0);
  });
});
