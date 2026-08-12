/**
 * `admin_access_log` writes — Trail B privileged-access audit for Feature 004
 * admin policy/asset reads (database-addendum-001.md §1.2, ADR-0006 R-1).
 *
 * Mirrors `repositories/audit-log.ts`'s invariants on Trail A: a bulk list call
 * emits one `privileged_data_access` row per distinct disclosed subject plus one
 * call-scoped `privileged_bulk_access` row carrying `resultCount` (documents
 * returned in the page, including zero).
 */
import { ObjectId, type Db, type Collection } from 'mongodb';

export type AdminAccessResourceType = 'policy' | 'asset';
export type AdminAccessEventType = 'privileged_data_access' | 'privileged_bulk_access';

interface AdminAccessLogDbRow {
  eventType: AdminAccessEventType;
  actorAccountId: string;
  actorSessionId: string;
  auditRequestId: string | null;
  targetAccountId: string | null;
  resourceType: AdminAccessResourceType;
  resourceId: ObjectId | null;
  resultCount: number | null;
  endpoint: string;
  ipAddress: string | null;
  userAgent: string | null;
  legalHold: boolean;
  createdAt: Date;
}

interface AdminAccessActor {
  actorAccountId: string;
  actorSessionId: string;
  auditRequestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AdminAccessDetailInput extends AdminAccessActor {
  targetAccountId: string;
  resourceType: AdminAccessResourceType;
  resourceId: string;
  endpoint: string;
}

export interface AdminAccessBulkDisclosureInput extends AdminAccessActor {
  /** Distinct account ids present in the materialised result page. */
  disclosedAccountIds: readonly string[];
  resourceType: AdminAccessResourceType;
  endpoint: string;
  /** Documents returned in the page (Trail B semantic — not distinct-subject count). */
  resultCount: number;
}

/** Mirrors addendum-001 §1.3 / migrations/033 CHECK constraints — fail in tests, not as opaque 500s. */
function assertInvariants(row: AdminAccessLogDbRow): void {
  if (!row.actorAccountId || !row.actorSessionId) {
    throw new Error('[repositories/admin-access-log] actorAccountId and actorSessionId are required');
  }
  if (row.eventType === 'privileged_data_access') {
    if (!row.targetAccountId) {
      throw new Error(
        '[repositories/admin-access-log] privileged_data_access requires targetAccountId (ADR-0006 R-1)',
      );
    }
    if (row.resultCount !== null) {
      throw new Error('[repositories/admin-access-log] privileged_data_access must have resultCount null');
    }
  }
  if (row.eventType === 'privileged_bulk_access') {
    if (row.targetAccountId !== null) {
      throw new Error('[repositories/admin-access-log] privileged_bulk_access requires targetAccountId null');
    }
    if (row.resultCount === null || row.resultCount < 0) {
      throw new Error('[repositories/admin-access-log] privileged_bulk_access requires resultCount >= 0');
    }
  }
}

export function createAdminAccessLogRepo(db: Db) {
  const collection = (): Collection<AdminAccessLogDbRow> =>
    db.collection<AdminAccessLogDbRow>('admin_access_log');

  return {
    async recordDetail(input: AdminAccessDetailInput): Promise<void> {
      const row: AdminAccessLogDbRow = {
        eventType: 'privileged_data_access',
        actorAccountId: input.actorAccountId,
        actorSessionId: input.actorSessionId,
        auditRequestId: input.auditRequestId ?? null,
        targetAccountId: input.targetAccountId,
        resourceType: input.resourceType,
        resourceId: new ObjectId(input.resourceId),
        resultCount: null,
        endpoint: input.endpoint,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        legalHold: false,
        createdAt: new Date(),
      };
      assertInvariants(row);
      await collection().insertOne(row);
    },

    /**
     * ADR-0006 R-1 on Trail B: one `privileged_bulk_access` row (with
     * `resultCount` = documents returned) plus one `privileged_data_access`
     * row per distinct disclosed subject. Single `insertMany`, unordered.
     */
    async recordBulkDisclosure(input: AdminAccessBulkDisclosureInput): Promise<void> {
      const subjects = [...new Set(input.disclosedAccountIds)];
      const now = new Date();
      const shared = {
        actorAccountId: input.actorAccountId,
        actorSessionId: input.actorSessionId,
        auditRequestId: input.auditRequestId ?? null,
        resourceType: input.resourceType,
        endpoint: input.endpoint,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        legalHold: false,
        createdAt: now,
      };

      const rows: AdminAccessLogDbRow[] = [
        {
          ...shared,
          eventType: 'privileged_bulk_access',
          targetAccountId: null,
          resourceId: null,
          resultCount: input.resultCount,
        },
        ...subjects.map(
          (targetAccountId): AdminAccessLogDbRow => ({
            ...shared,
            eventType: 'privileged_data_access',
            targetAccountId,
            resourceId: null,
            resultCount: null,
          }),
        ),
      ];
      rows.forEach(assertInvariants);
      await collection().insertMany(rows, { ordered: false });
    },
  };
}

export type AdminAccessLogRepo = ReturnType<typeof createAdminAccessLogRepo>;
