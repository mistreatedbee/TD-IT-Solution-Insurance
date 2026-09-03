# Feature 010 (Phase 2) — Call Centre Support & Incident Management
## API Design — Stage 7

**Lifecycle stage:** 7 — API Design, per [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md).
**Author:** `backend-architect`
**Status:** Draft — formal OpenAPI contract for the **FR-11–17 cleared scope only**, submitted for
`cybersecurity-architect`/`security-engineer` Stage 8 review (hard gate) before any Stage 9 implementation.
**FR-18–21 (escalation) contract is included below (§7) but remains explicitly NOT AUTHORIZED FOR IMPLEMENTATION**
— this document inherits that restriction verbatim from `03-architecture-review-phase2.md` and
`database-design.md` and does not lift it. This is this feature's first `api-design.md`.
**Formalizes:** [`03-architecture-review-phase2.md`](./03-architecture-review-phase2.md) (Stage 5, approved) §5,
[`database-design.md`](./database-design.md) (Stage 6) §3/§5 — the `support_cases` collection DDL and the
`recovery_cases.originatingSupportCaseId` addendum.
**Reuses, does not reinvent:** [`004-policy-asset-management/api-design.md`](../004-policy-asset-management/api-design.md)
§5 (error envelope, cursor pagination, rate-limit headers, `accountId`-never-client-supplied rule — **with the
one named, deliberate exception this feature requires**, §4.2); the live route conventions in
`backend/src/routes/support-lookup.ts` and `backend/src/routes/recovery.ts` (envelope shapes, `apiError()` usage,
`requireUserType`, `createRateLimiter`, `requireIdempotencyKey`, Zod validation style) — read in full to produce
this document.
**Contract version:** 1.0.0 (2026-09-03).
**Reads on:** `03-architecture-review-phase2.md` §2–§6, `database-design.md` §2–§7, `backend/src/lib/errors.ts`
(fixed error-code catalogue), `backend/src/routes/support-lookup.ts`, `backend/src/routes/recovery.ts`,
`backend/src/routes/security-cases.ts`.

---

## 1. Scope

**In scope (FR-11–17, cleared):**
- `GET /v1/customer-lookup` — additive response fields only (§3).
- New router `support-cases.ts`: `POST /v1/support-cases`, `GET /v1/support-cases`,
  `GET /v1/support-cases/:caseId`, `POST /v1/support-cases/:caseId/notes`,
  `PATCH /v1/support-cases/:caseId/status` (§4–§6).

**Contracted but NOT AUTHORIZED FOR IMPLEMENTATION (FR-18–21):**
- `POST /v1/support-cases/:caseId/escalate` — data contract only (§7), blocked on C-010-4 (Tier 2
  caller-verification design) and, independently, on INC-001-C-8 for the out-of-band notification step.

**Explicitly out of scope, unchanged from `03-architecture-review-phase2.md` §1:**
- Tier 2 caller-verification mechanism itself (C-010-4) — not designed here, not this role's authority.
- Supervisor/team-queue role and any write path for `assignedAgentAccountId` (OQ-010-4).
- Any endpoint reachable by `security_company_operator` or `customer` roles against `support_cases` — this is an
  agent-only surface end to end.

---

## 2. Decisions this document makes (Stage 7 authority)

### 2.1 `scope` query parameter on `GET /v1/support-cases`: **required, no default, until OQ-010-4 resolves**

`03-architecture-review-phase2.md` §6.2 deliberately left the *default* value of `scope` (`mine` vs `all`) as an
open business call for OQ-010-4, not something this role should decide by fiat. Rather than shipping a contract
with an undefined default (which would force an implementer to silently pick one, exactly the "invented business
rule" failure mode this project's `CLAUDE.md` warns against), **this document rules: `scope` is a required query
parameter** (`mine` | `all`) with no default. Omitting it is `400 VALIDATION_ERROR`. This keeps the endpoint fully
specified and implementable today without guessing OQ-010-4's answer — once `cto`/`technical-project-manager`
rule on a default, promoting `scope` to optional-with-a-default is a strictly additive, non-breaking change
(existing callers that already pass `scope` explicitly are unaffected).

### 2.2 `POST /v1/support-cases` — `accountId` is client-supplied, by design, not a regression

Restated as a Stage 7 contract fact, not just an architecture-review note, because it is the one place this
document's authorization model diverges from `004-policy-asset-management/api-design.md` §4.2's platform-wide
rule: `accountId` is a **required request-body field**, resolved by the agent from a prior
`GET /v1/customer-lookup` call. The mitigating controls, restated precisely for Stage 8 review:

1. `accountId` MUST resolve to an existing account via `ctx.accounts.findById` — `404 NOT_FOUND` otherwise, same
   "don't confirm/deny existence beyond what's needed" posture `support-lookup.ts` already uses.
2. The resolved account's `userType` MUST be `customer` — `404 NOT_FOUND` otherwise (an agent cannot open a
   support case "against" another agent, admin, or security-company-operator account).
3. Every write on the resulting document is attributed via `createdByAgentAccountId` = `req.auth!.accountId`
   (from the bearer token) — never from the body, never trusted from a claim.

### 2.3 Idempotency

`POST /v1/support-cases` requires `Idempotency-Key` — `03-architecture-review-phase2.md` §5.3 already named this
("same convention as `POST /v1/recovery/cases`"); this document confirms it as the ratified contract, reusing
`requireIdempotencyKey` verbatim.

`POST /v1/support-cases/:caseId/notes` does **not** require `Idempotency-Key` — mirrors the existing
`POST /recovery-cases/:caseId/notes` endpoint in `support-lookup.ts`, which has none today. A retried note-append
producing one duplicate note is a low-severity, self-evident failure mode (an agent can see two identical notes
and knows what happened), not a state-corrupting double-effect: this document treats it the same class of
low-risk retry as Feature 011's PATCH (§2.5 of that feature's `api-design.md`), consistent reasoning applied to a
second, structurally similar endpoint.

`PATCH /v1/support-cases/:caseId/status` does **not** require `Idempotency-Key` — mirrors
`PATCH /v1/security/cases/:caseId`, which has none today. A retried identical status transition converges to the
same state (already-transitioned request would then fail the FR-15 graph check on the retry with `409 CONFLICT`,
which is an acceptable, honest outcome for a retried mutation, not a silent double-effect).

### 2.4 List endpoint pagination and filters

`GET /v1/support-cases` uses the platform's standard cursor convention (`004-policy-asset-management/api-design.md`
§5) — `limit`/`cursor` query params, `{ data, pagination: { nextCursor, hasMore } }` response — reused verbatim,
not reinvented. Filters: `status`, `category`, `accountId` (all optional, combinable), plus the required `scope`
(§2.1). No full-text search over `description`/`notes.text` — `database-design.md` §4.2 already rules out any such
index; this document does not contract an endpoint parameter that would require one.

### 2.5 `GET /v1/support-cases/:caseId` detail response includes full `notes[]`

Unlike the admin policy/asset summary-vs-detail split in Feature 004 (list = summary projection, detail = full
document), `GET /v1/support-cases` (list) and `GET /v1/support-cases/:caseId` (detail) here are **not** both
full-shape — the list endpoint returns a summary projection (`SupportCaseSummary`, §8) omitting `notes[]` and
`description` truncation is not applied (full `description` is short enough — 2000-char cap — to be cheap in a
list response, but `notes[]` can grow unboundedly over a case's life and has no listing use case), while the
detail endpoint returns the full document including `notes[]`. This mirrors Feature 004's own list/detail
asymmetry rationale (`AdminPolicySummary`/`AdminAssetSummary` vs. `AdminPolicy`/`AdminAsset`) applied to the one
field on this collection that actually grows unbounded.

---

## 3. `GET /v1/customer-lookup` — FR-11 addendum

Additive fields only — existing fields (`accountId`, `email`, `accountState`, `policyCount`, `assetCount`,
`assets[]`, `openRecoveryCaseCount`, `recoveryCases[]`, `subscription`) are unchanged, same route, same
`support-lookup.ts` handler, same `privileged_data_access` audit event (unchanged — `03-architecture-review-phase2.md`
§5.1 explicitly notes this addendum does not touch that handler's audit posture).

```jsonc
// New fields on the existing `data` object:
{
  // ...existing fields unchanged...
  "openSupportCaseCount": 2,
  "supportCases": [
    {
      "id": "66c1...",
      "referenceNumber": "SC-20260903-A1B2",
      "status": "open",
      "category": "billing",
      "createdAt": "2026-09-01T10:00:00.000Z",
      "callerVerified": false
    }
  ]
}
```

`openSupportCaseCount` counts `status IN ('open', 'in_progress')` only — `escalated` is excluded (its "open-ness"
has moved to the resulting recovery case, already counted by `openRecoveryCaseCount`), matching
`03-architecture-review-phase2.md` §5.1 exactly. **Police-report fields (Feature 011) are irrelevant here** —
`support_cases` has no such fields; named only to confirm no cross-feature field leak is possible through this
addendum.

**No new error case** — this addendum changes response shape only; the endpoint's existing `400`/`401`/`403`/`404`
behavior (email/phone/policyId lookup, `NOT_FOUND` on no match) is unchanged.

---

## 4. Authorization and rate limiting — `support-cases.ts`

| | |
|---|---|
| Auth | Bearer session, `requireUserType('support_agent')` on every route in this router — no endpoint here is reachable by `customer`, `admin`, or `security_company_operator`. |
| `accountId` (subject of the case) | Client-supplied on create only, resolved and validated per §2.2. Never derived from the bearer token — the agent is not the subject. |
| Actor attribution | `createdByAgentAccountId` / note `agentAccountId` = `req.auth!.accountId`, always server-derived, on every write. |
| Rate limit | Reuses `support-lookup.ts`'s existing limiter class verbatim: **30 requests / 60 s per `(agentAccountId, clientIp)`** — no new limiter tier introduced, per `03-architecture-review-phase2.md` §5.3. |
| Idempotency | `POST /v1/support-cases` only — §2.3. |

---

## 5. Validation rules

```
POST /v1/support-cases
  accountId: string (uuid), required — must resolve to an existing user_type='customer' account (404 otherwise)
  category: string, required, 1–64 chars — validated against the FR-13 starter set at the API layer only
    (billing | app_technical_issue | policy_question | asset_registration_help | account_access | other) —
    NOT a database-schema enum (database-design.md §4.1, ruled) — an unlisted value is 400 VALIDATION_ERROR,
    not a silent passthrough; extending the accepted set is a code change, not a migration (§4.1 of that doc)
  description: string, required, 1–2000 chars after trim
  channel?: 'phone' — optional, defaults to 'phone' (the only Phase 2 value; database-design.md §3.3 notes this
    enum is genuinely closed, unlike category)

GET /v1/support-cases
  scope: 'mine' | 'all', REQUIRED (§2.1) — 400 VALIDATION_ERROR if absent
  status?: SupportCaseStatus
  category?: string (same FR-13 starter set, API-layer validated)
  accountId?: string (uuid) — scope to one customer's cases
  cursor?: string, limit?: integer (1–200, default 50) — platform standard

GET /v1/support-cases/:caseId
  caseId: string, 24-hex ObjectId shape

POST /v1/support-cases/:caseId/notes
  text: string, required, 1–2000 chars after trim

PATCH /v1/support-cases/:caseId/status
  status: 'in_progress' | 'resolved' | 'closed', required
    — 'escalated' is REJECTED (400 VALIDATION_ERROR) on this endpoint; the only path to that status value is
      the (not-authorized) escalate endpoint, §7 — this endpoint's accepted enum deliberately excludes it
      (03-architecture-review-phase2.md §5.3)
  resolutionSummary?: string, 1–2000 chars
    — REQUIRED (400 VALIDATION_ERROR) when status is 'resolved' or 'closed'; absent/ignored otherwise
  Transition graph enforced server-side (409 CONFLICT if violated):
    open -> in_progress -> resolved -> closed
    no transition out of 'closed' (terminal)
    no transition out of 'escalated' (terminal, reachable only via §7)
    no transition to a status equal to the case's current status (no-op is a 409, not a silent 200 — distinct
      from Feature 011's PATCH, because this is a discrete state machine with a defined "invalid transition"
      failure mode already, not a field-level upsert; consistent with security-cases.ts's own status-transition
      handling, which relies on updateStatusForPartnerOrg returning null / a repository-level transition check)
```

---

## 6. Error cases (FR-11–17 endpoints)

| Condition | Response |
|---|---|
| Malformed body/query (any endpoint) | `400 VALIDATION_ERROR` |
| `scope` omitted on `GET /v1/support-cases` | `400 VALIDATION_ERROR` (§2.1) |
| `status: 'escalated'` submitted to `PATCH .../status` | `400 VALIDATION_ERROR` |
| `resolutionSummary` missing when required | `400 VALIDATION_ERROR` |
| Missing/invalid/expired bearer token | `401 UNAUTHORIZED` |
| Caller is not `support_agent` | `403 FORBIDDEN` |
| `accountId` on create does not resolve to a `customer` account | `404 NOT_FOUND` |
| Case does not exist (any read/write against `:caseId`) | `404 NOT_FOUND` |
| Idempotency-Key missing on `POST /v1/support-cases` | `400 IDEMPOTENCY_KEY_REQUIRED` |
| Idempotency-Key reused with a different body | `409 IDEMPOTENCY_KEY_REUSE` |
| Invalid status transition (§5's graph) | `409 CONFLICT` |
| Rate limit exceeded | `429 RATE_LIMITED` |

No new entry is required in `backend/src/lib/errors.ts` for the FR-11–17 scope — every response code above
already exists in the fixed catalogue.

---

## 7. `POST /v1/support-cases/:caseId/escalate` (FR-18–21) — contract only, **NOT AUTHORIZED FOR IMPLEMENTATION**

Recorded per the task brief so the shape is stable when C-010-4 clears — **restating the inherited restriction
explicitly rather than silently dropping it at this stage**: no engineer may implement this route from this
document. Implementation additionally requires INC-001-C-8 to resolve (step 6 below).

```
POST /v1/support-cases/:caseId/escalate     [BLOCKED — requires C-010-4 Tier 2 verification design first]
Auth: requireUserType('support_agent') — same router, same auth chain as §4, once unblocked

Request body:
  { "assetId": "string (24-hex ObjectId)" }

Preconditions (in order; first failure wins):
  1. support case status IN ('open', 'in_progress')                          -> 409 CONFLICT
  2. support_case.callerVerified === true                                    -> 403 <NEW CODE, not yet in the
                                                                                  catalogue — CALLER_NOT_VERIFIED,
                                                                                  see below>
  3. assertPlanEntitlement(ctx, support_case.accountId, 'incidentManagement') -> reuses recovery.ts's existing
     entitlement gate verbatim (same function, same 403 shape recovery.ts already uses today)
  4. assetId resolves via ctx.assets.findByIdForAccount(support_case.accountId, assetId) -> 404 NOT_FOUND
  5. no existing open/investigating/tracking/recovered-pending recovery case for that asset (duplicate guard,
     identical to recovery.ts's own POST /recovery/cases check)                -> 409 CONFLICT

Effect (one logical operation; Stage 6/9 owns transactionality mechanics):
  1. ctx.recoveryCases.createForAccount(accountId, assetId, notes=null, partnerOrganizationId=null)
  2. new recovery_cases row: originatingSupportCaseId = support_case.id
  3. support_case: escalatedToRecoveryCaseId = new case id, escalatedAt = now, status = 'escalated'
  4. Persist a Tier-2 verification record (method, outcome, timestamp, agent account id, channel) — shape owned
     by the C-010-4 design, not invented here
  5. Emit a distinct `caller_verification` audit event (separate from `privileged_data_access`) — event taxonomy
     is cybersecurity-architect's Stage 8 call
  6. Out-of-band notification to the account holder — blocked independently on INC-001-C-8

Response (once authorized):
  200 -> { supportCase: <updated, status: 'escalated'>, recoveryCase: <the newly created case, agent-facing shape> }
```

**New error code this endpoint would require, named now so it is not invented ad hoc at unblock time:**
`CALLER_NOT_VERIFIED` (`403`) — does not exist in `backend/src/lib/errors.ts` today. **Not added to the catalogue
by this document** — adding an error code for an endpoint that cannot ship yet would be dead code in a file with
a security-review obligation (`errors.ts`'s own header: "fixed message catalogue keyed by code," SR-19) attached
to every entry. Recorded here as the exact string Stage 9 must add when C-010-4 unblocks this route.

**This section contracts preconditions/effects/error shape only. No path, schema, or route is registered in §9's
OpenAPI document below** — keeping it out of the machine-readable contract is itself part of "not authorized for
implementation": there is nothing here a codegen tool or an engineer skimming the OpenAPI file could accidentally
scaffold.

---

## 8. OpenAPI 3.1 contract (FR-11–17 scope only)

```yaml
openapi: 3.1.0
info:
  title: TD IT Solutions — Call Centre Support Case API (Feature 010, FR-11–17)
  version: "1.0.0"
  description: >
    FR-18-21 escalation is deliberately NOT included in this document (see
    03-architecture-review-phase2.md §5.4 and this document's §7) — do not
    scaffold a route from a contract that doesn't exist here.
servers:
  - url: /v1
security:
  - bearerAuth: []

paths:
  /support-cases:
    post:
      operationId: createSupportCase
      summary: Agent creates a support case against a looked-up customer account (§2.2).
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateSupportCaseRequest' }
      responses:
        '201':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SupportCaseDetail' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/Conflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
    get:
      operationId: listSupportCases
      summary: Agent list/search — scope is REQUIRED (§2.1).
      parameters:
        - name: scope
          in: query
          required: true
          schema: { type: string, enum: [mine, all] }
        - name: status
          in: query
          required: false
          schema: { $ref: '#/components/schemas/SupportCaseStatus' }
        - name: category
          in: query
          required: false
          schema: { type: string }
        - name: accountId
          in: query
          required: false
          schema: { type: string, format: uuid }
        - $ref: '#/components/parameters/CursorParam'
        - $ref: '#/components/parameters/LimitParam'
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SupportCaseListPage' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /support-cases/{caseId}:
    get:
      operationId: getSupportCase
      summary: Agent detail view — full document including notes[] (§2.5).
      parameters:
        - { name: caseId, in: path, required: true, schema: { type: string, pattern: '^[0-9a-f]{24}$' } }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SupportCaseDetail' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }

  /support-cases/{caseId}/notes:
    post:
      operationId: addSupportCaseNote
      summary: Append one note (append-only, §5). No Idempotency-Key (§2.3).
      parameters:
        - { name: caseId, in: path, required: true, schema: { type: string, pattern: '^[0-9a-f]{24}$' } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/AddNoteRequest' }
      responses:
        '201':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AddNoteResponse' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }

  /support-cases/{caseId}/status:
    patch:
      operationId: updateSupportCaseStatus
      summary: >
        FR-15/16 status transition. 'escalated' is rejected (§5) — the only
        path to that status is the not-yet-authorized escalate endpoint (§7).
      parameters:
        - { name: caseId, in: path, required: true, schema: { type: string, pattern: '^[0-9a-f]{24}$' } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateStatusRequest' }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SupportCaseDetail' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/Conflict' }

components:
  parameters:
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: true
      schema: { type: string, format: uuid }
    CursorParam:
      name: cursor
      in: query
      required: false
      schema: { type: string }
    LimitParam:
      name: limit
      in: query
      required: false
      schema: { type: integer, minimum: 1, maximum: 200, default: 50 }

  schemas:
    SupportCaseStatus:
      type: string
      enum: [open, in_progress, resolved, closed, escalated]

    SupportCaseCategory:
      type: string
      description: >
        API-layer-validated FR-13 starter set, NOT a database schema enum
        (database-design.md §4.1). Not ratified — do not assume final.
      enum: [billing, app_technical_issue, policy_question, asset_registration_help, account_access, other]

    CreateSupportCaseRequest:
      type: object
      required: [accountId, category, description]
      properties:
        accountId: { type: string, format: uuid, description: Deliberate exception to the never-client-supplied rule — §2.2. }
        category: { $ref: '#/components/schemas/SupportCaseCategory' }
        description: { type: string, minLength: 1, maxLength: 2000 }
        channel: { type: string, enum: [phone], default: phone }

    SupportCaseNote:
      type: object
      required: [agentAccountId, text, createdAt]
      properties:
        agentAccountId: { type: string, format: uuid }
        text: { type: string, maxLength: 2000 }
        createdAt: { type: string, format: date-time }

    SupportCaseSummary:
      type: object
      description: List projection — omits notes[] (§2.5).
      required: [id, referenceNumber, accountId, category, status, callerVerified, createdAt, updatedAt]
      properties:
        id: { type: string }
        referenceNumber: { type: string }
        accountId: { type: string, format: uuid }
        category: { $ref: '#/components/schemas/SupportCaseCategory' }
        description: { type: string }
        status: { $ref: '#/components/schemas/SupportCaseStatus' }
        callerVerified: { type: boolean }
        createdByAgentAccountId: { type: string, format: uuid }
        assignedAgentAccountId: { type: string, format: uuid, nullable: true }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }

    SupportCaseDetail:
      description: Full document — adds notes[], resolutionSummary, escalation fields.
      allOf:
        - $ref: '#/components/schemas/SupportCaseSummary'
        - type: object
          required: [notes]
          properties:
            resolutionSummary: { type: string, nullable: true }
            notes:
              type: array
              items: { $ref: '#/components/schemas/SupportCaseNote' }
            escalatedToRecoveryCaseId: { type: string, nullable: true }
            escalatedAt: { type: string, format: date-time, nullable: true }
            closedAt: { type: string, format: date-time, nullable: true }

    SupportCaseListPage:
      type: object
      properties:
        data: { type: array, items: { $ref: '#/components/schemas/SupportCaseSummary' } }
        pagination:
          type: object
          properties:
            nextCursor: { type: string, nullable: true }
            hasMore: { type: boolean }

    AddNoteRequest:
      type: object
      required: [text]
      properties:
        text: { type: string, minLength: 1, maxLength: 2000 }

    AddNoteResponse:
      type: object
      required: [caseId, note]
      properties:
        caseId: { type: string }
        note: { $ref: '#/components/schemas/SupportCaseNote' }

    UpdateStatusRequest:
      type: object
      required: [status]
      properties:
        status: { type: string, enum: [in_progress, resolved, closed] }
        resolutionSummary: { type: string, minLength: 1, maxLength: 2000 }

    Error:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message, requestId]
          properties:
            code: { type: string }
            message: { type: string }
            requestId: { type: string, format: uuid }

  responses:
    BadRequest:
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    Unauthorized:
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    Forbidden:
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    NotFound:
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    Conflict:
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    TooManyRequests:
      headers:
        Retry-After: { schema: { type: integer } }
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

---

## 9. Consistency check against `database-design.md`

- `support_cases` schema fields (§3 of that document) map 1:1 to `SupportCaseSummary`/`SupportCaseDetail` above —
  no field renamed, no field added that isn't in the DDL, `legalHold` intentionally **not** exposed on any
  response (internal retention-control field, no client need named).
- `category` API-layer validation (§5 of this document) matches `database-design.md` §4.1's ruling exactly — the
  schema stores any string, the API rejects unlisted values; this document does not contradict that by silently
  reintroducing a stricter or looser rule.
- `escalatedToRecoveryCaseId`/`escalatedAt`/`status: 'escalated'` appear in `SupportCaseDetail` (read-only, always
  `null`/absent under FR-11–17 scope, since no write path exists to populate them yet) — included in the read
  schema now so the contract doesn't need a breaking change the moment §7 unblocks, matching
  `database-design.md`'s own "formalize now, don't invent twice" reasoning for the same fields.

---

## 10. Open items tracker

| ID | Item | Owner | Blocks | Status |
|---|---|---|---|---|
| **SC-API-01** | `scope` required-no-default ruling (§2.1) — revisit once OQ-010-4 resolves a real default. | `cto`/`technical-project-manager` | Whether `scope` ever becomes optional | Ruled here as an implementable interim contract, not a final business answer |
| **SC-API-02** | Stage 8 review of the client-supplied `accountId` exception (§2.2) — confirm scoping is correct, not a rule regression. | `cybersecurity-architect`/`security-engineer` | Stage 8 sign-off | Open |
| **SC-API-03** | `CALLER_NOT_VERIFIED` error code (§7) — add to `backend/src/lib/errors.ts` only when C-010-4 unblocks FR-18–21. | `backend-engineer` | FR-18–21 implementation (already blocked on C-010-4) | Named, not actioned |
| **SC-API-04** | `caller_verification` audit event taxonomy (§7 step 5). | `cybersecurity-architect` | FR-18–21 implementation | Open, Stage 8 item per `03-architecture-review-phase2.md` §8 |
| **SC-API-05** | Reference-number generator extraction (`generateCaseReferenceNumber(prefix)`) — non-blocking refactor recommendation carried from architecture review §6.6. | `backend-engineer` | None — quality recommendation | Recommended, Stage 9 |

---

## 11. Pre-Approval Checklist (`backend-architect` self-review)

- [x] API contract (OpenAPI) exists and is reviewed for the cleared FR-11–17 scope — §8.
- [x] Service boundaries — new `support-cases.ts` router, new `support_cases` collection; no reuse of `recovery_cases` (unchanged from architecture review §2).
- [x] Idempotency strategy defined for the one create/state-mutating endpoint that needs it (`POST /support-cases`) — §2.3.
- [x] Authn/authz model explicit per endpoint, including the deliberate client-supplied-`accountId` exception and why (§2.2, §4).
- [x] Third-party failure modes — N/A, no third-party vendor dependency in FR-11–17 scope.
- [ ] FR-18–21's authz gate (Tier 2 verification) is **explicitly not designed here** and named as the blocking dependency throughout (§7) — left unchecked deliberately, not an oversight.
- [ ] Capacity/throughput targets — not stated; call-centre volume is low-frequency transactional, no target requested (unchanged from architecture review §9).
- [ ] Reviewed and approved by `cybersecurity-architect`/`security-engineer` — **pending, Stage 8 hard gate, this document is the submission for that review.**

---

## 12. Summary for handoff

- **FR-11 addendum contracted:** `GET /v1/customer-lookup` gains `openSupportCaseCount`/`supportCases[]` — no
  auth/audit-posture change (§3).
- **Five endpoints contracted for FR-12–17:** `POST/GET /v1/support-cases`, `GET /v1/support-cases/:id`,
  `POST /v1/support-cases/:id/notes`, `PATCH /v1/support-cases/:id/status` — all `support_agent`-only (§4, §8).
- **`scope=mine|all` ruled required-with-no-default** (§2.1) — an implementable interim answer that doesn't guess
  OQ-010-4's business call.
- **FR-18–21 escalation contracted but explicitly NOT AUTHORIZED FOR IMPLEMENTATION** — restated, not dropped
  (§7); kept out of the machine-readable OpenAPI document on purpose so nothing can be scaffolded from it by
  accident.
- **No new error codes needed for the cleared scope**; one (`CALLER_NOT_VERIFIED`) is named but deliberately not
  added to the catalogue yet, since its only consumer is the blocked endpoint (§7, SC-API-03).
- **Ready for Stage 8** (`cybersecurity-architect`/`security-engineer`, hard gate) for the FR-11–17 scope; FR-18–21
  remains blocked upstream of Stage 8 on C-010-4 regardless of this document's own completeness.

---

## 13. Contract Amendment Log

| Version | Date | Author | Change |
|---|---|---|---|
| **1.0.0** | 2026-09-03 | `backend-architect` | First publication — FR-11–17 endpoint contracts; FR-18–21 escalation data contract recorded as not authorized for implementation. |
