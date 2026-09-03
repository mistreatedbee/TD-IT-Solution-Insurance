# Innovation Backlog — Differentiation Ideas for Asset Protection & Recovery

**Owner:** `product-manager` · **Status:** Backlog for future prioritization — NOT a roadmap
commitment, NOT sequenced, NOT sized against current sprint capacity · **Last reviewed:** 2026-09-02

**Purpose:** a grounded set of feature/differentiation ideas for the platform to draw on when
roadmap capacity opens up, past `roadmap-release-gate-a.md` and the north-star milestones in
`north-star-2000-dau.md`. This document does **not** commit engineering to build anything listed
here. Every idea below is evaluated against real constraints: no claims backend, no payment
gateway, GPS hardware vendor undecided, and a small capped-scope retainer (contract TDIT-2026-09,
R3,000/month) that explicitly excludes hardware, payment-gateway fees, SMS, and third-party API
costs (Client-paid separately, see `contract-tdit-2026-09-scope-summary.md` §5). Ideas that imply
unfunded engineering or vendor scope are flagged as such, not silently assumed fundable.

**How to use this document:** when roadmap capacity opens (post–Release Gate A, or once a north-star
milestone in §3/§6 of `north-star-2000-dau.md` unblocks), `product-manager` should pull items from
here, commission `ux-researcher` validation, get sizing from `solution-architect`/domain architects,
and only then promote an item into a real `docs/features/0XX-*/` Stage 1 folder per the 15-stage
lifecycle. Nothing here has been through Stage 1 (Business Requirements) yet — these are candidate
problems/solutions, not ratified scope.

**Grounding sources for this pass:**
- LoJack (stolen-vehicle recovery): law-enforcement-integrated tracking, geofencing/unauthorized-
  movement alerts, a published ~90% recovery rate used as a trust/marketing signal, and a
  stolen-and-unrecovered cash-back guarantee (up to $10,000 if not recovered within 30 days).
  Source: [lojack.com](https://www.lojack.com/), [Edmunds — evaluating stolen vehicle recovery
  systems](https://www.edmunds.com/car-technology/evaluating-stolen-vehicle-recovery-systems.html).
- South African theft-claims reality: insurers require a SAPS case number (CAS number) obtained
  within 48 hours of the incident before a theft claim can even be lodged; the CAS number is the
  root reference for every downstream dispute (insurer, bank, licensing authority).
  Source: [SAPS — report a crime](https://www.saps.gov.za/services/report_crime.php),
  [Integrated Emergency Response — reporting a robbery](https://www.ier.co.za/reporting-a-robbery-what-you-should-know),
  general South African theft-claims guidance (Momentum/Santam claims pages).

---

## 1. SAPS case-number capture in the loss-report flow

**What it is:** extend the existing report-theft flow (`mobile/app/(app)/report-theft` or
equivalent, feeding `recovery.ts`/`security-cases.ts`) with structured fields for the SAPS CAS
(case) number, reporting police station, and report date — plus a 48-hour reminder nudge if the
field is still empty after a theft report is filed, since SA insurers require the case number
within that window.

**Why it's genuinely differentiated:** this isn't "add a text field" — it's aligning the product's
data model with how South African theft claims actually work procedurally (CAS number is the root
reference for every downstream dispute with insurer/bank/licensing authority per SAPS/insurer
practice). Competing consumer trackers (Tile, generic GPS apps) have no concept of this at all
because they're not insurance-adjacent. Capturing it structurally now — even before claims exists —
means the eventual claims backend inherits clean, compliant intake data instead of needing a
retrofit.

**Build complexity:** Small. New fields on an existing recovery-case record (Mongo document
extension, no new entity), a form screen extending an already-built flow.

**Surface:** Mobile (`app/(app)/report-theft`), Backend (`recovery.ts`/`security-cases.ts` schema
extension).

**Buildable now vs. blocked:** Buildable now. Does not depend on claims backend, payment gateway,
or GPS vendor — it's metadata capture on an already-shipped recovery-case flow. The *payoff*
(auto-populating a future claim with this data) is blocked on the claims backend not existing yet
(Stage 1 not started, per `subscription-tier-strategy.md` §6) — flag this honestly in any copy: "we
collect your case number to speed up a future claim," never "submit your claim here."

---

## 2. SAPS station locator + report-assistant (not a filing service)

**What it is:** a static/lightly-maintained directory of SAPS police stations (name, address,
contact) surfaced in-app when a customer reports a theft, plus a pre-filled summary screen (asset
details, approximate last-known location if self-device reporting was on, timestamp) formatted so
the customer can read it out or show it at the station — explicitly an *assistant*, not an
integration that files anything with SAPS on the customer's behalf (no such API exists or should be
assumed).

**Why it's genuinely differentiated:** directly answers the single biggest friction point in SA
theft claims — getting a CAS number fast, with the right details, within the 48-hour insurer
window. No generic tracker app does this because it's specific to how South African policing and
insurance intersect.

**Build complexity:** Small. Static dataset (or a cheap public API if one exists — needs a data-
source check, not assumed), one new screen consuming already-captured asset/loss-report data.

**Surface:** Mobile, extending the report-theft flow from Idea 1.

**Buildable now vs. blocked:** Buildable now, no vendor dependency. Data-source freshness (station
list accuracy) is a light ongoing content-maintenance cost, not an engineering blocker.

---

## 3. Recovery-case status timeline, visible to the customer

**What it is:** a customer-facing, package-tracking-style timeline view of an active recovery case
— "Reported → Case opened → Security company assigned → Location update received → Recovered /
Closed" — built directly on the recovery-case/security-case data that already exists
(`recovery.ts`, `security-cases.ts`).

**Why it's genuinely differentiated:** most competing GPS-tracker apps show you a dot on a map and
nothing else once you've reported a loss — they don't show you the human/operational process
happening behind the scenes. Making the security-company dispatch and case-progression visible
(even at a coarse status level) is a trust-building pattern borrowed from delivery-tracking UX and
directly addresses "what's actually happening with my stolen device" anxiety, which is the #1
emotional driver in this category.

**Build complexity:** Medium. Requires a small state-machine/status-history addition to the
recovery-case model plus a new mobile screen; no new entity type, reuses existing case data.

**Surface:** Mobile (new screen off Policy/Assets or Alerts), Backend (`recovery.ts`/
`security-cases.ts` status-history field), lightly touches Security Company Dashboard (status
transitions need to originate from the operator's actions there).

**Buildable now vs. blocked:** Mostly buildable now. Does not need claims backend, payment gateway,
or a GPS vendor — recovery-case and security-case infrastructure already exists. Needs
`security-engineer`/Stage 8 review since it surfaces case data cross-role (customer sees a
representation of security-company actions) — same caution flagged in
`subscription-tier-strategy.md` §7 for any location-adjacent change post-INC-001.

---

## 4. Continuous-reporting health & tamper-evidence signal

**What it is:** for customers who've opted into continuous self-device location reporting (Feature
008 Phase 1), surface a simple health indicator — "reporting active," "reporting stopped 2 hours
ago (permission revoked / app closed / device offline)" — and notify the owner when it silently
stops working, rather than the customer only discovering their location trail went dark when they
already need it during a loss event.

**Why it's genuinely differentiated:** self-device (phone-only) tracking has a known trust gap
versus dedicated hardware trackers — the phone can be turned off, permissions revoked, or the app
killed by the OS, and today nothing tells the customer that happened. Being transparent about *when
self-device tracking isn't actually working* is more honest and more useful than implying
always-on coverage it can't guarantee — directly reinforces ADR-0009's stated trust boundary instead
of quietly ignoring it.

**Build complexity:** Small–Medium. Uses infrastructure already built for Feature 008 Phase 1
(`asset-location.ts`); needs a "last successful ping" staleness check and a notification trigger
(Feature 007 already has the notification pipe).

**Surface:** Mobile (device status card on Assets/home), Backend (`asset-location.ts` staleness
check + `notifications.ts` trigger).

**Buildable now vs. blocked:** Buildable now — no vendor dependency, self-device reporting is real,
built code, not aspirational. Note: `asset-location.ts` is presently under a server-side kill switch
per INC-001 (north-star §2) — this idea cannot ship until that incident is formally closed and any
new location-adjacent surface clears Stage 8 review again.

---

## 5. Household / family asset-sharing on a single policy

**What it is:** allow a policy owner to invite additional app users (household members) with
scoped, read-only or asset-specific permissions — e.g. a teenager can see and report-lost their own
registered phone, but not edit the parent's policy or billing.

**Why it's genuinely differentiated:** the current model is strictly single-owner
(`backend/src/routes/` policies/assets are owned by one authenticated account). Real households with
multiple devices across multiple people are the Professional-tier target persona per
`subscription-tier-strategy.md` §4 ("a household... protecting a real device fleet") — but nothing
in the product today lets more than one person actually use the app against that shared policy.
This is a genuine gap versus the stated tier positioning, not a nice-to-have.

**Build complexity:** Medium–Large. New invite/permission-scope entity, new auth checks across
every existing policy/asset/recovery route (broad surface touch, not a single new endpoint), needs
its own Stage 8 security review given it changes the authorization model.

**Surface:** Backend (new sharing/invite entity + authz middleware across `policies.ts`/`assets.ts`/
`recovery.ts`), Mobile (invite flow, permission-scoped views), lightly touches Admin (visibility
into multi-user policies for support).

**Buildable now vs. blocked:** Not blocked on any open vendor decision (payment/GPS/claims) — this
is pure product/authz work. Flagged as real, non-trivial engineering scope: broadens the
authorization surface across nearly every existing route, so it needs deliberate sizing from
`backend-architect`/`solution-architect` before any commitment, and should not be assumed to fit
inside a capped-scope sprint casually.

---

## 6. Safe-behavior recognition (badges, not yet discounts)

**What it is:** lightweight, non-monetary recognition for behaviors correlated with better recovery
odds and lower risk — completing full asset registration, enabling continuous self-device
reporting, keeping app permissions healthy (ties to Idea 4), responding promptly to a location-
health alert. Shown as simple in-app badges/progress states, explicitly *not* wired to any billing
discount yet.

**Why it's genuinely differentiated:** telematics/usage-based-insurance patterns (driving-behavior
discounts in auto insurance) are proven to change customer behavior, but this platform has no
payment gateway to actually apply a premium discount (M2, still open). Shipping the *recognition*
layer now — without promising a discount — builds the behavioral data and habit loop first, so that
once M2 closes, a real usage-based-discount model (owned jointly with `payment-engineer`/business)
has actual behavioral signal to price against instead of starting from zero.

**Build complexity:** Small–Medium. Mostly derived from data already being captured (registration
completeness, continuous-reporting opt-in status, notification response time); needs a small
`analytics-specialist`-defined event set (M4 dependency, see below) and a badges UI.

**Surface:** Mobile (home/profile badges), lightly Backend (deriving badge state from existing
events).

**Buildable now vs. blocked:** Partially blocked — needs the M4 analytics/event instrumentation
(`north-star-2000-dau.md` §5) to exist first, since badge state should be event-derived, not
guessed from ad hoc queries. **Explicitly do not promise a premium discount in any copy** — no
payment gateway exists to apply one (M2 open decision). Route the actual scoring/recommendation
logic conceptually to `recommendation-engine-specialist` rather than hand-designing a model here.

---

## 7. Resale-value / replacement-cost drift alerts

**What it is:** periodic (e.g. quarterly) nudges when a registered asset's declared value likely no
longer matches its real replacement cost — e.g. flagging that a 3-year-old laptop model's insured
value hasn't been revisited, or that a newly-released device generation makes an old declared value
stale.

**Why it's genuinely differentiated:** most consumer asset-trackers never touch valuation at all;
insurers' periodic-review value is well understood but rarely proactive at the individual-asset
level for a self-service platform like this. It also protects the *business* — under-insured assets
mean underpriced risk and disputed claims later.

**Build complexity:** Medium. Needs either a manual "confirm current value" self-service flow
(small, buildable now) or an external market-price feed for automatic drift detection (real
external-data vendor dependency, not assumed free).

**Surface:** Mobile (Assets tab, value-confirmation prompt), Backend (scheduled reminder job on
asset records).

**Buildable now vs. blocked:** The manual self-service version (customer periodically re-confirms
value, no external pricing feed) is buildable now with no vendor dependency. The automatic
market-price-feed version is **blocked on selecting and funding a pricing-data vendor** — flag this
explicitly as a scope split, don't let "value drift alerts" quietly imply the automatic version is
free to build.

---

## 8. Recovery-outcome transparency, published honestly

**What it is:** an aggregate, anonymized stats view (starting internal/admin-only, later public
marketing content once real numbers exist) — recoveries attempted, recoveries closed successfully,
median time-to-recovery — modeled on how LoJack markets its ~90% recovery rate as a trust signal.

**Why it's genuinely differentiated:** in this category, a credible recovery-rate number is one of
the strongest trust/conversion levers that exists (see LoJack's own marketing use of it) — but it
only works if it's real and current, not asserted. Publishing it forces the org to actually track
recovery outcomes, which is valuable operationally even before it's used externally.

**Build complexity:** Medium. Requires recovery-case *outcome* fields (currently case status exists,
but a clean "closed: recovered / closed: not recovered / time-to-close" summary needs to be
reliable) plus an aggregation view — realistically depends on the M4 analytics/reporting
instrumentation milestone.

**Surface:** Admin Dashboard (internal reporting first), later Web marketing site if/when numbers
are real and non-zero.

**Buildable now vs. blocked:** Blocked, honestly, on two things: (1) M4 analytics instrumentation
not existing yet, and (2) there being **any real recovery outcomes to report** — DAU is 0 today
(north-star §2). This is a "build the tracking capability now, publish the number once it's true"
idea, not a marketing item to promise a number for today. Never publish a recovery-rate claim before
it's real — this is a compliance/marketing-honesty risk, not just a product nicety.

---

## 9. Proactive risk-context alerts (conceptual — model ownership routed out)

**What it is:** contextual nudges when a registered asset's typical location pattern suggests
elevated risk — e.g. a vehicle parked overnight somewhere outside its usual pattern, or a general
"elevated theft risk in your area" seasonal notice. Framed as advisory, not a guarantee.

**Why it's genuinely differentiated:** distinct from a generic "AI alert" hand-wave because it's
grounded in a real, proven insurtech pattern (usage/context-based risk notification, similar in
spirit to LoJack's unauthorized-movement geofence alerts) applied to what this platform can actually
observe today — self-device location pings, once continuous reporting exists per-customer. This
document deliberately does **not** design the underlying model or scoring logic — that's
`recommendation-engine-specialist` territory, consulted once this idea is prioritized.

**Build complexity:** Large. Needs reliable location-pattern data at volume (which needs real DAU
and continuous-reporting adoption, not just the capability existing), a scoring approach, and a
notification-fatigue-aware delivery design.

**Surface:** Mobile (Alerts), Backend (new pattern-analysis service), routed conceptually to
`recommendation-engine-specialist` for the actual model design.

**Buildable now vs. blocked:** Blocked on multiple things at once, flagged explicitly: (1) real
location data volume, which needs real DAU (north-star M7, not close); (2) the location-ingestion
kill switch from INC-001 still being active; (3) a general-crime-risk data feed would be a further
external-vendor dependency if the "area risk" variant is pursued, not just the personal-pattern
variant. This is a multi-quarter-out idea, listed for completeness, not near-term.

---

## 10. Call-Centre-assisted loss reporting (synergy with the in-scope Call Centre Dashboard)

**What it is:** when the Call Centre Dashboard (contract TDIT-2026-09 Schedule A item 4, scoping
deferred until Release Gate A closes per `contract-tdit-2026-09-scope-summary.md` §3) is eventually
scoped, give call-centre agents the ability to log a phone-reported theft/loss directly against a
customer's policy — capturing the same SAPS case-number fields as Idea 1 — for customers who call in
rather than use the app (a realistic channel for a theft-in-progress scenario, or for less
app-comfortable customers).

**Why it's genuinely differentiated:** most consumer tracker apps assume the customer is calm enough
and has app access at the moment of loss — not always true for theft/robbery specifically. A phone
channel that feeds the *same* recovery-case data model as the app channel (not a parallel, disjointed
process) is a meaningful operational differentiator once the Call Centre Dashboard exists, and it's
free to design consistently with Idea 1's data model now so the two don't diverge later.

**Build complexity:** Medium, but **entirely contingent on the Call Centre Dashboard itself being
scoped and built first** — this is not a standalone item.

**Surface:** New Call Centre Dashboard (once `010-call-centre-dashboard` Stage 1 exists), Backend
(reuses `recovery.ts`/`security-cases.ts`).

**Buildable now vs. blocked:** Fully blocked — the Call Centre Dashboard has no Stage 1 requirements
yet (M6a in `north-star-2000-dau.md`, explicitly deferred until Release Gate A closes). Listed here
so that **when** that dashboard is scoped, this idea is already in the backlog to consider, not
reinvented from scratch. Do not treat this as evidence the Call Centre Dashboard's scope already
includes loss-reporting — it doesn't yet; that's `product-manager`'s scoping call to make.

---

## 11. Multi-asset "bundle" recovery for commonly co-stolen items

**What it is:** let a customer flag that certain registered assets are typically carried/stolen
together (e.g. laptop + laptop bag + charger, or a business's matched equipment set), so a single
loss report can open one recovery case covering the bundle instead of requiring separate reports per
asset.

**Why it's genuinely differentiated:** modest but real UX/operational win for the Business/Enterprise
segment (device fleets, matched equipment) — reduces reporting friction and gives the security
company one coherent case instead of a flood of near-duplicate ones for what was clearly a single
incident.

**Build complexity:** Small–Medium. Mostly a UI grouping/tagging concept on top of existing
assets and recovery-case creation; no new core entity, just an optional group reference.

**Surface:** Mobile (Assets tab tagging + report-theft flow), Backend (recovery-case can reference
multiple asset IDs — check whether `recovery.ts` already supports this or needs a schema change).

**Buildable now vs. blocked:** Buildable now, no vendor dependency. Lowest-priority of the list —
included for completeness on the Enterprise/Business fleet angle, not because it's a strong
standalone driver of adoption or retention on its own.

---

## What was deliberately left out, and why

- **A "neighborhood watch" / crowdsourced-sighting recovery network** (users spotting other users'
  lost devices nearby, à la Tile's crowdsourced Bluetooth network) was considered and **not**
  included as a numbered idea. Tile's version depends on a large installed base of a specific
  hardware tag broadcasting to *other* users' devices passively — a capability this platform cannot
  build without (a) a chosen GPS/BLE hardware vendor (open decision) and (b) real DAU at meaningful
  density, and it raises non-trivial POPIA exposure (bystanders' devices scanning for and reporting
  on other people's property/location) that would need `compliance-specialist` review before even a
  concept pass. Flagging it here so it isn't silently forgotten, not proposing it as a near-term
  item.
- **Instant claims-photo triage** (AI-assisted damage/loss photo review) was considered and
  intentionally **not** written up as a standalone idea beyond this note: it is claims-backend-
  dependent by definition (`subscription-tier-strategy.md` §6 — no tier sells claims, no
  `claims.ts` route exists), so a photo-triage feature has nothing to attach to yet. Once
  `business-analyst`/`product-manager` run Stage 1 for an actual claims feature, photo-triage
  becomes a reasonable idea to revisit — worth naming now so it isn't lost, but premature to size or
  write acceptance criteria against a backend that doesn't exist.

## Priority signal (informal, not a ranking commitment)

The three ideas most worth pulling into a real Stage 1 pass first, once capacity exists, are Ideas
1–3 (SAPS case-number capture, station locator/report-assistant, and the recovery-case status
timeline) — because all three are buildable now with no open-vendor dependency, extend
already-shipped infrastructure rather than requiring new entities, and directly address the two
most concrete, evidenced pain points in this category: South Africa's 48-hour CAS-number claims
requirement, and the trust gap of "what's actually happening" after a loss is reported. Everything
else in this backlog is real but has at least one open dependency (payment gateway, GPS vendor,
claims backend, or the M4 analytics milestone) standing between it and a near-term build.
