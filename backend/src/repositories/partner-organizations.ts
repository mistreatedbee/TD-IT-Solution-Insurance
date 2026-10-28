/**
 * `partner_organizations` — admin-managed directory of security-company
 * partner organizations. Closes the gap flagged in `routes/invitations.ts`
 * and `src/admin/pages/InviteStaffPage.tsx`: `partnerOrganizationId` has been
 * writable on invitations/accounts since Feature 001 (Postgres
 * `app.accounts.partner_organization_id uuid`, migrations/030) and on
 * recovery cases (`recovery-cases.ts`, stored as a bare string) with nothing
 * backing it — no directory of which organizations those ids refer to, and
 * no way for admin to create one for any org beyond whatever id ops typed in
 * by hand.
 *
 * Mongo, not Postgres, per ADR-0002: a partner organization is domain data
 * (who the security-company partner is, its operating status), not identity
 * data. The identity-side link is `app.accounts.partner_organization_id`
 * (Postgres, uuid) — this collection's `id` is deliberately a v4 UUID string,
 * not a Mongo `ObjectId`, so the two sides use the same id shape and no
 * migration of the existing `uuid` column/invitations schema
 * (`z.string().uuid()` in `routes/invitations.ts`) is needed to adopt it.
 * Recovery cases (`repositories/recovery-cases.ts`) store
 * `partnerOrganizationId` as an unconstrained `string | null` — a UUID string
 * id here is compatible with that field as-is, no change required there.
 */
import { randomUUID } from 'node:crypto';
import type { Db, Collection } from 'mongodb';

export type PartnerOrganizationStatus = 'active' | 'suspended';

export interface PartnerOrganizationDocument {
  id: string;
  name: string;
  status: PartnerOrganizationStatus;
  contactEmail: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PartnerOrganizationRow {
  _id: string;
  name: string;
  status: PartnerOrganizationStatus;
  contactEmail: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const PARTNER_ORGANIZATIONS_COLLECTION = 'partner_organizations';

function toDocument(row: PartnerOrganizationRow): PartnerOrganizationDocument {
  return {
    id: row._id,
    name: row.name,
    status: row.status,
    contactEmail: row.contactEmail,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createPartnerOrganizationsRepo(db: Db) {
  const collection = (): Collection<PartnerOrganizationRow> =>
    db.collection<PartnerOrganizationRow>(PARTNER_ORGANIZATIONS_COLLECTION);

  return {
    async listAll(): Promise<PartnerOrganizationDocument[]> {
      const rows = await collection().find({}).sort({ name: 1 }).toArray();
      return rows.map(toDocument);
    },

    async findById(id: string): Promise<PartnerOrganizationDocument | null> {
      const row = await collection().findOne({ _id: id });
      return row ? toDocument(row) : null;
    },

    async create(input: { name: string; contactEmail: string; notes: string | null }): Promise<PartnerOrganizationDocument> {
      const now = new Date();
      const row: PartnerOrganizationRow = {
        _id: randomUUID(),
        name: input.name,
        status: 'active',
        contactEmail: input.contactEmail,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      await collection().insertOne(row);
      return toDocument(row);
    },

    async updateById(
      id: string,
      patch: Partial<Pick<PartnerOrganizationDocument, 'name' | 'status' | 'contactEmail' | 'notes'>>,
    ): Promise<PartnerOrganizationDocument | null> {
      const now = new Date();
      const result = await collection().findOneAndUpdate(
        { _id: id },
        { $set: { ...patch, updatedAt: now } },
        { returnDocument: 'after' },
      );
      return result ? toDocument(result) : null;
    },
  };
}

export type PartnerOrganizationsRepo = ReturnType<typeof createPartnerOrganizationsRepo>;
