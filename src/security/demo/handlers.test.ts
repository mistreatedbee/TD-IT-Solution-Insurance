import { describe, expect, it } from 'vitest';
import { createDemoStore, handleDemoRequest } from './handlers';
import { DEMO_ORG_NAME } from './data';

const call = async (store: ReturnType<typeof createDemoStore>, m: string, p: string, b?: unknown) => {
  const r = handleDemoRequest(store, m, p, b);
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};

describe('security demo fake API', () => {
  it('serves account/me as a fictional operator', async () => {
    const { body } = await call(createDemoStore(), 'GET', '/account/me');
    expect(body.userType).toBe('security_company_operator');
    expect(body.email).toBe('demo.operator@example.invalid');
  });

  it('lists a first page of 5 visible cases with real shapes (offer tier omits asset/notes), hasMore true', async () => {
    const { body } = await call(createDemoStore(), 'GET', '/security/cases');
    expect(body.data.length).toBe(5);
    expect(body.pagination.hasMore).toBe(true);
    expect(typeof body.pagination.nextCursor).toBe('string');
    const offer = body.data.find((c: { partnerOrganizationId: unknown }) => c.partnerOrganizationId === null);
    expect(offer.assetId).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/@(?!example\.invalid)/);
  });

  it('"Load more" (cursor) reaches the final page with hasMore false and no overlap/gaps', async () => {
    const s = createDemoStore();
    const page1 = (await call(s, 'GET', '/security/cases')).body;
    expect(page1.pagination.hasMore).toBe(true);
    const page2 = (await call(s, 'GET', `/security/cases?cursor=${page1.pagination.nextCursor}`)).body;
    expect(page2.pagination).toEqual({ nextCursor: null, hasMore: false });
    expect(page2.data.length).toBe(9 - page1.data.length);
    const allIds = [...page1.data, ...page2.data].map((c: { id: string }) => c.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('rejects a malformed cursor', async () => {
    const r = await call(createDemoStore(), 'GET', '/security/cases?cursor=not-valid-base64-offset');
    expect(r.status).toBe(400);
  });

  it('count matches the open filter', async () => {
    const s = createDemoStore();
    const list = await call(s, 'GET', '/security/cases?status=open');
    const count = await call(s, 'GET', '/security/cases/count?status=open');
    expect(count.body.data.count).toBe(list.body.data.length);
  });

  it('claim then forward status updates mutate in-memory; backward is 409', async () => {
    const s = createDemoStore();
    const open = (await call(s, 'GET', '/security/cases?status=open')).body.data.find(
      (c: { partnerOrganizationId: unknown }) => c.partnerOrganizationId === null,
    );
    expect((await call(s, 'PATCH', `/security/cases/${open.id}`, { status: 'tracking' })).status).toBe(404);
    const claimed = await call(s, 'POST', `/security/cases/${open.id}/claim`);
    expect(claimed.body.status).toBe('investigating');
    expect(claimed.body.assetId).toBeDefined();
    expect((await call(s, 'POST', `/security/cases/${open.id}/claim`)).status).toBe(404);
    expect((await call(s, 'PATCH', `/security/cases/${open.id}`, { status: 'tracking' })).body.status).toBe('tracking');
    expect((await call(s, 'PATCH', `/security/cases/${open.id}`, { status: 'investigating' })).status).toBe(409);
    expect((await call(s, 'GET', `/security/cases/${open.id}`)).body.status).toBe('tracking');
  });

  it('a freshly-claimed case (demo case 9) is claimed-tier with notes/lastLocationAt explicitly null, not omitted', async () => {
    const { body } = await call(createDemoStore(), 'GET', '/security/cases?status=investigating');
    const fresh = body.data.find((c: { notes: unknown }) => c.notes === null);
    expect(fresh).toBeDefined();
    expect(fresh.assetId).toBeDefined();
    expect(fresh.lastLocationAt).toBeNull();
  });

  it('"open" count recomputes live from in-memory state after a claim (mirrors the Home page count badge)', async () => {
    const s = createDemoStore();
    const before = (await call(s, 'GET', '/security/cases/count?status=open')).body.data.count;
    const open = (await call(s, 'GET', '/security/cases?status=open')).body.data[0];
    await call(s, 'POST', `/security/cases/${open.id}/claim`);
    const after = (await call(s, 'GET', '/security/cases/count?status=open')).body.data.count;
    expect(after).toBe(before - 1);
  });

  it('rejects a status change on a closed case as a forward-only (409) violation, not silently', async () => {
    const s = createDemoStore();
    const closed = (await call(s, 'GET', '/security/cases?status=closed')).body.data[0];
    const r = await call(s, 'PATCH', `/security/cases/${closed.id}`, { status: 'tracking' });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/cannot move backward/);
  });

  it('unknown paths 404 and org name is exact', async () => {
    expect((await call(createDemoStore(), 'GET', '/elsewhere')).status).toBe(404);
    expect(DEMO_ORG_NAME).toBe('Vukani Asset Protection & Recovery (Pty) Ltd (trading as Vukani Recovery)');
  });
});
