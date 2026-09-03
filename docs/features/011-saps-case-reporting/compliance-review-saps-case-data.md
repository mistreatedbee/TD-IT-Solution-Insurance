# Feature 011 — Compliance Review: SAPS case-number / police-report data (OQ-011-06)

**Owner:** `compliance-specialist`
**Date:** 2026-09-03
**Status:** **Ruling issued.** Discharges `business-requirements.md` §7 / **OQ-011-06**. Partially rules
on **OQ-011-01** and **OQ-011-03**. Does **not** discharge Stage 8, Stage 10, or `product-manager`
sequencing sign-off.
**Not legal advice** — see §10.
**Reads on:** [`docs/organization/10-data-protection-contract-obligations.md`](../../organization/10-data-protection-contract-obligations.md)
(Operator framing, §19 contract terms, CT-register), [`compliance-review-supabase.md`](../001-authentication/compliance-review-supabase.md)
§4–§6 (POPIA method — not restated), [`compliance-review.md`](../008-self-device-gps-tracking/compliance-review.md)
(C-008 conditions), [`INC-001-location-ingestion-popia-assessment.md`](../../organization/incidents/INC-001-location-ingestion-popia-assessment.md).

---

## 1. Regulatory scope — confirmed, not assumed

The business-requirements document flagged this as "POPIA review". I do not accept a single-regime
framing by default. Determination for **this field set** (`sapsCaseNumber`, `reportingStation`,
`reportedToPoliceAt`):

| Regime | Applies to this feature? | Reasoning |
|---|---|---|
| **POPIA (Act 4 of 2013)** | **Yes — confirmed.** | Data subjects are South African; the responsible party is TD IT Solution (Pty) Ltd, a South African juristic person (TDIT-2026-09); the processing is of personal information of identifiable living natural persons. A SAPS docket reference is, by definition, SA-domestic. |
| **GDPR** | **Not triggered by this field set. Standing open item, not closed.** | No evidence anywhere in this repository of EU data subjects or EU-market targeting. Note the trap: **the platform's processing happens in Frankfurt** (`render.yaml:9`, `render.yaml:56`) and in an EU Supabase region. Processing *location* is not itself an Art. 3(1) establishment trigger for a non-EU controller serving only SA subjects, and Art. 3(2) requires targeting EU subjects. My position: GDPR does **not** apply today. **If the platform ever onboards an EU-resident customer, this ruling and the whole retention position below are re-opened** — logged as **C-011-7**. |
| **PCI-DSS** | **No.** | No cardholder data anywhere in this field set or in the recovery-case entity. Feature 011 introduces no payment flow. PCI scope unchanged and still nil (no payments backend exists). |
| **Insurance-sector recordkeeping** (Insurance Act 18 of 2017, FAIS General Code, Policyholder Protection Rules, FICA s23) | **Probably yes — and it is the dominant retention driver.** | A police case number is *claim-substantiating evidence*. Where a licensed insurer / UMA / FSP handles a claim, records substantiating the claim carry a statutory retention floor (commonly five years). **Whether TD IT Solution holds an insurer licence, a UMA mandate, or an FSP licence is nowhere evidenced in this repository.** That licence status determines the exact floor. **C-011-6.** |

**Consequence:** this is not a POPIA-only question. The most binding constraint on this field set turns
out to be a *retention floor from insurance regulation*, which points the opposite way to the POPIA s14
minimisation instinct. Both must be satisfied at once — see §5.

---

## 2. Ruling: yes, this is a new personal-information category. It is not "just a text field."

**Ruling on OQ-011-06, limb 1: confirmed new processing activity and new information category.** Three
independent grounds, any one sufficient.

**(a) The information is the *assertion*, not the string.** `sapsCaseNumber` in isolation is an opaque
reference. On a customer's record it is not opaque: it asserts, as recorded fact, that **this identified
person was the complainant in a criminal matter, at a named police station, on a named date.** That is a
new *category* — a life-event/legal-process record about a person — and a new *purpose* (claim
substantiation and police liaison) that is not covered by any purpose currently recorded for
`recovery_cases`, `assets`, or `policies`. §6 of the business-requirements document is right that the
encryption-cost framing of `field-sensitivity-review.md` is the wrong test, and it correctly declined to
apply it.

**(b) s26 special-personal-information analysis — the customer's own record is *not* special PI, but the
adjacent data is.** This is the part that needs care, and the answer is not the intuitive one.

- POPIA s26(b) prohibits processing personal information concerning a data subject's **criminal
  behaviour**, scoped in terms to offences **allegedly committed by the data subject** and proceedings
  in respect of such offences. Our customer is the **complainant/victim**, not the accused. **Ruling:
  the customer's own `sapsCaseNumber`/`reportingStation`/`reportedToPoliceAt` triple is ordinary
  personal information, not s26 special personal information.** No s27/s33 authorisation is required for
  the triple as specified.
- **But two carve-outs are live, and one of them is already unconstrained in shipped code:**
  1. **Third-party suspect data.** The recovery-case `notes` field is unconstrained free text
     (`createCaseSchema`, `backend/src/routes/recovery.ts`), and Feature 010 FR-12 proposes another
     free-text field. A customer describing a theft frequently names a suspect — an ex-employee, a
     domestic worker, a former partner. **That is s26(b) special personal information about a person who
     is not our customer, has no relationship with the platform, and to whom s18 notice is not
     practicable.** Processing it needs a s27/s33 authorisation the platform does not have, and it is
     unlawful today by omission, independent of Feature 011. Feature 011 makes it worse only in that a
     CAS number materially increases the evidentiary weight of whatever is in that free-text field.
     **C-011-1** — this must be controlled by UI guidance and agent/customer-facing copy, not by
     pretending it will not happen.
  2. **Any use of theft history against the customer.** If the platform ever uses recorded CAS numbers /
     theft frequency to price, decline, flag, or fraud-score a customer, the same record becomes
     information about that data subject's own conduct, engages s26/s33 and s71 (automated decision
     making), and separately engages §19(e) non-monetisation / **CT-9**. **Prohibited without my prior
     review. C-011-2.**

**(c) Operator framing — we cannot self-authorise a new purpose.** Per
[`10-data-protection-contract-obligations.md`](../../organization/10-data-protection-contract-obligations.md)
§1, NextWave is the **Operator** and TD IT Solution is the **Responsible Party**. Under POPIA s20/s21 and
TDIT-2026-09 §19(a), the Operator may process personal information **only on the Client's documented
instructions**. A new information category collected for a new purpose is exactly the kind of thing that
requires an instruction. **No instruction artefact exists** (CT-4, open, due 2026-09-15). So Feature 011
cannot be authorised by an engineering document, this one included — it must be *added to* CT-4.
**C-011-3.**

---

## 3. Ruling: yes, the platform RoPA must be updated — and it does not exist

**Explicit answer to the question asked.** A new information category + new purpose + new retention basis
+ a changed recipient position is, by definition, a new **processing activity** requiring a record entry
(POPIA s17 read with s14, and the RoPA method at `compliance-review-supabase.md` §6). **This requires a
RoPA entry.**

**Second, less comfortable answer: there is still no RoPA of any kind in this repository.** I re-verified
today — no `ropa*` artefact exists anywhere under `docs/`; the term appears only as a forward obligation
in a dozen documents (C-006-4, C-007-4, C-008-12, INC-001-C-10, SR-004-admin-4, north-star M1). Feature
011 is now the **fifth** feature to file the same open condition. That is a pattern, and it is mine to
close, not to re-file.

**Ruling on blocking vs. parallel:**

- **The RoPA entry is NOT a blocking precondition on Stage 2 entry, Stage 6, or Stage 7.** Design work on
  a field set does not process anyone's information. Blocking Stage 2 on a register that has been open
  across four prior features would stall a low-risk feature behind a platform-level debt it did not
  create — and would be enforcement theatre, not risk reduction.
- **It IS a hard precondition on the first processing of real customer SAPS data** — i.e. on Stage 9
  deployment to any surface holding real customer PII. This sits on exactly the same footing as the
  existing M1 compliance floor (`north-star-2000-dau.md` §M1), which already blocks real customer PII
  on every surface. Feature 011 adds no new blocker; it inherits the existing one.
- **Do not create a Feature-011-only mini-register.** The entry lands inside the single platform RoPA I
  owe under **INC-001-C-10 (2026-09-15)**. I am adding Feature 011's processing activity to that work
  item now, so it is drafted with the rest rather than retrofitted. **C-011-4.**

---

## 4. Lawful basis and s18 notice language — my ruling, binding

**Lawful basis: NOT consent.** s11(1)(b) — necessary for the conclusion or performance of a contract to
which the data subject is party (the insurance relationship; a police case number is a procedural
precondition to a theft claim), supported for the recordkeeping limb by s11(1)(c) (compliance with a legal
obligation of the responsible party, per §1's insurance-sector row), with s11(1)(f) legitimate interests
as a subsidiary basis for the recovery-coordination limb.

**Why not consent, explicitly, because the field is voluntary and it will be tempting to call that
consent:** the field being optional at capture is a *usability* fact, not a lawful-basis fact. Consent
under s11(2)(b) is withdrawable at any time. A claim-substantiating record that must be deleted the
moment the customer withdraws consent is unworkable and would put the platform in direct conflict with
the §1 retention floor — and telling a customer they can withdraw when they legally cannot is a worse
outcome than not asking. **Ruling: basis is contract + legal obligation. Do not build a consent toggle
for this field set.**

**s18 notice must be updated before first capture. C-011-5.** Required content, in plain language:

- **What:** "the police case number, the station where you reported it, and the date you reported it."
  Use "police case number"; "CAS number" only as a secondary clarifier (agrees with BR-011-02 §2).
- **Why:** to support a future claim and to help coordinate recovery.
- **Who sees it:** TD IT Solution staff handling your policy or claim. **State plainly that it is not
  shared with security-company partners** (§6 below), because that is the answer customers will assume
  the other way.
- **What the platform does NOT do:** it does not contact, notify, or file anything with SAPS. This is
  already an acceptance criterion (AC-011-08) for Idea 2; I am extending it to the s18 notice for Idea 1,
  because a customer handing over a case number will reasonably assume it goes somewhere.
- **How long:** the retention period at §5, stated as a period, not as "as long as necessary."
- **Erasure limits:** that a deletion request does not reach these fields while the statutory retention
  basis holds (§5). Say it in the notice, not at the moment someone asks.

---

## 5. Retention ruling — mandatory, and it is a floor, not a TTL

**Ruling.** The police-report triple does **not** follow a short recovery-case retention default. Retain
for the **longer of**:

1. **five (5) years from closure of the recovery case or finalisation of any associated claim, whichever
   is later** — the insurance/FICA-style recordkeeping floor per §1, provisional on **C-011-6**
   (licence-status confirmation), which may raise but is unlikely to lower it; and
2. any longer period the **Client, as Responsible Party**, instructs under CT-4.

**Ceiling:** POPIA s14(1) requires deletion or de-identification once the retention basis expires. There
is **no indefinite retention** of this field set. On expiry the triple is deleted from the case record;
the case itself may survive de-identified.

**Interactions I am ruling on now so they are not discovered later:**

- **BR-011-09 (fields survive case closure) is correct and is now a compliance requirement, not just a
  product preference.** Closure must not purge them.
- **Erasure (s24/s25):** a customer erasure request does **not** reach these fields while the retention
  basis holds (s14(1)(a) — retention required by law or contract). The response to such a request must
  say so and give the expiry date. Note the platform has **no erasure path at all** today
  (INC-001-C-11) — Feature 011 does not create that gap and is not blocked on it, but the retention
  expiry job below cannot be waved through as "policy only."
- **Enforcement must be an automated, evidenced job, not a policy sentence.** The precedent is
  unambiguous: `location_events` had no TTL index and that was a finding (INC-001 §2.2). `database-architect`
  owns the mechanism at Stage 6; **I own the number, and the number is above.**

**Ruling on OQ-011-01 (change history) — the business-requirements document leaned "yes" and was right.
I am converting it from a lean to a requirement.** These fields are evidentiary: they may be relied on in
a claim or a dispute, and s16 (information quality) plus the platform's audit-reconstruction posture
(ADR-0006 Trail A) mean the platform must be able to state **who set or changed the value and when**.
Append-only, or last-write-with-timestamp-and-actor, is **required**. Which of the two, and the schema,
is `database-architect`'s call at Stage 6. **C-011-8.**

---

## 6. Ruling on OQ-011-03 — security-company operators do **not** see the police-report fields

**Compliance limb ruled. Default is withhold.** Reasons:

- **s10 minimality.** A security-company operator's documented task is locating and recovering a physical
  asset. A SAPS docket reference does not advance that task — it is a *claims* artefact, not a *recovery*
  artefact. No operational need has been documented anywhere for the operator to hold it. Absent a
  documented need, disclosure fails minimality on its face.
- **The disclosure channel itself is unauthorised.** Per Feature 008 **C-008-8**, security-company
  sharing has no lawful basis determination, no responsible-party-vs-operator determination, no s21
  written contract and no PSIRA-registration check. Adding a new field to a sharing channel that is
  not itself authorised compounds an open finding.
- **Onward-flow risk.** A docket reference in a third party's hands enables that third party to make
  enquiries about the customer's criminal matter — a use the customer has not been told about and the
  platform cannot control.

**Requirement:** `serializeSecurityRecoveryCase` (`backend/src/routes/security-cases.ts`) **must not**
include `sapsCaseNumber`, `reportingStation`, or `reportedToPoliceAt`. Read access is limited to the
customer and to internal admin / `support_agent` roles under the existing `privileged_data_access` audit
event. **C-011-9.**

This may be revisited if, and only if, a specific operational need is documented **and** C-008-8 is
cleared. `cybersecurity-architect` retains the call on how the exclusion is technically enforced and
tested; I retain the call on whether it is satisfied.

---

## 7. Ruling on OQ-011-04 — no format validation, and no compliance interest in adding one

BR-011-02's "no regex enforcement" ruling stands and I concur. The only compliance angle is s16
(information quality), which is served by *not* silently rejecting a correctly-transcribed value in an
unanticipated format. If an authoritative SAPS format specification is later found, a soft format **hint**
is acceptable; a hard rejection is not. Nothing here blocks Stage 2. **OQ-011-04 closed.**

---

## 8. Unchanged: D-011-01 (location in the report-assistant summary) stays blocked

§4.3 of the business-requirements document read INC-001 correctly and adopted the right posture. My
ruling is unchanged and this document does not relax it: **no new consumer of `assets.lastLocation` or
`recovery_cases.lastLocation`, read-only and customer-facing included, until INC-001 is formally closed
and the specific new read-surface clears its own Stage 8 review.** C-008-1/-5/-6/-12 remain unreleased;
I have released none of them.

---

## 9. Conditions register — Feature 011

| ID | Condition | Owner | Blocks |
|---|---|---|---|
| **C-011-1** | **Free-text fields must not become an unmanaged store of third-party suspect data** (§2(b)(1)). Required: customer- and agent-facing guidance in the notes/description UI ("describe what happened and what was taken — please don't name people you suspect"), and the same guidance in help-centre copy. Applies to `recovery_cases.notes` (already shipped) and to Feature 010 FR-12. | `ui-designer` + `technical-writer`, copy approved by me | Stage 4 exit for any surface with a free-text incident field |
| **C-011-2** | **Standing prohibition:** no use of CAS/theft-history data for pricing, declining, fraud-scoring, or any automated decision about a customer without my prior review (s26/s33, s71, §19(e)/CT-9). | all roles; enforced at Stage 8 | Standing |
| **C-011-3** | **Feature 011's processing purpose must be written into the CT-4 documented-Client-instructions artefact.** An Operator cannot self-authorise a new purpose. | `compliance-specialist` + `cto` | First processing of real customer SAPS data (CT-4 due 2026-09-15) |
| **C-011-4** | **RoPA entry** for "police-report capture (claim substantiation)": categories, purpose, basis per §4, recipients per §6, retention per §5, transborder position (Frankfurt/EU per doc 10 §2). **Drafted inside INC-001-C-10, not as a separate artefact.** | `compliance-specialist` (me) | First processing of real customer SAPS data. **Not** Stage 2/6/7 |
| **C-011-5** | **s18 notice / privacy-notice update** with the §4 content before first capture. | `compliance-specialist` (copy) + `technical-writer` | First capture on any surface holding real customer data |
| **C-011-6** | **Confirm TD IT Solution's insurance licence status** (insurer / UMA / FSP / none) — this sets the exact statutory retention floor in §5. Nowhere evidenced in the repository. | `cto` (owner action) → `compliance-specialist` | Finalising §5's number; does not block Stage 2 |
| **C-011-7** | **GDPR re-assessment trigger.** If any EU-resident data subject is onboarded, §1 and §5 are re-opened. | `compliance-specialist`, prompted by `product-manager` | Standing |
| **C-011-8** | **Change history required** on the police-report triple (append-only or last-write-with-actor-and-timestamp). Mechanism is `database-architect`'s; the requirement is mine. **Resolves OQ-011-01 as "yes."** | `database-architect` | Stage 6 exit |
| **C-011-9** | **Police-report fields excluded from `serializeSecurityRecoveryCase`** and from any security-company surface. **Resolves OQ-011-03 as "withheld."** | `backend-engineer`, verified `security-engineer` | Stage 8 exit |
| **C-011-10** | **Automated, evidenced retention-expiry deletion** for the triple per §5. Not a policy sentence — a job with evidence it ran (INC-001 §2.2 precedent). | `database-architect` (design), `security-engineer` (verification) | Stage 8 exit; evidenced before the first record reaches its expiry |

---

## 10. Stage-2 disposition and standing statement

**Idea 1 (SAPS case-number capture) is CLEARED to enter Stage 2, subject to the conditions above.**
**OQ-011-06 is discharged.** None of C-011-1 through C-011-10 blocks Stage 2, Stage 6, or Stage 7 design
work; C-011-3, C-011-4, C-011-5 and C-011-6 bite before real customer data, and C-011-8, C-011-9,
C-011-10 bite at Stage 6/Stage 8 exit. Idea 2's remaining blocker (OQ-011-02, station-dataset sourcing)
is not a compliance question and is unaffected by this ruling. D-011-01 stays blocked (§8).

**This is a compliance determination made from the statute, the contract terms as summarised to me, and
this repository. It is not legal advice.** Two items belong with admitted counsel, consistent with doc 10
§7: (a) confirmation that a victim's own docket reference falls outside s26(b) — I am confident on the
statutory wording but this is a construction point; and (b) the exact insurance-sector retention floor
once C-011-6 returns.

**Filed by:** `compliance-specialist`, 2026-09-03.
**Does not discharge:** Stage 8 · Stage 10 · CT-1/CT-3/CT-4 · INC-001-C-10 · C-008-1/-5/-6/-8/-12 ·
`product-manager` sequencing sign-off (OQ-011-02, OQ-011-05).
