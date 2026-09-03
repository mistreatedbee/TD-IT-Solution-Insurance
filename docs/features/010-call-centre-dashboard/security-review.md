# Feature 010 (Phase 2) — Security Review (Stage 8)

**Status:** **CONDITIONAL SIGN-OFF, WITH ONE ENDPOINT VARIANT WITHHELD.**

- **FR-11, FR-12, FR-14, FR-15, FR-16 — CONDITIONAL SIGN-OFF** (required changes SR-010-1 … SR-010-7).
  Stage 9 may begin.
- **FR-17 — CONDITIONAL SIGN-OFF for `GET /v1/support-cases?scope=mine` only.
  `scope=all` is WITHHELD** — see §2. It is not cleared for implementation in any form.
- **FR-18 – FR-21 — out of scope for this review and remain BLOCKED at Stage 1** (C-010-4). Nothing in this
  document lifts that. §6.

**Date:** 2026-09-03
**Lifecycle stage:** 8 — Security Review (hard gate). **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate status — INCOMPLETE:** `security-engineer` (R) concurrence **not given** ·
`compliance-specialist` (C) has issued a part-clearance
([`compliance-review-agent-attributed-actions.md`](./compliance-review-agent-attributed-actions.md)) which states
at §8 that it **does not discharge Stage 8**. This document is one of three required signatures.

**Scope of this gate:**
- `GET /v1/customer-lookup` FR-11 response addendum (`openSupportCaseCount`, `supportCases[]`)
- New router `support-cases.ts`: `POST /v1/support-cases`, `GET /v1/support-cases`,
  `GET /v1/support-cases/:caseId`, `POST /v1/support-cases/:caseId/notes`,
  `PATCH /v1/support-cases/:caseId/status`
- New `support_cases` collection; `recovery_cases.originatingSupportCaseId` addendum
- The `support_cases` → Security Dashboard leakage argument (`03-architecture-review-phase2.md` §2)
- New Call Centre Dashboard web pages implied by FR-17

**Running code read (2026-09-03):** `backend/src/routes/support-lookup.ts` ·
`backend/src/routes/security-cases.ts` · `backend/src/repositories/recovery-cases.ts` ·
`src/call-centre/CallCentreRoutes.tsx`, `src/call-centre/pages/CustomerLookupPage.tsx` ·
`docs/organization/gates/stage8-manifest.json` · `scripts/verify-stage8-manifest.mjs` · `.github/workflows/ci.yml`.

---

## 0. Verdict

**CONDITIONAL, with `scope=all` withheld.** The entity-boundary decision is correct and I confirm it against the
code. The `accountId` exception is legitimate and was correctly flagged for this gate rather than smuggled
through. But the contract as written has two real problems that the design chain's own upstream documents
already forbid, and neither is caught by any downstream stage:

- **SR-010-2 (withheld scope) — `GET /v1/support-cases?scope=all` is the bulk customer-data listing that this
  feature's own Phase 1 NFR-2 exists to prohibit**, and its list projection carries the full 2000-character
  free-text `description` that C-010-3 and C-011-1 identify as the most likely home for card numbers and named
  suspects. §2.
- **SR-010-1 — the agent-on-behalf write path has no contracted audit event.** NFR-4 (Stage 1) requires ADR-0006
  Trail A logging on every support-case read and write. By Stage 7 that requirement has silently disappeared:
  `api-design.md` §4's authorization table has no audit row, and §3 mentions audit only for the pre-existing
  `customer-lookup` handler. The one endpoint on this platform where a privileged operator writes a record
  attributed to a customer they may never have looked up would ship with no audit trail. §1.

What is right, and is the reason this is conditional rather than blocked: the surface is agent-only end to end
(`requireUserType('support_agent')` on every route, no `customer` or `security_company_operator` reachability),
`callerVerified` is correctly a first-class field defaulting to `false` with no code path able to set it true,
and the escalation endpoint is contracted-but-excluded from the machine-readable OpenAPI document — a
deliberate, effective choice I endorse in §6.

---

## 1. SR-010-1 (Required, blocks real customer data) — the `accountId` exception, and what its three "mitigating controls" actually mitigate

**The exception itself is approved.** `POST /v1/support-cases` takes `accountId` in the request body. This is a
real, named divergence from `004-policy-asset-management/api-design.md` §4.2's platform rule, it is intrinsic to
agent-on-behalf-of-customer creation, and `03-architecture-review-phase2.md` §5.2 and `api-design.md` §2.2 were
right to surface it for this gate instead of letting `security-engineer` discover it as an apparent regression.
**SC-API-02 is answered: intentional, not a regression.**

**The three stated controls are enforceable — and they are not authorization controls.** Assessed one by one:

| Control | Enforceable at Stage 9? | What it actually does |
|---|---|---|
| `accountId` must resolve via `ctx.accounts.findById` → 404 | **Yes.** The method exists and is used this way today (`support-lookup.ts:99`) | Integrity: the case attaches to a real row |
| Resolved account's `userType` must be `customer` → 404 | **Yes.** `account.userType` is available at the same call site (`support-lookup.ts:100`) | Integrity: no case "against" an admin or partner account. Also correctly preserves the uniform-404 posture compliance §3 requires |
| `createdByAgentAccountId` from `req.auth!.accountId`, never the body | **Yes.** Trivially enforceable, matches every existing route | Attribution: the write is traceable *if anyone is looking* |

All three are enforceable. **None of them constrains which customer an agent may act on.** Nothing requires that a
`GET /v1/customer-lookup` preceded the create; `api-design.md` §2.2's "resolved by the agent from a prior
`GET /v1/customer-lookup` call" describes an expected workflow, not an enforced precondition. An agent holding a
list of account UUIDs can create, annotate, and status-manage cases against arbitrary customers without ever
touching the lookup surface — and, per NFR-4's disappearance, without leaving a trail.

This matters more here than it would elsewhere for two reasons specific to this platform. First, `support_agent`
is a **third-party-adjacent operator persona** and my standing assumption is that this surface will eventually be
operated by a compromised or malicious insider. Second, once C-010-4 clears, this same `accountId` becomes the
pivot into `POST /support-cases/:caseId/escalate`, which dispatches a security company against a customer's
asset. The write path being audit-blind today is what makes that future path unreviewable.

**Required:**

1. **SR-010-1a — contract an audit event on every `support-cases` write and on `GET /v1/support-cases/:caseId`**,
   recording the **subject `accountId`** (not only the actor), per ADR-0006 Trail A, matching
   `support-lookup.ts:122-130`'s existing shape. Reinstates NFR-4, which the Stage 7 contract dropped.
2. **SR-010-1b — audit `GET /v1/support-cases` list calls** with the filter set and the result count. A list
   endpoint over other people's records is exactly the surface where "which records did this agent see" must be
   answerable.
3. **SR-010-1c — `POST /support-cases` must be detectable when it is not preceded by a lookup.** The cheapest
   sufficient form is the audit trail in SR-010-1a: with a subject-`accountId` audit event on both surfaces,
   "agent created cases against accounts they never looked up" becomes a query. I am **not** mandating a
   server-side session binding between lookup and create — it would be brittle and agents legitimately work from
   a case list. Detection, not prevention, is the proportionate control here. `security-engineer` to add this to
   the insider-threat detection set alongside compliance §3 Tier 2 requirement 7.

**Noted, not required:** the `404` distinction between "UUID resolves to a customer" and everything else is a
weak existence oracle. UUIDs are not enumerable and agents are authenticated; accepted as residual (RR-010-3).

---

## 2. SR-010-2 (WITHHELD) — `GET /v1/support-cases?scope=all` is the bulk-disclosure surface this feature forbids itself

Phase 1 **NFR-2**, ratified in this feature's own Stage 1 document:

> "POPIA: purpose-limited access — agents see only records they searched for, **not bulk customer lists**
> (contrast with admin unfiltered list endpoints; C-14 posture)."

`api-design.md` §8 contracts `GET /v1/support-cases` with `scope` (`mine`|`all`) required and `status`,
`category`, `accountId` all **optional**. `scope=all` with no other filter returns a cursor-paginated,
200-per-page listing of every support case on the platform. Each `SupportCaseSummary` carries `accountId` and —
per §2.5's explicit ruling that "`description` truncation is not applied" — the **full 2000-character free-text
description**.

That is a bulk customer list, it is the C-14 posture NFR-2 names as the thing not to do, and the field it
bulk-discloses is the exact field that:

- C-010-3 identifies as the sharpest risk this feature carries, where "it is foreseeable that an agent will type
  a card number or full bank details" — **and where the platform's nil PCI-DSS scope is the asset being
  protected**;
- C-011-1 identifies as an unmanaged store of s26(b) special personal information about named third parties;
- `database-design.md` §4.2 deliberately refuses to index, and `03-architecture-review-phase2.md` §6.4
  deliberately refuses to export, **on exactly these grounds**.

A paginated list endpoint that returns the field in bulk to any agent is functionally an export. §6.4's
blast-radius control is defeated by §2.5's projection ruling, in the same design chain, and neither document
sees the other.

**Ruling: `scope=all` is WITHHELD.** It is not cleared for implementation. `scope=mine` is cleared (an agent
listing cases they themselves created is the purpose-limited read NFR-2 contemplates).

**What would let me clear `scope=all`:** all three, jointly —
1. `description` removed from `SupportCaseSummary` entirely. Detail-only, matching Feature 004's list/detail
   asymmetry which `api-design.md` §2.5 cites but then declines to apply to the one field where it matters most.
2. `scope=all` requires at least one narrowing filter (`accountId`, or `status`+`category`), so it cannot be a
   bare "give me everything."
3. OQ-010-4 resolved — a shared-team-queue model with a supervisor tier, or an explicit `cto` ruling that all
   agents legitimately share one queue. Today no such business decision exists, so `scope=all` grants an access
   scope nobody has authorised.

Until then, `api-design.md` §2.1's "required, no default" ruling is fine as far as it goes but should be
implemented as **`scope` required, `mine` the only accepted value**, with `all` returning `400`. That keeps the
contract non-breaking when OQ-010-4 lands, exactly as §2.1 intends.

---

## 3. SR-010-3 (Required) — C-010-2's second limb has no enforcement point anywhere in this design

C-010-2 requires that an unverified case "(ii) **blocks escalation and blocks disclosure of any account detail
back to the caller**."

- **Escalation limb: satisfied by construction, and well done.** `callerVerified` is a dedicated boolean, not a
  status value (`03-architecture-review-phase2.md` §3.1 — I concur with that reasoning), defaults `false`, and
  the only reader is the escalate endpoint, which cannot ship. Verified: no code path in the cleared scope sets
  it `true`. Correct.
- **Disclosure limb: unenforced, and the design says so without saying so.** §3.2 argues no enforcement is
  needed because "support-case detail reads return only the support case's own data, not a reach-back into
  policy/asset detail." That is true of `support-cases.ts` — and irrelevant, because **`GET /v1/customer-lookup`
  is the disclosure surface**, it is already shipped, it returns policies, the full asset list, plan detail,
  open recovery cases and call-centre notes, and it is gated on nothing but `requireUserType('support_agent')`.
  Verified in `support-lookup.ts:59-169`.

So C-010-2's disclosure limb collapses entirely into C-010-1, which is not met (§4). Nothing in the cleared
scope makes it worse, and nothing in the cleared scope makes it better.

**Required:** the Stage 9 diff must not imply otherwise. Specifically, `callerVerified: false` must be rendered
prominently on every agent surface that shows a case, and the FR-11 addendum's `supportCases[].callerVerified`
field (which `api-design.md` §3 correctly includes) must be surfaced in the lookup UI, not just carried in the
payload. Beyond that, C-010-2's disclosure limb is `frontend-engineer`/`ux-researcher` work under C-010-1 and is
not dischargeable by this feature's backend.

---

## 4. SR-010-4 (Required, standing) — the shipped stopgap banner is not a security control, and its wording is wrong

The task asks whether the design docs correctly treat the stopgap as soft. **They do.** I checked every mention:
`03-architecture-review-phase2.md` §1 lists C-010-1 as *deferred*, §6.1 addresses only a possible additive audit
field, and `api-design.md` never claims it. No document in either design chain asserts C-010-1 as met.
`011/architecture-review.md` §4 goes further and uses C-010-1's *unmet* status as a reason to keep police-report
fields off `GET /customer-lookup`. That is the correct posture and I am ratifying it.

**But the shipped artefact has a defect that must not be carried forward.**
`src/call-centre/pages/CustomerLookupPage.tsx:254-257` renders:

> "Confirm the caller's identity (e.g. **full name and registered phone number**, or 2+ identifying account
> details) before disclosing any information below."

`registered phone number` is one of the three query keys of `GET /v1/customer-lookup` itself
(`lookupQuerySchema`, `support-lookup.ts:22-30`). Compliance §2's table rules on this directly: "Account email /
phone / policy number … These are *lookup keys*, not secrets. **Anything an agent can search by is something a
caller can be expected to know.**" The banner therefore instructs agents to authenticate callers with the
precise identifiers the governing ruling prohibits as authenticators. Separately, the note placeholder at
`:92` ("Customer verified on call — …") invites an agent self-attestation, which compliance §3 Tier 2
requirement 2 calls "a log of an agent's claim, not a verification."

Structurally, the banner also renders *after* the lookup has already executed, returned, been audit-logged as
`privileged_data_access`, and painted the data on screen. It is a display-time reminder over data already
disclosed to the workstation. It is a reasonable interim nudge; it is not a control, and no Stage 9 work may
cite it as C-010-1 satisfaction.

**Required:** when C-010-1 lands, `technical-writer` + `ux-researcher` must produce the script from compliance
§3's negative-requirements list, and the current wording and placeholder must be replaced, with copy approved by
`compliance-specialist`. Recorded as **SR-010-4**; C-010-1 remains open and continues to block real customer PII
on a call-centre workstation independently of this gate.

---

## 5. Confirmed against the code, no change required

- **`support_cases` as a separate collection (`03-architecture-review-phase2.md` §2) — leakage argument
  confirmed, not merely accepted.** Verified `listForPartnerOrg` (`recovery-cases.ts:161-182`): the query is
  `$or: [{ partnerOrganizationId }, { partnerOrganizationId: null, status: 'open' }]` with no type discriminator
  and no `assetId`-presence check, running against `db.collection('recovery_cases')` (`:112-113`) and nothing
  else. A support ticket inserted into that collection with `status: 'open'` **would** surface on every
  partner's unclaimed queue. The separate collection makes that structurally impossible. This is a genuine
  exclusion-by-construction — the collection name is the boundary, not a field allowlist — and it is a stronger
  guarantee than Feature 011's serializer-level equivalent (see that review's SR-011-1). **Task item 5(c) from
  `03-architecture-review-phase2.md` §8 is answered: the argument holds under code review.**
- **`recovery_cases.originatingSupportCaseId` excluded from `serializeSecurityRecoveryCase`
  (`database-design.md` §5).** Confirmed as the right call. An operator has no recovery-mandate need to know a
  case originated by phone rather than self-report, and the field would let them infer the existence of an
  internal support workflow. Exclusion costs nothing. **It is covered by Feature 011's SR-011-1a repository
  projection** — add it to the same projection list rather than building a second mechanism.
- **`caller_verification` audit event taxonomy (SC-API-04).** Ruled: **yes, a distinct event type**, not a
  `privileged_data_access` variant. Compliance §3 Tier 2 requirement 4 is right that conflating a read with an
  identity assertion destroys both signals. The event must carry method, outcome, timestamp, actor account id
  and channel identifier, and **never** the challenge material. This ruling is recorded now so the C-010-4
  design has a fixed target; it does not authorise the endpoint that would emit it.
- **C-010-3 (PCI scope), partially confirmable now.** No full-text or `description` index exists in
  `database-design.md` §3; §4.2 rules one out explicitly; no export pipeline reads a collection that does not
  yet exist. Those limbs I confirm. **The limb I cannot confirm is §2's list projection** — see SR-010-2.
  C-010-3's Stage 8 confirmation is granted **conditional on SR-010-2**, and becomes a standing obligation on
  any future analytics/reporting consumer (`/events`, `/dau`).
- **Idempotency (`api-design.md` §2.3).** Accepted. `POST /support-cases` requires `Idempotency-Key`; notes and
  status do not; the status endpoint's retry failing `409` on the transition graph is an honest outcome. No
  concern.
- **`PATCH /status` excluding `'escalated'` from its accepted enum.** Correct and load-bearing — it keeps the
  only path to a side-effect-carrying status behind the blocked endpoint. Must be enforced at the Zod schema,
  not only documented.

---

## 6. FR-18 – FR-21: out of review scope, and the exclusion mechanism assessed

FR-18–21 were not reviewed and are **not** cleared. They remain blocked at Stage 1 on C-010-4, and
independently on INC-001-C-8 for the out-of-band notification step. **C-010-4 is my deliverable and this
document does not produce it.**

The task asks whether omission from the OpenAPI `paths` block is sufficient, given the design documents the
escalation logic in prose. **Assessment: sufficient as far as it goes, and not sufficient on its own.**

- **What works.** `api-design.md` §7's closing paragraph — "No path, schema, or route is registered in the
  OpenAPI document below … there is nothing here a codegen tool or an engineer skimming the OpenAPI file could
  accidentally scaffold" — is correct and is a genuinely good instance of making a class of mistake
  structurally harder. The `info.description` warning in §8 reinforces it. Declining to add `CALLER_NOT_VERIFIED`
  to `errors.ts` (SC-API-03) is the same discipline applied to a second artefact: an unused error code in a
  catalogue is an invitation.
- **The real residual risk is not codegen. It is copy-paste.** §7 specifies the escalate endpoint's
  preconditions and effects in enough operational detail — exact repository calls (`createForAccount(accountId,
  assetId, notes=null, partnerOrganizationId=null)`), exact entitlement gate (`assertPlanEntitlement`), exact
  duplicate-guard reuse — that an engineer implementing FR-12–17 in the same router has a working
  implementation recipe sitting in the same document, one heading below the code they are writing. Six numbered
  effect steps. The two guardrails that would stop it (`callerVerified === true` and the `CALLER_NOT_VERIFIED`
  error code) are the two things §7 says must **not** be built yet — so a well-meaning implementation of the
  escalation path would omit precisely its own safety gate. Steps 4–6 (verification record, distinct audit
  event, out-of-band notification) are all specified as "shape TBD" or "blocked," so they would be no-ops.
- **Required (SR-010-5), three mechanical guardrails, since prose has already failed once on this project:**
  1. **CI-2 prohibition rule.** Add to `docs/organization/gates/prohibitions.yaml` (INC-001 §6 CI-2):
     `forbid_route_pattern: support-cases/:caseId/escalate` and `forbid_symbol: escalatedToRecoveryCaseId` as a
     *write* target outside the repository's own schema definition, each citing C-010-4. Lifting the block then
     requires editing a rule file, which is a reviewable act with an author. This is the control INC-001 §4.1
     identified as missing when ADR-0009 §14's imperative prohibition stopped nothing.
  2. **No manifest entry for the escalate path**, and no `waived:` entry either. It must fail CI-1 the moment it
     appears.
  3. **A test asserting `POST /v1/support-cases/:caseId/escalate` returns 404** (route not registered) for the
     duration of the block — a CI-3-style executable negative assertion, so "not implemented" keeps verifying
     itself instead of being a sentence someone wrote in September 2026.

---

## 7. SR-010-6 (Required) — Stage 8 manifest coverage, and the web-surface blind spot

Checked against `stage8-manifest.json` and `scripts/verify-stage8-manifest.mjs` (CI at
`.github/workflows/ci.yml:82`).

- **Backend: CI-1 will correctly fail.** No manifest pattern covers `/support-cases`. Stage 9 must add entries
  pointing at **this** document, with the cleared scope stated (`scope=mine` only) — not a blanket
  `/support-cases*` group waiver, which would re-absorb the withheld variant.
- **Web: CI-1 will not notice at all, and this is the sharper problem.** FR-17 adds a case list/queue page, a
  case detail page and a "new case" form to `src/call-centre/*` — a third page beyond today's
  `CustomerLookupPage.tsx`. `verify-stage8-manifest.mjs` discovers `backend/src/routes/` and `mobile/app/` only.
  It never reads `src/`. INC-001 §6's CI-1 specification explicitly includes "every route in
  `src/*/Routes.tsx`"; the implementation dropped it. **The Call Centre, Admin and Security Company dashboards —
  every privileged web operator surface on this platform — are entirely outside the control that exists to stop
  ungated surfaces reaching a client build.** Feature 010 is the first feature to add web operator pages since
  CI-1 landed, so it is the feature that surfaces the defect.

**Required:** `scripts/verify-stage8-manifest.mjs` must discover `src/**/*Routes.tsx` before Feature 010's web
pages merge, and the manifest must gain entries for the existing `src/call-centre/*`, `src/admin/*` and
`src/security/*` surfaces (waived where appropriate, with named owners) so the extension does not land on a
red build. Owner `devops-engineer` + this role. Filed platform-wide as **SH-1a**, cross-referenced in
[`011-saps-case-reporting/security-review.md`](../011-saps-case-reporting/security-review.md) §6 together with
**SH-1b** (catch-all/waived absorption), **SH-1c** (CI-1 is a route-existence check, not a data-exposure check —
directly relevant here, since FR-11's addendum widens an already-manifested route's response and CI-1 cannot
see it) and **SH-1d** (manifest feature-number collision on `011`).

---

## 8. Residual risk, explicitly accepted

| # | Residual risk | Accepted by | Basis |
|---|---|---|---|
| RR-010-1 | Any `support_agent` can read and annotate any support case by id; there is no per-agent record ownership. Mirrors the already-shipped `POST /recovery-cases/:caseId/notes`, which takes no `accountId` predicate (`appendCallCentreNote`, `recovery-cases.ts:240-260`) and can append to any recovery case by id. | `cybersecurity-architect` (this document) | Proportionate to the role: a call-centre agent must be able to pick up any customer's call. Made **detectable** rather than prevented, by SR-010-1a/b. Revisit if OQ-010-4 resolves toward per-agent ownership |
| RR-010-2 | `description` and `notes.text` remain unbounded free text that will foreseeably capture card/bank detail (C-010-3) and third-party suspect data (C-011-1). UI guidance only; no technical control exists. | `compliance-specialist` (C-010-3, C-011-1 open) | Masking is the wrong control per compliance §5. SR-010-2 removes the bulk-exposure amplifier, which is the part that is in my authority |
| RR-010-3 | `POST /support-cases` weakly distinguishes "this UUID is a customer account." | `cybersecurity-architect` | UUIDs are not enumerable; caller is authenticated and audited under SR-010-1a |

No risk in this feature is accepted silently. If `cto` elects to ship `scope=all` over §2, that dissent will be
recorded here in full.

---

## 9. Conditions register — Feature 010 Phase 2 Stage 8

| ID | Condition | Owner | Blocks |
|---|---|---|---|
| **SR-010-1** | Audit events (ADR-0006 Trail A) on every `support-cases` write, on case detail reads, and on list calls — recording the **subject** `accountId`, not only the actor. Reinstates NFR-4. Plus insider-threat detection for creates unpreceded by a lookup | `backend-architect` (contract) + `backend-engineer`; verified `security-engineer` | Real customer data |
| **SR-010-2** | **`scope=all` WITHHELD.** Implement `scope` as required with `mine` the only accepted value. Clearing requires: `description` removed from `SupportCaseSummary`, a mandatory narrowing filter, and OQ-010-4 resolved | `backend-architect` + `cto` (OQ-010-4) | FR-17 `scope=all`; re-review by this role required to lift |
| **SR-010-3** | `callerVerified: false` surfaced prominently on every agent surface rendering a case, including the FR-11 lookup addendum | `frontend-engineer` + `ui-designer` | Stage 9 exit |
| **SR-010-4** | Replace the `CustomerLookupPage` verification banner and note placeholder — current wording names prohibited authenticators (registered phone) and invites agent self-attestation. Copy approved by `compliance-specialist` under C-010-1 | `technical-writer` + `ux-researcher` + `frontend-engineer` | Real customer PII on a workstation (with C-010-1) |
| **SR-010-5** | FR-18–21 mechanical guardrails: CI-2 prohibition rule, no manifest entry, executable 404 assertion | `devops-engineer` + `backend-engineer` | Merge of the Stage 9 diff |
| **SR-010-6** | CI-1 extended to discover `src/**/*Routes.tsx`; manifest entries for `src/call-centre/*` (and existing `src/admin/*`, `src/security/*`); explicit `/support-cases` backend entries scoped to the cleared variant | `devops-engineer` + `cybersecurity-architect` | Merge of any Feature 010 web page |
| **SR-010-7** | `security-engineer` and `compliance-specialist` Stage 8 concurrence recorded in this document | `security-engineer`, `compliance-specialist` | **Gate discharge** — this document alone does not clear Stage 8 |

**Rulings issued for downstream use (not clearances):** SC-API-02 answered (§1) · SC-API-04 answered (§5,
`caller_verification` as a distinct event type) · `originatingSupportCaseId` serializer exclusion confirmed (§5).

**Unchanged and not released by this review:** C-010-1 · C-010-4 (FR-18–21, Phase 1 FR-9) · C-010-5/-6 (RoPA,
CT-4) · C-010-7 (voice biometrics prohibited — standing, and I add the concurring technical ground that a
biometric authenticator over a telephone channel is trivially replayable) · INC-001-C-8 · Release Gate A
criterion 6 (unsigned) · `business-analyst` acceptance of the Phase 2 requirements document · OQ-010-4 ·
Stage 10 QA.

**Filed by:** `cybersecurity-architect` (chair), 2026-09-03.
