# CT-3 — Breach notification runbook

**Owner:** `compliance-specialist` (procedure, notification decisions) · **Chair on execution:**
`cto` (declares the incident, authorises service of the notice)
**Executes:** `security-engineer` (containment, evidence, scoping) · `site-reliability-engineer`
(detection, timeline) · **the platform owner** (the only party who can actually send to the Client)
**Governing obligations:** TDIT-2026-09 **clause 19(b)** (48h Developer → Client) · **POPIA s22**
(Client → Information Regulator and data subjects) · Supabase DPA 48h leg · Resend DPA
"without undue delay" leg
**Filing location:** `docs/organization/runbooks/` — platform-level, spans every feature and both
data stores, same basis as [`aud-8-privileged-access-reconstruction.md`](aud-8-privileged-access-reconstruction.md) (`cto` ruling, ADR-0006 §16.4/§16.5)
**Discharges:** CT-3 (`../10-data-protection-contract-obligations.md` §6, §3) · supersedes the
"no runbook exists" statement at `compliance-review-supabase.md` §6 **C-6**
**Status:** **Written. Partially executable.** §9 records exactly which steps cannot be performed
today and why. Writing is not capability — the same standard AUD-8 was held to.
**Not legal advice** — see §14.

---

## 1. Purpose, and the one thing this runbook exists to fix

Three notification obligations sit end-to-end, each owed by a different party to a different
recipient, and **none of them is aware of the others**. Run naively, they queue:

| Leg | From → To | Stated window | Source |
|---|---|---|---|
| **L1** | Sub-operator (Supabase) → **us** | **48 hours**, contractual | `compliance-review-supabase.md` §4.2 |
| **L1′** | Sub-operator (Resend) → **us** | **"without undue delay"** — **no outer bound stated** | `compliance-review-resend.md` §10(1), OI-R-4 |
| **L2** | **Us** (Operator) → **Client** (Responsible Party) | **48 hours from our awareness**, contractual | TDIT-2026-09 **§19(b)** |
| **L3** | **Client** → **Information Regulator** + affected data subjects | *"as soon as reasonably possible after the discovery of the compromise"* — **no fixed hour count** | POPIA **s22(2)** |

**Run in series, L1 + L2 alone is ~96 hours before the Regulator hears anything, and L1′ makes the
total unbounded.** Ninety-six hours is not defensible as "as soon as reasonably possible," and an
unbounded chain is not defensible at all. `10-data-protection-contract-obligations.md` §3.2 already
ruled that **the runbook must compress this chain, not merely document it.** Sections 4–6 are that
compression. Everything else here supports them.

**Scope.** Any compromise, suspected compromise, or unlawful processing of personal information on
any platform surface, whether originating with us, a sub-operator, or a third party. It covers
**both** the s22 "access or acquisition by an unauthorised person" case **and** the wider §19(b)
"breach" case, which is broader — see §3.2.

---

## 2. Roles — named before an incident, not during one

| Role | Held by | Authority |
|---|---|---|
| **Incident Commander (IC)** | `cto` | **Declares "aware" and timestamps it** (§4). Owns the incident. Authorises service of the L2 notice. Only the IC may decide *not* to notify, and only in writing with reasons |
| **Deputy IC** | `security-engineer` | Assumes IC role if the IC is unreachable for **2 hours** after an alert. **Must declare rather than wait** — see §4.3 |
| **Compliance lead** | `compliance-specialist` | Rules on whether §19(b) fires, whether s22 fires, drafts the L2 notice and the s22 pack, rules on the s22(3) deferral question (§8) |
| **Technical lead** | `security-engineer` | Containment, preservation, scoping (who/what/how many), evidence integrity |
| **Detection & timeline** | `site-reliability-engineer` | Establishes the "could have known" timestamp (§4.2), supplies logs and the incident chronology |
| **Vendor liaison** | `integration-architect` | Single point of contact to Supabase / Resend / Render / Vercel / MongoDB Atlas during an incident |
| **Dispatcher** | **the platform owner** | **The only party in this organisation with an actual channel to the Client.** No agent may send, and no agent may represent that a notice was delivered (`../correspondence/README.md` rule 1) |
| **Data-subject comms** | `technical-writer` (drafts) + `compliance-specialist` (approves) | Customer-facing notice copy, if the Client asks us to prepare it |

**Single point of failure, stated rather than hidden: the 48-hour clock at L2 depends on one human
being reachable.** There is no named deputy dispatcher, no out-of-hours contact, and no alternative
channel to the Client on record. Opened as **CT-3-OI-1** (§13).

---

## 3. Trigger — what starts this runbook

### 3.1 Entry conditions (any one)

- [ ] Sub-operator breach notice received (Supabase, Resend, Render, Vercel, MongoDB Atlas, AWS)
- [ ] Credential/API-key compromise or suspected compromise — including `RESEND_API_KEY`, Supabase
      service-role key, Atlas connection string, Render environment variables
- [ ] Unauthorised access to, or export from, either store (Supabase Postgres identity;
      MongoDB Atlas domain)
- [ ] Anomalous send volume on the email account (**currently detected by nobody** —
      `compliance-review-resend.md` §10(3), FU-02(c))
- [ ] Personal information found in a place it has no lawful basis to be — logs, error payloads,
      analytics, a third-party SDK, an email body, a backup in a less-controlled location
- [ ] Personal information processed with **no lawful basis and no Client instruction** — the
      INC-001 shape
- [ ] Report from a data subject, a security researcher, the Client, or the Information Regulator
- [ ] Lost or stolen device holding platform credentials or exported personal information

### 3.2 §19(b)'s trigger is wider than s22's. Do not collapse them.

| | **POPIA s22** | **TDIT-2026-09 §19(b)** |
|---|---|---|
| Trigger words | *"accessed or acquired by any unauthorised person"* | *"breach"* |
| Whose duty | **Client's** (Responsible Party) | **Ours** (Operator) |
| Recipient | Information Regulator **and** affected data subjects | **The Client** |
| Window | *"as soon as reasonably possible"* | **48 hours from our awareness** |

**Ruling, carried forward from `../10-data-protection-contract-obligations.md` §8 ¶2 and binding
here: §19(b) is a breach clause, not a harm clause.** A negative s22 finding does **not** discharge
L2. Unlawful processing by the Operator, a failure of the §19 security-safeguards duty, or
processing outside the Client's documented instructions are each a §19(b) matter **whatever the row
count**. INC-001 is the worked example: s22 provisionally negative, **§19(b) notice still owed**
(CT-10).

**Corollary that must not be reasoned around:** do not run the s22 analysis first and then infer L2
from it. **Run L2 on the §19(b) trigger, in parallel**, and hand the Client the material they need
for their own s22 call. Deciding the Responsible Party's notification question for them is the
substitution of judgement the Operator framing forbids.

---

## 4. The clock — who starts it, and when it started

### 4.1 "Aware" is declared, by a named person, in writing

**The IC (or Deputy IC per §4.3) declares awareness.** The declaration is recorded immediately, in
the incident file, with:

- [ ] **UTC timestamp of declaration** — this is **T+0** for the §19(b) 48-hour clock
- [ ] **The earlier "could have known" timestamp** (§4.2), if different, and why it differs
- [ ] Who declared, and on what input
- [ ] One-line description of what is believed to have happened

`10-data-protection-contract-obligations.md` §3.4: an undefined awareness trigger means the clock
starts at an arguable time, *"which in a dispute is the Client's argument to make, not ours."*
**This section exists to remove the argument.**

### 4.2 Awareness is the earliest of these, not the most convenient

**T+0 = the earliest of:**

1. Receipt of a sub-operator breach notice (timestamp of the email/dashboard notice, not of reading it)
2. Internal detection — first alert, first log line a competent reviewer would have acted on
3. A credible third-party report (data subject, researcher, Client, Regulator)
4. The point at which an internal investigation into something else surfaced facts amounting to a breach

**Awareness attaches to the breach, not to its consequences.** Establishing scope, headcount or
harm does **not** restart the clock. `../10-data-protection-contract-obligations.md` §8 ¶1 is the
precedent and it is binding: *"Evidence obtained on 2026-09-02 cannot retroactively stop a clock
that started eight days earlier."*

**If the clock has already run, the remedy is to send the notice late and say so.** Late is
recoverable; reasoning backwards to "so nothing was owed" is not.

### 4.3 Do not wait for the IC

If the IC is unreachable **2 hours** after an entry condition at §3.1, the **Deputy IC declares**.
A declaration that later proves over-cautious costs an internal debrief. A declaration deferred for
availability costs contractual default. **Declare, then de-escalate at §10 if the facts do not
support it** — de-escalation is a documented, dated ruling by the compliance lead, not a silent drop.

---

## 5. Compression — the four rules that collapse the chain

These rules are the operative content of this runbook. Everything in §6 is their execution.

### Rule 1 — Our 48 hours is a ceiling, not a budget. Internal targets are shorter.

| Origin of the breach | **Internal target for serving L2** | Why |
|---|---|---|
| **Sub-operator-originated** (Supabase, Resend, Render, Vercel, Atlas, AWS) | **T+12h** | The vendor has already consumed up to 48h (Supabase) or an **unbounded** period (Resend). The chain's slack was spent before we heard. Spending our full 48 on top is what produces the indefensible ~96h+ total |
| **Internally detected** | **T+24h** | Full contractual ceiling remains available as margin for a genuinely complex scope, not as default pace |
| **Reported by a data subject, the Client, or the Regulator** | **T+6h** | Someone outside is already talking about it. The Client learning of their own incident from a third party is a relationship failure independent of the contract |

**The 48-hour ceiling is never extended for any reason.** Rule 2 is why it never needs to be.

### Rule 2 — Serve a **preliminary** notice inside the window. Completeness is not a precondition.

**This is the single mechanism that makes the chain meetable.** §19(b) requires notice within 48
hours of awareness; it does not require a completed investigation, and a complete investigation
inside 48 hours is frequently impossible.

- **Serve on what is known**, with unknowns **listed as unknowns** (§6.3 template §4).
- **Commit to a supplementary notice** at a stated interval, and meet it.
- **Never delay L2 to make it tidier.** A preliminary notice that says "we do not yet know how many
  data subjects are affected" is compliant. A complete notice on day five is a breach of §19(b).
- Where the Client's own s22 clock is the reason for haste, say so in the notice — it tells them
  why they are receiving an incomplete document.

### Rule 3 — Notify the Client **at declaration**, not at conclusion.

At **T+0 ≤ 1h**, the dispatcher sends a short **holding message**: an incident has been declared,
here is what we believe in one paragraph, a formal §19(b) notice follows within X hours, here is the
single named contact. It is **not** the §19(b) notice and must say so.

This converts the Client from a recipient at the end of the chain into a **participant from the
start**, so their own s22 assessment runs **in parallel with our investigation rather than after
it**. That parallelism, not speed within any single leg, is what removes the ~96 hours.

### Rule 4 — Pre-empt L1 and L1′ rather than depending on them.

The vendor legs are the parts of the chain we do not control. Both are pre-loaded:

- **Resend has no bounded notification window** ("without undue delay") and **no published
  security-incident contact** — only `support@resend.com` (`compliance-review-resend.md` §10(4),
  OI-R-4). `integration-architect` to obtain one **before** an incident.
- **Anomalous send-volume detection is owned by nobody** (`compliance-review-resend.md` §10(3),
  FU-02(c)). Until it is, a Resend account compromise is detected by its consequences.
- **Detection on our side is what shortens L1 in practice.** Where we detect a sub-operator breach
  before the sub-operator tells us, T+0 is our detection timestamp and the vendor's leg becomes
  irrelevant to the chain arithmetic. That is the only available compression of L1/L1′.

**Worst case, before and after these rules:**

| | Series (naive) | With Rules 1–4 |
|---|---|---|
| Supabase-originated | 48h (L1) + 48h (L2) + L3 → **≥96h** | 48h (L1) + **12h** (L2, holding message at +1h) → **≤61h, with the Client assessing from hour 49** |
| Resend-originated | **unbounded** (L1′) + 48h + L3 | unbounded, **or** our own detection → **13h**, whichever is earlier |
| Internally detected | 48h + L3 | **≤25h**, Client assessing from hour 1 |

---

## 6. Procedure

### 6.0 T+0 — Declare (IC, or Deputy per §4.3)

- [ ] Record the declaration per §4.1 — **UTC timestamp, the §4.2 "could have known" time, declarer, one-line description**
- [ ] Open an incident file at `docs/organization/incidents/INC-NNN-<slug>.md`, INC-001 format
- [ ] Name IC, deputy, technical lead, compliance lead, vendor liaison, dispatcher in that file
- [ ] Set the **L2 due time** = T+48h, and the **internal target** per Rule 1. Write both, in UTC, at the top of the file
- [ ] Open a single timeline section; every subsequent step is appended with a UTC timestamp

### 6.1 T+0 → T+1h — Contain, preserve, and send the holding message

**Technical lead:**
- [ ] Contain — revoke/rotate compromised credentials, disable the affected path, fail closed
- [ ] **Preserve before remediating.** Do not delete, re-deploy over, or roll back evidence. Place a legal hold on affected records (AUD-7(b), INC-001 §7.3 G-4). If a hold retains personal information beyond its retention rule, **the Client must be told** — it is their data as Responsible Party (`10-data-protection...` §6 CT-6)
- [ ] Snapshot logs to a controlled location; record hashes

**Dispatcher (owner), on IC authority:**
- [ ] **Send the holding message (Rule 3).** Domain address only — `info@tditsolutionsinsurance.co.za`, never a consumer webmail account (C-R-9, closed 2026-09-14)
- [ ] Record dispatch time, recipient, and channel in the incident file

**Vendor liaison:**
- [ ] If sub-operator-originated: acknowledge, ask for the bounded facts (what, when, whose data, what the vendor has done), and **ask explicitly when the vendor became aware** — that date is evidence about L1 and belongs in our notice to the Client

### 6.2 T+1h → internal target — Scope and rule

**Technical lead — scope (best available, not final):**
- [ ] Which data classes: identity PII · **precise geolocation** · policy/asset records · KYC (SA ID, residential address) · payment data (none held today) · authentication tokens
- [ ] How many data subjects, and whether any are **real customers** as opposed to seeded/test accounts (`backend/scripts/seed-test-accounts.ts`, CT-5)
- [ ] Which store(s): Supabase Postgres identity, MongoDB Atlas domain, or both
- [ ] Run **AUD-8** if the question is "who accessed whose data, when" — noting it is **documentation only until FU-A11 provisions the investigative credential**

**Compliance lead — rule, in this order:**
- [ ] **§19(b): does the L2 notice fire?** Apply §3.2. **Presumption: yes.** A decision not to notify is the IC's, in writing, with reasons, counter-signed by the compliance lead
- [ ] **s22: is there reasonable ground to believe access or acquisition by an unauthorised person?** This is the **Client's** determination to make; we supply the analysis and the evidence, we do not make it for them
- [ ] **Regime check — not assumed.** POPIA applies. **GDPR is assessed, not inherited**: it fires only on an EU-resident data subject or an Art. 3 targeting fact (C-011-7). If any affected data subject is EU-resident, **Art. 33's 72-hour Regulator clock and Art. 34 data-subject duty run in addition**, and this runbook's windows tighten accordingly. **PCI-DSS**: no payment processing is live and no card data is held; if that ever changes, PSP incident-notification terms are added here
- [ ] **Insurance-recordkeeping**: does the incident touch policy or claim history subject to a retention floor? A purge must not destroy records we are required to keep
- [ ] Draft the L2 notice (§6.3)

### 6.3 By the internal target, and **never later than T+48h** — Serve the §19(b) notice

Drafted by `compliance-specialist`, authorised by `cto`, **sent by the owner**. Filed at
`docs/organization/correspondence/` under the `DRAFT-` → `SENT-` convention, with the dispatch
record at the top.

**Mandatory content:**

1. **That this is a notice under clause 19(b) of TDIT-2026-09**, and the date and time of our
   awareness as declared under §4.1
2. **What happened**, in plain language, without minimisation
3. **What personal information is involved** — categories, and numbers if known
4. **What is not yet known**, listed explicitly (Rule 2), with the date of the supplementary notice
5. **What we have done** — containment, preservation, remediation
6. **What we assess the risk to data subjects to be**, and our reasoning
7. **Our assessment of their s22 position**, offered as analysis and expressly **not** as their
   decision — including whether we think the s22(1) trigger is met, and on what facts
8. **What we are asking them to decide**, and by when, given their s22(2) clock
9. **A named contact and a direct channel**
10. **If the notice is late: that it is late, by how long, and why.** Do not bury it
       (`../10-data-protection-contract-obligations.md` §8.1)

**Prohibited:**

- Scoping the notice narrowly to one endpoint where a wider governance gap is known —
  `../10-data-protection-contract-obligations.md` §8.2 is directly on point
- Asserting a fact not verified (row counts, "no data was captured") before its positive control
  has returned — §8.2's first caveat
- Characterising the Client's s22 decision as settled, or the notice as a formality
- Any statement of an SLA, audit or uptime commitment the retainer does not fund
  (`../contract-tdit-2026-09-scope-summary.md` §7)

### 6.4 In parallel — the s22 evidence pack for the Client

The Client cannot meet *"as soon as reasonably possible"* on a narrative alone. Hand them, with or
promptly after the notice:

- [ ] Affected data-subject list or count, with the method used to derive it and its limits
- [ ] Timeline: first exposure → detection → containment, in UTC
- [ ] Data classes with sensitivity, per the classification matrix
- [ ] AUD-8 reconstruction output where access attribution is the question (subject to FU-A11)
- [ ] Our view on the s22(1) trigger, with reasoning
- [ ] **Draft s22(4) content for their notification to data subjects**, if they want us to prepare
      it — POPIA s22(5) requires sufficient information for the data subject to take protective
      measures. `technical-writer` drafts, `compliance-specialist` approves
- [ ] The known **delivery-channel limitation** (§9) — if they intend to have us reach data
      subjects by email, they must be told, **in the notice**, what the platform can and cannot
      actually deliver today

### 6.5 Supplementary notices

- [ ] Serve on the date committed in the preliminary notice. **Serve it even if nothing has changed** — "no material development" is itself a status, and a missed commitment undermines every figure in the original
- [ ] Correct any earlier statement that has turned out to be wrong, **promptly and in the
      counterparty's favour if that is where the correction falls** — the standard applied to
      CT-6's withdrawal (`../10-data-protection-contract-obligations.md` §8.1)

### 6.6 Closure

- [ ] Final notice to the Client: root cause, remediation, what prevents recurrence
- [ ] Incident file completed with the full timeline and every notification timestamp
- [ ] **Clock audit**: record actual elapsed L1 / L2, whether the internal target and the 48-hour ceiling were met, and if not, why. This is the CT-3 success metric and it is measured, not asserted
- [ ] Conditions raised, with owners and deadlines, into the relevant register
- [ ] **Tabletop within 30 days** if the runbook was exercised for real (INC-001-C-12)

---

## 7. Severity — drives pace, never the decision to notify

| | **SEV-1** | **SEV-2** | **SEV-3** |
|---|---|---|---|
| Typical | Confirmed unauthorised access/exfiltration of identity or KYC data; **any** unauthorised access to location data; credential compromise permitting mass send as the platform | Unlawful processing with no evidence of third-party access (the INC-001 shape); sub-operator breach with our data unconfirmed | Near-miss; a control that failed closed; exposure of test-only data |
| L2 target | **T+6h** | Rule 1 default | Rule 1 default |
| s22 posture | Assume engaged until disproved | Assess on evidence | Usually not engaged |
| Escalation | IC + compliance lead + owner immediately | IC + compliance lead | Compliance lead |

**Severity affects pace only.** It never affects *whether* the §19(b) notice is served —
§3.2 governs that, and SEV-3 matters are notified too.

**Location data is SEV-1 by default.** It reveals home address, workplace, and movement pattern;
this role's standing position is that it is not device telemetry
(`INC-001-location-ingestion-popia-assessment.md`).

---

## 8. The s22(3) law-enforcement deferral — decision path

s22(3) permits deferral of notification **to data subjects** where a public body responsible for
criminal investigation determines that notification would impede an investigation.

| Step | Who | Rule |
|---|---|---|
| 1 | `compliance-specialist` | Confirm the deferral is being asserted by **a public body**, not by us, not by the Client, and not by a vendor. **We may not self-certify a deferral** |
| 2 | `compliance-specialist` | Obtain the determination **in writing**, with the body, the officer, the case reference, and the scope of the deferral. An oral request is recorded with time, name and rank, and written confirmation is requested the same day |
| 3 | `cto` + counsel | Decide whether to rely on it. **Counsel referral is mandatory here** |
| 4 | `compliance-specialist` | **The deferral covers the s22 notification to data subjects only.** It does **not** defer the §19(b) notice to the Client, and it does **not** defer notification to the Information Regulator. Anyone reading s22(3) as a general pause has over-read it |
| 5 | `compliance-specialist` | Record the deferral, its scope, and a **review date**. Re-test at every review; notify the moment it lapses |

**SAPS interaction note.** Feature 011 (SAPS case reporting) means an incident may run alongside a
live criminal matter on the same records. A SAPS case number on a recovery case is **not** a s22(3)
determination. Do not conflate them.

---

## 9. What this runbook cannot do today — honestly

Held to the AUD-8 standard: *"Writing ≠ executable."*

| # | Gap | Effect on this runbook | Tracked as |
|---|---|---|---|
| 1 | **The platform cannot reliably reach its own data subjects.** Resend has **never sent an email for this platform** (`compliance-review-resend.md` Appendix C — zero log entries); the live path is **Supabase's built-in sender, which only delivers to addresses on the project team**. A real customer would not receive the mail | §6.4's data-subject notification limb is **unexecutable at scale**. Any commitment to reach data subjects by email is, today, unfounded — and the Client must be told this in the notice, not after | **INC-001-C-8**; `compliance-review-resend.md` **OI-R-8** |
| 2 | **The s18/s23 contact mailbox is not evidenced as provisioned or monitored.** `info@tditsolutionsinsurance.co.za` is published on live pages; nothing shows it exists or that anyone reads it | Inbound incident reports from data subjects or researchers may go unread. §3.1's report-driven trigger depends on it | **OI-R-10** |
| 3 | **AUD-8 is documentation-only until FU-A11.** No read-only investigative credential exists; migrations 032/033 unapplied; Trail B (`admin_access_log`) is paper design | §6.2's access-attribution step cannot be executed against both stores. Scoping "who accessed whose data" is currently partial | **FU-A11**, ADR-0006 §16.6 |
| 4 | **No anomalous send-volume detection.** Owned by nobody | A stolen `RESEND_API_KEY` — mass phishing as the platform, plus possible bulk read of the 30-day log — is detected by its consequences, not by monitoring | `compliance-review-resend.md` §10(3), **FU-02(c)** |
| 5 | **Resend's notification leg is unbounded and its security contact is unknown** | Rule 4 mitigates by pre-emption; it does not close it | **OI-R-4** |
| 6 | **Single dispatcher, no deputy, no out-of-hours contact** | The entire 48-hour obligation rests on one person's availability | **CT-3-OI-1** (§13) |
| 7 | **The Supabase DPA is not executed.** Long-standing owner blocker | The 48h L1 leg at §1 is a **published DPA term we have not executed**. Its enforceability against us is not established | **C-2** |
| 8 | **No tabletop has been run.** The runbook is untested | Every window in §5 is a design target, not a demonstrated capability | **INC-001-C-12** (2026-10-08) |

**None of these is a reason to delay filing this runbook**, and none is a reason to treat it as
complete. Item 1 is the one that would most visibly fail in a real incident.

---

## 10. De-escalation

A declaration that the facts do not support is closed by a **dated written ruling of the compliance
lead**, recording: what was declared, what the evidence showed, why §19(b) does not fire, and who
concurred. It is **never** a silent drop, and it is **never** retroactive erasure of the declaration
timestamp. If the Client has received a holding message, the Client is told the outcome.

---

## 11. Retention of incident records

Incident files, notification copies, dispatch records and evidence hashes are retained for the
longer of: **5 years** from closure, any applicable insurance-recordkeeping floor, or the life of
any legal hold. They are the evidence that a notification obligation was met and are not subject to
routine deletion.

---

## 12. Related documents

- [`../10-data-protection-contract-obligations.md`](../10-data-protection-contract-obligations.md) — §3 (the CT-3 requirement), §8 (awareness-clock precedent), CT-10
- [`../11-documented-client-instructions.md`](../11-documented-client-instructions.md) — CT-4, §19(a); processing outside instruction is a §3.2 trigger
- [`../incidents/INC-001-location-ingestion-popia-assessment.md`](../incidents/INC-001-location-ingestion-popia-assessment.md) — worked s22 analysis and the §6.5 ruling
- [`aud-8-privileged-access-reconstruction.md`](aud-8-privileged-access-reconstruction.md) — access reconstruction
- [`../09-business-continuity-policy.md`](../09-business-continuity-policy.md) — §4.5 communications, §4.6 vendor continuity
- `docs/features/001-authentication/compliance-review-resend.md` §10 · `compliance-review-supabase.md` §4.2, §6
- [`../correspondence/README.md`](../correspondence/README.md) — dispatch convention

---

## 13. Conditions opened by this runbook

| ID | Condition | Owner | Deadline |
|---|---|---|---|
| **CT-3-OI-1** | **Name a deputy dispatcher and an out-of-hours channel to the Client.** The §19(b) 48-hour obligation currently has a single point of human failure (§2, §9 item 6). Needs a second named person with a working channel, and an agreed after-hours contact recorded with the Client | `cto` + owner | **2026-09-30** |
| **CT-3-OI-2** | **Obtain Resend's security-incident escalation contact and any bounded notification window** — re-issue of OI-R-4, now blocking a filed runbook rather than a planned one | `integration-architect` | **2026-09-30** |
| **CT-3-OI-3** | **Assign anomalous send-volume detection** (FU-02(c)) — currently owned by nobody | `security-engineer` + `site-reliability-engineer` | Before production email delivery |
| **CT-3-OI-4** | **Tabletop this runbook using INC-001 as the scenario** — re-issue of INC-001-C-12, now executable because a runbook exists to test. Measure the §5 windows against a real walk-through and record where they failed | `compliance-specialist` + `security-engineer` | **2026-10-08** |
| **CT-3-OI-5** | **Agree the incident contact and escalation path with the Client**, so the §19(b) notice has a named recipient before it is needed rather than "the signatory to TDIT-2026-09." Fold into the CT-4 instruction conversation rather than sending a separate letter | `cto`/owner | With CT-4 |

---

## 14. Standing statement

This runbook is a compliance determination made from the contract terms as summarised to this
organisation, from the repository, and from the statute. **It is not legal advice.** The s22, s22(3)
and clause 19(b) characterisations are this role's analysis. **Any notification actually served on
the Client, the Information Regulator, or a data subject should be reviewed by admitted counsel
before dispatch** — an incident notification is a legal document that will be read back to us
(INC-001 §10 item 6).

**Filed by:** `compliance-specialist`, 2026-09-14. **Discharges CT-3** (due 2026-09-12, filed two
days late — recorded rather than glossed).
**Does not discharge:** C-2 · CT-1 · CT-1a/b/c · CT-10 · INC-001-C-8/C-12 · FU-A11 · OI-R-4/OI-R-8/OI-R-10 · CT-3-OI-1…5.
