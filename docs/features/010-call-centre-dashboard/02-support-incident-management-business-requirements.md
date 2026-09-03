# Feature 010 (Phase 2) — Call Centre Customer Support & Incident Management

**Lifecycle stage:** 1 — Business Requirements
**Stage owner of record (A):** `business-analyst` per `docs/organization/02-feature-lifecycle.md` row 1 — this
document is produced by `product-manager` as the named Stage-1 contributor, at `cto` direction, to unblock
scoping while Release Gate A owner-side blockers (Resend confirmation, signing identity, device verification)
are outstanding and not competing for the same capacity. **This draft is not a substitute for
`business-analyst` sign-off** — it should be reviewed and formally accepted by `business-analyst` before Stage
2 (Product Planning) proceeds, consistent with the RACI (`01-raci-matrix.md`, "Business Rules" row: A =
`business-analyst`).
**Contributors:** `compliance-specialist` (POPIA review required before Stage 2 closes), `ux-researcher`
(journey maps before Stage 3), `backend-architect` / `database-architect` (data-model decision below is a
product-level call on entity boundaries, not a schema design — Stage 6 still owns the actual schema).
**Status:** Draft — Stage 1, scoping remaining Call Centre Dashboard contract scope (§5.2.4 Schedule A item D)
not covered by the existing `business-requirements.md` (Phase 1: Customer Lookup + recovery-case escalation
assistance, already partially implemented — see §1 below).
**Related documents:** `docs/features/010-call-centre-dashboard/business-requirements.md` (Phase 1 — do not
duplicate; this document assumes Phase 1's FR-1–FR-3 auth/RBAC/audit posture and FR-7–FR-10 recovery-case
escalation assistance as already-scoped baseline), `docs/organization/contract-tdit-2026-09-scope-summary.md`
§3.

---

## 0. What's already built vs. what's genuinely new (verified against code, 2026-09-03)

The prior Stage-1 pass (Phase 1 doc) undersold how much is already shipped. Re-verified directly against
`backend/src/routes/support-lookup.ts`, `src/call-centre/*`, `backend/src/repositories/recovery-cases.ts`,
`backend/src/routes/security-cases.ts`, `backend/src/routes/recovery.ts`, `backend/src/middleware/require-role.ts`.

**Already built (Phase 1, live in repo, not re-scoped here):**

- `support_agent` user type exists (`PRIVILEGED_USER_TYPES` in `backend/src/lib/policy.ts`) and is
  invitable via the same admin invitation flow as `security_company_operator` (`backend/src/routes/
  invitations.ts`).
- `GET /v1/customer-lookup` — purpose-limited search by email/phone/policy ID, returns policy/asset/
  subscription/open-recovery-case summary, audit-logged (`privileged_data_access`).
- `POST /v1/recovery-cases/:caseId/notes` — agent can append a timestamped, append-only "call-centre note"
  to an **existing** recovery case (`recovery_cases.callCentreNotes[]`). Surfaced in
  `src/call-centre/pages/CustomerLookupPage.tsx`.
- Web surface `src/call-centre/*` (routes, layout, auth gate reusing `DashboardAuthProvider` with
  `allowedUserType: 'support_agent'`) — single page (`lookup`) today.

**Not built — this is the genuinely new scope this document addresses:**

- **Any way for an agent to create a case** — theft-related or not. `POST /v1/recovery/cases` (customer
  theft-report creation) is hard-gated to `requireUserType('customer')` in `backend/src/routes/recovery.ts`.
  There is no agent-initiated case creation of any kind today, despite Phase 1's FR-9/FR-10 describing it as
  in scope. **This document supersedes Phase 1 FR-9/FR-10** — see §4.3 below for why "escalate" and "log a
  theft report on the customer's behalf" turn out to require different plumbing than Phase 1 assumed.
- **Any entity for non-theft support cases** (billing question, app bug, "how do I add an asset" — the
  large majority of expected inbound call volume). No `support_cases`, `tickets`, or equivalent collection
  exists anywhere in `backend/src/repositories/`. `recovery_cases` is the only case-like entity and it is
  theft/recovery-specific (see §1).
- **Any incident-management workflow primitives**: category, priority, assignment, status transitions
  beyond the theft-recovery lifecycle, resolution notes, closure. None exist for a general support case.
- A second page/section for the Call Centre Dashboard beyond `lookup` (case list, case detail, "new case"
  form).

---

## 1. Is a call-centre "incident" the same as a "recovery case"? — No. Different entity, by design.

This was the key open question flagged in the task brief. Verified answer, with reasoning:

`recovery_cases` (`backend/src/repositories/recovery-cases.ts`) is **not** a generic case/ticket model. Its
schema is theft/recovery-specific and asset-bound:

- Every row requires an `assetId` (`createForAccount(accountId, assetId, ...)`) — there is no way to open one
  without a registered asset.
- Status enum (`open | investigating | tracking | recovered | closed`) models a **physical recovery
  lifecycle**, not a general support resolution lifecycle. "Tracking" and "recovered" are meaningless for a
  billing question.
- It carries `lastLocation` / `lastLocationAt` (GPS fields) and `partnerOrganizationId` (security-company
  assignment) — fields a support case has no business populating.
- **Critically:** `GET /v1/security/cases` (`backend/src/routes/security-cases.ts`, `listForPartnerOrg`)
  surfaces **every unclaimed row with `status: 'open'`** to every security-company partner's dashboard. If a
  generic "customer can't log in" support case were stored in this same collection with a naive `status:
  'open'`, it would **leak into the Security Dashboard's unclaimed-case queue** — a real functional bug, not
  a hypothetical. This alone rules out reusing `recovery_cases` for non-theft support cases.

**Decision (product-manager, this document):** call-centre "incidents" for non-theft support matters are a
**genuinely different concept** — a general support case — and must live in a separate entity (proposed name:
`support_cases`, final naming is `database-architect`'s call at Stage 6). A `recovery_cases` row is created
only when: (a) a customer self-reports theft via mobile (existing, unchanged), or (b) an agent determines
**during or after handling a support case** that it is theft-related and creates/links a recovery case — at
which point both the `support_case` and the resulting `recovery_case` exist, linked by a reference id (see
§4.3). The two entities are never the same row.

This resolves Phase 1's **OQ-010-1** ("is call-centre note storage a new collection or an extension of
`recovery_cases`?") for the *support-case* half of the answer: yes, new collection, for reasons above. The
existing `callCentreNotes[]` field on `recovery_cases` (Phase 1, already shipped) remains correct as-is for
notes on an actual recovery case — that part of OQ-010-1 stays resolved as already implemented.

---

## 2. User roles in scope

| Role | New role needed? | Notes |
|---|---|---|
| **Call-centre agent** (`user_type = support_agent`) | **No** — already exists, already invitable via admin invitation flow. | Confirmed by reading `backend/src/lib/policy.ts` and `backend/src/routes/invitations.ts`. No new RBAC role required for this phase. |
| Call-centre supervisor/team-lead (assign/reassign cases, view team queue, override closure) | **Open question — see §6 OQ-010-4.** | Contract text (§5.2.4) references "assign" as an incident-management capability. Assignment presupposes someone can assign *other* agents' cases, which is a supervisory action `support_agent` as currently scoped may not need/warrant. Flagged, not resolved, here. |

No new user type is proposed for Phase 2 unless OQ-010-4 is resolved in favor of a supervisor tier.

---

## 3. Core workflows in scope

### 3.1 Agent receiving a call needs full context fast (context assembly)

This is largely **already met** by the Phase 1 `GET /v1/customer-lookup` endpoint (policy/asset/subscription/
open-recovery-case summary in one call). Genuinely new for Phase 2: the lookup response should also surface
**open support cases** for the customer (not just open recovery cases) so an agent sees "this customer called
about a billing issue on Tuesday, still open" before starting a new case. This is an additive field on the
existing lookup response, not a new endpoint.

- FR-11: `GET /v1/customer-lookup` response includes `openSupportCaseCount` and a summary list of open
  `support_cases` for the resolved account, mirroring the existing `openRecoveryCaseCount`/`recoveryCases`
  pattern.

### 3.2 Logging a new non-theft support case (billing question, app issue, etc.)

- FR-12: Agent can create a new support case against a looked-up customer account: category (enum — see
  FR-13), free-text description, channel (`phone` default for Phase 2 — email/chat channels are out of scope
  per §5), initial status `open`.
- FR-13: Category is a constrained enum for reporting/triage, not free text — proposed starter set: `billing`,
  `app_technical_issue`, `policy_question`, `asset_registration_help`, `account_access`, `other`. Final list
  owned by `product-manager` + `business-analyst` before Stage 2 closes (support-ticket-theme input from
  `manual-qa-engineer` should inform this once there's real call volume — for Phase 2 launch this is a
  best-guess starter set, not research-validated).
- FR-14: Agent can add follow-up notes to an existing support case (append-only, timestamped, agent-
  attributed) — same pattern as the existing `callCentreNotes[]` append on recovery cases.
- FR-15: Agent can update a support case's status: `open → in_progress → resolved → closed`, or `open →
  escalated` (see §3.3). Reopening a `closed` case is out of scope for Phase 2 — closed is terminal; a new
  case is opened for a recurrence, cross-referenced by note.
- FR-16: On `resolved`/`closed`, agent must record a resolution summary (required field, not optional) — this
  is the "resolution tracking" contract requirement (§5.2.4).
- FR-17: Support case detail view is reachable from the customer-lookup result (§3.1) and from a **new case
  list/queue view** (Phase 2's first genuinely new page beyond `lookup`) — filterable by status and category,
  scoped to cases the querying agent has visibility into per §6 OQ-010-4 (individual queue vs. shared team
  queue — open question, affects whether FR-17's list is "my cases" or "all agents' cases").

### 3.3 Escalating a case to security when it turns out to be theft-related

Verified: **no escalation plumbing exists today.** Phase 1's FR-10 ("flag a case for security-partner pickup")
assumed an existing `recovery_cases` row to flag — but per §1, a support case that turns out to be theft-
related is not a `recovery_cases` row yet. The real workflow is case *creation*, not case *flagging*:

- FR-18: From an open `support_case`, agent can trigger "escalate to theft/recovery" — this requires
  **selecting the affected asset** from the customer's registered assets (same `assetId` requirement
  `recovery_cases` already enforces) and running the same plan-entitlement check the customer-initiated path
  uses today (`assertPlanEntitlement(ctx, accountId, 'incidentManagement')` in `backend/src/routes/
  recovery.ts`) — **an agent cannot create a recovery case for a customer whose plan tier doesn't include
  incident management**, same business rule as self-service. This needs explicit product sign-off: does an
  agent see/explain "your plan doesn't include incident management" to the customer, and if so what's the
  scripted next step (upsell? decline)? Flagged as **OQ-010-5**.
- FR-19: Escalation creates a new `recovery_cases` row (via the same repository method the customer path
  uses, `createForAccount`, with `partnerOrganizationId: null` so it lands in the existing unclaimed queue
  Security Dashboard already polls — **no new Security Dashboard-side code needed**, confirmed by reading
  `listForPartnerOrg`'s existing `$or: [{ partnerOrganizationId }, { partnerOrganizationId: null, status:
  'open' }]` query) and links back to the originating `support_case` via a stored reference id in both
  directions.
- FR-20: On escalation, the originating `support_case` status moves to `escalated` (terminal for support-case
  purposes — further status lives on the `recovery_cases` row from that point forward) and the support case
  detail view shows a link to the resulting recovery case reference number.
- FR-21: Escalation requires the same customer-verification step Phase 1 flagged as **OQ-010-2** (unresolved
  — voice match / OTP / other) before an agent can create a case attributed to the customer without the
  customer initiating it themselves in the app. **This document does not resolve OQ-010-2; it inherits it as
  a blocking dependency for FR-18–FR-21**, not just Phase 1's original FR-9.

### 3.4 Incident categorisation / assignment / status tracking (contract §5.2.4 explicit items)

Covered by FR-13 (categorise), FR-15/FR-16 (status/resolution tracking), FR-18–FR-20 (escalate). **Assignment**
(explicitly named in the contract) is not yet addressed pending OQ-010-4 (individual vs. team queue model) —
flagged, not designed, here.

---

## 4. Non-functional requirements

- NFR-4: Same audit-logging posture as Phase 1 (`privileged_data_access` event type, ADR-0006 Trail A) applies
  to every support-case read/write, not just recovery-case-linked ones.
- NFR-5: POPIA — a support case will often contain free-text description fields (FR-12) that could capture
  PII/health-adjacent or financial detail incidentally (e.g. a billing dispute mentioning banking detail).
  **`compliance-specialist` must review before Stage 2 closes** whether free-text fields need masking
  guidance, retention limits distinct from `recovery_cases`, or purpose-limitation copy in the agent UI
  (contrast Phase 1 NFR-2's existing purpose-limited access posture, which this should extend, not restate).
- NFR-6: Desktop-only (1280×800 minimum), same as Phase 1 NFR-1 — tablet is Security Dashboard scope per
  contract §4, not this surface.

---

## 5. Explicit out of scope (Phase 2)

- Email/chat/social support channels — phone-only for this phase, consistent with "call centre."
- SLA timers, auto-escalation, or breach alerting on support-case age (no SLA is contractually funded per
  `contract-tdit-2026-09-scope-summary.md` §7 — do not build implied SLA enforcement without a separate
  commercial conversation).
- Reopening closed cases (see FR-15).
- Supervisor/team-lead role and cross-agent assignment (OQ-010-4, unresolved).
- CTI/dialler integration, call recording — unchanged from Phase 1's out-of-scope list.
- AI-suggested categorisation or response drafting (`ai-solutions-architect` future track, unchanged from
  Phase 1).

---

## 6. Open questions requiring a decision before Stage 2 proceeds

1. **OQ-010-2 (inherited from Phase 1, now also blocking §3.3):** What customer verification is required
   before an agent can create/escalate a case attributed to the customer without customer-initiated action in
   the app? Needs `compliance-specialist` + `cybersecurity-architect` input, not just product judgment —
   flagging for `cto` to route. Elevated priority here: without this, FR-18/FR-21 (the theft-escalation path,
   arguably the single most business-critical call-centre workflow) cannot proceed past Stage 1.
2. **OQ-010-4 (new):** Individual agent queue vs. shared team queue for support cases, and whether a
   supervisor/team-lead role is needed for assignment (contract §5.2.4 explicitly names "assign" as a
   required capability). Affects FR-17 scope and whether §2's "no new role needed" conclusion holds.
   Needs `technical-project-manager`/`cto` input on expected call-centre team size/structure — a genuinely
   business-side input this document cannot resolve alone.
3. **OQ-010-5 (new):** Scripted agent behavior when a customer's plan tier doesn't include `incidentManagement`
   entitlement during an escalation attempt (FR-18). Product/business-rules call — `business-analyst` +
   `product-manager` joint, informed by whatever the existing self-service customer-facing copy says for the
   same gate (needs to be checked in `mobile/app/` before Stage 3 UX work starts, not assumed consistent).
4. **Category taxonomy (FR-13) is a best-guess starter set**, not research-validated. Low risk to proceed to
   Stage 2 with it, but flag to `ux-researcher`/`business-analyst` for revision once real call volume exists
   (Stage 15 Continuous Improvement candidate, not a Stage-1 blocker).
5. **Formal `business-analyst` acceptance of this document** — per the header note, this was produced by
   `product-manager` at `cto` direction to unblock scoping in parallel with stalled Release Gate A owner
   actions, but Stage 1's accountable owner is `business-analyst` per RACI. This should not proceed to Stage 2
   without `business-analyst` review/sign-off, even though the triggering blockers (Resend, signing identity,
   device verification) are unrelated to this surface.

---

## 7. Dependencies (additive to Phase 1's §5 table)

| Dependency | Owner | Blocks |
|---|---|---|
| `business-analyst` sign-off on this document | `business-analyst` | Stage 2 start |
| OQ-010-2 resolution (customer verification for agent-attributed case creation) | `compliance-specialist` / `cybersecurity-architect`, routed by `cto` | FR-18–FR-21 |
| OQ-010-4 resolution (queue/assignment model) | `cto` / `technical-project-manager` | FR-17 scope, §2 role conclusion |
| OQ-010-5 resolution (entitlement-gate script) | `business-analyst` / `product-manager` | FR-18 |
| New `support_cases` Mongo collection design | `database-architect` | All of §3.2/§3.3 (Stage 6, not this stage) |
| Compliance review of free-text field handling (NFR-5) | `compliance-specialist` | Stage 2 close |

---

**Next lifecycle step:** `business-analyst` review/acceptance of this document → `product-manager` resolves or
routes OQ-010-2/4/5 → Stage 2 (Product Planning, backlog slotting against Release Gate A capacity plan) →
`ux-researcher` journey map for both "new support case" and "escalate to theft" flows.
