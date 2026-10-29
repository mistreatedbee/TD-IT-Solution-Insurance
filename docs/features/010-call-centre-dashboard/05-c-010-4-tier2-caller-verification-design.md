# Feature 010 — C-010-4: Tier 2 caller verification for report-on-behalf (OB-02)

**Owner (A):** `cybersecurity-architect` (mechanism). **Sufficiency (C):** `compliance-specialist`.
**Date:** 2026-10-29
**Status:** **PROPOSED, DESIGN ONLY. Not ratified.**
**Lifecycle position:** This is the design that `compliance-review-agent-attributed-actions.md` §6 (C-010-4) makes
a precondition for **Stage 2 entry** of FR-18–FR-21 and Phase 1 FR-9. It does not clear any stage by itself.
**Roadmap item:** OB-02 (`docs/organization/08-roadmap.md` §B Admin table and §F item 7). Per `cto`, OB-02 is
paper-only, has no outside dependency, and reuses Feature 010 instead of opening a new feature folder.

> **BUILD IS NO-GO.** Do not implement anything in this document until (1) `compliance-specialist` records
> sufficiency concurrence against §3 Tier 2 of the compliance review, (2) `cto` ratifies the design, and (3)
> the resulting Stage 2–7 artefacts pass Stage 8. That applies to every element below, **including the
> SR-010-1 audit event in §6, the `caller_verification` event type, the `CALLER_NOT_VERIFIED` error code
> (SC-API-03) and the escalate route.** SR-010-5's guardrails (404 assertion, no manifest entry, and the CI-2
> prohibition rule that is still unbuilt) stay in force. If you are `backend-engineer` and this file is the
> reason you are opening `support-cases.ts`, stop and check the ratification record in §11 first.

**Reads on:** `compliance-review-agent-attributed-actions.md` §2–§3 (the eight Tier 2 requirements and the
negative requirements, which are binding here), `security-review.md` §1 (SR-010-1), §5 (the SC-API-04 ruling
that `caller_verification` is a distinct event type), §6 (SR-010-5), `03-architecture-review-phase2.md` §3 and
§5.4, `api-design.md` §7, `02-support-incident-management-business-requirements.md` FR-18–FR-21.
**Code read for this design (2026-10-29):** `backend/src/routes/recovery.ts` (`POST /v1/recovery/cases`,
customer-only), `backend/src/routes/step-up.ts` + `lib/step-up.ts` (ADR-0012 TOTP step-up, usable by any
authenticated account with an enrolled factor), `backend/src/repositories/audit-log.ts` (current
`AuditEventType` union, `PRIVILEGED_ACCESS_EVENT_TYPES`, the `decision`-column invariant pattern from
migration 039). I found no "trusted contact", "delegate" or "authorised representative" concept anywhere in
`backend/src/`.

---

## 1. Scope

**In scope:** the verification an agent must obtain before creating a theft/loss recovery case on behalf of a
customer, where the person on the phone is not proven to be the account holder. Two caller situations:

| Mode | Who is on the call | Example |
|---|---|---|
| **M-A: account holder, unrecognised channel** | Claims to be the customer | The customer's phone was stolen and they are calling from a friend's phone or a landline |
| **M-B: third-party reporter** | Someone other than the customer | A spouse, parent or employee reporting that the customer's laptop or car was stolen |

**Out of scope:** Tier 0 (C-010-1 disclosure script) and Tier 1 (C-010-2 verified-or-flagged cases), which are
unchanged. Also out of scope: any other privileged agent action (credential reset, policy changes; candidate
#5 in `04-product-feature-candidates-2026-10.md`), pre-registered trusted contacts (§9, deferred), and voice
biometrics, which C-010-7 prohibits. This document does not redesign caller verification as a whole.

---

## 2. Threat model for report-on-behalf

The attack is not data theft. **Opening a fraudulent theft case is the attack** (compliance review §1). In
order of severity:

| # | Threat (STRIDE) | Attacker | Consequence |
|---|---|---|---|
| T-1 | **Spoofing.** Impersonate the customer (or claim to be family) to open a theft case | Stalker, abusive ex-partner, repossession-style actor | A security company is pointed at the victim's asset, and the asset's location becomes part of an active recovery workflow. This is the "locate a customer's vehicle in real time" attack tree, reached through the call centre instead of an account takeover |
| T-2 | **Elevation of privilege (insider).** A malicious or coerced `support_agent` creates on-behalf cases with no real caller | Insider at the call centre | Same as T-1, without any social engineering. RR-010-1 already accepts that any agent can act on any customer *detectably*. For this action, detection alone is not enough |
| T-3 | **Repudiation.** The customer later disputes that they authorised the case, or the agent disputes that they created it | Either party | False s8/s16 record. Claim-evidence integrity is lost (five-year Feature 011 floor) |
| T-4 | **Approval fatigue / confused deputy.** A real customer approves a prompt they did not understand, or an approval meant for one action is reused for another | External attacker who triggers prompts, or an insider | Turns the possession factor into a rubber stamp |
| T-5 | **Account-existence oracle.** A third party learns that a person is a customer, or what they own | Any caller | s19/s22 disclosure without any case being created |
| T-6 | **Denial of service by a thief.** Someone holding the stolen, unlocked phone declines the real owner's request | Thief | A legitimate report is delayed |

**Design principle that follows from T-1/T-2:** the verification outcome must come from the account holder's
own authenticated channel and be checked server-side. **No verification secret ever passes through the agent**:
no OTP read aloud, no TOTP code relayed, no "the customer confirmed" checkbox. That rules out the cheapest-
looking options (§4).

---

## 3. The mechanism: account-holder approval in an authenticated customer session

**One mechanism serves both modes.** The agent does not verify the caller. The agent raises an **on-behalf
report request**, and the **account holder approves or declines it from inside their own authenticated
session**, in the mobile app or on the web customer dashboard (`/dashboard`). The server creates the recovery
case only when the approval arrives.

This meets compliance §3 Tier 2 requirement 1 (out-of-band possession proof to a pre-registered channel: the
customer's credentialed session, plus their TOTP factor where enrolled) and requirement 2 (the agent cannot
self-approve, because the outcome is produced by the customer's request, not the agent's).

### 3.1 Flow

1. **Agent raises the request** from an open support case (FR-18's entry point). Inputs are the `supportCaseId`,
   the `assetId` (chosen from the lookup result), the mode (M-A or M-B), and, for M-B only, the reporter's
   stated relationship from a fixed list (`spouse_partner | family | employer_colleague | other`). No free-text
   reporter name or ID number (§7). The server checks every Tier 1 precondition `api-design.md` §7 already
   contracts (case status, asset belongs to the case's `accountId`, plan entitlement, no duplicate open
   recovery case) **before** creating the request, so a request cannot exist for an action that would fail
   anyway.
2. **The server creates an `on_behalf_request`** (§5) in state `pending`, bound to exactly one
   `(accountId, assetId, supportCaseId, agentAccountId, action: 'report_theft_or_loss')` tuple. A request
   cannot be reused for a different asset, a different action or a different agent (T-4 confused deputy).
3. **The account holder sees it.** It appears as a pending item in their authenticated session. A push or
   email nudge may *point* to it once those channels exist, but the nudge carries no approve link and no
   asset detail: approval happens only inside the session. This keeps it working with push still partial
   (C-007-1) and email owner-blocked (INC-001-C-8). If the customer does not see a nudge, the request simply
   waits, which fails closed.
4. **The approval screen is explicit.** It states, in plain language: "A TD IT call-centre agent is reporting
   your **[asset display name]** as **stolen/lost**. This will open a recovery case and may involve a security
   company." For M-B it adds: "The person who called said they are your **[relationship]**." It offers
   **Approve** and **This wasn't me / I don't recognise this**.
5. **Approval requires a fresh factor.**
   - If the customer has TOTP enrolled, approval is gated by ADR-0012 step-up (`requireStepUp`, which exists
     today), so a stale session on a lost-but-unlocked device cannot approve.
   - If no TOTP is enrolled, the customer must re-enter their password in-session (re-authentication), not
     merely hold a session. `backend-architect` designs the re-auth primitive at Stage 7. Session possession
     alone is not enough for an action that dispatches a third party.
6. **M-A only: number matching.** The agent's screen shows a two-digit match code. The agent reads it to the
   caller, and the account holder must select it on the approval screen. The code is not a secret. It binds
   "the person on this call" to "the session approving", which defeats T-4 (approving a request the customer
   did not initiate) and an agent quietly raising a second request. M-B has no match code, because the
   account holder is not on the call. It relies on the explicit screen wording and the rate limits in §5.3.
7. **On approval** the server re-checks the step 1 preconditions (state may have changed), then in one logical
   unit: creates the `recovery_cases` row through the same repository method the customer path uses
   (`createForAccount`), sets the support-case escalation fields (`03-architecture-review-phase2.md` §5.4
   steps 2–3), sets `support_case.callerVerified = true` with `callerVerificationMethod` and
   `callerVerifiedAt` (the inert fields already in the schema), writes the verification record (§5), and emits
   the audit events (§6). **This is the only code path that may ever set `callerVerified = true`.**
8. **On decline ("this wasn't me")** no case is created. The request moves to `declined`, a high-severity
   `caller_verification` event is written (§6), the agent sees a neutral "not confirmed" result (§3.3), and
   the event joins the insider-threat and fraud detection set (§8).
9. **On expiry** no case is created. M-A requests expire after **10 minutes**, because the caller is on the line.
   M-B requests expire after **24 hours**. An expired request cannot be revived; the agent raises a new one,
   which counts against the rate limits.

### 3.2 What the agent and the caller learn

The response to "raise request" is **identical whether or not the account exists, is a customer, or owns the
asset**, as far as anything is relayed to the caller. The compliance negative requirement (verification
failure must not disclose account existence) and T-5 apply. The agent script (C-010-1/SR-010-4 owners)
must say: *"If the person you're reporting for has an account with us, they'll be asked to confirm in their
TD IT app or online account. We can't tell you anything about their account."* The agent's own screen
already has the lookup result; nothing new is disclosed to the agent by this flow.

**No location data reaches the agent or the caller through this flow, before or after approval.** Verification
does not widen the agent's read scope. Location access stays under FU-A14/AUD-9 and the recovery workflow's
own controls. T-1's goal is location, so this has to be stated, not assumed.

### 3.3 Outcomes shown to the agent

`pending` / `confirmed` (case created, reference shown) / `not_confirmed` (covers declined **and** expired
**and** locked out, so the agent cannot tell a decline apart from silence and cannot coach the caller around
the lockout). Distinguishing these is for the audit trail, not the operator UI.

---

## 4. Options considered and rejected

| Option | Verdict | Reason |
|---|---|---|
| Additional knowledge questions (Tier 1 plus more questions) | **Rejected as a Tier 2 factor** | Compliance §3 Tier 2 req 1: knowledge alone is not sufficient at this tier. Anything the lookup can search by, or any KYC field (`idNumberLast4`, DOB, address), is prohibited outright |
| Callback to the registered phone number | **Rejected as sufficient, permitted as courtesy only** | The outcome is the agent's assertion ("I called back and they confirmed"), which fails req 2. In M-A the registered phone is often the stolen device, so the callback reaches the thief. SIM-swap exposure in the SA market. An agent may call back for service reasons; it never sets `callerVerified` |
| Customer reads a TOTP code to the agent | **Rejected** | Puts a live authentication secret in the agent's hands, inside the step-up window. Fails "no verification secret passes through the agent" (§2) and the req 3 "never material that would let the check be replayed" |
| SMS / email OTP read back to the agent | **Rejected** | Same relay problem, plus no SMS provider exists (new-vendor review) and email delivery is blocked on INC-001-C-8 |
| Supervisor approval as the factor | **Rejected as a factor; no break-glass** | A second agent proves nothing about the caller. Req 8: a bypass needs a supervisory role that does not exist (OQ-010-4 unresolved). **So there is no bypass, full stop.** If OQ-010-4 later creates a supervisor tier, any break-glass path needs its own design and review. This document does not pre-approve one |
| Voice biometrics | **Prohibited** | C-010-7 |

---

## 5. The verification record (`on_behalf_request`), designed for `database-architect`

Persisted per compliance §3 Tier 2 req 3. Domain data, so it belongs in MongoDB (ADR-0002). The collection
name, validator and indexes are `database-architect`'s Stage 6 decision. This section sets the security
requirements, not the schema syntax.

### 5.1 Required fields

| Field | Notes |
|---|---|
| `id` | UUID. This is the `verification_ref` carried on the audit rows (§6) |
| `accountId`, `assetId`, `supportCaseId` | The bound tuple. Immutable after create |
| `agentAccountId` | From `req.auth!.accountId`. Never from the body |
| `action` | `'report_theft_or_loss'` only. An enum, so a future action needs its own review to be added |
| `mode` | `'account_holder_unrecognised_channel' \| 'third_party_reporter'` |
| `reporterRelationship` | M-B only, fixed enum, or `null` |
| `state` | `pending → approved \| declined \| expired \| superseded`. Terminal states are terminal |
| `method` | On approval: `'in_session_step_up_totp' \| 'in_session_reauth_password'` |
| `channel` | `'mobile_app' \| 'web_dashboard'`. This is "which registered channel was used" (req 3) |
| `createdAt`, `expiresAt`, `resolvedAt` | Expiry is enforced server-side at approval time, not only by a sweeper |
| `approverSessionId` | The customer session that approved or declined. Lets a later investigation tie the approval to a login and its IP |
| `resultingRecoveryCaseId` | Set on approval |

### 5.2 Must never be stored

The match code (keep only a salted hash, or a server-side comparison inside the request's lifetime, then
discard), any password or TOTP value, free-text reporter identity (name, ID number, phone), and any location
field.

### 5.3 Rate limits and lockout (req 7)

- **Per account:** at most **1** `pending` request at a time (raising a new one marks the old one
  `superseded`), and at most **3** requests in any rolling 24 hours.
- **Per account lockout:** **2** `declined` outcomes within 7 days block new on-behalf requests for that
  account for 7 days. The customer's own self-report (`POST /v1/recovery/cases`) is never blocked by this. It
  is the path that resolves T-6, because a thief holding the phone cannot stop the owner reporting from the
  web dashboard.
- **Per agent:** at most **10** requests per hour. Any agent with **3** `declined` outcomes across **different**
  accounts in 24 hours raises a security alert (§8).
- Limits use the existing KV rate-limiter pattern (`createRateLimiter`). Every rejection by a limit is audited
  (§6). The numbers are starting values for `security-engineer` to tune at Stage 8 and are not fixed here.

### 5.4 Retention

Per req 4: retained for the life of the resulting recovery case (which inherits the Feature 011 five-year
floor once escalated). A `declined` or `expired` request with no resulting case keeps the support-case
**24-month** rule (C-010-8 purge, still unbuilt). **Declined requests are also fraud evidence**, so
`compliance-specialist` should rule on whether they need a longer floor.

---

## 6. Audit design: SR-010-1 applied to report-on-behalf, plus the `caller_verification` event

`cto`'s ruling names "the SR-010-1 audit event". SR-010-1 (`security-review.md` §1, §9) requires every
`support-cases` write to emit an ADR-0006 Trail A event that records the **subject** `accountId`, not only the
actor. It also requires that creates not preceded by a lookup be detectable (SR-010-1c). Today that is met by
`recordCaseAudit()` writing `privileged_data_access` rows (`security-review.md` §10.1/§11.3).

**Ruling: report-on-behalf does not reuse `privileged_data_access`.** That event means "an operator read or
touched another account's data". Reusing it for a write that dispatches a security company would bury the
highest-consequence agent action on the platform among routine case reads. This is the same reasoning SC-API-04
already applied to `caller_verification`. So two new Trail A event types are needed, both in Postgres
`app.account_audit_log` (`AuditEventType` union + an `app.audit_event_type` enum migration):

### 6.1 `caller_verification` (the SC-API-04 event, now given its shape)

One row per state transition of an `on_behalf_request`.

| Column | Value |
|---|---|
| `account_id` (subject) | The customer |
| `actor_account_id` | `initiated`/`superseded`: the agent. `approved`/`declined`: the **customer** (the subject acting in-session). `expired`/`rate_limited`/`locked_out`: null, with `actor_service` set to the system |
| `actor_session_id`, `audit_request_id`, `ip_address`, `user_agent` | As ADR-0006 AUD-1/AUD-5 |
| **new** `verification_outcome` | `initiated \| approved \| declined \| expired \| superseded \| rate_limited \| locked_out` |
| **new** `verification_method` | Set on `approved` only |
| **new** `verification_ref` | The `on_behalf_request.id`. Required on every row of this type |

Invariants, enforced both in `assertInvariants()` and as migration CHECKs, following migration 039's
`decision`-column pattern: `verification_outcome` and `verification_ref` are non-null **if and only if**
`event_type = 'caller_verification'`. `verification_method` is non-null if and only if the outcome is
`approved`. `account_id` is non-null. **Never** a code, password, TOTP value or reporter identity
(SC-API-04 ruling).

**Why `rate_limited` and `locked_out` rows exist even though nothing was created:** the requests a limit
refused are exactly the evidence req 7's insider-threat review needs.

### 6.2 `agent_on_behalf_report` (the SR-010-1 event for this write)

Exactly one row when an approved request creates the recovery case.

| Column | Value |
|---|---|
| `account_id` (subject) | The customer |
| `actor_account_id` | The **agent** who raised the request (the attributed author of the case, req 5) |
| `actor_session_id`, `audit_request_id` | From the approval request's context. `backend-architect` decides whether the agent's original `audit_request_id` is also carried, so both halves of the transaction can be joined |
| `verification_ref` | **Required.** The approving request's id |

Invariants: the event is added to `PRIVILEGED_ACCESS_EVENT_TYPES` (an actor is required). Subject is
required. `verification_ref` is required. **At the application layer, the writer must refuse unless the
referenced request is in state `approved`, is bound to the same `accountId`, and has not already produced a
case.** That makes "agent report without a customer approval" structurally impossible, not merely
discouraged. This is the T-2 control.

This one row satisfies SR-010-1a for the support-case escalation write. No duplicate `privileged_data_access`
row is needed for the same write. Agent **reads** around it (the lookup, case detail) keep their existing
SR-010-1 events unchanged.

### 6.3 Mongo-side attribution (req 5)

The `recovery_cases` row carries `origin: { kind: 'agent_on_behalf', agentAccountId, onBehalfRequestId }`
(the field name is `database-architect`'s choice).

- The **customer-facing** serializer shows "Opened by TD IT call centre on your behalf (you approved this on
  [date])". It shows no agent account id. An opaque agent reference is acceptable if `product-manager` wants
  one.
- The **security-operator** serializer excludes `origin`, on the same reasoning and through the same SR-011-1a
  projection list as `originatingSupportCaseId` (`security-review.md` §5).

---

## 7. Third-party reporter data (M-B)

A third-party reporter is a data subject in their own right. This design deliberately collects **only** a
relationship enum. It collects no name, phone number or ID number. Anything an agent types about them in the
support-case free text falls under C-011-1's existing guidance. Two questions are for `compliance-specialist`,
not decided here: whether the reporter needs a callback number recorded at all, and what notice the agent
script must give them. If the account holder cannot be reached (for example incapacitated), **there is no Tier
2 path**. The agent records a Tier 1 `callerVerified: false` support case and points the reporter to SAPS. No
recovery case is created and no dispatch happens.

---

## 8. Detection (feeds SR-010-1c's insider-threat set, `security-engineer`)

The following must be queryable from the Trail A events in §6. Alerting routes are a Stage 8 decision.

1. An agent with ≥3 `declined` outcomes across different accounts in 24 hours.
2. An agent whose `initiated` count is far above their peers, or whose requests have a high `expired` ratio
   (raising requests with no real caller).
3. Any account with a `declined` outcome. The account holder is the victim of an attempted T-1 and should get
   a security notice once a delivery channel exists (INC-001-C-8).
4. An `approved` outcome whose `approverSessionId` was created within minutes of the request, from a new
   device or IP. This is a possible account-takeover-assisted T-1, and it is reviewed against Feature 001's
   session signals.
5. `agent_on_behalf_report` rows not preceded by a `privileged_data_access` lookup row from the same agent for
   the same subject. This is the SR-010-1c query, now extended.

---

## 9. Deferred, and deliberately not designed here

- **Pre-registered trusted contacts** (a customer nominates someone who may report for them). This would cover
  the "account holder unreachable" gap in §7, but it needs its own consent design for a second data subject,
  its own verification of the nominee, and its own review. Recorded as a future OB-02 extension.
- **Break-glass path.** None exists (§4). It depends on OQ-010-4.
- **Post-creation confirmation to the account holder (req 6).** See §10 Q-1.

---

## 10. Open questions for `compliance-specialist` (sufficiency review)

- **Q-1 (req 6, out-of-band notification).** In this design the account holder is the approver, inside their
  own session, so they necessarily know the case was opened. My position is that this meets req 6's purpose
  (catching an impersonation that succeeded) for the creation event, because a successful T-1 now requires
  compromising the customer's own session and factor. A follow-up confirmation via a channel the agent does
  not control remains **recommended** once INC-001-C-8 clears. **Is the in-session approval sufficient for req
  6, or does the build stay blocked on INC-001-C-8?** If it stays blocked, the second independent blocker in
  `api-design.md` §7 step 6 still stands.
- **Q-2.** Is password re-authentication (for customers without TOTP) an acceptable possession proof under req
  1, or must Tier 2 on-behalf reporting be limited to TOTP-enrolled customers? From the security side I
  accept re-auth as proportionate, because the approving session is itself credentialed and the action can be
  revoked (the case can be closed). Restricting the flow to enrolled customers is the stricter alternative.
- **Q-3.** The retention floor for declined requests (§5.4), and the third-party notice and callback questions
  (§7).
- **Q-4.** Whether C-010-6/CT-4 (documented Client instructions covering agent-attributed processing) must be
  in place before Stage 2 for this flow, or only before real customer PII, as for the rest of Feature 010.

---

## 11. Status, ratification, and what stays blocked

| Item | Status |
|---|---|
| This design (C-010-4 mechanism) | **Proposed.** Awaiting `compliance-specialist` sufficiency concurrence (§10) and `cto` ratification |
| FR-18–FR-21, Phase 1 FR-9, OB-02 | **Still blocked at Stage 1.** They move to Stage 2 only after ratification. Stages 6 (`database-architect`, §5), 7 (`backend-architect`, approval, re-auth and request routes) and 8 (full joint gate) all follow |
| `caller_verification` and `agent_on_behalf_report` event types, migration columns | **Designed, NOT AUTHORIZED FOR IMPLEMENTATION** |
| `CALLER_NOT_VERIFIED` (SC-API-03) | Unchanged. Not added to `errors.ts` until the route is authorised |
| SR-010-5 guardrails | **Remain in force.** Item 1 (CI-2 prohibition rule) is still unbuilt. When this design is ratified, that rule should be extended to forbid writes of `callerVerified: true` outside the approval path in §3.1 step 7 |
| INC-001-C-8 | Independent blocker on req 6, unless §10 Q-1 is answered "sufficient" |

**Ratification record:** *(empty. `compliance-specialist` and `cto` append below. Do not edit the sections
above. Disagreement goes in a new section that cites them.)*

**Filed by:** `cybersecurity-architect`, 2026-10-29.
