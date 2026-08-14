# Feature 008 — Self-Device Location Tracking for Smartphone Assets

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst`
**Contributors:** `product-manager` (plan-tier/marketing calls flagged below), `compliance-specialist` (POPIA lawful basis/retention — running in parallel, not concluded by this document), `cybersecurity-architect` (ADR-0006 scope disposition — running in parallel, not concluded by this document)
**Status:** Draft — Stage 1 minimum to close `GPS-SD-01` from `architecture.md`'s Follow-Up Tracker. Scoped to **smartphone assets only**, foreground/on-demand capture only, per the architecture document's Phase 1 recommendation. **Does not authorize development** — Stage 8 (`cybersecurity-architect`) and the compliance lawful-basis ruling are separate, still-open gates (see §0 and §9).
**Related system areas (RACI):** none built yet — no backend endpoint, no mobile screen, no database collection exists for this feature. This document specifies requirements against a feature that is entirely unbuilt.
**Reads on:** [`architecture.md`](./architecture.md) (this feature's `mobile-architect` design proposal — §0 trust-model framing, §1 scope boundary, §2.3 permission-tier recommendation, §5 open questions this document rules on), [`002-landing-page/business-requirements.md`](../002-landing-page/business-requirements.md) §12.1 (safe/unsafe insurance-marketing language — the binding source for §6 below, not restated as new authority), `HANDOFF.md` (MP-3 precedent on not inventing commercial rules; FU-A14 on the missing GPS location-access audit trail), [`004-policy-asset-management/business-requirements.md`](../004-policy-asset-management/business-requirements.md) §5 (D-01/D-02 tier/pricing deferral pattern this document follows), [ADR-0006](../../organization/adr/0006-privileged-access-audit-correlation.md) §5 AUD-9 (third-trail rule for GPS location access — not satisfied here).

---

## 0. Status banner — read this before anything else below

This document rules on the **product/business-requirements questions** `architecture.md` §5(c) and its Follow-Up Tracker (`GPS-SD-01`) explicitly left for `business-analyst`/`product-manager`. It does **not** rule on, and does not pre-empt:

- **`GPS-SD-02` — POPIA lawful basis, consent copy, and retention-period ruling.** `compliance-specialist` review is reported as running in parallel this session. Nothing in this document should be read as a substitute for that ruling — §5 below specifies customer-facing *behavior* expectations that are business-analyst's to set, while explicitly leaving the *numeric retention/purge period* and *lawful basis* to `compliance-specialist`, exactly as `architecture.md` §5(a) and ADR-0006's C-16(a) gap require.
- **`GPS-SD-03` — whether self-device ingestion extends ADR-0006 as written or needs its own ADR.** `cybersecurity-architect` disposition is reported as running in parallel this session. This document assumes neither answer; §4 and §9 name the dependency without resolving it.
- **Stage 8 (Security Review) or Stage 10 (QA) sign-off.** Not requested, not implied. Per root `CLAUDE.md`, both are hard gates for this project and are not satisfied by a Stage 1 document.

Per `architecture.md`'s own opening framing and this project's standing MP-3 precedent ("no business rules may be invented to unblock delivery"), this document rules only on what `business-analyst`/`product-manager` actually have authority over — scope, plan-tier gating posture, and customer-facing behavior/marketing-language rules — and explicitly flags rather than invents anything that belongs to `compliance-specialist`, `cybersecurity-architect`, `database-architect`, or `backend-architect`.

---

## 1. Business goal

Customers who register a `smartphone`-type asset today (Feature 004, live) have no way to see where that phone is if it's lost or stolen, because GPS tracking for every asset type — including phones — has so far been designed only around a hardware tracker unit that doesn't exist yet (no vendor selected, no ingestion pipeline; `HANDOFF.md`). `architecture.md` identifies a narrower, hardware-independent slice: for the one asset type that can run this platform's own mobile app — the phone itself — the app can ask the OS for the phone's own location and report it as that asset's position, with no tracker hardware involved.

This document specifies, for that narrow slice only, what the feature does for a customer, what it explicitly does not do, whether it's gated by plan tier, what "last known location" honestly means once a phone goes dark, and the acceptance criteria a Phase 1 build would need to satisfy — so that if/when `cybersecurity-architect` (§9) and `compliance-specialist` (§9) clear their respective gates, `backend-architect`/`database-architect`/`mobile-engineer` have an unambiguous Stage 1 spec to build against instead of an architecture sketch alone.

**This document does not commit the platform to shipping this feature.** Per `architecture.md` §5(c) and this role's own decision-making boundaries, ratifying that self-device tracking is worth building at all is `product-manager`'s call, informed by this spec — not something a Stage 1 document self-authorizes.

---

## 2. What this feature does, and what it explicitly does not do

### 2.1 What it does (Phase 1 scope, if approved)

- **FR-SD-01:** For a registered asset with `assetType: smartphone`, a customer who has this platform's mobile app installed **on that same physical phone** may opt in to reporting that phone's own location as the asset's location.
- **FR-SD-02:** Location is captured **on demand and in the foreground only** — specifically, when the app is opened/foregrounded, or when the customer explicitly taps an "update location" action. No location is captured while the app is not running or is backgrounded. This matches `architecture.md` §2.3's recommendation and its Pre-Approval Checklist item on background permission (left unchecked, recommending against it for Phase 1).
- **FR-SD-03:** The customer can view their phone asset's **last known location** — the most recent successfully captured point — labeled with when it was captured (§5).
- **FR-SD-04:** Opting in requires the standard two-step consent pattern `architecture.md` §2.2 describes: an in-app primer screen before any OS permission dialog, then the OS's own foreground-location permission prompt. Opting out (revoking consent or denying/removing the OS permission) is always available and does not affect any other part of the customer's policy, other assets, or account standing.
- **FR-SD-05:** This is a **single-asset, single-phone feature.** The app does not report location for any asset other than the `smartphone` asset the app itself is installed on running on.

### 2.2 What it explicitly does not do

Stated plainly because `architecture.md` §0 identifies this as the load-bearing fact that has to shape every customer-facing surface of this feature, not an engineering footnote:

- **No continuous or background tracking.** The app does not report location on a schedule, does not run a background service, and does not use iOS "Always" or Android `ACCESS_BACKGROUND_LOCATION` permission in Phase 1 (FR-SD-02).
- **No live map showing real-time movement.** There is no "watch the dot move" experience. A customer sees a single last-known point and when it was captured — never a continuously updating position, a route history, or a "currently moving" indicator.
- **No guarantee of recovery, and no guarantee the feature keeps working after a theft.** Self-device tracking depends on the phone being powered on, network-reachable, not factory-reset, and still running the app with permission intact — conditions a person who has stolen the phone has every means to defeat in seconds (`architecture.md` §0). This feature is a best-effort, pre-theft/immediately-post-theft convenience, not a recovery mechanism the platform can promise will work once a theft has actually occurred. §6 below governs how this must be worded to customers.
- **No coverage of laptop, tablet, TV, desktop, vehicle, business equipment, or `other_electronics` assets.** Per `architecture.md` §1.2's feasibility finding, "laptop" does not belong in this feature's Phase 1 scope — see §7.
- **No claims or recovery-workflow integration beyond what already exists.** This feature does not create, modify, or gate any claim-eligibility rule (none exist yet — Feature 004 D-08 remains open) and does not wire into the existing `recovery_cases`/security-company case API beyond what §9 flags as `cybersecurity-architect`'s and `backend-architect`'s open dependency.
- **No new audit/access trail for who reads a customer's location data.** That is ADR-0006's "third-trail rule" (AUD-9) and FU-A14's open gap — unresolved, not something this document can close (§9).

---

## 3. Plan-tier gating — Phase-1-minimal ruling

**The question `architecture.md` §5(c) poses:** is self-device tracking available on every plan tier, or a differentiator reserved for a specific tier (`starter` / `standard` / `enterprise`, per `backend/src/repositories/plan-catalog.ts`)?

### 3.1 Ruling: BR-SD-01 — no plan-tier gating in Phase 1

**If and when this feature is built, it is available identically on every plan tier the customer's phone asset is already covered under. No new tier-based eligibility check is added.**

This is a Phase-1-minimal ruling, not a pricing decision, and it follows the same reasoning this project has already applied to MP-3 (no invented business rules to unblock delivery) and to Feature 004 §5 D-01/D-04 (no tier differentiation invented ahead of a ratified tier catalog with real feature differentiation):

- The live plan catalog seed (`plan-catalog.ts`) already lists **"GPS-assisted recovery when hardware is paired"** as an identical feature bullet on both `starter` and `standard` — there is no existing precedent anywhere in this platform's shipped commercial copy or schema for gating a recovery-support capability by tier. Inventing one now, for this feature specifically, would be exactly the kind of invented commercial rule MP-3 and Feature 004 D-01 both warn against.
- No infrastructure exists to gate a *capability* (as opposed to an *asset count*, which `ASSET_LIMIT_REACHED` already enforces) by plan tier. Building that gate would be new product scope, not a Stage 1 default.
- Ungating by default costs nothing to reverse later: if `product-manager`/`cto` later decide self-device tracking should be a paid differentiator (e.g., reserved for `standard`/`enterprise`, or the reverse — a `starter`-tier retention hook), that is a strictly additive future change, not a breaking one, and does not require any Phase 1 design decided here to be undone.

### 3.2 What this ruling is not

This is **not** a pricing or packaging decision, and `business-analyst` does not have authority to make one (per this role's own charter: "does not have final authority over actual policy/pricing/coverage decisions — those originate from product-manager and executive stakeholders"). It is a **default absence of an invented gate**, stated explicitly so nobody builds a tier check by assumption, and so `product-manager` has a concrete default to override rather than a silent gap.

**Open for `product-manager`/`cto` (OQ-SD-01, §8):** should self-device tracking become a named tier differentiator once D-01's tier catalog work matures past its current Phase 1 state? Flagged, not decided.

---

## 4. Data model / backend note (non-binding — `backend-architect` / `database-architect` territory)

Not this document's authority to specify, named here only so Stage 1 acceptance criteria (§6) have something concrete to reference:

- Per `architecture.md` §1.3, the existing `Asset.gpsDeviceId`/`gpsPairedAt` fields (always `null` today — no hardware-pairing pipeline exists) are shaped for the hardware-tracker model and should **not** be repurposed to mean "this asset reports via its own phone." A distinct discriminator (illustratively `locationSource`) is `database-architect`'s call, not ratified here.
- Ingestion endpoint contract, authentication model (self-device pings ride the phone's own authenticated app session, per `architecture.md` §3.2), and rate limiting are `backend-architect`'s to design per this platform's MP-7 convention (every new endpoint carries an explicit rate limiter).
- Whether self-device ingestion is close enough to ADR-0006's AUD-9 "third-trail rule" to extend under it as written, or different enough (self-authenticated ingestion vs. independent hardware) to need its own ADR, is `cybersecurity-architect`'s call — `GPS-SD-03`, reported running in parallel this session, not concluded here.

---

## 5. "Last known location" — behavior specification

`architecture.md` §5(c) asks: what happens to "last known location" once the customer can no longer run the app on that phone — stolen, factory-reset, SIM/app removed? Is a stale position still shown, timestamped and clearly labeled as stale, or hidden?

This is answerable at Stage 1 as a **customer-facing behavior rule** — the numeric retention/purge period is not (§5.4 flags that split explicitly).

### 5.1 Definition — BR-SD-02

**"Last known location" means: the most recent location successfully captured by FR-SD-02's on-demand mechanism (app foreground/resume, or an explicit manual-refresh action), together with the timestamp it was captured at.** It is not an estimate, not an extrapolation, not a "probably still near here" inference, and not derived from any signal other than an actual OS location fix the app itself captured while it had permission and connectivity. If no fix has ever been captured, there is no last known location — the feature must say so honestly rather than showing an empty map or a default point.

### 5.2 Staleness behavior — BR-SD-03

The customer-facing display of a last known location **must always show, with equal prominence to the location itself, how long ago it was captured** — never a bare pin with no age. Concretely:

- **AC-SD-06** (below) governs the exact UI states, but the underlying rule is: a last-known-location display is always one of **"just now / recently updated"**, **"last seen [relative time] ago"**, or **"no location captured yet"** — never presented as if it reflects the phone's current position once meaningful time has passed since capture. What counts as "meaningful" (a specific staleness threshold in hours/days at which the UI's framing changes, e.g., from a neutral timestamp to an explicit "this may be out of date" warning) is a UX/product-copy decision for `ux-researcher`/`ui-designer`, informed by this rule, not invented here as a specific number.
- The app **never silently keeps polling or attempting to infer a fresher position** once it can no longer run on the device — that would require background capability §2.2 already rules out for Phase 1. The last captured point is simply what it says it is: the last time the app was able to check, before whatever happened next (theft, factory reset, app removal, or nothing at all — the customer just hasn't opened the app).
- **The app has no way to know why a location stopped updating** (customer just isn't opening the app vs. phone was stolen vs. phone is dead), so the UI must not guess or imply a cause. "Last seen 3 days ago" is honest; "your phone may have been stolen" is not something the app can infer from silence alone and must not be asserted from this signal.

### 5.3 What happens once the customer reports the phone lost/stolen

Reporting a phone stolen is itself outside this feature's built scope today (no theft-report workflow exists beyond the recovery-case scaffold noted in `HANDOFF.md`, and this document does not design that integration — §7). What this document *can* specify: **the last known location, once captured, is not deleted or hidden by the act of the app losing connectivity, being removed, or the device being reset** — it remains visible to the customer (subject to §5.4's retention period once that's ruled on) precisely because that stale point is the one piece of information most useful to a customer filing a police report or a future claim. Actively hiding it the moment it goes stale would remove the one thing this feature can honestly offer in the worst-case scenario it's least equipped to handle continuously.

### 5.4 What this document does not rule on

- **The numeric retention/purge period** for stored location history and the current "last known location" value — this is `compliance-specialist`'s ruling (`architecture.md` §5(a); ADR-0006's C-16(a) gap explicitly names "the location trail's retention period" as a `compliance-specialist` call for GPS data generally, and this feature's data is the same class). Not invented here.
- **Whether location history (not just the single last-known point) is stored at all**, and if so, its storage strategy — `database-architect`'s call per `architecture.md` §3.3, informed by whatever volume a foreground/on-demand-only Phase 1 slice actually produces.
- **Who besides the asset's own owner can read this data, and under what audit trail** — ADR-0006 AUD-9 / FU-A14, unresolved (§9).

---

## 6. Marketing / customer-facing claim language

Per `002-landing-page/business-requirements.md` §12.1 (the binding source for insurance-marketing claim rules on this platform — not restated as new authority here, only applied to this feature specifically), any copy describing self-device tracking is subject to the same safe/unsafe language rules already ratified for the landing page, with the added weight that this feature's own threat-model analysis (`architecture.md` §0) makes several otherwise-generic "unsafe" phrasings especially misleading here.

### 6.1 SAFE language for this feature specifically (consistent with §12.1.1)

- "See your phone's last reported location when you open the app."
- "Help find a misplaced or lost phone using its own location, when you check the app."
- "Best-effort, on-demand — not continuous, real-time tracking."
- "Capture your phone's last known position before it goes offline."
- "Recovery support depends on the phone staying powered on, connected, and running the app."

### 6.2 UNSAFE language for this feature specifically (prohibited, per §12.1.2, applied here)

- **"Track your phone 24/7" / "always know where your phone is" / "live location tracking."** Directly contradicts FR-SD-02/§2.2 — this is foreground/on-demand only, not continuous, and describing it as continuous is the exact present-tense capability overclaim §12.1.2(d) already prohibits platform-wide.
- **"We'll help you get your stolen phone back" as an outcome promise, or any construction implying recovery is likely once a theft has occurred.** §12.1.2(a)'s absolute-outcome prohibition applies with extra force here because `architecture.md` §0's own analysis is that this mechanism is *structurally* likely to stop working the moment a theft actually occurs (airplane mode, factory reset, app removal are trivial for a thief). Marketing this as equivalent to a hidden hardware tracker's recovery value would be a materially misleading comparison, not merely an unqualified benefit statement.
- **"GPS-tracked" applied to a laptop, tablet, TV, desktop, vehicle, business equipment, or `other_electronics` asset**, or any copy that implies this capability extends beyond `smartphone` assets (§7). This would misdescribe what the customer is actually getting for a specific piece of registered property.
- **Any framing that implies the existing plan-catalog copy — "GPS-assisted recovery when hardware is paired" — already covers this mechanism.** That existing copy describes only the hardware-tracker model; self-device tracking is a different mechanism and, per §3, ungated by tier. If this feature ships, the plan catalog's `features` copy needs a `product-manager`/`technical-writer` update to describe both mechanisms accurately rather than leaving self-device tracking undocumented or conflated with the hardware model — flagged as **OQ-SD-02** (§8), not fixed in this document.

### 6.3 Prominence rule applied here (per §12.1.3)

Wherever a benefit of self-device tracking is stated to a customer (in-app, in marketing copy, or in the §2.2-required consent primer), the "best-effort, foreground/on-demand only, not a guarantee" qualifier must appear with **comparable prominence in the same reading flow** — not a footnote or tooltip. The in-app consent primer (`architecture.md` §2.2 step 1, `GPS-SD-08`) is the single highest-stakes surface for this rule, since it is shown at the exact moment a customer is deciding whether to grant location permission believing it protects their phone.

---

## 7. Explicitly deferred

| ID | Item | Owner | Revisit trigger |
|---|---|---|---|
| **D-SD-01** | Laptop self-tracking (native desktop background agent) | `product-manager` (scoping) → `solution-architect` (stack question) | Platform owner confirms this is wanted as its own initiative, per `architecture.md` §1.2's feasibility finding. Not part of this feature. |
| **D-SD-02** | Continuous or periodic background self-device tracking | `product-manager` / `business-analyst` | A specific, researched customer benefit is named that justifies the background-permission tier's store-review, battery, and privacy cost (`architecture.md` §2.3, §4). Not a default escalation from Phase 1. |
| **D-SD-03** | Hardware-tracker asset types (vehicle, tablet, TV, desktop, business equipment, `other_electronics`) | `integration-architect` (vendor selection) | Unaffected by this document entirely — waits on the hardware GPS vendor decision, exactly as `HANDOFF.md` states. |
| **D-SD-04** | Claims/recovery-workflow integration beyond what already exists (`recovery_cases` scaffold) | `business-analyst` (Feature 004 D-08) + `gps-integration-engineer` | Claims eligibility Stage 1 work begins (Feature 004 D-08, currently unstarted). |
| **D-SD-05** | Security-company-facing read access to a customer's self-device location | `cybersecurity-architect` (ADR-0006 scope, §9) + `business-analyst` (a future Stage 1 pass) | `GPS-SD-03` resolves and a security-company read surface for this data is proposed. Not designed in `architecture.md` and not designed here. |
| **D-SD-06** | Plan-tier gating as a paid differentiator | `product-manager` / `cto` | D-01 tier catalog matures past Phase 1 (Feature 004 §5); see §3.2/OQ-SD-01. |
| **D-SD-07** | Numeric location-data retention/purge period | `compliance-specialist` | POPIA lawful-basis and retention ruling for GPS location data (`GPS-SD-02`, running in parallel). |
| **D-SD-08** | Ingestion endpoint contract, schema, auth model | `backend-architect` / `database-architect` | `GPS-SD-03` (ADR scope) resolves; `GPS-SD-02` (lawful basis) resolves. |
| **D-SD-09** | Push notification for "your device hasn't reported in N days" or similar staleness alert | `product-manager` (scoping) | Not designed in `architecture.md` §6 Pre-Approval Checklist (explicitly out of scope there) and not designed here. |

---

## 8. Open questions (for `product-manager` / `compliance-specialist` / `cybersecurity-architect`)

- **OQ-SD-01 (`product-manager`/`cto`):** Confirm or override §3's Phase-1-minimal "no tier gating" default. If a future tier differentiator is wanted, it re-enters this document as a ratified rule, not an assumption.
  → **RULED (2026-08-14, `product-manager`): CONFIRMED, not overridden.** See §11.1 (PM-SD-01).
- **OQ-SD-02 (`product-manager`/`technical-writer`):** If this feature is approved and built, the existing plan-catalog `features` copy ("GPS-assisted recovery when hardware is paired") needs updating to describe both the hardware-tracker and self-device mechanisms accurately, so customers aren't misled about which one applies to which asset. Not fixed in this document.
  → **RULED (2026-08-14, `product-manager`): copy must be corrected, at ship time, scope handed to `technical-writer`.** See §11.2 (PM-SD-02).
- **OQ-SD-03 (`compliance-specialist`):** Numeric retention/purge period for last-known-location data and any location history, and confirmed POPIA lawful basis (`GPS-SD-02`).
  → **Closed 2026-08-14 by `compliance-specialist`** in [`compliance-review.md`](./compliance-review.md) §5–§6, §11. Not re-ruled here — see §0/§11.0 of this addendum.
- **OQ-SD-04 (`cybersecurity-architect`):** Does self-device location ingestion extend ADR-0006's AUD-9 third-trail rule as written, or does its self-authenticated-ingestion trust boundary warrant a new ADR (`GPS-SD-03`)?
  → **Closed 2026-08-14 by `cybersecurity-architect`** in [ADR-0009](../../organization/adr/0009-self-asserted-location-ingestion-trust-boundary.md) §0, §3, §5 (own ADR — SDL-1…12). Not re-ruled here — see §0/§11.0 of this addendum.
- **OQ-SD-05 (`product-manager`):** Is a staleness-threshold push notification (D-SD-09) wanted at all, given it would require at least a periodic background check to know the app hasn't been opened — itself a §2.3 permission-tier question, or could be server-side ("no ping received in N days") once an ingestion endpoint exists.
  → **RULED (2026-08-14, `product-manager`): NOT in Phase 1 scope, either implementation path.** See §11.3 (PM-SD-03).

---

## 9. Acceptance criteria — Phase 1 slice (not authorized to build yet)

These are written testable now so that **if and only if** `GPS-SD-02` (compliance) and `GPS-SD-03` (ADR/security scope) both clear, `backend-engineer`/`mobile-engineer`/`qa-architect` have an unambiguous spec — not a green light to start today.

**AC-SD-01: Opt-in requires the two-step consent pattern, in order**
```
Given a customer has a registered smartphone asset and the app running on that same phone
When they navigate to the asset's location-tracking opt-in
Then the in-app primer screen is shown first, stating what is collected, how often, and why
And the OS foreground-location permission dialog only fires after the customer proceeds past the primer
And declining the OS prompt leaves the asset exactly as before — no partial/broken opt-in state
```

**AC-SD-02: Location is captured only in-context, never silently**
```
Given a customer has opted in to self-device tracking for their smartphone asset
When the app is opened or foregrounded, or the customer taps an explicit "update location" action
Then a single on-demand location fix is captured and stored as the new last-known-location value
And no location fix is captured at any other time, including while the app is backgrounded or closed
```

**AC-SD-03: Last known location display is always honest about age**
```
Given a smartphone asset has at least one captured location fix
When the customer views that asset's location
Then the display shows the captured coordinate/area and, with equal prominence, how long ago it was captured
And the display never implies the position is the phone's current real-time location
```

**AC-SD-04: No location ever shown before one has been captured**
```
Given a customer has opted in but the app has not yet successfully captured any location fix
When the customer views that asset's location
Then the UI states plainly that no location has been captured yet
And no default, estimated, or placeholder coordinate is shown
```

**AC-SD-05: Feature is available identically across plan tiers**
```
Given two customers on different plan tiers (e.g., starter and standard) each with a registered smartphone asset
When each attempts to opt in to self-device tracking
Then neither is blocked or restricted by plan tier
And no tier-specific messaging implies the feature is a paid upgrade, per BR-SD-01
```

**AC-SD-06: Opting out is always available and has no side effects on other data**
```
Given a customer has previously opted in to self-device tracking
When they revoke consent in-app or remove the OS location permission
Then no further location fixes are captured
And the asset's policy status, other assets, and account standing are unaffected
And any previously captured last-known-location value's visibility follows whatever retention rule compliance-specialist ultimately rules on (§5.4) — not silently deleted by this action alone unless that rule requires it
```

**AC-SD-07: No claim of continuous tracking or guaranteed recovery appears anywhere in the flow**
```
Given any customer-facing copy for this feature (primer screen, opt-in screen, asset detail, marketing copy)
When that copy is reviewed against §6.1/§6.2
Then it uses only SAFE-language constructions
And contains no UNSAFE-language construction (continuous/"24/7"/"live tracking", recovery-outcome guarantees, cross-asset-type overclaim, or implying existing hardware-tracker copy already covers this mechanism)
```

**AC-SD-08: Scope is enforced to smartphone assets only**
```
Given a customer has registered assets of multiple types (e.g., a laptop and a smartphone)
When they look for the self-device tracking opt-in
Then it is offered only on the smartphone asset
And no equivalent opt-in appears on the laptop or any other asset type
```

---

## 10. Pre-Approval Checklist (`business-analyst` self-review)

- [x] Every acceptance criterion is testable (AC-SD-01 through AC-SD-08).
- [x] Edge cases enumerated: no-fix-yet state (AC-SD-04), opt-out with no side effects (AC-SD-06), staleness display (AC-SD-03, §5.2), scope leakage to non-phone assets (AC-SD-08).
- [x] Coverage limits and policy tier rules cross-checked — **N/A for this feature's own coverage numbers** (this document creates no coverage-limit rule); plan-tier gating specifically addressed and ruled ungated by default (§3), consistent with the current plan catalog's identical GPS-recovery copy across tiers.
- [ ] Compliance-specialist has reviewed rules touching cancellation, refunds, or regulated disclosures — **not yet; `GPS-SD-02` reported running in parallel this session, not concluded.** This document does not claim that review as complete.
- [x] Terminology matches the domain glossary and existing UI/help-center copy — "self-device tracking," "last known location," "on-demand," "foreground-only" used consistently with `architecture.md`; §6 cross-references rather than restates `002-landing-page/business-requirements.md` §12.1's authority.
- [ ] Spec reviewed with backend-engineer and database-architect for technical feasibility — **not yet; §4 names the open dependencies (`GPS-SD-03`, `GPS-SD-04`, `GPS-SD-05` in `architecture.md`'s tracker) rather than assuming feasibility confirmed.**
- [ ] QA has reviewed acceptance criteria and confirmed testability before development starts — **deferred to Stage 10 entry, consistent with lifecycle sequencing; not yet performed.**
- [ ] Product-manager has signed off that the spec matches intended product scope — **pending; OQ-SD-01, OQ-SD-02, OQ-SD-05 (§8) are open questions for that sign-off.**

**Net status:** Stage 1 minimum complete for the smartphone-only, foreground/on-demand self-device tracking slice `architecture.md` recommends. **This does not authorize development.** Three things must land first, none of which this document can substitute for: `compliance-specialist`'s lawful-basis and retention ruling (`GPS-SD-02`), `cybersecurity-architect`'s ADR-0006 scope disposition (`GPS-SD-03`), and `product-manager`'s sign-off on §8's open questions. Laptop tracking, hardware-tracker asset types, background tracking, and claims/security-company integration remain fully deferred per §7 — none of them are unblocked by anything in this document.

---

## 11. Product-Manager Addendum — Rulings on OQ-SD-01, OQ-SD-02, OQ-SD-05, and Stage 2 Go/No-Go

**Author:** `product-manager`
**Date:** 2026-08-14
**Appended to:** this document, following the pattern set by [ADR-0006](../../organization/adr/0006-privileged-access-audit-correlation.md) §16/§17 (ratification appended in the open, original text left standing) and this feature's own document set this session. **Nothing below edits §1–§10 above; §8's list now carries short pointer notes to this section, added the same way.**

### 11.0 Scope of this addendum, stated the way the task set it

This addendum rules on **OQ-SD-01, OQ-SD-02, and OQ-SD-05** — the three open questions in §8 that were explicitly routed to `product-manager`. It does **not** re-rule OQ-SD-03 (`compliance-specialist`'s lawful-basis/retention determination, closed in [`compliance-review.md`](./compliance-review.md)) or OQ-SD-04 (`cybersecurity-architect`'s ADR-scope disposition, closed in [ADR-0009](../../organization/adr/0009-self-asserted-location-ingestion-trust-boundary.md)). Both are treated here as closed facts this addendum builds on, not questions still open for this role.

One item beyond the three named OQs is ruled in §11.4 — flagged there as exactly that, not smuggled in as if it had been asked for. It surfaced while checking readiness for Stage 2 sign-off and leaving it open would have made the §11.5 go/no-go read dishonest.

### 11.1 OQ-SD-01 — Plan-tier gating (PM-SD-01)

**Ruling: CONFIRMED. §3's BR-SD-01 ("no plan-tier gating in Phase 1") is not overridden and is now ratified `product-manager` sign-off, not a default awaiting one.**

Reasoning, kept to what this role actually has authority to decide:

- `business-analyst`'s own reasoning in §3.1 is sound and I adopt it: the live plan catalog already carries identical GPS-recovery copy on `starter` and `standard` (`backend/src/repositories/plan-catalog.ts` lines 73, 88), there is no existing precedent anywhere in this platform's shipped commercial model for gating a recovery-support *capability* (as opposed to an asset-count limit) by tier, and no infrastructure exists to enforce such a gate today. Inventing one now would be exactly the invented-commercial-rule pattern MP-3 and Feature 004 §5 D-01/D-04 both stand against, and this role's own charter explicitly names that pattern as a risk to monitor, not a shortcut to take.
- **Per this task's own instruction and this project's MP-3 precedent, I am not inventing pricing specifics I have no authority to ratify.** If self-device tracking becomes a paid differentiator later (e.g., reserved for `standard`/`enterprise`, or a `starter`-tier retention hook), that requires (a) D-01's tier catalog maturing past its current Phase 1 state, (b) a specific commercial rationale, and (c) `cto`/executive-stakeholder involvement per this role's "shared authority with `cto`" and "no authority over ... final pricing" boundaries. None of that exists today, so none of it is decided today. **D-SD-06 in §7's deferred table stays open, with this ruling recorded against it as its current status: "confirmed default (PM-SD-01, 2026-08-14), not yet triggered."**
- This is a **default absence of a gate**, not a promise the feature will always be free of one. It costs nothing to reverse later, for the same reason `business-analyst` gave in §3.1: ungating now and adding a gate later is additive; gating now and un-gating later would mean walking back a customer-facing restriction, which is the more expensive direction.

**AC-SD-05 stands as written and is now testing a ratified rule, not an assumed one.**

### 11.2 OQ-SD-02 — Plan-catalog marketing copy (PM-SD-02)

**Ruling: the copy must be corrected — but not yet, and not by this document.**

Two separate calls, because the question conflates timing with content:

**(a) Timing — correct it when the feature ships, not before.** `backend/src/repositories/plan-catalog.ts`'s "GPS-assisted recovery when hardware is paired" describes only the hardware-tracker model. Rewriting it today to describe a self-device mechanism that does not exist in any shipped code would replace one inaccuracy (an unqualified bullet next to a mechanism with no ingestion pipeline) with another (describing a capability ahead of its own Stage 8/9). Per `002-landing-page/business-requirements.md` §12.1's binding present-tense-capability rule (cited by this document's own §6), that cuts the same way regardless of which feature the overclaim is about. The copy change is a Stage 12 (Documentation) deliverable for *this* feature, gated on the same Stage 8/9 sequence as everything else — not something to front-run at Stage 1/2.

**(b) A pre-existing issue, named so it is not lost, but explicitly not decided here.** Independent of Feature 008: `plan-catalog.ts`'s existing bullet already describes a conditional ("when hardware is paired") that can never currently be satisfied, since no hardware-pairing pipeline exists at all (`HANDOFF.md`). Whether that is itself worth a copy pass today is a **separate marketing-accuracy question, unrelated to this feature's build status**, and I am not ruling on it here — filing it as a new deferred item so it doesn't disappear:

| ID | Item | Owner | Revisit trigger |
|---|---|---|---|
| **D-SD-10** | Pre-existing plan-catalog bullet ("GPS-assisted recovery when hardware is paired") describes a conditional that cannot currently be met by any shipped mechanism, independent of Feature 008 | `product-manager` + `technical-writer` | Next scheduled marketing-copy accuracy pass, or the GPS hardware vendor decision landing (`integration-architect`) — whichever comes first |

**Content requirements for `technical-writer`, once (a)'s trigger fires:** the corrected copy must (i) describe both mechanisms distinctly rather than one bullet standing in for either, (ii) apply identically across every tier the feature is available on, consistent with PM-SD-01/§11.1's no-gating ruling — no tier-specific phrasing that implies self-device tracking is a paid upgrade, (iii) use only SAFE-language constructions per this document's own §6.1/§6.2 and `compliance-review.md` §8.3 (no "24/7," no recovery-outcome promise, no cross-mechanism conflation), and (iv) be short enough to survive as a single plan-catalog feature-list bullet without losing the "not guaranteed" qualifier's prominence — which may mean two bullets rather than one, or a single bullet with a linked detail screen carrying the fuller framing from `compliance-review.md` §8.2's primer draft. **The exact wording is `technical-writer`'s craft call, not ratified here** — consistent with how this document's own §6 treats primer/marketing copy as authored by others against its constraints, not written by `business-analyst` or `product-manager` directly.

### 11.3 OQ-SD-05 — Staleness-threshold notification (PM-SD-03)

**Ruling: NOT in Phase 1 scope, under either implementation path named in the question — and D-SD-09 stays deferred with no owner assigned to build it yet.**

This is scoped narrowly on purpose — it rules on the **proactive notification** (a push or in-app alert that fires because N days have passed with no report), not on the **passive staleness display** `business-analyst` already ratified at BR-SD-03/§5.2 ("last seen X ago," shown with equal prominence to the location itself whenever the customer looks). BR-SD-03 stands, unaffected by this ruling, and is the correct home for anything about how staleness is *displayed*. This ruling is only about whether the platform should *proactively tell* the customer their device has gone quiet.

Reasoning:

- **The client-side path is foreclosed by ADR-0009 SDL-11, not merely inadvisable.** A periodic background check to notice "the app hasn't been opened in N days" is itself a form of background execution — the exact thing `architecture.md` §2.3/§4 and ADR-0009 §12's revisit trigger both treat as a distinct, heavier-cost decision (D-SD-02), not a Phase-1 default. SDL-11 goes further and makes it a technical impossibility as designed: the server-side scope lock constrains `triggeredBy` to the Phase 1 set with "no background value exists to write," specifically so a background variant "cannot arrive silently through a client update." Building a staleness check via client-side polling would mean building exactly the background capability this feature's own architecture and security design both declined to build.
- **The server-side path is foreclosed today by sequencing, not by a product objection.** A server-side "no ping received in N days" check requires an ingestion endpoint that records `receivedAt` server-side — `GPS-SD-04`/D-SD-08, not yet designed, gated on this very Stage 1/2 pass closing first. There is nothing to check staleness against yet. This is a temporary blocker, not a permanent one, and is named as a revisit trigger below rather than a rejection on the merits.
- **Even once an ingestion endpoint exists, a *push* notification is a materially bigger scope item than the question's framing suggests**, and not one this ruling opens by implication: it requires a notification event source Feature 007's own honesty table lists as "NOT BUILT" for GPS-adjacent events, and `mobile-architect`'s own Pre-Approval Checklist explicitly left "push notification deep-link contract" unchecked as out of scope for this slice. Building it would need its own Stage 1 justification under the same standard `architecture.md` §2.3 and `compliance-review.md` §9 both already apply to background self-tracking generally: a specific, named, researched customer benefit, not a default escalation from "we have the data, why not alert on it."

**Revisit trigger, stated so this isn't a dead end:** once `GPS-SD-04` (ingestion endpoint) ships and a real server-side `receivedAt` exists, a **passive, reactive** enhancement to BR-SD-03 — e.g., the existing "last seen X ago" label switching to a visually distinct (but still non-alarmist, per §5.2's "must not guess or imply a cause" rule) state past some threshold, computed at read time when the customer opens the screen, with no push and no background check — is a materially cheaper Phase 1.5 candidate than a notification, and may not even need a fresh Stage 1 pass since it is arguably already inside BR-SD-03's existing behavior spec once real timestamps exist. **A proactive push notification remains out of scope until a named, researched benefit is brought to this role**, consistent with D-SD-02's own standard for background tracking generally, and must additionally clear Feature 007's existing no-coordinates-in-payload rule if ever built (a staleness alert needs no coordinate, so this is achievable in principle — just not designed here).

**D-SD-09's table entry (§7) is updated in effect, not in place, by this ruling: owner remains `product-manager`; trigger is now explicit — "`GPS-SD-04` ships AND a specific researched benefit is named," not "designed in a future document" generically.**

### 11.4 One item beyond the three requested — C-008-4 (device-ownership scope), ruled because leaving it open would misstate readiness

`compliance-review.md` §5.4/C-008-4 surfaced, this session, an issue neither `architecture.md` nor this document's original text named: the design assumes account holder = phone owner = person carrying the phone, and that assumption fails for a family phone, an employee phone under a business-tier account, or a child's phone. Compliance routed the decision to `product-manager` + `business-analyst` jointly and gave an explicit recommendation ("restrict to the account holder's own, personally-carried device") rather than leaving it a blank question.

This was not one of the three OQs this addendum was asked to close. I am ruling on it anyway, narrowly, because it sits squarely in this role's own authority over feature scope (not pricing, not tier gating), the compliance analysis is already done, the recommended answer is low-cost and reversible, and *not* deciding it would leave `ux-researcher`/`ui-designer` designing Stage 3/4 consent-primer copy against an open question that changes what the primer has to say.

**Ruling (PM-SD-04): Phase 1 restricts this feature to a phone the account holder affirmatively confirms is their own device, personally carried by them.** Concretely:

- The in-app consent primer (`architecture.md` §2.2 step 1, `compliance-review.md` §8.2) must include an explicit attestation to that effect before the OS permission dialog fires — content requirement only; exact copy is `compliance-specialist`/`ux-researcher`/`ui-designer`'s to finalize, consistent with how this document treats primer copy throughout.
- **Family-member, employee-under-business-account, and child-phone use cases are explicitly out of Phase 1 scope** — not silently unsupported, but named as excluded, so a customer on an `enterprise`-shaped plan does not discover mid-flow that the feature quietly assumes something about whose phone it is.
- If business/family use is wanted later, `compliance-specialist`'s own routing stands: it is a **separate processing activity** requiring its own basis, its own notice to the actual data subject, and — for employees — a workplace-monitoring assessment nobody has done. Filed as a new deferred item:

| ID | Item | Owner | Revisit trigger |
|---|---|---|---|
| **D-SD-11** | Family/employee/child self-device tracking as a distinct processing activity, separate consent/notice design | `product-manager` + `business-analyst`, informed by `compliance-specialist` | A specific business or family-plan use case is named and prioritized; not a Phase 1 default |

This closes C-008-4's decision half. The disclosure/copy half remains `compliance-specialist` + `ux-researcher`/`ui-designer`'s, unchanged by this ruling.

### 11.5 Overall go/no-go read

**Ready to proceed to Stage 3 (UX Research) through Stage 7 (API Design). Not ready for Stage 8, and nothing in this addendum should be read as authorizing Stage 9 (Development).**

What actually closed this session, checked against the 15-stage lifecycle rather than restated from the upstream documents' own framing:

- **Stage 1 (Business Requirements) — complete.** `business-requirements.md` §1–§10, with OQ-SD-03/04 now closed by `compliance-specialist`/`cybersecurity-architect` and OQ-SD-01/02/05 closed by this addendum. OQ-SD-02's copy change and PM-SD-04's device-scope restriction are the only two items that reach forward into Stage 3/4/12 design/copy work, and both now have concrete rulings to design against rather than open questions.
- **Stage 2 (Product Planning) — this addendum discharges it, with one honest caveat.** Scope is fixed (smartphone-only, foreground/on-demand-only, ungated by tier, device-ownership-restricted); it sequences as an accelerated, narrower slice of the roadmap's **Phase 2 — GPS & Recovery** (`08-roadmap.md`) that does not wait on the hardware-vendor decision blocking the rest of that phase, per `architecture.md` §0's own framing. **The caveat: `technical-project-manager` has not yet confirmed this fits current sprint/release capacity** — this role's own Pre-Approval Checklist item 8 and Stage 2's exit criteria both require that before a "target milestone" is genuinely assigned, not just a scope. Recorded here as the one procedural (not content) gap: **scoped and prioritized, not yet scheduled.**
- **What does *not* block Stage 3–7 starting, named so nobody waits on it unnecessarily:**
  - **ADR-0009 is `Proposed`, not `Ratified`.** Per its own §0/§17, the SDL-1…12 requirements already bind design work today under `cybersecurity-architect`'s standing trust-boundary authority, independent of `cto` ratification — ratification is about the platform-wide ADR-level precedent, not a gate on this feature's design stages. Recommend `cto` ratification land no later than Stage 5 (Architecture Review), which `cto` co-chairs anyway, rather than treating it as a separate serial blocker.
  - **`security-engineer` and `compliance-specialist` concurrence on ADR-0009 (§15/§16) is outstanding.** This is a Stage 8 precondition, not a Stage 3–7 one — but both roles should be looped into Stage 5–7 work as it happens so their eventual concurrence isn't discovering new objections to a finished design.
  - **The various `SD-FU-0x` / `C-008-x` items assigned to `database-architect`, `backend-architect`, `authentication-engineer`** (consent-record mechanism, AUD-9 location trail, `recovery_cases` validator amendment, retention-purge scheduling, erasure endpoint) are **normal inputs to Stages 6–7**, not blockers to starting them — Stage 6 (Database Design) and Stage 7 (API Design) exist precisely to resolve items exactly like these.
- **What genuinely still blocks Stage 9 (Development) from ever starting, restated so it isn't lost under the "ready for design" verdict:** `security-engineer` + `compliance-specialist` concurrence and `cto` ratification on ADR-0009 (its own §14); the consent-record mechanism (`compliance-review.md` C-008-3, inherited from Feature 006's C-006-2); an account-closure/erasure endpoint (C-008-6); the AUD-9 location-access trail before any non-owner read ships (C-008-7/SDL-5); and Stage 8 Security Review itself, formally, against whatever Stage 5–7 actually produce. None of these are new — every one is already named in `compliance-review.md` §10 or ADR-0009 §11/§14. This addendum does not shorten that list or authorize skipping any item on it.

**Bottom line: nothing "from a product standpoint" is missing that should hold `backend-architect`/`database-architect`/`mobile-architect` back from starting Stage 5–7 design work informed by this document, `architecture.md`, `compliance-review.md`, and ADR-0009. The one open procedural step is `technical-project-manager` capacity confirmation, which is a scheduling question, not a scope question.**
