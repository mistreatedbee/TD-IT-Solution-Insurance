# Security-Partner Operator Agreement — Requirements (POPIA s19–s21)

**Owner:** `compliance-specialist`
**Date:** 2026-10-08
**Audience:** the business owner and TD IT Solution (Pty) Ltd, taking this to a security-company
pilot partner for negotiation and signature.
**Status:** **REQUIREMENTS ONLY — not a contract, not legal advice, not signed or negotiated by
anyone.** Admitted counsel should turn this into contract wording (§F).
**Closes, once an agreement meeting it is executed:** the open item at
`play-store-data-safety-declaration.md` §4(3) and §6.6(3); the partner-clause half of ADR-0006
**C-15**; the "who contracts with the partner" limb of **G-7** (`11-documented-client-instructions.md`).
**Companion ruling:** [`../features/009-customer-experience-redesign/compliance-review-security-partner-data-minimisation.md`](../features/009-customer-experience-redesign/compliance-review-security-partner-data-minimisation.md)
(what a partner may see, per case stage — conditions PDM-1…PDM-11).

---

## A. Read this first — three things that are not negotiable with the partner, because they are about *us*

### A.1 What this agreement is for

When a customer reports a theft, a security company sees parts of that customer's case on our
dashboard and acts on it. Under POPIA the security company is processing personal information **on
behalf of** the insurer. The law calls the insurer the **responsible party** and the security company
an **operator**. POPIA s21(1) says the responsible party **must** have a **written contract** with
each operator that makes the operator keep the information secure. Without that contract, giving a
security company access to customer data is a breach of POPIA by the insurer, however careful the
security company is.

### A.2 Who signs: TD IT Solution (Pty) Ltd and the partner — **not NextWave**

Under contract TDIT-2026-09, TD IT Solution is the responsible party and NextWave (the platform
developer) is itself only an operator (`10-data-protection-contract-obligations.md` §1). The
security company is engaged by the insurer to recover the insurer's customers' assets, so the s21
contract runs **TD IT Solution → partner**. NextWave is not a party; it runs the platform controls
the agreement relies on (§E). *Counsel to confirm — compliance review §7(3).*

### A.3 Preconditions before any partner sees real customer data

The agreement is necessary, not sufficient. Also required:

1. **CT-1** closed in the required form (cross-border consent — currently only informally
   acknowledged; containment: no real customer data on any surface until it closes).
2. **G-7** answered by TD IT Solution: dispatch model (shared offer pool vs assigned), what a partner
   may see, and whether partners may contact customers directly.
3. The **[PILOT]** conditions in the companion ruling (PDM-1, -2, -3, -5, -6, -7, -8, -9) are built
   and verified.

---

## B. Requirements the agreement must contain

**Legend.** **Must** = required by POPIA or by a commitment this platform has already made; do not
trade away. **Should** = strongly recommended; may be negotiated on terms, not dropped. Each item
gives the source, so the owner can explain *why* when a partner pushes back.

### B.1 Parties, roles and scope — **Must**

- Name the partner's legal entity, registration number and **PSIRA registration number** (Private
  Security Industry Regulation Act 56 of 2001). Partner warrants its PSIRA registration is current and
  will notify within 2 business days if it lapses, is suspended or withdrawn.
- State that for platform case data the partner acts **as an operator** of TD IT Solution, solely on
  its instructions (POPIA s20(a)).
- Name the categories of information in scope: case reference, case status and dates, asset
  category, asset identifiers/descriptors, the customer's theft description, and (only if later
  instructed in writing) last-known asset location and customer contact details. Attach the stage
  table from the companion ruling §3 as a schedule, so scope changes need a written amendment.
- **Carve out the partner's own records.** Where law requires the partner to keep its own records of
  a recovery operation (e.g. PSIRA-regulated occurrence records, evidence chain for SAPS), list those
  records in a schedule and state that for them the partner is a **separate responsible party** with
  its own POPIA duties. Anything not listed there is operator data. *(Counsel item §7(1) of the ruling.)*

### B.2 Purpose limitation — **Must** (s13, s15, s20)

- The partner may process case data **only to locate and recover the specific insured asset** in a
  case it has been assigned or has claimed, and to report to TD IT Solution and to SAPS on that case.
- Expressly **prohibited**: direct marketing or any contact with the customer for any purpose other
  than the assigned recovery (s69); selling, sharing or monetising the data; building profiles of
  customers across cases; combining the data with the partner's other customer databases; using
  unclaimed-pool information for anything except deciding whether to take a case; training analytics
  or AI models on it.
- Disclosure to SAPS **for the recovery of that asset** is within purpose. Any other request from law
  enforcement, a court or anyone else is forwarded to TD IT Solution within 1 business day, unless the
  law forbids it.

### B.3 Confidentiality — **Must** (s20(b))

- Case data is confidential and may not be disclosed except as B.2 allows or as law requires.
- Every person given platform access signs (or is bound by) a confidentiality undertaking that
  survives the end of their employment.

### B.4 Security safeguards — **Must** (s19, s21(1))

The partner must put in place and keep "appropriate, reasonable technical and organisational measures"
(s19), including at minimum:

1. **Named, individual operator accounts only.** No shared logins. MFA on (the platform enforces it;
   the partner must not get around it).
2. **Need-to-know.** Only staff actively doing recovery work hold accounts. The partner keeps a
   current list and tells TD IT Solution within **24 hours** when someone leaves or no longer needs
   access, so the account is revoked the same day.
3. **No copying data out of the platform into uncontrolled channels.** Specifically: no forwarding
   case details, screenshots or locations to **personal WhatsApp groups, personal email, or personal
   phones**. If the partner's control room needs to pass case information to a field team, the
   approved channel is named in a schedule and is subject to this agreement. *(This is the single most
   likely real-world leak path in this industry; name it in the contract, not just the policy.)*
4. **Devices.** Platform sessions only on devices the partner (or, for the dashboard tablets, TD IT
   Solution — instruction I-7) controls, with screen lock and remote wipe. Lost or stolen device =
   security incident under B.7.
5. **Staff awareness training** on these rules before first access and yearly.
6. Partner tells TD IT Solution about any material change to these measures.

### B.5 Sub-operators — **Must** (s20, s21; flow-down)

- No subcontractor, control-room software provider, cloud service or messaging service may process
  case data without TD IT Solution's **prior written approval**.
- Approved sub-operators are listed in a schedule. Each one must be bound in writing to terms at least
  as protective as this agreement. The partner stays fully responsible for them.

### B.6 Location of data — **Must** (s72; mirrors TDIT-2026-09 §19(c))

- Case data stays in South Africa unless TD IT Solution gives prior written consent and a lawful s72
  basis is in place. This includes any cloud service or app the partner uses to store or pass on case
  data. **TD IT Solution's CT-1 consent to NextWave's hosting does not cover the partner's systems.**

### B.7 Security incidents and breach notification — **Must** (s21(2), s22)

- **Trigger:** reasonable grounds to believe case data has been accessed or acquired by an
  unauthorised person — including a lost/stolen device with a live session, a compromised operator
  account, a misdirected message, or a staff member misusing access. Uncertainty is not a reason to wait.
- **Timing:** s21(2) says "immediately". The contract must turn that into a hard number: **first notice
  as soon as possible and never later than 24 hours** after the partner becomes aware. A first notice
  that lists what is not yet known is required — the partner must not hold the notice back until the
  investigation is complete. *(Reason: TD IT Solution must notify the Information Regulator and the
  customers "as soon as reasonably possible" under s22, and the platform's own breach runbook
  (`runbooks/ct-3-breach-notification-runbook.md`) treats open-ended vendor timing as the main cause
  of indefensible delays. A 24-hour ceiling leaves time for TD IT Solution's own s22 steps.)*
- **To whom:** TD IT Solution's named incident contact **and**, at the same time, the platform
  security contact, so operator sessions can be revoked straight away. Both contacts are named in a
  schedule; there must be a working out-of-hours contact on both sides (open item CT-3-OI-5).
- **Content:** what happened, when, which cases/accounts/devices, what data, what has been done to
  contain it, a named contact. Updates as facts come in.
- **Cooperation:** keep evidence; help TD IT Solution's investigation; **do not notify customers or
  the Regulator directly** about operator data unless TD IT Solution instructs or law requires — s22 is
  TD IT Solution's duty.

### B.8 Retention, return and deletion — **Must** (s14)

- **During the agreement:** the partner keeps no copy of case data outside the platform except where
  it needs to for the recovery, and deletes any such copies within **90 days** of the case closing —
  matching the platform's partner-visibility window (companion ruling §3). Records listed under the
  B.1 carve-out follow the partner's own legal retention instead.
- **On termination or expiry:** within **30 days**, return (if TD IT Solution asks) and then delete all
  case data, including backups and approved sub-operators' copies, and give a **written deletion
  certificate** signed by a director. Platform access is revoked on the termination date.
- **Legal holds:** if TD IT Solution notifies a legal hold, the partner keeps the specified data until
  told the hold is lifted.

### B.9 Data subject rights — **Must** (s23–s25)

- Any customer request about their data that reaches the partner (access, correction, deletion,
  objection, complaint) is sent to TD IT Solution within **2 business days**. The partner does not
  respond on its own.
- The partner helps TD IT Solution answer such requests within the statutory timelines, including
  saying which of its staff accessed the customer's case (s23 — a security company is a third party
  whose access a customer is entitled to know about, at least by category: ADR-0006 §14.4).

### B.10 Platform access logging — tell the partner's staff — **Must** (s18 for operator staff; ADR-0006 C-15)

- The agreement states, and the partner must tell each of its operators before first access, that
  **every action on the platform is logged** with the operator's identity, time, IP address and device
  details; logs are kept for 12 months (longer under legal hold); and logs may be used to investigate
  misuse, including disciplinary action and legal proceedings.
- *(Reason: if we don't give this notice up front, we cannot fairly use the logs against someone
  later — ADR-0006 §14.6(2).)*

### B.11 Audit and assurance — **Must** (s19(1)(c)–(d) requires the insurer to verify safeguards; s21(1))

- **Yearly** security and privacy self-assessment questionnaire from the partner, signed by a director.
- **On-site or remote audit right** for TD IT Solution (or an independent auditor it appoints) on
  reasonable notice — at most once a year unless after an incident or a regulator request, when it may
  be done at short notice.
- The partner provides its access list, sub-operator list and incident log on request.
- **Should:** the partner fixes audit findings by agreed dates; repeated or serious failure is a
  ground for termination (B.13).

### B.12 Special categories — criminal-behaviour information — **Must** (s26, s27, s57)

- Recovery work can produce information about suspects or people found in possession of a stolen
  asset. That is special personal information about criminal behaviour. Until counsel advises on
  prior authorisation (s57(1)(b)) and TD IT Solution gives a written instruction, the partner must
  **not** enter any such information into the platform and must hold its own such records only under
  the B.1 carve-out (as its own responsible-party processing, handed to SAPS as required).

### B.13 Term, suspension and termination — **Must** in part

- **Must:** TD IT Solution may **suspend platform access immediately**, without notice, on a
  suspected breach of B.2–B.7, a lapsed PSIRA registration, or an instruction from the Regulator.
- **Must:** data return/deletion (B.8) and confidentiality (B.3) survive termination.
- **Should:** termination for material breach not fixed within an agreed period; termination for
  convenience on notice.

### B.14 Changes and instructions — **Must** (s20(a))

- TD IT Solution may give written instructions on processing; the partner follows them and tells TD
  IT Solution straight away if it thinks an instruction breaks the law.
- Any widening of the data the partner can see (e.g. live location, customer contact details) needs a
  **written amendment** to the scope schedule — a platform feature being switched on is not an
  instruction by itself.

### B.15 Commercial protections — **Should** (business/counsel call, not a POPIA requirement)

- Indemnity for fines, claims and costs caused by the partner's breach of this agreement.
- Proof of professional indemnity / cyber liability cover at an agreed level.
- Clear allocation of costs of incident response caused by the partner.

---

## C. Schedules to attach

| # | Schedule | Filled by |
|---|---|---|
| 1 | Data in scope per case stage (companion ruling §3 table) | Compliance (given) |
| 2 | Partner's own records carved out as responsible-party records (B.1) | Partner proposes; counsel + compliance approve |
| 3 | Named incident contacts both sides, including out-of-hours (B.7) | Both |
| 4 | Approved sub-operators and approved field-communication channel (B.4(3), B.5) | Partner proposes; TD IT Solution approves |
| 5 | Minimum security measures (B.4) | Compliance + `security-engineer` |
| 6 | Operator access-logging notice text (B.10) | Compliance + `technical-writer` |
| 7 | Deletion certificate template (B.8) | Counsel |

---

## D. Due diligence on the partner before signing

- [ ] PSIRA registration checked on the PSIRA public register; record date checked.
- [ ] Partner's Information Officer named (and registered with the Information Regulator, if it is
      required to register).
- [ ] Partner's own POPIA privacy policy and incident history reviewed.
- [ ] Partner's control-room tools and messaging channels listed (feeds Schedule 4). **Ask directly
      whether WhatsApp is used for dispatch** — if so, either approve a controlled setup in writing or
      prohibit it; do not leave it unsaid.
- [ ] Where partner's systems/vendors are hosted (B.6).
- [ ] Number of operators who will need accounts, and a named lead.

---

## E. What the platform side commits to (so the agreement is honest)

The agreement may only promise what the platform actually does. Today:

| Commitment | Status on 2026-10-08 |
|---|---|
| Partner sees only the minimum per stage (companion ruling §3) | **Not yet** — PDM-1…PDM-4 open |
| Partner access restricted to orgs with an executed agreement | **Not yet** — PDM-6 (no partner registry exists; `partnerOrganizationId` is a bare UUID) |
| Every partner read of a claimed case is logged against the case and customer | **Not yet** — PDM-8 / RR-012-2 |
| Operator accounts are individual and MFA-protected | Partly in place (Feature 001 sessions/MFA; invitation requires admin step-up) — `authentication-engineer` to confirm MFA is mandatory for `security_company_operator` before quoting it in the agreement |
| Access revoked on termination/offboarding the same day | Admin account suspension exists; a same-day runbook step does not — add to PDM-6 |
| No location is shown to partners | **True today** (no location field serialised; live map blocked on AUD-9) |

**Do not sign an agreement that describes a platform control as in place while this table says
"Not yet".** Either finish the item or word the clause as a future commitment with a date.

---

## F. Hand-off

| Step | Who |
|---|---|
| Turn §B into contract wording; answer ruling §7(1)–(3) | Admitted counsel |
| Put G-7 (dispatch model, partner scope, customer contact) to TD IT Solution | `product-manager` + owner; `compliance-specialist` drafts |
| Negotiate and sign with the partner | TD IT Solution (Pty) Ltd |
| Confirm executed agreement meets this document before go-live | `compliance-specialist` (Stage 8) |
| Record the executed agreement reference in the partner registry (PDM-6) | `backend-architect` / admin process |
