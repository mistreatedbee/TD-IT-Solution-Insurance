/**
 * INC-003 A-28 — trust-proxy measurement and misconfiguration detection.
 *
 * Background: `app.set('trust proxy', env.trustProxyHops)` (index.ts) tells
 * Express how many right-hand X-Forwarded-For entries were appended by
 * proxies we trust. Production audit rows show `req.ip` resolving to a
 * Render-internal 10.x hop, i.e. the configured count is lower than the
 * number of hops Render actually adds. A count that is too HIGH is worse: it
 * makes `req.ip` a client-supplied (spoofable) entry. The real count is not
 * documented by Render and must be MEASURED on the deployed service — this
 * module provides the pure logic for that measurement (the internal
 * diagnostic endpoint) and for a rate-limited runtime alert. It never picks
 * a hop count on its own.
 *
 * Privacy: nothing here logs or returns raw addresses other than the
 * caller's own resolved public `req.ip`. Chains are reported as address
 * CLASSES only.
 */
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

export type AddressClass =
  | 'public'
  | 'private'
  | 'loopback'
  | 'link_local'
  | 'shared_cgnat'
  | 'unique_local'
  | 'unspecified'
  | 'invalid';

/** Stable log tag for alerting. Alert rules should match this exact string; do not reword it. */
export const TRUST_PROXY_MISCONFIGURED_LOG_TAG = '[ALERT:trust_proxy_misconfigured]';

/** At most one alert line per this window, per process. */
export const TRUST_PROXY_ALERT_INTERVAL_MS = 15 * 60 * 1000;

/** Hard cap on how many XFF entries the diagnostic will classify/return. */
export const MAX_CHAIN_ENTRIES = 32;

/** Strips an IPv4-mapped IPv6 prefix and IPv6 zone id; lowercases. */
export function normalizeAddress(raw: string): string {
  let addr = raw.trim().toLowerCase();
  // Bracketed IPv6 with optional port, e.g. "[2001:db8::1]:443".
  const bracket = /^\[([^\]]+)\](?::\d+)?$/.exec(addr);
  if (bracket?.[1]) addr = bracket[1];
  // IPv4 with port, e.g. "203.0.113.5:1234" (non-standard but seen in the wild).
  const v4port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(addr);
  if (v4port?.[1]) addr = v4port[1];
  const zone = addr.indexOf('%');
  if (zone !== -1) addr = addr.slice(0, zone);
  if (addr.startsWith('::ffff:') && isIP(addr.slice(7)) === 4) addr = addr.slice(7);
  return addr;
}

function classifyV4(addr: string): AddressClass {
  const [a = 0, b = 0] = addr.split('.').map(Number);
  if (a === 0) return 'unspecified';
  if (a === 10) return 'private';
  if (a === 127) return 'loopback';
  if (a === 169 && b === 254) return 'link_local';
  if (a === 172 && b >= 16 && b <= 31) return 'private';
  if (a === 192 && b === 168) return 'private';
  if (a === 100 && b >= 64 && b <= 127) return 'shared_cgnat';
  return 'public';
}

function classifyV6(addr: string): AddressClass {
  if (addr === '::') return 'unspecified';
  if (addr === '::1') return 'loopback';
  const firstHextet = parseInt(addr.split(':')[0] || '0', 16);
  if ((firstHextet & 0xffc0) === 0xfe80) return 'link_local';
  if ((firstHextet & 0xfe00) === 0xfc00) return 'unique_local';
  return 'public';
}

export function classifyAddress(raw: string | undefined | null): AddressClass {
  if (!raw) return 'invalid';
  const addr = normalizeAddress(raw);
  const family = isIP(addr);
  if (family === 4) return classifyV4(addr);
  if (family === 6) return classifyV6(addr);
  return 'invalid';
}

export function isPublicAddress(raw: string | undefined | null): boolean {
  return classifyAddress(raw) === 'public';
}

/** Splits X-Forwarded-For (string or Node's joined/array forms) into trimmed, non-empty entries, left to right. */
export function parseForwardedFor(header: string | string[] | undefined): string[] {
  if (header === undefined) return [];
  const joined = Array.isArray(header) ? header.join(',') : header;
  return joined
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * The address chain as Express/proxy-addr walks it: index 0 is the socket
 * peer, index k (k >= 1) is the k-th XFF entry counted from the RIGHT. With
 * `trust proxy = n` (numeric), `req.ip` is `chain[min(n, chain.length - 1)]`.
 */
export function buildChainFromRight(socketAddress: string | undefined, xff: string[]): string[] {
  return [socketAddress ?? '', ...[...xff].reverse()];
}

/** What `req.ip` would be for a given numeric hop setting (mirrors proxy-addr). */
export function resolveIpForHops(chainFromRight: string[], hops: number): string {
  const idx = Math.min(Math.max(hops, 0), chainFromRight.length - 1);
  return chainFromRight[idx] ?? '';
}

export interface ProxyTrustDiagnosticInput {
  configuredHops: number;
  socketAddress: string | undefined;
  forwardedFor: string | string[] | undefined;
  reqIp: string | undefined;
  /** The caller's own public IP as they observe it externally; undefined if not supplied. */
  expectedClientIp: string | undefined;
}

export interface ProxyTrustDiagnostic {
  configuredTrustProxyHops: number;
  forwardedForEntryCount: number;
  chainTruncated: boolean;
  socketRemoteAddressClass: AddressClass;
  /** Address classes along the chain; index 0 = socket peer, index k = k-th XFF entry from the right. */
  chainClassesFromRight: AddressClass[];
  reqIp: {
    class: AddressClass;
    /** Raw value only when public (i.e. the caller's own, or a value they supplied); never an internal hop. */
    value: string | null;
    matchesExpectedClientIp: boolean | null;
  };
  expectedClientIpProvided: boolean;
  /**
   * Lowest k >= 1 at which the expected client IP appears in the chain (the
   * entry appended by the nearest proxy that saw the caller). This IS the
   * hop count that makes `req.ip` equal the caller's real address.
   */
  expectedClientIpPositionFromRight: number | null;
  suggestedTrustProxyHops: number | null;
  /** Lowest index in chainClassesFromRight whose class is public; null if none. Independent cross-check on the suggestion. */
  rightmostPublicIndex: number | null;
  currentSettingMatchesSuggestion: boolean | null;
  notes: string[];
}

export function computeProxyTrustDiagnostic(input: ProxyTrustDiagnosticInput): ProxyTrustDiagnostic {
  const xffAll = parseForwardedFor(input.forwardedFor);
  const chainTruncated = xffAll.length > MAX_CHAIN_ENTRIES;
  // Keep the RIGHTMOST entries (the ones proxies appended); anything further left is client-controlled anyway.
  const xff = chainTruncated ? xffAll.slice(xffAll.length - MAX_CHAIN_ENTRIES) : xffAll;
  const chain = buildChainFromRight(input.socketAddress, xff);
  const classes = chain.map((a) => classifyAddress(a));

  const expected = input.expectedClientIp ? normalizeAddress(input.expectedClientIp) : undefined;
  let position: number | null = null;
  if (expected) {
    for (let k = 1; k < chain.length; k++) {
      if (normalizeAddress(chain[k] ?? '') === expected) {
        position = k;
        break;
      }
    }
  }
  const rightmostPublic = classes.findIndex((c) => c === 'public');
  const rightmostPublicIndex = rightmostPublic === -1 ? null : rightmostPublic;

  const reqIpClass = classifyAddress(input.reqIp);
  const reqIpNormalized = input.reqIp ? normalizeAddress(input.reqIp) : '';

  const notes: string[] = [];
  if (xffAll.length === 0) notes.push('no_forwarded_for_header: request did not traverse a proxy that sets X-Forwarded-For');
  if (chainTruncated) notes.push(`forwarded_for_truncated: only the rightmost ${MAX_CHAIN_ENTRIES} entries were examined`);
  if (expected && position === null) {
    notes.push(
      'expected_client_ip_not_in_chain: check the IP family (use curl -4 for both the lookup and the call), VPN/NAT, or that the header value is current',
    );
  }
  if (position !== null && rightmostPublicIndex !== null && position !== rightmostPublicIndex) {
    notes.push('suggestion_disagrees_with_rightmost_public: a public address sits between the caller and this service; do not change the setting, escalate');
  }
  if (reqIpClass !== 'public') notes.push(`req_ip_not_public: current setting resolves req.ip to a ${reqIpClass} address`);

  return {
    configuredTrustProxyHops: input.configuredHops,
    forwardedForEntryCount: xffAll.length,
    chainTruncated,
    socketRemoteAddressClass: classes[0] ?? 'invalid',
    chainClassesFromRight: classes,
    reqIp: {
      class: reqIpClass,
      value: reqIpClass === 'public' ? reqIpNormalized : null,
      matchesExpectedClientIp: expected ? reqIpNormalized === expected : null,
    },
    expectedClientIpProvided: expected !== undefined,
    expectedClientIpPositionFromRight: position,
    suggestedTrustProxyHops: position,
    rightmostPublicIndex,
    currentSettingMatchesSuggestion: position === null ? null : position === input.configuredHops,
    notes,
  };
}

export interface TrustProxyMonitorOptions {
  isProduction: boolean;
  configuredHops: number;
  intervalMs?: number;
  now?: () => number;
  log?: (message: string) => void;
}

/**
 * Runtime alert: in production, when a request that came through a proxy
 * (X-Forwarded-For present) still resolves `req.ip` to a non-public
 * address, emit at most one error line per interval. Requests without XFF
 * (Render's direct health checks, in-cluster calls) and `/api/health*` are
 * ignored — a private socket peer there is expected, not evidence of a
 * misconfiguration. Never logs an address, only its class.
 *
 * Note: this detects hop counts that are too LOW. A count that is too HIGH
 * resolves to a client-supplied entry and cannot be detected from a single
 * request — only the diagnostic endpoint's measurement rules that out.
 */
export function createTrustProxyMonitor(opts: TrustProxyMonitorOptions) {
  const intervalMs = opts.intervalMs ?? TRUST_PROXY_ALERT_INTERVAL_MS;
  const now = opts.now ?? (() => Date.now());
  // eslint-disable-next-line no-console
  const log = opts.log ?? ((m: string) => console.error(m));
  let lastAlertAt: number | null = null;
  let suppressed = 0;

  return function trustProxyMonitor(req: Request, _res: Response, next: NextFunction): void {
    if (!opts.isProduction) return next();
    if (req.path.startsWith('/api/health')) return next();
    if (req.headers['x-forwarded-for'] === undefined) return next();
    const cls = classifyAddress(req.ip);
    if (cls === 'public') return next();
    const t = now();
    if (lastAlertAt !== null && t - lastAlertAt < intervalMs) {
      suppressed++;
      return next();
    }
    log(
      `${TRUST_PROXY_MISCONFIGURED_LOG_TAG} req.ip resolved to a ${cls} address on a proxied request ` +
        `(TRUST_PROXY_HOPS=${opts.configuredHops}); per-IP rate limits and audit-log IPs are degraded. ` +
        `Suppressed since last alert: ${suppressed}. See docs/organization/incidents/INC-003-a28-trust-proxy-runbook.md`,
    );
    lastAlertAt = t;
    suppressed = 0;
    next();
  };
}
