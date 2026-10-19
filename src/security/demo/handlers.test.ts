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

  it('lists 6-8 visible cases with real shapes (offer tier omits asset/notes)', async () => {
    const { body } = await call(createDemoStore(), 'GET', '/security/cases');
    expect(body.data.length).toBeGreaterThanOrEqual(6);
    expect(body.pagination).toEqual({ nextCursor: null, hasMore: false });
    const offer = body.data.find((c: { partnerOrganizationId: unknown }) => c.partnerOrganizationId === null);
    expect(offer.assetId).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/@(?!example\.invalid)/);
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

  it('unknown paths 404 and org name is exact', async () => {
    expect((await call(createDemoStore(), 'GET', '/elsewhere')).status).toBe(404);
    expect(DEMO_ORG_NAME).toBe('Vukani Asset Protection & Recovery (Pty) Ltd (trading as Vukani Recovery)');
  });
});
