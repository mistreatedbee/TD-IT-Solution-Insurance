# Subscription Tier Strategy — Starter / Professional / Enterprise

**Owner:** `product-manager` · **Status:** Proposed — pricing amounts and seed-data changes need
platform-owner sign-off before any admin edits the live catalog · **Last reviewed:** 2026-08-28

**Purpose:** define a subscription tier structure clear and differentiated enough to actually
drive upgrades ("bring the juices in"), grounded in what Feature 006's plan catalog already is,
what's actually enforced in code today, and what this platform can honestly sell given current
build state and contract TDIT-2026-09's funding boundaries.

**Relationship to existing docs:** does not replace or duplicate Feature 006. Feature 006
(`docs/features/006-customer-onboarding/`) covers onboarding UX, not tier design — there is no
prior PRD defining tier content. The actual tier *data model* already exists in
`backend/src/repositories/plan-catalog.ts` / `backend/src/routes/plans.ts` /
`backend/src/routes/admin-plans.ts`. This document is the product strategy that data model should
be edited to reflect — via the existing admin PATCH endpoint, not a rebuild.

---

## 1. What already exists — read before assuming a rebuild is needed

- **Live data model** (`insurance_plan_catalog` Mongo collection): `slug`, `name`, `tagline`,
  `maxAssets`, `monthlyAmountCents`, `currency`, `isCustomPricing`, `isActive`, `sortOrder`,
  `features: string[]`, `accountTypes: ('individual'|'business'|'both')[]`.
- **Current seed** (`DEFAULT_PLAN_CATALOG_SEED`): **Starter** (R200/mo, 5 assets, `both`),
  **Standard** (R400/mo, 10 assets, `both`), **Enterprise** (custom pricing, unlimited,
  `business` only).
- **Customer-facing routes**: `GET /v1/plans/catalog` (public, pre-signup marketing) and
  `GET /v1/plans` (authenticated) — both already serve whatever is in the catalog with
  `isActive: true`. No mobile/web rebuild needed to change tier names, taglines, limits, or the
  `features` bullet list — that's an admin-editable PATCH (`PATCH /v1/admin/plans/:planId`),
  a content change, not a code change.
- **What's actually *enforced* today, not just described**: only `maxAssets`, via
  `assertAssetRegistrationAllowed()` (`backend/src/lib/plan-enforcement.ts`) — it blocks asset
  registration past the cap with `ASSET_LIMIT_REACHED`. **Nothing else in the `features` array is
  functionally gated by tier in code right now.** Self-device location reporting
  (`asset-location.ts`), tracking-device registration (`tracking-devices.ts`), notifications, and
  alerts are all currently available uniformly to any authenticated account regardless of plan.
  Any tier differentiation beyond asset count that this strategy proposes is **new gating logic**,
  not already-shipped behavior — flagged in §6 as real (small) engineering work, not free.
- **No policy can activate.** Every policy today lands in `pending_activation` /
  `billingStatus: not_configured` — there is no payment gateway (north-star M2, open
  `integration-architect` decision). **This tier structure can be published as marketing/pricing
  content today, but no customer can actually be billed onto a paid tier until M2 closes.** Don't
  let that block writing and shipping the tier copy — the catalog, PATCH endpoint, and public
  `/plans/catalog` route all work today and can display real positioning pre-payment-gateway.

## 2. Tier structure at a glance

| | **Starter** | **Professional** | **Enterprise** |
|---|---|---|---|
| Who it's for | One person protecting 1–3 personal devices | A household or small business protecting a real device fleet, GPS-recovery-first mindset | Businesses/high-net-worth individuals with volume asset coverage and custom commercial needs |
| Asset cap (proposed) | 3 | 12 | Custom (uncapped, contract-defined) |
| Asset types | All 8 supported types, capped by count | All 8 supported types, capped by count | All 8 supported types, custom count |
| Self-device location | On-demand only (snapshot at time of loss report) | Continuous background reporting (phone-only, opt-in) — the real upgrade hook | Continuous + priority handling in recovery workflow |
| GPS hardware tracking | Not available (no vendor selected for anyone yet) | First access once a vendor is selected (§4 — a priority-access promise, not a delivery date) | Same first-access priority, plus volume procurement conversations once hardware exists |
| Notifications | Standard push/email on policy & asset events | Same, plus recovery-case status updates | Same, plus dedicated account contact for status |
| Support channel | In-app/email, standard queue | In-app/email, priority-labeled queue | Named account contact — **not** a 24/7 SLA (see §5) |
| Claims | **Not sold in any tier** — backend doesn't exist (§5) | Same | Same |
| accountTypes | `both` | `both` | `both` (broadened from `business`-only — see §7) |

Pricing: current live seed values (R200 / R400 / custom) are shown here as **the existing
starting point**, not a proposal to change them — actual pricing is a business decision (see §7).
This document changes *what's included*, not the Rand amounts, unless the business decides
otherwise.

## 3. Starter — the honest entry point

**Positioning:** "Protect what you carry every day" — a low-commitment way to register your phone,
laptop, or one or two other devices and get real value immediately, with clear, deliberate
ceilings that make Professional the obvious next step once a customer owns more than a couple of
insurable devices.

**Included (real, buildable-today value):**
- Register up to 3 assets across any of the 8 supported categories (vehicle, laptop, phone,
  tablet, TV, desktop, business equipment, other electronics).
- Full policy/asset self-service in the mobile app (already built — Feature 004/006).
- Standard push/email notifications on policy and asset status changes (Feature 007, already
  built).
- On-demand location snapshot: when a customer marks an asset lost/stolen, the app can request a
  one-time location read from that asset's own device (self-device reporting, Feature 008 Phase
  1) — a real capability, not continuous tracking.
- Standard-queue in-app/email support — no priority routing, no phone line (§5).

**Deliberately not included (the upgrade pull):**
- Hard cap at 3 assets — most households protecting a phone *and* a laptop *and* anything else
  hit this fast, which is the point.
- No continuous/background location reporting — only a snapshot at time of loss, not an ongoing
  map view.
- No priority support queue.
- Business-equipment volume use is technically allowed (`accountTypes: both`) but the 3-asset cap
  makes Starter a poor fit for any business fleet — that pull is intentional, not an oversight.

## 4. Professional — the meaningful step up

**Naming rationale:** "Professional" over "Plus"/"Premium" — reads credibly for an
insurance-adjacent product, doesn't imply a numeric ladder that invites customers to assume a
"Premium Plus" tier later, and matches the recognizable Starter/Professional/Enterprise pattern
customers already understand from other subscription products, lowering the explanation burden at
signup.

**Positioning:** "For people and households who actually rely on recovery working" — this is
where the GPS-recovery promise of the platform becomes real, not just described.

**What unlocks here and why it's worth paying more:**
- **12-asset cap** — enough for a real household or small operation (multiple laptops, phones,
  tablets, a vehicle, a TV) without forcing an Enterprise conversation prematurely.
- **Continuous self-device location reporting** (opt-in, phone-only, subject to the app running
  and network availability — no hardware guarantee, see ADR-0009 on the trust boundary). This is
  the single clearest reason to upgrade: Starter tells you where a device was *when you reported
  it lost*; Professional keeps a live-ish picture so recovery has better odds. **This requires new
  tier-gating code** (§6) — it does not exist as a plan-gated capability today.
- **Recovery-case status notifications** — when a loss report becomes an active recovery case
  (`recovery.ts`/`security-cases.ts`), Professional customers get status-change notifications, not
  just the initial confirmation.
- **Priority-labeled support queue** — routed ahead of Starter tickets in whatever support queue
  exists today (in-app/email; **not** a phone line or time-bound SLA — that depends on the Call
  Centre Dashboard, not yet built, see §5).
- **First access to GPS hardware tracking**, once a vendor is selected (integration-architect,
  open decision) — sellable today as a forward-looking priority-access commitment, *not* as a
  feature that exists. Copy must say "first access when available," never "GPS tracking included."

## 5. Enterprise — different in kind, not just degree

**Positioning:** "For businesses and high-value portfolios that need volume coverage and a real
relationship, not just a bigger number." Enterprise's differentiation is commercial and
operational, not a bigger asset-count slider.

**What makes it different in kind:**
- **Volume/custom asset coverage** — no fixed cap; negotiated per account, same as the existing
  `isCustomPricing: true` / `maxAssets: null` model already in the catalog.
- **Named account contact** for status and support — a real person/queue label, distinct from the
  general support queue. **This is not a 24/7 support guarantee or an uptime SLA** — per contract
  TDIT-2026-09 §7, the engineering retainer explicitly excludes 24/7 guaranteed support and
  guaranteed uptime. If the business wants to sell either of those to an end-customer, it needs a
  **separate commercial agreement**, not something engineering can silently absorb into an
  Enterprise tier promise. Any Enterprise sales copy claiming an SLA number (response time,
  uptime %) must be reviewed against this before it goes external.
- **Custom integrations** — same flag: contract TDIT-2026-09's Change Request procedure governs
  anything outside Schedule A. An Enterprise customer asking for a bespoke integration (e.g. their
  own asset-management system) is a Change Request the business quotes separately, not a bundled
  Enterprise feature engineering owes for free once someone signs an Enterprise contract.
- **Security-company dispatch priority tie-in** — a genuinely differentiated future capability
  (Enterprise recovery cases get priority routing to security-company partners) but **depends on
  Security Company Dashboard/dispatch workflow maturity that isn't fully built or validated with
  real partners yet** (north-star §4 — security-company partner recruitment is a
  business-development function, not something the dashboard build alone produces). Sellable as
  roadmap intent, not a current guarantee.
- **Custom reporting/asset-inventory exports** for company fleets — no reporting/export capability
  exists in the platform today (no `analytics-specialist`/`reporting-engineer` build has shipped);
  flag as a real gap if sold, don't imply it exists.

**Not included / explicitly out of scope for Enterprise copy today:**
- Claims handling of any kind (§ below) — no tier gets this yet.
- Guaranteed GPS accuracy or hardware delivery timelines — GPS hardware vendor is unselected.
- Phone-based support — tied to the Call Centre Dashboard (contract Schedule A item 4, scoping
  deferred until Release Gate A closes per the CTO decision in
  `contract-tdit-2026-09-scope-summary.md`).

## 6. Cross-cutting: claims — not sold in any tier

Claims has no backend route in this repo (no `claims.ts`). The mobile UI stub
(`app/(app)/claims/`) is being hidden behind a build flag for the next client build precisely
because it 404s. **No tier's marketing copy, PRD, or sales conversation should reference "file a
claim" as a live capability at any tier until a Feature-lifecycle pass (Stage 1 business
requirements owned by `business-analyst`/`product-manager`, per north-star §6) produces a real
claims backend.** This applies equally to Starter, Professional, and Enterprise — it is not an
Enterprise-exclusive gap, it's a platform-wide one.

## 7. What this actually requires from engineering (conceptual — not built here)

Routed conceptually to the owning roles; this document does not implement any of it.

- **`backend-engineer`**: add plan-tier gating to the self-device continuous-location-reporting
  path (currently ungated — any authenticated account can use it regardless of plan) so
  "continuous tracking is Professional+" is a real, enforced distinction rather than marketing
  copy contradicted by the API. Small, scoped change, same pattern as
  `assertAssetRegistrationAllowed()`. Needs its own Stage 8 security review given INC-001's recent
  history with unreviewed location-surface changes — do not fast-track this past that gate.
- **`backend-engineer`** (data-only, no code): broaden the Enterprise row's `accountTypes` from
  `['business']` to `['both']` if the business decides Enterprise should also be sellable to
  high-net-worth individual customers, not just registered businesses — a one-line admin PATCH,
  not a migration.
- **Content-only, admin action, no engineering ticket needed**: renaming `Standard` →
  `Professional`, rewriting `tagline`/`features` copy, and adjusting `maxAssets` values (5→3,
  10→12 as proposed) are all achievable today through the existing `PATCH /v1/admin/plans/:planId`
  endpoint by whoever holds admin credentials. Flag to `technical-project-manager` only if the
  team wants this scripted/seeded rather than done by hand.
- **`payment-engineer`**: none of this can actually bill a customer until north-star milestone M2
  (payment gateway selected and built, `pending_activation → active` transition exists). Tier
  copy can and should ship now for marketing/positioning; billing enforcement is downstream and
  blocked on the same open vendor decision as everything else payment-related in this repo.
- **`business-analyst`/`cto`**: commercial rules D-01–D-08 (referenced in
  `north-star-2000-dau.md` M2) — tier eligibility, cancel/refund, coverage limits, retention —
  need ratification before this tier structure is commercially final. This document proposes
  *feature content* per tier; it does not resolve D-01–D-08.

## 8. Open business decisions — flagged, not decided here

These require a business/platform-owner call, not a product-manager unilateral decision:

1. **Actual Rand pricing** — whether Starter/Professional stay at R200/R400 or move. This
   document deliberately did not invent new price points; it only reorganizes what each existing
   price point includes. If the business wants a formal pricing review, that's a joint
   `cto`/business-stakeholder exercise, not something to infer from this doc.
2. **Asset-cap changes** (5→3, 10→12) — these are proposed for upgrade-pull reasons, but changing
   a live limit that existing test policies and fixtures assume (`plan-enforcement.test.ts`,
   `admin-plans.test.ts` currently hardcode 5/10) has a small real cost and should be confirmed
   before an admin edits the live catalog.
3. **Whether to broaden Enterprise's `accountTypes` to include individuals**, given the current
   seed restricts it to `business` only.
4. **Whether the business wants to sell any SLA/uptime/24-7-support commitment at all** — per
   contract TDIT-2026-09 §7, none of that is funded by the current engineering retainer. If yes,
   it needs a separate commercial agreement before it appears in any tier's copy, and
   `cto`/`compliance-specialist` should review the liability exposure of promising it.
5. **Sequencing against D-01–D-08 ratification** — whether this tier content can be published
   pre-ratification as directional marketing, or must wait.

## 9. Success metrics per tier (definitions for `analytics-specialist`/`reporting-engineer`)

None of this is instrumented today (north-star §5 — no analytics/event instrumentation exists
anywhere in the repo). Defining requirements here, not claiming a dashboard exists:

- **Tier distribution**: % of accounts on each tier at signup and over time.
- **Upgrade conversion rate**: Starter → Professional, Professional → Enterprise, and time-to-
  upgrade from signup.
- **Asset-cap friction**: rate of `ASSET_LIMIT_REACHED` errors hit per tier — a direct signal of
  whether the Starter cap is correctly calibrated to drive upgrades vs. just causing churn.
- **Continuous-tracking opt-in rate** (Professional+ only, once built) — validates whether the
  headline Professional feature is actually used, not just paid for.
- **Support-queue volume by tier** — leading indicator of whether "priority queue" needs to become
  a real staffed capability (tied to Call Centre Dashboard scoping, M6a).

## 10. Sequencing note

This tier structure can be published as **marketing/positioning content today** — the catalog
route, admin editor, and public `/plans/catalog` endpoint all work. It should **not** be
represented anywhere as a live billing structure until north-star milestone M2 closes (payment
gateway selected and built). Any external-facing copy (web marketing site, app store listing,
sales conversation) drawing on this document must carry that distinction: "these are the plans" is
true today; "you can subscribe and be charged" is not, yet.
