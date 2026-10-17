/**
 * Demo seam: replaces window.fetch so (a) calls to the dashboard API base are answered from
 * in-memory fake data, and (b) any other cross-origin request is refused. Real auth/client code
 * is untouched; it simply talks to this fake "server". Same-origin (Vite dev assets) pass through.
 */
import { API_BASE_URL } from '../../dashboard/api/config';
import { PRIVILEGED_DASHBOARD_CONFIG } from '../../dashboard/auth/roleRouting';
import { createDemoStore, handleDemoRequest, type DemoStore } from './handlers';

let installed = false;

export function installDemo(): DemoStore {
  const store = createDemoStore();
  if (installed) return store;
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const abs = new URL(href, window.location.href);
    if (href.startsWith(API_BASE_URL)) {
      const method = (init?.method ?? 'GET').toUpperCase();
      let body: unknown;
      try {
        body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      } catch {
        body = undefined;
      }
      await new Promise((r) => setTimeout(r, 150));
      return handleDemoRequest(store, method, href.slice(API_BASE_URL.length), body);
    }
    if (abs.origin === window.location.origin) return realFetch(input, init);
    return new Response(JSON.stringify({ error: { message: 'Blocked: demo mode makes no external calls.' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    sessionStorage.setItem(PRIVILEGED_DASHBOARD_CONFIG.security_company_operator.storageKey, 'demo-refresh');
  } catch {
    /* ignore */
  }
  return store;
}
