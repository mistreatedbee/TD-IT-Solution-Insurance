/**
 * `app.account_audit_log` writes — FR-12, SR-10's `privileged_data_access`
 * event, SR-8's `refresh_token_reuse_detected` and `session_family_revoked`,
 * SR-1's `mfa_enrollment_ticket_issued`/`_rejected`, and `account_locked`,
 * all added by migrations/030 to `app.audit_event_type`; ADR-0006's
 * `privileged_bulk_access` and `privilege_granted` added by migrations/032.
 *
 * `account_id` is nullable by design (a `login_failure` against a
 * non-existent email must still be logged for credential-stuffing
 * detection) — every call site below reflects that, never coercing a
 * missing account to a placeholder id.
 *
 * `account_id` is always the event's **subject** (whose data/state is being
 * read or changed). `actor_account_id` (migrations/031) is the **acting**
 * account when it differs from the subject — the admin issuing an
 * invitation, for example, is the actor, not the subject. Before
 * migrations/031, `app.account_audit_log` had exactly one account column and
 * `routes/invitations.ts`/`routes/internal.ts` disagreed about what it meant
 * for the same `privileged_data_access` event type (api-design.md §11
 * Amendment E's open item, `database-architect`/`backend-architect`
 * finding). Every call site now populates both fields explicitly rather than
 * picking one; either may be `null` when there genuinely is no actor (a
 * service-to-service call with no acting admin account — which records
 * `actorService` instead) or no subject account yet.
 *
 * ADR-0006 (ratified, §16) adds the platform join key to this trail:
 * `actor_service` (AUD-2 — internal callers are not accounts), and
 * `actor_session_id` + `audit_request_id` (AUD-1/AUD-5). The guards in this
 * module mirror migrations/033's `CHECK` constraints deliberately, following
 * the precedent already set for `account_audit_log_failure_has_identifier`:
 * a bug should fail loudly in a unit test, not as an opaque
 * constraint-violation 500 in production.
 *
 * `recordBulkDisclosure()` implements AUD-3(b) in the shape ruling R-1
 * chose — see its own doc comment. There is no bulk call site on the
 * platform yet (no `/admin/*` route exists); the writer lands ahead of the
 * first one so that endpoint cannot be built without it.
 */
import type { Queryable } from './types.js';

export type AuditEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'mfa_enrolled'
  | 'mfa_verified'
  | 'mfa_challenge_failed'
  | 'session_revoked'
  | 'refresh_token_reuse_detected'
  | 'privileged_data_access'
  | 'privileged_bulk_access'
  | 'privilege_granted'
  | 'mfa_enrollment_ticket_issued'
  | 'mfa_enrollment_ticket_rejected'
  | 'account_locked'
  | 'session_family_revoked';

/**
 * Event types that record privileged access to another account's data and
 * therefore require an attributable actor (migrations/033's
 * `account_audit_log_privileged_has_actor`). `privilege_granted` is
 * deliberately NOT in this set: it is a privilege-*granting* action with no
 * subject account at issuance time (ADR-0006 R-2), and it carries its own
 * actor requirement only by convention, not by constraint.
 */
const PRIVILEGED_ACCESS_EVENT_TYPES: ReadonlySet<AuditEventType> = new Set<AuditEventType>([
  'privileged_data_access',
  'privileged_bulk_access',
]);

interface AuditActor {
  /** The acting account, for a bearer-authenticated admin/support request. */
  actorAccountId?: string | null;
  /** The acting service, for an internal service-to-service call — SR-13's
   * per-consumer caller identity (`req.internalCaller`), never a shared
   * literal. Mutually exclusive with `actorAccountId` in practice. */
  actorService?: string | null;
  /** AUD-1's "sitting" element: the actor's `session_id` claim
   * (`req.auth.sessionId`). Null for service callers, which have no session. */
  actorSessionId?: string | null;
  /** AUD-5: `req.auditRequestId` — the server-generated id, never
   * `req.requestId`, which a client may have supplied. */
  auditRequestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditEventInput extends AuditActor {
  /** The event's subject — whose account this event is about. */
  accountId: string | null;
  eventType: AuditEventType;
  attemptedIdentifier?: string | null;
  /** Only ever set on a `privileged_bulk_access` row, and always set on one
   * (migrations/033's `account_audit_log_result_count_only_on_bulk`). Prefer
   * `recordBulkDisclosure()` over setting this by hand. */
  resultCount?: number | null;
}

export interface BulkDisclosureInput extends AuditActor {
  /**
   * The account ids actually present in the materialised result set — not the
   * ids that were queried for, and never the query itself (C-17: admin search
   * terms are routinely a customer's name, email, VIN or device serial). May
   * be empty: a filtered list that matched nothing still records the attempt.
   * Duplicates are collapsed.
   */
  disclosedAccountIds: readonly string[];
}

const COLUMNS =
  'account_id, actor_account_id, actor_service, actor_session_id, audit_request_id, ' +
  'event_type, attempted_identifier, ip_address, user_agent, result_count';
const COLUMN_COUNT = 10;

function rowValues(event: AuditEventInput): unknown[] {
  return [
    event.accountId,
    event.actorAccountId ?? null,
    event.actorService ?? null,
    event.actorSessionId ?? null,
    event.auditRequestId ?? null,
    event.eventType,
    event.attemptedIdentifier ?? null,
    event.ipAddress ?? null,
    event.userAgent ?? null,
    event.resultCount ?? null,
  ];
}

function placeholders(rowCount: number): string {
  return Array.from({ length: rowCount }, (_, row) =>
    `(${Array.from({ length: COLUMN_COUNT }, (__, col) => `$${row * COLUMN_COUNT + col + 1}`).join(', ')})`,
  ).join(', ');
}

/** Mirrors migrations/033's CHECK constraints so a bad write fails here, in a
 * test, rather than as an opaque 23514 in production. */
function assertInvariants(event: AuditEventInput): void {
  // account_audit_log_failure_has_identifier
  if (event.eventType === 'login_failure' && !event.attemptedIdentifier) {
    throw new Error('[repositories/audit-log] login_failure requires attemptedIdentifier');
  }
  // account_audit_log_privileged_has_actor (AUD-2 / R-3): unattributed
  // privileged access is structurally impossible, not merely discouraged.
  if (PRIVILEGED_ACCESS_EVENT_TYPES.has(event.eventType) && !event.actorAccountId && !event.actorService) {
    throw new Error(
      `[repositories/audit-log] ${event.eventType} requires an actor — actorAccountId (admin request) or actorService (internal caller)`,
    );
  }
  // account_audit_log_privileged_access_has_subject (R-1): a
  // privileged_data_access row IS a disclosure record, so it names the
  // subject it disclosed. A bulk list call emits one of these per disclosed
  // subject via recordBulkDisclosure(), never one subject-less row.
  if (event.eventType === 'privileged_data_access' && !event.accountId) {
    throw new Error(
      '[repositories/audit-log] privileged_data_access requires a subject accountId (ADR-0006 AUD-3(b)); privilege-granting actions use privilege_granted, bulk list calls use recordBulkDisclosure()',
    );
  }
  // account_audit_log_result_count_only_on_bulk, both directions.
  const hasResultCount = event.resultCount !== undefined && event.resultCount !== null;
  if (hasResultCount !== (event.eventType === 'privileged_bulk_access')) {
    throw new Error(
      '[repositories/audit-log] resultCount is set on privileged_bulk_access rows and only on those rows',
    );
  }
}

export function createAuditLogRepo(db: Queryable) {
  return {
    async record(event: AuditEventInput): Promise<void> {
      assertInvariants(event);
      await db.query(
        `insert into app.account_audit_log
           (${COLUMNS})
         values ${placeholders(1)}`,
        rowValues(event),
      );
    },

    /**
     * ADR-0006 AUD-3(b), in the shape ruling R-1 chose (§16.1): one
     * `privileged_data_access` row per distinct disclosed subject — shaped
     * identically to a detail read, so the existing
     * `account_audit_log_account_id_created_at` index answers the
     * subject-keyed query with no array containment — **plus** one
     * call-scoped `privileged_bulk_access` row carrying `result_count`,
     * including zero.
     *
     * Ordering matters and is the caller's responsibility (compliance
     * §14.5.4, which flagged that a naive reading of AUD-10 and AUD-3(b)
     * makes them look mutually unsatisfiable): **query → materialise the
     * result → derive the disclosed subjects → call this → serialise the
     * response.** AUD-10 requires the audit write to precede serialisation,
     * not to precede the query.
     *
     * AUD-10 fail-closed: this throws if the write fails, and the caller must
     * let that propagate to a 5xx rather than returning the data. All rows go
     * in one multi-row statement — one round trip, atomic, so the call-scoped
     * row and its subject rows can never land apart.
     */
    async recordBulkDisclosure(input: BulkDisclosureInput): Promise<void> {
      const subjects = [...new Set(input.disclosedAccountIds)];
      const actor: AuditActor = {
        actorAccountId: input.actorAccountId ?? null,
        actorService: input.actorService ?? null,
        actorSessionId: input.actorSessionId ?? null,
        auditRequestId: input.auditRequestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      };

      const rows: AuditEventInput[] = [
        { ...actor, accountId: null, eventType: 'privileged_bulk_access', resultCount: subjects.length },
        ...subjects.map((accountId): AuditEventInput => ({
          ...actor,
          accountId,
          eventType: 'privileged_data_access',
        })),
      ];
      rows.forEach(assertInvariants);

      await db.query(
        `insert into app.account_audit_log
           (${COLUMNS})
         values ${placeholders(rows.length)}`,
        rows.flatMap(rowValues),
      );
    },
  };
}

export type AuditLogRepo = ReturnType<typeof createAuditLogRepo>;
