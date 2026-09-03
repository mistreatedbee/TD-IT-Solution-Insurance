# Feature 010 — Compliance Review: caller verification for agent-attributed actions (OQ-010-2)

**Owner:** `compliance-specialist`
**Date:** 2026-09-03
**Status:** **Ruling issued — part-clearance.** Rules on **OQ-010-2** (Phase 1 §6.2, elevated at Phase 2
§6.1) and gives an interim position on **NFR-5** (free-text fields). Does **not** discharge Stage 8,
Stage 10, `business-analyst` acceptance, or OQ-010-4 / OQ-010-5.
**Not legal advice** — see §8.
**Reads on:** `docs/features/010-call-centre-dashboard/business-requirements.md` (Phase 1, FR-9/FR-10,
NFR-2), `02-support-incident-management-business-requirements.md` (Phase 2, FR-11–FR-21),
[`10-data-protection-contract-obligations.md`](../../organization/10-data-protection-contract-obligations.md),
[`INC-001-location-ingestion-popia-assessment.md`](../../organization/incidents/INC-001-location-ingestion-popia-assessment.md)
(SDL-9 out-of-band notification precedent), [`compliance-review-saps-case-data.md`](../011-saps-case-reporting/compliance-review-saps-case-data.md)
(C-011-1 free-text guidance, which this document inherits rather than restates).

---

## 1. What is actually being asked, and why it is a compliance question at all

OQ-010-2 reads as a product question ("voice match, OTP, other?"). It is not. A call-centre agent acting
on an unverified claim of identity is the platform's **most reachable path to unauthorised access to
personal information** — no credential compromise required, only a plausible caller. Under POPIA that
engages:

- **s19** — the responsible party (and, per TDIT-2026-09 §19, the Operator) must secure the integrity and
  confidentiality of personal information against unauthorised access. An access-control design that can
  be defeated by knowing a policy number is not a s19 safeguard.
- **s22** — a successful impersonation is "access to personal information by an unauthorised person," the
  textbook notifiable security compromise. It fires the 48-hour Developer→Client clock under §19(b), for
  which **no runbook exists** (CT-3, open, due 2026-09-12).
- **s8/s16** — an escalation created for the wrong person writes false information onto a real person's
  record and dispatches a security-company partner against it.
- **§19(a)** — an Operator's staff acting on a customer's behalf is processing; the standing instruction
  set that would authorise it (CT-4) does not exist yet.

The impersonation vector is worse on this platform than on a generic support desk, because the escalation
path (FR-18–FR-21) creates a **theft record** — which, per
[`compliance-review-saps-case-data.md`](../011-saps-case-reporting/compliance-review-saps-case-data.md),
becomes claim-substantiating evidence with a five-year retention floor, and which dispatches a third-party
security company. A malicious caller does not need to steal data to do damage here; opening a fraudulent
theft case against someone else's asset is itself the attack.

**Regime scope for this ruling:** POPIA applies (confirmed, same basis as Feature 011 §1). GDPR not
triggered. PCI-DSS not engaged — but note **§5 below**: a billing-dispute free-text field is the most
likely place raw card/bank detail enters this platform, and that would create PCI scope where none exists
today. That is a live risk this feature introduces, not a hypothetical one.

---

## 2. Ruling: there is no existing verification mechanism to reuse. This needs new design work.

I read the code rather than the doc. Findings:

**`backend/src/routes/admin-verification.ts` cannot be reused, and the resemblance is misleading.** It
implements *KYC record adjudication*: an **admin** (`requireUserType('admin')`, not `support_agent`) reads
a submitted `customer_profiles` record (name, phone, `idNumberLast4`, `verificationStatus`) and sets
`verified | rejected | action_required` via `PATCH /v1/admin/accounts/:id/profile/verification`. It answers
**"is this account's claimed identity plausibly genuine, once, at onboarding."** OQ-010-2 asks
**"is the human on this call the account holder, right now."** Different question, different actor,
different threat model. There is no challenge, no response, no per-interaction outcome, and nothing
`support_agent` can invoke. A `verificationStatus: 'verified'` flag tells an agent that *the account* was
KYC'd — it tells them nothing about *the caller*. **Reuse is not available.**

**Nothing else in the codebase closes the gap either:**

| Candidate | Verified state | Verdict |
|---|---|---|
| `customer_profiles.idNumberLast4` | Stored; surfaced to admins as `********NNNN` | **Prohibited as a caller authenticator** (§3, negative requirements) |
| Account email / phone / policy number | `GET /v1/customer-lookup` searches on all three | These are *lookup keys*, not secrets. Anything an agent can search by is something a caller can be expected to know |
| TOTP MFA | `POST /v1/mfa/enroll`, `POST /v1/auth/mfa/challenge` exist — both bound to a login/step-up flow | Real possession factor, but no agent-initiated, out-of-session challenge endpoint exists. Also only usable for the subset of customers who enrolled |
| SMS OTP | **No SMS provider exists anywhere.** `sms` appears only as a preference-enum value defaulting to `false` (`backend/src/repositories/notification-preferences.ts`) | Not reuse — a **new vendor selection** requiring `integration-architect` and a full operator/s21/s72 review before any customer phone number is transmitted to it (C-NOTIF/§19(c) posture) |
| Email OTP | Production email delivery still owner-blocked (**INC-001-C-8**: the platform cannot reliably reach its own data subjects) | Cannot be relied upon today |
| Push confirmation | Push-token registration and notification routes exist; adapter partial, Expo operator review open (**C-007-1**) | **Closest reusable possession factor**, but requires an installed app with a registered token — unusable for the caller who is phoning precisely because the app is not working |

**Ruling on OQ-010-2, limb 1: new design work is required.** The question cannot be closed by pointing at
an existing mechanism, and it cannot be closed by me alone — I set the requirement floor below;
`cybersecurity-architect` selects the mechanism at Stage 8; `product-manager`/`integration-architect` own
any vendor decision an out-of-band channel implies.

---

## 3. The compliance floor any verification design must meet — tiered by what the action does

A single verification bar for every call is wrong in both directions: it would either block "how do I add
an asset?" behind an OTP, or let a theft escalation through on a policy number. Three tiers, by the
consequence of the action.

### Tier 0 — Disclosing account information back to a caller. **This risk is live in shipped code today.**

`GET /v1/customer-lookup` already returns policy count, the full asset list with display names, plan and
subscription detail, open recovery cases with reference numbers, and call-centre notes — to any
`support_agent`, with **no caller-verification step anywhere in the flow and nothing in
`src/call-centre/*` telling the agent what may be read back down the phone.** Purpose limitation (Phase 1
NFR-2) governs *bulk* access and does so correctly; nothing governs *disclosure to the caller*. That is
the gap.

**Requirement C-010-1:** before any real customer PII reaches a call-centre workstation, there must be
(a) a scripted caller-verification step the agent completes before reading account detail aloud, and
(b) an agent-UI purpose/disclosure reminder on the lookup surface. This is not a Phase 2 item — it
attaches to the already-shipped Phase 1 surface, and it is enforceable at the existing M1 / Phase 1 NFR-3
gate (no production operator on real customer PII yet), so it costs nothing to fix now and is expensive
to retrofit after go-live.

### Tier 1 — Agent creates or annotates a **non-theft** support case (FR-12–FR-17)

Consequence is bounded: a record of a conversation. Requiring an OTP for every billing question is
disproportionate under s10 and will be worked around by agents, which is worse than not requiring it.

**Requirement C-010-2 — verified-or-flagged, never silently unverified.** Either:

- the caller passes Tier 2 verification (§ below), and the case records that; **or**
- the case is created in an explicit **`caller_unverified`** state, which (i) is visibly flagged on the
  record and in the agent UI, (ii) **blocks escalation to a recovery case and blocks disclosure of any
  account detail back to the caller**, and (iii) is captured in the audit trail.

This lets FR-11–FR-17 proceed to Stage 2 now without waiting on verification plumbing, while making the
unverified state a *fact on the record* rather than an unrecorded assumption. What must never exist is a
case that looks verified because nobody asked.

### Tier 2 — Agent creates a **recovery case** / escalates (FR-18–FR-21). Verified caller required, no unverified path.

This action creates claim-substantiating evidence, dispatches a third-party security company via the
unclaimed queue, and (with Feature 011) attracts a five-year retention floor. Requirements, all mandatory:

1. **An out-of-band possession proof to a pre-registered channel.** In-app push confirmation, or TOTP for
   enrolled customers, or an OTP over a channel that has itself passed operator/s72 review. Knowledge
   questions alone are **not** sufficient at this tier, whatever the questions are.
2. **The agent must not be able to self-approve.** The verification outcome must be produced by a
   server-side check against a customer-controlled channel — not by the agent ticking a box that says
   "customer verified." An agent-attested checkbox is a log of an agent's claim, not a verification.
3. **A per-interaction verification record must be persisted** with the case: method used, outcome,
   timestamp, agent account id, and which registered channel was used — **never the code or any material
   that would let the check be replayed.**
4. **A distinct audit event type.** `privileged_data_access` conflates a read with an identity assertion.
   Propose `caller_verification` on ADR-0006 Trail A, retained for the life of the case. Final event
   taxonomy is `cybersecurity-architect`'s at Stage 8; the requirement that it be distinguishable is mine.
5. **Attribution on the record.** An agent-created case must be marked agent-created, with the agent
   identified — a customer reading their own case history must be able to tell they did not open it.
6. **Out-of-band notification to the account holder** that a case was opened on their behalf, via a
   channel the agent does not control. This is the SDL-9 precedent from INC-001 applied here: the
   account holder learning about an action on their account from someone other than the actor is the
   control that catches a successful impersonation after the fact. **It is currently blocked on
   INC-001-C-8** (no reliable delivery to data subjects) — which is a reason this tier cannot ship, not a
   reason to drop the requirement.
7. **Rate limiting and lockout on failed verification attempts**, per account and per agent, with failures
   audited. An agent account that repeatedly fails verification against different customers is the signal
   an insider-threat review needs.
8. **No bypass without a supervisory role that does not yet exist.** If a break-glass path is designed, it
   must require a second, differently-privileged human, and every use must be logged and reviewed. This
   intersects OQ-010-4 (supervisor tier) — **if OQ-010-4 resolves as "no supervisor role," then there is
   no bypass, full stop.**

### Negative requirements — binding, at every tier

- **Voice biometrics ("voice match", named first in OQ-010-2's own wording) are PROHIBITED for Phase 2.**
  Biometric information is **special personal information** expressly named in POPIA s26, processable only
  under a s27/s33 authorisation, and it requires its own consent design, its own retention rule, its own
  vendor review and its own breach posture. It is the single most expensive option on the list, not the
  cheap one it reads as. Not to be scoped without a separate compliance review commissioned in advance.
- **`idNumberLast4`, full ID number, date of birth, and residential address are PROHIBITED as caller
  authenticators.** SA ID numbers are routinely disclosed in ordinary commerce and are partly derivable
  (date of birth, gender digits); addresses and DOB are not secrets. Worse, `idNumberLast4` is the
  platform's **own KYC field** — using it as an authenticator means any agent-side or database-side
  exposure of the KYC store simultaneously hands over the authenticator for every account it contains.
- **Verification failure must not disclose account existence.** `GET /v1/customer-lookup` already returns
  a uniform `404` for unknown/non-customer accounts — that posture is correct and must be preserved in
  whatever verification flow is built.

---

## 4. Ruling on OQ-010-2 and Stage-2 disposition for Feature 010 Phase 2

**Part-clearance:**

- **FR-11 – FR-17** (lookup enrichment, non-theft support-case creation, notes, status, resolution,
  case list) — **CLEARED to enter Stage 2**, subject to **C-010-1**, **C-010-2** and **C-010-3** (§5).
- **FR-18 – FR-21** (escalation to a recovery case) — **NOT CLEARED. Remain blocked at Stage 1** until a
  caller-verification design meeting §3 Tier 2 exists and has been reviewed jointly by me and
  `cybersecurity-architect`. This is the same disposition Phase 2 §6.1 anticipated; I am confirming it
  rather than lifting it, and I am now naming what the design must contain so it can be produced instead
  of debated.
- **Phase 1 FR-9** (agent-initiated theft report) inherits the same block, and this document supersedes
  its "verification workflow TBD Stage 2" wording — the workflow is not TBD-at-Stage-2, it is a
  precondition to Stage 2 for that requirement.

**OQ-010-2 is answered on the compliance limb** (what verification is required, and that nothing reusable
exists). It is **not closed as an engineering question** — the mechanism selection is `cybersecurity-architect`'s
and the channel/vendor decision is `product-manager`/`integration-architect`'s.

---

## 5. Interim position on NFR-5 (free-text fields) — partial discharge of the Stage-2-close dependency

Ruling far enough to unblock Stage 2 design; final position lands with the RoPA entry (§6, C-010-5).

- **Masking is the wrong control.** You cannot reliably mask what a human types into an unbounded field
  after it is stored. The control is **input-time guidance plus non-collection**, not post-hoc redaction.
- **C-010-3 — PCI scope protection, and it is the sharpest risk this feature carries.** The billing
  category (FR-13 `billing`) makes it foreseeable that an agent will type a card number or full bank
  details into a free-text description. **The platform holds no cardholder data today and has no payments
  backend; that nil PCI-DSS scope is an asset and must not be destroyed by a text box.** Required: explicit
  agent-facing UI guidance ("never record card numbers, CVV, PINs, or full bank account details"), the same
  in agent training/runbook copy, and confirmation at Stage 8 that no such field is indexed or exported.
- **C-011-1 (third-party suspect data) applies here too** — inherited from the Feature 011 review, not
  restated. FR-12's description field is the same risk surface as `recovery_cases.notes`.
- **Retention:** a support case is **not** a recovery case and must not inherit its five-year floor by
  default. Interim position: **24 months from case closure**, aligned with the delivery-metadata precedent
  in `compliance-review-notifications.md` §5 — **except** where a support case was escalated (FR-20
  `escalated`), in which case it becomes part of the claim/recovery record and inherits that retention
  floor. Automated, evidenced deletion, same standard as C-011-10.

---

## 6. Conditions register — Feature 010

| ID | Condition | Owner | Blocks |
|---|---|---|---|
| **C-010-1** | **Scripted caller-verification step + agent-UI purpose/disclosure reminder on the customer-lookup surface** (§3 Tier 0). Attaches to the already-shipped Phase 1 surface, not only to Phase 2. | `ux-researcher` + `technical-writer` (script), `frontend-engineer` (surface) | Any real customer PII on a call-centre workstation (existing Phase 1 NFR-3 / M1 gate) |
| **C-010-2** | **Verified-or-flagged support cases** — explicit `caller_unverified` state that blocks escalation and account-detail disclosure, and is auditable (§3 Tier 1). | `database-architect` (state), `backend-engineer` (enforcement) | Stage 6/8 exit for FR-12 |
| **C-010-3** | **No cardholder or full bank data in free-text fields** — agent UI guidance, runbook copy, Stage 8 confirmation (§5). Protects the platform's current nil PCI-DSS scope. | `ui-designer` + `technical-writer`; verified `security-engineer` | Stage 8 exit |
| **C-010-4** | **Tier 2 caller-verification design** meeting all eight requirements in §3, reviewed jointly by `compliance-specialist` + `cybersecurity-architect`. | `cybersecurity-architect` (mechanism), `compliance-specialist` (sufficiency) | **Stage 2 entry for FR-18–FR-21 and Phase 1 FR-9** |
| **C-010-5** | **RoPA entry** for call-centre support-case processing (new information store, new internal recipients, retention per §5) — drafted inside **INC-001-C-10**, not as a separate artefact. | `compliance-specialist` (me) | First real customer PII on this surface. Not Stage 2 |
| **C-010-6** | **Agent-attributed processing must be covered by the CT-4 documented-Client-instructions artefact** — an Operator's staff acting on a data subject's behalf is processing that no instruction currently authorises. | `compliance-specialist` + `cto` | First real customer PII on this surface (CT-4 due 2026-09-15) |
| **C-010-7** | **Standing prohibition on voice biometrics** for caller verification without a prior, separate compliance review (s26 special personal information). | all roles; enforced at Stage 8 | Standing |

---

## 7. What I am not ruling on

- **OQ-010-4** (individual vs. team queue, supervisor role) — a business-structure question, not a
  compliance one. It becomes a compliance question only if a verification *bypass* is proposed (§3 Tier 2,
  requirement 8).
- **OQ-010-5** (entitlement-gate script) — product/business-rules. No compliance interest beyond ordinary
  fair-dealing in the copy.
- **§1 entity-boundary decision** (`support_cases` as a separate collection). The reasoning is sound and
  the leakage argument about `listForPartnerOrg` is correct; entity design is `database-architect`'s at
  Stage 6. I note only that the separate collection also makes §5's differential retention implementable,
  which the shared-collection alternative would not.

---

## 8. Standing statement

This is a compliance determination made from the statute, the contract terms as summarised to me, and this
repository. **It is not legal advice.** One item belongs with admitted counsel: whether a successful
call-centre impersonation would be a s22 notifiable compromise in circumstances where the agent followed
the documented script — my working position is that it would be, and the §19(b) Developer→Client notice
would be owed regardless, on the same reasoning as doc 10 §8.

**Filed by:** `compliance-specialist`, 2026-09-03.
**Does not discharge:** Stage 8 · Stage 10 · `business-analyst` acceptance of the Phase 2 document ·
CT-3 (breach runbook) · CT-4 · INC-001-C-8/C-10 · C-007-1 (Expo operator review).
