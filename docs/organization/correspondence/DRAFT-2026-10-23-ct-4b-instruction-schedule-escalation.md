# DRAFT 2026-10-23: CT-4b clause 19(a) instruction schedule escalation to TD IT Solution (Pty) Ltd (CT-16 included)

**Status:** **DRAFT. NOT SENT.** Prepared by `compliance-specialist` on 2026-10-23, per the `cto`
ruling at
[`../../features/016-kyc-identity-verification/03d-cto-ruling-stage5.md`](../../features/016-kyc-identity-verification/03d-cto-ruling-stage5.md)
§"Ruling 1". It goes to the platform owner (or `cto`) to read, correct and send. No agent in this
organisation has a channel to the Client. Under this directory's rule 2, the `DRAFT-` prefix is
evidence that this communication has **not** happened.

**What this is.** One consolidated ask covering the whole overdue **CT-4b** instruction schedule
(G-2, G-3, G-6, G-8, plus G-9 added by F-4-OI-7), with **CT-16** (G-11, G-15, G-16) folded in. It
is **not** a standalone CT-16 request. The fold-in decision at
[`../10-data-protection-contract-obligations.md`](../10-data-protection-contract-obligations.md)
§14.1 stands, and the ruling expressly says not to undo it.

**Read §A (pre-send checklist) before §B (the letter). §A row A1 is unticked and changes the letter's
opening paragraph.**

---

## §A: Pre-send checklist

| # | Fact or condition the letter depends on | Verified? | Source / owner |
|---|---|---|---|
| A1 | **Whether any CT-4b instruction schedule was ever actually put to the Client.** The CT-4b row says "obtain"; `11-documented-client-instructions.md` §8 item 2 required `compliance-specialist` to **draft** the schedule by 2026-09-22, to be sent with CT-1b on 2026-09-26. **This repository has no draft and no sent copy of that schedule.** `correspondence/` holds only the CT-1 letter and two unrelated drafts. So "unanswered" may really mean "never asked". | **NO, owner must confirm** | **Owner.** If a schedule went out by some channel not recorded here, use **Opening (a)** in §B and tell `compliance-specialist` the date and channel so it can be recorded. If nothing went out, use **Opening (b)**. Do not send with both openings, and do not send Opening (a) unless something was actually sent. |
| A2 | CT-1 (clause 19(c) consent) is still **"sent, informally acknowledged, consent not confirmed in the required form"**, and CT-1a (the one-line follow-up) has not been recorded as sent | **YES as far as the repo records** | `10-…` §10.3/§10.5. If CT-1a has gone out, or a verbatim reply has come back, tell `compliance-specialist` before sending this, because paragraph 6 changes. |
| A3 | Location ingestion is **disabled** and G-6 blocks re-enabling it | **YES** | `10-…` §12.4 CT-4b row; `11-…` §4 G-6 |
| A4 | Feature 016 Tier 1 is a dark build (flag OFF in production, no real customer data), and Track B is **design-only** | **YES** | `03d-cto-ruling-stage5.md` Ruling 3 |
| A5 | No ID-document, proof-of-address or biometric collection exists in code today | **YES** | `016/business-requirements.md` §1.1; MP-5 (no object-storage vendor) |
| A6 | Only the last four digits of the SA ID number are persisted today (CT-11) | **YES** | `10-…` §13, §14 ¶1 |
| A7 | **G-15 and G-16 have not yet been added to `11-…` Register B** (CT-16 asked for them to be appended; they have not been) | **YES, a gap** | `compliance-specialist`. Not a blocker to sending, because the letter puts the questions directly. Recorded at `10-…` §16. |

---

## §B: The letter (ready to send, subject to §A)

> Send from a **domain address**, on the **same email thread** as the 14 September CT-1 letter if
> that is practical, so the Client sees one continuing conversation and not a new demand.

---

**To:** TD IT Solution (Pty) Ltd, attention: the signatory to contract TDIT-2026-09
**From:** NextWave Digital Solutions
**Date:** [DATE]
**Subject:** Your instructions under clause 19(a) of TDIT-2026-09: overdue, now blocking delivery. Request for a response date.

Dear [NAME],

**1. Why we are writing**

*[Opening (a), use ONLY if §A row A1 confirms a schedule was sent:]*
On [DATE SENT] we asked you for written instructions on several points under clause 19(a) of our
agreement. We asked for your response by 26 September 2026 and have not yet received it. We are
writing again because the gap is now holding up work you have asked us to deliver.

*[Opening (b), use if nothing was sent. This is the default unless A1 says otherwise:]*
Clause 19(a) of our agreement says we may process personal information only on your documented
instructions. We committed to putting a short schedule of instruction questions to you by
26 September 2026. That schedule did not reach you on time, and the delay is ours. We are sending
it now, in one document. We are also explaining what it is currently holding up, so that you can
decide how quickly you want to deal with it.

Either way, the request is the same. It is set out in paragraph 5. **We ask for one thing above
all: a firm date by which you will respond.**

**2. What is currently blocked until we have your answer**

These are not hypothetical. Each one has been stopped on our side because we do not yet hold your
instruction:

- **Asset location tracking** (question 3 below). Location tracking is turned off and will stay off.
  It is the core of the asset-recovery service.
- **Identity verification of real customers, Tier 1** (questions 6 and 8 below). The verification
  feature has been built but is switched off. It cannot be turned on for real customers.
- **Duplicate-identity detection, Track B** (question 7 below). This checks whether the same
  ID number has already been used on another account. It exists only on paper. We will not build
  it until we have your instruction.

**3. Why we cannot go ahead without your instruction**

Under our agreement and under POPIA, **you** are the responsible party and **we** are your
operator. Decisions about what personal information is collected, how long it is kept, and who may
see it are yours to make. Our own engineering decisions, however careful, are not your instruction.
Where we hold no instruction, our rule is not to start new processing. That is why the items in
paragraph 2 are stopped and are not going ahead on our own judgement.

**4. How we need your answer recorded. Please read this paragraph.**

We keep a written register of every instruction you have given us. It currently holds nine entries,
all taken from the contract itself. **The contract alone does not authorise any of the specific
processing in paragraph 2.**

For each question below, a reply such as "noted", "fine", or "we have considered this" **will not
be treated as an instruction.** We will record your answer as a **new numbered instruction**,
starting at **I-10**, and we will start the blocked work only once that instruction is recorded.
It must say **what** personal information, for **what purpose**, and with **what limits**.

For identity verification specifically, this means one thing in plain terms. **An answer to
questions 6 to 8 that does not also give the positive instruction set out in question 8 will not
let us switch on Tier 1 identity verification for your customers.** We say this now so it does not
come as a surprise later.

**5. The questions**

We show our recommendation in italics under each question. The decision is yours, and you may
answer differently.

*Access, retention, rights requests and deletion*

1. **Who may access live customer personal information, and why?** We need a standing instruction
   covering which of our staff roles may access live customer data, for which purposes (resolving
   an incident, fixing a defect, migrating data, supporting a customer), whether access is standing
   or only granted in an emergency, and confirmation that every access is logged.
   *Our recommendation: emergency-only access for named engineers, limited to those four purposes,
   with every access logged.*
2. **How long should each type of record be kept?** Today we have set these periods ourselves,
   and they should be yours. Please instruct us on, or confirm, a period for each of the following:
   login and identity records; audit logs; policy and claim history (subject to any minimum period
   insurance record-keeping rules require); insured-asset records; location history; notification
   records.
   *We will send our proposed period for each, with reasons, as a one-page attachment if that would
   help.*
3. **Asset location tracking.** Do you instruct us to collect the location of customers' devices
   and assets? If so: on what basis (customer consent), how often, how long location history is
   kept, and whether any of it may be shared with security-company partners during a recovery.
   **Location tracking stays off until we have this answer.**
4. **Customer rights requests (access, correction, deletion).** Will you answer these yourselves,
   or do you instruct us to answer them for you? Who receives them, and what response time applies?
   A contact address is published on the customer-facing pages today, and no named person has been
   assigned to respond.
5. **Deletion.** What must we delete when a customer asks for their information to be deleted, when
   a policy is cancelled, and when our contract ends? What must we **keep** despite a deletion
   request, for insurance record-keeping reasons?

*Identity verification (CT-16)*

6. **What identity data do you instruct us to collect?** Please answer each separately:
   (a) the **full 13-digit SA ID number**. Today only the last four digits are kept, and the full
   number is used only momentarily to check that it is valid.
   (b) **photographs or scans of identity documents**.
   (c) **proof-of-address documents**.
   (d) any **biometric data**, such as a selfie, face-match or liveness check.
   *Our recommendation: (a) yes, used only as described in question 7; (b), (c) and (d) not yet,
   until there is a confirmed legal requirement to collect them and a secure storage supplier has
   been chosen. Each of them is a new and more sensitive type of data.*
7. **Duplicate-identity detection (Track B).** Do you instruct us to receive each customer's full ID
   number and store it **only** as a one-way keyed fingerprint, so that we can detect the same ID
   number being used on more than one account? The number itself would never be stored. The
   fingerprint cannot be turned back into the number.
8. **Identity verification as a condition of service (Tier 1). This needs its own positive
   instruction.** Do you instruct us to:
   (a) process each customer's full name, date of birth, SA ID number (only the last four digits
   kept; the full number only as you instruct under question 6(a)) and residential address **for
   the purpose of verifying their identity**;
   (b) have our administrative staff review those details and record a verification decision
   (verified, rejected, or further action required); and
   (c) **use that decision to restrict what a customer can do**: specifically, prevent an unverified
   customer from registering an asset (and, once claims exist, from filing a claim)?
   We will record a "yes" to question 8 as instruction **I-10**. **Without it, Tier 1 stays off for
   real customers, whatever the answers to questions 6 and 7.** A "yes" to question 7 will be
   recorded as a separate instruction, so that Tier 1 does not have to wait for a decision on
   Track B.

**6. A related item, still open**

Separately, the clause 19(c) cross-border consent we asked for on 14 September still needs to be
confirmed in the specific form described in our follow-up. Your reply on that thread was positive,
and we are grateful for it. *[Adjust or delete this paragraph per §A row A2.]* Nothing in this
letter depends on it, but both are needed before real customer information is processed.

**7. What we are asking you to do**

Please reply by **[DATE: suggest 5 business days from sending]** with **either**:

- your answers to paragraph 5, in whole or in part, **or**
- a **firm date** by which you will answer, and whether you would prefer to answer on a call, which
  we will then write up for you to confirm.

If any question is unclear, or you disagree with our recommendation, please tell us. Disagreement
is useful to us. We would rather hear it now than build the wrong thing.

Yours sincerely,

[NAME]
[TITLE]
NextWave Digital Solutions
[DOMAIN EMAIL ADDRESS, not a personal webmail address]

---

## §C: Notes for the sender (do not include in what you send)

1. **Do not soften paragraph 4 or question 8. They are the reason this draft exists.** Per
   `cto`'s ruling, **an answer to Register B gaps G-11/G-15/G-16 is not authorisation.** The
   authorisation for Feature 016 Tier 1 real-customer activation is a **new Register A row
   (I-10 or later) in `11-documented-client-instructions.md` §3**, covering the specific data
   Tier 1 enforcement relies on: full name, date of birth, SA ID number (last-4 persisted, plus the
   full number only to the extent instructed and only once CT-15/CT-1 allow it), residential address,
   and the `verificationStatus` decision used as an asset-registration (and future claims) gate. If the
   Client answers questions 6 and 7 but not question 8, **Tier 1 stays off.** Track B needs its own
   Register A row (question 7) before any build work starts (ruling, Ruling 3).
2. **A Register A row is necessary, not sufficient.** Tier 1 activation also needs the Ruling 2
   defect fix merged and the existing CT-1/CT-15/CT-16 flag conditions met (ruling, Ruling 3).
   Track B's full-number transmission additionally needs CT-15 served and CT-1 closed in the required
   form. **Do not tell the Client that a "yes" switches anything on.** The letter is worded so that it
   does not.
3. **Pick one opening (§A row A1).** Opening (b) admits the schedule was late on our side. If that
   is the truth, it is the right thing to send. A follow-up chasing a schedule that was never
   sent would be a false statement to the Client.
4. **CT-4a (email dispatch, G-1) is not in this letter.** `11-…` §8 item 2 originally grouped G-1
   with this schedule. The `cto` ruling scoped this escalation to CT-4b plus CT-16. If `cto` wants
   G-1 included, append `11-…` §5.4's six questions as a "Part 4", unchanged. Do not paraphrase
   them.
5. **Do not re-send the CT-1 schedule or re-argue clause 19(c).** Paragraph 6 is a one-line
   reminder only.
6. **If the Client replies on a call**, write the answers up and send them back for written
   confirmation before `compliance-specialist` records any Register A row. A verbal answer is not a
   documented instruction.
7. **Route every reply to `compliance-specialist` before anyone acts on it.** Conditions such as
   "keep location for 7 days only" or "no biometrics ever" have engineering consequences, and
   `cto` must price them.
8. **On dispatch:** rename this file `SENT-<date>-…`, add a dispatch record (date, sender, recipient,
   channel, which opening was used, any edits), update `correspondence/README.md`, and tell
   `compliance-specialist`, so that the escalation entry at `10-…` §16 moves from "drafted" to
   "sent".
9. **This is not legal advice.** It is a compliance determination from this organisation's own
   analysis. `11-…` §10 recommends that admitted counsel review any instruction schedule actually
   put to the Client.
