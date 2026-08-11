# Feature 004 — Policy, Subscription & Asset Management
## Database Design — Stage 6 (produced ahead of Stages 1, 3, 4 — see §0)

**Lifecycle stage:** 6 — Database Design, per [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md).
**Author:** `database-architect`
**Status:** Paper design. No MongoDB cluster exists yet; nothing below has been executed against a live database. All collection shapes, validators, and indexes are written out for review, not applied.
**Date:** 2026-08-08
**Governing ADRs:** [ADR-0001](../../organization/adr/0001-baseline-architecture.md) (MongoDB baseline — chosen specifically for asset-type polymorphism), [ADR-0002](../../organization/adr/0002-polyglot-persistence-identity-vs-domain-data.md) (Supabase holds identity, MongoDB holds policies/assets/claims/GPS; `account_id` is a soft reference, referential integrity is the backend's job).
**Reads on (read in full to produce this document):** [`08-roadmap.md`](../../organization/08-roadmap.md) Phase 1/2, ADR-0001, ADR-0002, [`001-authentication/database-design.md`](../001-authentication/database-design.md), [`003-mobile-app-foundation/architecture.md`](../003-mobile-app-foundation/architecture.md) §0 and §5, [`06-security-standards.md`](../../organization/06-security-standards.md), [`001-authentication/compliance-review-supabase.md`](../001-authentication/compliance-review-supabase.md), [`001-authentication/security-review.md`](../001-authentication/security-review.md) (specifically §7's cascade finding), root [`CLAUDE.md`](../../../CLAUDE.md).
**Discharges (partially):** `003-mobile-app-foundation/architecture.md` **M-05** ("Policy/Asset domain: Stage 1 business requirements through Stage 7 API contract... `business-analyst` → `product-manager` → `database-architect` → `backend-architect`") — **the `database-architect` step only.** M-05's `business-analyst`/`product-manager` step (Stage 1/2) remains not-started and this document does not substitute for it (see §0). The `backend-architect` step (Stage 7 API contract) is the next, still-open link in that chain.
**Reviewers required before this is treated as final:** `backend-architect` (Stage 7 — API contract must match this schema's shape and query patterns), `compliance-specialist` (retention periods — every placeholder in §7 is explicitly unruled), `cybersecurity-architect`/`security-engineer` (field-level sensitivity review — §8.4), `cloud-infrastructure-architect` (capacity/cluster-topology implications of §6's GPS-readiness posture, before any Phase 2 ingestion volume exists).

---

> **Addendum note (added after Stage 7):** `api-design.md` (Stage 7, `backend-architect`) flagged one collection this document did not originally define — `admin_access_log` (records every admin read of another customer's policy/asset data, per `06-security-standards.md`'s cross-account-access-logging requirement and `api-design.md` §4.4/§6.3's mandatory-per-read-audit obligation). It is formalized as full document shape, `$jsonSchema` validator, and indexing in [`database-addendum-001.md`](./database-addendum-001.md), **not** in this document — this document's collection inventory (§3), indexing table (§5), and migration list (§9) remain exactly as originally written below and should be read together with that addendum, not as the complete picture on their own. The addendum also rules the Postgres-vs-MongoDB storage-location question `api-design.md` §3.1 left open, in favor of MongoDB. Total collection count for Feature 004 as of the addendum: the 3 collections below (`policies`, `policy_status_history`, `assets`) **plus** `admin_access_log` = 4.

## 0. What this document is, and an honest process note

Per this task's explicit instruction, this section follows the pattern `mobile-architect` used in [`003-mobile-app-foundation/architecture.md` §0](../003-mobile-app-foundation/architecture.md) for the analogous gap, rather than silently pretending stages ran that didn't.

**What has NOT happened for this domain, and is not pretended here:**

- **Stage 1 (Business Requirements, `business-analyst`)** — no `business-requirements.md` exists for Policy/Subscription/Asset management. There is no ratified list of plan tiers, no eligibility rules for who can register which asset type, no coverage-limit business rules, no acceptance criteria. Every place this document needs one of those facts, it says so explicitly and does not invent a number.
- **Stage 2 (Product Planning, `product-manager`)** — no prioritized backlog item or scoped milestone beyond the one-line roadmap mention ("asset registration... policy/subscription selection").
- **Stages 3–4 (UX Research / UI Design, `ux-researcher`/`ui-designer`)** — no user flow, journey map, or hi-fi design exists for "select a plan" or "register an asset" screens, on either the Admin Dashboard or the Customer Mobile App.
- **Stage 5 (Architecture Review, `solution-architect`)** — no architecture-review document for this domain exists; this document has not been ratified by `solution-architect` and should not be read as if it had.

**Why this document exists anyway, ahead of those stages:** Feature 003's mobile architecture already named the concrete cost of *not* doing this — "view policy" and "view assets" are two of the three Phase 1 Customer Mobile App screens (per `08-roadmap.md`) and they are currently unbuildable because "no MongoDB schema exists (`database-architect`, Stage 6, not started); no API contract exists (`backend-architect`, Stage 7, not started)." The Admin Dashboard's "view customers, policies, assets" scope item is blocked for the identical reason. This document exists to unblock the next concrete step (`backend-architect`'s Stage 7 API contract) using what IS already authoritative — the roadmap, ADR-0001, ADR-0002, Feature 001's precedent, and root `CLAUDE.md`'s asset-type list — without inventing business rules this role has no authority to set.

**What this means concretely for how to read this document:** wherever a decision is genuinely structural (embed vs. reference, how `account_id` crosses the store boundary, how polymorphism is modeled, indexing shape) this document decides it, because that is squarely `database-architect`'s authority per the org chart regardless of which lifecycle stage number is attached. Wherever a decision is a **business rule** (what plan tiers exist, what they cost, what coverage limits apply, who is eligible to register a business-equipment asset, how long a cancelled policy's records must be retained) this document **names the gap and proposes a structurally-reasonable placeholder shape**, explicitly flagged as provisional and owned by `business-analyst`/`product-manager`/`compliance-specialist`, never asserted as if it were ratified. **Recommendation, not yet actioned:** `business-analyst` should run Stage 1 for this domain before `backend-architect`'s Stage 7 API contract is treated as final — cheap now, expensive once mobile and admin-dashboard code exists that assumes a specific coverage-tier vocabulary.

---

## 1. Scope

**In scope:** MongoDB collection design for policies (including their subscription/billing state), and registered assets (vehicle, laptop, smartphone, tablet, TV, desktop, business equipment, other electronics — the list in root `CLAUDE.md` plus this role's own mission brief, reconciled in §3.3). Indexing strategy for the known Phase 1 query paths (Admin Dashboard "view customers/policies/assets"; Customer Mobile App "view own policy/assets" per `003-mobile-app-foundation/architecture.md` §5). A low-friction GPS-pairing extension point on the asset document, per root `CLAUDE.md`'s "registered assets can carry GPS tracking hardware." A retention/deletion posture for these collections consistent with the lesson `security-review.md` §7 drew from Feature 001's Postgres cascade chain.

**Out of scope, named so it is not assumed silently decided:**
- **Claims.** ADR-0002 names MongoDB as the eventual home for claims too, but claims are not designed here — no claims workflow, no claims collection, no status-transition vocabulary. That is a distinct future feature (Phase 2, per `08-roadmap.md`'s "theft-report flow," and likely its own Stage 1–7 run).
- **GPS ping ingestion, geofencing, location history.** Explicitly Phase 2 (`08-roadmap.md`). §6 gives the asset schema an extension point; it does not design the ingestion pipeline, the location-history collection, TTL/retention for pings, or rollup strategy — building that now would be exactly the "over-build for Phase 2" this task warned against.
- **Security-company partner records and dispatch.** Phase 2, not touched here.
- **The REST API contract.** `backend-architect`'s Stage 7, next in the chain M-05 names. This document describes what queries the schema must serve; it does not define request/response shapes, pagination envelopes, or auth middleware (Feature 001's `api-design.md` already set platform-wide conventions — cursor pagination, shared error envelope — that Stage 7 for this domain should reuse, not reinvent).
- **Payment/billing mechanics.** `integration-architect`/a future `payment-engineer` own PSP selection (per ADR-0001's explicit "payment gateway is an open decision"). This document's `billing` sub-document is a shape for *referencing* whatever gateway is chosen — it holds no vendor assumption and no raw payment instrument data (see §8.1).
- **Coverage-tier and eligibility business rules.** `business-analyst`'s Stage 1 gap, named repeatedly rather than filled (§0, §3.1, §8.3).

---

## 2. Policy vs. Subscription — one collection, not two, and why

`08-roadmap.md` uses both "policy" and "subscription" in the same phrase ("policy/subscription selection") without distinguishing them. This document resolves that ambiguity rather than carrying it forward as schema-level confusion.

**Decision: `policies` is a single collection. There is no separate `subscriptions` collection.** A policy document carries its own embedded `billing` sub-document representing the subscription/payment state that keeps that policy active.

**Reasoning:**

1. **In this business model, a subscription has no independent existence from the policy it funds.** This is not a SaaS product where a customer picks a billing tier and then optionally attaches product features — the commercial relationship (the subscription) and the coverage relationship (the policy) are two properties of one lifecycle event: "the customer is enrolled in plan X, covering asset types Y at limits Z, paid for via mechanism W." A policy that isn't being paid for isn't a *different kind* of policy — it's the same policy in a `past_due`/`suspended` billing state. Modeling that as two documents in two collections would require every read of "is my policy active" to join two collections for a fact that is really one fact viewed from two angles.
2. **This does not foreclose multiple concurrent policies per account.** Nothing in this schema requires "one policy per customer, ever." A customer with a separate vehicle policy and a separate business-equipment policy — each with its own coverage limits and its own billing cycle — is just two `policies` documents with the same `accountId`. If the platform later needs "one subscription payment funding multiple named policies," *that* is the concrete trigger to split billing out into its own collection (see Revisit Trigger below) — but no such requirement exists today, and building for it now would be speculative.
3. **Consistent with this role's Best Practice against speculative modeling.** A `subscriptions` collection whose sole content today would be `{ policyId, billing-fields-identical-to-what's-already-on-policies }` adds a join and a consistency-maintenance burden (keep two documents in sync on every billing-state change) for no expressed requirement.

**Revisit trigger:** if `integration-architect`/a future `payment-engineer` picks a PSP model where one subscription object legitimately spans multiple policies (e.g., a bundled multi-policy discount billed as one line item), or where billing needs its own independent audit/retry state machine that would otherwise bloat the `policies` document, split `billing` into its own `subscriptions` collection referencing `policyId` (or `policyIds: []`). That is a `backend-architect` + `database-architect` joint call at that time, not a decision this document is pre-empting.

---

## 3. Collections

### 3.1 `policies`

One document represents one enrollment in a plan — its coverage terms and its billing/subscription state together, per §2.

```jsonc
// Collection: policies
{
  _id: ObjectId,
  accountId: "b3f1c2a4-...",          // soft reference to Supabase app.accounts.id — see §4
  planTier: "standard",                // STRING, not a locked enum — see note below
  status: "active",                    // pending_activation | active | past_due | suspended | cancelled | expired — PROPOSED vocabulary, not ratified, see note below
  coverageLimits: [
    { assetType: "vehicle",            amount: 250000, currency: "ZAR" },
    { assetType: "laptop",             amount: 30000,  currency: "ZAR" },
    { assetType: "smartphone",         amount: 25000,  currency: "ZAR" },
    { assetType: "tablet",             amount: 20000,  currency: "ZAR" },
    { assetType: "tv",                 amount: 40000,  currency: "ZAR" },
    { assetType: "desktop",            amount: 35000,  currency: "ZAR" },
    { assetType: "business_equipment", amount: 100000, currency: "ZAR" },
    { assetType: "other_electronics",  amount: 15000,  currency: "ZAR" }
  ],
  billing: {
    provider: null,                    // e.g. "stripe" once integration-architect selects one — NOT assumed here
    externalCustomerId: null,          // PSP-side customer reference, never a card/account number
    externalSubscriptionId: null,      // PSP-side subscription reference
    billingStatus: "not_configured",   // not_configured | active | past_due | canceled
    currency: "ZAR",
    amount: 199.00,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    nextBillingAt: null,
    cancelAt: null
  },
  effectiveDate: ISODate("2026-08-08"),
  renewalDate: null,
  cancelledAt: null,
  legalHold: false,                    // see §7 — blocks purge, mirrors app.account_audit_log.legal_hold
  createdAt: ISODate("2026-08-08"),
  updatedAt: ISODate("2026-08-08")
}
```

**Notes on the two fields this document deliberately does not lock down:**
- **`planTier` is a free-form string, not a schema-enforced enum.** Locking specific tier names (e.g., "basic/standard/premium") into a `$jsonSchema` `enum` would mean this document is silently making `business-analyst`'s Stage 1 pricing/coverage-tier decision. The field exists (something must hold the value, and the Admin Dashboard/mobile app need a value to render), but its permitted value set is explicitly **not** ratified here — that ratification is `business-analyst`'s Stage 1 deliverable, applied as an app-layer (not database-layer) validation once it exists, or promoted to a `$jsonSchema` enum at that point if the tier list is expected to stay stable.
- **`status` vocabulary above is a proposal, following the shape Feature 001 used for `app.account_state`/`app.invitation_status`**, not a ratified state machine. Transition rules (can `suspended` go straight to `cancelled`? does `past_due` auto-transition to `suspended` after N failed billing cycles?) are unspecified — that is `backend-architect` (Stage 7) territory once a PSP exists to drive it, informed by `business-analyst`.
- **`coverageLimits` is an array, not a keyed object**, so it can be `$jsonSchema`-validated as a list of `{assetType, amount, currency}` triples and so a policy can legitimately omit coverage for an asset type it doesn't cover (e.g., a "vehicle-only" plan need not carry a zero-value entry for `tv`).
- **`currency` defaults shown as `"ZAR"`** because Feature 001's compliance review confirmed South Africa/POPIA as the governing jurisdiction — but no product decision has actually ratified ZAR as the platform's billing currency. Shown as illustrative, not asserted.

### 3.2 `policy_status_history`

Append-only, mirroring Feature 001's `app.account_state_transitions` pattern exactly — per this role's Best Practice ("model claims and policy changes as append-only event/history collections, not just mutable current-state documents"). `policies.status` is the fast-read current-state field; this collection is the auditable record of how it got there.

```jsonc
// Collection: policy_status_history
{
  _id: ObjectId,
  policyId: ObjectId,         // real reference — same database, existence-checkable
  accountId: "b3f1c2a4-...",  // denormalized, kept even if the policy or account is later removed/anonymized (§7) — mirrors app.account_audit_log.account_id surviving independently of app.accounts
  fromStatus: "active",       // nullable — the initial status-setting write has no prior state
  toStatus: "past_due",
  reason: "billing_cycle_failed",   // free text / code, not enumerated here — Stage 7's call
  actorAccountId: null,       // soft ref: which admin/system actor caused this, nullable + never overwritten if that actor's own account later changes
  createdAt: ISODate("2026-08-08")
}
```

Never updated or deleted by application code, except by the retention purge job described in §7 once `compliance-specialist` rules a retention period.

### 3.3 `assets` — polymorphic, base shape + type-specific `details`

This is the collection ADR-0001 was written to make comfortable. Root `CLAUDE.md` lists seven registerable categories (vehicles, laptops, phones, tablets, TVs, desktops, business equipment); this role's own mission brief additionally names "other electronics" as an eighth. Reconciled here as one 8-value enum, with "other electronics" retained deliberately as a genuine catch-all — new device categories that don't yet warrant their own `details` shape land there first, rather than blocking on a schema migration.

**Design principle:** a shared base shape (identity, ownership, lifecycle status, valuation, the GPS extension point) plus a `details` sub-document whose shape is dictated by `assetType`. This is the "shared base + type-specific sub-document" pattern the task asked for, not a flat schema with dozens of nullable columns — the exact awkwardness ADR-0001 named PostgreSQL would have here.

```jsonc
// Collection: assets — base shape (every document has these fields)
{
  _id: ObjectId,
  accountId: "b3f1c2a4-...",       // soft reference to Supabase app.accounts.id — see §4
  assetType: "laptop",             // vehicle | laptop | smartphone | tablet | tv | desktop | business_equipment | other_electronics
  displayName: "Work laptop",       // customer-chosen label, not a device attribute
  status: "active",                 // active | inactive | removed — Phase 1 vocabulary only, see note below
  registeredAt: ISODate("2026-08-08"),
  estimatedValue: {                 // current-state valuation, used for coverage-limit checks at registration — NOT an audit trail, see note below
    amount: 28000,
    currency: "ZAR",
    asOf: ISODate("2026-08-08")
  },
  photos: [],                       // array of storage references/URLs, optional
  gpsDeviceId: null,                // GPS-readiness extension point — see §6. Null for every Phase 1 document.
  gpsPairedAt: null,                // companion timestamp, populated only once Phase 2 pairing exists
  legalHold: false,                 // see §7
  details: { /* assetType-specific, see table below */ },
  createdAt: ISODate("2026-08-08"),
  updatedAt: ISODate("2026-08-08")
}
```

**`status` vocabulary is deliberately minimal for Phase 1** (`active` = registered and in normal standing, `inactive` = customer-paused/not currently covered, `removed` = soft-deleted, retained per §7). Theft/loss/recovery states (`flagged_stolen`, `flagged_lost`, `recovered`, etc.) are **not added yet** — that vocabulary belongs to the Phase 2 theft-report/recovery workflow (`08-roadmap.md`), which doesn't exist as a designed feature. Adding it now would be inventing a status machine for a workflow nobody has specified. Extending an enum later is a additive, low-risk schema change; the enum is deliberately left small until there's a real workflow to drive it.

**`estimatedValue` is a mutable current-state field only, not a valuation history, and that is a named gap, not an oversight.** The role mission calls for "point-in-time asset valuation" as a general insurance-domain concern; the honest answer for Phase 1 is that no Claims feature exists yet to consume a valuation *history* (a claim needs "what was this asset worth on the date of loss," which requires more than today's value). Building an `asset_valuation_history` append-only collection now, with no claims workflow to read from it, would be speculative. **Recorded here as the concrete extension point for whenever the Claims domain is designed:** at that point, `estimatedValue` on the asset document becomes "latest known value" and a new `asset_valuation_history` collection (mirroring `policy_status_history`'s shape) becomes the auditable record claims adjudication actually needs. Not built now.

#### `details` shape by asset type

| `assetType` | `details` fields |
|---|---|
| `vehicle` | `make`, `model`, `year`, `vin` (required), `licensePlate`, `color`, `mileage` (optional) |
| `laptop` | `brand`, `model`, `serialNumber` (required), `operatingSystem` (optional) |
| `smartphone` | `brand`, `model`, `imei` (required), `serialNumber` (optional) |
| `tablet` | `brand`, `model`, `serialNumber` (required), `imei` (optional, cellular-capable tablets only) |
| `tv` | `brand`, `model`, `serialNumber` (required), `screenSizeInches` (optional) |
| `desktop` | `brand`, `model`, `serialNumber` (required), `components` (optional free text) |
| `business_equipment` | `category`, `brand`, `model`, `serialNumber` (required), `description` (optional) |
| `other_electronics` | `category`, `brand`, `model`, `serialNumber` (required), `description` (optional) — the deliberate catch-all |

#### `$jsonSchema` validator (illustrative, two branches spelled out in full — the remaining six follow the identical pattern per the table above)

```javascript
db.createCollection("assets", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["accountId", "assetType", "displayName", "status", "registeredAt", "details", "createdAt", "updatedAt"],
      properties: {
        accountId: {
          bsonType: "string",
          description: "Soft reference to Supabase app.accounts.id (UUID string). Not FK-enforced at the database layer — see §4."
        },
        assetType: {
          enum: ["vehicle", "laptop", "smartphone", "tablet", "tv", "desktop", "business_equipment", "other_electronics"]
        },
        displayName: { bsonType: "string", minLength: 1, maxLength: 120 },
        status: { enum: ["active", "inactive", "removed"] },
        registeredAt: { bsonType: "date" },
        estimatedValue: {
          bsonType: ["object", "null"],
          properties: {
            amount: { bsonType: "number", minimum: 0 },
            currency: { bsonType: "string", minLength: 3, maxLength: 3 },
            asOf: { bsonType: "date" }
          }
        },
        photos: { bsonType: "array", items: { bsonType: "string" } },
        gpsDeviceId: { bsonType: ["string", "null"] },
        gpsPairedAt: { bsonType: ["date", "null"] },
        legalHold: { bsonType: "bool" },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
        details: { bsonType: "object" }
      },
      oneOf: [
        {
          properties: {
            assetType: { enum: ["vehicle"] },
            details: {
              bsonType: "object",
              required: ["make", "model", "year", "vin"],
              properties: {
                make: { bsonType: "string" },
                model: { bsonType: "string" },
                year: { bsonType: "int" },
                vin: { bsonType: "string" },
                licensePlate: { bsonType: ["string", "null"] },
                color: { bsonType: ["string", "null"] },
                mileage: { bsonType: ["int", "null"] }
              },
              additionalProperties: false
            }
          }
        },
        {
          properties: {
            assetType: { enum: ["laptop"] },
            details: {
              bsonType: "object",
              required: ["brand", "model", "serialNumber"],
              properties: {
                brand: { bsonType: "string" },
                model: { bsonType: "string" },
                serialNumber: { bsonType: "string" },
                operatingSystem: { bsonType: ["string", "null"] }
              },
              additionalProperties: false
            }
          }
        }
        // smartphone, tablet, tv, desktop, business_equipment, other_electronics follow
        // the identical { properties: { assetType: {enum:[...]}, details: {...} } } pattern
        // per the table above — not fully enumerated here to keep this document reviewable;
        // this is an implementation artifact for backend-engineer at Stage 9, not a design gap.
      ]
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
```

**`validationLevel: "strict"` / `validationAction: "error"` from day one** (not the conservative `"warn"` Feature 001 might have chosen for a live migration) — this is greenfield, no existing documents, so there is no legacy-data conformance risk strict validation would break. Applying relational discipline "from the first document written" is cheaper than retrofitting it once real registrations exist, consistent with ADR-0001's instruction that `database-architect` "should still apply relational discipline... rather than treating 'document store' as 'no schema.'"

---

## 4. Cross-store reference pattern: `accountId`

Mirrors ADR-0002 and Feature 001's `database-design.md` exactly — this document does not reinvent it.

- Every `policies` and `assets` document carries `accountId`, a string holding the Supabase `app.accounts.id` UUID. This is a **soft reference, not a foreign key** — MongoDB has no visibility into Supabase, and Postgres has no visibility into MongoDB.
- **Referential integrity is the backend's job**, per ADR-0002's explicit ruling. Concretely, for this domain: before creating a `policies` or `assets` document, the backend must validate that the referenced `accountId` exists and is in a state that permits the write (e.g., not `deactivated`). **Feature 001 already built the primitive this domain should reuse rather than reinvent:** `GET /internal/accounts/{id}/status` (per `001-authentication/api-design.md`, backed by `app.account_status_cache`) already returns `accountState` and `mfaRequired`, and `security-review.md` §5.3 (SR-9) already recommends adding `userType`/`partnerOrganizationId` to that same response. **This document adds a recommendation to that same list, not a new mechanism:** whatever service owns Policy/Asset writes should call that existing internal endpoint to confirm `accountState == 'active'` before creating a policy or asset, exactly as Feature 001's own account-status-cache was built to make cheap. No new cross-service primitive needs to be invented for this feature.
- No client (mobile app, Admin Dashboard) ever supplies `accountId` directly on a request that creates or reads its own data — it is always derived server-side from the authenticated bearer token's `sub` claim, exactly as `003-mobile-app-foundation/architecture.md` §5.2 already insists on for the not-yet-built policy/asset endpoints ("scoped implicitly from the bearer token's `account_id`... this document would push back on [a client-supplied identifier] as reopening an authorization hole the auth API already closed"). This document concurs and treats it as a hard requirement for Stage 7, not a suggestion.
- `accountId` is **never** used as the sole authorization check for admin/support/security-company-operator access to a customer's data — that access pattern needs its own authorization design (role check + audit log entry per `06-security-standards.md`'s "audit logging required for... access to another user's data by an admin/support/security-company operator") at Stage 7, not invented here.

---

## 5. Indexing strategy, mapped to actual query patterns

Per this role's Best Practice against speculative indexing, every index below is tied to a named, real query path from either `08-roadmap.md`'s Phase 1 scope or `003-mobile-app-foundation/architecture.md` §5 — not spec'd generically.

| Collection | Index | Query pattern it serves |
|---|---|---|
| `policies` | `{ accountId: 1, status: 1 }` | The single hottest path on this collection: "my current policy" (Customer Mobile App's not-yet-built `GET /policy`, per `003-mobile-app-foundation/architecture.md` §5) and "policies for this customer" (Admin Dashboard customer-detail view). |
| `policies` | `{ status: 1, createdAt: -1 }` | Admin ops triage view — "policies by status" (e.g., all `past_due` or `cancelled` policies), the Policy-domain analogue of the role's named hot path "claims by status." Justified by the explicit Phase 1 roadmap line "Admin Dashboard: view customers, policies, assets," which implies filtering/listing, not just per-customer lookup. |
| `policies` | `{ "billing.externalSubscriptionId": 1 }`, sparse | **Forward-readiness, not a current query.** Once a PSP is selected, webhook reconciliation ("which policy does this Stripe/PayFast/etc. event belong to") needs this lookup. Sparse because the field is `null` on every Phase 1 document — near-zero cost until it's populated, avoiding a later migration to add the index once billing is wired up. |
| `policies` | primary key `_id` | FK-shaped joins from `policy_status_history.policyId`, direct lookups. |
| **Deliberately not indexed:** `policies.planTier` | — | No confirmed query filters/lists by tier yet — that's a reporting/underwriting concern (`08-roadmap.md` Phase 3) that will define its own index need against its own query plan when it exists, not before. |
| `policy_status_history` | `{ policyId: 1, createdAt: -1 }` | "History for this policy" — admin policy-detail view, descending on the range column to match "most recent first," mirroring Feature 001's identical choice for `app.account_state_transitions`. |
| `policy_status_history` | `{ accountId: 1, createdAt: -1 }` | "Recent policy changes for this account" across all of a customer's policies — audit reconstruction, mirrors `app.account_state_transitions`' actor-side/subject-side split logic. |
| `assets` | `{ accountId: 1, status: 1, createdAt: -1 }` | The single hottest path on this collection: "my registered assets" (Customer Mobile App's not-yet-built `GET /assets` list, per `003-mobile-app-foundation/architecture.md` §5) and "this customer's assets" (Admin Dashboard). Composite, descending on the range field, matches "most recently registered first" — the natural default sort for a list view. |
| `assets` | `{ gpsDeviceId: 1 }`, unique, partial (`WHERE gpsDeviceId IS NOT NULL`) | **Forward-readiness for §6, not a current query** — enforces "one GPS device pairs to at most one asset" the moment Phase 2 pairing exists, without a schema/index migration at that point. Partial because every Phase 1 document has `gpsDeviceId: null`; a non-partial unique index would be pointless (every doc would collide on `null` under most drivers' interpretation) and a needless write-path cost today. |
| `assets` | primary key `_id` | Direct lookups (asset detail view), and the anchor for the future `location_history` reference in §6. |
| **Deliberately not indexed:** `assets.assetType` standalone | — | No confirmed Phase 1 query lists/filters assets fleet-wide by type — that is a reporting-dashboard concern (`08-roadmap.md` Phase 3, `reporting-engineer`/`analytics-specialist`) that will define its own index need when it exists. Adding it now would be exactly the speculative, write-cost-without-proven-read-benefit indexing this role's Best Practices warn against. |
| **Deliberately not indexed:** any text/search index on `details.serialNumber`, `details.vin`, etc. | — | No confirmed "search my assets by serial number" feature exists in any Stage 1–4 artifact for this domain (there are none — §0). Flag to `ui-designer`/`business-analyst` if such a feature is scoped; not built speculatively. |

**Note on the Admin Dashboard's "view customers" scope item:** that query is served entirely by Feature 001's Supabase-side identity data (`app.accounts`), not by anything in this document. This document's collections are joined to that data only via `accountId` at the application layer — there is no MongoDB index that could serve a "list customers" query, because customer identity doesn't live in MongoDB at all, per ADR-0002.

---

## 6. GPS-readiness without GPS scope-creep

Root `CLAUDE.md`: "Registered assets can carry GPS tracking hardware; the platform ingests location data..." This is Phase 2 scope per `08-roadmap.md`, and this document does not design that ingestion pipeline, its collection(s), TTL/retention policy, or rollup strategy — doing so now would be building ahead of a domain that has no Stage 1 requirements, no volume/shape data from `gps-integration-engineer`, and no hardware vendor selected (ADR-0001 names the GPS vendor as an open decision).

**What this document does provide — the low-friction extension point the task asked for:**

1. **`assets.gpsDeviceId` (nullable string) and `assets.gpsPairedAt` (nullable date)** already exist on every asset document (§3.3), populated `null` for every Phase 1 record. Pairing an asset to a GPS device, whenever that feature is built, is an *update* to an existing document (`gpsDeviceId: "<vendor-device-id>"`, `gpsPairedAt: now()`), not a schema migration.
2. **The sparse unique index `{ gpsDeviceId: 1 }`** (§5) is already in place, so "one device, one asset" is enforced from the moment pairing ships, without a second migration to add the constraint after the fact.
3. **The anticipated future collection — named, not designed:** a `location_events` (or equivalent) collection, referencing `assetId` (a real, same-database reference at that point, unlike `accountId`), will hold raw GPS pings. When that feature is scoped, its owner (`database-architect`, in partnership with `gps-integration-engineer` per that role's mission) should evaluate MongoDB time-series collections and/or a TTL index on raw pings plus a rollup/aggregation strategy for historical reporting, per this role's own stated best practices — flagged here as the recognized shape of that future problem, not solved now. The indexing shape that collection will need (`{ deviceId: 1, timestamp: -1 }` or a native time-series collection keyed similarly) is named here only so the eventual design isn't starting from zero, not committed to.
4. **Nothing in §3.3's `$jsonSchema` validator would need to change** to add GPS pairing — the fields already exist and are already typed. This is the concrete sense in which this schema "doesn't paint itself into a corner," mirroring the phrase `003-mobile-app-foundation/architecture.md` used for its own state-management decision.

---

## 7. Retention and deletion

**The lesson this section applies, stated up front:** `security-review.md` §7 found that Feature 001's Postgres `on delete cascade` chain (`auth.users` → `app.accounts` → `app.account_state_transitions`/`app.sessions`) means a single Supabase-side user deletion silently destroys the entire state-transition and session history for that account, "with no platform code invoked and no audit event written." That finding is the concrete evidence behind this task's instruction that "vendor-triggered cascade is dangerous." The MongoDB-side translation of that lesson is not about a database-level cascade (MongoDB has no cross-collection cascading deletes analogous to Postgres FKs, and certainly nothing that could span into Supabase) — it is about **not building the application-level equivalent**: a naive `on accountDeleted { db.policies.deleteMany({accountId}); db.assets.deleteMany({accountId}); }` handler would reproduce exactly the same failure mode purely in backend code, destroying policy/claim-adjacent history that insurance recordkeeping obligations likely require retaining, with the same "no audit trail of the destruction" problem.

**Decision, mirroring Feature 001's FU-03 direction (anonymize-in-place preferred over hard delete for a completed record):**

- **On account deactivation/deletion (signaled by the backend observing the account's Supabase-side state change — there is no automatic cross-store trigger, per ADR-0002):** `policies` and `assets` documents for that `accountId` are **not deleted**. `assets.status` moves to `removed`; `policies.status` moves to `cancelled` (if not already terminal), each producing a normal `policy_status_history` entry with `reason: "account_deactivated"` — the transition is recorded through the same append-only mechanism as any other status change, not a special-cased silent update.
- **`legalHold: boolean`** exists on both `policies` and `assets` (default `false`), mirroring `app.account_audit_log.legal_hold` exactly. Any policy or asset connected to an open or disputed claim (once the Claims domain exists) must be flagged `legalHold: true` before any purge job — not designed here, but the field exists now so it is not a retrofit later.
- **No MongoDB TTL index is used on `policies`, `policy_status_history`, or `assets`.** TTL indexes delete unconditionally on expiry with no way to honor a `legalHold` exception — exactly the "vendor/mechanism-triggered, not backend-mediated" deletion shape this section is arguing against. If and when a genuine hard-delete-after-retention-period requirement is ruled by `compliance-specialist`, it should be implemented as an explicit, scheduled purge job that checks `legalHold` first — mirroring Feature 001's `app.purge_expired_audit_log()` / `app.retention_purge_runs` pattern exactly (a `purgeExpiredPolicyRecords()` job writing its own run record) — not a database-level TTL index. **TTL indexes remain the right tool for the future raw-GPS-ping collection named in §6**, where no individual record carries this kind of long-term evidentiary weight and unconditional expiry is the actual intent — the distinction matters and this document is deliberate about drawing it.
- **`policy_status_history` rows are never deleted or updated when the policy/account is anonymized** — `accountId` on the history row is denormalized specifically so it survives independently, exactly mirroring `app.account_audit_log.account_id`'s design rationale in Feature 001 ("an account being anonymized/deleted must not silently delete its own audit history").
- **What this document does NOT decide, and flags as genuinely open:**
  - **The actual retention period** for a cancelled/anonymized policy's records, and for `policy_status_history` rows. Feature 001 left the equivalent question (`app.account_state_transitions` retention, FU-04) open pending `compliance-specialist` — this document leaves the same class of question open here, for the same reason: insurance recordkeeping obligations (how long must a lapsed policy's coverage history be provable?) are a regulatory question this role has no authority to answer, not a technical one.
  - **Whether "anonymize" for a policy/asset document means redacting any field at all.** Unlike `app.accounts`, these collections hold comparatively little direct customer PII beyond the `accountId` linkage itself and (for vehicles) a VIN/license plate, which is more "asset identifying data" than "customer identifying data." Whether POPIA's deletion-request obligations reach these fields the same way they reach `app.accounts.email`/`phone` is `compliance-specialist`'s determination, not assumed favorably or unfavorably here.
  - **Whether a future claim record's evidentiary requirements override a customer's deletion request entirely** (i.e., a policy a paid claim was based on may need to survive regardless of any anonymization mechanism) — flagged as a real tension for `compliance-specialist` to resolve when the Claims domain is designed, not resolved here.

---

## 8. What this document is explicitly NOT deciding

Stated plainly so nothing here is mistaken for a ratified decision outside this role's authority:

1. **Payment/billing mechanics and PSP selection.** `billing` (§3.1) is a shape for referencing an eventual gateway's own state — `integration-architect`/a future `payment-engineer` own which gateway, how webhooks are verified, and the actual reconciliation logic. Per `06-security-standards.md`, raw card data must never reach this database — `billing.externalCustomerId`/`externalSubscriptionId` are tokens/references only, exactly the PCI-scope-minimization pattern this role's Best Practices already commit to ("never store raw payment card data in MongoDB — reference tokens from the payment gateway only").
2. **The REST API contract.** `backend-architect`'s Stage 7, next in the chain. This document names the query patterns the API will need to serve (§5) and the authorization posture it must enforce (§4) but does not define endpoints, request/response shapes, or pagination — Feature 001's `api-design.md` already set platform-wide conventions (cursor pagination, shared error envelope, `/api/v1` prefix) this domain's API should extend, not reinvent, per `003-mobile-app-foundation/architecture.md` §5.2's own recommendation.
3. **Full business rules for coverage tiers, pricing, and eligibility.** Named repeatedly (§0, §3.1) as the real Stage 1 gap — `business-analyst`'s deliverable, not filled in here with an invented rule.
4. **Field-level encryption / sensitive-field review.** This document's own inventory: neither `policies` nor `assets` holds payment card data, government ID documents, or (yet) precise GPS coordinates — the fields most likely to need field-level encryption per `06-security-standards.md`. A VIN and a device serial number are not payment/ID-document-grade sensitive fields, but this document does not self-certify that judgment — `cybersecurity-architect`/`security-engineer` should review this field inventory before Stage 8, consistent with this role's own Pre-Approval Checklist. This re-triggers immediately and materially the moment the future GPS-ping collection (§6) or a Claims domain introduces precise location history or ID-document fields — both are named in `06-security-standards.md` as requiring exactly this evaluation.
5. **Claims collection design.** Out of scope per §1 — a distinct future feature.
6. **MongoDB cluster topology, sharding, and Atlas tier.** Per this role's charter, that's `cloud-infrastructure-architect`'s call. Nothing in this document's Phase 1 volume (customer/policy/asset counts in the "zero to first thousands of customers" range per `08-roadmap.md`'s org-scaling table) suggests sharding is needed yet; this is named as a non-decision, not a claim that a single replica set will always suffice once GPS ping volume (Phase 2) arrives.

---

## 9. Migration and versioning notes

Greenfield — no existing `policies` or `assets` data anywhere, so every item below is additive, matching Feature 001's `database-design.md` §7 posture ("no destructive operations... fresh project").

Ordered creation list:
1. `create_policies_collection` — §3.1 shape, no validator yet (validators are added in a separate step so DDL and validation posture are independently reviewable, mirroring Feature 001's RLS-migration separation rationale).
2. `create_policy_status_history_collection` — §3.2.
3. `create_assets_collection` — §3.3 base shape.
4. `apply_assets_jsonschema_validator` — the `$jsonSchema` validator from §3.3, `validationAction: "error"` from creation (justified in §3.3 — no legacy-data risk).
5. `create_policies_indexes` — the three secondary indexes from §5.
6. `create_policy_status_history_indexes` — the two indexes from §5.
7. `create_assets_indexes` — the composite index and the sparse unique `gpsDeviceId` index from §5.

**Schema evolution for new asset types (a named, expected future need, not a hypothetical):** adding a ninth `assetType` value is additive — extend the `enum` in the `$jsonSchema` validator and add one more `oneOf` branch for its `details` shape. This does not require touching any existing document, and is the concrete payoff of the polymorphic design ADR-0001 argued for. **This is different from, and cheaper than, adding a column to a hypothetical flat relational schema would have been** — worth stating plainly since it's the exact tradeoff ADR-0001 predicted.

---

## 10. Open items tracker

| ID | Item | Owner | Blocks | Status |
|---|---|---|---|---|
| **P-01** | Stage 1 business requirements for Policy/Subscription/Asset domain (plan tiers, coverage rules, eligibility). | `business-analyst` → `product-manager` | Ratifying `policies.planTier`/`status` vocabularies as schema-enforced enums instead of free-form placeholders | **Partially discharged (Phase 1)** — minimum Stage 1 at [`business-requirements.md`](./business-requirements.md); D-01–D-04 deferred |
| **P-02** | Stage 7 API contract for policy/asset read (and, later, write) endpoints. | `backend-architect` | Admin Dashboard policy/asset views; formal Stage 7 sign-off | **Customer endpoints implemented** — admin paths still open (MP-1) |
| **P-03** | Extend `GET /internal/accounts/{id}/status` (or equivalent) to be callable by the Policy/Asset service for pre-write account-existence/state checks, per §4. | `backend-architect` (this is additive to the item `security-review.md` SR-9 already flagged) | Referential-integrity enforcement for `policies`/`assets` writes | Proposed here, not yet actioned |
| **P-04** | Retention period ruling for cancelled policies, removed assets, and `policy_status_history`. | `compliance-specialist` | Any purge-job implementation under §7 | Open, mirrors Feature 001's FU-04 pattern |
| **P-05** | Confirm whether POPIA deletion-request obligations reach `policies`/`assets` fields beyond the `accountId` linkage. | `compliance-specialist` | Finalizing what "anonymize" means for these two collections (§7) | Open |
| **P-06** | Field-sensitivity review of the schemas in this document. | `cybersecurity-architect` / `security-engineer` | Formal Stage 8 `security-review.md` verdict | **Phase 1 stub filed** — [`field-sensitivity-review.md`](./field-sensitivity-review.md) (P-14); no FLE for VIN/serial/`estimatedValue` in Phase 1 |
| **P-07** | Design the future `location_events` collection, TTL/retention, and rollup strategy — explicitly NOT this document's job (§6). | `database-architect` + `gps-integration-engineer` | Phase 2 GPS ingestion | Named, deferred to Phase 2 planning |
| **P-08** | Lightweight Stage 3/4 UX/UI pass on "select a plan" and "register an asset" flows. | `ux-researcher` + `ui-designer` | Finalizing whether the Admin Dashboard/mobile app need any fields this document didn't anticipate | Not started |
| **P-09** | PSP selection, which determines the real shape of `billing.provider`/webhook handling. | `integration-architect` | Any real billing-state write path | Open (ADR-0001's named open decision) |

---

## 11. Pre-Approval Checklist (`database-architect` self-review)

- [x] **Schema change reviewed for embed-vs-reference correctness given the relationship's read/write pattern.** `coverageLimits` and `billing` embedded in `policies` (read together, low-write, no independent lifecycle — §2); `assets.details` embedded and polymorphic (§3.3); `policy_status_history` kept as a separate append-only referenced collection, not embedded in `policies`, so its own retention policy can diverge from the policy document's (mirrors Feature 001's identical reasoning for keeping `app.account_state_transitions` separate from `app.account_audit_log`). `assets` deliberately does **not** embed or reference `policyId` — resolved via `accountId` at query time instead, avoiding a sync-on-policy-change problem for a fact that's already a single indexed lookup away (§5).
- [x] **Indexing strategy validated against actual hot query paths, not speculative.** §5, with explicit "deliberately not indexed" callouts for `planTier`, standalone `assetType`, and any search index — each named as a future reporting/search concern with its own owner, not indexed on spec.
- [x] **GPS/location-history growth accounted for with a retention or rollup plan.** Not built (correctly out of scope per §1/§6), but the extension point (`gpsDeviceId`, sparse unique index) exists now precisely so the future design has somewhere to attach without a migration, and §6 names the TTL/rollup shape that future design will need to evaluate.
- [ ] **Sensitive fields (payment refs, ID documents) reviewed with `cybersecurity-architect` for encryption/access-control needs.** Left unchecked deliberately — this document's own field inventory (§8.4) finds no payment/ID-document-grade field today, but self-certification isn't a substitute for the actual review, which has not happened.
- [x] **Claim/policy/payment-adjacent changes preserve auditable history, not just current state.** `policy_status_history` is append-only and mirrors Feature 001's audit-trail pattern exactly; `policies`/`assets` current-state documents are never the sole record of a status change.
- [ ] **Data-retention policy aligns with `compliance-specialist`'s regulatory guidance.** Mechanism designed (§7 — `legalHold`, no TTL on transactional collections, explicit purge-job shape mirroring Feature 001's); the actual retention *period* is open (P-04), exactly as Feature 001 left FU-04 open at the equivalent stage.
- [ ] **Capacity impact on the MongoDB cluster reviewed with `cloud-infrastructure-architect`.** Not yet done — flagged in §8.6 as a non-decision, not assumed fine. Phase 1 volume is unlikely to be a real concern; not verified here.
- [x] **Migration path for existing data specified for any breaking schema change.** N/A for this document — greenfield (§9). The forward story for *future* additive changes (new asset types) is specified in §9 precisely because it's a certainty, not a hypothetical.

**Net:** five of eight satisfied; three left unchecked and explained, consistent with how Feature 001's own Stage 6 document scored itself — this document does not claim a review happened that didn't.

---

## 12. Sign-off status for Stage 6 exit

**Not a normal Stage 6 exit**, because — per §0 — there is no ratified Stage 5 architecture-review gate for this domain to exit from, unlike Feature 001. What this document *does* claim: it is a structurally sound, decision-complete-where-this-role-has-authority technical foundation, honest about every business-rule gap, ready to hand to `backend-architect` for Stage 7 API contract work (discharging the `database-architect` link of `003-mobile-app-foundation/architecture.md`'s M-05 chain). It should not be treated as fully approved until: `solution-architect` has had a chance to review it against cross-domain concerns (even retroactively, given Stage 5 didn't formally run — recommended, not yet scheduled), `business-analyst`'s Stage 1 work exists to confirm or correct the placeholder vocabularies in §3.1/§3.3, and the open items in §10 have named next steps actioned, not just recorded.
