# Feature 015 — Customer Account Deletion / Erasure

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst`
**Contributors:** `compliance-specialist` (required before Stage 2 — see §7), `product-manager`,
`database-architect`, `backend-engineer`
**Status:** Draft — replaces the current mailto-stub delete-account flow (web: shipped per
`fa49175`/`30fdfaa`/`7cda90f`; mobile: `mobile/app/(auth)/delete-account.tsx` +
`delete-account-confirm.tsx`, uncommitted) with a real backend erasure capability.
**Related system areas:** `backend/src/routes/customer-profile.ts` (only existing customer-profile
route today — no erasure endpoint exists), Supabase identity store, MongoDB Atlas domain
collections, `docs/organization/10-data-protection-contract-obligations.md`,
`docs/organization/11-documented-client-instructions.md`.

---

## 0. Governing constraint — this feature cannot be spec'd to "done" yet, and that is stated up front

This document formalizes the business rules **as far as they can be formalized from data already
on record**. It cannot go further than that, for one specific, already-documented reason:

**`docs/organization/11-documented-client-instructions.md` §4 row G-9 ("Deletion and erasure") and
row G-3 ("Retention periods") are open items — no Client instruction exists for either.** That
document rules explicitly, at §6: *"Where this document records no instruction, the Operator
default is: do not process."* Retention periods are the **Responsible Party's (the Client's) to
set**, not this platform's to assume (§4 row G-3). An account-deletion feature is, definitionally,
a retention-and-erasure decision.

**Consequence for this spec:** §1–§6 below define the erasure/retention rule set this role
recommends as correct given POPIA, existing insurance-recordkeeping norms, and the data this
platform actually holds — but **this rule set is a recommendation for the Client instruction
schedule already queued at `11-documented-client-instructions.md` §8 item 2/5 (G-3, G-9), not a
ratified retention policy.** Per that document's Stage 8 hook (CT-4d): *"every feature introducing
a new processing purpose... must cite the Register A row that authorises it... if no row
authorises it, that is a Stage 8 block."* **This feature cannot pass Stage 8 (Security Review)
until G-3 and G-9 are answered by the Client.** This is flagged now, at Stage 1, so
`product-manager`/`technical-project-manager` can sequence the Client conversation ahead of
Stage 9 (Development) rather than discovering the block at the gate.

This is not a reason to stop Stage 1 work — the rules must be drafted so there is something
specific for the Client to approve or amend, per the standing practice at
`11-documented-client-instructions.md` §5.4 ("Do not draft answers to these" refers to open
questions put *to* the Client; drafting a recommended answer *for* the Client to ratify or reject
is exactly the difference between that document's §3 and §4). Rules below marked **[RECOMMENDED —
PENDING CLIENT RATIFICATION]** are exactly that.

---

## 1. Domain glossary additions (for this feature)

| Term | Definition |
|---|---|
| **Account deletion / erasure request** | A customer-initiated, authenticated request to have their personal information deleted from the platform, distinct from account deactivation (not offered today) or policy cancellation (Feature 004/006 scope, does not delete data). |
| **Hard delete** | Row/document is physically removed from the store; irrecoverable outside of backup restoration. |
| **Anonymization** | Fields identifying a natural person are irreversibly stripped or replaced (e.g. name → `"[deleted customer]"`, email → a non-reversible hash) while the remaining record (e.g. an aggregate claim-history count, an audit trail) is retained for statistical, audit, or regulatory purposes. |
| **Retain-with-restricted-access** | Record is kept in full, but access is limited to compliance/audit/legal-hold purposes (not visible in normal admin/customer UI, not returned by day-to-day queries). |
| **Statutory retention floor** | A minimum period a record category must be kept regardless of a deletion request, per insurance-recordkeeping and POPIA §14 justified-retention grounds (contract performance, legal obligation, legitimate interest in defending claims). This platform's exact floors are **not yet Client-ratified** — see §0. |
| **Legal hold** | A hold that overrides a scheduled deletion because the record is relevant to an open claim, dispute, investigation, or law-enforcement matter (SAPS case, per Feature 011). Existing precedent: `cto` carve-out at `INC-001` §7.3 G-4 — the Client must be informed when a hold is placed over their data (G-10). |

---

## 2. What "delete account" means — mixed disposition, not a single hard delete

**[RECOMMENDED — PENDING CLIENT RATIFICATION].** A full hard delete of every record is the wrong
default for an insurance platform: claim/asset/incident history has statutory and contractual
retention value independent of whether the customer wants their login gone, and a full hard delete
of policy/claim records would itself be a POPIA/insurance-recordkeeping problem, not a compliance
win.

**Recommended rule: account deletion is a mixed disposition** — some categories hard-deleted
immediately, some anonymized, some retained-with-restricted-access under a time-boxed floor, per
the matrix in §3. "Delete my account" in customer-facing copy should be described as **"delete
your login and personal profile data; insurance records we are required to keep are retained in
de-identified or restricted form for the periods described in [privacy notice]"** — not as "delete
everything," to avoid setting an expectation the platform cannot lawfully meet.

**Statutory retention floor — not yet set by this role, deliberately.** POPIA §14 permits
retention beyond a subject's request where required by law, or where the responsible party has a
legitimate need for the specific purpose (contract performance, defending a legal claim). This
platform's own governing document (`10-data-protection-contract-obligations.md` §4 row G-3)
already commits: **"Retention periods are the Responsible Party's [Client's] to set."** This spec
therefore recommends specific numbers below (12/60/84-month bands, common in SA short-term
insurance practice) as **the proposal to put to the Client**, not as an adopted figure — flagged
explicitly rather than silently asserted, per this role's own house rule against leaving business
rules as unconfirmed assumptions.

---

## 3. Data category × disposition matrix

Data categories drawn from the collections actually present in the codebase
(`backend/src/db/*-collections.ts`, `backend/src/repositories/*.ts`), not from an assumed model.

| # | Category | Store | Disposition on verified deletion request | Rationale |
|---|---|---|---|---|
| D-1 | **Auth/identity** (email, password hash, MFA factors, session tokens) | Supabase Postgres | **Hard delete**, immediately on execution | No lawful basis to retain login credentials once the account is closed; not needed for claims defense |
| D-2 | **Customer profile** (name, DOB, `idNumberLast4`, address, emergency contact, phone) | MongoDB (`customer-profile-collections.ts`) | **Anonymize** (retain a profile stub keyed to the anonymized policy/claim history below); direct identifiers stripped | Needed to keep D-4/D-5 records intelligible in aggregate without retaining the identifying fields themselves |
| D-3 | **Profile picture** | MongoDB/object store (`customer-profile-pictures.ts`) | **Hard delete**, immediately | Pure identifying media with no independent retention purpose |
| D-4 | **Policies** (active, cancelled, historical) | MongoDB (`repositories/policies.ts`, `policy-status-history.ts`) | **Retain-with-restricted-access** for [RECOMMENDED: 60 months / 5 years from policy end] then anonymize | SA short-term-insurance recordkeeping norms and POPIA §14(c)/(d) legitimate-interest ground (defending pricing/underwriting decisions, tax) — exact figure is a Client instruction (§0), not this role's to finalize |
| D-5 | **Assets** (registered devices/vehicles) | MongoDB (`repositories/assets.ts`) | **Retain-with-restricted-access**, same floor as the policy they were registered under (D-4); anonymize owner-identifying fields, keep asset-type/claim-linkage for aggregate reporting | Assets are the object of coverage — same recordkeeping logic as the policy itself |
| D-6 | **Recovery / security cases** (theft reports, SAPS case linkage per Feature 011) | MongoDB (`repositories/recovery-cases.ts`, `police-report-retention.ts`) | **Retain-with-restricted-access** per the existing `police-report-retention.ts` floor (do not shorten it for a deletion request) | An open or closed recovery/theft case is evidentiary; `police-report-retention.ts` already encodes a retention rule for this category — this feature must not override it, only confirm it survives a deletion request unchanged |
| D-7 | **Support cases / call-centre interactions** | MongoDB (`repositories/support-cases.ts`) | **Anonymize** after [RECOMMENDED: 12 months] | Operational/QA value is short-lived; no claims-defense need once the case is closed and no policy is open |
| D-8 | **GPS / location events** (Feature 008/009) | MongoDB (`location-events-collections.ts`) | **Hard delete immediately** on deletion request, subject to any active legal hold on a specific case | Location data is the most sensitive category in play (INC-001 findings); no retention justification survives account closure once linked assets/policies are anonymized, and G-6 (`11-...md`) records that location processing itself has **no Client instruction at all** yet — retaining it longer than necessary compounds an already-open exposure, not the reverse |
| D-9 | **Tracking devices** (registration/linking records, Feature 009 Phase 4) | MongoDB (`tracking-device-collections.ts`) | **Hard delete**, immediately (device unlinked) | Device-linkage has no independent retention value once the asset/policy is anonymized |
| D-10 | **Notifications** (delivery records, preferences, push tokens) | MongoDB (`notification-collections.ts`, `push-tokens.ts`, `push-token-security-log.ts`) | **Hard delete**, immediately | Operational messaging records with no claims/statutory value |
| D-11 | **Alerts** | MongoDB (`alerts-collections.ts`) | **Hard delete**, immediately | Same reasoning as D-10 |
| D-12 | **Product/analytics events** attributable to the customer | MongoDB (`product-events-collections.ts`) | **Anonymize** (strip customer ID, keep aggregate event) | Product analytics has aggregate value; individual attribution does not survive a deletion request — also a §19(e) non-monetisation boundary (`10-...md` CT-9), so this must not become a route to re-identify a "deleted" customer via analytics joins |
| D-13 | **Admin access log entries referencing this customer** (audit trail of staff access to the account) | Supabase/MongoDB (`admin-access-log.ts`) | **Retain, unmodified** — do not delete or anonymize | This is an audit record *of platform conduct*, not primarily of the customer; deleting it on customer request would defeat its own purpose (AUD-8/AUD-9 audit-trail obligations) |
| D-14 | **Payment/billing records** | **None exist in this codebase today** — no `payments.ts` route, per `CLAUDE.md`/`HANDOFF.md`. | N/A today | **Flagged, not answered**: when a payment gateway is selected (open `integration-architect` decision), this matrix needs a new row before that feature ships — SA tax/financial recordkeeping floors (commonly 5+ years) will very likely apply and this role must be looped in before Stage 8 for that feature, not after |

**Explicitly out of scope for a hard-delete outcome, regardless of customer request:** D-4, D-5,
D-6, D-13 — because deleting them either breaches a recordkeeping floor this platform is very
likely bound by, or defeats an audit control this platform already relies on elsewhere
(`10-...md` AUD-8/AUD-9).

---

## 4. Eligibility / preconditions

**AC-1 — Active paid subscription.** A customer with an active, paying policy **may submit** a
deletion request, but the request **must not execute automatically**. It routes to a
**cancel-then-delete** flow: the deletion request first triggers policy cancellation (existing
cancellation rules, out of scope here — owned by whatever cancellation/refund spec governs Feature
004/006 proration) and only proceeds to data disposition once cancellation is confirmed. Rationale:
deleting identity data out from under an active insurance contract the platform is still on risk
for is both an operational and a POPIA §14(b) contract-performance problem.

- Given a customer with an active policy submits a deletion request,
  When the request is received,
  Then the system presents cancellation as a required first step and does not execute any data
  disposition until cancellation completes.

**AC-2 — Open recovery/security case (Feature 011/theft report in progress).** A customer **may
not** have their account fully processed for erasure while a recovery/security case linked to
their assets is open (`status` other than closed/resolved in `recovery-cases.ts`). The request is
accepted and queued, not rejected outright.

- Given a customer has an open recovery case,
  When they submit a deletion request,
  Then the system accepts the request, holds execution, and shows the customer a clear reason
  ("your theft report on [asset] is still open — we'll process this once it's resolved") rather
  than a silent failure or an indefinite pending state with no explanation.
  And the case-handling team (Call Centre / Feature 010) is notified that a deletion request is
  queued behind their case, so it is not lost.

**AC-3 — Open claim.** **No claims backend exists today** (`CLAUDE.md` confirms `claims.ts` does
not exist). This precondition is **specified prospectively** for when Feature 011/claims lands:
same rule as AC-2 — an open claim blocks execution, does not block submission.

**AC-4 — No precondition blocks *submission*.** Any authenticated customer may submit a deletion
request at any time; only *execution* is gated by AC-1–AC-3. This avoids the flow silently
rejecting a customer who has a good-faith reason to want their data gone regardless of an open
matter.

**AC-5 — Legal hold.** If a specific record is under an active legal hold (existing `cto`
carve-out, `INC-001` §7.3 G-4), that record is excluded from the deletion's disposition and
retained unmodified, and — per G-10 (`11-...md`) — **the customer must be told a hold exists and,
per that same open item, the Client must be informed a hold was placed over their data.** G-10 is
itself an open Client-instruction item; this AC cannot be implemented as "silent hold" until G-10
is answered.

---

## 5. Identity verification before execution (one-way door)

**AC-6.** Because this is irreversible for the categories marked hard-delete in §3, execution
requires **re-authentication**, not merely being logged in: the customer must re-enter their
password (or complete an MFA challenge if MFA is enrolled) **immediately before** confirming
execution — the same standard this platform already applies to other high-risk actions (pattern:
`mfa.ts` step-up). A session that is merely "logged in" from earlier in the day is not sufficient.

**AC-7.** A minimum **cooling-off window** between request and execution.
**[RECOMMENDED — PENDING CLIENT RATIFICATION]: 7 calendar days.** During the window:
- the request may be cancelled by the customer with one action, restoring nothing (nothing was yet
  deleted),
- the customer receives a confirmation notification at submission and a reminder at least 24 hours
  before execution (subject to G-1/email-dispatch being answered — see §7),
- no further login is required to cancel; a cancellation link/action must work even if the
  customer does not re-authenticate, so an account-takeover attacker cannot use step-up
  re-authentication as a lever to force execution while locking the real owner out of cancelling.

**AC-8.** The confirmation screen (mobile: `delete-account-confirm.tsx`, replacing the current
mailto stub; web: equivalent) must state, in plain language before the final confirm action:
what is deleted immediately, what is retained and for how long, and that the action cannot be
reversed once the cooling-off window ends. Generic "are you sure?" copy is not acceptable —
per this role's pre-approval checklist, every acceptance criterion must be testable, and
"the user was shown the disposition summary matching §3" is the testable version of that
requirement.

---

## 6. Edge cases

| Edge case | Rule |
|---|---|
| Customer deletes account, then a new customer later registers the same asset (e.g. resold device) | The anonymized D-5 asset record from the deleted account must **not** be matched or surfaced to the new registrant; asset uniqueness checks (Feature 013-style duplicate detection, if extended to assets) must exclude anonymized/restricted records from active comparison, comparing only against currently-active accounts |
| Customer submits a second deletion request while one is already queued (AC-2 hold state) | Idempotent — no duplicate queue entries; the existing queued request's reason/status is returned |
| Customer's policy lapses (payment failure) while a deletion request is in the cooling-off window | Lapse does not accelerate or block the already-running cooling-off window; AC-1's cancel-then-delete gate is satisfied once the policy reaches a terminal cancelled/lapsed state, whichever occurs first |
| Deletion request submitted, then customer re-subscribes before the cooling-off window elapses | Deletion request is treated as withdrawn — re-subscription is an affirmative act inconsistent with continuing to want the account gone; customer must be shown this and asked to confirm, not silently cancelled without notice |
| Household member sharing (Feature 014) — deleting an account that has shared assets/access with another household member | **Not resolved by this document** — flagged as a dependency on Feature 014's own business rules for what happens to shared-access grants when the granting account is deleted; `business-analyst` to cross-check against `014-household-member-sharing/business-requirements.md` before Stage 2 |
| Admin-initiated deletion (support closes an account on the customer's behalf) | **Out of scope for this document** — this spec covers customer-self-service deletion only; an admin-initiated path, if built, needs its own eligibility/audit rules and is a separate story |

---

## 7. Acceptance criteria summary (Given/When/Then, consolidated)

1. Given an authenticated customer with no active policy, no open recovery case, and no legal
   hold, when they submit and re-authenticate for a deletion request, and the cooling-off window
   (§0/AC-7 pending Client ratification) elapses without cancellation, then D-1/D-3/D-8/D-9/D-10/D-11
   are hard-deleted and D-2/D-4/D-5/D-7/D-12 are anonymized per §3, and D-13 is left untouched.
2. Given an authenticated customer with an active policy, when they submit a deletion request,
   then the system requires cancellation to complete first and does not execute disposition until
   it does (AC-1).
3. Given an authenticated customer with an open recovery case, when they submit a deletion
   request, then the request is accepted, held, and the reason is shown to the customer and to the
   case-handling team (AC-2).
4. Given a deletion request has been executed, when any surface (customer, admin, security-company
   dashboard) queries for that customer's identifying data, then no D-1/D-3/D-8/D-9/D-10/D-11
   record is returned and D-2/D-4/D-5/D-7/D-12 records contain no direct identifier.
5. Given a customer within the cooling-off window, when they trigger the cancel action (with or
   without re-authentication), then the deletion request is withdrawn and no disposition occurs.

**Not testable yet, and marked as such rather than guessed:** the exact retention-floor durations
in §2/§3 (60 months, 12 months, 7-day cooling-off) are proposals pending Client ratification per
§0 — QA cannot write a pass/fail test against a number this document does not yet have authority
to fix. `qa-architect` should treat those durations as parameters to be substituted once
`11-documented-client-instructions.md` G-3/G-9 return an answer, not as already-approved constants.

---

## 8. Stage-gate status

- **Stage 1 (this document): drafted, not yet reviewed by `compliance-specialist` or signed off by
  `product-manager`.**
- **Blocks Stage 2 (Product Planning)** on `compliance-specialist` review of §2/§3's retention
  proposal for POPIA/insurance-recordkeeping soundness before it is put to the Client.
- **Blocks Stage 8 (Security Review) — hard gate — until `11-documented-client-instructions.md`
  G-3 (retention periods) and G-9 (deletion/erasure instruction) are answered by the Client**,
  per that document's own CT-4d Stage 8 hook. This is the single most important sequencing note in
  this document: engineering should not be scheduled to build the erasure endpoint against §3's
  proposed numbers as if they were final.
- **Recommendation to `product-manager`/`technical-project-manager`:** fold the G-3/G-9 questions
  into the next Client instruction schedule already queued at `11-documented-client-instructions.md`
  §8 item 5, rather than opening a separate conversation — this avoids yet another one-off email to
  a Client relationship that document's own §8 already asks to be handled as consolidated
  schedules, not one-offs.

---

**Filed by:** `business-analyst`, 2026-09-21.
**Does not discharge:** G-3, G-9, G-6, G-10 (`11-documented-client-instructions.md`) · any
`compliance-specialist` sign-off · Stage 2 product planning · Stage 8 security review.
