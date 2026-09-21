# F-4 — Account / data deletion request fulfilment runbook

**Owner:** `compliance-specialist` (procedure, verification rulings, retention-exception decisions)
**Executes:** the **platform owner** (the only party with the `info@` mailbox and a channel to the
requester) · `backend-engineer` + `database-architect` (execute the erasure) · `security-engineer`
(independent verification of the result) · `cto` (approves any refusal, deferral or legal hold)
**Governing obligations:** POPIA **s24(1)(b)** (deletion/destruction of personal information) ·
POPIA **s14** (retention limitation) · POPIA **s23** (access, where a deletion request also asks
what is held) · POPIA Regulations **Form 2** · TDIT-2026-09 **§19(a)** (we process only on the
Client's documented instruction) · **GDPR Art. 17/12(3)** *if and only if* the requester is an
EU-resident data subject (assessed per request, never inherited) · Google Play **account-deletion
policy** (the reason the flow exists at all)
**Filing location:** `docs/organization/runbooks/` — platform-level, spans both stores and every
feature, same basis as [`ct-3-breach-notification-runbook.md`](ct-3-breach-notification-runbook.md)
and [`aud-8-privileged-access-reconstruction.md`](aud-8-privileged-access-reconstruction.md)
(`cto` ruling, ADR-0006 §16.4/§16.5)
**Discharges:** **F-4** (`../cto-status/2026-09-21-status-and-dispatch.md` §2) · partially answers
**G-8** and **G-9** (`../11-documented-client-instructions.md` §4) — *as to our procedure, not as to
the Client's instruction*
**Status:** **Written. Partially executable.** §9 records exactly which steps cannot be performed
today and why. Held to the CT-3 standard: **writing is not capability.**
**Not legal advice** — see §13.

---

## 1. Why this exists, and what it is not

A **request** button now exists on two surfaces. Both were verified in source on 2026-09-21:

| Surface | Path | What it actually does |
|---|---|---|
| Mobile | `mobile/app/(auth)/delete-account.tsx` → `mobile/app/(auth)/delete-account-confirm.tsx` | Composes a `mailto:` to `info@tditsolutionsinsurance.co.za` (`mobile/src/lib/companyContact.ts`). **No API call. Nothing is stored.** |
| Web | account-deletion request page + footer link (committed) | Same pattern, same mailbox (`src/lib/companyContact.ts`) |

**There is no erasure endpoint.** `backend/src/routes/customer-profile.ts` exposes a profile-picture
endpoint and nothing else touching account or data deletion. Verified, not assumed. **This runbook
is therefore a manual procedure and is written as one.** It is not a design for an automated
deletion service; when that is built it inherits §4's SLA, §5's scope table and §7's evidence
requirements, and does not get to redefine them.

**The finding F-4 states, restated as the operative risk: shipping the button created a duty.** A
published deletion channel with no fulfilment procedure is worse than no channel — it is a
representation to the data subject, and to Google Play, that a right will be honoured. Until §9's
gaps close, that representation is ahead of the capability behind it.

---

## 2. The structural point that governs everything below: **we are the Operator**

This is not our right to dispose of. Under TDIT-2026-09 §19 (see
[`../10-data-protection-contract-obligations.md`](../10-data-protection-contract-obligations.md) §1):

| Party | Role | On a deletion request |
|---|---|---|
| **TD IT Solution (Pty) Ltd** (Client) | **Responsible Party** | **Owes the s24 duty to the data subject.** Decides what is deleted and what is retained |
| **NextWave Digital Solutions** (us) | **Operator** | May delete only **on the Client's documented instruction** (§19(a)). May *not* unilaterally destroy the Responsible Party's records |
| Supabase / MongoDB Atlas / Render / Resend | Sub-operators | Hold copies and backups; see §5.4 |

**`../11-documented-client-instructions.md` G-8 and G-9 are both open — the Client has given no
instruction on rights requests or on erasure.** §6 of that document sets the default where no
instruction exists: **do not process.** Destroying data is processing.

**Ruling (mine, and it is the load-bearing one in this runbook): a deletion request is acknowledged,
verified and *contained* by us on our own authority, and *executed* only on the Client's
instruction.** Containment — suspending the account, halting further collection — is reversible and
is squarely within the §19 security-safeguards duty. Erasure is irreversible and is the Responsible
Party's disposal decision. **Where the two conflict, we suspend now and delete on instruction, and
we tell the requester exactly that.** §4.3 sets the escalation clock so "awaiting instruction" cannot
become indefinite silence.

---

## 3. Intake — what starts this runbook

### 3.1 Entry conditions (any one)

- [ ] An email to `info@tditsolutionsinsurance.co.za` requesting deletion of an account or of
      personal information, in any wording — the app's prefilled subject
      *"Request account and associated data deletion"* is the expected form but **is not required**
- [ ] A POPIA Regulations **Form 2** submission, however delivered
- [ ] An in-app or in-person request relayed by any role
- [ ] A deletion request arriving on any *other* channel (a personal mailbox, a support case, social
      media). **It counts.** The clock at §4 starts on receipt by us, not on arrival at the correct inbox
- [ ] A request that is *framed* as something else but asks in substance for erasure
      ("close my account and remove my details")

### 3.2 Classify the request before answering it

Deletion requests arrive mixed. Separate the limbs on intake, because they have different answers:

| Limb | POPIA | Handling |
|---|---|---|
| **Erasure** of personal information | s24(1)(b) | This runbook |
| **Access** — "what do you hold about me" | s23 | Answer it; PAIA **s25(1) 30-day** window applies. Do not fold it silently into a deletion |
| **Correction** | s24(1)(a) | Out of scope here; route to the same register, different outcome |
| **Objection to processing** | s11(3) / Form 1 | Can be honoured *without* deletion, and often should be — offer it (§6.5) |
| **Marketing opt-out** | s69 | Honour immediately and independently of the rest |

**Never satisfy an erasure request by deleting less than asked without saying so, and never satisfy
it by deleting more than the Client's retention obligations permit (§5).**

---

## 4. The clock

### 4.1 There is no fixed POPIA deadline. We set one anyway.

POPIA **s24 prescribes no day count.** Saying "POPIA requires 30 days" would be wrong and this
runbook does not say it. What we adopt, and why:

| | Target | Basis |
|---|---|---|
| **Acknowledge receipt** | **5 business days** from arrival in the mailbox | Our own SLA. A published channel that does not acknowledge is indistinguishable from an unread one |
| **Complete or substantively respond** | **30 calendar days** from a *verified* request | By analogy to **PAIA s25(1)**, which governs the access limb and is the nearest statutory yardstick. Adopted as a commitment, stated as ours, not attributed to the statute |
| **Extension** | one further **30 days**, **only** where the request is complex, **notified in writing before the first 30 expires**, with reasons | PAIA s26 shape |
| **If the requester is EU-resident** | **one month**, extendable by two, per **GDPR Art. 12(3)** — and the erasure duty is **Art. 17**, which is stricter | Assessed per request (see §4.2). Where both apply, **the shorter window governs** |

**The 30 days runs from verification, not from arrival** — but verification is itself on a clock
(§4.3), so this cannot be used to stall. If verification takes 25 days because we were slow, the
delay is ours and the response is late; say so, per §6.6.

### 4.2 Regime check — run it, do not inherit it

Per `../10-data-protection-contract-obligations.md` and C-011-7, **POPIA applies; GDPR does not
apply by default.** For each request:

- [ ] **POPIA** — applies. Default regime
- [ ] **GDPR** — fires only on an EU-resident data subject or an Art. 3(2) targeting fact. **Do not
      assert it and do not deny it without checking.** If it fires, Art. 17's erasure grounds and
      Art. 12(3)'s clock run *in addition*, and §5's retention exceptions must be re-tested against
      Art. 17(3) rather than only against POPIA s14(1)/(2)
- [ ] **PCI-DSS** — not engaged. No payment processing is live and no card data is held anywhere in
      this repository (no `payments.ts` route exists). Re-test this line the day a PSP is selected
- [ ] **Insurance-sector recordkeeping** — see §5.3. **Currently unconfirmed**, and that is itself a
      finding, not a clean bill

### 4.3 Escalation so "awaiting the Client" cannot go silent

| Day (from arrival) | Action | Owner |
|---|---|---|
| **0** | Request lands. Logged in the DSR register (§7) the same day it is seen | Owner / whoever saw it |
| **≤ 5 business days** | Acknowledgement sent; identity verification requested (§6.2) | Owner, copy drafted by `compliance-specialist` |
| **≤ 7 days** | Escalate to the Client for the §19(a) erasure instruction (G-9), **naming the 30-day commitment we have made to the data subject** | `cto` / owner |
| **≤ 14 days** | If no Client instruction: **containment** — account suspended, all non-essential processing halted, requester told the position in plain terms (§6.5) | `cto` |
| **≤ 30 days** | Substantive response served, whether or not erasure has executed. **A response is owed even when the answer is "not yet, and here is why."** Silence at day 30 is the failure mode | Owner |

---

## 5. What actually gets deleted, and what does not

The wording shipped on the confirm screen — *"Some information may be kept where the law requires us
to retain it"* — currently sits behind **no schedule at all**. This section is that schedule. Until
the Client ratifies it (G-3, G-9), **it is our proposal, and the copy must not imply otherwise.**

### 5.1 Identity store — Supabase Postgres (`eu-central-1`, Frankfurt)

| Table | Disposition on a verified erasure | Note |
|---|---|---|
| `auth.users` (Supabase) | **Delete** | The account itself |
| `app.accounts` | **Delete** | |
| `app.account_status_cache` | **Delete** | Derived |
| `app.sessions` | **Delete immediately, at containment — before the rest** | Revoking live sessions is the one step that should not wait for the Client instruction |
| `app.account_state_transitions` | **Retain, pseudonymised** — drop any direct identifier, keep the transition record | Integrity of the state machine; s14(1)(c)-type retention |
| `app.account_audit_log` | **Retain** for the asserted **12-month** audit retention, then delete | Audit logs are the evidence that access to this person's data was lawful. Deleting them on request destroys the protection the right exists to provide. **Retention period is asserted by us, not instructed — G-3** |
| `app.enrollment_tickets`, `app.reset_mfa_verification_tokens`, `app.idempotency_keys` | **Delete** | Short-lived operational records |
| `app.invitations` | **Delete** rows naming the requester | Check both issuer and invitee sides |

### 5.2 Domain store — MongoDB Atlas (region **still unconfirmed**, CT-2 open)

| Collection | Disposition | Note |
|---|---|---|
| `customer_profiles` | **Delete** — including `idNumberLast4` | The KYC limb |
| `assets` | **Delete**, unless attached to a live `recovery_cases` document (§5.5) | Includes `lastLocation` |
| `policies`, `policy_status_history` | **Retain to the insurance-recordkeeping floor, then delete** — see §5.3. **Do not delete on request until that floor is confirmed** | The single largest retention exception, and the least settled |
| `tracking_devices` | **Delete** the linkage to the person; device identifiers may survive as unlinked inventory | |
| `location_events` | **Delete.** No exception. This is the highest-sensitivity class we hold (CT-3 §7 — location is SEV-1 by default, it reveals home, workplace and movement) | Collection has **no TTL index** (INC-001 §2.2); manual deletion is the only mechanism |
| `recovery_cases` | **Retain.** Documents survive indefinitely by design; the police-report triple has a **5-year floor from `closedAt`** (`backend/src/repositories/recovery-cases.ts:59`, `POLICE_REPORT_RETENTION_YEARS = 5`), enforced field-level by `backend/src/lib/police-report-retention.ts` | See §5.5 — an open case is a **refusal** ground, not merely a retention one |
| `support_cases` | **Delete**, unless the case evidences a dispute or a claim | |
| `alerts`, `notification_delivery_state`, `push_token_security_events` | **Delete** | |
| `product_events` | **Delete or irreversibly de-identify.** §19(e) non-monetisation (CT-9) means there is no analytics interest that outweighs an erasure request | |
| `admin_access_log` | **Retain** on the same reasoning as `app.account_audit_log` | AUD-8 trail |
| `insurance_plan_catalog` | Not personal information | No action |

### 5.3 The insurance-recordkeeping floor — **unconfirmed, and that is a finding**

Policy and claim history is the classic statutory-retention exception, and the confirm screen's
"where the law requires us to retain it" sentence is mostly pointing at it. **But no document in
this repository establishes which insurance-sector obligation binds TD IT Solution, or for how
long** — FAIS/FSCA recordkeeping, FICA s23's five-year rule for accountable institutions, and
Short-term Insurance Act obligations each depend on the Client's licensing status, which this
organisation has never been told.

**Interim rule, and it is deliberately conservative: retain `policies` and `policy_status_history`
for 5 years from policy termination**, aligning with the FICA-style floor already used for the
police-report triple, **and tell the requester that this period is provisional pending
confirmation.** Do not quote a confident statutory citation we cannot evidence. **Opened as
F-4-OI-3.**

### 5.4 Backups, sub-operators, and the honest limit

- **Backups are not selectively erasable.** Atlas and Supabase point-in-time backups will continue
  to contain the deleted records until they age out. The correct position — and it must be *in the
  response*, not omitted — is: live systems erased on date X; backup copies aged out by date Y;
  restored data is re-deleted on restore. **Do not claim erasure from backups.**
- **Resend** holds a 30-day log of any email sent (`compliance-review-resend.md`). Today this is
  moot — Appendix C records that **Resend has never sent for this platform** — but it stops being
  moot the day CT-4a closes and the Send Email Hook is enabled.
- **No sub-operator erasure instruction has ever been issued.** Where a sub-operator holds a copy,
  the instruction to them is part of fulfilment, not an afterthought. **F-4-OI-4.**

### 5.5 Grounds to refuse or defer — narrow, and each one written down

A refusal is a `cto` decision, on written reasons from `compliance-specialist`, recorded in the DSR
file and communicated to the requester with the reason:

1. **Identity not established** (§6.2). Not a refusal of the right — a refusal of *this* request
2. **An open `recovery_cases` document for the requester's asset.** Deleting during a live theft
   recovery destroys the evidence the customer themselves asked us to gather, and may destroy
   material in a live SAPS matter (Feature 011). **Defer, explain, re-offer on closure.** Note the
   abuse case squarely: a deletion request is a plausible vector for someone who has *stolen* the
   asset to erase the trail. Treat a deletion request touching an active recovery case as
   **high-suspicion** and verify to the §6.2 standard without exception
3. **Statutory or contractual retention floor** (§5.2, §5.3) — partial retention, not refusal
4. **Legal hold** (INC-001 §7.3 G-4). A hold over the Client's data requires the Client to be
   informed (`../10-…` §6, CT-6)
5. **The record is needed to establish, exercise or defend a legal claim** — a live dispute

---

## 6. Procedure

### 6.0 Day 0 — log it
- [ ] Open `docs/organization/data-subject-requests/DSR-NNN-<slug>.md` (§7). **Before anything else.**
- [ ] Record: arrival timestamp (UTC), channel, requester as self-identified, limbs claimed (§3.2),
      the 30-day due date, computed and written at the top

### 6.1 Day 0 — contain what is safe to contain
- [ ] **Revoke live sessions** (`app.sessions`) if the request is credible on its face
- [ ] **Halt marketing/notification sends** to that address immediately (s69 needs no verification)
- [ ] **Do not delete anything yet.** Containment is reversible; §2's ruling governs

### 6.2 ≤ 5 business days — verify the requester. This is the step F-4 named as missing.

**An email from an address is not identity.** The `mailto:` flow means anyone can send a message
claiming to be any customer, and the body template asks the sender to type their own name and
sign-in email — both attacker-supplied.

**Standard: the registered-account email, plus one independent factor.**

- [ ] **Factor 0 (necessary, never sufficient):** the request arrives from, or is confirmed by reply
      from, the **email address registered on the account**. Send the verification challenge **to the
      registered address**, never to a reply-to the requester supplies
- [ ] **Factor 1 — preferred:** the requester **confirms from an authenticated app session**, or
      completes a fresh sign-in (with MFA where enrolled) and confirms from there
- [ ] **Factor 2:** **last four digits of the SA ID number**, matched against `idNumberLast4`
- [ ] **Factor 3:** details of a registered asset that are not publicly inferable

**Prohibited, and this is a hard rule:**
- **Never ask for a copy of an ID document or the full 13-digit ID number.** We do not store the
  full number (CT-11 closed — only `idNumberLast4` is persisted), so we **cannot verify it**, and
  collecting it would mean taking more sensitive data into an unsecured mailbox than we hold in the
  platform. Collecting data you cannot use, to verify a request to delete data, is a net increase in
  risk
- Never accept the body-text name/email as verification of itself
- Never verify by asking for a password, or any part of one

**Escalate to Factor 1 mandatorily** where the request touches an open recovery case (§5.5 item 2),
or where the request asks for erasure *and* access, or where anything about the request is
inconsistent with the account record.

**If verification fails or is not completed within 30 days:** close the request as *unverified*,
tell the requester what was needed, and state expressly that they may re-submit. **Record it —
an unverified request is not a non-event, it is a possible impersonation attempt and belongs in the
register.**

### 6.3 ≤ 7 days — obtain the Client instruction
- [ ] Put the request to the Client per §2, citing G-9 and the 30-day commitment
- [ ] If the CT-4b instruction schedule has by then returned a **standing** erasure instruction, this
      step collapses to citing it. **That is the outcome to engineer toward** — a per-request
      escalation to a counterparty is not a sustainable rights process

### 6.4 On instruction — execute
- [ ] Work §5.1 and §5.2 **table row by table row**, recording for each: collection/table, filter
      used, count matched, count deleted/retained, and the retention basis where retained
- [ ] **Identity store and domain store are separate jobs with separate credentials** (ADR-0002).
      A deletion that touches one and not the other is a half-deletion and has happened elsewhere in
      this repo's history — check both, record both
- [ ] Two people: one executes, **a second independently verifies** by re-querying for residue.
      Per the 2026-09-14 governance ruling, **a completion report is not evidence — the artefact is
      verified by a second reader.** `security-engineer` holds the second read
- [ ] Record the backup-expiry date (§5.4) from which the last copy ages out

### 6.5 ≤ 30 days — respond

**Mandatory content:**
1. What was deleted, by category, in plain language
2. **What was retained, each item with its reason and its end date** — the schedule behind the
   "some information may be kept" sentence, made specific to this person
3. The backup position, honestly (§5.4)
4. That live systems processing has ceased / the account is closed
5. If not complete: **what is outstanding, why, and when** — including, if it is the reason, that we
   are an Operator awaiting the Responsible Party's instruction. **Say it plainly; do not hide
   behind "processing your request"**
6. **If the response is late: that it is late, by how long, and why** — the CT-3 §6.3 standard
7. Their right to complain to the **Information Regulator**, with the Regulator's contact details
8. Where deletion is refused or deferred (§5.5), the **offer of the lesser remedy**: objection to
   processing, marketing suppression, account closure without erasure

**Prohibited:** asserting erasure from backups · asserting a statutory retention citation not
evidenced (§5.3) · stating a retention period the Client has not ratified as though the Client set
it · characterising the request as fulfilled when only one store was cleared.

### 6.6 Close
- [ ] DSR file completed: full timeline, the §6.4 per-collection record, the response served
- [ ] **Clock audit** — days to acknowledge, to verify, to respond; whether each target was met, and
      if not, why. Measured, not asserted
- [ ] Diarise the backup-expiry date and the retention end-dates from §6.5(2), so the retained items
      are actually deleted when their basis expires. **A retention exception with no diarised end
      date is indefinite retention wearing a better word**

---

## 7. Evidence trail — the register

F-4's last limb: a request landing in a shared mailbox leaves **no provable record that it was
received or actioned**. A deleted mailbox thread is not an audit trail, and "we deleted it, trust
us" is not a defence to the Regulator.

**Requirement: every request gets a file at `docs/organization/data-subject-requests/DSR-NNN-<slug>.md`,
opened on the day it is seen, before any other step.**

| Field | Rule |
|---|---|
| **DSR ID** | Sequential, never reused, never deleted even if the request is withdrawn |
| **Requester** | **Pseudonymised: `accountId` only.** Do **not** copy the person's name, email body or ID digits into the register — it would create a second, less-protected copy of exactly the data they asked us to erase |
| **Timestamps** | Arrival, acknowledgement, verification outcome, instruction sought/received, execution, response served — all **UTC** |
| **Verification** | Which factors were used and their outcome. Not "verified" alone |
| **Deletion record** | §6.4's per-collection table: filter, matched, deleted, retained, basis |
| **Retention exceptions** | Each with its basis and its **diarised end date** |
| **Second reader** | Named, with the date of independent verification |
| **Response** | Filed under `docs/organization/correspondence/` on the `DRAFT-` → `SENT-` convention |
| **Retention of the register itself** | **5 years** from closure, matching the incident-record rule at CT-3 §11. This is the evidence the duty was met and is **not** subject to routine deletion — including not by the data subject's own later request |

**The mailbox is not the system of record. The register is.**

---

## 8. Roles

| Role | Held by | Authority |
|---|---|---|
| **Request owner** | `compliance-specialist` | Classifies the request (§3.2), rules on verification, rules on retention exceptions, drafts every outbound |
| **Channel** | **the platform owner** | Reads `info@`, sends every reply. No agent may send, and no agent may represent that a reply was delivered (`../correspondence/README.md` rule 1) |
| **Executor** | `backend-engineer` + `database-architect` | Runs the deletion across both stores, produces the §6.4 record |
| **Second reader** | `security-engineer` | Independent verification of residue. Without this the deletion is unproven |
| **Approver** | `cto` | Refusals, deferrals, legal holds, and the escalation to the Client at §6.3 |
| **Copy** | `technical-writer` (drafts) + `compliance-specialist` (approves) | The §5 schedule surfaced in the privacy notice and in the app copy (§10) |

---

## 9. What this runbook cannot do today — honestly

Held to the CT-3 §9 standard.

| # | Gap | Effect | Tracked as |
|---|---|---|---|
| 1 | **The `info@` mailbox is not evidenced as provisioned or monitored.** Nothing in this repository shows it exists or that anyone reads it | **A request may never be seen at all.** Every clock in §4 starts on a mailbox we cannot show is being read. This is the single gap that makes the shipped button a representation we cannot back | **OI-R-10** (CT-3 §9 item 2), now also blocking a live customer-facing flow |
| 2 | **No erasure endpoint, no deletion job.** Deletion is manual, across two stores, via consoles nobody currently has credentials for (T-25a) | §6.4 cannot be executed today by any agent, and probably not by the owner without the Atlas/Supabase console access T-25a is blocked on | **T-25a**, **F-4-OI-2** |
| 3 | **No Client instruction on erasure or rights requests** (G-8, G-9) | §6.3 escalates to a counterparty who has not answered two prior schedules. §2's containment ruling is what keeps this from being a dead end, not a fix for it | **CT-4b** |
| 4 | **Retention floors are asserted by us, not instructed or evidenced** — the insurance floor most of all (§5.3), and the 12-month audit-log period | The confirm screen's "where the law requires" sentence currently points at a schedule with an unconfirmed legal basis | **G-3**, **F-4-OI-3** |
| 5 | **We cannot reliably email a data subject.** Resend has never sent for this platform; the live path reaches project-team addresses only | Automated acknowledgement is impossible. **A manual reply typed by the owner from the `info@` mailbox does work** — and is the only working channel, which makes gap 1 load-bearing | **INC-001-C-8**, **OI-R-8** |
| 6 | **No sub-operator erasure instruction path** (§5.4) | Fulfilment stops at our own stores | **F-4-OI-4** |
| 7 | **The mobile screens have no Stage 8 entry of their own** — they inherit `mobile-auth`'s Feature 001 authentication verdict | A deletion flow reviewed as an auth screen. Not mine to close; `cybersecurity-architect` holds it | **F-3** |
| 8 | **Never exercised.** No request has ever been received or fulfilled | Every window in §4 is a design target | **F-4-OI-5** |

**None of these is a reason to delay filing this runbook, and none is a reason to call the flow
ready for real customers.** Gaps 1 and 2 are the two that would fail visibly and immediately.

---

## 10. Consent and disclosure copy — what the screens must say

Compliance requirements on the shipped copy, owned by me per `ux-researcher`/`ui-designer` liaison.
**These are requirements, not suggestions, and they block the flow going live to real customers:**

1. **"Some information may be kept where the law requires us to retain it" must be replaced by, or
   link to, the actual schedule** — at minimum: policy and claim records, audit logs, and records of
   an active recovery case, each with its period. Vague retention language is the exact boilerplate
   this role's standing position rejects
2. The copy must state the **response SLA** (§4.1) and the fact that a **verification step** will
   follow, so the user is not surprised by a challenge email
3. It must state that **an open theft-recovery case may delay erasure**, and why — customers have a
   real interest in that answer
4. It must **not** promise deletion from backups
5. It must name the **Information Regulator** as the complaint route
6. `delete-account.tsx`'s *"where legally required and operationally feasible"* — **"operationally
   feasible" must go.** A data subject's right does not bend to our convenience, and the phrase
   would read badly in front of a regulator. Replace with the specific grounds at §5.5
7. The privacy notice (`src/pages/PrivacyPolicyPage.tsx`) currently documents a **12-month waitlist**
   deletion rule and nothing about account erasure. It must carry the §5 schedule. Note the standing
   G-4 problem: the notice speaks for a Responsible Party that has not approved its wording

---

## 11. Conditions opened

| ID | Condition | Owner | Deadline |
|---|---|---|---|
| **F-4-OI-1** | **Evidence that `info@tditsolutionsinsurance.co.za` is provisioned and monitored, with a named reader.** Re-issue of **OI-R-10**, now blocking a shipped customer-facing flow rather than a published contact line. **Until this closes, the deletion flow must not go live to real customers** — this is my Stage 8 position and it is a block, not a caveat | `cto` / owner | **Before the flow reaches any real customer** |
| **F-4-OI-2** | **Rehearse one end-to-end fulfilment against a seeded test account** (`backend/scripts/seed-test-accounts.ts`) across both stores, producing a §6.4 record and a §7 DSR file. Doubles as the **CT-5** teardown path — the same deletion, needed for two reasons | `backend-engineer` + `security-engineer` | **2026-10-10**, or within 5 days of T-25a closing, whichever is earlier |
| **F-4-OI-3** | **Confirm the insurance-sector recordkeeping floor** binding the Client (FAIS/FSCA, FICA s23, Short-term Insurance Act — depends on licensing status we have never been told). §5.3's 5-year interim is a placeholder and is labelled as one | `compliance-specialist` (analysis) + `cto`/owner (ask the Client) | **2026-10-03** |
| **F-4-OI-4** | **Define the sub-operator erasure instruction path** — Supabase, Atlas, Resend, Render: what we tell them, on what channel, and what evidence of deletion we get back. Fold into the **T-24** sub-operator reviews rather than raising separately | `integration-architect` + `compliance-specialist` | With **T-24** (2026-09-25) |
| **F-4-OI-5** | **Tabletop this runbook** with a simulated request, including the §5.5 item 2 abuse case (deletion request against an asset with an open recovery case). Run alongside **CT-3-OI-4**'s breach tabletop — same participants, one session | `compliance-specialist` + `security-engineer` | **2026-10-08**, with CT-3-OI-4 |
| **F-4-OI-6** | **§10's copy corrections** on both surfaces and in the privacy notice | `technical-writer` + `ui-designer`, approved by `compliance-specialist` | Before the flow goes live |
| **F-4-OI-7** | **Add G-9 (erasure) to the CT-4b instruction schedule as a priority row**, with §5's table attached as our recommendation — so the Client can ratify a standing erasure instruction in one pass rather than being asked per request (§6.3) | `compliance-specialist` | With **CT-4b** (2026-09-26) |

---

## 12. Related documents

- [`ct-3-breach-notification-runbook.md`](ct-3-breach-notification-runbook.md) — format precedent; §11 retention-of-records rule adopted here
- [`../10-data-protection-contract-obligations.md`](../10-data-protection-contract-obligations.md) — §1 Operator framing, §6 register, §13 (CT-11 closure — why only `idNumberLast4` exists)
- [`../11-documented-client-instructions.md`](../11-documented-client-instructions.md) — **G-3**, **G-8**, **G-9**, **G-10**; §6 "where no instruction exists, do not process"
- [`../incidents/INC-001-location-ingestion-popia-assessment.md`](../incidents/INC-001-location-ingestion-popia-assessment.md) — location-data sensitivity; `location_events` has no TTL
- [`../cto-status/2026-09-21-status-and-dispatch.md`](../cto-status/2026-09-21-status-and-dispatch.md) — §2 **F-1…F-5**, this runbook's origin
- `backend/src/lib/police-report-retention.ts`, `backend/src/repositories/recovery-cases.ts:59` — the only retention-purge mechanism that actually exists in code today

---

## 13. Standing statement

This runbook is a compliance determination made from POPIA, from TDIT-2026-09 as summarised to this
organisation, and from the repository as read on 2026-09-21. **It is not legal advice.** The s24
characterisation, the 30-day SLA adopted by analogy to PAIA s25(1), and the interim insurance
retention floor at §5.3 are this role's analysis and are labelled where they are not evidenced.
**Any refusal of a deletion request, and any response asserting a statutory retention basis, should
be reviewed by admitted counsel before dispatch.**

**Filed by:** `compliance-specialist`, 2026-09-21. **Discharges F-4** as to the procedure.
**Does not discharge:** OI-R-10 · G-3 · G-8 · G-9 · CT-4b · CT-5 · INC-001-C-8 · F-3 ·
F-4-OI-1…OI-7 (all new, open).
