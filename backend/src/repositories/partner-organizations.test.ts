/**
 * Partner-organizations directory — CRUD + id-shape guarantees.
 * Live-Mongo integration test, same "skip if unavailable locally" posture as
 * `plan-catalog.test.ts`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MongoClient } from 'mongodb';
import { createPartnerOrganizationsRepo } from './partner-organizations.js';

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const DB_NAME_PREFIX = 'tdit_partner_orgs_test';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('partner organizations repository', () => {
  let client: MongoClient;
  let dbName: string;

  beforeEach(async () => {
    dbName = `${DB_NAME_PREFIX}_${Math.random().toString(36).slice(2)}`;
    client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 2_000 });
    try {
      await client.connect();
    } catch {
      return;
    }
    await client.db(dbName).dropDatabase().catch(() => undefined);
  });

  async function withRepo<T>(fn: (repo: ReturnType<typeof createPartnerOrganizationsRepo>) => Promise<T>): Promise<T | undefined> {
    if (!client.topology?.isConnected()) return undefined;
    const repo = createPartnerOrganizationsRepo(client.db(dbName));
    try {
      return await fn(repo);
    } finally {
      await client.close();
    }
  }

  it('creates an org with a v4-UUID id — matches app.accounts.partner_organization_id (uuid) and the invitations z.string().uuid() schema', async () => {
    const result = await withRepo(async (repo) => {
      const created = await repo.create({ name: 'Acme Recovery', contactEmail: 'ops@acme.example', notes: null });
      expect(created.id).toMatch(UUID_RE);
      expect(created.status).toBe('active');
      expect(created.name).toBe('Acme Recovery');
      return created;
    });
    if (result === undefined) return;
  });

  it('lists orgs sorted by name and finds by id', async () => {
    await withRepo(async (repo) => {
      await repo.create({ name: 'Zeta Security', contactEmail: 'zeta@example.com', notes: null });
      const alpha = await repo.create({ name: 'Alpha Security', contactEmail: 'alpha@example.com', notes: null });

      const all = await repo.listAll();
      expect(all.map((o) => o.name)).toEqual(['Alpha Security', 'Zeta Security']);

      const found = await repo.findById(alpha.id);
      expect(found?.id).toBe(alpha.id);

      const missing = await repo.findById('00000000-0000-4000-8000-000000000000');
      expect(missing).toBeNull();
    });
  });

  it('updates fields, including suspending an org, and bumps updatedAt', async () => {
    await withRepo(async (repo) => {
      const created = await repo.create({ name: 'Beta Security', contactEmail: 'beta@example.com', notes: null });
      const updated = await repo.updateById(created.id, { status: 'suspended', notes: 'contract lapsed' });
      expect(updated?.status).toBe('suspended');
      expect(updated?.notes).toBe('contract lapsed');
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });
  });

  it('returns null updating an unknown id', async () => {
    await withRepo(async (repo) => {
      const updated = await repo.updateById('00000000-0000-4000-8000-000000000000', { name: 'X' });
      expect(updated).toBeNull();
    });
  });
});
