# Feature 010 (Phase 2) — Call Centre Support & Incident Management
## Architecture Review — Stage 5

**Lifecycle stage:** 5 — Architecture Review, per [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md).
**Author:** `backend-architect`
**Status:** Draft — architecture-level design for `solution-architect` sign-off.
**Scope:** **FR-11–FR-17 only** (lookup enrichment, non-theft support-case creation/notes/status/resolution, case
list) — the part `compliance-specialist` CLEARED to enter Stage 2 (compliance review §4). **FR-18–FR-21
(agent-initiated escalation to a recovery case) are NOT CLEARED** and remain blocked at Stage 1 pending a Tier 2
caller-verification design (C-010-4, joint `cybersecurity-architect` + `compliance-specialist`). Per the task
brief, this document does not design a caller-verification mechanism. It **does** design the escalation
endpoint's data contract and reference-link mechanism, because the task brief asks for it and because the
`support_cases` schema needs an `escalatedToRecoveryCaseId` field regardless of when FR-18–21 unblocks — but
every mention of the escalate endpoint below is marked **NOT AUTHORIZED FOR IMPLEMENTATION** and must not be
built ahead of C-010-4 clearing.
**Reads on:** [`02-support-incident-management-business-requirements.md`](./02-support-incident-management-business-requirements.md)
(FR-11–21), [`compliance-review-agent-attributed-actions.md`](./compliance-review-agent-attributed-actions.md)
(C-010-1…7, binding on this design), `backend/src/routes/support-lookup.ts`,
`backend/src/repositories/recovery-cases.ts`, `backend/src/routes/recovery.ts`,
`backend/src/routes/security-cases.ts`, `backend/src/db/recovery-collections.ts`,
`backend/src/db/product-events-collections.ts` (collection-bootstrap convention followed here).

---

## 1. What this document decides vs. defers

**Decides:**
- `support_cases` as a new, separate MongoDB collection — not reusing `recovery_cases` (§2), confirming the
  product-manager's Stage-1 recommendation is architecturally sound and naming the specific mechanism (§4) that
  makes the `listForPartnerOrg` leakage risk the Stage-1 doc flagged structurally impossible, not just avoided.
- The `support_cases` schema, including the `callerVerified` field required by C-010-2 (§3).
- The API routes for FR-11 (lookup enrichment), FR-12–17 (create/list/detail/notes/status), and the **data
  contract only** (not the authorization gate) for FR-18–21 escalation (§5).
- The two-way reference-link mechanism between `support_cases` and `recovery_cases` (§5.4).

**Defers:**
- Tier 2 caller-verification mechanism (C-010-4) — `cybersecurity-architect` + `compliance-specialist`. This is
  the actual blocker on FR-18–21 and this document does not attempt to resolve it.
- OQ-010-4 (individual vs. team queue, supervisor role) — `cto`/`technical-project-manager`. §6.2 designs the
  list-scoping mechanism to be a config toggle rather than a schema fork, so this doesn't block Stage 6/7 either
  way.
- OQ-010-5 (entitlement-gate script wording) — `business-analyst`/`product-manager`; the *mechanism*
  (`assertPlanEntitlement`) is named in §5.4 because it's a direct reuse of existing code, not new design.
- Exact BSON validator/index DDL — `database-architect`, Stage 6 (§8).
- C-010-1 (scripted verification + disclosure reminder on `GET /customer-lookup`) — this is a UI/script design
  (`ux-researcher`/`technical-writer`/`frontend-engineer`), not a backend architecture question, but §6.1 names
  the one backend-relevant piece (an audit-trail distinction) it implies.

---

## 2. Why `support_cases` is a separate collection — architectural confirmation, not restatement

The Stage-1 doc's reasoning (§1 of the business-requirements doc) is correct and this document adopts it, adding
the specific mechanism that makes it binding rather than just well-argued:

`security-cases.ts`'s `GET /v1/security/cases` calls `ctx.recoveryCases.listForPartnerOrg`, whose query is:

```ts
$or: [{ partnerOrganizationId }, { partnerOrganizationId: null, status: 'open' }]
```

Any document in the `recovery_cases` collection with `status: 'open'` and no `partnerOrganizationId` is visible
to **every** security-company partner's unclaimed-case queue, unconditionally — there is no `assetId`-presence
check, no type discriminator, nothing that would stop a generic support ticket from surfacing there if it were
ever inserted into this collection with a superficially similar shape. This is not a theoretical risk to design
around defensively; it is a query that already runs in production against this exact collection today. A
separate collection makes it **structurally impossible** for a support case to appear in that query, because
`listForPartnerOrg` only ever queries `db.collection('recovery_cases')` (§4 gives the collection name), and
`support_cases` is never that collection. This is the same "exclude by construction" design principle applied in
this document's sibling Feature 011 review (that document's §4) to a different leakage risk — consistent
technique, not a coincidence.

Secondary reasons, both real but subordinate to the leakage argument: `recovery_cases`' `status` enum
(`open | investigating | tracking | recovered | closed`) has no meaning for "customer asked how to add an asset,"
and differential retention (§6.7) is only cleanly implementable with a separate collection (compliance review §7
makes this same observation and defers to this document for the actual schema).

---

## 3. `support_cases` collection design

Following the collection-definition convention in `backend/src/db/recovery-collections.ts` /
`product-events-collections.ts` (named collection constant + `$jsonSchema` validator + `IndexDescription[]` +
bootstrap function) — this document proposes the shape below for `database-architect` to formalize at Stage 6,
exactly as Feature 004's `api-design.md` §3 proposed `admin_access_log` for the same downstream formalization.

```ts
export type SupportCaseStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'escalated'; // terminal for support-case purposes — see §5.4

export type SupportCaseCategory =
  | 'billing'
  | 'app_technical_issue'
  | 'policy_question'
  | 'asset_registration_help'
  | 'account_access'
  | 'other'; // FR-13 starter set — NOT ratified, database-architect should keep this an open string enum,
             // not bake in assumptions about finality (business-requirements.md §6 item 4)

export type SupportCaseChannel = 'phone'; // Phase 2 — extensible later, not a closed design decision

export interface SupportCaseNote {
  agentAccountId: string;
  text: string;
  createdAt: Date;
} // identical shape to RecoveryCaseDocument.CallCentreNote — deliberate reuse of an already-accepted pattern

export interface SupportCaseDocument {
  id: string;
  accountId: string;                    // the customer account this case is about (resolved via customer-lookup)
  category: SupportCaseCategory;
  description: string;                  // free text, FR-12 — bounded, see §3 validator notes
  channel: SupportCaseChannel;
  status: SupportCaseStatus;
  referenceNumber: string;              // "SC-YYYYMMDD-XXXX" — same generator pattern as recovery_cases, see §7
  resolutionSummary: string | null;     // required (enforced at API layer, not schema) on resolved/closed — FR-16
  notes: SupportCaseNote[];             // append-only — FR-14
  createdByAgentAccountId: string;      // the agent who created the case — attribution, distinct from assignment
  assignedAgentAccountId: string | null; // nullable; OQ-010-4 undecided — see §6.2 for how this stays non-blocking
  callerVerified: boolean;              // C-010-2 — false by default; NEVER silently unverified (see §3.1)
  callerVerificationMethod: string | null;
  callerVerifiedAt: Date | null;
  escalatedToRecoveryCaseId: string | null; // set only by the (currently NOT AUTHORIZED) escalate endpoint, §5.4
  escalatedAt: Date | null;
  closedAt: Date | null;                // needed for the 24-month retention clock (compliance review §5)
  createdAt: Date;
  updatedAt: Date;
}
```

### 3.1 `callerVerified` — why a dedicated field, not a case-status value

C-010-2 requires the unverified state be "visibly flagged on the record and in the agent UI" and "captured in
the audit trail" — but it is a property of *who is on the phone*, orthogonal to *how far the case has
progressed*. Folding it into `status` (e.g. a `caller_unverified` status value) would collide with the FR-15
lifecycle (`open → in_progress → resolved → closed`, or `open → escalated`) and raise an immediate question —
"is a resolved-but-never-verified case `resolved` or `caller_unverified`?" — that a status enum can't answer
cleanly. A separate boolean plus method/timestamp avoids that collision and is directly queryable/indexable on
its own (§3.2's escalation-block query needs exactly this field, not a status branch). Default `false` on every
newly created case (Tier 2 verification doesn't exist yet, so no code path can set it `true` today — that's
expected and named, not a bug: **every `support_cases` row created under this Stage-2 scope is
`callerVerified: false` until C-010-4 ships a real verification mechanism**).

### 3.2 Enforcement points this field feeds (API-layer, not schema-layer)

- `POST /support-cases/:id/escalate` (FR-18, **NOT AUTHORIZED**, §5.4) must check `callerVerified === true` and
  refuse with `403 CALLER_NOT_VERIFIED` otherwise — this is the actual mechanical block C-010-2/C-010-4 requires,
  and it's why this field must exist in the schema now even though the endpoint that reads it can't ship yet.
- Any future "disclose account detail back to the caller" surface should also gate on this field — no such
  endpoint is designed in this document (support-case detail reads return only the support case's own data, not
  a reach-back into policy/asset detail — see §5.3), so this is named as a constraint for future designs to
  respect, not something this document itself needs to enforce today.

### 3.3 `$jsonSchema` validator sketch (Stage 6 formalizes)

```ts
{
  $jsonSchema: {
    bsonType: 'object',
    required: ['accountId', 'category', 'description', 'channel', 'status', 'referenceNumber',
               'notes', 'createdByAgentAccountId', 'callerVerified', 'createdAt', 'updatedAt'],
    properties: {
      accountId: { bsonType: 'string' },
      category: { enum: ['billing', 'app_technical_issue', 'policy_question', 'asset_registration_help',
                          'account_access', 'other'] },
      description: { bsonType: 'string', maxLength: 2000 }, // mirrors recovery_cases.notes' bound
      channel: { enum: ['phone'] },
      status: { enum: ['open', 'in_progress', 'resolved', 'closed', 'escalated'] },
      referenceNumber: { bsonType: 'string', minLength: 8, maxLength: 32 },
      resolutionSummary: { bsonType: ['string', 'null'], maxLength: 2000 },
      notes: { bsonType: 'array', items: { bsonType: 'object',
                 required: ['agentAccountId', 'text', 'createdAt'],
                 properties: { agentAccountId: { bsonType: 'string' }, text: { bsonType: 'string', maxLength: 2000 },
                               createdAt: { bsonType: 'date' } } } },
      createdByAgentAccountId: { bsonType: 'string' },
      assignedAgentAccountId: { bsonType: ['string', 'null'] },
      callerVerified: { bsonType: 'bool' },
      callerVerificationMethod: { bsonType: ['string', 'null'] },
      callerVerifiedAt: { bsonType: ['date', 'null'] },
      escalatedToRecoveryCaseId: { bsonType: ['string', 'null'] },
      escalatedAt: { bsonType: ['date', 'null'] },
      closedAt: { bsonType: ['date', 'null'] },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
}
```

**Not decided here, flagged for `database-architect`:** whether `category` should be a hard schema enum (blocks
insert on an unlisted category, matching `recoveryCasesJsonSchemaValidator`'s style) or a soft string with
API-layer validation only (easier to extend the FR-13 starter set without a migration). Given FR-13 is
explicitly "not research-validated," this document leans toward **API-layer enum validation, not a schema-level
enum** — cheaper to extend later, matching `product-events-collections.ts`'s own choice to keep `eventName`
schema-enforced but note it as intentionally short and revisable. `database-architect`'s call.

### 3.4 Proposed indexes

```ts
[
  { key: { accountId: 1, createdAt: -1 } },                         // FR-11 lookup-enrichment query
  { key: { status: 1, category: 1, createdAt: -1 } },                // FR-17 triage/list
  { key: { referenceNumber: 1 }, unique: true },
  { key: { createdByAgentAccountId: 1, status: 1, createdAt: -1 } }, // "my cases" queue variant, §6.2
  { key: { escalatedToRecoveryCaseId: 1 }, sparse: true },           // reverse lookup from a recovery case
  { key: { status: 1, closedAt: 1 } },                               // retention-expiry job query, §6.7
]
```

`database-architect` sign-off required on final index set — this is a proposal, following the same house
convention `recovery-collections.ts`/`product-events-collections.ts` already use, not a ratified DDL.

---

## 4. `recovery_cases` addendum — one new field for the reverse link

FR-19 requires the link be recorded "in both directions." `support_cases.escalatedToRecoveryCaseId` covers one
direction; the other requires a small, additive field on the existing `RecoveryCaseDocument`:

```ts
export interface RecoveryCaseDocument {
  // ...existing fields, plus Feature 011's additions if that lands first...
  originatingSupportCaseId: string | null; // set only when this case was created via the (NOT AUTHORIZED)
                                            // escalate endpoint; null for customer-self-reported cases
}
```

This is additive and backward-compatible — every existing row gets `originatingSupportCaseId: null` on schema
migration. **This field carries no new sensitivity class** (it's an internal cross-reference id, not a new
personal-data category, unlike Feature 011's fields) — no analogous exclusion-from-security-serializer concern
applies, but for consistency it should still be reviewed at Stage 6 for whether a security-company operator has
any legitimate need to see it (probably not — an operator doesn't need to know a case originated from a phone
call vs. self-report — `database-architect`/`cybersecurity-architect` call, not ruled here).

---

## 5. API design

### 5.1 `GET /v1/customer-lookup` — FR-11 addendum (extends `support-lookup.ts`, does not replace it)

Additive fields on the existing response `data` object, alongside the existing `openRecoveryCaseCount`/
`recoveryCases` pair:

```
"openSupportCaseCount": number,
"supportCases": [{ id, referenceNumber, status, category, createdAt, callerVerified }]
```

Implementation shape: one new repository method, `ctx.supportCases.listOpenByAccount(accountId, limit, cursor)`,
called via `Promise.all` alongside the existing `policies`/`assets`/`recoveryCases` calls already in that
handler — no change to that handler's existing auth/audit posture (`privileged_data_access`, already recorded
once per lookup call). **Open statuses for this count:** `open`, `in_progress` — mirroring
`OPEN_RECOVERY_STATUSES`'s existing pattern in `support-lookup.ts` line 32, not `escalated` (a case that's been
escalated has effectively moved its "open-ness" to the resulting recovery case, which `openRecoveryCaseCount`
already covers).

### 5.2 New router: `support-cases.ts` (mounted alongside `support-lookup.ts`, same auth middleware pattern)

| Method + path | Auth | Purpose | FR |
|---|---|---|---|
| `POST /v1/support-cases` | `requireUserType('support_agent')` | Create a case against a looked-up `accountId` | FR-12 |
| `GET /v1/support-cases` | `requireUserType('support_agent')` | List/search, filterable by status/category/accountId | FR-17 |
| `GET /v1/support-cases/:caseId` | `requireUserType('support_agent')` | Detail view | FR-17 |
| `POST /v1/support-cases/:caseId/notes` | `requireUserType('support_agent')` | Append note | FR-14 |
| `PATCH /v1/support-cases/:caseId/status` | `requireUserType('support_agent')` | Status transition + resolution summary | FR-15/16 |
| `POST /v1/support-cases/:caseId/escalate` | `requireUserType('support_agent')` | **NOT AUTHORIZED FOR IMPLEMENTATION** — data contract only, §5.4 | FR-18–21 |

**Auth model note, distinct from every other route reviewed in this repo's Stage-2/5 precedent so far:**
`recovery.ts`'s customer routes derive `accountId` from the bearer token (the caller acts on their own data).
`security-cases.ts`'s routes derive `partnerOrganizationId` from the token (the caller acts within their own
org's scope). **`support-cases.ts` is different in kind: the agent is not the subject of the data.** `accountId`
is a **request-body field on `POST /support-cases`**, resolved by the agent from a prior `GET /customer-lookup`
call — this is a deliberate, necessary exception to Feature 004 §4.2's "never client-supplied `accountId`" rule,
because the entire point of this endpoint is agent-on-behalf-of-customer creation. **This is exactly the
processing category compliance review §1 (Feature 010) calls "Operator staff acting on a customer's behalf" and
ties to C-010-6 (CT-4 coverage)** — named here so `security-engineer` doesn't mistake the client-supplied
`accountId` for a bug being carried over from a different, wrongly-applied convention. The mitigating control is
that `accountId` must resolve to a real account (`ctx.accounts.findById`, 404 otherwise — same pattern
`support-lookup.ts` already uses) and every write is attributed to `createdByAgentAccountId` from the token, not
trusted from the body.

### 5.3 Request/response shapes (Stage 7 formalizes as OpenAPI)

```
POST /v1/support-cases
Idempotency-Key: required (create-with-side-effects, same convention as POST /v1/recovery/cases)
Rate limit: existing support-lookup.ts limiter class (30/min per agent+IP) — reused, not a new limiter
Body: { accountId: string(uuid), category: SupportCaseCategory, description: string(<=2000), channel?: 'phone' }
  -> accountId must resolve to a user_type='customer' account (404 otherwise, uniform with support-lookup.ts's
     existing "don't leak whether an identifier exists" posture where applicable)
201 -> { id, referenceNumber, status: 'open', category, callerVerified: false, createdAt, ... }

GET /v1/support-cases?status=&category=&accountId=&cursor=&limit=
200 -> { data: SupportCaseSummary[], pagination: { nextCursor, hasMore } }  // standard cursor convention, reused

GET /v1/support-cases/:caseId
200 -> full SupportCaseDocument shape (agent-facing — no customer-facing variant needed, this surface has no
       customer client)
404 -> case does not exist (uniform, no distinction from "not visible to you" per house convention)

POST /v1/support-cases/:caseId/notes
Body: { text: string(1-2000) }
201 -> { caseId, note: { agentAccountId, text, createdAt } }   // mirrors support-lookup.ts's existing
                                                                 // POST /recovery-cases/:caseId/notes shape

PATCH /v1/support-cases/:caseId/status
Body: { status: 'in_progress' | 'resolved' | 'closed', resolutionSummary?: string }
  -> 'escalated' is INTENTIONALLY EXCLUDED from this endpoint's accepted enum — the only path to that status is
     the escalate endpoint (§5.4), because escalation has side effects (creating a recovery_cases row) this
     endpoint must not trigger implicitly.
  -> resolutionSummary REQUIRED (400 if absent) when status is 'resolved' or 'closed' — FR-16
  -> transition validated server-side against the fixed FR-15 graph (open -> in_progress -> resolved -> closed;
     no transition out of 'closed' or 'escalated' — both terminal)
200 -> updated case
```

### 5.4 Escalation (FR-18–21) — data contract only, NOT AUTHORIZED FOR IMPLEMENTATION

Recorded so the schema (§3/§4) is right when C-010-4 clears, and so `database-architect`/`cybersecurity-
architect` have a concrete target to review against — **not** a green light to build the route itself.

```
POST /v1/support-cases/:caseId/escalate     [BLOCKED — requires C-010-4 Tier 2 verification design first]
Body: { assetId: string }
Preconditions (all must hold, else the specific named error):
  - support case status is 'open' or 'in_progress'                          -> 409 if not
  - support_case.callerVerified === true                                    -> 403 CALLER_NOT_VERIFIED if not
  - assertPlanEntitlement(ctx, support_case.accountId, 'incidentManagement') -> reuses recovery.ts's existing
    entitlement gate verbatim, same function, same error shape (403 with the existing entitlement-error code) —
    OQ-010-5 governs what the agent is told/does next, not this contract
  - assetId belongs to support_case.accountId (ctx.assets.findByIdForAccount) -> 404 if not
  - no existing open/investigating/tracking/recovered-pending recovery case for that asset (dupe check,
    identical to recovery.ts's existing duplicate-guard logic — reused, not reinvented)
Effect (all in one logical operation — transactionality is a Stage 6/9 implementation detail, not decided here):
  1. ctx.recoveryCases.createForAccount(accountId, assetId, notes=null, partnerOrganizationId=null)
     -> lands in the existing unclaimed queue automatically (listForPartnerOrg's existing $or clause already
        matches partnerOrganizationId: null && status: 'open' — confirmed, no Security Dashboard-side change
        needed, exactly as the Stage-1 business-requirements doc's FR-19 already established)
  2. Set new recovery_cases row's originatingSupportCaseId = support_case.id (§4)
  3. Set support_case.escalatedToRecoveryCaseId = new case id, escalatedAt = now, status = 'escalated'
  4. Persist a Tier-2 verification record per C-010-4 §3's requirement 3 (method, outcome, timestamp, agent
     account id, channel) — shape TBD by the C-010-4 design, not invented here
  5. Emit the distinct `caller_verification` audit event proposed in compliance review §3 Tier 2 requirement 4
     (separate from `privileged_data_access`) — event taxonomy is cybersecurity-architect's Stage 8 call
  6. Out-of-band notification to the account holder (compliance review §3 Tier 2 requirement 6) — currently
     blocked on INC-001-C-8 regardless of C-010-4's status; this is a second, independent reason this endpoint
     cannot ship yet even after C-010-4 lands, named so it isn't rediscovered late
```

**Restated plainly: this endpoint's preconditions and effects are specified so the schema and the eventual
Tier-2 design have a stable target, but no engineer should implement this route from this document alone.**
Implementation requires (a) C-010-4's verification mechanism actually existing and (b) INC-001-C-8 resolving
enough for step 6 to be real, not a no-op that silently drops a compliance requirement.

---

## 6. Key decisions and open items carried forward, not resolved here

### 6.1 C-010-1 (Tier 0 disclosure control on `GET /customer-lookup`)

Out of this document's scope (UI/script), but one backend-relevant implication: the existing
`privileged_data_access` audit event on that route (`support-lookup.ts` line 122-130) does not currently
distinguish "agent looked at data" from "agent read data back to a verified caller." If `ux-researcher`/
`cybersecurity-architect` want the disclosure-reminder step to leave its own trace, that's an additive audit
field (e.g. `disclosureAcknowledged: boolean` on the existing audit-log write), not a new event type or new
architecture — flagged for whoever designs C-010-1's concrete mechanism.

### 6.2 OQ-010-4 (individual vs. team queue) — designed to be a config toggle, not a schema fork

`GET /support-cases`'s list scoping (§5.3) should accept a `scope` query parameter (`mine` | `all`), with
`createdByAgentAccountId` used as the filter for `mine`. **Default value is deliberately left open** — this
document does not rule whether the *default* (no `scope` param given) is "mine" or "all," because that's exactly
what OQ-010-4 needs to answer, and hard-coding a default now would be making that business call by omission.
The schema (`createdByAgentAccountId` + `assignedAgentAccountId`, §3) supports either resolution without a
migration — the only unresolved variable is a query-parameter default and whether `assignedAgentAccountId`
gets a write path (needs a supervisor role, per OQ-010-4).

### 6.3 Category taxonomy (FR-13)

Kept as an API-layer-validated string set (§3.3), not hard-baked into the Mongo schema, specifically so revising
it (per `ux-researcher`'s future input, business-requirements.md §6 item 4) is a code change to a validation
list, not a migration.

### 6.4 C-010-3 (PCI scope protection in `description`/notes free text)

No schema control can prevent an agent typing a card number into `description` or a note — compliance review §5
is explicit that "masking is the wrong control." This document's only architectural contribution is: **do not
index or export `description`/`notes.text` anywhere** (no full-text search index proposed in §3.4, no analytics/
export pipeline reads this collection) — reduces the blast radius if the UI-guidance control (owned by
`ui-designer`/`technical-writer`) is imperfect. Confirmation that no such export exists is a Stage 8 item
(C-010-3's own condition table), not re-derived here.

### 6.5 C-011-1 (third-party suspect data) applies to `description` too

Inherited, not restated — same free-text risk as `recovery_cases.notes`. No schema-level control; UI-guidance
control per C-011-1's owner (`ui-designer` + `technical-writer`).

### 6.6 Reference-number generator — recommend extracting a shared helper

`recovery-cases.ts`'s `generateReferenceNumber()` (`RC-YYYYMMDD-XXXX`) is a private, unexported function.
`support_cases` needs the identical pattern with a different prefix (`SC-...`). **Recommendation, not a
blocker:** extract a shared `generateCaseReferenceNumber(prefix: string)` helper into `backend/src/lib/`, used by
both `recovery-cases.ts` and the new `support-cases.ts` repository, instead of copy-pasting the generator.
Small, non-blocking refactor — flagged for whoever implements Stage 9, consistent with this repo's existing
practice of naming small drift risks rather than silently duplicating (see Feature 004 api-design.md P-11 for
the same category of flag).

### 6.7 Retention (compliance review §5) — 24 months from `closedAt`, except escalated cases

`closedAt` (§3) is the field the retention-expiry job keys off. **Escalated cases are explicitly excluded from
this collection's own retention clock** — once `escalatedToRecoveryCaseId` is set, the case's evidentiary life
continues on the `recovery_cases` side (which, per Feature 011's compliance ruling, has its own 5-year-from-
closure floor for the police-report fields specifically, and inherits general recordkeeping obligations
otherwise). This document does **not** design the deletion job itself (§8, `database-architect`) but names the
query shape it needs: `{ status: { $in: ['resolved', 'closed'] }, closedAt: { $lte: <24-months-ago> } }`,
excluding any document with `escalatedToRecoveryCaseId !== null` (which won't match the `status` filter anyway,
since `escalated` is a distinct status value from `resolved`/`closed` — the exclusion is closer to "automatic"
than "an extra clause," but named explicitly so it isn't assumed to need one).

---

## 7. What needs `database-architect` sign-off vs. what's decided here

| Item | Decided here (backend-architect) | Needs `database-architect` (Stage 6) |
|---|---|---|
| `support_cases` as a separate collection, not reusing `recovery_cases` | Yes — §2 (confirms Stage-1 recommendation) | — |
| Field list / shape (§3) | Proposed | **Final schema, `$jsonSchema` validator, whether `category` is schema-enforced (§3.3)** |
| Index set (§3.4) | Proposed | **Final index set + names** |
| `recovery_cases.originatingSupportCaseId` addendum (§4) | Proposed | **DDL formalization; review whether it needs its own index** |
| Retention-expiry job query shape (§6.7) | Constraint named | **Full job design**, joint with `security-engineer` |
| `callerVerified` as a dedicated field vs. folded into `status` | Decided (dedicated field) — §3.1 | Confirm no conflict with any future supervisor/assignment schema (OQ-010-4) |

---

## 8. Handoff to Stage 6 / Stage 7 / Stage 8

- **Stage 6 (`database-architect`):** formalize `support_cases` collection (new file, e.g.
  `backend/src/db/support-case-collections.ts`, following `recovery-collections.ts`'s structure exactly),
  formalize the `recovery_cases.originatingSupportCaseId` addendum, design the retention-expiry job.
- **Stage 7 (`backend-architect`):** publish `010-call-centre-dashboard/api-design.md` (this feature has no
  existing API design doc) covering FR-11–17 as implementable now; document FR-18–21's contract as
  **contingent/blocked** in the same document rather than omitting it, so the eventual unblock doesn't require
  rediscovering the shape from scratch.
- **Stage 8 (`cybersecurity-architect`/`security-engineer`):** (a) verify `support-cases.ts`'s client-supplied
  `accountId` on `POST /support-cases` is intentional and correctly scoped per §5.2's note, not a regression of
  Feature 004's "never client-supplied accountId" rule; (b) own C-010-4's Tier 2 verification mechanism — the
  actual unblock for FR-18–21; (c) confirm the `support_cases` → `recovery_cases` leakage argument in §2 holds
  under an actual code review, not just this document's reasoning; (d) rule on the `caller_verification` audit
  event taxonomy (§5.4 step 5).

---

## 9. Pre-Approval Checklist (`backend-architect` self-review)

- [x] API contract sketched for the cleared scope (FR-11–17) before client implementation starts (§5.1–5.3).
- [x] Service boundaries documented — new `support-cases.ts` router, new `support_cases` collection, explicit
      non-reuse rationale (§2).
- [x] Idempotency strategy defined for the money/state-mutating endpoint in scope (`POST /support-cases`, §5.3).
- [x] Authn/authz model explicit per endpoint, including the deliberate exception to the client-supplied-
      accountId rule and why (§5.2).
- [x] Third-party failure modes — N/A, no third-party vendor dependency introduced by FR-11–17.
- [ ] FR-18–21's authz gate (Tier 2 verification) is **explicitly not designed here** and is named as the
      blocking dependency throughout (§5.4) — left unchecked deliberately, this is not an oversight.
- [ ] Capacity/throughput targets — not stated; call-centre volume is low-frequency transactional, no target
      requested.
- [ ] Reviewed and approved by `solution-architect` — pending, this document is the submission for that review.
