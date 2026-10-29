# Feature 010 — OB-02: Tier 2 Caller Verification for Report-on-Behalf — Stage 2 Product Planning

**Owner (A):** `product-manager`
**Contributors:** `cto`, `technical-project-manager`, `business-analyst`
**Date:** 2026-10-29
**Status:** Stage 2 — in progress. Entry criteria met: `cto` ratified the C-010-4 mechanism in
`05-c-010-4-tier2-caller-verification-design.md` §13 on 2026-10-29, which names "FR-18 to FR-21, Phase 1 FR-9
and OB-02 may enter Stage 2" as what the ratification unblocks (§13.3). Exit criteria for this stage: a
prioritized, scoped backlog item with target milestone — produced below (§8).
**Lifecycle position:** Stage 2 of 15 (`docs/organization/02-feature-lifecycle.md`). This document supersedes
the Stage-1 placeholder wording of FR-9 (`business-requirements.md` line 52: "verification workflow TBD Stage
2") and refines the Stage-1 draft FR-18–FR-21
(`02-support-incident-management-business-requirements.md` §3.3, which itself already noted FR-18/FR-21 were
blocked pending a Tier 2 design). It does **not** redo Stage 1 — the business problem, threat model, and
rejected alternatives are closed per `05-c-010-4-tier2-caller-verification-design.md` §1–§4 and the `cto`
ratification. It does not perform Stage 3 (UX research), Stage 4 (UI design), or any architecture/security
work — those are explicitly named as the next stages in ratification §13.3, dispatched separately.
**Reads on:** `05-c-010-4-tier2-caller-verification-design.md` (all sections, especially §3 mechanism, §5
record requirements, §6 audit design, §12 compliance rulings, §13 ratification and its 8 binding conditions
C-010-4-R1–R8), `02-support-incident-management-business-requirements.md` §3.3 (Stage-1 FR-18–FR-21 draft) and
§6 (open questions OQ-010-2, OQ-010-4, OQ-010-5), `business-requirements.md` (Phase 1 FR-9/FR-10, superseded).

---

## 1. Problem statement (carried forward, not re-litigated)

A call-centre agent today has **no way** to open a theft/loss recovery case on behalf of a customer who calls
in without being logged into their own session, because no verification mechanism exists that proves the
caller is who they say they are (or is honest about being a third party) without putting a secret through the
agent. This blocks the single most business-critical call-centre workflow: a customer whose device was just
stolen, calling from someone else's phone, cannot get a recovery case opened through the call centre at all
today. The `cto`-ratified design in `05-c-010-4-tier2-caller-verification-design.md` solves this by moving the
verification decision into the account holder's own authenticated session (in-app or web) rather than relying
on anything the agent hears over the phone. This document turns that ratified mechanism into scoped,
testable functional requirements.

## 2. Scope of this Stage 2 item (OB-02)

**In scope (MVP, this roadmap item):**
- Agent-initiated "report on behalf" request flow from an open support case (M-A and M-B caller modes).
- Account-holder approval/decline of that request from their own authenticated session, on **both** the
  mobile app and the web customer dashboard (`/dashboard`) — see §4 FR-21a and the R6 condition below.
- The audit trail, rate limiting/lockout, and retention behaviour specified in design §5–§6, as scoped into
  product-facing acceptance criteria below.
- Resulting recovery-case creation and support-case escalation, reusing the existing `createForAccount` path.

**Out of scope for this item (tracked separately, not silently dropped):**
- Pre-registered trusted contacts (design §9) — a future OB-02 extension, needs its own consent design.
- Any break-glass / supervisor-override path — none exists; `OQ-010-4` (supervisor/team-lead role) is
  unresolved and this item does not wait on it or create a workaround.
- Voice biometrics — prohibited (C-010-7).
- SMS/email OTP relay to the agent — rejected as a mechanism (design §4).
- Post-approval out-of-band (email) confirmation to the account holder — **mandatory once INC-001-C-8
  clears** (condition C-010-4-Q1b), not at this item's launch, because production email delivery is a
  separate, already-tracked platform blocker. This item ships with the in-app persistent attribution record
  (FR-20a) as the interim control, per the compliance ruling.
- Reporter (M-B) callback number collection — ruled out entirely (design §12.3 item 2), not a scope cut.

## 3. Dependency and condition carry-forward

This item inherits, and does not re-decide, the 8 binding conditions from ratification §13.2
(C-010-4-R1–R8). Two are Stage 2's own responsibility and are discharged in this document:

- **C-010-4-R6** (web approval ships with mobile, not fast-follow) — discharged at **FR-21a** below. This is
  the condition that most directly affects product scope, and it is called out explicitly rather than left
  for Stage 7 to notice, per the task instruction: a web-only (or mobile-only) approval surface would exclude
  exactly the M-A customer whose own phone was just stolen, since that customer's *only* available device at
  the moment of the call may be someone else's phone or a desktop/library computer. The product decision is
  to **require both surfaces in MVP** rather than accept the gap, because the gap would hit the highest-value
  M-A use case — not a rare edge case.
- **C-010-4-R8** (new UI through design-system sign-off) — not discharged here; it is Stage 4's gate, flagged
  forward at §7 below so `ui-designer`/`design-system-manager` pick it up without re-deriving it.

The remaining conditions (R1–R5, R7) belong to Stages 6, 7, and 9 respectively and are listed in §7 as
downstream dependencies this Stage 2 item hands off, not requirements this document can satisfy itself.

## 4. Functional requirements

Supersedes Phase 1 FR-9 in full. Refines and finalizes the Stage-1 FR-18–FR-21 draft. New sub-items (lettered)
cover ground the Stage-1 draft left as open questions, now closed by the ratified design.

### FR-9 (superseded wording — finalized)

**FR-9 (final):** An agent can initiate a theft/loss report on behalf of a customer only through the OB-02
on-behalf-request-and-approval mechanism (FR-18–FR-21). There is no verification outcome an agent can assert
unilaterally that results in `callerVerified: true` or a created recovery case. This closes the "TBD Stage 2"
wording in the original FR-9 and resolves `OQ-010-2` for the theft-escalation path specifically — see §6 for
what `OQ-010-2` still leaves open beyond this flow, if anything.

**Acceptance criteria:**
- AC-9.1: No code path other than the approval step (FR-20) may ever set `support_case.callerVerified = true`
  for an on-behalf report. (Structural, verified at Stage 8/9 — this item records it as a product requirement
  so Stage 8 has a product-level acceptance criterion to test against, not only a security one.)
- AC-9.2: An agent cannot complete a theft/loss report on behalf of a customer by any means that does not
  pass through FR-18–FR-21 (e.g., no "mark as verified" checkbox, no supervisor override — see §2 out of
  scope).

### FR-18 (finalized): Agent raises an on-behalf report request

An agent, from an open `support_case`, can raise an on-behalf report request specifying: the `supportCaseId`,
the `assetId` (selected from the customer's registered assets as surfaced by the existing customer-lookup
result), the caller mode (`account_holder_unrecognised_channel` i.e. M-A, or `third_party_reporter` i.e.
M-B), and — M-B only — the reporter's relationship from the fixed enum (`spouse_partner | family |
employer_colleague | other`). No free-text reporter identity field exists in the UI.

**Acceptance criteria:**
- AC-18.1: The request cannot be raised unless the same preconditions the customer self-service path already
  enforces are met: case status is valid for escalation, the asset belongs to the case's account, the
  account's plan includes incident-management entitlement, and there is no existing open recovery case for
  that asset. If any precondition fails, the agent sees the specific reason (plan entitlement, duplicate
  case, etc.) — this is agent-facing operational information, not customer account disclosure, and is
  distinct from the no-disclosure rule in AC-18.3.
- AC-18.2: M-B mode requires a relationship selection before the request can be submitted; no free-text
  field is available to the agent for reporter identity (name, phone, ID number) anywhere in this flow.
  (Product resolves the plan-entitlement scripting question the Stage-1 draft raised as `OQ-010-5`: when the
  account's plan lacks incident-management entitlement, the agent's screen states this as the decline reason
  and the agent follows the existing standard decline-and-advise script used for self-service entitlement
  failures — no new upsell script is introduced by this item. If a future upsell flow is wanted, that is a
  separate roadmap item, not bundled into OB-02.)
- AC-18.3: Whether the request is raised against an account that exists, is a customer of ours, or owns the
  named asset is never revealed to the agent or caller beyond what the agent's own prior lookup already
  showed them (design §3.2). Raising the request does not expand what is disclosed.
- AC-18.4: A request is rejected if it would exceed the per-agent or per-account rate limits (design §5.3);
  the agent sees a generic "not available right now" outcome, not the specific limit that was hit.

### FR-19 (finalized): Account holder reviews and acts on the request in their own session

The request appears as a pending, explicit item inside the account holder's own authenticated session (mobile
app and/or web dashboard — see FR-21a), never through a link embedded in a push/email nudge.

**Acceptance criteria:**
- AC-19.1: The approval screen states, in plain language, the asset display name, the action being requested
  (reported stolen/lost), and that this may involve a security company. For M-B, it additionally states the
  caller-given relationship.
- AC-19.2: The screen offers exactly two outcomes: Approve, or "This wasn't me / I don't recognise this." No
  intermediate or deferred state is exposed to the customer beyond simply not acting (which expires per
  FR-22).
- AC-19.3: Any push or email nudge pointing to the pending item carries no approve link and no asset detail
  — approval only happens inside the authenticated session itself.
- AC-19.4: For M-A only, the screen displays a two-digit match-code selector; the agent reads a code aloud to
  the caller and the customer must select the matching code to proceed to approval. M-B has no match-code
  step (design §3.1 step 6).

### FR-20 (finalized): Approval creates the case; decline does not

On approval, the system re-validates the FR-18 preconditions, creates the recovery case through the same
repository path the customer self-service flow uses, updates the originating support case's escalation
fields, and records the verification outcome. On decline, no case is created.

**Acceptance criteria:**
- AC-20.1: Approval requires a fresh authentication factor at the moment of approval: step-up (if TOTP is
  enrolled) or password re-authentication (if not) — not merely an open session. See FR-20a for the
  resulting customer-facing attribution requirement.
- AC-20.2: If a precondition that was true at request time is no longer true at approval time (e.g. a
  duplicate case was opened in the interim), the approval fails safely: no case is created, and the customer
  sees a clear reason that does not imply any fault.
- AC-20.3: On decline, the agent's screen shows a neutral "not confirmed" outcome — indistinguishable from an
  expiry or lockout outcome (design §3.3) — and no case is created.
- AC-20.4: The agent is never shown the customer's authentication method, device, or any detail about why an
  approval or decline happened beyond the final neutral outcome.

### FR-20a (new, from condition C-010-4-Q1a / Q1d): Persistent in-app record and decline notice

Carries forward the compliance-mandated interim controls (§12.1 Q1a, Q1d) as product-facing requirements,
since this item ships before INC-001-C-8 (email delivery) clears and the Q1b out-of-band confirmation is
therefore not yet available.

**Acceptance criteria:**
- AC-20a.1: After an approved on-behalf report, the customer's case history shows a persistent, non-
  dismissable record: "Opened by TD IT call centre on your behalf — you approved this on [date]." A one-time
  toast or notification that disappears does not satisfy this.
- AC-20a.2: After a declined outcome, the account holder receives an in-app security notice at minimum
  (no dependency on email) informing them that an on-behalf report request for their account was declined —
  worded neutrally, consistent with design §12.3's "declined by account holder" framing, with no implication
  of fault on the agent or any third-party reporter.
- AC-20a.3: When email delivery (INC-001-C-8) clears, this item's backlog carries a **follow-up, not a new
  feature**, to add the out-of-band confirmation per condition C-010-4-Q1b — recorded here so it is not lost,
  consistent with the house rule against silently dropping a flagged gap.

### FR-21 (finalized): Escalation updates the originating support case

On approval and case creation, the originating `support_case` status moves to `escalated` (terminal for
support-case purposes) and its detail view shows a link to the resulting recovery-case reference.

**Acceptance criteria:**
- AC-21.1: The `support_case` record carries `callerVerified = true`, `callerVerificationMethod`, and
  `callerVerifiedAt`, set only through this path (see AC-9.1).
- AC-21.2: The customer-facing recovery-case view shows the attribution line from FR-20a; the security-
  operator-facing view does not show the originating agent identity or the on-behalf origin at all (design
  §6.3), consistent with the existing `originatingSupportCaseId` projection behavior.

### FR-21a (new, from condition C-010-4-R6): Web approval ships with mobile — no mobile-only MVP

**FR-21a:** The approval surface (FR-19) is available on **both** the mobile app and the web customer
dashboard (`/dashboard`) in this item's MVP scope. Neither surface is a fast-follow of the other.

**Acceptance criteria:**
- AC-21a.1: A customer who has no working mobile device (consistent with the M-A scenario where the mobile
  device itself is the stolen asset) can still approve or decline the request by logging into the web
  dashboard from any browser.
- AC-21a.2: Both surfaces present materially the same information (FR-19 AC-19.1) and the same two outcomes
  — no reduced-functionality version of the approval screen ships on either surface.
- AC-21a.3: **Documented workaround for the gap this closes:** independent of FR-21a, a customer who still
  has *any* working device with their own credentials can bypass the call centre entirely and self-report
  via the existing `POST /v1/recovery/cases` self-service flow already shipped in the mobile/web product.
  This is called out explicitly in agent scripting (owned by `technical-writer`/`ux-researcher` under
  C-010-1) as an option the agent can mention: "if you have any other way to log into your account right
  now, you can also report this directly yourself." This does not replace FR-21a; it is the existing
  self-service fallback, documented here so the product gap this item addresses is closed on two fronts
  (web approval surface, and reminding the customer of the self-service path), not left as a silent risk.

### FR-22 (new, from design §3.1 step 9 and §5.3): Expiry and request lifecycle

**FR-22:** An on-behalf request expires if not acted on: 10 minutes for M-A (caller is still on the line), 24
hours for M-B. An expired request cannot be revived — a new one must be raised and counts against rate
limits.

**Acceptance criteria:**
- AC-22.1: After expiry, the agent's screen shows the same neutral "not confirmed" outcome as a decline
  (AC-20.3).
- AC-22.2: Raising a new request after expiry is subject to the same per-account/per-agent rate limits
  (design §5.3) as any other request — expiry is not a way to bypass limits by repeated attempts.
- AC-22.3: The numeric values (10 minutes, 24 hours, rate-limit thresholds) are **starting values**, owned
  for final tuning by `security-engineer` at Stage 8 (design §5.3) — this item's acceptance criteria test
  that the mechanism exists and is configurable, not that these exact numbers are load-bearing product
  commitments.

### FR-23 (new, from design §7 and §12.3 item 6): Account holder unreachable

**FR-23:** If the account holder cannot be reached to approve or decline (for example, incapacitated, or in
M-B where the reporter has no way to prompt them), there is **no Tier 2 path**. The agent records a Tier 1
support case with `callerVerified: false` and refers the reporter to SAPS (South African Police Service).
No recovery case is created and no security-company dispatch happens.

**Acceptance criteria:**
- AC-23.1: The system does not offer the agent any mechanism to force-create a recovery case without an
  approved request, regardless of the reason given for the account holder's unavailability.
- AC-23.2: The agent-facing support case for this outcome is recorded as Tier 1, consistent with the existing
  C-010-2 verified-or-flagged behavior, not as a failed or pending Tier 2 case.

## 5. Non-functional requirements carried into this item

- NFR-OB2-1: Every state transition of the on-behalf request is audited per design §6 (`caller_verification`
  and `agent_on_behalf_report` Trail A event types) — a Stage 6/7/8 deliverable, not built by this document,
  but recorded here as an acceptance condition this item's QA (Stage 10) must verify against once built.
- NFR-OB2-2: Retention follows design §12.3/§5.4 as ratified (24 months from resolution for requests
  producing no case; life of the resulting case, inheriting the Feature 011 five-year floor, for approved
  requests) — subject to condition **C-010-4-R1**, which is an **open reconciliation** between this and the
  existing 12-month Trail A purge ceiling (ADR-0006 §14.2). This item's Stage 2 scope does not resolve R1; it
  is a Stage 6-exit blocker owned by `database-architect`/`compliance-specialist`, carried forward at §7.
- NFR-OB2-3: No location data is exposed to the agent or caller through this flow at any point (design §3.2) —
  this is a hard product constraint, not merely an implementation detail, because it is the control that
  directly defeats the T-1 threat this whole feature exists to close.
- NFR-OB2-4: POPIA — reporter (M-B) data collection is limited to the relationship enum only, no name, phone,
  or ID number, per the ratified compliance ruling (§12.3). This item's acceptance criteria (AC-18.2) enforce
  this at the UI level; it is not merely a backend validation concern.

## 6. Open questions this item closes, narrows, or still leaves open

- **OQ-010-2** (Phase 1, inherited): closed **for the theft-escalation path** by FR-9/FR-18–FR-21. Whether any
  *other* agent-attributed action (credential reset, policy change — Stage-1 candidate #5) needs its own
  Tier 2 mechanism is explicitly **not** addressed by this item; `product-manager` would need to commission a
  separate design if and when that candidate is prioritized.
- **OQ-010-5** (Stage-1 draft, plan-entitlement scripting): closed by AC-18.1 — standard existing decline
  script, no new upsell flow introduced here.
- **OQ-010-4** (individual vs. shared agent queue, supervisor role): **still open**, unaffected by this item.
  No break-glass/supervisor path exists in this item's scope (§2), and none is implied by closing OQ-010-4
  later — a supervisor override would need its own security design per design §4's ruling, not an automatic
  consequence of resolving the queue-model question.
- **Reporter access-request verification mechanics (§12.3 item 5, compliance counsel referral)**: not a
  product-planning question — tracked at `cto`/compliance level per ratification §13.3, not re-raised here.

## 7. Handoff — what this Stage 2 item requires from downstream stages

This item is **scoped and ready for Stage 3 (UX research) and parallel Stage 5 onward work**, per the entry
criteria met in the header. Downstream owners should treat the following as inherited, not re-derived:

| Condition / dependency | Owner | Stage |
|---|---|---|
| C-010-4-R1: retention/purge reconciliation (NFR-OB2-2) | `database-architect`, `compliance-specialist` | 6 |
| C-010-4-R2: single-use, race-safe approval | `backend-architect` | 7 |
| C-010-4-R3: cross-store write ordering | `backend-architect` | 7 |
| C-010-4-R4: `agent_on_behalf_report` attribution column fix | `backend-architect`, `database-architect` | 6/7 |
| C-010-4-R5: step-up bound to the specific request | `backend-architect`, `authentication-engineer` | 7 |
| C-010-4-R7: CI-2 prohibition rule built before merge | `devops-engineer`, `security-engineer` | 9 (PR gate) |
| C-010-4-R8: new UI through design-system sign-off | `ui-designer`, `design-system-manager` | 4 |
| FR-21a web+mobile parity | `frontend-architect`, `mobile-architect` | 5 onward |
| G-18 Client instruction, before first real customer PII on this flow | `cto` (obtain), `compliance-specialist` (draft) | gates real data, not Stage 2–8 |
| INC-001-C-8 / C-010-4-Q1b follow-up (FR-20a AC-20a.3) | tracked, platform-wide blocker | go-live |

## 8. Stage 2 exit — backlog item summary

- **Backlog item:** OB-02 — Tier 2 caller verification for report-on-behalf (reuses Feature 010, no new
  feature folder, per `cto`'s roadmap ruling cited in design header).
- **Scope:** FR-9 (final), FR-18–FR-23 above, finalized and closed against the Stage-1 draft and open
  questions.
- **Target milestone:** next Feature 010 Phase 2 delivery slot, sequenced behind Stage 5 Architecture Review
  (which must itself sequence behind Stage 3/4 UX/UI work for the two approval surfaces) — exact sprint
  assignment is `technical-project-manager`'s call at backlog grooming, not fixed in this document.
- **Explicitly not re-opened by this item:** the mechanism itself (design §3), the rejected alternatives
  (design §4), and the compliance sufficiency ruling (design §12) — all closed at ratification.

**Filed by:** `product-manager`, 2026-10-29.
