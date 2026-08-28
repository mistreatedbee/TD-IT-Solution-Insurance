# 10 — Data Protection Obligations Under the Client Contract (TDIT-2026-09)

**Owner:** `compliance-specialist`
**Date:** 2026-08-28
**Status:** Active. Binding on `cto`, `cloud-infrastructure-architect`, `devops-engineer`,
`backend-architect`, `database-architect`, `security-engineer`.
**Not legal advice** — see §7.

This document records the POPIA obligations created by the **§19 Data Protection clause of
contract TDIT-2026-09** (NextWave Digital Solutions ↔ TD IT Solution (Pty) Ltd), and the gaps
between those obligations and the repository's verified state on 2026-08-28.

It does **not** restate the POPIA method already established in
[`compliance-review-supabase.md`](../features/001-authentication/compliance-review-supabase.md) §4–§6
(operator framing, s21 contracts, s72 transborder tests, RoPA) or the INC-001 findings in
[`incidents/INC-001-location-ingestion-popia-assessment.md`](incidents/INC-001-location-ingestion-popia-assessment.md).
Those bind unchanged. This document records **what is new**, and only that.

---

## 1. The structural change: we are an Operator, and nobody wrote that down

Every compliance artefact in this repository to date has analysed a **single-tier** relationship:
"the platform" as responsible party, and its vendors (Supabase, Brevo/Resend, AWS) as operators.

TDIT-2026-09 §19 establishes a **two-tier** structure that no existing document reflects:

| Party | POPIA role | Consequence |
|---|---|---|
| **TD IT Solution (Pty) Ltd** (Client) | **Responsible Party** | Determines purpose and means. Owns the s18 notice, the s22 Regulator notification, and the s23/s24 data-subject response. |
| **NextWave Digital Solutions** (Developer — us) | **Operator** (POPIA s1, s20–s21) | May process personal information **only on the Client's documented instructions**. Owes s19 security safeguards, a 48-hour breach notice to the Client, and no independent purpose. |
| Supabase / Resend / MongoDB Atlas / Render / AWS | **Sub-operators** | Engage s72(1)(a)(ii) onward-transfer obligations, now **through us**, not directly for the Client. |

**Four contract obligations, verbatim in substance:**

- **§19(a)** Developer processes personal information only on documented Client instructions.
- **§19(b)** **48-hour breach notification to the Client** from the time the Developer becomes aware.
- **§19(c)** **No cross-border transfer of personal information outside South Africa** without the
  Client's **prior written consent** and equivalent protection in place.
- **§19(d)** Test data must be **anonymised or deleted after test completion**.
- **§19(e)** No monetisation of personal information.

**Assessment:** this is **net-new information**. It is recorded in no ADR, no compliance review, and
no governance doc — see §5. The most consequential piece is not any single clause, it is that
**"documented Client instructions" (§19(a)) does not currently exist as an artefact.** Engineering
access to the live Supabase project and Atlas cluster is currently ungoverned by any instruction
record. Under s20/s21, an operator processing without instruction is processing without authority,
irrespective of how benign the processing is.

---

## 2. §19(c) cross-border transfer — **CONFIRMED BREACH POSTURE, not an open question**

The task framing offered "flag as an open question if unclear." It is not unclear for the two
surfaces that are deployed. It is confirmed, in code, today.

| Store / service | Physical location | Source (verified 2026-08-28) | Outside SA? |
|---|---|---|---|
| **Backend API** (`td-it-insurance-api`) | **Frankfurt, Germany** | `render.yaml:9` — `region: frankfurt` | **Yes — confirmed** |
| **Web** (`td-it-insurance-web`) | **Frankfurt, Germany** | `render.yaml:56` — `region: frankfurt` | **Yes — confirmed** |
| **Supabase Postgres** (identity, all account PII) | "an EU region", exact code never recorded | `compliance-review-supabase.md` §3.4 (owner confirmation 2026-08-08) | **Yes — confirmed, region code still unrecorded** |
| **MongoDB Atlas** (domain data, incl. INC-001 coordinates) | **UNKNOWN** | Unconfirmed anywhere in repo; open as **INC-001-C-3** | **Unknown — treat as outside SA until evidenced** |
| **Resend** (auth email — the *shipped* provider) | **UNKNOWN — and unreviewed** | `supabase/functions/auth-send-email/lib/send-email.ts:28` posts to `api.resend.com` | **Unknown; US-domiciled vendor, presume outside SA** |

**Three findings.**

**(a) Every deployed surface of this platform runs outside South Africa, and there is no record of
the Client's prior written consent to any of it.** §19(c) requires *prior* written consent. ADR-0003
selected Render on architecture-fit grounds and **contains no region analysis, no POPIA analysis,
and no mention of data location at all** — the word "region" appears in it only in the phrase
"region coverage" as a deferred future evaluation item. `region: frankfurt` was set without a
compliance decision behind it. This is a **contractual** defect layered on top of the POPIA s72
position; note carefully that the two are **not** the same test:

- Under **POPIA s72(1)(a)**, an EU location is lawful via the binding-agreement route already ruled
  on at `compliance-review-supabase.md` §4.3. **The transfers are probably lawful under the statute.**
- Under **§19(c)**, lawfulness is irrelevant — the clause requires the *Client's written consent*
  as a precondition, and consent that does not exist cannot be cured by the transfer being
  otherwise lawful. **The contract is stricter than the statute here.** Do not let anyone close
  this by citing the s72 ruling.

**(b) The Atlas region is now a contract question, not only an incident follow-up.** INC-001-C-3
already asks `cloud-infrastructure-architect` for it (deadline 2026-08-28, i.e. today). That
condition is unchanged but its weight increases: an unconfirmed Atlas region is now an unevidenced
answer to a **contractual** obligation owed to a counterparty who can enforce it, not only to a
regulator who has not asked.

**(c) The shipped email operator has never been compliance-reviewed.**
`compliance-review-smtp-vendor.md` analyses **Brevo** (EU footprint: Belgium/France/Germany). The
code sends via **Resend**. There is no s21 contract analysis, no s72 basis, and no sub-processor
review for the operator that actually handles every verification and password-reset email. This is
an unreviewed operator in the live path, which is independently a §19(c) and s72 gap.

**Related, minor but real:** the platform's outbound email footer
(`backend/src/lib/email-footer.ts:44`) publishes a **consumer webmail address** as the platform
contact. That address is unsuitable as the s18 notice contact or the s23/s24 data-subject-request
channel, and routing data-subject requests through a consumer mail provider adds a further
undocumented operator. Raised as **CT-7**.

---

## 3. §19(b) 48-hour breach notification — **GAP. No runbook exists.**

**There is no breach notification runbook in this repository.** This is not an inference:
`compliance-review-supabase.md` §6 records it explicitly as **C-6, a go-live blocker**, with the
statement *"no breach notification runbook exists for this platform today."* `docs/organization/`
contains one runbook (`runbooks/aud-8-privileged-access-reconstruction.md`) and it is an audit
reconstruction procedure, not an incident-notification procedure.

**What §19(b) changes about C-6:**

1. **A new, tighter, and differently-shaped clock.** POPIA s22(2) says "as soon as reasonably
   possible" with no fixed hour count. §19(b) imposes a **hard 48 hours to the Client** from
   Developer awareness. That clock starts **earlier and runs shorter** than anything currently
   contemplated, and it runs on *us* (Operator → Responsible Party), not on the Client.
2. **The clock is now nested three deep and nobody has drawn it.** Supabase's own DPA allows it up
   to 48 hours to notify us (`compliance-review-supabase.md` §4.2). If a Supabase-originated breach
   consumes 48 hours reaching us, our own 48 hours to the Client starts fresh at that point, and
   only then does the Client's s22 "as soon as reasonably possible" duty to the Information
   Regulator begin. **A worst-case chain of ~96 hours before the Regulator hears anything is
   structurally possible and is not defensible as "as soon as reasonably possible."** The runbook
   must compress this, not merely document it.
3. **INC-001 exercised this chain for real and it failed on a channel, not a decision.**
   INC-001-C-8 records that the platform **cannot reliably reach its own data subjects** —
   production email delivery is still owner-blocked. A 48-hour notification obligation whose
   delivery mechanism is unbuilt is not satisfied by a documented intent to notify.
4. **The awareness trigger is undefined.** "Becoming aware" needs a named role who can declare it.
   Absent that, the 48 hours starts at an arguable time, which in a dispute is the Client's
   argument to make, not ours.

**Ruling: C-6 is upgraded.** It was a go-live blocker under POPIA. Under §19(b) it is now also a
**live contractual exposure from the moment the contract is in force**, independent of whether
production customer data exists. Restated as **CT-3**.

---

## 4. §19(d) test data — the fixtures are fine; the live-cluster practice is not

**Static fixtures: clean, no action.** Test data in `backend/src/**/*.test.ts` is patently synthetic
(sequential IMEI/ID digits, `+27821234567`-style placeholder numbers, `@tditsolutions.dev`
addresses). `backend/scripts/seed-test-accounts.ts` creates three accounts on a non-routable
`.dev` domain with literal test names. **No real personal information is committed to source.**
§19(d)'s anonymisation limb is satisfied for anything in the repository.

**Two real exposures, neither of which is about fixtures:**

**(a) Seeded accounts persist in the live identity store with no deletion step.**
`seed-test-accounts.ts` writes into the **production Supabase project** and the **production
Postgres `app` schema** (it requires repo-root `.env.local` Supabase credentials, and `render.yaml`
shows one Supabase project across environments). It is idempotent and re-runnable, and `--force`
deletes-and-recreates — but there is **no teardown path**: nothing deletes seeded accounts *after*
testing without also recreating them. §19(d) requires deletion after test completion. The current
design guarantees indefinite persistence. **CT-5.**

**(b) The material breach of §19(d) already happened, and it is INC-001.** MP-8 records that **one
Atlas cluster backs local dev, test, and production** — there is no staging environment. INC-001
§5.1 states this directly: *"'production' and 'test' data are co-mingled in one cluster and cannot
be separated by environment."* The consequence is exact and it is the §19(d) failure in its purest
form: **real people's real GPS coordinates, captured during preview-APK testing, are sitting in the
live cluster with no retention rule and no deletion job** (`location_events` has no TTL index,
INC-001 §2.2). Test activity produced live personal information that was neither anonymised nor
deleted. INC-001's purge (INC-001-C-7, hard deadline 2026-09-08) is now **also** the remedy for a
contractual obligation, not only a regulatory one — which raises, not lowers, the cost of letting
that deadline slip. **CT-6.**

---

## 5. Was any of this already captured? No.

Searched `docs/organization/` and `docs/features/` for the operator framing, the 48-hour term, the
cross-border-consent term, and the test-data term.

| §19 obligation | Already recorded anywhere? |
|---|---|
| Developer = Operator / Client = Responsible Party | **No.** All existing artefacts analyse a single-tier structure with "the platform" as responsible party. **Net-new.** |
| Processing only on documented Client instructions | **No.** No instruction record exists in any form. **Net-new.** |
| 48-hour breach notice to Client | **No.** C-6 anticipates a runbook; the 48-hour term, its trigger, and its recipient are new. **Net-new.** |
| No cross-border transfer without prior written Client consent | **Partially.** The s72 *statutory* analysis is thorough (`compliance-review-supabase.md` §4.3, §5.1.3). The **contractual consent precondition** is new, is stricter, and is unmet. |
| Test data anonymised/deleted after test | **No.** Nothing in `05-development-standards.md` or `06-security-standards.md` addresses test-data lifecycle. **Net-new.** |
| No monetisation of personal information | **Indirectly.** SDL-2 and C-008-1 restrict what location data may drive; a general non-monetisation term is broader and is new. Practical effect today: **no analytics, ad-tech, or data-sharing integration may be introduced without my review** — this closes off a class of decisions before anyone proposes one. |

**Conclusion: substantially net-new, and this document is the record.** It is deliberately filed in
`docs/organization/` rather than under a feature, because §19 binds every feature and pre-dates all
of them.

---

## 6. Conditions register — TDIT-2026-09

| ID | Condition | Owner | Deadline / blocks |
|---|---|---|---|
| **CT-1** | **Obtain TD IT Solution's prior written consent to cross-border processing**, itemising each location: Render Frankfurt (backend + web), Supabase EU region (exact code), MongoDB Atlas (region per CT-2), Resend, and AWS as substrate. Attach the equivalent-protection evidence §19(c) requires — the s72(1)(a) binding-agreement analysis at `compliance-review-supabase.md` §4.3/§5.1.3 is that evidence, and is strong. **Do not represent to the Client that this consent is a formality; it is a precondition that is currently unmet.** | `cto` (owner action) + `compliance-specialist` (drafts) | **Before any real customer PII on any surface.** Live contractual exposure now |
| **CT-2** | Confirm the **MongoDB Atlas region**. Rolls up INC-001-C-3, which is due today and unreturned. Feeds CT-1's schedule. | `cloud-infrastructure-architect` | 2026-08-31 |
| **CT-3** | **Write the breach notification runbook** (upgrade of C-6). Must specify, at minimum: who may declare "aware" and how it is timestamped; the **48h Developer→Client** leg; the Client's onward s22 leg to the Information Regulator and data subjects; the compressed handling of the nested Supabase-48h → our-48h chain (§3.2); the working delivery channel (blocked on INC-001-C-8); and the s22(3) law-enforcement-deferral decision path. | `compliance-specialist` (me) | **2026-09-12.** Go-live blocker; contractual exposure from contract execution |
| **CT-4** | **Produce a "documented Client instructions" artefact** under §19(a) — the standing instruction set governing what NextWave personnel may do with live personal information (who may access the production Supabase project and Atlas cluster, for what purposes, with what logging). Without it, all current engineering access to live data is operator processing without instruction. | `compliance-specialist` + `cto` | 2026-09-15. **Pair with INC-001-C-10 (RoPA) — same evidence base, produce together** |
| **CT-5** | **Add a teardown path to `seed-test-accounts.ts`** (e.g. `--teardown`) that deletes seeded accounts without recreating them, and document that it must be run after test completion. Non-negotiable once a staging environment exists; required now because seeding targets the live project. | `backend-engineer` | 2026-09-12 |
| **CT-6** | **INC-001-C-7 (coordinate purge, 2026-09-08) is re-flagged as discharging §19(d) as well as POPIA s14.** The `cto` legal-hold carve-out at INC-001 §7.3 G-4 is unaffected, but a hold now requires the Client to be informed, since the retained data is the Client's responsibility as Responsible Party. | `database-architect`, verified `security-engineer` | 2026-09-08 (unchanged) |
| **CT-7** | **Compliance-review Resend** as an operator (s21 contract, s72 basis, sub-processor chain, data location), applying the method at `compliance-review-supabase.md` §4–§6. The existing SMTP vendor review covers **Brevo**, which is not what ships. Separately, replace the consumer-webmail contact in `email-footer.ts:44` with a domain address before it is published as the s18/s23 contact channel. | `compliance-specialist` + `integration-architect` | **Before production email delivery is enabled** |
| **CT-8** | **Amend ADR-0003 by appendix** (not rewrite — per ADR-0006/ADR-0009 precedent) to record that `region: frankfurt` is a **cross-border data-location decision** under POPIA s72 and TDIT-2026-09 §19(c), not only an architecture-fit one, and that it was made without compliance input. Any future region change requires my counter-sign, on the same standing as the Supabase EU-region rule at `compliance-review-supabase.md` §3.3. | `cloud-infrastructure-architect` | 2026-09-12 |
| **CT-9** | **Standing constraint — §19(e) non-monetisation.** No analytics, advertising, data-brokerage, model-training, or third-party data-sharing integration may be introduced on any surface without my prior review. Recorded now, before it is proposed. | all roles; enforced at Stage 8 | Standing |

---

## 7. What must go to admitted legal counsel

Consistent with INC-001 §10, flagged rather than decided here:

1. **Whether Render's Frankfurt deployment, made before the Client's §19(c) consent was sought,
   is a breach of the contract as executed, or a curable defect if consent is obtained now.** My
   assessment is that it is curable, given the transfers are lawful under s72 and no data subject
   is prejudiced — but "curable" is a construction of §19(c)'s *prior* wording, and I am not the
   last word on it.
2. **Whether TDIT-2026-09's Operator framing is compatible with how the platform actually
   operates.** An operator that determines retention periods, sets consent copy, and chooses
   sub-processors is, on the POPIA definition, exercising some responsible-party functions. If the
   working relationship is closer to **joint** responsibility than to Client-instructs/Developer-
   executes, the contract's allocation of s22 duties may not match reality — and that mismatch
   surfaces at the worst possible time, during a real breach.
3. **Whether INC-001 was a §19(b) notifiable event to the Client**, and if so, whether the 48-hour
   clock has already run. INC-001's s22 analysis concluded no *Regulator* notification (provisional,
   at §6.6) — but **§19(b)'s trigger is not s22's trigger.** §19(b) says "breach," not "access or
   acquisition by an unauthorised person." On a broad reading, unlawful processing of location data
   by the Operator is squarely a matter the Client is entitled to be told about. **My working
   position: notify the Client about INC-001 regardless, on the same reasoning as INC-001 §6.5's
   ruling on data subjects — a narrow statutory trigger is not a reason to leave a counterparty
   uninformed about their own data.** Recorded as a recommendation to `cto`, not a decision.

**Standing statement:** this document is a compliance determination made from contract terms as
summarised to me, from the repository, and from the statute. It is **not legal advice**, and it
asserts no fact about any vendor agreement or hosting region that is not verifiable in this
repository or already recorded in a cited compliance review.

---

**Filed by:** `compliance-specialist`, 2026-08-28.
**Does not discharge:** C-6 (breach runbook) · INC-001-C-3/C-7/C-8/C-10 · any C-008 condition ·
Feature 008 Stage 8 · legal sign-off.
