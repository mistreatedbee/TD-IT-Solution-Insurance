# Feature 011 — SAPS Case-Number Capture & Station Locator/Report-Assistant

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst`
**Contributors:** `product-manager` (prioritization/scope confirmation, not yet obtained — §9), `compliance-specialist` (POPIA review of a new personal-data category — requested, not yet obtained — §7), `cybersecurity-architect` (Stage 8, not started), `technical-writer` (in-app/help-center copy once built)
**Status:** Draft — Stage 1 only. **Does not authorize development.** Promoted from `docs/organization/innovation-backlog.md` Ideas 1 and 2 (§"Priority signal" names both as the top near-term candidates), which is itself explicitly not a roadmap commitment or a ratified scope. This document is the first real Stage 1 pass; it does not by itself clear either idea for Stage 2+.
**Related system areas (RACI):** `backend/src/routes/recovery.ts`, `backend/src/repositories/recovery-cases.ts` (schema extension target), `mobile/app/(app)/report-theft/*`, `mobile/src/screens/recovery/*` (flow extension target). No claims backend exists (`claims.ts` does not exist) and no payment gateway exists — neither feature depends on either.
**Reads on:** `docs/organization/innovation-backlog.md` §1–2 and "Priority signal" (source ideas — grounding sources for the 48-hour CAS-number claim are cited there, not restated as new authority here), `docs/features/008-self-device-gps-tracking/business-requirements.md` (format precedent for this document and for how this project treats "buildable now" vs. "payoff blocked on a dependency that doesn't exist yet"), `docs/organization/incidents/INC-001-location-ingestion.md` (binding context for §5.3's location-inclusion caution), `docs/features/004-policy-asset-management/field-sensitivity-review.md` (field-sensitivity classification precedent applied in §6).

---

## 0. Status banner — read this before anything else below

This document rules on the **product/business-requirements questions** for Innovation Backlog Ideas 1 and 2 only. It does **not** rule on, and does not pre-empt:

- **POPIA lawful-basis/classification review of the new SAPS case-number/station data field set** (§7). `compliance-specialist` has not yet reviewed this document. Flagged as required before Stage 2 proceeds to design, not assumed clear.
- **Whether a SAPS station dataset can actually be sourced, and from where.** §5 documents that **no such dataset exists anywhere in this repository today** — this is an open data-sourcing question for `product-manager`/`integration-architect`, not something this document can resolve by writing acceptance criteria against data that doesn't exist.
- **Stage 8 (Security Review) or Stage 10 (QA) sign-off.** Not requested, not implied. Per root `CLAUDE.md`, both are hard gates for this project.
- **`product-manager` prioritization sign-off.** The innovation backlog is explicit that nothing in it is a roadmap commitment; this document formalizes the requirements *if* `product-manager` chooses to pull these ideas into a release, it does not itself make that choice (§9).

---

## 1. Business goal

South African theft/loss claims procedurally require a SAPS CAS (Case Administration System) case number, obtained within roughly 48 hours of the incident, before an insurer will process a theft claim — this is standing, cited domain fact (`saps.gov.za`, industry claims guidance; see innovation-backlog.md grounding sources). Today, the platform's theft-report flow (`mobile/app/(app)/report-theft/*` → `POST /v1/recovery/cases`) captures only `assetId` and a free-text `notes` field (`backend/src/routes/recovery.ts` `createCaseSchema`) — there is nowhere structured to record a CAS number, which station issued it, or when it was obtained. The `ReportTheftConfirmScreen`'s existing notes-field hint ("Any police case number?") already gestures at this need without giving it a real field.

This document specifies two related, buildable-now capabilities that extend the already-shipped recovery-case flow rather than requiring a new entity:

1. **Idea 1 — SAPS case-number capture**: structured fields on the recovery case for CAS number, reporting station, and date reported, captured as a **post-submission follow-up**, not a blocker to filing the initial theft report.
2. **Idea 2 — SAPS station locator + report-assistant**: an in-app directory of SAPS stations plus a pre-filled, read-aloud/show-at-the-station summary screen, to help the customer act quickly within the 48-hour window. Explicitly **not** a filing integration — no SAPS API exists or is assumed.

**This document does not commit the platform to shipping either capability.** Consistent with this role's charter and the 008 precedent (§11 pattern), ratifying that these are worth building is `product-manager`'s call informed by this spec — not self-authorized here.

---

## 2. Terminology (domain glossary additions)

| Term | Definition |
|---|---|
| **CAS number (SAPS case number)** | The reference number South African Police Service issues via its Case Administration System when a crime is reported and a docket is opened. Customer-facing term: "police case number" or "SAPS case number" (avoid the acronym "CAS" in customer-facing copy per §6.4 — it is an internal-systems term unfamiliar to most customers; use it only as a secondary clarifier). |
| **Reporting station** | The specific SAPS station (by name) at which the docket was opened / the CAS number was issued. Not necessarily the station nearest the loss location — customers may report at a station near home, work, or the incident. |
| **Date reported to police** | The calendar date the customer physically reported the incident to SAPS, distinct from `reportedAt` (the existing `recovery_cases.reportedAt` field, which is when the theft was reported **to this platform**, via the app). These are frequently different dates and must not be conflated. |
| **Recovery case** | Existing entity (`recovery_cases` Mongo collection) created when a customer reports an asset stolen/lost via `POST /v1/recovery/cases`. This document proposes extending it, not creating a new entity. |
| **Station locator** | The Idea 2 in-app directory of SAPS station name/address/contact used to help a customer find where to report. |
| **Report-assistant summary** | The Idea 2 pre-filled screen (asset details, approximate last-known location if available, timestamp) formatted for the customer to read out or show at the station. Not a filing mechanism. |

---

## 3. Idea 1 — SAPS case-number capture

### 3.1 What data fields are needed

**BR-011-01: Field set.**

| Field | Type | Format guidance | Required? |
|---|---|---|---|
| `sapsCaseNumber` | string | Free text, not strictly validated against a single regex (§3.2) | Optional at capture time (§3.3) |
| `reportingStation` | string | Free text (station name) in Phase 1; becomes a picker from the station-locator dataset if/when Idea 2 ships (§5) | Optional |
| `reportedToPoliceAt` | date (calendar date, no time-of-day required) | ISO 8601 date | Optional |

**BR-011-02: `sapsCaseNumber` is stored as free text, not strictly format-validated, and here is why.** Research into the real SAPS CAS number format (`saps.gov.za`, ISS Africa's SAPS e-docket system writeup, National Instruction 3/2011 on docket registration) shows the number is commonly rendered as **`[1–3 digit sequence]/[month]/[year]`** (e.g. `123/01/2026`), allocated chronologically per station per month — but:

- The exact separator, digit-padding, and whether a station code/prefix is included varies in practice (SMS confirmations, printed dockets, and verbal communication from officers are not always consistent in formatting).
- No single authoritative, machine-parseable format specification was found during this research pass. Insurers and banks that accept CAS numbers downstream generally accept it as an opaque reference string, not a value they algorithmically validate.

**Ruling:** validate only that the field, if provided, is non-empty text within a generous length bound (e.g. 3–50 characters) — **no regex format enforcement**. Enforcing a specific pattern risks rejecting a real, correctly-transcribed case number because of a formatting variant this research did not surface, which would actively harm the exact customer this feature is meant to help. `backend-architect`/`database-architect` should treat this as a deliberate business rule, not an oversight, when Stage 6/7 design happens.

**Open question flagged, not resolved here:** if `compliance-specialist` or a future domain-research pass surfaces an authoritative SAPS format specification, this ruling should be revisited — logged as **OQ-011-04** (§9).

### 3.2 Where this fits in the existing loss-report flow

**BR-011-03: Ruling — captured as an optional post-submission follow-up, never a blocker to filing the initial theft report.**

Reasoning:

- The existing flow (`ReportTheftSelectScreen` → `ReportTheftConfirmScreen` → `POST /v1/recovery/cases` → `ReportTheftSuccessScreen`) is designed for a customer to report a theft **immediately**, from a position of urgency or distress. A SAPS case number, by definition, cannot exist at that moment in the overwhelming majority of cases — the customer has not yet been to a police station. Requiring it at initial submission would either block or falsify the report.
- The domain fact motivating this feature (48-hour insurer window) is itself evidence the case number arrives *after* the report, not with it — the feature exists to help the customer close that gap quickly, not to gate the report on data that structurally can't exist yet.
- **Placement:** the case-number fields are added to the recovery-case **detail/follow-up view** (a new section on whatever screen renders an existing `RecoveryCaseDocument` for the customer — currently the case is only listed/detailed via `GET /v1/recovery/cases` and `GET /v1/recovery/cases/:caseId`, with no dedicated "add police details" mobile screen yet). The customer can add or edit these fields at any time after the case is created, as many times as needed (e.g., they get the number by SMS after leaving the station and want to add it then).
- **48-hour reminder nudge:** the innovation-backlog idea proposes a nudge if the field is still empty 48 hours after the report. This document specifies the **behavioral intent** (BR-011-04 below) but defers the exact delivery mechanism (push notification vs. in-app banner vs. both) to `product-manager`/`ux-researcher`, consistent with how Feature 008 §5.2 deferred UI-threshold specifics to design roles while ratifying the underlying rule.

**BR-011-04: 48-hour nudge — behavioral rule.** If a recovery case has no `sapsCaseNumber` recorded 48 hours after `reportedAt` (the existing field — when the customer reported to the platform, not to police), the customer must be reminded, once, that SA insurers generally require a police case number within 48 hours of the incident, and invited to add it. This is advisory copy, not a hard gate — **the platform has no claims backend to gate anyway** (no `claims.ts` exists), and even once one exists, gating claim eligibility on this field is a separate, future Stage 1 decision for that feature, not decided here.

**BR-011-05: Editing/history.** Each of the three fields is independently editable after initial capture (e.g., a customer may add the station and date first, then the case number once SMS'd to them later). Whether edits need a change-history/audit trail (comparable to `callCentreNotes`' append-only pattern already in `RecoveryCaseDocument`) is a `database-architect` design call for Stage 6, not ruled here — flagged as **OQ-011-01** (§9), leaning toward "yes, append-only or last-write-with-timestamp" given this data may matter evidentially to a future claim, but not ratified as a requirement in this document.

### 3.3 Multiplicity / edge cases

- **BR-011-06:** A recovery case has at most one active `sapsCaseNumber`/`reportingStation`/`reportedToPoliceAt` triple at a time (last-write-wins is acceptable for Phase 1; §3.2 flags whether history is needed as open).
- **BR-011-07:** These fields are per-recovery-case, not per-asset or per-account. If a customer has multiple open recovery cases (distinct assets, distinct incidents), each case's police-report fields are independent — no cross-case inference or auto-fill.
- **BR-011-08:** No validation ties `reportedToPoliceAt` to `reportedAt` (e.g., no rule that police-report date must be ≥ platform-report date) — a customer may have reported to police first and to the platform second, or the reverse. The field is descriptive, not a workflow gate.
- **BR-011-09:** If a recovery case is later closed (`status: closed` or `recovered`), the police-report fields remain visible and editable in read history — they are not hidden or purged on closure, for the same "useful for a future claim/dispute" reason `assets.lastLocation` staleness handling in Feature 008 §5.3 gives for not hiding stale-but-real data.

---

## 4. Idea 2 — SAPS station locator + report-assistant

### 4.1 What it is, scoped precisely

**BR-011-10:** Two sub-components, buildable independently:

1. **Station locator** — a browsable/searchable directory of SAPS police stations (name, address, contact number, and ideally jurisdiction/nearest-to-location) surfaced when a customer is in or has just completed the theft-report flow.
2. **Report-assistant summary** — a screen that compiles already-captured data (asset display name, type, make/model/serial where present per Feature 004's asset schema, the platform's own `reportedAt` timestamp, and — **conditionally, see §4.3** — a last-known location if one exists) into a single, readable-aloud or show-at-the-counter summary, so the customer doesn't have to reconstruct these details verbally under stress at the station.

**BR-011-11: Explicitly not a filing service.** No SAPS API exists, none is assumed, and no copy anywhere in this feature may imply the platform files, transmits, or submits anything to SAPS on the customer's behalf. This is the same "assistant, not integration" boundary the innovation backlog itself already draws — restated here as a binding acceptance-criterion-level rule (AC-011-08).

### 4.2 Data-sourcing question — flagged as open, not resolved

**BR-011-12: No SAPS station dataset exists anywhere in this repository today.** Verified: no station list, no `.json`/`.csv` seed file, no reference to a stations API or dataset in `backend/`, `mobile/`, `src/`, or `docs/` outside of the innovation-backlog entry itself and this document. This is a hard prerequisite this document cannot fabricate or assume:

- A real dataset (station name, address, contact, ideally geocoordinates for "nearest station" sorting) would need to come from somewhere — SAPS does not appear (per the research pass in §3.1) to publish a clean, machine-readable, freely-licensed station directory API. A static/lightly-maintained dataset, as the innovation backlog itself suggests, implies either (a) manual compilation/licensing from a third-party directory source, or (b) an ongoing content-maintenance commitment (station details change: relocations, closures, contact-number changes) that has no current owner on this team.
- **This is a data-sourcing question for `product-manager` + `integration-architect`, not an engineering-effort question.** Flagged as **OQ-011-02** (§9) and as a blocking dependency for Idea 2 specifically — Idea 1 has no such dependency and can proceed independently of how OQ-011-02 resolves.
- **Ruling:** this document does not write acceptance criteria assuming a specific dataset exists or specifying its schema, because doing so would imply a sourcing decision this role has no basis to make. §4.4's acceptance criteria are written to be testable **once a dataset is sourced**, not to assume one already is.

### 4.3 Location-inclusion caution — must be flagged, not assumed safe

**BR-011-13:** The innovation-backlog description of the report-assistant summary includes "approximate last-known location if self-device reporting was on." This document flags, and does not resolve, a live blocker: per `docs/organization/incidents/INC-001-location-ingestion.md`, the self-device location **write path is currently under a server-side kill switch** (`LOCATION_INGESTION_ENABLED`) following a Stage 8 bypass, and read paths of pre-containment coordinate data are under active `compliance-specialist` review (INC-001 §2, "a live decision for `compliance-specialist`, not for this document" — same posture adopted here). Building a new consumer of `assets.lastLocation`/`recovery_cases.lastLocation` data — even a read-only, customer-facing one — is exactly the kind of new consumer INC-001 §3 credits *not existing yet* as the reason the incident is "contained" rather than a live-harm event. Adding one changes that fact.

**Ruling:** the location-inclusion sub-feature of the report-assistant summary is **out of scope for this document's acceptance criteria** and must not be built until (a) INC-001 is formally closed, and (b) any new location-adjacent surface separately clears Stage 8 review, per the innovation backlog's own Idea 4 caution applied here by direct analogy. The report-assistant summary **without** a location field (asset details + timestamp only) has no such dependency and is fully buildable now. Logged as **D-011-01** (§8).

### 4.4 Acceptance criteria — Idea 2 (location-field explicitly excluded per §4.3)

Written testable now for **once** OQ-011-02 (station dataset sourcing) resolves — not a green light to start today; see §9's go/no-go framing.

**AC-011-05: Station locator surfaces a searchable list**
```
Given a sourced SAPS station dataset exists and is loaded into the platform
When a customer opens the station locator from the report-theft flow
Then they can search/browse stations by name or filter by proximity (if geocoordinates are available in the sourced dataset)
And each result shows station name, address, and contact number
```

**AC-011-06: Report-assistant summary compiles existing data only**
```
Given a customer has an open recovery case
When they open the report-assistant summary screen
Then it shows the asset's display name, asset type, and any registered identifying details (make/model/serial/VIN per the asset's existing Feature 004 record)
And it shows the platform's own reportedAt timestamp for the case
And it does not show any location data (per §4.3, D-011-01)
And it does not claim to have filed or submitted anything to SAPS
```

**AC-011-07: Summary is exportable/shareable in a read-aloud or show-at-counter form**
```
Given a customer is viewing the report-assistant summary
When they choose to use it at a police station
Then the information is presented in a format usable without further app navigation (e.g., a single static screen, not a multi-step wizard) — exact UI mechanism (share sheet, print, on-screen only) is a ui-designer/mobile-engineer call, not ratified here
```

**AC-011-08: No filing-service language anywhere**
```
Given any customer-facing copy for the station locator or report-assistant (screen text, notifications, help-center content)
When that copy is reviewed
Then it contains no language implying SAPS is contacted, notified, or filed with on the customer's behalf by the platform
And it is explicit that the customer must still personally report to SAPS
```

---

## 5. Acceptance criteria — Idea 1 (SAPS case-number capture)

**AC-011-01: Case-number fields are optional at initial theft-report submission**
```
Given a customer is filing a theft report via the existing flow
When they submit the report (POST /v1/recovery/cases)
Then the report succeeds with no sapsCaseNumber, reportingStation, or reportedToPoliceAt provided
And the existing required fields (assetId) are unaffected by this feature
```

**AC-011-02: Fields can be added or edited after case creation**
```
Given a customer has an existing open recovery case with no police-report fields set
When they add a sapsCaseNumber, reportingStation, and/or reportedToPoliceAt
Then the case record is updated
And the customer can later edit any of these three fields independently without needing to resubmit the others
```

**AC-011-03: sapsCaseNumber is not strictly format-validated**
```
Given a customer enters a sapsCaseNumber value in any plausible real-world format (e.g., "123/01/2026", "CAS 45/2/26", a value copy-pasted from an SMS with extra whitespace)
When the value is 3-50 characters of non-empty text
Then it is accepted and stored as-is, trimmed of leading/trailing whitespace
And no regex-format rejection occurs (per BR-011-02)
```

**AC-011-04: 48-hour reminder fires once per case, only if the field is still empty**
```
Given a recovery case was reported (reportedAt) more than 48 hours ago
And sapsCaseNumber has never been set on that case
When the reminder check runs (mechanism deferred to product-manager/ux-researcher per BR-011-04)
Then the customer receives one reminder referencing the 48-hour SA insurer requirement
And no further reminders fire for that case once sapsCaseNumber is set
And no reminder fires at all if sapsCaseNumber was already provided within the 48-hour window
```

**AC-011-09: Police-report fields survive case closure**
```
Given a recovery case has police-report fields set
When the case status transitions to recovered or closed
Then the sapsCaseNumber, reportingStation, and reportedToPoliceAt values remain visible in the case detail view
And are not purged or hidden by the closure action itself
```

---

## 6. Data-sensitivity note (non-binding — `cybersecurity-architect`/`database-architect` territory, named for Stage 6/7)

Applying the Feature 004 field-sensitivity precedent (`field-sensitivity-review.md`) by analogy, not ratifying a Stage 8 conclusion here:

- `sapsCaseNumber`, `reportingStation`, `reportedToPoliceAt` are **not** payment-grade, government-ID-document-grade, or precise-location-grade data in isolation — they are closer in sensitivity class to the existing `notes` free-text field already on `recovery_cases`, which receives no field-level encryption today.
- However, **a police case number is a new *category* of personal data this platform has not previously stored: a reference that links a specific customer/asset/incident to an active law-enforcement record.** That is a materially different sensitivity question from "what does this field cost to encrypt" — it is a question of *why the platform is allowed to hold it, for how long, and who can read it*, which is exactly POPIA lawful-basis/processing-purpose territory. This document does not rule that it is fine merely because the fields are technically low-sensitivity by the encryption-cost framing in §6's precedent — see §7.

---

## 7. POPIA / compliance flag — explicitly not resolved here

**This document flags, and does not rule on, whether capturing a SAPS case number tied to a customer's theft report introduces new POPIA obligations.**

Reasons this needs `compliance-specialist` review before Stage 2 design proceeds, rather than being waved through as "just a text field":

- It is new special-context personal data by association — even though the case number itself is just a reference string, its presence on a customer record documents that a specific person was the subject/complainant of a criminal matter, which is a materially different category from "what device do you own" or "what's it worth" (the existing Feature 004 field set).
- Retention: does this data follow the same retention posture as the rest of a closed recovery case, or does linking a customer record to an active SAPS docket number create a distinct retention/purpose-limitation question? Not ruled here — same posture as Feature 008 §5.4 deferring its own retention-period question to `compliance-specialist` rather than inventing one.
- Who can read it: today, `recovery_cases` fields are readable by the case's own account (customer) and, per `security-cases.ts`, a partner-organization security operator once a case is claimed — via `serializeSecurityRecoveryCase`. Should a SAPS case number be visible to the security-company operator working the case, or withheld as customer-only? Not ruled here — flagged as **OQ-011-03** (§9).
- Cross-reference: `docs/organization/10-data-protection-contract-obligations.md` and any standing POPIA processing-register document should be checked by `compliance-specialist` for whether this constitutes a new processing activity requiring a register update — this document does not have visibility into that register's current contents and does not assume the answer.

**No development should proceed past Stage 2 (Product Planning) on Idea 1 until `compliance-specialist` has reviewed this section, consistent with this project's Pre-Approval Checklist item ("Compliance-specialist has reviewed rules touching cancellation, refunds, or regulated disclosures") applied here to a new personal-data category rather than to cancellation/refunds specifically — the same review gate, different trigger.**

---

## 8. Explicitly deferred

| ID | Item | Owner | Revisit trigger |
|---|---|---|---|
| **D-011-01** | Location field in the report-assistant summary (§4.3) | `cybersecurity-architect` (Stage 8) + `compliance-specialist` | INC-001 formally closed AND a fresh location-adjacent Stage 8 review clears this specific new read-surface |
| **D-011-02** | sapsCaseNumber change-history/audit trail (§3.2) | `database-architect` | Stage 6 (Database Design), if OQ-011-01 is ruled "needed" |
| **D-011-03** | Station-dataset sourcing/licensing/maintenance ownership (§4.2) | `product-manager` + `integration-architect` | OQ-011-02 resolves |
| **D-011-04** | Exact 48-hour reminder delivery mechanism (push vs in-app vs both) | `product-manager` + `ux-researcher` | Stage 3 (UX Research) |
| **D-011-05** | Whether security-company operators can see a case's police-report fields | `cybersecurity-architect` + `business-analyst` | OQ-011-03 resolves |
| **D-011-06** | Claims-backend auto-population from these fields (the innovation backlog's own stated "payoff") | `business-analyst` (Feature 004 D-08) | Claims backend Stage 1 begins (not started — no `claims.ts` exists) |
| **D-011-07** | Call-centre agent capture of the same fields (innovation backlog Idea 10) | `business-analyst` + `product-manager` | Call Centre Dashboard (Feature 010) Stage 1 requirements mature past current draft and this feature is confirmed built first |

---

## 9. Open questions (for `product-manager` / `compliance-specialist` / `database-architect` / `integration-architect`)

- **OQ-011-01 (`database-architect`):** Does `sapsCaseNumber`/`reportingStation`/`reportedToPoliceAt` need an append-only change-history, comparable to `callCentreNotes`, given potential future evidentiary value? Leaning "yes" in this document's own view (§3.2) but not ratified.
- **OQ-011-02 (`product-manager`/`integration-architect`):** Where does a real SAPS station dataset come from — manual compilation, a licensed third-party directory, or something else — and who owns its ongoing accuracy? **Blocks Idea 2 (station locator) entirely until resolved. Does not block Idea 1.**
- **OQ-011-03 (`cybersecurity-architect`/`business-analyst`):** Should a claimed recovery case's SAPS case-number fields be visible to the assigned security-company operator (`serializeSecurityRecoveryCase`), or withheld as customer-only data?
- **OQ-011-04 (`compliance-specialist`, secondarily `business-analyst`):** If a more authoritative SAPS CAS-number format specification is later found, should BR-011-02's "no format validation" ruling be revisited toward light format hints (not hard validation)?
- **OQ-011-05 (`product-manager`):** Confirm or override this document's sequencing recommendation (§10) that Idea 1 is buildable independently and immediately, while Idea 2 is gated on OQ-011-02.
- **OQ-011-06 (`compliance-specialist`):** ~~Full ruling requested per §7~~ — **RULED 2026-09-03. See §12 and [`compliance-review-saps-case-data.md`](compliance-review-saps-case-data.md).** Outcome: new personal-information category confirmed; Idea 1 cleared to enter Stage 2 subject to conditions C-011-1…C-011-10. **OQ-011-01 resolved as "yes, change history required" (C-011-8); OQ-011-03 resolved as "withheld from security-company operators" (C-011-9); OQ-011-04 closed (no format validation, agreeing with BR-011-02).**

---

## 10. Sequencing recommendation (non-binding — `product-manager`/`technical-project-manager` call)

Stated because the task creating this document asked whether these fit together or separately, and because leaving it unaddressed would be an omission, not because this role has final sequencing authority:

**Idea 1 (case-number capture) and Idea 2 (station locator/report-assistant) are related but independently shippable.** Idea 1 has no external data dependency and only a compliance-review dependency (§7, OQ-011-06). Idea 2's station-locator half is blocked on a real, unresolved data-sourcing question (§4.2, OQ-011-02) that has no engineering answer — it is a content/licensing decision. Idea 2's report-assistant-summary half (minus the location field, per §4.3) has no such blocker and could proceed once Idea 1's underlying fields exist to summarize (the report-assistant screen surfaces `reportedAt`, asset details, and eventually the case-number fields once entered).

**Recommendation, not a ruling:** sequence Idea 1 first (smaller, no external dependency beyond compliance sign-off), let the report-assistant-summary half of Idea 2 follow once Idea 1's fields exist to display, and treat the station-locator half of Idea 2 as gated separately on OQ-011-02 resolving — it should not hold up the other two.

---

## 11. Pre-Approval Checklist (`business-analyst` self-review)

- [x] Every acceptance criterion is testable (AC-011-01 through AC-011-09, location-field explicitly excluded from AC-011-06 per D-011-01).
- [x] Edge cases enumerated: optional-at-submission (AC-011-01), multi-edit (AC-011-02/BR-011-05), non-strict format validation (AC-011-03/BR-011-02), reminder-fires-once (AC-011-04), fields-survive-closure (AC-011-09/BR-011-09), multiple-open-cases independence (BR-011-07), no-date-ordering-constraint (BR-011-08).
- [x] Coverage limits and policy tier rules cross-checked — **N/A**, this document creates no coverage-limit or tier-gating rule; neither idea is plan-tier-gated in this draft (no rationale surfaced for gating a police-report-assist capability by tier, consistent with Feature 008 §3.1's reasoning against inventing tier gates without precedent — not separately re-argued here).
- [ ] Compliance-specialist has reviewed rules touching cancellation, refunds, or regulated disclosures — **not yet.** §7 explicitly requests this review and blocks Stage 2 progression on Idea 1 pending it (OQ-011-06). This document does not claim that review as complete.
- [x] Terminology matches the domain glossary and existing UI/help-center copy — §2 adds new glossary terms (CAS number, reporting station, date reported to police, station locator, report-assistant summary) consistent with existing `RecoveryCaseDocument` field naming conventions (`reportedAt`, `notes`).
- [ ] Spec reviewed with backend-engineer and database-architect for technical feasibility — **not yet performed.** §3.2/§6 name open schema-design questions (OQ-011-01) for that review rather than assuming feasibility confirmed.
- [ ] QA has reviewed acceptance criteria and confirmed testability before development starts — **deferred to Stage 10 entry per standard lifecycle sequencing; not yet performed.**
- [ ] Product-manager has signed off that the spec matches intended product scope — **pending.** OQ-011-02 and OQ-011-05 in particular need `product-manager` rulings before Stage 2 begins for either idea.

**Net status (as drafted 2026-08-xx — superseded in part by §12):** Stage 1 draft complete for both ideas. **This does not authorize development.** Idea 1 (case-number capture) is closer to Stage-2-ready than Idea 2 (station locator) — it has one real dependency (`compliance-specialist` review, §7/OQ-011-06) rather than two (compliance review **and** an unresolved data-sourcing question, §4.2/OQ-011-02). Idea 2's report-assistant-summary component, once the location field is excluded per §4.3/D-011-01, shares Idea 1's dependency profile and no other. The location-inclusion variant of the report-assistant summary is blocked independently on INC-001 closing and a fresh Stage 8 review, and must not be built under this document's authority even if the rest of Idea 2 proceeds.

---

## 12. Compliance ruling — OQ-011-06 (appended by `compliance-specialist`, 2026-09-03)

**Full ruling: [`compliance-review-saps-case-data.md`](compliance-review-saps-case-data.md).** Summary
only here — the review document governs where the two differ.

**§7 was right to flag this rather than wave it through.** Ruling:

1. **Regulatory scope confirmed, not assumed.** POPIA applies. GDPR is **not** triggered by this field
   set (no EU data subjects evidenced; EU *processing location* per `render.yaml` is not itself an Art. 3
   trigger) — re-opens if an EU customer is ever onboarded (**C-011-7**). PCI-DSS not engaged. The
   dominant constraint turns out to be **insurance-sector recordkeeping**, which imposes a retention
   *floor* pulling against the s14 minimisation instinct.
2. **Yes — new personal-information category and new processing activity.** The information is the
   assertion ("this identified person reported a crime, at this station, on this date"), not the string.
   Nuance: the customer's own triple is **ordinary** personal information, not s26 special personal
   information, because s26(b) is scoped to offences allegedly committed **by** the data subject and our
   customer is the complainant. **But** the adjacent free-text fields can capture *named suspects* —
   s26(b) special personal information about a third party with no relationship to the platform
   (**C-011-1**, applies to already-shipped `recovery_cases.notes` too).
3. **Lawful basis: s11(1)(b) contract + s11(1)(c) legal obligation. NOT consent** — do not build a
   consent toggle. The field being optional is a usability fact, not a lawful-basis fact, and a
   withdrawable basis is incompatible with the retention floor.
4. **Yes — the platform RoPA must be updated (C-011-4).** No RoPA exists at all; this is the fifth
   feature to file that condition. **It is NOT a blocking precondition on Stage 2, Stage 6, or Stage 7.**
   It is a hard precondition on the first processing of real customer SAPS data — the same M1 floor that
   already blocks real customer PII on every surface. The entry lands inside **INC-001-C-10** (due
   2026-09-15), not as a Feature-011 mini-register. It lands **in parallel**.
5. **Retention set (binding on `database-architect`):** the longer of **5 years from case closure /
   claim finalisation** (provisional on C-011-6 licence confirmation) or any longer Client instruction;
   no indefinite retention; automated, evidenced deletion (**C-011-10**); erasure requests do not reach
   these fields while the basis holds, and the s18 notice must say so (**C-011-5**).
6. **OQ-011-01 → "yes."** Change history is **required** (append-only or last-write-with-actor-and-
   timestamp) — evidentiary value plus s16. Mechanism is `database-architect`'s (**C-011-8**).
7. **OQ-011-03 → "withheld."** Police-report fields must be excluded from `serializeSecurityRecoveryCase`
   and every security-company surface — s10 minimality, plus C-008-8 (the sharing channel is itself
   unauthorised) (**C-011-9**).
8. **OQ-011-04 → closed.** No format validation; BR-011-02 stands and I concur.
9. **D-011-01 unchanged — still blocked.** No new consumer of location data until INC-001 closes.

**Disposition: Idea 1 is CLEARED to enter Stage 2, subject to C-011-1…C-011-10. OQ-011-06 is
discharged.** Idea 2's remaining blocker (OQ-011-02, station-dataset sourcing) is not a compliance
question and is unaffected. §11's unchecked compliance-review checkbox may now be marked complete.
