# Feature 001 — Cross-Border / Data-Residency Compliance Review: Supabase as Identity System of Record

**Status:** **COMPLIANT WITH CONDITIONS** — conditional compliance sign-off issued. 12 conditions (C-1 … C-12). **C-1 is satisfied; C-2 (execute the DPA) is now the single remaining Stage 9 (Development) blocker.** 9 conditions block go-live; C-10 and C-12 are standing prohibitions effective immediately. 8 open items (OI-1 … OI-8) require information this review could not obtain and must not be assumed — **OI-1 and OI-2 are now resolved**, OI-3 … OI-8 remain open.
**Date:** 2026-08-08 (revised 2026-08-08 — OI-2 closed, sub-processor analysis added at §5.1, C-3 partially discharged, C-12 / OI-7 / OI-8 added)
**Author / decision owner:** `compliance-specialist`
**Discharges:** ADR-0002 "Required Follow-ups Before Implementation" item 1 (the compliance half only — see §13) · `architecture-review.md` FU-15(a) (compliance half only)
**Required input to:** `cybersecurity-architect`'s Stage 8 Security Review sign-off
**Consumers:** `cybersecurity-architect`, `security-engineer`, `database-architect`, `backend-architect`, `authentication-engineer`, `cloud-infrastructure-architect`, `cto`
**Governing framework for this review:** POPIA (Protection of Personal Information Act 4 of 2013), South Africa — per Feature 001 Stage 1 §9 and Feature 002 §12.0, both ratified by the platform owner. GDPR is assessed here only as a forward hedge (§4.5); PCI-DSS is out of scope for this feature (no payment data in Feature 001's surface).

---

## 0. Verdict, stated up front

**COMPLIANT WITH CONDITIONS.** Using Supabase (hosted Postgres + Supabase Auth) as the system of record for identity/account/session/PII data is **lawful under POPIA** and does **not** require reversing ADR-0002 — but it is lawful only via a route the platform has not yet walked, and it introduces personal-information flows that appear in **no Feature 001 document to date**.

Four findings drive the conditions:

1. **Supabase Cloud has no African region.** There are 17 available regions, all AWS, none in Africa; `af-south-1` (Cape Town) was available during Supabase's alpha and is **not** offered for new projects. Data localisation in South Africa is therefore **impossible** on Supabase Cloud. This is not a solvable configuration problem — it is a fixed constraint we must be lawful *around*.
2. **POPIA does not require localisation, so this is survivable.** POPIA s72 permits transborder flow of personal information on stated grounds. Unlike GDPR, POPIA has **no adequacy-decision list** — there is no country we can point at as pre-approved. That makes the **binding-agreement route (s72(1)(a))** the normal route rather than a fallback, which works in our favour. But it must be **actively established by executing Supabase's DPA**, not assumed from the fact that Supabase is a reputable vendor.
3. **A written operator contract is legally mandatory, not best practice.** POPIA s21(1) requires the responsible party to ensure, *in terms of a written contract*, that its operator maintains s19 security safeguards. Running production identity data on Supabase with no executed DPA is a **direct s21 contravention**, independent of how good Supabase's security actually is. Supabase publishes a DPA available to all organisations, signed by return to `privacy@supabase.com`. **Executing it is condition C-2 and is a hard blocker.**
4. **Two personal-information flows were introduced by ADR-0002 that nobody has inventoried.** (a) Supabase Auth's own `auth.audit_log_entries` / `auth.sessions` tables contain actor email, IP address and user-agent — a **second, uncontrolled copy of substantially the event data our 12-month retention policy governs**, in a vendor-managed schema we cannot purge through a documented, supported control. (b) Supabase's built-in auth email service is **explicitly not for production** (2 emails/hour, team addresses only), so a **custom SMTP provider is mandatory** — and that provider is a *new operator* processing customer email addresses plus verification and password-reset tokens, with its own s21 and s72 obligations. Neither appears in Stage 1 §9, ADR-0002, `backend-approach.md`, or `database-design.md`.

**OI-1 / C-1 — RESOLVED 2026-08-08:** the platform owner confirmed the already-provisioned Supabase project is in an EU region. Region condition satisfied for Stage 9 purposes; the exact region code still needs recording in the RoPA and privacy-notice disclosure (non-blocking, see §3.4).

**OI-2 — RESOLVED 2026-08-08; C-3 PARTIALLY DISCHARGED:** the 1 June 2026 Sub-processor List has now been obtained and analysed against s72(1)(a)(ii) — see **§5.1**, which is new. The **reading** step of C-3 is done and the **contractual** onward-transfer limb is discharged, which removes C-3 as a Stage 9 blocker. What remains under C-3 is process and ownership (RoPA recording, change-notice subscription, a named standing owner) plus three residuals the list itself surfaced: sub-processor **processing locations are absent from the published list** (OI-7 — a completeness/evidencing gap, not a lawfulness gap, §5.1.4), **OpenAI appears on the list with no scope detail** (OI-8 + new standing condition **C-12**, §5.1.5), and Supabase's own error-monitoring/tracing vendors may see PII-bearing error payloads (folded into OI-3).

**C-2 (execute the DPA) is therefore now the single remaining Stage 9 blocker.**

---

## 1. Scope of This Review

**In scope:** the legal and regulatory consequences, under POPIA, of ADR-0002's decision to place identity/account/session/PII data in a third-party-hosted store outside South Africa — specifically: what personal information flows there, whether the flow is lawful, what contractual instruments are required, what retention and deletion obligations attach and whether they are enforceable in that store, and what must change in the consent/disclosure copy and breach procedure as a result.

**Out of scope for this document, and deliberately not duplicated:**

- **FU-03** — the account deletion vs. anonymisation mechanism and the `on delete cascade` ruling. Still owned by `compliance-specialist` + `database-architect` + `backend-architect`, still due Stage 6 exit (cascade) / Stage 8 exit (full mechanism). This review adds two Supabase-specific constraints that ruling must respect (§6.2.3) but does not pre-empt it.
- **FU-04** — retention period for `app.account_state_transitions`. This review gives it a **direction** and a **dependency** (§6.1.2) but does not close it; it remains due at Stage 8 exit.
- **The technical half of FU-15(a)** — encryption in transit to Supabase, service-role credential handling, RLS threat model, network posture. That is `cybersecurity-architect`'s, per ADR-0002's own design/implementation split ("Defers to `cybersecurity-architect` and `security-engineer` on *how* a compliance requirement is technically satisfied"). This document supplies the legal *why* and the acceptance criteria; it does not specify the mechanism.
- **FU-15(b)** — `security-engineer`'s unified secrets-management plan. Referenced as a dependency of C-2 (§5.1) but not authored here.

**Method and honesty note:** the Supabase platform facts in §3, §5 and §6.3 were established by reading Supabase's own public documentation and legal pages during this review (sources listed in §15). **No live Supabase project was inspected** — consistent with `database-design.md`'s own status line ("No live Supabase MCP access was available"). Every fact about *this platform's specific project* (region, plan, PITR, current configuration) is therefore an open item, not a finding. I have not filled any of those gaps with an assumption.

---

## 2. What Personal Information Actually Flows to Supabase

### 2.1 The identity data ADR-0002 scopes there — inventoried and classified

Combining ADR-0002's Decision section, `database-design.md`'s `app` schema, and Supabase Auth's own `auth` schema:

| Store / table | Personal information it holds | POPIA classification | Controlled by |
|---|---|---|---|
| `auth.users` | Email (primary identifier, BR-1), optional phone, password hash, confirmation/recovery token state, `last_sign_in_at`, provider metadata | **Identity PII.** Password hash is a security credential, not PI in itself, but is s19-critical. Phone is PI. | Supabase Auth (vendor-managed schema) |
| `auth.sessions`, `auth.refresh_tokens` | Session/refresh token records, typically with **IP address and user-agent** | **Behavioural/technical PII** — reveals when and from where a data subject accessed the platform | Supabase Auth |
| `auth.mfa_factors`, `auth.mfa_challenges`, `auth.mfa_amr_claims` | TOTP factor secrets, enrolment/challenge state | Security credential; enrolment fact is PII | Supabase Auth |
| `auth.audit_log_entries` | **Actor email, action, IP address, timestamp, provider traits** | **Behavioural PII** — this is an audit log of the data subject's own authentication activity | Supabase Auth (**see §6.2.1 — this is the sharpest finding in this review**) |
| `auth.one_time_tokens`, `auth.flow_state` | Short-lived verification / reset / MFA flow state tied to an account | Transient PII | Supabase Auth |
| `app.accounts` | `id` (= platform `account_id`), denormalised email, user type, account state, `invited_by`, `partner_organization_id` | **Identity PII** + authorisation attributes | Platform (`app` schema) |
| `app.account_state_transitions` | Append-only BR-5 state changes, with `actor_account_id` | **Identity + accountability PII**, including *another* data subject's identity in the actor column | Platform |
| `app.account_audit_log` | FR-12/FR-17 auth events: login success/failure, logout, reset, MFA, revocation; `attempted_identifier` on failures (an email that may not belong to any account) | **Behavioural PII**, incl. PI about non-customers who merely attempted a login | Platform |
| `app.invitations` | Invitee email, issuing admin, partner-org scope | Identity PII (of a prospective privileged user, pre-account) | Platform |
| `app.partner_organizations` | Partner-org records; likely operator-staff-adjacent | Business data + indirect PII | Platform |

**No special personal information (POPIA s26) and no children's data is in this inventory.** That is load-bearing — see §2.3.

### 2.2 Reconciliation against what Stage 1 assumed

This is the reconciliation the task asks for, and the answer is more favourable than ADR-0002 §"Data-residency and compliance exposure" implies:

| Stage 1 §9 position | Post-ADR-0002 reality | Status |
|---|---|---|
| §9.2 minimality (s10): only email + password + optional phone collected at signup | Unchanged. Supabase Auth stores exactly these fields; it does not require or invite additional collection. | **Holds unchanged.** |
| §9.2 lawful basis: s11(1)(b) contract-necessity for customers; s11(1)(c)/(f) for privileged roles | Unchanged. **Introducing an operator does not alter the lawful basis for processing** — it adds s20/s21/s72 obligations *on top of* an already-valid basis. | **Holds unchanged.** Nobody needs to re-derive the lawful basis. |
| §9.2 purpose specification (s13) and s18 notification at point of collection | **Materially incomplete.** The privacy notice Stage 1 required does not disclose a third-party processor, a foreign processing location, or which country. | **Holds, but the copy requirement expands** — see §9 and C-7. |
| §9.2(b) `deactivated` must have a real path to deletion/anonymisation | Now harder, not easier: deletion must reach a vendor-managed schema and Supabase's own soft-delete behaviour. | **Holds; two new constraints added** — §6.2.3, feeding FU-03. |
| §9.3 12-month audit-log retention with automated, evidenced purge | **Enforceable for `app.account_audit_log`** (Stage 6 designed `app.purge_expired_audit_log()` + `app.retention_purge_runs`). **Not enforceable, as designed, for `auth.audit_log_entries` or Supabase's platform logs.** | **Holds for the platform-owned log; a genuine gap for the vendor-managed one** — §6.2.1, C-4. |
| §9's implicit premise: identity data lives in a **platform-controlled store** | **Superseded.** It lives in a third-party operator's store, on AWS infrastructure, outside South Africa. | **Superseded — and this document is the replacement analysis.** |

**Net reconciliation verdict:** the **data categories** ADR-0002 sends to Supabase match Stage 1's inventory exactly. **No new category of personal information about a data subject was introduced by the identity data itself.** What changed is the *processor* and the *location* — a narrower and more tractable problem than a scope expansion would have been. That is the good news, and it is why the verdict is "with conditions" rather than "not compliant."

### 2.3 The incidental layer Stage 1 never inventoried — this is the scope expansion

Three flows carry personal information and appear in no Feature 001 document:

1. **Supabase platform logs (Logs & Analytics, Logflare-backed).** API gateway and Postgres logs carry **IP addresses and request metadata**. This is PI. Retention is plan-bound and short (Pro 7 days, Team 28 days; Free shorter). See §6.3.
2. **Auth transactional email.** Verification and password-reset messages contain the data subject's email address and a single-use token. Supabase's built-in service is dev-only, so a **third-party SMTP operator is mandatory in production**. See §5.2.
3. **Backups / PITR.** Managed by Supabase; Supabase's own GDPR guidance explicitly names backups as a factor affecting data residency. See §6.4.

**C-8** requires all three to be added to the platform's processing record (RoPA) before go-live. They are currently invisible to the compliance record, which is exactly the failure mode this role exists to catch.

### 2.4 Special personal information must stay out — and this is a hard boundary, not a preference

POPIA s26 defines **special personal information** to include **biometric information**. POPIA s57(1)(d) requires **prior authorisation from the Information Regulator** before transferring special personal information about a data subject to a third party in a **foreign country that does not provide an adequate level of protection**. Since (a) all Supabase regions are foreign and (b) POPIA has no adequacy list to appeal to, enrolling a **server-side biometric factor** into Supabase would plausibly trigger a prior-authorisation requirement — a Regulator application with an indefinite timeline, blocking launch.

**Ruling (binding on FR-24's still-open MFA factor-type decision):**

- **TOTP (authenticator app) and SMS OTP: approved.** No special PI.
- **Platform authenticators / passkeys / WebAuthn where the biometric template never leaves the user's device and only a public key is stored: approved.** The platform processes no biometric information; the device does. This must be stated explicitly in the FR-24 decision so nobody later reads "we support Face ID login" as "we process biometrics."
- **Any server-side biometric enrolment (fingerprint/face template, voiceprint) stored in or transmitted to Supabase: PROHIBITED without a fresh compliance review and, in all likelihood, s57 prior authorisation.** This is recorded as **C-9**.

The §4.4 conclusion that no s57 prior authorisation is required is **conditional on this boundary holding.**

---

## 3. Supabase's Hosting Regions — What Is Actually Available

### 3.1 There is no African region

Supabase Cloud offers **17 regions, all AWS**: `us-west-1`, `us-west-2`, `us-east-1`, `us-east-2`, `ca-central-1`, `eu-west-1`, `eu-west-2`, `eu-west-3`, `eu-central-1`, `eu-central-2`, `eu-north-1`, `ap-south-1`, `ap-southeast-1`, `ap-northeast-1`, `ap-northeast-2`, `ap-southeast-2`, `sa-east-1`. **None is in Africa.** `af-south-1` (Cape Town) was available during Supabase's alpha period and has been withdrawn for new projects, with Supabase citing operational special-casing cost; it remains an outstanding community request.

**Consequence, stated plainly so it is not rediscovered later:** *South African data localisation is not achievable on Supabase Cloud.* Any future requirement or customer commitment to keep identity data physically in South Africa is a **trigger to reopen ADR-0002**, not a configuration change. Recorded in §14.

### 3.2 Region is immutable after project creation

A Supabase project's region **cannot be changed**. The documented path is: create a new project in the target region, migrate schema/data/storage/functions, and update every URL, API key and secret pointing at the old project. Third-party auth client credentials must be re-entered by hand.

**This is why the region question blocks Stage 9, not go-live.** Every migration, RLS policy, seeded partner org, and integration secret built between now and go-live raises the cost of a region correction. Confirming the region *before* development starts is cheap; correcting it after is a migration project.

### 3.3 Ruling: what a compliant region choice looks like

**The Supabase project holding identity data must be in an EU region — `eu-west-1` (Ireland), `eu-central-1` (Frankfurt), or `eu-west-3` (Paris). `eu-west-2` (London) is acceptable but marginally more paperwork. Which of those is `cloud-infrastructure-architect`'s call on latency and cost grounds; *that it is an EU region* is mine.**

Honest reasoning, including where the argument is weaker than it looks:

- **The s72 argument does not actually turn on region.** The route we rely on (§4.3) is the binding agreement, and Supabase's DPA is the same instrument regardless of region. **A US region would not be *unlawful* under POPIA.** I am not going to overstate this.
- **What region does change is the strength and evidencability of the argument.** Supabase's own GDPR guidance states in writing that *projects hosted in EU regions keep primary database data in-region*. That is a documented, quotable in-region commitment. I have found no equivalent written commitment for non-EU regions. For a licensed insurer that must be able to *evidence* its transborder position to the Information Regulator, a documented commitment beats an inference.
- **SCC coverage is automatic and tested for EU transfers.** Supabase's DPA applies EU SCCs (plus the UK Addendum B.1.0 and a Swiss variant) automatically to EU/UK/Swiss transfers, and adapts SCCs with modifications for other jurisdictions. The EU-region path therefore sits inside the most exercised, least improvised part of the vendor's contractual machinery — which is directly what s72(1)(a)(i)'s "substantially similar" and s72(1)(a)(ii)'s onward-transfer requirements need us to demonstrate.
- **It hedges a GDPR reopening that is already on the books.** Feature 002 §12.0 recorded GDPR as *assessed and excluded, with a documented reopening trigger*. If the customer base ever includes EU data subjects, an EU-hosted identity store makes that reopening a paperwork exercise. A US-hosted one makes it a migration under §3.2's immutability constraint. Choosing EU now is the cheapest insurance available against a reopening the org has already told itself is possible.
- **There is no latency tradeoff to weigh.** SA-to-Ireland/London/Frankfurt round-trip is materially better than SA-to-`us-east-1`, so the compliance-preferred choice is not being bought with user-facing latency. This removes the usual reason to override a compliance preference. (Confirm against real measurements — `cloud-infrastructure-architect`, not me.)
- **`sa-east-1` (São Paulo) is not a shortcut.** It is a *South American* region; the naming similarity to South Africa is a genuine trap and is called out here specifically so nobody selects it by misreading.

**Deviation from an EU region requires written justification and my counter-sign.** That is the whole latitude: not "prefer EU," but "EU unless justified and re-signed."

### 3.4 OI-1 — RESOLVED 2026-08-08: platform owner confirms an EU region

**Resolution:** the platform owner has confirmed the already-provisioned Supabase project is in an EU region (`eu-west-1` / `eu-central-1` / `eu-west-3` / London, per the option offered — the platform owner did not further disambiguate which of these). **Region condition C-1 is SATISFIED in substance.**

**Residual, non-blocking action:** the **exact** region code (not just "EU") must still be recorded verbatim in the RoPA (C-8) and in the privacy-notice cross-border disclosure (C-7) — "an EU region" is not an acceptable string in either artefact; the real code (e.g. `eu-west-1`) is required. This is a documentation-completeness item, not a re-open of the compliance question, and does not block Stage 9.

Original three-way ruling, retained for the record:

| Answer | Ruling |
|---|---|
| An EU region (`eu-*`) | Region condition **satisfied**. Record the exact region code in the RoPA and in the privacy notice's cross-border disclosure. **← this is the confirmed outcome.** |
| A non-EU region | Provision a new project in an EU region and migrate before Stage 9 development writes anything to the existing project. |
| Unknown / project state unclear | Treat as non-EU until evidenced. Do not proceed to Stage 9 on an unverified region. |

### 3.5 The privacy notice must not claim data stays in South Africa

Feature 002 §12.3.6 already set this precedent for the waitlist vendor: *"the privacy notice must not claim data stays in South Africa if it does not."* It applies with more force here, because identity data is the platform's most sensitive non-location dataset. Copy requirement in §9.2, condition **C-7**.

---

## 4. Operator / Responsible-Party Framing and the s72 Transborder Analysis

### 4.1 Who is what

- **TD IT Solution Insurance is the responsible party.** It determines the purpose and means of processing account and authentication data.
- **Supabase is an operator** within POPIA's s1 definition — it processes personal information for the responsible party in terms of a contract or mandate, without itself controlling the purpose.
- **Supabase's own sub-processors** — **24 named entities as at 1 June 2026**: AWS as the underlying infrastructure provider, plus the further hosting, monitoring/tracing, security-services and internal-tooling vendors triaged at **§5.1.2** — are **further operators** in the chain. POPIA s72(1)(a)(ii) makes their onward handling *our* concern, not only Supabase's. Note that only a subset of the 24 is in or plausibly in Feature 001's identity data path; §5.1.2 does the triage rather than treating all 24 as onward recipients of customer identity data.
- **The custom SMTP provider (§5.2) is a separate, additional operator** with its own s21 contract and its own s72 basis.

The three-role framing matters: it is why executing one DPA with Supabase is necessary but **not sufficient** — the onward-transfer limb and the SMTP operator are separate obligations.

### 4.2 POPIA s20 and s21 — the written contract is mandatory

- **s20** — an operator may process personal information only with the knowledge or authorisation of the responsible party, and must treat it as confidential.
- **s21(1)** — the responsible party **must, in terms of a written contract**, ensure that the operator establishes and maintains the s19 security measures. There is no "reputable vendor" exemption. **No executed written contract = a standing s21 contravention for as long as production identity data sits there.** This is why C-2 is a hard blocker and not a paperwork nicety.
- **s21(2)** — the operator must notify the responsible party **immediately** where there are reasonable grounds to believe personal information has been accessed or acquired by an unauthorised person.

**Assessment of Supabase's DPA against s21(2):** Supabase commits to notify *"without undue delay, and where feasible, within forty-eight (48) hours, after becoming aware of any Security Incident."* Measured against POPIA's word — *immediately* — **48 hours is weaker than the statutory standard**, and Supabase will not renegotiate a standard DPA for a customer of this size. I am **accepting** this rather than treating it as a blocker, because it is market-standard and rejecting it would mean rejecting essentially every hosted vendor. But the acceptance has two mandatory consequences, both recorded as **C-6**:

1. **Our own s22 detection-to-notification budget must absorb up to 48 hours of vendor-side latency.** Our internal steps must therefore be fast and pre-scripted, not improvised.
2. **We may not rely on Supabase telling us.** Independent detection is required — which is exactly what **FU-02(c)** (the SRE monitoring/degradation hook) already exists to build. That item now carries a compliance driver, not only an availability one. I am recording that here so FU-02(c) is not descoped as "nice-to-have observability."

Supabase's DPA also provides, and I have verified as adequate: **annual audit rights** on 30 days' notice (satisfiable by recent certifications within 12 months), and **deletion of all copies of covered data after a 30-day post-termination retention period** (§6.5).

### 4.3 s72 — is the transborder flow lawful?

POPIA s72(1) prohibits transfer of personal information about a data subject to a third party in a foreign country **unless** one of five grounds applies. Assessed one by one against this specific flow:

| Ground | Available here? | Ruling |
|---|---|---|
| **s72(1)(a)** — recipient subject to a law, binding corporate rules, or **binding agreement** providing an adequate level of protection, that (i) upholds substantially similar reasonable-processing principles and (ii) includes substantially similar onward-transfer provisions | **Yes — and this is the primary basis.** Supabase's DPA is a binding agreement; it incorporates EU SCCs (and jurisdiction-adapted variants) for the (i) limb; and it addresses the (ii) limb via a published sub-processor list with a 30-day change-notice regime and flow-down obligations. **The (ii) limb has now been tested against the actual 1 June 2026 list at §5.1 and is discharged as to its contractual substance.** | **PRIMARY BASIS. Still requires C-2 (execute the DPA) to be satisfied. The (ii) limb is no longer the open half: as of 2026-08-08 the sub-processor list has been read and assessed (§5.1.4). C-3's residual is ongoing governance and evidencing, not the legal test.** |
| **s72(1)(b)** — the data subject consents to the transfer | Technically available for customers. | **REJECTED as a basis — deliberately.** See §4.3.1. |
| **s72(1)(c)** — transfer necessary for performance of a contract between the data subject and the responsible party, or pre-contractual measures at the data subject's request | **Yes, for customers only.** Aligns exactly with Stage 1 §9.2's s11(1)(b) basis: the account is a precondition to the policy the data subject is seeking, and it cannot exist without the identity store. | **SUPPORTING basis for customers. Not available for admin / support-agent / security-company-operator accounts** — they are not parties to a contract *with us as data subjects*; Stage 1 correctly based their processing on s11(1)(c)/(f), which has no s72 analogue. **For privileged-role accounts, s72(1)(a) is the *only* available ground.** That makes C-2 unavoidable rather than merely prudent. |
| **s72(1)(d)** — necessary for a contract concluded in the data subject's interest between the responsible party and a third party | Not applicable. | Not relied on. |
| **s72(1)(e)** — for the data subject's benefit where consent is not reasonably practicable | Not applicable; consent *is* practicable. | Not relied on. |

**Ruling: the transfer is lawful under s72(1)(a), supported for customers by s72(1)(c) — contingent entirely on the DPA being executed (C-2) and the onward-transfer limb being discharged (C-3).** Until then, the flow has no established basis, and that is the precise sense in which this is "compliant with conditions" and not "compliant."

#### 4.3.1 Why we are *not* using consent (s72(1)(b)) — a decision, not an omission

I expect someone downstream to propose a "I consent to my data being processed outside South Africa" checkbox at signup as the easy fix. **Do not build it.** Three reasons:

1. **It would not be freely given.** The account cannot function without the identity store. Consent that the service is conditional on is not voluntary consent, and Stage 1 §9.2 already ruled — correctly — that account creation runs on contract-necessity, not consent.
2. **It is revocable.** A withdrawn transfer consent would leave us holding data whose transfer basis has evaporated, with the only remedy being a store migration. Contract-necessity and a binding agreement do not have that failure mode.
3. **It is unbundled-consent theatre.** Stage 1 §9.2 was explicit that consent is reserved for genuinely optional processing (e.g. marketing), and Feature 002 §12.3.4 reinforced it. Adding a transfer checkbox devalues the one consent mechanism we do use for something real.

**Ruling: no cross-border consent checkbox. The transfer is disclosed (s18 notification), not consented to.** The distinction is legally material and must survive into the UI copy — see §9.2.

### 4.4 s57 prior authorisation — not required, conditionally

POPIA s57(1) requires prior authorisation from the Information Regulator for certain processing, including (d) transferring **special** personal information about a data subject to a third party in a foreign country not providing an adequate level of protection.

**Ruling: no s57 prior authorisation is required for Feature 001** — the inventory in §2.1 contains no special personal information (s26) and no children's data, and Feature 001 processes no unique identifiers for cross-responsible-party linking, no criminal-behaviour data and no credit-reporting data.

**This ruling is conditional on §2.4's boundary holding (C-9).** If a server-side biometric MFA factor is ever enrolled into Supabase, s57 is back on the table and launch timing becomes dependent on a Regulator application.

### 4.5 GDPR — assessed, still excluded, but the exclusion now costs less to reverse

Consistent with Feature 002 §12.0, **GDPR does not currently apply**: no EU establishment, and no confirmed offering of services to, or monitoring of, EU data subjects. Hosting data in an EU AWS region **does not by itself trigger GDPR** — GDPR's territorial scope turns on establishment and on targeting/monitoring data subjects, not on server location.

The material change: adopting an EU region per §3.3 means that if the reopening trigger Feature 002 recorded ever fires, the response is contractual and documentary rather than a store migration. That is a real, cheap option value, and it is part of why EU is the ruling.

### 4.6 Insurance-regulatory dimension — outsourcing, not data protection

Per Feature 002 §12.5 and `09-business-continuity-policy.md` §5, TD IT Solution Insurance holds (or requires) an insurer licence under the **Insurance Act 18 of 2017** and an FSP licence under **FAIS**. Supabase is now a **material outsourced service provider** for the platform's most-depended-upon service (BCM §2.1 item 4). The Prudential Authority / FSCA **Joint Standards** carry board-accountable expectations on IT governance, cyber-resilience, and oversight of material outsourced providers.

This is **not** a Feature 001 gate and I am not turning it into one. But it is a real obligation that presently has no owner. Recorded as **C-11** (a pre-go-live vendor-governance register item) and escalated to `cto`, alongside the independent-control-function gap BCM §4.7 already flagged honestly. This review will not pretend an outsourcing-governance framework exists.

---

## 5. Sub-Processors and the Onward-Transfer Limb

### 5.1 Supabase's sub-processors — list obtained and analysed (OI-2 RESOLVED 2026-08-08)

Supabase's DPA does not enumerate sub-processors inline; it **incorporates by reference** a published Sub-processor List (currently dated 1 June 2026), with a commitment to at least **30 days' notice** before changes. The DPA also states that covered data may be processed *"anywhere that Supabase or its Sub-processors maintain facilities,"* with the customer able to request specific regions for storage and primary processing — which is exactly why §3.3's region ruling and §6.3's out-of-region-logging question are separate problems.

AWS is the underlying infrastructure provider for Supabase Cloud (the region codes in §3.1 are AWS region codes).

#### 5.1.0 Provenance of this analysis — stated, not glossed

The original OI-2 was raised because the list is published as a PDF whose text this role could not extract. **That extraction limitation was real and has not changed.** The list's contents were supplied verbatim to this review on 2026-08-08 by the orchestrating `cto` thread, which fetched and read the published PDF at `https://supabase.com/legal/subprocessor-list/June-1-2026.pdf` directly. I am treating that as a reliable read of the published document and analysing it as such — but I am recording the provenance rather than implying I extracted it myself, because §1's method note commits this document to that standard. **Practical consequence for C-3's owner:** when a 30-day change notice arrives, the new list must be re-read **at source**, and whoever does it should record that they did. A list analysed once by relay is a point-in-time fact, not a monitoring control.

#### 5.1.1 The list as published, 1 June 2026 — 24 entries

Reproduced in full because it is the evidence the RoPA entry (C-8) must be built from, and because a link to a PDF is not an audit record:

| Sub-processor (as named) | Processing description (as stated) |
|---|---|
| Supabase, Inc. | Provision of support services |
| Active Campaign, LLC d/b/a Postmark | Communication with Authorized Users in connection with the Services and support |
| Amazon Web Services, Inc | Provision of hosting services |
| Atlassian Corporation Plc | Provision of status page services |
| Braintrust Data, Inc | Provision of monitoring and tracing |
| Clay Labs Inc. | Provision of customer insight services |
| Clazar, Inc | Provision of marketplace services |
| Cloudflare, Inc | Provision of hosting services |
| ConfigCat Korlátolt Felelősségű Társaság | Feature flagging |
| Google, LLC | Provision of hosting services |
| Fly.io, Inc | Provision of hosting services |
| FrontApp, Inc | Communication with Authorized Users in connection with the Services and support |
| Functional Software, Inc d/b/a Sentry | Error monitoring and tracing |
| Github, Inc | Authorized Users account authentication |
| Hex Technologies, Inc | Provision of data analytics services |
| Hubspot, Inc | Communication with Authorized Users in connection with the Services and support |
| Notion Labs, Inc | Communication with Authorized Users in connection with the Services and support |
| Sublime Security Inc | Email Security |
| Latacora, LLC | Managed Security Service Provider |
| OpenAI, LLC | Provision of natural language processing and generation services |
| PandaDoc, Inc | Communication with Authorized Users in connection with the Services and support |
| Slack Technologies, LLC | Communication with Authorized Users in connection with the Services and support |
| Upstash, Inc | Provision of serverless data hosting services |
| Vercel, Inc | Provision of hosting services |

**What the list does not contain, and this matters for how much weight it can carry:**

1. **No processing locations or countries for any entry.** Not one. The document is names plus one-line purposes.
2. **No data categories per sub-processor.** Nothing says which of these ever sees database contents versus only Supabase's own corporate data.
3. **No mapping to product surface.** Nothing distinguishes a sub-processor in the Postgres/Auth data path from one supporting the marketing site, the dashboard, or Edge Functions.

I am **not** going to fill those three gaps by inference and present the result as a finding. Where I reason about likely roles below, it is labelled as reasoning, and where the answer genuinely cannot be determined, I say so.

**On entity suffixes as evidence of location:** most named entities are US-incorporated (`Inc` / `LLC`); ConfigCat is a Hungarian *korlátolt felelősségű társaság*, i.e. EU-domiciled. **Incorporation is not processing location.** AWS, Inc. is a Delaware company operating the Frankfurt and Dublin regions; a US-domiciled entity can process entirely within the EU, and an EU-domiciled one can host in the US. Reading the suffixes as a residency map would be exactly the kind of silent assumption this role exists to catch. What the suffixes *do* tell us is which **legal entity and home jurisdiction controls** each operator — a different question, addressed at §5.1.4.

#### 5.1.2 Relevance triage against Feature 001's identity data

The question that matters is not "how many sub-processors are there" but "which of these could touch `auth.users`, `auth.sessions`, `auth.audit_log_entries`, `app.accounts`, or the request metadata around them." Three buckets.

**Bucket A — in, or plausibly in, the identity data path. These are the entries that matter for this feature.**

| Entry | Assessment |
|---|---|
| **Amazon Web Services, Inc** | **Certainly in path.** AWS is the substrate of every Supabase Cloud region (§3.1), including the EU region confirmed at §3.4. Already inventoried at §4.1. The EU-region in-region-primary-data commitment (§3.3) is, in substance, a commitment about *which AWS region*. |
| **Cloudflare, Inc** | **Very likely in path** for request metadata. Described as hosting; in practice an edge/CDN/DNS/WAF layer of this kind sits in front of API endpoints and sees source **IP addresses** and request metadata — the same PI category as §2.3's platform logs. Whether it terminates TLS for the Auth/API endpoints our clients hit is a technical question for `cybersecurity-architect`, not a legal one, but the answer changes how much PI it sees. |
| **Google, LLC · Fly.io, Inc · Vercel, Inc · Upstash, Inc** | **Cannot be determined from the list.** All four are described as hosting / serverless-data-hosting. That description is broad enough to cover either (a) Supabase's own website, docs, dashboard, Edge Functions runtime and queue/cache tiers, or (b) some part of a customer project's data path. My reasoning — labelled as reasoning — is that the primary Postgres and Auth path for an EU project runs on AWS per §3.3's documented in-region commitment, and these four are more likely peripheral platform tiers. **That is an inference, not a finding**, and it is exactly why OI-7 exists. |
| **Functional Software, Inc d/b/a Sentry · Braintrust Data, Inc** | **The sharpest entry in this triage.** Error monitoring and tracing sit *downstream of exceptions*, and exception payloads from an auth service are a classic PII leak surface: an email address embedded in an error message, a source IP in request context, a stack frame containing a request body, or — worst case — a password-reset or verification token captured from a URL or header in a traced request. This is **Supabase's own** monitoring of its platform, so **we do not control the scrubbing configuration**, cannot audit it, and cannot assert that it is adequate. Folded into **OI-3**'s written enquiry (§6.3), which is now broadened from "logging and backup" to "logging, tracing and backup". |
| **Latacora, LLC** | **Not dismissible as back-office.** A managed security service provider has, by the nature of the engagement, privileged visibility into the provider's security telemetry — which is derived from infrastructure and application logs, which carry IP addresses. This is a legitimate and arguably risk-*reducing* vendor (an MSSP is evidence of s19-relevant maturity, not a red flag), but it belongs in Bucket A rather than being filed with Slack, because "sees security telemetry" is not "sees no personal information". |
| **Supabase, Inc. — support services** | In path in the sense that support staff can, on a support engagement, see project data. Note also what its *presence on its own sub-processor list* implies: the contracting counterparty under our DPA may be a different Supabase legal entity from Supabase, Inc. See §5.1.4 and the addition to C-2. |

**Bucket B — the "Authorized Users" plane: Supabase's own vendor-communication and internal-tooling stack. Not a data-flow concern for customer identity data — but not "no personal information" either.**

Postmark (Active Campaign, LLC), FrontApp, HubSpot, Notion Labs, PandaDoc, Slack, Atlassian (status page), Clay Labs (customer insight), Clazar (marketplace), Hex Technologies (data analytics), Sublime Security (email security).

**Ruling: these are out of scope as a customer-identity-data flow.** Every one of them is described as processing in connection with **communication with Authorized Users**, status/marketplace/analytics on Supabase's own commercial relationship, or Supabase's own email security. None of these descriptions reaches into a customer project's database. For the purpose of §2.1's inventory and the RoPA's identity-data entry, they are **not** onward recipients of our customers' identity data and should not be listed as such — over-listing is its own accuracy failure.

**One honest qualification, which is not a condition but must not be silently dropped:** "Authorized Users" means *our own people* — the engineers and administrators who hold Supabase accounts, open support tickets, and sign documents. Their **names, work email addresses and support-ticket contents are personal information**, about our staff rather than our customers. It is low-sensitivity business-contact PI, it is covered by the same executed DPA (C-2), and it needs no separate instrument. It gets one accurate sentence in the RoPA — *"Supabase processes limited business-contact information about the platform's own authorised administrators through its support and communication vendors"* — rather than either an alarmed treatment or an omission. Note in particular that **support-ticket contents can quote real data**; the operational corollary is that our staff must not paste customer identity data into Supabase support tickets, Slack threads, or shared documents. That is a handling rule for `cybersecurity-architect`'s operational guidance, and I am recording it here so it is not discovered during an incident.

**Bucket C — unclear or requiring their own treatment.**

| Entry | Assessment |
|---|---|
| **Github, Inc — "Authorized Users account authentication"** | **This is Supabase's own staff/customer-dashboard authentication — the GitHub OAuth path by which a person signs into the Supabase dashboard. It is NOT our customers' authentication, and the two must never be conflated.** Feature 001's customers authenticate against Supabase Auth with email/password + MFA (FR-1 … FR-24); GitHub has no role in that and receives none of our customers' identity data. **However**, there is a real derived finding in the other direction: if *our* engineers and administrators reach the Supabase dashboard — which is a privileged path to the entire identity store — via GitHub accounts, then **GitHub becomes an authentication dependency for privileged access to production identity data**. That is a security-posture matter for `cybersecurity-architect` and `security-engineer` (mandatory MFA on those GitHub accounts, no shared or personal accounts, offboarding coverage, and preferably SSO), not a customer-data-flow matter. Handed over as such; it is not a compliance condition, but it should not be lost because it was found in a compliance document. |
| **ConfigCat Kft. — feature flagging** | Acts on Supabase's own product configuration. EU-domiciled, which is neutral-to-helpful. Feature-flag SDKs can receive a user/tenant identifier for targeting, so a project or organisation identifier reaching it is conceivable; a customer's email or session is not, on this description. **Low concern, no condition.** Named here rather than buried so that a future change notice about ConfigCat's role is assessed rather than waved through. |
| **OpenAI, LLC** | Treated separately and explicitly at **§5.1.5**. Not bucketed with the communication-and-support vendors. |

#### 5.1.3 Applying the s72(1)(a)(ii) test to what the list actually shows

s72(1)(a)(ii) requires the binding agreement to include **onward-transfer provisions substantially similar to** POPIA's own. Broken into what that concretely demands, and assessed:

| Requirement of a "substantially similar" onward-transfer regime | Evidenced? |
|---|---|
| The onward recipients are **identified**, not left open-ended | **Yes.** A named, dated (1 June 2026), versioned list of 24 entries, incorporated by reference into the DPA. This is materially better than the "may use affiliates and subcontractors" formulation that would fail this limb. |
| Substantially the same data-protection obligations **flow down** to each onward recipient | **Yes, contractually** — per §4.3, via the DPA's flow-down obligations and the SCC machinery it incorporates. This is the load-bearing element and it is present. |
| The responsible party gets **notice of change**, with a route to object or exit | **Yes.** 30 days' advance notice. Whether we *use* it is C-3's residual, not the DPA's defect. |
| The prime operator remains **liable** for its sub-processors' acts | **Not separately verified clause-by-clause in this review.** SCC-based DPAs standardly provide this and I have no reason to think Supabase's does not, but I have not quoted the wording, so I am not recording it as verified. **Added to C-2:** whoever executes and files the DPA must confirm the sub-processor-liability wording at the same time. It is a five-minute read while the document is already open. |

**Ruling: the s72(1)(a)(ii) onward-transfer limb is DISCHARGED as to its contractual substance.** The published list plus the flow-down obligations plus the 30-day change-notice regime are, together, what makes §4.3's primary basis workable — exactly as §4.3 anticipated. Reading the list has confirmed that anticipation rather than disturbed it.

#### 5.1.4 The US-preponderance question — a further onward transfer, and which kind of gap it leaves

Now the harder test, which is the one the list actually forces. §3.3/§3.4 secured an **EU region**, and §3.3's argument for it was evidencability: Supabase commits in writing that EU-region projects keep **primary database data** in-region. The sub-processor list shows that the operators standing behind that region are **predominantly US-domiciled entities**. Two things must be kept apart, and conflating them is how this analysis goes wrong in either direction:

- **(a) Where processing physically occurs.** Unknown for every entry, because the list states no locations. This is **OI-7**.
- **(b) Which entity, under which home jurisdiction, controls the operator.** Knowable from the list, and predominantly the United States. A US-incorporated operator running EU-located infrastructure still means personal information is under the control of an entity subject to US legal process.

**Ruling on (b) under POPIA: the US preponderance does not defeat s72(1)(a)(ii), and I am not going to manufacture a finding that it does.** POPIA s72(1)(a) is a **contractual-adequacy** test — does a binding agreement impose substantially similar principles and onward-transfer terms. It is not a governmental-access test. POPIA has **no adequacy-decision list** (§4.3 already established this and it cuts in our favour here), and there is no South African equivalent of the Schrems line of jurisprudence that would require a transfer-impact assessment of US surveillance law before relying on contractual safeguards. The DPA's SCC coverage (§4.2/§4.3) is what carries the legal weight for these US entities, and it carries it **regardless of which facility the bytes sit in.**

**Where this does bite, and it is worth stating now rather than being surprised later:** if the GDPR reopening trigger recorded at §4.5 and Feature 002 §12.0 ever fires, question (b) stops being neutral. Under GDPR, onward transfers to US-controlled processors sit inside the Schrems II / transfer-impact-assessment framework, and "we have SCCs" becomes the *start* of the analysis rather than the end of it. §3.3's EU-region choice was already the hedge; this adds that **the hedge is about the primary store, not the sub-processor chain** — an EU region does not make Supabase's US-domiciled sub-processor chain a GDPR non-issue. Added to §14's revisit triggers.

**Categorisation of the residual, since the task of this document is to be clear about which kind of gap each item is:** the absence of processing locations from the list is a **completeness and evidencing gap, not a lawfulness gap.**

- *Not lawfulness*, because the s72(1)(a) basis does not depend on facility location. It depends on the binding agreement, which exists and which covers the chain. An unknown facility location cannot un-do a contractual basis.
- *But genuinely a completeness gap*, and not a cosmetic one, for two reasons that both have owners. First, the RoPA (C-8) is supposed to record processing locations; "unstated by the vendor" is an acceptable entry, "Ireland" invented by us is not. Second, §9.2's privacy-notice copy and §9.3's prohibitions bind me not to assert a processing geography I cannot evidence — the same discipline §6.3 already applied to the logging tier. A licensed insurer that tells the Information Regulator "our operator's sub-processors are in the EU" without evidence has made a false statement about a transborder transfer, which §9.3 already rates as worse than a missing one.

**I will not invent locations.** Recorded as **OI-7**, answerable only by Supabase in writing, and folded into the same written enquiry as OI-3 and OI-4 to avoid three separate approaches to the same vendor.

#### 5.1.5 OpenAI on the sub-processor list — flagged explicitly, and not bucketed with the support vendors

**OpenAI, LLC appears on the list with the single description "Provision of natural language processing and generation services."** I am giving this its own subsection because the alternative — filing it quietly alongside HubSpot and Slack as another vendor-communication tool — would be the exact kind of silent bucketing this role is supposed to prevent.

**Can I determine from the list alone whether OpenAI touches identity or authentication data? No. Plainly, no.** The entry gives a purpose category and nothing else: no product surface, no data categories, no indication of whether any customer database content, auth event, or support-ticket attachment ever reaches it. Anyone who tells you the list shows OpenAI is "just for the docs chatbot" is reading something the document does not say. The list establishes exactly one fact: **Supabase has a contractual relationship with OpenAI that it considers a sub-processing relationship** — meaning Supabase itself contemplates that *some* covered data may reach it. That is the whole of what is established.

**Why this is materially different from the other infrastructure entries, and why it does not get averaged into them:**

- The hosting and monitoring entries process our data **as a substrate**, under an ordinary hosting/telemetry contract, in a way whose data flow is at least in principle describable.
- An LLM provider processes content **as input to a generative model**. That raises questions the other entries do not: whether inputs are retained, whether they are used for training or evaluation, whether prompts are logged, whether samples are subject to human review, and — the awkward one — the **non-determinism of what actually gets sent**, since what lands in a prompt depends on what a feature decided to include at runtime rather than on a fixed schema.
- Under POPIA the relevant exposures are **s10 minimality** (an LLM feature that sends more context than needed), **s14 retention** (prompt/completion logs are a new retention surface nobody has inventoried, cf. §6.2.1's finding about a second uncontrolled copy), and **s19/s20** confidentiality.
- Most plausibly — and this is labelled as reasoning — the relevant surface is a **dashboard/Studio AI assistant or a docs/support assistant**, which would be triggered by **our own staff**, on our own initiative. If that is the answer, the risk is *controllable by us*, which is the good outcome: it becomes an internal handling rule rather than a vendor negotiation. If instead an LLM sits in a non-optional platform path that touches auth data, that is a material finding on the §6.2.1 pattern, requiring escalation to `cto` with real options and **not** silent acceptance.

**Two things follow, and I am adding a condition rather than force-fitting this into C-3, because C-3 is a documentation-and-monitoring condition and this is a prohibition:**

- **OI-8** — establish from Supabase **in writing** which product surfaces route data to OpenAI, whether any customer project database content, `auth`-schema content, or project schema/metadata can reach it, whether it is opt-in or default-on, and what retention applies to prompts and completions.
- **C-12 (standing prohibition, effective immediately — including during Stage 9, not only at go-live).** Until OI-8 is answered in writing: **no Supabase AI-assistant / LLM-backed feature may be enabled or used against the project holding identity data**, and no identity data, `auth`-schema contents, production schema dumps, or support-ticket attachments containing either may be submitted to any such feature. This is deliberately shaped like **C-10** (the log-drain prohibition) because it is the same species of risk: a feature that is one click away from creating an undocumented transborder flow to a new operator, wired up by a well-meaning engineer during development. Cheap to hold, expensive to discover afterwards.

#### 5.1.6 What is left of C-3

Discharged: **obtaining and reading** the list (OI-2), and the **s72(1)(a)(ii) legal assessment** (§5.1.3). C-3 is consequently **no longer a Stage 9 blocker.**

Still open, and these are **process and ownership items, not reading items** — which is precisely why they cannot be closed by this document, and why they are unlikely to be closed without `integration-architect` picking them up:

1. **Record all 24 entries in the RoPA** (C-8), with locations recorded honestly as *"not stated in the published sub-processor list — see OI-7"* rather than inferred, and with the Bucket A / Bucket B distinction preserved so the RoPA does not imply that Slack receives customer identity data.
2. **Subscribe to Supabase's sub-processor change notifications** at an address that is monitored by a role, not a person who may leave.
3. **Assign a named standing owner** to assess each 30-day change notice against this review, with §14's trigger list as the test. **A 30-day notice regime with nobody reading the notices satisfies nothing** — that sentence was true when C-3 was written and it is still the live half of the condition.
4. **Confirm the DPA's sub-processor-liability wording** when C-2's executed copy is filed (§5.1.3).

**Owner:** `compliance-specialist` for the RoPA content and the assessment standard; **`integration-architect` for the subscription and the standing ownership**, consistent with BCM §4.6's vendor-relationship ownership. Escalate to `cto` if no named owner is assigned by go-live, because an unowned monitoring obligation is indistinguishable from no monitoring obligation.

### 5.2 The SMTP operator — a mandatory new vendor nobody has named

Supabase's built-in auth email service is **explicitly not for production**: it is limited to roughly **2 emails per hour**, and it refuses to deliver to addresses that are not part of the project's team. Supabase's own production checklist requires custom SMTP.

**Therefore FR-3 (verification challenge), FR-15/FR-16 (reset links) and FR-6/FR-7 (invitations) cannot function in production without a third-party SMTP provider.** That provider will process:

- the data subject's **email address**, and
- a **single-use verification or password-reset token** — i.e. a credential that, in transit, is equivalent to temporary account access.

That is a genuinely sensitive flow, and it currently exists in **no** Feature 001 artefact: not Stage 1 §9, not ADR-0002, not `backend-approach.md`, not `database-design.md`, not `api-design.md`.

**C-5 (blocks go-live, and blocks the verification/reset flows from being enabled against real users):**

1. SMTP provider selected, with **EU or South African hosting preferred**, on the same reasoning as §3.3.
2. **Written operator contract / DPA executed** (POPIA s21) and a **s72 basis recorded** — same s72(1)(a) analysis, run against that vendor.
3. Provider's **own log/message retention** configured to the minimum the service permits, and documented. Message logs containing reset links must not be retained indefinitely by the vendor.
4. Added to the RoPA and to the privacy notice's list of processor categories.
5. Reviewed by `compliance-specialist` **before** selection is finalised, not after — the same discipline Feature 002 §12.3.6 imposed on the waitlist vendor, and for the same reason.

**Ownership:** `integration-architect` (vendor relationship, per BCM §4.6) + `notification-engineer` (per Stage 1 §5's "minimum viable email/SMS send"), reviewed by `compliance-specialist`.

### 5.3 Log drains — pre-emptive prohibition

Supabase offers log drains to external observability tools. **Enabling a log drain to any third-party destination sends IP-address-bearing logs to a new operator** and requires its own s21 contract and s72 basis. **C-10: no log drain may be enabled without a compliance review.** Recorded now, before someone wires one up during Stage 14 monitoring work and creates an undocumented transborder flow.

---

## 6. Retention and Deletion — Does Supabase Need the Same 12-Month Policy, and Can It Be Enforced There?

This is the core of the task's fourth question. The answer is **three-layered**, and only one layer is currently handled.

### 6.1 Layer 1 — the platform-owned audit log (`app.account_audit_log`): enforceable, and re-confirmed

**Ruling: the 12-month retention-and-purge policy from Stage 1 §9.3 is RE-CONFIRMED for `app.account_audit_log`, and the Stage 6 design is adequate in principle.**

`database-design.md` §6 already implements what §9.3 required: `app.purge_expired_audit_log()` deleting rows older than 12 months excluding `legal_hold = true`, writing a meta-audit row to `app.retention_purge_runs`; a partial index (`account_audit_log_created_at ... where legal_hold = false`) sized to the purge query; and `on delete set null` on `account_id` so the audit trail survives the account it describes. That is exactly the automated-and-evidenced enforcement this role requires rather than a policy statement.

Two residual requirements to close it out:

- **C-4(a):** the purge function must be **scheduled** and its schedule verifiable. A function that exists but is never invoked is a policy-only control. `pg_cron` in Supabase or a Render cron/background worker (available per ADR-0003's rationale) both work; `database-architect` + `devops-engineer` choose. Evidence of scheduled execution is a Stage 13 deployment-verification item, and absence of evidence is a go-live blocker.
- **C-4(b):** the `legal_hold` carve-out needs an **operational path to set it** — who flags a record, on what authority, and how the hold is later lifted and logged. A boolean column with no process behind it is not a legal-hold mechanism. Owner: `compliance-specialist` (process) + `backend-architect` (surface).

#### 6.1.1 Discharging Stage 1 §9.3's "re-confirm against insurance-recordkeeping minimums"

Stage 1 §9.3 flagged that industry recordkeeping minimums might impose a **longer floor** than POPIA's ceiling, requiring reconciliation at Stage 8. **Ruling:**

- FAIS General Code of Conduct and Insurance Act / Policyholder Protection Rules recordkeeping obligations attach to **records of financial services rendered, advice given, transactions, policies and claims** — the substance of the insurer's dealings with a policyholder.
- **Authentication telemetry — failed login attempts, MFA challenge outcomes, session revocations, rate-limit trips — is a security-operations record, not a record of a financial service rendered.** No multi-year FAIS recordkeeping floor attaches to it.
- **Therefore 12 months stands for `app.account_audit_log`.** No extension required, and extending it would work *against* s14.

#### 6.1.2 FU-04 direction: `app.account_state_transitions` must run on a different clock

`database-design.md` already anticipated this, keeping state transitions in a separate table precisely so they could carry a different retention. **Direction (FU-04 remains formally open, due Stage 8 exit):**

`app.account_state_transitions` records **who did what to a policyholder's account** — an admin suspending an account, a deactivation, an actor identity. That sits materially closer to the insurer's accountability-record line than login telemetry does, and it is the record you would need to reconstruct a disputed account action years later.

**Expect a period materially longer than 12 months for state transitions, aligned to whatever policy/claims record-retention floor the Insurance Act / FAIS analysis produces — not to the 12-month security-telemetry clock.** I am not fixing the number in this document because it has a hard dependency:

**Dependency:** the FAIS/Insurance Act retention floor cannot be determined until the **licence category question in Feature 002 §12.5.1 is answered by the platform owner** (insurer licence details and FSP number/category, both still outstanding as a recorded pre-production blocker). Recorded as **OI-6**. It does not block Stage 9 — but `database-architect` should not build a purge job for `account_state_transitions` on a guessed number, and should build the purge mechanism **parameterised by table** rather than hardcoding 12 months, so the FU-04 ruling drops in without a schema change.

### 6.2 Layer 2 — Supabase Auth's own `auth` schema: the same policy applies, and it is NOT currently enforceable

**This is the sharpest finding in this review.** `backend-approach.md` §"audit log" correctly ruled that the compliance-grade audit log must be a **backend-owned, purgeable store**, "never assumed to inherit Supabase's own undefined internal retention." That ruling is right. But it addressed where *our* log is written; it did **not** address the fact that **Supabase Auth writes its own log anyway, and we cannot turn it off.**

#### 6.2.1 `auth.audit_log_entries` — an unbounded second copy of PI we have already committed to purging

Supabase Auth (GoTrue) maintains `auth.audit_log_entries`, containing **actor identity (including email), action type, IP address and timestamp** for authentication events. That is personal information, and it is substantially the same event data our 12-month policy governs. Supabase exposes **no configurable retention control** for it, and the `auth` schema is vendor-managed — Supabase's guidance is not to modify it, and unsupported modifications risk breaking on platform upgrades.

**Ruling: POPIA s14 applies to this table exactly as it applies to ours. A vendor writing the log does not make the responsible party's retention-limitation obligation disappear.** Holding an unbounded, never-purged log of data subjects' authentication activity in a third-party store, while simultaneously publishing a 12-month retention policy, is both an s14 exposure and a **misrepresentation of our own policy** — the worse of the two problems.

**C-4(c) — mandatory, and new (specified by neither ADR-0002 nor Stage 6):**

1. **First**, establish from Supabase in writing whether any retention or purge applies to `auth.audit_log_entries`, and whether deleting rows from it is supported. Recorded as **OI-4**. Ask before acting on a vendor-managed schema.
2. **If unbounded and deletion is supported (or tolerated):** Identity Service runs a scheduled purge of `auth.audit_log_entries` older than **12 months**, using the same cadence and writing to the same `app.retention_purge_runs` meta-audit table, so one retention story covers both logs. **Design and upgrade-safety review by `database-architect` + `security-engineer`** — this is the one place in this review where I am specifying a change inside a vendor-managed schema, and it must not be done casually.
3. **If deletion is genuinely unsupported:** that is a **material finding**, not an acceptable residual. Escalate to `cto` with three options — (i) mirror-and-minimise (export what we need to `app.account_audit_log`, then purge upstream); (ii) obtain a written retention commitment from Supabase; (iii) treat it as a residual risk requiring a documented, `cto`-signed risk acceptance per `06-security-standards.md`'s governance model. **Silent indefinite retention is not one of the options.**

#### 6.2.2 `auth.sessions`, `auth.refresh_tokens`, `auth.one_time_tokens`, `auth.flow_state`

FR-13/FR-17/FR-22 handle the *security* requirement (immediate invalidation). Retention is a separate question: revoked and expired session rows typically carry **IP address and user-agent**, so a retained row is retained behavioural PII with no remaining purpose once the session is dead.

**C-4(d):** verify empirically whether revoked/expired rows in these tables are actually **deleted** or merely marked. If retained, they fall under the same 12-month ceiling — and for transient flow/one-time-token tables, a far shorter period (days) is the only defensible one, since their purpose is exhausted on use or expiry. Owner: `authentication-engineer` + `database-architect`; verification is a Stage 9/10 test item, and the result must be recorded, not assumed.

#### 6.2.3 Two Supabase-specific constraints handed to FU-03 (deletion vs. anonymisation)

I am not pre-empting FU-03, but it must respect these:

- **Supabase's admin user-deletion supports a soft-delete mode (`deleted_at`). Soft delete is NOT deletion for POPIA purposes.** Whichever way FU-03 lands, "soft-deleted in `auth.users`" may never be recorded as satisfying an erasure request. If the ADR-0004 pattern is anonymise-in-place, the anonymisation must actually overwrite the identifying fields in `auth.users` (email, phone) — not merely set a flag.
- **The `on delete cascade` from `auth.users` → `app.accounts` that `data-model-approach.md` proposed is a hard-delete path in a *vendor-triggered* direction.** A deletion initiated in the Supabase dashboard (or by a support action, or by a future vendor tool) would cascade-destroy `app.accounts` rows without passing through any platform code, any audit event, or `app.account_state_transitions`. From a compliance standpoint that is worse than the orphaned-reference problem it was meant to solve: it destroys the accountability record of the deletion itself. **`architecture-review.md` already flagged the tension; this review adds that the vendor-triggered-path risk should weigh decisively against `cascade`.** FU-03 owns the final ruling.

### 6.3 Layer 3 — Supabase platform logs: shorter than 12 months (fine), possibly out-of-region (not fine until answered)

Supabase's Logs & Analytics is Logflare-backed and retention is **plan-bound**: Pro **7 days**, Team **28 days**, Free shorter still. These logs carry **IP addresses and request metadata** — personal information.

Two findings:

1. **Short retention is not an s14 problem — shorter is better.** But it has a consequence that must be stated so nobody trips over it: **Supabase platform logs may never be cited as satisfying FR-12's audit-logging requirement.** They expire in days, they are not purge-controlled by us, and they are not queryable via `GET /v1/admin/audit-log`. `app.account_audit_log` is the record of FR-12 compliance. This closes off a shortcut somebody would otherwise take at Stage 9 ("Supabase already logs this").
2. **OPEN ITEM OI-3 — residency of the logging, tracing and backup layer is unknown.** Supabase's own GDPR guidance explicitly warns that *"backups, logs, data exported to external systems, Edge Function execution, and sub-processors"* affect data residency and the international-transfer analysis — and does **not** state that the Logflare-backed logging tier sits in the project's primary region. It is therefore **likely** that some IP-address-bearing personal information is processed outside the chosen primary region even with an EU project.

   **OI-3 is broadened as of 2026-08-08 to cover tracing, on the strength of §5.1.2's Bucket A finding.** The sub-processor list names **Sentry** (error monitoring and tracing) and **Braintrust Data** (monitoring and tracing). Exception and trace payloads from an authentication service are a well-known PII leak surface — an email in an error message, a source IP in request context, a request body in a stack frame, or a verification/password-reset token captured from a URL or header. This is **Supabase's own** platform monitoring, so we cannot configure or audit its scrubbing. The same written enquiry must therefore ask: **what personal information can appear in error/trace payloads sent to Supabase's monitoring sub-processors, what scrubbing is applied, and what retention applies there.** The answer feeds both the RoPA (C-8) and — if tokens can be captured — a genuine s19 question for `cybersecurity-architect`, not merely a disclosure one.

**C-8 consequence:** this must be **asked of Supabase in writing before go-live**, and the honest answer reflected in both the RoPA and the privacy notice. If logging is out-of-region, the s72(1)(a) basis still covers it (the DPA and its sub-processor regime are region-agnostic), so this is very likely a **disclosure-accuracy** problem rather than a lawfulness problem — but I will not sign a privacy notice that asserts "your data is processed in the EU" if operational logging goes elsewhere. Accuracy of disclosure is this role's copy authority and I am exercising it.

### 6.4 Backups — deletion has a tail, and the retention policy must say so

Supabase-managed backups and PITR are the platform's stated backup strategy (BCM §7). Two compliance consequences:

- **A purge job does not purge backups.** The retention policy must state this honestly: *"records are deleted from the live store within 12 months; residual copies persist in encrypted backups until the backup retention window expires."* This is a normal, defensible position under s14 — but only if it is **stated**. An undisclosed backup tail behind a published 12-month deletion promise is a misrepresentation, which is the failure mode this role treats most seriously (see Feature 002 §12.8's precedent on not asserting what isn't true).
- **Backup residency is part of OI-3**, per Supabase's own warning above.
- **FU-11 (PITR availability on the current plan) now carries a compliance dimension**, not only RPO/RTO. See §7.

### 6.5 Termination

Supabase's DPA provides a **30-day post-termination retention period** during which the customer may request return of covered data, after which Supabase deletes all copies processed by it or its authorised sub-processors. **Assessment: adequate.** Record it in the RoPA (C-8) and reference it in the exit-plan section of the vendor register (C-11). No condition beyond documentation.

---

## 7. Plan / Tier Is a Compliance Variable, Not Just a Cost Variable

Recorded because it will otherwise be treated as purely a `cto` budget question:

- The **DPA appears to be available to all organisations regardless of plan** — so **plan is not a blocker for lawfulness**. Good news, and it means C-2 can be satisfied immediately at no cost.
- But **s19 requires "appropriate, reasonable technical and organisational measures"** — a standard that is read against the sensitivity of the data and the nature of the responsible party. For a **licensed insurer** whose identity store holds the keys to **real-time asset location** (`06-security-standards.md` §"Data protection & privacy": location data reveals customer behaviour patterns), a Free-tier production identity store — no PITR, shortest log retention, projects that pause on inactivity, SOC 2 report gated behind Team plan — is a posture I do not consider defensible to the Information Regulator.

**Ruling: compliance does not mandate a specific plan, and I am not going to invent one. But a Free-tier production identity store is not a posture `compliance-specialist` will sign off at go-live. A paid tier with point-in-time recovery is the floor.** This is a cost decision, so it is **escalated to `cto`**, ties directly to **FU-11**, and squarely hits **ADR-0002's own revisit trigger** ("the platform owner's Supabase project relationship changes... in a way that affects cost, control, or compliance posture"). Recorded as **OI-5** (what tier is the project on, and is PITR available) and folded into C-11.

---

## 8. Breach Notification — What Changes Because of This Decision

POPIA **s22** requires the responsible party, on reasonable grounds to believe personal information has been accessed or acquired by an unauthorised person, to notify **both the Information Regulator and the affected data subjects**, **as soon as reasonably possible after discovery** — taking into account legitimate law-enforcement needs and measures reasonably necessary to determine scope and restore system integrity. Notification to data subjects must contain sufficient information to allow them to take protective measures. POPIA sets **no fixed hour count** (unlike GDPR's 72 hours), which in practice means "as soon as reasonably possible" is judged after the fact against what you could have done.

What ADR-0002 changes:

1. **A significant share of our breach-detection surface is now a vendor's.** A compromise of the identity store may be discovered by Supabase before us, and reach us via a notice that may take up to 48 hours (§4.2). **Our clock starts on our discovery — which may be their notice.** Every internal step after that must be pre-scripted.
2. **The vendor escalation path must exist before an incident, not during one.** BCM §4.6 assigns `integration-architect` ownership of "knowing each vendor's own SLA/support-escalation path before an incident, not during one." For Supabase this is now concrete and named: security-contact route, support tier, and expected response path, recorded in the runbook.
3. **Independent detection is mandatory** — see §4.2 and FU-02(c).

**C-6 (blocks go-live):** a **breach notification runbook** covering at minimum the Supabase-originated-breach path must exist before the first production customer. It must specify: detection sources (ours and Supabase's), the internal decision-maker on whether s22 is triggered, the Regulator notification route and prescribed form, data-subject notification copy, and the law-enforcement-delay decision path under s22(3).

**Honest statement of current state:** **no breach notification runbook exists for this platform today.** It is a named `compliance-specialist` deliverable that has not been written. I am not going to describe it as existing — `07-documentation-standards.md`'s honesty standard applies to this role's own deliverables as much as to anyone's. It is not a Stage 9 blocker (no production data exists to breach), and it **is** a go-live blocker.

**Related org-level gap, escalated to `cto`, not a Feature 001 gate:** POPIA requires a designated **Information Officer**, who must be registered with the Information Regulator. This organisation has no such designated, registered officer, and `00-org-chart.md` contains no role holding that statutory position — `compliance-specialist` is an engineering-organisation role, not a statutorily appointed Information Officer (a distinction BCM §4.7 already drew honestly about the Legal Services and Internal Audit gaps). Without a registered Information Officer, there is no correct party to make the s22 notification. **Go-live blocker, org-level, owner: `cto` / platform owner.** Recorded in C-11.

---

## 9. Consent and Disclosure Copy Requirements (this role's copy authority)

### 9.1 What changes

Stage 1 §9.2 required a plain-language privacy notice at the point of collection (POPIA s13 purpose specification, s18 notification), stating that email/phone are collected for account identification, verification, security notifications and service communication. **That requirement stands and is not superseded.** What is added: s18(1) requires the data subject to be informed of the recipients or categories of recipients of the information, and whether it will be transferred to a **foreign country**, together with the level of protection afforded there.

The current signup consent/ToS checkbox contemplated in `ux-research.md` §1 does **not** cover this.

### 9.2 Model copy (approved language — final strings still require a copy pass with `technical-writer` and `ui-designer`)

**At signup, visible without expanding anything — not buried in the linked policy:**

> **Where your information is stored.** We store your account details (your email address and sign-in activity) with Supabase, a hosting provider we use to run our sign-in system. This means your account information is stored on servers in **[EXACT REGION / COUNTRY — e.g. Ireland, European Union]**, not in South Africa. We have a written data-processing agreement with Supabase requiring them to protect your information to a standard comparable to South African law, and to hold us to the same standards for anyone they use in turn.

**In the Privacy Policy, expanded (owner: `technical-writer`, content approved here):**

- Named processor category: hosted database and authentication provider (Supabase), with the exact region.
- Named processor category: email delivery provider for verification and password-reset messages (per C-5), with its region.
- The transborder legal basis in plain language: a written agreement providing comparable protection (s72(1)(a)) and, for customers, that the transfer is necessary to provide the account they asked for (s72(1)(c)).
- Retention, stated with the backup tail per §6.4: *"We keep records of sign-in activity for 12 months, then delete them automatically. Copies may remain in encrypted backups for a short period after that."*
- Where operational logs are processed, if OI-3 shows it differs from the primary region.
- **Onward recipients, stated at the right level of precision (added 2026-08-08, per §5.1.4).** The notice should say that our hosting and authentication provider uses its own sub-contractors — principally cloud infrastructure, monitoring and support providers — that these are bound by the same protection standards through our written agreement, and that the current list is published by the provider (linked). **It must not name a country or region for those sub-contractors**, because the published list states none (OI-7). *"Some of these sub-contractors are based outside the European Union"* is defensible from the list's entity names; *"all processing takes place in Ireland"* is not, and would be the kind of false transborder statement §9.3(2) already prohibits. Where a specific onward recipient's role in our data path is unknown, the honest formulation is a category, not an invented geography.

### 9.3 Three prohibitions on the copy

1. **No cross-border consent checkbox** (§4.3.1). This is a **disclosure**, not a consent. Presenting it as consent is legally wrong and operationally fragile.
2. **No claim, anywhere, that data is stored in South Africa** — Feature 002 §12.3.6's precedent, now binding on Feature 001. Under §3.1 it cannot be true on Supabase Cloud.
3. **No placeholder region string in production.** The region must be the real, confirmed region code from OI-1. Feature 002 §12.5 established the precedent and the enforcement mechanism (a CI/build check asserting placeholder strings are absent from the production bundle); **the same check should cover the region string.** A privacy notice naming the wrong country is a false statement about a transborder transfer — a more serious defect than a missing one.

**C-7 (blocks go-live):** copy per §9.2 shipped and reviewed by `compliance-specialist` against the actual, confirmed configuration.

---

## 10. Conditions

Hard blockers on Stage 9 (Development) entry are marked **[S9]**; go-live blockers **[GL]**.

| ID | Condition | Owner (A) | Blocks |
|---|---|---|---|
| **C-1** | ~~Confirm the existing Supabase project's actual region (OI-1).~~ **RESOLVED 2026-08-08 — platform owner confirmed an EU region.** Residual: record the exact region code in RoPA (C-8) and privacy notice (C-7). | `cto` / platform owner (answered); `compliance-specialist` (record exact code) | **[S9] — satisfied** |
| **C-2** | **Execute Supabase's Data Processing Addendum.** POPIA s21(1) makes a written operator contract mandatory; s72(1)(a) is the only available transborder basis for privileged-role accounts (§4.3). Sign and return to `privacy@supabase.com`; file the executed copy in the compliance record. **Two additions from §5.1.3 / §5.1.1, both done while the document is already open:** (i) confirm the **sub-processor-liability wording** (does Supabase remain liable for its sub-processors' acts); (ii) **record which Supabase legal entity is the contracting counterparty** — "Supabase, Inc." appears on Supabase's own sub-processor list as a support-services provider, which implies the counterparty may be a different entity, and that determines the transferor/transferee chain and which SCC module applies. **STATUS 2026-08-08: confirmed NOT YET EXECUTED by platform owner. Open action item — no cost, no plan dependency (§7), can be done immediately. This is now the SINGLE remaining Stage 9 blocker.** | `cto` (signature); `compliance-specialist` (review + filing) | **[S9] — OPEN** |
| **C-3** | **Discharge the s72(1)(a)(ii) onward-transfer limb.** **PARTIALLY DISCHARGED 2026-08-08:** ~~obtain and read the current Supabase Sub-processor List~~ — done (OI-2 resolved), and the s72(1)(a)(ii) legal assessment is complete at §5.1.3, so **C-3 no longer blocks Stage 9**. **Residual, all process/ownership rather than reading (§5.1.6):** (a) record all 24 entries in the RoPA with locations stated as *"not published — see OI-7"* rather than inferred, preserving the Bucket A / Bucket B distinction; (b) subscribe to sub-processor change notifications at a **role-monitored** address; (c) assign a **named standing owner** to assess each 30-day change notice against §14's triggers; (d) close OI-7 (locations) and OI-8 (OpenAI scope) via the consolidated written enquiry. Likely to remain open until `integration-architect` picks up (b) and (c). | `compliance-specialist` (RoPA content, assessment standard); **`integration-architect` (subscription + standing ownership)**; escalate to `cto` if unowned at go-live | **[GL]** — Stage 9 half discharged |
| **C-4** | **Retention enforceable across all three layers (§6):** (a) `app.purge_expired_audit_log()` **scheduled**, with verifiable execution evidence; (b) `legal_hold` operational process defined; (c) `auth.audit_log_entries` retention resolved per §6.2.1 — resolve OI-4 first, then purge, mirror-and-minimise, or `cto`-signed risk acceptance; **silent indefinite retention is not an option**; (d) `auth.sessions`/`auth.refresh_tokens`/`one_time_tokens`/`flow_state` retention behaviour verified empirically and brought under a stated period. | `database-architect` + `security-engineer` (implementation); `compliance-specialist` (ruling); `devops-engineer` (scheduling) | **[GL]** — (a) verified at Stage 13 |
| **C-5** | **Custom SMTP operator onboarded compliantly (§5.2):** provider selected (EU/SA hosting preferred), written operator contract executed, s72 basis recorded, vendor-side message-log retention minimised and documented, added to RoPA and privacy notice. Reviewed **before** selection is final. | `integration-architect` + `notification-engineer`; reviewed by `compliance-specialist` | **[GL]**, and blocks enabling verification/reset flows against real users |
| **C-6** | **Breach notification runbook exists** covering the Supabase-originated-breach path, s22 Regulator + data-subject notification, the up-to-48h vendor-notice latency, the s22(3) law-enforcement-delay path, and Supabase's security-escalation contact route. Plus **FU-02(c) independent detection** shipped — it may not be descoped as optional observability. | `compliance-specialist` (runbook); `site-reliability-engineer` + `backend-architect` (FU-02(c)); `integration-architect` (vendor escalation path) | **[GL]** |
| **C-7** | **Consent/disclosure copy per §9.2 shipped**, naming the real confirmed region, with no cross-border consent checkbox, no South-Africa-storage claim, and no placeholder region string (CI-checked). | `compliance-specialist` (copy approval); `technical-writer` + `ui-designer` (production strings); `frontend-engineer` (CI check) | **[GL]** |
| **C-8** | **RoPA entry created** for the Supabase identity flow, covering the identity tables (§2.1) **and the incidental layer (§2.3)**: platform logs, SMTP, backups. Includes Supabase's written answer on log/tracing/backup residency (OI-3) and the 30-day post-termination deletion term. **Now also includes the 24 sub-processors from §5.1.1**, with the Bucket A / Bucket B distinction preserved, processing locations recorded as *"not stated in the published list — OI-7"* rather than inferred, and the one-sentence entry for authorised-administrator business-contact PI per §5.1.2. | `compliance-specialist` | **[GL]** |
| **C-9** | **No server-side biometric MFA factor** may be enrolled into Supabase without a fresh compliance review and probable s57 prior authorisation. FR-24's factor-type decision must state explicitly that on-device platform authenticators are approved *because the biometric never leaves the device*. | `cybersecurity-architect` (FR-24 decision); `compliance-specialist` (standing prohibition) | Standing constraint; **[GL]** for the FR-24 wording |
| **C-10** | **No Supabase log drain to any third-party destination** without a compliance review (§5.3). | `devops-engineer` / `site-reliability-engineer` | Standing constraint |
| **C-11** | **Vendor-governance register entry for Supabase** as a material outsourced service provider (§4.6, §7): plan/tier and PITR status (OI-5), SLA, security-escalation path, exit plan, sub-processor change owner. Plus the two escalations `compliance-specialist` cannot resolve: a **designated, registered Information Officer** (§8) and the **paid-tier-with-PITR floor** (§7). | `integration-architect` (register); **escalated to `cto`** (Information Officer, tier) | **[GL]** |
| **C-12** | **No Supabase AI-assistant / LLM-backed feature may be enabled or used against the project holding identity data, and no identity data, `auth`-schema contents, production schema dumps, or support-ticket attachments containing either may be submitted to any such feature — until OI-8 is answered in writing (§5.1.5).** OpenAI, LLC is a named sub-processor with no scope detail published; whether it can reach identity/auth data **cannot be determined from the list**. Deliberately shaped like C-10: same species of risk, one click from an undocumented transborder flow to a new operator. If OI-8 shows an LLM sits in a non-optional platform path touching auth data, escalate to `cto` on the §6.2.1 pattern — options, not silent acceptance. | `compliance-specialist` (prohibition + enquiry); `cybersecurity-architect` / `security-engineer` (operational enforcement, dashboard posture); `cto` (escalation if OI-8 lands badly) | **Standing constraint, effective immediately (incl. Stage 9)**; **[GL]** for the written answer |

---

## 11. Open Items — Genuinely Unknowable From Inside This Repository

Named rather than assumed, per this review's method note (§1). **Resolved items are retained struck-through rather than deleted**, so the record shows what was unknown at the time of the original sign-off and how it was closed.

| ID | Open item | Who can answer | How | Consequence if unanswered |
|---|---|---|---|---|
| **OI-1** | ~~**The configured region of the existing Supabase project.**~~ **RESOLVED 2026-08-08** — platform owner confirmed an EU region (§3.4). | Platform owner / `cto` (answered) | Supabase dashboard → Project Settings → General → Region; or the connection host string | **Closed.** Residual: the **exact** region code must still be recorded verbatim in the RoPA (C-8) and privacy notice (C-7); "an EU region" is not an acceptable string in either. |
| **OI-2** | ~~**Contents of Supabase's Sub-processor List** (published as a PDF; text not extractable in this review).~~ **RESOLVED 2026-08-08.** The 1 June 2026 list (24 entries) was obtained and is reproduced and analysed at **§5.1** — provenance recorded honestly at §5.1.0 (supplied verbatim by the orchestrating `cto` thread from the published PDF; this role still could not extract the PDF itself). s72(1)(a)(ii) **discharged as to contractual substance** (§5.1.3). | — | — | **Closed.** Three residuals carved out rather than buried: OI-7 (locations), OI-8 (OpenAI scope), and tracing-payload PII folded into OI-3. |
| **OI-3** | **Whether Supabase's logging (Logflare-backed), tracing, and backup tiers process personal information outside the project's primary region** — and, per §5.1.2, **what personal information can appear in error/trace payloads sent to Sentry and Braintrust Data, what scrubbing is applied, and what retention applies there.** Supabase's own guidance warns residency is affected, and does not say where. | Supabase, in writing (`privacy@supabase.com` / support) | Written enquiry before go-live — **consolidate with OI-4, OI-7 and OI-8 into one approach to the vendor** | Privacy notice cannot accurately state processing locations. Primarily a disclosure-accuracy issue, not lawfulness — **except** the token-in-trace-payload scenario, which would be a genuine s19 question for `cybersecurity-architect`. |
| **OI-4** | **Whether `auth.audit_log_entries` has any vendor-side retention, and whether deleting rows from it is supported.** | Supabase support/docs; verified by `database-architect` against a live project | Written enquiry + empirical check | C-4(c) cannot be resolved; unbounded PI retention persists in a vendor-managed schema. |
| **OI-5** | **The project's current plan/tier and whether PITR is available.** | Platform owner / `cto` | Supabase dashboard → Billing | Feeds FU-11 and §7's paid-tier floor; a cost decision, not a technical one. |
| **OI-6** | **The FAIS / Insurance Act record-retention floor** applicable to insurer accountability records — needed for FU-04's ruling on `app.account_state_transitions`. Depends on the **licence category answer still outstanding from Feature 002 §12.5.1**. | Platform owner (licence details) → `compliance-specialist` (analysis) | Supply real insurer licence class and FSP number/category | FU-04 stays open. Mitigation: build the purge mechanism **parameterised per table**, so the ruling drops in without a schema change. |
| **OI-7** | **The processing locations of Supabase's named sub-processors.** The 1 June 2026 list states **no country or facility location for any of the 24 entries** (§5.1.1) — and entity suffixes (`Inc` / `LLC` / `Kft.`) are **not** evidence of processing location. Includes the narrower question of **which named hosting sub-processors (Google, Fly.io, Vercel, Upstash, Cloudflare) sit in the identity data path for an EU-region project** versus supporting only Supabase's own site/dashboard/edge tiers — §5.1.2 marks that as inference, not finding. | Supabase, in writing | Consolidated written enquiry with OI-3 / OI-4 / OI-8 | **A completeness and evidencing gap, NOT a lawfulness gap** (§5.1.4) — s72(1)(a) rests on the binding agreement and its SCC coverage, which hold regardless of facility location. Consequence if unanswered: the RoPA must record *"not published by vendor"* and the privacy notice may not assert a sub-processor geography. **Locations must not be invented.** |
| **OI-8** | **Whether any part of the identity/authentication data path is routed through OpenAI, LLC.** The list gives only *"provision of natural language processing and generation services"* — no surface, no data categories, no opt-in/default status, no prompt/completion retention. **This cannot be determined from the list alone (§5.1.5), and no document may assert that it is "only a docs chatbot."** | Supabase, in writing | Consolidated written enquiry; ask specifically about Studio/dashboard AI-assistant surfaces, whether project schema or database content can reach the model, opt-in status, and prompt/completion retention | **C-12** stands as a standing prohibition until answered. If the answer is a staff-triggered dashboard assistant, the risk is ours to control and the outcome is good. If an LLM sits in a non-optional platform path touching auth data, that is a **material finding** requiring `cto` escalation on the §6.2.1 pattern — s10 minimality, s14 retention on a new uninventoried surface, and s19/s20 confidentiality all engage. |

**Four of the six remaining open items — OI-3, OI-4, OI-7 and OI-8 — are answerable only by Supabase in writing. They should go as ONE enquiry to `privacy@supabase.com`, not four.** A single, specific, dated written enquiry is also the artefact that evidences due diligence to the Information Regulator; four scattered support tickets are not. Drafting it is `compliance-specialist`'s; sending it and owning the response sits with whoever holds the vendor relationship (`integration-architect`, per BCM §4.6). **The reply must be filed in the compliance record verbatim** — a paraphrase of a vendor's residency answer is not evidence of it.

---

## 12. Reconciliation Summary — Stage 1 §9 After This Review

| Stage 1 §9 item | Status after this review |
|---|---|
| POPIA as governing framework (§9, OQ-2) | **Unchanged and confirmed.** Reopening trigger (customer base beyond South Africa) not fired. GDPR reassessed and still excluded (§4.5). |
| Lawful bases: s11(1)(b) customers, s11(1)(c)/(f) privileged (§9.2) | **Unchanged.** Introducing an operator adds s20/s21/s72 obligations; it does not disturb the lawful basis. No re-derivation needed. |
| Minimality, s10 (§9.2) | **Holds** for identity data. **Expanded inventory** for the incidental layer (§2.3) — a documentation gap, not a minimality breach: we don't choose to collect IP-bearing platform logs, but we must record them. |
| Purpose specification / s18 notification (§9.2) | **Expanded.** Must now disclose the processor, the foreign processing location, and the protection level — §9.2, C-7. |
| Data-subject rights forward-compatibility (§9.2(b)) | **Holds, harder.** Two new Supabase-specific constraints handed to FU-03 (§6.2.3): soft-delete ≠ deletion; vendor-triggered `cascade` destroys the accountability record. |
| 12-month audit-log retention (§9.3, OQ-6) | **RE-CONFIRMED for `app.account_audit_log`** (§6.1). No FAIS floor applies to authentication telemetry (§6.1.1). **Newly extended in reach** to `auth.audit_log_entries` (§6.2.1, C-4(c)) — the material gap this review found. **Backup tail must be disclosed** (§6.4). |
| §9.3's "re-confirm at Stage 8 against industry minimums" | **Discharged for the audit log** (§6.1.1). **Not discharged for state transitions** — FU-04, with OI-6 as its dependency (§6.1.2). |
| Data classification / handling rules | Inventory and classification produced at §2.1 — the first per-table classification for this platform. Should seed the platform-wide data classification matrix. |

---

## 13. Sign-Off Scope — What This Document Does and Does Not Discharge

**Discharges:** the **`compliance-specialist` half** of ADR-0002 Required Follow-up 1 / `architecture-review.md` **FU-15(a)** — the cross-border and data-residency determination, the operator/responsible-party framing, the s72 basis, the retention/deletion ruling, and the consent/disclosure copy requirements.

**Does NOT discharge:**

- **The `cybersecurity-architect` half of FU-15(a)** — the technical residency and protection posture: TLS to Supabase, encryption at rest and the field-level-encryption evaluation `06-security-standards.md` requires, service-role credential handling, network exposure, and the RLS threat model (FU-05). Per ADR-0002's own split, this role has final say on *whether* a requirement is satisfied and defers on *how*. **FU-15(a) is not closed until `cybersecurity-architect` files the technical half.**
- **FU-15(b)** — `security-engineer`'s unified secrets-management plan. Still open and still a Stage 9 blocker in its own right.
- **FU-03 / ADR-0004** — deletion vs. anonymisation. Still `compliance-specialist`-owned, still due Stage 6 (cascade) / Stage 8 (mechanism). This review supplies constraints, not the ruling.
- **FU-04** — state-transition retention. Direction given (§6.1.2); ruling due Stage 8 exit; blocked on OI-6.
- **Go-live approval.** Nine of the twelve conditions are go-live blockers. **This is a Stage 8/9 conditional sign-off, not a launch clearance.**

**Stage 9 entry position, revised 2026-08-08: PERMITTED once C-2 is satisfied.** C-1 was answered by the platform owner (EU region, §3.4) and C-3's Stage 9 half — reading the sub-processor list and assessing s72(1)(a)(ii) — is discharged at §5.1. **C-2 (execute the DPA) is the sole remaining gate**, and it is a signature on a free, standard, plan-independent document (§7). There is no defensible reason for Feature 001 development to be blocked by it for more than a day.

**What must not be misread as also discharged:** C-3's residual (RoPA recording, change-notice subscription, named standing owner — §5.1.6), OI-7 (sub-processor locations, unpublished), OI-8 (OpenAI scope, undetermined), and **C-12**, which is a **standing prohibition operative during Stage 9 itself**, not a go-live checklist item. Permitting Stage 9 entry is not permission to enable an AI assistant against the identity project.

---

## 14. Revisit Triggers

Reopen this review if any of the following occurs:

- **Supabase adds an African region**, or a customer/regulator/partner commitment to South African data localisation arises. The first would let us improve the posture; the second is an **ADR-0002 revisit trigger**, since §3.1/§3.2 make localisation impossible on the current platform without a project migration.
- **The customer base or marketing footprint extends to EU data subjects** — fires Feature 002 §12.0's recorded GDPR reopening trigger; §4.5's analysis and §3.3's EU-region ruling are the hedge, but the assessment itself must be redone. **Added 2026-08-08 (§5.1.4): the redone assessment must cover the sub-processor chain, not only the primary store.** Supabase's named sub-processors are predominantly **US-domiciled entities**, which is neutral under POPIA's contractual-adequacy test but engages the Schrems II / transfer-impact-assessment framework under GDPR. An EU region does not make a US-domiciled sub-processor chain a GDPR non-issue, and nobody should assume §3.3 already solved this.
- **Supabase notifies a sub-processor change** (30-day notice regime, C-3) that adds a processing location or a materially different processing purpose. **Assess each notice against §5.1.2's bucket triage** — a change to a Bucket A entry (hosting, monitoring/tracing, MSSP) or any new AI/LLM entry is materially different from a change to Bucket B (Supabase's own communication stack) and must not be waved through on the strength of the last assessment.
- **Any answer to OI-8 indicating that an LLM sits in a non-optional platform path touching identity or `auth`-schema data** — forces the §5.1.5 escalation to `cto` and reopens the s10/s14/s19 analysis for a processing surface this review could not inventory. Equally, if Supabase **adds a new AI-backed feature** to the dashboard or platform, C-12 applies to it on arrival, not after someone enables it.
- **Supabase's DPA, sub-processor list, or regional in-region commitments materially change.**
- **The project's plan/tier or ownership changes** — already an ADR-0002 revisit trigger; §7 gives it a compliance dimension alongside the cost one.
- **OI-4 resolves against us** (`auth.audit_log_entries` genuinely un-purgeable) — forces the §6.2.1 escalation and a `cto` risk-acceptance decision.
- **A new MFA factor type is proposed** that touches special personal information (§2.4, C-9).
- **A log drain, read replica, Edge Function, or Supabase Storage bucket is introduced** — each is a new processing location or new data category not covered by this review's inventory.
- **Any Feature 001 data flow extends identity data to security-company partners.** Stage 1 §9.2 explicitly ruled that no cross-org sharing consent is required *at this stage* because no such flow exists. The moment one does, this review and Stage 1 §9.2 both reopen.

---

## 15. Pre-Approval Checklist (`compliance-specialist` self-review)

- [x] **Regulatory regime(s) applicable to this feature/data flow confirmed and documented** — POPIA (§0, §4). GDPR assessed and excluded with a recorded reopening trigger (§4.5). PCI-DSS not applicable (no payment data in Feature 001). Insurance-regulatory outsourcing dimension identified and assigned rather than silently absorbed (§4.6). Not defaulted to a single assumed regime.
- [x] **Lawful basis / consent confirmed for any new or expanded personal data collection** — §2.2: Stage 1's bases hold unchanged; the *transfer* basis is s72(1)(a) primary, s72(1)(c) supporting for customers, with consent expressly rejected as a basis and the reasoning recorded (§4.3.1).
- [x] **Data classified and mapped to correct retention and deletion timelines** — §2.1 per-table classification; §6 three-layer retention ruling; 12 months re-confirmed for the platform audit log; a differing clock directed for state transitions; the backup tail required to be disclosed.
- [x] **Audit logging specified for any new access path to sensitive data** — `app.account_audit_log` confirmed as the FR-12 record of authority; Supabase platform logs expressly barred from being cited as satisfying FR-12 (§6.3); `auth.audit_log_entries` identified as an uncontrolled duplicate requiring resolution (§6.2.1).
- [x] **PCI-DSS scope reviewed** — no card data in Feature 001's surface; Supabase adoption introduces no payment-data flow. Scope unchanged and minimal.
- [ ] **Third-party/vendor data-sharing covered by a compliant agreement** — **OPEN, and still the largest residual risk in this review.** **C-2 (Supabase DPA, unexecuted)** is the live blocker. **C-3 is now partially discharged:** the sub-processor list has been read and s72(1)(a)(ii) assessed (§5.1, OI-2 closed), leaving RoPA recording, change-notice subscription and a named standing owner (§5.1.6). **C-5 (SMTP operator) remains unselected.** Two new residuals the list surfaced and which I am not going to bury inside "C-3 is basically done": **OI-7** — the published list states no processing locations at all, which is a completeness/evidencing gap rather than a lawfulness gap (§5.1.4) — and **OI-8 / C-12** — **OpenAI, LLC is a named sub-processor and I cannot determine from the list whether it touches identity or auth data** (§5.1.5). None of the outstanding items is difficult; they are simply not done.
- [ ] **Breach notification procedure applicable to this data type reviewed and current** — **OPEN.** No runbook exists for this platform (§8, C-6). Stated plainly rather than described as existing. Compounded by the absence of a designated, registered Information Officer, escalated to `cto`.
- [x] **Consent/disclosure copy reviewed and accurately reflects actual data handling** — requirements and model copy approved at §9.2, with three binding prohibitions at §9.3. **Caveat, matching Feature 002 §12.8's precedent:** this approves the *requirements*; the production strings do not exist and require a second compliance pass, and the region string cannot be finalised until OI-1 is answered.

---

## 16. Sources

Supabase platform and legal facts established during this review:

- [Available regions | Supabase Docs](https://supabase.com/docs/guides/platform/regions) — the 17 available AWS regions; no African region.
- [Add South Africa Region Availability · supabase · Discussion #34614](https://github.com/orgs/supabase/discussions/34614) and [Adding South African region for deploying projects · Issue #27090](https://github.com/supabase/supabase/issues/27090) — `af-south-1` available in alpha, withdrawn for new projects; outstanding community request.
- [Change Project Region | Supabase Docs (Troubleshooting)](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z) and [Migrating within Supabase | Supabase Docs](https://supabase.com/docs/guides/platform/migrating-within-supabase) — region is immutable; correction requires a new project plus full migration.
- [GDPR compliance and Supabase | Supabase Docs](https://supabase.com/docs/guides/security/gdpr-compliance) — single primary region per project; EU-region projects keep primary database data in-region; explicit warning that backups, logs, exports, Edge Functions and sub-processors affect residency; DPA availability.
- [Supabase Data Processing Addendum](https://supabase.com/legal/dpa) — sub-processor list incorporated by reference with 30-day change notice; EU SCCs, UK Addendum B.1.0, Swiss variant, jurisdiction-adapted SCCs; security-incident notice "without undue delay, where feasible within 48 hours"; 30-day post-termination retention then deletion of all copies; annual audit rights on 30 days' notice.
- [Supabase Subprocessor List](https://supabase.com/legal/customer-resources/subprocessor-list), current version [June 1, 2026 (PDF)](https://supabase.com/legal/subprocessor-list/June-1-2026.pdf) — **24 named sub-processors with one-line processing descriptions and no stated processing locations.** Reproduced in full and analysed at §5.1. **Provenance (§5.1.0):** the PDF text was **not** extractable by this role; its contents were supplied verbatim to this review on 2026-08-08 by the orchestrating `cto` thread, which fetched the published PDF directly. Analysed on that basis, with the limitation recorded rather than glossed. **Re-read at source on each 30-day change notice (C-3).**
- [Send emails with custom SMTP | Supabase Docs](https://supabase.com/docs/guides/auth/auth-smtp) and [Production Checklist | Supabase Docs](https://supabase.com/docs/guides/deployment/going-into-prod) — built-in auth email is dev/test only (~2 emails/hour, team addresses only); custom SMTP required for production.
- [Logs & Analytics | Supabase Features](https://supabase.com/features/logs-analytics) and [Introducing Log Drains](https://supabase.com/blog/log-drains) — Logflare-backed logging; plan-bound retention (Pro 7 days, Team 28 days); log drains as an export path to third parties.

South African regulatory context (POPIA sections cited from the Act itself; insurance-regulatory context inherited from existing platform documents rather than independently re-researched here):

- POPIA ss. 10, 11, 13, 14, 18, 19, 20, 21, 22, 23–25, 26, 55–56, 57, 72.
- Insurance-regulatory framing inherited from `docs/features/002-landing-page/business-requirements.md` §12.5 and `docs/organization/09-business-continuity-policy.md` §5 (Insurance Act 18 of 2017, FAIS Act 37 of 2002, Prudential Standard GOI 1, PA/FSCA Joint Standards) — **not independently re-verified in this review**, and carrying the same "moderate, not full, confidence" caveat those documents recorded.
