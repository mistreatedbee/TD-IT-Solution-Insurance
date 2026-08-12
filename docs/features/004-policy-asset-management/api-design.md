# Feature 004 — Policy, Subscription & Asset Management
## API Design — Stage 7

**Lifecycle stage:** 7 — API Design, per [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md).
**Author:** `backend-architect`
**Status:** Draft — submitted for `solution-architect` review. **Not a normal Stage 7 entry**, for the same reason `database-design.md` §0 was not a normal Stage 6 entry: no ratified Stage 1 (`business-requirements.md`) or Stage 5 (architecture review) exists for this domain. This document discharges the `backend-architect` link of `003-mobile-app-foundation/architecture.md`'s **M-05** chain ("Stage 1 business requirements through Stage 7 API contract... `business-analyst` → `product-manager` → `database-architect` → `backend-architect`") — the last link, not a substitute for the ones before it.
**Formalizes:** [`database-design.md`](./database-design.md) (Stage 6, `database-architect`, 2026-08-08) — this document's endpoint set, request/response shapes, and auth posture are written directly against that schema's collections, indexes, and named query patterns. Nothing below is inconsistent with it; where this document proposes something `database-design.md` did not (§3), it is flagged as a new addendum request, not asserted as already-schema'd.
**Reuses, does not reinvent:** [`001-authentication/api-design.md`](../001-authentication/api-design.md) v1.1.0 — the error envelope, cursor-pagination shape, rate-limit header contract, `/api/v1` path prefix, and idempotency-key mechanism are all ratified platform-wide conventions from that document (its §6, §4, §5). This document cites and reuses them verbatim rather than defining parallel ones, per this role's own instruction from the task that produced it and per this role's standing practice of API contract consistency across services.
**Contract version:** 1.1.0 (2026-08-12 — SR-004-admin-5/6 admin list rate limits and summary projections; see §11).
**Reads on (read in full to produce this document):** `database-design.md` (Stage 6, this feature), `003-mobile-app-foundation/architecture.md` §5.2 (the concrete client need — "view own policy," "view own assets," and the explicit push-back against a client-supplied `accountId`), root `CLAUDE.md` (asset-type list, honesty rules), `08-roadmap.md` Phase 1 ("asset registration... policy/subscription selection," "Admin Dashboard: view customers, policies, assets"), `001-authentication/api-design.md` (conventions, §1's backend-minted-token model, §7's `/internal/accounts/{id}/status`), `001-authentication/architecture/backend-approach.md` §2.1 (service-decomposition precedent), `001-authentication/security-review.md` (SR-9, SR-10 — the authorization-attribute and cross-account-audit patterns this document must extend, not re-derive from scratch).

---

## 0. What This Document Resolves, and What It Explicitly Does Not

Per `database-design.md` §0's own framing, carried forward here rather than restated as if this were a normal Stage 7 entry: **this domain has no Stage 1 business-requirements.md.** There is no ratified list of plan tiers, no coverage-limit or pricing rule, no eligibility rule for who may register which asset type, and no acceptance criteria this contract is measured against. Wherever this document needs one of those facts, it says so and does not invent a number or a rule — consistent with root `CLAUDE.md`'s instruction not to describe systems or rules that don't exist, and with this role's own charter ("defers to `database-architect` on schema... to `solution-architect` on cross-domain boundary disputes" — and, by the same logic, defers to `business-analyst` on business rules this role has no authority to set).

**What this document does decide, because it is squarely this role's authority regardless of the Stage 1 gap:** service boundary and ownership (§2), the endpoint surface and its request/response shapes (§6), the authorization model per client type (§4), which platform-wide conventions apply unchanged (§5), and where this domain's write path must call back into Identity Service rather than trusting a claim (§4.3).

**What this document explicitly refuses to invent, named so it is never mistaken for a ratified decision:**
- What plan tiers exist, what they cost, or what coverage limits attach to a tier. `POST /v1/policies` accepts a free-form `planTier` string (matching `database-design.md` §3.1's own deliberate non-enum) and returns `coverageLimits: []` until `business-analyst` (P-01) supplies the mapping — §6.2 states this plainly at the operation level, not just here.
- Any eligibility rule for asset registration (e.g., "must have an active policy first," "business-equipment assets require an admin review"). None is enforced. `POST /v1/assets` succeeds for any `active` account regardless of policy state, and this is named as a gap, not a decision that no such rule should ever exist.
- Any coverage-limit-vs-estimated-value check at registration. `database-design.md` §3.3 named `estimatedValue` as existing "for coverage-limit checks at registration" as a future capability; no such check is implemented or contracted here, because the coverage-limit values it would check against don't exist yet either (same P-01 gap).

---

## 1. Scope

**In scope:** REST endpoints for customer self-service creation and read of the caller's own policies and assets; Admin Dashboard list/detail read endpoints for policies and assets across all customers. Auth model, request/response shapes, pagination, idempotency, and rate-limiting for that endpoint set only.

**Explicitly out of scope, per the task that produced this document and consistent with `database-design.md` §8:**
- **Payment/billing endpoints.** No endpoint here accepts a card, a PSP token, or drives a checkout flow, and none will exist in this document until a payment gateway is selected (`integration-architect`'s open decision, ADR-0001) and a `payment-engineer` role is staffed to own that integration's webhook/reconciliation contract. `POST /v1/policies` creates a policy row in `billingStatus: "not_configured"` (§6.2) and stops there — it does not attempt to also start a subscription.
- **GPS endpoints.** No pairing, ping-ingestion, or location-read endpoint exists here. `database-design.md` §6's `gpsDeviceId`/`gpsPairedAt` fields are present on the `Asset` schema (§6.1) only because they already exist on the underlying document and omitting them from the response would be actively misleading (a `null` value is honest; hiding the field is not) — no endpoint in this contract sets or reads them meaningfully.
- **Claims.** No claims collection exists (`database-design.md` §1); no claims endpoint is designed here.
- **Update/delete for policies or assets.** The task that produced this document asked for "creating/viewing," not full CRUD. No `PATCH`/`PUT`/`DELETE` endpoint exists in this contract. This is a real, named gap for a near-future pass (e.g., a customer editing an asset's `displayName`, or cancelling their own policy) — not designed here because it wasn't asked for and doing so speculatively risks inventing cancellation/edit business rules (e.g., can a customer cancel mid-cycle? does editing an asset's `assetType` after registration require re-validation against coverage limits?) that belong with `business-analyst`.
- **"View customers" (the Admin Dashboard's third named Phase 1 need).** Per `database-design.md` §5's own note, customer identity lives entirely in Supabase (`app.accounts`), not MongoDB — there is nothing in this domain's data for such an endpoint to query. **This is a real, currently-unfilled gap in the platform, not a decision that it's out of scope forever:** `001-authentication/api-design.md` v1.1.0 has no `GET /v1/admin/accounts` (list) or `GET /v1/admin/accounts/{id}` (detail) endpoint either — Feature 001 built `GET /v1/admin/audit-log` but never a plain customer-list/detail read. Filed as **P-10** (§8) — a small, additive amendment to `001-authentication/api-design.md`, owned by `backend-architect` (this role, on Identity Service's own contract), not invented here as a workaround that would blur which service owns customer identity.

---

## 2. Service Boundary: One "Policy & Asset Service," In-Process With Identity Service Today

`backend-approach.md` §2.1 named "Asset-Registry Service" and "Policy/Subscription Service" as two illustrative, not-yet-built future services. **Ruling, within this role's final authority over service boundaries:** they are one service, not two, for this feature — **Policy & Asset Service** — for the same reason `database-design.md` §2 merged `policies` and a hypothetical `subscriptions` collection into one: a policy's coverage terms and its billing state are one lifecycle object, and an asset's registration is read/written by the same client population (the account owner, plus admin) against the same auth model, with no independent scaling or team-ownership pressure between the two today. `08-roadmap.md`'s organization-scaling table already names the actual trigger for a future split ("Backend API grows beyond one team can safely own → per-domain squads (billing, assets, claims)") — that trigger has not fired.

**Deployment reality, stated plainly per root `CLAUDE.md`'s honesty rule:** "service" here is a logical/code-organizational boundary, not a separate network deployment. Per ADR-0001 (one Node.js/TypeScript backend) and ADR-0003 (one Render service), Policy & Asset Service's routes are mounted in the same Express app as Identity Service's, as a new router module (e.g. `backend/src/routes/policies.ts`, `backend/src/routes/assets.ts`, `backend/src/routes/admin-policies.ts`, `backend/src/routes/admin-assets.ts`) alongside the existing `auth.ts`/`session.ts`/`invitations.ts`/`mfa.ts`. This is *why* §4 below can reuse Identity Service's JWT-verification middleware in-process (no network hop, no shared-secret problem) for every request, and reserve an actual network call (`GET /v1/internal/accounts/{id}/status`) only for the one case that needs a live, not-cached answer (§4.3) — exactly the pattern `backend-approach.md` §2.1 anticipated ("everything else depends on [Identity Service] for `account_id` resolution and role/session validation... via internal lookup, not a network round-trip on every request").

**System of record:** MongoDB, per ADR-0002 — this service never writes to Supabase and holds no Supabase credential. `accountId` on every document is a soft reference, exactly as `database-design.md` §4 specifies; this document adds no new cross-store mechanism beyond reusing Feature 001's existing `GET /v1/internal/accounts/{id}/status`, per that section's own recommendation.

---

## 3. Required Stage 6 Addendum — Flagged to `database-architect`, Not Assumed

Mirroring the precedent `001-authentication/api-design.md` §3 set (propose column/collection shapes for `database-architect` to formalize, write no schema unilaterally): this contract needs one collection `database-design.md` does not currently define.

### 3.1 `admin_access_log` — required by §4.4/§6.3's audit obligation, does not exist in `database-design.md`

`06-security-standards.md` requires an audit event for "access to another user's data by an admin/support/security-company operator." Feature 001 solved this for its own surface by adding `privileged_data_access` to `app.audit_event_type` (migration 030, SR-10) — but that enum and its backing table (`app.account_audit_log`) live in Supabase, are Identity-Service-owned, and Identity Service exposes no generic "record an audit event on my behalf" endpoint another service could call. Rather than inventing a new cross-service call for this (a real option, but one that makes every admin policy/asset read take a synchronous dependency on Identity Service's availability, which §4.3 deliberately avoids for the read path), this document proposes a MongoDB-side, domain-owned append-only collection, mirroring `policy_status_history`'s own shape and rationale exactly:

```jsonc
// Proposed collection: admin_access_log
{
  _id: ObjectId,
  actorAccountId: "b3f1c2a4-...",   // the admin account (from the bearer token's sub) that performed the read
  targetAccountId: "c9e2d1b7-...",  // whose data was viewed — null for an unfiltered list call (no single subject)
  resourceType: "policy",            // "policy" | "asset"
  resourceId: ObjectId,              // null for a list-level call
  endpoint: "GET /v1/admin/policies/{id}",
  ipAddress: "203.0.113.4",
  createdAt: ISODate("2026-08-11")
}
```

Proposed index: `{ actorAccountId: 1, createdAt: -1 }` (compliance/security review reconstructing "what did this admin look at") and `{ targetAccountId: 1, createdAt: -1 }` (customer-side "who looked at my data," mirroring `policy_status_history`'s own actor/subject index pair). Retention: **open**, same P-04-class gap as everything else in `database-design.md` §7 — `compliance-specialist`'s call, not decided here.

**Not decided here, flagged for `database-architect`:** whether this should instead be a Postgres table in Supabase (consistency with Feature 001's own audit trail, one place to query "everything about admin X") versus this MongoDB collection (consistency with this domain's own data, no cross-store write on every admin read). `backend-approach.md` §5.2 faced the structurally identical question for Feature 001's own audit log and left it as a named, not-self-decided choice — this document does the same rather than picking one silently. **This document's contract (§6.3) assumes the MongoDB shape above only because it is the one that requires no new schema elsewhere to ship** — if `database-architect`/`security-engineer` rule the Postgres option instead, §6.3's audit-writing step changes implementation, not the client-visible contract.

---

## 4. Authorization Model

### 4.1 Token reuse — no new session mechanism

Every endpoint in this contract requires the exact bearer token `001-authentication/api-design.md` §1/§7 already mints — `sub` (`account_id`), `user_type`, `mfa_required`, `account_state`, `partner_organization_id`, `session_id`. No new token claim, scheme, or issuance path is introduced. `securitySchemes.bearerAuth` below is the identical scheme, verified by the identical in-process middleware (`backend/src/middleware/authenticate.ts`) — this is the concrete payoff of §2's in-process service-boundary decision.

### 4.2 Customer-facing endpoints — `accountId` is never client-supplied

Every `/v1/policies` and `/v1/assets` operation (non-admin) derives `accountId` from the bearer token's `sub` claim only. **No request body, path parameter, or query parameter on any customer-facing endpoint in §6.1/§6.2 accepts an `accountId`.** This is not a stylistic choice — `003-mobile-app-foundation/architecture.md` §5.2 explicitly named the alternative ("require an explicit client-supplied identifier") as "reopening an authorization hole the auth API already closed" and this document concurs and treats it as a hard requirement, not a recommendation, exactly as that document asked.

### 4.3 The BR-2-equivalent gate on writes — live-checked, never trusted from a claim

`001-authentication/api-design.md` §2.3's chokepoint table is explicit that "BR-2 commerce-gated actions in **other** services (future Policy/Asset services)" must call `GET /v1/internal/accounts/{id}/status` for a live read, not trust the JWT's `account_state` claim (bounded to 10 minutes of staleness, acceptable for reads, not for a commerce-gated mutation). This document is the "other service" that table was written for. Concretely:

- **`POST /v1/policies` and `POST /v1/assets`** call `GET /v1/internal/accounts/{id}/status` (service-to-service, `internalServiceAuth`, in-process function call today per §2's deployment reality — no network hop, but the same code path a genuinely separate deployment would use) immediately before writing. If `accountState !== 'active'`, the write is refused with `403 ACCOUNT_NOT_ACTIVE` (§6.4) — **the same live-read discipline `GET /v1/account/me` uses, applied here because policy/asset creation is exactly the kind of commerce-gated action D-2(c)/BR-2 was written to protect**, not a new interpretation of that rule.
- **Every `GET` endpoint in this contract** (customer or admin) trusts the bearer token's claim set (or, for admin list/detail calls, only checks `user_type`, which the token already carries) — per `001-authentication/api-design.md` §2.3's own final row ("all other authenticated reads... JWT claim alone is acceptable, bounded by the 10-minute ceiling"). A customer whose account has drifted to `suspended` in the last 9 minutes can still read their own existing policy/asset data; they cannot create a new one. This mirrors exactly how `GET /account/me` remains available during read paths while `/session/refresh` is the actual enforcement chokepoint for state drift.

### 4.4 Admin endpoints — role check plus mandatory audit event

`/v1/admin/policies*` and `/v1/admin/assets*` require `user_type = admin`, checked via the same `requireUserType('admin')` middleware Feature 001's `/v1/invitations` and `/v1/admin/audit-log` already use (`backend/src/middleware/require-role.ts`) — no new RBAC primitive. **Consistent with Feature 001's own ruling (C8 — "support-agent read is not granted"), this document extends the identical posture to this domain: `support_agent` and `security_company_operator` have no read access to any policy or asset data in Phase 1.** The Customer Support Portal (Phase 3) and Security Company Dashboard case-handoff (Phase 2) are both future features that will need their own, narrower authorization design when they exist — not a early, speculative grant here.

Every admin read of another account's policy/asset data — list or detail — writes one `admin_access_log` entry (§3.1) synchronously, in the same request, before the response is returned. This is not optional per-endpoint; it is the mechanism this document proposes to satisfy `06-security-standards.md`'s cross-account-access-logging requirement for this domain, mirroring the same non-negotiable framing `security-review.md` SR-10 gave the equivalent Identity Service gap.

---

## 5. API Design Standards — Reused Verbatim From `001-authentication/api-design.md`

No new convention is introduced in this section; each item below cites the ratifying source rather than re-deriving it, per this role's own instruction to reuse, not reinvent, cross-domain conventions.

| Convention | Source | Applied here |
|---|---|---|
| **Path prefix / versioning** | `001-authentication/api-design.md` §6 | `/api/v1/policies`, `/api/v1/assets`, `/api/v1/admin/policies`, `/api/v1/admin/assets`. This document's `servers:` block is written as `/v1` per that same document's convention — read every path in §6 as mounted under `/api`. |
| **Error envelope** | Same, §6 — `error-handler.ts`'s shape | `{ "error": { "code", "message", "requestId" } }`, reused verbatim as this document's `Error` schema (§6's `components`). No bespoke error shape anywhere in this contract. |
| **Pagination** | Same, §6 — "the convention Stage 7 ratifies platform-wide for every future list endpoint, not invented uniquely for audit logs" | Cursor-based: `limit` (default 50, max 200) / `cursor` (opaque, base64) query params; every list response wraps `data` + `pagination: { nextCursor, hasMore } }`. Applied to all four list endpoints in §6. |
| **Rate limiting** | Same, §5 — platform-wide baseline row | `100 requests / 1 min per account_id` (the platform default) applies to customer-facing endpoints. **Admin registry list endpoints** (`GET /v1/admin/policies`, `GET /v1/admin/assets`) carry stricter limits ratified in v1.1.0 (SR-004-admin-5): **20 requests / 60 s per admin account**, **30 requests / 60 s per client IP**, and **max `limit` = 50** per page. Detail reads (`GET /v1/admin/policies/{id}`, `GET /v1/admin/assets/{id}`) remain on the platform default. Surfaced via the same `X-RateLimit-*` / `Retry-After` headers. |
| **Idempotency** | Same, §4 | Required on `POST /v1/policies` and `POST /v1/assets` (§6.4) — both are write endpoints a mobile client on a flaky connection might retry, matching `05-development-standards.md`'s rule this role's charter already cites ("required on any write endpoint that a mobile client might retry"), independent of whether the write is money-adjacent. Same `Idempotency-Key` header, same `IDEMPOTENCY_KEY_REUSE` / `IDEMPOTENCY_KEY_REQUIRED` semantics, same `app.idempotency_keys`-backed mechanism (this document adds no new idempotency store — Policy & Asset Service, being in-process with Identity Service today per §2, uses the identical table and middleware). |
| **Multi-tenancy / cross-surface isolation** | Same, §2.3/§6 (BR-2 gate table); `security-review.md` §5.3 | Customer surface: `accountId` derived server-side only (§4.2). Admin surface: role-gated plus audited (§4.4). Security-company-operator surface: **not built** — no endpoint in this contract is reachable by that role, avoiding `security-review.md` §5.3's named risk of a partner-org-scoped surface being specified before the scoping mechanism (`partner_organization_id` on `account_status_cache`, already shipped per SR-9) has a real consumer to test against. |

**Recommendation, not actioned here (P-11, §8):** this is the second service to publish an OpenAPI contract inline in a Markdown document. The shared components (`Error`, standard `responses`, rate-limit `headers`, pagination `parameters`) are duplicated verbatim into §6 below rather than referenced across documents, because there is no tooling-resolvable shared file for a `$ref` to point at. Recommend `backend-architect` + `devops-engineer` extract these into a real `openapi/common.yaml` the next time either contract is regenerated, so the two services' contracts can `$ref` one shared file instead of two documents independently copying the same schema and silently drifting.

---

## 6. OpenAPI 3.1 Contract

```yaml
openapi: 3.1.0
info:
  title: TD IT Solutions — Policy & Asset Service API
  version: "1.1.0"
  description: >
    Feature 004 (Policy, Subscription & Asset Management), Phase 1 scope only:
    customer self-service create/view of own policies and assets; Admin
    Dashboard list/view across all customers. Payment/billing mechanics, GPS
    pairing/ingestion, and claims are explicitly out of scope (§1). Reuses
    001-authentication/api-design.md's error envelope, pagination, rate-limit
    header, and idempotency conventions verbatim (§5) — this is a second
    service's contract, not a second convention set.
servers:
  - url: /v1
security:
  - bearerAuth: []

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: >
        Identical scheme to 001-authentication/api-design.md's bearerAuth —
        the same backend-minted access token, verified in-process (§2). Not a
        second token type.
    internalServiceAuth:
      type: apiKey
      in: header
      name: X-Internal-Service-Key
      description: >
        Not exposed by any endpoint in THIS contract — named here only
        because §4.3 describes Policy & Asset Service calling Identity
        Service's existing GET /v1/internal/accounts/{id}/status
        (001-authentication/api-design.md §7) using this same scheme. No
        client of this document's endpoints ever presents this header.

  parameters:
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: true
      schema: { type: string, format: uuid }
      description: Client-generated UUID v4. Reused verbatim from 001-authentication/api-design.md §4.
    CursorParam:
      name: cursor
      in: query
      required: false
      schema: { type: string }
      description: Opaque pagination cursor from a prior response's pagination.nextCursor.
    LimitParam:
      name: limit
      in: query
      required: false
      schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
    AccountIdFilterParam:
      name: accountId
      in: query
      required: false
      schema: { type: string, format: uuid }
      description: Admin-only filter — scope the list to one customer's records.
    StatusFilterParam:
      name: status
      in: query
      required: false
      schema: { type: string }
      description: Filter by the resource's own status field (see PolicyStatus/AssetStatus).

  headers:
    RateLimitLimit: { schema: { type: integer } }
    RateLimitRemaining: { schema: { type: integer } }
    RateLimitReset: { schema: { type: integer, description: Unix timestamp. } }
    RetryAfter: { schema: { type: integer, description: Seconds. } }

  schemas:
    Error:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message, requestId]
          properties:
            code: { type: string, example: VALIDATION_ERROR }
            message: { type: string }
            requestId: { type: string, format: uuid }

    AssetType:
      type: string
      enum: [vehicle, laptop, smartphone, tablet, tv, desktop, business_equipment, other_electronics]

    Money:
      type: object
      required: [amount, currency]
      properties:
        amount: { type: number, minimum: 0 }
        currency: { type: string, minLength: 3, maxLength: 3, example: ZAR }

    CoverageLimit:
      type: object
      properties:
        assetType: { $ref: '#/components/schemas/AssetType' }
        amount: { type: number }
        currency: { type: string, minLength: 3, maxLength: 3 }

    PolicyStatus:
      type: string
      description: >
        PROPOSED vocabulary per database-design.md §3.1, not ratified by
        business-analyst. Do not assume this list is final.
      enum: [pending_activation, active, past_due, suspended, cancelled, expired]

    PolicyBilling:
      type: object
      description: >
        Minimized on purpose — omits database-design.md §3.1's
        billing.provider / externalCustomerId / externalSubscriptionId (raw
        PSP-side linkage). No client of this contract, admin included, has a
        stated need to see those values, and exposing them is unnecessary
        surface per this role's "input validation, secrets handling" review
        obligation. If a real need surfaces, it is an additive field, not a
        breaking change.
      properties:
        billingStatus: { type: string, enum: [not_configured, active, past_due, canceled] }
        currentPeriodEnd: { type: string, format: date-time, nullable: true }
        nextBillingAt: { type: string, format: date-time, nullable: true }
        cancelAt: { type: string, format: date-time, nullable: true }

    Policy:
      type: object
      description: Customer-facing shape — no accountId (implicitly the caller's own).
      properties:
        id: { type: string, description: MongoDB ObjectId as a string. }
        planTier:
          type: string
          description: >
            Free-form (database-design.md §3.1) — NOT validated against a
            fixed list. business-analyst has not ratified a tier vocabulary
            (P-01). Do not build client UI that assumes a closed set.
        status: { $ref: '#/components/schemas/PolicyStatus' }
        coverageLimits:
          type: array
          items: { $ref: '#/components/schemas/CoverageLimit' }
          description: >
            Empty on every policy today. No business rule exists yet mapping
            planTier to coverage limits (P-01) — this field is not
            populated by POST /v1/policies and this contract does not
            pretend otherwise.
        billing: { $ref: '#/components/schemas/PolicyBilling' }
        effectiveDate: { type: string, format: date-time }
        renewalDate: { type: string, format: date-time, nullable: true }
        cancelledAt: { type: string, format: date-time, nullable: true }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }

    AdminPolicy:
      description: Admin-facing detail shape — adds the two fields the customer view omits.
      allOf:
        - $ref: '#/components/schemas/Policy'
        - type: object
          properties:
            accountId: { type: string, format: uuid }
            legalHold: { type: boolean }

    AdminPolicySummary:
      description: >
        Admin list projection (SR-004-admin-6). Omits coverageLimits and the
        full billing sub-object; exposes billingStatus only for triage.
      type: object
      required: [id, accountId, planTier, status, legalHold, billingStatus, effectiveDate, createdAt]
      properties:
        id: { type: string }
        accountId: { type: string, format: uuid }
        planTier: { type: string }
        status: { $ref: '#/components/schemas/PolicyStatus' }
        legalHold: { type: boolean }
        billingStatus: { type: string, description: billing.billingStatus from the full policy document }
        effectiveDate: { type: string, format: date-time }
        createdAt: { type: string, format: date-time }

    PolicyListPage:
      type: object
      properties:
        data: { type: array, items: { $ref: '#/components/schemas/Policy' } }
        pagination:
          type: object
          properties:
            nextCursor: { type: string, nullable: true }
            hasMore: { type: boolean }

    AdminPolicyListPage:
      type: object
      properties:
        data: { type: array, items: { $ref: '#/components/schemas/AdminPolicySummary' } }
        pagination:
          type: object
          properties:
            nextCursor: { type: string, nullable: true }
            hasMore: { type: boolean }

    CreatePolicyRequest:
      type: object
      required: [planTier]
      properties:
        planTier:
          type: string
          minLength: 1
          description: >
            Accepted as-is, not validated against an enum (P-01 open — see
            Policy.planTier's description). This endpoint does not compute
            or accept coverageLimits or pricing — see §0's named business-
            rule gaps.

    AssetStatus:
      type: string
      enum: [active, inactive, removed]

    AssetDetailsVehicle:
      type: object
      required: [make, model, year, vin]
      properties:
        make: { type: string }
        model: { type: string }
        year: { type: integer }
        vin: { type: string }
        licensePlate: { type: string, nullable: true }
        color: { type: string, nullable: true }
        mileage: { type: integer, nullable: true }
      additionalProperties: false

    AssetDetailsLaptop:
      type: object
      required: [brand, model, serialNumber]
      properties:
        brand: { type: string }
        model: { type: string }
        serialNumber: { type: string }
        operatingSystem: { type: string, nullable: true }
      additionalProperties: false

    AssetDetailsSmartphone:
      type: object
      required: [brand, model, imei]
      properties:
        brand: { type: string }
        model: { type: string }
        imei: { type: string }
        serialNumber: { type: string, nullable: true }
      additionalProperties: false

    AssetDetailsTablet:
      type: object
      required: [brand, model, serialNumber]
      properties:
        brand: { type: string }
        model: { type: string }
        serialNumber: { type: string }
        imei: { type: string, nullable: true, description: Cellular-capable tablets only. }
      additionalProperties: false

    AssetDetailsTv:
      type: object
      required: [brand, model, serialNumber]
      properties:
        brand: { type: string }
        model: { type: string }
        serialNumber: { type: string }
        screenSizeInches: { type: number, nullable: true }
      additionalProperties: false

    AssetDetailsDesktop:
      type: object
      required: [brand, model, serialNumber]
      properties:
        brand: { type: string }
        model: { type: string }
        serialNumber: { type: string }
        components: { type: string, nullable: true }
      additionalProperties: false

    AssetDetailsBusinessEquipment:
      type: object
      required: [category, brand, model, serialNumber]
      properties:
        category: { type: string }
        brand: { type: string }
        model: { type: string }
        serialNumber: { type: string }
        description: { type: string, nullable: true }
      additionalProperties: false

    AssetDetailsOtherElectronics:
      type: object
      required: [category, brand, model, serialNumber]
      description: The deliberate catch-all (database-design.md §3.3).
      properties:
        category: { type: string }
        brand: { type: string }
        model: { type: string }
        serialNumber: { type: string }
        description: { type: string, nullable: true }
      additionalProperties: false

    Asset:
      type: object
      description: Customer-facing shape — no accountId (implicitly the caller's own).
      properties:
        id: { type: string, description: MongoDB ObjectId as a string. }
        assetType: { $ref: '#/components/schemas/AssetType' }
        displayName: { type: string }
        status: { $ref: '#/components/schemas/AssetStatus' }
        registeredAt: { type: string, format: date-time }
        estimatedValue:
          type: object
          nullable: true
          allOf: [{ $ref: '#/components/schemas/Money' }]
          properties:
            asOf: { type: string, format: date-time }
        photos: { type: array, items: { type: string } }
        gpsDeviceId:
          type: string
          nullable: true
          description: Always null in Phase 1 (database-design.md §6) — no GPS endpoint exists to populate it.
        gpsPairedAt: { type: string, format: date-time, nullable: true }
        details:
          description: Shape depends on assetType — see the per-type schemas above.
          oneOf:
            - $ref: '#/components/schemas/AssetDetailsVehicle'
            - $ref: '#/components/schemas/AssetDetailsLaptop'
            - $ref: '#/components/schemas/AssetDetailsSmartphone'
            - $ref: '#/components/schemas/AssetDetailsTablet'
            - $ref: '#/components/schemas/AssetDetailsTv'
            - $ref: '#/components/schemas/AssetDetailsDesktop'
            - $ref: '#/components/schemas/AssetDetailsBusinessEquipment'
            - $ref: '#/components/schemas/AssetDetailsOtherElectronics'
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }

    AdminAsset:
      description: Admin-facing detail shape — adds accountId and legalHold.
      allOf:
        - $ref: '#/components/schemas/Asset'
        - type: object
          properties:
            accountId: { type: string, format: uuid }
            legalHold: { type: boolean }

    AdminAssetSummary:
      description: >
        Admin list projection (SR-004-admin-6). Omits details (VIN, IMEI,
        serial numbers, licence plate), estimatedValue, and photos.
      type: object
      required: [id, accountId, assetType, displayName, status, legalHold, gpsDeviceId, registeredAt]
      properties:
        id: { type: string }
        accountId: { type: string, format: uuid }
        assetType: { $ref: '#/components/schemas/AssetType' }
        displayName: { type: string }
        status: { $ref: '#/components/schemas/AssetStatus' }
        legalHold: { type: boolean }
        gpsDeviceId: { type: string, nullable: true, description: null when not GPS-paired }
        registeredAt: { type: string, format: date-time }

    AssetListPage:
      type: object
      properties:
        data: { type: array, items: { $ref: '#/components/schemas/Asset' } }
        pagination:
          type: object
          properties:
            nextCursor: { type: string, nullable: true }
            hasMore: { type: boolean }

    AdminAssetListPage:
      type: object
      properties:
        data: { type: array, items: { $ref: '#/components/schemas/AdminAssetSummary' } }
        pagination:
          type: object
          properties:
            nextCursor: { type: string, nullable: true }
            hasMore: { type: boolean }

    CreateAssetRequest:
      type: object
      required: [assetType, displayName, details]
      properties:
        assetType: { $ref: '#/components/schemas/AssetType' }
        displayName: { type: string, minLength: 1, maxLength: 120 }
        estimatedValue:
          type: object
          nullable: true
          required: [amount, currency]
          properties:
            amount: { type: number, minimum: 0 }
            currency: { type: string, minLength: 3, maxLength: 3 }
          description: >
            Optional. Persisted as given; NOT validated against any
            coverage limit (§0 — no such rule exists yet).
        details:
          description: >
            Required. Shape MUST match assetType per the table in
            database-design.md §3.3 — validated server-side using the same
            oneOf-by-assetType discriminator the $jsonSchema validator
            applies at the database layer, so a malformed details object is
            rejected at the API edge (400), not silently persisted and
            caught only by the database validator throwing a 500-shaped
            failure.
          oneOf:
            - $ref: '#/components/schemas/AssetDetailsVehicle'
            - $ref: '#/components/schemas/AssetDetailsLaptop'
            - $ref: '#/components/schemas/AssetDetailsSmartphone'
            - $ref: '#/components/schemas/AssetDetailsTablet'
            - $ref: '#/components/schemas/AssetDetailsTv'
            - $ref: '#/components/schemas/AssetDetailsDesktop'
            - $ref: '#/components/schemas/AssetDetailsBusinessEquipment'
            - $ref: '#/components/schemas/AssetDetailsOtherElectronics'

  responses:
    BadRequest:
      description: Validation error.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Unauthorized:
      description: Missing/invalid/expired/revoked bearer token — identical semantics to 001-authentication/api-design.md.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Forbidden:
      description: Authenticated, but role/account-state does not permit this action.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    NotFound:
      description: >
        Resource does not exist OR exists but is not owned by the caller —
        identical shape for both, no enumeration of which, mirroring
        001-authentication/api-design.md's invitation-lookup pattern.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Conflict:
      description: Idempotency-key reuse with a different body.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    TooManyRequests:
      description: Rate limit exceeded.
      headers:
        Retry-After: { $ref: '#/components/headers/RetryAfter' }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }

paths:
  # ---------------------------------------------------------------
  # Customer-facing: policies
  # ---------------------------------------------------------------
  /policies:
    post:
      operationId: createPolicy
      summary: >
        Creates a policy for the caller's own account (accountId derived
        from the bearer token — §4.2). Live-checks account_state == 'active'
        before writing (§4.3, BR-2-equivalent gate).
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreatePolicyRequest' }
      responses:
        '201':
          description: Policy created, status = pending_activation, billing.billingStatus = not_configured.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Policy' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403':
          description: account_state is not 'active' (§4.3) — code ACCOUNT_NOT_ACTIVE.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '409': { $ref: '#/components/responses/Conflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
    get:
      operationId: listOwnPolicies
      summary: >
        Lists the caller's own policies (there may legitimately be more than
        one, per database-design.md §2 — this is a list, not a singular
        "my policy" endpoint, even though Phase 1 usage is expected to be
        0 or 1 per account).
      parameters:
        - $ref: '#/components/parameters/CursorParam'
        - $ref: '#/components/parameters/LimitParam'
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PolicyListPage' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /policies/{policyId}:
    get:
      operationId: getOwnPolicy
      summary: Detail view of one of the caller's own policies.
      parameters:
        - name: policyId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Policy' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }

  # ---------------------------------------------------------------
  # Customer-facing: assets
  # ---------------------------------------------------------------
  /assets:
    post:
      operationId: createAsset
      summary: >
        Registers an asset for the caller's own account. Live-checks
        account_state == 'active' before writing (§4.3).
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateAssetRequest' }
      responses:
        '201':
          description: Asset created, status = active, registeredAt = now.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Asset' }
        '400':
          description: >
            Validation error — includes the case where `details` does not
            match the shape required for the given `assetType`.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403':
          description: account_state is not 'active' — code ACCOUNT_NOT_ACTIVE.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '409': { $ref: '#/components/responses/Conflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
    get:
      operationId: listOwnAssets
      summary: Lists the caller's own registered assets.
      parameters:
        - $ref: '#/components/parameters/CursorParam'
        - $ref: '#/components/parameters/LimitParam'
        - $ref: '#/components/parameters/StatusFilterParam'
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AssetListPage' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /assets/{assetId}:
    get:
      operationId: getOwnAsset
      summary: Detail view of one of the caller's own assets.
      parameters:
        - name: assetId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Asset' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }

  # ---------------------------------------------------------------
  # Admin Dashboard: policies (list/view only — roadmap Phase 1)
  # ---------------------------------------------------------------
  /admin/policies:
    get:
      operationId: adminListPolicies
      summary: >
        Admin-only. Lists policies across all customers, or scoped to one
        customer via ?accountId=. Writes one admin_access_log entry (§4.4)
        per call.
      parameters:
        - $ref: '#/components/parameters/CursorParam'
        - $ref: '#/components/parameters/LimitParam'
        - $ref: '#/components/parameters/AccountIdFilterParam'
        - $ref: '#/components/parameters/StatusFilterParam'
      responses:
        '200':
          description: >
            NOTE (capacity honesty, per database-design.md §5's own
            "deliberately not indexed" callouts): an unfiltered call (no
            accountId, no status) is not backed by a dedicated index for a
            platform-wide createdAt sort. Acceptable at database-design.md
            §8.6's stated Phase 1 volume ("zero to first thousands of
            customers"); recommend the Admin Dashboard default to a status
            filter rather than an unfiltered "all policies" view once real
            volume exists. Not a blocking issue for this contract.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AdminPolicyListPage' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403':
          description: Caller is not admin.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /admin/policies/{policyId}:
    get:
      operationId: adminGetPolicy
      summary: Admin-only detail view. Writes one admin_access_log entry (§4.4).
      parameters:
        - name: policyId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AdminPolicy' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403':
          description: Caller is not admin.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '404': { $ref: '#/components/responses/NotFound' }

  # ---------------------------------------------------------------
  # Admin Dashboard: assets (list/view only — roadmap Phase 1)
  # ---------------------------------------------------------------
  /admin/assets:
    get:
      operationId: adminListAssets
      summary: >
        Admin-only. Lists assets across all customers, or scoped to one
        customer via ?accountId=. Writes one admin_access_log entry (§4.4)
        per call.
      parameters:
        - $ref: '#/components/parameters/CursorParam'
        - $ref: '#/components/parameters/LimitParam'
        - $ref: '#/components/parameters/AccountIdFilterParam'
        - $ref: '#/components/parameters/StatusFilterParam'
        - name: assetType
          in: query
          required: false
          schema: { $ref: '#/components/schemas/AssetType' }
          description: >
            Supported, but NOT backed by a dedicated index when used without
            accountId (database-design.md §5: "deliberately not indexed:
            assets.assetType standalone"). Fine at Phase 1 volume; flagged
            here rather than silently assumed free at scale.
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AdminAssetListPage' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403':
          description: Caller is not admin.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /admin/assets/{assetId}:
    get:
      operationId: adminGetAsset
      summary: Admin-only detail view. Writes one admin_access_log entry (§4.4).
      parameters:
        - name: assetId
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AdminAsset' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403':
          description: Caller is not admin.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '404': { $ref: '#/components/responses/NotFound' }
```

---

## 7. Consistency Check Against `003-mobile-app-foundation/architecture.md` §5.2's Four Named Needs

That document listed exactly four things it needed from this contract before "view policy"/"view assets" could move from placeholder to real. Closing the loop explicitly:

1. **"A read endpoint returning the caller's own policy/subscription record, and a list/detail pair for the caller's registered assets," scoped implicitly from the bearer token, never a client-supplied identifier.** — **Delivered**: §6's `/policies` + `/policies/{id}`, `/assets` + `/assets/{id}`, all scoped per §4.2. (That document also pushed back in advance against a client-supplied-identifier design — this document was never going to do that regardless, per Feature 001's own precedent, but the concurrence is recorded.)
2. **Confirmation that the platform's cursor-pagination convention is what the asset-list endpoint uses.** — **Confirmed**, §5's table, applied verbatim in §6.
3. **The actual field-level shape for polymorphic asset types, to decide "one generic asset card vs. per-type rendering branches."** — **Delivered**: §6's `Asset.details` `oneOf` across all eight types, matching `database-design.md` §3.3's table exactly. `ui-designer`/`mobile-engineer` now has enough to decide the rendering question themselves — this document does not make that UI call.
4. **The shared error envelope / Supabase-outage failure-mode pattern extended to whichever service owns this domain.** — **Partially delivered.** The error envelope is identical (§5). The outage-pattern is **not directly applicable** — this domain has no Supabase dependency at all (MongoDB only, per ADR-0002), so there is no `503 UPSTREAM_UNAVAILABLE` class of failure analogous to Feature 001's Supabase-outage handling. What this document does carry forward is the *live-read chokepoint discipline* (§4.3) that same architecture depends on. **Named gap:** a MongoDB-outage failure mode (what does `POST /v1/assets` return if the database itself is unreachable?) is not designed in this document — it is a standard `5xx`/`InternalError` case this contract inherits from the platform's general error-handling middleware, not a domain-specific design question the way Supabase's outage mode was for Identity Service (which had a *specific*, named, contractually-important behavior: reads keep working, writes get a clean `503`). Flagged as **P-12** (§8) rather than silently assumed identical to Feature 001's.

---

## 8. Open Items Tracker

| ID | Item | Owner | Blocks | Status |
|---|---|---|---|---|
| **P-01** *(inherited from `database-design.md`)* | Stage 1 business requirements: plan tiers, coverage rules, eligibility. | `business-analyst` → `product-manager` | `planTier` becoming a real enum; `coverageLimits` ever being populated by `POST /v1/policies`; any eligibility check on `POST /v1/assets` | **Partially discharged (Phase 1)** — minimum Stage 1 at [`business-requirements.md`](./business-requirements.md) (2026-08-11); D-01–D-04 deferred; pending `product-manager` sign-off |
| **P-10** | Add `GET /v1/admin/accounts` (list) and `GET /v1/admin/accounts/{id}` (detail) to `001-authentication/api-design.md` — the "view customers" third of the Admin Dashboard's named Phase 1 need, which belongs to Identity Service's own contract, not this one (§1). | `backend-architect` | Admin Dashboard's full Phase 1 scope | Proposed here, not yet actioned |
| **P-11** | Extract shared OpenAPI components (`Error`, standard `responses`, rate-limit `headers`, pagination `parameters`) into one `openapi/common.yaml` now that two services' contracts exist, instead of two documents independently copying the same schema. | `backend-architect` + `devops-engineer` | Long-term contract-drift risk between the two documents | Recommended, not decided (§5) |
| **P-12** | Design a MongoDB-outage failure mode for this domain's write endpoints, analogous in spirit (not necessarily shape) to Feature 001's Supabase-outage `503 UPSTREAM_UNAVAILABLE` contract. | `backend-architect` + `site-reliability-engineer` | Stage 8 for this domain | **Closed (2026-08-12)** — `lib/mongo-errors.ts` + `error-handler.ts`; tested in `error-handler.test.ts` and `policies.test.ts` |
| **P-13** | `admin_access_log` collection (§3.1) — formalize DDL/indexing, and rule Postgres-vs-MongoDB for where it lives. | `database-architect` (+ `security-engineer` on the storage-location question) | `06-security-standards.md`'s cross-account-audit requirement being actually implementable for this domain, not just contracted | Proposed here, not yet actioned |
| **P-14** *(inherited from `database-design.md`)* | Field-sensitivity review (VIN, device serial numbers, estimated value) before Stage 8. | `cybersecurity-architect` / `security-engineer` | Formal Stage 8 `security-review.md` verdict | **Phase 1 stub filed** — [`field-sensitivity-review.md`](./field-sensitivity-review.md) (2026-08-11): no FLE for VIN/serial/`estimatedValue`; Mongo at-rest + RBAC/audit sufficient for Phase 1. Full Stage 8 sign-off still required. |
| **P-15** | Update/edit/cancel endpoints for policies and assets (e.g., edit `displayName`, cancel a policy) — named out of scope in §1, not designed. | `backend-architect`, informed by `business-analyst` on cancellation business rules | Any customer self-service edit/cancel flow | Not started, not yet requested |

---

## 9. Pre-Approval Checklist (`backend-architect` self-review)

- [x] **API contract (OpenAPI) exists and is reviewed before client implementation starts.** §6. Submitted for `solution-architect` review now; no client implementation is authorized before that review lands, consistent with this feature having no ratified Stage 5 either (§0).
- [x] **Service boundaries documented with clear data ownership per service.** §2 — Policy & Asset Service, MongoDB-backed, in-process with Identity Service today, with the specific ADR/roadmap trigger named for when that changes.
- [x] **GPS ingestion and other high-throughput paths are architecturally isolated from low-throughput transactional paths.** N/A to this feature — no GPS endpoint exists here (§1), and this domain's own volume (policy/asset CRUD) is itself a low-throughput transactional path, not a hot path this document needs to isolate anything from.
- [x] **Idempotency and retry strategy defined for all money- and device-state-mutating endpoints.** §5, §6.4 — both `POST` endpoints require `Idempotency-Key`, reusing Feature 001's exact mechanism.
- [x] **Authn/authz model for each client type (customer, admin, security-company) is explicit per endpoint.** §4 — customer (self-scoped, live-gated on write), admin (role-gated, audited), security-company (explicitly not granted any access in this contract, §4.4).
- [ ] **Third-party failure modes... have designed fallbacks, not silent assumptions.** Partially — this domain has no third-party vendor dependency (no GPS vendor, no payment gateway in this contract's scope, §1). The one adjacent gap (MongoDB-outage behavior, P-12) is named, not designed. Left unchecked rather than claimed complete.
- [ ] **Capacity/throughput targets stated and testable by `performance-engineer`.** Not stated — Phase 1 volume is explicitly low per `database-design.md` §8.6, and no capacity target has been requested. The one honest capacity caveat that exists (§6's note on unfiltered admin list calls) is named, not hidden, but this checklist item is left unchecked because no target was set, not because none is needed.
- [ ] **Reviewed and approved by `solution-architect` for cross-domain consistency.** Pending — this document is the submission for that review, not a self-certified pass, exactly as `database-design.md` §12 left the equivalent item open for the same reason (no ratified Stage 5 for this domain).

**Net:** five of seven satisfied; two left open exactly as they should be — this document does not claim a review or a target that doesn't exist.

---

## 10. Summary for Handoff

- **Service boundary ruled:** one Policy & Asset Service (not two), in-process with Identity Service today, per §2 — the roadmap's org-scaling split trigger has not fired.
- **Ten endpoints delivered:** `POST/GET /v1/policies`, `GET /v1/policies/{id}`, `POST/GET /v1/assets`, `GET /v1/assets/{id}` (customer-facing, self-scoped); `GET /v1/admin/policies`, `GET /v1/admin/policies/{id}`, `GET /v1/admin/assets`, `GET /v1/admin/assets/{id}` (admin-only, audited).
- **Every platform convention reused, none reinvented:** error envelope, cursor pagination, rate-limit headers, `/api/v1` prefix, idempotency mechanism — all cited to `001-authentication/api-design.md` v1.1.0, not redefined (§5).
- **The BR-2-equivalent live-gate is applied where it belongs:** writes call `GET /v1/internal/accounts/{id}/status` live; reads trust the bounded-staleness JWT claim — exactly the split `001-authentication/api-design.md` §2.3 specified for "future Policy/Asset services," now actually built against.
- **One new collection proposed, not self-schema'd:** `admin_access_log` (§3.1), flagged to `database-architect` exactly as Feature 001's api-design.md flagged `app.sessions`/`app.idempotency_keys` at the equivalent stage.
- **No business rule invented:** `planTier` stays free-form, `coverageLimits` stays empty, no eligibility check exists — all three named as open (P-01) rather than filled with a guess, per this document's own §0 and the task that produced it.
- **Two things this feature's own roadmap line asked for are explicitly not here, and say so:** "view customers" (P-10 — belongs to Identity Service's contract) and payment/billing or GPS endpoints (§1 — explicitly out of scope, someone else's call).

---

## 11. Contract Amendment Log

| Version | Date | Author | Change |
|---|---|---|---|
| **1.0.0** | 2026-08-11 | `backend-architect` | First publication — ten endpoints (customer + admin list/detail). |
| **1.1.0** | 2026-08-12 | `backend-architect` | **SR-004-admin-5/6.** Admin list endpoints return summary schemas (`AdminPolicySummary`, `AdminAssetSummary`) instead of full detail shapes; detail endpoints unchanged. Admin registry list rate limits ratified: 20/min per admin account, 30/min per IP, max page size 50. Implemented in `backend/src/lib/policy-asset-serializers.ts`, `admin-policies.ts`, `admin-assets.ts`. Security review: `security-review-admin-surface.md` SR-004-admin-6. |
