# Feature 008 — Compliance Review: Self-Device Location Tracking (POPIA)

**Owner:** `compliance-specialist`
**Date:** 2026-08-14
**Status:** **Design-time compliance input and lawful-basis ruling — NOT legal sign-off, and NOT a Stage 8 gate decision.**
**Discharges:** `GPS-SD-02` (architecture.md §7 Follow-Up Tracker) · **OQ-SD-03** and **D-SD-07** (business-requirements.md §7/§8) — the lawful-basis and numeric-retention questions both documents explicitly routed to this role.
**Does not discharge:** `GPS-SD-03` (`cybersecurity-architect`'s ADR-0006 scope disposition) · Stage 8 · `product-manager` sign-off on OQ-SD-01/02/05.
**Framework precedent:** [`../001-authentication/compliance-review-supabase.md`](../001-authentication/compliance-review-supabase.md) (POPIA scope, operator/s72 framing, condition-register style) · [`../007-notifications/compliance-review-notifications.md`](../007-notifications/compliance-review-notifications.md) (this document's structure) · [ADR-0006](../../organization/adr/0006-privileged-access-audit-correlation.md) §5 AUD-9 and §14.2 (retention rulings for the two existing trails, and its explicit instruction that the location trail's period is **my ruling, not an inheritance**).
**Reviewed:** [`architecture.md`](./architecture.md) (`mobile-architect`, 2026-08-13) and [`business-requirements.md`](./business-requirements.md) (`business-analyst`, 2026-08-13), both in full.

---

## 1. Purpose, and what this document is not

`architecture.md` §5(a) and `business-requirements.md` §5.4/§8 both stop at the same boundary and route across it to this role: **what is the lawful basis for collecting a customer's own precise location, what must the customer be told, and how long may the data be kept.** This document answers those three questions, plus the two the task set alongside them — whether location is "special personal information" under POPIA, and whether the foreground-only/on-demand recommendation changes the analysis.

**This is not legal advice, and it is not a sign-off.** It is design-time input produced *before* any code exists, which is the correct sequence and the opposite of what happened on Features 006 and 007. Items marked **C-008-n** are conditions that must be satisfied before the stated trigger; they are mine to hold and mine to release.

**Verified current state, 2026-08-14 (nothing here is taken from a planning document):** no location code exists. There is no `expo-location` dependency, no `locationSource` field, no ingestion endpoint, no collection. The only location-shaped code in the tree is the Phase 2 recovery **UI scaffold** — `mobile/src/screens/recovery/LiveTrackingScreen.tsx` reads `useRecoveryLocationQuery(caseId)` against a stub `/recovery/*` client and renders a `MapPlaceholder`; the backend returns 404 and no map SDK or tile provider is wired. So there is currently **no processing of location data at all**, which is why every ruling below can be a precondition rather than a remediation.

---

## 2. Regulatory applicability — determined for this feature, not inherited

| Regime | Applies? | Determination |
|---|---|---|
| **POPIA (Act 4 of 2013)** | **Yes** | Same confirmed footprint as the rest of the platform (ZAR pricing, `.co.za` domain, SA-resident data subjects). Location of a phone belonging to an identifiable customer is **personal information** under s1 without argument. All eight conditions for lawful processing apply; s10 (minimality), s13 (purpose specification), s14 (retention), s18 (notification) and s19 (security) do the most work here |
| **GDPR** | **Not established** | Re-assessed for this feature specifically and unchanged: no EU-resident data subject, no EU-currency pricing, no EU-directed marketing. Recorded as **assessed-and-negative**, not ignored. Revisit trigger: first EU-resident customer, or an EU market claim. A `product-manager`/`cto` business decision, not mine to assume either way. *Note for whoever revisits: GDPR would reach the same conclusion as §4 below on the special-category question — precise location is not Art. 9 data — but ePrivacy Directive Art. 5(3) / terminal-equipment consent rules would add a separate consent requirement that POPIA does not impose* |
| **PCI-DSS** | **No** | No payment data anywhere in this feature. Unchanged by it |
| **Insurance-sector recordkeeping (FAIS General Code, Insurance Act, PPR)** | **Not yet, and this matters for §6** | No policy is activated on this platform (Feature 006 creates `pending_activation` only), so no record-of-financial-service retention **floor** attaches. Consequence: POPIA s14 leaves only a **ceiling**, and the shortest period that serves the purpose is the correct one. **Reassess at first policy activation, and again if location data is ever attached to a settled claim** — claim evidence is a different record class from telemetry |
| **RICA (Act 70 of 2002)** | **No — as designed. Yes, if the design ever changes in one specific way** | Location captured by an app the customer installed, on the customer's own device, with the customer's permission, is not interception of a communication and not "communication-related information" obtained from a service provider. **But if the platform ever seeks a device's location from a mobile network operator** (cell-tower/handset location for a recovery case, which is a natural thing for a recovery product to want), that is squarely RICA territory and requires a court direction under s205 of the Criminal Procedure Act or RICA's own process — not a commercial data-sharing agreement. Flagged now because it is the kind of thing that gets proposed in an incident, under pressure. **C-008-9** |
| **PSIRA (Act 56 of 2001)** | **Not yet — attaches at D-SD-05** | The moment a security-company partner receives a customer's location, the partner must be a PSIRA-registered service provider and the arrangement documented. Deferred with D-SD-05, named here so it is not discovered later |
| **ECT Act s45 / POPIA s69** | **No** | Direct-marketing rules do not reach this feature. They reach any *marketing* of it — see §8.4 |
| **POPIA s57 (prior authorisation)** | **No, on the current design** | No unique identifier processed for a purpose other than collection, no credit reporting, no transfer of special PI or children's information abroad. **Re-check if §4.2's theft scenario is built into a formal criminal-behaviour record**, and if any partner-sharing crosses a border |

---

## 3. Data classification — location is not "device telemetry"

| Data element | Class | Handling rule |
|---|---|---|
| Latitude/longitude + accuracy of a registered phone | **Personal information, highest sensitivity tier on this platform** | Never in a push or SMS payload (Feature 007 §2, reaffirmed at that feature's §9-C.4); never in an application log; never in an email; never in an export without an explicit purpose; access from any surface other than the asset's own owner requires the AUD-9 trail (§7) |
| `capturedAt` / `receivedAt` / `triggeredBy` | Personal information (behavioural) | A timestamp series is what turns points into a pattern. Retention rules apply to these as much as to the coordinates |
| A **sequence** of points for one asset | **Derived behavioural profile** — home address, workplace, routine, times of absence | This is the class the org's own best practice names, and the reason §6 rules the way it does. A theft-insurance provider holding a customer's routine also holds the answer to "when is this person's house empty" |
| A single "last known location" | Personal information; lower inference risk than a sequence, not low | The Phase 1 minimum. §6 prefers it over a history |
| Location of a **person who is not the account holder** | Personal information about a third-party data subject | See §5.4 — the hardest unresolved issue in this feature |

**The reason this matters for a design decision, stated once:** `architecture.md` §0 is right that self-device tracking is weak against a determined thief. It is *not* weak against the customer's own privacy — a foreground-triggered capture on every app open is an excellent record of when and where a person uses their phone. **The feature's privacy cost and its recovery benefit do not scale together.** That asymmetry is what drives §6's retention numbers and §8's copy requirements.

---

## 4. Is this "special personal information" under POPIA s26?

Asked directly by the task, and the honest answer has two halves.

### 4.1 About the customer: **No.**

POPIA s26's list is **closed**: religious or philosophical beliefs, race or ethnic origin, trade union membership, political persuasion, health or sex life, biometric information, and criminal behaviour. **Location is not on it**, and no interpretive stretch puts it there. Two near-misses, both rejected with reasons so this is not re-argued later:

- **"Biometric information."** POPIA s1 defines biometrics as *a technique of personal identification* based on physical, physiological or behavioural characterisation. Location is not being used to *identify* anyone — identity is already established by the authenticated session. A movement pattern used as an identification technique would be a different processing operation; this is not one.
- **"Derived" special information.** A location series can *reveal* s26 categories — repeated attendance at a place of worship, a clinic, a trade-union office, a political party branch. **s26 attaches to the derived information the moment such an inference is actually drawn or recorded**, not to the raw coordinate. So: **C-008-1 — no analytics, segmentation, profiling, risk-scoring, or premium-adjustment feature may be built on location data without returning to this role first.** A "customers who visit high-crime areas" model is a s26 problem *and* a s71 automated-decision problem, and nothing in the current design contemplates one. This condition exists to keep it that way.

**Consequence:** no s27 authorisation and no s57 prior authorisation is required for the customer's own location on the Phase 1 design. **Ruling: handle it at an equivalent-to-special sensitivity level as a matter of platform policy** — because of §3's inference profile — while being accurate that the statute does not classify it there. Overstating the legal position is as much a defect as understating it.

### 4.2 About a third party once a theft occurs: **potentially yes, and nobody has flagged this.**

Once a phone is stolen and still reporting, the coordinates being collected are the location of **the person now holding it** — not the customer. If that data is collected, retained, or handed to a security company or the police *for the purpose of* establishing who committed an offence, the platform is processing information relating to **the alleged commission of an offence by a data subject**, which is s26(b)(i) special personal information about a third party who has given no consent and received no s18 notice.

This is not a reason not to build the feature. It is a reason to name the authorisation now rather than during an incident:

- **s27(1)(b)** — processing necessary for the establishment, exercise or defence of a right or obligation in law — is the applicable general authorisation, and it fits: recovering stolen property and substantiating an insurance claim are exactly that.
- The **s18 notification duty** to that third party is displaced by s18(4)(f) (non-compliance is necessary for the prevention, detection, investigation of offences) — but that exception must be *relied on deliberately and recorded*, not assumed.
- **C-008-2:** before any theft/recovery workflow consumes location data, this analysis is written into the recovery-case design and the RoPA as a distinct processing activity with its own basis, its own retention, and its own recipients. It is **not** the same processing activity as "customer finds their misplaced phone", and the current design documents treat them as one.

---

## 5. Lawful basis under POPIA s11 — the ruling

### 5.1 Ruling

**Primary basis: s11(1)(a) — consent.** Voluntary, specific and informed, given by the data subject, and withdrawable at any time (s11(2)(b)).

**Subsidiary basis, for the narrow window of an active recovery only: s11(1)(d)** — processing protects a legitimate interest of the data subject.

### 5.2 Why consent, and why not the alternatives

| Basis | Assessment |
|---|---|
| **s11(1)(b)** — necessary for conclusion or performance of a contract with the data subject | **Rejected.** `business-requirements.md` FR-SD-04 and BR-SD-01 make this opt-in and available on every tier; a customer can hold, use and claim on the identical policy without ever enabling it. Processing a customer can decline with no effect on the contract is by definition not *necessary* for that contract. This is the basis the platform uses for policy and asset data (`compliance-review-supabase.md` §9.2) and it does not stretch to here |
| **s11(1)(a)** — consent | **Adopted.** The collection is optional, self-initiated, switched on and off by the data subject, and the customer's own expectation is that they control it. It is also the only basis under which the two-step permission flow in `architecture.md` §2.2 means what it appears to mean |
| **s11(1)(d)** — protects a legitimate interest of the data subject | **Adopted as subsidiary, for active recovery only.** Once a customer has reported the phone lost or stolen, continued processing (and retention of points already captured) protects their interest in recovering their property even if they subsequently withdraw consent or the app can no longer ask. Carries a s11(3)(b) right to object |
| **s11(1)(f)** — legitimate interests of the responsible party | **Rejected as a primary basis, deliberately.** It would technically be arguable ("we insure the asset, so we have an interest in locating it") and adopting it would let the platform switch location collection on without asking. That is precisely the outcome the consent architecture is designed to prevent, and `compliance-review-supabase.md` §4.3.1 set the precedent for rejecting an available-but-wrong basis on the record rather than taking the convenient one |

### 5.3 What follows from choosing consent — three hard consequences

1. **An OS permission grant is not POPIA consent.** iOS "When In Use" / Android `ACCESS_FINE_LOCATION` is the *device owner* permitting an app to call a *sensor API*. POPIA consent is the *data subject* permitting a *responsible party* to process for a *specified purpose*. They are different acts by different bodies of law, and one cannot stand in for the other. The in-app primer (`architecture.md` §2.2 step 1) is where POPIA consent is obtained; the OS dialog is a technical precondition that follows it. **Never fire the OS dialog first and treat a grant as consent.**
2. **The consent must be evidenced, and today it cannot be.** `POST /auth/signup`'s `consentAccepted` is a hardcoded `true` that the backend validates and discards (verified: `backend/src/routes/auth.ts:78`, `:87`; call sites `src/customer/api/auth.ts:39`, `mobile/app/(auth)/signup.tsx:89`). **C-008-3: Feature 006's C-006-2 consent-record mechanism is a hard precondition on this feature** — append-only, one row per act, capturing account id, purpose (`location.self_device`), document/notice version, server timestamp, surface and source IP, with withdrawal recorded the same way. A consent basis that cannot be evidenced is not a basis. This is the first feature on the platform that actually needs it, which is why C-006-2 moves from dormant to blocking.
3. **Withdrawal must actually stop things.** AC-SD-06 already requires that opting out stops capture with no side effects. Add: withdrawal must also stop *processing* of what is held — see §6.3.

### 5.4 The unresolved issue neither upstream document names: the phone's user may not be the data subject who consented

The design assumes account holder = phone owner = person carrying the phone. Three cases where that fails, all reachable in Phase 1:

- **A family phone.** A customer registers and insures a phone used by a spouse, parent or child. The account holder consents; the person being located did not.
- **An employee phone under a business account.** `business-requirements.md` §3 makes the feature available on every tier including a business-shaped `enterprise` plan. Employer-consented location tracking of an employee is one of the most contested areas of data-protection practice anywhere, and "the employer consented" is not consent by the employee — consent under POPIA must be voluntary, and an employment relationship is where voluntariness is weakest.
- **A child's phone.** POPIA s34/s35 treat a child's personal information as prohibited processing absent competent-person consent and a s35 exception. A parent is a competent person, so this is workable — but it must be *designed*, not discovered.

**C-008-4:** before build, `business-analyst` + `product-manager` must decide whether Phase 1 restricts this feature to a phone the account holder confirms is their own and personally carried, and the primer copy must include an explicit attestation to that effect. **My recommendation is the restriction**, because it is one sentence of copy now versus an employee-monitoring and a children's-data problem later. If business or family use is wanted, it is a separate processing activity with its own basis, its own notice to the actual data subject, and — for employees — a workplace-monitoring assessment I have not done.

---

## 6. Retention and deletion — the ruling that discharges OQ-SD-03 / D-SD-07

`business-requirements.md` §5.4 correctly declined to invent these. ADR-0006 §14.2(5) is explicit that this period is my ruling and **must not default to 12 months by inheritance** from a document that never considered location. Ruling:

### 6.1 Periods

| Record | Retention | Reasoning |
|---|---|---|
| **"Last known location"** — the single current point per asset | Retained while the opt-in is active. **Deleted within 7 days** of opt-out, OS-permission revocation detected by the app, asset deletion, or account closure — **unless** attached to an open recovery case or claim (§6.2) | It is the working value the feature exists to show. Once the customer withdraws, the purpose has ended and s14(1) requires deletion |
| **Location history** (a series beyond the current point) | **Preferred: do not store one in Phase 1.** Overwrite the single point. If `product-manager` names a specific purpose that requires history, the ceiling is **30 days rolling**, purged automatically | The stated purposes — "find my misplaced phone", "capture the last position before it went dark" — are both served by *one* point. A series is where §3's behavioural-profile risk lives, and it is unjustified by any purpose in `business-requirements.md` §2.1. This is a s10/s13 minimality ruling, not a storage-cost one |
| **Points linked to an open recovery case or claim** | Life of the case **+ 12 months**, then deleted. Extendable only under an explicit, recorded **legal hold** (criminal proceedings, claim dispute, regulator or court process) | This is the one genuinely evidentiary use. 12 months post-closure covers a claim dispute and the practical tail of a police matter. Revisit if §2's insurance-recordkeeping floor ever attaches |
| **AUD-9 location-access trail** (who viewed a customer's location, when, why) | **12 months**, matching Trail A's `privileged_data_access` and Trail B's `admin_access_log` (ADR-0006 §14.2(1)), **with a case-linked legal hold that must cross the store boundary** per AUD-7(b) | Ruled explicitly here rather than inherited, which is what ADR-0006 §14.2(5) asked for. AUD-7(a)'s `min()` symmetry is satisfied: all three trails are equal at 12 months, so no asymmetry statement is required. **Note the deliberate asymmetry between the trail (12 months) and the location data itself (7 days / 30 days):** the record of *who looked* legitimately outlives the data they looked at — that is the point of an access trail, and it is not an inconsistency |

**These are ceilings, not floors.** POPIA imposes no minimum retention on any of this. Nobody should read "30 days" as an obligation to keep 30 days of history.

### 6.2 The one place `business-requirements.md` and I need to agree

BR §5.3 rules that a stale last-known point "is not deleted or hidden by the act of the app losing connectivity, being removed, or the device being reset", because it is the most useful thing the feature can offer a theft victim. **I concur, and the reasoning is sound** — but note what makes it lawful: at that moment the basis has shifted from s11(1)(a) consent to **s11(1)(d)**, protecting the data subject's own interest in recovering their property. So the rule is: *silence* does not trigger deletion, and neither does an app uninstall. *Withdrawal of consent* does, subject to the open-case carve-out. AC-SD-06's final line is compatible with this; it just needs to say which of the two situations it is describing.

### 6.3 Enforcement

**C-008-5:** these periods must be enforced by an **automated, auditable job with a run record** — TTL indexes or a scheduled purge — not a policy sentence. This platform already has a live instance of the failure mode: `app.purge_expired_audit_log()` exists and nothing calls it (`HANDOFF.md`, ADR-0006 §17). A retention rule with no scheduler is a documented intention, and I will not accept one as satisfying s14 for the most sensitive data class on the platform. `database-architect` + `backend-engineer` own implementation; the numbers are mine.

**C-008-6:** a deletion path must exist. There is **no account-closure or erasure endpoint anywhere in `backend/src/routes/`** (verified this session; also filed as Feature 007 C-007-11). Every "delete on account closure" line above is currently unenforceable, and a POPIA **s24(1)(b)** deletion request or a **s23** access request for location data could not be answered today.

---

## 7. Access, audit and disclosure

- **AUD-9 applies and is not satisfied.** ADR-0006 §5's third-trail rule — *"who looked at where a customer's asset is"*, the platform's most sensitive access class — is exactly this data. FU-A14 records that AUD-9's mandatory case reference has nothing to resolve against; the `recovery_cases` collection now partially closes that, but no location-access trail exists. **C-008-7: no read surface beyond the asset's own authenticated owner may ship until the AUD-9 trail exists and records actor, subject, purpose/case reference, and the AUD-1 join key.** That includes admin support tooling. `cybersecurity-architect` owns the GPS-SD-03 disposition on whether this extends ADR-0006 or needs a new ADR; my condition holds either way.
- **Customer's own access is not a privileged read** and does not need the trail — but it does need the same account-scoping every Feature 004 route already applies.
- **No location in notifications.** Feature 007's §2 prohibition (no coordinates in push or SMS, avoid in email) is reaffirmed and extended: a theft/recovery push must carry an opaque reference and a deep link, not a place name, an asset name, or a coordinate — including in the `data` payload, which reaches Expo, Apple and Google (Feature 007 §9-C.4, SR-007-3 + C-007-6). **Those are preconditions on any location-derived notification.**
- **Security-company sharing (D-SD-05) is not authorised by anything in this document.** It needs: a separate, specific consent or a s11(1)(d) determination for the active-recovery window; a responsible-party-vs-operator determination (the open C-NOTIF-4 question); a s21 written contract; PSIRA registration; and its own entry in the RoPA. **C-008-8.**

---

## 8. Consent and notice — what the customer must be told, and where

### 8.1 The s18 elements that must appear in the primer

Not in the privacy policy, not in a tooltip — in the primer screen itself, before the OS dialog (`architecture.md` §2.2 step 1, `GPS-SD-08`):

1. What is collected: **this phone's precise GPS location**, and its accuracy.
2. **When** it is collected — and this is the sentence that has to be exactly true: only when the app is opened or the customer taps "update location"; never in the background; never while the app is closed.
3. The purpose (s13): showing the customer where this specific insured phone was last seen, to help find it if lost or stolen.
4. That providing it is **voluntary**, and the consequence of declining: **none** — the policy, the asset and the account are unaffected (FR-SD-04, AC-SD-06).
5. Who else receives it: today, nobody outside the platform and its operators. Name the operators and the countries their infrastructure sits in — **I cannot fill these in from the repository**; `cloud-infrastructure-architect` must confirm the hosting and database regions before this copy is final. If the answer is "outside South Africa", the s72 analysis in `compliance-review-supabase.md` §4.3 applies and the basis is **s72(1)(a)** — a binding agreement — **not** consent, which that document deliberately rejected as a transborder basis.
6. How long it is kept (§6) and that it is deleted after opt-out.
7. That consent can be withdrawn at any time, in the app, as easily as it was given.
8. The right of access and correction (s23/s24) and the right to complain to the Information Regulator.

### 8.2 Draft primer copy — plain language, to be adapted by `ux-researcher`/`ui-designer`, not rewritten into boilerplate

> **Let this phone report its own location**
>
> **What we collect.** This phone's GPS location, and how accurate that reading is.
>
> **When.** Only when you open the app, or when you tap "Update location". We do **not** collect your location in the background, while the app is closed, or while you're not using it.
>
> **Why.** So that if this phone goes missing, you can see where it last reported from.
>
> **What this can't do.** If someone takes this phone, they can switch it off, put it in airplane mode, or reset it — and it will stop reporting. This helps you find a phone you've misplaced, and it saves the last place your phone reported from before it went quiet. **It is not a guarantee that we can find or recover a stolen phone.**
>
> **Where it goes.** Your location is stored on our systems in [region], and we don't sell it or share it with anyone else. If you ask us to open a recovery case, we'll tell you before anything is shared.
>
> **How long we keep it.** We keep only the most recent location. If you turn this off, we delete it within 7 days — unless you have a recovery case open.
>
> **Your choice.** You can turn this off at any time in the app, and nothing else about your cover changes.
>
> [ Turn on location ] [ Not now ]

Note what the draft does *not* do: it does not say "for your protection", does not use a shield icon in place of a sentence, and states the limitation in the same weight of type as the benefit — `business-requirements.md` §6.3's prominence rule, which I endorse and am applying to the primer specifically.

### 8.3 Copy that is prohibited

I adopt `business-requirements.md` §6.2 in full. Adding the compliance reason, which is not the same as the marketing reason: overstating this feature makes the s18 notification **inaccurate**, and an inaccurate notice undermines the "informed" limb of the consent in §5.1. So "24/7 tracking", "always know where your phone is", and any recovery-outcome promise are not merely misleading marketing — **they invalidate the lawful basis they are attached to.** That is why AC-SD-07 is a compliance acceptance criterion and not only a brand one.

### 8.4 Marketing this feature

Promoting self-device tracking to existing customers by email, SMS or push is **direct marketing** and is governed by POPIA s69 and, independently, ECT Act s45 — see Feature 007 §9-C.3/C-007-5 and C-007-7. The `marketing` category currently defaults to off on every channel, which is correct; it cannot be enabled without the consent record. **This feature does not create an exception.**

---

## 9. Does foreground-only/on-demand change the analysis? — the task's direct question

**It does not change the lawful basis, the classification, or the need for a retention rule. It substantially changes proportionality, and it is the difference between a defensible design and one I would push back on.**

| Dimension | Foreground / on-demand (recommended) | Continuous or periodic background |
|---|---|---|
| **Lawful basis** | s11(1)(a) consent | **Unchanged — still consent**, and a *new* consent. Background collection is a materially different processing operation, not a settings upgrade: a customer who consented to "when I open the app" has not consented to "always" |
| **s10 minimality** | Satisfied comfortably: capture is tied to a user action that expresses the purpose | **Hard to satisfy.** `architecture.md` §0/§2.3 establish that background reporting is largely defeated by any actual thief. Processing that does not achieve its stated purpose is not "adequate, relevant and not excessive" — the more invasive option is *harder* to justify precisely because it works no better |
| **§3 behavioural profile** | Bounded. Points exist only where the customer chose to use their phone with the app | **This is the real change.** A periodic background feed is a continuous movement record: home, work, commute, when the house is empty. An insurer holding that about theft-insurance customers is a materially different risk posture, and it is where §4.1's derived-special-information danger becomes live |
| **s18 notice burden** | One honest paragraph | Must be far more explicit, repeated, and (per platform policy) periodically re-confirmed |
| **Retention** | §6's short periods are natural and cheap | Would force a shorter history window and stronger aggregation controls, not a longer one — the opposite of what teams usually assume |
| **Store policy** | Standard permission tier | Apple 5.1.1 justification + Google Play background-location declaration + prominent disclosure. Note these are **platform-policy** obligations, distinct from POPIA; satisfying one does not satisfy the other, and `architecture.md` §2.1 is right about the cost |

**Ruling: I concur with `architecture.md` §2.3 and `business-requirements.md` FR-SD-02 — foreground/on-demand only for Phase 1.** Not as a compromise, but because it is the option that is simultaneously more privacy-protective *and* not meaningfully worse at the stated purpose. That is a rare alignment and the design should take it.

**C-008-10 — the escalation gate for D-SD-02:** any background or periodic variant re-enters this role for a **fresh** lawful-basis assessment and a **fresh** consent event. It may not be delivered as a silent expansion of an existing opt-in, an app update that changes what "location on" means, or a permission upgrade prompt with no new notice. If it is ever proposed, I will also want a documented answer to "what recovery outcome does this achieve that on-demand does not", because §9's own analysis says the honest answer may be "none".

---

## 10. Conditions register

| ID | Condition | Owner | Blocks |
|---|---|---|---|
| **C-008-1** | No analytics, profiling, segmentation, risk-scoring or pricing use of location data without returning to this role (s26 derived-information risk, s71) | `product-manager` / `data-analyst` | Any secondary use |
| **C-008-2** | Theft/third-party location processing documented as a distinct activity with s27(1)(b) authorisation and the s18(4)(f) reliance recorded | `compliance-specialist` + `business-analyst` | Any recovery workflow consuming location |
| **C-008-3** | Consent record (Feature 006 **C-006-2**) implemented — append-only, versioned, withdrawal recorded | `database-architect` + `authentication-engineer` | **Any customer-facing opt-in** |
| **C-008-4** | Decide and disclose whether the phone must be the account holder's own, personally-carried device; employee/family/child cases handled or excluded | `product-manager` + `business-analyst` | Build |
| **C-008-5** | Retention enforced by an automated, auditable purge with a run record | `database-architect` + `backend-engineer` | First real location record |
| **C-008-6** | An account-closure/erasure path exists so deletion rulings are executable; s23/s24 requests answerable | `backend-architect` + `database-architect` | Go-live |
| **C-008-7** | AUD-9 location-access trail exists before any non-owner read surface (incl. admin/support tooling) | `cybersecurity-architect` + `backend-architect` | Any non-owner read |
| **C-008-8** | Security-company sharing: separate basis, controller/operator determination, s21 contract, PSIRA registration, RoPA entry | `compliance-specialist` + `integration-architect` | D-SD-05 |
| **C-008-9** | No location sought from a mobile network operator without RICA/CPA s205 process — commercial agreement is not sufficient | `compliance-specialist` + `cto` | Standing prohibition |
| **C-008-10** | Background/periodic variant requires fresh basis and fresh consent, never a silent expansion | `compliance-specialist` | D-SD-02 |
| **C-008-11** | Map rendering reviewed before it ships: a tile or geocoding provider receives the coordinate, and reverse-geocoding to a street address is an additional inference. `MapPlaceholder` is a placeholder today — the provider choice is a new operator and a new s72 flow | `integration-architect` + `compliance-specialist` | Any real map UI |
| **C-008-12** | RoPA entry for this feature (Feature 006 **C-006-4**) — categories, purposes, basis per purpose, recipients, transborder flows, retention | `compliance-specialist` | Real location processing |

---

## 11. Answers to the specific questions asked of this role

| Asked by | Question | Answer |
|---|---|---|
| `architecture.md` §5(a), `GPS-SD-02` | Lawful basis for self-device location collection | **s11(1)(a) consent**, primary; **s11(1)(d)** subsidiary during active recovery. §5 |
| `architecture.md` §5(a); ADR-0006 C-16(a) | Retention period | §6.1 — 7 days post-opt-out for the current point; no history preferred, 30-day ceiling if one is built; case-linked points case + 12 months; **AUD-9 trail 12 months, ruled not inherited** |
| `business-requirements.md` OQ-SD-03 / D-SD-07 | Numeric retention/purge period and confirmed basis | As above. **Discharged** |
| Task | Is this special personal information under POPIA? | **Not about the customer** (s26's list is closed and location is not on it) — but handle at equivalent sensitivity, and **potentially yes about a third party** once a theft occurs (s26(b)(i)). §4 |
| Task | Consent/notice language at the point of enabling | §8.1 elements, §8.2 draft copy. The OS permission dialog is **not** consent |
| Task | Does foreground-only change the analysis vs. continuous background? | Not the basis or classification; **substantially** the proportionality, the behavioural-profile risk and the notice burden. Concur with foreground-only. §9 |
| `business-requirements.md` §10 checklist, item 4 | "Compliance-specialist has reviewed rules touching regulated disclosures" | **This document is that review** for the disclosure and lawful-basis limb. It does **not** close Stage 8, `GPS-SD-03`, or `product-manager` sign-off |

---

## 12. What I am explicitly not ruling on

`GPS-SD-03` (ADR-0006 scope — `cybersecurity-architect`) · the ingestion contract, auth model and rate limiting (`backend-architect`) · schema, discriminator naming and time-series strategy (`database-architect`) · whether the feature is built at all, plan-tier gating, and marketing scope (`product-manager`) · laptop/desktop tracking (D-SD-01 — out of scope here as it is in both upstream documents) · Stage 8 and Stage 10.

---

**This document does not constitute legal advice.** It is a compliance determination for a feature that does not yet exist, made from the design documents and the current state of the repository. Nothing in it asserts that any vendor agreement, DPA or hosting-region fact has been confirmed — none is verifiable from this repository, and this session did not contact the platform owner. It should be re-read, and if necessary re-ruled, when the ingestion design and hosting regions are concrete.
