# Feature 001 — Customer Account Creation & Authentication

**Lifecycle stage:** 1 — Business Requirements
**Stage owner (A):** `business-analyst`
**Contributors:** `product-manager`, `compliance-specialist`
**Status:** Draft — compliance-specialist review complete (OQ-1, OQ-2, OQ-4, OQ-6 resolved, see Section 9); still pending product-manager sign-off on scope and OQ-3/OQ-5 (see Open Questions and Section 9)
**Related system areas (RACI):** Authentication System (A: `cybersecurity-architect`, R: `authentication-engineer`), Customer Mobile App, Admin Dashboard, Security Company Dashboard

---

## 1. Business Problem / Goal

TD IT Solution Insurance has no backend, no database, and no account system yet — every other feature on the roadmap (policy purchase, asset registration, GPS tracking, claims, payments, support) is gated on a customer or operator being identifiable, verified, and authorized to act. This feature is the **foundational vertical slice**: it establishes who a user is and whether they are allowed in, before any feature that depends on "which customer," "which admin," or "which security-company operator" can be built.

Concretely, this must exist first because:
- **No policy can legally or operationally be sold to an unidentified party.** Coverage, billing, and claims all require a durable, verified identity to attach to.
- **Privileged operations (admin, security-company recovery actions) require accountable, MFA-protected identity** before any asset or location data can be exposed to them (per `06-security-standards.md`).
- **Every audit trail the platform is required to keep** (auth events, access to another user's data, payment actions, asset changes) starts with an authentication event. Without this feature, audit logging has nothing to anchor to.
- **Downstream architecture (database schema, API contracts, RBAC permission matrix)** cannot be designed until the account/session model — what identifies an account, what states an account can be in, how sessions and MFA work — is settled here.

**Goal of this feature:** deliver a secure, verifiable account and session foundation — signup, login, logout, password reset, session handling, and MFA for privileged roles — for all four user types, with nothing else layered on top yet.

---

## 2. User Types In Scope

| User type | Surface | Notes |
|---|---|---|
| **Customer** | Customer Mobile App | Self-service signup; MFA offered/recommended, not required, at this stage |
| **Admin** | Admin Dashboard | Internal TD IT Solution staff; account provisioning is invite-only (not self-signup); MFA **required**, non-negotiable |
| **Security-company operator** | Security Company Dashboard | External partner-org staff; account provisioning is invite-only, tied to a partner organization; MFA **required**, non-negotiable |
| **Support agent** | Admin Dashboard (support view) | Internal staff; invite-only provisioning; treated as a privileged role — MFA **required**, non-negotiable, identical treatment to admin and security-company operator accounts. Ratified by compliance-specialist/product-manager per OQ-4 (see Section 9); no longer an open question. |

This feature covers **account identity and session lifecycle only** for all four types. It does not define what each role can subsequently *do* (see Out of Scope).

---

## 3. Functional Requirements

### 3.1 Signup (Customer only, self-service)
- FR-1: A prospective customer can create an account by providing at minimum: email address, password, and a way to verify identity (see Business Rule BR-1 on email vs. phone).
- FR-2: Password must meet a minimum strength policy (length + complexity — exact policy deferred to `authentication-engineer`/`cybersecurity-architect` during Architecture Review; this doc only mandates that a policy exists and is enforced at signup and password reset).
- FR-3: On signup, the system creates the account in an **unverified** state and sends a verification challenge (email link and/or SMS code, per BR-1) before the account is considered active.
- FR-4: A customer cannot complete any policy-purchase or asset-registration action (out of scope for this feature, but the *gate* is in scope) while the account is unverified. See BR-2.
- FR-5: Duplicate signup with an already-registered identifier (email/phone) is rejected with a generic, non-enumerating error message (does not confirm or deny an account exists) to avoid account enumeration.

### 3.2 Admin / Security-Company Operator Provisioning (not self-service)
- FR-6: Admin and security-company operator accounts are **not** created via public signup. They are provisioned by invitation (admin-created for admin/support; admin-created and scoped to a partner org for security-company operators). The invitation flow's exact mechanics (who triggers it, what tooling) is deferred to Product Planning/Architecture — this doc only establishes that self-service signup is explicitly **excluded** for these three role types.
- FR-7: First login after invitation forces password creation and mandatory MFA enrollment before the account is usable — MFA cannot be deferred or skipped for these roles.

### 3.3 Login
- FR-8: All four user types authenticate with identifier (email, or email/phone per BR-1) + password.
- FR-9: Admin, security-company operator, and support agent logins require a second MFA factor on every login (or per session-risk policy — exact re-prompt cadence deferred to `authentication-engineer`), enforced server-side, not just at the client.
- FR-10: Customer MFA is optional at signup; if enabled, it is enforced on login the same way.
- FR-11: Failed login attempts are rate-limited and account lockout/backoff applied after a threshold, to mitigate credential-stuffing/brute-force (exact thresholds deferred to `authentication-engineer`/`security-engineer`).
- FR-12: Every login attempt (success or failure) is written to the audit log per `06-security-standards.md`.

### 3.4 Logout
- FR-13: Any authenticated user can explicitly log out, which invalidates the current session/refresh token.
- FR-14: Logout is available and functionally identical in effect across all four user types and all three surfaces (mobile app, admin dashboard, security-company dashboard).

### 3.5 Password Reset
- FR-15: A user who has forgotten their password can request a reset via their verified identifier (email, or email/phone per BR-1); the reset flow does not confirm whether the identifier exists (anti-enumeration, consistent with FR-5).
- FR-16: Reset links/codes are single-use and time-limited.
- FR-17: Successful password reset invalidates all existing sessions for that account (forces re-login everywhere), and is written to the audit log.
- FR-18: For privileged roles (admin, security-company operator, support agent), password reset does **not** bypass MFA — MFA re-verification is still required to complete the reset.

### 3.6 Session Handling
- FR-19: Sessions use short-lived access tokens with refresh-token rotation, per `06-security-standards.md`.
- FR-20: The Customer Mobile App binds sessions/refresh tokens to the device to reduce token-theft blast radius (per security standards).
- FR-21: Admin and Security Company Dashboards (browser-based, internal/partner use) use session handling appropriate to a web session — exact mechanism (e.g., idle timeout length) deferred to `authentication-engineer`, but idle-timeout expiry is required given privileged data exposure.
- FR-22: A session that is revoked (logout, password reset, admin-forced revocation) is unusable immediately, not just at next natural expiry.

### 3.7 MFA (Privileged Roles)
- FR-23: MFA is mandatory, cannot be disabled, and cannot be skipped for admin and security-company operator accounts, per `06-security-standards.md` ("non-negotiable").
- FR-24: MFA factor type(s) supported (authenticator app / SMS / other) deferred to Architecture Review — this doc only establishes the requirement, not the mechanism.
- FR-25: MFA is offered and recommended, opt-in, for customer accounts — not mandatory at this stage.

---

## 4. Explicit Business Rules

- **BR-1 (Identity — email vs. phone) — RATIFIED, final:** **Email is the sole mandatory primary identifier** for all account types (used for login, verification, password reset, and account uniqueness). **Phone number is optional and additive only** — usable for SMS-based MFA or SMS verification, never as an alternate or substitute login identifier, and never a second uniqueness key. Rationale: email is universally required for verification/notifications regardless of phone collection, and treating phone as a second primary identifier without a decided uniqueness/merge policy risks duplicate-account ambiguity. This resolves Open Question OQ-1: confirmed by product-manager, with jurisdiction confirmed as South Africa (POPIA) by compliance-specialist — see Section 9 for the ratification record. No further discussion pending; database schema (Stage 6) and API contract (Stage 7) should treat this as final.
- **BR-2 (Verification gates commerce):** A customer account must reach **verified** status (completed email/phone verification challenge) before it can purchase a policy or register an asset. Unverified accounts may log in and view onboarding/verification screens only. This is a hard business rule, not a UX nicety — it is the mechanism by which the platform avoids selling coverage to an unconfirmed identity.
- **BR-3 (No self-service for privileged roles):** Admin, security-company operator, and support agent accounts can never be created through a public signup form. Creation is always invitation-driven by an existing admin. This is a security/business rule, not just a UX default — self-service creation of a privileged account is explicitly disallowed.
- **BR-4 (MFA is mandatory, not configurable, for privileged roles) — updated to name support agents explicitly:** Admin, security-company operator, **and support agent** accounts cannot disable MFA once enrolled, and cannot complete first login without enrolling. MFA is non-negotiable and treated identically across all three privileged role types — support agents are no longer covered by inference from the Admin Dashboard surface they share with admins; they are named here as a first-class party to this rule, resolving Open Question OQ-4 (see Section 9). No admin-level override or emergency bypass without a `cto`-signed, logged risk acceptance (mirroring the security standards' governance model for other hard gates).
- **BR-5 (Account states):** An account exists in one of: `pending_verification` → `active` → `suspended` (admin/support/compliance action) → `deactivated` (self-closed or terminated). This feature defines these states and their transitions for authentication purposes only; what triggers `suspended` for cause (fraud, policy violation) is out of scope here and belongs to a future trust & safety / compliance feature.
- **BR-6 (One identity, one account):** Each email address maps to exactly one customer account. Account merging, family/shared accounts, and multi-user policies are explicitly out of scope for this feature (see Section 5).
- **BR-7 (Security-company operator scoping origin point):** A security-company operator account must be associated with exactly one partner organization at creation time; this association is the seed data point that later RBAC/asset-visibility rules (Feature: RBAC Permission Matrix) will build on. This feature only establishes that the association exists and is captured at account creation — it does not define the resulting permission scope.

---

## 5. Out of Scope for This Feature

Explicitly deferred to later features, so Stage 1 stays scoped to account/session foundation only:

- **Full RBAC permission matrix** (what each role can view/edit/action once authenticated) — future feature, owned by `cybersecurity-architect`/`authentication-engineer` per the RACI matrix.
- **Policy purchase, subscription tiers, billing** — business-analyst's broader domain, separate feature.
- **Asset registration, GPS tracking, recovery workflows** — separate features.
- **Claims logic** — separate feature.
- **Customer support portal ticketing** — separate feature (though support agent *accounts* are in scope here).
- **Account suspension/termination business rules for cause** (fraud, abuse, non-payment) — future trust & safety/compliance feature; this feature only defines the state exists.
- **Family/shared/multi-user accounts, account merging, account transfer between customers.**
- **Social login / third-party SSO** (Google/Apple sign-in, etc.) — not ruled out for later, but not in this slice.
- **Notification preferences and delivery infrastructure** beyond the bare verification/reset messages required for this feature to function (owned by `notification-engineer`, consulted here only for the minimum viable email/SMS send).
- **Data retention and deletion policy specifics** for account data — owned by `compliance-specialist`, referenced but not authored here.

---

## 6. Acceptance Criteria (Given/When/Then)

### AC-1: Customer signup creates an unverified account
```
Given a prospective customer is not yet registered
When they submit a valid email and a password meeting the minimum strength policy
Then an account is created in "pending_verification" state
And a verification challenge is sent to the provided email
And the account cannot yet purchase a policy or register an asset
```

### AC-2: Duplicate signup is rejected without enumeration
```
Given an account already exists for a given email
When a signup is attempted with that same email
Then the signup is rejected
And the error message does not confirm whether the email is already registered
```

### AC-3: Verification unlocks commerce-gated actions
```
Given a customer account is in "pending_verification" state
When the customer completes the email verification challenge
Then the account transitions to "active" state
And the customer can now proceed to policy purchase / asset registration entry points
```

### AC-4: Customer login succeeds with correct credentials
```
Given a customer has an active account
When they submit the correct email and password
Then they receive a valid session (access token + refresh token)
And the login event is recorded in the audit log
```

### AC-5: Login fails safely with incorrect credentials
```
Given a customer has an active account
When they submit an incorrect password
Then the login is rejected with a generic error
And the failed attempt is recorded in the audit log
And repeated failures trigger rate-limiting / lockout per policy
```

### AC-6: Privileged login requires MFA
```
Given an admin or security-company operator has valid email + password
When they submit correct credentials
Then they are prompted for a second MFA factor
And they are not issued a session until the MFA factor is verified
```

### AC-7: Privileged account cannot bypass MFA enrollment
```
Given an admin or security-company operator logs in for the first time after invitation
When they set their password
Then they are required to enroll an MFA factor before the account becomes usable
And there is no path to skip or defer MFA enrollment
```

### AC-8: Logout invalidates the session
```
Given a user (any of the four types) is authenticated with an active session
When they log out
Then the session's access and refresh tokens are invalidated immediately
And a subsequent request using the old token is rejected
```

### AC-9: Password reset invalidates all existing sessions
```
Given a user successfully completes a password reset
When the new password is set
Then all previously issued sessions for that account are invalidated
And the user must log in again on all devices/browsers
And the event is recorded in the audit log
```

### AC-10: Password reset for privileged roles still requires MFA
```
Given an admin or security-company operator initiates a password reset
When they reach the final reset confirmation step
Then they must still complete MFA verification before the reset is finalized
```

### AC-11: Unverified customer is blocked from commerce actions
```
Given a customer account is in "pending_verification" state
When the customer attempts to access a policy-purchase or asset-registration entry point
Then the action is blocked
And the customer is redirected to complete verification
```

### AC-12: Self-service signup is unavailable for privileged roles
```
Given a person without an account tries to access admin or security-company operator signup
When they look for a public registration path on those dashboards
Then no self-service signup path exists
And account creation is only possible via an admin-issued invitation
```

---

## 7. Open Questions (for product-manager / compliance-specialist)

- ~~**OQ-1 (BR-1, product-manager):**~~ **RESOLVED — see Section 9.** Email is the sole mandatory primary identifier for all account types; phone is optional/additive only. Ratified by platform owner (product-manager) and confirmed against POPIA by compliance-specialist. Database schema (Stage 6) and API contract (Stage 7) should proceed on this basis.
- ~~**OQ-2 (compliance-specialist):**~~ **RESOLVED — see Section 9.** Jurisdiction confirmed as South Africa; POPIA is the governing framework. Consent, verification, and processing-purpose obligations for this feature are documented in Section 9.
- **OQ-3 (product-manager):** Still open. Should customer MFA remain permanently optional, or is there a roadmap intent to make it mandatory for customers above a certain policy value / asset count in a future feature? Doesn't block this feature, but affects whether the session/MFA data model needs to anticipate that now. This is a product/business decision outside compliance-specialist's authority — re-addressed to product-manager in Section 9.
- ~~**OQ-4 (product-manager + compliance-specialist):**~~ **RESOLVED — see Section 9.** Support agent accounts are confirmed subject to the identical "MFA non-negotiable" rule as admin and security-company operator accounts, named explicitly (not by inference) in BR-4 and FR-9.
- **OQ-5 (product-manager):** Still open. What is the expected account lifecycle for a security-company operator when their partner organization's contract ends — deactivation trigger and timing? Not blocking for this feature's session/auth foundation, but affects whether BR-7's org-association field needs an expiry/status hook now to avoid a schema migration later. This is a product/business decision outside compliance-specialist's authority — re-addressed to product-manager in Section 9.
- ~~**OQ-6 (compliance-specialist):**~~ **RESOLVED — see Section 9.** A concrete retention policy recommendation for authentication audit logs (failed logins, password resets, MFA events) is proposed in Section 9, balancing POPIA's retention-limitation principle against the security standard's audit-logging requirement.

---

## 8. Pre-Approval Checklist (business-analyst self-review)

- [x] Every acceptance criterion is testable (clear pass/fail condition) — AC-1 through AC-12 each have a concrete Given/When/Then with an observable outcome.
- [x] Edge cases enumerated for this feature's scope: duplicate signup (AC-2), unverified-account commerce block (AC-3, AC-11), failed login/lockout (AC-5), privileged MFA bypass attempts (AC-6, AC-7, AC-10), session invalidation on logout and reset (AC-8, AC-9), no self-service path for privileged roles (AC-12).
- [ ] Coverage limits and policy tier rules cross-checked against the current tier/asset-type matrix — **N/A for this feature**; no coverage/tier logic is touched (explicitly out of scope, Section 5).
- [x] Compliance-specialist has reviewed rules touching cancellation, refunds, or regulated disclosures — **N/A directly** (no cancellation/refund logic here); compliance-specialist review of identity/verification/audit-retention rules (OQ-1, OQ-2, OQ-4, OQ-6) is now complete — see Section 9. Product-manager sign-off on scope and OQ-3/OQ-5 remains outstanding but is outside compliance-specialist's authority.
- [x] Terminology matches the domain glossary and existing UI/help-center copy — no existing domain glossary file found in `docs/`; terms used here (account, session, MFA, verification) are defined in-line in this doc and should seed the glossary going forward — flagged as a documentation-standards follow-up, not a blocker for this stage.
- [ ] Spec reviewed with backend-engineer and database-architect for technical feasibility — **deferred to Stage 5/6 (Architecture Review / Database Design)** per the lifecycle; not expected at Stage 1, noted so it isn't mistaken for an omission.
- [ ] QA has reviewed acceptance criteria and confirmed testability before development starts — **deferred to Stage 10 entry, pending QA availability**; ACs are written testable now but formal QA review has not occurred.
- [ ] Product-manager has signed off that the spec matches intended product scope — **pending**; this draft is submitted for that sign-off along with OQ-1 through OQ-6.

**Net status:** Stage 1 artifact complete and internally consistent. Compliance-specialist sign-off is now complete (OQ-1, OQ-2, OQ-4, OQ-6 ratified — see Section 9). Not yet fully approved — sign-off is still pending product-manager on overall scope and on OQ-3/OQ-5, which are product/business decisions outside compliance-specialist's authority, before this feature proceeds to Stage 2 (Product Planning).

---

## 9. Compliance Review (compliance-specialist)

**Reviewer:** compliance-specialist
**Regulatory regime determination for this feature:** South Africa — **POPIA (Protection of Personal Information Act)** is confirmed by the platform owner as the governing data-protection framework for this feature. This is a business/jurisdiction decision made by the platform owner, not a compliance-specialist determination in isolation — compliance-specialist's role here is to confirm the technical/legal consequences that flow from it and to flag if the customer base or vendor footprint later expands beyond South Africa (which would require reopening this determination, e.g. toward GDPR-style multi-region handling). Until such expansion is confirmed, this feature is designed and reviewed against POPIA only, not a hedge across multiple frameworks.

### 9.1 Resolution of Open Questions

**OQ-1 — RESOLVED (ratified business rule, see updated BR-1 in Section 4).**
Email is the sole mandatory primary identifier for every account type (customer, admin, security-company operator, support agent). Phone number is optional and strictly additive — valid only for SMS-based MFA or SMS verification, never as a login identifier, never as a second uniqueness key, and never eligible to substitute for email at any point in the account lifecycle (signup, verification, password reset, MFA enrollment). This closes the duplicate-account/merge-policy risk the original draft flagged, and gives database-architect and API design a single, final identity key to build against at Stage 6/7. No POPIA obstacle to this model: POPIA does not mandate a particular identifier scheme, and using a single low-ambiguity identifier is *consistent* with POPIA's minimality principle (Section 9.2) rather than in tension with it, because it avoids collecting and cross-referencing a second identifier (phone) as a parallel identity key without an operational need to do so.

**OQ-2 — RESOLVED.**
Jurisdiction is confirmed as South Africa; POPIA applies. The specific consent, verification, and processing-purpose obligations this feature must satisfy are set out in Section 9.2 below. No SMS-specific regulatory blocker was found for SMS-based verification/MFA under POPIA (SMS delivery of a code is processing of the phone number for a stated, minimal purpose — see 9.2 — and does not itself trigger additional consent machinery beyond what 9.2 already requires); if a future SMS/telecoms vendor is introduced, that vendor's data-sharing terms should be reviewed per this role's vendor-review responsibility, but that is not a blocker for this feature's Stage 1 sign-off.

**OQ-4 — RESOLVED (ratified business rule, see updated BR-4 and Section 2 table).**
Support agents are confirmed to be within the "MFA non-negotiable" rule, identical in treatment to admin and security-company operator accounts — not by inference from shared Admin Dashboard access, but as an explicitly named, ratified party to BR-4 and FR-9. There is no reduced-MFA tier for support agents. This closes the ambiguity the original draft flagged and removes any need for authentication-engineer to special-case support agents differently from admins at implementation time.

**OQ-6 — RESOLVED.** See Section 9.3 for the concrete retention policy recommendation.

**OQ-3 and OQ-5 remain open** — see Section 9.4. They are not resolved by this review because they are product/business decisions, not compliance determinations.

### 9.2 POPIA Obligations This Feature Must Satisfy

- **Lawful processing condition for account creation (POPIA s11):** The applicable lawful basis for collecting and processing a customer's email, password, and (if provided) phone number at signup is **necessity for the conclusion/performance of a contract** — the account is a precondition to purchasing an insurance policy the data subject is seeking (s11(1)(b)). This is distinct from, and does not require, marketing consent — no marketing communication consent should be bundled into or implied by the act of account creation. Consent (s11(1)(a)) is the correct basis specifically for **optional** processing not necessary to account creation itself (e.g., marketing opt-in, if ever added) and must be captured as a separate, unbundled, affirmative action, not a pre-ticked box or a condition of signup.
- **For admin, security-company operator, and support agent accounts:** the lawful basis is necessity for a legal obligation / legitimate interest in the employment or partner-organization relationship (s11(1)(c)/(f)), not consent — these are not self-service data subjects opting in, they are provisioned under an organizational relationship, and should be told what is collected and why via internal onboarding documentation rather than a consent flow.
- **Minimality (POPIA s10):** The feature must collect no more personal information than is adequate, relevant, and not excessive for the identity/session purpose. This is satisfied by BR-1's email-only-primary model plus optional phone-for-MFA — nothing beyond identifier, password, and (opt-in) phone should be collected at this stage. Any future addition (e.g., ID number, date of birth for KYC at policy-purchase time) belongs to a *later* feature's own minimality assessment, not this one, and should not be pulled forward into signup "for convenience."
- **Purpose specification (POPIA s13) and further processing limitation (POPIA s15):** The specific, explicit purpose of collecting email/phone at signup — account identification, verification, security notifications (password reset, MFA, suspicious-login alerts), and service-related communication — must be stated in plain language at the point of collection (privacy notice at signup), not buried in a general terms-of-service document. Data collected for this purpose may not silently be repurposed for marketing or shared with security-company partners without a separate lawful basis; this feature's data flows (signup, verification, login, password reset) do not involve sharing identity data with security-company partners, so no cross-org sharing consent is required *at this stage* — that determination will need to be revisited when asset/location data sharing with partner orgs is designed (future feature).
- **Data subject rights — right of access, correction, and deletion (POPIA s23-25), forward-looking for this feature:** This feature does not yet need to build self-service access/correction/deletion tooling (that is reasonably deferred, consistent with Section 5's "data retention and deletion policy specifics... owned by compliance-specialist, referenced but not authored here"), but the account/session data model established here **must not foreclose it** — specifically: (a) account records must be structured so a data subject's full identity/session/audit trail can be located and extracted by a single account key (the email-based identifier from BR-1 supports this directly); (b) the `deactivated` account state (BR-5) must have a defined path to actual data deletion or anonymization on request, not just a soft "deactivated" flag retained indefinitely — this is a gap to flag to database-architect at Stage 6, since BR-5 currently defines state transitions but not a deletion mechanism; (c) correction (e.g., changing a registered email) must be supported as a first-class account action in a future iteration, not treated as an edge case requiring manual intervention. None of this blocks Stage 1 sign-off, but it is a documented constraint database-architect must design against at Stage 6.

### 9.3 Retention Policy Recommendation for Authentication Audit Logs (resolves OQ-6)

**Scope:** failed login attempts, password reset requests/completions, MFA enrollment/verification events, session revocation events, account-state-transition events (per BR-5) — i.e., every event FR-12/FR-17 require to be written to the audit log.

**Proposed retention period: 12 months from event creation, in an actively queryable store, followed by automatic deletion — not indefinite retention.**

Justification, balancing two competing requirements:
- POPIA's retention-limitation principle (s14) requires that records not be kept longer than necessary for the purpose they were collected for, and requires an identified point at which retained personal information must be deleted or de-identified once that purpose is served.
- `06-security-standards.md`'s audit-logging requirement exists to support incident investigation, fraud/credential-stuffing pattern detection, and accountability review — these needs have a realistic operational window; incident investigations and access reviews that would need this data almost always occur within weeks to a few months of the event, not years.

12 months is proposed as the point that satisfies both: it is long enough to cover a full annual security review cycle, a delayed fraud investigation, or a regulator/insurer audit inquiry referencing "the last 12 months," while being short enough that the platform is not accumulating an unbounded, growing liability of sensitive behavioral/access data (failed-login patterns, IP/device metadata typically captured alongside these events) with no POPIA-defensible reason for keeping it.

**Deletion mechanism (must be automated and auditable, per this role's Best Practice of never relying on manual/policy-only enforcement):**
- A scheduled, automated purge job (not a manual/ad hoc process) that permanently deletes or irreversibly anonymizes audit log records older than 12 months, running on a defined cadence (e.g., daily or weekly sweep), owned by `database-architect`/`security-engineer` for implementation at Stage 6/9.
- The purge job's execution itself should be logged (a meta-audit record: "purge job ran on X date, deleted N records older than cutoff Y") so retention enforcement is demonstrable, not just asserted, satisfying this role's Success Metric of "retention and deletion policy enforcement verified."
- **Carve-out:** if a specific audit record becomes the subject of an active fraud investigation, legal hold, or regulator inquiry before its 12-month expiry, it must be excluded from the automated purge until that hold is lifted — this requires a hold/flag mechanism, not a blanket exemption, and should be specified to database-architect at Stage 6.
- This 12-month figure is a recommendation for Stage 1 planning purposes and should be formally re-confirmed by compliance-specialist at the Security Review gate (Stage 8), once actual data volumes, incident-response tooling, and any insurance-industry-specific recordkeeping minimums (which may impose a *longer* floor than POPIA's ceiling, requiring reconciliation) are better understood.

### 9.4 Still Open — Re-addressed to product-manager

The following remain **unresolved by this review** because they are product/business decisions outside compliance-specialist's decision-making authority (see this role's charter: "Escalates jurisdiction-defining business decisions... to product-manager/cto" — the same boundary applies to roadmap/lifecycle decisions that aren't data-protection determinations):

- **OQ-3 (product-manager):** Whether customer MFA remains permanently optional or becomes mandatory above a policy-value/asset-count threshold in a future feature. Compliance-specialist notes only that *if* customer MFA becomes mandatory later, no POPIA obstacle exists to that change — this is flagged for product-manager's roadmap decision, not compliance-specialist's.
- **OQ-5 (product-manager):** The account lifecycle/deactivation trigger and timing for a security-company operator when their partner organization's contract ends. Compliance-specialist notes only that whenever that trigger is defined, the resulting deactivation should feed into the same deletion/anonymization mechanism described in Section 9.2(b) rather than leaving orphaned partner-org accounts in an indefinite `suspended`/`deactivated` limbo — but the trigger condition itself is product-manager's call.

Both remain listed as open in Section 7 and are not to be treated as resolved by this Section 9 review.
