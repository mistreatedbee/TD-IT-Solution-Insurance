# OB-03 — Partner Location Share-Grant Collections
## Database Design — Stage 6

**Lifecycle stage:** 6 — Database Design, per [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md).
**Author:** `database-architect`
**Status:** Paper design. Formalizes this role's own earlier "`database-architect` review" section of
[`0017-security-partner-directed-dispatch-and-location-share-grants.md`](../../organization/adr/0017-security-partner-directed-dispatch-and-location-share-grants.md)
(DB-1 to DB-6), authorized for Stage 6/7 design by the `cto` ratification recorded in that ADR, into concrete
`$jsonSchema`/`IndexDescription[]` DDL and a repository-method shape. **Not yet applied to any database. Not yet
built.** Follows the exact pattern established for Feature 011's `retention_job_runs`
([`011-saps-case-reporting/database-design.md`](../011-saps-case-reporting/database-design.md) §9) — one document
per event/action, append-only, two-phase-write where applicable, counts/ids only where PII-sensitive.

**Reads on:** ADR-0017 D3.3–D3.6, D4, D5; the ADR's `database-architect` review (DB-1 to DB-6); the ADR's
`cybersecurity-architect` R-4 answer (the Atlas scoped-role access model these collections must support, §3 of
that section — principals P1–P5); the ADR's `cloud-infrastructure-architect` R-5 capacity confirmation (no
concern); `backend/src/repositories/recovery-cases.ts` (the existing compare-and-set idiom at lines ~878–917);
`backend/src/db/retention-job-runs-collections.ts`-style bootstrap convention (named collection constant,
`$jsonSchema` validator, named `IndexDescription[]`, idempotent `bootstrap*Collections(db)` wired into
`catalog-verify.ts`/`mongo-bootstrap.ts`).

**Does not authorize:** turning on `PARTNER_LOCATION_SHARING_ENABLED` (gated by OB-spec §6 P-1 to P-7 and the
Client's G-7/OQ-3 answer — now partially recorded, see ADR-0017's `product-manager` OQ-3 note), or building ahead
of the location route's own Stage 8 (CSA-R4-1 to CSA-R4-5 bind there, not here).

---

## 1. Scope

Two new MongoDB collections, per ADR-0017 D3.5, D4 and the `database-architect` review's §1:

- `partner_location_share_grants` — the append-only grant record (SG-1). One document per grant; a renewal
  (D3.2) is a new document, never a mutation of `expiresAt` on an existing one.
- `partner_location_preauthorizations` — the Path A pre-authorisation record (D3.1). One document per
  pre-authorisation; consumed once, by the first accepting org.

Out of scope here, named per the ADR's own deferrals: `recovery_cases`' new dispatch fields
(`dispatchStatus`/`dispatchedAt`/`dispatchedBy`/`acceptedAt`) and the CS-4 backfill script — those are an
extension of the existing collection, already specified at DDL level in the ADR's own review §1, not repeated in
this document. The OB-04 `recovery_case_events` enum additions (`case_dispatched`, `dispatch_accepted`,
`dispatch_declined`, `case_handed_back`, `location_share_granted`, `location_share_ended`) are
`019-case-history-timeline`'s own document to extend; this document only fixes the `grantId` reference shape
those events carry (DB-6).

---

## 2. Collection: `partner_location_share_grants`

### 2.1 Shape

```ts
// backend/src/db/partner-location-share-collections.ts (PROPOSED — Stage 9)

export const PARTNER_LOCATION_SHARE_GRANTS_COLLECTION = 'partner_location_share_grants';

export type GrantChannel = 'preauthorization' | 'post_acceptance_prompt';
export type GrantEndReason =
  | 'revoked_by_customer'
  | 'case_terminal'
  | 'case_reassigned'
  | 'partner_agreement_ended'
  | 'location_consent_withdrawn'
  | 'account_erased'
  | 'expired';

export interface PartnerLocationShareGrantDocument {
  _id: ObjectId;
  caseId: ObjectId;                       // ref recovery_cases._id
  assetId: ObjectId;                       // ref assets._id — scoping check in D3.3 condition 1
  partnerOrganizationId: string;           // SG-1: exactly one org per grant, never null, never changed
  accountId: string;                       // the customer — ref Supabase identity (ADR-0002 split: string, not ObjectId)
  grantedBy: string;                       // accountId that authorised this grant (today always === accountId;
                                            // kept as its own field per D3.1, not collapsed, in case a future
                                            // authorised-representative path exists)
  grantChannel: GrantChannel;
  preauthorizationId: ObjectId | null;     // ref partner_location_preauthorizations._id; null for Path B
  activatedAt: Date;                       // D3.2: grant activates on acceptance, not dispatch
  requestedDurationHours: number;          // 1–72 per SG-4 ceiling; API-layer validates, schema just bounds it
  expiresAt: Date;                         // activatedAt + requestedDurationHours; computed at write time,
                                            // never recomputed — a renewal is a new document (D3.2)
  endedAt: Date | null;                    // write-once: set exactly once, by the triggering transition (D3.4)
  endReason: GrantEndReason | null;        // required together with endedAt — both null or both set
  endedBy: string | null;                  // accountId, 'system', or a transition name; null until ended
  createdAt: Date;
}
```

**Why `caseId` + `assetId` both appear, not just `caseId`.** D3.3 condition 1/2 scope the check to
"(`caseId`, the case's `assetId`, the caller's org)" explicitly — denormalizing `assetId` onto the grant avoids a
second lookup against `recovery_cases` on the hot path. This is the one deliberate denormalization in this
document; it is a copy of an immutable fact (a case's asset does not change), not a copy of mutable state, so it
carries none of OB-04's `grantId`-must-be-a-reference problem (DB-6) below.

**Why `endedAt`/`endReason`/`endedBy` are on the same document, not a separate end-event collection.** D3.4 is
explicit that end records are "write-once by the triggering transition" and D3.3's hot-path check reads
`endedAt: null` directly. Splitting ends into their own collection would turn every hot-path read into a lookup
across two collections for no benefit — the grant and its end are the same fact at two points in its life, and
SG-1's append-only requirement is about *not overwriting a grant's core identity fields* (org, case, asset,
activation), not about forbidding the one write-once transition every grant eventually makes exactly once.

### 2.2 `$jsonSchema` validator

```ts
export const partnerLocationShareGrantsJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'caseId', 'assetId', 'partnerOrganizationId', 'accountId', 'grantedBy', 'grantChannel',
      'activatedAt', 'requestedDurationHours', 'expiresAt', 'createdAt',
    ],
    properties: {
      caseId: { bsonType: 'objectId' },
      assetId: { bsonType: 'objectId' },
      partnerOrganizationId: { bsonType: 'string', minLength: 1 },
      accountId: { bsonType: 'string', minLength: 1 },
      grantedBy: { bsonType: 'string', minLength: 1 },
      grantChannel: { enum: ['preauthorization', 'post_acceptance_prompt'] },
      preauthorizationId: { bsonType: ['objectId', 'null'] },
      activatedAt: { bsonType: 'date' },
      requestedDurationHours: { bsonType: 'int', minimum: 1, maximum: 72 }, // SG-4 ceiling enforced at DB layer too
      expiresAt: { bsonType: 'date' },
      endedAt: { bsonType: ['date', 'null'] },
      endReason: {
        enum: [
          'revoked_by_customer', 'case_terminal', 'case_reassigned', 'partner_agreement_ended',
          'location_consent_withdrawn', 'account_erased', 'expired', null,
        ],
      },
      endedBy: { bsonType: ['string', 'null'] },
      createdAt: { bsonType: 'date' },
    },
    // No `additionalProperties: false` — matches the house convention on recovery-collections.ts and
    // feature004-collections.ts; an unexpected field is not silently rejected, it's a review-time question.
  },
};
```

**No cross-field "endedAt and endReason both-or-neither" rule in the validator.** `$jsonSchema` cannot express
a conditional-required constraint across sibling fields portably against the MongoDB server versions this
platform targets without `$and`/`dependentRequired`-style constructs that add fragility for a check the
repository layer already owns exclusively (DB-2 below: the only method that can set either field sets both in
the same `$set`). Flagged, not silently assumed enforced by the schema.

### 2.3 Indexes

```ts
export const partnerLocationShareGrantsIndexes: IndexDescription[] = [
  // Hot path: D3.3 condition 2, evaluated on every partner location read. Point lookup for "the active
  // grant for this case + this org." endedAt is pinned to null by the partial filter; expiresAt > now is
  // a cheap range check Mongo can still serve off the same index once endedAt is fixed.
  {
    key: { caseId: 1, partnerOrganizationId: 1, endedAt: 1, expiresAt: 1 },
    name: 'partner_location_share_grants_active_lookup',
    partialFilterExpression: { endedAt: null },
  },
  // SG-8: customer access-history / "list my grants" — never touches the partial index above.
  {
    key: { accountId: 1, activatedAt: -1 },
    name: 'partner_location_share_grants_accountId_activatedAt',
  },
];
```

**No TTL index — explicit, per DB-4.** Expiry is a live read-time check (D3.3/D3.4). A TTL index would delete
the document on a best-effort background sweep lagged by up to ~60s, which (a) buys nothing — `expiresAt > now`
already works without it — and (b) would destroy an SG-1 append-only audit record the moment it expires,
breaching SG-8. Grant documents age out only alongside their case under the case's own SG-11 retention schedule
(D3.5): no independent delete path for this collection exists in this design.

---

## 3. Collection: `partner_location_preauthorizations`

### 3.1 Shape

```ts
export const PARTNER_LOCATION_PREAUTHORIZATIONS_COLLECTION = 'partner_location_preauthorizations';

export interface PartnerLocationPreauthorizationDocument {
  _id: ObjectId;
  caseId: ObjectId;                 // ref recovery_cases._id
  assetId: ObjectId;                // ref assets._id
  accountId: string;                // the customer
  noticeVersion: string;            // §4 notice copy version shown at consent time (compliance traceability)
  grantChannel: 'preauthorization'; // literal — this collection only ever records Path A; kept as a field
                                     // (not inferred from collection identity) because D3.1's grant record
                                     // copies it forward onto the resulting grant document unchanged
  createdAt: Date;
  consumedAt: Date | null;          // set exactly once, by the first accepting org's accept transition
  withdrawnAt: Date | null;         // set exactly once, by the customer's withdraw action
}
```

**Why `consumedAt`/`withdrawnAt` are mutually exclusive, enforced at the application layer, not the schema.**
D3.1: "a pre-authorisation can be used once... withdrawing it before dispatch is a single tap." Whichever
happens first wins. This is the same compare-and-set idiom as `claim`/`release`
(`backend/src/repositories/recovery-cases.ts:878-917`): the repository's consume/withdraw methods each do a
conditional update guarded by `{ consumedAt: null, withdrawnAt: null }`, so only one of the two writes can ever
succeed against a given document — exactly the DB-2 condition, restated for this collection.

### 3.2 `$jsonSchema` validator

```ts
export const partnerLocationPreauthorizationsJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['caseId', 'assetId', 'accountId', 'noticeVersion', 'grantChannel', 'createdAt'],
    properties: {
      caseId: { bsonType: 'objectId' },
      assetId: { bsonType: 'objectId' },
      accountId: { bsonType: 'string', minLength: 1 },
      noticeVersion: { bsonType: 'string', minLength: 1 },
      grantChannel: { enum: ['preauthorization'] },
      createdAt: { bsonType: 'date' },
      consumedAt: { bsonType: ['date', 'null'] },
      withdrawnAt: { bsonType: ['date', 'null'] },
    },
  },
};
```

### 3.3 Indexes

```ts
export const partnerLocationPreauthorizationsIndexes: IndexDescription[] = [
  // The one read this collection serves under latency pressure: "is there a live pre-auth to consume,
  // on accept" — read once, on accept, not per-poll. Partial filter keeps it scoped to actually-live rows.
  {
    key: { caseId: 1, consumedAt: 1, withdrawnAt: 1 },
    name: 'partner_location_preauthorizations_live_lookup',
    partialFilterExpression: { consumedAt: null, withdrawnAt: null },
  },
];
```

No `accountId`-scoped history index is added here: unlike grants, pre-authorizations are not separately surfaced
on an SG-8 "my access history" screen per the ADR (D3.1 — once consumed, the fact of sharing lives on as the
grant record that resulted from it; the pre-auth itself is an internal consent artifact, not a customer-facing
history row). If a future UI needs "show me when I pre-authorised," add `{ accountId: 1, createdAt: -1 }` then —
not speculative today, per this role's own indexing discipline.

---

## 4. Repository module shape — what is NOT exposed matters as much as what is

Per DB-2: neither collection gets a generic `update`-by-`_id`-with-arbitrary-`$set` method. Every write is a
narrowly-scoped conditional update matching one of D3.1/D3.2/D3.4's named transitions. This is a repository-API-
shape condition, not a convention — an accidental generic update method is the easiest way to silently violate
SG-1's append-only requirement, and the shape below is what makes that structurally hard to do by accident.

```ts
// backend/src/repositories/partner-location-share-grants.ts (PROPOSED — Stage 9, shape only)

export interface PartnerLocationShareGrantsRepository {
  // Create-only. Called by: (a) the accept transition consuming a pre-authorization (Path A),
  // (b) the customer confirming a post-acceptance prompt (Path B), (c) a renewal (D3.2 — always a new
  // document, this method again, never an update to an existing one).
  createGrant(input: {
    caseId: ObjectId; assetId: ObjectId; partnerOrganizationId: string; accountId: string;
    grantedBy: string; grantChannel: GrantChannel; preauthorizationId: ObjectId | null;
    requestedDurationHours: number;
  }): Promise<PartnerLocationShareGrantDocument>;

  // The ONLY mutator. Conditional update guarded by `{ endedAt: null }` — write-once, per D3.4. Every
  // caller passes one of the six named GrantEndReason values; there is no "other" escape hatch.
  endGrant(grantId: ObjectId, input: { endReason: GrantEndReason; endedBy: string }): Promise<boolean>;

  // THE hot-path read. D3.3's single indexed point lookup. Returns the document (so the handler can read
  // expiresAt) or null — never a boolean, because the handler also needs expiresAt to finish condition 2
  // itself (expiresAt > now is evaluated by the caller at request time, not baked into this query, per
  // D3.3's "now is checked at read time" — this method does not itself compare against Date.now()).
  findActiveGrant(caseId: ObjectId, partnerOrganizationId: string): Promise<PartnerLocationShareGrantDocument | null>;

  // SG-8 access history. Time-ordered, no diffing against mutated rows (append-only makes this a plain query).
  listGrantsForAccount(accountId: string, pagination: Pagination): Promise<PartnerLocationShareGrantDocument[]>;

  // Bulk, read-only — used by the R-3 sweeper (see §6) and by CS-5's anomaly review. Not a mutator.
  listGrantsEndingBefore(cutoff: Date): Promise<PartnerLocationShareGrantDocument[]>;
}
```

**Explicitly NOT exposed:** `updateGrant(id, $set)`, `deleteGrant`, `setExpiresAt`, or anything that can touch
`endedAt` outside `endGrant`'s single conditional path. There is no method that can move `endedAt` from a set
value back to `null` — if that ever happens in the data (the R-4 tamper scenario, §6), it did not happen through
this repository, which is itself the diagnostic signal the reconciliation check below relies on.

```ts
// backend/src/repositories/partner-location-preauthorizations.ts (PROPOSED — Stage 9, shape only)

export interface PartnerLocationPreauthorizationsRepository {
  createPreauthorization(input: {
    caseId: ObjectId; assetId: ObjectId; accountId: string; noticeVersion: string;
  }): Promise<PartnerLocationPreauthorizationDocument>;

  // Conditional update guarded by `{ consumedAt: null, withdrawnAt: null }`. Called once, by the first
  // accepting org's accept transition. Returns null if already consumed or withdrawn (lost the race) —
  // the caller then falls back to Path B (post-acceptance prompt).
  consumePreauthorization(caseId: ObjectId, consumedBy: string): Promise<PartnerLocationPreauthorizationDocument | null>;

  // Conditional update guarded by `{ consumedAt: null, withdrawnAt: null }`. The customer's single tap.
  withdrawPreauthorization(id: ObjectId, accountId: string): Promise<boolean>;

  // The one read the accept transition needs: "is there a live pre-auth for this case."
  findLivePreauthorization(caseId: ObjectId): Promise<PartnerLocationPreauthorizationDocument | null>;
}
```

**Explicitly NOT exposed:** any method that can re-arm a consumed or withdrawn pre-authorization, or extend
D3.1's "used once" rule to a second accepting org. A hand-back/re-dispatch always needs a *fresh* customer grant
(D3.1's own text) — not a second consumption of the same pre-auth row, which is why there is no
`unconsumePreauthorization` of any kind.

---

## 5. OB-04 reference shape (DB-6)

`recovery_case_events`' new enum values (`019-case-history-timeline` owns the collection) reference a grant by
`grantId: ObjectId` — the literal `_id` of `partner_location_share_grants`, never a denormalized copy of
`partnerOrganizationId`, `expiresAt`, etc. onto the event. D3.6 permits only `grantId`, `expiresAt`, `endReason`
in `metadata`; `expiresAt`/`endReason` are a point-in-time copy at the moment the event is written (legitimate,
since an event records a fact as of when it happened), but `grantId` is the one field that must always resolve
back to the single source of truth — this is what "a grant's audit trail has exactly one source of truth" (DB-6)
actually requires at the document level: anyone reconstructing a grant's full history joins
`recovery_case_events` to `partner_location_share_grants` by this field, rather than trusting a copy that could
drift from the grant document's own write-once fields.

---

## 6. Grant/event integrity check (R-4 condition, detective control for what Mongo roles cannot express)

This discharges CSA-R4-4 and the reconciliation control the `cybersecurity-architect` R-4 answer requires (ADR
§4, "Grant/event reconciliation (detective control)"): **every grant document must have exactly one matching
`recovery_case_events` activation row by `grantId`**, and any mismatch — an orphan grant, or a grant whose
`endedAt` has gone from set back to null — must be flagged, because Mongo collection-level privileges cannot
themselves express "only set `endedAt` when it is currently null" (P1's `update` grant is action-level, not
field-level, per R-4 §4). The repository shape (§4 above, no generic update method) prevents this happening
*through the application*; this check catches it if it happens *around* the application — a forged or
directly-tampered write by any DB principal, P1 included.

### 6.1 What the sweeper actually queries

Run by the same R-3 shared sweeper that already handles grant-expiry recording, queue-age and acceptance-window
lapse (`backend-architect` owns the sweeper; this section specifies only the query/detection logic it runs
against these two collections, same division of labor as Feature 011 §5.1 drew between "mechanism design" and
"scheduling infrastructure").

**Orphan check — a grant with no matching activation event:**

```ts
// For each grant created since the last sweeper run (or, on a periodic full pass, each grant with
// activatedAt within the lookback window):
const grant = await grantsCollection.findOne({ _id: grantId });
const activationEvent = await recoveryCaseEventsCollection.findOne({
  caseId: grant.caseId,
  type: 'location_share_granted',
  'metadata.grantId': grant._id,
});
if (!activationEvent) {
  // ORPHAN: a grant exists with no corresponding OB-04 activation row. Raise an admin security alert
  // (CSA-R4-4 / R-4 §4) — this is the exact shape of a grant written outside the normal accept/consume
  // transition (e.g. a direct insert via a compromised or over-privileged principal).
}
```

**Tamper check — an ended grant reopened:**

```ts
// Grants collection has no field recording "was endedAt ever non-null." The sweeper therefore keeps its
// own append-only ledger of (grantId, endedAt) pairs observed on each pass — a small collection or, more
// cheaply, cross-referenced against the OB-04 `location_share_ended` event, which (per D3.6) is itself
// write-once and append-only:
const endEvent = await recoveryCaseEventsCollection.findOne({
  caseId: grant.caseId,
  type: 'location_share_ended',
  'metadata.grantId': grant._id,
});
if (endEvent && grant.endedAt === null) {
  // TAMPER SIGNAL: an end event was recorded (meaning endGrant() ran and set endedAt), but the grant
  // document's own endedAt is now null — it has been reopened by a write that did not go through
  // endGrant(). Raise an admin security alert at the same severity as the orphan check.
}
if (!endEvent && grant.endedAt !== null) {
  // Softer signal, not necessarily tamper: the grant ended but the OB-04 event write may be delayed,
  // failed, or (if this fires repeatedly for the same grantId across sweeper runs) silently dropped.
  // Escalate only if it persists across more than one sweeper run, to avoid alerting on a benign
  // in-flight write ordering between the two collections.
}
```

**Why cross-referencing OB-04 is sufficient and no new ledger collection is needed:** `recovery_case_events` is
itself append-only and write-once per event (D3.6), so it already serves as the "was this ever true" record the
tamper check needs — a grant's own document only ever shows current state, but OB-04's event stream shows every
state transition that was *supposed* to have happened. A grant whose current state contradicts its own event
history is the signal. This reuses OB-04 rather than building a parallel history store for the sole purpose of
checking the first one — consistent with this document's own §2.1 reasoning for keeping end fields on the grant
document itself rather than a separate end-event collection: one new history mechanism (OB-04) is enough.

### 6.2 Indexes this check needs (on `recovery_case_events`, not this document's collections)

`019-case-history-timeline`'s own database design owns `recovery_case_events`' indexes; this document only names
the shape the sweeper's queries above need, as a requirement handed to that feature rather than designed here:
an index supporting `{ caseId: 1, type: 1, 'metadata.grantId': 1 }` lookups. Flagged to `019-case-history-timeline`
as an incoming requirement from this document, not assumed already present.

---

## 7. Migration ordering

1. `create_partner_location_share_grants_collection` and `create_partner_location_preauthorizations_collection`
   — both new collections, `validationAction: 'error'` from creation (no existing data to be compatible with,
   unlike Feature 011's additive-field case on a live collection).
2. Both collections' indexes (§2.3, §3.3) created in the same migration as the collection itself — per this
   role's own DB-5 precedent on Feature 011 ("index ships with the fields, not after"), restated here for a
   brand-new collection: there is no "after" that doesn't start cold.
3. **Gated, not sequenced with anything else.** Per ADR-0017 D5, both collections may exist in all environments
   before `PARTNER_LOCATION_SHARING_ENABLED` is ever set to `'true'` — the collections' existence is not itself
   a disclosure risk (no customer data flows until the flag is on and the location route is mounted, CS-7). This
   lets Stage 9 implementation and Stage 10 testing proceed against real collections without being blocked on
   OQ-3/CR-3/CS-3 (ADR §5 "What still blocks building and shipping" items 1–3), which block the flag, not the
   schema.
4. Atlas scoped-role provisioning (R-4 principals P1/P2/P3/P5) is a prerequisite for the location route's
   Stage 8, per CSA-R4-1 — it is **not** a prerequisite for creating these collections or writing to them
   during Stage 9 development against the current single `MONGODB_URI` principal. Named here so Stage 9 is not
   blocked waiting on provisioning that is scoped to a later gate.

---

## 8. Pre-Approval Checklist (`database-architect` self-review)

- [x] Embed-vs-reference reviewed: both collections referenced from `recovery_cases`, not embedded — cardinality
      mismatch (zero-to-many grants per case over its life) and access-pattern mismatch (a narrow, hot,
      per-request lookup vs. a document shared with unrelated status/messaging writes) both rule out embedding,
      per the ADR review's own §1 reasoning, restated at DDL level here.
- [x] Indexing strategy validated against the ADR's own named hot path (D3.3 condition 2) and the one other read
      each collection serves (SG-8 history; the accept-time pre-auth check) — nothing speculative added beyond
      those two named shapes per collection.
- [x] GPS/location-history growth — N/A; per R-5, these are per-case/per-action documents, not per-ping, and no
      location value is stored in either collection (D3.3: the point is read live off the Feature 008 store at
      request time, never persisted here).
- [x] Sensitive fields reviewed: `grantChannel`/`noticeVersion`/the full grant history together reconstruct a
      sensitive fact pattern (flagged in the ADR review §3 and carried here); resolved by R-4's access-control
      ruling (DB-level principals), not by field-level encryption — no payment reference or ID document is held
      by either collection.
- [x] Claim/grant history stays auditable: append-only creation, write-once end fields, no generic update method
      in either repository (§4) — this is the condition DB-2 made a repository-shape requirement, not a
      convention, and it is restated as the literal interface shape above rather than left as prose.
- [x] Retention alignment: D3.5 states grants follow the case's own SG-11 retention; no independent delete path
      exists in this design (§2.3's no-TTL rule) — confirmed consistent with that ruling, not a new retention
      decision of this document's own.
- [x] Capacity impact: confirmed, no concern — R-5 (`cloud-infrastructure-architect`, ADR §"capacity
      confirmation"), re-cited rather than re-litigated here.
- [x] Migration path specified — §7, including the explicit note that collection creation is not gated by the
      flags that block the location route itself.
