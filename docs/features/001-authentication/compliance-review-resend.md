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

---
---

# Appendix A — C-R-3(a) template-content audit (executed 2026-09-10)

**Owner:** `compliance-specialist` · **Appended, not substituted** — §§0–15 above stand unamended.
**Status of C-R-3(a): PARTIALLY DISCHARGED.** Its four **prohibitions** (§A.4) are **verified clean
across all 28 rendered bodies** and are hereby **closed as a factual matter**, standing forward as
C-R-3(c). Its **proportionality limb** — the question §3 of the CTO addendum actually asked, and
which the original condition did not itself pose — is **not** clean: **8 of 28 templates disclose
more than their purpose requires**, and they are exactly the theft/recovery family §8(1) ranked
highest. Those 8 are **[BLOCK]-carrying until rewritten**; the rewrite copy is at §A.6.

**Method.** Every rendered body read in source, not sampled: `backend/src/lib/domain-email-templates.ts`
(21 builders), `supabase/functions/auth-send-email/templates/` (7 action types), plus the two shared
chrome modules (`backend/src/lib/email-footer.ts`, `supabase/functions/auth-send-email/templates/{signature,disclaimer}.ts`).
Every interpolated parameter traced to its **call site** — the five `*-notification-service.ts` files
and, where the value is derived rather than passed through, to the function that derives it
(`backend/src/lib/asset-change-summary.ts`, `policy-notification-service.ts` `formatAmount`/`formatDate`,
`recovery-notification-service.ts` `statusLabel`). A field is only "safe" if the *deriving* code cannot
emit free text; a parameter name is not evidence.

---

## A.1 Inventory — 28 rendered bodies, all wired, none orphaned

§4.2's "roughly twenty" is now exact: **21** domain builders + **7** auth action types.

**Tier 1 — `supabase/functions/auth-send-email/templates/index.ts` (7):** `signup` · `recovery` ·
`invite` · `magiclink` · `email_change` · `reauthentication` · `default` fallback.

**Tier 2 — `domain-email-templates.ts` (21), each traced to its sender:**

| Sender | Builders |
|---|---|
| `customer-notification-service.ts` (6) | `buildPolicyCreatedEmail`, `buildPolicyPendingActivationEmail`, `buildAssetCreatedEmail`, `buildAssetUpdatedEmail`, `buildAssetRemovedEmail`, `buildAssetRecoveredEmail` |
| `auth-notification-service.ts` (6) | `buildPasswordChangedEmail`, `buildNewDeviceLoginEmail`, `buildMfaEnabledEmail`, `buildAccountLockedEmail`, `buildPushTokenReregisteredAlertEmail`, `buildEmailAlreadyVerifiedEmail` |
| `recovery-notification-service.ts` (5) | `buildTheftReportSubmittedEmail`, `buildRecoveryCaseAssignedEmail`, `buildRecoveryCaseUpdateEmail`, `buildRecoverySuccessfulEmail`, `buildRecoveryCaseClosedEmail` |
| `policy-notification-service.ts` (2) | `buildPolicyActivatedEmail`, `buildPolicyRenewalUpcomingEmail` |
| `onboarding-notification-service.ts` (2) | `buildWelcomeEmail`, `buildOnboardingIncompleteEmail` |

**21 of 21 are reachable from a live sender.** There is no dead template to descope, and no sender
constructing HTML outside these modules — checked by grepping every `sendResendEmail` call site: all
23 pass a `{subject, html}` produced by one of the builders above.

---

## A.2 What is actually disclosed — the field-level matrix

Cross-referenced against the handling rules already set by
[`compliance-review-notifications.md`](../007-notifications/compliance-review-notifications.md) §2,
which is the operative data-type table for this channel and which **nothing in the shipped templates
violates on its own terms**.

| Field | Where it appears | Source / derivation | F-007 §2 rule | Verdict |
|---|---|---|---|---|
| Email address | recipient header, all 28 | `account.email`; `buildEmailAlreadyVerifiedEmail` uses `normalizedEmail`, which `routes/auth.ts:289–308` resolves from the **Supabase user id**, so it cannot be a third party's address | Allowed | OK |
| **Customer name** | **nowhere — no template greets the recipient by name** | — | "Minimum necessary" | **OK, and better than the rule requires.** Recorded deliberately: do **not** "improve" these with a `Hi {firstName}` pass. See §A.7(3). |
| Single-use token / token-bearing URL | Tier 1 body ×2 (button + copy-link fallback) | Supabase GoTrue | AUTH-005 | OK — governed by C-R-4, not by content |
| **OTP verification code** | `reauthentication` body **and, until today, its preheader** | GoTrue `otpToken` | "OTP only in AUTH-005" | **DEFECT — FIXED IN THIS PASS.** §A.5 |
| Plan name / tier | 4 policy templates | `policy.planTier` (enum) | Policy numbers allowed | OK |
| Policy id | 4 policy templates, as "Reference:" | Mongo ObjectId | Allowed | OK — see §A.7(2) |
| Renewal date, effective date | 2 templates | `toLocaleDateString('en-ZA')` | Allowed | OK |
| **Premium amount** | `buildPolicyRenewalUpcomingEmail` | `Intl.NumberFormat` over `policy.billing.amount` | "Payment amounts: allowed" | OK. **Re-confirms §3: currency amount, no instrument. PCI scope remains nil.** |
| **Asset display name** | 6 templates + 5 subject lines | `asset.displayName` — **customer-authored free text** | Minimum necessary | **OK in body; NOT ok in subject/preheader for the theft family.** §A.6 |
| Asset type | `buildAssetCreatedEmail` only | enum, `_`→space | — | **Minimise — recommended removal.** §A.6(C) |
| Change summary | `buildAssetUpdatedEmail` | **`summarizeMaterialAssetChanges()` emits only the fixed labels `name`, `estimated value`, `asset details`** — field *names*, never field *values* | — | **OK, and materially safer than its parameter name suggests.** No serial number, no valuation, no plate can reach this string. |
| **Serial number / IMEI / plate** | **nowhere** | — | — | **OK.** Answering the CTO's §3 question directly: **no theft-report confirmation restates a serial number**, because no template touches `asset.details` at all. |
| **`ipAddress`** | `buildNewDeviceLoginEmail` body | `req` ip | "Last seen (city/region): caution" | **KEEP** — §8(4) ruling unchanged; RoPA/notice obligation under C-R-7(b) and §11 constraint 5 |
| Device name | `buildNewDeviceLoginEmail` | client-supplied, defaults `'Unknown device'` | — | OK |
| **Case `referenceNumber`** | 6 templates — **in body, subject AND preheader** | recovery case | Claim numbers allowed | **Body OK. Subject + preheader: DISPROPORTIONATE.** §A.6 |
| Case `statusLabel` | `buildRecoveryCaseUpdateEmail` | **`statusLabel()` — closed switch over 4 enum values + `'Updated'` default.** Cannot emit free text | — | **OK.** The status label is safe *by construction*, which is the finding that keeps the "case narrative" question narrow. |
| **`caseId`** | **nowhere in any body** | passed to `buildTheftReportSubmittedEmail`, **never interpolated** | — | OK — §A.7(1) |
| Director name, office address, landlines, company reg. no. | all 28, in signature/footer | `EMAIL_BRAND` / `EMAIL_COLORS` constants | — | OK — business contact information of a company officer, not data-subject PI |
| **`td.itsolution60@gmail.com`** | **all 28** | `email-footer.ts:44` **and `brand.ts:46`** | — | **C-R-9 — scope wider than recorded.** §A.8 |

---

## A.3 The three questions the addendum posed, answered directly

**(a) "Does a recovery-case-update email need the full case narrative, or just 'log in to view it'?"**
**Neither, on the facts.** There is no narrative to remove: `buildRecoveryCaseUpdateEmail` carries a
five-value enum label, not prose, and **`recovery_cases.notes` is not interpolated anywhere** — §4.2(b)'s
boundary holds, verified line by line today. The disproportion is **not in the body**; it is that the
**subject line and preheader** broadcast `Recovery update — {referenceNumber}` and
`Update on case {ref}: {status}` into every inbox preview, lock-screen banner and mail-gateway log.
**Ruling: keep the body, neutralise the subject and preheader.**

**(b) "Does a theft-report confirmation need to restate the asset's serial number?"**
**It does not restate it, and never has.** No template reads `asset.details`. The serial-number risk
the question anticipated is **absent** — record that as a genuine negative finding, not as an oversight
that happened to work out: `buildTheftReportSubmittedEmail`'s parameter list stops at
`{assetName, referenceNumber, caseId}`.

**(c) Is the aggregate proportionate?** For the theft/recovery family, **no — in the subject line.**
The purpose of these six sends is *"something happened on your case; open the app."* That purpose is
fully served without putting **"Theft report received"** and a case reference on a phone's lock screen,
where it is legible to anyone in the room, and into Resend's 30-day US store **in the message metadata
that is most durably indexed and most visible in a dashboard listing**. A body is one click deep in a
compromised inbox; a subject line is the compromise's index. **This is the whole of §8(1)'s "30-day
aggregate" risk, concentrated in the field we control most cheaply.**

---

## A.4 The four C-R-3(a) prohibitions — verified, clean, closed as fact

Re-verified by exhaustive read, not by grep alone:

| Prohibition | Result |
|---|---|
| `recovery_cases.notes` / any free-text field carrying third-party suspect data (s26(b)) | **CLEAN.** Not interpolated. The two fields that *look* like free text (`changedSummary`, `statusLabel`) are both **closed-vocabulary derivations** — verified in `asset-change-summary.ts` and `recovery-notification-service.ts:67–80`. |
| `sapsCaseNumber` / `reportingStation` / `reportedToPoliceAt` | **CLEAN.** Absent from every builder signature. |
| **Any GPS coordinate, address or last-known-location string** | **CLEAN.** No template imports from any location module; no `lastLocation`, no coordinate, no city. §8(3)'s foreclosure holds. |
| ID number / payment-instrument data | **CLEAN.** No `idNumber`/`idNumberLast4`; the only financial value is a formatted currency amount. |

**s26 special personal information: none present.** The §4.3 boundary is intact. **C-R-3(a)'s
prohibition limb is discharged on evidence and converts to standing surveillance under C-R-3(c).**

---

## A.5 Defect fixed in this pass (1)

**`supabase/functions/auth-send-email/templates/reauthentication.ts` — OTP in the preheader.**

Before: `preheader: \`Your verification code is ${escapeHtml(token)}.\`` — the live re-authentication
code rendered into the hidden preview span, i.e. into **inbox list previews and lock-screen notification
banners**, and into any preview-generating intermediary between GoTrue and the recipient's screen.
A step-up credential displayed on a locked device defeats the possession factor it exists to prove,
and it is a disclosure with **no purpose whatsoever** — the code is already in the body, one tap away.

**Changed to** a constant string, with the reasoning inline; the now-unused `escapeHtml` import was
dropped in the same edit. `renderOtpBox()` escapes internally (`helpers.ts:13`), so body rendering is
unaffected. **No test asserts on any preheader or on this subject line** (checked repo-wide), and the
Edge Function has no test suite, so this is behaviourally inert beyond the intended change. This met
the "trivial and unambiguous" bar the tasking set; **everything in §A.6 did not, and was not touched.**

---

## A.6 Rewrites required — 8 templates, for `notification-engineer` / `backend-engineer`

Copy is **approved as written** under this role's §11 authority. Implement verbatim or come back to me.
**No recordkeeping counter-argument survives here**, and I checked before assuming minimisation wins:
`compliance-review-saps-case-data.md` §5 attaches its five-year floor to *the record*, and §3 of this
review already ruled Resend's copy a **transmission artefact, not the record of authority**. Shortening
an email creates **no** recordkeeping shortfall. Precedent examined and found not to apply.

**(A) Theft/recovery family — 6 templates. Subject + preheader only. Bodies unchanged.**

| Builder | Subject now | **Subject required** | **Preheader required** |
|---|---|---|---|
| `buildTheftReportSubmittedEmail` | `Theft report received — {ref}` | `Your report has been received — TD IT Solution Insurance` | `We have received your report. Open the app for details.` |
| `buildRecoveryCaseAssignedEmail` | `Recovery partner assigned — {ref}` | `Update on your case — TD IT Solution Insurance` | `There is an update on your case. Open the app for details.` |
| `buildRecoveryCaseUpdateEmail` | `Recovery update — {ref}` | `Update on your case — TD IT Solution Insurance` | `There is an update on your case. Open the app for details.` |
| `buildRecoverySuccessfulEmail` | `Asset recovered — {ref}` | `Good news about your case — TD IT Solution Insurance` | `There is an update on your case. Open the app for details.` |
| `buildRecoveryCaseClosedEmail` | `Case closed — {ref}` | `Your case has been closed — TD IT Solution Insurance` | `Your case has been closed. Open the app for details.` |
| `buildAssetRecoveredEmail` | `Asset recovered — {assetName}` | `Good news about your registered item — TD IT Solution Insurance` | `There is an update on one of your registered items.` |

**Rule, stated so it generalises:** *no case reference and no asset name in the `subject` or `preheader`
of any theft-, recovery- or claim-related email.* Both fields stay in the **body**, where they are
genuinely useful — a customer phoning support needs the reference, and a customer with four registered
items needs to know which one. That is proportionate. Putting the same strings on a lock screen is not.

**(B) `buildRecoveryCaseUpdateEmail` — body, optional but recommended.** The `statusLabel` is safe
today only because `statusLabel()` is a closed switch. If `RecoveryCaseStatus` ever gains a
free-text-adjacent member, this template becomes the s26 leak §4.2(b) warns about **silently**. Either
keep the switch exhaustive with a `never` guard, or drop the label and let the body read
*"Your recovery case for **{assetName}** has been updated."* **My preference is the `never` guard** —
it keeps a useful notification useful and makes the next contributor's mistake a compile error.
`backend-engineer`'s call; either satisfies me.

**(C) `buildAssetCreatedEmail` — remove `assetType` from the body.** Currently
*"**{assetName}** ({assetType}) has been registered."* The customer just typed the name; the
parenthetical tells them nothing they do not know, and it adds a **machine-parseable category** to
§8(1)'s aggregate — turning a 30-day window of item names into a 30-day window of *classified* item
names. Replace with *"**{assetName}** has been registered on your account."* Drop the now-unused
parameter. **Low severity, zero cost, and it is the difference between a list and a sortable list.**

**(D) `buildAssetCreatedEmail` / `buildAssetUpdatedEmail` — subject lines carry `{assetName}`.**
Unlike (A), I am **not** requiring removal: an item-registration confirmation is not a victimisation
disclosure, and the name aids recognition against phishing. **Fine as-is.** Recorded so the (A) rule is
not over-generalised into every template by a well-meaning implementer.

---

## A.7 Hygiene findings — no disclosure today, flagged so they stay that way

1. **Three parameters are accepted and never rendered:** `caseId` (`buildTheftReportSubmittedEmail`),
   `assetId` (`buildAssetCreatedEmail`, `buildAssetUpdatedEmail`). **This is currently a safety
   property** — the identifiers reach the template layer and stop there. It is also a standing
   invitation: the next contributor adding a line to one of these bodies has an unused id in scope and
   no signal that using it is prohibited. **Remove them from the signatures** (callers pass them for
   the push payload, which is a different and separately-governed surface). Cheap, and it converts an
   accident-of-restraint into a structural one.
2. **"Reference: {policyId}" is a Mongo ObjectId, not a customer-facing policy number.** Not a
   compliance defect — it is the customer's own identifier and discloses nothing about them. Noted for
   `product-manager`: when a human-readable policy number exists, use it; an ObjectId in a customer
   email is a usability defect wearing a compliance-adjacent costume, and I am **not** conditioning it.
3. **No template personalises with the recipient's name.** Deliberately recorded as a **minimisation
   property to preserve**. Any future "warm up the emails" copy pass adds identity PII to all 28 bodies
   at once and requires my review under C-R-3(c).

---

## A.8 C-R-9 cross-reference — scope confirmed, and it is wider than C-R-9 states

Confirmed as asked, without re-auditing the finding itself. **The consumer Gmail address appears on
all 28 rendered bodies**, via **two independent constants in two separate deployment units**:

- `backend/src/lib/email-footer.ts:44` — the Tier 2 domain signature (**the address C-R-9 names**);
- **`supabase/functions/auth-send-email/templates/brand.ts:46`** (`EMAIL_BRAND.email`), rendered by
  `templates/signature.ts:30` on **every Tier 1 auth email** — **not named in C-R-9.**

**C-R-9 is hereby restated as covering both call sites.** Fixing only `email-footer.ts` would leave the
consumer-webmail address published on the *verification and password-reset* mail — the highest-volume
first-contact surface on the platform, and the one a data subject is most likely to reply to. The
Supabase Edge Function is a **separate deploy**, so this is two changes and two deployments, not one.
`integration-architect` + owner, unchanged ownership, **[BLOCK]** unchanged.

---

## A.9 One item I cannot rule on alone — `buildOnboardingIncompleteEmail` (ONB-002)

**This partially corrects §3 and §9(c) of the main review**, which state flatly that no template is
marketing. On a closer read of the copy and its trigger, that is too confident.

**The facts:** fired at 24h and 72h after signup, **only where `policyCount === 0`**, capped at two
sends (`onboarding-notification-service.ts:63–96`). Copy: *"You have not added a protection policy yet.
It only takes a few minutes to **choose a plan** and register your first asset."*

**The tension.** POPIA **s69** governs electronic communication *for the purpose of direct marketing* —
promoting or offering to supply goods or services. This send promotes the purchase of a plan **to a
person who has not purchased one**. The **s69(3)** existing-customer accommodation is unavailable on
its face: it requires details obtained *"in the context of the sale of a product or service"*, and no
sale has occurred. The counter-argument is real and I think stronger — the data subject **initiated**
this signup, the message completes a journey they started, and treating every "finish setting up" nudge
as direct marketing would make onboarding impossible — but it is a **judgement about the character of a
product communication**, and §9(b)'s discipline applies: I do not decide product/safety-shaped questions
alone.

**Interim ruling, effective now, so nothing is blocked:** **it may continue as transactional**, on the
existing basis, **provided** (i) the cap stays at two, (ii) it remains gated on `policyCount === 0`,
and (iii) the copy is **not** extended toward promotional content — no pricing, no discount, no
urgency, no third-party offer. **Any one of those changes converts it to s69 direct marketing requiring
prior opt-in, and is a fresh review under C-R-6(b).** `product-manager` to confirm the characterisation
with me before Sprint 4. **Not a blocker; a correction to my own record.**

---

## A.10 Disposition summary — all 28

| Disposition | Count | Templates |
|---|---|---|
| **Fine as-is** | **19** | Tier 1: `signup`, `recovery`, `invite`, `magiclink`, `email_change`, `default` (6). Tier 2: `buildPolicyCreatedEmail`, `buildPolicyPendingActivationEmail`, `buildPolicyActivatedEmail`, `buildPolicyRenewalUpcomingEmail`, `buildAssetUpdatedEmail`, `buildAssetRemovedEmail`, `buildPasswordChangedEmail`, `buildMfaEnabledEmail`, `buildAccountLockedEmail`, `buildNewDeviceLoginEmail` (keep the IP — §8(4)), `buildWelcomeEmail`, `buildEmailAlreadyVerifiedEmail`, **`buildPushTokenReregisteredAlertEmail`** (13) |
| **Fixed in this pass** | **1** | `reauthentication` — §A.5 |
| **Minimise: rewrite copy supplied** | **7** | The 6 theft/recovery templates (subject + preheader) + `buildAssetCreatedEmail` (drop `assetType`) — §A.6 |
| **Needs a ruling I will not make alone** | **1** | `buildOnboardingIncompleteEmail` — §A.9 |

**`buildPushTokenReregisteredAlertEmail` is the model.** Its source comment states *"Deliberately says
nothing about who registered it — no other account's identifying information belongs in this email."*
That is the reasoning §A.6 asks for on six other templates, already applied unprompted by whoever wrote
it under SR-007-2. **Cite it in review, not this appendix.**

---

## A.11 Effect on the conditions

- **C-R-3(a): PARTIALLY DISCHARGED.** Prohibition limb **closed on evidence** (§A.4). Proportionality
  limb **remains [BLOCK]** until §A.6's 7 rewrites land. **The block is now precisely scoped to a named
  copy change in one file** — `backend/src/lib/domain-email-templates.ts` — rather than to an
  unbounded "audit the templates." That is the cheap unblock the addendum asked for, delivered as a
  work item rather than a warning.
- **C-R-3(c) is now live and load-bearing**, and its subject-line rule is explicit (§A.6(A)).
- **C-R-9: scope expanded to `brand.ts:46`** (§A.8). Two deploys, not one. Still **[BLOCK]**.
- **C-R-4** unaffected in substance; §A.5 removes an OTP exposure that sat *outside* the TTL analysis
  entirely — a reminder that C-R-4's arithmetic assumes the credential is only where we think it is.
- **C-R-6(b)** acquires §A.9 as an open characterisation question.
- **§3's PCI-DSS row re-verified at field level: scope remains nil.**
- **Nothing here discharges C-R-1, CT-1 or OI-R-5.** Production email stays blocked on the owner.

**Reassessment trigger added:** any change to `summarizeMaterialAssetChanges()`, `statusLabel()`, or
`RecoveryCaseStatus` — three closed vocabularies that this audit's "clean" finding **depends on** and
that no compliance document previously named.

---
---

## A.12 Product ruling — `buildOnboardingIncompleteEmail` (ONB-002) is characterised as MARKETING

**Owner:** `product-manager` · **Appended 2026-09-10, in response to §A.9's referral.** `compliance-specialist`'s
interim transactional treatment stands until this ruling; this section resolves the characterisation
question §A.9 declined to settle alone and hands the compliance mechanics back to `compliance-specialist`
to formalise. **§§0–15 and Appendix A.1–A.11 stand unamended.**

### A.12.1 What the email actually does

Read at source (`backend/src/lib/domain-email-templates.ts:371–389`,
`backend/src/lib/onboarding-notification-service.ts:63–96`): fires at 24h and 72h after account
creation, **only** where `policyCount === 0`, capped at two sends. Copy: *"You have not added a
protection policy yet. It only takes a few minutes to **choose a plan** and register your first
asset."* CTA: *"Continue onboarding"* → the marketing site root URL, not a specific in-progress form.

### A.12.2 Ruling: MARKETING, not transactional

**This is a direct-marketing communication under POPIA s69, not a service email.** Reasoning:

1. **The recipient has no existing service relationship for this email to "service."** Every other
   Tier 1/Tier 2 template either completes an action the recipient is *mid-transaction* on
   (verification, reset, invitation — all carrying a credential the recipient cannot get anywhere
   else) or reports on a **contract that already exists** (policy activation, renewal, asset change,
   theft/recovery status). `buildOnboardingIncompleteEmail` does neither: `policyCount === 0` is, by
   construction, the state of someone who has **not yet bought anything**. There is no policy to
   service, no in-flight form submission being resumed, no credential to deliver. The only thing the
   email "completes" is a sale that has not happened.
2. **The copy's operative instruction is an acquisition CTA, not a status update.** "Choose a plan and
   register your first asset" is not "here is a link to the page you were already on" — it is an
   imperative to make a purchase decision. That is precisely POPIA s69's "direct or indirect… promoting
   or offering to supply, in the ordinary course of business, any goods or services," which the Act
   reads broadly and does not carve out for a business's own product being promoted to its own
   prospective customer.
3. **The s69(3) existing-customer accommodation is unavailable on the facts, and that is the exemption
   this email would need.** `compliance-specialist` already found this at §A.9: no sale has occurred,
   so contact details were not obtained "in the context of the sale of a product or service" in the
   sense s69(3)(a) requires. Absent that exemption, s69 defaults to requiring **prior consent**, which
   this send does not currently have.
4. **The "they initiated this" argument proves too much if accepted as stated.** Nearly every
   direct-marketing send in existence can be redescribed as "completing a journey the recipient
   started" — that is what a sales funnel is. Accepting initiation-alone as sufficient to make a
   purchase-nudge transactional would let any post-signup, pre-purchase engagement email in this
   platform's history self-certify as non-marketing merely by timing its trigger off account creation
   rather than off a marketing list. That is not a standard this role can adopt without eroding s69 to
   nothing for every SaaS-shaped onboarding funnel — including this one's own future re-engagement,
   win-back, and upsell sends, which will want exactly this same argument. **A rule that cannot
   distinguish this email from a Sprint-6 "you haven't upgraded to Plus, here's why you should" email is
   not doing the work a characterisation ruling needs to do.**
5. **What distinguishes it from the templates that are genuinely fine.** `buildWelcomeEmail` (ONB-001)
   is not caught by this ruling — it has no purchase CTA and fires once, unconditionally, as a pure
   account-creation acknowledgement. Neither is `buildPolicyRenewalUpcomingEmail`, which services an
   **existing** contract. The line this ruling draws is narrow and specific: **an email is marketing
   when its trigger condition is "no purchase yet" and its content asks the recipient to purchase** —
   not every onboarding-adjacent or re-engagement-adjacent send.

**This overrules the interim position at §3 and §9(c) of the main review ("no template is marketing")
and supersedes §A.9's provisional transactional treatment for this one template.** No other template in
the §A.1 inventory of 28 is affected — this ruling is scoped to `buildOnboardingIncompleteEmail` alone.

### A.12.3 What this does not decide

Consistent with this role's stated authority: I am ruling on **characterisation** — what kind of
communication this is — not on the compliance mechanics that follow from that characterisation.
Handed to `compliance-specialist` to formalise, not designed here:

- **Lawful basis** — most likely prior opt-in consent under s69(1), captured at signup, distinct from
  the account-creation consent already collected for the service itself (bundling the two would repeat
  the "unbundled-consent theatre" defect §5.3 of the main review already rejected for a different
  flow). Whether a lighter-touch basis (e.g. a narrowly-scoped legitimate-interest-style argument, if
  POPIA's structure admits one here) is available is `compliance-specialist`'s call, not mine.
- **Unsubscribe/opt-out mechanics**, compliant with s69(3)'s notice-of-objection requirement and general
  ECTA unsubscribe norms — and, per **C-R-6(a)**, built so it cannot be confused with or accidentally
  wired into the Tier 1 auth-email suppression path that must never be interruptible.
- **Whether the two-send cap and `policyCount === 0` gate, on their own, are sufficient scoping once a
  consent basis is required**, or whether the send should be paused entirely until that basis exists.
- **RoPA and privacy-notice treatment** of this send as a distinct purpose from the Tier 1/Tier 2
  service notifications already covered by §11's copy.

### A.12.4 Interim instruction, pending `compliance-specialist` formalisation

**Do not extend, redesign, or "improve" this email's copy or targeting in the meantime** — no pricing,
no discount, no urgency, no broadened trigger (e.g. firing on low-asset-count as well as
zero-policy-count) — until the consent/opt-out mechanics above are in place. This is stricter than
§A.9's interim conditions (i)–(iii), not merely a restatement of them, because those conditions were
written for a template still presumed transactional; this ruling removes that presumption.
`product-manager` to confirm scope with `compliance-specialist` before Sprint 4, per §A.9's original
timeline — unchanged.

---
---

# Appendix B — OI-R-5 ANSWERED: live account, real sends. Disposition re-assessed.

> **⚠ SUPERSEDED IN PART BY [APPENDIX C](#appendix-c--correction-to-appendix-b-the-resend-account-exists-but-has-never-sent) (2026-09-14, later the same day).**
> Appendix B's factual premise — that the live Resend account *has sent to real recipients* — is
> **withdrawn on new owner evidence** (Resend Logs page empty; owner clarifies the emails received
> came from Supabase, not Resend). **Appendix B's text is left unamended as the record of the
> reasoning as it stood.** Read it only together with Appendix C, which states precisely which of
> its findings are retracted (B.1's live-contravention framing, B.2.1's retroactivity split, B.3's
> log-preservation item, B.4's "already in inboxes" reasoning) and which survive (C-R-9, CT-1, the
> C-R-1 evidence task, the §A.6 rewrites). **Do not cite Appendix B on its own.**

**Owner:** `compliance-specialist` · **Date:** 2026-09-14 · **Appended, not substituted** — §§0–15 and
Appendix A stand unamended. This is a status re-assessment of a single answered open item, not a new
review.

**Trigger:** the platform owner has confirmed directly that **a live Resend account exists, it works,
and emails are being received by real recipients.** That answers **OI-R-5**, and it selects between
the two worlds §14 refused to guess between. **It is the second world.**

---

## B.1 Ruling on disposition — the verdict changes in kind, not in content

**New status: APPROVED WITH CONDITIONS — but the operative posture is now LIVE NON-CONFORMANCE
UNDER REMEDIATION, not a pre-go-live gate.**

The nine conditions survive verbatim. What changes is what they *are*. §12 marked C-R-1, C-R-3(a) and
C-R-9 **[BLOCK]** — a block on *production email delivery*. **There is no longer a delivery event in
front of us to block.** Production email delivery has been happening. A condition that gates a
door someone has already walked through is not a condition; it is a remediation item with an accrued
exposure behind it, and calling it anything softer would misdescribe the record.

**§14 said this outcome would be "a live contravention requiring assessment, not a paperwork gap."
I wrote that, the CTO escalated it twice (09-10 §3, 09-14 §3), and I am not going to walk it back now
that it has landed. It is the live-contravention branch.** Here is the assessment it called for,
severity-separated, because "contravention" is not one thing:

| Limb | Status now | Severity, honestly |
|---|---|---|
| **s21 written operator contract** | Resend's DPA is **click-accept and binds "upon Customer entering into the Agreement"** (§5.1). If an account exists, the DPA is **on its own terms already in force**. | **Probably substantively satisfied; evidentially unproven.** This is the least-bad limb. We are almost certainly contracted; we simply cannot *show* it, and s21 compliance that cannot be evidenced to the Regulator is worth little on the day it is asked for. **C-R-1 is now an evidence-recovery task, not a negotiation.** |
| **s72 transborder flow** | Rests on the same instrument. Rides entirely on the above. | Same: probably lawful, unevidenced. **Not** a rejection ground — §5.2's reasoning is unchanged by the fact of sending. |
| **TDIT-2026-09 §19(c) — Client's prior written consent to cross-border processing (CT-1)** | **Unmet. Unambiguously, and not curable by finding a document.** | **This is the real one.** Unlike s21, there is no instrument sitting in an account somewhere that quietly satisfies it. Personal information of the Client's data subjects has been transmitted to a US sub-operator **without the prior written consent the contract requires**. That is a **live contractual contravention by the Developer against the Client**, accruing from first send. It cannot be back-dated. It can only be disclosed and regularised. |
| **s18 — notification to data subjects of the recipient of their PI** | **Deficient, retroactively.** The §11 privacy-notice copy was drafted in this review on 2026-09-10 and, as far as this repository shows, **has never been published.** | Real-world customers have had their email address and message content sent to a Californian processor **without ever having been told**. Lower severity than CT-1 (remediable prospectively by publishing the notice; POPIA does not require re-notifying past collection in the way a breach would), but it is a second accrued deficiency, and it was invisible while this was hypothetical. |
| **s22 — security compromise notification to the Regulator and data subjects** | **NOT ENGAGED. No notification obligation arises from this.** | Stated plainly so nobody over-escalates in the other direction: s22 triggers on **reasonable grounds to believe PI has been accessed or acquired by an unauthorised person.** Resend is not an unauthorised person — it is a contracted processor doing the job it was engaged for. **There is no breach here. There is a contracting and consent defect.** Anyone drafting a regulator notification off this appendix has misread it. |

**Net:** the exposure is **contractual and evidential, not a data breach**, and the single item that is
genuinely un-curable-by-paperwork is **CT-1**. That is the honest shape of it — worse than "same
conditions apply," materially better than "we have had a breach."

---

## B.2 Which conditions were prospective, and which are now retroactive

The split §12 never had to make, because on 09-10 everything was prospective.

### B.2.1 Now RETROACTIVE — exposure has already accrued

| ID | Why it is retroactive now |
|---|---|
| **C-R-1** | Sending has occurred **without the account-side evidence ever being produced.** The obligation did not start when we write it down; it started at first send. Now the most urgent single item, and it is one screenshot. |
| **CT-1** (not a C-R, but the binding one) | Cross-border transmission **already happened** before the Client's §19(c) consent. See B.1. **This is the item that changed character most.** |
| **C-R-2** | Customer PI is **in** Resend's 30-day US store right now, not prospectively. The RoPA is now describing **actual** processing, which raises the accuracy bar on it. |
| **C-R-3(a) — proportionality limb (§A.6)** | **Verified in code today, 2026-09-14: the 7 rewrites have NOT landed.** `domain-email-templates.ts` still emits `Theft report received — {referenceNumber}`, `Recovery partner assigned — {ref}`, `Recovery update — {ref}`, `Asset recovered — {ref}`, `Case closed — {ref}` (lines 461, 485, 510, 534, 558). **If any Tier 2 theft/recovery send has gone to a real recipient, case references are already in inbox previews, lock-screen banners and Resend's US log.** Scope depends on **OI-R-6** below. |
| **C-R-5** | A prohibition on enabling AI features is prospective **only if nobody enabled one.** On a live account that has existed for an unknown period, this is now a **fact to verify**, not a rule to impose. |
| **C-R-7(b)/(d)** | The RoPA entry and the privacy notice are now **overdue disclosures about live processing**, not pre-launch documentation. Feeds the s18 deficiency at B.1. |
| **C-R-9** | Every email already received by a real customer carries a consumer Gmail address as the contact. §B.4. |
| **A.12 / ONB-002** | `product-manager` ruled this **direct marketing under s69**. If it has actually sent — it fires at 24h/72h post-signup on any account with no policy, so on a live system with real signups it plausibly **has** — then **s69 direct marketing without prior consent has already occurred.** This is the one limb with a genuine statutory-enforcement flavour rather than a contractual one. **Must be confirmed, and paused if confirmed, before anything else on the marketing track.** |

### B.2.2 Still PROSPECTIVE — unchanged by live usage

**C-R-3(b)** (never cite vendor logs as audit record — standing rule, nothing accrued) ·
**C-R-3(c)** (review new templates — forward surveillance) ·
**C-R-4** (token TTL ceilings — the arithmetic is unchanged and the credentials already sent are
single-use and long since consumed; configure forward) ·
**C-R-6(a)** (auth email outside the suppression path — **verified still true today**, nothing to
remediate) · **C-R-6(b)/(c)** (marketing / payments — forward, save for the ONB-002 carve-out above) ·
**C-R-7(a)/(c)** (mark Brevo docs superseded; single cross-vendor notice-monitoring process) ·
**C-R-8** (dead Brevo path — a *latent* second operator, still never activated; unchanged) ·
**OI-R-1 / OI-R-3 / OI-R-4** (vendor-side unknowns, unaffected).

---

## B.3 Immediate remediation — what actually has to happen, and by when

Ordered by decay, not by importance. Two of these have a clock on them that the others do not.

1. **[≤24h — DECAYING] Preserve the Resend log before it rolls off.** Retention is a **flat,
   non-configurable 30 days** (§6). **Anything sent more than 30 days ago is already unrecoverable**,
   which means our ability to establish *what was sent to whom* has a hard 30-day horizon that is
   moving away from us daily. Export/screenshot the dashboard log now — message types, volumes, date
   of first send. This is the evidence base for every other item here, and it is the only one that
   gets permanently harder by waiting. (The same 30-day roll is also a genuine **mitigant**: the
   content exposure self-heals for old sends. It cuts both ways.)
2. **[≤24h] Close C-R-1.** Account owner entity, plan, DPA acceptance status + version, account
   creation date. Owner-only. One screenshot each.
3. **[≤24h] Answer OI-R-6 (new).** **Which tier has actually sent?** The confirmed fact is "emails are
   received," not "which emails." Tier 1 auth email runs through the Supabase Edge Function; Tier 2
   domain notifications run through the Render backend and require `RESEND_API_KEY` in that
   environment. **If only Tier 1 has sent, the accrued content exposure is email addresses and
   expired tokens — thin.** If Tier 2 has sent, it is the §8(1) aggregate: item inventories, IP
   addresses, and theft/recovery case references, with the §A.6 subject-line defect live. **These are
   very different exposures and I will not assume the worse one.** Answerable from the Render env var
   and the Resend dashboard.
4. **[≤48h] Verify C-R-5 retroactively** — confirm no AI/beta feature has ever been enabled on the
   account. Verification, not instruction.
5. **[≤48h] Confirm whether ONB-002 has sent** (B.2.1). If yes, **pause that send** pending the
   A.12.3 consent mechanics. It is the only template where continuing to send makes the position
   worse each day.
6. **[≤72h] Disclose to the Client and regularise CT-1.** Prior written consent cannot be obtained
   retrospectively; what can be done is disclose that sending commenced before consent, obtain the
   consent for continuing processing, and seek ratification of the period already elapsed.
   **`cto` + owner. Do not present this to the Client as a formality — §192 of the CT register already
   says so, and this appendix is the reason why.** Drafting support from me.
7. **[This sprint] Land the §A.6 rewrites and the C-R-9 footer fix** (§B.4). Engineering work, no
   external dependency, closes the two largest *forward* exposures.
8. **[This sprint] Log the non-conformance in the CT register** with a start date (= first send date
   from item 1), so the exposure window is a recorded fact rather than something reconstructed under
   pressure later. **CT-3's overdue runbook does not gate this** — this is not a s22 event (B.1).

**What does NOT need to happen:** no Regulator notification, no data-subject breach notification, no
suspension of email sending. **Suspending auth email would lock real customers out of verification
and password reset, degrading their s23/s24 rights — a worse compliance outcome than the one we are
remediating.** Keep sending; fix the record.

---

## B.4 C-R-9 — still open, and yes, it is more urgent now

**Verified in source today, 2026-09-14. Both sites C-R-9/§A.8 named are unchanged:**

- `backend/src/lib/email-footer.ts:44` — `td.itsolution60@gmail.com`
- `supabase/functions/auth-send-email/templates/brand.ts:46` — same address

**C-R-9 is open. Nothing has been fixed.** The only §A.5 fix that landed is the OTP preheader
(`reauthentication.ts:12` now reads `'Your verification code is inside this message.'`, with the
audit reference retained in the comment at line 8) — **confirmed applied, C-R-4's adjacent exposure
closed.** That one is done. The Gmail address is not.

**Why live usage raises it rather than merely restating it.** On 09-10 this was a defect in an
unsent artefact. Today it is a defect in mail **already sitting in real customers' inboxes**:

1. **Brand and trust, now.** A first-contact verification email from an insurance company whose
   published contact is a personal Gmail address reads as phishing. That is not a future risk; it is
   the impression already formed by every recipient to date, and it is the single cheapest thing on
   this entire list to fix.
2. **Compliance.** It is the de facto **s18 notice contact** and **s23/s24 data-subject-request
   channel**. A data subject who exercises a statutory right by replying to it routes their request
   through **Google's consumer webmail — an undocumented operator with no DPA and no RoPA entry**.
   That is a *third* unonboarded processor, and unlike Resend it has no plausible click-accept DPA
   behind it.
3. **It compounds the phishing risk at B.1's periphery.** §10(3) noted a stolen API key permits
   believable mail *as this platform*. A platform whose genuine mail already looks unprofessional has
   no baseline for customers to distinguish a forgery against.

**Ruling: C-R-9 stays [BLOCK]-marked and is re-prioritised to the top of the engineering queue,
ahead of the §A.6 rewrites.** Two constants, two deploys, no design work, no external dependency.
There is no defensible reason for it to survive this week.

---

## B.5 Open items — status

- **OI-R-5: CLOSED.** A live Resend account exists and has sent to real recipients (owner, 2026-09-14).
  Consequences at B.1–B.3.
- **OI-R-6 (NEW): which tier(s) have actually sent, and from what date?** Owner / `cto`, ≤24h.
  Determines whether the accrued content exposure is "addresses and expired tokens" or the full
  §8(1) aggregate. **Until answered, nobody should state the exposure scope in either direction.**
- **OI-R-7 (NEW): has `buildOnboardingIncompleteEmail` (ONB-002) sent to any real recipient?**
  Owner / `notification-engineer`, ≤48h. Determines whether the A.12 s69 finding is prospective or
  accrued.
- **OI-R-1 / OI-R-2 / OI-R-3 / OI-R-4: unchanged, all open.** None of them is on the critical path
  this week.

---

## B.6 Sign-off on the re-assessment

**The approval stands. The framing does not.** Resend remains an approved operator/sub-operator on
conditions C-R-1 … C-R-9; nothing discovered today makes it the wrong vendor, and §5's analysis is
untouched. **What changed is that this stopped being a gate and became a remediation, with an
exposure window that started at a date we do not yet know and is still running.**

**This does not reopen the review and does not require a new one.** It requires items B.3.1–B.3.8
done in order, and OI-R-6 answered before anyone characterises the scope.

**Reassessment triggers (added to §15's list):** OI-R-6 answered — if Tier 2 has sent, I will
re-score §8(1)'s content exposure against actual send volumes rather than against the template
inventory · OI-R-7 answered positive — s69 formalisation moves from Sprint 4 to immediate.

---
---

# Appendix C — Correction to Appendix B: the Resend account exists but has never sent

**Owner:** `compliance-specialist` · **Date:** 2026-09-14 (later the same day as Appendix B) ·
**Appended, not substituted** — §§0–15 and Appendices A and B stand unamended in their text.
**Effect: Appendix B is SUPERSEDED IN PART.** Its analysis is sound; its **factual premise is
wrong**, and a wrong premise at the top of a severity assessment propagates all the way down it.
I wrote Appendix B. This is my correction of it, made on the same standard I would apply to anyone
else's.

**Trigger:** two owner screenshots of the Resend dashboard, plus a direct owner clarification.

---

## C.1 The new evidence, and what it actually establishes

| Evidence | What it shows |
|---|---|
| Resend dashboard → **Logs** | *"No logs yet. Start sending emails to see insights and previews for every message."* — **zero send events recorded in this account.** |
| Resend dashboard → **API Keys** | **One** key, named `Onboarding`, created **2026-08-13**, permission `sending_access`, creator `ashleymashigo288@gmail.com`. |
| Owner, asked directly to reconcile an empty Logs page with "emails are received" | **"it means the emails came from Supabase"** — i.e. the mail the owner received was delivered by **Supabase Auth's own built-in sender**, not by Resend and not by the `auth-send-email` Edge Function. |

**What this establishes, stated at the strength the evidence actually supports:**

1. **A Resend account and a sending-scoped API key exist.** That is not in doubt, and it is the
   part of Appendix B's premise that survives.
2. **No email has been sent through Resend by this platform, on the best available evidence.**
   A `sending_access` key that has produced zero log entries is a key that was created and never
   wired in. **Key creation is not integration.** Appendix B read "the account works" as "the
   integration is live," and those are different claims. I made that inference; it was not
   supported, and it is the single error this appendix exists to correct.
3. **The delivery path that actually ran was Supabase's own built-in auth email**, i.e.
   `resend-setup.md` §4's fallback condition: *"When enabled, Supabase built-in SMTP is **not** used
   for auth mail"* — read in reverse, **not enabled ⇒ built-in SMTP is what delivers.**

### C.1.1 Which of the three candidate causes the code actually supports

The task framing offered three candidates (hook never enabled · `RESEND_API_KEY` never set in the
Edge Function · sending domain never verified). They are **not equally consistent with the
evidence**, and the code discriminates between them:

- **Secret never set — RULED OUT as the explanation for *received* mail.**
  `supabase/functions/auth-send-email/lib/send-email.ts:14–17` **throws** if `RESEND_API_KEY` is
  absent. If the hook were enabled and the secret missing, GoTrue's Send Email Hook would error and
  **the auth email would fail outright** — the owner would have seen signup/reset failures, not
  received mail. (It remains possible the secret is *also* unset; it is simply not what produced the
  observed behaviour.)
- **Domain never verified — UNLIKELY as the sole cause.** That path calls Resend and receives a 4xx;
  an attempted request would ordinarily surface in the account's log/insights view. An empty Logs
  page is more consistent with **no API request ever reaching Resend at all.**
- **Hook never enabled (or the Edge Function never deployed) — the best-supported explanation.**
  It is the only candidate that produces *all three* observed facts simultaneously: mail delivered
  and received, zero Resend API activity, and no user-visible auth failure. **This is a finding at
  the level of "most probable cause on the evidence," not a certainty** — C.6/OI-R-8 states the
  one-screenshot check that would make it certain.
- **Tier 2 (Render backend → Resend) — separately and independently not sending.**
  `backend/src/lib/resend-email.ts:14–22` **no-ops with a log line** (`[email] NOT sent to … —
  RESEND_API_KEY or EMAIL_FROM not configured on backend`) when the key or sender is unset. It does
  not throw and does not surface to the user. **Domain notifications silently do not send** in that
  configuration — consistent with zero Resend logs.

### C.1.2 The residual I am not going to hide

Resend's retention is a flat **30 days** (§6). The key was created **2026-08-13**, which is **32 days
ago**. There is therefore a **~2-day window (roughly 13–15 August)** in which a send could in
principle have occurred and since rolled off the log. The empty-state wording *"No logs yet. Start
sending emails…"* reads as a never-used account rather than an aged-out one, and the owner's own
account of events points the same way — but **"the logs are empty" and "nothing was ever sent" are
not the same statement**, and I will not repeat the Appendix B error by collapsing them. Residual
risk: **low, non-zero, and bounded to a two-day window five weeks ago during setup.** Closed by
OI-R-8.

---

## C.2 The corrected answer to OI-R-5

**OI-R-5 was: "Which Resend plan the account is on, who owns it, and whether the DPA has in fact
been accepted."** Appendix B recorded it CLOSED on the answer *"a live Resend account exists, it
works, and emails are being received."*

**Corrected answer, on the evidence:**

> **A Resend account and a sending-scoped API key exist (created 2026-08-13, by
> `ashleymashigo288@gmail.com`). The account has not been used to send email from this platform.
> The emails the owner received were delivered by Supabase Auth's built-in sender, bypassing both
> the `auth-send-email` Edge Function and Resend.**

**Status: OI-R-5 is PARTIALLY answered, not closed.** The existence limb is answered. The **plan,
account-owner entity, and DPA acceptance status** limbs — which are what **C-R-1** actually needs —
remain **unanswered**, exactly as they were on 2026-09-10. Appendix B closed OI-R-5 one limb too
early. **Re-opened.**

**And this selects between §14's two worlds the other way.** §14 posed them as: *"If no account
exists, nothing has flowed yet and the position is clean prospectively. If an account exists and has
been used against real addresses, then email has been flowing to an unreviewed operator…"*
**Neither is exactly right. There is a third world, and we are in it: an account exists, is
un-evidenced, and has not been used.** For the purposes of accrued exposure, that behaves like the
**first** world — **clean prospectively** — while leaving C-R-1's evidence obligation exactly where
§12 put it.

---

## C.3 Is Supabase's own auth-email sending already in scope of the Supabase review?

**Answer: partly — and the part that is not in scope is narrow, previously unexamined, and low
severity today. It is not a new unreviewed vendor relationship.** Broken into its three limbs,
because answering it as one question is how a real gap gets waved through:

| Limb | In scope of `compliance-review-supabase.md`? | Reasoning |
|---|---|---|
| **The operator relationship itself** | **YES, fully.** | Supabase is already reviewed as an operator across that document. Mail sent by Supabase's own infrastructure is **Supabase processing data we already gave it** — an email address it already stores in `auth.users` (§2.1) and a token GoTrue itself minted. No new counterparty, no new PI category, no new s21 instrument required. It rides on **C-2** (execute the Supabase DPA) — which is **still open** and is an existing owner blocker, not a new one. |
| **The cross-border leg** | **YES.** | The project is in an **EU region** (§3.4, owner-confirmed 2026-08-08), and **CT-1 itemises "Supabase EU region (exact code)" by name.** Supabase-delivered auth mail is a cross-border flow **to a destination already inside CT-1's schedule.** Nothing new to add to the consent request. |
| **Which sub-processor physically delivers built-in GoTrue auth mail, and where** | **NO — genuinely not determined.** | Two reasons, and both were reasonable at the time. (a) **§5.2 assessed the built-in service only as a capability to be *replaced*** — "explicitly not for production… ~2 emails/hour… refuses to deliver to addresses that are not part of the project's team" — **never as a live processing path**, because nobody expected it to be one. (b) **§5.1.2's Bucket B ruling** placed Supabase's email-adjacent sub-processors (**Postmark / Active Campaign, LLC**, described as *"Communication with Authorized Users"*; **Sublime Security Inc**, *"Email Security"*; **Google, LLC**, *"hosting"*) **out of scope as a customer-identity-data flow** — a ruling that is correct **for** Authorized-User communications but **assumed built-in auth mail was not in the picture.** Supabase does not publish which sub-processor carries built-in auth mail, and none of the 24 entries carries a **stated location**. |

**Ruling.** This is a **small, real, previously-unnamed gap — logged as C-R-10 / OI-R-9 — not a
second Resend-shaped problem, and anyone reading it as one has over-read it.** Three things keep it
small, and I want them on the record so this is not re-escalated later by someone reading only the
gap and not the containment:

1. **The built-in sender only delivers to project team addresses.** That is Supabase's documented
   limitation (§5.2), and it is corroborated here: the recipient was the **owner**. So the PI that
   has actually traversed this path is **staff/business-contact PI plus staff auth tokens — not
   customer PI.** That is the same low-sensitivity category §5.1.2 already accepted for Bucket B in
   its "one honest qualification" paragraph.
2. **It is a path we are contractually and architecturally committed to leaving.** C-5 / the whole
   Resend onboarding exists precisely to replace it. This is not a permanent flow to be regularised;
   it is a temporary setup-phase flow to be switched off.
3. **It is bounded by the same DPA and the same CT-1 line item**, so there is no un-contracted
   counterparty here in the way an un-onboarded Brevo (C-R-8) or a consumer Gmail address (C-R-9)
   would be.

**C-R-10 [PRE-PROD, low].** Record in the RoPA that **during setup, Supabase's built-in auth mail
delivered verification/reset messages to project team addresses**, that **the delivering
sub-processor and its location are not published by Supabase (OI-R-9)**, and that this path **ceases
on enabling the Send Email Hook**. Add "which sub-processor delivers built-in GoTrue auth email, and
in which country" to the **existing** OI-3 written enquiry to Supabase rather than opening a separate
thread — same discipline as C-R-7(c). **Owner:** `compliance-specialist` (RoPA), `integration-architect`
(enquiry). **Explicitly not a blocker**, and it self-extinguishes when the hook goes live.

**One correction to §5.1.2 flowing from this, recorded so it is not lost:** the Bucket B ruling
should be read as *"out of scope for the customer-identity-data flow **provided built-in auth email
is not in use**"* — the proviso was implicit and is now explicit. `compliance-specialist` to carry
this into the next revision of that document; it does not change any of its conditions.

---

## C.4 What in Appendix B is retracted, and what survives

**RETRACTED — these were premised on sends that did not happen:**

| Appendix B item | Status |
|---|---|
| **B.1's headline: "LIVE NON-CONFORMANCE UNDER REMEDIATION"** | **WITHDRAWN.** There is no live non-conformance **arising from Resend**, because no personal information has reached Resend. The posture reverts to **§12 as written: APPROVED WITH CONDITIONS, pre-go-live gate.** The conditions are gates again, not remediation items. |
| **B.1's s72 / s21 "probably lawful, unevidenced" framing of accrued flow** | **MOOT as to accrued exposure.** Nothing flowed. C-R-1's evidence obligation is unchanged and still [BLOCK], but it gates a future first send rather than documenting a past one. |
| **B.1's s18 finding — "real-world customers have had their email address and message content sent to a Californian processor without ever having been told"** | **WITHDRAWN as to Resend.** No customer message content left for California. Publishing the §11 notice remains required **before** first send (C-R-7(d)); it is no longer an overdue disclosure about live processing. |
| **B.2.1 in its entirety — the "now RETROACTIVE" split** | **WITHDRAWN.** **Every** condition reverts to **prospective**, per B.2.2's framing. Nothing accrued. |
| **B.3.1 — "[≤24h — DECAYING] preserve the Resend log before it rolls off"** | **MOOT. There is nothing to export.** This was the most urgent item on the list and it evaporates entirely. (The 32-day/2-day residual at C.1.2 is not curable by exporting an empty log; it is curable by OI-R-8.) |
| **B.3.3 / OI-R-6 — "which tier has actually sent?"** | **ANSWERED: NEITHER.** Tier 1 never reached Resend (hook not enabled); Tier 2 silently no-ops without the backend key. **OI-R-6 CLOSED.** The §8(1) aggregate content exposure is **prospective**, as originally written. |
| **B.3.5 / OI-R-7 — ONB-002 s69 direct-marketing exposure** | **PROSPECTIVE, not accrued.** ONB-002 is a Tier 2 backend send; with no backend key it cannot have delivered. **No s69 contravention has occurred.** A.12's characterisation ruling **stands unchanged** and must be formalised **before** first send — but the "pause it now" urgency is withdrawn. **OI-R-7 CLOSED (negative), subject to C.1.2's residual.** |
| **B.4's reasoning that the Gmail address is "a defect in mail already sitting in real customers' inboxes"** | **WITHDRAWN as stated** — see C.5(3), which replaces it with a **better-evidenced** reason the same conclusion holds. Built-in Supabase mail uses **Supabase's** templates, not `brand.ts`, so our footer was probably never rendered to anyone. |
| **B.6's "exposure window that started at a date we do not yet know and is still running"** | **WITHDRAWN.** There is no open exposure window against Resend. |

**SURVIVES — unaffected by this correction:**

- **All nine conditions C-R-1 … C-R-9, verbatim**, with their original **[BLOCK] / [PRE-PROD] /
  [STANDING]** markers as set at §12. The whole of §§0–15 and Appendix A is untouched — **this
  correction is about *whether sending has happened*, not about *what the vendor is* or *what the
  templates say*.**
- **CT-1** — see C.5(1). Unaffected, and never depended on Resend.
- **C-R-9** — see C.5(3). **Strengthened, not weakened.**
- **The §A.6 seven template rewrites** — still required, still not landed (B.2.1 verified them
  missing in code today and that verification is independent of delivery). Now **pre-send work with
  no accrued harm behind it**, which is the cheapest time to do it.
- **A.12's s69 characterisation of ONB-002** — a ruling about content, unaffected by delivery.
- **The §A.5 OTP preheader fix** — confirmed landed; unaffected.
- **C-R-8** (dead Brevo path) — unchanged; it was always latent.

---

## C.5 Re-assessed urgency — the four questions put to me, answered directly

**(1) Is CT-1 still needed regardless? YES — unambiguously, and it never rested on Resend.**
CT-1 requires the Client's prior written consent to cross-border processing **itemising each
location: Render Frankfurt (backend + web), Supabase EU region, MongoDB Atlas, Resend, and AWS as
substrate** (`10-data-protection-contract-obligations.md` §6). **Four of those five are live today
and have nothing to do with email.** §9.1 of that same document already **ruled out** making CT-1
moot by leaving Frankfurt, and §9.2 **ruled out** an internal risk acceptance. **The only change this
correction makes to CT-1 is that the "Resend" line item is now honestly describable as *a planned
recipient that has not yet received anything*** — which is a **mildly better** disclosure to make to
the Client, not a reason to delay making it. **CT-1's deadline, owner and standing containment
condition ("no new real customer PII on any surface until consent is obtained") are unchanged.**

**(2) Is the log-export item moot? YES, completely.** B.3.1 is withdrawn (C.4). There is nothing to
export. **It is replaced by a cheaper and more durable item: OI-R-8**, below — confirm the hook state
rather than reconstruct a send history.

**(3) Is C-R-9 (the Gmail contact) still valid? YES — and it is now better evidenced than Appendix B
made it.** B.4 tied its urgency to inboxes; that limb is withdrawn. But C-R-9 was **never** a finding
about which sender delivered a message — it is a finding about **static contact content**, and I
verified the address in source again today at **four** sites, two of which are **live public web
pages right now**:

- `backend/src/lib/email-footer.ts:44` — domain email footer (**unsent today**)
- `supabase/functions/auth-send-email/templates/brand.ts:46` — auth email chrome (**unrendered
  today**, since the hook is not enabled)
- **`src/lib/companyContact.ts:15`** — consumed by **`src/pages/PrivacyPolicyPage.tsx:59–60` and
  `src/pages/TermsOfServicePage.tsx:55–56`**, plus the landing page and three customer/onboarding
  flows
- **`mobile/src/lib/companyContact.ts:2`**

**This is the important correction *against* my own withdrawal: the consumer Gmail address is the
published contact on the live Privacy Policy and Terms of Service pages.** That makes it the **de
facto s18 notice contact and s23/s24 data-subject-request channel *today*, on a public website,
entirely independently of whether a single email has ever been sent.** **C-R-9 stays [BLOCK], stays
at the top of the engineering queue, and its scope is now four sites across three surfaces — wider
than both §A.8 (two sites) and B.4 (two sites) recorded.** Appendix B reached the right conclusion
via the wrong route; the right route is stronger.

**(4) Does anything else from the 24h/72h/this-sprint list still apply?**

| Original item | Re-assessed |
|---|---|
| B.3.1 export Resend logs **[≤24h]** | **MOOT** — nothing to export. |
| B.3.2 close C-R-1 (owner entity, plan, DPA status) **[≤24h]** | **STILL REQUIRED — but back to its original [BLOCK]-before-first-send status, not a 24h emergency.** Still one screenshot. **Do it while enabling the hook**, since the owner will be in the dashboard anyway. |
| B.3.3 OI-R-6 which tier sent **[≤24h]** | **CLOSED — neither.** |
| B.3.4 verify C-R-5 (no AI feature enabled) **[≤48h]** | **Downgraded to a one-line check at hook-enable time.** On an account that has never sent, there is nothing for an AI feature to have processed. Reverts to **[STANDING] prospective prohibition**, as §12 wrote it. |
| B.3.5 confirm/pause ONB-002 **[≤48h]** | **No pause needed — it has not sent.** A.12's consent mechanics revert to the **Sprint 4** timeline §A.9/§A.12.4 originally set. |
| B.3.6 disclose to Client and regularise CT-1 **[≤72h]** | **STILL REQUIRED, unchanged in substance** — but it is **not a disclosure of an accrued Resend contravention**. It is CT-1 as it always was (§9.5's draft letter), now with one line item described more accurately. **`cto` + owner. The draft does not need rewriting for this; it needs one factual adjustment to the Resend row.** |
| B.3.7 §A.6 rewrites + C-R-9 fix **[this sprint]** | **STILL REQUIRED, unchanged.** C-R-9 first (C.5(3)). |
| B.3.8 log the non-conformance in the CT register with a start date **[this sprint]** | **WITHDRAWN as to Resend** — there is no Resend non-conformance and no start date to record. **Do not create a register entry for one.** CT-1's own existing entry already records the live contractual exposure from the four non-email locations, and that entry is unchanged. |
| B.3's "what does NOT need to happen" (no Regulator notification, no breach notification, no suspension of sending) | **UNCHANGED, and now *more* clearly right.** B.1's s22 row was correct then and is correct now: **there is no breach.** |

**Net urgency: the two genuine 24-hour clocks in Appendix B are gone.** What is left is a
pre-go-live condition set with **one item that is live-and-public today (C-R-9)** and **one item that
was always independently live (CT-1)**.

---

## C.6 Open items — corrected status

- **OI-R-5: RE-OPENED, partially answered.** Existence confirmed; **plan, account-owner entity and
  DPA acceptance status still unknown**, and **C-R-1 still cannot close.** (Appendix B closed this
  prematurely.)
- **OI-R-6: CLOSED — neither tier has sent via Resend.**
- **OI-R-7: CLOSED (negative) — ONB-002 has not sent; the s69 finding is prospective.** Subject to
  C.1.2.
- **OI-R-8 (NEW): confirm the actual integration state, by screenshot, in one sitting.**
  (a) Supabase Dashboard → Authentication → Hooks → **Send Email: enabled or not**; (b) whether
  `auth-send-email` is deployed and its **invocation count**; (c) whether `RESEND_API_KEY` /
  `EMAIL_FROM` are set as **Edge Function secrets**; (d) whether they are set on **Render**;
  (e) Resend → Domains → **verification status**. **Owner / `cto`, before enabling the hook.**
  This replaces B.3.1 and is what definitively closes C.1.2's two-day residual — (b) is the decisive
  one: a deployed function with **zero invocations** settles it outright.
- **OI-R-9 (NEW): which Supabase sub-processor delivers built-in GoTrue auth email, and in which
  country?** Fold into the **existing** OI-3 enquiry (`compliance-review-supabase.md` §6.3).
  `integration-architect`. **Low priority, self-extinguishing on hook enable.** See C.3.
- **OI-R-1 / OI-R-2 / OI-R-3 / OI-R-4: unchanged, all open.** None on the critical path.

---

## C.7 Owner-facing summary — short version

**What is actually true:**

- You have a Resend account and an API key. **Resend has never sent an email for this platform** —
  the empty Logs page is the proof, and it matches the code.
- **The verification emails you received came from Supabase's own built-in sender.** Almost
  certainly the **Send Email Hook was never switched on** in the Supabase dashboard, so Supabase
  quietly fell back to its own email service. Our branded Edge Function never ran.
- **That built-in sender only delivers to addresses on your Supabase project team.** So it worked
  for you — and it would **not** have worked for a real customer signing up. **Enabling the hook is
  an operational prerequisite for launch, not just a compliance one.**

**What changed from this morning's urgent version:**

- **There is no live non-conformance from Resend, and there has been no breach.** No customer data
  ever reached the United States via email. That escalation is withdrawn.
- **The two 24-hour clocks are gone.** Nothing to export from Resend; nothing to pause.
- Everything reverts to what it was on 10 September: a **normal pre-launch condition list**.

**What is still genuinely time-sensitive:**

1. **The Gmail address (`td.itsolution60@gmail.com`) is published on your live Privacy Policy and
   Terms pages right now.** That is the contact a customer would use to exercise their legal rights,
   and it is a personal Gmail account. **Cheapest fix on the list, four files, still blocking.**
2. **CT-1 — the Client's written consent to processing outside South Africa — is still unmet and
   still blocks real customer data.** It never depended on Resend: Render Frankfurt, Supabase EU and
   MongoDB Atlas are all cross-border on their own. The draft letter is ready; it needs sending.
3. **One screenshot sitting (OI-R-8)** when you next open the dashboards — hook status, secrets,
   domain verification, account plan. Not urgent, but it closes C-R-1 and removes the last doubt in
   this appendix.

**And the honest note:** this morning's escalation was **mine**, and it was wrong on its facts
because I read "the account works and emails arrive" as "the integration is live." It was not.
**The lesson is the house rule: check the code and the evidence before asserting a system is
running.** I have applied it to myself here.

---

## C.8 Sign-off on the correction

**Resend remains APPROVED WITH CONDITIONS (C-R-1 … C-R-9, plus C-R-10 at C.3). The §12 markers
stand as originally written: pre-go-live gates, not remediation items.** Appendix B's
**LIVE NON-CONFORMANCE UNDER REMEDIATION** status is **withdrawn**; Appendix B is **superseded in
part** per C.4 and carries a pointer to this appendix.

**This does not reopen the review.** §§0–15 and Appendix A are untouched on their merits, and
nothing here alters the vendor analysis, the template audit, or the conditions.

**Blocking first production send:** **C-R-1**, **C-R-3(a)** (§A.6 rewrites), **C-R-9**, and —
independently and contractually — **CT-1**.

**Reassessment triggers (replacing B.6's):** **OI-R-8 answered** — if the Edge Function shows
non-zero invocations, or the Resend Domains page shows a verified domain with delivery history, this
appendix reopens immediately and Appendix B's framing is reinstated on the new facts · **the Send
Email Hook being enabled** — at which point C.3's built-in-sender path closes and C-R-10 extinguishes
· first real Resend send — at which point C-R-2's RoPA entry moves from prospective to live.
