# Call Centre Dashboard — Feature Candidates (Product Planning proposal)

**Author:** `product-manager`
**Date:** 2026-10-23
**Status:** Proposal only — nothing here is committed, scoped for Stage 1 (Business Requirements), or
authorized for implementation. This is a prioritized candidate list for the business owner to choose
from, grounded in the current code (`src/call-centre/`, `backend/src/routes/support-lookup.ts`,
`backend/src/routes/support-cases.ts`) and this feature's existing lifecycle record (`02-...`,
`03-architecture-review-phase2.md`, `api-design.md`, `security-review.md`). None of these items has
gone through Stage 1 sign-off; each still needs business-requirements elicitation,
`solution-architect` sizing, and (per house rule) a `compliance-specialist` + `cybersecurity-architect`
pass before any Stage 9 implementation, same as every prior increment on this feature.

## Current scope (confirmed from code, 2026-10-23)

A support agent can: log in (MFA required), see a Home page with an open-case count, look up a
customer by email/phone/policyId (`CustomerLookupPage.tsx`), add a note to an open recovery case from
that lookup, and create/list/filter/view/update-status/add-notes on support cases (`SupportCasesPages.tsx`).
That is the entire surface. `scope=all` case listing, the escalate-to-recovery-case endpoint, and any
supervisor/team-queue concept are all **explicitly withheld or not-authorized** already (SR-010-2,
C-010-4, OQ-010-4) — this proposal does not re-litigate those without new justification, and flags
rather than re-proposes them where they overlap.

## Ranked candidates

### 1. Surface asset identifying details in the customer-lookup result (make/model/serial/IMEI)
**What:** Today `GET /customer-lookup` returns only `assetType`, `displayName`, and `status` per
asset (`support-lookup.ts` lines ~143–148). The underlying asset documents already carry `make`,
`model`, `serialNumber`, and (for phones) `imei` (`backend/src/lib/asset-validation.ts`). Add these
fields to the existing, already-authorized response and render them in `CustomerLookupPage.tsx`'s
asset list.
**Why an agent needs it:** When a caller describes a stolen laptop or phone, the agent currently has
no way in-product to confirm which registered asset they mean beyond a generic display name — serial
number/IMEI is the actual identifying detail a security-company dispatch or a later recovery case will
need.
**Effort:** Small. No new route, no new privilege level, no new audit event — it's an additive field
on an endpoint already covered by `privileged_data_access` auditing. Likely still warrants a quick
compliance sign-off note (additive PII field on an existing audited disclosure) but not a fresh Stage 8
review from scratch.
**Blocked on:** Nothing. Backend already has the data.

### 2. Tier 2 caller identity verification (clears C-010-4)
**What:** A defined mechanism (e.g., OTP to the registered phone/email, or knowledge-based challenge)
for an agent to mark a call as verified, replacing the permanent "Unverified" badge every case shows
today (`CallerVerifiedBadge`, `SR-010-3`).
**Why an agent needs it:** It's the single biggest blocker already on record. The UI itself warns
agents that nothing they can look up is proof of identity. It also directly unblocks #3 below and any
future privileged action (credential reset, policy changes) that should never be handed to an
unverified caller.
**Effort:** Medium/Large — this is `cybersecurity-architect`-owned design work (C-010-4 is explicitly
"not this role's authority" per `api-design.md` §1), not a UI task. May be able to reuse existing
OTP/MFA primitives from Feature 001 rather than building new verification infrastructure — worth
sizing with `solution-architect` before committing.
**Blocked on:** Nothing external (no vendor dependency) — blocked only on this design work happening,
which is squarely in scope for this org to do now.

### 3. Escalate a support case to a recovery case (FR-18–21)
**What:** The exact contract already exists, written and parked (`api-design.md` §7) — an agent-facing
`POST /support-cases/:caseId/escalate` that creates a real `recovery_cases` row from a phone-reported
theft, linked back to the originating support case.
**Why an agent needs it:** Right now an agent taking a theft report over the phone has no in-product
path to actually open the recovery case — the contract's own existence confirms this gap was already
identified. This is the natural "next step" after a lookup, not a new idea.
**Effort:** Medium — the API shape is already fully specified; most of the work is clearing its two
named blockers.
**Blocked on:** #2 above (C-010-4) and, independently, INC-001-C-8 (the out-of-band account-holder
notification step). Do not schedule this before both clear — restated per the inherited restriction in
`api-design.md` §7, not loosened by this document.

### 4. Dedicated recovery-case detail view (read-only)
**What:** A standalone case page (reusing the admin dashboard's `DetailGrid`/detail-page pattern
already in `src/admin/pages/AccountDetailPage.tsx`) instead of the current small inline panel inside
customer-lookup results — full note history, status, reference number, reported date, on its own
route.
**Why an agent needs it:** As call volume on a given recovery case grows (multiple call-backs, multiple
agents over days), the current inline-only view inside a fresh lookup makes it awkward to just pull up
"case REF-xxxx" directly. A support-case equivalent already exists (`/call-centre/cases/:id`); recovery
cases don't have the same.
**Effort:** Small/Medium — mostly reusing existing design-system patterns and an existing read endpoint
(`ctx.recoveryCases`), plus one new `GET /recovery-cases/:id` route scoped the same way as the existing
notes-append route.
**Blocked on:** Nothing.

### 5. Scoped account-recovery actions for locked-out callers (e.g. trigger password/MFA reset)
**What:** A narrow, agent-triggerable action — "send this customer a password-reset email" or "clear
this customer's MFA lockout" — distinct from the admin-only `PATCH /admin/accounts/:id/state` (which
is a full account-state change gated by step-up MFA, not something to hand to a call-centre role).
**Why an agent needs it:** "I'm locked out of the app" is a classic call-centre call; agents currently
have no tool for it at all.
**Effort:** Medium/Large — net-new privileged write surface, needs a full Stage 1–8 pass including a
fresh security review (credential-reset actions are a textbook account-takeover vector).
**Blocked on:** #2 (caller verification) should land first — issuing a credential reset on an
unverified caller's say-so is the exact risk #2 exists to close. Recommend sequencing after #2, not
before.

### 6. Read-only notification-preferences view in customer lookup
**What:** Surface which channel(s) (SMS/push/email) a looked-up customer has notifications enabled on
— today only exposed via the customer's own `GET /notifications/preferences` self-service endpoint.
**Why an agent needs it:** Common call type: "I didn't get an alert." Agent currently cannot check
whether the customer is even subscribed to that channel without escalating to engineering.
**Effort:** Small/Medium — one new agent-scoped read route following the exact audit pattern already
established in `support-lookup.ts`, plus a small UI addition.
**Blocked on:** Nothing, but needs its own (small) security/compliance pass since it's a new endpoint,
even though the pattern is well-precedented.

### Flagged, not proposed: supervisor/team case queue (`scope=all`)
Noting for awareness only, not proposing to build: `GET /support-cases?scope=all` is deliberately
withheld today (SR-010-2) and there is no `assignedAgentAccountId` write path (OQ-010-4) — i.e. no
supervisor/team-queue concept exists anywhere in this feature by design. If/when agent headcount grows
enough to need one, that's a new role + RBAC design and a fresh Stage 8 review to lift SR-010-2, not an
incremental add to the current agent-only surface. Listed here so the business owner knows it was
considered and deliberately left off this list, not missed.

## Summary table

| # | Candidate | Value | Effort | Blocked on |
|---|---|---|---|---|
| 1 | Asset identifying details (make/model/serial/IMEI) in lookup | High | Small | Nothing |
| 2 | Tier 2 caller verification (clears C-010-4) | High | Medium/Large | Nothing external |
| 3 | Escalate support case → recovery case (FR-18–21) | High | Medium | #2, INC-001-C-8 |
| 4 | Dedicated recovery-case detail view | Medium | Small/Medium | Nothing |
| 5 | Scoped account-recovery actions (password/MFA reset) | High | Medium/Large | #2 (sequencing) |
| 6 | Read-only notification-preferences view | Medium | Small/Medium | Nothing |
| — | Supervisor/team queue (`scope=all`) | — | — | Flagged only, not proposed |

## Addendum: broader/speculative categories deferred, not dropped (2026-10-23)

Business owner reviewed this list and asked, in effect, "is this everything?" The answer given was no —
this document is a deliberately curated shortlist of near-term, low-blocker, grounded-in-current-code
candidates, not an exhaustive brainstorm. The owner's direction was to keep the broader set in mind for
a future pass rather than build any of it now. Recorded here so that intent isn't lost:

Categories explicitly out of scope for this list, not evaluated for value/effort/blockers, and deferred
to a future candidate pass (not rejected):

- Telephony/IVR integration (call routing, click-to-dial, screen-pop)
- Call recording and playback
- Canned responses / macros for common case notes
- Case tagging / categorization taxonomy
- SLA / response-time tracking on support cases
- Agent performance metrics / productivity reporting
- Knowledge-base panel inside the agent UI
- Post-call CSAT surveys
- Multi-language support for the agent UI
- Duplicate-case detection across lookups
- Shift handoff notes between agents

None of these has had a value/effort/blocker assessment done against current code the way items 1–6
above have. Before any of them is scheduled, this document's own Stage 1 caveat applies equally: they'd
need business-requirements elicitation, `solution-architect` sizing, and a `compliance-specialist` +
`cybersecurity-architect` pass, same as everything else on this feature.

*Appended by `cto` (orchestration), 2026-10-23 — append-only addition, no prior content changed.*
