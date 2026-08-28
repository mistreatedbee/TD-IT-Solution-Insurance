# INC-001 — POPIA Exposure Assessment: Ungated Location Ingestion

**Owner:** `compliance-specialist`
**Date:** 2026-08-25
**Incident status at time of writing:** **CONTAINED, not closed.** Ingestion disabled by a fail-closed server-side kill switch (verified in code, §2.4). Data quarantined by `database-architect`, not deleted, specifically so this assessment could be made against evidence.
**Document status:** Compliance determination and **disposition ruling**. Binding on `database-architect`, `backend-engineer`, `backend-architect`, `mobile-architect` for the items in §9. **Not legal advice** — see §10 for what must go to admitted counsel rather than be decided here.

**This document also discharges [ADR-0009](../adr/0009-self-asserted-location-ingestion-trust-boundary.md) §16 — the `compliance-specialist` concurrence** reserved at §16 and held open as a blocking condition by `cto`'s ratification at §17.3(1). That concurrence was queued for later and has been pulled forward into this incident assessment. §8 below is the concurrence in full and is the operative text for ADR-0009's purposes.

---

## 0. Ruling, stated up front

1. **Yes — personal information was processed without a lawful basis.** POPIA s11(1)(a) consent was the required basis (ruled in advance, [`008/compliance-review.md`](../../features/008-self-device-gps-tracking/compliance-review.md) §5.1, 2026-08-14) and it was **not validly obtained**. This is not a technicality about a missing database column: the consent that was collected fails the *informed* limb and fails the *withdrawable* limb independently of any evidence problem, and the platform cannot evidence it at all. **Every location record written through `POST /v1/assets/:assetId/location-report` was written without a lawful basis.** Contraventions: **s11(1)** (no basis), **s17/s11(2)** (consent not evidenced, withdrawal not honourable), **s18** (notice materially incomplete and, in one respect, false), **s14** (no retention period enforced), **s13** (processing not confined to a specified purpose the data subject was told).

2. **POPIA s22 notification is, on current facts, most likely NOT engaged — and I am not closing that finding yet.** s22 triggers on *access or acquisition by an unauthorised person*. On what is verifiable in the repository, the coordinates went to the platform's own store over TLS, were readable only by the owning account, and reached no third party. That is unlawful processing by the responsible party, which s22 does not on its terms cover. **Three facts I cannot verify from here would flip this**, and they are `database-architect`'s and `security-engineer`'s to return (§6.3). Until they do, I am holding s22 **OPEN-PROVISIONALLY-NEGATIVE**, and the 72-hour-equivalent clock discipline in §6.4 runs as if it might be positive, because you cannot recover a missed notification window retrospectively.

3. **Separately from s22, if any affected data subject is a real customer, I require direct notification to that person** — under s18 fairness/transparency and the platform's own breach runbook, not under s22. See §6.5. That obligation stands even though s22 does not.

4. **Disposition: TIME-BOXED QUARANTINE, THEN MANDATORY PURGE OF ALL COORDINATES.** Not immediate deletion, not indefinite retention. Coordinates are purged irreversibly by **2026-09-08 (T+14 days)** or within 48 hours of the last §7.3 gate closing, whichever is sooner. `Asset.lastLocation` is nulled **immediately** — within 48 hours, ahead of the rest — because it is the one copy still readable through a live, un-killswitched endpoint. A **coordinate-free incident index** is retained for 12 months as the compliance record. Full reasoning at §7.

---

## 1. Scope, and why this document exists at all

ADR-0009 §14 said, in terms that were not boilerplate: *"This is a design-time architectural ruling. It is not a green light to build Feature 008, and no part of it may be cited as one."* `cto`'s ratification on 2026-08-24 recorded, as verified fact: *"no location ingestion endpoint exists, no consent record exists, no `expo-location` dependency exists."*

That statement was **already false when it was written**, or became false within hours of it. The code below is in the tree today. The gap between the ADR's ratified premise and the repository's actual state is the incident.

I am ruling on four things, in this order: **(a)** whether processing had a lawful basis; **(b)** who the data subjects actually are; **(c)** whether s22 fires; **(d)** what happens to the quarantined data. §8 then discharges ADR-0009 §16.

---

## 2. Verified facts — read in code on 2026-08-25, nothing carried from a planning document

### 2.1 The endpoint

`backend/src/routes/assets.ts:100-182` — `POST /v1/assets/:assetId/location-report`.

Middleware chain, in order: `authenticate` → `createRateLimiter(20 attempts / 900s, keyed on accountId)` → `validateBody(locationReportBodySchema)` → handler.

**What the handler checks:** kill switch; asset-id shape; account active; session has a `deviceId`; `capturedAt` parses.

**What the handler does not check, anywhere: consent.** There is no consent lookup, because there is no consent object to look up. Grep for a server-side location consent record returns nothing outside the mobile client's own device storage.

### 2.2 What was persisted

Two writes per accepted request:

- `backend/src/repositories/assets.ts:217-257` — `reportSelfDeviceLocation()` sets `locationSource: 'self_device'`, `reportingDeviceId`, and **`lastLocation` (lat/long/accuracy/recordedAt)** on the `assets` document.
- `backend/src/repositories/location-events.ts:70-86` — appends a row to the **`location_events`** collection: `accountId`, `assetId`, `latitude`, `longitude`, `accuracyMeters`, `recordedAt` (device-claimed), `receivedAt` (server), `source`, `triggeredBy`, `deviceId`.

Collection validator: `backend/src/db/location-events-collections.ts`. Note for the record: it has **no TTL index** — only two compound query indexes. Nothing expires. Nothing purges.

### 2.3 Provenance (SDL-1) — absent, and the fairness point is correct

`source: 'self_device'` is **hardcoded server-side** at `backend/src/routes/assets.ts:172`. The client cannot set it; `locationReportBodySchema` does not accept it. **`assertionMode` does not exist at all** — not on the interface, not in the validator, not in the enum. The enum value is `'hardware'`, not ADR-0009's `'hardware_tracker'`.

**Stated plainly, because fairness matters in an incident report:** no attested or verified location record was ever mislabelled as self-asserted, and no self-asserted record was ever laundered into a stronger evidence class. There is no hardware pipeline, so there was nothing to confuse it with. **SDL-1 is breached in form — the immutable `assertionMode` discriminator is missing and must be backfilled before any future write — but the SDL-1 harm it exists to prevent did not occur.** This is a bypassed security gate and careless sequencing, not data-integrity fraud, and this assessment treats it as such throughout. It does not reduce the s11 finding, because the s11 finding is about consent, not provenance.

### 2.4 Containment — verified, and correctly built

`backend/src/config/env.ts:309-321` and `backend/src/routes/assets.ts:116-119`. The switch is fail-closed in the strict sense: only the exact string `"true"` enables ingestion; unset, blank, `"1"`, `"TRUE"`, or garbage all resolve to disabled, with a startup warning on an unrecognised value. It is evaluated **first in the handler**, before the asset-id shape is even parsed, so the write path is unreachable while it is off regardless of request contents.

I have reviewed this control and I am satisfied it stops the bleed for the **write** path. Two qualifications, one of which is material:

- **The read path is not killed.** `GET /v1/assets/:assetId/location` (`assets.ts:184-209`) has no kill switch and continues to serve `Asset.lastLocation` from whatever was already written. Unlawfully-obtained coordinates therefore **remain live-readable today**. This is why §7.4 orders `lastLocation` nulled ahead of everything else rather than as part of the general purge.
- The switch is an environment variable, i.e. a deployment-state control, not a code-state control. It is confirmed live in production; it is not confirmed live anywhere else, and a `LOCATION_INGESTION_ENABLED=true` in any other environment pointed at the same Atlas cluster reopens it. **INC-001-C-1.**

### 2.5 The client side — where the consent actually failed

- `mobile/app/(app)/_layout.tsx:24` mounts `useLocationReporter()` in the **authenticated app shell** — i.e. on every screen for every logged-in user.
- `mobile/src/location/useLocationReporter.ts:38-58` fires a capture on **mount and on every background→foreground transition**, gated only by device-local state.
- `mobile/src/location/consent.ts` — the entire consent mechanism is two **SecureStore** keys on the handset. Device-local, client-side, not transmitted, not evidenced, wiped by a reinstall.
- `mobile/src/screens/assets/AssetDetailScreen.tsx:109-137` — the accept handler: request OS permission, set local consent, link the asset, **immediately fire a location report**.
- `mobile/src/location/LocationConsentModal.tsx` — the primer copy.

### 2.6 The primer copy, measured against the s18 elements I specified on 2026-08-14

[`008/compliance-review.md`](../../features/008-self-device-gps-tracking/compliance-review.md) §8.1 set eight mandatory elements and §8.2 supplied draft copy. What shipped:

| s18 element required (§8.1) | In the shipped modal? |
|---|---|
| 1. What is collected — precise GPS location + accuracy | **Partial.** "this phone's location". Neither "precise/GPS" nor accuracy stated |
| 2. When — only on app open / manual tap, never background | **Yes.** "while the app is open… We never track in the background." Accurate |
| 3. Purpose (s13) | **No.** The modal never says *why*. Not one clause of purpose |
| 4. Voluntary, and declining costs you nothing | **No.** Absent |
| 5. Who else receives it, and in which country (s72) | **No.** Absent entirely |
| 6. How long it is kept | **No.** Absent entirely — and there is no answer to give, because nothing purges |
| 7. Withdrawable at any time, as easily as given | **Stated, and false.** See below |
| 8. s23/s24 rights; right to complain to the Information Regulator | **No.** Absent |

**Two of eight.** And element 7 is worse than merely missing. The modal says: *"You can turn this off anytime from the asset detail screen."* **There is no off switch on the asset detail screen, or anywhere else in the app.** `AssetDetailScreen.tsx:286-307`: when `trackingActive` is true the only rendered control is **"Update location now"**. `clearLocationTrackingConsent()` exists in `consent.ts:22` and **is called from no screen** — only from its own unit test. `handleConsentDecline` (`:139-142`) is reachable only from the modal, i.e. only before opting in, never after.

A consent notice that promises a withdrawal mechanism the product does not have is not an incomplete notice. It is an **inaccurate** one, and §8.3 of my 2026-08-14 review already ruled on exactly this mechanism: an inaccurate notice defeats the *informed* limb of the consent it is attached to.

### 2.7 The governance route the work took

`backend/src/db/location-events-collections.ts:2` and `backend/src/repositories/location-events.ts:2` both label this **"Feature 009 Phase 5"**. Feature 009 is `docs/features/009-customer-experience-redesign/` — a customer-experience redesign, with a Stage 8 artefact (`08-qa-security-accessibility.md`) that no reviewer would open expecting to find a new trust boundary and the platform's first stored coordinate.

Meanwhile **Feature 008** — the feature this code actually is — was hard-gated by its own ADR's §14, by `HANDOFF.md:343`, and by twelve outstanding conditions in my own review.

I record this because the s11 finding is *what* went wrong and this is *how*. Location ingestion did not defeat Feature 008's gate; it **walked around it under a different feature number**. `07-tracking-provider-architecture.md` sitting inside a UX-redesign folder is the same drift pattern, and any remediation that only fixes the consent object and not this routing will be re-run by the next feature. **INC-001-C-9.**

### 2.8 Volume and density

The rate limiter (`backend/src/lib/policy.ts:123-126`) permits **20 reports per 15 minutes per account** — a ceiling of ~1,920 points per account per day. Actual density is governed by app-open frequency, so real volume will be far lower, but **the ceiling is what the exposure assessment has to assume until `database-architect` returns actual counts.** At the ceiling, this is a continuous movement history — precisely the "derived behavioural profile" class at §3 of my 2026-08-14 review (home address, workplace, routine, **when the house is empty**), and precisely the collection profile that §9 of that review ruled must never be built without a fresh basis and fresh consent (C-008-10).

---

## 3. Regulatory applicability — re-determined for this incident, not inherited

| Regime | Applies to INC-001? | Determination |
|---|---|---|
| **POPIA (Act 4 of 2013)** | **Yes — primary** | Unchanged footprint (ZAR pricing, `.co.za`, SA-resident data subjects). Coordinates tied to an identified account holder are personal information under s1 without argument. Conditions engaged: **s8** (accountability), **s9–s11** (lawful basis), **s13** (purpose specification), **s14** (retention), **s17** (documentation), **s18** (notification to data subject), **s19** (security safeguards), **s22** (notification of compromise — §6), **s23/s24** (access and deletion rights the platform currently cannot service) |
| **GDPR** | **Not established** — reconfirmed | No EU-resident data subject identified, no EU-currency pricing, no EU-directed marketing. Recorded as assessed-and-negative for this incident specifically. **This is the one determination most exposed to being wrong on a fact I cannot see**: a preview APK is distributed out-of-band and the platform has no residency attestation at signup. If `database-architect`'s inventory surfaces an account with an EU-resident data subject, **GDPR Art. 6 (no lawful basis), Art. 33 (72-hour regulator notification) and Art. 34 apply and the timeline in §6.4 becomes a hard legal deadline rather than a discipline.** **INC-001-C-2** makes residency a mandatory field of the inventory return |
| **PCI-DSS** | **No** | No cardholder data anywhere in this data flow. Scope unchanged and unaffected |
| **Insurance-sector recordkeeping (FAIS/PPR/Insurance Act)** | **No** | No policy is activated on this platform, so no record-of-financial-service retention **floor** attaches. **This is load-bearing for the disposition at §7**: there is no statutory obligation pulling in favour of retention. s14 leaves a ceiling only |
| **RICA** | **No** | Location captured by an app on the customer's own device with an OS permission is not interception, and nothing was sought from a network operator. C-008-9's standing prohibition is untouched and — noted because incidents are exactly when it gets proposed — **still absolutely applies to any "let's ask the MNO" idea during recovery** |
| **PSIRA** | **No** | No partner organisation received any location value. `/v1/security/cases*` exposes `lastLocationAt` (a timestamp) but no coordinate. **Confirm as part of the inventory** — if any partner-org read touched a coordinate, SD-FU-05's missing audit trail means we could not prove otherwise, which is itself the finding |
| **POPIA s57 (prior authorisation)** | **No** | Nothing here is a s57 category on current facts |
| **s72 (transborder flow)** | **Unresolved, and it was unresolved before this incident too** | MongoDB Atlas region is not confirmed anywhere in this repository. If the cluster sits outside South Africa, every coordinate written was also an unnotified transborder flow, and the s72(1)(a) binding-agreement analysis from `compliance-review-supabase.md` §4.3 applies. **INC-001-C-3** — `cloud-infrastructure-architect` confirms the Atlas region. This compounds the finding; it does not change the disposition |

---

## 4. Lawful basis — the finding

### 4.1 Was s11(1)(a) consent the required basis?

**Yes, and this was ruled in advance, not reconstructed after the fact.** [`008/compliance-review.md`](../../features/008-self-device-gps-tracking/compliance-review.md) §5.1 (2026-08-14): *primary basis s11(1)(a) consent; subsidiary s11(1)(d) for the narrow window of an active recovery only.* §5.2 rejected the alternatives on the record:

- **s11(1)(b) (contract necessity)** — rejected, and it remains rejected here. The feature is opt-in on every tier; a customer holds and claims on the identical policy without it. Processing a customer may decline with no contractual effect is by definition not *necessary* for that contract. **This is the basis someone will reach for retrospectively to argue "we were covered." It is not available.**
- **s11(1)(f) (responsible party's legitimate interest)** — rejected deliberately in §5.2 precisely because adopting it would let the platform switch location collection on **without asking**. That is, exactly, what happened. The convenient basis was rejected on the record *before* the conduct occurred, which removes any argument that the rejection is hindsight.
- **s11(1)(d) (data subject's legitimate interest)** — subsidiary only, and only *once a recovery is under way*. No recovery case existed for any of this data. Not available.

So: consent was required.

### 4.2 Was valid consent obtained?

**No.** POPIA s1 defines consent as *"any voluntary, specific and informed expression of will"*; s11(2)(b) gives an unconditional right to withdraw. Four independent failures — and the point of enumerating them is that **fixing any one of them would not have saved this**:

**(a) Not informed — decisive on its own.** Two of eight s18 elements present (§2.6). Missing: purpose, retention, recipients, region, voluntariness, and the data subject's statutory rights. A person who is not told *why*, *for how long*, *to whom*, or *that they may say no at no cost* has not given an informed expression of will. My own §8.3 ruling of 2026-08-14 — that inaccurate notice invalidates the basis it is attached to — applies directly.

**(b) Withdrawal promised and not delivered — independently decisive.** §2.6. The notice affirmatively told the customer they could turn it off from a screen that has no such control. Consent that cannot be withdrawn is not consent under s11(2)(b), and telling someone it can be when it cannot is a distinct s18 accuracy failure on top.

**(c) Not evidenced — s17 and s8.** The only record of consent is a SecureStore key on the customer's own handset, under their control, wiped by reinstall, never transmitted. The responsible party holds **no** evidence that any given data subject consented. As §5.3(2) of my 2026-08-14 review put it: *a consent basis that cannot be evidenced is not a basis.* C-008-3 made this a hard precondition. It was not met. Under s8 accountability, the burden of demonstrating compliance is the responsible party's, and it cannot be discharged.

**(d) An OS permission grant was treated as the consent event.** `AssetDetailScreen.tsx:114-116` requests the OS permission *first*, then records local consent, then pings. §5.3(1) of my 2026-08-14 review ruled on this exact sequencing: the OS dialog is the *device owner* permitting an app to call a *sensor API*; POPIA consent is the *data subject* permitting a *responsible party* to process for a *specified purpose*. Different acts, different bodies of law. The instruction was: **never fire the OS dialog first and treat a grant as consent.** The shipped flow does that.

**Also absent, and each an independent condition breach:** step-up re-authentication on opt-in (SDL-9, C-008-3); out-of-band notification to the account holder (SDL-9); server-side per-call consent enforcement (SDL-3/SDL-4); any consent-state event on Trail A (SDL-4, SD-FU-06); any RoPA entry (C-008-12); any enforced retention (C-008-5); any erasure path (C-008-6).

### 4.3 Finding

> **Every location record written by `POST /v1/assets/:assetId/location-report` was processed without a lawful basis under POPIA s11.** The conduct is unlawful processing in contravention of s11(1), aggravated by s18 (incomplete and in one respect false notice), s17/s8 (no evidence of consent), s13 (no specified purpose disclosed), s14 (no retention period, no purge, no TTL) and s11(2)(b) (no withdrawal mechanism).
>
> **The s11(1)(d) subsidiary basis is not available retrospectively.** It attaches only within an active recovery. No recovery case existed. Nobody may argue after the fact that data collected without basis is retrospectively justified because it might one day help a recovery — that reasoning would swallow the consent architecture whole, and I refuse it here so it is refused on the record before someone proposes it in §7.

### 4.4 What does *not* worsen the finding

Stated for balance, because a compliance assessment that only accumulates is not an assessment:

- **Provenance labelling was honest** (§2.3). Nothing was mislabelled. `source: 'self_device'` was server-hardcoded and correct.
- **Authentication and scope-lock held.** SDL-3's auth boundary and SDL-11's `smartphone`-only, owner-only, active-asset-only server-side scope lock were **present and enforced** (`assets.ts:102`, `repositories/assets.ts:225-233`). No account wrote a location for an asset it did not own. No non-phone asset was tracked. Trust-on-first-use device binding (`reportingDeviceId`) was implemented and rejects a second device.
- **Foreground/on-demand only.** `triggeredBy` is constrained to `foreground_open | manual_refresh`; there is no background collection path. The single most consequential proportionality choice (§9 of my 2026-08-14 review) was honoured.
- **The rate limiter was present and privacy-sized** (MP-7/SDL-3) — 20/15min, not the default authenticated limit.
- **No coordinate leakage found on the paths I could check.** The error handler logs `requestId`/`code`/`message`/`stack`, not the body (`error-handler.ts:90`). The idempotency middleware hashes bodies to SHA-256 and is not in this route's chain anyway. Coordinates are in a POST body and a JSON response, never a URL path or query parameter (SDL-6 satisfied on that limb). **Not a clean bill of health** — SDL-6 compliance across logs, error envelopes and any Expo/analytics payload is `security-engineer`'s grep-able assertion to make, not mine (**INC-001-C-4**), and it is an input to the s22 finding at §6.3.

The honest characterisation is the one the task offered and the evidence supports: **a security gate was bypassed by careless sequencing, in a product that was otherwise built roughly the way the design said to build it — minus the one control that made the whole thing lawful.**

---

## 5. Who are the affected data subjects?

**I cannot answer this from the repository, and I will not guess.** `database-architect`'s parallel inventory is running; **no report exists under `docs/organization/incidents/` as at 2026-08-25** — this document is the first file in that directory. The determination at §6 and the deadline at §7 both turn on their return.

### 5.1 What the repository lets me infer (and its limits)

Circumstantial, and it points one way:

- The platform is pre-launch. The **Supabase DPA is unexecuted** (`HANDOFF.md:328`), which blocks real production identity data.
- `HANDOFF.md:125` records the standing position: *"not yet safe to expose to real customer data."*
- Admin surfaces are blocked from real customer data on SR-004-admin-2/4/5(d) (`HANDOFF.md:59`).
- Distribution was a **preview APK**, i.e. EAS `preview` internal distribution (`HANDOFF.md:377`), not a public store listing.
- There is no staging environment and **the same live Atlas project backs local dev** (MP-8, `HANDOFF.md:396`) — so "production" and "test" data are *co-mingled in one cluster* and cannot be separated by environment. This cuts the other way: it is why the inventory is necessary and why "it's probably all test data" is not a finding.

**Probable, not established: affected data subjects are internal/test accounts.** A preview APK is distributed to a controlled list, but it is distributed to *people*, and a real person's real coordinates are real personal information about a real data subject **even if the account they logged into was created for testing.** A staff member's home address inferred from a test account is a POPIA matter. I will not accept "test account" as equivalent to "no data subject."

### 5.2 What I require from `database-architect` — the inventory return

Against the quarantined `location_events` and the quarantined/pre-null `Asset.lastLocation`. **Aggregate and metadata only. Do not export coordinates to answer this, and do not paste a coordinate into a ticket, a chat message or a commit** (SDL-6; C-17's analogue).

| ID | Required return |
|---|---|
| **D-A-1** | Total row count in `location_events`; distinct `accountId` count; distinct `assetId` count |
| **D-A-2** | Per `accountId`: row count, first and last `receivedAt`, distinct `deviceId` count, distinct `triggeredBy` values. **This is the density measure and it drives severity** — 3 points is a smoke test; 400 points over ten days is a movement profile |
| **D-A-3** | For each `accountId`: is the underlying Supabase identity a **real person's account** or a synthetic/test account? Classify as `staff_test` / `staff_real_use` / `external_tester` / `real_customer` / `unknown`. **`unknown` is treated as `real_customer` for every purpose in this document** |
| **D-A-4** | For each account classified other than `staff_test`: is a **verified contact channel** (email) held, and is it deliverable? Notification under §6.5 depends on it, and production email delivery is still owner-blocked |
| **D-A-5** | **Residency indicator** for each affected data subject, to the extent any exists (billing country, signup metadata, phone country code). Drives the GDPR re-determination at §3. If nothing is held, say so — "we hold no residency data" is itself the answer and it is a finding |
| **D-A-6** | **Coarse geographic spread only** — count of distinct 1-decimal-degree (~11 km) cells per account. **Do not return coordinates, a map, a place name, or a reverse-geocode.** This is a proxy for "is this a movement profile or a single point," at the lowest resolution that answers the question |
| **D-A-7** | Any account where **`reportingDeviceId` differs** from the device binding on the account's other sessions — the SDL-10 signal that pings came from a device that is not the registered phone |
| **D-A-8** | **Reconciliation:** every `Asset.lastLocation` whose value has **no corresponding `location_events` row** (possible if the asset write succeeded and the event append failed — they are not transactional, `assets.ts:145-175`). Those are the only records for which nulling `lastLocation` destroys unique evidence, and they must be snapshotted into quarantine first (§7.4) |
| **D-A-9** | Confirmation that **`recovery_cases.lastLocation` / `lastLocationAt` remain `null` across all documents** (RR-5 / SD-FU-04 — the pre-positioned field with no provenance columns). If anything wrote them, the blast radius includes the partner-organisation surface and §3's PSIRA row is re-opened |
| **D-A-10** | Whether any **non-owner read** of any location value occurred — admin tooling, support, partner-org, direct database access, an ad-hoc query, an export, a screenshot. **Answer honestly including "we cannot tell," because SD-FU-05 and the absent AUD-9 trail mean we probably cannot.** This is the single most important input to §6 |

**D-A-10 and D-A-3 are the two that gate everything.** The others refine severity.

---

## 6. POPIA s22 — is notification engaged?

### 6.1 The statutory test

s22(1): *"Where there are reasonable grounds to believe that the personal information of a data subject has been accessed or acquired by any unauthorised person"*, the responsible party must notify **the Information Regulator** and **the affected data subject**.

The trigger is **access or acquisition by an unauthorised person**. It is not "any contravention of POPIA," and it is not "any incident." This distinction does the work here, and getting it right in both directions matters: over-reporting to the Regulator a matter that is not a s22 compromise is not a neutral act, and under-reporting one that is, is far worse.

### 6.2 Applying it

**Unlawful processing by the responsible party is not, by itself, a s22 compromise.** The platform collected data it had no basis to collect and stored it in its own database. Confidentiality was not breached by an outsider; *lawfulness* was breached by us. On its literal terms s22 does not reach that. The correct instruments for it are the s11/s18/s14 contraventions themselves, enforceable by the Regulator on complaint (s74) or assessment (s89), and the s99 civil liability that runs to the data subject **whether or not** s22 fires.

**Provisional finding: s22 is NOT engaged.** Conditional on §6.3.

### 6.3 The three facts that would flip it — and none is in my hands

| | Fact | Who returns it | Effect if positive |
|---|---|---|---|
| **F-1** | Any **non-owner access** to any location value — admin, support, partner, ad-hoc query, export, screenshot, backup restored to a less-controlled location (**D-A-10**) | `database-architect` + `security-engineer` | **s22 engaged.** Access by a person not authorised to access it — and we could not have authorised it, because there was no lawful basis for anyone to hold it. This is the most likely route to a positive |
| **F-2** | Any **coordinate egress** outside the platform boundary — a log aggregator, an APM/error-reporting service, an analytics event, a notification payload reaching Expo/Apple/Google, a map or geocoding provider (**INC-001-C-4**, SDL-6) | `security-engineer` | **s22 engaged** as disclosure to an unauthorised third party. I found no such path on the code paths I could read (§4.4), but a grep-verified negative across logging, error envelopes and any third-party SDK is required before I close this |
| **F-3** | The **preview APK** reached anyone outside the intended distribution list, such that a person other than the account holder could trigger or view another person's location | `mobile-architect` + `devops-engineer` | **s22 likely engaged.** The scope lock at §4.4 makes cross-account access unlikely, but distribution control is a fact about EAS and a link, not about code |

### 6.4 Timeline discipline while F-1…F-3 are open

s22(2) requires notification *"as soon as reasonably possible after the discovery of the compromise"*, subject only to a s22(3) deferral where a public body determines that notification would impede a criminal investigation. **POPIA sets no fixed hour count** — unlike GDPR Art. 33's 72 hours. "As soon as reasonably possible" is judged against when you *could* have known, not when you got around to concluding.

**Therefore, running now, from discovery:**

| | Deadline | Item |
|---|---|---|
| **T+0** | discovery | Kill switch live. **Done** |
| **T+48h** | **2026-08-27** | F-1/F-2/F-3 returned, or an interim return naming what is still unknown and why. `Asset.lastLocation` nulled (§7.4). Quarantine access restricted to named individuals with a logged reason |
| **T+72h** | **2026-08-28** | **s22 determination FINAL.** If positive → Regulator notification prepared and filed under s22(2)/(4) in the prescribed form, and affected data subjects notified. If negative → the negative is **recorded here with its reasoning and the evidence relied on**, per the success metric that 100% of gate decisions carry documented rationale |
| **T+7d** | **2026-09-01** | §6.5 direct notifications sent to any non-`staff_test` data subject regardless of the s22 outcome |
| **T+14d** | **2026-09-08** | **Purge executed** (§7). Purge certificate filed |

I am adopting a 72-hour internal deadline deliberately even though POPIA does not impose one: it is GDPR Art. 33's number, it is the number a Regulator will recognise as diligent, and if D-A-5 surfaces an EU-resident data subject it stops being a discipline and becomes a legal deadline that has already been running. **Choosing the tighter clock is free; discovering you needed it retrospectively is not.**

### 6.5 Notification to data subjects — required regardless of s22

**This is my ruling, not a statutory recital, and it holds even on a negative s22 finding.**

For every affected data subject classified as anything other than `staff_test` (D-A-3), including every `unknown`: **notify them directly.** Basis: s18's fairness and transparency duty (they were told materially untrue things about withdrawal and told nothing about purpose, recipients or retention), s23's right to know what is held about them, and the plain fact that they are entitled to know their precise location was collected and stored without a valid basis and is about to be destroyed.

The notice must, in plain language: say what was collected and over what dates; say the app collected it without the consent process it should have had; say what the platform got wrong (specifically: no purpose, no retention period, no working off switch); say what has been done (ingestion disabled, data quarantined, being deleted); give the deletion date; say whether anyone else saw it (per F-1/F-2 — and if the honest answer is "we cannot fully determine," **say that**); and give them the s23/s24 route and the right to complain to the Information Regulator.

**Do not send a notice that says "no personal data was affected."** It was. Precise location is the most sensitive class on this platform by the platform's own standard (`06-security-standards.md` line 28) and by my §3 classification of 2026-08-14. **Do not put a coordinate in the notification.** **Do not send it before D-A-4 confirms a deliverable verified channel** — production email delivery is still owner-blocked (Brevo/Resend), which is itself an incident-response gap worth its own follow-up (**INC-001-C-8**).

Draft copy is mine to supply on request; I have not pre-drafted it because its content depends on F-1's answer, and a template written before that fact is known is a template that will be sent with the wrong answer in it.

### 6.6 Finding

> **POPIA s22 notification to the Information Regulator and to data subjects is, on the facts verifiable from the repository, NOT engaged** — this is unlawful processing by the responsible party, not access or acquisition by an unauthorised person.
>
> **The finding is provisional and expires at T+72h (2026-08-28).** It flips to positive on any of F-1, F-2 or F-3. It is `database-architect`'s and `security-engineer`'s returns that close it, not mine.
>
> **Direct notification to every non-test affected data subject is required regardless**, by §6.5, on the s18/s23 basis rather than the s22 one, by 2026-09-01.
>
> **Whether to make a voluntary disclosure to the Information Regulator even on a negative s22 finding is a judgement call I flag to `cto` and to counsel (§10.3), not one I decide here.** My own view, recorded: on the current probable facts (pre-launch, internal testers, self-detected, contained same-day, purged inside 14 days, no third-party disclosure) voluntary disclosure is not proportionate. On a positive F-1 or a real-customer finding at D-A-3, it becomes proportionate quickly.

---

## 7. Disposition — purge or retain?

I own this decision. Here is the reasoning, not a default.

### 7.1 The argument for immediate purge

The data was collected without a lawful basis. **Under s14(1), continued retention of data whose purpose has ended — and a purpose that never lawfully began has certainly ended — is itself continued unlawful processing.** Every day it sits in Atlas is another day of contravention. s19 says the safest state for data you should not have is *not having it*. There is no insurance-recordkeeping floor pulling the other way (§3). The customer never validly agreed to its being held. **The default disposition for unlawfully-obtained personal information is destruction, and the burden is on anyone arguing otherwise.**

### 7.2 The argument against immediate purge — and why it wins for a bounded period

Three things, and only three:

1. **The affected-data-subject determination is not made** (§5). Destroy the data now and D-A-2, D-A-6, D-A-7 and D-A-8 become unanswerable — permanently. We could not then tell a data subject *what* was held about them, which is the one thing §6.5's notice must contain and the one thing s23 entitles them to ask.
2. **The s22 determination is not made** (§6). F-1 in particular may need the records themselves to establish what could have been accessed. **Destroying evidence while a notifiable-compromise assessment is live is indefensible** — to the Regulator, to counsel, and to the data subject. It converts a containable compliance failure into something that looks like concealment. That is the single strongest reason not to purge today, and it is why `database-architect`'s instinct to quarantine rather than delete was correct and should be recorded as such.
3. **s23 access requests.** A data subject told about this (§6.5) may reasonably ask what was held. A 14-day window lets that be answered before destruction, and the notice will tell them the deletion date so the choice is theirs.

**None of these justifies retaining coordinates one day longer than the assessment needs.** They justify a *time box*, and a time box only. In particular they do **not** justify: keeping the data because it might be useful later; keeping it to seed a future Feature 008; keeping it "in case the customer wants their history"; or any s11(1)(d) recovery argument, which §4.3 already refused in advance.

### 7.3 The gates

Purge executes when **all four** close, or at the hard deadline, whichever is sooner:

- **G-1:** D-A-1 … D-A-10 returned by `database-architect`.
- **G-2:** F-1, F-2, F-3 returned; s22 determination final and recorded (§6.4, T+72h).
- **G-3:** §6.5 notifications sent to all non-`staff_test` data subjects, or a recorded finding that no such data subject exists.
- **G-4:** No legal hold has been raised. A hold may be raised **only** by `cto` on counsel's advice, in writing, in this document, naming the proceeding it preserves for. **No other role may raise one, and "it might be useful" is not a hold.**

**Hard deadline: 2026-09-08 (T+14 days).** If the gates have not closed by then, **purge anyway** and record what was lost. The alternative — an open-ended retention justified by an investigation that is not finishing — is how unlawfully-held data becomes permanently-held data, and it is the exact risk on my own risk register.

### 7.4 The disposition

| Data | Disposition | Reasoning |
|---|---|---|
| **`Asset.lastLocation` (+ `locationSource`, `reportingDeviceId`)** | **NULL IMMEDIATELY — by 2026-08-27 (T+48h), ahead of everything else.** Snapshot into quarantine **first** any value with no corresponding `location_events` row (**D-A-8**) | This is the copy that is **still live-readable today** through `GET /v1/assets/:assetId/location`, which has no kill switch (§2.4). Unlawfully-obtained coordinates are being served on request right now. Every value is otherwise a duplicate of the most recent `location_events` row, so nulling it destroys no unique evidence once D-A-8 is reconciled. `reportingDeviceId` and `locationSource` go with it: they are the state that says "this phone is tracked," and leaving them set after the coordinate is gone leaves the asset in a phantom tracked state |
| **`location_events` — coordinate fields** (`latitude`, `longitude`, `accuracyMeters`) | **QUARANTINE, THEN PURGE** at G-1…G-4 or 2026-09-08. Irreversible field-level deletion or whole-document deletion. **No export, no backup copy, no "archive collection."** Access during quarantine restricted to named individuals, each access logged with a reason | The §7.1/§7.2 balance. The coordinate is the harmful payload and the behavioural profile; it has no lawful basis and no floor obligation. It is retained only as long as the assessment needs it, and not one day beyond |
| **`location_events` — non-coordinate fields** (`accountId`, `assetId`, `receivedAt`, `recordedAt`, `source`, `triggeredBy`, `deviceId`) | **RETAIN as the coordinate-free incident index for 12 months** — to 2026-09-08+12mo — then delete. Retained in a clearly-labelled incident structure, **not** in `location_events`, so nothing mistakes it for live domain data | This is the compliance record: which accounts, how many pings, over what window, from which device. It is personal information and I am not pretending otherwise, but it carries **none of §3's behavioural-inference risk** — timestamps without coordinates reveal app-usage times, not places. **Basis for retaining it: s14(1)(b)/(c)** — retention required to comply with the responsible party's obligations (s8 accountability; the ability to answer a Regulator enquiry, a s23 request, or a s99 claim about this incident). 12 months matches the audit-trail period I ruled at §6.1 of the 2026-08-14 review, so no new number enters the platform |
| **Backups / Atlas snapshots containing coordinates** | **Do not restore. Do not export. Let expire on the existing snapshot schedule; record that schedule here.** If any snapshot has a retention beyond 12 months, **INC-001-C-5** requires `cloud-infrastructure-architect` to confirm expiry and log it | The honest position on backups: selective deletion inside immutable snapshots is generally not possible, and pretending otherwise is worse than disclosing it. POPIA is satisfied by a documented, enforced expiry plus a no-restore rule; it is not satisfied by silence. **The notice at §6.5 must not claim "fully deleted" if snapshots persist — say "deleted from live systems and expiring from backups by [date]"** |
| **`recovery_cases.lastLocation` / `lastLocationAt`** | **Expected `null`. Confirm (D-A-9); if non-null, treat as in-scope and purge on the same schedule** | RR-5 / SD-FU-04. If anything wrote it, the incident is larger than assessed and §3's PSIRA row re-opens |
| **`app.account_audit_log` / existing identity trail rows** | **RETAIN, untouched** | Not in scope. Contains no coordinate. Deleting audit rows during an incident is never the right call |

### 7.5 Purge execution requirements

- **Evidenced.** A purge run record: who ran it, when, the count deleted per collection, and the resulting zero-count verification. Filed as an appendix here. **A purge nobody can prove ran is exactly the `app.purge_expired_audit_log()` failure this platform already has on the record** (`cto` §17.1/§17.2, my C-008-5) — and repeating it *in the remediation of an incident about missing controls* would be indefensible.
- **Verified independently.** `security-engineer` confirms zero coordinate documents remain in the live cluster, against the store, not against a script's own output.
- **Irreversible.** No `deleted: true` flag, no soft delete, no shadow collection, no CSV "just in case."
- **Certificate filed here** as §12 when done, and `HANDOFF.md` updated.

### 7.6 Disposition finding

> **PURGE — time-boxed, not immediate, and not open-ended.** `Asset.lastLocation` nulled within 48 hours because it is still being served. All coordinates in `location_events` irreversibly purged on gate closure or by **2026-09-08** at the latest, whichever comes first. A coordinate-free incident index is retained 12 months under s14(1)(b)/(c) as the accountability record. Backups let expire under a documented, no-restore schedule, and disclosed as such rather than papered over.
>
> **Retention beyond 2026-09-08 requires a written `cto` legal hold naming the proceeding it preserves for. Nothing else — not product interest, not a future Feature 008, not analytics, not "the customer might want it" — is capable of extending it.**

---

## 8. ADR-0009 §16 — `compliance-specialist` concurrence

**This section is the concurrence reserved at ADR-0009 §16 and held open as a blocking condition by §17.3(1). It is filed here rather than in the ADR because the incident materially changed the facts the concurrence had to be given against, and splitting them would leave the ADR asserting a state of the world that INC-001 disproved. ADR-0009 §16 should be updated to point here.**

### 8.1 Verdict

> **CONCUR — with the four conditions at §8.5, and with one correction to the ADR's factual record.**

I concur that SDL-1 … SDL-12 are the right requirements, that they are **necessary**, and that they are **not sufficient** — because a compliance requirement's satisfaction is my call (per this role's authority), and three of the things that made this processing unlawful are not in SDL-1 … SDL-12 at all (§8.3).

I concur specifically with the reasoning that produced them. §3(e)'s observation — that a phone reveals where a *person* is, continuously, because it is carried on the body — is correct and is the reason my §3 classification of 2026-08-14 put a **sequence** of points in a higher class than any single point. SDL-2's use-limitation is the right control and I endorse `cto`'s §17.3(3) standing constraint that it may not be relaxed by a product decision: from a POPIA standpoint, relaxing SDL-2 turns this from a s11 consent question into a **s71 automated-decision** question and, if a location series ever informs pricing or risk, a **s26 derived-special-information** question (C-008-1). Those are not adjacent problems; they are a different regulatory posture.

### 8.2 The correction to the ADR's factual record

ADR-0009 §17.4 records, as verified on 2026-08-24: *"no location ingestion endpoint exists, no consent record exists, no `expo-location` dependency exists, no location purge mechanism exists."*

**Three of those four were untrue at the time of writing or within hours of it.** The endpoint existed (§2.1); `expo-location` was in `mobile/package.json` (§2.5); real coordinates were in Atlas. Only "no location purge mechanism exists" and "no consent record exists" remained true — and those two being true while the first was false *is the incident*.

I am not amending the ADR; per its own precedent (§14's superseded bullet, ADR-0006 §17) the record is corrected by appending, not by rewriting. **RR-7 — "architecture drift: code landing ahead of a Stage 8 gate, given the platform's own recent record on Features 006 and 007" — was accepted as a residual risk on 2026-08-24 and materialised on the same data it was accepted for.** It should be re-scored: it is not a residual risk on this platform, it is the **observed default behaviour**, and controls that assume it will not happen should be replaced with controls that assume it will (§8.5, INC-001-C-9).

### 8.3 SDL-by-SDL

| | Requirement | Concurrence | INC-001 status |
|---|---|---|---|
| **SDL-1** | Server-derived, immutable `source` + `assertionMode` | **Concur.** `assertionMode` must be a stored field before any future write, not an implied constant | **Breached in form.** `source` hardcoded server-side and correct; `assertionMode` entirely absent. **No harm materialised** (§2.3) |
| **SDL-2** | Self-asserted data may not alone drive real-world/third-party/financial consequence | **Concur emphatically.** It is what kept this incident to a data-protection matter rather than a physical-safety one | **Held.** No dispatch, no claim, no pricing, no partner disclosure consumed any coordinate |
| **SDL-3** | Customer-authenticated write, per-call authorization including consent, rate-limited, fail-closed | **Concur** | **Partially breached.** Auth, ownership, scope and rate limiting **present**. The **consent conjunct was absent** — the one clause that made the endpoint lawful |
| **SDL-4** | Consent as a stored, server-side, auditable object; not an OS permission | **Concur — this is the load-bearing one, and I am strengthening it (§8.4)** | **Wholly absent.** Consent was two SecureStore keys on the handset (§2.5). Exactly the failure SDL-4 was written to prevent, and exactly the failure C-008-3 was written to block |
| **SDL-5** | Read side inherits ADR-0006 unchanged; non-owner reads are the AUD-9 third trail | **Concur** | **Not exercised, and not verifiable.** No non-owner read surface shipped — but with no AUD-9 trail and SD-FU-05 open, we cannot *prove* no non-owner read occurred. That inability is D-A-10 and is why F-1 gates the s22 finding |
| **SDL-6** | FLE evaluation before ingestion; no coordinates in logs/URLs/payloads | **Concur.** The evaluation (SD-FU-02) did **not** happen before ingestion shipped and remains outstanding | **Partially breached.** The evaluation was skipped. The prohibitions appear to have held on the paths I could read (§4.4), pending `security-engineer`'s grep (INC-001-C-4) |
| **SDL-7** | Server clock authoritative; device clock retained as a claim | **Concur** | **Satisfied.** `receivedAt` server-set (`location-events.ts:71,78`), `recordedAt` device-claimed and stored separately. Correctly built |
| **SDL-8** | Scheduled, evidenced purge before ingestion ships; period is mine | **Concur, and the period is supplied at §8.4 — SDL-8 no longer lacks a number** | **Breached.** No TTL, no scheduled job, no purge of any kind (§2.2). Ingestion shipped in precisely the state SDL-8's one sentence forbids |
| **SDL-9** | Step-up re-auth on opt-in; out-of-band notification; immediate opt-out; visible state | **Concur, and I am adding the POPIA consequence: opt-out is not a UX nicety, it is s11(2)(b)** | **Wholly absent.** No step-up, no notification, **and no opt-out control anywhere in the app** while the primer told customers one existed (§2.6) |
| **SDL-10** | Device binding recorded; device change requires re-consent | **Concur** | **Half-satisfied.** `reportingDeviceId` recorded and enforced trust-on-first-use. Re-consent on device change is meaningless where no consent object exists |
| **SDL-11** | Scope lock: `smartphone` only, foreground/on-demand only, server-enforced | **Concur** | **Satisfied.** Server-enforced (`repositories/assets.ts:225-233`); `triggeredBy` constrained to the Phase 1 set. **Correctly built, and it materially limited the damage** |
| **SDL-12** | Attestation not required in Phase 1 because SDL-2 holds | **Concur**, and I note the coupling worked exactly as designed: SDL-2 held, so RR-1's forgery exposure stayed academic | **N/A** |

**The pattern in that column deserves stating.** Every requirement about *building the pipe correctly* — auth, scope, rate limiting, server clock, device binding, honest provenance labelling — was **satisfied**. Every requirement about *the customer's rights over the data* — consent (SDL-4), withdrawal and notification (SDL-9), retention (SDL-8), the pre-ship privacy evaluation (SDL-6) — was **breached**. That is not random. It is what happens when location ingestion is delivered as Phase 5 of a *customer-experience redesign* (§2.7): the engineering requirements travel with the code, and the rights requirements travel with the feature gate that was routed around.

### 8.4 What the concurrence supplies that ADR-0009 left open

**(a) The lawful basis (SDL-3/SDL-4's premise).** **POPIA s11(1)(a) consent**, primary; **s11(1)(d)** subsidiary during an active recovery only. Ruled 2026-08-14, reaffirmed here, restated at §4.1 including why s11(1)(b) and s11(1)(f) are unavailable. **A negative determination would have ended the feature; this is not that. It is a positive determination with preconditions — and the preconditions were the point.**

**(b) The SDL-8 retention number.** Supplied, so SDL-8 can be satisfied. These are **ceilings, not floors**; nothing here obliges anyone to keep anything:

| Record | Period |
|---|---|
| "Last known location" — single current point per asset | Retained while opt-in active. **Deleted within 7 days** of opt-out, detected OS-permission revocation, asset deletion, or account closure — unless attached to an **open** recovery case or claim |
| Location **history** (a series beyond the current point) | **Preferred: none in Phase 1** — overwrite the single point. If `product-manager` names a specific purpose requiring history, the ceiling is **30 days rolling**, auto-purged. A s10/s13 minimality ruling, not a storage-cost one |
| Points linked to an **open** recovery case or claim | Life of the case **+ 12 months**, then deleted. Extendable only under an explicit recorded legal hold |
| AUD-9 location-access trail | **12 months**, matching Trail A and Trail B, with a case-linked legal hold crossing the store boundary (AUD-7(b)). Ruled, not inherited, per ADR-0006 §14.2(5). The deliberate asymmetry between the trail (12 months) and the data (7/30 days) is intended: the record of *who looked* legitimately outlives the data they looked at |

**Note against the shipped code:** `location_events` is an **append-only history collection with no TTL**. On the "preferred: none" ruling, the correct Phase 1 design has no `location_events` collection at all — just the overwritten point on the asset. If history is wanted, `product-manager` must name the purpose and the collection needs a 30-day TTL index from day one, not a promise.

**(c) The SDL-6 / SD-FU-02 field-sensitivity input.** My data classification stands (`008/compliance-review.md` §3): a coordinate is personal information at the **highest sensitivity tier on this platform**; a **sequence** is a derived behavioural profile — home, workplace, routine, when the house is empty. **Location is not s26 special personal information about the customer** (the s26 list is closed and location is not on it), but is handled at equivalent sensitivity as platform policy. It **may become** s26(b)(i) special information about a **third party** once a theft occurs and the person holding the phone is not the customer (§4.2 of that review, C-008-2). That is the input to the joint FLE evaluation; the encryption decision itself is `cybersecurity-architect`'s + `security-engineer`'s + `database-architect`'s.

**(d) Three requirements SDL-1 … SDL-12 do not contain, which INC-001 proves are load-bearing.** For `cybersecurity-architect` to file as SDL-13/14/15 or as amendments — the numbering is theirs, the requirements are mine:

- **A consent record that cannot be evidenced server-side is not consent.** SDL-4 requires a stored server-side object but does not say the *client* may not gate on its own local state. This incident is exactly that gap: a client-side consent check that looked like a control and was not one. **Client-side consent state may exist only as a UI cache of a server-side record, never as the authority.**
- **A withdrawal mechanism must exist and be reachable in the UI before the first opt-in is offered.** SDL-9 requires opt-out to take effect server-side immediately; it does not require that a customer can *find* it. A primer promising withdrawal, shipped without the control, is an inaccurate s18 notice and defeats the consent it collects. **This is the single most quotable failure in INC-001 and the cheapest to have avoided.**
- **The s18 notice content is a shipping gate, not copy.** Consent copy must be verified against the eight elements at `008/compliance-review.md` §8.1 by this role **before** the screen ships. Two of eight shipped. Nobody checked, because nobody was required to.

### 8.5 Conditions on this concurrence

This concurrence discharges ADR-0009 §16. It does **not** authorize Feature 008, does not close Stage 8, and is not legal sign-off. It is conditional on:

1. **INC-001 closed** — purge executed and certified (§7.5), s22 determination final and recorded (§6.6), §6.5 notifications sent.
2. **C-008-1 … C-008-12 unchanged and unreleased.** None is released by this document. C-008-3 (server-side consent record), C-008-5 (evidenced automated purge), C-008-6 (erasure path) and C-008-12 (RoPA) are **hard preconditions on the first location record**, and every one of them was breached by this incident. **They are mine to release and I have released none of them.**
3. **§8.4(d)'s three additional requirements filed** by `cybersecurity-architect` into ADR-0009 or `06-security-standards.md`.
4. **INC-001-C-9 (§9) satisfied** — the governance-routing fix. Without it the next feature repeats this under a different number, and a concurrence given into a process that permits the bypass is a concurrence given into nothing.

**If Feature 008 is ever re-approached, it starts at Stage 1.** The existing code is not a head start; it is a liability whose consent, retention, notice and withdrawal layers must be built before any part of it is re-enabled. Re-enabling the endpoint by flipping `LOCATION_INGESTION_ENABLED` at any point before conditions 1–4 close would be a fresh, knowing contravention rather than a careless one, and I would treat it as such.

---

## 9. Conditions register — INC-001

| ID | Condition | Owner | Deadline / blocks |
|---|---|---|---|
| **INC-001-C-1** | Confirm `LOCATION_INGESTION_ENABLED` is unset/false in **every** environment reaching the live Atlas cluster, not production alone (MP-8: one cluster backs dev too). Consider hard-disabling the route in code, not only by env | `devops-engineer` + `backend-engineer` | 2026-08-27 |
| **INC-001-C-2** | Inventory return D-A-1 … D-A-10 (§5.2), **including residency (D-A-5)**. Metadata only — no coordinates leave quarantine | `database-architect` | 2026-08-27. **Blocks the s22 finding and the purge** |
| **INC-001-C-3** | Confirm the MongoDB Atlas **region**. If outside South Africa, s72 analysis applies to every record written | `cloud-infrastructure-architect` | 2026-08-28 |
| **INC-001-C-4** | Grep-verified SDL-6 assertion: **no coordinate** in any log line, error envelope, APM/error-reporting payload, analytics event, notification payload, or third-party SDK call — client and server (F-2) | `security-engineer` | 2026-08-27. **Blocks the s22 finding** |
| **INC-001-C-5** | Document the Atlas snapshot/backup retention schedule and confirm the expiry date by which coordinates leave backups. **No restore of any affected snapshot** in the interim | `cloud-infrastructure-architect` | 2026-08-31. Input to §6.5's notice wording |
| **INC-001-C-6** | Confirm preview-APK distribution scope: who received it, whether the link was shareable, whether any recipient is outside the intended list (F-3) | `mobile-architect` + `devops-engineer` | 2026-08-27 |
| **INC-001-C-7** | Purge executed, evidenced with a run record, independently verified against the live store, certificate filed as §12 | `database-architect`, verified `security-engineer` | 2026-09-08 |
| **INC-001-C-8** | Incident-response gap: **the platform cannot reliably reach its own data subjects** — production email delivery is still owner-blocked. A breach runbook whose notification step depends on an unbuilt channel is not a runbook | `cto` (owner action) + `backend-engineer` | Before any real customer data on any surface |
| **INC-001-C-9** | **Governance routing fix.** Any code touching location, precise geolocation, consent, or a new personal-data class enters the lifecycle **under the feature that owns that data class** and cannot be delivered as a numbered "phase" of an unrelated feature (§2.7). Mechanism is `cto`'s/`solution-architect`'s to choose — my requirement is that the mechanism is **structural**, not a reminder | `cto` + `solution-architect` | **Condition on §8's concurrence.** Without it, the next feature repeats this |
| **INC-001-C-10** | **RoPA now exists or the platform cannot answer an enquiry.** C-006-4/C-007-4 have been open across three features; this incident is what "no RoPA" costs — no record of what was processed, on what basis, for how long, when it mattered. I own producing it | `compliance-specialist` (me) | 2026-09-15 |
| **INC-001-C-11** | **Erasure path (C-008-6).** There is still no account-closure or deletion endpoint. A s24(1)(b) deletion request or a s23 access request **could not be answered today** — including one arising from this incident | `backend-architect` + `database-architect` | Blocks go-live; escalated by INC-001 |
| **INC-001-C-12** | **Tabletop the breach runbook within 30 days of closure**, using INC-001 as the scenario. The detection-to-notification chain has now been exercised once for real and the gaps at C-8 and C-11 were found the expensive way | `compliance-specialist` + `security-engineer` | 2026-10-08 |

---

## 10. What must go to admitted legal counsel, not be decided by an AI compliance review

Flagged explicitly. **I have given my best professional assessment on each; none of these should be *finally* settled on my assessment alone**, and the first three are the ones where being wrong is expensive.

1. **The s22 determination itself.** My reading — that unlawful processing by the responsible party is not "access or acquisition by an unauthorised person" — is a defensible construction of s22(1) and I believe it is the better one. It is still a **statutory-construction question with no South African case law I can point to**, decided in an area where the Information Regulator's own practice is young. **If any affected data subject is a real customer (D-A-3), take the s22 call to counsel before finalising it, not after.**
2. **Whether to make a voluntary disclosure to the Information Regulator on a negative s22 finding.** §6.6 records my view (not proportionate on the probable facts; proportionate quickly if F-1 or a real-customer finding lands). This is a legal-strategy and reputational judgement blending regulatory posture with litigation risk. **`cto`'s call, on counsel's advice.**
3. **s99 civil liability exposure.** POPIA s99 gives a data subject a claim for damages for a contravention **irrespective of fault**. I have not attempted to size it, and I should not. It is directly relevant to the retention question at §7 (evidence preservation for a claim that may be brought), which is why §7.3's G-4 hold is reserved to `cto` on counsel's advice rather than to me.
4. **The employee / family / child data-subject question (C-008-4).** If any affected account is a business account or a shared/family device, the person located may not be the person who clicked. Employee monitoring and s34/s35 children's data are both areas where I flagged the need for specialist input on 2026-08-14 and that has not changed.
5. **Whether the deficient consent notice constitutes a s107 offence** (or exposure under s109's administrative fines). My assessment is that this is a compliance contravention rather than an offence — no obstruction, no knowing unlawful disclosure, self-detected, self-contained, self-remediated. **A characterisation with penal consequences is not one an AI compliance review should be the last word on.**
6. **Any communication actually sent to a data subject or to the Regulator.** §6.5 sets the required content and I will draft it. **It should be reviewed by counsel before it goes out** — an incident notification is a legal document that will be read back to the platform later.

**And the standing one:** this document is a compliance determination made from the repository, the design record, and the statute. It is **not legal advice**. It asserts no fact about any vendor agreement, DPA, or hosting region that is not verifiable in this repository — the Supabase DPA remains unexecuted, the Atlas region remains unconfirmed, and no external counsel was consulted in producing it.

---

## 11. What this document does not do

- **Does not close INC-001.** Status remains CONTAINED. Closure requires INC-001-C-7 (purge certified), the final s22 determination, and §6.5's notifications.
- **Does not release any C-008 condition.** All twelve stand.
- **Does not authorize Feature 008, or re-enabling the endpoint.** §8.5.
- **Does not rule on the technical remediation design** — how consent is stored, whether FLE is adopted, how the purge job is scheduled. Those are `cybersecurity-architect`'s, `security-engineer`'s and `database-architect`'s. **I rule on whether the result satisfies the requirement, not on how it is built.**
- **Does not apportion blame between roles.** Not my function, and it would not improve the outcome. §2.7 identifies a **process** route that allowed the bypass because fixing the process is what prevents recurrence; it identifies no individual.
- **Does not assess the security-engineering fidelity questions** reserved at ADR-0009 §15. That concurrence remains `security-engineer`'s and remains open.

---

## 12. Purge certificate — *reserved, to be filed on execution (INC-001-C-7)*

---

**Filed by:** `compliance-specialist`, 2026-08-25.
**Discharges:** ADR-0009 §16 (`compliance-specialist` concurrence), subject to the conditions at §8.5.
**Does not discharge:** ADR-0009 §15 (`security-engineer`) · Feature 008 Stage 8 · C-008-1 … C-008-12 · legal sign-off.
