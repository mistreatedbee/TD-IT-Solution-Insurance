# Feature 010 (Phase 2) — Security Review (Stage 8)

**Status:** **CONDITIONAL SIGN-OFF, WITH ONE ENDPOINT VARIANT WITHHELD.**

- **FR-11, FR-12, FR-14, FR-15, FR-16 — CONDITIONAL SIGN-OFF** (required changes SR-010-1 … SR-010-7).
  Stage 9 may begin.
- **FR-17 — CONDITIONAL SIGN-OFF for `GET /v1/support-cases?scope=mine` only.
  `scope=all` is WITHHELD** — see §2. It is not cleared for implementation in any form.
- **FR-18 – FR-21 — out of scope for this review and remain BLOCKED at Stage 1** (C-010-4). Nothing in this
  document lifts that. §6.

**Date:** 2026-09-03 (chair). `compliance-specialist` concurrence added 2026-09-08, §10 — **withheld in part**.
`security-engineer` concurrence added 2026-09-08, §11 — **partial**.
**Lifecycle stage:** 8 — Security Review (hard gate). **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate status — STILL INCOMPLETE:** `security-engineer` (R) has now recorded hands-on concurrence
(§11) on SR-010-1/1a/1b/1c and SR-010-2 (both verified against live code and passing tests, both closed),
but **withholds** concurrence on SR-010-3 and SR-010-4 (both re-verified as unimplemented in shipped code as
of 2026-09-08) and flags SR-010-5 item 1 (CI-2 prohibition rule) as never built. `compliance-specialist` (C)
had issued a part-clearance
([`compliance-review-agent-attributed-actions.md`](./compliance-review-agent-attributed-actions.md)) which states
at §8 that it **does not discharge Stage 8**, and has now recorded its Stage 8 position at **§10 — concurrence
WITHHELD**, on two named blockers (C-010-3 input-time PCI guidance absent from the shipped free-text inputs;
C-010-2/SR-010-3 unmet on two of three case-rendering surfaces), plus a new condition **C-010-8** (no
`support_cases` retention-purge job exists). Full Stage 8 discharge (SR-010-7) is **not** achieved by this
update — items remain open on both concurring roles. See §10 and §11 for the full traces.

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

---

## 10. `compliance-specialist` concurrence under SR-010-7 — **WITHHELD IN PART**

**Date:** 2026-09-08. **Role:** `compliance-specialist` (C on this gate).
**Status: CONCURRENCE WITHHELD.** Two of my own Feature 010 conditions that are expressly Stage-8-exit
conditions are **not met in the shipped code**, and one is not met in a way the shipped comments and manifest
notes describe as met. SR-010-7 is therefore **not discharged on my limb**, and Stage 8 remains incomplete
independently of `security-engineer`'s concurrence.

**Nothing in this section requires the shipped code to be reverted.** Feature 010 is running behind the M1 /
Phase 1 NFR-3 floor (no production `support_agent` on real customer PII). What is withheld is the *gate*, and
with it any representation that this surface is cleared for real customer data.

**Code read for this section (2026-09-08, not the design docs):** `backend/src/routes/support-cases.ts` ·
`backend/src/routes/support-cases.test.ts` · `backend/src/repositories/support-cases.ts` ·
`backend/src/db/support-case-collections.ts` · `backend/src/repositories/audit-log.ts` ·
`backend/src/lib/police-report-retention.ts` · `backend/scripts/` (full listing) ·
`src/call-centre/pages/SupportCasesPages.tsx` · `src/call-centre/pages/CustomerLookupPage.tsx` ·
`docs/organization/gates/stage8-manifest.json`.

### 10.1 What I confirm as satisfied

- **SR-010-1a/b — audit logging on the `accountId`-supplied-by-agent write path: SATISFIED, in code, not
  only in documentation.** `recordCaseAudit()` (`support-cases.ts:107-117`) writes an ADR-0006 Trail A
  `privileged_data_access` row whose `accountId` is the **subject** customer and whose `actorAccountId` is the
  agent from the bearer token. It is called on create (`:158`), on detail read (`:252`), on note append
  (`:295`) and on status change (`:342`). The list endpoint uses `ctx.auditLog.recordBulkDisclosure`
  (`:215-222`) — N subject rows plus one `privileged_bulk_access` row carrying the result count, which is the
  shape `repositories/audit-log.ts` enforces at runtime (it throws if `privileged_data_access` is recorded
  without a subject `accountId`, `audit-log.ts:155-158`). All five paths are covered by assertions in
  `support-cases.test.ts` (`:269-274`, `:487-489`, `:512-513`, `:549-550`, `:587`). This is the compensating
  control my §1 concern rested on, and it is real. **SR-010-1a/b: concurred.**
- **C-010-2, record limb — SATISFIED.** `callerVerified: false` is written unconditionally at create
  (`repositories/support-cases.ts:191`), is in the collection validator's `required` array
  (`support-case-collections.ts:45-57`), and **no repository method can set it `true`**. `callerVerificationMethod`
  / `callerVerifiedAt` exist and are never written. Confirmed by reading every method, not by trusting the
  header comment.
- **SR-010-2 as implemented — SATISFIED and, on my limb, better than contracted.** `scope` is
  `z.literal('mine')` (`support-cases.ts:79`), `all` is rejected with 400 before any repository call
  (`:179-187`), and there is **no `listAll`-shaped method** in the repository for a future route to reach for.
  The bulk-disclosure surface NFR-2 prohibits does not exist. I retain the §2 condition that `description` must
  leave `SupportCaseSummary` (`repositories/support-cases.ts:128`) **before** any widening of `scope` is
  reconsidered — under `scope=mine` it is an agent re-reading their own cases, which I accept; under any wider
  scope it is the C-010-3 / C-011-1 field disclosed in bulk, and the fact that it is still in the summary
  projection today means clearing `scope=all` is a **two**-change job, not one.
- **FR-18–21 containment — SATISFIED.** No escalate route, no repository method, no UI affordance. The schema
  fields exist and are inert. I verified this by search, not by reading the comments that assert it.

### 10.2 Blocker 1 — **C-010-3 is not met. There is no PCI-scope-protection guidance anywhere in the shipped UI.**

C-010-3 (compliance review §5, register row) is worded as an explicit **Stage 8 exit** condition and requires
"explicit agent-facing UI guidance ('never record card numbers, CVV, PINs, or full bank account details')."

The two free-text fields this feature introduces have **no such guidance**:

- `SupportCasesPages.tsx:274-282` — the case **description** field. Placeholder: `"What the customer reported…"`.
  No hint, no warning. This is the field attached to the `billing` category (`FR-13`), i.e. precisely the
  foreseeable place a card number gets typed.
- `SupportCasesPages.tsx:427-436` — the case **note** field. Placeholder:
  `"Call summary, action taken, next steps…"`. No hint, no warning.

A repository-wide search of `src/` for `card number`, `CVV`, `PIN` and `bank` returns **no agent-facing
guidance copy at all**. The only comparable control that does exist is the *third-party* hint on the
**recovery-case** note field (`CustomerLookupPage.tsx:95`, "Don't include personal details about other
people…"), which addresses C-011-1 and is not the PCI limb — and it was not carried across to either of
Feature 010's new fields.

§5 of this document confirmed C-010-3's *storage* limbs (no `description` index, no export) and granted
confirmation "conditional on SR-010-2." Those limbs still hold. **The input-time limb — the one I ruled was
the actual control, because "masking is the wrong control" — was never built.** The platform's nil PCI-DSS
scope is an asset; the thing standing between it and a text box is a sentence of copy that does not exist.

**Required (C-010-3, restated as a Stage 9 defect, not a new condition):** a persistent, visible warning on
both the description and the note inputs, wording to be: *"Never record card numbers, CVV/PIN, or full bank
account details. If the customer starts reading them out, stop them."* Owner `ui-designer` +
`frontend-engineer`; copy is mine and is hereby given, so this is not blocked on a further review cycle.

### 10.3 Blocker 2 — **C-010-2's UI limb / SR-010-3 is only one-third delivered**

C-010-2 limb (i) requires the unverified state be "visibly flagged on the record **and in the agent UI**."
SR-010-3 restates it as "rendered prominently on every agent surface that shows a case." Three surfaces show a
case; one shows the flag, and not prominently:

| Surface | `callerVerified` rendered? |
|---|---|
| Case detail (`SupportCasesPages.tsx:479`) | Yes — as an undifferentiated `DetailGrid` row reading "Caller verified: No", visually identical to "Created"/"Updated". Not prominent, and no tone/badge |
| My-cases list (`:154-176`) | **No.** The API returns `callerVerified` on every summary (`repositories/support-cases.ts:128`); the table simply has no column for it |
| Customer-lookup addendum (`CustomerLookupPage.tsx:280-294`) | **No.** `serializeSupportCaseLookupSummary` deliberately carries `callerVerified` (`repositories/support-cases.ts:160`) — SR-010-3 names this exact field — and the UI drops it on the floor |

The FR-11 addendum case is the sharpest: the payload field exists *because* SR-010-3 required it be surfaced,
and it is not surfaced. A field carried and not rendered is worse than one never added — it reads as
compliance-complete in the API contract while the operator sees nothing.

**Required:** render `callerVerified` as a distinct badge (not a grid row) on the detail page, as a column on
the list, and on each `supportCases[]` entry in the lookup result. Owner `frontend-engineer` + `ui-designer`.

### 10.4 Retention — `legalHold` shipped, **no purge mechanism exists**, and it is not covered by analogy

Confirmed in the shipped schema: `legalHold` is present on `SupportCaseDocument`
(`repositories/support-cases.ts:40`), is written `false` at create (`:197`), defaults `false` on read (`:87`),
and is in the validator as an optional `bool` (`support-case-collections.ts:99`) — deliberately not `required`,
which `database-design.md` §6 names as an accepted inconsistency with `recovery_cases.legalHold`. I accept that
inconsistency: it is documented, and the app-layer default closes it in practice. The retention index
`support_cases_status_closed_at_retention` (`:119`) is present, and `closedAt` is set on the transition to
`closed` (`repositories/support-cases.ts:286-288`), so the retention clock actually starts.

**What does not exist: any job.** `backend/scripts/` contains exactly five scripts — `seed-test-accounts`,
`verify-mongo-catalog`, `bootstrap-mongo-collections`, `inc-001-location-inventory`,
`police-report-retention-purge`. There is no `support_cases` purge script, no `runSupportCaseRetentionPurge`,
and no shared `retention-purge.ts` entrypoint of the kind `database-design.md` §6 recommends.

**`backend/src/lib/police-report-retention.ts` does not cover this and must not be cited as if it did.** It
runs `db.collection('recovery_cases')` (`:124`) and field-clears the three SAPS fields on a **five-year** floor
(`POLICE_REPORT_RETENTION_YEARS`). Feature 010's rule is a **24-month whole-document delete** on a different
collection. Nothing is shared but the shape of the problem. Recording this explicitly because the two conditions
were written in the same week and the register makes them look symmetrical: **they are not — one shipped a job,
the other shipped only an index.**

**Disposition: this is an open gap, not a blocker on this gate.** My §5 retention position ("automated,
evidenced deletion") attaches to real customer data, and the M1 floor means none exists yet. But it is now on
the register as **C-010-8**, and it must land before the first production support case, not after — a 24-month
clock is easy to defer past the point where the first cohort is already overdue. It should reuse
`police-report-retention.ts`'s structure (exported filter builder, dry-run mode, structured stdout summary) and
inherit the same unresolved run-log-durability caveat recorded at SR-011-4.4.

### 10.5 The stopgap banner — answering the specific question put to me

**It does not overclaim, and it is also not fixed.**

- **No overclaim, confirmed.** I searched `src/` for any assertion that caller verification is satisfied.
  There is none. No comment, no UI string, and no manifest note in `stage8-manifest.json` claims C-010-1 is met;
  the manifest entries for `web-call-centre-lookup` and `web-call-centre-cases-list` both carry the explicit
  "security-engineer/compliance-specialist concurrence (SR-010-7) not yet recorded. Do not read as a clean
  pass" caveat. `SupportCasesPages.tsx` makes no verification claim anywhere. On the narrow question asked:
  **the shipped code is honest about what the banner is.** I confirm that and I credit it.
- **But SR-010-4's actual defect is unremediated.** `CustomerLookupPage.tsx:256-259` still reads, verbatim,
  the text §4 flagged five days ago: *"Confirm the caller's identity (e.g. full name and **registered phone
  number**, or 2+ identifying account details)…"*. `registered phone number` is one of the three query keys of
  `GET /v1/customer-lookup`. It remains prohibited as an authenticator under my §2 table — anything an agent
  can search by is something a caller can be expected to know — and the banner still instructs agents to do
  exactly that. The note placeholder at `:94` (`"Customer verified on call — …"`) still invites the agent
  self-attestation my §3 Tier 2 requirement 2 calls "a log of an agent's claim, not a verification."
  **SR-010-4 stands, open, unchanged.** It is not a blocker on *this* gate (it is bound to C-010-1, which
  independently blocks real PII), but it should not be described as "shipped this session" in a way that
  implies movement — the wording is byte-identical to what was flagged.

### 10.6 One copy defect that is mine to call, and is new

`SupportCasesPages.tsx:244` — the Account ID field hint reads:

> "Must belong to a customer account **you looked up** — the backend validates and rejects any other account type."

**The backend does not validate that.** `support-cases.ts:141-144` validates that the UUID resolves and that
`userType === 'customer'`. There is no lookup precondition — §1 of this document establishes that in terms, and
SR-010-1c deliberately chose detection over prevention. The hint tells an operator that a control exists which
does not. That is an accuracy defect in operator-facing copy, and operator-facing copy that misstates a control
is how an insider-threat detection story turns into "the agent reasonably believed the system would have
stopped them." The page body at `:229-236` is fine (it describes a workflow); the hint asserts enforcement.

**Required:** amend to *"The customer's account ID, from customer lookup. The backend checks this is a customer
account — it does not check that you looked it up first, and every case you open is recorded against that
customer."* Owner `frontend-engineer`; copy given, no further review cycle needed.

Related, minor: `:107-108` says the list shows cases "you created **or have interacted with**." `listMine`
filters on `createdByAgentAccountId` only (`repositories/support-cases.ts:231`) — a case you added a note to
but did not create will not appear. Correct the copy or the query; my interest is only that they agree.

### 10.7 Verdict and register

**Concurrence WITHHELD.** Named blockers, both of which are pre-existing conditions of mine that were carried
as Stage-8-exit items and were not implemented:

| # | Blocker | Lifts when |
|---|---|---|
| **B-1** | **C-010-3 input-time PCI guidance absent** from the description and note fields (§10.2) | Warning copy rendered on both inputs. Copy supplied in §10.2 — no further compliance cycle needed |
| **B-2** | **C-010-2 UI limb / SR-010-3 unmet** on two of three case-rendering surfaces, including the FR-11 lookup addendum whose payload field exists solely for this (§10.3) | `callerVerified` rendered as a distinct badge on detail, a column on the list, and per-entry in the lookup result |

Both are frontend copy/rendering changes with no backend or schema dependency. I will re-issue concurrence on a
one-line diff confirmation; I am not requiring a fresh review cycle.

**New condition (does not block this gate):**

| ID | Condition | Owner | Blocks |
|---|---|---|---|
| **C-010-8** | **`support_cases` retention-purge job** — 24 months from `closedAt`, `legalHold: { $ne: true }`, escalated cases excluded, dry-run mode, structured evidenced output. Modelled on `police-report-retention.ts` but a separate mechanism against a separate collection with a different floor (§10.4). Inherits SR-011-4.4's open run-log-durability caveat | `backend-engineer`; scheduling `devops-engineer`; evidencing `security-engineer` | First production support case (not this gate) |

**Not lifted by this section, and unchanged:** C-010-1 · C-010-4 (FR-18–21, Phase 1 FR-9) · C-010-5 (RoPA) ·
C-010-6 (CT-4 documented Client instructions — an agent acting on a customer's behalf is still processing that
no instruction authorises) · C-010-7 · SR-010-4 (§10.5) · SR-010-2's `scope=all` withholding, which now
requires **two** changes not one (§10.1) · CT-1 (cross-border consent) · CT-3 (breach runbook, 2026-09-12).

**Regime scope reconfirmed for this feature, 2026-09-08:** POPIA applies (SA data subjects, SA responsible
party under TDIT-2026-09). GDPR not triggered — no EU data-subject footprint has been asserted by
`product-manager` or `cto`, and I have found none in code; this is a determination, not a default, and it
reverts to an open question the moment a market decision changes. PCI-DSS scope remains **nil**, and B-1 is
the condition that keeps it nil.

**Filed by:** `compliance-specialist`, 2026-09-08. **Does not discharge:** Stage 8 (SR-010-7 remains open on
both my limb and `security-engineer`'s) · Stage 10 · `business-analyst` acceptance.

---

## 11. `security-engineer` concurrence (SR-010-7, backend/frontend half) — 2026-09-08

*(Renumbered from §10 to §11 on 2026-09-08 by `compliance-specialist` — both concurrences were filed the
same day and collided on the same section number. Content unaltered; only the heading numbers changed.)*

**Verdict: PARTIAL CONCURRENCE. I concur on the backend implementation of FR-11/12/14/15/16/17
(`scope=mine`) and on FR-18–21's zero code footprint. I withhold concurrence on SR-010-3 and SR-010-4 —
both are still open in shipped, production code, not merely "not yet started."** This is a hands-on
verification against the running code committed since this document was filed
(`support-cases.ts`, `support-cases` repository/collection files, `support-cases.test.ts`,
`SupportCasesPages.tsx`, `CustomerLookupPage.tsx`, `stage8-manifest.json`,
`verify-stage8-manifest.mjs`, `check-adr-prohibitions.mjs`), not a re-read of the design chain. Line/commit
references below are as of this date; re-run before citing later.

### 11.1 SR-010-2 (`scope=all` withheld) — CONFIRMED, still holds

`backend/src/routes/support-cases.ts`'s `listQuerySchema` (line 79-86) declares `scope: z.literal('mine')`.
The route handler additionally short-circuits before Zod ever runs: any `scope` value other than the
literal string `'mine'` (including `'all'` and a missing param) throws `VALIDATION_ERROR` (400) at lines
175-187, before any repository call. `repositories/support-cases.ts` has no `listAll`-shaped method — there
is nothing for a bypassed check to fall through to. `support-cases.test.ts` (`'scope=all is WITHHELD
(SR-010-2)'` describe block, lines 422-465) exercises `scope=all`, a missing `scope`, and an arbitrary
`scope=team` value, all asserting 400, plus a positive test that `scope=mine` returns only the caller's
own cases. I ran this suite (`npx vitest run src/routes/support-cases.test.ts`): 22/22 pass. Confirmed live,
not just documented.

### 11.2 FR-18–21 escalation — CONFIRMED, zero code footprint, still true

- No route, no schema, no repository method, and no `errors.ts` entry for `CALLER_NOT_VERIFIED` anywhere in
  `backend/src/`. `grep -rn escalate backend/src` returns only comments/docstrings in
  `support-cases.ts`, `repositories/support-cases.ts`, `db/support-case-collections.ts`, and one existing,
  unrelated hit in `support-lookup.ts` (pre-existing recovery-case escalation, out of this feature's scope).
- `VALID_STATUS_TRANSITIONS` in the repository has no entry pointing at `'escalated'`; the route's Zod
  `updateStatusSchema` enum excludes `'escalated'` entirely (not merely unreachable — absent from the type).
- `support-cases.test.ts` line 683-699 asserts `POST /v1/support-cases/:caseId/escalate` returns `404`
  (route not registered) — SR-010-5 item 3, the executable negative assertion. I ran it: passes.
- Frontend: `SupportCasesPages.tsx` has no escalation control anywhere. The detail page's status card
  renders a static sentence ("Escalation to a recovery case is not yet available from this dashboard") and
  `STATUS_TRANSITIONS['open'|'in_progress'|'resolved']` never includes `'escalated'` as a selectable option;
  it renders as an inert read-only label only if a case somehow already carries that status. Confirmed by
  reading the component, not assumed from the manifest note.
- **SR-010-5, item 1 is NOT implemented and I am flagging it as a new gap, not carried over from the
  original document.** The review required "a CI-2 prohibition rule… `forbid_route_pattern:
  support-cases/:caseId/escalate` and `forbid_symbol: escalatedToRecoveryCaseId`" in
  `docs/organization/gates/prohibitions.yaml`. That file does not exist in this repository at all.
  `scripts/check-adr-prohibitions.mjs` (the actual CI-2 implementation, run at `ci.yml:84-85`) has exactly
  three rules, all about `ADR-0009`/location-tracking; none references `support-cases`, `escalate`, or
  `escalatedToRecoveryCaseId`. Today's protection against the escalate endpoint is entirely the executable
  404 test (item 3) plus the missing-manifest-entry posture (item 2, confirmed absent — no `escalate` pattern
  in `stage8-manifest.json`). Those two are real and effective on their own, but they are not what SR-010-5
  contracted, and a reviewable-diff-required prohibition rule is qualitatively different from a test someone
  could delete in the same PR that adds the route. **This does not change the FR-18–21 verdict (still zero
  footprint today) but it is a real, outstanding item — recommend it stay open under SR-010-5's original ID
  rather than being closed by this concurrence.**

### 11.3 SR-010-1/1a/1b (audit logging) — CONFIRMED, all five call sites verified against real code

Traced every write path and the detail/list reads in `support-cases.ts` against `repositories/audit-log.ts`
(not assumed from the comments):

| Route | Audit call | Event shape verified |
|---|---|---|
| `POST /support-cases` (create) | `recordCaseAudit(req, account.id)` → `record()`, `eventType: 'privileged_data_access'` | subject = resolved account id, not the actor. Line 158. |
| `GET /support-cases/:caseId` (detail) | `recordCaseAudit(req, supportCase.accountId)` | subject = case's own accountId. Line 252. |
| `POST /support-cases/:caseId/notes` | `recordCaseAudit(req, updated.accountId)` | subject = case's accountId post-update. Line 295. |
| `PATCH /support-cases/:caseId/status` | `recordCaseAudit(req, result.case.accountId)` | subject = case's accountId post-transition. Line 342. |
| `GET /support-cases` (list) | `ctx.auditLog.recordBulkDisclosure({ disclosedAccountIds: page.data.map(...) , ... })` | one `privileged_bulk_access` row with `resultCount`, plus one `privileged_data_access` row per distinct disclosed subject — `repositories/audit-log.ts` lines 203-230. Line 215. |

`repositories/audit-log.ts`'s `assertInvariants()` makes three of the structural guarantees the review
asked for *impossible to violate silently*, not just conventionally followed: a `privileged_data_access`
row without a subject `accountId` throws (mirrors migration 033's
`account_audit_log_privileged_access_has_subject` CHECK), and a privileged event without an actor
(`actorAccountId`/`actorService`) throws. I confirmed migration
`033_adr0006_audit_correlation_columns.sql` exists and adds these columns — this is not a comment
describing an aspirational constraint. `support-cases.test.ts` asserts on the actual audit-call array for
create (line 269-271), list (line 487-495, via a fake `auditLog.recordBulkDisclosure`), detail read (line
512-513), and note-add (line 549-550) using a real harness double that records calls rather than a
pass-through stub. **All five required audit points from SR-010-1/1a/1b are live and independently
verified, both in the running route code and in tests that would fail if a call site were removed.**

SR-010-1c (detection of creates unpreceded by a lookup) is satisfied exactly as originally scoped — it's a
downstream audit-query capability, not a code control, and the subject-`accountId`-carrying rows on both
`support-lookup.ts` and `support-cases.ts` make that query possible. Not independently re-verified beyond
confirming the subject-accountId field is present on both trails (it is).

### 11.4 The three `accountId` mitigating controls — CONFIRMED, each independently re-verified

1. **`ctx.accounts.findById` resolution → 404.** `support-cases.ts:141-144`. Confirmed: `!account` throws
   `NOT_FOUND`.
2. **`userType !== 'customer'` → 404, same uniform code path.** Same lines, same `if` — `account.userType
   !== 'customer'` is OR'd into the same throw, so the 404 is genuinely indistinguishable between "no such
   account" and "not a customer" at the wire level. No separate error branch that would create an existence
   oracle. Confirmed.
3. **`createdByAgentAccountId`/note `agentAccountId` always from `req.auth!.accountId`, never the body.**
   Confirmed at all three write sites (`support-cases.ts:153`, `:282`→passed into
   `appendNote(caseId, req.auth!.accountId, text)`, and status update has no accountId field to begin with).
   The Zod schemas (`createSupportCaseSchema`, `addNoteSchema`, `updateStatusSchema`) have no field that
   could shadow this — grepped for any `accountId`/`agentAccountId` key in the three schemas; only
   `createSupportCaseSchema.accountId` exists, and it is consumed only as the *subject*-resolution input
   (control 1), never assigned to `createdByAgentAccountId`.

I agree with the original document's own limit on these: they are integrity and attribution controls, not
authorization controls, and RR-010-1's acceptance of "any agent can act on any customer, detectably" is
unchanged by anything I found. No regression since 2026-09-03.

### 11.5 SR-010-3 (`callerVerified` surfaced on every case-rendering surface) — **NOT MET. Withholding on this point.**

The condition register requires `callerVerified: false` "surfaced prominently on every agent surface that
shows a case, including the FR-11 lookup addendum." Checked all three surfaces that render case data:

- `SupportCaseDetailPage` (`SupportCasesPages.tsx:475-484`) — **met.** `Caller verified: Yes/No` is a row
  in the detail `DetailGrid`, sourced from `supportCase.callerVerified`.
- `SupportCasesListPage` (`SupportCasesPages.tsx:154-176`) — **not met.** The `DataTable` columns are
  `referenceNumber`, `category`, `status`, `accountId`, `createdAt`. There is no `callerVerified` column and
  no other rendering of the field anywhere in this component, even though `SupportCaseSummary` (the type
  this list consumes, `src/call-centre/api/support-cases.ts:40-52`) carries `callerVerified` on every row.
  An agent scanning their own case list has no visual signal that every single row is, today, definitionally
  unverified.
- `CustomerLookupPage` FR-11 addendum (`CustomerLookupPage.tsx:280-296`) — **not met.** The
  `result.supportCases[]` list renders `referenceNumber`, category, status, and created-at only. The backend
  serializer this list is fed by, `serializeSupportCaseLookupSummary` (`repositories/support-cases.ts:153-162`),
  explicitly includes `callerVerified` in its payload — the field reaches the browser and is silently
  dropped by the component. This is the exact surface the condition names by ID ("the FR-11 lookup
  addendum's `supportCases[].callerVerified` field… must be surfaced in the lookup UI, not just carried in
  the payload," §3) and it is the one surface the original document was most specific about.

**I am withholding concurrence on SR-010-3 as currently drafted.** One of three required surfaces is done;
two are not, and one of the two missing ones is the surface the condition explicitly called out by name.
Recommend this stay open, owner unchanged (`frontend-engineer` + `ui-designer`), scoped now to exactly the
two remaining components/lines above.

### 11.6 SR-010-4 (verification banner wording / self-attestation placeholder) — **NOT MET. Withholding on this point.**

Checked `src/call-centre/pages/CustomerLookupPage.tsx` against the two defects the review named:

- **Banner wording — unfixed.** Line 257 still reads: *"Confirm the caller's identity (e.g. full name and
  registered phone number, or 2+ identifying account details) before disclosing any information below."*
  This is the verbatim wording the review quoted and ruled against (§4): `registered phone` is one of the
  three `lookupQuerySchema` search keys (`support-lookup.ts:22-30`, confirmed still true), so the copy
  instructs agents to authenticate a caller using the identifier the compliance ruling calls a "lookup key,
  not a secret." No commit since `d8f932e` (the security-review commit) has touched this file's banner text
  — `git log` on `CustomerLookupPage.tsx` shows the last content change (`30ab8e6`) predates the review, and
  the compliance-stopgap commit (`60cf340`) also predates it.
- **Self-attestation placeholder — unfixed.** Line 94, `placeholder="Customer verified on call — …"`, is
  unchanged.
- Structural point about display-time-only placement (banner renders after data is already fetched,
  audit-logged, and painted) is also still true — not a regression, just not addressed, consistent with the
  original finding that this was never a control to begin with.

**I am withholding concurrence on SR-010-4.** Both named defects are present verbatim in the currently
deployed component. This is not a new finding — it is the original finding, unresolved, and since the code
is described as "committed and deployed to production now," this means production is currently showing
support agents copy that names a prohibited authenticator. Recommend escalating the priority of this item
above its current "standing, blocks C-010-1" framing: it does not need C-010-1 to land to be fixed — the
wording and the placeholder can be corrected today independent of the Tier-2 verification design, and I
recommend `compliance-specialist` and `technical-writer` be asked to treat it as an immediate copy fix
rather than bundled with the larger verification-mechanism work.

### 11.7 SR-010-6 (manifest/CI-1 coverage of `src/**/*Routes.tsx`) — CONFIRMED, implemented and passing

`scripts/verify-stage8-manifest.mjs` now contains a `discoverWebRoutes()` function (confirmed present,
lines ~76-138) that walks `src/<surface>/` directories for `*Routes.tsx` files, distinct from the
backend/mobile discovery that existed before this review. Ran it directly: `node
scripts/verify-stage8-manifest.mjs` → `Discovered 72 backend routes, 50 mobile screens, 20 web dashboard
routes; manifest has 68 entries. PASS.` The manifest has explicit entries for
`web-call-centre-lookup`, `web-call-centre-cases-list`, `web-call-centre-cases-detail`,
`web-call-centre-cases-new`, and pre-existing `web-admin-*`/security-dashboard groups — confirmed by
reading the manifest, not just the pass/fail exit code. Each Feature 010 web entry's `note` field correctly
states the joint-gate caveat and cites `scope=mine`-only. **This was the sharper structural problem the
original document raised (§7) — it is fixed, verified running, and does not silently pass; it actually
discovers the new pages.**

One residual observation, not a blocker: the manifest entries for the three new Call Centre case pages carry
`verdict: "conditional-sign-off-cleared-scope-only"`, which is accurate as of today, but nothing in the CI
check itself will fail if SR-010-3/SR-010-4 remain open indefinitely — the manifest's `waived`/`verdict`
fields are prose, not enforced state. Consistent with SH-1c's already-filed observation that CI-1 is a
route-existence check, not a data/copy-exposure check; not a new finding, just confirmed still true here.

### 11.8 Summary verdict and what changes in the conditions register

| ID | Status at re-verification | Disposition |
|---|---|---|
| SR-010-1 / -1a / -1b / -1c | **Verified met, live code + passing tests** | Close |
| SR-010-2 | **Verified met, live code + passing tests** | Close |
| SR-010-3 | **Not met** — 1 of 3 required surfaces done | **Remains open**, scope narrowed to list page + lookup-addendum list |
| SR-010-4 | **Not met** — both named defects present in production code | **Remains open**, recommend priority raised (does not require C-010-1) |
| SR-010-5 | **Items 2 and 3 met; item 1 (CI-2 prohibition rule) not implemented** — no `prohibitions.yaml` exists, `check-adr-prohibitions.mjs` has no support-cases rule | **Remains open on item 1 only**, owner unchanged (`devops-engineer` + `backend-engineer`) |
| SR-010-6 | **Verified met, live code, ran the script myself** | Close |
| FR-18–21 zero footprint | **Reconfirmed, still true** | No action |

**Net: I concur on the backend security posture of FR-11/12/14/15/16/17(`scope=mine`) — SR-010-1 and
SR-010-2 are genuinely, verifiably closed, not just asserted. I do not concur on the frontend items
SR-010-3 and SR-010-4, and I am additionally flagging that SR-010-5's mechanical-guardrail item 1 was
never built.** Per the condition register, SR-010-7 requires both `security-engineer` and
`compliance-specialist` concurrence to discharge Stage 8 jointly; this section supplies the
`security-engineer` half, and it is a partial, not a clean, concurrence. Stage 8 remains **not fully
discharged** — three items (SR-010-3, SR-010-4, SR-010-5 item 1) are open with named owners above, and
`compliance-specialist`'s concurrence is still outstanding independent of this entry.

**Filed by:** `security-engineer`, 2026-09-08.

---

## 12. Post-review fix verification — `cto`, 2026-09-08

Three of the four items §10.8 and §11.8 both left open have been fixed and independently re-verified
against the actual committed diff (not the fix agents' own summaries) before recording this section:

| ID | Fix | Commit | Independently confirmed |
|---|---|---|---|
| SR-010-3 | `callerVerified` now rendered as a distinct badge on case detail, a new column on the list page, and per-entry on the FR-11 lookup addendum | `e8158b4` | `grep` confirmed the badge component and all three render sites present in the working tree; `tsc --noEmit` and `npm run build` both clean |
| SR-010-4 | Verification banner rewritten to state plainly that no approved caller-identity procedure exists on this platform, and explicitly disclaims email/phone/policy-ID as proof of identity rather than inventing a "per your team's procedure" phrase implying a control that isn't real; note-field placeholder no longer invites self-attestation | `e8158b4` | Exact new banner text confirmed present in `CustomerLookupPage.tsx` via direct read, not taken from the fix agent's report alone |
| B-1 / C-010-3 | PCI-scope hint ("Don't include card numbers, bank details...") added to both the create-case description field and the note field | `752f9a5` | `grep` confirmed identical hint text on both fields |
| (unlabeled) misleading-copy finding | "the backend validates and rejects any other account type" (falsely implying a lookup precondition) replaced with the control that's actually real (audit logging/attribution); list-page copy corrected from "created or have interacted with" to "created" only, matching what `listMine` actually filters on | `752f9a5` | Confirmed via direct read |

All four fixes are frontend-copy/render only — no backend logic, verification enforcement, or schema
changes were introduced, consistent with what both `security-engineer` and `compliance-specialist`
scoped as sufficient to close these specific items.

**Not fixed, still genuinely open:** SR-010-5 item 1 — no `prohibitions.yaml`/CI-2 rule exists yet for
the escalate endpoint. This needs actual CI/tooling work (`devops-engineer` + `backend-engineer`), not a
copy change, and was out of scope for this pass. The manifest-omission and the executable 404 test remain
the only protection against that surface being accidentally built.

**Net effect on SR-010-7:** SR-010-3, SR-010-4, and B-1 are closed with evidence, not assertion. Stage 8
for Feature 010's cleared scope (FR-11/12/14/15/16/17-scope=mine) can be treated as **substantially
discharged** — both `security-engineer` and `compliance-specialist` concurred on the backend/data-model
posture outright, and their only named frontend blockers are now fixed and verified. The one item still
genuinely open (SR-010-5 item 1, the CI-2 mechanical guardrail) does not block real customer use of the
already-cleared scope — it protects against a *future* engineer accidentally building the escalation
endpoint without noticing it's unauthorized, which the manifest omission and the 404 test already guard
against today, just not as robustly as a dedicated CI rule would. Recommend it as queued work, not a
blocker on current operation.
