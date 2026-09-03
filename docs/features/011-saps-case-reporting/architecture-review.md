# Feature 011 (Idea 1 only) — SAPS Case-Number Capture
## Architecture Review — Stage 5

**Lifecycle stage:** 5 — Architecture Review, per [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md).
**Author:** `backend-architect`
**Status:** Draft — architecture-level design for `solution-architect` sign-off. Not an implementation PR, not a
Stage 6 (Database Design) or Stage 7 (API Design) formal artifact — those stages own the DDL/validator/index
formalization and the versioned OpenAPI contract respectively. This document is the handoff into both.
**Scope:** Idea 1 only (structured `sapsCaseNumber` / `reportingStation` / `reportedToPoliceAt` capture on an
existing `recovery_cases` row). **Idea 2 (station locator / report-assistant) is explicitly out of scope** —
blocked on OQ-011-02 (dataset sourcing), not a design question this document answers.
**Reads on:** [`business-requirements.md`](./business-requirements.md) (BR-011-01…09, AC-011-01…04/09),
[`compliance-review-saps-case-data.md`](./compliance-review-saps-case-data.md) (conditions C-011-1…10, binding
on this design), `backend/src/repositories/recovery-cases.ts`, `backend/src/routes/recovery.ts`,
`backend/src/routes/security-cases.ts`, `backend/src/db/recovery-collections.ts`.
**Disposition inherited:** Idea 1 is CLEARED to enter Stage 2+ subject to C-011-1…C-011-10 (none of which block
Stage 2/5/6/7 design work — see compliance review §10). This document does not re-litigate that ruling.

---

## 1. What this document decides vs. defers

**Decides (this role's authority — service/API/data-shape boundaries):**
- Where the three fields (and their change history) live: an extension of `RecoveryCaseDocument`, not a new
  entity (§2).
- The API surface: a new customer-scoped mutation endpoint, its request/response contract, and its auth/rate-limit
  posture (§3).
- The serializer boundary that makes C-011-9 (fields withheld from security-company operators) true **by
  construction**, not by convention (§4) — this is the single most important architectural decision in this
  document.
- The shape of the change-history mechanism required by C-011-8 (§5).

**Defers, named explicitly rather than silently assumed:**
- Exact BSON validator/index DDL — `database-architect`, Stage 6 (§7 flags what needs sign-off).
- The 48-hour reminder's delivery mechanism (D-011-04) — `product-manager`/`ux-researcher`.
- The retention-expiry deletion job's exact implementation — `database-architect` (design) + `security-engineer`
  (verification), per C-011-10 (§6).
- RoPA/CT-4/s18-notice artifacts (C-011-3/4/5/6) — `compliance-specialist`/`cto`, not a blocker to this stage per
  the compliance ruling §10.
- Final OpenAPI document with full schema components, error responses, and version number — Stage 7,
  `backend-architect`, once this design is approved (§8 hands off the minimum needed to start it).

---

## 2. Data model: extend `RecoveryCaseDocument`, do not create a new entity

Per BR-011-05/BR-011-06/BR-011-09, the three fields are per-case, independently editable, and survive closure —
exactly the shape of data that belongs on the existing case row, not a sibling entity. `recovery_cases` already
carries one precedent for this pattern: `callCentreNotes[]` (append-only, actor + timestamp). The design below
reuses that precedent's shape rather than inventing a new one.

### 2.1 New fields on `RecoveryCaseDocument`

```ts
export interface PoliceReportChange {
  actorAccountId: string;       // the customer accountId that made the change (no agent write path — see §3.4)
  field: 'sapsCaseNumber' | 'reportingStation' | 'reportedToPoliceAt';
  previousValue: string | null; // string form even for the date field (ISO 8601 date), for a uniform history shape
  newValue: string | null;
  changedAt: Date;
}

export interface RecoveryCaseDocument {
  // ...existing fields unchanged...
  sapsCaseNumber: string | null;
  reportingStation: string | null;
  reportedToPoliceAt: Date | null;          // calendar date; stored as UTC midnight, no time-of-day semantics
  policeReportHistory: PoliceReportChange[]; // append-only — see §5
  policeReportReminderSentAt: Date | null;   // set by the (future, D-011-04) 48h reminder job; null until fired
}
```

**Why append-only history over a per-field `setAt`/`setBy` pair:** C-011-8 requires the platform be able to state
*who set or changed the value and when* — plural "changed," not just "last set." BR-011-05 explicitly anticipates
multiple edits per field (station and date first, case number later once SMS'd). A single `changedAt` per field
loses the prior value the moment it's overwritten, which is the exact failure mode C-011-8 exists to prevent for
evidentiary/s16 purposes. Append-only costs one array field and mirrors `callCentreNotes[]`'s already-accepted
pattern — no new mechanism class introduced. `database-architect` may still rule "last-write-with-actor-and-
timestamp" is sufficient at Stage 6 per C-011-8's own wording ("append-only, or last-write... is required" — either
satisfies the compliance floor); this document's recommendation is append-only for the reason above, not a claim
that the alternative is non-compliant.

**Why one history entry per changed field, not one entry per PATCH call:** a single PATCH may set two or three
fields at once (§3.2). Recording one entry per *field* that actually changed (not one entry summarizing the whole
call) keeps the history semantically aligned with "what changed," and keeps a partial update (e.g., customer sets
only `sapsCaseNumber`, later only `reportedToPoliceAt`) from producing sparse/misleading multi-field entries with
mostly-null diffs.

### 2.2 No new field on the security-facing side

`partnerOrganizationId`, `status`, `lastLocation` etc. are unaffected. No field proposed here is readable by
`serializeSecurityRecoveryCase` — enforced structurally, not by omission (§4).

### 2.3 Retention-expiry shape note (for `database-architect`, not designed here)

Per compliance §5, retention is **field-level**, not document-level: on expiry (5y from case closure/claim
finalisation, or longer per CT-4 instruction), `sapsCaseNumber`/`reportingStation`/`reportedToPoliceAt`/
`policeReportHistory` are cleared **from an otherwise-surviving, possibly-de-identified case document** — this is
*not* the `location_events` TTL-index pattern (whole-document deletion after a fixed date). A plain Mongo TTL
index cannot express "null out four fields on this document when case.closedAt + 5y has passed, but leave the
rest of the document." This needs a scheduled, evidenced job (C-011-10) doing a targeted `$unset`/`$set: null`
update against a query on `status` (closed/recovered) + closure-date threshold. Flagged to `database-architect`
for Stage 6 mechanism design — not designed further here.

---

## 3. API design: one new endpoint, extending the existing customer recovery-case surface

### 3.1 Placement and naming

Per BR-011-03, capture is **post-submission follow-up**, never part of `POST /v1/recovery/cases`. Existing routes
in `recovery.ts` are `POST /recovery/cases`, `GET /recovery/cases`, `GET /recovery/cases/:caseId`,
`GET /recovery/cases/:caseId/location` — all customer-scoped, `accountId` derived from the bearer token, never
client-supplied (same convention as Feature 004 §4.2, reused here without re-derivation).

**New endpoint:**

```
PATCH /v1/recovery/cases/:caseId/police-report
```

**Decision: a dedicated sub-resource PATCH, not a general-purpose `PATCH /recovery/cases/:caseId`.** Two reasons:
1. No general case-update endpoint exists today and this document should not silently introduce one — a generic
   PATCH invites future scope creep (status edits, notes, asset reassignment) through a door this feature doesn't
   need open. A named sub-resource keeps the surface exactly as wide as BR-011 requires.
2. It mirrors the existing `GET /recovery/cases/:caseId/location` sub-resource convention already in this file —
   consistent with house style, not a new pattern.

### 3.2 Request/response contract (Stage 7 will formalize as OpenAPI; shape given here)

```
PATCH /v1/recovery/cases/:caseId/police-report
Auth: bearer, requireUserType('customer')
Rate limit: DEFAULT_AUTHENTICATED_LIMIT, key `recovery-police-report:${accountId}`
Idempotency-Key: NOT required (see rationale below)

Request body (at least one field required; each independently optional — BR-011-05):
{
  "sapsCaseNumber"?: string,      // 3-50 chars after trim, no format regex (BR-011-02) — set to null to clear
  "reportingStation"?: string,    // free text, station name; bound 1-200 chars after trim
  "reportedToPoliceAt"?: string   // ISO 8601 date (YYYY-MM-DD), not datetime
}

Validation:
- Body must contain at least one of the three keys (else 400 VALIDATION_ERROR — "nothing to update").
- Each present field is validated per its own bound; a null value for a field means "clear it" (BR-011-06 allows
  editing, and an evidentiary record of the clear is still written to policeReportHistory with newValue: null).
- No cross-field validation (BR-011-08 — no ordering rule vs. reportedAt).

Responses:
201/200 — 200 (this is an update to an existing resource, not a creation) — returns the customer-facing case
  detail shape (§4.1) including the updated police-report fields and full history.
400 VALIDATION_ERROR
401 UNAUTHORIZED
404 NOT_FOUND — case does not exist or is not owned by the caller (identical shape for both, existing convention)
429 TOO_MANY_REQUESTS
```

**Why no `Idempotency-Key` requirement, despite this repo's "mandatory on money/device-state mutations" rule:**
this PATCH is naturally idempotent at the application level — submitting the same body twice (e.g. a retried
request after a timeout) produces the same end state and, at most, one extra `policeReportHistory` entry showing
`previousValue === newValue` for an unchanged field. That's a cosmetic history duplicate, not a state-corrupting
double-effect like a duplicate case creation or a duplicate payment. Given C-011-8 already requires an
evidentiary audit trail, a genuinely duplicate submission is self-documenting rather than dangerous. **Flagged for
`security-engineer` to confirm at Stage 8** — if a stricter reading of the idempotency rule is preferred (e.g. to
suppress no-op history entries on retry), this is a small addition (skip appending a history entry when
`previousValue === newValue`), not a redesign.

### 3.3 Serialization — customer read paths carry the new fields; existing endpoints get them via the extended
serializer described in §4, no new GET endpoint required. `GET /recovery/cases`, `GET /recovery/cases/:caseId`,
and the response of the new PATCH all use the same customer-facing serializer.

### 3.4 No agent write path in this design

Feature 010's D-011-07 / innovation-backlog Idea 10 (call-centre agent capture of the same fields) is explicitly
**not** in scope here — deferred to Feature 010 Stage 1 maturing past its current draft (per D-011-07's own
table). This design's `actorAccountId` on `PoliceReportChange` is therefore always a `customer` account today;
if an agent write path is added later, `PoliceReportChange.actorAccountId` already generalizes (it's just "the
account that made the change," not customer-typed), but the endpoint's `requireUserType('customer')` gate would
need to change too — not designed here, named so it isn't silently assumed impossible.

---

## 4. The C-011-9 enforcement mechanism: exclude by construction, not by convention

This is the architecturally load-bearing decision in this document. Compliance ruled (§6 of the compliance
review) that `sapsCaseNumber`/`reportingStation`/`reportedToPoliceAt` **must never** reach
`serializeSecurityRecoveryCase` or any security-company surface. Relying on "remember not to add these fields to
that function" is exactly the kind of convention-based control that fails under future edits by someone who
hasn't read this document. The design instead makes the omission structural:

```ts
// UNCHANGED — base serializer stays exactly as it is today. No police-report fields added here.
export function serializeRecoveryCase(doc: RecoveryCaseDocument) {
  return {
    id: doc.id,
    assetId: doc.assetId,
    status: doc.status,
    referenceNumber: doc.referenceNumber,
    reportedAt: doc.reportedAt.toISOString(),
    notes: doc.notes,
    lastLocationAt: doc.lastLocationAt?.toISOString() ?? null,
  };
}

// UNCHANGED — spreads only the base serializer above. Structurally cannot see police-report fields
// because serializeRecoveryCase() never returns them.
export function serializeSecurityRecoveryCase(doc: RecoveryCaseDocument) {
  return {
    ...serializeRecoveryCase(doc),
    accountId: doc.accountId,
    partnerOrganizationId: doc.partnerOrganizationId,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

// NEW — customer-only. The only serializer that reads police-report fields off the document.
export function serializePoliceReport(doc: RecoveryCaseDocument) {
  return {
    sapsCaseNumber: doc.sapsCaseNumber,
    reportingStation: doc.reportingStation,
    reportedToPoliceAt: doc.reportedToPoliceAt?.toISOString().slice(0, 10) ?? null,
    history: doc.policeReportHistory.map((h) => ({
      field: h.field,
      previousValue: h.previousValue,
      newValue: h.newValue,
      changedAt: h.changedAt.toISOString(),
    })),
  };
}

// NEW — used ONLY by recovery.ts's customer-facing GET/PATCH handlers, never by security-cases.ts.
export function serializeRecoveryCaseForCustomer(doc: RecoveryCaseDocument) {
  return {
    ...serializeRecoveryCase(doc),
    policeReport: serializePoliceReport(doc),
  };
}
```

`recovery.ts`'s three customer GET/PATCH handlers switch from `serializeRecoveryCase` to
`serializeRecoveryCaseForCustomer`. `security-cases.ts` is **not touched at all** — it keeps calling
`serializeSecurityRecoveryCase`, which keeps spreading the unmodified `serializeRecoveryCase`. There is no code
path in `security-cases.ts` that can reach `doc.sapsCaseNumber` even by mistake, because that function never
receives the raw document at all today (it receives the already-serialized base shape's spread) — wait, it
receives `doc` directly and calls `serializeRecoveryCase(doc)` itself, so the guarantee holds specifically because
`serializeRecoveryCase` itself is never extended, not because `security-cases.ts` avoids a field. **Recommendation
to `security-engineer`/`qa-architect` for Stage 8/10:** add a regression test asserting
`Object.keys(serializeSecurityRecoveryCase(caseWithPoliceReportSet))` never contains `sapsCaseNumber`,
`reportingStation`, or `reportedToPoliceAt`/`policeReport` — cheap, and it converts C-011-9 from a design intent
into an enforced invariant.

Also applies to `support-lookup.ts`'s `GET /customer-lookup` (`support_agent`-facing): that route builds its own
response shape manually (does not call any `recovery_cases` serializer) and lists `recoveryCases` with an
explicit field allowlist (`id`, `referenceNumber`, `status`, `reportedAt`, `callCentreNotes`). **This document
rules: do not add police-report fields to that allowlist.** Support-agent read access is `admin`/`support_agent`-
only per the compliance ruling's "Read access is limited to the customer and to internal admin / `support_agent`
roles" line — so a support agent *could* be a permitted reader in principle, but `GET /customer-lookup` is a bulk
disclosure surface (Tier 0 in Feature 010's own compliance review, already flagged C-010-1 for lacking a
caller-verification/disclosure-reminder step). Adding a new personal-data category to an already-flagged
under-controlled disclosure surface, before C-010-1 lands, is exactly the compounding risk pattern the Feature 010
compliance review calls out (§6, C-011-1 cross-reference). **Ruling: police-report fields are excluded from
`GET /customer-lookup` for now**, revisited only if `business-analyst`/`compliance-specialist` document a specific
operational need for support agents to see them and C-010-1 has landed.

---

## 5. Change-history mechanism (C-011-8) — repository method design

```ts
async setPoliceReportFields(
  accountId: string,
  caseId: string,
  actorAccountId: string,
  changes: Partial<{
    sapsCaseNumber: string | null;
    reportingStation: string | null;
    reportedToPoliceAt: Date | null;
  }>,
): Promise<RecoveryCaseDocument | null>
```

Behavior: read-modify-write inside the repository (not a bare `$set`), because each changed field needs its own
`policeReportHistory` entry with `previousValue` computed from the current document — a blind `$set` cannot
compute a diff. Given `recovery_cases` write volume is low (one case per theft report, occasional field edits),
a `findOne` + `findOneAndUpdate` pair (or a single `findOneAndUpdate` with an aggregation-pipeline update
expression, `database-architect`'s call at Stage 6 on which is cleaner given the existing driver version) is not
a throughput concern — this is squarely a low-frequency transactional path, not the GPS-ingestion class of
problem this role's charter is built to protect against.

---

## 6. Retention-expiry job (C-011-10) — scope note, not design

Named in §2.3. This document does not design the job (that's `database-architect` + `security-engineer`,
Stage 6/8) but records the constraint the job must satisfy so it isn't discovered late: **field-level clearing on
an otherwise-surviving document, triggered off `closedAt`/claim-finalisation date, evidenced (a log entry per run,
matching the `location_events` TTL precedent's "evidenced" bar from INC-001 §2.2)** — not a Mongo TTL index.

---

## 7. What needs `database-architect` sign-off vs. what's decided here

| Item | Decided here (backend-architect) | Needs `database-architect` (Stage 6) |
|---|---|---|
| Fields belong on `RecoveryCaseDocument`, not a new entity | Yes — §2 | — |
| Append-only `policeReportHistory` vs. last-write-with-actor | Recommended (append-only) | **Final call** — either satisfies C-011-8 |
| `$jsonSchema` validator additions to `recovery-collections.ts` | Field types/bounds implied by §2.1/§3.2 | **DDL formalization** — exact `bsonType`, `maxLength`, index additions |
| New index needs (e.g. on `policeReportReminderSentAt` for the future reminder job) | Flagged as needed once D-011-04 lands | **Index design + naming**, consistent with existing `recoveryCaseIndexes` convention |
| Retention-expiry job mechanism | Constraint stated (§6) | **Full design** — scheduling, evidencing, query shape |
| Repository method shape (`setPoliceReportFields`) | Proposed (§5) | Implementation detail, not blocking sign-off |

---

## 8. Handoff to Stage 6 / Stage 7

- **Stage 6 (`database-architect`):** formalize `$jsonSchema` validator additions to
  `backend/src/db/recovery-collections.ts` for the four new fields, rule append-only-vs-last-write, design the
  retention-expiry job's query/index shape, confirm whether `policeReportReminderSentAt` needs its own index
  (likely: `{ reportedAt: 1, sapsCaseNumber: 1, policeReportReminderSentAt: 1 }` partial-filtered, once D-011-04's
  job exists — not designed further here, D-011-04 is still open).
- **Stage 7 (`backend-architect`):** publish the versioned OpenAPI addendum to `004-policy-asset-management/
  api-design.md`'s sibling contract or a new `011-saps-case-reporting/api-design.md` (naming precedent: this
  feature has no existing `api-design.md`, and Feature 004's pattern of "propose collection shape → Stage 6
  formalizes → Stage 7 contracts against it" is the template to follow) — using §3's contract as the starting
  shape.
- **Stage 8 (`cybersecurity-architect`/`security-engineer`):** verify the C-011-9 structural guarantee (§4) with a
  regression test; confirm the idempotency-omission rationale (§3.2); review `GET /customer-lookup`'s continued
  exclusion of these fields (§4).

---

## 9. Pre-Approval Checklist (`backend-architect` self-review)

- [x] API contract sketched and reviewed before client implementation starts (§3) — full OpenAPI is Stage 7.
- [x] Service boundaries documented — no new service; extends the existing customer recovery-case surface (§3.1).
- [x] Idempotency strategy stated and reasoned, not silently assumed (§3.2).
- [x] Authn/authz model explicit per endpoint — customer-only, no agent/security-company path (§3.4, §4).
- [x] Third-party failure modes — N/A, no third-party dependency introduced.
- [ ] Capacity/throughput targets — not stated; this is a low-frequency transactional path (one case per theft
      report, a handful of edits) with no throughput target requested or needed. Left unchecked per this
      project's own convention of not claiming a target that wasn't set (Feature 004 api-design.md §9 precedent).
- [ ] Reviewed and approved by `solution-architect` — pending, this document is the submission for that review.
