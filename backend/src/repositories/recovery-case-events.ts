/**
 * `recovery_case_events` — OB-04 case-history/event-model append-only collection.
 *
 * Design: docs/features/019-case-history-timeline/backend-architecture-event-model.md
 * (§1-§8 backend-architect), §9 (cybersecurity-architect, chair, SR-019-1..9),
 * §10 (security-engineer, concurs, adds SR-019-10), §11 (compliance-specialist,
 * rules RR-019-B — 12-month operator-id retention, lockstep with
 * `ADMIN_ACCESS_LOG_RETENTION_MONTHS`). All three Stage 8 signatures are recorded;
 * this file implements the build-blocking conditions (SR-019-1..8).
 *
 * STRUCTURAL GUARANTEES (do not weaken without a fresh Stage 8 review):
 *  - Append-only: this module exports exactly `append` and `listForCase` (plus
 *    types/constants). No update/delete export exists (SR-019-8). The one
 *    sanctioned non-append write (the 12-month actor-id purge, SR-019-9/§11.2) is a
 *    separate job module (`lib/recovery-case-event-actor-purge.ts`) that reaches
 *    into the collection directly, outside this repository.
 *  - No location/coordinate/free-text field anywhere, and no open `metadata` bag
 *    (SR-019-4). `append()` validates every input through a `.strict()` zod
 *    discriminated union on `eventType`; the inserted document is built field by
 *    field from the PARSED value, never by spreading the caller's input.
 *  - Actor minimisation (SR-019-6): a `'customer'` actor is always stored with
 *    `accountId: null` (redundant with the parent case's own `accountId`). A
 *    `'security_company_operator'` actor is stored as an opaque UUID only.
 *  - Allowed actor per event type is enforced here, not left to the caller
 *    (SR-019-5(a)): `case_created` -> customer; every other event type in this
 *    build -> security_company_operator. `support_agent`/`system` stay in the
 *    TypeScript union (§2.3) but no event type accepts them yet.
 */
import { ObjectId, type Collection, type Db, type IndexDescription } from 'mongodb';
import { z } from 'zod';
import type { MongoDecodedCursor } from '../lib/mongo-pagination.js';
import { mongoCursorFilter } from '../lib/mongo-pagination.js';
import {
  RECOVERY_CASE_CLOSE_REASONS,
  type RecoveryCaseCloseReason,
  type RecoveryCaseStatus,
} from './recovery-cases.js';

export const RECOVERY_CASE_EVENTS_COLLECTION = 'recovery_case_events';

/**
 * §2.2 (backend-architect) — fixed vocabulary, 1:1 with the lifecycle transitions
 * `recovery-cases.ts`/`security-cases.ts` already have TODAY, confirmed against
 * the code post-OB-03-Tier-A (see this feature's build report for the discrepancy
 * notes). Deliberately does NOT cover (per §9.1's chair finding, confirmed again
 * at build time):
 *   - `appendCallCentreNote` (`support-lookup.ts`) — call-centre notes.
 *   - `setPoliceReportFields` (`recovery.ts` PATCH .../police-report) — customer
 *     police-report field updates. Must NEVER become an event type while
 *     SR-011-1's exclusion discipline governs only `recovery_cases` (§9.1).
 *   - `police-report-retention.ts`'s field-purge `updateMany`.
 *   - The demo-teardown raw `deleteMany` in
 *     `scripts/seed-demo-security-dashboard.ts`.
 *   - OB-03 Tier A's dispatch-model `accept` route (`acceptDispatchedCase`) is
 *     mapped onto the SAME `case_claimed` event type as the pool model's `claim`
 *     (an accept is semantically "this org took the case"). Dispatch-mode
 *     `status_changed`/`customer_contact_initiated` reuse the same event types as
 *     the pool model, for the same reasons. Hand-back (`handBackAcceptedCase`) is
 *     a DIFFERENT transition from pool-mode `release` — it keeps status and
 *     returns the case to the admin dispatch queue rather than the open pool — so
 *     it gets its own event type, `case_handed_back` (cto ruling §12.1(2) of the
 *     design doc). `decline` (`declineDispatchedCase`) is NOT appended at all in
 *     this build (§12.1(3) — deferred to a future dispatch-lifecycle event family
 *     with its own `admin` actor type; the decline call site carries a comment
 *     pointing here).
 */
export const RECOVERY_CASE_EVENT_TYPES = [
  'case_created',
  'case_claimed',
  'status_changed',
  'case_released',
  'case_reassigned',
  'customer_contact_initiated',
  'case_handed_back',
] as const;
export type RecoveryCaseEventType = (typeof RECOVERY_CASE_EVENT_TYPES)[number];

/** §2.3 — who/what caused the event. `support_agent`/`system` are reserved for a
 * future event type (SR-019-5(a)) — nothing in this build's `append()` schema
 * accepts them. */
export interface RecoveryCaseEventActor {
  type: 'customer' | 'security_company_operator' | 'support_agent' | 'system';
  accountId: string | null;
  partnerOrganizationId: string | null;
}

const RECOVERY_CASE_STATUSES = ['open', 'investigating', 'tracking', 'recovered', 'closed'] as const;

export interface RecoveryCaseEventDocument {
  id: string;
  caseId: string;
  eventType: RecoveryCaseEventType;
  occurredAt: Date;
  actor: RecoveryCaseEventActor;
  fromStatus: RecoveryCaseStatus | null;
  toStatus: RecoveryCaseStatus | null;
  fromPartnerOrganizationId: string | null;
  toPartnerOrganizationId: string | null;
  closeReason: RecoveryCaseCloseReason | null;
  /** SR-019-2(b) — join key for the (deferred, RR-019-A) reconciliation job and for
   * the SR-019-2(c) partial-unique dedup index. Dedupes only a same-server-side-
   * attempt replay sharing one `auditRequestId` (e.g. an internal retry) — it does
   * NOT dedupe a fresh client-level HTTP retry, which carries its own fresh
   * `auditRequestId` (security-engineer §10.3.2 — documented here, not just in the
   * design doc, so a future reader doesn't assume broader protection). */
  auditRequestId: string | null;
  createdAt: Date;
}

interface RecoveryCaseEventDbRow {
  _id: ObjectId;
  caseId: ObjectId;
  eventType: RecoveryCaseEventType;
  occurredAt: Date;
  actor: RecoveryCaseEventActor;
  fromStatus: RecoveryCaseStatus | null;
  toStatus: RecoveryCaseStatus | null;
  fromPartnerOrganizationId: string | null;
  toPartnerOrganizationId: string | null;
  closeReason: RecoveryCaseCloseReason | null;
  auditRequestId: string | null;
  createdAt: Date;
}

function toEvent(row: RecoveryCaseEventDbRow): RecoveryCaseEventDocument {
  return {
    id: row._id.toHexString(),
    caseId: row.caseId.toHexString(),
    eventType: row.eventType,
    occurredAt: row.occurredAt,
    actor: row.actor,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    fromPartnerOrganizationId: row.fromPartnerOrganizationId,
    toPartnerOrganizationId: row.toPartnerOrganizationId,
    closeReason: row.closeReason,
    auditRequestId: row.auditRequestId,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// §3 indexes (SR-019-2(c), SR-019-7(d))
// ---------------------------------------------------------------------------

export const recoveryCaseEventsIndexes: IndexDescription[] = [
  // SR-019-7(d) — the admin read path reuses mongoCursorFilter/buildPage as-is:
  // sort { createdAt: -1, _id: -1 }, same convention as every other paginated
  // collection in this codebase (not { occurredAt, caseId } as §3's original
  // design proposed, which `mongoCursorFilter` cannot page).
  { key: { caseId: 1, createdAt: -1 }, name: 'recovery_case_events_caseId_createdAt' },
  // §3 — "when was this case claimed" (claimedAt derivation) without a full scan.
  { key: { caseId: 1, eventType: 1 }, name: 'recovery_case_events_caseId_eventType' },
  // SR-019-2(c) — partial unique index so a same-attempt replay (same caseId,
  // eventType, auditRequestId) cannot double-append. Only indexes rows that HAVE a
  // string auditRequestId (older/not-yet-set rows are not constrained).
  {
    key: { caseId: 1, eventType: 1, auditRequestId: 1 },
    name: 'recovery_case_events_dedupe_partial',
    unique: true,
    partialFilterExpression: { auditRequestId: { $type: 'string' } },
  },
];

async function collectionExists(db: Db, name: string): Promise<boolean> {
  const found = await db.listCollections({ name }, { nameOnly: true }).toArray();
  return found.length > 0;
}

export interface BootstrapRecoveryCaseEventsResult {
  collection: string;
  created: boolean;
  indexes: string[];
}

/** Idempotent bootstrap — creates the collection (no $jsonSchema validator; the
 * zod schema in `append()` is this collection's sole shape gate, per SR-019-4(b))
 * and ensures its indexes. Safe to re-run. */
export async function bootstrapRecoveryCaseEventsCollections(
  db: Db,
): Promise<BootstrapRecoveryCaseEventsResult> {
  const name = RECOVERY_CASE_EVENTS_COLLECTION;
  let created = false;
  if (!(await collectionExists(db, name))) {
    await db.createCollection(name);
    created = true;
  }
  const indexes: string[] = [];
  for (const spec of recoveryCaseEventsIndexes) {
    const indexName = spec.name;
    if (indexName === undefined) throw new Error(`Index spec for ${name} is missing name`);
    const options: Omit<IndexDescription, 'key'> = { name: indexName };
    if (spec.unique) options.unique = true;
    if (spec.partialFilterExpression !== undefined) {
      options.partialFilterExpression = spec.partialFilterExpression;
    }
    await db.collection(name).createIndex(spec.key, options);
    indexes.push(indexName);
  }
  return { collection: name, created, indexes };
}

// ---------------------------------------------------------------------------
// SR-019-4/SR-019-5 — strict, discriminated-union input validation
// ---------------------------------------------------------------------------

const customerActorSchema = z
  .object({
    type: z.literal('customer'),
    accountId: z.null(),
    partnerOrganizationId: z.null(),
  })
  .strict();

const operatorActorSchema = z
  .object({
    type: z.literal('security_company_operator'),
    accountId: z.string().min(1),
    partnerOrganizationId: z.string().min(1),
  })
  .strict();

const statusEnum = z.enum(RECOVERY_CASE_STATUSES);
const closeReasonEnum = z.enum(RECOVERY_CASE_CLOSE_REASONS);
const auditRequestIdSchema = z.string().min(1).nullable();
const caseIdSchema = z.string().regex(/^[0-9a-f]{24}$/i);

const caseCreatedInputSchema = z
  .object({
    eventType: z.literal('case_created'),
    caseId: caseIdSchema,
    occurredAt: z.date(),
    actor: customerActorSchema,
    fromStatus: z.null(),
    toStatus: z.null(),
    fromPartnerOrganizationId: z.null(),
    toPartnerOrganizationId: z.null(),
    closeReason: z.null(),
    auditRequestId: auditRequestIdSchema,
  })
  .strict();

const caseClaimedInputSchema = z
  .object({
    eventType: z.literal('case_claimed'),
    caseId: caseIdSchema,
    occurredAt: z.date(),
    actor: operatorActorSchema,
    fromStatus: z.literal('open'),
    toStatus: z.literal('investigating'),
    fromPartnerOrganizationId: z.null(),
    toPartnerOrganizationId: z.string().min(1),
    closeReason: z.null(),
    auditRequestId: auditRequestIdSchema,
  })
  .strict();

const statusChangedInputSchema = z
  .object({
    eventType: z.literal('status_changed'),
    caseId: caseIdSchema,
    occurredAt: z.date(),
    actor: operatorActorSchema,
    fromStatus: statusEnum,
    toStatus: statusEnum,
    fromPartnerOrganizationId: z.string().min(1),
    toPartnerOrganizationId: z.string().min(1),
    closeReason: closeReasonEnum.nullable(),
    auditRequestId: auditRequestIdSchema,
  })
  .strict();

const caseReleasedInputSchema = z
  .object({
    eventType: z.literal('case_released'),
    caseId: caseIdSchema,
    occurredAt: z.date(),
    actor: operatorActorSchema,
    fromStatus: statusEnum,
    toStatus: z.literal('open'),
    fromPartnerOrganizationId: z.string().min(1),
    toPartnerOrganizationId: z.null(),
    closeReason: z.null(),
    auditRequestId: auditRequestIdSchema,
  })
  .strict();

const caseReassignedInputSchema = z
  .object({
    eventType: z.literal('case_reassigned'),
    caseId: caseIdSchema,
    occurredAt: z.date(),
    actor: operatorActorSchema,
    fromStatus: statusEnum,
    toStatus: z.literal('investigating'),
    fromPartnerOrganizationId: z.string().min(1),
    toPartnerOrganizationId: z.string().min(1),
    closeReason: z.null(),
    auditRequestId: auditRequestIdSchema,
  })
  .strict();

const customerContactInitiatedInputSchema = z
  .object({
    eventType: z.literal('customer_contact_initiated'),
    caseId: caseIdSchema,
    occurredAt: z.date(),
    actor: operatorActorSchema,
    fromStatus: statusEnum,
    toStatus: statusEnum,
    fromPartnerOrganizationId: z.string().min(1),
    toPartnerOrganizationId: z.string().min(1),
    closeReason: z.null(),
    auditRequestId: auditRequestIdSchema,
  })
  .strict();

// §13.3 SR-019-12(a) — `case_handed_back`: operator actor, `toPartnerOrganizationId`
// and `closeReason` always null (the hand-back body's `reason` is never copied in,
// per §12.1(2)/SR-019-4(d) by analogy). `fromStatus`/`toStatus` equality is enforced
// below by a union-level `superRefine` (SR-019-12(b)) rather than a `.refine` inside
// this branch — zod v3 does not accept a refined object inside a discriminated
// union member.
const caseHandedBackInputSchema = z
  .object({
    eventType: z.literal('case_handed_back'),
    caseId: caseIdSchema,
    occurredAt: z.date(),
    actor: operatorActorSchema,
    fromStatus: statusEnum,
    toStatus: statusEnum,
    fromPartnerOrganizationId: z.string().min(1),
    toPartnerOrganizationId: z.null(),
    closeReason: z.null(),
    auditRequestId: auditRequestIdSchema,
  })
  .strict();

const newRecoveryCaseEventInputSchema = z
  .discriminatedUnion('eventType', [
    caseCreatedInputSchema,
    caseClaimedInputSchema,
    statusChangedInputSchema,
    caseReleasedInputSchema,
    caseReassignedInputSchema,
    customerContactInitiatedInputSchema,
    caseHandedBackInputSchema,
  ])
  // SR-019-12(b) — `case_handed_back`'s `fromStatus === toStatus` invariant
  // (§12.1(2)). Scoped to this one event type via the `eventType` discriminant
  // inside the refine; every other branch is untouched.
  .superRefine((value, ctx) => {
    if (value.eventType === 'case_handed_back' && value.fromStatus !== value.toStatus) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'case_handed_back requires fromStatus === toStatus',
        path: ['toStatus'],
      });
    }
  });

export type NewRecoveryCaseEventInput = z.infer<typeof newRecoveryCaseEventInputSchema>;

/** Thrown by `append()` on a schema-invalid input — distinct from a Mongo error,
 * so callers (and SR-019-2(a)'s failure-logging) can tell "we tried to append
 * something the schema rejects" (a programming error at the call site) apart
 * from "Mongo itself failed" (an infra error). */
export class InvalidRecoveryCaseEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRecoveryCaseEventError';
  }
}

export function createRecoveryCaseEventsRepo(db: Db) {
  const collection = (): Collection<RecoveryCaseEventDbRow> =>
    db.collection<RecoveryCaseEventDbRow>(RECOVERY_CASE_EVENTS_COLLECTION);

  return {
    /**
     * The ONLY mutating export of this module (SR-019-8). Validates `input`
     * against the strict discriminated-union schema, then builds the inserted
     * document FIELD BY FIELD from the parsed value — never by spreading the
     * caller's raw input — so no unknown key (a `latitude`, a `notes`, a
     * `metadata`) can ever reach the collection even if a future edit to this
     * function's call sites tries to pass one (SR-019-4(b)).
     *
     * SR-019-2(c): a duplicate-key error (Mongo code 11000) on the dedupe
     * partial-unique index is treated as success (idempotent re-append of the
     * same server-side attempt), not re-thrown.
     */
    async append(rawInput: NewRecoveryCaseEventInput): Promise<RecoveryCaseEventDocument> {
      const parsed = newRecoveryCaseEventInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        throw new InvalidRecoveryCaseEventError(
          `[repositories/recovery-case-events] invalid event input: ${parsed.error.message}`,
        );
      }
      const input = parsed.data;
      const now = new Date();
      const doc: Omit<RecoveryCaseEventDbRow, '_id'> = {
        caseId: new ObjectId(input.caseId),
        eventType: input.eventType,
        occurredAt: input.occurredAt,
        actor: {
          type: input.actor.type,
          accountId: input.actor.accountId,
          partnerOrganizationId: input.actor.partnerOrganizationId,
        },
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        fromPartnerOrganizationId: input.fromPartnerOrganizationId,
        toPartnerOrganizationId: input.toPartnerOrganizationId,
        closeReason: input.closeReason,
        auditRequestId: input.auditRequestId,
        createdAt: now,
      };
      try {
        const result = await collection().insertOne(doc as RecoveryCaseEventDbRow);
        return toEvent({ _id: result.insertedId, ...doc });
      } catch (err) {
        // SR-019-2(c) — duplicate-key on the dedupe partial-unique index is a
        // successful no-op re-append, not a failure.
        if (
          err &&
          typeof err === 'object' &&
          'code' in err &&
          (err as { code?: number }).code === 11000
        ) {
          const existing = await collection().findOne({
            caseId: doc.caseId,
            eventType: doc.eventType,
            auditRequestId: doc.auditRequestId,
          });
          if (existing) return toEvent(existing);
        }
        throw err;
      }
    },

    /** SR-019-7 — the admin read path's underlying query. Sorted `{ createdAt:
     * -1, _id: -1 }` to match `recovery_case_events_caseId_createdAt` and the
     * existing `mongoCursorFilter`/`buildPage` pagination convention (SR-019-7(d)). */
    async listForCase(
      caseId: string,
      limit: number,
      cursor: MongoDecodedCursor | null,
    ): Promise<RecoveryCaseEventDocument[]> {
      if (!ObjectId.isValid(caseId)) return [];
      const rows = await collection()
        .find({ caseId: new ObjectId(caseId), ...mongoCursorFilter(cursor) })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map(toEvent);
    },
  };
}

export type RecoveryCaseEventsRepo = ReturnType<typeof createRecoveryCaseEventsRepo>;
