# Feature 013 — Compliance Review: KYC identity data (SA ID numbers, ID documents, proof of address)

**Reviewer:** `compliance-specialist`
**Date:** 2026-09-21
**Lifecycle stage:** 1–2 (review runs in parallel with `business-analyst`'s Stage 1 draft; this
document **feeds into and in two places corrects** [`business-requirements.md`](business-requirements.md))
**Trigger:** platform-owner decision to move forward with real KYC (identity verification) —
government ID numbers/documents, proof of address, date of birth.
**Status:** **Active. Tier 1 conditionally clearable; Tier 2 and Tier 3 BLOCKED at Stage 8 on the
conditions at §8.**
**Not legal advice** — see §9.

---

## 0. What this document decides, and what it deliberately does not

It decides: which regimes apply to identity-document processing (§1–§3), how POPIA classifies an SA
ID number versus an ID **document image** versus proof of address (§2), the storage and access rules
if these are collected (§5), and the ruling `business-requirements.md` §5 asked this role for on the
Tier 2 storage options A/B/C (§6).

It does **not** decide whether FICA applies as a matter of law (§3 explains why that is honestly
uncertain and who must resolve it), and it does not select an identity-verification vendor (§7 sets
the conditions any vendor selection must satisfy; the build-vs-buy call remains
`integration-architect`'s).

### 0.1 State of the code, verified today, not assumed

| Fact | Evidence |
|---|---|
| Collection accepts **only the last 4 digits** of the SA ID number | `backend/src/lib/customer-profile-validation.ts:21-25` — `/^[0-9]{4}$/`, with the CT-11 comment "Do not widen this back to a 13-digit regex" |
| Storage persists **only** `idNumberLast4`; no field exists for a full number | `backend/src/db/customer-profile-collections.ts:19` |
| Residential address **is** collected and stored in full (line1/line2/city/province/postalCode/country) | `customer-profile-validation.ts:26-35`, `customer-profile-collections.ts:20-30` |
| Date of birth **is** collected and stored | same files, `dateOfBirth` |
| **No document upload exists anywhere.** The verification centre submits no file; there is no proof-of-address upload, no ID-document upload, no photo/selfie capture, no object-storage integration | `mobile/src/screens/account/VerificationCentreScreen.tsx` (submit is a bare `useSubmitVerificationMutation()` with no payload); MP-5 — no object-storage vendor selected |
| Admin review sees a **masked** ID only | `backend/src/routes/admin-verification.ts:55` — `idNumberMasked: \`********${profile.idNumberLast4}\`` |
| The whole surface is flag-gated off | `FEATURE_KYC_ENABLED`, `mobile/src/config/features.ts`; route guard at `mobile/app/(app)/(tabs)/account/verification.tsx:10` |
| The surface has **no Stage 8 record** | INC-001 A-12 / F009-1, recorded in the flag's own comment and at `business-requirements.md` §5 |

**The single most important consequence of that table:** "real KYC" as the owner has described it —
**ID documents and proof of address** — is **not an extension of what exists. It is a new data class,
a new storage substrate that has no vendor, and a new disclosure surface.** `business-requirements.md`
is correct that Feature 013 *extends* the Feature 009 surface for the **number**; that framing does
**not** carry over to **documents**, and this document treats them separately throughout.

---

## 1. Regulatory applicability determination

Per this role's standing practice (Feature 002 §12.0 precedent), each regime is assessed, not
assumed, and the trigger for reopening each is recorded.

| Framework | Applies to KYC identity processing? | Basis |
|---|---|---|
| **POPIA (4 of 2013)** | **Yes — squarely, and at the top of the sensitivity range this platform handles** | SA data subjects, confirmed jurisdiction (Feature 001 §9, Feature 002 §12.0). Identity numbers, DOB, residential address and identity-document images are all personal information under s1. Detail at §2 |
| **TDIT-2026-09 §19 (contract)** | **Yes, and it is stricter than the statute** | We are the **Operator**; TD IT Solution is the **Responsible Party** (`10-data-protection-contract-obligations.md` §1). §19(a) documented-instructions and §19(c) cross-border-consent both bite here. **G-11 already records that no Client instruction authorises ID-number collection at all** (`11-documented-client-instructions.md` §4) |
| **FICA (38 of 2001)** | **UNCERTAIN — probably NOT as an "accountable institution." See §3. Do not build on the assumption that it does** | The Schedule 1 insurance entry is limited to **life / long-term** insurance business. This platform's product is non-life asset cover |
| **Insurance Act 18 of 2017 + Policyholder Protection Rules; FAIS 37 of 2002 + General Code** | **Yes, subject to an unconfirmed licence position** | Feature 002 §12.5 records the owner's confirmation of licensed-insurer + FSP status, **and records that neither licence number has been supplied and either may still be in application**. These regimes are the real source of any *recordkeeping floor* on verification records (§4) |
| **GDPR** | **No — unchanged from Feature 002 §12.0** | No EU establishment, no targeting of EU data subjects. Reopen if EU-resident customers are onboarded or the product is marketed into the EU. Note the asymmetry: our *processing* is in the EU (Frankfurt), which is a **s72 transborder** question, not a GDPR-applicability one. Do not conflate them |
| **PCI-DSS** | **No** | No cardholder data in this feature. If identity verification is ever bundled into a payment-onboarding step, that is a fresh determination |

---

## 2. POPIA applied to identity numbers and identity documents specifically

### 2.1 An SA ID number is **not** "special personal information" — and the correct classification matters

This must be stated precisely, because `business-requirements.md` §5 asks whether SA ID numbers are
"special personal information in their own right," and the widely-repeated answer is wrong.

**s26's closed list is: religious/philosophical beliefs, race or ethnic origin, trade union
membership, political persuasion, health or sex life, biometric information, and criminal
behaviour/alleged offences.** An identity number is **not** on it. Under s1 it is ordinary personal
information — expressly enumerated as *"an identifying number"*.

**So the answer to the BA's question is: no, s26 does not attach to the number itself — but that is
not a licence to relax handling, for three independent reasons.**

1. **The ID number is a national, immutable, universal identifier.** It cannot be reissued after
   compromise, it is the primary key for credit, banking and Home Affairs records, and it is the
   single most useful item an identity fraudster can obtain about a South African. Its **risk
   profile** sits at the top of the platform's data classification regardless of its **statutory
   class** — the same reasoning this role already applies to location data ("not merely device
   telemetry"). s19 security safeguards are calibrated to *risk*, not to *s26 membership*, so the
   controls at §5 are mandatory whatever the classification.
2. **The number contains s26 data structurally.** Digit 12 is the apartheid-era
   race-classification digit; digit 7 encodes sex by convention. `business-requirements.md` §1, FR-6
   and AC-7 already forbid extracting, storing, logging or exposing digit 12. **This role confirms
   that exclusion is correct and sufficient as drafted, and now makes it binding**, with one
   addition: the prohibition must extend to **derived values and to the gender convention on digit
   7** (FR-6 and AC-7 cover digit 12 only). Processing either would be s26 special personal
   information — **race is one of the categories where POPIA's s28/s29 prohibitions are strictest**
   — and there is no s27 ground available for it here, because there is no purpose for it.
   → **C-013-1.**
3. **Three of the four things the owner now wants to add DO engage s26 or come close.** See §2.2.

### 2.2 Classification of each new data item

| Item | POPIA class | Ruling |
|---|---|---|
| **Full 13-digit ID number (in transit only)** | Personal information (s1 identifying number) | Permitted **only** on the conditions at §6. Today it does not cross the border at all (CT-11) |
| **Full ID number (stored, reversible)** | Personal information, highest platform risk tier | **Refused** as a default. §6 Option B |
| **Peppered one-way hash of the ID number** | **Still personal information.** See §5.3 — the SA ID keyspace is small enough to enumerate. A hash is a pseudonym, not anonymisation | Permitted on §6's conditions; **must not be described to the Client or to data subjects as "anonymised"** |
| **Date of birth, residential address** | Personal information | Already collected. Minimality is the live question: see §4 |
| **Proof-of-address document** (utility bill, bank statement, lease) | Personal information, and typically **third-party** personal information — a bill names a landlord, a co-habitant, an account number, sometimes consumption data. A bank statement additionally discloses financial conduct | **Highest-minimisation item in the set.** Ruling at §5.5 |
| **ID document image / smart-card copy / passport page** | Personal information **and, on this role's assessment, likely biometric information under s26 where it is used to identify the person** — POPIA s1 defines biometrics as a technique of personal identification based on physical/physiological characterisation, and a stored facial image used for identity matching falls within it | **s27(1)(a) explicit data-subject consent is required**, in addition to a lawful basis and a Client instruction. → **C-013-2** |
| **Selfie / liveness / face-match (Tier 3 vendor pattern)** | **Biometric information — s26 special personal information, unambiguously** | Prohibited under s26 unless an s27 ground applies. Only s27(1)(a) (consent) is realistically available. → **C-013-2, C-013-7** |

### 2.3 Lawful basis — and why §3's FICA answer changes it

Under s11, the candidate grounds are:

- **s11(1)(c) — compliance with an obligation imposed by law.** Available **only if FICA (or another
  statute) actually compels customer due diligence.** §3 says that is doubtful. **If we cite s11(1)(c)
  and FICA does not apply, we have processed the most sensitive identity data on this platform on a
  legal basis that does not exist.** That is the specific failure this review exists to prevent.
- **s11(1)(b) — necessary to conclude or perform a contract with the data subject.** Defensible for
  verifying that the person insuring an asset is who they say they are, and for the claims/recovery
  chain. This is the **strongest available basis for the ID number and DOB**. It is weaker for
  proof-of-address documents and weakest for biometric capture.
- **s11(1)(f) — legitimate interests of the responsible party.** Available for anti-fraud and
  duplicate prevention, subject to a balancing exercise. Note this basis belongs to **TD IT Solution**
  as Responsible Party, not to us.
- **s27(1)(a) — consent**, mandatory additionally for anything biometric (§2.2).

**Ruling on basis:** for Tier 1 (checksum, DOB consistency) and for the ID number itself,
**s11(1)(b)** is the primary basis with s11(1)(f) supporting the duplicate-prevention purpose.
**s11(1)(c) may not be cited anywhere — code, privacy notice, consent copy, admin UI or Client
correspondence — until §3 is resolved by counsel.** → **C-013-3.**

**Consequence the BA's draft should absorb:** without a statutory mandate, **s10 minimality does more
work here, not less.** "A regulator requires this" is not available as a justification for collecting
a document; every field must earn its place against the contract-performance purpose. This is why §5.5
refuses proof-of-address-by-default rather than treating it as standard KYC furniture.

---

## 3. Does FICA actually apply? **Honest answer: probably not as an accountable institution — and this is uncertain enough that it must not be asserted either way without counsel.**

The task asked for reasoning, not an assumption. Here it is.

### 3.1 The test

FICA's customer-due-diligence machinery — s21–s21H (identify and verify clients, establish beneficial
ownership, ongoing due diligence), s22–s24 (record-keeping, minimum **5 years**), s42 (Risk Management
and Compliance Programme), s43 (training), s43B (compliance officer), plus registration with the FIC
— **binds "accountable institutions" only.** An accountable institution is an entity falling within
one of the items listed in **Schedule 1** to the Act. The question is therefore narrow and factual:
**is this entity in Schedule 1?**

### 3.2 The insurance entry in Schedule 1 is limited to *life / long-term* business

Schedule 1 was substantially expanded by the amendments gazetted 29 November 2022 (effective
19 December 2022), which added trust service providers, company service providers, crypto asset
service providers, high-value goods dealers, credit providers and others. **The insurance item is
expressed in terms of a person who carries on "life insurance business" as defined in the Insurance
Act 18 of 2017 (the long-term insurer).** **Short-term / non-life insurers were considered and were
not added** to Schedule 1 in that round; commentary at the time (Moonstone, Masthead) records
short-term insurers as sitting outside the accountable-institution regime, with proposals to bring
them in discussed but not enacted.

**This platform's product is non-life:** monthly plans covering theft/loss of vehicles, laptops,
phones, tablets, TVs, desktops and business equipment, with recovery coordination. There is no
savings, investment or life component. Feature 002 §12.5.2 already drafts the disclosure as
*"a licensed non-life insurer in terms of the Insurance Act 18 of 2017."*

**Provisional determination: TD IT Solution Insurance is most likely NOT an accountable institution
under FICA, and the FICA CDD obligations therefore most likely do not apply.**

### 3.3 The four things that could change that answer — none of which we can resolve from this repo

1. **The licence category is still unconfirmed.** Feature 002 §12.5.1 flags that "FSP-licensed
   insurer" bundles two distinct authorisations, that **neither number has been supplied**, and that
   either may still be in application. **If the entity in fact holds or later takes a long-term/life
   licence class, or a FAIS category covering long-term insurance intermediary services, the answer
   flips.** This is a fact about the Client we do not hold.
2. **FAIS intermediary services.** Several Schedule 1 items attach to authorised financial services
   providers rendering particular categories of service (notably in respect of long-term insurance
   and investments). An FSP acting purely in non-life is outside those items; an FSP whose licence
   categories extend further is not. Same unresolved fact as (1).
3. **Adjacent activity.** If the platform ever handles funds for third parties, offers a savings or
   premium-investment component, deals in high-value goods (the new Schedule 1 item catches cash
   transactions from R100,000), or provides credit (credit providers under the NCA are now a
   Schedule 1 item — relevant if premium financing is ever offered), a fresh determination is
   required.
4. **Legislative change.** Bringing short-term insurers into Schedule 1 has been actively discussed.
   Schedule 1 has been amended repeatedly since 2022 and is amendable by Ministerial notice, not by
   an Act of Parliament — **so this determination has a shorter half-life than most.** → **C-013-10.**

### 3.4 What FICA obligations survive even if we are NOT an accountable institution

This is the nuance that stops "FICA probably doesn't apply" from becoming "FICA is irrelevant."

- **s29 (suspicious and unusual transaction reporting) binds *any person who carries on a business*,
  not only accountable institutions.** If the business suspects that property it deals with is the
  proceeds of unlawful activity, or that a transaction is intended to facilitate such, a report to
  the FIC is due. **That duty exists today, on the current non-KYC platform, and there is no procedure
  for it anywhere in this repository.** → **C-013-9.** It is, notably, a *reporting* duty, and it does
  **not** carry a CDD/identity-verification mandate with it.
- **s45B/s46 inspection powers** and the sector-regulator supervisory architecture bite on accountable
  institutions; not applicable on the provisional determination.
- **POPIA and the insurance-sector regimes are unaffected** either way — they are the actual source of
  the obligations in §2, §4 and §5.

### 3.5 What this means for urgency — stated plainly, because the task asked

**There is, on the evidence available to this role, no confirmed statutory deadline forcing KYC onto
this platform.** The drivers for it are the owner's stated business needs — fraud prevention, duplicate
accounts, confidence that the insured is the claimant — which are legitimate and sufficient under
s11(1)(b)/(f), but they are **commercial drivers, not regulatory ones.**

**The practical consequence is a sequencing one, and it cuts in favour of doing less, more carefully.**
A compliance-driven KYC programme runs to a regulator's timetable and justifies collecting a
prescribed document set. A business-driven one does not — it must be justified field by field against
s10 minimality, and there is **no urgency argument that overrides the conditions at §8**. Anyone in
this organisation who has been proceeding on "we need this for FICA" should stop using that
justification until **C-013-4** returns.

**C-013-4 — the question for counsel, put precisely:** *Given a licensed non-life (short-term) insurer
under the Insurance Act 18 of 2017, also holding or applying for an FSP licence under FAIS, selling
asset-protection cover direct to consumers online: does the entity fall within any item of Schedule 1
to the FIC Act as currently amended, and is it therefore an accountable institution subject to
ss21–21H CDD and s22–24 record-keeping? If not, does any other item (high-value goods dealer, credit
provider) attach to any adjacent or planned activity?* Supply the actual licence class/sub-class and
FSP categories with the question — **the question cannot be answered without them (Feature 002 §12.5.1,
still open).**

---

## 4. Retention — and where the floor actually comes from

**The FICA 5-year record-keeping floor (s23) does not attach** on the provisional determination.
Do not cite it. (`docs/features/011-saps-case-reporting/compliance-review-saps-case-data.md` §1's
reference to an *"insurance/FICA-style recordkeeping floor"* is explicitly provisional on C-011-6 and
should be read against §3 of this document; the FICA limb of that phrase is not evidenced.)

What does or may attach:

| Source | Effect | Status |
|---|---|---|
| **POPIA s14(1)** | **A ceiling, not a floor.** Records may not be retained longer than necessary for the purpose, unless retention is required by law, contract, or consent | Binding now |
| **FAIS General Code of Conduct / Insurance Act & PPR record-of-financial-service duties** | A **floor** measured in years from the end of the relationship — the usual FSP figure is **5 years** | **Attaches only once a policy is actually activated.** Feature 006/007 security reviews and INC-001 §118 all record that **no policy is activated on this platform today** (`pending_activation` only), so **no floor attaches yet** |
| **TDIT-2026-09 / G-3** | Retention periods are the **Responsible Party's** to set. We have been setting them ourselves; that is one of the four gaps producing processing without authority | `11-documented-client-instructions.md` §4 G-3, CT-4b, due 2026-09-26 |

**Ruling (provisional, and it is a recommendation to the Client under G-3, not an instruction we may
give ourselves):**

| Data | Retention | Rationale |
|---|---|---|
| Full ID number | **Zero.** Never at rest | §6 |
| `idNumberLast4` | Life of the customer relationship + the applicable FSP/insurance floor once a policy activates (**recommend 5 years** from end of relationship) | Needed to evidence that verification was performed on a specific identity |
| ID-number hash (if §6 Option A proceeds) | Same as `idNumberLast4` | It is the uniqueness key; it dies with the record |
| **ID document images / proof-of-address documents** | **Delete on verification decision.** Retain the *outcome*, the reviewer identity, the timestamp, and a non-reversible document digest — **not the document.** Maximum tolerated window if an appeal path requires it: **30 days from decision**, then automated deletion | s14 ceiling with no offsetting floor. A verification *outcome* discharges the recordkeeping purpose; the *document* does not need to survive it. **C-013-5** |
| Biometric/liveness artefacts | **Zero at rest on this platform**; and no vendor may be selected that retains them beyond the verification transaction without a specific s27(1)(a) consent covering that retention | §2.2, §7 |

**Deletion must be an automated, auditable job, not a policy statement.** This platform has a live
record of retention rules that were asserted and never enforced (`location_events` has no TTL index —
INC-001 §2.2; G-3). **A documents-retention rule with no deletion job is the same failure repeated on
more sensitive data.** → **C-013-5.**

---

## 5. Storage and security requirements if ID data is collected

These are compliance *requirements*. **How** they are satisfied is `cybersecurity-architect` /
`security-engineer` / `database-architect`'s call; **whether** they are satisfied is this role's.

### 5.1 Encryption

- Full ID number: **never at rest.** In-memory, single request, discarded. Not in a queue, not in a
  cache, not in a retry buffer, not in a crash dump.
- Any stored derivative (hash, last-4): at rest under the platform's standard encryption, **plus** the
  field-level rules at §5.2.
- Document images (if ever collected): encrypted at rest with a **customer-data-specific key**, in a
  private bucket with no public or signed-URL-by-default access, on a provider that has passed the
  §7 review. **There is no object-storage vendor today (MP-5)** — so this requirement currently has
  nothing to bind to, which is itself the reason documents cannot be collected yet.

### 5.2 Logging — the highest-probability leak path, and it is not the database

Named because it is the realistic failure, not the theoretical one:

- The full ID number **must never** appear in: application logs, Render request logs, Zod/validation
  error messages echoing the offending value, Sentry/error-tracker payloads, HTTP access logs (so
  **never** in a URL path or query string — body only), analytics, or any email body (already
  prohibited by C-R-3(a)).
- Same prohibition for document filenames (an uploaded file named `8001015009087_ID.pdf` defeats
  every other control) and for any storage object key derived from an ID number.
- **A negative test is required at Stage 10**, in the same shape as AC-7: grep responses and log output
  for a 13-digit run. → **C-013-6.**

### 5.3 The hash is not anonymisation — size the keyspace before relying on it

If a one-way hash is used as a uniqueness key (§6 Option A), note that an **unsalted/unpeppered hash
of an SA ID number is trivially reversible by exhaustive search.** The space is not 10¹³: the first six
digits are a real calendar date within a plausible ~100-year window (~36,500 values), the sequence is
10,000, the citizenship digit is 2, digit 12 is effectively fixed post-1994, and the check digit is
*determined* by the preceding twelve. That is on the order of **10⁸–10⁹ candidates** — enumerable on a
laptop in minutes. Where the DOB is already on file (and it is), the space collapses to roughly
**20,000**.

**Therefore:** a plain hash of an SA ID number is **personal information, not anonymised data**, and
must be treated as such in the RoPA, in any Client disclosure, and in breach assessment. A **peppered
HMAC with a server-held secret in a managed secret store** is mandatory if this route is taken; the
pepper must never be shipped to a client, never be committed, and its compromise must be treated as a
reportable event because it retroactively de-anonymises every stored key. **Pepper rotation
invalidates every stored comparison key** — the design must state what happens on rotation rather than
discovering it during an incident. → **C-013-8.**

### 5.4 Access restriction and audit logging

- Admin access to any identity data must remain **masked by default** (`admin-verification.ts:55` is
  already correct — preserve it).
- **Every read of identity data by an admin or support user must be audit-logged with actor, subject,
  timestamp and stated purpose.** This is the "who looked at this customer's ID and why" requirement,
  and it is the same requirement AUD-8/AUD-9 already set for privileged access. It is currently
  **blocked on FU-A11** (no investigative read credential) and on **G-2** (no Client instruction
  governing who may access live personal data at all). **KYC data must not go live ahead of that
  logging.** → **C-013-6.**
- No engineering access to identity data via direct database console as a routine matter — G-2 again.

### 5.5 Proof of address — refused as a default collection

**This role does not accept proof-of-address documents into scope by default, and the BA's draft
should not carry them as assumed scope.** Reasons:

1. **No legal mandate compels it** (§3). Where FICA CDD does not attach, "standard KYC document set"
   is a market convention, not a requirement.
2. **It is the worst-ratio item in the set** — a utility bill or bank statement discloses substantially
   more than the address it is collected to prove, including **third parties who are not data subjects
   of this platform and who have consented to nothing** (landlord, co-habitant, the bank, account
   numbers, sometimes consumption patterns). Collecting a document to verify one field, and thereby
   acquiring ten, is the definition of an s10 minimality failure.
3. **The address is already collected as structured data** and is already usable for the
   contract-performance purpose.
4. **There is nowhere to put it** (MP-5).

**If the Client instructs that address *verification* is required**, the ranked alternatives are:
(a) verify the address as a by-product of a Tier 3 vendor check that returns a match/no-match without
returning or storing a document; (b) accept a **redacted** document with an explicit in-flow
instruction to obscure account numbers and amounts, retained only to the §4 window; (c) collect the
full document only on exception, where (a) and (b) fail. **Option (c) may not be the default path.**
→ **C-013-5.**

---

## 6. Ruling on `business-requirements.md` §2.2 (Tier 2 storage options) — and the CT-11 tension, stated explicitly

The BA correctly declined to choose and flagged it to this role. Ruling follows.

### 6.1 The tension is real, and the task's instinct about it is correct

**CT-11 is closed** (`10-data-protection-contract-obligations.md` §13): the full 13-digit number is
checksum-validated and truncated **on the client**, and the backend now *rejects* anything but four
digits. The compliance value of that is precise and narrow: **the full SA ID number does not cross the
South African border**, at a moment when the §19(c) cross-border consent (**CT-1**) is *not closed in
the required form* — the Client's answer was *"its fine,"* ruled insufficient at §10.2 of that
document.

**Every form of real identity verification the owner is asking for needs more than four digits.**

| Capability | Needs the full number? | Consequence |
|---|---|---|
| Tier 1 — checksum, DOB consistency (`business-requirements.md` §2.1) | Yes, **but client-side only** | **No tension.** Already how CT-11 shipped. Note this *contradicts* FR-2/§2.1's "where this runs: server-side" — see §6.4 |
| Tier 2 — duplicate detection | **Yes.** Last-4 is not a usable uniqueness key (the BA's §2.2 analysis of collisions is correct) | **Direct tension with CT-11** |
| Tier 3 — DHA / vendor "is this a real person" | **Yes, unavoidably**, and it must leave the country to a vendor as well | **Direct tension with CT-11 and CT-1**, plus a new sub-operator |

**So the answer to the question posed: yes, the tension exists, and truncation is not sufficient for
real verification. CT-11's approach was proportionate to a field that was being collected and thrown
away; it does not survive contact with a feature whose entire purpose requires the discarded digits.
CT-11's closure must not be cited as evidence that the ID-number border question is settled** — this
is the same forward constraint `cto-status/2026-09-14-task-assignment.md` Appendix 2 §1 already
recorded, and this review confirms it: *any design needing the full number server-side re-opens
CT-1/s72 and does not inherit CT-11's closure.*

### 6.2 Ruling on the options

- **Option A — peppered HMAC-SHA256 uniqueness key: APPROVED IN PRINCIPLE, conditional.** It is the
  only option that satisfies the duplicate-detection purpose without creating reversible storage.
  Conditions: the pepper is server-held in a managed secret store, never client-shipped (§5.3); the
  full number is HMAC'd and discarded in the same request, never persisted, never logged (§5.1–§5.2);
  the stored key is classified as **personal information, not anonymised** (§5.3); a rotation plan
  exists before first write (**C-013-8**); and **§6.3's border conditions are met first.**
- **Option B — encrypted full number at rest: REFUSED** for Tier 2's purpose. It creates a new class
  of reversible identity storage to solve a problem Option A solves without it — an s10 minimality
  failure on its face. Reconsiderable **only** if a Tier 3 vendor or a confirmed legal obligation
  requires re-presentation of the full number, and only then with its own review.
- **Option C — compare-at-review-time, no new storage: this is the INTERIM POSITION**, and it is
  where Feature 013 sits until the §8 conditions clear. The BA is right that it scales poorly; that is
  acceptable at a pre-launch customer base (`north-star-2000-dau.md`) and is the correct trade while
  CT-1 is open.

### 6.3 The border conditions attaching to Options A and to Tier 3

Transmitting the full ID number to the Frankfurt API is a **new cross-border transfer of a more
sensitive item than anything in the CT-1 schedule.** It may not ship until:

1. **CT-1 closes in the required form** (CT-1a verbatim reply, or the CT-1b signed addendum); **and**
2. a **supplementary §19(c) disclosure** is served naming, specifically, *"the full 13-digit South
   African identity number, transmitted to and processed transiently in Frankfurt for verification and
   duplicate detection, not stored"* — on the same footing as the CT-1c supplementary disclosure
   already promised for the Atlas region; **and**
3. **G-11 is answered** — the Client instructs whether the full number may be collected at all
   (`11-documented-client-instructions.md` §4). G-11 as written assumes the *old* code (full number
   into the API); it must be re-put in light of CT-11's closure and this feature's reversal of it.

→ **C-013-7.** Note that an **SA-resident compute** would dissolve this, and is not available: Render
has no African region and Supabase's `af-south-1` is withdrawn (`10-…` §9.1). Atlas `af-south-1` is
storage only and does not help, because the exposure is the *processing* location.

### 6.4 A correction to `business-requirements.md` §2.1 the BA should absorb

FR-2's "**Where this runs:** server-side, in `updateCustomerProfileBodySchema`" and the "client-side
mirror (UX only)" framing are **inverted relative to what shipped and relative to compliance
requirements**. The authoritative checksum gate is **client-side today, by design**, because the
server never sees more than four digits. The draft was written before CT-11 closed; it is not wrong
as engineering preference (server-side authority is normally correct), but it silently assumes the
full number reaches the server, which is now prohibited by §6.3 until those conditions clear.
**Tier 1 must be specified as client-side-authoritative-for-now, with server-side authority as a
*post-C-013-7* enhancement**, not as the baseline. This also means the honest security statement is
that **Tier 1 is a data-quality control, not an anti-fraud control** — a determined actor bypasses a
client-side check trivially. That should be said out loud in the Stage 2 scope rather than discovered
at Stage 8.

---

## 7. A third-party ID-verification vendor — yes, it is a new cross-border question, and it is a bigger one than CT-1

The task's instinct is right and the precedent is closer than it looks.

CT-1 concerned **infrastructure** we chose (Render, Supabase, Resend) processing data in the EU/US
without the Client's prior written consent. A DHA-proxy or commercial identity-verification vendor is
the **same clause, same test, worse facts**:

| Dimension | CT-1 (Render/Supabase/Resend) | An ID-verification vendor |
|---|---|---|
| Data transferred | Account PII, email bodies | **Full national identity number, DOB, address, potentially ID document image and biometric selfie** |
| Purpose of transfer | Hosting/transport | **Disclosure to a third party for the express purpose of it being looked up against other databases** |
| s26 engaged | No | **Yes if biometric** (§2.2) |
| POPIA s72 | Binding-agreement route, analysed | Must be run from scratch per vendor |
| §19(c) contract consent | Sought, informally acknowledged, **not closed** | Would require its own itemised consent |
| §19(a) instruction | G-5 — no sub-operator appointment authority exists | **CT-4c applies directly**: a general sub-operator authorisation must be obtained *before* vendor selection, exactly as for the GPS vendor and PSP |

**Rulings:**

1. **No identity-verification vendor may be selected, contracted, trialled, or sent a single real ID
   number until CT-4c (general sub-operator appointment authorisation, G-5) is obtained.** Selecting
   one without it repeats the Supabase/Resend pattern on the platform's most sensitive data. This is
   not a Stage 8 finding to be worked around; it is a precondition on `integration-architect`'s
   evaluation. → **C-013-7.**
2. **Evaluation criteria this role imposes on any candidate**, to be answered *before* shortlisting,
   not after: data residency of processing and of storage; whether the vendor **retains** the ID
   number, document or biometric after returning a result, and for how long; sub-processor chain;
   whether a **match/no-match-only** mode exists (strongly preferred — it keeps document images out of
   our estate entirely); s21 operator agreement availability; breach-notification term and whether it
   can meet our nested 48-hour chain (`runbooks/ct-3-breach-notification-runbook.md` §5); and
   deletion-on-request support. A vendor without a match/no-match mode and without a contractual
   no-retention term should be scored down heavily, not merely noted.
3. **An SA-resident vendor materially improves the position** — it is the only realistic route by
   which any part of this data flow stays in the country — and should be weighted accordingly in the
   build-vs-buy matrix.
4. **Biometric/liveness requires s27(1)(a) consent copy authored by this role** before any UI is
   designed for it, not after (§2.2, C-013-2).

---

## 8. Conditions register — Feature 013 / KYC identity data

**Stage 8 position: Tier 2 and Tier 3 are BLOCKED. Tier 1 is clearable on C-013-1, C-013-3 and the
§6.4 correction. Document collection (ID images, proof of address) is BLOCKED and is not merely
"not yet built."**

`FEATURE_KYC_ENABLED` must remain **off** until the rows marked ⛔ close. The flag being off is
currently the only thing preventing the pre-existing INC-001 A-12 / F009-1 gap from being live; it is
a containment control and must be treated as one.

| ID | Condition | Owner | Deadline / gate |
|---|---|---|---|
| **C-013-1** | Extend the digit-12 race-digit prohibition (`business-requirements.md` FR-6/AC-7) to **derived values and to the digit-7 gender convention**. Confirmed sufficient otherwise | `business-analyst` (spec) + `backend-engineer` | Stage 2 |
| **C-013-2** ⛔ | **No ID-document image, proof-of-address document, selfie or liveness capture may be collected** until: s27(1)(a) consent copy authored by this role; an object-storage vendor exists and has passed §7 review (MP-5 open); §5.1 encryption and §4 deletion job in place | `compliance-specialist` (copy) + `integration-architect` (vendor) | Blocks any document-upload work |
| **C-013-3** | **s11(1)(c) "legal obligation" may not be cited** as the lawful basis anywhere — code, notice, consent copy, admin UI, Client correspondence — until C-013-4 returns. Primary basis is **s11(1)(b)**, supported by s11(1)(f) for duplicate prevention | all roles; enforced at Stage 8 | Standing, immediate |
| **C-013-4** | **Put the §3.5 FICA question to admitted counsel**, with the actual insurer licence class/sub-class and FSP categories attached (blocked on Feature 002 §12.5.1, still open) | `cto` / owner (obtain licence facts) + counsel | Before Tier 3 is scoped; **does not block Tier 1** |
| **C-013-5** ⛔ | **Retention and automated deletion per §4** specified and *implemented as a job* before any document is accepted: documents deleted on decision (30-day appeal ceiling); outcome + reviewer + timestamp retained. **Proof of address refused as a default collection** (§5.5) | `database-architect` + `backend-engineer`, verified `security-engineer` | Blocks document collection |
| **C-013-6** ⛔ | **Audit logging on every identity-data read** (actor, subject, timestamp, purpose) before KYC goes live; plus the §5.2 negative test for 13-digit runs in logs/responses/filenames at Stage 10. Currently blocked on **FU-A11** and **G-2** | `security-engineer` + `authentication-engineer` | Blocks `FEATURE_KYC_ENABLED` |
| **C-013-7** ⛔ | **No full ID number may be transmitted to the Frankfurt API, and no verification vendor selected/trialled/sent real data**, until: (a) **CT-1** closes in the required form; (b) a **supplementary §19(c) disclosure** covering the full ID number is served; (c) **G-11** is re-put and answered; (d) **CT-4c / G-5** sub-operator authorisation is obtained | `cto`/owner (Client items) + `integration-architect` (vendor) + `compliance-specialist` (drafts) | Blocks Tier 2 and Tier 3 |
| **C-013-8** | Pepper management plan for the Option A HMAC — managed secret store, never client-shipped, rotation behaviour defined, compromise treated as a reportable event (§5.3) | `cybersecurity-architect` + `database-architect` | Before first Tier 2 write |
| **C-013-9** | **No FICA s29 suspicious-transaction reporting procedure exists**, and s29 binds *any business*, not only accountable institutions. Open a minimal procedure (who may suspect, who decides, who files) | `compliance-specialist` + `cto` | 2026-10-31. Independent of C-013-4's outcome |
| **C-013-10** | **Re-run the §3 FICA determination on any of:** licence-category confirmation, Schedule 1 amendment, launch of premium financing/credit, any savings or investment component, or any handling of funds for third parties. Schedule 1 is amendable by notice — this determination has a short half-life | `compliance-specialist` | Standing; scheduled re-check **2027-03-31** |

**Inherited, not created, by this feature:** INC-001 A-12 / F009-1 (the existing KYC surface has no
Stage 8 record). Stage 8 for Feature 013 must close the pre-existing gap and this feature's new logic
in one pass — `business-requirements.md` §5's carry-forward is correct and is ratified here.

---

## 9. Standing statement

This is a compliance determination made from this repository, from POPIA, from the FIC Act and its
Schedule 1 as amended in 2022, and from the insurance-sector position already recorded at Feature 002
§12.5. **It is not legal advice.** The FICA determination at §3 is expressly **provisional and
uncertain**, is contingent on licence facts this role does not hold, and is referred to admitted
counsel at **C-013-4**. Nothing in this document should be represented to the Client, to a regulator,
or in product copy as a settled legal position on FICA applicability.

**Sources consulted for §3** (recorded so the determination is auditable):
[Masthead — Amendments to FICA Schedules finalised](https://www.masthead.co.za/newsletter/amendments-to-fica-schedules-finalised/) ·
[Moonstone — Short-term Insurance and FICA](https://www.moonstone.co.za/short-term-insurance-and-fica/) ·
[SAICA — Schedule 1, 2 and 3 of the FIC Act amended](https://www.saica.org.za/resources/153240/) ·
[Werksmans — implications of the FIC Act amendments](https://www.werksmans.com/legal-updates-and-opinions/the-implication-of-the-amendments-to-the-financial-intelligence-centre-act-38-of-2001/) ·
[South African Government — FIC Act Schedule 1 amendment notice](https://www.gov.za/documents/notices/financial-intelligence-centre-act-schedule-1-list-accountable-institutions)

**Filed by:** `compliance-specialist`, 2026-09-21.
**Feeds into:** [`business-requirements.md`](business-requirements.md) §2.1 (§6.4 correction), §2.2
(§6.2 ruling), §5 (§2.1 answer on special personal information; §2.2 race-digit confirmation).
**Does not discharge:** CT-1 · CT-1a/b/c · CT-4a–CT-4d · G-2 · G-3 · G-11 · FU-A11 · MP-5 ·
INC-001 A-12 / F009-1 · Feature 013 Stage 8.
