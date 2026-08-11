# Feature 004 — Policy, Subscription & Asset Management

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst`
**Contributors:** `product-manager`, `compliance-specialist`
**Status:** Draft — minimum viable Stage 1 to unblock Phase 1 implementation; pricing/coverage/eligibility explicitly deferred (see §5); pending `product-manager` sign-off on scope
**Related system areas (RACI):** Policy & Asset Service (A: `backend-architect`, R: `backend-engineer`), Customer Mobile App (Phase 1 policy/asset screens), Admin Dashboard (policy/asset list/detail), MongoDB domain data per ADR-0002
**Reads on:** [`api-design.md`](./api-design.md) §0/§1/§6 (ratified contract this doc must not contradict), [`database-design.md`](./database-design.md) §0/§3 (schema placeholders), [`001-authentication/business-requirements.md`](../001-authentication/business-requirements.md) BR-2 (verification gate), [`003-mobile-app-foundation/architecture.md`](../003-mobile-app-foundation/architecture.md) §5.2 (mobile dependency M-05)

---

## 1. Business Problem / Goal

Feature 001 delivered identity and session foundation; the Customer Mobile App auth shell is built. Phase 1 roadmap still requires a **real** mobile experience — not placeholder cards — for policy and asset management: customers must be able to enroll in a plan (without payment yet), register protected assets, and view their own data.

Concretely, this feature is blocked today because there is no ratified Stage 1 spec. `database-design.md` (Stage 6) and `api-design.md` (Stage 7) already define **structural** shapes and endpoints but deliberately refuse to invent business rules (`api-design.md` §0, P-01). This document closes the minimum Stage 1 gap: it ratifies what **can ship now** against that contract and names everything that remains deferred, with owners and revisit triggers — **without inventing pricing, tier catalogs, coverage-limit numbers, or claim eligibility rules.**

**Goal of this Stage 1 slice:** enable verified customers to create a policy record, register assets of the eight supported types, and read their own policy and asset data on the mobile app; enable admins to list/view policies and assets across customers — all with honest `billingStatus: not_configured` until payment integration exists.

---

## 2. User Types In Scope (Phase 1)

| User type | Surface | Phase 1 capability |
|---|---|---|
| **Customer** | Customer Mobile App | Create own policy (no payment); register assets; list/detail own policies and assets |
| **Admin** | Admin Dashboard | List/detail policies and assets across customers (audited reads per `api-design.md` §4.4) |

**Explicitly not granted in Phase 1** (per `api-design.md` §4.4): `support_agent`, `security_company_operator` — no policy/asset read access until future portal features exist.

---

## 3. Functional Requirements (Phase 1 — shippable now)

### 3.1 Policy creation (customer, no payment)
- FR-1: A verified customer (`accountState == active`, per Feature 001 BR-2 and `api-design.md` §4.3) can create a policy by supplying a non-empty `planTier` string. The string is **opaque to the platform** — not validated against a closed tier catalog in Phase 1.
- FR-2: On creation, the policy is persisted with `status: pending_activation`, `coverageLimits: []` (empty array), and `billing.billingStatus: not_configured`. No price, no PSP call, no checkout flow.
- FR-3: The customer can list and detail their own policies. `accountId` is derived server-side from the bearer token only — never client-supplied (`api-design.md` §4.2).

### 3.2 Asset registration (customer)
- FR-4: A verified customer can register an asset by supplying `assetType`, `displayName`, and type-matching `details` per the eight-type polymorphic schema (`database-design.md` §3.3, `api-design.md` §6 `AssetType` enum).
- FR-5: Supported `assetType` values are exactly: `vehicle`, `laptop`, `smartphone`, `tablet`, `tv`, `desktop`, `business_equipment`, `other_electronics`. No additional types in Phase 1.
- FR-6: `estimatedValue` is optional on registration; if provided, it is stored as given with **no** validation against coverage limits (no such limits exist yet — §5).
- FR-7: Asset registration succeeds for any `active` account **regardless of whether a policy exists** — no "must have active policy first" rule is enforced in Phase 1 (`api-design.md` §0 names this as a gap, not a decision).
- FR-8: The customer can list (cursor-paginated) and detail their own registered assets.

### 3.3 Admin read (cross-customer)
- FR-9: An admin can list and detail policies and assets, optionally filtered by `accountId`, per `api-design.md` §6 admin endpoints.
- FR-10: Every admin read of another customer's policy/asset data writes an audit record (`admin_access_log`, per `database-addendum-001.md`) before the response is returned.

### 3.4 Gates inherited from Feature 001
- FR-11: Unverified customers (`pending_verification`) are blocked from policy creation and asset registration — same commerce gate as Feature 001 BR-2 / AC-11, enforced via live `GET /v1/internal/accounts/{id}/status` on writes (`api-design.md` §4.3).

---

## 4. Explicit Business Rules (Phase 1 only)

- **BR-1 (Opaque plan tier):** `planTier` is a free-form string stored and returned as provided. The platform does not interpret it as a product SKU, does not map it to coverage limits, and does not display pricing derived from it in Phase 1. Mobile UI may collect/display the string the customer or product team chooses for testing; it must not assume a closed enum.
- **BR-2 (Billing not configured):** Every policy created in Phase 1 has `billing.billingStatus: not_configured` until `payment-engineer` integrates a PSP and a future feature activates billing. No Phase 1 flow may imply payment succeeded or that coverage is funded.
- **BR-3 (Empty coverage limits):** `coverageLimits` remains an empty array on create and is not populated by the API in Phase 1. Display copy must not imply per-asset payout caps exist.
- **BR-4 (No eligibility enforcement):** Phase 1 does not enforce asset-type eligibility, asset-count limits, policy-required-before-asset, or estimated-value-vs-limit checks. These are deferred business rules (§5), not silent "allow everything forever" product decisions.
- **BR-5 (Self-scope only for customers):** Customers read and write only their own policies and assets; cross-account access is impossible via customer-facing endpoints.
- **BR-6 (Eight asset types only):** Registration rejects unknown `assetType` values at the API/schema layer; extending the enum requires a schema addendum, not a client-only change.
- **BR-7 (Soft reference to identity):** Every policy and asset document carries `accountId` as a soft reference to Supabase `app.accounts.id`; existence and `active` state are validated on writes per ADR-0002 and `database-design.md` §4.

---

## 5. Explicitly Deferred — Not Phase 1, With Owners and Revisit Triggers

Nothing in this section is invented as a rule; each item remains open until the named owner delivers a ratified spec or integration.

| ID | Deferred item | Owner | Revisit trigger | Blocks until resolved |
|---|---|---|---|---|
| **D-01** | Plan tier **catalog** (canonical tier names, marketing labels, feature matrix) | `product-manager` → `business-analyst` | Product pricing/strategy workshop; before public launch or any UI that presents tier comparison | `planTier` becoming a validated enum; customer-facing tier picker with real products |
| **D-02** | **Pricing** (monthly amounts, currency finality, tax/fees) | `product-manager` | PSP selected (`integration-architect` P-09 / ADR-0001 open decision) + commercial sign-off | Checkout, invoices, displayed premium on policy screen |
| **D-03** | **Coverage limit numbers** per tier × asset type (payout caps, aggregate limits) | `business-analyst` → `product-manager` | D-01 tier catalog exists; underwriting input available | Populating `coverageLimits[]`; estimated-value validation at registration; claims adjudication |
| **D-04** | **Eligibility rules** (policy required before asset; per-tier asset counts; business-equipment review; waiting periods) | `business-analyst` | D-01/D-03 far enough to know what is being eligible *for* | Server-side gates on `POST /v1/assets` or `POST /v1/policies`; claim filing |
| **D-05** | **Policy status transition rules** (`pending_activation` → `active`, billing-driven `past_due`/`suspended`) | `business-analyst` + `payment-engineer` | PSP webhooks and subscription lifecycle implemented | Automatic activation on payment; dunning/suspension behavior |
| **D-06** | **Cancellation, refund, proration** (mid-cycle cancel, downgrade/upgrade) | `business-analyst` → `payment-engineer` | D-02 pricing + PSP contract terms | `PATCH`/cancel endpoints (`api-design.md` P-15); customer self-service cancel |
| **D-07** | **Retention periods** for policies, assets, `policy_status_history`, `admin_access_log` | `compliance-specialist` | POPIA/insurance recordkeeping ruling (`database-design.md` P-04/P-05) | Automated purge jobs beyond `legalHold` mechanism |
| **D-08** | **Claims eligibility** (theft/loss, GPS-active requirements, proof of ownership) | `business-analyst` | Claims feature Stage 1 started (`08-roadmap.md` Phase 2) | Claims submission; asset status vocabulary beyond `active`/`inactive`/`removed` |

**Inherited tracker IDs:** `api-design.md` **P-01** is partially discharged by this document (Phase 1 scope ratified; D-01–D-04 remain open). **P-14** field-sensitivity review is discharged for Phase 1 by [`field-sensitivity-review.md`](./field-sensitivity-review.md).

---

## 6. Out of Scope for This Feature (Phase 1)

Aligned with `api-design.md` §1 — not deferred to a later sprint of the same feature without a new spec pass:

- Payment/checkout, PSP tokens, webhooks, dunning (`payment-engineer` / `integration-architect`).
- GPS device pairing, ping ingestion, location read (`gps-integration-engineer`, Phase 2).
- Claims submission or adjudication.
- Customer self-service edit/delete/cancel for policies or assets (`api-design.md` P-15).
- Admin "view customers" list/detail (`api-design.md` P-10 — Identity Service contract, not this domain).
- Security-company or support-agent access to policy/asset data.

---

## 7. Acceptance Criteria — Customer Mobile App Phase 1

### AC-1: Verified customer creates a policy without payment
```
Given a customer account is in "active" state (verified)
When the customer submits POST /v1/policies with a non-empty planTier string and a valid Idempotency-Key
Then a policy is created with status pending_activation
And billing.billingStatus is not_configured
And coverageLimits is an empty array
And no payment or checkout step is invoked
```

### AC-2: Unverified customer cannot create a policy or register an asset
```
Given a customer account is in "pending_verification" state
When the customer attempts POST /v1/policies or POST /v1/assets
Then the request is rejected with 403 ACCOUNT_NOT_ACTIVE
And the mobile app redirects the user to complete verification (Feature 001 BR-2)
```

### AC-3: Customer views own policy
```
Given a verified customer has at least one policy
When they open the Policy screen
Then the app calls GET /v1/policies (and GET /v1/policies/{id} for detail if needed)
And displays planTier, status, billing.billingStatus, and empty coverageLimits honestly
And does not display fabricated pricing or coverage caps
```

### AC-4: Customer registers an asset of each supported type shape
```
Given a verified customer is on the asset registration flow
When they submit POST /v1/assets with a valid assetType, displayName, and details matching that type's required fields
Then the asset is created with status active and registeredAt set
And the response includes the polymorphic details shape for that assetType
And estimatedValue is optional — omission is accepted
```

### AC-5: Customer views own asset list and detail
```
Given a verified customer has registered one or more assets
When they open the Assets screen
Then the app calls GET /v1/assets with cursor pagination
And renders each asset with displayName, assetType, status, and type-appropriate detail fields
And tapping an asset shows GET /v1/assets/{id} detail without exposing another customer's data
```

### AC-6: Idempotent retry on flaky mobile network
```
Given a verified customer submits POST /v1/policies or POST /v1/assets with an Idempotency-Key
When the client retries the same request with the same key and body after a timeout
Then the server returns the same resource as the first successful create (201 or equivalent idempotent replay)
And does not create a duplicate policy or asset
```

### AC-7: Empty states are honest before first policy/asset
```
Given a verified customer has no policies and no assets
When they open the Policy or Assets screen
Then the UI shows an empty state that invites creation
And does not show mock/demo policy or asset data presented as real
```

### AC-8: Policy screen does not imply active paid coverage
```
Given a policy with billing.billingStatus not_configured
When the customer views that policy
Then the UI clearly indicates billing is not set up / coverage is not yet activated by payment
And does not use language implying the asset is insured or billed until a future payment feature says otherwise
```

---

## 8. Open Questions (for product-manager)

- **OQ-1 (product-manager):** What placeholder `planTier` strings (if any) should mobile use in internal/testing builds before D-01 tier catalog exists — free-text entry vs. a temporary dev-only picker? Does not block backend/mobile wiring; affects UX only.
- **OQ-2 (product-manager):** Should Phase 1 mobile include a "create policy" flow in the first release, or only view policy until D-01 exists? **This doc ratifies create-with-opaque-string as in-scope** per `api-design.md` §6; product-manager may narrow mobile scope without changing the API.
- **OQ-3 (product-manager + ux-researcher):** Lightweight Stage 3/4 pass on register-asset and policy screens (`database-design.md` P-08 / mobile M-03) — not blocking API implementation, but affects final UI polish.

---

## 9. Pre-Approval Checklist (business-analyst self-review)

- [x] Every acceptance criterion is testable (AC-1 through AC-8).
- [x] Edge cases enumerated: unverified gate (AC-2), empty states (AC-7), idempotent retry (AC-6), honest billing/coverage display (AC-3, AC-8).
- [x] Coverage limits and tier rules — explicitly **not** specified; deferred table §5 with owners and triggers (no invented numbers).
- [ ] Compliance-specialist review of retention/deletion for policy/asset fields — deferred to D-07 (`compliance-specialist`); not blocking Phase 1 create/read.
- [x] Terminology aligned with `database-design.md` and `api-design.md` (planTier, billingStatus, assetType enum, coverageLimits).
- [x] Spec consistent with `api-design.md` §0 and `database-design.md` §0 — no contradiction on opaque planTier, empty coverageLimits, no eligibility checks, not_configured billing.
- [ ] Product-manager sign-off on scope and OQ-1–OQ-3 — **pending**.
- [ ] QA review of acceptance criteria — deferred to Stage 10 entry.

**Net status:** Minimum viable Stage 1 complete for Phase 1 implementation. Discharges `api-design.md` P-01 for the "what can ship without inventing rules" question; D-01–D-08 remain open for commercial and claims domains. Enables `backend-engineer`, `mobile-engineer`, and Stage 8 prep (with `field-sensitivity-review.md` for P-14).

---

## 10. Traceability

| Business rule / AC | API operation | Schema anchor |
|---|---|---|
| FR-1, BR-1, AC-1 | `POST /v1/policies` | `policies.planTier`, `coverageLimits: []` |
| BR-2, AC-1, AC-8 | `POST /v1/policies` response | `policies.billing.billingStatus: not_configured` |
| FR-4–FR-8, AC-4, AC-5 | `POST/GET /v1/assets` | `assets` + `details` oneOf (`database-design.md` §3.3) |
| FR-11, AC-2 | Write gate | `GET /v1/internal/accounts/{id}/status` |
| FR-3, AC-3 | `GET /v1/policies*` | Token-scoped read |
| FR-9–FR-10 | `GET /v1/admin/policies*`, `/admin/assets*` | `admin_access_log` (`database-addendum-001.md`) |
