# SENT 2026-09-14 — CT-1 cross-border processing consent request to TD IT Solution (Pty) Ltd

**Status:** **SENT 2026-09-14.** Dispatched by the **platform owner** to *"TD IT Insurance
Solutions the owner"* — the Client's principal, understood to be the signatory to TDIT-2026-09 —
by email. **Sent as drafted, unmodified**, meaning the `[DATE]`, `[NAME]` and `[N]` placeholders in
§B went out unfilled and the internal §A/§C sections were not stripped. The operative content
(the §B paragraph 3 schedule) is complete and accurate as sent.

**Response received 2026-09-14:** *"its fine."* — a positive, unconditional reply. **No objection
and no condition were raised**, so §C.4 is not engaged.

**Compliance ruling on that response (`compliance-specialist`, 2026-09-14):** it is *writing* under
ECTA, but it is **not the consent asked for** — it identifies no scope, does not name clause 19(c)
or items 1/2/5/6, does not state that it binds TD IT Solution (Pty) Ltd, and is ambiguous between
acknowledgement and consent. **Clause 19(c) is therefore not yet satisfied.** CT-1's state is
**"sent — informally acknowledged, consent not confirmed in the required form"**, which is better
than unmet and short of met. Full reasoning and the one-line follow-up to close it (CT-1a) are at
[`../10-data-protection-contract-obligations.md`](../10-data-protection-contract-obligations.md)
**§10**. The §9.3 containment condition — no real customer PII on any surface — remains operative.

**The letter body at §B is the record of what was sent. Do not edit it.** §A and §C are preserved
as the pre-send record; their instructions are now historical.

*Original draft header, for the record:* Prepared by `compliance-specialist`, 2026-09-14, for the
platform owner to review, correct, and send (or delegate sending). No agent in this organisation
has a channel to the Client.

**Why this exists:** the owner delegated the CT-1 decision to the engineering organisation
("make the decision the Agents know best"). The *decision* that was delegable — whether to seek
consent or to remove the need for it by relocating infrastructure — is made and recorded at
[`../10-data-protection-contract-obligations.md`](../10-data-protection-contract-obligations.md) §9.
The consent itself is **not delegable to us**: it belongs to TD IT Solution, and only they can give
it. What follows is the work product that reduces the owner's remaining effort to *reading, correcting
and pressing send*.

**Read §A (pre-send checklist) before §B (the letter). Two boxes in §A are currently unticked.**

---

## §A — Pre-send checklist

Each row is a fact the letter asserts. An unverified assertion in a consent request is worse than a
late one: it will be read back to us, and a consent obtained on a wrong schedule is not consent to
what we actually do.

| # | Fact the letter asserts | Verified? | Source / owner |
|---|---|---|---|
| A1 | Backend API runs in **Render, Frankfurt (Germany)** | **YES** | `render.yaml:9` — `region: frankfurt`, read 2026-09-14 |
| A2 | Identity database is **Supabase Postgres, AWS `eu-central-1` (Frankfurt)** | **YES** | `adr/0006-privileged-access-audit-correlation.md` §17.8 — live project `TD IT Solutions`, `eu-central-1`, catalog-verified 2026-08-11. *This closes the "exact region code never recorded" gap the compliance register has carried since 2026-08-28.* |
| A3 | Web dashboards are hosted on **Vercel**, not Render | **YES (and this is a correction)** | `render.yaml:1–2` + `vercel.json`. The compliance register §2 cites `render.yaml:56` for a Render-hosted web service; **that line no longer exists.** Web is on Vercel per ADR-0003 §"Frontend stays on Vercel" |
| A4 | **Vercel's serving/edge region(s)** for the SPA | **NO — UNCONFIRMED** | `cloud-infrastructure-architect`. A static SPA is served from a global CDN; the honest disclosure is "globally distributed CDN, not localised to any single country" unless proven otherwise |
| A5 | **MongoDB Atlas region** (domain data) | **NO — UNCONFIRMED, CT-2, overdue since 2026-08-31** | `cloud-infrastructure-architect`. One look at the Atlas console answers it |
| A6 | Transactional email is sent via **Resend** (US-domiciled; 22 sub-processors, all US) | **YES** | `supabase/functions/auth-send-email/lib/send-email.ts:28`; `compliance-review-resend.md` |
| A7 | Data categories per §B Schedule 1 | **YES** | `compliance-review-supabase.md` §2.1; `backend/src/db/customer-profile-collections.ts`; `backend/src/lib/customer-profile-validation.ts:17–21` |
| A8 | Supabase **DPA execution status** | **NO — long-standing owner blocker** | Owner. §B para 5 is written so it does **not** claim an executed DPA. Do not "improve" it into one |

**Ruling on the two unconfirmed locations (A4, A5): send anyway, scoped.** The letter below seeks
consent for the locations we can evidence, and *expressly carves out* Atlas and Vercel as
supplementary items to follow. Waiting three more weeks for CT-2 to close before starting a
conversation that is already unstarted is the worse error. But do **not** delete the carve-out to
make the letter tidier — consent to a schedule containing an unknown is not consent to the unknown.

**Coordination note — CT-10.** A separate obligation exists to notify the Client about INC-001
under §19(b), and that notice is late (register §8, §8.3). **These are two documents, not one.**
Folding a breach notice into a consent request buries the notice and makes the consent look
extracted. They should go out in the same week, consent request first or simultaneously, never
merged. CT-10's draft is mine to produce and is not in this file.

---

## §B — The letter (ready to send, subject to §A)

> Send from a **domain address**, not the consumer webmail address currently in
> `backend/src/lib/email-footer.ts:44` (C-R-9 / CT-7). This letter is the worst possible place for
> that address to make its first formal appearance.

---

**To:** TD IT Solution (Pty) Ltd — attention: the signatory to contract TDIT-2026-09
**From:** NextWave Digital Solutions
**Date:** [DATE]
**Subject:** Request for prior written consent under clause 19(c) of TDIT-2026-09 — cross-border processing of personal information

Dear [NAME],

**1. Purpose of this letter**

Clause 19(c) of our agreement TDIT-2026-09 provides that we may not transfer personal information
outside South Africa without your prior written consent and equivalent protection being in place.

This letter asks for that consent. It also tells you plainly that the platform infrastructure was
provisioned in Europe **before** we sought your consent, which is not the order clause 19(c)
contemplates. We are raising it ourselves, with a full schedule of where everything sits, rather
than leaving you to discover it.

We are not asking you to ratify this as a formality, and we would ask you not to treat it as one.
You are entitled to decline, or to consent subject to conditions. Paragraph 7 sets out honestly
what each of those outcomes would mean.

**2. Why the platform is hosted outside South Africa**

Not as a preference, and not to reduce our costs. The two core services simply have no South
African option:

- **Our application hosting provider (Render) operates no African region at all.** Its regions are
  Oregon, Ohio and Virginia (United States), Frankfurt (Germany) and Singapore. Frankfurt is the
  only one of the five inside a jurisdiction with data-protection law the South African Information
  Regulator would recognise as broadly equivalent.
- **Our identity/authentication database provider (Supabase) does not offer a South African region
  for new projects.** A Cape Town region existed during that provider's early-access period and was
  withdrawn. We selected Frankfurt on the same reasoning.

We have re-examined whether we could relocate to South Africa and avoid this request entirely. We
could move one component (the operational database) to a South African data centre; we could not
move the application servers or the identity database without replacing both suppliers and
substantially rebuilding the authentication system. That is disproportionate to this engagement,
and it would not change the position for data already processed. We concluded it was more honest to
come to you with the request than to present a partial migration as a solution.

**3. Schedule of processing locations — what is where**

| # | Component | Provider | Location | Personal information it holds |
|---|---|---|---|---|
| 1 | Application / API servers | Render Services, Inc. (US company) | **Frankfurt, Germany** | All personal information listed at items 2 and 3 **passes through** these servers in the course of every request. See the note below on identity numbers. |
| 2 | Identity & authentication database | Supabase (on Amazon Web Services) | **Frankfurt, Germany** (`eu-central-1`) | Email address; optional mobile number; password (stored only as an irreversible hash, never as the password itself); multi-factor authentication enrolment state; sign-in timestamps, IP addresses and device/browser identifiers; authentication audit records; administrator invitations |
| 3 | Operational database (policies, assets, cases) | MongoDB Atlas (on Amazon Web Services) | **To be confirmed — see paragraph 4** | Customer name and date of birth; mobile number; **the last four digits only** of the South African ID number; residential address; emergency-contact name, relationship and number; policy records; insured-asset records (make, model, serial/IMEI); theft-report and recovery-case records; notification records |
| 4 | Customer, administrator and security-company web dashboards | Vercel Inc. (US company) | Served from a **globally distributed content network**, not localised to one country. These are browser applications; **they hold no personal information at rest** — all data is fetched live from item 1 | — |
| 5 | Transactional email (account verification, password reset, service notifications) | Resend (US company) | **United States** | Recipient email address; single-use verification/reset links; and, for service notification emails, the content of the notification, which can include theft-report and recovery-case references and IP addresses |
| 6 | Underlying data-centre operator for items 2 and 3 | Amazon Web Services | As per items 2 and 3 | As per items 2 and 3 |

**A specific disclosure we want to make expressly, rather than leave inside a table.** When a
customer completes identity verification, the **full 13-digit South African ID number is submitted
to, and validated by, the application servers in Frankfurt.** Only the last four digits are then
retained; the full number is not stored. The transmission and momentary processing of the full
number in Germany is nonetheless a cross-border processing of personal information, and it is the
single most sensitive element in this schedule. We are disclosing it separately so it cannot be
said we did not.

**4. Two items we cannot yet state with certainty**

We are not going to guess at these.

- **Item 3 (operational database) — region not yet confirmed.** We have an open internal action to
  confirm the exact data-centre region of this database from the provider's console, and it has not
  been returned. We will write to you with the confirmed region within **[N] business days**.
- **Item 4 (web dashboards) — content-network geography.** These hold no data at rest, but we have
  not established which edge locations serve them.

**Your consent is therefore sought in this letter for items 1, 2, 5 and 6 only.** We will seek your
consent separately for item 3 once its region is confirmed, and for item 4 if it turns out to carry
anything more than transient page delivery. We would rather ask you twice than ask you once for
something we could not fully describe.

**5. The safeguards in place — clause 19(c)'s "equivalent protection" limb**

- **Legal basis for the transfers.** Sections 72(1)(a) of POPIA permits a transfer where the
  recipient is subject to an agreement that upholds principles of protection substantially similar
  to POPIA's. Germany applies the EU General Data Protection Regulation, which meets and in places
  exceeds POPIA. We hold a written analysis of each transfer against section 72 and will provide it
  on request.
- **Contractual protection down the chain.** Each provider in paragraph 3 offers a standard data
  processing agreement with onward-transfer and sub-processor terms. **We are completing the
  execution and record-keeping of these agreements and will confirm each one to you in writing** —
  we mention this because we would rather you knew the work was in progress than be told it was
  finished.
- **Technical measures currently in place.** Encryption of all data in transit; encryption at rest
  by each provider; database-level row access controls on identity data; multi-factor
  authentication available on accounts; an append-only audit log of authentication and privileged
  access events with a 12-month retention policy; no payment card data is held on the platform at
  all (no payment processing is live).
- **Purpose limitation.** Personal information is processed only to operate the platform under our
  agreement. It is not sold, licensed, shared with advertisers, or used to train any model —
  consistent with clause 19(e), which we treat as a standing prohibition.
- **In progress, stated honestly:** a documented breach-notification procedure supporting the
  48-hour notice we owe you under clause 19(b), and a written record of your instructions to us
  under clause 19(a). Both are being produced now. Neither is complete as at the date of this
  letter.

**6. What we are asking you to do**

We ask for your **prior written consent under clause 19(c)** to the processing of personal
information at the locations listed at items 1, 2, 5 and 6 of paragraph 3, on the safeguards
described in paragraph 5.

Either of the following would satisfy us as "written consent"; the first is faster, the second is
the better record:

- **(a) A reply to this email** from a person authorised to bind TD IT Solution, stating: *"TD IT
  Solution (Pty) Ltd consents, for the purposes of clause 19(c) of TDIT-2026-09, to the
  cross-border processing described in items 1, 2, 5 and 6 of the schedule in your letter dated
  [DATE]."* Under the Electronic Communications and Transactions Act, an email is writing; we would
  treat this as effective on receipt.
- **(b) A signed consent addendum to TDIT-2026-09**, which we will prepare and send for signature
  on request, annexing the paragraph 3 schedule.

Our recommendation is **(a) now, so that neither of us is left with an unresolved contractual
position, and (b) to follow** as the durable record.

If you would like to discuss it before responding, we would welcome that — a call is a better
medium than this letter for anything you want to push back on.

**7. If you would rather not consent, or want to consent conditionally**

This is a real option and we would rather set out its consequences than have you infer them.

- **If you decline**, we would need to stop processing personal information at these locations. In
  practice that means suspending live use of the platform while we evaluate replacement providers
  with South African hosting, and re-building the authentication layer against one. That is a
  significant piece of work outside the current retainer and would need to be scoped and quoted
  under the Change Request procedure. We would not want you to consent simply to avoid that
  conversation — if South African data localisation is a requirement for you, it is much cheaper to
  discover it now than later.
- **If you consent subject to conditions** — for example, that the operational database be moved to
  the South African region that its provider does offer, or that email be moved to a European
  provider, or that we come back to you before any new supplier is added — please say so. Each of
  those is achievable, and the first two are achievable without rebuilding anything.
- **Either way**, we will not place further personal information on the platform beyond what is
  already there until we have your answer.

**8. A note on the timing**

We should have asked before provisioning, not after. We are not asking you to disregard that, and
we are not treating your consent as a formality that tidies it up. Our view is that the transfers
are lawful under POPIA and that no individual has been disadvantaged, but the clause you agreed is
stricter than the statute, and that is the clause that governs.

We would be grateful for your response by **[DATE — suggest 10 business days]**.

Yours sincerely,

[NAME]
[TITLE]
NextWave Digital Solutions
[DOMAIN EMAIL ADDRESS — not a personal webmail address]

---

## §C — Notes for the sender (do not include in what you send)

1. **Do not soften paragraph 1, 7 or 8.** They are the paragraphs that make this a genuine request
   rather than a rubber stamp, and the CTO's standing instruction is that nobody presents this to
   the Client as a formality.
2. **Do not add a claim that any data processing agreement is executed** (paragraph 5, second
   bullet) until that is actually true and evidenced. The current wording is deliberately in the
   present-continuous.
3. **Fill every `[ ]` placeholder.** `[N]` in paragraph 4 should be a number you are willing to
   meet — if CT-2 has closed before you send, replace the whole paragraph-4 bullet with the
   confirmed region and move item 3 into the paragraph-6 ask.
4. **If the Client responds with conditions**, route the response to `compliance-specialist` before
   anyone agrees to anything — a condition like "move the database to South Africa" has an
   architecture and a cost consequence that is `cloud-infrastructure-architect`'s and `cto`'s to
   price, not the correspondent's to accept.
5. **On dispatch**, rename this file `SENT-<date>-...`, record sender/recipient/channel at the top,
   and tell `compliance-specialist` so CT-1's register entry moves from "unmet" to "requested,
   awaiting response" — which is a materially different exposure and should be recorded as such.
6. **This is not legal advice.** Paragraph 5's POPIA section 72 characterisation and paragraph 6's
   ECTA point are compliance determinations from this organisation's own analysis. If admitted
   counsel is to see one document from this matter, this is the one.
