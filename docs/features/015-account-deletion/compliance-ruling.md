# Feature 015 — Account Deletion: Compliance Ruling (Stage 1 → Stage 2 gate)

**Owner:** `compliance-specialist`
**Date:** 2026-11-13
**Status:** Ruling issued. **Stage 2 (Product Planning) is unblocked**, subject to the conditions in
§10. **Stage 8 remains blocked** until the Client answers G-3 / G-9 / G-10
(`docs/organization/11-documented-client-instructions.md` §4) — this ruling does not change that.
**Not legal advice.** Items marked **COUNSEL TO CONFIRM** are not settled by this document.

**Inputs read:** `business-requirements.md` (this feature, "BRD"),
`docs/organization/10-data-protection-contract-obligations.md`,
`docs/organization/runbooks/account-deletion-request-runbook.md` ("runbook") §5,
`docs/features/018-claims-filing-and-adjudication/security-review.md` §12.5 CC-5.

---

## 1. Regime determination for this feature

| Regime | Applies? | Basis |
|---|---|---|
| **POPIA** (Act 4 of 2013) | **Yes.** SA data subjects; s11 (lawful basis), s14 (retention limitation), s24 (correction/deletion), s19 (safeguards) | Confirmed platform posture |
| **TDIT-2026-09 §19** (contract) | **Yes.** We are the **Operator**; TD IT Solution is the Responsible Party and owes the s24 duty. Every disposition below is a **recommendation for Client ratification**, not our decision (§19(a), G-9) | `10-...md` §1 |
| **Insurance recordkeeping** (FAIS Act 37/2002, Insurance Act 18/2017 + PPR (Short-term)) | **Probably, but depends on the Client's licence position, which is unconfirmed** (C-011-6 / G-17) | **COUNSEL TO CONFIRM** |
| **FICA** (Act 38/2001) | **Probably not for short-term business.** Schedule 1 lists long-term insurers, not short-term insurers. The runbook §5.3 "FICA-style 5-year floor" is an analogy, not an obligation | **COUNSEL TO CONFIRM**; do not cite FICA to customers |
| **Tax Administration Act 28/2011 s29** | **Not today** — no payments/billing exist. Will attach to billing records when built (BRD D-14) | Re-assess at payment feature Stage 1 |
| **GDPR** | **Not confirmed.** No EU data-subject targeting on record. If that changes, Art 17(3)(b)/(e) give an equivalent retention carve-out, and Art 12(3) adds a one-month clock | Escalate to `product-manager` if any EU market is contemplated |
| **PCI-DSS** | **N/A** — no card data handled | — |

---

## 2. Governing principles (binding on Stage 2–9)

- **P-1. Deletion is a mixed disposition, not one hard delete.** I adopt BRD §2. POPIA s14(1)(a)
  (retention required by law), s14(1)(b) (reasonably required for a lawful purpose related to the
  responsible party's functions), s14(1)(c) (required by contract) are the only grounds that justify
  keeping anything after a verified s24 request. Each retained item must cite one.
- **P-2. Retained-under-a-legal-floor means pseudonymised and restricted, not anonymised.**
  *This corrects BRD §3 D-2/D-4/D-5.* A policy or claim record kept to satisfy an insurance
  recordkeeping floor must still be attributable to the policyholder, or it does not satisfy the
  floor (a regulator or ombud asks "show me this client's record"). Truly anonymised data falls
  outside POPIA (s6(1)(b)), so "anonymise and keep" and "keep because the law requires it" are
  mutually exclusive. Rule: **retain the record with identifiers sealed behind restricted access
  (compliance/legal role only, every access audit-logged), then hard-delete at floor expiry.**
  Anonymisation is used only for records with no legal floor that we want for aggregates.
- **P-3. Every retention exception has a diarised end date.** Runbook §6.6 rule adopted: an
  exception with no end date is indefinite retention. Must be an automated job, not a manual task.
- **P-4. Backups are not selectively erasable** (runbook §5.4). Never tell a customer otherwise.
- **P-5. Where the BRD and the runbook disagree, this ruling decides** (§3 notes each conflict).
  The runbook is a shared document; I do not edit it here. `compliance-specialist` will append a
  reconciliation section to it once the Client answers G-3/G-9.

---

## 3. Data class × disposition × retention

"Floor" = minimum retention despite the request. "Basis" = the s14 ground.

| # | Data class (store) | Disposition on execution | Retention floor & legal basis | Conflict resolved |
|---|---|---|---|---|
| D-1 | **Supabase identity** — `auth.users`, `app.accounts`, status cache, MFA factors, enrollment/reset/idempotency tokens, invitations | **Hard delete.** `app.sessions`: revoke **all other sessions at submission** (an attacker's session must not survive into the window); revoke the rest at execution. The runbook §5.1 "revoke at containment" rule applies unchanged to the manual DSR path | None | — |
| D-1a | `app.account_state_transitions` | **Retain, pseudonymised** (drop email/name; keep opaque account id + transitions) | Same period as D-13 audit log; s14(1)(b) integrity of account lifecycle | — |
| D-2 | **Customer profile** (`customer_profiles`: name, DOB, `idNumberLast4`, address, phone, emergency contact) | **Hard delete the profile document.** The policyholder identity needed by retained records (name, `idNumberLast4`, contact at time of policy) is **copied into a sealed snapshot on the retained policy/claim record**, restricted access | Snapshot follows D-4/D-6 floor | BRD said "anonymise stub"; runbook said "delete". **Delete + sealed snapshot on retained records** (P-2). Emergency-contact data (a third party's PI) is **always hard-deleted** — no floor applies to it |
| D-3 | **Profile picture** | **Hard delete** | None | — |
| D-3a | **Asset photos** (MP-5 — not built) | Prospective: **hard delete**, except photos attached as evidence to a claim or recovery case, which follow D-6 / D-6a | As D-6 / D-6a | Must be specified before MP-5 ships |
| D-4 | **Policies + `policy_status_history`** | **Retain, restricted** (P-2), then hard delete | **5 years from policy termination — interim.** Basis s14(1)(a) if FAIS s18 / PPR recordkeeping binds the Client (**COUNSEL TO CONFIRM applicability, starting event, and whether the Insurance Act/PPR sets a longer floor**); otherwise s14(1)(b) defence of claims — Prescription Act 68/1969 s11(d) 3-year period plus margin | BRD said "then anonymise"; ruling: **then delete** |
| D-5 | **Assets** | **Hard delete** unless referenced by a retained policy, claim or recovery case. If referenced: retain only the fields the retained record needs (type, make/model, serial/IMEI), restricted, same floor as the referencing record. Drop `lastLocation` regardless | Follows referencing record | BRD said retain all; runbook said delete. **Delete unless referenced** |
| D-6 | **Claims** (Feature 018: documents, `decisionNotices[]`, `statusHistory`, `reviewNotes`, Trail B `'claim'` rows) | **Retain, restricted**; **erasure deferred** and the deferral recorded | **≥ 5 years after the claim reaches a terminal state** (018 SR §12.5 CC-5). Basis s14(1)(a), FAIS Act s18 5-year minimum; **COUNSEL TO CONFIRM** Insurance Act/PPR floor (insurer's legal function) | Adopted unchanged |
| D-6a | **Recovery / security cases** + police-report triple | **Retain**; open case = **defer** (§4). Closed: police-report triple 5 years from `closedAt` (`recovery-cases.ts:59`, enforced by `police-report-retention.ts`) | Basis s14(1)(b)/(c) — evidentiary, SAPS matter, claims defence. **The "rest of the document survives indefinitely by design" posture is not acceptable** — it needs an end date (P-3). **Recommend: whole case document deleted 5 years after `closedAt`**, unless linked to a claim with a later floor. **COUNSEL TO CONFIRM** | New finding against existing code — route to `database-architect` |
| D-6b | `recovery_case_events` (Feature 019) | Per runbook §5.2 row (no customer id stored; follows parent case) | As D-6a | Adopted |
| D-7 | **Support cases** | **Hard delete**, unless the case evidences a complaint, dispute or claim — then retain with that record's floor | Complaint records: PPR complaints-recordkeeping — **COUNSEL TO CONFIRM period** | BRD said anonymise after 12 months; runbook said delete. **Runbook rule adopted** |
| D-8 | **GPS / location history** (`location_events`, `lastLocation`) | **Hard delete. No general exception.** Only location points already copied *into* a recovery-case record as evidence survive, and they follow D-6a | None for the raw stream | Adopted (BRD and runbook agree) |
| D-9 | **Tracking-device bindings** | **Hard delete the person↔device linkage**; device hardware identifiers may persist as unlinked inventory | None | Adopted runbook wording |
| D-10/11 | Notifications, preferences, **push tokens**, alerts, `push_token_security_events` | **Hard delete** | None | — |
| D-12 | `product_events` | **Hard delete or irreversibly de-identify** — no analytics interest outweighs erasure (CT-9 §19(e)) | None | — |
| D-13 | **Audit logs** — `app.account_audit_log`, `admin_access_log` entries about this customer | **Retain unmodified for the audit retention period, then delete.** Not deletable on request: they prove access to this person's data was lawful | **12 months — asserted by us, not instructed (G-3).** No statute fixes this. Recommend the Client ratify **at least as long as the longest record they protect access to**, i.e. align with D-4/D-6 (5 years) for entries touching claim/policy records. **CLIENT TO RATIFY; COUNSEL TO CONFIRM** | BRD said "retain, unmodified" with no end date — **an end date is required** (P-3) |
| D-14 | **Payment/billing** | Not built | Tax Administration Act s29 (5 years) will likely apply | Must be added before payments Stage 8 |
| D-15 | **Protection score** (Feature 020, not built) | **Hard delete** any stored score/history | None | Cross-ref `020-protection-score/compliance-ruling.md` |
| — | **Backups / sub-operators** | Live erasure on date X; backups age out by date Y; re-delete on restore; sub-operator erasure instructions issued (F-4-OI-4) | — | Runbook §5.4 adopted |

---

## 4. Blocking and deferral conditions

Submission is **never** blocked (BRD AC-4 adopted). **Execution** is gated:

| Condition | Effect | Rule |
|---|---|---|
| **Active policy** | **Cancel first, then delete** (BRD AC-1) | Deleting identity under an on-risk contract defeats s14(1)(c). Cancellation consequences (refund/proration) must be shown before confirm |
| **Open recovery case** | **Defer** whole execution; tell customer why; re-offer on closure | Runbook §5.5(2). **High-suspicion**: a deletion request on an asset under active recovery is a plausible thief-erasing-the-trail vector — verify to the runbook §6.2 standard without exception, and notify the case handler |
| **Pending / open claim** (Feature 018) | **Defer** whole execution until terminal state; then D-6 floor applies | 018 CC-5. A deletion request **must not** be treated as withdrawal of the claim unless the customer separately and expressly withdraws it |
| **Legal hold** | Excluded record retained unmodified; rest proceeds | Customer told a hold exists (unless law-enforcement deferral applies); **Client must be told** (G-10, CT-6). Not implementable as silent hold until G-10 answered |
| **Live dispute / complaint / ombud matter** | Defer the related records | s14(1)(b) defence of a legal claim |
| **Outstanding premium debt** (prospective) | Does **not** block erasure of non-financial data; financial records follow D-14 | Recovery of debt is not a ground to keep GPS, profile picture, etc. |

**Deferral is not silence.** Each deferral is recorded in the DSR file and the customer receives a
substantive s24 response within the runbook's 30-day commitment (runbook §3), stating what is
deferred, why, and what happens on closure. Re-check deferred requests automatically when the
blocking case/claim reaches a terminal state.

---

## 5. Step-up authentication and confirmation

- **SA-1. Fresh re-authentication immediately before confirm**: password re-entry, **and** an MFA
  challenge if MFA is enrolled (`mfa.ts` step-up pattern). Freshness window ≤ 5 minutes. An older
  session is insufficient (BRD AC-6 adopted).
- **SA-2. Out-of-band notice at submission** to the verified email (and push, if registered),
  containing a **one-tap cancel link that does not require login** (BRD AC-7 adopted — prevents an
  account-takeover attacker from forcing execution while locking out the owner). Cancel link:
  single-use, expires at execution, does not reveal account data.
- **SA-3. Explicit confirmation**: the confirm action requires a deliberate act (e.g. typing
  `DELETE` or an equivalent non-default control), not a single default-focused button.
- **SA-4. Recent-credential-change guard**: if email, password or MFA factor changed in the
  preceding 7 days, require the cooling-off to restart from the later of submission or that change,
  and send the notice to **both** old and new email addresses.
- **SA-5. Every step audit-logged** (submission, step-up result, cancel, deferral, execution,
  per-collection counts) in `app.account_audit_log`; these entries follow D-13.
- **Dependency:** SA-2 requires working transactional email (production delivery still unconfirmed;
  INC-001-C-8). **Execution must not ship without a working notice channel.**

---

## 6. Cooling-off / grace period

**Ruling: 7 calendar days** (BRD AC-7 adopted), **Client to ratify (G-9)**.

Reasoning:
1. It is the main defence against account-takeover-driven deletion, which is irreversible for D-1/D-3/D-8.
2. It fits inside the 30-day s24 response commitment with margin for verification and deferral checks.
3. Longer (14–30 days) adds little security value, and POPIA s24 does not prescribe a period.
   A long delay before honouring a verified request could look like obstruction.
4. During the window the account stays usable, a persistent "deletion scheduled for [date]" banner
   shows with cancel, and **marketing processing stops immediately** (s69/s11(3) objection is implicit
   in the request). Location ingestion for the account also **stops at submission**, because there is
   no reason to keep collecting data we are about to delete.
5. Reminder ≥ 24 hours before execution (BRD AC-7).
6. Re-subscribing during the window counts as withdrawal **only after explicit confirmation**
   (BRD §6 edge case adopted).

---

## 7. What the customer must be told (content fixed here; copy is `technical-writer`/`ui-designer`)

Before confirm (BRD AC-8 adopted; must be **specific, not boilerplate**):
1. What is **deleted** (login, profile, profile picture, location history, device links, notifications).
2. What is **kept**, **why**, and **for how long** — per class (policy records, claims, theft/recovery
   cases, audit logs) — with the period labelled **"provisional"** while G-3 is unratified.
3. That kept records are **restricted**, not used for marketing or any other purpose, and deleted at
   the end date.
4. That the **active policy will be cancelled** first, and what that means for cover and refunds.
5. Any **deferral** reason (open theft report / claim) and that we will process it on closure.
6. The **7-day** window, the cancel link, and that after it the action is **irreversible**.
7. **Backups**: copies age out by a stated date and are never restored into use without re-deletion.
8. That the **Responsible Party is TD IT Solution (Pty) Ltd**, the s23/s24 contact channel (a domain
   address — not the consumer webmail in `email-footer.ts:44`, CT-7), and the right to complain to
   the **Information Regulator** (s74).

**Prohibited copy:** "delete everything"; any statute citation we cannot evidence (e.g. FICA,
runbook §5.3); stating a period as Client-set when it is not; claiming backup erasure.

After execution: a confirmation with the date, the retained-items schedule with end dates (runbook
§6.5(2)), sent to the email on file **before** that email is deleted.

---

## 8. Requirements handed to other roles

| ID | Requirement | Owner |
|---|---|---|
| R015-1 | Encode §3 as a data-driven retention schedule; every retained class has an automated, logged deletion job keyed to its end date | `database-architect`, `backend-engineer` |
| R015-2 | Sealed policyholder snapshot on retained policy/claim records; restricted-access role; every read audit-logged | `database-architect`, `cybersecurity-architect` |
| R015-3 | **Give `recovery_cases` documents an end date** (§3 D-6a) — currently indefinite | `database-architect` |
| R015-4 | TTL / purge on `location_events` (still none, INC-001 §2.2) | `database-architect` |
| R015-5 | Execution gate checks: active policy, open recovery case, open claim, legal hold, dispute | `backend-architect` |
| R015-6 | Step-up + no-login cancel link per §5 | `authentication-engineer` |
| R015-7 | Sub-operator erasure instruction step (Supabase, Atlas, Resend logs) | `compliance-specialist`, `integration-architect` |
| R015-8 | Reconcile runbook §5 with this ruling by appended section after G-3/G-9 answers | `compliance-specialist` |

---

## 9. Open questions for admitted counsel

1. **Licence position:** is TD IT Solution (or its insurer partner) an FSP under FAIS and/or a
   licensed insurer under the Insurance Act? That decides whether D-4/D-6 floors are s14(1)(a)
   (required by law) or only s14(1)(b).
2. **FAIS s18 / General Code:** is 5 years the right floor for policy and claim records, and does it
   run from policy termination, from claim terminal state, or from the last transaction?
3. **Insurance Act / PPR (Short-term):** do the PPR recordkeeping or complaints rules set a longer
   floor than 5 years for policies, claims or complaint records? Which rule numbers apply?
4. **FICA:** confirm short-term insurance business is outside Schedule 1, so no FICA s22/s23 floor
   applies. The runbook currently leans on a "FICA-style" analogy.
5. **Recovery/police-report records:** is 5 years from `closedAt` defensible, given the
   prescription periods for theft prosecutions and civil claims? Should open SAPS matters extend it?
6. **Audit-log retention:** what period should access logs about a deleted customer be kept for,
   and is "lawful-access evidence" a valid s14(1)(b) ground to refuse their erasure?
7. **Operator vs responsible party:** given that we draft the retention schedule, does that move
   us toward joint responsibility (`10-...md` §7.2)?
8. **Legal hold notice:** can a hold be kept from the data subject where SAPS is involved (s22(3)
   analogue / CPA), and what must the Client be told (G-10)?
9. **Pseudonymised retention:** does a sealed, restricted snapshot still meet the regulator/ombud
   "produce the client record" expectation, and does it satisfy s24 for the deleted remainder?

---

## 10. Gate decision

**Stage 2: UNBLOCKED** on these conditions:
(a) §3 is the planning baseline, and its durations are **parameters**, not constants (BRD §7);
(b) the corrections in P-2 / D-2 / D-4 / D-5 / D-7 / D-13 / D-6a are adopted;
(c) G-3, G-9 and G-10 go to the Client in the next consolidated instruction schedule
(`11-...md` §8 item 5), with this ruling attached as our recommendation.

**Stage 8: BLOCKED** until G-3/G-9/G-10 are answered, counsel questions 1–3 are answered, and R015-1,
R015-3, R015-4 and a working notice channel (§5) exist.

**Filed by:** `compliance-specialist`, 2026-11-13. Not committed.
