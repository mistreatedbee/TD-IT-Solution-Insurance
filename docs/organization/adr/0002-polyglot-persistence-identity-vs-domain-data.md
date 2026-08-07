# ADR-0002: Polyglot Persistence — Supabase for Identity, MongoDB for Domain Data

Status: Proposed
Date: 2026-08-07
Deciders: `database-architect`, `backend-architect`, `cybersecurity-architect` — proposed for ratification by `solution-architect` + `cto`

## Context

ADR-0001 set MongoDB as the platform's single database, chosen primarily because a document model fits the naturally polymorphic asset types (a vehicle, a laptop, and a GPS tracker have different attribute shapes) better than a rigid relational schema. That reasoning holds and is not in question here.

Independently, the platform owner has an already-provisioned Supabase project — hosted Postgres plus Supabase Auth — and has asked whether the platform can use **both** Supabase and MongoDB rather than MongoDB alone, specifically for identity.

This question arrives at a natural decision point: Feature 001 (Customer Account Creation & Authentication) is at Stage 2 of the lifecycle, heading into Stage 5 (Architecture Review). Feature 001's business requirements (`docs/features/001-authentication/business-requirements.md`) define a substantial account/session/MFA surface — FR-1 through FR-25 — including invitation-only provisioning for three privileged roles (admin, security-company operator, support agent), non-negotiable MFA for those roles, password-reset flows that re-verify MFA, refresh-token rotation, and device-bound mobile sessions. Building all of this from scratch on MongoDB is a substantial, security-sensitive undertaking that `authentication-engineer` would otherwise own end-to-end. Supabase Auth already implements a large portion of this surface as a maintained, security-reviewed primitive.

We evaluate here whether splitting persistence — identity/account/session data in Supabase (Postgres + Supabase Auth), everything else (policies, assets, GPS/location history, claims) staying in MongoDB per ADR-0001 — is sound, and under what conditions.

## Decision

Adopt a **polyglot persistence split along a clean domain boundary**, not a database swap:

- **Supabase (Postgres + Supabase Auth) is the system of record for identity/account/session data** — the exact domain Feature 001 defines: accounts, account states (`pending_verification` → `active` → `suspended` → `deactivated`), credentials, sessions/refresh tokens, MFA enrollment and factors, invitations, and authentication audit events (login/logout/reset/MFA events per FR-12, FR-17, backlog item #17).
- **MongoDB remains the system of record for policies, assets, GPS/location history, and claims**, unchanged from ADR-0001 and for the same reason: polymorphic asset-type schemas (vehicle vs. laptop vs. GPS tracker) are a genuinely better fit for a document model than a rigid relational one, and nothing about this ADR touches that domain.
- The Node.js/TypeScript backend (per ADR-0001) is the only layer permitted to talk to both stores. No client (mobile app, admin dashboard, security-company dashboard) talks to Supabase or MongoDB directly — all access is mediated through the backend API, consistent with `backend-architect`'s API-first standard.
- A MongoDB `policy`, `asset`, or `claim` document references the owning account by a stable identifier (`account_id`) that is the Supabase account's primary key. This is a **soft reference across systems, not a foreign key** — see Consequences below for what that costs and who owns mitigating it.

### Why this does not contradict ADR-0001

ADR-0001 chose MongoDB for one specific, still-valid reason: asset-type polymorphism. It did not evaluate identity/session data — Feature 001 (which defines that domain in detail) did not exist yet when ADR-0001 was written. This decision **narrows** ADR-0001's scope to the domain its rationale actually supports (policies, assets, GPS history, claims) rather than reversing it. MongoDB is not being replaced; it is being confined to the problem it was chosen to solve.

This is also not a surprise reopening. ADR-0001's own Revisit Trigger explicitly anticipated exactly this class of reconsideration: *"MongoDB's transaction/consistency model proves insufficient for payment/claims correctness under real load"* names consistency-sensitive, relationally-shaped data as the trigger condition for revisiting the database decision. Identity/session data — unique-constraint-heavy, relationally simple, security-critical, and requiring strong consistency on things like "has this account enrolled MFA" or "is this session still valid" — is precisely that category, arriving earlier than ADR-0001's authors may have expected, but squarely inside the trigger they wrote. We are exercising that trigger for identity specifically, not for the whole database.

## What Supabase Auth buys against Feature 001's actual requirements

Evaluated against the authoritative FR list in `docs/features/001-authentication/business-requirements.md`:

**Covered largely out of the box by Supabase Auth:**
- FR-1, FR-8: email/password signup and login primitives.
- FR-3: unverified-account creation plus email verification challenge (Supabase's built-in email-confirmation flow maps directly to BR-5's `pending_verification` state, though the state label itself and the commerce-gating behavior in BR-2/FR-4 are ours to implement).
- FR-13, FR-19, FR-22: session issuance, short-lived access tokens with refresh-token rotation, and immediate session invalidation on logout/revocation — this is Supabase Auth's session model, not something `authentication-engineer` needs to build from first principles.
- FR-15, FR-16: password-reset request and single-use, time-limited reset links.
- FR-17: session invalidation on password reset (Supabase invalidates refresh tokens on password change).
- A baseline MFA (TOTP) enrollment and challenge primitive exists in Supabase Auth, which is a real head start against FR-9, FR-23, and the mechanism half of FR-24.

**Requires real custom work on top, not covered by Supabase Auth as shipped:**
- BR-4 / FR-9 / FR-23's specific business rule — MFA mandatory and non-skippable for exactly three named roles (admin, security-company operator, support agent), optional for customers (FR-25), with no admin bypass short of a `cto`-signed risk acceptance — is a platform-specific authorization policy Supabase Auth has no concept of. `authentication-engineer` must build this as an enforcement layer in the backend (or via Postgres row-level policies / a `role` + `mfa_required` model in the account schema), not assume Supabase provides it.
- FR-6, FR-7, BR-3: invitation-only provisioning for admin/security-company operator/support agent, including security-company operator's mandatory partner-org association at creation (BR-7), and forced password-creation-plus-MFA-enrollment on first login. Supabase Auth supports an admin-invite primitive at the mechanism level (sending the invite), but the *business workflow* — who can trigger an invite, org-scoping, forced first-login flow — is bespoke and belongs to `authentication-engineer` and `backend-architect`.
- FR-5, AC-2: anti-enumeration on duplicate signup needs to be verified against Supabase's actual error responses, not assumed; if Supabase's default behavior leaks existence, the API layer must normalize it.
- FR-11: rate-limiting/lockout thresholds and BR-4's exact re-prompt cadence are policy decisions still owned by `authentication-engineer`/`security-engineer`, layered on top of whatever baseline throttling Supabase provides.
- FR-20: mobile device-binding for the Customer App is an application-level control `authentication-engineer` builds against Supabase-issued tokens; Supabase does not do this natively.
- FR-21: dashboard idle-timeout policy is likewise a backend/frontend concern layered on top of Supabase sessions.
- OQ-3's forward requirement (product-plan.md Section 5.1) — a future risk-based mandatory-MFA trigger for customers, decoupled from role — needs a `mfa_required` field or policy hook in the account schema that is *not* a default Supabase concept; this must be designed in now so it isn't a migration later.
- FR-12, FR-17, backlog item #17: the authentication audit log (login/logout/reset/MFA events, with compliance-specialist's 12-month retention-and-purge policy from Stage 1 Section 9.3) is not something Supabase Auth provides as a compliant, purgeable log out of the box — this needs its own table/mechanism, designed jointly by `database-architect` and `security-engineer`, satisfying POPIA's retention-limitation principle.

**Net assessment:** Supabase Auth is a credible accelerant for the mechanical parts of Feature 001 — password storage, token issuance/rotation, baseline MFA factor management, verification/reset link mechanics — but it does not remove `authentication-engineer`'s work. It removes the highest-risk-to-get-wrong-from-scratch pieces (credential storage, token rotation, MFA cryptographic mechanics) and leaves the platform-specific business rules (role-based MFA mandate, invitation workflows, audit retention) as work that still has to be designed and built by us. This is a sound tradeoff specifically because it relocates risk away from "did we implement token rotation correctly" toward "did we correctly configure and layer policy on a maintained primitive" — a better risk profile for a security-critical surface.

## Real costs of the split (this is not free)

- **Two systems to operate, monitor, and back up.** `devops-engineer` and `site-reliability-engineer` now own two connection-pooling and operational surfaces — a MongoDB replica set/cluster and a hosted Postgres instance — with two sets of health checks, two backup/restore procedures, and two failure domains instead of one. This is a genuine, ongoing operational cost, not a one-time setup cost, and should be sized accordingly before Stage 8.
- **No cross-database referential integrity.** A MongoDB `policy` or `asset` document referencing `account_id` has no foreign-key enforcement — Postgres cannot cascade a delete or enforce that the referenced account exists, and MongoDB has no visibility into Supabase at all. If a Supabase account is hard-deleted (e.g., under a future POPIA deletion request), MongoDB will silently retain orphaned policy/asset/claim documents referencing a non-existent account unless the backend explicitly handles it. **This burden falls on `backend-architect`/`backend-engineer`**: the API layer must enforce referential integrity that the databases themselves cannot — validating `account_id` existence before writes that reference it, and running (or listening for) an explicit cleanup/anonymization step when an account is deleted or deactivated, rather than assuming a database-level cascade will handle it. This is a structural risk, not an edge case, and needs an explicit design in Stage 6/7, not an assumption that it'll be fine.
- **Two sets of database credentials/secrets.** The backend now holds credentials for both a MongoDB connection and a Supabase (Postgres + service-role API key) connection. Per `06-security-standards.md`, no secrets belong in source, environment variables only. This ADR does **not** design the secrets-management mechanics — that is explicitly `security-engineer`'s job, per this platform's ownership model (design vs. implementation split between `cybersecurity-architect` and `security-engineer`). We recommend, without designing it here, that both sets of credentials go through the same secrets-management approach (e.g., a single secrets manager, never checked into code, rotated on the same cadence policy) so we don't end up with two divergent security postures for two database connections. `security-engineer` must produce this plan before implementation (see Required Follow-ups).
- **Two consistency models.** Postgres gives strong relational/transactional consistency for identity — a real win for something as correctness-sensitive as "is MFA enrolled" or "is this session valid." But the backend must still treat the Supabase/MongoDB boundary as an eventual-consistency boundary at the application level: an operation that touches both (e.g., "create account, then seed a default profile-linked record") is not atomic across the two systems and needs saga-style or compensating-action handling, which `backend-architect` must design for rather than assume away.
- **Data-residency and compliance exposure.** Supabase is a third-party-hosted service; depending on the project's configured region, customer PII (email, account metadata, auth audit events) may be processed or stored outside the jurisdiction assumed by Feature 001's compliance review. Stage 1's compliance review (business-requirements.md Section 9) confirmed **POPIA (South Africa)** as the governing framework and explicitly reasoned about data minimality and retention on the assumption of a platform-controlled data store. Introducing a third-party-hosted identity store is a new data-flow that has not yet been reviewed against that determination. **We do not assume compliance sign-off here** — this is flagged as a required follow-up, not a settled point (see Required Follow-ups).
- **Vendor lock-in and portability.** Supabase Auth's MFA/session/invite primitives are convenience over a proprietary API surface. If the platform ever needs to leave Supabase, account/session data migration is a real project, not a `mongorestore`-style operation. This is an accepted tradeoff given the concrete near-term benefit, but should be named explicitly rather than discovered later.

## Alternatives Considered

1. **Build custom auth entirely on MongoDB (status quo, ADR-0001 as originally scoped).** Keep everything — including credential storage, token issuance/rotation, and MFA — inside MongoDB and have `authentication-engineer` build the full auth surface from scratch. Rejected as the default path: it is a strictly harder, higher-risk build (correct password hashing, refresh-token rotation, MFA enrollment/verification, and account-recovery flows are exactly the kind of security-critical, easy-to-get-subtly-wrong mechanics that a maintained, widely-audited primitive is better suited to than a bespoke first build), for no offsetting benefit — MongoDB's polymorphic-schema advantage (ADR-0001's actual rationale) has no bearing on identity data, which is naturally relational (one account, one set of credentials, a bounded set of MFA factors) and gains nothing from a document model. Single-database operational simplicity is real and is the strongest argument for this option, but it is outweighed here by the security-risk reduction of not hand-rolling credential/session/MFA mechanics for a system that will hold access to real-time asset location.

2. **Migrate everything to Postgres/Supabase, drop MongoDB entirely.** Move policies, assets, GPS/location history, and claims into Postgres alongside identity, eliminating the cross-database boundary entirely. Rejected: this reverses ADR-0001's core rationale, not just narrows it. Asset-type polymorphism (vehicle vs. laptop vs. smartphone vs. GPS tracker, each with different attribute shapes) remains a genuinely awkward fit for a rigid relational schema without resorting to sparse-column or JSONB-column workarounds that erode most of Postgres's structural advantages while keeping its rigidity. It would also throw away real, working design work already committed in ADR-0001 for no problem this ADR is trying to solve — the platform owner's question was specifically about identity, not about reversing the domain-data decision. GPS ping ingestion volume (append-heavy, time-series-shaped) is also a poorer fit for Postgres without significant additional tooling (e.g., TimescaleDB) than for MongoDB's native time-series collection support, which `database-architect` is already positioned to use per ADR-0001.

3. **Split by write-frequency instead of by domain (e.g., Supabase for anything transactional, MongoDB only for GPS pings).** Considered briefly and rejected as a boundary rule: it would put policies and claims — which need auditable, append-only history per `database-architect`'s Best Practices — into Postgres, discarding the asset/claim polymorphism benefit ADR-0001 established, while adding no benefit identity data doesn't already get from the domain-based split. A domain-based boundary (identity vs. everything-else) is more legible, more stable over time, and matches how Feature 001 already scopes its own boundary ("this feature covers account identity and session lifecycle only," per business-requirements.md Section 2) than a frequency-based one would.

## Consequences

**Easier:**
- Feature 001's account/session/MFA build gets materially faster and lower-risk for `authentication-engineer`, particularly for the mechanically hard, security-critical parts (credential hashing, token rotation, MFA cryptography).
- Identity data — which is relationally shaped and consistency-sensitive — gets a database model well-suited to it, rather than being forced into MongoDB's document model where it doesn't naturally belong.
- ADR-0001's asset/policy/claim/GPS design work is fully preserved; no rework.

**Harder / new risk accepted:**
- Two operational surfaces instead of one, for `devops-engineer` and `site-reliability-engineer` to run, monitor, and back up.
- Referential integrity across `account_id` references from MongoDB into Supabase must be enforced entirely in the backend API — there is no database-level safety net, and this is a standing responsibility, not a one-time build item.
- Two credential sets to secure, requiring a unified secrets-management plan that does not yet exist (owned by `security-engineer`, not designed here).
- A new cross-border/third-party-hosting data flow that has not yet been reviewed against Feature 001's POPIA determination — compliance risk is open, not closed, until that review happens.
- Application-level handling required for operations that span both stores (no cross-database transactions).

## Revisit Trigger

Reopen this ADR if any of the following occurs:
- `cybersecurity-architect`/`compliance-specialist`'s required data-residency review (see below) finds that Supabase's hosting region or data-processing terms are incompatible with POPIA as determined in Feature 001 Stage 1, and no acceptable region/configuration remedy exists.
- Cross-database referential-integrity failures (orphaned MongoDB documents referencing deleted/non-existent Supabase accounts) surface in practice at a rate the backend-level enforcement isn't catching, indicating the split needs a different consistency mechanism (e.g., an outbox/event-sync pattern) rather than point-in-time backend checks.
- Supabase Auth's role-based MFA/invitation customization proves insufficient to cleanly express BR-4's non-negotiable, no-bypass-without-`cto`-sign-off rule, forcing enough workaround code that the "accelerant" benefit is no longer real.
- Operational cost of running two database surfaces (measured by `site-reliability-engineer`/`devops-engineer` post-launch) materially exceeds the build-time savings this ADR is banking on.
- The platform owner's Supabase project relationship changes (e.g., moving off the free/current tier, project ownership, or hosting terms change) in a way that affects cost, control, or compliance posture.

## Required Follow-ups Before Implementation

This ADR does not authorize implementation on its own. The following must be completed first:

- **`cybersecurity-architect` + `compliance-specialist` review of cross-border/data-residency implications** of using a third-party-hosted Supabase instance for identity/PII data, reconciled against Feature 001 Stage 1's confirmed POPIA determination (business-requirements.md Section 9). This review has not happened yet and is not assumed favorable by this ADR.
- **`security-engineer`'s secrets-management plan** for both the MongoDB and Supabase credential sets (e.g., unified secrets manager, rotation policy, never in code), per `06-security-standards.md`. Not designed in this document.
- **`cto` ratification**, alongside `solution-architect`, per the ADR process in `05-development-standards.md` ("Proposed by any architect, ratified by `solution-architect` + `cto`"). This document is a joint proposal from `database-architect`, `backend-architect`, and `cybersecurity-architect` — it is not itself an approval.
