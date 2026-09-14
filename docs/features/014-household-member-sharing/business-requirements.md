# Feature 014 — Household / Family Member Sharing on a Policy

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst`
**Contributors required before Stage 2 can commit anything:** `product-manager` (owner
clarification — see §0.3, this is the blocking item), `cybersecurity-architect` (new
auth/access-boundary model — see §6), `compliance-specialist` (new inter-person data-sharing
relationship — see §6), `database-architect`, `backend-engineer`, `payment-engineer`
**Status:** Draft — new platform-owner request (2026-09-14), owner's own words: *"the policy plan
owner should be able to invite each other family members. They should be also be able to add in
their devices and track the forms and stuff like that. But then all the rules should be the
same."*
**Related system areas (RACI):** Feature 001 Authentication (account/session model this feature
would extend), Feature 004 Policy/Asset Management (`policies.ts`, `assets.ts` — every query this
feature touches), pricing-model-v2.md §3 (`maxUsers` field already exists in the plan catalog but
is unenforced — see §1.4).

---

## 0. Framing the ask

### 0.1 Why this is not a small feature

This platform's account model today is **one account = one policy-owner = that account's own
assets, full stop.** There is no concept anywhere in the codebase of a second person having any
access to another person's account, policy, or assets. This request is not "add an invite button"
— it is a request to introduce a **new relationship type into the account model itself**:
account-to-account, not just account-to-policy. That is comparable in weight to Feature 001
(Authentication established the account/session model this feature would now have to extend), not
a UI addition to an existing screen. This document treats it accordingly and does not commit
implementation scope — Stage 2 (`product-manager`) and Stage 5 (`solution-architect`) still need
to happen, and Stage 2 cannot meaningfully start until §0.3's question is answered by the owner.

### 0.2 Current account/ownership model — verified in code, not assumed

- **`backend/src/repositories/accounts.ts`**: `UserType` is a closed enum —
  `'customer' | 'admin' | 'security_company_operator' | 'support_agent'`. There is no
  `family_member`, `household_member`, or any secondary-access type. An `app.accounts` row has
  exactly one `email`, one credential set, one `id`. Nothing in this table or its status cache
  (`account_status_cache`) models "this account can also act on behalf of / alongside that
  account."
- **`backend/src/routes/policies.ts`**: every read is `ctx.policies.findByIdForAccount(accountId,
  policyId)` / `ctx.policies.listByAccount(accountId, ...)`. **`backend/src/repositories/policies.ts`
  confirms this at the query level** — `findOne({ _id: ..., accountId })`, `filter.accountId =
  filters.accountId` — a policy document has exactly one owning `accountId` field, no array of
  authorized accounts, no owner/member distinction of any kind.
- **`backend/src/routes/assets.ts`**: identical pattern — `ctx.assets.findByIdForAccount(accountId,
  assetId)`, `ctx.assets.listByAccount(accountId, ...)`. Assets are scoped to the single
  `accountId` that created them; there is no secondary-owner or "registered by" vs. "belongs to"
  distinction anywhere in `AssetDocument`.
- **Conclusion: yes, this is strictly one account = one policy = that account's own assets only,
  with zero concept of shared or secondary access today.** Confirmed by reading the repository
  layer, not inferred from the routes alone.

### 0.3 The existing invitation mechanism is a different, unbuilt capability — confirmed, not assumed to overlap

`backend/src/routes/invitations.ts` and `createPrivilegedAccountFromInvitation`
(`accounts.ts`) exist, but reading both in full confirms this is **organizational/staff
onboarding, not peer household sharing**:

- `POST /invitations` is `requireUserType('admin')`-gated — only an admin can issue one, with a
  15-minute step-up MFA requirement (SR-11). A policy owner (a `customer`-type account) has no
  authority to call this endpoint at all.
- The `userType` accepted is restricted to `z.enum(['admin', 'security_company_operator',
  'support_agent'])` — `customer` is not a valid value. There is no code path that produces a
  second `customer`-type account linked to an existing one.
- `createPrivilegedAccountFromInvitation` sets `mfa_required = true` unconditionally and requires
  a `partnerOrganizationId` for security-company operators — this is scaffolding for
  organizational hierarchy (TD IT Solution staff and partner-org operators), not a household model.
- The accepted invitation creates a **wholly independent account** with its own credentials and no
  reference back to "whose household/policy this person now has access to" — there is no field for
  that relationship anywhere in the invitation or account schema.

**Conclusion: this is genuinely a different, unbuilt capability.** It does not accidentally
half-exist. A household-sharing feature needs its own invitation mechanism, its own data model for
the account-to-account (or account-to-policy) relationship, and its own authorization checks
layered into `policies.ts`/`assets.ts` (and every other accountId-scoped route Feature 004+
introduced) — none of which exist today.

### 0.4 No UI hint of multi-user/household concepts

- `mobile/src/screens/invitations/AcceptInvitationScreen.tsx` is explicitly the **staff**
  acceptance screen — its own header comment reads *"Staff invitation acceptance —
  ui-design.md §4.4 (privileged first login)."* Reached only via the
  `tditinsurance://invitations/accept` deep link that `POST /invitations` (admin-only, §0.3)
  generates. No customer-facing equivalent exists.
- `src/customer/` (web) has no invitation, household, or family-member screen, flow, or copy —
  confirmed by search; the one `invit` match in that tree (`supabase/auth.ts`) is unrelated
  Supabase auth plumbing, not a feature.
- `mobile/app/(app)/` (the customer app's screen tree) has no household/family/member screen.
- **Conclusion: no existing UI hints at this capability on either surface. It would be built from
  zero, front and back.**

### 0.5 One existing, unenforced data point worth surfacing: `maxUsers`

The plan catalog (`backend/src/lib/plan-catalog-defaults.ts`, `PlanEntitlements.maxUsers`) already
carries a `maxUsers` field per tier — Essential/Plus: `1`, Pro: `5`, Business: `null` (uncapped) —
and it is surfaced today in `GET /v1/policies?include=planSummary` and the admin plan editor
(`PATCH /v1/admin/plans/:planId`). **This is marketing/display metadata only.** Grep across
`backend/src` confirms `maxUsers` is read and serialized in exactly the same places `maxAssets` is
defined, but unlike `maxAssets` (enforced via `assertAssetRegistrationAllowed` /
`ASSET_LIMIT_REACHED` on `POST /v1/assets`), there is **no `assertUserRegistrationAllowed`, no
`USER_LIMIT_REACHED` error, and no code path that ever creates a second user against a policy at
all.** `pricing-model-v2.md` itself documents Pro's "multiple users (up to 5)" as a tier
*positioning* claim, not a built entitlement.

This matters for scope: `maxUsers` gives `product-manager` a **pre-existing, already-ratified
per-tier cap** to reuse for this feature's own eventual limit (see §5) rather than inventing a new
number — but it does not mean any part of the mechanism is built. It is a number sitting unused in
a catalog row.

---

## 1. The four genuinely distinct things bundled in the owner's request

The owner's sentence describes four separable problems. This document does not treat them as one
problem, per this role's own discipline (see Feature 013's §0.2 precedent for the same technique).

### 1.1 Invitation mechanism (peer-to-peer, not organizational)

A policy owner invites another person, by email, to gain access to the **same** policy/household.
Structurally this must be a new mechanism — §0.3 established the existing one is
organizational-hierarchy-shaped (admin → staff), not peer-shaped (customer → customer). A new
household invitation needs: who can send one (policy owner only, or any existing member — see
§1.4), what identifies the invitee (email, per the owner's own phrasing), an acceptance flow
(does the invitee need their own signup, or just accept into an existing account — depends on
§1.2), an expiry/revocation model, and a limit on pending/total invitations (tied to `maxUsers`,
see §1.5). **Not designed here — flagged for Stage 2/5.**

### 1.2 Same login vs. separate login — the single highest-risk open question in this document

The owner's request does not specify, and this document takes **no position** on which the owner
means. Both are legitimate product directions with materially different engineering and security
consequences; this is deliberately presented as a decision for the owner/`product-manager` to
make, not inferred:

**Option A — Shared single login.** The family member uses the policy owner's own email/password
to sign in; there is no independent account, session, or identity for them at all.
- *Pros:* trivial to build relative to Option B — effectively zero new authorization model, since
  every action really is the owner's account acting.
- *Cons (real, not hypothetical, flagged for `cybersecurity-architect`):* no individual audit
  trail — `app.audit_log`'s `actorAccountId` would always resolve to the owner regardless of who
  actually acted, which breaks every existing audit/traceability guarantee this codebase has built
  for every other actor type (ADR-0006, R-2, referenced directly in `invitations.ts`'s own
  `privilege_granted` comment). No way to revoke one family member's access without changing the
  shared password for everyone, including the owner. No way to ever distinguish "the owner reported
  this asset stolen" from "the teenager reported this asset stolen" in any downstream claims or
  recovery workflow. MFA (`mfaRequired`) is a single toggle on one account — cannot express "the
  owner has MFA, the 16-year-old's device doesn't."

**Option B — Separate login, shared household access.** Each family member gets their own
email/password/session/account row (a new `UserType`, e.g. `customer_household_member`, or a
relationship table linking two independent `customer` accounts), which then carries permission to
act against the **same** policy/assets.
- *Pros:* preserves this platform's existing audit/session/MFA guarantees per-person (matches how
  every other multi-actor relationship in this codebase — admin/support/security-operator — is
  already modeled). Individually revocable. Supports different MFA/session state per person.
- *Cons:* this is a genuinely new multi-tenancy concept for the account model — a policy/asset
  currently resolves to exactly one `accountId` everywhere (§0.2); Option B means every
  accountId-scoped query in `policies.ts`, `assets.ts`, and every route Feature 004+ built needs a
  new authorization layer (resolve "which household/policy does this session's account belong to,"
  not just "does this session's account own this record"). This is real, non-trivial rework across
  an already-shipped, tested surface (Feature 004's 85+ tests all assume the current 1:1 model),
  not a additive change.

**This document explicitly declines to choose between A and B.** It is the single most important
open question requiring the owner's own answer before Stage 2 can meaningfully scope anything,
because the two options are not points on the same spectrum — they are different products with
different security postures, and this role's authority stops at formalizing the tradeoff, not
picking one (per this role's charter: "does not have final authority over actual policy/pricing
decisions").

### 1.3 Device/asset registration by a non-owner

"Add in their devices and track" raises questions that don't resolve themselves once §1.2 is
answered — flagged separately because they carry independent coverage/liability implications:

- Does a family member register an asset that is **theirs** (their own phone) but it becomes
  visible/covered under the shared household policy? Or does every asset still ultimately belong
  to the policy owner's account, with the family member merely having permission to add records to
  it?
- **Removal case, not hypothetical — flag for `product-manager` and `compliance-specialist`:**
  if a family member is later removed from the household (divorce, moved out, dispute), what
  happens to an asset they registered? Two defensible answers with different consequences:
  - *The asset stays on the policy* (it was registered under household coverage, coverage
    continues) — but then the removed person may have no further visibility or control over an
    asset that is physically theirs, which is a real user-hostile outcome if mishandled.
  - *The asset leaves with the person* (it was "theirs") — but then the owner's policy loses
    coverage on an asset that may have been paid for under the owner's subscription, and any
    in-progress claim/recovery case on that asset (once Feature 011/claims exist) has an
    ownership-transfer problem mid-case.
  - Neither is scoped or decided here. This is a **coverage and liability question**, not a
    software question — explicitly for `product-manager` and `compliance-specialist`, not this
    document's call.
- Interacts directly with `maxAssets` (§0.5's sibling entitlement, already enforced) — do a family
  member's assets count against the same shared `maxAssets` cap as the owner's, or does each
  family member get their own allotment? The owner's "all the rules should be the same" (§1.4)
  suggests a single shared pool, but this needs to be said explicitly, not inferred, given real
  billing consequences (§1.5).

### 1.4 "All the rules should be the same" — read literally, flagged as genuinely ambiguous, two interpretations proposed

Taken literally, this phrase could mean either of two very different permission models. This
document does not assume which the owner means, and proposes both concretely so the owner has
something to react to rather than an abstract question:

**Interpretation 1 — Identical permissions (family members are functionally co-owners).**
A family member can do everything the policy owner can: invite further family members, remove
other members (including, in principle, the original owner), remove/modify any asset regardless of
who registered it, change the plan tier, and — once billing exists — change payment details or
cancel the policy. This is the more literal reading of "all the rules should be the same," but is
a **materially higher-risk design**: it means the platform would let any invited family member
unilaterally cancel the policy or remove the person who invited them, with no seniority or
owner-retained veto. Flagged directly for `cybersecurity-architect`: this is the kind of
"small-looking access change with real exposure" this session's other reviews have repeatedly
surfaced (see the Stage 8 CONDITIONAL SIGN-OFF pattern on Feature 012's recent commits) —
symmetric-permission household access is a known-hard problem in consumer software generally
(mirrors real-world disputes over shared streaming/family-plan accounts) and deserves scrutiny
before being built as the default.

**Interpretation 2 — Same *rule set* applied consistently, owner retains exclusive control over
the policy itself.** Family members can add/view/manage their own devices under the same coverage
rules, tier limits, and asset-type restrictions as the owner (i.e., no separate, lesser rulebook
for a family member's device — the coverage math and asset-type validation is identical), but the
owner alone retains control over billing, plan changes, cancellation, and membership (inviting/
removing other members). This reading treats "the rules" as "the coverage/asset rules," not "the
account-control permissions" — a materially safer default that matches how comparable products
(mobile carrier family plans, streaming family plans) typically structure owner-vs-member
authority.

**This document recommends Interpretation 2 as the safer default if the owner has no strong
preference, but does not decide it** — this is exactly the kind of policy call this role's charter
reserves for `product-manager`/executive stakeholders, not `business-analyst`. Flagged as the
**second most important open question** (after §1.2) requiring the owner's own clarification
before Stage 2 proceeds.

### 1.5 Billing/subscription implications

`pricing-model-v2.md` already prices per-tier `maxUsers` as a *positioning* claim (Pro: up to 5
users) without any enforcement or extra-charge model behind it (§0.5). This feature raises
questions `pricing-model-v2.md` does not currently answer and this document does not answer either
— flagged for `product-manager`:

- Does inviting a family member consume one of the existing (already-priced-in) `maxUsers` slots
  at no extra cost, or does it trigger incremental billing per member? The current catalog implies
  the former (users are already counted into the flat tier price), but this has never been tested
  against a real feature, only stated as marketing copy.
- Essential and Plus are both `maxUsers: 1` today — does that mean household sharing is a Pro-tier
  feature only (family members require upgrading to Pro), or does the owner intend this for every
  tier, which would contradict the existing catalog's own `maxUsers` values and require a
  `product-manager`-approved catalog change?
- Payments/billing do not exist as a backend system yet (`docs/features/*`'s own repeated framing,
  confirmed again by `CLAUDE.md`'s "Not built" list) — so no proration/billing-cycle question is
  actionable today regardless of the answer; flagged for `payment-engineer` as a forward-looking
  item only, not blocking Stage 1.

---

## 2. What is buildable now vs. blocked

Following Feature 013's house convention of separating buildable-now from blocked-pending-decision:

| Piece | Buildable today? |
|---|---|
| §1.1 Invitation mechanism (any shape) | **Blocked** — cannot meaningfully design the invitation flow until §1.2 (same/separate login) is answered, since the accept-flow, token payload, and resulting account state are entirely different between the two options. |
| §1.2 Same login vs. separate login | **Not this role's decision — owner/`product-manager` input required.** Nothing is buildable in this feature until this is answered; it changes the shape of every subsequent piece. |
| §1.3 Device/asset registration by a member, and its removal-case consequences | **Blocked** on §1.2 (who is the actor) and on `product-manager`/`compliance-specialist` ruling on the asset-ownership-on-removal question. |
| §1.4 Identical vs. owner-retains-control permissions | **Not this role's decision — owner/`product-manager` input required.** Determines the entire authorization matrix Stage 5 would design. |
| §1.5 Billing implications | **Blocked** on `product-manager` pricing decision; separately blocked on payments/billing not existing as a system at all yet. |
| Reusing `maxUsers` as the per-tier household-size cap once a model is chosen | **Plausible reuse of existing, already-ratified data** (§0.5) — flagged as a Stage 2 convenience, not a commitment. |

**Nothing in this feature is committed buildable scope in this document.** Unlike Feature 013
(which had a clearly buildable Tier 1), every path here depends on an owner decision this role
cannot make. This document's purpose is to formalize the questions precisely enough that Stage 2
can be a real conversation, not to hand engineering a starting point.

---

## 3. Non-goals (explicit)

- **Not assuming a shared-login model.** Not assuming a separate-login model. Both remain open
  (§1.2).
- **Not assuming identical permissions.** Not assuming owner-retains-control. Both remain open
  (§1.4).
- **Not designing the invitation UX, token format, or acceptance screens** — entirely dependent on
  §1.2's outcome; premature to spec.
- **Not extending or reusing `backend/src/routes/invitations.ts` / `createPrivilegedAccountFromInvitation`
  as-is** — §0.3 established this is a structurally different (organizational, admin-gated)
  mechanism; a household invitation is new code, not a parameter added to the existing one, though
  the existing implementation (opaque token, hash-at-rest, TTL, idempotency-keyed creation) is a
  reasonable **pattern** for `backend-engineer`/`solution-architect` to reference at Stage 5.
- **Not touching claims or recovery-case behavior.** Whether a household member can file a claim on
  a shared asset is out of scope for this document (claims backend does not exist at all yet, per
  `CLAUDE.md`) and would need its own pass once Feature 014's account model exists and a claims
  feature is scoped.
- **Not deciding pricing.** §1.5 is flagged, not resolved.

---

## 4. Acceptance criteria

**None are written in this document.** Per this role's own testability standard (demonstrated in
Feature 013 §4's refusal to write Tier 2/3 criteria against an unmade storage decision), writing
Given/When/Then criteria against an unmade same-login-vs-separate-login decision and an unmade
identical-vs-owner-retains-control decision would fabricate precision that does not exist yet.
Acceptance criteria for this feature are written **after** §1.2 and §1.4 are answered and Stage 2
(`product-manager`) and Stage 5 (`solution-architect`) have produced a committed design — not
before.

---

## 5. Flags for review before Stage 2

- **`product-manager` — required, blocking, and this is the primary ask of this document.**
  Two decisions this role cannot make and Stage 2 cannot proceed without:
  1. **Same login (shared credentials) vs. separate login (independent account, shared household
     access)** — §1.2. This determines the entire technical shape of the feature.
  2. **Identical permissions vs. owner-retains-exclusive-control** — §1.4. This document
     recommends the latter as the safer default absent a stronger stated preference, but does not
     decide it.
  Also needed: a ruling on §1.5's billing questions (is this Pro-tier-only per the existing
  `maxUsers` catalog values, or does it apply to every tier — which would require a catalog
  change) before any pricing-facing copy is written.
- **`cybersecurity-architect` — required before Stage 2 commits to anything.** This is a new
  auth/access-boundary model on top of an account system (Feature 001) that has no precedent for
  more than one identity acting against one policy. Specifically asked to weigh in on: the
  audit-trail and MFA-per-person consequences of Option A vs. B in §1.2 (this document's own
  assessment is that Option A meaningfully weakens existing audit/MFA guarantees — asked to
  confirm or push back), and the blast-radius of Interpretation 1 in §1.4 (any member can cancel/
  remove others) if the owner leans that direction. This role's prior pattern in this codebase
  (Feature 012's Stage 8 CONDITIONAL SIGN-OFF) suggests access-model changes that look small in
  product terms have repeatedly carried real exposure here — treat this one with the same scrutiny
  from the start rather than catching it late.
- **`compliance-specialist` — required before Stage 2 commits to anything.** A family member's
  personal data (their profile, their registered devices' location history, their activity) becomes
  visible to the policy owner, and vice versa, once any sharing model ships — this is a **new
  data-sharing relationship** between two natural persons that did not exist in this platform
  before, and needs its own lawful-basis/POPIA analysis (consent at invitation time, what a member
  sees about the owner and other members, what happens to a removed member's data — mirrors the
  §1.3 asset-on-removal question but for personal data, not just assets). Also asked to weigh in on
  whether a minor (a plausible "family member" in the household-sharing sense) requires different
  handling than an adult invitee — not raised elsewhere in this document and worth an explicit
  ruling rather than silent assumption either way.
- **`database-architect` — light, non-blocking today; blocking once §1.2 is answered.** Confirm
  the data-model shape for whichever login model is chosen (a relationship/membership table vs. a
  new `UserType` vs. something else), and how it interacts with the existing strictly-1:1
  `accountId` scoping baked into every Feature 004 Mongo query (`policies.ts`, `assets.ts`
  repositories) — this is real migration/schema work either way, not just an API surface change.
- **`backend-engineer` — light, non-blocking today.** Flagged in advance that if/when this
  proceeds, the accountId-scoped authorization checks in `policies.ts`, `assets.ts`, and every
  other Feature 004+ route need a second look — not a rewrite assumption, just advance notice that
  the "resolve the owning accountId, then compare to `req.auth.accountId`" pattern used throughout
  today's codebase will need a new resolution step (household/membership lookup) wherever this
  feature's access model ends up landing.
- **`payment-engineer` — light, non-blocking today.** Forward-looking only per §1.5 — no billing
  system exists yet to design against, but flagged so proration/per-seat billing (if the owner
  wants tiered-by-headcount pricing) is on the radar once payments (north-star M2) exists.
- **`ux-researcher` / `ui-designer` — not yet.** No design work should start until §1.2/§1.4 are
  answered; premature UI exploration against an unmade access-model decision would need to be
  redone.

---

## 6. Out of scope (this feature folder, today)

- Any committed engineering scope (§2 — nothing here is buildable-now scope).
- A decision on shared vs. separate login (§1.2) — explicitly reserved for
  owner/`product-manager`.
- A decision on identical vs. owner-retains-control permissions (§1.4) — explicitly reserved for
  owner/`product-manager`.
- Asset-ownership-on-member-removal rules (§1.3) — reserved for `product-manager` +
  `compliance-specialist`.
- Billing/per-seat pricing changes (§1.5) — reserved for `product-manager`.
- Claims/recovery-case interaction with shared household assets — claims backend does not exist
  yet regardless.
- Any change to the existing staff invitation mechanism (`invitations.ts`) — confirmed structurally
  unrelated (§0.3), not reused as-is.

---

**Next lifecycle step:** Stage 1 is complete as a **framing** document — it deliberately commits no
buildable scope. Stage 2 (`product-manager`) cannot meaningfully proceed until the platform owner
answers, at minimum, the two questions in §1.2 and §1.4. This document recommends those two
questions be put back to the owner directly, with the concrete options above, before any further
lifecycle work (including Stage 2 scoping conversations) is scheduled.
