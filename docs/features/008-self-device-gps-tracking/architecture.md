# Feature 008 — Self-Device Location Tracking for Phone/Laptop Assets

## Status banner — read this before anything else below

**This is a design proposal, not an authorization to build.** It has not been through Stage 1
(Business Requirements) of `docs/organization/02-feature-lifecycle.md`, has no `business-analyst`
ratification, no `compliance-specialist` lawful-basis determination, and no `cybersecurity-architect`
disposition on whether it needs its own ADR. Per root `CLAUDE.md` and this platform's standing rule
against inventing business rules to unblock delivery (see HANDOFF.md's MP-3), **nothing in this
document should be read as a ratified requirement, a committed API contract, or a green light for
`mobile-engineer`/`backend-engineer` to start writing code.** §6 names exactly who has to sign off,
and on what, before that changes.

**Author:** `mobile-architect`
**Date:** 2026-08-13
**Lifecycle position:** Pre-Stage-1. Produced ahead of the formal sequence, in the same spirit as
`003-mobile-app-foundation/architecture.md` §0 — an honest architecture-level sketch written so
Stage 1 (`business-analyst`/`product-manager`) has something concrete to react to, not a substitute
for Stage 1 itself.
**Trigger:** New product direction given directly by the platform owner this session (not yet
reflected in any roadmap or business-requirements document): for asset types that can run the
customer mobile app themselves (phone, and — see §1.2 — questionably laptop), use the device's own
OS location APIs for recovery support, instead of waiting on the dedicated hardware-GPS-tracker
vendor decision that every other asset type still depends on.
**Governing ADRs:** [ADR-0001](../../organization/adr/0001-baseline-architecture.md) (Expo React
Native baseline — constrains what "the app's own client" can mean, see §1.2), [ADR-0002](../../organization/adr/0002-polyglot-persistence-identity-vs-domain-data.md)
(domain data → MongoDB — location data would live there, consistent with §3), [ADR-0006](../../organization/adr/0006-privileged-access-audit-correlation.md)
§5 (AUD-9 "third-trail rule" for GPS location access — directly governs §3 and §5(b) below; **this
document does not attempt to satisfy or reopen it**, only names where a future design must).
**Reads on:** `HANDOFF.md` (current repo state, FU-A14, MP-3/MP-5 rulings), [`003-mobile-app-foundation/architecture.md`](../003-mobile-app-foundation/architecture.md)
(§1.1's Expo-managed-workflow eject trigger, §7's unchecked background-location checklist item this
document is the first real attempt at), [`004-policy-asset-management/api-design.md`](../004-policy-asset-management/api-design.md)
(existing `Asset.assetType` enum and the `gpsDeviceId`/`gpsPairedAt` fields — see §1.3, §3.2), [ADR-0006](../../organization/adr/0006-privileged-access-audit-correlation.md)
§5 AUD-9 and §17.3 (FU-A14), [`08-roadmap.md`](../../organization/08-roadmap.md) (Phase 2 "GPS &
Recovery" scope), `.claude/agents/gps-integration-engineer.md`, `.claude/agents/compliance-specialist.md`,
`.claude/agents/cybersecurity-architect.md`, `.claude/agents/mobile-architect.md` (this role's own
charter — see the closing note on decision-making authority).

---

## 0. Framing: what problem this is actually solving, and what it isn't

The platform's original GPS model is a **dedicated hardware tracker unit, paired to an asset**,
independent of whatever software runs on the asset itself — a vehicle, a TV, a desktop, a piece of
business equipment cannot run this platform's app, so a physical tracker is the only way any of
those asset types can ever report a location. That model is real in the schema today (`Asset.gpsDeviceId`/
`gpsPairedAt` exist, always `null` in Phase 1 — `api-design.md` line 443-447) but has **no ingestion
pipeline, no vendor, and no Stage 1 requirements anywhere** (`gps-integration-engineer.md`'s own
"Current repo state": *"No GPS pipeline in production... hardware vendor open"*). Nothing here
changes that. Vehicle, tablet, TV, desktop, business equipment, and the `other_electronics` catch-all
are **completely unaffected by this document** and remain blocked on `integration-architect`'s
hardware-vendor decision, exactly as HANDOFF.md states.

The new idea this document evaluates is narrower and structurally different: for the subset of asset
types that are themselves capable of running this platform's own mobile client — concretely,
`assetType: smartphone` today — the *asset* and the *reporting device* can be the same physical
object. That removes the hardware-vendor dependency entirely for that subset, because the "sensor"
is a location API the OS already exposes to any app the customer has installed and granted
permission to, not a piece of hardware the platform has to source, ship, and pair. That is a
genuine, narrower slice, and it is why this document exists as a distinct proposal rather than as a
Phase-2-GPS sub-note.

It is also, on inspection, a materially different **trust and availability model** from a hardware
tracker, and that difference has to be stated plainly before anything else in this document, because
it changes what the feature can honestly promise:

- A hardware tracker is deliberately hidden inside/on an asset, independently powered (its own
  battery, or the vehicle's), and reports regardless of whether the asset's legitimate owner is
  cooperating — that is precisely what makes it useful *after* a theft, when the person now holding
  the asset has every incentive to stop it from reporting and no way to find and disable something
  they don't know is there.
- Self-device tracking has none of that. It requires the reporting device — the phone itself — to
  still be powered on, network-reachable, running an OS that hasn't been factory-reset, and (for any
  variant that isn't a one-shot last-known-location snapshot) still have this app installed with
  location permission intact. A person who has stolen a phone has every reason and every means to
  defeat all of that in seconds (airplane mode, factory reset, app removal) — something a hardware
  tracker specifically doesn't hand them the ability to do, because they don't know it's there.

**Consequence for how this feature should be described to customers, once it exists:** self-device
tracking is honestly a **best-effort, pre-theft-and-immediately-post-theft convenience** ("find my
phone before it's truly gone," "capture the last position it reported before it went dark") — not a
recovery guarantee equivalent to what a hidden hardware tracker aims for. This is not an engineering
footnote; it is the load-bearing fact that should shape consent copy (`compliance-specialist`) and
product marketing claims (`product-manager`) so the platform never implies self-device tracking does
something it structurally cannot. Flagging this now, at the design stage, is cheaper than a later
customer-trust incident from a theft victim discovering the "tracked" phone stopped reporting the
moment it was stolen — which, per §0's own analysis, is close to the expected case, not an edge case.

---

## 1. Scope boundary

### 1.1 What this covers

- **Only** assets registered with `assetType: smartphone` (existing enum value, `api-design.md`
  line 213) **where the customer has this platform's own mobile app installed on that same physical
  phone** and has explicitly granted the app location permission for this purpose.
- The location-reporting capability is scoped to that one asset-type/client combination. It is not a
  general "the app also happens to know where the phone carrying it is" feature bolted onto
  unrelated screens — it is specifically about reporting the location *of the registered asset*,
  which the app can only credibly do when the asset *is* the device the app is running on.
- Recovery-support use, consistent with the platform's mission: helping a customer or (later, once
  designed) a security-company partner locate a lost or stolen phone. Nothing here designs the
  security-company-facing side of that — see §5(b)'s ADR-0006 note, which governs any read surface
  beyond the asset's own owner.

### 1.2 What this does not cover, and an honest correction to the trigger framing

**Every other asset type — vehicle, tablet, TV, desktop, business equipment, `other_electronics` —
is completely unaffected.** They still require a physical GPS tracker, still have no ingestion
pipeline, and still wait on `integration-architect`'s vendor decision. This document does not
propose any change to that.

**"Laptop" does not belong in this feature the way "phone" does, and the honest answer is to say so
now rather than build against an assumption that doesn't hold.** Three independent problems, not one:

1. **Most consumer laptops have no GPS chip.** Unlike phones, laptop location (where the OS offers
   it at all — Windows Location Service, macOS Core Location) is typically derived from Wi-Fi
   access-point/IP-based geolocation, which is meaningfully less precise (often neighborhood-to-city
   grade, sometimes wrong outright) than phone GPS. A "GPS-tracked laptop" claim would be
   technically inaccurate for the overwhelming majority of the hardware customers actually own.
2. **There is no laptop-equivalent client in this platform's stack to report it from.** ADR-0001's
   baseline is Expo **React Native**, which targets iOS/Android — there is no Expo/React-Native
   build target for Windows or macOS that this platform ships today, and standing one up (a native
   Windows service, a macOS menu-bar agent, or some other always-resident background process) is a
   different engineering surface entirely: a new client platform, a new permission model, a new
   release/update mechanism, arguably a different owning role than `mobile-architect`. It is not a
   config-plugin-level addition to the existing Expo app; it is a new product surface with its own
   Stage 1–7.
3. **The OS-vendor equivalents (Apple's Find My Mac, Microsoft's Find My Device) exist precisely
   because this needs deep OS integration a third-party app doesn't get** — which is further
   evidence this isn't a small gap to close with application code, it's a capability this platform's
   current stack structurally doesn't have a path to today.

**Recommendation, stated plainly rather than assumed away:** narrow this feature's real Phase-1
scope to **smartphone only**. If the platform owner wants laptop self-tracking specifically (as
opposed to "laptop, like every other non-phone asset type, waits for a hardware tracker or a future
dedicated desktop-agent initiative"), that is a distinct, separately-scoped initiative — a native
desktop background agent — that deserves its own Stage 1 business requirements and its own
architecture document, not a bullet point folded into "phone and laptop" as if the two were the same
problem. This document does not design that agent. Flagging this correction back to the trigger
framing is exactly what this task asked for, and doing otherwise would mean shipping a doc that
quietly assumes laptop self-tracking is easy when it is not.

### 1.3 A schema signal worth naming now, not silently overloading later

`Asset` already has `gpsDeviceId`/`gpsPairedAt` fields, explicitly documented as "always null in
Phase 1... no GPS endpoint exists to populate it" (`api-design.md` line 443-447) — these are shaped
for the **hardware-pairing** model (an externally-manufactured device with its own identifier,
"paired" to an asset). Self-device tracking is not that: there is no external device to pair, no
`gpsDeviceId` to assign — the "device" reporting the location *is* the asset. Reusing `gpsDeviceId`
to mean "this asset's own phone is the source" would conflate two different concepts under one
field, which is exactly the kind of ambiguity that produces bugs later (a query for "is this asset
GPS-tracked" would need to know which *kind* of tracked it means before it could answer correctly).
**Flagged to `backend-architect`/`database-architect` as a recommendation, not decided here:** model
the location *source* as its own discriminator (illustratively, `locationSource: 'none' |
'hardware_tracker' | 'self_device'`, or however database-architect's actual schema design prefers to
express it) rather than repurposing the hardware-pairing fields. The actual field name, shape, and
whether it lives on `Asset` or a separate collection is squarely their call, per this role's own
"defers to backend-architect on API contract shape" boundary.

---

## 2. Permission & consent flow

### 2.1 Why this is one of the more heavily scrutinized categories, concretely

Both platforms treat background/"Always" location as a distinct, harder-to-obtain permission tier
from foreground-only location, specifically because it's one of the most privacy-sensitive
permissions either store grants:

- **iOS:** "When In Use" and "Always" are separate authorization states. Requesting "Always" up
  front (rather than starting from "When In Use" and later requesting an upgrade) is against Apple's
  own recommended flow, and App Store Review Guideline 5.1.1 requires that background location only
  be requested when the app's core functionality genuinely depends on it and cannot be achieved with
  "When In Use" — reviewers push back hard, and rejection-and-resubmission cycles for
  background-location apps are a known, real cost.
- **Android (10+):** `ACCESS_BACKGROUND_LOCATION` is a **separate runtime permission** from
  `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`, requested in a second step after foreground access
  is already granted (the OS enforces this sequencing; you cannot request both in one prompt from
  Android 11+). Google Play additionally requires a **Background Location permission declaration**
  in Play Console — a policy questionnaire justifying the use case — before a background-location app
  can be published, and a "prominent disclosure" in-app screen before the OS prompt fires.

Both platforms' review processes exist specifically to stop exactly the failure mode this role's own
Risks list names: *"Background location tracking violating App Store/Play Store policy or draining
battery enough to cause uninstalls."*

### 2.2 Two-step consent pattern, regardless of which tier is requested

Standard, non-negotiable UX practice for either tier: never fire the OS permission dialog cold.

1. **In-app primer screen**, shown before any OS prompt, in the customer's own recovery-flow
   context (e.g., at the point of registering a phone asset, or opting into "help me find this phone
   if it's lost"), explaining plainly what will be collected, why, how often, and — per
   `compliance-specialist`'s own Best Practices — specifically, not generically ("we track your
   device's GPS location continuously while insured" is their own stated bar for honesty, not "for
   your protection"). The actual copy is `compliance-specialist`'s to author against a confirmed
   lawful basis (§5(a)) and `ux-researcher`/`ui-designer`'s to surface, not this document's.
2. **The OS permission dialog itself**, fired only after the primer, and only for the permission
   tier the feature actually needs (§2.3) — never requesting a broader tier "in case it's useful
   later," which is both a review-risk and a proportionality problem `compliance-specialist` would
   flag.

### 2.3 Which tier this feature actually needs — recommendation

The task's own framing asks the right question directly: does recovery require background
reporting, or is foreground-when-opened + last-known-location sufficient for a Phase 1 slice?

**Recommendation: foreground-only + on-demand last-known-location capture is sufficient and correct
for Phase 1. Background reporting should not be built without a separate, explicit Stage 1
justification.** Reasoning, concretely:

- §0 already established that self-device tracking's realistic value is pre-theft ("find a phone I
  misplaced") and immediately-post-theft ("what was its last known position before it went dark") —
  neither use case requires the app to be silently running in the background reporting on a schedule.
  A last-known-location captured whenever the app is legitimately opened (app foreground/resume, or
  an explicit "update my device's location" action) covers both.
- The genuinely continuous, "track it live while someone is walking away with it" use case — the one
  that *would* require background permission — is close to self-defeating for a self-reported phone
  per §0's own analysis: a phone thief has trivial means (airplane mode, factory reset, app removal,
  simply not touching the phone) to stop a background-reporting app from this platform from doing
  anything at all, at essentially zero cost to them. Requesting the heavily-scrutinized "Always"/
  background tier, paying its full battery and store-review cost, in service of a scenario the
  threat model itself says is unlikely to work, is a bad trade for a Phase 1 slice.
- Foreground-only avoids the entire "Always" review category, avoids `ACCESS_BACKGROUND_LOCATION`'s
  separate Play Console declaration, and avoids the battery/uninstall risk this role explicitly
  monitors — for a use case that doesn't need what background buys.

**If product/business later decides continuous or periodic background self-tracking is worth
building anyway** (e.g., because customer research shows real value in "device went for a walk while
I wasn't using the app and I want to know where"), that is a legitimate future direction, but it
needs its own explicit Stage 1 justification weighing the store-review/battery/privacy cost against
a named, researched benefit — not a default escalation from this Phase-1 slice. Named as an open
question for `product-manager`/`business-analyst` in §5(c), not decided here.

---

## 3. Data flow (conceptual — not a proposed API contract)

**Nothing in this section is a ratified endpoint, field name, or database schema.** It sketches the
*shape* a self-reported location event would need to have so that whatever GPS ping ingestion
`gps-integration-engineer` eventually builds for the hardware-tracker model doesn't have to be
redesigned or duplicated the day self-device pings need to flow through it too. Per this role's
charter — "defers to `backend-architect` on API contract shape... defers to `gps-integration-engineer`
on device-hardware-specific protocol details" — the actual contract, storage strategy, and ingestion
pipeline are explicitly **not designed here**; they are named as a handoff.

### 3.1 Why "one conceptual shape, two sources" is worth designing for now, even though neither exists yet

`gps-integration-engineer`'s own charter already commits to "a vendor-agnostic internal format" for
hardware-tracker pings, precisely so ingestion logic isn't locked to one vendor's raw protocol. A
self-reported phone ping is, at the conceptual level, the same kind of event — *something* reporting
"this asset was at this coordinate at this time, with this confidence" — differing only in **where
the ping originates and how it authenticates**, not in what it fundamentally asserts. Building two
structurally incompatible ingestion paths (one for hardware pings, one for app-reported pings) would
mean geofencing, last-known-location queries, theft-mode elevation, and history storage all have to
be built twice, or built once against a shape that has to be retrofitted later. Designing the
self-device variant to slot into the same normalized-ping concept the hardware model will need
avoids that, without requiring either pipeline to exist today.

### 3.2 Illustrative shape — explicitly not a contract

For discussion only, in the format a future ping might take conceptually:

```
LocationEvent (illustrative — NOT a ratified schema)
  assetId          — the phone asset this reports on
  accountId        — implicit from the authenticated caller, same mediation
                      principle ADR-0002/api-design.md already use elsewhere
  source           — "self_device" | "hardware_tracker"  (the discriminator §1.3 flags)
  capturedAt       — device-clock timestamp of the fix
  receivedAt       — server-clock timestamp (gps-integration-engineer's own stated
                      concern: "handle out-of-order and duplicate pings gracefully" —
                      this pair is why)
  coordinates      — { lat, lng }
  accuracyMeters   — from the OS location API's own reported accuracy
  triggeredBy      — "foreground_open" | "manual_refresh"  (Phase 1, per §2.3's
                      recommendation — no "background_interval" value in Phase 1)
```

Two things worth naming about this sketch without resolving them:

- **Authentication differs meaningfully by source, and that's a real design question, not a detail.**
  A self-device ping originates from the customer's own already-authenticated mobile-app session —
  the natural fit is the existing bearer-token session mechanism (`003-mobile-app-foundation/architecture.md`
  §2), the same as every other authenticated mobile call. A hardware-tracker ping originates from a
  piece of standalone hardware with no session of its own and needs its own device-level credential
  — `gps-integration-engineer`'s "abstracted GPS hardware ingestion contract" already anticipates
  this being vendor-dependent. The two sources sharing one *event shape* does not mean they share one
  *ingestion authentication path* — that's `backend-architect` + `gps-integration-engineer`'s call.
- **"Last known location" as a read shape is probably source-agnostic even if ingestion isn't** — a
  customer viewing their phone asset's last known position shouldn't need to know or care whether it
  came from the phone itself or a paired tracker. That composition (how a read endpoint merges both
  sources into one "current known location" answer) is `backend-architect`'s to design.

### 3.3 Explicit handoffs — this document does not design these

- **`backend-architect`:** ingestion endpoint contract (shape, auth model per §3.2, rate limiting per
  the platform's MP-7-style "every new endpoint carries an explicit rate limiter" convention), and
  how a last-known-location read composes across self-device and (eventually) hardware sources.
- **`database-architect`:** collection/schema design, retention period (see §5(a) — this cannot be
  set before `compliance-specialist` rules on it), and — per `gps-integration-engineer`'s own
  "escalate to `database-architect` for large-scale time-series storage strategy" boundary — whether
  location history needs a dedicated store versus a MongoDB collection, informed by whatever volume a
  foreground-only, on-demand Phase 1 slice (§2.3) actually produces (materially lower volume than
  continuous background tracking would, which matters for right-sizing the storage decision).
- **`gps-integration-engineer`:** whether self-device pings should feed the same normalized internal
  ping schema the hardware model needs (§3.1's recommendation), and how much of the existing
  charter — geofencing, theft-mode elevation, deduplication/out-of-order handling — is source-agnostic
  versus needs a self-device-specific variant (e.g., "theft-mode elevation" makes little sense for a
  source that, per §0, likely goes silent the moment a theft actually occurs).
- **`cybersecurity-architect` + `compliance-specialist`:** see §5(b) — this is a new instance of
  ADR-0006's own-named "third-trail rule" for GPS location access, and this document does not
  attempt to satisfy it.

---

## 4. Battery/UX tradeoffs

| Strategy | Battery cost | Permission tier required | Store-review risk | Accuracy/freshness | Recommendation |
|---|---|---|---|---|---|
| **Continuous background** (standard/high-frequency background location updates) | High — this role's own Risks list names this exact failure mode ("draining battery enough to cause uninstalls") | Background ("Always" iOS / `ACCESS_BACKGROUND_LOCATION` Android) | High — the most heavily scrutinized category on both platforms (§2.1) | Best, but see §0 — largely moot against an actual thief who can trivially defeat it | **Not recommended for Phase 1.** Cost and review risk are real; the recovery benefit against the threat model this feature actually addresses is weak. |
| **Periodic background** (e.g., iOS significant-location-change API, or a bounded interval scheduler on Android) | Moderate — better than continuous, still non-trivial | Still requires the background tier | Still scrutinized, though "significant change only" APIs are viewed more favorably by Apple's own guidance | Moderate — captures drift over hours/days, not real-time | A plausible **Phase 1.5/2** evolution *if* Stage 1 later justifies it with a specific researched use case (§2.3) — not a Phase 1 default. |
| **On-demand / foreground-triggered** (location captured when the app is opened/foregrounded, or via an explicit "update location" action) | Lowest — no persistent background execution at all | Foreground only ("When In Use" iOS / `ACCESS_FINE_LOCATION` Android) | Lowest — standard, unscrutinized permission category | Adequate for "find a misplaced phone" and "log the last known position the moment I open the app to report it missing" | **Recommended for Phase 1** (§2.3). |

The general principle worth stating once, not per-row: the platform's own theft-recovery mission
does not automatically mean "more continuous tracking is always better" — for the self-device
variant specifically, the marginal recovery value of the more invasive strategies is weak precisely
because the threat model (an uncooperative thief holding the reporting device) undermines them,
which is a materially different calculus than for a hidden hardware tracker where continuous
reporting is the entire point and the strategy question is genuinely a battery/cost tradeoff rather
than a "does this even work" one.

---

## 5. What this design explicitly does NOT resolve

This document is an architecture sketch for one narrow slice, produced ahead of the process that
would normally authorize it. Three things have to happen, by three different roles, before any of
this becomes real scope:

### (a) POPIA lawful basis and consent language — `compliance-specialist`

Continuous or even periodic personal location collection needs a confirmed lawful basis before
collection starts — `compliance-specialist`'s own Pre-Approval Checklist already names this
("Lawful basis / consent confirmed for any new or expanded personal data or location collection")
and their own Best Practices explicitly classify location data as capable of revealing "home
address, work commute, travel habits," i.e., not merely device telemetry. Nothing in §2's permission
flow or §4's tradeoff table substitutes for that determination — it describes the *mechanics* of
requesting OS permission, not the *lawful basis* for processing what's collected once granted. This
also needs a retention-period ruling (ADR-0006 §5 AUD-9's C-16(a) already names this exact gap for
GPS location data generally: "the location trail's period... are `compliance-specialist`'s ruling
before that trail ships").

### (b) Whether this needs its own ADR — `cybersecurity-architect`

ADR-0006 §5's AUD-9 already anticipates something close to this: its "third-trail rule" states that
"the next privileged-access trail to be built is 'who looked at where a customer's asset is,' and it
is the platform's most sensitive access class by a wide margin," that it "inherits this ADR by
default" (AUD-1 join key, AUD-7 retention symmetry), and that "no new correlation mechanism may be
invented for it." That text was written with the hardware-tracker model in mind, but a self-device
location read is the same class of data by the same standard the ADR itself uses. What ADR-0006 does
**not** anticipate, because it didn't exist as an idea yet, is that a self-device ping originates
from the data subject's *own already-authenticated session* rather than from independent hardware —
that is a genuinely different trust boundary at the *ingestion* side (who/what is asserting a
location, and how strongly that assertion should be trusted) even if the *access* side (who reads it
afterward) is the same class of sensitive data ADR-0006 already governs. Per this role's own charter
— mobile-architect "cannot unilaterally commit to a native-module dependency... without evaluating
the trade-off with `solution-architect`" and has no ADR authority of its own — **whether self-device
ingestion is close enough to extend under ADR-0006 as written, or different enough to need its own
ADR, is `cybersecurity-architect`'s call to make**, per their explicit charter as the mandatory
Stage 8 chair and the role with "final authority to block any ADR or feature from proceeding past
Security Review on security-architecture grounds." This document flags the question; it does not
answer it.

### (c) Stage 1 business requirements — `business-analyst` / `product-manager`

Nothing above should be read as this feature being ratified product scope. HANDOFF.md's own
standing rulings (the MP-3 pattern: "no business rules may be invented to unblock delivery") apply
here exactly as they did to plan tiers and pricing — this document deliberately does not invent
acceptance criteria, does not propose a fake API contract `mobile-engineer` could build against as if
real, and does not commit the platform to shipping self-device tracking at all. Concrete open
questions Stage 1 needs to answer, surfaced here because they came up while writing this design and
would otherwise be silently assumed:

- Is self-device tracking included in every plan tier, or a differentiator for a specific tier
  (relevant once D-01's tier catalog work, currently deferred per `004-policy-asset-management/business-requirements.md`,
  is ratified)?
- What happens to "last known location" the moment the customer can no longer run the app on that
  phone — because it was stolen, factory-reset, or the SIM/app was removed? Is a stale last-known
  position still shown, timestamped and clearly labeled as stale, or hidden? This is a real product
  decision with real customer-trust consequences given §0's honest framing.
- Does the product's customer-facing claim ("your phone is GPS-tracked") need qualifying language
  given §0/§2.3's finding that this is best-effort and foreground/on-demand, not continuous or
  guaranteed? `product-manager` and `compliance-specialist` both have a stake in that copy — the
  former for honesty about what's being sold, the latter for whether it accidentally overstates a
  processing activity that hasn't been through §5(a).
- Should "laptop" be dropped from the product's stated scope for this feature entirely, per §1.2's
  finding, or does the platform owner want the separate desktop-agent initiative scoped as its own
  item? This document recommends the former but does not decide it.

---

## 6. Pre-Approval Checklist (`mobile-architect` self-review)

Mirroring the format `003-mobile-app-foundation/architecture.md` §7 used — left honestly unchecked
where this document cannot certify something on its own authority, rather than checked to look more
complete than it is.

- [ ] **Offline behavior explicitly designed and tested for every critical flow.** Not applicable in
  the way it was for Feature 003 — this feature's "critical flow" (on-demand location capture, §2.3)
  is inherently online-triggered by design (foreground app use); no offline-queue behavior is being
  proposed for it, and none is designed here. Left unchecked pending Stage 1 confirming that's the
  right posture.
- [ ] **Background-location permission flow follows platform policy with justified minimum
  permission tier.** §2 designs the flow and §2.3 explicitly recommends *against* requesting the
  background tier for Phase 1 — the "justified minimum tier" for this slice is foreground-only. Left
  unchecked because this document's recommendation has not been ratified by anyone with authority to
  ratify it.
- [ ] **Push notification deep-link contract verified end-to-end.** Out of scope for this slice —
  no push notification is proposed here (e.g., no "your device hasn't reported in N days" alert is
  designed in this document).
- [ ] **Battery/performance impact of background tracking measured, not assumed.** N/A by
  construction — §2.3/§4 recommend not building background tracking for Phase 1, so there is nothing
  to measure yet. If a future Phase 1.5/2 background variant is approved, this line reopens for real.
- [x] **Any native-module dependency evaluated for Expo managed-workflow compatibility.**
  Foreground/on-demand location (§2.3) is served by Expo's own `expo-location` module within the
  managed workflow — no eject trigger. Background variants, if ever approved, would need this
  re-evaluated (background location config plugins are a heavier native surface) before assuming the
  same holds.
- [ ] **Auth token/secure storage design reviewed with `authentication-engineer` and
  `cybersecurity-architect`.** Not yet — §3.2's authentication approach (self-device pings ride the
  existing session) is a recommendation, not a reviewed design.
- [ ] **API contract consumed matches `backend-architect`'s published spec, including sync/delta
  endpoints.** No contract exists yet — §3 is explicitly conceptual, not a spec, per its own opening
  line.
- [ ] **Release plan (OTA vs. store submission) specified for the change.** Not specified — see
  note below: a permission-manifest change (adding location usage-description strings, even for
  foreground-only) is a native-config change and would require a new store build, not an OTA update,
  per `003-mobile-app-foundation/architecture.md` §6's existing policy. Worth flagging now: **even
  the "safe," foreground-only version of this feature cannot ship via OTA alone** the first time it's
  added, because `Info.plist`/`AndroidManifest.xml` permission strings are native config.

---

## 7. Follow-Up Tracker

| ID | Item | Owner | Blocks | Status |
|---|---|---|---|---|
| **GPS-SD-01** | Stage 1 business requirements for self-device location tracking, scoped to smartphone only per §1.2's recommendation. | `business-analyst` → `product-manager` | Everything below | Not started |
| **GPS-SD-02** | POPIA lawful basis + consent copy for self-device location collection; retention period ruling (feeds ADR-0006 §5 AUD-9's C-16(a) gap for this trail). | `compliance-specialist` | Any real permission request being shown to a customer | Not started |
| **GPS-SD-03** | Disposition: does self-device ingestion extend ADR-0006 as anticipated by its own "third-trail" text, or does the self-authenticated-ingestion trust boundary (§5(b)) warrant a new ADR? | `cybersecurity-architect` | Any backend design work on ingestion/read endpoints | Not started |
| **GPS-SD-04** | Ingestion endpoint contract, auth model, rate limiting, and last-known-location read composition (§3.3). | `backend-architect` | `mobile-engineer` implementation | Not started — depends on GPS-SD-01/03 |
| **GPS-SD-05** | Collection/schema design, retention enforcement, time-series storage strategy sizing (informed by Phase 1's on-demand-only volume). | `database-architect` | GPS-SD-04 | Not started — depends on GPS-SD-02 |
| **GPS-SD-06** | Whether/how self-device pings feed the same normalized ping schema as the future hardware-tracker pipeline (§3.1); geofencing/theft-mode applicability for a self-reported source. | `gps-integration-engineer` | Ingestion pipeline design coherence with Phase 2 hardware model | Not started |
| **GPS-SD-07** | Laptop self-tracking, if the platform owner still wants it after §1.2's feasibility finding, scoped as its own initiative (native desktop agent) rather than bundled here. | `product-manager` (scoping) → `solution-architect` (stack question) | A currently-nonexistent product surface | Deliberately not designed in this document |
| **GPS-SD-08** | UX/UI for the in-app consent primer screen and the honest "best-effort, not guaranteed" framing named in §0. | `ux-researcher` + `ui-designer` | Any customer-facing surface for this feature | Not started — depends on GPS-SD-02's confirmed copy constraints |

---

**Net summary:** the narrow slice — self-reported, foreground/on-demand location for **smartphone**
assets only, using Expo's standard (non-background) location permission — is architecturally sound
and does not require the hardware-vendor decision, an Expo eject, or background-location's heavier
store-review/battery/privacy cost. "Laptop" does not currently belong in this feature and is flagged
as a separate, unscoped initiative rather than assumed to work the same way. Nothing here is
authorized to build: Stage 1, a compliance lawful-basis ruling, and a `cybersecurity-architect`
disposition on ADR-0006's scope all have to land first, per §5 and the tracker above.
