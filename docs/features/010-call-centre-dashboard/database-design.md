# Feature 010 (Phase 2, FR-11–17) — Call Centre Support & Incident Management
## Database Design — Stage 6

**Lifecycle stage:** 6 — Database Design, per [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md).
**Author:** `database-architect`
**Status:** Paper design, formalizing [`03-architecture-review-phase2.md`](./03-architecture-review-phase2.md)
(Stage 5, `backend-architect`) into concrete `$jsonSchema`/`IndexDescription[]` DDL for a **new** collection. Not
yet applied to any database. FR-18–21 (escalation) schema fields are formalized here too (the architecture review
asked for the data contract regardless of authorization status) but remain **NOT AUTHORIZED FOR IMPLEMENTATION** —
this document inherits that restriction verbatim and does not lift it.
**Reads on:** [`03-architecture-review-phase2.md`](./03-architecture-review-phase2.md) §3/§4/§5/§6.7/§7 (this
document discharges every row in that document's §7 table marked "Needs `database-architect`"),
`backend/src/db/recovery-collections.ts`, `backend/src/db/product-events-collections.ts` (collection-bootstrap
convention followed here), sibling [`011-saps-case-reporting/database-design.md`](../011-saps-case-reporting/database-design.md)
(coordinated migration — §5 below).

---

## 1. Scope

Formalizes: the new `support_cases` collection (validator + indexes + bootstrap function, §2–§4); the additive
`recovery_cases.originatingSupportCaseId` field (§5); the retention-expiry job query shape for `support_cases`
(§6). Out of scope, per the architecture review's own deferrals: the Tier 2 caller-verification mechanism
(C-010-4), the escalation endpoint's *implementation* (still blocked), OQ-010-4's default-scope business call.

---

## 2. `support_cases` — new collection, confirmed appropriate

This document confirms the architecture review's §2 "separate collection, not `recovery_cases`" call is correct
from a schema-design standpoint too, for a reason additive to that document's leakage argument: `support_cases`
and `recovery_cases` have almost no field overlap beyond the shared `notes`/history-entry shape and timestamps —
forcing them into one collection with a type discriminator would produce the exact "dozens of nullable
columns/fields" awkwardness ADR-0001 named PostgreSQL as ill-suited for, recreated inside a single Mongo
collection instead of avoided by one. Two purpose-built documents is the correct application of this collection's
own polymorphism principle (Feature 004 `database-design.md` §3.3): polymorphism is for *variants of the same
entity* (asset types), not for *different entities that happen to both be "a case."*

---

## 3. Proposed `backend/src/db/support-case-collections.ts` (Stage 9 implementation target — shown in full here as the DDL this document is ratifying, not yet committed code)

```ts
/**
 * Feature 010 (Phase 2, FR-11–17) — support_cases MongoDB collection bootstrap.
 * Non-theft call-centre support cases (billing, app issues, policy questions, etc.),
 * kept structurally separate from recovery_cases — see database-design.md §2.
 */
import { type Db, type Document, type IndexDescription } from 'mongodb';

export const SUPPORT_CASES_COLLECTION = 'support_cases';

export const supportCasesJsonSchemaValidator: Document = {
  $jsonSchema: {
    bsonType: 'object',
    required: [
      'accountId',
      'category',
      'description',
      'channel',
      'status',
      'referenceNumber',
      'notes',
      'createdByAgentAccountId',
      'callerVerified',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      accountId: { bsonType: 'string' }, // soft reference to Supabase app.accounts.id — same pattern as
                                          // recovery_cases.accountId / Feature 004's assets.accountId
      category: {
        // API-LAYER ENUM, NOT SCHEMA-LEVEL — see §4.1 for why. bsonType is still constrained to string
        // so a malformed non-string category can never be inserted even though the value set isn't locked.
        bsonType: 'string',
        minLength: 1,
        maxLength: 64,
      },
      description: { bsonType: 'string', maxLength: 2000 }, // mirrors recovery_cases.notes' bound
      channel: { enum: ['phone'] }, // Phase 2 — genuinely closed for now; extending this IS a schema change
                                     // (unlike category), because unlike category there's no product ambiguity
                                     // about the enum being provisional — it's closed because only one channel
                                     // exists, not because it's deliberately left open like category is.
      status: { enum: ['open', 'in_progress', 'resolved', 'closed', 'escalated'] },
      referenceNumber: { bsonType: 'string', minLength: 8, maxLength: 32 },
      resolutionSummary: { bsonType: ['string', 'null'], maxLength: 2000 },
      notes: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['agentAccountId', 'text', 'createdAt'],
          properties: {
            agentAccountId: { bsonType: 'string' },
            text: { bsonType: 'string', maxLength: 2000 },
            createdAt: { bsonType: 'date' },
          },
        },
      },
      createdByAgentAccountId: { bsonType: 'string' },
      assignedAgentAccountId: { bsonType: ['string', 'null'] },
      callerVerified: { bsonType: 'bool' },
      callerVerificationMethod: { bsonType: ['string', 'null'] },
      callerVerifiedAt: { bsonType: ['date', 'null'] },
      escalatedToRecoveryCaseId: { bsonType: ['string', 'null'] }, // written ONLY by the (NOT AUTHORIZED)
                                                                     // escalate endpoint — the field exists now
                                                                     // so the schema is right when it unblocks
      escalatedAt: { bsonType: ['date', 'null'] },
      closedAt: { bsonType: ['date', 'null'] }, // retention clock, §6
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

export const supportCaseIndexes: IndexDescription[] = [
  { key: { accountId: 1, createdAt: -1 }, name: 'support_cases_account_created' },        // FR-11 lookup-enrichment
  { key: { status: 1, category: 1, createdAt: -1 }, name: 'support_cases_status_category_created' }, // FR-17 triage/list
  { key: { referenceNumber: 1 }, unique: true, name: 'support_cases_reference_number_unique' },
  { key: { createdByAgentAccountId: 1, status: 1, createdAt: -1 }, name: 'support_cases_created_by_agent_status_created' }, // scope=mine
  {
    key: { escalatedToRecoveryCaseId: 1 },
    sparse: true,
    name: 'support_cases_escalated_to_recovery_case_sparse',
  }, // reverse lookup from a recovery case; sparse because null on every non-escalated document (the vast
     // majority today, since escalation is unauthorized) — same partial/sparse-for-mostly-null-field
     // reasoning as Feature 004's gpsDeviceId index and this feature's sibling closedAt-retention index
  { key: { status: 1, closedAt: 1 }, name: 'support_cases_status_closed_at_retention' }, // §6 retention job
];

export async function bootstrapSupportCaseCollections(db: Db): Promise<{
  collection: string;
  created: boolean;
  indexes: string[];
}> {
  const name = SUPPORT_CASES_COLLECTION;
  const existing = await db.listCollections({ name }).toArray();
  let created = false;
  if (existing.length === 0) {
    await db.createCollection(name, {
      validator: supportCasesJsonSchemaValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    created = true;
  } else {
    await db.command({
      collMod: name,
      validator: supportCasesJsonSchemaValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
  }
  const indexResults = await db.collection(name).createIndexes(supportCaseIndexes);
  return { collection: name, created, indexes: indexResults };
}
```

### 4.1 `category`: API-layer enum, not `$jsonSchema` enum — ruling, not re-deferral

The architecture review flagged this explicitly as `database-architect`'s call. **Ruled: API-layer validation
only, `bsonType: 'string'` at the schema layer.** Reasoning: FR-13's starter category list is stated by the
business-requirements doc itself to be "not research-validated." A schema-level `enum` failure mode is a hard
insert rejection (`validationAction: 'error'`) — the correct failure mode for genuinely structural violations
(a malformed document), but the *wrong* failure mode for "the product team wants to add a ninth category next
sprint," which should be a same-day code change to a validation list, not a database migration with a
`collMod` deploy. This mirrors `product-events-collections.ts`'s own precedent (referenced directly by the
architecture review) of keeping a similarly-provisional field schema-typed but not schema-enumerated. Revisit
trigger: once `business-analyst`/`ux-researcher` ratify a stable category taxonomy (their Stage 1/3 deliverable,
not run yet for this feature per the architecture review's own scope note), promote `category` to a `$jsonSchema`
`enum` at that point — cheap, additive, no data migration needed since every valid value under the API-layer
enum is by definition already a valid value under the eventual schema-layer enum.

### 4.2 Index-set review against the architecture review's proposal

Adopted verbatim from `03-architecture-review-phase2.md` §3.4, with two additions this document makes:

1. **Names added to every index** (`recovery-collections.ts`'s existing entries mostly rely on Mongo's default
   name; this document names all six explicitly) — required so `catalog-verify.ts`'s `DECLARED_CATALOG` entry for
   this new module can diff cleanly against live index names rather than relying on `defaultIndexName()`'s
   inferred name matching what actually gets created, consistent with how every *other* module already wired into
   `catalog-verify.ts` names its indexes explicitly (`location_events_asset_recorded`, `location_events_account_recorded`,
   etc. — `recovery-collections.ts` is the one outlier that doesn't, and this document does not repeat that gap).
2. **No text/search index on `description`/`notes.text`.** The architecture review's §6.4 already rules this out
   for a PCI-scope-containment reason (C-010-3 — "do not index or export... reduces blast radius"); this document
   confirms it as a data-layer decision, not just a policy statement — no such index appears in §3 above, and none
   should be added without a fresh C-010-3 review if a future full-text-search feature is proposed.

**Deliberately not indexed:** `assignedAgentAccountId` standalone (only appears in the compound "mine" index,
§3) — OQ-010-4's supervisor/team-queue question is unresolved, and a standalone index for a query pattern that
doesn't exist yet (browsing by assignee across all statuses) would be speculative per this role's own Best
Practice. Add it if/when OQ-010-4 resolves toward a supervisor dashboard that needs it.

---

## 5. `recovery_cases.originatingSupportCaseId` — DDL formalization

```ts
// backend/src/db/recovery-collections.ts — additive property (landing in the SAME collMod as Feature 011's
// additions, per that document's §6 coordination note — this is the other half of that coordinated migration).
properties: {
  // ...existing + Feature 011's additions...
  originatingSupportCaseId: { bsonType: ['string', 'null'] },
},
```

**Index: none added.** The architecture review flagged this as "review whether it needs its own index." Ruled
here: **no index needed.** The only read pattern this field serves is "given a recovery case, was it escalated
from a support case" (a single-document field read off an already-fetched-by-`_id` document — the existing
`security-cases.ts`/`recovery.ts` detail-view queries already fetch the full document by `_id`, so
`originatingSupportCaseId` comes along for free) — there is no proposed "list recovery cases that originated from
support cases" query anywhere in the architecture review or business requirements. The *reverse* lookup ("given a
support case, find its recovery case") is already served by `support_cases`' own
`escalatedToRecoveryCaseId` sparse index (§3) — that is the side that needs the index, because that's the
direction an actual query traverses (support-agent views a support case, follows the link to the recovery case,
not the other way around per any named flow). Adding a second index for the unused reverse direction would be
speculative.

**Security-serializer review (architecture review §4 flagged this to `database-architect`/`cybersecurity-architect`):**
ruled here, from the data-layer side — `originatingSupportCaseId` is not added to `serializeSecurityRecoveryCase`
(architecture-review.md §4's structural-exclusion pattern, Feature 011's). A security-company operator has no
named use for knowing a case's phone-vs-self-report origin, and exposing it would let an operator infer the
existence/category of an internal support workflow that has nothing to do with their recovery mandate — low
sensitivity, but zero benefit, so the exclusion costs nothing. `cybersecurity-architect` should still confirm at
Stage 8, per the architecture review's own flag — this document's ruling is a recommendation with reasoning, not
a claim of final sign-off authority over serializer contents (that's `backend-architect`/`cybersecurity-architect`
territory at Stage 7/8).

---

## 6. Retention-expiry job — query shape for `support_cases`

Per compliance review §5 / architecture review §6.7: **24 months from `closedAt`**, escalated cases excluded.

```ts
const RETENTION_MONTHS = 24;
const cutoff = new Date();
cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);

const filter = {
  status: { $in: ['resolved', 'closed'] }, // 'escalated' is a distinct enum value — never matches this filter,
                                            // confirming the architecture review's own "closer to automatic than
                                            // an extra clause" observation structurally, not just by argument
  closedAt: { $lte: cutoff },
};
```

**Mechanism:** whole-document deletion is appropriate here (unlike Feature 011's field-level clearing, §5 of that
feature's `database-design.md`) — a resolved/closed support case past its retention floor has no "surviving
document" requirement the way a `recovery_cases` row does; the compliance review does not name any part of a
support case that must outlive the case itself. **This means `support_cases` retention CAN legitimately use a
Mongo TTL index, unlike `recovery_cases`** — but this document recommends **against** a TTL index anyway, for one
concrete reason specific to this collection: `legalHold` does not exist on `SupportCaseDocument` (§3), and TTL
indexes have no conditional-exception mechanism. If a support case is ever the subject of a dispute or an
`escalatedToRecoveryCaseId`-adjacent investigation that later gets reopened, an unconditional 24-month TTL would
delete it regardless. **Recommendation: add `legalHold: boolean` (default `false`) to `SupportCaseDocument`,
mirroring `recovery_cases.legalHold`/Feature 004's `policies.legalHold`/`assets.legalHold` exactly, and run the
same scheduled-script pattern as Feature 011's job (§5.3 of that document) — `updateMany` → `deleteMany` on the
filter above, with `legalHold: { $ne: true }` added to it — rather than a TTL index.** This is a schema addition
this document is making beyond what the architecture review specified (that document's §3 schema has no
`legalHold` field); flagged explicitly here rather than silently added, because it changes §3's `required` array
if made mandatory — **this document adds it as optional with an application-layer default of `false` on
creation, not as a `required` field**, to avoid forcing every future insert to remember it explicitly (mirrors
how `legalHold` is `required` on `recovery_cases`' validator today — a real inconsistency between the two
collections this document is choosing not to force-resolve; `assignedAgentAccountId`-style optional-with-app-default
is the lower-risk choice for a field with no write path designed yet).

**Not designed here (Stage 8, joint with `security-engineer` per the architecture review's own §7 table):** the
job's scheduling infrastructure, and whether it shares a run cadence/run-log mechanism with Feature 011's job —
**recommended they do**, since both are daily-or-slower, low-volume, evidenced retention jobs against the same
general shape of problem; a single shared `backend/scripts/retention-purge.ts` entrypoint invoking both this
feature's `support_cases` purge and Feature 011's `recovery_cases` field-clear, sharing one run-log write, is a
cheaper operational surface than two independently-scheduled scripts. Named as a recommendation for
`devops-engineer`, not decided unilaterally here (scheduling infrastructure is that role's authority).

---

## 7. `catalog-verify.ts` / `mongo-bootstrap.ts` wiring (Stage 9 target, specified here so it isn't invented ad hoc)

- **`mongo-bootstrap.ts`:** add `bootstrapSupportCaseCollections` to `ensurePolicyAssetCollections()`'s
  try/catch chain, following the exact non-fatal-failure pattern every other module already uses (support-case
  bootstrap failure must not take down auth/policy routes on startup, same reasoning as every existing entry).
- **`catalog-verify.ts`:** add a new `DeclaredCollectionSpec` entry, `module: 'support-cases'`, importing
  `SUPPORT_CASES_COLLECTION`/`supportCaseIndexes`/`supportCasesJsonSchemaValidator` from the new module — and
  update the existing `module: 'recovery'` entry's `validator`/`indexes` imports to the post-migration
  `recoveryCasesJsonSchemaValidator`/`recoveryCaseIndexes` (this is the same update Feature 011's document's §7
  table names — one shared edit, not two, since both features touch the same declared-catalog entry).

---

## 8. What needs `backend-architect`/Stage 7, and what needs Stage 8/9

| Item | Decided here | Needs downstream |
|---|---|---|
| `support_cases` collection DDL | **Formalized in full** — §3 | `backend-engineer`, Stage 9 |
| `category` schema-vs-API-layer enum | **Ruled** — §4.1 (API-layer) | `business-analyst` eventual taxonomy ratification promotes it later |
| Index set | **Formalized, named** — §3/§4.2 | `backend-engineer`, Stage 9 |
| `recovery_cases.originatingSupportCaseId` | **Formalized, no index** — §5 | `backend-engineer`, Stage 9; `cybersecurity-architect` Stage 8 confirmation on serializer exclusion |
| `support_cases.legalHold` | **Added, beyond architecture-review.md's schema** — §6 | `backend-architect` should confirm this doesn't conflict with any FR-15/16 status-transition assumption; `backend-engineer` Stage 9 |
| Retention job mechanism | **Designed, TTL explicitly rejected in favor of scripted purge** — §6 | `devops-engineer` scheduling; `security-engineer` Stage 8 evidencing sign-off |
| Escalation endpoint schema fields | **Formalized** (§3's `escalatedToRecoveryCaseId`/`escalatedAt`/`status: 'escalated'`) — **NOT AUTHORIZED FOR IMPLEMENTATION**, inherited restriction | Blocked on C-010-4 per architecture review §5.4 |
| `catalog-verify.ts`/`mongo-bootstrap.ts` wiring | **Specified** — §7 | `backend-engineer`, Stage 9 |

---

## 9. Pre-Approval Checklist (`database-architect` self-review)

- [x] Schema change reviewed for embed-vs-reference correctness — `support_cases` as a wholly separate collection
      from `recovery_cases` confirmed correct (§2); `notes[]` embedded (low-volume, read-with-parent, matches
      `callCentreNotes[]` precedent); `originatingSupportCaseId` kept as a plain soft cross-reference field, not
      embedded, consistent with how `accountId` already crosses collection/store boundaries in this codebase.
- [x] Indexing strategy validated against actual hot query paths — §3/§4.2, with explicit "deliberately not
      indexed" callouts (standalone `assignedAgentAccountId`, any text-search index) matching Feature 004's
      documented convention for the same category of restraint.
- [x] GPS/location-history growth — N/A, not touched by this feature.
- [ ] Sensitive fields reviewed with `cybersecurity-architect` — C-010-3 (PCI-adjacent free text) and C-010-6
      (agent-on-behalf-of-customer processing) are named and inherited from the architecture review, not
      re-litigated here; Stage 8 sign-off still outstanding.
- [x] Claim/policy/payment-adjacent changes preserve auditable history — `notes[]` append-only; `status`
      transitions are not separately event-logged in this design (no `support_case_status_history` collection
      proposed) — **named gap, not an oversight:** the architecture review's own FR-15 graph is a small, fixed
      state machine (`open → in_progress → resolved → closed`, or `→ escalated`) with low transition volume per
      case; unlike `policies`/`recovery_cases`, no compliance requirement in either the business-requirements or
      compliance-review documents for this feature calls for a full transition-history collection. If that
      changes, the `policy_status_history` shape (Feature 004 §3.2) is the template to reuse, not reinvent.
- [ ] Data-retention policy aligns with `compliance-specialist`'s regulatory guidance — mechanism designed (§6);
      `legalHold` addition (this document's own extension beyond the architecture review) should be confirmed
      with `compliance-specialist` as sufficient, not just internally consistent with sibling collections.
- [ ] Capacity impact reviewed with `cloud-infrastructure-architect` — not done; call-centre case volume is named
      low-frequency by the architecture review's own unchecked capacity item, no new concern introduced here.
- [x] Migration path specified — new collection is pure creation (no existing data); the `recovery_cases`
      addendum is additive-only; coordination with Feature 011's simultaneous `recovery_cases` migration is
      named explicitly (§5, and cross-referenced in that feature's own §6).
