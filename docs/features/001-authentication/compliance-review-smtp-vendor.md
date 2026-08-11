# Feature 001 — Compliance Review: Brevo as Transactional Email (SMTP) Operator

**Status:** **APPROVED WITH CONDITIONS.** Brevo is accepted as C-5's vendor. **9 sub-conditions (C-5.1 … C-5.9)** and **7 new open items (OI-9 … OI-15)** attach. C-5 item 5 — *"reviewed by `compliance-specialist` before selection is finalised, not after"* — **is discharged by this document.** C-5 itself remains open as a go-live blocker until C-5.1 … C-5.9 close.
**Date:** 2026-08-11
**Author / decision owner:** `compliance-specialist`
**Reviews:** [`smtp-vendor-selection.md`](smtp-vendor-selection.md) (`integration-architect`, recommendation-only, unratified)
**Discharges:** [`compliance-review-supabase.md`](compliance-review-supabase.md) **C-5 item 5** in full; **C-5 item 1** (provider selection) conditionally, per §15
**Consumers:** `integration-architect`, `notification-engineer`, `authentication-engineer`, `cybersecurity-architect`, `security-engineer`, `technical-writer`, `cto` / platform owner
**Governing framework:** POPIA (Act 4 of 2013), South Africa — inherited unchanged from `compliance-review-supabase.md` §0/§4 and Feature 001 Stage 1 §9. GDPR assessed as a forward hedge only (§4.6). PCI-DSS not applicable (no payment data in this flow).
**Method inherited:** this review deliberately **applies** the operator / s21 / s72 / RoPA method established at `compliance-review-supabase.md` §4–§6 rather than re-deriving it. Where a ruling there already binds, it is cited, not re-argued.

---

## 0. Verdict, stated up front

**APPROVED WITH CONDITIONS. Brevo may be selected. The platform owner may now proceed to create the account and execute the DPA — see §15 for the required order of operations, which matters.**

I am not rejecting Brevo. But **two of the three claims `integration-architect` built the recommendation on do not survive verification**, and one thing the recommendation treated as a minor implementation detail is in fact the sharpest finding in this review:

1. **The "EU-domiciled counterparty" claim is probably wrong for us, and it was the recommendation's *primary* stated reason.** `smtp-vendor-selection.md` §2.1/§4.1 argue Brevo is "materially stronger than an SCC-based argument" because it is an EU company rather than a US company hosting in the EU. But Brevo's own contracting structure is **region-split**: `Sendinblue, Inc.`, a **Delaware** corporation at 823 Congress Ave, Austin TX, is the entity that contracts with customers **outside Europe**, and Brevo publishes a **separate US/`INC` DPA** alongside its EU one. **South Africa is outside Europe.** Unless the account-creation flow demonstrably puts us with Brevo/Sendinblue SAS (France), our counterparty is a US entity and the recommendation's headline differentiator **evaporates entirely** — leaving Brevo in exactly the same posture as Supabase and SES: US-domiciled counterparty, EU-hosted infrastructure, transfer-mechanism-based DPA. This does **not** make it unlawful (my own §5.1.4 reasoning in the Supabase review binds me here: POPIA s72(1)(a) is a contractual-adequacy test, not a domicile or governmental-access test — I cannot reject Brevo for a property I expressly accepted for AWS). It does mean the reasoning in the record is wrong and must be corrected before it propagates into the RoPA and the privacy notice. **C-5.1.**
2. **But the entity question is *more* legally load-bearing than either document has yet noticed — in Brevo's favour, if it resolves the right way.** §4.4 sets this out. POPIA s72(1)(a) offers a limb neither this platform nor the Supabase review has ever been able to use: recipient *"subject to a law ... providing an adequate level of protection."* For a genuinely EU-established recipient, **GDPR is that law**, and the s72 basis then stands on statute rather than only on our contract. Supabase could never reach that limb. **If** our counterparty is Brevo SAS (France), Brevo becomes the first operator on this platform with a *statutory* transborder basis — a real advantage `integration-architect` gestured at but articulated as the wrong argument ("no SCCs required," which is a GDPR framing that does nothing for us under POPIA — §3, claim 3). If the counterparty is Sendinblue, Inc., that limb is unavailable and we are back to binding-agreement-only. Same fact, two materially different legal positions. That is why C-5.1 is a condition and not a footnote.
3. **Retention is not a minor implementation detail — Brevo's default is indefinite retention of the email body, and the body contains a live credential.** `smtp-vendor-selection.md` §2.1/§6 record only that retention is "configurable in account settings" and must be minimised later. What it does not record, and what changes the risk picture: at our volume (under 10 million events) Brevo's transactional logs and **email previews** are retained with **no time limit by default**; the configurable floor is **1 month**, not zero, because Brevo uses the logs for its own spam detection and sender-reputation scoring; and **the preview setting is not retroactive**, so anything sent before the setting is changed is retained under the old, unlimited posture permanently. "Email preview" means the **rendered message body** — i.e. the password-reset and verification **token links themselves**, sitting in a third-party operator's store for at least a month and, absent action, forever. **C-5.2 + C-5.3.** This is the SMTP analogue of the Supabase review's sharpest finding (§6.2.1's uncontrolled second copy of PI) and it lands the same way: a vendor writing the record does not discharge our s14 obligation.

What *does* hold up: EU hosting (substantially, though at one remove — §1), ISO 27001 certification (first-party), the availability of a standard no-negotiation DPA, and the cost/onboarding reasoning. **The recommendation reaches the right vendor for partly wrong reasons.** That is worth approving and correcting, not rejecting and restarting.

---

## 1. Scope and method — including what I could not verify

**In scope:** whether Brevo is a POPIA-compliant operator for the verification / reset / invitation email flow; what that operator actually receives; whether its retention, security and sub-processor posture meets the bar set for Supabase; and what must be recorded, configured and disclosed before this flow may run against real users.

**Out of scope:** deliverability (a functional requirement, `notification-engineer`'s, and `smtp-vendor-selection.md` §6 already flags it honestly as unmeasured); the `email.ts` abstraction design (§5 of that document, and correct as proposed); SMTP credential handling (already governed by `secrets-management-plan.md`, and `smtp-vendor-selection.md` §5 applies it correctly, including the point that a leaked SMTP credential is a phishing-and-reset-token vector, not a lesser credential).

**Honesty note on provenance — the same standard §5.1.0 of the Supabase review committed this role to, and for the same reason.** `integration-architect` asked to be checked rather than taken on trust, so it matters exactly how far I got:

| What I tried to verify | Outcome |
|---|---|
| Brevo **EU** DPA (`BREVO-Annex-2-DPA-150524.pdf`) | **Not read.** Direct fetch returned **HTTP 403**. A second fetch route returned the binary but no usable text. **I have not read Brevo's DPA.** |
| Brevo **US/`INC`** DPA (`20241709-US-BREVO-Annex-2-DPA-INC.pdf`) | **Not read.** Retrieved as a 248 KB binary; text extraction unavailable in this environment (no `poppler`/`pdftotext`; shell disabled). Its **existence, filename and page-1 party block** are established from search-engine indexing of the document: *"Sendinblue, INC, a Delaware corporation, with a main address at 823 Congress Ave. Ste 300 Austin, TX 78701."* That is a real, citable fact about the document's first page. Its clauses are not. |
| Brevo hosting locations (help centre, *Data storage location*) | **Verified at one remove only.** Direct fetch returned **HTTP 403**. Contents established from search-engine extraction of Brevo's own help-centre page: on-premise servers in **France** and **Germany** (OVH as primary host), cloud databases on **Google Cloud in Belgium**, data copied at least 3× across at least 2 geographic locations, encrypted cloud backups. This is Brevo's own first-party statement, reached indirectly. **It is not a read of the DPA and carries no contractual force.** |
| Brevo transactional-log / preview retention (help centre) | **Verified at one remove only**, same 403 pattern, same provenance caveat. The retention facts in §6 come from search-engine extraction of Brevo's own help-centre retention articles. |
| Brevo ISO 27001 | **First-party artefact located** — a certificate PDF published on `brevo.com`. Certification asserted as ISO 27001:2022, annually audited. |
| Brevo SOC 2 Type II | **Not first-party verified.** Asserted by third-party review sites only. Recorded as an open item (OI-14), not as a finding. |
| Brevo sub-processor list | **Not read.** It is published **inside the DPA (Schedule)** rather than as a separately versioned public page. **Twilio** (US, phone-number provider) and unnamed **"AI Third-Party Products"** are established as named entries from secondary sources. The full list, the locations, and the change-notice mechanism are unknown. **OI-11, OI-12.** |

**So, answering the task's first question directly: no, I cannot independently verify Brevo's EU-hosting claim to first-party-document standard, and I am not going to imply that I did.** What I can say is that the claim is (a) Brevo's own published position, (b) specific enough to be falsifiable (named countries, named cloud provider, named on-premise host), and (c) consistent across every source I reached. That is materially better evidence than the Supabase sub-processor list gave me on locations — where the answer was *nothing at all* (OI-7) — but it is weaker than a contractual commitment, and it is **not** what the RoPA needs. The RoPA needs the DPA's own words. **C-5.6 makes reading them a condition of executing the agreement, while the document is already open** — the same trick §5.1.3 used to close the Supabase sub-processor-liability gap at zero cost.

---

## 2. What actually flows to this operator

From `business-requirements.md`, reconciled against `smtp-vendor-selection.md` §1 (whose mapping I have checked and accept as accurate and complete):

| Trigger | FR | Personal information reaching Brevo | POPIA classification |
|---|---|---|---|
| Customer signup verification | **FR-3** | Email address + single-use verification token, in the message body | Identity PII **+ a credential in transit** |
| Resend verification | FR-3 | Same | Same |
| Password reset | **FR-15**, **FR-16** (single-use, time-limited) | Email address + single-use reset token, in the message body | Identity PII **+ a credential in transit** |
| Staff / partner invitation | **FR-6**, **FR-7** | Invitee email address + single-use invitation token + first-login instructions | Identity PII of a **prospective privileged user** + a credential in transit |

Three properties of this inventory drive everything below:

1. **The token is not metadata about the message — it is the message.** A retained copy of the rendered body is a retained copy of a credential. This is why §6 is the longest section in this review and why C-5.3 constrains token lifetime rather than only vendor retention.
2. **No new *category* of personal information is introduced.** Email addresses are already inventoried at `compliance-review-supabase.md` §2.1, and the lawful basis is undisturbed (s11(1)(b) for customers, s11(1)(c)/(f) for privileged roles). Per §2.2 of that review: **introducing an operator adds s20/s21/s72 obligations on top of a valid basis; it does not require re-deriving the basis.** Nobody needs to invent a new consent for this.
3. **No special personal information (s26), no children's data, no payment data.** Therefore **no s57(1)(d) prior authorisation** is engaged, on the same reasoning as §4.4 of the Supabase review — and, as there, that conclusion is conditional on the boundary holding. **The C-9 biometric prohibition extends here by its own terms:** no biometric artefact may ever be routed through email content.

One addition the FR table understates. **FR-6/FR-7 invitation emails carry a credential to a privileged account** — an admin, a support agent, or a security-company operator whose account can reach customer asset-location data. An intercepted or retained-and-later-abused invitation token is a **privilege-escalation path into the platform's most sensitive dataset**, not merely an account-takeover path for one customer. `smtp-vendor-selection.md` treats all three email types as one sensitivity tier; they are not. This is handed to `cybersecurity-architect` and reflected in C-5.3's differentiated token lifetimes.

---

## 3. `integration-architect`'s factual claims, checked one by one

Claim-by-claim, because the task asks me not to accept "EU-hosted" on assertion:

| Claim (`smtp-vendor-selection.md`) | Verdict |
|---|---|
| **1. Brevo processes/stores EU-region data in EU data centres (Google Cloud, Belgium)** | **SUBSTANTIALLY VERIFIED, at one remove (§1).** Brevo's own help centre states Belgium (Google Cloud) for cloud databases **plus** on-premise servers in **France and Germany (OVH)** — a detail the recommendation omits. The omission is minor but the RoPA needs the full picture: this is a **three-country** EU footprint with a named on-premise host, not a single Belgian GCP region. Corrected in C-5.7. |
| **2. Brevo SAS is headquartered in Paris, France** | **VERIFIED**, and irrelevant on its own. Group parent is a French *société par actions simplifiée* (Paris register no. 498 019 298). **Parent domicile is not counterparty domicile** — precisely the distinction §5.1.1 of the Supabase review already insisted on for entity suffixes. See claim 4. |
| **3. "No Standard Contractual Clauses are required for its standard EU deployment," offered as *"materially stronger than an SCC-based argument"*** | **REJECTED AS REASONING, though the underlying fact may be true.** This is a **GDPR** argument (Chapter V transfers) imported into a **POPIA** analysis, where it does no work. POPIA has **no adequacy list** (`compliance-review-supabase.md` §4.3) — so under POPIA, "we don't need SCCs" is not a benefit; SCCs are one of the standard *mechanisms* by which a binding agreement demonstrates s72(1)(a)(i)/(ii) substantial similarity. Removing them removes evidence unless the DPA's own GDPR Art. 28 terms carry the same weight independently — which they plausibly do, but **that has to be read, not assumed (C-5.6).** The genuine POPIA advantage of EU domicile is a different one, and neither document states it: **§4.4's "subject to a law" limb.** |
| **4. Brevo is an EU entity "as a matter of corporate fact, not a US company voluntarily hosting in the EU"** | **NOT VERIFIED, and probably wrong for us.** `Sendinblue, Inc.` (Delaware, Austin TX) is the contracting entity for customers **outside Europe**; Brevo maintains **two DPAs** (EU and US/`INC`); and its own privacy documentation states the responsible Brevo entity varies by customer location among **Sendinblue France (SAS), Sendinblue North-America (Inc.) and Sendinblue Germany (GmbH)**. South Africa is outside Europe. **This is the recommendation's stated primary reason for choosing Brevo over SES, and it is unsafe as written.** → **C-5.1**, **OI-9**. |
| **5. Standard DPA, accepted through account/legal settings without bespoke negotiation** | **PLAUSIBLE, UNVERIFIED as to substance.** Brevo publishes DPAs and documents where to find them; I have read neither. Availability is not adequacy. → **C-5.6**, **OI-10**. |
| **6. 300 emails/day free, no card, no time limit; ~$9/mo paid entry** | **ACCEPTED.** Not a compliance question — with one caveat the recommendation misses: the 300/day allowance is **shared between transactional and marketing**, so any marketing use of the same account can starve the auth flow. C-5.5 forecloses that as a side-effect of a purpose-limitation requirement. |
| **7. Transactional log retention is "configurable in account settings," to be minimised at implementation time** | **INCOMPLETE IN A MATERIAL WAY.** True but understated: default is **unlimited** at our volume, floor is **1 month** (not zero), scope includes **message bodies** ("previews"), and the preview setting is **not retroactive**. → **§6**, **C-5.2**, **C-5.3**. |
| **8. Established transactional product; no known deliverability red flags; not independently benchmarked** | **ACCEPTED AS STATED**, including its own caveat. Out of my scope; the honesty is noted and appreciated. |
| **9. Postmark/SendGrid excluded for lacking EU hosting on standard plans** | **ACCEPTED, and the Postmark coincidence-flag in §2.4 is exactly right.** Postmark is a **Supabase** sub-processor (`compliance-review-supabase.md` §5.1.1, Bucket B). Had it been selected here, we would hold two independent relationships with the same company in two different roles — a RoPA trap, correctly pre-empted. Noting it approvingly so the flag is not lost. |
| **10. SES kept as documented fallback** | **ACCEPTED, with an honest complication in §16.** |
| **11. Not an ADR (§9)** | **AGREED, and I decline the §9 invitation to escalate.** The reasoning is sound: reversal cost is low behind the §5 abstraction, and this applies an existing precedent rather than setting one. This document plus a corrected vendor-register entry is the right weight. |

---

## 4. Operator framing and the s72 analysis

### 4.1 Who is what

- **TD IT Solution Insurance** — responsible party. Unchanged.
- **Brevo (whichever entity per C-5.1)** — **operator** under POPIA s1: processes personal information for us, under contract, without determining the purpose. This is the **second** operator on this platform, exactly as `compliance-review-supabase.md` §4.1 predicted ("a separate, additional operator with its own s21 contract and its own s72 basis").
- **Brevo's own sub-processors** — further operators, engaging s72(1)(a)(ii). Includes at least **Twilio (US)** and unnamed **AI third-party products**. §9.
- **Not a joint responsible party, and this must stay true.** The moment Brevo processes these email addresses for **its own** purposes beyond delivery — audience building, product analytics, model training — the operator framing breaks. §7 and C-5.5 exist to keep it intact.

### 4.2 s21 — the written contract is mandatory, again

`compliance-review-supabase.md` §4.2's ruling applies verbatim and needs no re-argument: **POPIA s21(1) requires a written contract obliging the operator to maintain s19 safeguards. There is no "reputable vendor" exemption. No executed DPA = a standing s21 contravention for as long as production personal information flows there.**

Two consequences specific to Brevo:

1. **Execution is unconditionally required**, and is **not** substituted by §4.4's statutory limb. Even if Brevo is fully GDPR-bound, s21 is a *domestic* obligation on **us**; it is discharged by a contract, not by the operator's home law. Nobody may read §4.4 as "Brevo is in the EU so the DPA is optional."
2. **s21(2) requires the operator to notify us *immediately* on reasonable grounds to believe unauthorised access has occurred.** I have not read Brevo's timeline. I **expect** it to be "without undue delay," possibly with a 24–72 hour outer bound. Per the §4.2 precedent I am **pre-committing to accept** a market-standard clause rather than treating it as a blocker — but on the same two terms recorded there: our own s22 budget must **absorb** the vendor's latency, and **we may not rely on Brevo telling us**. → **C-5.6(iii)**, **C-5.9**.

### 4.3 s72 — is the transborder flow lawful?

| Ground | Available? | Ruling |
|---|---|---|
| **s72(1)(a)** — recipient subject to a **law**, binding corporate rules, or **binding agreement** providing adequate protection, with (i) substantially similar processing principles and (ii) substantially similar onward-transfer provisions | **Yes — and by two routes, one of which is new to this platform** | **PRIMARY BASIS.** The **binding-agreement** route is available on execution of the DPA (C-5.6) and is the route I am relying on, because it works regardless of how C-5.1 resolves. The **"subject to a law"** route is additionally available *if and only if* the counterparty is EU-established — see §4.4. |
| **s72(1)(b)** — data-subject consent | Technically available | **REJECTED, on the identical reasoning to `compliance-review-supabase.md` §4.3.1, which binds here.** No "I consent to my verification email being sent via a European provider" checkbox. It would not be freely given (the account cannot be verified without it), it would be revocable, and it is unbundled-consent theatre. **Do not build it.** |
| **s72(1)(c)** — necessary for performance of a contract with the data subject, or pre-contractual measures at their request | **Yes, and more squarely than for Supabase** | **SUPPORTING basis for customers.** FR-3's verification and FR-15's reset are literally *pre-contractual and contractual measures taken at the data subject's request* — the customer asks to sign up, or clicks "forgot password." **Not available for FR-6/FR-7 invitations**: privileged users are not data subjects contracting with us. As with Supabase, **s72(1)(a) is the only ground for privileged-role accounts**, which is again what makes DPA execution unavoidable rather than merely prudent. |
| **s72(1)(d)**, **s72(1)(e)** | No | Not relied on. |

**Ruling: the flow is lawful under s72(1)(a), supported for customers by s72(1)(c), contingent on C-5.6.** Until the DPA is executed, the flow has no established basis — which is why C-5 correctly blocks *enabling verification/reset against real users*, not merely go-live.

### 4.4 The entity question, and why it changes the legal position rather than just the paperwork

This is the analytical core, and it is where I am refining `integration-architect`'s instinct rather than dismissing it.

POPIA s72(1)(a) is satisfied where the recipient is subject to **a law**, binding corporate rules, **or** a binding agreement providing an adequate level of protection with the (i) and (ii) limbs. Every transborder analysis this platform has done to date has used the **binding-agreement** limb, because it had to: Supabase, AWS, and every entity on that 24-name sub-processor list is subject to no law we can point at as adequate, and **POPIA has no adequacy list to appeal to** (`compliance-review-supabase.md` §4.3).

**An EU-established recipient is different in kind.** It is subject to the GDPR — a statute whose processing principles and onward-transfer restrictions are, by any reasonable reading, "substantially similar" to POPIA's, and which POPIA's drafters plainly had in view. For such a recipient the **"subject to a law"** limb is genuinely available, and the transborder basis stands on statute **in addition to** our contract rather than resting on it alone.

Two outcomes, and the difference is not cosmetic:

- **If the counterparty is Brevo / Sendinblue SAS (France) or Sendinblue GmbH (Germany):** s72(1)(a) is satisfied on **both** limbs. Brevo becomes the **first operator on this platform with a statutory transborder basis**, and it is genuinely more defensible to the Information Regulator than anything Supabase or SES can offer. `integration-architect`'s conclusion is then not merely right, it is *more* right than the document argued — for a reason the document did not identify.
- **If the counterparty is Sendinblue, Inc. (Delaware):** the statutory limb is **gone**. We hold a binding agreement with a US company that happens to host in the EU — **structurally identical to Supabase (§5.1.4) and to the SES fallback**. Still lawful. Still approvable. But the recommendation's stated primary reason for preferring Brevo over SES no longer exists, and any RoPA or privacy-notice sentence built on "our email provider is a European company" becomes a **false statement about a transborder transfer** — which `compliance-review-supabase.md` §9.3 rates as **worse than a missing one**.

**I am not going to guess which it is, and nobody else should either.** This is precisely the failure §5.1.1 warned about: reading a corporate suffix or a headquarters address as a fact about the actual relationship. **C-5.1** makes determining it a condition, and the answer is cheap to obtain — it is visible on the account's own billing/legal entity and on the face of whichever DPA the account presents for acceptance. It also happens to be the **same** question C-2(ii) already requires for Supabase ("record which Supabase legal entity is the contracting counterparty"). **The same question, asked twice, of two vendors, for the same reason.** That is a pattern worth generalising into the vendor-register template rather than rediscovering vendor by vendor — noted for `integration-architect`.

**Explicitly: a US counterparty is not a rejection ground.** §5.1.4 of the Supabase review ruled that US domicile does not defeat s72(1)(a)(ii) under POPIA's contractual-adequacy test, and I will not manufacture the opposite finding for a smaller vendor two days later. Consistency is the point.

### 4.5 s57 prior authorisation — not required

No special personal information, no children's data, no unique-identifier linking, no criminal or credit data in the email flow (§2). **No s57(1)(d) prior authorisation.** Conditional, as at §4.4 of the Supabase review, on the C-9 boundary holding — extended here to mean no biometric artefact in email content, ever.

### 4.6 GDPR — still excluded, and this vendor is the cheapest hedge yet

Unchanged from `compliance-review-supabase.md` §4.5: **GDPR does not currently apply** (no EU establishment, no confirmed targeting or monitoring of EU data subjects). EU hosting does not trigger it; territorial scope turns on establishment and targeting, not server location.

**But note the asymmetry, and note it honestly.** If the recorded reopening trigger fires, an EU-established email operator is a **clean** hedge — the operator is already the GDPR-bound thing we would need it to be. That is a real and better hedge than §3.3's EU-region argument for Supabase, which §5.1.4 had to concede **only covers the primary store and not the US-domiciled sub-processor chain**. **The size of this advantage is entirely contingent on C-5.1**, and it shrinks to roughly Supabase's if the counterparty is the Delaware entity — with a further wrinkle: Twilio (US) sits in Brevo's sub-processor chain (§9), so even the EU-counterparty outcome does not give us a wholly EU chain.

---

## 5. What is actually in these emails — the credential-in-transit question

`compliance-review-supabase.md` §5.2 called this *"a genuinely sensitive flow"* before any vendor existed. Testing Brevo against that framing rather than against a generic vendor-security checklist:

### 5.1 The bar set for Supabase, and whether Brevo clears it

| Bar applied to Supabase | Brevo |
|---|---|
| **Written operator contract mandatory (s21)** | Available, unread. **Condition, not a gap** — C-5.6. **Equal.** |
| **Independent security certification** | Supabase: SOC 2 gated behind the Team plan (`compliance-review-supabase.md` §7 — a reason a Free-tier posture was ruled indefensible). Brevo: **ISO 27001:2022 certificate published first-party**, annually audited, apparently not plan-gated. **Brevo is stronger on this specific point**, and it is a point that mattered enough to drive §7's paid-tier ruling. SOC 2 Type II claimed by third parties only — **OI-14**. |
| **Encryption in transit / at rest** | Not verifiable by me to the standard `cybersecurity-architect` would require. SMTP submission must be TLS-enforced — **that is `cybersecurity-architect`'s call, and I am handing it over rather than ruling** (`compliance-review-supabase.md` §1's design/implementation split). What I do rule: **an unencrypted or opportunistically-encrypted submission path for a message carrying a live reset token is not a posture I will sign off**, and MUST/verify-certificate TLS is the compliance requirement. **Handed to `cybersecurity-architect`; C-5.6 does not close without it.** |
| **Breach notification obligation on the operator (s21(2))** | Unread. Pre-committed acceptance of a market-standard clause per §4.2. **Equal.** |
| **Sub-processor chain identified, with flow-down and change notice** | Supabase: dated, versioned, separately published list + **30-day change notice** — which §5.1.3 found "materially better than a 'may use affiliates and subcontractors' formulation." Brevo: list is **embedded in the DPA Schedule**, with no separately published versioned page I could find and **no verified change-notice mechanism**. **Brevo is WEAKER here**, and this is the one place it falls short of the Supabase bar. §9, **C-5.6(v)**, **OI-11/OI-12**. |
| **Vendor-side retention of the sensitive artefact minimised** | Supabase platform logs: plan-bound, days, **too short to rely on** (§6.3). Brevo: **unlimited by default, floor 1 month, and it retains the message body.** **Brevo is materially WEAKER**, in the opposite direction, and on the artefact that matters most. §6. |

**Assessment:** Brevo meets the Supabase bar on the load-bearing items (contract, certification, lawful basis, sub-processor flow-down in principle) and **falls short on two**: sub-processor transparency and vendor-side retention. **Neither is a lawfulness defect. Both are addressable by configuration and by reading the DPA at execution time. Neither justifies rejecting the vendor** — but the retention one would have shipped as an unmanaged indefinite store of live credential links if this review had rubber-stamped §2.1's one-line treatment of it, which is exactly what C-5 item 5 existed to prevent.

### 5.2 The interaction nobody has connected: token lifetime × vendor retention

The two facts have to be multiplied, not listed:

- **FR-16** already requires reset links/codes to be **single-use and time-limited**. Good, and independently required.
- **Brevo retains the rendered body for at least 1 month, and by default forever.**

Therefore **the residual risk of Brevo's retention floor is governed almost entirely by our own token TTL.** A retained preview of an already-consumed, long-expired token is close to inert — it discloses that a named person requested a reset at a time, which is behavioural PII (real, disclosable, low severity) but not a usable credential. A retained preview of a token with a 7-day or unbounded window, in an account whose retention was never configured, is **a month or more of harvestable live credentials for privileged accounts** sitting behind one third-party login.

**Ruling: the compliance requirement is that token lifetime must be small relative to the vendor's retention floor, so that vendor-side retention cannot hold a live credential.** Exact values are `authentication-engineer`'s and `cybersecurity-architect`'s (I defer on *how*), but the requirement is mine and it is **C-5.3**. Recommended, and to be departed from only with written justification: **password reset ≤ 60 minutes; email verification ≤ 24 hours; privileged-role invitation ≤ 72 hours** (tightened from a longer window precisely because §2's last paragraph makes invitation tokens the highest-consequence of the three). Single-use consumption must **invalidate server-side immediately** so that a retained copy is dead on first use regardless of its clock.

This is the good news in an otherwise unflattering section: **an operator-retention problem I cannot fix contractually is almost entirely neutralised by a control we already have to build anyway.**

---

## 6. Retention — the sharpest finding, and yes, the §6.3 caveat applies

### 6.1 What Brevo actually does

From Brevo's own help-centre documentation (provenance per §1 — first-party content, reached at one remove):

1. **Default at our volume: no time limit.** Under 10 million email events, transactional logs and email previews are stored indefinitely by default. We will be far under 10 million.
2. **Configurable range: 1 month to 5 years.** **The floor is 1 month, not zero.** Brevo requires it to run spam detection and compute sender reputation — i.e. the floor exists to serve **Brevo's** purposes, not ours. Under POPIA that is worth naming plainly: for that retained month, Brevo is processing our data subjects' information for a purpose of its own. It is a legitimate, ancillary, service-integral purpose, and I accept it as within the operator relationship — but it is the reason the floor is not negotiable and must be **disclosed** rather than papered over (§11).
3. **Scope includes "email previews" — the rendered message body.** Not just metadata. The token link.
4. **Changing the preview setting is NOT retroactive.** Only messages sent after the change are affected; existing previews persist under the old setting. **This is why ordering matters in §15 and why C-5.2 is a pre-first-send condition rather than a pre-go-live one.** If we send even one real reset email before configuring this, that body is retained under the unlimited default and no later setting change reaches it.
5. **A >10 million-event account gets a 24-month cap that overrides longer custom settings.** Irrelevant to us; recorded so a future high-volume reading of the same page is not mistaken for a change in the vendor's posture.
6. **Deletion after a settings change can take up to 24 hours.** Minor, but it means "configured" and "purged" are not the same instant — relevant if C-5.2 is ever executed remedially.

### 6.2 Ruling under s14

**POPIA s14 applies to Brevo's message store exactly as `compliance-review-supabase.md` §6.2.1 held it applies to `auth.audit_log_entries`: a vendor writing the record does not make the responsible party's retention-limitation obligation disappear.** Indefinite retention of message bodies containing verification and reset links, by a platform that publishes a 12-month retention policy, is both an s14 exposure and — the worse problem — **a misrepresentation of our own policy**.

**Difference from the Supabase finding, and it cuts in our favour:** `auth.audit_log_entries` had **no configurable retention control** at all, which is why C-4(c) had to contemplate purging inside a vendor-managed schema, or escalation to `cto` for a signed risk acceptance. **Brevo's retention is a documented, supported account setting.** This is a five-minute configuration change, not a material finding requiring escalation. **The gap is real; the fix is trivial; the failure mode is forgetting.** Hence C-5.2's requirement of a **dated, filed evidence artefact**, not merely a statement that it was done — consistent with this role's standing practice that retention enforcement must be auditable rather than policy-only.

### 6.3 Answering the task's third question directly: does the §6.3 caveat apply?

**Yes — and it applies in both directions, which the Supabase case did not require.**

`compliance-review-supabase.md` §6.3(1) barred Supabase platform logs from ever being cited as satisfying FR-12's audit-logging requirement, because they expire in days, are not purge-controlled by us, and are not queryable through our own admin surface. **Every one of those reasons holds for Brevo's message logs, plus a fourth: they are the wrong record entirely** — they evidence that Brevo attempted a delivery, not that our platform performed an authenticated, authorised action.

**Ruling (C-5.8), in the same shape as §6.3(1) so the precedent is visibly one rule and not two:**

- **Brevo's transactional logs, email previews and delivery events may never be cited as satisfying FR-12 audit logging, our 12-month retention policy, or any evidentiary obligation to the Information Regulator.** `app.account_audit_log` remains the record of authority. This closes off the Stage 9 shortcut ("Brevo already logs the send") in advance, exactly as §6.3(1) closed off "Supabase already logs this."
- **And the inverse, which is new and which Supabase did not present:** because Brevo's default is *indefinite* rather than *short*, its store is not merely a non-record — it is **an active s14 liability requiring affirmative configuration**. Short vendor retention was a disclosure problem. Long vendor retention is a compliance problem. Do not let the shared phrasing of the two caveats hide that they are opposite defects.
- **The fact of the send must still be logged by us**, in `app.account_audit_log`, **without the token or the token-bearing URL** — already required by `secrets-management-plan.md` §4 and correctly extended to token-bearing links by `smtp-vendor-selection.md` §5. Endorsed and made a condition here so it is not lost as a stylistic preference.

### 6.4 Backups

Brevo states it copies data at least 3× across at least 2 geographic locations, with encrypted cloud backups. **A retention setting change does not purge backups**, on the same reasoning as `compliance-review-supabase.md` §6.4. This is a normal and defensible position — **but only if stated.** The privacy notice's existing backup-tail sentence (§9.2 of that review) must be broad enough to cover the email operator and not only the identity store. Folded into C-5.7.

---

## 7. Purpose limitation — a marketing platform with a transactional side door

This is a Brevo-specific risk with no Supabase analogue, and `smtp-vendor-selection.md` does not consider it. It arises directly from the recommendation's own §1 observation that this is *"pure transactional email — no marketing, no bulk, no newsletter"* — **while the chosen vendor is primarily a marketing-automation platform** whose data model is contact-list-centric and whose free allowance is explicitly "transactional and marketing combined."

Three concrete exposures:

1. **Silent contact enrolment.** If Brevo's SMTP relay or API adds recipients to the account's contact database, then every person who signs up, resets a password, or is invited becomes a **marketing-addressable contact** as a side effect of a security email. Marketing to them would run on the wrong lawful basis — transactional email is s11(1)(b) contract-necessity, direct marketing requires consent (and, for electronic direct marketing to non-customers, POPIA **s69**'s opt-in regime) — and would breach **s13 purpose specification**, because we would be using data collected for account verification for a purpose never disclosed. **Whether the relay does this, I do not know — OI-15.**
2. **Marketing unsubscribe footers on security email.** If Brevo appends list-unsubscribe headers or an unsubscribe footer to transactional sends, two things go wrong at once. Legally, we mischaracterise a mandatory service message as marketing. Functionally — and this is the worse one — **a user who unsubscribes may be suppressed from receiving password-reset emails**, locking them out of their own account with no route back. That would degrade their practical ability to exercise **s23 access** and **s24 correction** rights, which is a compliance consequence and not only a support ticket.
3. **Allowance contention.** Any marketing send on the same account consumes the shared 300/day allowance. Exhausting it silently disables FR-3 and FR-15.

**Ruling (C-5.5): the Brevo account used for authentication email is a transactional-only account.** No marketing lists, campaigns, or automations built on or fed by these recipients; contact auto-creation verified and disabled or segregated; no marketing unsubscribe mechanism on FR-3/FR-6/FR-7/FR-15 messages. **Note that a purely compliance-motivated condition also eliminates exposure 3 at no cost** — the availability risk and the purpose-limitation risk have the same fix.

---

## 8. AI features — C-12 extends here by analogy, and I am extending it

Brevo's DPA reportedly names **"AI Third-Party Products"** as sub-processors, and states that AI-feature Input and Output — **including Content** — is shared with them. Brevo ships AI-assisted content features.

This is the **same species of risk as C-12** (`compliance-review-supabase.md` §5.1.5): a feature one click away from routing personal information to a new operator, with no published scope detail, wired up by a well-meaning engineer during development. "Content" in a transactional email account means **the message body — the token link and the recipient's address.**

**C-5.4, drafted deliberately in C-12's shape, standing and effective immediately:** no Brevo AI feature may be enabled on the account used for authentication email; no auth-email content, template, recipient list or transactional log may be submitted to one. Cheap to hold now, expensive to discover later. If a future feature genuinely needs it, that is a fresh compliance review, not a settings toggle.

---

## 9. Sub-processors and the s72(1)(a)(ii) onward-transfer limb

**I cannot discharge this limb for Brevo the way §5.1.3 discharged it for Supabase, and I am not going to pretend otherwise.**

What I have: Brevo places its sub-processor list **inside the DPA Schedule** rather than on a separately published, dated, versioned page. **Twilio (US)** is a named entry (third-party phone-number provider — relevant if SMS OTP under BR-1/FR-9 ever routes through Brevo, which would be a **new flow requiring its own review**, and is not in scope here). Unnamed **AI third-party products** are named entries. **OVH** (France/Germany) and **Google Cloud** (Belgium) are named infrastructure providers in Brevo's public hosting statements, though whether they appear as Schedule sub-processors I have not confirmed.

What I lack: the full list, any locations, and — most importantly — **the change-notice mechanism.** Supabase's **30-day advance notice** was a specific element of why §5.1.3 found its onward-transfer regime "substantially similar." A list embedded in a contract with no published versioning and no verified notice period is a **weaker** posture, and it is the one respect in which Brevo is clearly behind the bar this platform has already set.

**Ruling: the s72(1)(a)(ii) limb is NOT YET DISCHARGED for Brevo. It is discharged by reading the Schedule at DPA execution (C-5.6), not by this document.** Same sequencing as Supabase, where the limb sat open as OI-2 until the list was obtained. Recorded honestly as an open condition rather than an assumed equivalence.

**And the governance lesson, which is the more valuable output:** `compliance-review-supabase.md` C-3's live residual is that *"a 30-day notice regime with nobody reading the notices satisfies nothing."* Brevo now creates the **same** unowned obligation for a **second** vendor. `integration-architect` should extend the standing sub-processor-change ownership contemplated by C-3(b)/(c) to cover **both** vendors under one role-monitored process, rather than instantiating a second orphan. **Two unowned monitoring obligations are not twice as much monitoring as one; they are the same zero.**

---

## 10. Breach notification impact

`compliance-review-supabase.md` §8 established that **no breach notification runbook exists for this platform.** That remains true; I will not describe it as existing. Brevo adds three requirements to the runbook C-6 must produce:

1. **A Brevo-originated-breach path.** A compromise of our Brevo account or of Brevo itself exposes customer and staff email addresses **plus retained message bodies containing verification, reset and privileged-invitation links** (§6). Depending on token TTL (C-5.3) and retention configuration (C-5.2), that ranges from a low-severity behavioural-PII disclosure to a **live credential compromise for privileged accounts**. **The severity of a Brevo breach is a direct function of two settings we control** — which is a strong argument for closing C-5.2 and C-5.3 early rather than at go-live.
2. **Account-compromise is a distinct scenario from vendor-compromise, and is the more likely one.** A stolen SMTP credential permits sending believable, reset-token-bearing mail *as this platform* — a mass-phishing capability against our own customers. `smtp-vendor-selection.md` §5 already makes this point about credential handling and is right to. Its **detection** side needs an owner: anomalous send volume on the Brevo account is a security signal, and it is currently monitored by nobody. Handed to `security-engineer` / `site-reliability-engineer`, tied to the same **FU-02(c)** independent-detection work C-6 already refuses to let be descoped.
3. **Brevo's security-escalation contact and notification timeline must be recorded before an incident, not during one** — BCM §4.6, `integration-architect`. **C-5.9.**

---

## 11. Consent and disclosure copy (this role's authority)

`compliance-review-supabase.md` §9.2 already reserved a slot: *"Named processor category: email delivery provider for verification and password-reset messages (per C-5), with its region."* **That slot is now filled, and this is the fill instruction — not a new copy requirement.** It goes in the same privacy notice, not a separate one.

**Approved language (final strings still require the §9.2 copy pass with `technical-writer` and `ui-designer`):**

> **Sending you emails.** When we send you a verification link, a password-reset link, or an invitation to a staff account, we use **Brevo**, an email delivery service. Brevo receives your email address and the contents of that message. Brevo stores its servers in the **European Union** — in **France, Germany and Belgium** — not in South Africa. Brevo keeps a copy of these messages for a short period (currently **one month**) so it can detect abuse and protect delivery, after which the copy is deleted. We have a written data-protection agreement with Brevo requiring it to protect your information to a standard comparable to South African law.

**Five binding constraints on this copy:**

1. **The three §9.3 prohibitions apply unchanged**: no cross-border consent checkbox (§4.3 above); no claim that data stays in South Africa; **no placeholder region string in production**, covered by the same CI check.
2. **The retention number must be the number actually configured** under C-5.2. If the setting is not made, the sentence is false and may not ship. This is a live dependency between a config change and a legal statement — flagged so it is not broken silently later.
3. **The copy may not describe Brevo as "a European company"** unless C-5.1 confirms an EU counterparty. If the counterparty is Sendinblue, Inc., the honest formulation is about **where the servers are**, not about who the company is. Naming a European provider whose contracting entity is in Delaware is precisely the false-transborder-statement failure §9.3(2) prohibits — the same trap §5.1.4 caught for Supabase's sub-processor geography.
4. **Onward recipients get a category, not an invented geography** — same discipline as §9.2's sub-processor sentence. Brevo uses its own sub-contractors, bound through our agreement, **some of which are outside the European Union** (Twilio, US, is enough to make that sentence true and required). Do not assert an all-EU chain.
5. **Do not mention Brevo by name at signup unless the same treatment is given to Supabase.** §9.2 put the identity-store disclosure above the fold because it is the platform's most sensitive non-location dataset. The email operator is a **lesser** disclosure and belongs in the expanded privacy notice, not competing for signup-screen attention. Compliance copy that buries nothing also has to avoid drowning the important disclosure in the unimportant one — a point for `ux-researcher` / `ui-designer`.

---

## 12. RoPA — answering the task's fourth question

**Confirmed: Brevo goes into the SAME RoPA that `compliance-review-supabase.md` C-8 created. It does not get a separate record.** Recording it anywhere else would recreate the exact failure C-8 exists to fix — §2.3 of that review found that the SMTP flow was already *"currently invisible to the compliance record, which is exactly the failure mode this role exists to catch."* Fixing an invisibility problem by creating a second, parallel, differently-maintained register would be worse than the original defect.

Mechanically: C-8 already lists **SMTP** as one of the three §2.3 incidental-layer items it must cover. Brevo is that item's **content**, not a new item. C-5.7 specifies the fields, and the entry must record: the counterparty entity (C-5.1); the three named processing countries and their providers; the retention period actually configured, with the 1-month floor and its rationale; the sub-processor Schedule verbatim, per §9; the C-5.4 AI prohibition; the C-5.5 transactional-only constraint; the DPA's deletion-on-termination term; and the security-escalation contact.

**One structural note for whoever maintains C-8.** The RoPA now has two operators sharing an unresolved question (counterparty entity — C-2(ii) and C-5.1), an unresolved sub-processor-location question (OI-7 and OI-11), and an unowned change-notice obligation (C-3(b)/(c) and §9). Those are **register-level** patterns, not vendor-level facts. C-8 should be structured so that the third vendor — a payment gateway or GPS vendor, per `CLAUDE.md`'s open decisions — inherits the questions as a template instead of having them rediscovered a third time.

---

## 13. Conditions

Numbered as **sub-conditions of C-5** rather than continuing the C-1…C-12 sequence, deliberately: all nine discharge C-5's own five items, and **C-5 remains the single parent go-live blocker** so nothing is lost if only this document is read. Ordering markers: **[PRE-SEND]** must be true before the first email to a real address; **[GL]** blocks go-live; **[STANDING]** effective immediately.

| ID | Condition | Owner (A) | Blocks |
|---|---|---|---|
| **C-5.1** | **Determine and record which Brevo legal entity is our counterparty**, and which of Brevo's two DPAs (EU vs US/`INC`) applies to a South African customer. If it is **Sendinblue, Inc. (Delaware)**, correct `smtp-vendor-selection.md` §2.1/§4.1's EU-domicile reasoning in the record — the s72 basis then rests on the binding agreement alone (§4.4), identical in shape to Supabase, and the privacy-notice constraint at §11(3) engages. **Not a rejection ground either way.** Answered by the account-creation and DPA-acceptance flow itself, so it does **not** block starting. | `cto` / platform owner (observe at signup); `compliance-specialist` (ruling + record) | **[GL]**; blocks closing C-5 |
| **C-5.2** | **Configure retention before the first real send.** Set transactional-log retention to the minimum permitted (**1 month**) and set email-preview storage to off, or to the same 1-month minimum if it cannot be disabled. **The preview setting is not retroactive (§6.1.4)** — done afterwards, it does not reach messages already sent. File **dated evidence of the configured setting** in the compliance record; a statement that it was done is not evidence that it was. | `notification-engineer` (configure); `compliance-specialist` (verify + file) | **[PRE-SEND]**, **[GL]** |
| **C-5.3** | **Token lifetimes must be short relative to the vendor's 1-month retention floor**, so no retained copy can hold a live credential (§5.2). Required property: single-use consumption invalidates server-side **immediately**, and every token expires far inside one month. Recommended ceilings, departure requiring written justification and my counter-sign: **reset ≤ 60 min; verification ≤ 24 h; privileged-role invitation ≤ 72 h** — invitations tightest because they carry a credential to an account that can reach customer asset-location data (§2). Exact values are `authentication-engineer`'s and `cybersecurity-architect`'s; the requirement is mine. | `authentication-engineer` + `cybersecurity-architect` (values); `compliance-specialist` (requirement) | **[PRE-SEND]** (Stage 9 design constraint) |
| **C-5.4** | **No Brevo AI feature enabled on the account used for authentication email**, and no auth-email content, template, recipient list or transactional log submitted to one (§8). Brevo's DPA names AI third-party products as sub-processors receiving Input and Output **including Content**. Shaped like **C-12**; same species of risk. | `notification-engineer` / `security-engineer` (enforcement); `compliance-specialist` (prohibition) | **[STANDING]**, effective immediately |
| **C-5.5** | **Transactional-only account (§7).** Verify whether the SMTP relay/API auto-creates contacts (**OI-15**) and disable or segregate it; no marketing list, campaign or automation built on or fed by these recipients; **no marketing unsubscribe/list-unsubscribe mechanism on FR-3/FR-6/FR-7/FR-15 messages** — an unsubscribe that suppresses password-reset delivery locks a data subject out of their own account. Also removes the shared-300/day contention risk at no cost. | `notification-engineer` (config); `compliance-specialist` (purpose limitation) | **[PRE-SEND]**, **[GL]** |
| **C-5.6** | **Execute the correct DPA (discharges C-5 item 2) — and read these five things while it is open**, per §5.1.3's zero-cost precedent: (i) the **sub-processor Schedule verbatim**, with locations, into the RoPA; (ii) the **sub-processor-liability wording**; (iii) the **security-incident notification timeline**, measured against s21(2)'s *"immediately"* — a market-standard clause is **pre-accepted** per §4.2, but the number must be known because our s22 budget must absorb it; (iv) the **international-transfer mechanism** actually used, since §3 claim 3 makes the published "no SCCs needed" position insufficient on its own under POPIA; (v) the **sub-processor change-notice mechanism** (§9 — likely weaker than Supabase's 30 days). Plus **TLS-enforced SMTP submission confirmed by `cybersecurity-architect`** (§5.1). File the executed copy. | `cto` (signature); `compliance-specialist` (review + filing); `cybersecurity-architect` (TLS) | **[PRE-SEND]**, **[GL]** |
| **C-5.7** | **RoPA + privacy notice (discharges C-5 item 4).** Add Brevo to the **existing C-8 RoPA** as the content of its already-listed SMTP item — **not a separate record** (§12) — with the fields listed at §12. Fill the §9.2 privacy-notice slot with §11's approved copy, honouring all five constraints there, and extend the §6.4 backup-tail sentence to cover the email operator. | `compliance-specialist` (RoPA + copy approval); `technical-writer` + `ui-designer` (strings) | **[GL]** |
| **C-5.8** | **Brevo's logs, previews and delivery events may never be cited as satisfying FR-12 audit logging, the 12-month retention policy, or any evidentiary obligation to the Regulator** (§6.3). `app.account_audit_log` is the record of authority. The **fact** of a send must be logged there, **never the token or the token-bearing URL**. Same prohibition as §6.3(1) for Supabase platform logs — one rule, two vendors. | `backend-architect` / `authentication-engineer` (logging); `compliance-specialist` (prohibition) | **[GL]** |
| **C-5.9** | **Breach path recorded before an incident.** Brevo added to the **C-6** runbook as (a) a breach-origin scenario whose severity depends on C-5.2/C-5.3, (b) an **account-compromise/mass-phishing** scenario, and (c) a named security-escalation contact and notification timeline per BCM §4.6. Anomalous send-volume detection assigned an owner and tied to **FU-02(c)**. | `compliance-specialist` (runbook); `integration-architect` (escalation contact); `security-engineer` + `site-reliability-engineer` (detection) | **[GL]** |

---

## 14. Open items

Continuing the Supabase review's sequence, so there is one register and not two.

| ID | Open item | Who can answer | Consequence if unanswered |
|---|---|---|---|
| **OI-9** | **Which Brevo legal entity contracts with a South African customer**, and which of the two published DPAs applies. `Sendinblue, Inc.` (Delaware) is documented as the entity for customers outside Europe; Brevo's own documentation names France (SAS), North-America (Inc.) and Germany (GmbH) as location-dependent. | Visible on the account's billing/legal entity and on the face of the presented DPA; confirmable with Brevo | Drives **C-5.1**. Determines whether §4.4's statutory s72 limb is available and whether §11(3)'s copy constraint engages. **Lawfulness is unaffected either way**; accuracy of the record is not. |
| **OI-10** | **Brevo's DPA clauses**: breach-notification timeline, sub-processor liability, transfer mechanism, change-notice regime, deletion-on-termination, audit rights. **I did not read either DPA** (§1). | Read at execution — **C-5.6** | C-5.6 cannot close. s72(1)(a)(i) is assessed on the vendor's public positioning rather than its contract, which is not the standard §5.1.3 set. |
| **OI-11** | **Brevo's full sub-processor list, with locations.** Published inside the DPA Schedule, not as a separate versioned page. **Twilio (US)** and unnamed AI products confirmed via secondary sources only. | Read at execution — **C-5.6(i)** | **s72(1)(a)(ii) stays undischarged (§9).** RoPA must record *"not yet read"* rather than an inferred chain. **Locations must not be invented** — same rule as OI-7. |
| **OI-12** | **Brevo's sub-processor change-notice mechanism**, if any. Supabase's 30-day regime was load-bearing in §5.1.3's discharge; Brevo's equivalent is unknown. | Brevo / DPA text | No change-notice regime means each new sub-processor is an unassessed onward transfer. Feeds §9's single-owner recommendation. |
| **OI-13** | **Whether transactional-log retention configuration is available on Brevo's free tier**, or is plan-gated. If minimising retention costs money, then — on the identical reasoning to `compliance-review-supabase.md` §7's paid-tier ruling — **the free tier is not a compliant posture for this platform** and C-5.2 forces a paid plan. A cost decision, escalated to `cto` if so. | Brevo account settings / plan comparison | **C-5.2 may be unsatisfiable on the free tier.** This directly contradicts `smtp-vendor-selection.md` §4.2's premise that the free tier "removes cost as a factor entirely." Check **before** relying on that premise. |
| **OI-14** | **Whether Brevo holds a current SOC 2 Type II** as a first-party artefact. ISO 27001:2022 **is** first-party verified (§1). SOC 2 is third-party assertion only. | Brevo trust/security page or on request | Not a blocker — ISO 27001 alone already exceeds what §7 found for Supabase's plan-gated SOC 2. Recorded so the assertion is not repeated as verified. |
| **OI-15** | **Whether Brevo's SMTP relay / transactional API auto-creates contacts** in the account's marketing contact database. | Empirical test on a live account, or Brevo docs | Drives **C-5.5**. If it does and it is not disabled, every verification and reset recipient silently becomes a marketing-addressable contact — an **s13 purpose-specification** breach waiting for someone to send a campaign. |

**OI-10, OI-11 and OI-12 are all answered by the same act — reading the DPA at execution.** They should not become three separate approaches to the vendor, for the same reason §11 of the Supabase review consolidated four questions into one enquiry: a single dated artefact evidences due diligence; scattered tickets do not.

---

## 15. Verdict, and what the platform owner may now do

**C-5 item 5 is DISCHARGED. This document is the pre-selection compliance review that C-5 required, performed before finalisation rather than after. Brevo is APPROVED WITH CONDITIONS as C-5's vendor.**

**Yes — the human action can now proceed. The platform owner may create the Brevo account and execute the DPA.** Nothing in this review requires waiting for anything else, and no remaining question is answerable *without* an account (OI-9 and OI-13 are literally answered by going through the signup and settings flow). This was the last review gate in front of that step.

**But the order matters, because two of the conditions become unfixable if taken out of sequence.** Recommended sequence:

1. **Create the account.** While doing so, **observe and record which legal entity and which DPA are presented** → answers **OI-9**, feeds **C-5.1**.
2. **Before sending anything to any real address**, in the account settings: set **transactional-log retention to 1 month** and **email-preview storage to off / minimum** → **C-5.2**. Confirm the setting is available on the current plan → **OI-13**. **Do this before step 4, not after: the preview setting is not retroactive (§6.1.4), so anything sent first is retained indefinitely and permanently, and no later change reaches it.** File dated evidence.
3. **Configure the account as transactional-only** and test whether the relay auto-creates contacts → **C-5.5**, **OI-15**. Confirm no marketing unsubscribe is appended to transactional templates.
4. **Execute the DPA, reading C-5.6's five items while it is open** → **C-5.6**, and it closes **OI-10/OI-11/OI-12** in one pass. File the executed copy.
5. **Provision credentials** into Render's encrypted environment variables per `secrets-management-plan.md` and `smtp-vendor-selection.md` §5. Verify TLS-enforced submission with `cybersecurity-architect`.
6. **Then** `authentication-engineer` / `notification-engineer` build against §5's contract, with C-5.3's token lifetimes and C-5.8's logging rule in force, and remove the `console.warn` stand-ins.

**Steps 2 and 3 are free, take minutes, and are the two things that cannot be retrofitted.** If only one instruction survives from this review, it is: **configure retention before the first real send.**

**What this document does NOT discharge:** C-5 items 1–4 remain open pending C-5.1 … C-5.9. **This is not go-live clearance**, and it does not touch **C-2** (Supabase DPA), which `compliance-review-supabase.md` §13 records as the sole remaining Stage 9 blocker and which is unaffected by anything here. It does not ratify `smtp-vendor-selection.md` — `cto`/`solution-architect` awareness per that document's §8(2) is still theirs to give, and they should be told specifically that **the recommendation's primary stated reason (EU domicile) is now in doubt (§3 claim 4)** while the recommendation itself survives. And I agree with §9 that this is not an ADR.

---

## 16. Revisit triggers

- **C-5.1 resolves to Sendinblue, Inc. (Delaware).** §4.4's statutory limb is unavailable, §11(3) binds the copy, and the Brevo-vs-SES comparison in `smtp-vendor-selection.md` §4.1 must be re-recorded as a tie on domicile rather than a Brevo advantage. **Not a re-open of the vendor choice** — but see the next trigger.
- **An honest complication with the SES fallback, recorded rather than suppressed.** If Brevo's counterparty for us turns out to be a Delaware entity, it is **worth checking** whether AWS's contracting entity for a South African customer is **AWS EMEA SARL (Luxembourg)** — because if it is, then **SES would have the EU-established counterparty that Brevo was chosen for, and the recommendation's central comparison inverts.** **I have not verified this and am not asserting it.** It is not grounds to reopen now: POPIA does not turn on domicile (§4.4), Brevo wins on retention control, ISO 27001, onboarding friction and cost, and reopening a vendor search on an unverified inversion would be worse governance than proceeding with conditions. **But it must be checked before this platform repeats "Brevo is the EU-domiciled option" in any future document.**
- **Brevo changes its retention defaults, floors, or the scope of what "preview" stores.** Directly invalidates C-5.2 and the privacy-notice retention sentence (§11(2)).
- **Brevo's sub-processor Schedule changes**, particularly any new AI entry (→ **C-5.4**) or any non-EU hosting entry (→ §11(4)'s copy constraint). Requires OI-12's notice mechanism to exist and be owned (§9).
- **Any marketing email, campaign, or automation is proposed on this account** → **C-5.5** re-opens the s13/s69 analysis. A marketing programme is a separate lawful-basis exercise, not a settings change.
- **SMS OTP (BR-1 / FR-9) is routed through Brevo** → a new flow, a new data category (phone numbers), and a new sub-processor in the path (**Twilio, US**). **Not covered by this review.** Requires its own assessment.
- **Delivery-event webhooks are added** → `integration-architect`'s webhook-security standard per `smtp-vendor-selection.md` §5, plus a compliance look at what PII the payloads carry.
- **The customer base extends to EU data subjects** → the same GDPR reopening trigger as `compliance-review-supabase.md` §4.5/§14. Brevo is a **better** hedge than Supabase (§4.6), but only as good as C-5.1's answer, and **not** a wholly EU chain while Twilio is in it.
- **Send volume approaches Brevo's paid tiers or 10 million events** → the cost trigger in `smtp-vendor-selection.md` §10, plus the 24-month override at §6.1.5.

---

## 17. Pre-Approval Checklist (`compliance-specialist` self-review)

- [x] **Regulatory regime(s) confirmed** — POPIA, inherited and re-confirmed (§4). GDPR assessed as a hedge only, exclusion unchanged, and the hedge's value made contingent on C-5.1 rather than assumed (§4.6). PCI-DSS not applicable. **`integration-architect`'s GDPR-shaped "no SCCs needed" argument caught and corrected as inapplicable under POPIA (§3, claim 3)** — exactly the silent-regime-assumption failure this role exists to flag.
- [x] **Lawful basis / consent confirmed** — s11(1)(b)/(c)/(f) undisturbed (§2.2 of the Supabase review binds); transfer basis s72(1)(a) primary with s72(1)(c) supporting for customers; **consent expressly rejected again** (§4.3). No new consent artefact required.
- [x] **Data classified and mapped to retention** — §2 classification; §6 retention ruling, including the finding that the default is **indefinite** and the floor is **1 month over message bodies**; token lifetime tied to the vendor floor at C-5.3.
- [x] **Audit logging specified** — C-5.8: Brevo's logs barred from satisfying FR-12; `app.account_audit_log` confirmed as the record of authority; token values and token-bearing URLs barred from logs.
- [x] **PCI-DSS scope reviewed** — no payment data in this flow; scope unchanged and minimal.
- [ ] **Third-party/vendor data-sharing covered by a compliant agreement** — **OPEN.** No DPA executed with any Brevo entity; **I have not read either DPA (§1)**; **s72(1)(a)(ii) is undischarged (§9)**; the counterparty entity is unresolved (OI-9). All addressed by C-5.6 at execution, none difficult, none done.
- [ ] **Breach notification procedure reviewed and current** — **OPEN.** No runbook exists for this platform (§10, and C-6 unchanged). Brevo adds three requirements to it (C-5.9). Stated plainly rather than described as existing.
- [x] **Consent/disclosure copy reviewed and accurate** — §11 approved as **requirements** with five binding constraints. **Same caveat as `compliance-review-supabase.md` §9.2:** production strings do not exist and need a second pass, and **the retention number in the copy is only true once C-5.2 is configured.**

---

## 18. Sources

**Reviewed internal documents:** `smtp-vendor-selection.md` (in full); `compliance-review-supabase.md` (in full — §3.3, §4, §5.1, §5.2, §6, §9 load-bearing here); `business-requirements.md` FR-3, FR-6, FR-7, FR-15, FR-16.

**Brevo — first-party sources, with provenance per §1:**

- [Brevo — Data storage location (help centre)](https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location) — on-premise servers France + Germany (OVH primary host), cloud databases Google Cloud Belgium, ≥3 copies across ≥2 geographies, encrypted cloud backups. **Direct fetch returned HTTP 403; contents established via search-engine extraction of this first-party page, not read by this role.**
- [Brevo — Configure a custom retention period for transactional logs and email previews (help centre)](https://help.brevo.com/hc/en-us/articles/4415743225746-Configure-a-custom-retention-period-for-your-transactional-logs-and-email-previews) and [Manage your transactional logs and email previews](https://help.brevo.com/hc/en-us/articles/360021533839-Manage-your-transactional-logs-and-email-previews) — **no time limit by default under 10M events; configurable 1 month–5 years; 1-month floor for spam detection and sender reputation; preview setting not retroactive; 24-month override above 10M events; deletion up to 24h after saving.** **Same 403 / search-extraction provenance.** The single most decision-relevant source in this review, and the one `smtp-vendor-selection.md` §2.1 did not reach.
- [Brevo — Where can I find the DPA?](https://help.brevo.com/hc/en-us/articles/15403782599570-Where-can-I-find-the-Data-Processing-Agreement-DPA) and [How does Brevo comply with the GDPR?](https://help.brevo.com/hc/en-us/articles/360001258744-How-does-Brevo-comply-with-the-GDPR) — DPA location; sub-processors published inside the DPA; AI third-party products receive Input and Output including Content.
- [Brevo EU DPA (PDF)](https://corp-backend.brevo.com/wp-content/uploads/2024/08/BREVO-Annex-2-DPA-150524.pdf) — **NOT READ. HTTP 403.**
- [Brevo US / `INC` DPA (PDF)](https://corp-backend.brevo.com/wp-content/uploads/2024/09/20241709-US-BREVO-Annex-2-DPA-INC.pdf) — **NOT READ** (binary retrieved, no extraction tooling available). **Existence, filename and page-1 party block established from search-engine indexing:** *"Sendinblue, INC, a Delaware corporation, with a main address at 823 Congress Ave. Ste 300 Austin, TX 78701."* The **existence of a second, US-entity DPA alongside the EU one** is itself the material fact, and it is established.
- [Brevo Terms of Service](https://www.brevo.com/legal/termsofuse/) / [archive](https://www.brevo.com/legal/termsofservice-archive/) / [Privacy Policy](https://www.brevo.com/legal/privacypolicy/) — contracting entity *"Sendinblue Inc. dba Sendinblue"*; responsible entity varies by customer location among **Sendinblue France (SAS)**, **Sendinblue North-America (Inc.)** and **Sendinblue Germany (GmbH)**; French parent, Paris register no. 498 019 298. **Pages are JS-rendered and returned no usable text on direct fetch; established via search-engine extraction.**
- [Sendinblue ISO 27001 certificate (PDF, brevo.com)](https://www.brevo.com/wp-content/uploads/2022/11/SENDINBLUE-ISO27001-Certificate.pdf) — **first-party certification artefact located.** ISO 27001:2022, annually audited.
- [Brevo — Data Security and Privacy](https://www.brevo.com/features/data-security/) — **returned no usable content on fetch.** SOC 2 Type II remains third-party assertion only (**OI-14**).

**POPIA:** ss. 10, 11, 13, 14, 18, 19, 20, 21, 22, 23, 24, 26, 57, 69, 72 — cited from the Act, consistent with `compliance-review-supabase.md` §16. Insurance-regulatory framing not re-engaged: this flow creates no new outsourcing-governance obligation beyond the C-11 register entry, though Brevo should be **added** to that register as a second (non-material) outsourced provider.
