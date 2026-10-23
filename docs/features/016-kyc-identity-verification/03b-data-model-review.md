# Feature 016 — Stage 5 Architecture Review: Data-Model Angle

**Lifecycle stage:** 5 — Architecture Review (data-model contribution; filed alongside, not in
place of, `solution-architect`/`backend-architect`/`cybersecurity-architect`'s own Stage 5
artifact(s) for this feature — check this folder for their filename before assuming this is the
only Stage 5 document)
**Role filing this:** `database-architect`
**Date:** 2026-10-23
**Scope:** Track A (Tier 1 gating, no CT-1/CT-15/CT-16 dependency) and Track B (Tier 2
peppered-HMAC storage **design only** — not implemented, not activated), per
`02-stage-2-kickoff-sprint-plan.md` §3.
**Reads relied on:** `02-stage-2-kickoff-sprint-plan.md` (this feature), `product-scope-decision.md`
(this feature), `docs/features/013-sa-id-verification/compliance-review-kyc-identity-documents.md`
(`compliance-specialist`, esp. §5.3, §6.2, §8 C-013-7/C-013-8), `docs/organization/10-data-protection-contract-obligations.md`
§14.1 (CT-15, CT-16), `backend/src/lib/customer-profile-validation.ts`,
`backend/src/db/customer-profile-collections.ts`, `backend/src/routes/admin-verification.ts`,
`backend/src/lib/plan-enforcement.ts` (existing gate precedent: `ASSET_LIMIT_REACHED`).

---

## 0. Hard constraint this review is bound by

**No schema or design in this document stores the full SA ID number, nor an actual
peppered-HMAC key/value, until CT-1, CT-15, and CT-16 (`docs/organization/10-data-protection-contract-obligations.md`
§9–§10, §14.1) close.** `customer-profile-validation.ts`'s existing 4-digit `idNumber` truncation
(CT-11) is **not** widened by anything below. Where Track B's design necessarily describes a field
shape that would hold a full-number-derived value, it is marked **dormant/unused** and annotated
with the CT-1/CT-15/CT-16 citation, exactly as instructed — this is a design artifact for a field
that does not exist in any environment yet.

---

## 1. Track A — Tier 1 gating: no new schema, confirmed

**Finding: Track A requires zero new MongoDB collections, zero new fields, and zero new indexes.**

`customer_profiles` (`backend/src/db/customer-profile-collections.ts`) already carries
`verificationStatus` as a required enum (`not_started | in_progress | pending_review | verified |
rejected | action_required`), already has the compound index
`customer_profiles_verificationStatus_verificationSubmittedAt_id` serving the admin
list/count queries, and already has a unique index on `accountId`. The gate this feature adds
(`KYC_VERIFICATION_REQUIRED` at asset creation, per FR-5/FR-6) is a **read-and-branch** against a
field that already exists in an already-indexed shape — it is not a storage problem.

### 1.1 Where the gate reads from, and why no join is needed

The existing `assertAssetRegistrationAllowed()` pattern (`backend/src/lib/plan-enforcement.ts`) is
the precedent to extend, not replace: it is a pure function taking `ctx` and `accountId`, doing a
targeted lookup (there: `policies` + `planCatalog` + `assets.countActiveByAccount`), and throwing a
typed `apiError`. The KYC gate follows the identical shape:

```
assertCustomerVerified(ctx: Pick<AppContext, 'customerProfiles'>, accountId: string): Promise<void>
  -> ctx.customerProfiles.findByAccountId(accountId)
  -> if profile?.verificationStatus !== 'verified': throw apiError('KYC_VERIFICATION_REQUIRED')
```

This is a single-document lookup by `accountId` against the collection's existing unique index
(`customer_profiles_accountId_unique`) — O(1), no COLLSCAN, no new index required. There is no
reason to denormalize `verificationStatus` onto the `assets` or `policies` documents: the lookup is
already cheap, and duplicating mutable verification state onto every asset document would create an
update-fan-out problem (every verification-status change would need to touch N asset documents)
for no read-side benefit. **Recommendation: do not embed, reference by `accountId` lookup, as
above.**

### 1.2 Interaction with the existing plan-limit gate

`assertAssetRegistrationAllowed` and `assertCustomerVerified` are independent checks against
independent fields (`policies`/`planCatalog`/`assets` vs. `customer_profiles`) and should be called
sequentially, not merged into one query — they fail for different reasons and the error codes
(`ASSET_LIMIT_REACHED` vs. `KYC_VERIFICATION_REQUIRED`) need to stay distinguishable to the client.
`backend-architect` owns call-order at Stage 7; no data-model objection to either order.

### 1.3 Claims-filing gate — pre-specified, not built (per `product-scope-decision.md` §2)

Same pattern applies in advance: whenever a claims backend exists, its gate check is a
`customerProfiles.findByAccountId(accountId)` lookup against the same field, no new collection
required on the KYC side. Not building this now; noting it so a future claims-schema review does
not reinvent the lookup shape.

### 1.4 Audit trail — no change needed, flag a related observation

`admin-verification.ts`'s review-decision path already writes a `privileged_data_access` audit-log
entry on every status transition (`reviewVerification` → `syncAccountAlerts` → audit record). Track
A's new *gate-denial* event (a customer blocked from registering an asset) is a product/UX event,
not a privileged-data-access event — no audit-log schema change is proposed for it. If
`backend-architect`/`cybersecurity-architect` want gate-denial frequency surfaced for fraud/abuse
monitoring later, that is an analytics/metrics concern, not a new Mongo collection, and should not
be bundled into this review by default.

**Track A data-model verdict: no Stage 6 schema work required beyond confirming the above at Stage
6 sign-off. Proceed to Stage 7 API design on the existing `customer_profiles` shape.**

---

## 2. Track B — Tier 2 peppered-HMAC storage: design shape only, dormant until CT-1/CT-15/CT-16 close

This section designs **what the field would look like**, per the task brief. It does not create a
migration, does not touch `customerProfilesJsonSchemaValidator`, and nothing in it should be
implemented against a real schema file until the gate below lifts.

### 2.1 Why this is a new field on `customer_profiles`, not a new collection

Per `compliance-review-kyc-identity-documents.md` §6.2 (Option A, approved in principle,
conditional) and §8 (C-013-7, C-013-8), Tier 2's only legitimate purpose is **duplicate detection**
— "has this SA ID number already been registered under a different account" — not storage of the
number itself, and not a general-purpose identity record. A duplicate-detection key is 1:1 with the
customer profile it was derived from, has no independent lifecycle (it lives and dies with the
profile, same as `idNumberLast4` today per the compliance retention ruling at §4 of that review),
and is queried by exact-match lookup only (never a range, never a partial match — partial match
against an HMAC is meaningless). All three of those properties argue for a field **on**
`customer_profiles`, co-located with `idNumberLast4`, not a sibling collection.

### 2.2 Proposed (dormant) field shape

```jsonc
// customer_profiles — Tier 2 field, DORMANT. Added to the JSON-schema validator and to
// CustomerProfile types ONLY once CT-1, CT-15, CT-16 (docs/organization/10-data-protection-
// contract-obligations.md §9-10, §14.1) all close. Until then this field must not appear in
// customerProfilesJsonSchemaValidator, must not be written by any code path, and any PR adding
// it must cite CT-1/CT-15/CT-16 in the same comment style as customer-profile-validation.ts's
// existing CT-11 comment ("Do not widen this back to a 13-digit regex").
idNumberHmac: {
  bsonType: ['string', 'null'],   // base64 or hex HMAC-SHA256 digest, fixed length, NOT a free-text field
  description: 'Peppered HMAC-SHA256 of the full 13-digit SA ID number. Pepper is server-held ' +
    'in a managed secret store (never client-shipped). This field is PERSONAL INFORMATION, not ' +
    'an anonymised value (compliance-review-kyc-identity-documents.md §5.3: the SA ID keyspace ' +
    'collapses to ~10^8-10^9 candidates, ~20,000 once DOB is known). DORMANT until CT-1/CT-15/CT-16 close.'
}
```

Companion index (also dormant — not created until the field is live):

```jsonc
{
  key: { idNumberHmac: 1 },
  name: 'customer_profiles_idNumberHmac_duplicate_lookup',
  // Sparse, not unique-enforced at the DB layer: duplicate DETECTION is an application-level
  // decision (flag for admin review per admin-verification.ts's existing review queue), not a
  // hard uniqueness constraint — a legitimate case (e.g. a corrected/reissued record) must not
  // throw a database-level duplicate-key error. Sparse because idNumberHmac is null for every
  // profile until Tier 2 activates and for every profile that never submits Tier 2 verification.
  sparse: true,
}
```

**Why sparse, not unique:** a unique index on an HMAC field would turn any application-level
decision about what to do with a detected duplicate (flag for manual review, per the existing
`pending_review` admin queue — see `compliance-review-kyc-identity-documents.md` §6.2's Option C
interim position of compare-at-review-time) into a hard database-level rejection with a generic
duplicate-key error, which is both a worse failure mode for the customer and a leak vector (a
unique-constraint violation on this field is itself a side-channel disclosure that "someone else
has this ID number"). Detection stays an explicit application-level query
(`findOne({ idNumberHmac })`) surfaced into the existing admin review path, not a DB-enforced
constraint.

### 2.3 Key-management shape (design only — joint with `cybersecurity-architect`)

Per C-013-8: the pepper is a single server-held secret (managed secret store, e.g. the platform's
existing secrets mechanism on Render — `cloud-infrastructure-architect`'s call on exact
storage), never persisted alongside the data it derives, never logged, never shipped to any
client. This review's only data-model-specific addition to C-013-8: **rotation must be designed as
a dual-read window, not a flag flip**, because rotating the pepper invalidates every previously
stored `idNumberHmac` value simultaneously (compliance review §5.3's own observation). A rotation
needs either (a) a `idNumberHmacKeyVersion` companion field recording which pepper version produced
each stored digest, so duplicate lookups can be scoped to "compare within the same key version" and
a migration can re-derive old digests under the new pepper over time, or (b) an accepted one-time
loss of duplicate-detection continuity across the rotation boundary. **This review recommends (a)**
if Tier 2 ever activates, since (b) silently defeats the feature's purpose for every profile created
before the rotation. Recording this now so it is not discovered mid-incident, per C-013-8's own
instruction — not building it.

```jsonc
// Also dormant, same gate as idNumberHmac above.
idNumberHmacKeyVersion: { bsonType: ['int', 'null'] }
```

### 2.4 What is explicitly NOT designed here

- No field for the full ID number at rest in any form (reversible or otherwise) — refused per
  compliance review §6.2 Option B ("REFUSED for Tier 2's purpose").
- No document/image storage shape — out of scope for this feature per `product-scope-decision.md`
  §2, and blocked separately on MP-5 (no object-storage vendor).
- No cross-collection "identity" entity distinct from `customer_profiles` — not justified by
  anything in scope today; would be scope creep per the kickoff doc's own warning.

### 2.5 Stage 6 gate for Track B

**This design does not clear Stage 6 "implemented."** It clears Stage 6 "reviewed and shaped,
build deferred." The concrete JSON-schema validator edit, the index creation, and the repository
method (`findByIdNumberHmac`) are Stage 9 Development deliverables that must not be merged with the
field live in `customerProfilesJsonSchemaValidator` — they merge dark, behind the same flag
mechanism `02-stage-2-kickoff-sprint-plan.md` §2.2 specifies, with the field's own code comment
(shown in §2.2 above) satisfying that section's "code comments at every implementation point"
requirement for the data-model layer specifically.

---

## 3. Capacity note (for `cloud-infrastructure-architect`, informational only)

Both tracks add negligible load: Track A is a single indexed point-read added to an existing
request path (asset creation), already well within `customer_profiles`' existing read volume.
Track B, if/when activated, adds one additional indexed point-read (duplicate lookup) and one write
(the HMAC field) to the existing profile-submission write path — not a new write-heavy surface, and
nothing resembling GPS-ping volume. No cluster-sizing conversation is triggered by this feature.

---

## 4. Summary for Stage 6 sign-off checklist

| Item | Track A | Track B |
|---|---|---|
| New collection? | No | No (field on existing `customer_profiles`) |
| New field? | No | Yes — `idNumberHmac`, `idNumberHmacKeyVersion` — **dormant, not implemented** |
| New index? | No | Yes — sparse, non-unique, on `idNumberHmac` — **dormant, not created** |
| Embed vs. reference | Reference (`accountId` lookup) — no denormalization | N/A (co-located field, not a relationship) |
| Full ID number stored anywhere? | No | No — never, by design (Option B refused) |
| Live peppered-HMAC value stored? | No | No — dormant until CT-1/CT-15/CT-16 close |
| Blocks on | Nothing — proceeds to Stage 7 | CT-1, CT-15, CT-16 (write path); design may proceed now |

**Filed by:** `database-architect`, 2026-10-23.
**Does not discharge:** CT-1, CT-15, CT-16, C-013-7, C-013-8 — tracked at
`docs/organization/10-data-protection-contract-obligations.md` and
`docs/features/013-sa-id-verification/compliance-review-kyc-identity-documents.md` §8, not
duplicated here.
