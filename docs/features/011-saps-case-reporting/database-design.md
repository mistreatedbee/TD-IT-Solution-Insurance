# Feature 011 (Idea 1) — SAPS Case-Number Capture
## Database Design — Stage 6

**Lifecycle stage:** 6 — Database Design, per [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md).
**Author:** `database-architect`
**Status:** Paper design, formalizing [`architecture-review.md`](./architecture-review.md) (Stage 5, `backend-architect`,
approved by `solution-architect`) into concrete `$jsonSchema`/`IndexDescription[]` DDL. Not yet applied to any
database. Ready for `backend-architect` (Stage 7 API contract) and `security-engineer`/`compliance-specialist`
(Stage 8) once reviewed.
**Reads on:** [`architecture-review.md`](./architecture-review.md) §2/§5/§6/§7 (this document discharges every row
in that document's §7 table marked "Needs `database-architect`"), [`compliance-review-saps-case-data.md`](./compliance-review-saps-case-data.md)
C-011-8/C-011-10, `backend/src/repositories/recovery-cases.ts`, `backend/src/db/recovery-collections.ts`,
sibling [`010-call-centre-dashboard/database-design.md`](../010-call-centre-dashboard/database-design.md) (both
features write additive fields to the same `recovery_cases` collection — coordinated in §5 below, not two
independent migrations that silently race).

---

## 1. Scope

Formalizes the DDL for the four new fields the architecture review put on `RecoveryCaseDocument`
(`sapsCaseNumber`, `reportingStation`, `reportedToPoliceAt`, `policeReportHistory[]`, `policeReportReminderSentAt`),
plus the one structural addition this document makes that the architecture review did not carry far enough:
`recovery_cases.closedAt`, required to make the C-011-10 retention job's expiry check well-defined at all (§4).
This is **not** a new collection — every decision below is an extension of `recovery-collections.ts`.

Out of scope, named per the architecture review's own deferrals: the 48-hour reminder job's delivery mechanism
(D-011-04), the exact scheduling infrastructure for the retention job (owned jointly with `devops-engineer` —
this document specifies the query/mechanism, not the cron/Render-job wiring), RoPA/CT-4 artifacts.

---

## 2. Decision (a): append-only `policeReportHistory[]` — ruled, not deferred further

**Ruling: append-only.** The architecture review left this as "recommended, not mandated" pending this role's
final call (C-011-8 itself accepts either shape). This document rules in favor of append-only for three reasons,
one of them new relative to the architecture review's own justification:

1. **Consistency with this collection's own existing precedent.** `callCentreNotes[]` on this exact document is
   already append-only. A last-write-wins shape for `policeReportHistory` would mean `recovery_cases` uses two
   different history-recording conventions on the same document for two structurally identical problems ("what
   changed, who changed it, when") — a genuine maintenance hazard for whoever reads this schema next, not a
   hypothetical one.
2. **Consistency with this role's own ratified practice on `policies`/`policy_status_history`** (Feature 004
   `database-design.md` §3.2): "model claims and policy changes as append-only event/history collections, not
   just mutable current-state documents." A SAPS case number correction is exactly this class of fact.
3. **The retention job (§4) needs to clear `policeReportHistory` as a whole array, not reconstruct what a
   last-write-wins shape would have destroyed already.** This is not a reason to prefer append-only over
   last-write-wins in the abstract (both are equally easy to `$unset`), but it does mean append-only carries no
   *additional* retention-mechanism cost despite being the richer evidentiary record — there is no tradeoff here
   worth taking last-write-wins for.

No new mechanism class is introduced — this is the same array-of-change-objects shape already live in this
collection.

---

## 3. Decision (b): `$jsonSchema` validator addition to `recovery-collections.ts`

```ts
// backend/src/db/recovery-collections.ts — additive properties on the existing $jsonSchema.
// `required` is UNCHANGED — every field below is optional, matching "post-submission follow-up,
// never part of case creation" (architecture-review.md §3.1). A case created today, before this
// migration ever runs, is valid under the updated validator with these fields simply absent.

properties: {
  // ...existing properties unchanged...

  sapsCaseNumber: { bsonType: ['string', 'null'], minLength: 3, maxLength: 50 },
  reportingStation: { bsonType: ['string', 'null'], minLength: 1, maxLength: 200 },
  reportedToPoliceAt: { bsonType: ['date', 'null'] }, // stored UTC midnight — see note below
  policeReportHistory: {
    bsonType: 'array',
    items: {
      bsonType: 'object',
      required: ['actorAccountId', 'field', 'previousValue', 'newValue', 'changedAt'],
      properties: {
        actorAccountId: { bsonType: 'string' },
        field: { enum: ['sapsCaseNumber', 'reportingStation', 'reportedToPoliceAt'] },
        previousValue: { bsonType: ['string', 'null'] },
        newValue: { bsonType: ['string', 'null'] },
        changedAt: { bsonType: 'date' },
      },
    },
  },
  policeReportReminderSentAt: { bsonType: ['date', 'null'] },

  // NEW, this document's own addition beyond what architecture-review.md specified — see §4:
  closedAt: { bsonType: ['date', 'null'] },

  // Feature 010's addendum (coordinated migration, see §5):
  originatingSupportCaseId: { bsonType: ['string', 'null'] },
},
```

**Bounds rationale:** `sapsCaseNumber` 3–50 / `reportingStation` 1–200 mirror the architecture review's §3.2 API
validation bounds exactly — the database layer should not silently accept something the API layer would reject,
and should not invent a stricter bound the API doesn't enforce (BR-011-02 explicitly rejects a format regex, so
the schema doesn't add one either).

**`reportedToPoliceAt` stored as UTC-midnight `Date`, not a `string`.** The architecture review's request/response
contract (§3.2) uses an ISO date string (`YYYY-MM-DD`) at the API boundary, consistent with how the API should
present a calendar date with no time-of-day semantics — but the document itself already stores every other date
(`reportedAt`, `createdAt`, `lastLocationAt`) as a native BSON `date`, and `policeReportHistory[].previousValue`/
`newValue` are `string`-typed specifically because the architecture review wanted "a uniform history shape" across
all three fields' diffs, not because the live field itself should be a string. Storing the live field as `date`
keeps it queryable/sortable/range-filterable the same way every other date on this document already is (needed
for §4's retention query); the API serializer is the layer responsible for rendering it back as `YYYY-MM-DD`
(`doc.reportedToPoliceAt?.toISOString().slice(0, 10)`, exactly as `architecture-review.md` §4's `serializePoliceReport`
already does). No conflict with the architecture review — it specified the wire shape, not the storage type, and
this is the natural reading of "calendar date; stored as UTC midnight" already written into its own §2.1 comment.

**`additionalProperties` is not set to `false` anywhere on this validator** (it never has been — check the current
`recoveryCasesJsonSchemaValidator`), so this addition is safe under the existing validator's permissiveness; no
migration risk of the addition itself being rejected by a stricter top-level constraint that isn't there.

---

## 4. Decision (c): no new index for `policeReportReminderSentAt` today; one new index IS needed for the retention job

**`policeReportReminderSentAt`: no index now.** The architecture review flagged a candidate compound index
(`{ reportedAt: 1, sapsCaseNumber: 1, policeReportReminderSentAt: 1 }`, partial) but explicitly tied it to
D-011-04's reminder job, which is not designed, not scheduled, and has no owning `product-manager`/`ux-researcher`
decision yet. Per this role's own Best Practice against speculative indexing (Feature 004 `database-design.md`
§5's "deliberately not indexed" pattern is the house convention to follow here) — **this index is not added in
this migration.** It is cheap to add later (a single additive `createIndexes` call) once D-011-04 actually ships
a job that queries on it; adding it now against a job that doesn't exist yet would be indexing against a guess.

**One new index IS needed — for the retention-expiry job itself (§5's mechanics need a bounded query, not a
collection scan):**

```ts
{
  key: { status: 1, closedAt: 1 },
  name: 'recovery_cases_closed_at_retention',
  partialFilterExpression: {
    $or: [
      { sapsCaseNumber: { $ne: null } },
      { reportingStation: { $ne: null } },
      { reportedToPoliceAt: { $ne: null } },
    ],
  },
}
```

**Why partial, and why this specific filter:** the retention job (§5) only ever needs to find documents that (a)
are in a terminal status, (b) have a `closedAt` old enough to be past the retention floor, **and** (c) still have
at least one police-report field to clear. Indexing every `recovery_cases` document on `{status, closedAt}`
unconditionally would cost a write-path index maintenance fee on every status/closedAt change for the (currently:
all) documents that never had police-report fields set at all — pure overhead with no query benefit, since those
documents never match the job's actual `$or` filter. The partial filter keeps the index scoped to exactly the
population the job cares about, mirroring the existing `{ gpsDeviceId: 1 }` partial-unique precedent in Feature
004's `assets` collection (`database-design.md` §5) for the identical reasoning: "near-zero cost until the field
is populated."

**Note — this index also directly serves Feature 010's `originatingSupportCaseId`-driven exclusion logic (§6.7 of
that feature's architecture review) only indirectly**, not directly — that exclusion is expressed as "escalated
status won't match a `status: {$in:['resolved','closed']}` filter on the `support_cases` side," which is a
different collection's index, not this one. Named here only to be explicit that this index does not also need to
carry an `escalatedToRecoveryCaseId`-style exclusion of its own — `recovery_cases.status` has no `escalated`
value; that vocabulary lives only on `support_cases` (§5.2 of `010-call-centre-dashboard/database-design.md`).

---

## 5. Decision (d): the retention-expiry clearing job — mechanism design

### 5.1 Why this cannot be a TTL index (restated as a concrete mechanism, not just a rule)

A Mongo TTL index deletes the *entire document* once a single date field crosses its `expireAfterSeconds` horizon.
`recovery_cases` documents must survive indefinitely (they're the durable recovery-case record; POPIA/general
recordkeeping obligations for the *asset/recovery* facts on the document are separate from, and typically longer
than, the police-report fields' own 5-year floor). Only four fields need to go: `sapsCaseNumber`,
`reportingStation`, `reportedToPoliceAt`, `policeReportHistory`. There is no Mongo-native "expire these four
fields, not the document" primitive — this has to be an application-level scheduled job doing a targeted update.

### 5.2 The new field this mechanism needs that architecture-review.md did not add: `closedAt`

The architecture review's §2.3 names the trigger as "5y from case closure/claim finalisation" but
`RecoveryCaseDocument` today (confirmed by reading `backend/src/repositories/recovery-cases.ts`) has **no
`closedAt` field at all** — only a `status` enum that includes `'closed'` as a value, with no timestamp recording
*when* that transition happened. `updatedAt` is not a safe substitute: it is bumped by *any* field write,
including a later edit to `sapsCaseNumber` itself (BR-011-06 explicitly allows editing after the fact) — using
`updatedAt` as the retention clock would mean editing a case's police-report fields resets its own retention
countdown, which is backwards (an evidentiary correction should not extend how long the correction's *own* history
must be kept, and more importantly a job keyed on `updatedAt` could never converge: clearing the fields is itself
an `updatedAt`-bumping write, so a naive "clear if updatedAt is old" job would immediately make the just-cleared
document look fresh again and correctly stop matching — but only by accident, not by a field that actually means
"closed on this date"). **This document adds `closedAt: Date | null` to `RecoveryCaseDocument` and the validator
(§3)**, set once, at the moment `status` transitions to `'closed'` (repository-layer responsibility, Stage 9 —
e.g. `recoveryCases.updateStatus(caseId, 'closed', ...)` sets `closedAt: new Date()` in the same update). This is
additive and out of this document's authority to mandate as an API behavior change, so it is **flagged to
`backend-architect`** (Stage 7) as a required addition to whatever status-transition endpoint exists or will
exist for `recovery_cases`, not silently assumed to already happen.

**Named gap, not resolved here:** "claim finalisation" as an alternative/later trigger date has no field to key
off at all, because no Claims collection exists yet (Feature 004 `database-design.md` §1 scoped Claims out
entirely, and Feature 010/011 do not build it either). **Ruling for now: the retention clock runs from
`closedAt` only.** If/when a Claims domain is designed, `compliance-specialist` should confirm whether the 5-year
floor should instead (or additionally) run from claim finalisation, and this job's query updates accordingly —
named as a real follow-up, not silently assumed closed.

**`'recovered'` status:** the architecture review's own §2.3 says "5y from case closure/claim finalisation" without
being precise about whether `recovered` (a case where the asset came back but the case record itself may still be
open pending final admin closeout) counts as "closure." This document's query below only fires on `status: 'closed'`
specifically, treating `recovered` as not-yet-closed — a case that's `recovered` but never formally `closed`
never starts its retention clock. **Flagged to `compliance-specialist`:** confirm whether `recovered` should also
start the clock (i.e. `status: { $in: ['closed', 'recovered'] }`), or whether the intended workflow always
transitions `recovered → closed` eventually and this is a non-issue. Not resolved here — a config-level query
change either way, not a schema change.

### 5.3 The job

A standalone script under `backend/scripts/`, following the exact structural convention already established by
`backend/scripts/inc-001-location-inventory.ts` (env-driven Mongo connection, JSON summary to stdout, explicit
read/write posture stated up front) — except this script **is** a writer, unlike that read-only precedent, so it
needs its own explicit safety framing:

```ts
// backend/scripts/police-report-retention-purge.ts  (PROPOSED — Stage 9 implementation, shown here as the
// mechanism this document is committing to, not yet-written code)
//
// Run on a schedule (devops-engineer: daily, via Render Cron Job or equivalent — infrastructure choice not
// made here). Idempotent — safe to run more than once a day, or to re-run after a failed run, because the
// query only ever matches documents that still HAVE a police-report field set (the partial index's own filter,
// §4), so an already-cleared document simply stops matching on the next run.

const RETENTION_YEARS = 5; // per compliance-review-saps-case-data.md §5 — SUBJECT TO CT-4 OVERRIDE, see below.
// NOT hardcoded blindly: compliance review names "5y... or longer per CT-4 instruction" — if/when a specific
// case has a CT-4 litigation/investigation hold, that is `legalHold: true` on the SAME document (the field
// already exists on RecoveryCaseDocument today), and this job's query explicitly excludes legalHold: true
// documents, exactly mirroring Feature 004's own retention-purge rule ("Any policy or asset connected to an
// open or disputed claim... must be flagged legalHold: true before any purge job" — database-design.md §7).

async function run(db: Db): Promise<{ candidatesFound: number; cleared: number; runAt: Date }> {
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - RETENTION_YEARS);

  const filter = {
    status: 'closed',
    closedAt: { $ne: null, $lte: cutoff },
    legalHold: { $ne: true },
    $or: [
      { sapsCaseNumber: { $ne: null } },
      { reportingStation: { $ne: null } },
      { reportedToPoliceAt: { $ne: null } },
    ],
  };

  const candidates = await db.collection('recovery_cases').find(filter).project({ _id: 1 }).toArray();

  const result = await db.collection('recovery_cases').updateMany(filter, {
    $set: {
      sapsCaseNumber: null,
      reportingStation: null,
      reportedToPoliceAt: null,
      policeReportHistory: [],
      updatedAt: new Date(), // deliberate — this IS a real write to the document, unlike a TTL-driven deletion
                              // which has no updatedAt to bump; recording that a clearing event happened is
                              // itself evidentiary, consistent with C-011-10's "evidenced" requirement below.
    },
  });

  return { candidatesFound: candidates.length, cleared: result.modifiedCount, runAt: new Date() };
}
```

**Evidencing (C-011-10's own condition — "evidenced," matching the `location_events` TTL precedent's evidenced
bar):** print a structured JSON summary to stdout on every run (`{ runAt, candidatesFound, cleared,
retentionYears, cutoffDate }`), exactly as `inc-001-location-inventory.ts` already does for a read-only report.
**Named gap, not resolved here:** this repo has **no durable, queryable run-log table/collection for any
retention/purge job today** — Feature 001's Postgres side has an aspirational `app.retention_purge_runs` pattern
referenced by Feature 004's `database-design.md` §7, but grepping this repository confirms neither
`app.retention_purge_runs` nor any Mongo equivalent has actually been built. Stdout-only evidencing is real but
weaker than a queryable run history (an auditor asking "prove this ran every day for the last two years" cannot
be answered from ephemeral Render log retention alone). **Recommendation to `devops-engineer` + `security-engineer`,
Stage 8:** either build the missing durable run-log (a small `retention_job_runs` Mongo collection, one document
per run, mirroring the shape returned by `run()` above — cheap, and this document names its shape so it isn't
invented twice) or explicitly accept stdout-only evidencing as the interim control and record that acceptance.
This document does not silently assume the stronger control exists.

**Not a Mongo transaction, and doesn't need to be one:** `updateMany` against a single collection with a single
filter is already atomic per-document; there's no multi-collection invariant this job must preserve (unlike
Feature 010's escalation flow, which does need cross-collection consistency — see that feature's own document).

---

## 6. Migration ordering

1. `add_recovery_cases_police_report_fields` — the five architecture-review fields (§3) plus `closedAt` (§5.2).
   Additive, `validationAction: 'error'` reapplied via `collMod` (existing documents are valid: every new field
   is optional, matching the pattern Feature 004 used when it needed a strict-from-day-one validator on a
   collection with a different addendum — see `database-addendum-001.md`'s own additive-field precedent).
2. `add_recovery_cases_closed_at_retention_index` — the partial index from §4.
3. **Coordinate with Feature 010's migration** (§5 of that feature's `database-design.md`) — both features touch
   the same collection's validator in the same lifecycle window. **Recommendation: land both field sets in a
   single `collMod` call** (one combined validator update covering this feature's five/six fields plus Feature
   010's `originatingSupportCaseId`), not two sequential `collMod` calls that each redeclare the entire
   `$jsonSchema` document from scratch — sequential full-document `collMod` calls are not destructive to data but
   do create a window where a mid-deploy read of the validator (e.g. `catalog-verify.ts`, which diffs the live
   validator against a single declared source) would report drift against whichever one merges second, until
   both are actually merged into the same `recoveryCasesJsonSchemaValidator` source constant in
   `recovery-collections.ts`. **Concretely: whichever feature implements second at Stage 9 should rebase its
   validator diff onto the other's, not layer a second `collMod` on top.**

---

## 7. What needs `backend-architect`/Stage 7, and what needs Stage 8/9

| Item | Decided here | Needs downstream |
|---|---|---|
| Append-only `policeReportHistory` | **Ruled** — §2 | — |
| `$jsonSchema` validator additions | **Formalized** — §3 | `backend-engineer`, Stage 9 implementation |
| New index(es) | **Formalized** — §4 (retention only; reminder index deferred) | `backend-engineer`, Stage 9; revisit reminder index once D-011-04 ships |
| `closedAt` field + who sets it | **Added, schema-formalized** — §5.2 | `backend-architect` must specify which status-transition code path sets it (Stage 7); `backend-engineer` implements (Stage 9) |
| Retention job mechanism | **Designed** — §5.3 | `devops-engineer` (scheduling infra), `security-engineer` (evidencing sign-off, Stage 8) |
| Run-log durability gap | **Named** — §5.3 | `devops-engineer`/`security-engineer` decision, Stage 8 |
| `recovered` vs `closed` as the retention trigger | **Named open question** — §5.2 | `compliance-specialist` |
| `catalog-verify.ts` / `mongo-bootstrap.ts` registration | Not yet done (no new collection, so no new `DECLARED_CATALOG` entry is needed — the validator/index changes above are additive to the *existing* `recovery` module entry already in `catalog-verify.ts`; that entry's `validator`/`indexes` imports must be updated to the new `recoveryCasesJsonSchemaValidator`/`recoveryCaseIndexes` once Stage 9 lands, or `verifyMongoCatalog` will report a false `validator_mismatch`/`missing_index` drift against the *old* declared shape) | `backend-engineer`, Stage 9 |

---

## 8. Pre-Approval Checklist (`database-architect` self-review)

- [x] Schema change reviewed for embed-vs-reference correctness — extension of the existing document, per
      architecture-review.md §2's own reasoning; this document adds nothing that changes that call.
- [x] Indexing strategy validated against actual hot query paths, not speculative — reminder index deliberately
      deferred (§4); retention index tied to a named, designed job (§5), not speculative.
- [x] GPS/location-history growth — N/A, no GPS-adjacent field touched by this feature.
- [ ] Sensitive fields reviewed with `cybersecurity-architect` — the compliance review already rules these fields
      sensitive (C-011-1..7); this document's job is DDL formalization, not re-litigating that review. Left
      unchecked as a reminder that Stage 8 sign-off on the C-011-9 structural exclusion (architecture-review.md §4)
      is still outstanding, not a gap in this document.
- [x] Claim/policy/payment-adjacent changes preserve auditable history — append-only history ruled (§2);
      `closedAt` addition strengthens, not weakens, the auditability of the status timeline.
- [ ] Data-retention policy aligns with `compliance-specialist`'s regulatory guidance — mechanism designed (§5);
      the `recovered`-vs-`closed` trigger question (§5.2) is open and must be closed before Stage 9 implements
      the job, not after.
- [ ] Capacity impact reviewed with `cloud-infrastructure-architect` — not done; this feature's write/read volume
      is the same low-frequency class as the rest of `recovery_cases` (architecture-review.md §9's own unchecked
      item), no new concern introduced.
- [x] Migration path specified — §6, including the cross-feature coordination note with Feature 010.
