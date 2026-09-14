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
