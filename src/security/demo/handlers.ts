import {
  buildDemoCases,
  DEMO_ACCOUNT,
  DEMO_ORG_ID,
  isForward,
  serializeDemoCase,
  type DemoCase,
} from './data';
import type { SecurityCaseStatus } from '../api/cases';

const STATUSES: SecurityCaseStatus[] = ['open', 'investigating', 'tracking', 'recovered', 'closed'];

export interface DemoStore {
  cases: DemoCase[];
}
export function createDemoStore(now?: number): DemoStore {
  return { cases: buildDemoCases(now) };
}

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const err = (status: number, code: string, message: string) => json(status, { error: { code, message } });

/**
 * Fake of the API paths the security dashboard calls. `path` is relative to /api/v1.
 * Returns null for paths it does not know (caller answers 404 - never the network).
 */
export function handleDemoRequest(
  store: DemoStore,
  method: string,
  path: string,
  body: unknown,
): Response {
  const url = new URL(path, 'http://demo.invalid');
  const p = url.pathname;

  if (method === 'POST' && p === '/session/refresh') {
    return json(200, { accessToken: 'demo-access', refreshToken: 'demo-refresh', sessionId: 'demo-session' });
  }
  if (method === 'POST' && p === '/auth/login') {
    return json(200, { accessToken: 'demo-access', refreshToken: 'demo-refresh', sessionId: 'demo-session', expiresIn: 900 });
  }
  if (method === 'POST' && p === '/session/logout') return new Response(null, { status: 204 });
  if (method === 'GET' && p === '/account/me') return json(200, DEMO_ACCOUNT);

  const visible = (c: DemoCase) =>
    c.partnerOrganizationId === DEMO_ORG_ID || (c.partnerOrganizationId === null && c.status === 'open');
  const statusFilter = url.searchParams.get('status');
  const filtered = () =>
    store.cases.filter(visible).filter((c) => !statusFilter || c.status === statusFilter);

  if (statusFilter && !STATUSES.includes(statusFilter as SecurityCaseStatus)) {
    return err(400, 'VALIDATION_ERROR', 'Invalid status.');
  }

  if (method === 'GET' && p === '/security/cases') {
    const rows = filtered().sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
    return json(200, { data: rows.map(serializeDemoCase), pagination: { nextCursor: null, hasMore: false } });
  }
  if (method === 'GET' && p === '/security/cases/count') {
    return json(200, { data: { count: filtered().length } });
  }

  const m = p.match(/^\/security\/cases\/([0-9a-f]{24})(\/claim)?$/);
  if (m) {
    const c = store.cases.find((x) => x.id === m[1]);
    if (!c || !visible(c)) return err(404, 'NOT_FOUND', 'Not found.');
    if (method === 'GET' && !m[2]) return json(200, serializeDemoCase(c));
    if (method === 'POST' && m[2]) {
      if (c.partnerOrganizationId !== null || c.status !== 'open') {
        return err(404, 'NOT_FOUND', 'Case is not available to claim.');
      }
      c.partnerOrganizationId = DEMO_ORG_ID;
      c.status = 'investigating';
      c.notes = 'Claimed in demo. Fictional case.';
      c.updatedAt = new Date().toISOString();
      return json(200, serializeDemoCase(c));
    }
    if (method === 'PATCH' && !m[2]) {
      const next = (body as { status?: SecurityCaseStatus } | undefined)?.status;
      if (!next || !STATUSES.includes(next)) return err(400, 'VALIDATION_ERROR', 'Invalid status.');
      if (c.partnerOrganizationId === null) return err(404, 'NOT_FOUND', 'Not found.');
      if (!isForward(c.status, next)) return err(409, 'CONFLICT', 'Case status cannot move backward.');
      c.status = next;
      if (next === 'tracking' && !c.lastLocationAt) c.lastLocationAt = new Date().toISOString();
      c.updatedAt = new Date().toISOString();
      return json(200, serializeDemoCase(c));
    }
  }
  return err(404, 'NOT_FOUND', 'Not found.');
}
