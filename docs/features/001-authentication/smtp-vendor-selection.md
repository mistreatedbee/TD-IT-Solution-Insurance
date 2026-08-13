# Feature 001 — SMTP / Transactional Email Vendor Selection (discharges C-5's vendor-evaluation half)

**Lifecycle stage:** 8/9 (Security Review / Development) — this document is the vendor-evaluation input `compliance-review-supabase.md` §5.2 required before C-5 can be closed.
**Author:** `integration-architect`
**Status:** **RECOMMENDATION ONLY — NOT RATIFIED.** Selects a candidate for `compliance-specialist` review and `cto`/`solution-architect` sign-off. Does **not** authorize account creation, DPA execution, or production credential provisioning.
**Discharges (partially):** [`compliance-review-supabase.md`](compliance-review-supabase.md) **C-5**, items 1 and (in part) 3 — provider selection with reasoning, and a documented retention-minimization posture for the recommended provider. **Does not discharge** C-5 items 2, 4, 5 (DPA execution, RoPA/privacy-notice entries, and `compliance-specialist`'s pre-selection review) — see §7.
**Reads on:** `compliance-review-supabase.md` §5.2 (C-5's requirement), `business-requirements.md` (FR-3, FR-6/FR-7, FR-15/FR-16), `secrets-management-plan.md` (credential-storage pattern this follows), [ADR-0003](../../organization/adr/0003-backend-hosting-platform.md) (Render as backend host), `backend/src/routes/auth.ts` and `backend/src/routes/invitations.ts` (the `console.warn` stand-ins this replaces).
**Consumers:** `compliance-specialist` (mandatory review before finalization), `cto` / `solution-architect` (awareness/ratification — see §8), `notification-engineer` (implements against the recommended contract), `authentication-engineer` (removes the stand-ins), `cybersecurity-architect` (webhook/security review if delivery-event webhooks are added later).

---

## 0. Why this document exists, stated up front

`authentication-engineer`'s Stage 9 build correctly left verification, password-reset, and invitation emails as disclosed `console.warn` dev stand-ins (`backend/src/routes/auth.ts` lines ~96–104, ~180–183, ~401–406; `backend/src/routes/invitations.ts` line ~85–87) rather than silently faking a send or picking a vendor unilaterally. `compliance-review-supabase.md` §5.2 named this gap as **C-5**, a go-live blocker, and required that whoever selects the provider do so against explicit criteria — EU/South African hosting preferred, a DPA, a recorded POPIA s72 basis, minimized vendor-side log retention — and that `compliance-specialist` review the choice **before** it is finalized, not after.

This is squarely this role's vendor-evaluation ownership. What follows is that evaluation. It ends in a recommendation, not a decision — see §8 for exactly who signs off on what.

---

## 1. Requirement recap (from C-5 and the business requirements)

What actually has to be sent, per `business-requirements.md`:

| Trigger | FR | Contents mailed | Sensitivity |
|---|---|---|---|
| Customer signup | FR-3 | Verification link/code | Email address + single-use verification token |
| Resend verification | FR-3 (implied) | Verification link/code | Same |
| Password reset request | FR-15 | Reset link/code | Email address + single-use reset token |
| Admin/security-company/support-agent invitation | FR-6/FR-7 | Invitation link, first-login instructions | Email address + single-use invitation token |

No marketing email, no bulk/batch sending, no newsletter — this is **pure transactional email**, low volume at this stage (pre-revenue MVP, no live customers yet). That shapes the evaluation: deliverability-for-critical-single-sends and a workable free/cheap tier matter far more than marketing-automation features, contact-list size, or send-volume discounts at scale.

Criteria, directly from C-5 plus this role's standard vendor-evaluation lens:

1. **Hosting region** — EU or South African preferred, same reasoning as `compliance-review-supabase.md` §3.3's Supabase region ruling (evidencability of the transborder position to the Information Regulator, hedge against a future GDPR reopening, no material latency cost given South Africa's geography relative to both EU and US regions).
2. **DPA availability** — a standard, executable DPA covering POPIA-adjacent obligations (s21 written-contract requirement) without bespoke negotiation, consistent with how Supabase's DPA was assessed.
3. **Message-log retention** — configurable/minimizable vendor-side retention of message content (which contains live reset/verification tokens), per C-5 item 3.
4. **Cost at this stage** — pre-revenue MVP; a workable free or near-free tier that doesn't force a subscription commitment before there's a paying customer.
5. **Deliverability** — verification and reset emails landing in the inbox, not spam, is a functional requirement (AC-1/AC-3/AC-9 all depend on the user actually receiving and acting on the email).
6. **Integration simplicity** — standard SMTP or a well-documented REST API usable from a Node.js/TypeScript backend without a heavy SDK dependency, consistent with `backend-approach.md`'s server-side-only, minimal-dependency posture.

---

## 2. Candidates evaluated

Three real, currently-operating providers, chosen to give a genuine EU-hosted option, a genuine EU-region option from a US-domiciled hyperscaler (the same shape of comparison `compliance-review-supabase.md` §3.3 already did for Supabase), and a well-known transactional-email specialist — deliberately **not** defaulting to the most-recognized brand (Postmark/SendGrid) without checking whether it satisfies the region requirement.

### 2.1 Brevo (formerly Sendinblue) — EU-domiciled

- **Corporate domicile and hosting:** Brevo SAS is headquartered in Paris, France. For EU-region accounts, Brevo processes and stores customer data (including transactional email content and logs) in EU data centers (Google Cloud Platform, Belgium), and states that no Standard Contractual Clauses are required for its standard EU deployment because the company and its infrastructure are both EU-domiciled.
- **This is materially stronger than an SCC-based argument.** Where Supabase's EU-region ruling (`compliance-review-supabase.md` §3.3) rested on a US-domiciled company's written commitment to keep primary data in an EU region plus SCC coverage for its (mostly US-domiciled) sub-processor chain, Brevo is an EU entity under EU jurisdiction as a matter of corporate fact, not a US company voluntarily hosting in the EU. For the same "evidencability to the Information Regulator" reasoning §3.3 already applied, this is the cleanest of the three options.
- **DPA:** Brevo publishes a standard DPA, accepted through the account/legal settings without bespoke negotiation — same "available to all organizations" shape as Supabase's.
- **Free tier:** 300 emails/day (transactional and marketing combined), no time limit, no credit card required. At this stage's traffic — pre-revenue, no live customers — that comfortably covers signup verification, password resets, and staff invitations. Paid tiers start at ~$9/month once daily-limit removal or higher volume is needed, well within an MVP budget.
- **Integration:** REST API (Node SDK available) and a standard SMTP relay endpoint — either can be used from the existing Express/TypeScript backend with no heavyweight dependency. SMTP relay is the simpler, more portable option (see §5).
- **Deliverability:** Established transactional-email product (used broadly for e-commerce/SaaS transactional sends); no known deliverability red flags for this use case. Not independently benchmarked by this review — flagged as an assumption to validate empirically once a real sending domain is configured (see §6).
- **Message retention:** Brevo's transactional log retention is configurable in account settings; must be set to the minimum the plan permits and documented per C-5 item 3 at implementation time — not yet done, and explicitly not claimed as done here.

### 2.2 Amazon SES (`eu-west-1` / `eu-central-1`) — US-domiciled, EU-region option

- **Hosting region:** SES is available in `eu-west-1` (Ireland) and `eu-central-1` (Frankfurt) among AWS's EU regions — the identical region set already in play for the Supabase decision (`compliance-review-supabase.md` §3.1/§3.3), which is a genuine point in its favor: **this is infrastructure already being reasoned about for this platform**, not a new provider category.
- **Corporate domicile:** Amazon Web Services, Inc. is a US (Delaware) entity; AWS Europe SARL is the EU contracting entity. This is the exact same shape of argument §3.3 and §5.1.4 already worked through for Supabase (US-domiciled entity, EU-region hosting, SCC-based DPA) — **not a new legal analysis, an application of one already done.**
- **DPA:** AWS's GDPR DPA (incorporating SCCs) applies automatically for EU-region use; no bespoke negotiation required.
- **Free tier / cost:** New AWS accounts get 3,000 free emails/month for the first 12 months (this replaced the older, more generous EC2-only free tier); after that, $0.10 per 1,000 emails — the cheapest per-message cost of the three at any real volume, with no fixed monthly fee. **Friction, not cost, is the issue:** new SES accounts start in a **sending sandbox** (can only send to verified addresses) and require an AWS Support production-access request (typically 1–3 business days) before they can email real, unverified customers — an extra step none of the other two candidates impose.
- **Integration:** SMTP interface (SES issues dedicated SMTP credentials, distinct from AWS IAM keys) or the SES API/SDK (`@aws-sdk/client-sesv2`). SMTP is the simpler path and matches the "simple SMTP for Node.js" requirement directly.
- **Deliverability:** Strong reputation infrastructure at scale, but as a shared-reputation, high-volume-oriented product, initial sending reputation for a brand-new, low-volume domain needs deliberate warm-up (SPF/DKIM/DMARC configuration, gradual volume ramp) — more operational setup than a provider that handles reputation management for you out of the box.
- **CLOUD Act consideration:** as with Supabase (`compliance-review-supabase.md` §5.1.4), a US-incorporated parent entity means data is potentially subject to US legal process regardless of EU hosting. Under POPIA's contractual-adequacy test this does not defeat the s72(1)(a) basis (same reasoning as §5.1.4) — but it is not the cleanest option available, since Brevo avoids the question entirely.

### 2.3 Mailgun (EU region) — US-domiciled, EU-region option, rejected as primary

- **Hosting region:** Mailgun offers an explicit EU region (`api.eu.mailgun.net`), with EU-region data centers, positioned specifically for GDPR-sensitive customers who want data processed without leaving the EU.
- **Corporate domicile:** Mailgun (Sinch) is a US-parented company; its EU-region product still relies on an EU-US Data Privacy Framework / SCC-style transfer story for elements of its operation, per the same pattern as SES and Supabase.
- **DPA:** A standard DPA addressing GDPR Article 28 is available.
- **Free tier / cost:** Materially worse than the other two for this stage — Mailgun's free tier is 100 emails/day (~3,000/month) versus Brevo's 300/day, and Mailgun's pay-as-you-go "Flex" tier is priced at $2 per 1,000 emails (roughly 20x SES's per-message cost) after a December 2025 price increase, with fixed plans starting at $35/month for 50,000 emails — pricing shaped for a mid-volume sender, not a pre-revenue MVP sending a few hundred transactional emails a month.
- **Verdict:** Technically adequate on region/DPA grounds (same tier as SES), but dominated by SES on cost and by Brevo on both cost and the cleaner EU-domicile argument. **Retained in this document as the third data point specifically so the recommendation isn't a two-horse race** — but not carried forward as a live alternative in §4.

### 2.4 Candidates considered and excluded before full evaluation

- **Postmark (Active Campaign / Wildbit):** widely recommended for transactional email and, notably, **already a named Supabase sub-processor** (`compliance-review-supabase.md` §5.1.1, "Active Campaign, LLC d/b/a Postmark") for Supabase's own authorized-user communications — a coincidence worth flagging so nobody later confuses "Supabase's vendor" with "our vendor," since these would be two independent contractual relationships if Postmark were also selected here. Excluded from full evaluation because **Postmark's core infrastructure and data processing are US-based with no EU-region option for standard plans** — EU-region storage exists only as an Enterprise-tier, availability-dependent add-on. That fails the EU/SA-hosting preference at the plan tier this MVP would actually be on, for no offsetting advantage the other three don't already provide.
- **SendGrid (Twilio):** US-domiciled (Twilio, Delaware), primarily US-region infrastructure for standard accounts. Excluded on the same EU-hosting-preference grounds as Postmark, and offers no clear advantage over SES (also inside the AWS/Twilio-adjacent hyperscaler category) to justify evaluating it as a fourth option.

---

## 3. Evaluation matrix

| Criterion | Brevo | Amazon SES (EU region) | Mailgun (EU region) |
|---|---|---|---|
| Hosting region | EU (Belgium, GCP) by default | `eu-west-1` / `eu-central-1` — must be explicitly selected | EU region available, explicitly selected |
| Corporate domicile | **EU (France)** | US (Delaware) | US (Sinch) |
| DPA available, standard, no negotiation | Yes | Yes (AWS GDPR DPA, auto-applies) | Yes |
| Transborder-basis cleanliness (POPIA s72 framing) | **Strongest — no SCC/adequacy argument needed, mirrors nothing already on the platform** | Same shape as the already-accepted Supabase argument (SCC-based, US-parent) | Same shape as SES, plus a DPF dependency for some data flows |
| Free tier fit for pre-revenue MVP | 300/day, no card, no time limit | 3,000/month for 12 months, then pay-per-use | 100/day (~3,000/month) |
| Ongoing cost at low volume | Free tier likely sufficient for the entire pre-launch period; $9/mo if daily cap is hit | Cheapest per-message cost at scale ($0.10/1,000) but no ongoing free allowance after year 1 | Most expensive per-message ($2/1,000 on Flex) |
| Onboarding friction | Low — no sandbox/approval gate | **Sandbox mode by default; production-access request required (1–3 business days) before sending to real, unverified recipients** | Low — no sandbox gate |
| Integration for this backend | REST API or SMTP relay; Node SDK available | SMTP (dedicated SES credentials) or AWS SDK | REST API or SMTP relay; Node SDK available |
| Deliverability posture | Established transactional product; not independently benchmarked here | Strong infra, but new/low-volume domains need manual reputation warm-up | Established transactional product; not independently benchmarked here |
| Message-log retention control | Configurable in account settings (must be minimized and documented at implementation — not yet done) | Configurable via SES/CloudWatch retention settings | Configurable via account settings |

---

## 4. Recommendation

> **2026-08-13 update (platform owner):** **Resend** is selected for auth transactional email via the Supabase `auth-send-email` Edge Function. The Brevo recommendation below is **superseded for production auth mail**. Resend setup: [`resend-setup.md`](resend-setup.md). A Resend-specific compliance review should follow the same C-5 checklist as §7.

**Recommend Brevo as the primary candidate, with Amazon SES (`eu-west-1` or `eu-central-1`) as the documented fallback if Brevo's evaluation (§6) or `compliance-specialist`'s review surfaces a disqualifying issue.**

Reasoning, in order of weight:

1. **The EU-hosting preference is satisfied more cleanly by Brevo than by any US-domiciled alternative.** `compliance-review-supabase.md` §3.3 already had to build an SCC-based, "US company committing in writing to EU-region hosting" argument for Supabase, and §5.1.4 had to separately reason through the fact that Supabase's own sub-processor chain is predominantly US-controlled even when the primary store is EU-hosted. Brevo removes that entire class of argument for this specific vendor: it is an EU company, under EU jurisdiction, storing data in the EU as a matter of corporate domicile, not a contractual accommodation layered on top of a US entity. For a document (the RoPA, the privacy notice) that must not overstate its transborder position, "an EU company processing EU-stored data" is a strictly easier sentence to write and defend than anything available from SES or Mailgun.
2. **It has the best-fit free tier for this exact moment.** The platform has no live customers yet (per root `CLAUDE.md`'s "no backend, no mobile app... no real product pages" framing still substantially true for production traffic even as Feature 001's backend code lands). 300 free transactional emails/day with no card and no time limit removes cost as a factor entirely until well past MVP validation — more generous than either AWS alternative once SES's 12-month free-tier clock is considered.
3. **It avoids SES's onboarding friction.** SES's sandbox-and-production-access-request gate is a real, if modest, delay that Brevo and Mailgun don't impose — relevant because C-5 is already a go-live blocker; adding an extra 1–3 business-day AWS approval step to the critical path is an avoidable delay for no compensating benefit given Brevo already satisfies the region preference more cleanly.
4. **SES is the documented fallback, not a discard, because of one real advantage it has:** if this platform's mail volume grows quickly (e.g., once customer MFA/notification volume scales per the roadmap items `compliance-review-supabase.md` and `business-requirements.md` both gesture at), SES's $0.10/1,000 cost floor is far below Brevo's paid tiers, and it reuses AWS infrastructure this platform may already be reasoning about for other purposes. If Brevo's deliverability or support responsiveness proves inadequate once real sending volume exists, SES is the next evaluation, not a fresh search.
5. **Mailgun is not carried forward.** It clears the region/DPA bar but is dominated on cost by both other candidates and offers no distinguishing advantage — recorded in §2.3 so the option isn't silently dropped, but not recommended.

**This is a recommendation, not a selection.** See §8 for exactly what happens next and who has authority to finalize it.

---

## 5. Proposed integration contract (this role's protocol-design authority, pending vendor ratification)

Regardless of which of the two live candidates is finally ratified, the integration should be built so a provider swap later is a configuration change, not a rewrite — consistent with this role's standing best practice of not coupling internal logic to a vendor-specific SDK shape:

- **Use standard SMTP, not a provider-specific SDK, as the default transport**, via a well-maintained SMTP library (e.g. `nodemailer`) inside a single, narrow internal module (proposed: `backend/src/lib/email.ts`) exposing a small, vendor-agnostic interface — e.g. `sendTransactionalEmail({ to, template, variables })` — that every call site (`auth.ts`, `invitations.ts`) depends on, never a vendor SDK directly. Both Brevo and SES expose standard SMTP relay endpoints, so this interface does not change if the vendor changes; only the `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD` values do.
- **Credentials follow the exact pattern `secrets-management-plan.md` §2–§6 already established** for `MONGODB_URI` / `SUPABASE_SERVICE_ROLE_KEY`: new variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS`) declared in `backend/.env.example` and fail-fast-loaded in `backend/src/config/env.ts`; stored in Render's encrypted environment variables in production (per ADR-0003), never in a `VITE_`-prefixed variable, never committed; rotated on the same 90-day cadence as the other two credential sets, with the same suspected-compromise runbook (§7 of that document) applying verbatim — a leaked SMTP credential is a mechanism for sending believable phishing/reset-token-bearing mail as this platform, which is a real abuse vector, not a lesser one than a leaked database credential.
- **No inbound webhook is part of this MVP scope.** Both Brevo and SES support delivery/bounce/complaint webhooks, which would be a genuine inbound third-party integration requiring this role's webhook-security standard (signature verification, replay protection) before being enabled. **Not building it now** — it is not required to discharge C-5 or FR-3/FR-15/FR-6 — but flagged here so that if `notification-engineer` adds bounce-handling later, it goes through a security review rather than being wired up as an unauthenticated endpoint.
- **Error/retry semantics:** the send call must be wrapped the same way `ctx.supabase` calls already are in `auth.ts` (see `SupabaseUnavailableError` → `UPSTREAM_UNAVAILABLE`) — an SMTP-send failure must not silently succeed the HTTP response as if the email went out, nor should it leak whether an account exists (the generic 202 responses in `auth.ts` must remain generic regardless of whether the underlying send succeeded, to preserve FR-5/FR-15's anti-enumeration property). A failed send should be logged (never with the token/link value, consistent with `secrets-management-plan.md` §4's "never log secret values" discipline extended to token-bearing links) and, where the design allows, retried with backoff rather than dropped.

This section is a proposed contract for `notification-engineer`/`authentication-engineer` to build against once a vendor is ratified — it is not itself an implementation and does not need to change if SES is chosen instead of Brevo.

---

## 6. Not yet done — explicitly named so it isn't assumed complete

- **No empirical deliverability test has been run against either candidate.** §3's deliverability assessment is reputation-based, not measured. Before go-live, whoever implements this should send real verification/reset emails to a handful of major inbox providers (Gmail, Outlook/Microsoft, a South African ISP mailbox if available) and confirm inbox placement, not just "send succeeded."
- **Message-log retention has not been configured or documented for either candidate**, per C-5 item 3. That is an implementation-time action against whichever vendor is ratified, not something this evaluation can complete in the abstract.
- **No account has been created with either vendor.** Nothing in this document should be read as implying Brevo or AWS SES already has a relationship with this platform.

---

## 7. What this document does NOT discharge

Restating C-5's five items against this document's actual scope, so nobody mistakes a recommendation for a closed condition:

| C-5 item | Status after this document |
|---|---|
| 1. Provider selected, EU/SA hosting preferred | **Recommendation made (§4), not selected.** Selection is finalized only per §8. |
| 2. Written operator contract / DPA executed, s72 basis recorded | **Not done.** No DPA has been executed with any candidate. The s72 analysis here is preparatory reasoning (§3–§4), not the formal recorded basis `compliance-specialist` must ratify. |
| 3. Vendor-side log retention minimized and documented | **Not done** — see §6. |
| 4. Added to RoPA and privacy notice | **Not done.** Follows the same pattern as `compliance-review-supabase.md` C-8/§9.2 once a vendor is ratified — new processor-category entry, exact region named, onward-recipient disclosure if the vendor has its own sub-processor list. |
| 5. Reviewed by `compliance-specialist` before selection is finalized | **This document is the artifact that review is performed against.** Review has not yet happened — see §8. |

**C-5 remains open after this document.** What changes is that it now has a concrete, criteria-based candidate to react to instead of an unstaffed open question.

---

## 8. Explicit authority statement — what happens next, and by whom

Per this role's charter ("Leads and drives the vendor evaluation/recommendation process... but final vendor sign-off is a joint decision with `cto` and `solution-architect`... this role does not unilaterally commit the company to a vendor contract") and per C-5 item 5's own instruction ("reviewed by `compliance-specialist` **before** selection is finalised, not after"):

1. **`compliance-specialist` reviews this document** — specifically §2's region/domicile claims, §4's recommendation, and whether Brevo's (or SES's) actual DPA text, once read in full, supports the s72(1)(a) basis the same way Supabase's did in `compliance-review-supabase.md` §4.3. **I have not had this document reviewed by `compliance-specialist` yet — that review is the next step, not a formality already satisfied.**
2. **`cto` / `solution-architect` are made aware of the recommendation** and any budget or strategic implication, consistent with how GPS-vendor and payment-gateway decisions are handled under this role's charter — even though SMTP vendor selection is a smaller-weight decision than those two, the same "does not unilaterally commit the company to a vendor contract" principle applies because this vendor will hold customer PII and reset/verification tokens under a signed legal instrument.
3. **Only after both of the above:** a human with the authority to do so (the platform owner / `cto`) creates the actual Brevo (or SES) account, executes the DPA by the process each vendor publishes, and provisions the resulting API/SMTP credentials into Render's environment variables per §5 and `secrets-management-plan.md`. **None of this — account creation, DPA execution, or credential provisioning — is something this document or this role performs.** They are named here as explicit, outstanding human actions, not implied as already done.
4. Once a vendor is ratified, `notification-engineer` and `authentication-engineer` implement against §5's contract, replacing the `console.warn` stand-ins named in §0.

---

## 9. Why this is a feature-level decision document, not a numbered ADR

`05-development-standards.md` §"Architecture Decision Records" scopes ADRs to decisions that are "expensive to reverse, affects multiple teams, or sets a precedent." I considered ADR-0004 for this and am deliberately not using it, for reasons worth stating rather than leaving implicit:

- **Reversal cost is low if built correctly, and this document's own §5 makes sure it stays that way.** Unlike Supabase-as-identity-system-of-record (ADR-0002), which embeds a vendor's proprietary Auth/session/MFA primitives throughout the authentication architecture in a way that would require a genuine migration project to undo (`compliance-review-supabase.md` §3.2's region-immutability finding is exactly this kind of lock-in), an SMTP provider sits behind a single internal interface (§5) and speaks a commodity protocol. Switching from Brevo to SES later is a credential and DNS (SPF/DKIM) change, not an architecture change — provided the abstraction in §5 is actually built and not bypassed.
- **It does not set a new precedent; it applies one already set.** The POPIA s72/DPA/RoPA evaluation method this document uses is the one `compliance-review-supabase.md` already established for Supabase. This is the vendor-register process (`compliance-review-supabase.md` §5.1.6's "process and ownership" pattern, and this role's charter responsibility to "maintain the integration vendor register") applied to a new, smaller vendor — not a new kind of decision for the organization to reason about for the first time.
- **`CLAUDE.md` and `05-development-standards.md`'s stack baseline explicitly name three vendor decisions as open, ADR-tracked architectural questions: payment gateway, GPS hardware vendor, and hosting provider.** SMTP is not among them. That is a deliberate signal from the org's own governing documents about which vendor calls carry stack-defining weight (and got ADR-0001/0002/0003 treatment) versus which are important-but-operational vendor onboarding, of the kind this role's charter separately describes as maintaining "the integration vendor register" rather than issuing an ADR per vendor.
- **What this document does *not* skip, precisely because the stakes are still real:** the same rigor ADR-0002/`compliance-review-supabase.md` used (region analysis, domicile analysis, DPA/s72 reasoning, an explicit non-ratification statement, named follow-ups) is applied in full above. The difference is procedural — no `solution-architect`/`cto` ADR-ratification ceremony — not analytical. If `compliance-specialist` or `cto` disagrees with this classification during §8's review, escalating this to ADR-0004 is a one-step change (retitle, refile under `docs/organization/adr/`) that loses none of the analysis already done here.

---

## 10. Revisit triggers

- **Brevo's actual DPA text, once read in full by `compliance-specialist`, fails to provide the s72(1)(a)-equivalent protections** Supabase's did — reopen with SES as the next candidate.
- **Sending volume grows enough that Brevo's paid tiers become materially more expensive than SES's per-message cost** — revisit in favor of SES, using this document's matrix as the starting point rather than a fresh search.
- **Brevo or SES materially changes its EU-hosting commitment, DPA terms, or sub-processor list** — same trigger class as `compliance-review-supabase.md` §14 already applies to Supabase.
- **The platform's customer base extends to EU data subjects**, firing the same GDPR-reopening trigger `compliance-review-supabase.md` §4.5/§14 already recorded for Supabase — Brevo's EU-native posture is a hedge in that scenario in exactly the way §3.3 reasoned Supabase's EU region was.
- **A future feature requires inbound delivery-event webhooks** (bounce/complaint handling) — triggers this role's webhook-security-standard review before enabling, per §5's explicit scope note.
