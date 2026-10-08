# Compliance Review — Security-Partner Case Visibility & Data Minimisation

**Feature:** 009 (Security Company Dashboard — web `src/security/`, mobile `mobile/app/(security-app)/`,
backend `backend/src/routes/security-cases.ts`, `backend/src/repositories/recovery-cases.ts`)
**Author:** `compliance-specialist`
**Date:** 2026-10-08
**Trigger:** `cto` pilot-partner readiness plan, step 1 (critical path) — data minimisation per case status.
**Companion document:** [`../../organization/partner-operator-agreement-requirements.md`](../../organization/partner-operator-agreement-requirements.md)
(POPIA s20/s21 agreement requirements for the business owner).
**Regime:** POPIA is the operative regime for this ruling (SA data subjects, SA partner companies,
`co.za` bundle). GDPR is **not** engaged by this surface on current facts (no EU establishment, no
EU-targeted customers — unchanged from Feature 002 §12.0 / Feature 013 §2). PCI-DSS is **not**
engaged (no payment data on `recovery_cases`). Reopen if any of those facts change.
**Not legal advice.** Items needing admitted counsel are listed at §7.

---

## 0. Bottom line

1. **A shared unclaimed pool is not unlawful *per se* under POPIA. The shared pool *as built* is.**
   POPIA does not prescribe a dispatch model. What it prohibits is disclosing more personal
   information to more parties than the purpose needs (s10), without a written s21 agreement with
   each recipient operator (s21(1)), and without telling the customer who receives it (s18(1)(e)).
   Today every partner org sees the customer's `accountId`, `assetId` and the customer's free-text
   theft notes for every unclaimed case — **before** it has any role in that case. That fails s10.
2. **Ruling: the pool may remain shared, but only as a de-identified "offer" tier.** Customer-identifying
   and customer-authored fields are released **only to the org that claims the case**, and
   `accountId` is withdrawn from the partner surface **at every stage**, claimed or not.
3. **Admin-assigned dispatch is the compliance-preferred model** (one recipient per case, simplest
   s18 notice, smallest breach surface). I am **not mandating** it, because a properly de-identified
   offer tier is lawful and the choice of model is a business/Client decision (G-7). For the
   **single-partner pilot** the two models are equivalent in exposure; the tiering below is still
   required now, because pilot-to-second-partner is exactly where this kind of over-disclosure leaks.
4. **Two hard preconditions sit above all of this and are not discharged by any code change:**
   **CT-1** (cross-border consent, still "informally acknowledged, not confirmed in required form" —
   `10-data-protection-contract-obligations.md` §10.3, containment: *no real customer PI on any
   surface*) and **G-7** (no Client instruction exists on what a partner may see or who contracts
   with the partner — `11-documented-client-instructions.md` G-7). **No pilot with real customer
   data until both close and the companion agreement is executed.**

---

## 1. Current shape — verified in code today, not from documentation

| # | Fact | Source |
|---|---|---|
| F-1 | `buildPartnerOrgQuery` returns `$or: [{ partnerOrganizationId: <caller> }, { partnerOrganizationId: null, status: 'open' }]` — every unclaimed open case is visible to **every** partner org | `backend/src/repositories/recovery-cases.ts:192-204` |
| F-2 | The same builder backs list **and** count (C-012-3) | `recovery-cases.ts:262-294` |
| F-3 | `serializeSecurityRecoveryCase` returns `id, assetId, status, referenceNumber, reportedAt, notes, lastLocationAt` **plus `accountId`, `partnerOrganizationId`, `updatedAt`** — identical payload whether or not the caller has claimed the case | `recovery-cases.ts:163-182` |
| F-4 | **`findByIdForPartnerOrg` is broader than the list.** Its filter is `$or: [{ partnerOrganizationId }, { partnerOrganizationId: null }]` with **no `status: 'open'` constraint** — any unclaimed case of any status is readable by detail id | `recovery-cases.ts:312-326` |
| F-5 | Police-report fields are projected out at query level on every partner read (SR-011-1a). `callCentreNotes` and `lastLocation` (coordinates) are **fetched** into the partner row but not serialised | `recovery-cases.ts:120-126, 274-277` |
| F-6 | Both UIs render `accountId` ("Customer account") and `notes` on the case detail | `src/security/pages/SecurityCasePages.tsx:154,156`; `mobile/src/screens/security/SecurityCaseDetailScreen.tsx:205,210` |
| F-7 | On theft-report creation, push `recovery.case.partner.new` goes to **every active `security_company_operator` across all orgs**, carrying `assetName` (the customer-authored `displayName`) in the body | `backend/src/routes/recovery.ts:128-136`; `backend/src/lib/recovery-notification-service.ts:149-159`; `backend/src/repositories/accounts.ts:353-360`; `backend/src/lib/notification-brand.ts:182-188` |
| F-8 | **There is no partner-organisation registry.** `partnerOrganizationId` is a bare UUID supplied by an admin at invitation, with no FK, no table, and no link to any agreement | `backend/src/routes/invitations.ts:28-52`; `backend/migrations/030_...sql:57` (column only) |
| F-9 | **The customer theft-report form solicits the police case number into free-text `notes`** ("Any police case number?"), and `notes` reaches every partner. This defeats, by copy, the structural exclusion SR-011-1a / C-011-9 built for exactly that field | `mobile/src/screens/recovery/ReportTheftConfirmScreen.tsx:157` |
| F-10 | Closed/recovered cases remain visible to the claiming org **indefinitely** — nothing ages them out of the partner view | `buildPartnerOrgQuery` has no time bound |
| F-11 | Partner reads of list/detail are not subject-keyed audited (RR-012-2, open; ADR-0006 C-15/C-16(b)) | `security-review.md` (Feature 012) §13.2 |

**Personal-information status of each field (POPIA s1 definition):**

| Field | PI? | Why |
|---|---|---|
| `accountId` | **Yes** | s1(c): "any identifying number … or other particular assignment to the person". Pseudonymous to the partner, but persistent and **cross-case linkable** — it lets a partner build a theft history per customer across cases. It has **no operational use** to a partner: no partner route resolves it to a name or contact |
| `assetId` | **Yes (indirect)** | Persistent identifier of a specific person's property; cross-case linkable (repeat thefts of one asset) |
| `notes` | **Yes, and uncontrolled** | Customer free text: time/place last seen (often a home or work address), and per F-9 possibly a SAPS case number, possibly third-party names despite the hint |
| `assetName` (push) | **Yes, often** | Customer-authored label; routinely contains a person's name or a number plate ("Thabo's Hilux CA 123-456") |
| `lastLocationAt` | Yes (in combination) | Reveals that tracking is active for this customer's asset |
| `referenceNumber`, `status`, `reportedAt`, `id` | **Not on their own** | Platform case metadata; does not identify a person to a recipient without other data |
| `partnerOrganizationId`, `updatedAt` | No | Case-handling metadata |

---

## 2. Ruling #1(a) — Is the shared unclaimed pool lawful?

### 2.1 The test

The disclosure of a case to a partner org is *processing* (s1 "dissemination by means of transmission,
distribution or making available"). For each partner org that can see a case, ask:

- **s10 (minimality):** is this org's receipt of *this* information adequate, relevant and not
  excessive for the purpose? The purpose is recovery of the asset **by the org that takes the case**.
- **s21(1):** is there a written contract binding this org to s19 security measures?
- **s18(1)(e):** has the customer been told of this recipient or category of recipient?
- **s19:** does disclosure to this org increase the reasonably foreseeable risk of loss or
  unauthorised access, and is that risk managed?

### 2.2 Applied to the shared pool as built — **fails**

For an unclaimed case visible to N partner orgs, N−1 orgs will never act on it. Those N−1 orgs receive
`accountId`, `assetId` and the customer's free-text account of the theft. **Their purpose in receiving
it is to decide whether to bid for the work, and none of those three fields is needed to make that
decision.** That is excessive under s10. It also multiplies the s19 attack surface by N (N companies'
operators, devices and staff turnover, per I-7 the Client-provisioned field tablets) for no
recovery benefit, and — because `partnerOrganizationId` is an unregistered UUID (F-8) — **nothing
ties pool membership to the existence of an s21 agreement.** Any org an admin invites joins the
pool and sees every open case's identifiers on day one.

The detail-route gap (F-4) widens this: an org can read any unclaimed case by id regardless of status,
which is broader than its own list (the C-012-3 species of drift, on the detail route rather than the
count).

### 2.3 Applied to a de-identified pool — **passes, conditionally**

If what the N−1 non-claiming orgs see is information that cannot reasonably identify the customer
(s6(1)(b) / s1 "de-identify"), the s10 objection falls away for them: there is no personal information
in the disclosure to be excessive about. The org that claims then receives the identifying tier,
which is relevant to its purpose. Conditions:

1. The offer tier carries **no** identifier, no free text and no location finer than a coarse
   service area (see §3).
2. **Pool membership = executed agreement.** Only orgs with an executed s21 agreement (companion
   document) may be in the dispatch panel. This requires a registry (PDM-6).
3. **s18 notice to the customer** discloses that a theft report is offered, in de-identified form,
   to the panel of contracted security partners, and that the full report goes only to the partner
   who takes the case (PDM-9).
4. Re-identification risk is reassessed if the panel grows large, if the offer tier gains any field,
   or if the coarse area becomes fine enough that "Toyota, Sandton, 18 minutes ago" identifies
   someone (the `06-security-operations-dashboard.md` mock-up at line 48 is already at that edge).

### 2.4 Admin-assigned dispatch

Admin-assigned (or rules-assigned) dispatch discloses each case to exactly one org. It is the
compliance-preferred model: smallest recipient set, one-sentence s18 notice, one agreement in the
breach path per case. **It is not legally required** given §2.3 is available, and I will not convert
a preference into a block. The decision is the Client's under G-7 (§19(a) — we act on documented
instructions); `product-manager` should put both options to the Client with this analysis attached.

**Pilot note.** With one partner, the pool and admin-assignment have the same recipient set. Do not
read that as "minimisation can wait until partner two". The tiering is cheap now and expensive to
retrofit after partner two has already been onboarded into an identifying pool.

---

## 3. Ruling #1(b) — Minimum fields per stage

**Binding on `backend-engineer` (serialisers/projections), `frontend-engineer`/`mobile-engineer`
(UI), `database-architect` (projections, retention). Cyber/security roles own *how*; I own *whether*
it is satisfied.**

| Field | **Tier 0 — Offer** (unclaimed, `open`, any panel org) | **Tier 1 — Assigned** (claimed by caller, `investigating`/`tracking`) | **Tier 2 — Wrap-up** (caller's case, `recovered`/`closed`, ≤ 90 days after `closedAt`) | **After wrap-up window** |
|---|---|---|---|---|
| `id`, `referenceNumber`, `status`, `reportedAt`, `updatedAt` | Yes | Yes | Yes | **Not visible** (case drops out of list, detail and count) |
| Asset **category** (e.g. "vehicle", "laptop") — *not yet on the case; join from asset* | Yes (permitted, not required) | Yes | Yes | — |
| Coarse service area (metro/district, never coordinates) — *not yet modelled* | Yes (permitted, once modelled) | Yes | Yes | — |
| `partnerOrganizationId` | Always `null` at this tier — no value to send | Caller's own | Caller's own | — |
| `assetId` | **No** | Yes | Yes | — |
| Asset descriptors needed to recognise the item (make/model/colour/serial/plate) — *not yet exposed* | **No** | Permitted, when built, under PDM-10 | Yes | — |
| `notes` (customer free text) | **No** | Yes | Yes | — |
| `lastLocationAt` | **No** | Yes | Yes | — |
| `lastLocation` (coordinates) / any location history | **No** | Only via AUD-9-audited location API with case-reference purpose (existing block in §1 of 08-qa) | No (recovery over) | — |
| `accountId` | **No** | **No** | **No** | — |
| Customer name / phone (direct contact) | **No** | Only via a future dedicated, audited, case-scoped contact endpoint, if the Client instructs it (G-7) | No | — |
| `callCentreNotes`, police-report fields, KYC/profile data | **No** | **No** | **No** | — |

**Reasoning on the three contested choices:**

- **`accountId` withdrawn at every stage, not just pre-claim.** A claimed partner needs to recover
  an *asset*, which it identifies by case reference and asset descriptors. The account id gives it
  nothing operationally and gives it a persistent key to profile a customer across cases and over
  time. If the business needs partners to contact customers, that is a different, deliberate
  disclosure (name + phone, case-scoped, audited) and needs a G-7 instruction — not a UUID that
  happens to be in the payload.
- **`notes` withheld pre-claim.** It is the field most likely to contain an address, and (F-9)
  currently invites a SAPS case number. Post-claim it is relevant — it is the customer's own
  description of the theft, given to get the asset back.
- **The 90-day wrap-up window** is set so the assigned partner can reconcile its own records, answer
  SAPS follow-ups and complete billing with the Client; beyond that the partner has no further
  purpose for platform access (s14(1)). This is **partner visibility**, not deletion: the
  `recovery_cases` document's own retention is unchanged (police-report triple: 5 years from
  `closedAt`, per Feature 011). `legalHold` does **not** extend partner visibility — a hold preserves
  our record; it is not a reason to keep showing it to a third party. Provisional pending the
  Client's G-7 answer; a shorter period is acceptable without my review, a longer one is not.

---

## 4. Conditions (PDM register)

`[PILOT]` = must close before any pilot partner operator is given access to real customer data.
`[S8]` = Stage 8 gate item for the Security Company Dashboard.

| ID | Condition | Owner | Blocks |
|---|---|---|---|
| **PDM-1** | Remove `accountId` from `serializeSecurityRecoveryCase` and from `SecurityRecoveryCase` types in `src/security/api/cases.ts` and `mobile/src/api/security-cases.ts`; remove the "Customer account" row from both detail UIs (F-6). Add a regression test asserting `accountId` is absent from every `/v1/security/cases*` response | `backend-engineer`, `frontend-engineer`, `mobile-engineer` | [PILOT] [S8] |
| **PDM-2** | **Tier the partner response by claim state, structurally, not by convention.** Unclaimed rows are read with an offer-tier exclusion projection (adds `notes`, `assetId`, `lastLocation`, `lastLocationAt`, `callCentreNotes`, `accountId` to the excluded set) and serialised by a separate offer-tier serialiser, following the SR-011-1a pattern (a field never fetched cannot be leaked). Claimed rows use the Tier 1 projection, which also excludes `accountId`, `callCentreNotes` and `lastLocation` (F-5 — fetched today with no use) | `backend-engineer`; `security-engineer` verifies | [PILOT] [S8] |
| **PDM-3** | **Align `findByIdForPartnerOrg` with the list filter (F-4):** unclaimed branch must be `{ partnerOrganizationId: null, status: 'open' }`. Make it use the same predicate source as `buildPartnerOrgQuery` so detail, list and count cannot diverge (extends C-012-3 to the detail route) | `backend-engineer` | [PILOT] [S8] |
| **PDM-4** | **Wrap-up window (F-10):** the caller's own cases in `recovered`/`closed` drop out of partner list, detail **and** count once `closedAt` is more than 90 days ago. Implemented in the shared predicate so C-012-3 holds | `backend-engineer` + `database-architect` (index on `closedAt` if needed) | [S8] — not [PILOT] provided the pilot is shorter than 90 days post-first-closure |
| **PDM-5** | **Push minimisation (F-7):** `recovery.case.partner.new` must not carry `assetName`. Body = asset category + reference only. Push content transits Expo/APNs/FCM (offshore sub-processors) and displays on lock screens of Client-provisioned field tablets (I-7) | `backend-engineer` | [PILOT] |
| **PDM-6** | **Partner registry (F-8):** a partner-organisation record with, at minimum, legal name, PSIRA registration number, agreement reference, agreement status and effective/termination dates. Operator invitation, the dispatch pool and the PDM-5 push fan-out are restricted to orgs whose agreement status is `executed` and not terminated. Termination revokes operator sessions and removes the org from the pool | `backend-architect` + `database-architect` + `authentication-engineer` | [PILOT] (a manual, documented single-org equivalent is acceptable for a one-partner pilot if recorded and checked at Stage 8) |
| **PDM-7** | **Fix the theft-report copy (F-9):** remove "Any police case number?" from the `notes` hint; point customers to the dedicated police-report section; keep the "don't include other people's details" instruction. Check the web report-theft form for the same copy | `ux-writer`/`ui-designer` + `mobile-engineer` | [PILOT] |
| **PDM-8** | **RR-012-2 is a pilot blocker for Tier 1 reads**, not only a backlog item. Partner detail reads of claimed cases (which now carry `notes`/`assetId`) need subject-keyed audit rows with a case reference (ADR-0006 §14.4.3 s23, C-16(b)). Note for `cybersecurity-architect`: `recovery_cases.id` is now a resolvable case entity — assess whether it discharges FU-A14 for the partner surface. I am not ruling on that; I am noting the precondition FU-A14 said was missing may now exist | `cybersecurity-architect` + `backend-engineer` | [PILOT] for Tier 1 detail reads |
| **PDM-9** | **Customer s18 disclosure** at the theft-report step, plain language, before submit: *"When you submit this report, we'll share a short summary (no name or contact details) with our contracted security partners so one of them can take your case. The partner who takes it will see your report details, including anything you type above, to help recover your asset."* Adjust if the Client chooses admin-assigned dispatch. Also add partner recipients to the privacy notice (category level, ADR-0006 C-15) | `compliance-specialist` (copy, given here) + `technical-writer` + `mobile-engineer` | [PILOT] |
| **PDM-10** | Any future field added to Tier 0 or Tier 1 (asset descriptors, coarse area, customer contact, location) requires `compliance-specialist` review before merge. Tier 0 additions must be re-tested against §2.3(4) re-identification risk | all roles | Standing |
| **PDM-11** | **Re-declaration:** with PDM-1…PDM-9 in place and the companion agreement executed in operator form, partner access is a service-provider transfer, not "sharing", for the Play Data safety form (`play-store-data-safety-declaration.md` §4(3)). That determination is **not** made until the agreement is executed and counsel answers §7(1); the §6.6 hold on that document stands | `compliance-specialist` | Next Play upload with `_SECURITY_OPERATOR` not literally `"false"` |

**C-012-3 reminder:** PDM-3 and PDM-4 narrow the population; `countForPartnerOrg` must narrow in
the same change via the shared builder. Tier 0 count stays a bare integer — ruled not a disclosure in
Feature 012 `security-review.md` §13.2, unchanged.

---

## 5. What this ruling does not do

- Does not choose the dispatch model — that is the Client's (G-7). It sets the floor both models must meet.
- Does not authorise location disclosure to partners. The existing block (08-qa §1, AUD-9) stands.
- Does not close RR-012-2, ADR-0006 C-15, CT-1, G-7, CT-4c, or the Play §6.6 hold.
- Does not make any partner an operator. Only an executed agreement does that (companion document).

---

## 6. Pre-approval checklist — Security Company Dashboard (pilot)

- [ ] Regime confirmed: POPIA. GDPR/PCI not engaged on current facts — **done (this document)**
- [ ] Lawful basis / authority: **open** — G-7 Client instruction; CT-1 containment
- [ ] Data classified and mapped to visibility/retention — **done (§1, §3)**; implementation PDM-1…PDM-4
- [ ] Audit logging for new access path — **open** — PDM-8 / RR-012-2
- [ ] PCI scope — **N/A**
- [ ] Vendor/partner agreement — **open** — companion document; PDM-6
- [ ] Breach procedure covers this data — **open** — partner leg must be added to CT-3 runbook (companion doc §B.7)
- [ ] Consent/disclosure copy accurate — **open** — PDM-7, PDM-9

**Gate position: `compliance-specialist` will not sign Stage 8 for a pilot with real customer data
until every [PILOT] condition, CT-1 (required form), G-7 and an executed partner agreement are in place.**
Development of PDM-1…PDM-9 may start immediately; none of it depends on the Client's answers.

---

## 7. Referred to admitted counsel

1. **Operator or responsible party?** If the partner keeps its own records of the recovery
   (PSIRA-regulated occurrence books, evidence handed to SAPS, its own insurer), it is a responsible
   party for those records. The agreement must draw that line explicitly; counsel to confirm the
   characterisation holds.
2. **s57(1)(b) prior authorisation.** Recovery work will generate information about **suspects or
   persons in possession** of stolen assets — information on criminal behaviour (s26/s27) processed
   on behalf of a third party. Counsel to advise whether prior authorisation from the Information
   Regulator is engaged for the Client or the partner, before any such information enters the platform.
   Today the platform has no field for it and the `notes` hint discourages it; keep it that way until answered.
3. **Who contracts.** My position (companion doc §A.2) is that the agreement is between TD IT Solution
   (Pty) Ltd and the partner, not NextWave. Counsel to confirm against TDIT-2026-09.
