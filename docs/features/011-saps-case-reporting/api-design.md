# Feature 011 (Idea 1) — SAPS Case-Number Capture
## API Design — Stage 7

**Lifecycle stage:** 7 — API Design, per [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md).
**Author:** `backend-architect`
**Status:** Draft — formal OpenAPI contract, submitted for `cybersecurity-architect`/`security-engineer` Stage 8
review (hard gate) before any Stage 9 implementation. Not implemented — no route file exists yet under
`backend/src/routes/`.
**Formalizes:** [`architecture-review.md`](./architecture-review.md) (Stage 5, approved) §3 request/response
contract sketch, [`database-design.md`](./database-design.md) (Stage 6) §3 `$jsonSchema`/index DDL for
`sapsCaseNumber` / `reportingStation` / `reportedToPoliceAt` / `policeReportHistory[]` /
`policeReportReminderSentAt` / `closedAt` on `RecoveryCaseDocument`.
**Reuses, does not reinvent:** [`004-policy-asset-management/api-design.md`](../004-policy-asset-management/api-design.md)
§5 (error envelope, cursor pagination — N/A to this single-resource PATCH, rate-limit headers, `accountId`-never-
client-supplied rule); the live route conventions in `backend/src/routes/recovery.ts` and
`backend/src/routes/support-lookup.ts` (exact envelope shapes, `apiError()` usage, `requireUserType`,
`createRateLimiter`, Zod validation style) — read in full to produce this document, cited rather than restated.
**Contract version:** 1.0.0 (2026-09-03).
**Reads on:** `architecture-review.md` §3/§4/§5, `database-design.md` §2–§5, `backend/src/lib/errors.ts` (fixed
error-code catalogue — this document adds none), `backend/src/repositories/recovery-cases.ts`,
`backend/src/routes/recovery.ts`.

---

## 1. Scope

**In scope:** the single new customer-scoped mutation endpoint —
`PATCH /v1/recovery/cases/:caseId/police-report` — and the extension of the three existing customer read
endpoints (`GET /v1/recovery/cases`, `GET /v1/recovery/cases/:caseId`, and this PATCH's own response) to a new
`policeReport` sub-object, via the `serializeRecoveryCaseForCustomer` serializer named in `architecture-review.md`
§4.

**Explicitly out of scope, unchanged from `architecture-review.md` §1/§3.4:**
- No agent/call-centre write path (Feature 010's D-011-07 is deferred — not this document's endpoint).
- No security-company read of any police-report field (`security-cases.ts` is untouched — §3 below restates why
  as a Stage 7 contract-level guarantee, not just a Stage 5 intent).
- No change to `GET /v1/customer-lookup` (`support-lookup.ts`) — `architecture-review.md` §4 ruled these fields
  stay off that response; this document does not reopen that ruling.
- No station-locator / report-assistant endpoint (Idea 2 — blocked on OQ-011-02, not this feature).
- No 48-hour reminder delivery endpoint (D-011-04, not designed).
- No retention-purge endpoint — `backend/scripts/police-report-retention-purge.ts` (per `database-design.md` §5.3)
  is a scheduled script, not an API surface.

---

## 2. Decisions this document makes (Stage 7 authority)

Per the task brief, this section states and justifies the calls `architecture-review.md` left as "Stage 7 will
formalize" or left implicitly open.

### 2.1 Response shape: **full customer-facing case detail**, not a partial/delta object

`PATCH .../police-report` returns the same `RecoveryCase` shape `GET /v1/recovery/cases/:caseId` returns
(`serializeRecoveryCaseForCustomer`), including the full `policeReport.history[]` array — not just the fields the
caller happened to change in this call.

**Why:** (a) matches every other mutating endpoint already live in this codebase — `PATCH /policies/:id/plan`
returns the full `serializePolicy(updated)`, `PATCH /security/cases/:id` returns the full
`serializeSecurityRecoveryCase(updated)` — a delta-only response would be the one outlier in this codebase's own
PATCH convention, not a neutral choice; (b) a mobile client showing "your police report details" after a save
needs the full current state to re-render the screen, not just the diff, and a second round-trip
(`PATCH` then `GET`) to get it would be a wasted request for a low-frequency, already-cheap read; (c) per
`architecture-review.md` §5, the repository method is already read-modify-write internally (it must be, to
compute `previousValue`), so the full updated document is already in hand server-side at zero extra cost to
return it.

### 2.2 History ordering in the response: **chronological ascending (oldest first), same as storage order**

`policeReportHistory[]` is append-only (`database-design.md` §2, ruled). The response returns entries in the same
order they are stored (insertion order — oldest first) rather than re-sorting newest-first. **Why:** this matches
`callCentreNotes[]`'s existing wire convention (`support-lookup.ts`'s `serializeCallCentreNotes` does not reverse
the array) — this document does not introduce a second, inconsistent history-ordering convention on a sibling
array on the same document. A client wanting newest-first can reverse client-side; the server does not need to
carry two different array orderings for two structurally identical fields on one document.

### 2.3 Case status gate: **no status gate — the endpoint accepts a PATCH regardless of case status**, including `closed`

`architecture-review.md` §3.2 listed `404 NOT_FOUND` for "not found / not owned" but left "should closed cases be
editable?" as an open question for this stage. **Ruling: yes, editable at any status, including `closed` and
`recovered`.** Reasoning:

1. **BR-011-03/BR-011-05** frame this as *post-submission follow-up* specifically because a SAPS case number is
   often only issued (or SMS'd to the complainant) well after the theft report itself — and, symmetrically, a
   recovery case can be administratively `closed` (asset recovered, or case abandoned) before or shortly after
   that SAPS reference ever arrives. Gating the endpoint on an open status would make the exact "case number
   arrives late" scenario BR-011-05 anticipates impossible to record for a meaningful share of real cases.
2. **BR-011-09** ("fields survive closure") is about *retention*, but a stronger reading is available and is not
   contradicted by anything in the compliance review: a field that must survive closure for five years is squarely
   the kind of field a customer may need to *finish entering* even after closure, not just have preserved once
   entered before it.
3. **`database-design.md` §5.2 already engineered around exactly this case.** It deliberately rejected `updatedAt`
   as the retention clock precisely *because* "editing a case's police-report fields resets its own retention
   countdown... would be backwards" — i.e., `database-architect` already designed the schema on the assumption
   that police-report fields get edited after `closedAt` is set, and made sure that doesn't perturb retention.
   Blocking edits on `closed` cases at the API layer would make that Stage 6 design decision pointless — there
   would be no post-closure edit for it to protect against.
4. No compliance condition (C-011-1…10) states or implies a closed-case edit restriction.

**What this does NOT change:** `legalHold` and the retention-purge job (`database-design.md` §5.3) are unaffected
— once the purge job clears these fields (5 years post-`closedAt`, `legalHold` excluded), a subsequent PATCH
against that same case simply starts a fresh `policeReportHistory` from `previousValue: null`, exactly as if the
fields had never been set — this is a deliberate, accepted consequence of §2.3 of `database-design.md`'s own
field-level-clearing design, not a new edge case this document introduces.

**Flagged for Stage 8 confirmation**, per `architecture-review.md`'s own practice of naming a call for
`security-engineer` to check rather than asserting unilateral finality: this ruling should be reviewed against
C-011-8's evidentiary intent — an unlimited post-closure edit window is the permissive reading; if
`security-engineer`/`compliance-specialist` want a bound (e.g., no edits more than N days after `closedAt`), that
is an additive validation rule at the API layer, not a schema or endpoint redesign.

### 2.4 `reportedToPoliceAt` in the future: **not rejected**

No validation rule in `architecture-review.md` §3.2 (or the compliance review) forbids a future-dated
`reportedToPoliceAt`, and none is added here — BR-011-08 explicitly rules out cross-field ordering validation
against `reportedAt`, and this document does not independently invent a "not in the future" rule the business
requirements never asked for. Named so a future implementer doesn't add one as an assumed omission.

### 2.5 Idempotency: **not required**, carrying forward `architecture-review.md` §3.2's reasoning unchanged

No `Idempotency-Key` header on this endpoint. Reasoning restated for Stage 7 completeness: the PATCH is
naturally idempotent at the application level (a retried identical body converges to the same end state, at most
producing one cosmetic no-op history entry). **Refinement added at this stage, closing the loop
`architecture-review.md` §3.2 left open:** the repository's `setPoliceReportFields` (§5 of that document) MUST
skip appending a `PoliceReportChange` entry for any field where `previousValue === newValue` (including the
`null === null` case of re-submitting an already-cleared field) — this suppresses the cosmetic duplicate the
architecture review flagged as the only cost of skipping `Idempotency-Key`, making the "self-documenting, not
state-corrupting" argument hold exactly, not just approximately. This is a repository-implementation requirement
this contract imposes on Stage 9, not a client-visible change.

---

## 3. The C-011-9 structural exclusion — restated as a Stage 7 contract guarantee

Per `architecture-review.md` §4: `security-cases.ts` is not modified by this feature. No path, query parameter, or
response field in this document's contract is reachable from `requireUserType('security_company_operator')`.
`GET /v1/customer-lookup` (`support-lookup.ts`) is not modified by this feature either — its `recoveryCases[]`
projection keeps its existing explicit allowlist (`id`, `referenceNumber`, `status`, `reportedAt`,
`callCentreNotes`) and gains no police-report field. **Stage 8 acceptance criterion (recorded here so it is
testable, not just asserted):** `Object.keys(serializeSecurityRecoveryCase(caseWithPoliceReportSet))` must never
contain `sapsCaseNumber`, `reportingStation`, `reportedToPoliceAt`, or `policeReport`; the `GET /v1/customer-lookup`
response schema must never contain them either.

---

## 4. Authorization and rate limiting

| | |
|---|---|
| Auth | Bearer session, `requireUserType('customer')` — identical middleware chain to every other `/recovery/cases*` route in `recovery.ts`. |
| `accountId` scoping | Derived from `req.auth!.accountId` only — never a path/body parameter, per `004-policy-asset-management/api-design.md` §4.2's platform-wide rule. `:caseId` is looked up via `ctx.recoveryCases.findByIdForAccount(accountId, caseId)`-equivalent (the same ownership-scoped read every other `recovery.ts` route already uses), so a case owned by a different account 404s identically to a nonexistent case. |
| Actor attribution | `PoliceReportChange.actorAccountId` is always `req.auth!.accountId` — never client-supplied (§3.4 of `architecture-review.md`: no agent write path exists in this design). |
| Rate limit | `DEFAULT_AUTHENTICATED_LIMIT` (the same platform default every other `/recovery/cases*` customer route uses — `recovery.ts` imports this constant for create/list/detail/location), key `recovery-police-report:${accountId}` — matches `architecture-review.md` §3.2 exactly. |
| Idempotency | Not required — §2.5. |

---

## 5. Validation rules

```
Request body — at least one of the three keys required (400 VALIDATION_ERROR, "nothing to update", if none present):

sapsCaseNumber?: string | null
  - string: trimmed length 3–50 (matches database-design.md §3's bsonType minLength/maxLength exactly)
  - null: clears the field (an explicit clear, recorded in history with newValue: null)
  - NO format/regex validation (BR-011-02, binding — do not add a SAPS case-number pattern check)

reportingStation?: string | null
  - string: trimmed length 1–200
  - null: clears the field
  - free text, no enum/lookup validation (Idea 2 station-locator dataset does not exist — OQ-011-02)

reportedToPoliceAt?: string | null
  - string: ISO 8601 calendar date, "YYYY-MM-DD" exactly (not a full datetime — architecture-review.md §2.1's
    "calendar date; stored as UTC midnight, no time-of-day semantics"); a value with a time component is
    rejected (400), not silently truncated
  - null: clears the field
  - no cross-field validation against reportedAt (BR-011-08) — see §2.4
```

Zod shape (implementation guidance, matching this repo's existing style in `recovery.ts`/`support-lookup.ts`):

```ts
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'reportedToPoliceAt must be YYYY-MM-DD');

const policeReportPatchSchema = z
  .object({
    sapsCaseNumber: z.string().trim().min(3).max(50).nullable().optional(),
    reportingStation: z.string().trim().min(1).max(200).nullable().optional(),
    reportedToPoliceAt: dateOnlySchema.nullable().optional(),
  })
  .refine(
    (v) => v.sapsCaseNumber !== undefined || v.reportingStation !== undefined || v.reportedToPoliceAt !== undefined,
    { message: 'At least one of sapsCaseNumber, reportingStation, reportedToPoliceAt is required' },
  );
```

`caseId` path parameter validated against the existing `caseIdParamsSchema` shape already live in `recovery.ts`
(`/^[0-9a-f]{24}$/i`) — reused verbatim, not redefined.

---

## 6. Error cases

| Condition | Response |
|---|---|
| Malformed body (fails Zod, or all three keys absent) | `400 VALIDATION_ERROR` |
| Malformed `caseId` (not a 24-hex ObjectId shape) | `400 VALIDATION_ERROR` (matching `recovery.ts`'s existing `caseIdParamsSchema` handling elsewhere in that file) |
| Missing/invalid/expired bearer token | `401 UNAUTHORIZED` |
| Case does not exist, **or** exists but is not owned by the caller | `404 NOT_FOUND` — identical shape for both, no enumeration of which (uniform convention, `004-policy-asset-management/api-design.md`'s `NotFound` response, already applied by every other `recovery.ts` route) |
| Case exists, owned by caller, any status including `closed`/`recovered` | **No error — accepted.** §2.3. |
| Rate limit exceeded | `429 RATE_LIMITED` (this repo's actual code — see `backend/src/lib/errors.ts`; not `TOO_MANY_REQUESTS`) |

No new entry is added to `backend/src/lib/errors.ts`'s fixed error catalogue — every response code above already
exists there. This is a deliberate outcome of §2.3's ruling (no `CASE_ALREADY_CLOSED`-shaped error is needed) —
named explicitly so Stage 9 doesn't invent one against this document's intent.

---

## 7. OpenAPI 3.1 contract

```yaml
openapi: 3.1.0
info:
  title: TD IT Solutions — SAPS Case-Number Capture API (Feature 011, Idea 1)
  version: "1.0.0"
servers:
  - url: /v1
security:
  - bearerAuth: []

paths:
  /recovery/cases/{caseId}/police-report:
    patch:
      operationId: updateRecoveryCasePoliceReport
      summary: >
        Customer-only. Sets or clears one or more of sapsCaseNumber /
        reportingStation / reportedToPoliceAt on a caller-owned recovery
        case, appending one policeReportHistory entry per field that
        actually changed value. Accepted at any case status, including
        closed/recovered (§2.3). No Idempotency-Key required (§2.5).
      parameters:
        - name: caseId
          in: path
          required: true
          schema: { type: string, pattern: '^[0-9a-f]{24}$' }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/PoliceReportPatch' }
      responses:
        '200':
          description: >
            Updated case, customer-facing shape, including the full
            policeReport sub-object and complete history array (§2.1/§2.2).
          content:
            application/json:
              schema: { $ref: '#/components/schemas/RecoveryCase' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

components:
  schemas:
    PoliceReportPatch:
      type: object
      description: At least one property required — see §5.
      properties:
        sapsCaseNumber:
          type: string
          minLength: 3
          maxLength: 50
          nullable: true
          description: No format/regex validation (BR-011-02). null clears the field.
        reportingStation:
          type: string
          minLength: 1
          maxLength: 200
          nullable: true
        reportedToPoliceAt:
          type: string
          format: date
          pattern: '^\d{4}-\d{2}-\d{2}$'
          nullable: true
          description: Calendar date only, no time component.

    PoliceReportHistoryEntry:
      type: object
      required: [field, previousValue, newValue, changedAt]
      properties:
        field: { type: string, enum: [sapsCaseNumber, reportingStation, reportedToPoliceAt] }
        previousValue: { type: string, nullable: true }
        newValue: { type: string, nullable: true }
        changedAt: { type: string, format: date-time }
        # actorAccountId is intentionally NOT in the wire shape — this is a
        # customer-only surface and every entry's actor is, by construction,
        # the caller. Omitted to avoid implying a multi-actor history a
        # customer client would need to render (architecture-review.md §3.4
        # notes actorAccountId generalizes if an agent path is ever added —
        # that would be the point to add it to the wire shape too, not now).

    PoliceReport:
      type: object
      required: [sapsCaseNumber, reportingStation, reportedToPoliceAt, history]
      properties:
        sapsCaseNumber: { type: string, nullable: true }
        reportingStation: { type: string, nullable: true }
        reportedToPoliceAt: { type: string, format: date, nullable: true }
        history:
          type: array
          items: { $ref: '#/components/schemas/PoliceReportHistoryEntry' }
          description: Chronological ascending, oldest first (§2.2).

    RecoveryCase:
      type: object
      description: >
        serializeRecoveryCaseForCustomer's shape — unchanged base fields
        (architecture-review.md §4) plus the new policeReport sub-object.
        Identical schema returned by GET /v1/recovery/cases/{caseId} and
        (as list items) GET /v1/recovery/cases.
      required: [id, assetId, status, referenceNumber, reportedAt, notes, lastLocationAt, policeReport]
      properties:
        id: { type: string }
        assetId: { type: string }
        status: { type: string }
        referenceNumber: { type: string }
        reportedAt: { type: string, format: date-time }
        notes: { type: string, nullable: true }
        lastLocationAt: { type: string, format: date-time, nullable: true }
        policeReport: { $ref: '#/components/schemas/PoliceReport' }

  responses:
    BadRequest:
      description: Validation error.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Unauthorized:
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    NotFound:
      description: Case does not exist or is not owned by the caller — identical shape for both.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    TooManyRequests:
      headers:
        Retry-After: { schema: { type: integer } }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }

  schemas:
    Error:
      $ref: '../004-policy-asset-management/api-design.md#/components/schemas/Error'
```

`Error` schema, `bearerAuth` scheme, and the `X-RateLimit-*`/`Retry-After` header contract are reused verbatim
from `001-authentication/api-design.md` / `004-policy-asset-management/api-design.md` — not duplicated in full
here per those documents' own P-11 recommendation to avoid drift (the `$ref` above is illustrative; this repo has
no cross-file `$ref` resolution tooling yet, same caveat `004-policy-asset-management/api-design.md` §5 already
names).

---

## 8. `GET /v1/recovery/cases` and `GET /v1/recovery/cases/:caseId` — response addendum

Both existing endpoints switch their serializer call from `serializeRecoveryCase` to
`serializeRecoveryCaseForCustomer` (`architecture-review.md` §4) — every item in `GET /v1/recovery/cases`'
`data[]` array, and the single object `GET /v1/recovery/cases/:caseId` returns, gain the `policeReport` field
shown in §7's `RecoveryCase` schema. `GET /v1/recovery/cases/:caseId/location` is unaffected — it returns a
location-only shape, not a case shape, and carries no police-report data.

No request/response shape elsewhere in this repo (`GET /v1/customer-lookup`, `GET/PATCH /v1/security/cases*`)
changes as part of this feature — confirmed by §3.

---

## 9. Open items tracker

| ID | Item | Owner | Blocks | Status |
|---|---|---|---|---|
| **SAPS-API-01** | Stage 8 regression test: `serializeSecurityRecoveryCase` / `GET /v1/customer-lookup` never expose police-report fields (§3). | `security-engineer`/`qa-architect` | Stage 8 sign-off | Not started |
| **SAPS-API-02** | Confirm §2.3's "no closed-case gate" ruling — or set a post-closure edit window bound. | `security-engineer`/`compliance-specialist` | Stage 8 sign-off | Open, flagged for review |
| **SAPS-API-03** | Confirm §2.5's idempotency-omission rationale, including the no-op-suppression requirement on `setPoliceReportFields`. | `security-engineer` | Stage 8 sign-off | Open, flagged for review |
| **SAPS-API-04** | `closedAt` must be set by whichever status-transition code path moves a `recovery_cases` row to `closed` — no such endpoint exists yet in this repo's customer/security-company surfaces to verify against. | `backend-architect` (this role) | Stage 9 implementation of §2.3's precondition | Named gap, not resolved — `database-design.md` §5.2 flags the same gap |
| **SAPS-API-05** | Retention-purge job (`backend/scripts/police-report-retention-purge.ts`) and its scheduling — not an API surface, tracked in `database-design.md` §5.3/§8, not duplicated here. | `devops-engineer`/`security-engineer` | Stage 8/9 | Tracked in sibling document |

---

## 10. Pre-Approval Checklist (`backend-architect` self-review)

- [x] API contract (OpenAPI) exists and is reviewed before client implementation starts — §7, this document.
- [x] Service boundaries — no new service; extends `recovery.ts`'s existing customer surface (unchanged from `architecture-review.md` §3.1).
- [x] Idempotency and retry strategy stated and reasoned — §2.5.
- [x] Authn/authz model explicit — §4; customer-only, no agent/security-company path.
- [x] Third-party failure modes — N/A, no third-party dependency.
- [ ] Capacity/throughput targets — not stated; low-frequency transactional path, same as `architecture-review.md` §9's own unchecked item. Consistent, not a new gap.
- [ ] Reviewed and approved by `cybersecurity-architect`/`security-engineer` — **pending, Stage 8 hard gate, this document is the submission for that review.**

---

## 11. Summary for handoff

- **One endpoint contracted:** `PATCH /v1/recovery/cases/:caseId/police-report`, customer-only, returns the full
  updated case (§2.1), no `Idempotency-Key` (§2.5, with a no-op-suppression requirement placed on the repository
  method to make that safe).
- **Ruled: closed/recovered cases remain editable** — no status gate on this endpoint (§2.3), reasoned from
  BR-011-05/09 and from `database-design.md`'s own retention-clock design already assuming post-closure edits
  happen. Flagged to Stage 8 for confirmation, not asserted as unreviewable.
- **No new error codes** — every response uses the existing fixed catalogue in `backend/src/lib/errors.ts` (§6).
- **C-011-9 restated as a testable Stage 8 acceptance criterion** (§3), not just a Stage 5 design intent.
- **Two existing customer GET endpoints gain a `policeReport` field** via the serializer swap already named in
  `architecture-review.md` §4 (§8) — no new GET endpoint required.
- **Ready for Stage 8** (`cybersecurity-architect`/`security-engineer`, hard gate) — open items in §9 are the
  concrete review targets.

---

## 12. Contract Amendment Log

| Version | Date | Author | Change |
|---|---|---|---|
| **1.0.0** | 2026-09-03 | `backend-architect` | First publication — formalizes `architecture-review.md`/`database-design.md` into the OpenAPI contract for `PATCH /v1/recovery/cases/:caseId/police-report` and the `policeReport` read-path addendum. |
