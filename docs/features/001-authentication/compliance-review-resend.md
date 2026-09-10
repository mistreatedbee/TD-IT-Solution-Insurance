# Features 001 / 007 — Compliance Review: Resend (Plus Five Five, Inc.) as Transactional Email Operator

**Owner:** `compliance-specialist`
**Date:** 2026-09-10
**Status:** **APPROVED WITH CONDITIONS — but the conditions are heavier than Brevo's, and two of them
are blocking.** Discharges **CT-7 limb 1** (compliance-review Resend as an operator). Does **not**
discharge CT-7 limb 2 (`email-footer.ts:44` consumer-webmail contact), which remains open and is
re-stated at §12 as **C-R-9**.
**Supersedes** [`compliance-review-smtp-vendor.md`](compliance-review-smtp-vendor.md) **as the
operative email-operator review.** That document is **not** withdrawn — it remains the record of the
Brevo analysis and its method — but **Brevo is not the shipped vendor and its conditions C-5.1 …
C-5.9 do not describe the live operator.** See §2 for exactly which of them transfer.
**Not legal advice** — same standing caveat as `compliance-review-saps-case-data.md` §10.

**Reads on:** [`10-data-protection-contract-obligations.md`](../../organization/10-data-protection-contract-obligations.md)
(TDIT-2026-09 two-tier Operator framing, CT-register) · [`compliance-review-supabase.md`](compliance-review-supabase.md)
§4–§6 (POPIA method — applied, not restated) · [`compliance-review-smtp-vendor.md`](compliance-review-smtp-vendor.md)
(Brevo; superseded as operative) · [`resend-setup.md`](resend-setup.md) (setup doc; its §7 is a
four-row engineer checklist, **not** a compliance review) · [`compliance-review-saps-case-data.md`](../011-saps-case-reporting/compliance-review-saps-case-data.md)
(recovery-case PI categories) · [`compliance-review-agent-attributed-actions.md`](../010-call-centre-dashboard/compliance-review-agent-attributed-actions.md)

---

## 0. Verdict, stated up front

**The CTO check-in's claim is correct, and it understates the gap.**

It is true that the only email-vendor compliance review in this repository analyses **Brevo**, and
that the code sends via **Resend**. But the check-in frames this as a vendor-name mismatch. It is not.
Three things changed at once when Resend replaced Brevo, and only the first was noticed:

1. **The vendor changed** — Brevo (Belgium/France/Germany hosting, French/Delaware split
   counterparty, ISO 27001) → **Plus Five Five, Inc., San Francisco, California**, with
   **all 22 published sub-processors in the USA and data held in the United States**. The entire
   §4.4 analysis of the Brevo review — the "recipient subject to a law" limb of POPIA s72(1)(a),
   available only for a genuinely EU-established recipient — **is unavailable.** We are back to
   binding-agreement-only, the Supabase posture. **Lawful, but the record currently says otherwise.**
2. **The scope changed, and nobody re-inventoried it.** The Brevo review's §2 inventory was **four
   auth triggers** (verification, resend, reset, invitation) carrying an email address and a token.
   Resend carries those **plus roughly twenty Feature 007 domain notification templates**
   (`backend/src/lib/domain-email-templates.ts`), including **theft-report, recovery-case-assigned,
   recovery-case-update, recovery-successful and recovery-closed** emails, and a
   **new-device-login email carrying the customer's IP address**. That is a materially different and
   more sensitive personal-information inventory than the one that was reviewed. §4.
3. **The platform's own role changed underneath it.** Every clause of the Brevo review was written
   before TDIT-2026-09 established the two-tier structure. Resend is not our operator — it is a
   **sub-operator, engaged by us as Operator, on the Client's behalf**, and it therefore falls
   inside **CT-1's unmet cross-border consent requirement**. §3.

**Ruling: Resend is APPROVED as an operator/sub-operator for this flow, subject to nine conditions
(C-R-1 … C-R-9), two of which — C-R-1 (execute/record the DPA) and C-R-3 (recovery-case content in
email bodies) — block production email delivery.** I am not rejecting Resend. Its retention posture
is materially **better** than Brevo's (a flat 30 days, not "indefinite by default"), its DPA is
readable, published, SCC-backed and 14-day-notice-bound, and it holds a current SOC 2 Type II. The
defects are in **our record and our content**, not primarily in the vendor.

---

## 1. Verification of the claim — what I actually checked

| Question | Method | Result |
|---|---|---|
| Does an email-vendor compliance review exist, and which vendor? | Read `docs/features/001-authentication/compliance-review-smtp-vendor.md` in full | **Brevo.** Title: *"Brevo as Transactional Email (SMTP) Operator"*. 394 lines. Resend appears nowhere in it. |
| Is there a Resend compliance review anywhere? | `Glob **/*{brevo,resend,email,smtp}*` across the repo | **No.** Only `resend-setup.md`, an operational setup doc whose §7 is a four-row owner checklist that explicitly defers the work: *"Resend replaces the earlier Brevo recommendation… See `smtp-vendor-selection.md` §7 for the full C-5 checklist — vendor name changes; obligations do not."* That is a promissory note, not a review. |
| Is Resend genuinely what ships? | Read `supabase/functions/auth-send-email/lib/send-email.ts` and `backend/src/lib/resend-email.ts` | **Yes, on both paths.** Auth email: Edge Function posts to `https://api.resend.com/emails` and **throws** if `RESEND_API_KEY` is absent — there is no Brevo fallback in that path at all. Domain email: `sendResendEmail()` posts to the same endpoint and is imported by five notification services (`auth-`, `customer-`, `policy-`, `onboarding-`, `recovery-notification-service.ts`). |
| Is Brevo still live anywhere? | Grepped `sendTransactionalEmail` / `brevoApiKey` across `backend/src` | **No production caller.** `backend/src/lib/transactional-email.ts` (Brevo REST) is referenced **only by its own test file**. It is dead code — but it is *armed* dead code, because `env.brevoApiKey` is still parsed from `BREVO_API_KEY` at `backend/src/config/env.ts:304`. See **C-R-8**. |
| Was this already known? | Read `docs/organization/10-data-protection-contract-obligations.md` | **Yes — I raised it myself on 2026-08-28** at §2(c) and logged it as **CT-7**, due *"before production email delivery is enabled."* The CTO check-in is re-surfacing a known-open condition, correctly, not discovering a new one. **This document is CT-7 limb 1 being done, twelve days late.** |

**Provenance on the vendor research, to the standard `compliance-review-smtp-vendor.md` §1 set for itself:**

| Artefact | Outcome |
|---|---|
| Resend **DPA** (`resend.com/legal/dpa`) | **READ.** Full text retrieved and parsed. This is materially better than the Brevo position, where **neither** DPA could be read. Findings at §5 are from the instrument itself. |
| Resend **sub-processor list** (`resend.com/legal/subprocessors`) | **READ.** Separately published, dated page — **Last Updated 27 August 2026** — with 22 named entries, each with purpose and location. This is the Supabase-grade posture the Brevo review found missing (Brevo buries its list in a DPA Schedule). |
| Resend **security page** (`resend.com/security`) | **READ.** Source for SOC 2 Type II, encryption, the 30-day retention figure, the 7-day backup window, and the data-location statement. First-party. |
| Resend **privacy policy** | **READ.** Confirms US processing; **silent on email log/content retention** — the 30-day figure comes from the security page only, which is why **C-R-2** requires it recorded as a configured/confirmed fact rather than a marketing statement. |
| Resend **region / data-residency docs** | **NOT READ — 404 on every path tried** (`/docs/dashboard/settings/data-residency`, `/docs/dashboard/emails/regions`, `/docs/knowledge-base/what-regions-are-available`); web search unavailable in this session. **I could not independently corroborate the security page's claim that data is held in the US "regardless of the sending region selected."** That claim is Resend's own and is adverse to Resend's commercial interest, which is weak evidence *for* its truth, but it is single-sourced. **OI-R-3.** |
| Which Resend plan the account is on, and whether the account exists | **UNKNOWN.** No account artefact in the repo. Determinable only by someone with Resend account access. §13. |

---

## 2. Which Brevo conditions transfer, and which die

Stated explicitly so nobody closes a C-5.x by pointing at this document, and nobody re-litigates one
that still binds.

| Brevo condition | Fate under Resend |
|---|---|
| **C-5.1** (determine counterparty entity) | **ANSWERED, not transferred.** The DPA names the counterparty on its face: **Plus Five Five, Inc., 2261 Market Street #5039, San Francisco, CA 94114**. There is no region-split entity structure to resolve. The question Brevo left open is closed on arrival — and closed the *unfavourable* way (§5.2). |
| **C-5.2** (configure retention before first send) | **DIES as written; replaced by C-R-2.** There is no retention setting to configure. Resend's retention is a **flat, non-configurable 30 days** on all plans. This removes the Brevo review's sharpest finding (indefinite-by-default body retention) *and* removes our ability to shorten it. Net: **better default, less control.** |
| **C-5.3** (token TTL short relative to vendor retention floor) | **TRANSFERS UNCHANGED, and the arithmetic is unchanged.** Brevo's floor was 1 month; Resend's fixed window is 30 days. The recommended ceilings — **reset ≤ 60 min, verification ≤ 24 h, privileged invitation ≤ 72 h** — hold verbatim, for the identical reason. Re-issued as **C-R-4** so it is not orphaned when C-5 is closed. |
| **C-5.4** (no vendor AI features on this account) | **TRANSFERS, AND SHARPENS.** Brevo's AI sub-processors were unnamed. Resend's are **named: Anthropic, PBC ("Artificial Intelligence") and RunPod, Inc. ("Self-hosted LLMs"), both USA.** A named sub-processor is a *better* disclosure and a *worse* silence — we now know exactly who could receive content and still do not know under what circumstances. **C-R-5.** |
| **C-5.5** (transactional-only account, no marketing side door) | **LARGELY MOOT.** Resend is not a marketing-automation platform with a contact-list data model; there is no shared marketing/transactional allowance and no auto-enrolment mechanism of the kind OI-15 worried about. The **one surviving limb** — no list-unsubscribe on password-reset/verification mail, because an unsubscribe that suppresses reset delivery locks a data subject out of their own account and degrades s23/s24 exercise — **transfers into C-R-6**, and now additionally has to be reasoned about for the Feature 007 domain notifications, which *do* have a preference model (`isEmailEnabled(prefs.channels, …)`). |
| **C-5.6** (execute DPA and read five things while it is open) | **TRANSFERS as C-R-1, but four of the five things are already read** (§5). What remains is **execution and filing**, plus `cybersecurity-architect`'s TLS confirmation. |
| **C-5.7** (RoPA + privacy notice) | **TRANSFERS as C-R-7**, with a corrected copy string at §11 — the approved Brevo copy is now **actively false** (it names Brevo and asserts EU servers) and may not ship. |
| **C-5.8** (vendor logs never satisfy FR-12 audit logging) | **TRANSFERS UNCHANGED as C-R-3(b).** One rule, now three vendors. Resend's 30-day dashboard log is *even less* citable than Brevo's would have been. |
| **C-5.9** (breach path recorded before an incident) | **TRANSFERS**, and folds into **CT-3** (breach-notification runbook, due 2026-09-12) rather than standing alone. §10. |

---

## 3. Regulatory scope — confirmed for this flow, not inherited

Applying the §1 discipline of `compliance-review-saps-case-data.md`: I do not accept a single-regime
framing by default, including my own prior one.

| Regime | Applies to this data flow? | Reasoning |
|---|---|---|
| **POPIA (Act 4 of 2013)** | **Yes — confirmed.** | Data subjects are South African customers and staff of a South African responsible party (TD IT Solution (Pty) Ltd, TDIT-2026-09). Personal information of identifiable living natural persons is transmitted to and stored by a third party. Engages **s19** (security safeguards), **s20/s21** (operator, written contract), **s14** (retention), **s72** (transborder flow), **s18** (notification of recipients). |
| **GDPR** | **Not triggered. Standing open item, not closed** — same posture as `compliance-review-saps-case-data.md` §1. | No EU data subjects and no EU-market targeting evidenced anywhere in this repository. **Two traps to name explicitly, because both are more tempting here than elsewhere:** (a) Resend's DPA is **governed by Irish law** (§6.3.5) and offers **EU SCCs and the EU-U.S. Data Privacy Framework** — none of that is an Art. 3 territorial-scope trigger for *us*, and nobody may cite it as evidence that GDPR applies or as evidence that it does not; (b) the backend that *calls* Resend runs in **Render Frankfurt** (`render.yaml:9`), which is a processing location, not an establishment. **My position: GDPR does not apply today.** If an EU-resident customer is ever onboarded, this ruling reopens — logged with **C-011-7**, not duplicated. |
| **PCI-DSS** | **No.** | No cardholder data in any email template. `buildPolicyRenewalUpcomingEmail` carries an `amount: string \| null` — a **currency amount, not an instrument**. No PAN, no expiry, no CVV, no token. **PCI scope remains nil** (there is still no payments backend). **Standing forward constraint at C-R-6(c):** when payments are built, no payment-instrument data may enter an email body, and any receipt/invoice email is a **fresh review**, not a new template. |
| **Insurance-sector recordkeeping** (Insurance Act 18 of 2017, FAIS General Code, PPR, FICA s23) | **Indirectly relevant, and it does not bite here.** | The statutory retention floors identified at `compliance-review-saps-case-data.md` §1 attach to the **record**, which lives in MongoDB and Supabase. Resend's copy of a *notification about* a recovery case is a **transmission artefact, not the record of authority**. Resend's 30-day expiry therefore creates **no** recordkeeping shortfall — and, symmetrically, may never be offered as satisfying one. **C-R-3(b).** |
| **ECTA / POPIA s69 (electronic direct marketing)** | **Not engaged by current templates.** | Every Feature 001 and 007 template inspected is transactional or service-related. Engages the moment a marketing send is added — **C-R-6(b)**. |

**Two-tier framing (TDIT-2026-09 §19).** Under the structure recorded at
`10-data-protection-contract-obligations.md` §1: TD IT Solution is **Responsible Party**; NextWave is
**Operator**; **Resend is a sub-operator**. Consequences that do not exist in the Brevo review because
it predates the contract:

- **§19(c) prior written consent to cross-border processing covers Resend, and it is unmet.** CT-1
  already itemises "Resend" by name. This review supplies the equivalent-protection evidence CT-1
  requires for that line item (§5), but **does not obtain the consent**. CT-1 remains the blocker.
- **§19(a) documented-instructions:** sending customer notification email via a US processor is
  operator processing that must appear in the CT-4 instruction set.
- **§19(b) 48-hour Developer→Client breach notice** now sits **downstream of Resend's "without undue
  delay"** (§5.3) — a second nested chain of exactly the shape CT-3 must compress. §10.

---

## 4. What actually flows to this operator — a re-inventory, because the old one is wrong

`compliance-review-smtp-vendor.md` §2 inventoried **four** triggers. Verified against
`backend/src/lib/domain-email-templates.ts`, the five `*-notification-service.ts` files, and
`supabase/functions/auth-send-email/`:

### 4.1 Tier 1 — auth email (Supabase Edge Function → Resend)

| Trigger | FR | PI reaching Resend | Classification |
|---|---|---|---|
| Signup verification / resend | FR-3 | Email address + single-use verification token **in the body** | Identity PII **+ credential in transit** |
| Password reset | FR-15, FR-16 | Email address + single-use reset token **in the body** | Identity PII **+ credential in transit** |
| Staff / partner invitation | FR-6, FR-7 | Invitee email + invitation token | PI of a **prospective privileged user** + credential in transit |

Unchanged in kind from the Brevo analysis. The §2 observation that **invitation tokens are the
highest-consequence of the three** — they carry a credential to an account that can reach customer
asset-location data — transfers verbatim.

### 4.2 Tier 2 — Feature 007 domain notifications (Render backend → Resend). **Never reviewed.**

| Template | PI reaching Resend beyond the address | Classification |
|---|---|---|
| `buildPolicyCreated` / `PendingActivation` / `Activated` | Plan name, policy ID, effective date | **Insurance/policy record.** Reveals that this person holds cover, of which tier, from when. |
| `buildPolicyRenewalUpcoming` | Plan name, policy ID, renewal date, **amount** | Policy record + **financial value** (premium). Not payment data (§3). |
| `buildAssetCreated` / `Updated` / `Removed` | **Asset name, asset type, asset ID, change summary** | **Inventory of a named person's valuables.** "Ashley's MacBook Pro", "2019 Toyota Hilux". A retained set of these is a **burglary shopping list** keyed to an identified individual. |
| `buildNewDeviceLoginEmail` | Device name + **`ipAddress`** | **Approximate geolocation + behavioural PII.** Per this role's standing position, location-capable data is classified at the sensitivity of what it reveals, not as "device telemetry". **This is the single most under-appreciated item in the inventory.** |
| `buildTheftReportSubmitted`, `RecoveryCaseAssigned`, `RecoveryCaseUpdate`, `RecoverySuccessful`, `RecoveryCaseClosed`, `AssetRecovered` | Asset name, **`referenceNumber`**, **`caseId`**, status label | **Victimisation / life-event PI.** These assert that an identified person **was the victim of a crime**, involving a named item, at a knowable time, with an ongoing police-adjacent matter. |

**Three rulings on Tier 2.**

**(a) The theft/recovery templates are a new PI category for this operator, on the reasoning already
established at `compliance-review-saps-case-data.md` §2(a).** The information is the **assertion**,
not the string: `referenceNumber` on a named person's message asserts a criminal-matter complainant
status. That review held the customer's own complainant record is **ordinary** PI and **not** s26
special personal information — **that ruling binds here and I am not disturbing it.** No s27/s33
authorisation is required, and **no s57 prior authorisation is engaged** by this flow. But ordinary
PI at elevated sensitivity still drives handling, and it was **never in scope** when the email
operator was assessed.

**(b) The s26 boundary is one careless template away.** `compliance-review-saps-case-data.md` §2(b)
found `recovery_cases.notes` is unconstrained free text and may contain **third-party suspect data**,
which *would* be s26(b) criminal-behaviour information. **No current template interpolates `notes`.**
It must stay that way. **C-R-3(a) — blocking.**

**(c) No `sapsCaseNumber`, `reportingStation`, or GPS coordinate appears in any template, and none
ever may.** Verified by inspection today. A recovery email containing a last-known asset location
would place **precise geolocation of an identified crime victim** in a US processor's 30-day store,
and would exceed anything CT-1's consent will cover. **C-R-3(a).**

### 4.3 What is not sent

No special personal information under s26; no children's data; no biometric artefact (the **C-9**
prohibition extends here by its own terms); no payment instrument; no ID number; no coordinates.
**The boundary holds today. Three of the four items in C-R-3(a) exist to keep it holding.**

---

## 5. The vendor, on the instrument rather than the marketing page

### 5.1 s21 — the written operator contract

POPIA s21(1) requires a written contract obliging the operator to maintain s19 safeguards.
`compliance-review-supabase.md` §4.2's ruling applies verbatim: **there is no "reputable vendor"
exemption; no executed DPA means a standing s21 contravention for as long as production PI flows.**

**Resend's DPA satisfies s21 on its terms, and I have read them.** Material clauses:

| Term | Resend | Assessment |
|---|---|---|
| **Counterparty** | Plus Five Five, Inc., San Francisco, CA 94114 | Single entity, no region split. §5.2. |
| **Execution** | *"shall become legally binding upon Customer entering into the Agreement or upon execution of this Addendum"*; signature blocks *"for reference purposes only"* | **Click-accept / automatic on account creation.** Easier than Brevo — but it means **nobody in this organisation can currently evidence that it is in force**, because there is no signing artefact. **C-R-1 turns on producing account-side evidence, not a signature.** |
| **Sub-processor change notice** | *"at least fourteen (14) days in advance"*, in writing | **Weaker than Supabase's 30 days, materially better than Brevo's unknown.** Sufficient for the s72(1)(a)(ii) onward-transfer limb — *if someone reads the notices*. §7. |
| **Breach notification** | *"without undue delay"*, plus cooperation for regulatory notification | Market-standard. **Pre-accepted** under the §4.2 precedent. But it is **unbounded** — no outer hour figure. §10. |
| **Transfers** | EU SCCs, Module Two (Controller→Processor); EU-U.S. DPF at §11 | GDPR machinery. **Does no direct work under POPIA** (POPIA has no adequacy list) but is strong *evidence* of substantially-similar processing principles and onward-transfer restrictions under s72(1)(a)(i)/(ii). §5.3. |
| **Deletion on termination** | Return or delete at Customer's choice; account data deleted **within 90 days** of termination | Satisfies s14/§19(d). Record the 90 days in the RoPA — it is a real retention tail. |
| **Audit rights** | On written request, **no more than once per calendar year** | Standard and adequate. |
| **Governing law** | **Irish law; Irish courts** (§6.3.5/§6.3.6) | Noteworthy: a US company contracting under Irish law. Neutral for POPIA. Practically, it means enforcement against a US processor runs through Irish proceedings — an **access-to-remedy** friction worth recording, not a lawfulness defect. |
| **Retention of email logs/content** | **Not in the DPA.** 30 days per the security page. | **The retention number is not a contractual commitment.** §6, **OI-R-1**. |
| **Certification** | **SOC 2 Type II** (Vanta / Advantage Partners). **No ISO 27001. No HIPAA/BAA.** | Meets the bar §7 of the Supabase review set. **Weaker than Brevo on paper** (Brevo held first-party ISO 27001:2022), but SOC 2 Type II is first-party published and not plan-gated, which is more than Supabase offered. **Adequate.** |
| **Encryption** | AES-256 at rest; TLS 1.3+ in transit | Meets what §5.1 of the Brevo review demanded. Our side is an **HTTPS POST to `api.resend.com`** — no SMTP submission at all, which **structurally eliminates** the opportunistic-STARTTLS worry that made C-5.6's TLS limb necessary. **A genuine architectural improvement over the Brevo design.** `cybersecurity-architect` still confirms under C-R-1. |

### 5.2 The counterparty question — answered on arrival, unfavourably

The Brevo review's §4.4 was built on a live possibility: **if** the counterparty were EU-established,
POPIA s72(1)(a)'s *"subject to a law … providing an adequate level of protection"* limb would become
available, and Brevo would have been the **first operator on this platform with a statutory
transborder basis** rather than a contract-only one.

**That possibility is dead.** Plus Five Five, Inc. is a **California corporation**. It is not subject
to GDPR as its own governing law; it has *contracted into* GDPR-shaped obligations, which is a
different and lesser thing. **The statutory limb is unavailable. s72(1)(a) rests on the binding
agreement alone — structurally identical to Supabase (§5.1.4) and to the SES fallback.**

**This is not a rejection ground, and I will not manufacture one.** `compliance-review-supabase.md`
§5.1.4 ruled that US domicile does not defeat s72(1)(a)(ii) under POPIA's **contractual-adequacy**
test — not a domicile test, not a governmental-access test — and I accepted AWS on exactly that
basis. Consistency is the point. **But two things must now be corrected in the record**, because the
loss of the statutory limb was never noticed when the vendor swapped:

1. `smtp-vendor-selection.md` §2.1/§4.1's EU-domicile reasoning **no longer describes the shipped
   vendor at all** and must be marked superseded (**C-R-7**).
2. Any privacy-notice or RoPA sentence describing the email provider as European, or its servers as
   EU-hosted, is a **false statement about a transborder transfer** — which
   `compliance-review-supabase.md` §9.3 rates as **worse than a missing one**. §11.

### 5.3 s72 — is the transborder flow lawful?

| Ground | Available? | Ruling |
|---|---|---|
| **s72(1)(a)** — recipient subject to a law / BCRs / **binding agreement** with (i) substantially similar processing principles and (ii) substantially similar onward-transfer provisions | **Yes, by the binding-agreement route only** | **PRIMARY BASIS.** The DPA is read, not assumed. Limb (i): satisfied — purpose limitation, confidentiality, security, deletion, audit are all present, and the SCC Module Two incorporation imports the GDPR Art. 28 processor duties wholesale. Limb (ii): satisfied by the **14-day advance sub-processor change notice + flow-down**, on the same reasoning §5.1.3 used for Supabase's 30-day regime. **Contingent on C-R-1** — an unexecuted/unevidenced DPA discharges nothing. |
| **s72(1)(b)** — consent | Technically available | **REJECTED**, on the reasoning of `compliance-review-supabase.md` §4.3.1, which binds. No "I consent to my verification email being routed via California" checkbox. Not freely given (the account cannot be verified without it), revocable, and unbundled-consent theatre. **Do not build it.** |
| **s72(1)(c)** — necessary for performance of a contract with the data subject, or pre-contractual measures at their request | **Yes, and it now reaches further than it did for Brevo** | **SUPPORTING basis.** FR-3 verification and FR-15 reset are literally pre-contractual/contractual measures at the data subject's request. **Newly, Tier 2 policy and recovery notifications are performance of the insurance contract itself** — arguably the strongest s72(1)(c) case anywhere on this platform. **Still unavailable for FR-6/FR-7 staff invitations**, so s72(1)(a) remains the only ground for privileged accounts, which is again what makes C-R-1 unavoidable rather than merely prudent. |
| **s72(1)(d)/(e)** | No | Not relied on. |

**Ruling: the flow is lawful under s72(1)(a), supported for customers by s72(1)(c) — contingent on
C-R-1, and separately gated by CT-1's unmet §19(c) Client consent, which is a contractual gate, not a
POPIA one.** Both must close before production email.

---

## 6. Retention — better than Brevo, and outside our control

**What Resend does (security page, first-party; §1 provenance):**

1. **Email and log data retained 30 days**, on **all plans**. Not configurable, not plan-gated.
2. **Backups: 7 days**, point-in-time.
3. **Account termination: remaining data deleted within 90 days** (DPA-backed).

**Ruling under s14.** POPIA s14 applies to Resend's message store exactly as
`compliance-review-supabase.md` §6.2.1 held it applies to `auth.audit_log_entries`: **a vendor
writing the record does not extinguish the responsible party's retention-limitation obligation.**

**A flat 30 days is a defensible, proportionate, service-integral retention period for delivery
diagnostics and abuse prevention, and I accept it.** It is dramatically better than the finding that
made the Brevo review's §6 its longest section — Brevo's default was *indefinite*, its floor was
1 month, and its preview setting was **not retroactive**, meaning a single early send was retained
forever. None of that applies. **The vendor change fixed the Brevo review's sharpest finding
outright, by accident.**

**Two consequences that are worse, and must be recorded rather than celebrated:**

- **We cannot shorten it.** Brevo's retention was a five-minute account setting; C-5.2 was trivially
  satisfiable. Here there is no lever. **Whatever is in a message body sits in California for 30
  days, full stop.** That is precisely why §4.2's content inventory — not the vendor's settings — is
  now the only retention control we have, and why **C-R-3 is a blocking condition.** *The control
  moved from the vendor's dashboard to our template code.*
- **The 30 days is not contractual.** It is on a security page Resend can edit unilaterally; the
  privacy policy is silent and the DPA does not state it. A privacy-notice sentence quoting "30 days"
  is therefore a statement about a fact we do not control. **OI-R-1**; §11 constraint 2.

**C-R-3(b) — the vendor-log prohibition, one rule now across three vendors.** Resend's email logs,
delivery events and dashboard history **may never be cited** as satisfying **FR-12 audit logging**,
the platform's 12-month retention policy, insurance-sector recordkeeping floors
(`compliance-review-saps-case-data.md` §5), or any evidentiary obligation to the Information
Regulator. `app.account_audit_log` remains the record of authority. **The fact of a send must be
logged by us, never the token or the token-bearing URL** — already required by
`secrets-management-plan.md` §4, re-imposed here so the Stage 9 shortcut ("Resend already logs the
send") is closed in advance, exactly as §6.3(1) closed it for Supabase and C-5.8 for Brevo.

---

## 7. Sub-processors and the s72(1)(a)(ii) onward-transfer limb

**This limb is DISCHARGED for Resend — the first time this platform has been able to discharge it at
review time rather than deferring it to execution.** Brevo's list was unreadable (OI-11 stayed open);
Resend publishes a dated, separately-versioned page with locations, plus a 14-day contractual change
notice. That is the Supabase-grade posture, at 14 days rather than 30.

**Full list, verbatim, as at 27 August 2026 — 22 entries, ALL located USA:**

Amazon Web Services (hosting and sending provider) · **Anthropic, PBC (Artificial Intelligence)** ·
Attio (CRM) · Cloudflare (WAF) · Datadog (infrastructure monitoring) · Elastic (in-app search) ·
Estuary (data pipeline) · Google (email communications and analytics) · Inngest (background jobs) ·
Liveblocks (in-app collaboration) · Metabase (product analytics) · Plain / Not Just Tickets (support)
· PlanetScale (database hosting) · Retool (internal admin tools) · **RunPod (self-hosted LLMs)** ·
Slack / Salesforce (team communication) · Snowflake (data warehouse) · Stripe (payment processing) ·
**Supabase, Inc (database and user authentication)** · Svix (webhooks) · Tinybird (data analytics) ·
Vercel (server hosting).

**Four findings.**

**(a) There is no EU leg anywhere in the chain.** Twenty-two of twenty-two are USA. The Brevo
review's §4.6 hedge — that an EU-established email operator would be a clean GDPR hedge if that
regime ever engaged — is **gone entirely**, not merely diminished. Record it as lost, don't let it
linger in the RoPA as an assumed benefit.

**(b) The Postmark trap the Brevo review dodged, we have now walked into.**
`smtp-vendor-selection.md` §2.4 excluded Postmark partly because it is a **Supabase** sub-processor,
and holding *"two independent relationships with the same company in two different roles"* was
correctly identified as a RoPA trap. **Supabase, Inc. is a sub-processor of Resend.** We hold a
direct operator relationship with Supabase (identity store, `compliance-review-supabase.md`) **and**
receive Supabase as a fourth-party through Resend. The RoPA must record Supabase **twice, in two
distinct roles**, or the register will silently imply one relationship where there are two with
different contractual paths. **C-R-7(b).** Not a lawfulness defect; a register-integrity defect of
exactly the kind §12 of the Brevo review warned would be rediscovered vendor by vendor.

**(c) Two named AI sub-processors, and a "Data analytics"/"Data warehouse"/"Product analytics"
cluster.** Anthropic and RunPod are named; Snowflake, Tinybird and Metabase describe an internal
analytics pipeline whose inputs are unspecified. **What is not published anywhere is whether customer
message content is an input to any of them, or whether they process only Resend's own account/usage
telemetry.** The DPA does not say. Brevo at least stated that AI features receive Input and Output
*including Content* — an ugly disclosure, but a disclosure. **Here we have names without scope.**
This is the successor to **C-12** and **C-5.4**, and I am extending it: **C-R-5**, standing and
effective immediately. **OI-R-2** records the unanswered scope question.

**(d) Stripe is a sub-processor for Resend's own billing.** It processes *our* card data as
Resend's customer, not our customers'. **PCI scope is unaffected** — recorded so it is not
misread as a payment flow when the payment gateway decision lands.

**Governance carry-over, and it is now urgent rather than tidy.** `compliance-review-supabase.md`
C-3's live residual — *"a 30-day notice regime with nobody reading the notices satisfies nothing"* —
now has a **third** instance, at a **shorter 14-day** window. Three unowned monitoring obligations
are not three times the monitoring; they are the same zero. **One role, one process, all vendors —
`integration-architect`, per §9 of the Brevo review. C-R-7(c).**

---

## 8. Content risk — the ranking has inverted since the Brevo review

The Brevo review was, correctly, a document about **credentials**: the token is the message, the
vendor retains the body, therefore token TTL × vendor retention is the whole risk calculation
(§5.2). That analysis **still holds unchanged** for Tier 1 and is re-issued as **C-R-4**.

But under Resend the **credential risk shrank** (30 fixed days, cannot grow to indefinite; token TTLs
already bounded well inside it) while the **content risk grew by an order of magnitude**, because
Tier 2 arrived without review. Ranked:

1. **Highest — a 30-day rolling window, in California, of theft-victimisation records.** Any customer
   with an active recovery case has, sitting in a third-party store, messages asserting that they
   were the victim of a crime involving a **named item** at a **knowable time**, with a **case
   reference**. Combined with `buildAssetCreated`'s valuables inventory and
   `buildNewDeviceLoginEmail`'s IP address, a compromise of our Resend account yields, per customer:
   *what they own, that it was stolen, roughly where they are, and a live reset link.* **No single
   template is alarming. The 30-day aggregate is.** This is the finding the vendor swap buried, and
   it is the reason C-R-3 blocks.
2. **High — the s26 boundary is one interpolation away** (§4.2(a)). `notes` free text; suspect data.
3. **High — precise geolocation is one product request away.** "Show the customer the last known
   location in the recovery email" is an obvious, sympathetic, well-intentioned feature request that
   would put crime-victim coordinates in a US processor. **Foreclosed now, cheaply, before anyone
   proposes it** — the same trick C-5.4 and C-9 used.
4. **Moderate — `ipAddress` in `buildNewDeviceLoginEmail`.** Genuinely justified as a security
   notification and I am **not** requiring its removal; a login alert without the IP is a worse
   security control. But it must be **inventoried as approximate location data** in the RoPA and the
   privacy notice, not silently treated as device telemetry.
5. **Lower — credential-in-transit**, per C-R-4.

---

## 9. Purpose limitation and notification preferences

`isEmailEnabled(prefs.channels, 'general' | 'billing' | 'theft_critical')` is checked before every
Tier 2 send, in all five services. **This is good, and it is better than the Brevo design had.** Two
compliance rulings on it:

**(a) The preference model must not be allowed to suppress Tier 1.** Verified: auth email runs
through the Supabase Edge Function and **does not consult `notificationPreferences` at all** — it
cannot be switched off by a user preference. **That is correct and must stay correct.** A customer
who mutes notifications must still receive password resets, or they lose the practical ability to
exercise **s23 access** and **s24 correction** rights over their own account. **C-R-6(a)** — the
surviving limb of C-5.5, restated for the architecture that actually exists.

**(b) `theft_critical` as a user-toggleable channel deserves a second look, but not from me alone.**
Whether a customer may opt out of theft-case emails is a product/safety judgement as much as a
privacy one. My ruling is narrow: **if it is user-suppressible, that is defensible** (data
minimisation cuts in favour of honouring the choice), **but the in-app record must remain complete**,
because the notification is not the record. Flagged to `product-manager`, not conditioned.

**(c) No marketing.** No template inspected is marketing. **CT-9's standing non-monetisation
constraint applies to this operator by its own terms.** Any marketing send introduces POPIA **s69**
opt-in obligations and an **s13** purpose-specification question, and is a **fresh review**.
**C-R-6(b).**

---

## 10. Breach notification

CT-3 (breach-notification runbook) is due **2026-09-12 — two days from today**. Resend adds four
requirements to it. **These are inputs to CT-3, not a separate runbook** — creating a second one
would repeat the exact register-fragmentation error §12 of the Brevo review identified.

1. **A third nested notification chain.** `Resend "without undue delay"` → **NextWave 48h (§19(b))**
   → **Client's s22 leg to the Regulator and data subjects.** The **outer bound of Resend's leg is
   unspecified in the DPA**, so our 48-hour budget must absorb an unknown. Structurally identical to
   the Supabase-48h chain CT-3 §3.2 already has to compress — **compress all three together, or the
   runbook will describe a timeline nobody can meet.**
2. **Severity is now content-driven, not settings-driven.** For Brevo, C-5.9 could say severity
   depends on two settings we control. Here there are no settings. **Resend-breach severity is a
   direct function of what §4.2 puts in message bodies** — which is the strongest possible argument
   for closing C-R-3 before production email rather than after.
3. **Account compromise is the likelier scenario, and it is now worse.** A stolen `RESEND_API_KEY`
   permits sending believable, reset-token-bearing mail **as this platform** — mass phishing against
   our own customers. **Additionally**, unlike SMTP credentials, an API key with dashboard scope may
   permit **reading the 30-day log**, converting a send-capability compromise into a **bulk
   disclosure** of the §8(1) aggregate. **Anomalous send-volume detection is currently owned by
   nobody.** `security-engineer` / `site-reliability-engineer`, tied to **FU-02(c)**.
4. **Escalation contact recorded before an incident, not during one** (BCM §4.6). Resend's published
   support channel is `support@resend.com`; **no dedicated security-incident contact was found.**
   `integration-architect` to obtain one. **OI-R-4.**

---

## 11. Consent and disclosure copy — this role's authority

**The approved Brevo copy at `compliance-review-smtp-vendor.md` §11 is WITHDRAWN. It is now false in
three respects** (it names Brevo; it asserts EU servers in France/Germany/Belgium; it states a
one-month retention). **It may not ship in any form.** If it has already been drafted into any
privacy-notice or marketing artefact, it must be pulled — `technical-writer`, `ui-designer`.

**Approved replacement (final strings still require the §9.2 copy pass):**

> **Sending you emails.** When we send you a verification link, a password-reset link, an invitation
> to a staff account, or an update about your policy, your registered items or a theft report, we use
> **Resend**, an email delivery service. Resend receives your email address and the full contents of
> that message — which may include the name of an item you have registered and the reference number
> of a theft or recovery case. Resend is a **United States** company and stores this information on
> servers in the **United States**, not in South Africa, where it keeps a copy for about **30 days**
> before deleting it. Resend uses its own service providers, all of them in the United States, who
> are bound through our agreement with Resend. We have a written data-protection agreement with
> Resend requiring it to protect your information to a standard comparable to South African law.

**Six binding constraints:**

1. **The three §9.3 prohibitions apply unchanged**: no cross-border consent checkbox (§5.3); no claim
   that data stays in South Africa; no placeholder region string in production (same CI check).
2. **"About 30 days" is deliberately hedged.** The figure is a vendor security-page statement, not a
   contractual term (§6, OI-R-1). Do not state it as an exact guarantee.
3. **Resend may not be described as European, and the Irish governing law may not be cited to imply
   it.** Naming a Californian company with an Irish-law contract as "European" is precisely the
   false-transborder-statement failure §9.3(2) prohibits.
4. **The message-content sentence is mandatory, not optional polish.** Per this role's standing
   practice, plain-language specificity beats boilerplate: a customer must be able to understand that
   *the fact of their theft report* leaves the country, not merely "their data". Cutting that clause
   for brevity is a compliance regression and requires my counter-sign.
5. **`ipAddress` must be disclosed** wherever the notice inventories what is collected on login —
   as approximate location information, per §8(4).
6. **Do not name Resend at signup** unless Supabase gets the same treatment. §9.2 put the
   identity-store disclosure above the fold because it is the platform's most sensitive non-location
   dataset; the email operator belongs in the expanded notice. **Compliance copy that buries nothing
   still must not drown the important disclosure in the unimportant one** — `ux-researcher`,
   `ui-designer`.

---

## 12. Conditions

Numbered **C-R-n** (Resend) to avoid collision with C-5.x (Brevo), C-011-n, and CT-n. Markers:
**[BLOCK]** blocks production email delivery · **[PRE-PROD]** before real customer PII at scale ·
**[STANDING]** effective immediately.

| ID | Condition | Owner (A) | Blocks |
|---|---|---|---|
| **C-R-1** | **Evidence the DPA is in force, and file it.** Resend's DPA is click-accept, so there is **no signature artefact** — the required evidence is (i) a dated screenshot/export of the account's legal/DPA status, (ii) the **account owner entity and plan**, (iii) the DPA version accepted. Plus **`cybersecurity-architect` confirmation** that both call sites use HTTPS/TLS 1.2+ with certificate verification (they use `fetch()` to `https://api.resend.com` — expected trivially satisfied, but confirmed, not assumed). Without this, **s21 is uncontracted and s72(1)(a) has no basis.** | `cto` / owner (evidence); `compliance-specialist` (file + verify); `cybersecurity-architect` (TLS) | **[BLOCK]** |
| **C-R-2** | **Record Resend's retention as a *vendor-stated, non-configurable* 30 days**, with the 7-day backup tail and 90-day post-termination deletion, in the RoPA — flagged as **not contractually committed** (OI-R-1). If Resend ever publishes a longer figure, this review reopens. | `compliance-specialist` | **[PRE-PROD]** |
| **C-R-3** | **Email-content boundary — the platform's only retention control (§6, §8).** **(a)** No email template may interpolate: `recovery_cases.notes` or any free-text field capable of carrying third-party suspect data (s26(b)); `sapsCaseNumber`, `reportingStation`, or `reportedToPoliceAt`; **any GPS coordinate, address, or last-known-location string**; any ID number; any payment-instrument data. **(b)** Resend's logs and delivery events may **never** be cited as satisfying FR-12 audit logging, the 12-month retention policy, insurance recordkeeping floors, or any evidentiary obligation to the Regulator — `app.account_audit_log` is the record of authority, and the **fact** of a send is logged there **without the token or token-bearing URL**. **(c)** Any **new** template, or any change adding a field to an existing one, requires my review at Stage 8 — the template layer is now a compliance surface. | `backend-engineer` + `notification-engineer` (enforce); `compliance-specialist` (boundary) | **[BLOCK]** (a); **[STANDING]** (b), (c) |
| **C-R-4** | **Token lifetimes short relative to the 30-day fixed window** (re-issue of C-5.3, unchanged). Single-use consumption invalidates **server-side immediately**. Recommended ceilings, departure requiring written justification and my counter-sign: **reset ≤ 60 min; verification ≤ 24 h; privileged-role invitation ≤ 72 h**. | `authentication-engineer` + `cybersecurity-architect` (values); `compliance-specialist` (requirement) | **[PRE-PROD]** |
| **C-R-5** | **No Resend AI feature enabled on this account**, and no auth or domain email content, template, recipient list or log submitted to one. Resend names **Anthropic, PBC** and **RunPod, Inc.** as AI sub-processors and does not publish what they receive (OI-R-2). Shaped like **C-12** and **C-5.4**; same species of risk, now with named recipients. | `notification-engineer` / `security-engineer` (enforce); `compliance-specialist` (prohibition) | **[STANDING]** |
| **C-R-6** | **Purpose limitation.** **(a)** Auth email (FR-3/FR-6/FR-7/FR-15) must remain **outside** the `notificationPreferences` suppression path and must carry **no list-unsubscribe** — an unsubscribe that suppresses password reset locks a data subject out of their own account and degrades s23/s24 exercise. **(b)** No marketing send on this account; any marketing use engages **s69** and **s13** and is a fresh review (**CT-9** applies by its own terms). **(c)** When payments are built, **no payment-instrument data in any email body**; receipt/invoice templates are a fresh review, not a new template. | `notification-engineer` (config); `compliance-specialist` (purpose limitation) | **[STANDING]** |
| **C-R-7** | **Record correction (§5.2, §7).** **(a)** Mark `smtp-vendor-selection.md` §2.1/§4.1 and `compliance-review-smtp-vendor.md` as **superseded on vendor** — the EU-domicile reasoning does not describe the shipped operator; the s72 statutory limb is **unavailable**. **(b)** Add Resend to the **existing** RoPA (C-8 / INC-001-C-10) — **not a separate register** — with: counterparty (Plus Five Five, Inc., California); US-only processing; the 22-entry sub-processor list with its 27 Aug 2026 date; **Supabase recorded twice, in two distinct roles** (direct operator + Resend fourth-party); 30-day retention (uncommitted) + 7-day backups + 90-day termination tail; the 14-day change-notice term; the §4.2 two-tier PI inventory including `ipAddress`; the C-R-5 AI prohibition; and the security-escalation contact. **(c)** Fold Resend's 14-day notice into the **single** cross-vendor sub-processor-change monitoring process (Supabase 30d / Brevo unknown / Resend 14d) rather than creating a third orphan. **(d)** Replace the §11 privacy-notice copy. | `compliance-specialist` (a, b, d); `integration-architect` (c) | **[PRE-PROD]** |
| **C-R-8** | **Remove or disarm the dead Brevo path.** `backend/src/lib/transactional-email.ts` posts to `api.brevo.com` and has **no production caller** — but `BREVO_API_KEY` is still parsed at `backend/src/config/env.ts:304`, so setting one environment variable would activate a **second, un-onboarded operator** with no DPA, no RoPA entry, and no CT-1 consent, silently. Delete the module and the env var, or gate it behind an explicit feature flag with a comment citing this condition. | `backend-engineer`; verified `security-engineer` | **[PRE-PROD]** |
| **C-R-9** | **CT-7 limb 2 — restated, still open.** Replace the consumer-webmail address at `backend/src/lib/email-footer.ts:44` (`td.itsolution60@gmail.com`) with a domain address before it is published as the s18 notice contact or the s23/s24 data-subject-request channel. **It is currently rendered in the footer of every domain notification email**, i.e. it is already the de facto published contact. Routing data-subject requests through Google's consumer webmail adds a further **undocumented operator** processing rights requests. | `integration-architect` + owner | **[BLOCK]** |

**Interaction with existing conditions.** **CT-1** (§19(c) Client consent to cross-border processing,
itemising Resend) is **unmet** and blocks production email independently of everything above — this
review supplies its equivalent-protection evidence for the Resend line item but does **not** close it.
**CT-3** (breach runbook, due 2026-09-12) takes §10 as input. **CT-4** (documented Client
instructions) must cover email dispatch. **C-011-7** (GDPR reopening trigger) is not duplicated.

---

## 13. Open items

| ID | Open item | Who can answer | Consequence if unanswered |
|---|---|---|---|
| **OI-R-1** | **Whether the 30-day email/log retention is contractually committed anywhere.** It appears on the security page; the privacy policy is silent; the DPA does not state it. | Resend, on request; or a plan/contract term | The §11 copy must stay hedged ("about 30 days"). A unilateral change to a longer period would be an unnoticed s14 regression. |
| **OI-R-2** | **Whether customer message content is an input to Anthropic, RunPod, Snowflake, Tinybird or Metabase**, or whether those process only Resend's own account telemetry. Names are published; **scope is not.** | Resend, on request | **C-R-5 stays a blanket prohibition** rather than a scoped one. The RoPA must record "scope not published" — **do not infer that content is excluded.** |
| **OI-R-3** | **Whether Resend offers any non-US data residency**, and whether the security page's *"data is held in the United States regardless of the sending region selected"* is accurate. **Region docs returned 404 on three paths; web search was unavailable this session.** Single-sourced. | Resend docs / support; retry when search is available | If a **South African or EU** residency option exists, the s72 posture improves materially and this review should be revisited. **Do not assume it does not exist merely because I could not reach the page.** |
| **OI-R-4** | **Resend's security-incident escalation contact and any bounded notification timeline.** DPA says only "without undue delay"; only `support@resend.com` is published. | `integration-architect` → Resend | CT-3's nested-chain compression is built on an unknown outer bound. |
| **OI-R-5** | **Which Resend plan the account is on, who owns it, and whether the DPA has in fact been accepted.** No account artefact exists in this repository. | **Owner with Resend account access only** | **C-R-1 cannot close.** §14. |

---

## 14. What I could not determine from this environment

Stated plainly, per `compliance-review-smtp-vendor.md` §1's standard.

**I cannot confirm that Resend's DPA is actually in force for this platform.** Because it is
click-accept rather than signed, there is no counter-signed instrument to look for, and no artefact in
this repository evidences that a Resend account exists at all, who owns it, or which plan it is on.
`resend-setup.md` §1 is written in the imperative ("Create an account at resend.com"), which reads
like an instruction not yet carried out. Everything in §5 is an analysis of the DPA **as published**;
whether we are party to it is **OI-R-5**, and only the owner can answer it.

Consequently: **§5.3's s72(1)(a) ruling is conditional in a way that no amount of further desk
research can discharge.** If no account exists, nothing has flowed yet and the position is clean
prospectively. If an account exists and has been used against real addresses, then email has been
flowing to an unreviewed operator, without evidenced s21 contract cover and outside CT-1's unmet
§19(c) consent — which would be a **live contravention requiring assessment**, not a paperwork gap.
**I am not able to tell which of those two worlds we are in from inside this repository, and I am not
going to guess.** Owner answer required.

---

## 15. Sign-off

**Resend (Plus Five Five, Inc.) is APPROVED WITH CONDITIONS as transactional email
operator/sub-operator for Features 001 and 007.**

- **Blocking production email delivery:** **C-R-1**, **C-R-3(a)**, **C-R-9**, and — independently and
  contractually — **CT-1**.
- **CT-7 limb 1 is discharged by this document.** **CT-7 limb 2 remains open as C-R-9.**
- **`compliance-review-smtp-vendor.md` is superseded as the operative email-operator review**; its
  method and its C-5.3/C-5.4/C-5.8 substance survive as C-R-4/C-R-5/C-R-3(b).
- **This is not a Stage 8 gate sign-off for any feature.** Stage 8 requires
  `cybersecurity-architect` and `security-engineer` alongside me.

**Recommended next actions, in order:** owner answers **OI-R-5** (does the account exist, and has
email already been sent to real addresses?) → **C-R-3(a)** template audit, which is engineering work
needing no external input and closes the largest risk → **C-R-8** dead-Brevo removal → **C-R-9**
footer contact → **C-R-1** evidence → **CT-1** Client consent.

**Reassessment triggers:** any new email template or field addition (C-R-3(c)) · Resend publishing a
non-US residency option (OI-R-3) · any change to the 27 Aug 2026 sub-processor list · an EU-resident
customer being onboarded (C-011-7) · the payment gateway decision landing (C-R-6(c)).

**Sources consulted (first-party, 2026-09-10):** `resend.com/legal/dpa` · `resend.com/legal/subprocessors`
(Last Updated 27 August 2026) · `resend.com/security` · `resend.com/legal/privacy-policy`.
