# 11 — Documented Client Instructions (TDIT-2026-09 clause 19(a))

**Owner:** `compliance-specialist` · **Counter-owner:** `cto` (obtaining what is missing)
**Date filed:** 2026-09-14 · **Discharges:** **CT-4**
([`10-data-protection-contract-obligations.md`](10-data-protection-contract-obligations.md) §6, due 2026-09-15)
**Status:** **Active, and deliberately incomplete.** §3 is the record of instructions that genuinely
exist. §4 is the record of the places where **no instruction exists and one is needed** — those are
open items for the Client to actually give, not gaps this document fills by inference.
**Not legal advice** — see §9.

---

## 1. What this document is, and the one thing it must not become

TDIT-2026-09 **§19(a)**: the Developer processes personal information **only on the Client's
documented instructions**. NextWave Digital Solutions is the **Operator**; TD IT Solution (Pty) Ltd
is the **Responsible Party** (POPIA s1, s20–s21; the two-tier structure is established at
[`10-data-protection-contract-obligations.md`](10-data-protection-contract-obligations.md) §1).

An operator processing without instruction is processing **without authority**, however benign the
processing is. This document is the register of that authority.

**The failure mode this document is written against.** The tempting version of a "documented
instructions" artefact is one that writes down what we already do, has nobody sign it, and calls the
clause discharged. **That is not an instruction record — it is a description of our own conduct
wearing the Client's name.** Nothing enters §3 unless it is traceable to something the Client
actually signed or actually said. Everything else goes to §4 as an **open item**, and stays visibly
open until the Client answers.

Accordingly, **§4 is longer than §3.** That is the honest state, and it is the finding, not a defect
in the document.

---

## 2. What counts as an instruction

| Form | Weight | Notes |
|---|---|---|
| **A term of TDIT-2026-09 itself** | **Highest.** Signed, binding (`contract-tdit-2026-09-scope-summary.md` §1) | The contract is the founding instruction set |
| **A signed addendum or Change Request** under §6 of the contract | **High** | The §6 CR procedure is itself an instruction about how instructions change |
| **Written confirmation from a person authorised to bind the Client**, identifying its subject matter | **Sufficient** | Email is writing under ECTA ss11–12 (ruled at [`10-…`](10-data-protection-contract-obligations.md) §10.2 limb 1) |
| **An informal affirmative** ("its fine", "go ahead") with no identified object | **NOT sufficient** | Ruled at [`10-…`](10-data-protection-contract-obligations.md) §10.2 limb 2. It is writing; it is not a specific, informed expression of will. It is recorded as correspondence, never as an instruction |
| **A decision by anyone inside NextWave**, including the platform owner and `cto` | **NOT an instruction** | The platform owner is *our* principal, not the Client's. This distinction is load-bearing throughout §3 and §4 |
| **Silence, or the absence of objection** | **NOT an instruction** | See §6 |

**Standing rule: an agent in this organisation may not record an instruction on the Client's behalf.**
No agent has a channel to the Client (`correspondence/README.md` rule 1). Entries in §3 are
transcriptions of a source; entries in §4 are requests.

---

## 3. Register A — instructions actually on record

Everything below is traceable to the signed contract. **Nothing in this table is inferred**, and
the "source" column is the whole of the justification for each row.

| # | Instruction | Source | Scope / limits |
|---|---|---|---|
| **I-1** | **Build and operate seven named product modules**: Customer Mobile App, Admin Dashboard, Security Dashboard, **Call Centre Dashboard**, Backend/API, Database, GPS Integration | TDIT-2026-09 **Schedule A**, per `contract-tdit-2026-09-scope-summary.md` §2 | This is an instruction to **build**. It is the closest thing on record to a general authorisation to process personal information for the purpose of operating these surfaces. **It does not itemise data categories, purposes, retention, sub-processors, or access rules** — which is why §4 exists |
| **I-2** | **Process personal information only on the Client's documented instructions** | §19(a) | The clause that makes this document necessary. Self-referential: it authorises nothing by itself |
| **I-3** | **Notify the Client of any breach within 48 hours of becoming aware** | §19(b) | Discharged procedurally by [`runbooks/ct-3-breach-notification-runbook.md`](runbooks/ct-3-breach-notification-runbook.md) |
| **I-4** | **Do not transfer personal information outside South Africa** without the Client's prior written consent and equivalent protection | §19(c) | **Currently unmet.** CT-1 is "sent — informally acknowledged, consent not confirmed in the required form" ([`10-…`](10-data-protection-contract-obligations.md) §10.3). A **prohibition** presently in force, not a permission |
| **I-5** | **Anonymise or delete test data after test completion** | §19(d) | Live exposure: seeded accounts persist in the production Supabase project with no teardown path (**CT-5**) |
| **I-6** | **Do not monetise personal information** | §19(e) | Standing prohibition; **CT-9** enforces it at Stage 8. No analytics, ad-tech, data-brokerage, model-training or data-sharing integration without `compliance-specialist` review |
| **I-7** | **Physical security-company tablet hardware is the Client's responsibility**; making the Security Dashboard tablet-web-optimised is ours | Contract, per `contract-tdit-2026-09-scope-summary.md` §4 | A scope instruction with a data consequence: **devices holding platform sessions in the field are provisioned and controlled by the Client**, not by us — relevant to device-loss incident handling |
| **I-8** | **GPS hardware, payment-gateway fees, SMS costs, hosting and third-party API fees are Client-paid** | Contract, per `contract-tdit-2026-09-scope-summary.md` §5 | Implies the Client is the **contracting party for GPS hardware and the PSP** when those are selected. Their data-sharing terms are therefore partly the Client's to negotiate — see **G-5** |
| **I-9** | **Anything outside Schedule A requires a written Change Request**: written request → 3-business-day quote → 50% advance | Contract, per `contract-tdit-2026-09-scope-summary.md` §6 | The mechanism by which a **new** instruction is given. **Any new processing purpose not within Schedule A needs this route, not a verbal go-ahead** |

### 3.1 Correspondence on record that is *not* an instruction

| Item | What it is | Why it is not an instruction |
|---|---|---|
| [`correspondence/SENT-2026-09-14-ct-1-cross-border-consent-request.md`](correspondence/SENT-2026-09-14-ct-1-cross-border-consent-request.md) | Our §19(c) consent request to the Client, sent 2026-09-14 | A request **from us**. It discloses; it instructs nothing |
| The Client's reply, *"its fine."* | A positive, unconditional response | Identifies no object, names no clause, does not state that it binds TD IT Solution (Pty) Ltd. Ruled at [`10-…`](10-data-protection-contract-obligations.md) §10.2. **Recorded here so nobody later reads it as a general authorisation for anything.** It is not even the §19(c) consent it was asked for, let alone a §19(a) instruction |

**That is the entire instruction record. Nine rows, all from one signed document, none data-specific.**
A repository-wide search for any Client-originated direction outside the contract returns nothing.

---

## 4. Register B — instructions that do **not** exist and are needed

Each row is a real gap. **None is filled by assumption, and none should be treated as authorised
because we are already doing it.** The right-hand column is what actually needs to be put to the
Client.

| ID | Topic | Current state — what we are doing without instruction | What the Client needs to instruct |
|---|---|---|---|
| **G-1** | **Email dispatch** | See §5 — treated separately because it is the specific item CT-4 was required to cover | §5.4 |
| **G-2** | **Who may access live customer personal information, for what purpose** | NextWave engineering holds access to the production Supabase project and the MongoDB Atlas cluster. **No instruction governs who, for what, or with what logging** — flagged at [`10-…`](10-data-protection-contract-obligations.md) §1 as the most consequential piece of the §19(a) gap | A standing access instruction: which roles may access live personal data, for which purposes (incident, defect, migration, support), whether standing or break-glass, and that access is logged |
| **G-3** | **Retention periods** | We set them. A 12-month audit-log retention is asserted; `location_events` has **no TTL index**; no deletion job runs on policy cancellation; no erasure path exists (INC-001) | **Retention periods are the Responsible Party's to set.** The Client must instruct or ratify each: identity/auth records, audit logs, policy and claim history (subject to insurance recordkeeping floors), asset records, location history, notification records |
| **G-4** | **Privacy notice and consent copy** | Authored by this role; published on live public pages | Ratification that the s18 notice is given **in the Client's name** as Responsible Party, and that the Client accepts its contents. Today a customer-facing notice speaks for a company that has not approved its wording |
| **G-5** | **Appointment of sub-operators** | Supabase, Resend, Render, Vercel, MongoDB Atlas and AWS were all selected **by us**. No general written authorisation to appoint sub-operators exists | Either a **general written authorisation to appoint sub-operators with a notice-and-object period**, or per-appointment approval. **CT-1's §19(c) consent is about *location*, not about *appointment*** — closing CT-1 does not close this. Prospectively critical for the **GPS hardware vendor and the PSP**, which the Client pays for (I-8) and which are not yet chosen |
| **G-6** | **Location processing** | INC-001: a location-ingestion endpoint reached production and a preview build. **No Client instruction ever authorised location processing at all** ([`10-…`](10-data-protection-contract-obligations.md) §8 ¶2) | An express instruction on whether, when and on what basis asset/device location may be collected, how long it is kept, and whether it may be shared with security-company partners. **Required before Feature 008/009 location ingestion is re-enabled** |
| **G-7** | **Data sharing with security-company partners** | Security Company Dashboard and operator portal surfaces exist. No instruction governs what a partner may see about a customer, or under what agreement | What may be disclosed to a partner, on what trigger, for how long, and who contracts with the partner — the Client or us |
| **G-8** | **s23/s24 data-subject requests** | A contact address is published on live pages. **No named responder, no SLA, no identity-verification step, no procedure** (**OI-R-11**) | Whether the Client answers rights requests itself or instructs us to answer on its behalf; the SLA; and where the request lands. As Responsible Party the duty is theirs, and today it has nowhere to go |
| **G-9** | **Deletion and erasure** | No erasure path exists. No deletion on policy cancellation. No teardown for seeded accounts (**CT-5**) | The deletion instruction: on erasure request, on policy cancellation, on contract termination — and what must be **kept** despite a deletion request for insurance-recordkeeping reasons |
| **G-10** | **Legal hold** | `cto` carve-out at INC-001 §7.3 G-4 permits retention against a scheduled purge | Confirmation that a hold over the **Client's** data may be placed by us at all, and that the Client is informed when it is ([`10-…`](10-data-protection-contract-obligations.md) §6 CT-6) |
| **G-11** | **KYC identity-number collection** | `backend/src/lib/customer-profile-validation.ts` accepts the **full 13-digit SA ID number** into the Frankfurt API; only `idNumberLast4` is persisted | Whether the Client instructs collection of the full number at all, and confirmation of the **CT-11** minimisation (client-side validate and truncate) |
| **G-12** | **Test data on live infrastructure** | One Atlas cluster backs dev, test and production (**MP-8**); seed accounts write to the production Supabase project | Acknowledgement of the co-mingling, and an instruction on whether it may continue pending a staging environment. §19(d) is the Client's protection to waive or insist on, not ours to assume |
| **G-13** | **Incident contact and escalation path** | The §19(b) notice currently has no named recipient beyond "the signatory to TDIT-2026-09" | A named incident contact, a channel, and an after-hours route (**CT-3-OI-5**) |
| **G-14** | **Termination and return/deletion of data** | Contract term ends 1 September 2027. No instruction exists on what happens to personal information at termination | Whether data is returned, deleted, or transferred at termination, in what format and within what period |

**G-2, G-3, G-6 and G-8 are the four where the absence of instruction is currently producing live
processing without authority.** The rest are prospective or low-volume.

---

## 5. Email dispatch — the instruction position, stated specifically

Required by CT-4 to be covered expressly, in light of today's Resend/Supabase findings
(`docs/features/001-authentication/compliance-review-resend.md` Appendices C and D).

### 5.1 What is actually true today — verified, not assumed

| Fact | Evidence |
|---|---|
| **Resend has never sent an email for this platform.** The account exists (API key `Onboarding`, created 2026-08-13, `sending_access`); its Logs page shows **zero send events** | `compliance-review-resend.md` **C.1**, owner dashboard screenshots |
| **The emails the owner received were delivered by Supabase Auth's own built-in sender**, bypassing both the `auth-send-email` Edge Function and Resend. Best-supported cause: **the Send Email Hook was never enabled** | `compliance-review-resend.md` **C.1.1**, owner confirmation |
| **Supabase's built-in sender only delivers to addresses on the project team.** A real customer signing up would **not** have received the mail | `compliance-review-supabase.md` §5.2; `compliance-review-resend.md` **C.7** |
| **The backend's own Resend path no-ops silently** when `RESEND_API_KEY` / `EMAIL_FROM` are unset — domain notifications do not send and do not error | `backend/src/lib/resend-email.ts:14–22`, per `compliance-review-resend.md` **C.1.2** |
| **A dead Brevo path still exists** — `backend/src/lib/transactional-email.ts` posts to `api.brevo.com` with no production caller, but `BREVO_API_KEY` is still parsed at `backend/src/config/env.ts:304`. **One environment variable would activate a second, un-onboarded operator silently** | **C-R-8** |
| Residual: Resend's log retention is 30 days and the key is older than that, so a ~2-day window in mid-August cannot be excluded from the log alone | `compliance-review-resend.md` **C.1.2**; closed by **OI-R-8** |

### 5.2 The instruction consequence — and it is favourable

**No customer personal information has been dispatched by email to a third-party operator on the
Client's behalf.** The §19(a) gap on email is therefore **prospective, not retroactive**: there is
no past processing-without-instruction to remediate on this limb, and the instruction can be
obtained **before** the first real send rather than after it.

**That advantage is lost the moment the Send Email Hook is enabled.** The instruction must be in
place before that switch is flipped, not in the same week.

### 5.3 What email dispatch involves, so the instruction can be specific

Plain-language specificity is this role's standing practice; a generic "you may send emails"
instruction would be worth nothing:

- **Recipients:** customers, prospective customers who begin onboarding, platform administrators,
  security-company operators, invited staff.
- **Message categories:** account verification · password reset · staff/admin invitation · policy
  and asset notifications · theft-report and recovery-case updates · **onboarding-incomplete
  prompts, which this role has characterised as MARKETING** (`compliance-review-resend.md` §A.12,
  engaging **POPIA s69** and **s13**).
- **What leaves the country:** recipient email address, single-use links, and the **message body**,
  which can include an insured item's name and a theft/recovery case reference — plus `ipAddress` on
  some templates. The operator is **Resend (Plus Five Five, Inc., California)**, storing in the
  **United States** with 22 US sub-processors and ~30-day retention.
- **Content prohibitions already imposed by this role** (**C-R-3(a)**, standing regardless of any
  instruction): no free-text case notes, no SAPS case number or reporting station, **no coordinate,
  address or last-known-location string**, no ID number, no payment-instrument data in any email body.

### 5.4 The instruction required — G-1, put as questions for the Client

**Do not draft answers to these. They are the Client's to give.**

1. **Are we instructed to send transactional email to customers on the Client's behalf at all**, and
   for which of the categories at §5.3?
2. **Is Resend approved as the email sub-operator**, knowing it is US-domiciled, that message bodies
   are stored in the United States for about 30 days, and that its sub-processors are all US? (This
   is the **appointment** question — **G-5** — and is separate from the §19(c) **location** consent
   CT-1 seeks.)
3. **Is marketing email authorised at all?** The onboarding-incomplete prompt is marketing on this
   role's characterisation. **s69 requires the data subject's consent, and s13 requires a compatible
   purpose** — both are additional to the Client's instruction, neither substitutes for it. Absent
   an instruction, **no marketing send may be enabled.**
4. **What sender identity and reply-to address** should mail carry —
   `info@tditsolutionsinsurance.co.za`, or an address of the Client's? Related: **OI-R-10**, nothing
   in this repository evidences that this mailbox is provisioned or monitored.
5. **Who handles replies and bounces**, given that email is currently also the published s18/s23
   contact channel (**G-8**)?
6. **Does the Client accept** that authentication email (verification, reset, invitation) **must not
   be suppressible** by notification preferences and must carry no list-unsubscribe — an unsubscribe
   that suppresses password reset locks a data subject out of their own account (**C-R-6(a)**)?

### 5.5 Interim rule, in force until G-1 is answered

- **No production email delivery may be enabled**, and the Supabase Send Email Hook may not be
  switched on, until G-1 is answered **and** the existing blockers close: **C-R-1** (DPA evidence),
  **C-R-3(a)** (template rewrites), and — independently and contractually — **CT-1**.
- **No marketing send of any kind**, including the onboarding-incomplete prompt.
- **The dead Brevo path is disarmed before, not after** (**C-R-8**). An un-onboarded operator that
  activates on one environment variable is a §19(a) breach waiting on a typo.

---

## 6. The rule where no instruction exists

**Where this document records no instruction, the Operator default is: do not process.**

Silence is not authorisation. Neither is prior practice, a merged pull request, a ratified ADR, nor
a `cto` decision — those bind *us*, and none of them is the Client speaking. Where processing is
already happening without instruction (G-2, G-3, G-6, G-8), the position is **contain and seek the
instruction**, not stop-the-platform — but it is **not** "carry on and document later", and it is
certainly not "record our own conduct in §3 so the clause looks discharged."

The §9.3 containment condition at
[`10-data-protection-contract-obligations.md`](10-data-protection-contract-obligations.md) — **no
real customer personal information on any surface until CT-1 closes** — remains operative and is the
practical reason the §4 gaps have not yet caused harm.

---

## 7. Maintenance

- **Append-only.** New instructions are added as new rows with their source and date. Superseded
  rows are marked superseded, never deleted — the same convention as
  [`10-data-protection-contract-obligations.md`](10-data-protection-contract-obligations.md) §10.
- **Stage 8 hook.** Any feature introducing a new processing purpose, a new data category, a new
  sub-operator, or a new disclosure recipient must cite the Register A row that authorises it. **If
  no row authorises it, that is a Stage 8 block** on `compliance-specialist`'s gate, resolved by
  obtaining the instruction — not by adding a row here.
- **Paired with the RoPA.** CT-4 was filed to be produced alongside **INC-001-C-10** (RoPA) from the
  same evidence base. The RoPA records *what* is processed; this document records *on whose
  authority*. Neither substitutes for the other, and the RoPA is still outstanding.
- **Review trigger.** Any Change Request under I-9, any new vendor, any market/jurisdiction change,
  or any Client correspondence bearing on processing.

---

## 8. What the owner actually has to do

One conversation, not fourteen. The proportionate approach given a R3,000/month retainer is a
**single instruction schedule** put to the Client as an addendum, covering §4's gaps in priority
order, **not** fourteen separate emails.

| # | Action | Owner | When |
|---|---|---|---|
| 1 | **Close CT-1a first** — the one-line consent follow-up already drafted at [`10-…`](10-data-protection-contract-obligations.md) §10.4. It is on a live thread with a warm response and should not be crowded out by a larger ask | **Owner** | **2026-09-15** (unchanged) |
| 2 | **Draft a single §19(a) instruction schedule** covering G-1 (email, §5.4), G-2, G-3, G-6 and G-8 — the four live-exposure gaps plus email. Written as questions with our recommendation shown, so the Client can answer in one pass without our answers being pre-filled as theirs | `compliance-specialist` | **2026-09-22** |
| 3 | **Send it as a schedule to the CT-1b consent addendum**, not as a separate letter — one signature event, two clauses discharged | **Owner** + `cto` | With **CT-1b** (2026-09-26) |
| 4 | **Do not enable production email** until G-1 returns (§5.5) | `cto` / `devops-engineer` | Standing |
| 5 | **Remaining gaps (G-4, G-5, G-7, G-9…G-14) go in a second schedule**, sequenced with the RoPA, rather than being bolted on and delaying item 3 | `compliance-specialist` | Post-RoPA |

---

## 9. Register additions

| ID | Condition | Owner | Deadline |
|---|---|---|---|
| **CT-4** | **DISCHARGED as to the artefact, 2026-09-14** — this document. **Not discharged as to substance**: Register A contains nine contract-derived rows and no data-specific instruction. The clause is only satisfied when Register B's live-exposure gaps are answered by the Client | `compliance-specialist` (filed) | Filed |
| **CT-4a** *(new)* | **Obtain the Client's instruction on email dispatch (G-1, §5.4).** **Blocks enabling production email delivery and the Supabase Send Email Hook**, independently of C-R-1, C-R-3(a) and CT-1 | `cto`/owner (obtain); `compliance-specialist` (draft) | **2026-09-26**, with CT-1b |
| **CT-4b** *(new)* | **Obtain instructions on the four live-exposure gaps — G-2 (live-data access), G-3 (retention), G-6 (location processing), G-8 (s23/s24 handling).** These are producing processing without authority **now**. **G-6 blocks any re-enablement of location ingestion** | `cto`/owner (obtain); `compliance-specialist` (draft) | **2026-09-26**, with CT-1b |
| **CT-4c** *(new)* | **Obtain a general sub-operator appointment authorisation (G-5)** before the GPS hardware vendor or PSP is selected — both are Client-paid (I-8) and both will process personal information. **Selecting either without this repeats the Supabase/Resend pattern at higher stakes** | `integration-architect` + `compliance-specialist` | Before vendor selection |
| **CT-4d** *(new)* | **Stage 8 gate hook** — every feature review must cite the Register A row authorising its processing, or block. Added to the compliance sign-off checklist | `compliance-specialist` | Standing, effective immediately |

---

## 10. Standing statement

This is a compliance determination made from the contract as summarised in
`contract-tdit-2026-09-scope-summary.md`, from this repository, and from POPIA. **It is not legal
advice.** It asserts no instruction that is not traceable to a cited source, and it deliberately
leaves §4 unfilled rather than inferring the Client's will. **Any instruction schedule actually put
to the Client should be reviewed by admitted counsel** alongside the CT-1b consent addendum.

**Filed by:** `compliance-specialist`, 2026-09-14. **Discharges CT-4** (due 2026-09-15, filed one
day early).
**Does not discharge:** CT-1 · CT-1a/b/c · CT-5 · CT-9 · CT-10 · CT-11 · INC-001-C-10 (RoPA) ·
C-R-1 · C-R-3(a) · C-R-8 · OI-R-8 · OI-R-10 · OI-R-11 · legal sign-off.

---

## 11. Register B additions, 2026-10-29 (`compliance-specialist`)

Append-only. §1 to §10 are unchanged. These rows come from the `08-roadmap.md` §F triage. Like
G-1…G-14, each one is a **request to the Client, not an instruction**.

| ID | Topic | Current state: what we are doing, or plan to do, without instruction | What the Client needs to instruct |
|---|---|---|---|
| **G-15** | **SAPS case-number capture (Feature 011)** | **Live.** `PATCH /v1/recovery/cases/:caseId/police-report` stores the SAPS case number, station and date. Real customer data has been written (Feature 011 `security-review.md` §9.3 D-1). No instruction covers this category or purpose (C-011-3) | Whether the Client instructs capture of police-report details, for claim substantiation and recovery coordination. Confirm internal-only access (never security partners) and ratify the 5-year post-closure retention floor (subject to C-011-6 licence status) |
| **G-7 (extended)** | **Location shared with security partners (OB-03)** | **Not built.** Partners receive no coordinates today (`lastLocation` is excluded from both partner projections in `repositories/recovery-cases.ts`). OB-03 proposes consent-based, time-limited, logged sharing. Spec: `docs/features/009-customer-experience-redesign/compliance-review-ob-03-partner-location-sharing.md` | Beyond G-7's original ask: whether the Client permits **any** location disclosure to a partner; the dispatch model (admin-assigned vs pool); and who contracts with the partner. **No location reaches a partner until this is answered** |
| **G-16** | **Notifying a customer's emergency contact (OB-12 lost mode)** | **Not built.** The emergency-contact name, relationship and phone are collected (`customer-profile-validation.ts:36-42`) with no stated purpose. Nothing sends to them | Whether the Client instructs using the emergency contact for lost-mode alerts, which channel and sub-operator (SMS/WhatsApp are Client-paid, I-8, and need CT-4c), and the content limits in `compliance-rulings-ob-items-2026-10.md` §2 |
| **G-17** | **A protection score as a pricing or discount factor (OB-09)** | **Not built.** `lib/profile-completion.ts` is an informational checklist only | Whether the insurer (the licensed entity, C-011-6) approves any score factor as a rating factor. Rating factors are the insurer's decision, not ours. See `compliance-rulings-ob-items-2026-10.md` §3 |

G-15 is producing live processing without authority **now**. It joins G-2, G-3, G-6 and G-8 in the
§8 item 2 instruction schedule. G-16 and G-17 are prospective and go in the §8 item 5 second schedule.

---

## 12. Register B addition, 2026-10-29 (`cto`, recording `compliance-specialist`'s proposed G-18)

Append-only. §1 to §11 are unchanged. `compliance-specialist` proposed G-18 at
`docs/features/010-call-centre-dashboard/05-c-010-4-tier2-caller-verification-design.md` §12.4 (condition
C-010-4-Q4a) and said it would be added here. It was not there yet when C-010-4 was ratified (same file, §13), so I
am recording it with the topic wording taken from §12.4. Like every other G row, it is a **request to the Client,
not an instruction**. `compliance-specialist` may refine this row in a further appended section.

| ID | Topic | Current state: what we are doing, or plan to do, without instruction | What the Client needs to instruct |
|---|---|---|---|
| **G-18** | **Call-centre staff initiating on-behalf recovery requests that the customer approves (OB-02, C-010-4)** | **Not built.** The design is ratified, but implementation is NO-GO until Stage 8. Stage 8 will cite Register A I-1 as base authority (§12.4). No on-behalf route exists | Whether the Client instructs agent-initiated on-behalf recovery requests approved in the customer's own session; disclosing the third-party reporter's stated relationship to the account holder; and the retention periods in §12.3 (24 months from resolution for requests that produced no case, with the case's life for approved ones). **Required before first real customer PII on this flow** |

G-18 is prospective. It goes in the §8 item 5 second schedule and into the CT-4b instruction schedule draft.

---

## 13. G-7 — the Client's OQ-3 answer, recorded (2026-10-30, `product-manager`)

Append-only. §1 to §12 are unchanged. This records the Client's answer to the open question
`cto` flagged at `docs/organization/adr/0017-security-partner-directed-dispatch-and-location-share-grants.md`
§3 ("OQ-3 is open and is not mine to rule on") and carried by `product-manager` to the Client per
G-7's original assignment (§4) and ADR-0017's deciders list.

### 13.1 The instruction, verbatim

> "I want the sharing to be allowed when the customer or the Admin has reported it missing."

This is **written confirmation from a person authorised to bind the Client, identifying its
subject matter** (§2 table, "Sufficient"). It answers G-7 / OQ-3. It does not itself authorise
location sharing to go live — ADR-0017 D5 and the OB-03 spec §6 preconditions (P-1 to P-7) still
gate that, and this instruction is one gate among several, not a substitute for the others.

### 13.2 What this resolves, checked against the ADR's actual text — not assumed

**(a) Any partner location disclosure at all — resolved, cleanly, yes.** The Client's answer is
conditional ("when... reported it missing"), not a blanket no. Combined with G-7(extended)'s
original question ("whether the Client permits *any* location disclosure to a partner" — §11),
this instruction supplies the missing "yes, conditionally" that §4/§11 flagged as absent. No
location may reach a partner outside the stated trigger — but within it, disclosure is now
instructed, subject to every other ADR-0017 gate (D5, OB-spec §6 P-1–P-7, Stage 8/10).

**(b) Pool vs. directed dispatch — the Client's answer is silent, and I am not forcing a reading
onto it.** The instruction speaks to *when* sharing may happen (the reporting trigger), not *how*
a case is routed to a partner organisation. ADR-0017 D1 (directed dispatch) was decided on
architecture/compliance grounds independent of this question (SG-1/SG-2/SG-3 consent specificity,
removing Tier 0 — D1 items 1-3) and ratified by `cto` 2026-10-29, one day before this instruction
was obtained. **This instruction neither ratifies nor reopens D1.** The revisit trigger ("The
Client's G-7 instruction picks the pool, or forbids any partner location disclosure") is not
triggered: the Client did not pick the pool, and did not forbid disclosure. D1 stands as ratified,
unchanged by this entry.

**(c) Does the instruction match what the architecture already does — verified, not assumed, by
re-reading D3.1 and D4.** I checked this directly against the ADR body rather than taking the
"of course it already works this way" reading at face value:

- A location-share grant requires a `caseId` (SG-1, D3.1, D3.3 condition 1-2). ADR-0017 D4 lists
  only `recovery.ts`'s customer report flow, and the not-yet-built OB-02 admin/agent
  report-on-behalf flow (G-18, §12), as the two paths that create a recovery case. There is no
  code path, proposed or built, that creates a case — and therefore no path that can produce a
  grant — other than a report of loss or theft.
- **Confirmed: "customer reported it missing" maps exactly to the existing customer report flow
  (`recovery.ts`), and "Admin reported it missing" maps exactly to OB-02's agent-initiated,
  customer-approved on-behalf flow (G-18) — once built.** No gap between the instruction and the
  design exists for case creation. The Client's answer is not a new requirement; it is a
  description of the only two gates the ADR already has.
- **One precision the instruction surfaces, not previously stated as a condition anywhere in the
  ADR or G-18's design: OB-02 (G-18) is NO-GO until Stage 8 (§12 of this doc) and has no on-behalf
  route in code today.** Until OB-02 ships, "Admin reported it missing" as a case-creation trigger
  does not exist — only the customer's own report flow does. This is not a gap in the Client's
  instruction; it is a sequencing fact: the "Admin" half of the Client's own-stated condition is
  not yet buildable, and `PARTNER_LOCATION_SHARING_ENABLED` must not be read as authorised for
  cases created any other way (e.g. a case an admin creates outside the OB-02 consent flow, if one
  is ever added) without a fresh instruction covering that path specifically.

**Conclusion on (c): the ADR's D3 grant model, as written, already implements the Client's
condition exactly, for the one case-creation path that exists today (customer report) and the one
that is designed but not yet built (OB-02 admin-on-behalf, G-18). This is not a new requirement on
`solution-architect` or `compliance-specialist` — it confirms the existing design. No ADR change is
needed for (c).**

### 13.3 One real edge case the instruction prompts, not yet explicitly covered

**Withdrawn or false-alarm reports.** The Client's condition is "when ... reported it missing" —
phrased as a trigger, not a standing state. ADR-0017 D3.4 lists the SG-4 end conditions and when
each is written (customer revoke, case terminal, hand-back/re-dispatch, agreement ended, Feature
008 consent withdrawn, account erasure, timeout). **None of these is "the report itself was
withdrawn or found to be a false alarm, independent of the customer revoking the location grant or
the case reaching a terminal status via the normal recovery workflow."** D3.3 is a per-request
check, so access does stop the moment any existing end condition fires — the question is narrower:
is "the underlying report is no longer a missing-asset report" itself one of those triggers, or
does it rely on the case being manually walked to `closed` (which does fire `case_terminal`) or on
the customer manually revoking?

This is not a gap I am inventing to look thorough — D3.4's table does not name "report withdrawn/
retracted by customer" or "report found to be false alarm" as a distinct, directly-firing trigger
separate from the general case-status-transition and revoke paths. In practice a withdrawn report
almost certainly becomes a `closed`/`recovered` case transition (covered) or a customer revoke
(covered), so this may already be fully covered operationally — but the ADR does not say so in as
many words, and no admin/customer "withdraw a false report" action is named anywhere in D1-D4.
**Flagging to `solution-architect` and `compliance-specialist`: confirm explicitly that "report
withdrawn/false alarm" is handled exclusively via the existing `case_terminal` or
`revoked_by_customer` paths (D3.4), and if any report-withdrawal action is ever built that does
not route through one of those two transitions, it must end any active grant synchronously under
the same write-before-act discipline as the rest of D3.4 — not left to the timeout sweeper.** This
is a request for an explicit confirmation/note, not a claim that sharing currently fails to stop
in this scenario.

### 13.4 Status

- **G-7 / OQ-3 part (b) — dispatch model:** not resolved by this instruction; remains answered by
  D1 as ratified by `cto` 2026-10-29 (pool retired, directed dispatch). The Client's silence on
  this point is not a gap requiring further instruction — `cto`/`solution-architect` already hold
  decision authority here per the ADR's deciders list, and the revisit trigger was not hit.
- **G-7 / OQ-3 part (a) — any disclosure at all:** **resolved.** Conditional yes, trigger = missing
  report (customer or, once OB-02 ships, admin-on-behalf).
- **Unblocked by this entry:** OQ-3 as a ratification-trigger open question (ADR-0017 §"Ratification
  trigger" item 4, "It does not authorise turning on location sharing... gated by... the Client's
  G-7 answer (OQ-3)") is now answered. `PARTNER_LOCATION_SHARING_ENABLED` remains gated by every
  other precondition unaffected by this entry: OB-spec §6 P-1 to P-7, its own Stage 8/Stage 10,
  OQ-1/OQ-2 (compliance-specialist, already answered elsewhere per the ADR's sign-off sections),
  and CS-1 to CS-9.
- **Not unblocked:** nothing about OB-02/G-18 build status changes. "Admin reported it missing" as
  a live trigger still requires OB-02 to ship.

Filed by `product-manager`, 2026-10-30, carrying the Client's answer per ADR-0017 deciders list
and this document's §2 standing rule ("No agent has a channel to the Client... Entries in §3 are
transcriptions of a source").
