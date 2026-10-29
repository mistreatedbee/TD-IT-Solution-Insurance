# Compliance Rulings — OB-05, OB-12, OB-09 (`08-roadmap.md` §F item 8)

**Owner:** `compliance-specialist` · **Date:** 2026-10-29
**Status:** **Rulings.** None of them authorises a build. §F keeps the form/UI wiring for OB-05 and
OB-12 NO-GO until each matching OB-17 screen merges, and OB-09 discounts NO-GO until a payment
gateway is chosen. Each build still needs its own Stage 8 and Stage 10.
**Regime:** POPIA for all three (SA data subjects; TD IT Solution (Pty) Ltd is the Responsible Party
and NextWave the Operator, `10-data-protection-contract-obligations.md` §1). GDPR is not engaged on
current facts. PCI-DSS is not engaged by OB-05 or OB-12. OB-09 discounts **will** touch PCI scope
through whichever PSP is chosen, which is outside this ruling. Insurance-sector conduct rules
(Policyholder Protection Rules, Treating Customers Fairly) bear on OB-09.
**Not legal advice.** Counsel items are marked **[counsel]**.
**Append-only.** Corrections are made in new dated sections, and superseded text is marked void,
never deleted.

---

## 1. OB-05: is a client-side birth-date cross-check sufficient under CT-11?

### 1.1 Facts (code, 2026-10-29)

- `mobile/src/lib/sa-id-number.ts` and `src/lib/sa-id-number.ts` check length, the check digit, that
  the date is plausible and the citizenship digit. **They do not compare digits 1–6 with the date of
  birth the customer entered.**
- The backend accepts `idNumber` only as `^[0-9]{4}$` (`customer-profile-validation.ts:21-25`), and
  separately accepts `dateOfBirth` as a full date (`:15`).
- The full ID number never leaves the device (CT-11, closed 2026-09-14, control still in force per
  doc 10 §14).

### 1.2 Ruling: **sufficient for its purpose, under the conditions below**

**What the check is for.** Comparing the ID's YYMMDD with the entered date of birth is a
**data-quality check** (POPIA s16: take reasonably practicable steps to ensure information is
complete and accurate). It catches typing errors at the point of capture. **It is not identity
verification.** A customer who lies on both fields consistently passes, and the check can be
bypassed on the client by anyone who wants to. Neither point matters, because nothing relies on it as
a control.

On that understanding, a client-side check is not just sufficient. **It is the only form CT-11
allows,** because the server never holds the digits it would need. A server-side version would mean
either sending the full number (which reverses CT-11 and needs CT-15 / CT-1) or the server
re-deriving the ID's date of birth from last-4 (impossible).

**Conditions:**

| ID | Condition | Owner |
|---|---|---|
| **R05-1** | When the dates do not match, block submission on the device with a plain message ("The date of birth in your ID number doesn't match the date of birth you entered"). No retry counter, no lockout, nothing sent to the server about the mismatch | `mobile-architect` / `frontend-architect` |
| **R05-2** | **Do not persist or transmit a client-asserted "date of birth matches ID" flag as evidence.** If engineering wants one for analytics, it must be named for what it is (`clientConsistencyCheckPassed`), excluded from every verification decision, and never shown to an admin as "verified". `verificationStatus` changes only through the existing admin review (and later OB-07) | `backend-architect` |
| **R05-3** | Nowhere may the check be called "verification": not in UI copy, not in the admin view, not in the OB-09 score. Feature 013's Tier 1 "authoritative, server-side" birth-date check cannot exist as Tier 1 describes it while CT-11 stands. Feature 013's business requirements need a dated note saying so (`business-analyst`) | `business-analyst`, `technical-writer` |
| **R05-4** | The full 13-digit number and the entered date of birth must not appear in client logs, crash reports or analytics events at the point of comparison (the same rule as Feature 013 §5.2's 13-digit negative test, extended to the mobile and web clients) | `mobile-engineer`, `frontend-engineer`; verified at Stage 10 |
| **R05-5** | UI wiring waits for the OB-17 onboarding/identity screen to merge (§F) | — |

### 1.3 Where `cybersecurity-architect`'s input is still needed

1. **Tamper posture.** I rule the check is not a control, so bypassing it is acceptable. The chair
   should confirm that nothing in the security architecture treats it as one.
2. **The server already holds enough to narrow the full ID number to about 100 candidates.** This
   finding is not created by OB-05, but OB-05 is where it becomes visible.
   - An SA ID is `YYMMDD SSSS C A Z`. The backend stores the **date of birth (digits 1–6)** and
     **last-4 (digits 10–13, including the check digit Z)**.
   - Only digits 7–9 are unknown: 1,000 combinations. The check digit removes about 9 in 10, leaving
     **about 100 candidates**. If gender can be inferred (digit 7 encodes it), about 50.
   - CT-11 therefore stops the *full number* crossing the border. It does **not** make the stored
     data non-identifying.
   - Two questions are for `cybersecurity-architect`:
     - (a) Should date of birth and last-4 be stored apart, or last-4 reduced (for example, excluding
       the check digit)?
     - (b) For OB-06, **the duplicate-detection HMAC must not be derived from date of birth plus
       last-4.** That input space is small enough to brute-force if the pepper leaks.
   - On the compliance side, I am **not** reopening CT-11. I am recording that "only last-4 is held"
     must not be described, in any privacy notice, s72 analysis or Client correspondence, as "the ID
     number is not held in any identifying form".

---

## 2. OB-12: may the platform notify an emergency contact who is not a registered user?

### 2.1 Facts (code, 2026-10-29)

- The emergency contact is `{ name, relationship, phone }`. **There is no email field**
  (`customer-profile-validation.ts:36-42`).
- The mobile profile form **requires** it (`ProfileEditScreen.tsx:116-123`), even though Feature 009's
  UX architecture lists it as "(optional)" (`03-customer-ux-architecture.md:90`) and its roadmap as
  "SHOULD HAVE".
- No purpose for the field is stated anywhere: no s18 notice and no compliance ruling. Nothing sends
  anything to the contact.
- The surface is behind `FEATURE_KYC_ENABLED`.

### 2.2 Ruling: **yes in principle, under conditions. Not on the data as collected today.**

**Who is involved.** The emergency contact is a data subject in their own right. We hold their name,
phone number and relationship to the customer, collected **from the customer, not from them** (s12(2)
applies, and s18(1) still requires them to be told "as soon as reasonably practicable"). A lost-mode
alert also discloses the **customer's** information (that the customer has marked a device lost) to
that contact.

**The customer's side.** The customer starts lost mode and chooses the contact. Disclosing to that
contact, at the customer's request, is lawful on the customer's consent (s11(1)(a)).

**The contact's side.** Sending them a message is processing of *their* information **for a purpose
that was never stated when it was collected**. s13 requires a specific, explicitly defined purpose,
and s15 asks whether further processing is compatible. "Contact this person in an emergency involving
the customer" fits a lost-device alert reasonably well under s15(3) (the relationship, the nature of
the information, and the contact's reasonable expectation). But the purpose was never written down,
so I will not rely on compatibility alone for contacts already on record.

**Not direct marketing.** A lost-mode alert is not direct marketing (s69) as long as it contains
**nothing promotional**. If it does, s69 applies, and a non-customer cannot be sent marketing without
opting in. That is the reason for condition R12-4.

**Conditions:**

| ID | Condition | Owner |
|---|---|---|
| **R12-0** | **Fix the collection first.** Either make the emergency contact optional (matching the UX architecture) or state its purpose at collection. In either case, add the purpose to the s18 notice at the capture point and in both privacy notices: "*If you turn on Lost Mode and choose to alert your emergency contact, we'll send them a short message asking them to get in touch with you.*" This is a data-minimisation (s10) fix whether or not OB-12 ships | `mobile-architect` + `technical-writer` |
| **R12-1** | **Opt-in per contact, off by default:** "*Alert [name] when I turn on Lost Mode*". Contacts stored before R12-0 ships are **not** eligible until the customer turns this on | `mobile-architect` |
| **R12-2** | **Only the customer can trigger it,** by an authenticated customer action. No admin, agent or partner may trigger a contact alert (OB-02 / C-010-4 does not extend to this without a separate ruling) | `backend-architect` |
| **R12-3** | **The customer confirms they have told the contact.** A tick at opt-in: "*I've told [name] they may get a message from TD IT Solution.*" This does not replace the s18 notice to the contact; it supports it | `ui-designer` |
| **R12-4** | **Fixed server template, minimal content, no customer free text.** Content: the customer's first name, that they have marked a device as lost or stolen through TD IT Solution, a request to contact the customer another way, who we are, why we have the number, and how to stop ("Reply STOP" or equivalent). **No location, no asset identifiers, no case reference, no link to case data, no promotional content.** A free-text field would turn the feature into an SMS relay that can be abused | `notification-engineer`; copy `technical-writer`, reviewed by me |
| **R12-5** | **Opt-out is permanent and suppressed by number.** A contact who opts out is added to a suppression list keyed on a keyed hash of the number. It applies even if another customer later enters the same number. Opt-out removes the number from lost-mode use for that customer | `backend-architect` |
| **R12-6** | **Rate limit:** one message per contact per lost-mode activation, and no more than 3 activations that alert contacts per customer in any 24 hours | `backend-architect` |
| **R12-7** | **Log** each send (customer account, contact reference, not the raw number in the log line, template version, timestamp, delivery outcome). Keep the log with the recovery case. The contact can make an s23 request, and today G-8 has no one to answer it (doc 11) | `backend-engineer` |
| **R12-8** | **Channel.** There is no contact email, so email through Resend is **not** available without collecting a new field. I do not recommend collecting a non-user's email only to save the SMS cost. SMS or WhatsApp means a **new sub-operator**: CT-4c (general sub-operator authorisation), an s21 agreement, an s72 transborder assessment if processing is offshore (WhatsApp/Meta: OB-14's existing flag), and a Client-paid cost (I-8). **This is the practical blocker** | `integration-architect` |
| **R12-9** | **Authority.** This is a new processing purpose. It is raised to the Client as **G-16** (doc 11 §11). No live send before it is answered (doc 11 §6 and §7) | `cto` / owner |

**Safety note (not a condition, for `ux-researcher`).** The customer chooses the contact. The contact
receives no location. That design choice is deliberate: an "emergency contact" is not always someone
the customer is safe with. Do not add location to the message later without a fresh ruling.

---

## 3. OB-09: fair treatment and POPIA s71 if a "protection score" ever affects pricing

### 3.1 Facts (code, 2026-10-29)

- `backend/src/lib/profile-completion.ts` produces a setup checklist: MFA, policy, asset, profile
  fields, verification status.
- Serial/IMEI is captured (`asset-validation.ts`).
- There is no score and no discount logic. Discounts are NO-GO until a payment gateway is chosen
  (§F).

### 3.2 Ruling A: a score that does **not** affect price is permitted, under fair-treatment conditions

| ID | Condition |
|---|---|
| **R09-1** | Call it what it is. If it measures account setup, call it that ("Protection checklist" or "Setup score"), not "risk score". It must state that **it does not affect your premium or your claims**. It must not be shown to claims adjudicators, and it must not be an input to claims (the same principle as Feature 018 CC-6) |
| **R09-2** | **No dark patterns:** no fear copy that is untrue ("Your phone is at risk!"), no false urgency, no shaming, no score decay designed to drive engagement, no streaks. Every item explains what it does for the customer in one sentence |
| **R09-3** | **Nothing that depends on consent may be a score item.** Marketing opt-in, analytics opt-in, partner location sharing (OB-03 grants) and **Feature 008 self-device location consent** must **not** earn points. Rewarding consent with a score undermines "voluntary" (s1). Permitted items: MFA on, profile complete, serial/IMEI recorded, policy active, identity verified (only through the real review, R05-3), and **hardware** tracker linked, once a GPS vendor exists and G-6 is answered |
| **R09-4** | **No special personal information and no proxies for it** (s26: race, religion, health, biometrics, and so on). **No area-based factor.** In South Africa, residential area is a known proxy for race. A suburb or location-derived factor is excluded unless a separate fairness review approves it |

### 3.3 Ruling B: a score that **does** affect price or discounts engages s71. It is permitted only on these terms.

**Why s71 applies.** A premium or discount set by rules applied automatically to a profile of the
customer's **conduct** (and, through a tracker, possibly **location**) is a decision that "affects
[them] to a substantial degree" and is "based solely on automated processing" (s71(1)). A discount
counts as well. Withholding one is a decision with financial consequences. Putting a human in the loop
for every price is not realistic at this scale, so plan for s71(2)(a) rather than designing around it.

**The s71(2)(a)(ii) route** (in connection with a contract, with appropriate measures), and s71(3):

| ID | Condition |
|---|---|
| **D-1** | **Representations.** Customers can challenge a score-driven price outcome and have a person review it, with a recorded outcome and a stated time limit (s71(3)(a)) |
| **D-2** | **Explain the logic.** Before it applies, the customer is told which factors count, how much each one is worth, and what they can do to change it (s71(3)(b)). A list of factors in plain language is enough. Model internals are not needed |
| **D-3** | **Discount only. Never a loading.** The score can lower the premium. It can never raise it. A score-driven surcharge needs a separate ruling and is unlikely to pass fair treatment |
| **D-4** | **Factors must be relevant to risk, within the customer's control, and verifiable.** Each factor needs a written reason why it lowers the risk of loss or theft. "Profile complete" probably does not meet that test. A hardware tracker and verified identity plausibly do. R09-3 and R09-4 apply in full |
| **D-5** | **Changes only going forward, with notice.** No retrospective repricing. A change caused by the score takes effect at the next billing cycle, after written notice. Losing a factor (for example, removing a tracker) loses the discount only from then on |
| **D-6** | **The insurer approves the factors.** Rating factors are the licensed insurer's decision, under its own pricing governance. **TD IT Solution's licence position is still unreturned (C-011-6).** Until it is, nobody on this platform can decide what is a rating factor. Raised as **G-17** (doc 11 §11). **[counsel]** If TD IT Solution acts as an intermediary or under a binder, confirm where pricing authority sits |
| **D-7** | **Disclosure in policy wording** (PPR, linked to Feature 018's CR-018-4). The discount terms appear in the policy schedule or wording, not only in the app |
| **D-8** | **Logging.** Every score calculation that changes a price records the factor values used, the rule version and the result, kept with the policy record. This is the evidence for D-1 and for any FSCA or Information Regulator enquiry |
| **D-9** | **Fairness check before launch.** `analytics-specialist` checks the outcome distribution across customer segments the platform holds lawfully. Without special information, the check is on proxies such as plan tier and asset type. The check is repeated every quarter |

**Order of work:** Ruling A can go to `business-analyst` for OB-09 Stage 1 now. Ruling B is a Stage 1
constraint on design, and it stays blocked on the payment gateway, on G-17 / C-011-6, and on
`pricing-model-v2.md`.

---

## 4. Register

| ID | Status | Blocks |
|---|---|---|
| OB-05 | **Ruled: sufficient**, under R05-1…R05-5. **Open with `cybersecurity-architect`:** §1.3 (1) and (2) | Wiring waits for the OB-17 identity screen |
| OB-12 | **Ruled: yes in principle**, under R12-0…R12-9 | G-16; a channel/sub-operator (R12-8); R12-0 before anything else |
| OB-09 | **Ruled:** A, informational score permitted (R09-1…4). B, pricing-linked score permitted only under D-1…D-9 | B: payment gateway, G-17 / C-011-6, PSP PCI scope |

**Filed by:** `compliance-specialist`, 2026-10-29.
