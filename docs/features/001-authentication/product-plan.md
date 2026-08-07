# Feature 001 — Customer Account Creation & Authentication

**Lifecycle stage:** 2 — Product Planning
**Stage owner (A):** `product-manager`
**Contributors:** `cto`, `technical-project-manager`, `business-analyst`
**Status:** Approved for scope — proceeding to Stage 3 (UX Research) and, in parallel prep, Stage 5 (Architecture Review) intake
**Input artifact:** [`business-requirements.md`](./business-requirements.md) (Stage 1, `business-analyst`)

---

## 1. Stage 1 Sign-Off

I am signing off Stage 1 (Business Requirements) as **approved for scope**, on the basis of the following resolved decisions from the platform owner and this ruling:

- **Jurisdiction:** South Africa — POPIA is the governing data-privacy framework for this feature. Any compliance-specialist findings on POPIA-specific handling of verification data, consent capture, and audit-log retention (OQ-2, OQ-6) are accepted as binding constraints on downstream stages, whether or not Section 9 of the business requirements doc had landed at the time this plan was written.
- **OQ-1 (identity model) — RESOLVED, final:** Email is the sole mandatory primary identifier for all four account types. Phone number remains optional and additive (SMS-based MFA/verification only), per BR-1 as drafted. This is no longer open — Stage 6 (Database Design) should treat it as settled, not provisional.
- **OQ-4 (support agent MFA) — RESOLVED, final:** Support agents carry the same mandatory, non-skippable MFA requirement as admin and security-company operator accounts. The "four-role model" reading in the business requirements doc (Section 2, FR-9) is ratified as written. No differentiated MFA posture for support agents.
- **OQ-3 and OQ-5** were left open to product-manager judgment. Rulings below (Section 2).

Everything else in the Stage 1 document — the functional requirements (FR-1 through FR-25), business rules (BR-1 through BR-7), scope boundaries (Section 5), and acceptance criteria (AC-1 through AC-12) — is approved as the scope baseline for this feature. No changes to that document's substance are made here; this plan builds on top of it.

**Compliance dependency note:** OQ-2 and OQ-6 are compliance-specialist's to resolve, not mine, and this sign-off does not presume their answers. If compliance-specialist's Section 9 findings (once appended) impose a requirement that contradicts anything in this plan — e.g., a POPIA-driven change to consent capture at signup, or a shorter/longer audit-log retention window than assumed — this plan is revised before Stage 5 exits, not silently overridden. Flagging this explicitly per my Pre-Approval Checklist item on compliance consultation.

---

## 2. Product Rulings on Remaining Open Questions

### OQ-3 — Should customer MFA become mandatory later (e.g., above a policy-value/asset-count threshold)?

**Ruling:** Yes, in principle — but not as a hardcoded rule shipped now. Customer MFA stays **optional at launch** (per Stage 1's FR-25), and I am ruling that the platform **will** introduce a risk-based mandatory-MFA trigger in a future feature, most plausibly tied to cumulative insured asset value and/or number of registered assets on an account, once policy/asset features exist to define what "high value" means.

**Rationale:**
- We cannot define a sensible threshold today — policy tiers, coverage limits, and asset valuation don't exist yet (they're explicitly out of scope for this feature per Section 5 of the Stage 1 doc). Committing to a specific number now would be a guess dressed up as a decision.
- However, the *direction* matters for Stage 6 (Database Design): the account/session data model must **not** assume MFA enrollment is a fixed, permanent boolean tied only to role. It needs to accommodate a customer account transitioning into an MFA-required state later without a schema migration — e.g., a `mfa_required` flag or policy-driven enforcement field on the account/session model, decoupled from role-based enforcement.
- This is a product-planning-level instruction to Architecture, not a Stage 1 functional requirement — it doesn't change what ships in this feature's acceptance criteria (AC-1 through AC-12 stand as written), it changes what the data model must be *able to* absorb later.
- Action item: `solution-architect` and `database-architect` should treat "future risk-based mandatory customer MFA" as a known, named future requirement during Stage 5/6, not a surprise. This is called out explicitly in Section 5 below.

### OQ-5 — What triggers security-company operator account deactivation when a partner contract ends?

**Ruling:** Deactivation is **admin-triggered, not automatic**, and happens at the **organization level, cascading to its operators** — there is no autonomous system-driven contract-expiry detection in this feature or its near-term successors.

Specifically:
- When a partner organization's contract ends, an admin (not a system timer, not the security-company operator themselves) marks the partner organization as inactive via an admin-facing action (mechanism deferred to a future partner-management feature — not this one).
- That action cascades: every security-company operator account scoped to that organization (per BR-7's org-association) transitions to `suspended` (using the account-state model this feature already defines in BR-5), not `deactivated` outright — this preserves the account and its audit trail in case of contract renewal, dispute, or wind-down data obligations, and matches BR-5's existing state machine rather than inventing a new one.
- A manual admin step to move `suspended` → `deactivated` remains available for a clean, final closure once wind-down is confirmed complete.

**Rationale:**
- Contract lifecycle and partner-organization management are not modeled anywhere in scope yet (this feature only establishes that an operator account is associated with *a* partner org at creation — BR-7 — not the org's own lifecycle). Inventing an automatic trigger now would mean designing partner-contract state without a feature that owns it.
- Reusing the existing `suspended`/`deactivated` states (BR-5) rather than adding a new state avoids a schema change later and keeps this feature's account-state model the single source of truth for account lifecycle, consistent with how BR-5 already scopes "what triggers suspension for cause" as future work.
- Making this admin-triggered (not self-service, not automatic) matches this feature's existing invite-only, admin-controlled provisioning model for privileged/partner accounts (BR-3) — deactivation should mirror provisioning in who holds control.
- Action item: this ruling seeds the future "Partner Organization Management" feature (not yet on the roadmap by name) with a concrete requirement — org-level status changes must cascade to scoped operator accounts. Flagged to `technical-project-manager`/`cto` as a roadmap note, not built now.
- No schema/architecture action is required *of this feature* beyond what BR-7 and BR-5 already provide — the org-association field and the suspended/deactivated states already exist in Stage 1 scope. This ruling clarifies *behavior*, not *data model*, so it doesn't add work to Stage 6.

---

## 3. Target Milestone

This feature is scoped to **Phase 1 — MVP** per [`08-roadmap.md`](../../organization/08-roadmap.md).

It is the **first milestone within Phase 1** and a **hard blocker** for every other Phase 1 item:

- Asset registration (manual entry) — requires an authenticated, verified customer account to attach assets to.
- Policy/subscription selection and Stripe-class payment integration — requires a verified identity per BR-2 before any commerce action, and requires admin/operator authentication before those roles can service policies.
- Admin Dashboard (view customers, policies, assets) — requires admin accounts, invitation flow, and MFA enrollment to exist first.

**No policy, subscription, or asset-registration feature enters Stage 2 (Product Planning) for its own track until this feature has cleared Stage 9 (Development) and Stage 10 (QA Testing).** This is a sequencing rule, not just a preference — the roadmap's Phase 1 framing depends on identity existing before anything that's "identity-attached" can be built or even meaningfully designed (API contracts, database schema, and RBAC all key off the account/session model this feature defines).

---

## 4. Prioritized, Sequenced Backlog

Sequencing logic: provisioning/identity primitives before login; login before session mechanics that depend on it; MFA enrollment before any flow that requires MFA verification; reset/revocation last since they depend on session and MFA infrastructure existing first. Within a priority tier, items are unordered relative to each other unless a dependency is noted.

| # | Priority | Story | Acceptance Summary | Size | Depends On |
|---|---|---|---|---|---|
| 1 | P0 | **Account data model & state machine** | Account exists in `pending_verification → active → suspended → deactivated`, keyed on email as sole mandatory identifier (BR-1, BR-5) | M | — |
| 2 | P0 | **Customer signup with email verification** | Customer submits email + password meeting strength policy, account created `pending_verification`, verification email sent, duplicate signup rejected without enumeration (AC-1, AC-2) | M | #1 |
| 3 | P0 | **Email verification completion & commerce gate** | Completing the email challenge transitions account to `active`; unverified accounts are blocked from policy/asset entry points and redirected to verification (AC-3, AC-11) | S | #2 |
| 4 | P0 | **Admin/security-company operator invitation flow** | Admin issues an invitation (scoped to a partner org for security-company operators per BR-7); invitee sets password on first login; no public signup path exists for these roles (AC-12, FR-6, FR-7) | L | #1 |
| 5 | P0 | **Support agent invitation flow** | Same invitation mechanics as #4, applied to support agent role, confirmed to carry the same mandatory-MFA posture (OQ-4 resolution) | S | #4 |
| 6 | P0 | **MFA enrollment for privileged roles (admin, security-company operator, support agent)** | First login after invitation forces MFA enrollment before the account becomes usable; no skip/defer path exists (AC-7, BR-4) | L | #4, #5 |
| 7 | P0 | **Login + session issuance (all roles)** | Correct email + password issues a session (access + refresh token) for verified/active accounts; every attempt (success/failure) is audit-logged (AC-4, FR-8, FR-12) | M | #3, #4 |
| 8 | P0 | **Privileged login MFA challenge** | Admin/security-company operator/support agent login prompts for MFA after password verification; no session issued until MFA succeeds (AC-6, FR-9) | M | #6, #7 |
| 9 | P0 | **Failed-login rate limiting & lockout** | Repeated failed attempts trigger rate-limiting/backoff per policy; failures are audit-logged (AC-5, FR-11) | S | #7 |
| 10 | P1 | **Customer optional MFA enrollment & login enforcement** | Customer can opt in to MFA; once enabled, it is enforced identically to privileged-role login (FR-10, FR-25); data model leaves room for future mandatory-MFA trigger per OQ-3 ruling | M | #7, #6 (shares MFA verification mechanics) |
| 11 | P1 | **Logout / session invalidation** | Any authenticated user can log out; access and refresh tokens are invalidated immediately, verified by a rejected subsequent request (AC-8, FR-13, FR-14) | S | #7 |
| 12 | P1 | **Session handling — mobile device binding** | Customer Mobile App sessions/refresh tokens are bound to device to reduce token-theft blast radius (FR-20) | M | #7 |
| 13 | P1 | **Session handling — dashboard idle timeout** | Admin/Security Company Dashboard sessions enforce idle-timeout expiry appropriate to privileged browser sessions (FR-21) | S | #7 |
| 14 | P1 | **Password reset flow (all roles)** | User requests reset via email without enumeration; single-use, time-limited reset link/code; successful reset invalidates all existing sessions and is audit-logged (AC-9, FR-15, FR-16, FR-17) | M | #7, #11 |
| 15 | P1 | **Password reset MFA re-verification for privileged roles** | Admin/security-company operator/support agent password reset requires MFA re-verification before the reset finalizes — no MFA bypass via reset (AC-10, FR-18) | S | #14, #6 |
| 16 | P2 | **Explicit/admin-forced session revocation** | A session revoked by logout, reset, or admin action is unusable immediately, not at next natural expiry (FR-22) | M | #11, #14 |
| 17 | P2 | **Auth audit log surface** | Login, logout, reset, and MFA events are captured in a queryable audit log consistent with `06-security-standards.md`, pending compliance-specialist retention ruling (OQ-6) | M | #7, #11, #14 |

**Backlog total:** 17 stories. P0 items (#1–#9) constitute the minimum viable authentication slice — customer signup/verification, privileged invitation + MFA, and baseline login — and should be sequenced first within Stage 9 (Development). P1 items complete the feature's full Stage 1 acceptance criteria (session hygiene, password reset). P2 items are hardening/observability that should not block Stage 10 (QA Testing) entry for the P0/P1 core but must land before this feature is considered production-ready per the security standards doc's audit-logging requirement.

---

## 5. Forward Notes for Architecture (Stage 5/6)

Flagging two items so they are not treated as new scope when they surface later — they are anticipated now, per this plan, not invented at Architecture Review:

1. **OQ-3 follow-through:** The account/MFA data model must support a future risk-based mandatory-MFA enforcement path for customers (e.g., a policy-driven or asset-value-driven flag), decoupled from the role-based enforcement this feature ships. Do not hardcode "customer MFA optional" as a permanent, unconditional rule in the data layer.
2. **OQ-5 follow-through:** The security-company operator's partner-org association (BR-7) will eventually need to react to a future partner-organization lifecycle feature that cascades org-level deactivation down to scoped operator accounts, using the existing `suspended`/`deactivated` states from BR-5. No schema action needed now — this is a heads-up for when that future feature reaches Stage 6, so it's recognized as reusing this feature's state machine rather than requesting a new one.

---

## 6. What Happens Next in the Lifecycle

Per [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md), this feature now moves to:

- **Stage 3 — UX Research**, owned by `ux-researcher`, contributors `ui-designer` and `product-manager`. Entry criterion ("item is scoped") is satisfied by this document. Expected output: user flow / journey maps for signup, verification, login, MFA enrollment, and password reset across all three surfaces (mobile app, admin dashboard, security-company dashboard).
- **Stage 5 — Architecture Review**, owned by `solution-architect`, with `backend-architect`, `database-architect`, `mobile-architect`, `frontend-architect`, `integration-architect`, and `cto` as contributors. This does not start until Stage 4 (UI Design) produces a validated flow — per the lifecycle table, Stage 5's entry criterion is "design is ready" — but this plan's backlog (Section 4) and forward notes (Section 5) are the scoping input Architecture will work from once its turn comes.

No stage is skipped. This plan does not authorize Development (Stage 9) to begin — that remains gated behind Stages 3, 4, 5, 6, 7, and 8 (the last two — API Design and Security Review — being hard gates per the lifecycle doc, not optional for schedule pressure).

---

## 7. Pre-Approval Checklist (product-manager self-review)

- [x] Problem is validated with clear business justification — Stage 1's business-analyst doc grounds this in a concrete, non-optional dependency (no other Phase 1 feature can exist without identity); no user-research validation was needed at this stage since the *need* for authentication is a structural platform requirement, not a discretionary UX bet — user-research on *how* it should feel is Stage 3's job, correctly deferred there.
- [x] PRD-equivalent (this plan + Stage 1 doc) includes acceptance criteria specific enough to test against — inherited from Stage 1's AC-1 through AC-12, unchanged, plus each backlog story in Section 4 maps to one or more of those ACs.
- [ ] Feasibility and rough sizing confirmed with solution-architect or relevant domain architect — **not yet done**; the S/M/L sizing in Section 4 is my own relative estimate pending Stage 5 architecture input. This is expected at this point in the lifecycle (Stage 2 precedes Stage 5) and is not a blocker to proceeding, but it is not yet confirmed and should not be read as engineering-validated.
- [x] Subscription/tier impact reviewed — **N/A for this feature**; no subscription or tier logic exists in this slice (Stage 1 Section 5, Out of Scope), confirmed no gating-logic changes are introduced here.
- [x] Compliance-specialist consulted — Stage 1 status line confirms compliance-specialist review is underway/complete for OQ-1, OQ-2, OQ-4, OQ-6; this plan explicitly defers to that review (Section 1) and does not override it. POPIA is named as the binding jurisdiction.
- [x] Dependencies on open vendor decisions flagged, not assumed resolved — MFA factor mechanism (FR-24), password-policy specifics (FR-2), and SMS/notification delivery vendor are all explicitly left open to `authentication-engineer`/`cybersecurity-architect`/`notification-engineer` in Stage 1 and not assumed here.
- [x] Success metrics defined before development starts — see addition below; was missing from Stage 1 and is added here since Stage 2 is the appropriate stage to define it.
- [ ] technical-project-manager has confirmed the item fits current sprint/release capacity — **not yet done**; this plan produces the backlog technical-project-manager needs for that confirmation (Stage 2's exit artifact is "prioritized backlog item, scoped, target milestone assigned" — delivered here) but capacity confirmation itself is a follow-up action, not something product-manager can self-certify.

### Success Metrics (added at Stage 2, per checklist gap above)
- Signup-to-verified conversion rate (started signup vs. completed email verification) — target defined once baseline data exists post-launch.
- Invitation-to-first-login completion rate for admin/security-company operator/support agent accounts (measures invitation flow friction).
- MFA enrollment completion rate for privileged roles (should trend to 100% given it's non-skippable — a gap indicates a broken flow, not a preference signal).
- Login failure/lockout rate (security health signal, not a growth metric).
- Password reset completion rate and time-to-reset (support-burden signal).

**Outstanding before Stage 9 (Development) can begin:** solution-architect feasibility/sizing confirmation (Stage 5), technical-project-manager capacity confirmation, and full closure of compliance-specialist's OQ-2/OQ-6 findings once Section 9 of the Stage 1 doc is finalized. None of these block Stage 3 (UX Research) from starting now.
