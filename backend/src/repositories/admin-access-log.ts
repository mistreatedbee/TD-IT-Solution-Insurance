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

// ADR-0006 §18 — widened to add 'recovery_case' for Security Company Dashboard
// partner-operator reads/decisions (RR-012-2 closure, PDM-8). Per §18.2, this is an
// additive extension of an existing trail (Trail B), not a new store/correlation
// mechanism — `admin_access_log` is now written to by `security_company_operator`
// actors too, not only `admin` (naming note, non-blocking, flagged to
// `database-architect` for a future rename to `privileged_access_log`).
export type AdminAccessResourceType = 'policy' | 'asset' | 'recovery_case';
// ADR-0006 §18.4 — 'privileged_state_change' records an operator DECISION (a claim or
// a status transition), not a read/disclosure. Same collection, same join key, same
// retention clock, per §18.2's "extend, don't fork" ruling (confirmed by
// cybersecurity-architect, §18.8).
export type AdminAccessEventType =
  | 'privileged_data_access'
  | 'privileged_bulk_access'
  | 'privileged_state_change';

interface AdminAccessLogDbRow {
  eventType: AdminAccessEventType;
  actorAccountId: string;
  actorSessionId: string;
  auditRequestId: string | null;
  targetAccountId: string | null;
  resourceType: AdminAccessResourceType;
  resourceId: ObjectId | null;
  resultCount: number | null;
  // ADR-0006 §18.4 — required if and only if eventType === 'privileged_state_change'.
  // Null for every read event type.
  fromStatus: string | null;
  toStatus: string | null;
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

/**
 * ADR-0006 §18.3 — the recovery-case list route departs from
 * `recordBulkDisclosure()`'s subject-deduped shape on purpose: AUD-9's C-16(b)
 * purpose/case-reference requirement applies to this domain (unlike
 * policy/asset Trail B reads), and a customer can have more than one case, so
 * deduping by subject would silently drop which case(s) were disclosed — the one
 * fact C-16(b) exists to preserve. One row per case present in the page, NOT
 * deduped by subject: a subject with two cases on one page produces two rows.
 */
export interface AdminAccessCaseBulkDisclosureInput extends AdminAccessActor {
  /** One entry per case present in the returned page — not deduped. */
  disclosedCases: ReadonlyArray<{ accountId: string; caseId: string }>;
  endpoint: string;
}

/**
 * ADR-0006 §18.4 — a decision record (claim / status-change), not a disclosure.
 * `resourceId` is the case reference C-16(b) requires — it must come from the
 * database row returned by the query that performed the mutation, never from the
 * `:caseId` request path parameter (cybersecurity-architect ruling §18.8(a)(1)).
 */
export interface AdminAccessStateChangeInput extends AdminAccessActor {
  targetAccountId: string;
  resourceType: 'recovery_case';
  resourceId: string;
  fromStatus: string;
  toStatus: string;
  endpoint: string;
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
    if (row.fromStatus !== null || row.toStatus !== null) {
      throw new Error('[repositories/admin-access-log] privileged_data_access must have fromStatus/toStatus null');
    }
  }
  if (row.eventType === 'privileged_bulk_access') {
    if (row.targetAccountId !== null) {
      throw new Error('[repositories/admin-access-log] privileged_bulk_access requires targetAccountId null');
    }
    if (row.resultCount === null || row.resultCount < 0) {
      throw new Error('[repositories/admin-access-log] privileged_bulk_access requires resultCount >= 0');
    }
    if (row.fromStatus !== null || row.toStatus !== null) {
      throw new Error('[repositories/admin-access-log] privileged_bulk_access must have fromStatus/toStatus null');
    }
  }
  // ADR-0006 §18.4 — a decision always names a subject and a resource (no "bulk"
  // variant of a decision) and always carries both the from- and to-status.
  if (row.eventType === 'privileged_state_change') {
    if (!row.targetAccountId) {
      throw new Error(
        '[repositories/admin-access-log] privileged_state_change requires targetAccountId (ADR-0006 §18.4)',
      );
    }
    if (!row.resourceId) {
      throw new Error('[repositories/admin-access-log] privileged_state_change requires resourceId (C-16(b))');
    }
    if (row.resultCount !== null) {
      throw new Error('[repositories/admin-access-log] privileged_state_change must have resultCount null');
    }
    if (!row.fromStatus || !row.toStatus) {
      throw new Error('[repositories/admin-access-log] privileged_state_change requires fromStatus and toStatus');
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
        fromStatus: null,
        toStatus: null,
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
          fromStatus: null,
          toStatus: null,
        },
        ...subjects.map(
          (targetAccountId): AdminAccessLogDbRow => ({
            ...shared,
            eventType: 'privileged_data_access',
            targetAccountId,
            resourceId: null,
            resultCount: null,
            fromStatus: null,
            toStatus: null,
          }),
        ),
      ];
      rows.forEach(assertInvariants);
      await collection().insertMany(rows, { ordered: false });
    },

    /**
     * ADR-0006 §18.3 — recovery-case list reads. Per-case, NOT deduped by
     * subject (see `AdminAccessCaseBulkDisclosureInput` doc comment): one
     * `privileged_bulk_access` row (`resultCount` = cases returned) plus one
     * `privileged_data_access` row per case in `disclosedCases`, even if the
     * same subject appears twice because they have two cases on the page.
     * Single `insertMany`, unordered — mirrors `recordBulkDisclosure()`'s own
     * atomicity and AUD-10 fail-closed contract exactly.
     */
    async recordCaseBulkDisclosure(input: AdminAccessCaseBulkDisclosureInput): Promise<void> {
      const now = new Date();
      const shared = {
        actorAccountId: input.actorAccountId,
        actorSessionId: input.actorSessionId,
        auditRequestId: input.auditRequestId ?? null,
        resourceType: 'recovery_case' as const,
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
          resultCount: input.disclosedCases.length,
          fromStatus: null,
          toStatus: null,
        },
        ...input.disclosedCases.map(
          ({ accountId, caseId }): AdminAccessLogDbRow => ({
            ...shared,
            eventType: 'privileged_data_access',
            targetAccountId: accountId,
            resourceId: new ObjectId(caseId),
            resultCount: null,
            fromStatus: null,
            toStatus: null,
          }),
        ),
      ];
      rows.forEach(assertInvariants);
      await collection().insertMany(rows, { ordered: false });
    },

    /**
     * ADR-0006 §18.4 — a decision record for a claim or a status transition.
     * AUD-10 fail-closed: this throws if the write fails and the caller MUST
     * let that propagate to a 5xx without performing the mutation (§18.4 /
     * §18.8(b) ruling: write-audit-before-mutate for this event type only).
     */
    async recordStateChange(input: AdminAccessStateChangeInput): Promise<void> {
      const row: AdminAccessLogDbRow = {
        eventType: 'privileged_state_change',
        actorAccountId: input.actorAccountId,
        actorSessionId: input.actorSessionId,
        auditRequestId: input.auditRequestId ?? null,
        targetAccountId: input.targetAccountId,
        resourceType: input.resourceType,
        resourceId: new ObjectId(input.resourceId),
        resultCount: null,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        endpoint: input.endpoint,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        legalHold: false,
        createdAt: new Date(),
      };
      assertInvariants(row);
      await collection().insertOne(row);
    },
  };
}

export type AdminAccessLogRepo = ReturnType<typeof createAdminAccessLogRepo>;
