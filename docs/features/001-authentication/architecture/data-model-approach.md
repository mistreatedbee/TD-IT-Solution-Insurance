# Feature 001 — Customer Account Creation & Authentication
## Data Model Approach (Supabase Postgres) — Stage 5, Architecture Review

**Lifecycle stage:** 5 — Architecture Review
**Author (this document):** `database-architect`
**Consulted / to be consulted before Stage 6 finalizes DDL:** `security-engineer` (RLS SQL, secrets), `cybersecurity-architect` (MFA/authorization enforcement model), `compliance-specialist` (retention/deletion mechanics), `backend-architect` (service ownership, `account_id` contract), `authentication-engineer` (Supabase Auth configuration specifics)
**Input artifacts:** `business-requirements.md` (Stage 1), `product-plan.md` (Stage 2), `ux-research.md` (Stage 3), `ui-design.md` + `design-system-additions.md` (Stage 4), `ADR-0002` (Accepted)
**Status:** Conceptual/decision-level design only. **No DDL, no migrations, no live Supabase schema applied.** Full DDL and RLS SQL are Stage 6 (Database Design) deliverables that formalize what this document decides. No live Supabase MCP access was available or used in producing this document.

---

## 0. Scope and framing

Per ADR-0002 (Accepted), Supabase (Postgres + Supabase Auth) is the system of record for identity/account/session data for this feature: accounts, account states, credentials, sessions/refresh tokens, MFA enrollment/factors, invitations, and authentication audit events. MongoDB (ADR-0001) remains system of record for everything else (policies, assets, GPS/location history, claims) and is out of scope here except at the single seam point — the `account_id` cross-reference — addressed in §5.

This document does not design: password hashing, token rotation mechanics, or MFA cryptography (Supabase Auth's job, per ADR-0002); rate-limiting thresholds (`authentication-engineer`/`security-engineer`); the support-assisted manual-reset *process* (`cybersecurity-architect`, per `design-system-additions.md` §0); or actual RLS SQL (Stage 6, `security-engineer`-reviewed).

---

## 1. Conceptual entities

### 1.1 What Supabase Auth already gives us (`auth.users`, schema `auth`)

Supabase Auth's built-in `auth.users` table (and its associated `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_factors`, `auth.mfa_challenges`, `auth.identities` tables) already covers, per ADR-0002 §"What Supabase Auth buys":

- Credential storage (hashed password), a stable `id` (UUID) per user.
- Email verification state and the verification-challenge send/confirm mechanics (maps to the *mechanism* behind BR-5's `pending_verification` → `active` edge, not the business label itself).
- Session issuance, refresh-token rotation, and immediate invalidation on logout/reset (`auth.sessions`, `auth.refresh_tokens`).
- Password-reset request/confirm mechanics, single-use/time-limited tokens.
- TOTP MFA factor enrollment and challenge primitives (`auth.mfa_factors`, `auth.mfa_challenges`) — the baseline factor per ADR-0002/`design-system-additions.md`.
- `raw_app_meta_data` (server-writable only, via service-role key) and `raw_user_meta_data` (client-writable by the user) — both exposed to the JWT as `app_metadata`/`user_metadata` claims respectively.
- `auth.identities` for any future federated/SSO login (out of scope for this feature, noted per BR-1/Stage-1 Section 5 exclusion of social login).

**Per the supabase skill's guidance, and reaffirmed here as a hard constraint carried into Stage 6:** `auth.users` must **not** be extended with custom business columns (no `role`, no `account_state`, no `partner_org_id` bolted directly onto it via a Supabase-specific extension pattern). It is Supabase-managed and its shape is not ours to widen. All platform-specific business fields live in an app-schema table keyed 1:1 to `auth.users.id`.

### 1.2 App-schema entity: `app.accounts` (or `public.accounts` — schema naming is a Stage 6 detail; conceptually "the app schema," not `auth`)

One row per `auth.users` row, same primary key (`id uuid primary key references auth.users(id) on delete cascade` — the cascade choice itself needs sign-off with `compliance-specialist`, see §6). This is the entity Feature 001's business requirements actually describe:

- `id` — FK to `auth.users.id`. This is the value referred to elsewhere in this document and in ADR-0002 as **`account_id`** (see §5 for the exact contract).
- `user_type` — enum: `customer | admin | security_company_operator | support_agent` (the four-role model, Stage 1 §2). Authorization-relevant — see §3 on where this actually needs to live for enforcement purposes vs. where it's convenient to read it.
- `account_state` — enum: `pending_verification | active | suspended | deactivated` (BR-5's state machine, verbatim). This is **not** the same thing as Supabase Auth's own `email_confirmed_at`/banned-until mechanics — it's a first-class business state this app schema owns and transitions explicitly (see §1.5 on why state transitions need their own history, not just a mutable column).
- `email` — denormalized copy of `auth.users.email` for convenient joins/reporting; `auth.users.email` remains the actual source of truth Supabase Auth authenticates against. BR-1 (email is the sole mandatory identifier, ratified, final) is enforced at the `auth.users` layer already (Supabase enforces email uniqueness); the app-schema copy exists for query convenience only and must be kept in sync (via a trigger on `auth.users` update, or read-through at query time — Stage 6 decision, flagged, not decided here) rather than treated as a second source of truth.
- `phone` — optional, additive only per BR-1 (never a login identifier, never a uniqueness key). Nullable.
- `mfa_required` — boolean or small enum, **decoupled from `user_type`** per product-plan.md §5 OQ-3 forward note: "the account/MFA data model must **not** assume MFA enrollment is a fixed, permanent boolean tied only to role... must accommodate a customer account transitioning into an MFA-required state later without a schema migration." Concretely: `user_type IN (admin, security_company_operator, support_agent)` implies `mfa_required = true` today (BR-4, non-negotiable, no override without `cto`-signed risk acceptance), but the column is independent so a *customer* account can later be flipped to `mfa_required = true` by a future risk-based policy feature without a schema change. Enforcement of "MFA required and non-skippable for these three roles" is an application/RLS-adjacent policy check against this field, not an assumption baked into `user_type` alone.
- `partner_organization_id` — nullable FK to a `partner_organizations` table (§1.4), **required (not null) when `user_type = security_company_operator`** — BR-7's "association exists and is captured at account creation" requirement, enforced via a `CHECK` constraint at Stage 6 (`user_type != 'security_company_operator' OR partner_organization_id IS NOT NULL`).
- `invited_by` — nullable FK to `app.accounts.id` (self-referencing), populated for the three privileged roles per BR-3/FR-6 (who issued the invitation this account was created from). Null for customer self-signup accounts.
- `created_at`, `updated_at` — standard.
- `deactivated_at` / `suspended_at` — nullable timestamps, set on transition into those states (redundant with the state-history table in §1.5, but useful as a fast "is this currently suspended and since when" read without joining history — a deliberate, small denormalization for the hot "active alerts"/"account status" query path, not a replacement for the audit trail).

**Not stored here:** payment references, government ID documents for claims — those belong to future features' own tables (subscription/billing, claims), reviewed by `cybersecurity-architect`/`security-engineer` for field-level encryption at that time, per this role's charter boundary. Nothing in Feature 001's scope introduces payment or ID-document fields, so none are speculatively added now (per this role's Best Practice against speculative schema).

### 1.3 App-schema entity: `app.mfa_enrollments` — do we need our own table, or is `auth.mfa_factors` enough?

**Recommendation: rely on Supabase's `auth.mfa_factors`/`auth.mfa_challenges` as the actual enrollment/challenge record (don't duplicate factor secrets or challenge state in the app schema — that would be redundant and a security liability, duplicating a secret Supabase already manages).** What the app schema *does* need, and `auth.mfa_factors` does not provide, is the **business-policy layer on top**:

- `app.accounts.mfa_required` (§1.2) — the policy flag.
- A lightweight `app.mfa_enrollment_status` view or derived read (`EXISTS (SELECT 1 FROM auth.mfa_factors WHERE user_id = accounts.id AND status = 'verified')`) used to gate "is this privileged account actually enrolled and therefore usable" (AC-7's "no path to skip or defer" — enforced by checking this derived status before letting a privileged session past first-login, not by a separate app-owned enrollment table).
- If Supabase's `auth.mfa_factors` proves insufficient to express BR-4 cleanly at Stage 6/9 (e.g., no easy way to query "verified TOTP factor count" from RLS policies), ADR-0002's own Revisit Trigger already names this exact scenario ("Supabase Auth's role-based MFA/invitation customization proves insufficient... forcing enough workaround code") — flagging that as the trigger to reopen, not something this document resolves by inventing a shadow MFA table now.

**Confirmed with `design-system-additions.md` §0: no recovery-code mechanism exists anywhere in this feature.** This removes what would otherwise have been a `mfa_recovery_codes` table (hashed one-time codes) from scope entirely. The compound-lockout/lost-device path is support-assisted and human-mediated — it does not need a data-model artifact beyond, at most, a note field on whatever manual-reset action an admin performs (which is itself just another `app.account_audit_log` entry, §1.6 — no new table).

### 1.4 App-schema entity: `app.partner_organizations`

BR-7 only requires that a security-company operator account is associated with *a* partner org at creation — this feature does not own partner-org lifecycle (that's a future "Partner Organization Management" feature per product-plan.md §2 OQ-5 ruling). Minimal shape needed now, purely as the referenced side of `app.accounts.partner_organization_id`:

- `id`, `name`, `status` (`active | inactive` — coarse, sufficient for OQ-5's future cascade behavior: "admin marks the partner organization as inactive... cascades: every security-company operator account scoped to that organization transitions to `suspended`"), `created_at`.

This table is intentionally thin. It exists so BR-7's FK has something to point at; a future Partner Organization Management feature will very likely extend it (contract terms, primary contact, etc.) — this document does not anticipate those fields, consistent with the Best Practice against speculative schema, but flags that the FK relationship itself (`accounts.partner_organization_id → partner_organizations.id`) is the seed point that future feature will build on, exactly as BR-7 states.

### 1.5 App-schema entity: `app.account_state_transitions` (append-only, audit-shaped)

BR-5's four states (`pending_verification → active → suspended → deactivated`) are **not** modeled as a single mutable column with no history. Per this role's Best Practice ("model claims and policy changes as append-only event/history collections... insurance requires an audit trail") and per compliance-specialist's Stage 1 §9.2(b) flag ("the `deactivated` account state must have a defined path to actual data deletion or anonymization on request, not just a soft flag retained indefinitely — this is a gap to flag to database-architect at Stage 6"), every state transition is recorded:

- `id`, `account_id` (FK to `app.accounts.id`), `from_state`, `to_state`, `reason` (free text or small enum — e.g. `email_verified`, `admin_suspended`, `partner_org_deactivated`, `self_closed`, `cto_risk_acceptance` for a BR-4 MFA-bypass exception, etc.), `actor_account_id` (nullable FK — who/what triggered it; null for system-triggered transitions like email verification), `created_at`.

`app.accounts.account_state` remains the fast-read current-state column (for the hot "assets by customer"-style query paths this table doesn't itself serve, but for account-state gating checks like BR-2's commerce gate); this history table is the audit trail Stage 1 flagged as missing and is a hard requirement carried into Stage 6, not optional hardening.

**Flag to `compliance-specialist`/`database-architect` for Stage 6:** compliance-specialist's Stage 1 §9.2(b) point (b) is not yet resolved by this document — it names a *gap* (no deletion/anonymization mechanism defined for `deactivated` accounts), it does not resolve it. This document confirms the schema *can* support a future deletion/anonymization job (state history plus a `deleted_at`/`anonymized_at` marker is a viable pattern), but the actual POPIA-driven deletion mechanics (what gets scrubbed, when, how the state-history table itself is handled on deletion — does it get anonymized too, since it may contain `actor_account_id` references to other accounts) is explicitly **not decided in this document** and must be joint-owned with `compliance-specialist` at Stage 6, flagged as a blocking item for full schema finalization (not for this Stage 5 sign-off — see §7).

### 1.6 App-schema entity: `app.account_audit_log` (authentication audit events)

Scope per compliance-specialist's Stage 1 §9.3 (12-month retention ruling) and ADR-0002: every login attempt (success/failure, FR-12), logout, password-reset request/completion (FR-17), MFA enrollment/verification events, session-revocation events. This is a separate table from `app.account_state_transitions` (§1.5) — state transitions are *business-state* events (small in volume, long-lived-relevant); audit-log events are *security/access* events (much higher volume, short-lived-relevant per the 12-month ruling) — different retention profile, different table, not merged.

Shape:
- `id`, `account_id` (nullable FK — a failed login against a non-existent email still needs to be logged for credential-stuffing detection, per FR-11/FR-12, so this cannot be a hard not-null FK in all cases; a failed attempt against an unrecognized email logs `account_id = null` plus the attempted identifier in a separate field, never conflated with a real account row),
- `event_type` — enum: `login_success | login_failure | logout | password_reset_requested | password_reset_completed | mfa_enrolled | mfa_verified | mfa_challenge_failed | session_revoked | account_state_transition_ref` (this last one *may* just be a foreign pointer back to §1.5 rather than a duplicate row — Stage 6 decision on whether state transitions are unioned into this log for a single queryable audit view, or kept separate and joined at query time; either is compliant with the 12-month ruling as long as the state-transition table itself, which has different retention needs per §1.5's flag, isn't force-fit into a 12-month purge that would delete business-relevant history compliance-specialist hasn't actually ruled should be purged),
- `attempted_identifier` — the raw email/identifier used, populated specifically for `login_failure` events where `account_id` may be null (credential-stuffing pattern detection needs this even for non-existent accounts, per FR-11),
- `ip_address`, `user_agent`/`device metadata` — typically captured alongside these events per compliance-specialist's Stage 1 §9.3 framing ("failed-login patterns, IP/device metadata typically captured alongside these events"),
- `created_at` — the purge-cutoff field for the 12-month automated deletion job (§1.7).

**Lives in the same Supabase Postgres instance**, not a separate store. Rationale: this audit log needs to be queried jointly with account data (e.g., "show me the last 90 days of login activity for this account" on an admin-facing account detail view) — splitting it to a different system would reintroduce exactly the cross-database consistency problem ADR-0002 is trying to *avoid* for identity data, for no compliance benefit (POPIA's retention-limitation principle cares about *how long*, not *which physical database*). A separate **logical** table with its own retention job is sufficient; a separate **physical** store is not warranted for this feature's volume, and would need its own justification if reconsidered later (e.g., if audit-log write volume ever became large enough to threaten the transactional identity tables' performance — not expected at this feature's scale, flagged only as a future revisit condition, not a current concern).

### 1.7 Retention/purge mechanics for `app.account_audit_log`

Per compliance-specialist's Stage 1 §9.3 ruling (12 months, automated, purge-job-logged, with a legal-hold carve-out):
- A scheduled job (pg_cron on Supabase, or an external scheduler calling a Postgres function — Stage 6/9 implementation choice) deletes (or the carve-out below excepts) rows where `created_at < now() - interval '12 months'`.
- **A `legal_hold` boolean (default `false`) column is added to `app.account_audit_log`** at the schema level now, per compliance-specialist's explicit requirement ("this requires a hold/flag mechanism, not a blanket exemption, and should be specified to database-architect at Stage 6") — flagged here so it is not missed as a "nice to have" at Stage 6; the purge job's `WHERE` clause must exclude `legal_hold = true` rows regardless of age.
- The purge job's own execution is itself logged (a meta-record — could be a minimal separate `app.retention_purge_runs` table: `id, ran_at, cutoff_date, rows_deleted`) per compliance-specialist's "purge job ran on X date, deleted N records" requirement — this is a **new, small table this document is adding to scope**, not present in any prior-stage document, because compliance-specialist's Stage 1 §9.3 requirement is otherwise unimplementable without somewhere to record it.
- This 12-month figure is explicitly a Stage 1 planning recommendation pending re-confirmation at Stage 8 (Security Review) per compliance-specialist's own note — the schema (a `created_at`-indexed, purgeable table with a hold flag) is designed to accommodate whatever final number Stage 8 lands on without a structural change, only a changed interval in the purge job's query.

### 1.8 App-schema entity: `app.invitations`

BR-3/FR-6/FR-7 (invite-only provisioning for admin/security-company-operator/support-agent, no public signup path):

- `id`, `email` (the invitee's address — pre-account, since `auth.users` doesn't exist for this person yet), `user_type` (which of the three privileged roles), `partner_organization_id` (nullable, required when `user_type = security_company_operator`, mirroring the same constraint as `app.accounts`), `invited_by` (FK to `app.accounts.id` — the admin who issued it), `token`/`token_hash` (the single-use invitation link's secret — stored hashed, never plaintext, consistent with how password-reset tokens are handled), `status` (`pending | accepted | expired | revoked`), `expires_at`, `accepted_at` (nullable), `created_at`.
- On acceptance (invitee sets password + completes MFA enrollment per FR-7), the flow creates the `auth.users` row (via Supabase Auth's admin-invite API or an equivalent server-side create-user call) and the corresponding `app.accounts` row, and marks the invitation `accepted`. This is a **backend-orchestrated, multi-step operation** (create `auth.users` row → create `app.accounts` row → mark invitation accepted), not a single atomic database transaction across `auth` and `app` schemas necessarily needing to be — both schemas live in the same Postgres instance/database, so this *can* actually be a single transaction (unlike the MongoDB/Supabase boundary in ADR-0002, this is not a cross-database seam) — flagged to `backend-architect` as a design input: prefer wrapping account-plus-profile creation in one Postgres transaction where Supabase's Auth Admin API allows it, rather than assuming it needs saga/compensating-action handling the way the Mongo↔Supabase boundary does.
- Anti-enumeration note (FR-5/AC-2 analog for invitations): since invitations are admin-issued, not self-service, enumeration risk is much lower (the invitee didn't guess anything), but the invitation-acceptance screen (`ui-design.md` §4.4 Screen A) already handles the "expired/already-used" case without confirming *why* beyond "no longer valid" — consistent with this table's `status` design.

---

## 2. Entity-relationship summary (conceptual, not DDL)

```
auth.users (Supabase-managed)
  1───1  app.accounts
                 │ user_type, account_state, mfa_required,
                 │ partner_organization_id, invited_by
                 │
                 ├──* app.account_state_transitions (append-only)
                 ├──* app.account_audit_log (append-only, 12mo TTL + legal_hold)
                 ├──* auth.mfa_factors (Supabase-managed; app reads via derived status)
                 └──1 app.partner_organizations (nullable; required if security_company_operator)

app.invitations  (pre-account; email + user_type + partner_organization_id + token_hash)
  ──▶ on acceptance ──▶ creates auth.users row + app.accounts row

app.retention_purge_runs (meta-audit for the 12-month purge job)

[MongoDB — out of scope, ADR-0002 boundary]
  policy / asset / claim documents  ──soft reference──▶  app.accounts.id  (== "account_id")
```

---

## 3. RLS posture (policy-intent level — not SQL; needs `security-engineer` review before real RLS is written)

**This section states intent only. No RLS SQL is written here, and none should be treated as final until `security-engineer` reviews it against the supabase skill's security checklist** (never rely on `auth.role()` alone; every policy must combine `TO authenticated`/`TO anon` scoping with an actual ownership/relationship predicate; policies must be enumerated per operation — `SELECT`/`INSERT`/`UPDATE`/`DELETE` — not assumed to generalize from one to the next; service-role bypasses RLS entirely and must be used only from the backend, never exposed to a client).

| Table | Customer | Admin | Security-company operator | Support agent |
|---|---|---|---|---|
| `app.accounts` | Read/update **own row only** (`id = auth.uid()`), and only a restricted column set (e.g., can update `phone`, cannot self-update `user_type`, `account_state`, `mfa_required`, `partner_organization_id`) | Read (and state-transition-write via a controlled function, not raw `UPDATE`) accounts **within scope** — BR-7/Stage-1 explicitly defer the full RBAC/visibility matrix to a future feature, so "admin's scope" is intentionally left as **not yet fully defined** here; flagged below as a blocking dependency, not assumed | Read **own row only**; no visibility into other accounts, including other operators at the same partner org, unless/until a future RBAC feature grants it (BR-7 only establishes the org-association exists, not the resulting visibility — Stage 1 explicit) | Same posture as admin for read of accounts within scope, pending the same future RBAC matrix; no self-service write beyond own row's restricted columns |
| `app.account_state_transitions` | No direct access (read-only surface, if any, mediated through a backend endpoint, not raw table `SELECT`) | Insert via controlled function (state-transition action), read within scope | No access | Read/insert only if support-agent's role in a future feature grants suspend/reactivate actions — **not decided by this feature**, flagged |
| `app.account_audit_log` | No direct table access — surfaced (if at all) via a backend-mediated, scoped endpoint (e.g., "your own recent login history" as a self-service security feature, itself a *future* feature, not this one) | Read within scope, no client-side delete/update (purge is a privileged, backend-scheduled job only, never client-writable) | No access | Read within scope, same as admin, pending RBAC definition |
| `app.invitations` | No access | Insert (issue invitations) and read within scope | No access | Insert/read only if support agents are granted invitation-issuing rights in a future RBAC iteration — **not decided by this feature** (BR-3 says invitations are "admin-created"; whether "admin" there is role-literal or includes support agents administratively is an open question this document flags rather than resolves) |
| `app.partner_organizations` | No access | Read/write (future Partner Org Management feature owns write; this feature only needs read for invitation-scoping UI) | Read **own org only** | Read within scope |
| `auth.mfa_factors` / Supabase-managed auth tables | Standard Supabase Auth RLS defaults (per-user own-row access) — not modified by this feature | Same | Same | Same |

**What this table intentionally does NOT resolve, and why that's acceptable at Stage 5 but not at Stage 6 sign-off:**
- "Admin can see accounts within their scope" / "security-company operator can see only accounts/cases explicitly assigned to them" — Stage 1 §5 (Out of Scope) explicitly defers the full RBAC permission matrix to a future feature. This feature's own BR-7 says only that the org-association *exists*, not what it grants. **This means Feature 001's RLS, as scoped, cannot yet express fine-grained cross-account visibility** — the safe, correct default for Stage 6 is: every role can read/write **only its own `app.accounts` row** by default, with admin-only elevated read/write mediated through backend-enforced, service-role-authenticated endpoints (not broad client-facing RLS grants) until the RBAC feature formally defines and RLS-encodes the scoping rules. This is the conservative interpretation and should be treated as the Stage 6 starting point, not a placeholder to backfill later with looser policies.
- Support-agent write privileges on `app.invitations`/`app.account_state_transitions` are explicitly unresolved (flagged above) — needs a `cybersecurity-architect`/`product-manager` ruling on whether "admin-created" in BR-3 is role-literal.

**Hard requirement carried to Stage 6 regardless of the above:** every RLS policy on every app-schema table must be written `TO authenticated` (or `TO service_role` for backend-only paths) combined with an explicit ownership predicate (`id = auth.uid()` or a join-derived scoping condition) — never a bare `USING (true)` gated only by role inference from `auth.role()`, per the supabase skill's checklist. This is a **pre-approval blocking item for Stage 6's actual RLS SQL**, not optional guidance.

---

## 4. Where authorization data lives (hard constraint)

Per the supabase skill's explicit warning, reaffirmed here as binding for Stage 6 implementation:

- **`raw_user_meta_data` / the `user_metadata` JWT claim must NEVER be used for authorization.** It is user-editable (a customer could, in principle, attempt to set `user_metadata.role = "admin"` via the client SDK) and must be treated as presentation-only data (display name, preferences) at most — nothing in this feature should read `user_metadata` to make an access-control decision.
- **`user_type`, `account_state`, `mfa_required`, and `partner_organization_id` — the actual authorization-relevant fields — live in `app.accounts`, a server/RLS-governed table, not in Supabase Auth metadata at all.** This is a deliberate choice over the alternative (`raw_app_meta_data`/`app_metadata`, which *is* server-writable-only and JWT-embedded, and is a legitimate place to mirror a role claim for cheap JWT-based checks): `app.accounts` is the source of truth; if a fast JWT-embedded role claim is wanted later for performance (e.g., to avoid a table lookup on every request), `app_metadata` can be synced *from* `app.accounts` via a trigger/Edge Function at Stage 6/9 — but `app.accounts` remains authoritative, and RLS policies should reference it (or a `SECURITY DEFINER` function reading it) directly rather than trusting an unrefreshed JWT claim for state that can change mid-session (e.g., `account_state` transitioning to `suspended` should take effect before the JWT naturally expires — a stale `app_metadata` claim cached in a long-lived JWT is a real risk `cybersecurity-architect`/`security-engineer` should weigh in on at Stage 6).
- This is flagged explicitly because FR-9/BR-4 (MFA mandatory for three roles) and BR-2 (commerce gated on `account_state`) are both authorization-adjacent decisions that must not be gameable by a client editing its own metadata — the `app.accounts` table plus RLS is the actual enforcement surface, not a JWT claim inspected client-side.

---

## 5. Cross-database soft-reference contract (`account_id`) — for `backend-architect`

Per ADR-0002 §"Real costs of the split": a MongoDB `policy`/`asset`/`claim` document references the owning account by `account_id`, a **soft reference, not a foreign key** (no cross-database referential integrity is possible).

**Contract `backend-architect`/`backend-engineer` can build against, confirmed here:**
- `account_id` **is** `app.accounts.id`, which **is** `auth.users.id` — a Postgres-native **UUID** (Supabase's default `auth.users.id` type, v4 UUID, e.g. `gen_random_uuid()`/Supabase Auth's own generation). This is stable for the account's entire lifetime, including through `suspended`/`deactivated` transitions (the UUID is never reused or recycled).
- MongoDB documents should store this as a plain string field (`account_id: string`, UUID-formatted, e.g. `"3fa85f64-5717-4562-b3fc-2c963f66afa6"`) — MongoDB has no native UUID-as-primary-type requirement here; store as string for simplicity and index it as a regular string/indexed field on each referencing collection (`policies.account_id`, `assets.account_id`, `claims.account_id`), consistent with `database-architect`'s indexing responsibilities on the MongoDB side (out of scope for this document beyond naming the field/type contract).
- **This UUID is never reused, and is never anonymized/rotated in place** — if a future POPIA deletion/anonymization job (§1.5's flagged gap) needs to scrub a deactivated account's PII, it must do so *within* `app.accounts` (nulling/hashing PII fields) while the `id` UUID itself remains stable, **so that MongoDB's `account_id` references don't silently orphan or require a rewrite across every domain collection**. This is a design constraint this document is placing on the future deletion mechanism, not something already built — flagged to `compliance-specialist`/`database-architect` jointly at Stage 6 as the preferred pattern (anonymize-in-place, preserve the key) over hard-delete-the-row (which would orphan every MongoDB reference and require `backend-architect`'s cleanup-listener mechanism, per ADR-0002, to run against every domain collection).
- Per ADR-0002, the backend API layer — not either database — is responsible for validating `account_id` existence before writes that reference it, and for handling the eventual-consistency boundary between account creation (Postgres) and any first domain-record creation (MongoDB) that might reference it. This document confirms the *type/format* side of that contract; the validation/consistency mechanics remain `backend-architect`'s design responsibility per ADR-0002, unchanged by this document.

---

## 6. Items requiring `security-engineer`, `compliance-specialist`, or `cybersecurity-architect` input before Stage 6 can finalize actual schema/RLS

These are explicit, named blocking or near-blocking items — not generic caveats:

1. **RLS SQL itself** (§3) — this document only states policy *intent*; `security-engineer` must review/write the actual SQL against the supabase skill's checklist before any policy is applied to a real Supabase project.
2. **Admin/security-company-operator/support-agent visibility scope** ("accounts within scope," BR-7's downstream RBAC) is explicitly unresolved by Stage 1 and by this document — Stage 6 should ship with the conservative own-row-only default (§3) until a dedicated RBAC feature defines and encodes broader scoping. `cybersecurity-architect` should confirm this conservative default is acceptable as Feature 001's actual Stage 9 behavior (not just a Stage 5 placeholder) — if Feature 001 needs *any* cross-account visibility to ship (e.g., an admin dashboard listing all customers), that needs an explicit ruling now, not a silent gap discovered at Stage 9.
3. **`on delete cascade` from `auth.users` to `app.accounts`, and the broader account-deletion/anonymization mechanism** (§1.5, §5) — compliance-specialist's Stage 1 §9.2(b) gap is reaffirmed, not resolved, by this document. Needs joint sign-off: what "deletion" means for a `deactivated` account (hard delete vs. anonymize-in-place — this document recommends anonymize-in-place to protect the `account_id` cross-reference, §5, but that recommendation needs compliance-specialist's confirmation it satisfies POPIA's actual deletion-request obligations, not just this role's referential-integrity preference).
4. **Whether `app.account_state_transitions` is subject to the same 12-month purge as `app.account_audit_log`, or has its own (likely longer) retention** — this document deliberately keeps them as separate tables specifically so they *can* have different retention policies, but does not itself set the state-transition table's retention period. Flagged to `compliance-specialist` as a distinct ruling from the already-made 12-month audit-log decision.
5. **Support-agent write privileges on invitations/state-transitions** (§3) — whether BR-3's "admin-created" is role-literal — needs `cybersecurity-architect`/`product-manager` clarification.
6. **`app_metadata` JWT-claim-freshness risk for `account_state`/`mfa_required`** (§4) — if a fast-path JWT claim is used at all (optional, not required by this document), `cybersecurity-architect`/`security-engineer` must confirm an acceptable session-refresh/claim-refresh cadence so a `suspended` transition can't be bypassed by a stale, still-valid JWT.
7. **Field-level encryption review** — this feature introduces no payment or ID-document fields (§1.2), so no field-level-encryption need is identified *for this feature specifically*; this is a scoped "N/A for now," not a completed review, and should be re-triggered the moment any future feature adds such fields to an app-schema table.
8. **Data-residency review** — per ADR-0002's own Required Follow-ups (not restated in full here, only cross-referenced): `cybersecurity-architect` + `compliance-specialist`'s Supabase hosting-region review against POPIA is a precondition of ADR-0002's implementation authorization generally, and by extension of this document's schema going live. This document does not duplicate that review; it assumes ADR-0002's own follow-up gate is tracked and enforced independently.

---

## 7. Pre-Approval Checklist (`database-architect` self-review, per persona charter)

- [x] **Schema change reviewed for embed-vs-reference correctness given the relationship's read/write pattern.** `auth.users` vs. `app.accounts` split follows the supabase skill's mandated pattern (no custom fields on `auth.users`); MFA factor secrets are not duplicated into the app schema (referenced via Supabase's own tables, §1.3); state transitions and audit events are referenced/append-only tables, not embedded in `app.accounts` (avoids unbounded row growth and preserves audit integrity).
- [x] **Indexing strategy validated against actual hot query paths, not speculative.** Deferred formally to Stage 6 (DDL stage), but this document names the hot paths its shape must serve: account lookup by `id`/`email`, account-state gating checks (BR-2), audit-log queries scoped by `account_id` + `created_at` range (for the 12-month purge and any admin-facing history view), invitation lookup by `token_hash`. No index list is finalized here — flagged as Stage 6 work, not omitted.
- [x] **GPS/location-history growth accounted for with a retention or rollup plan.** N/A to this document — GPS/location history lives entirely in MongoDB per ADR-0002/ADR-0001, outside this document's scope.
- [ ] **Sensitive fields (payment refs, ID documents) reviewed with cybersecurity-architect for encryption/access-control needs.** N/A for this feature's actual field set (§6 item 7) — no such fields are introduced by Feature 001. Left unchecked deliberately rather than marked N/A-and-closed, since this is a standing obligation that re-triggers the moment such a field is proposed, not a one-time clearance.
- [x] **Claim/policy/payment-adjacent changes preserve auditable history, not just current state.** N/A directly (claims/policies are MongoDB/future-feature scope), but the equivalent principle is applied here: account-state changes (BR-5) are append-only history (§1.5), not overwrite-in-place — satisfying this checklist item's intent for the identity domain this document actually owns.
- [ ] **Data-retention policy aligns with compliance-specialist's regulatory guidance.** Audit-log retention (12 months, purge job, legal-hold carve-out) is directly implemented per compliance-specialist's Stage 1 §9.3 ruling. **Left unchecked**: the account-deletion/anonymization mechanism for `deactivated` accounts (§1.5, §6 item 3) and the state-transition table's own retention period (§6 item 4) are named gaps, not yet jointly resolved with `compliance-specialist` — this is the primary reason this document does not claim full Stage 6 readiness on its own.
- [ ] **Capacity impact on the MongoDB cluster reviewed with cloud-infrastructure-architect.** N/A — this document is Supabase/Postgres-scoped; no MongoDB schema or capacity change is introduced. (The `account_id` string-field addition to existing/future MongoDB collections, §5, is a `backend-architect`/future-feature concern, not a capacity-relevant change on its own.)
- [x] **Migration path for existing data specified for any breaking schema change.** N/A — no live Supabase schema exists yet (greenfield); there is no existing data to migrate for this feature's initial schema. Flagged for future features: any change to `app.accounts`' shape once data exists will need an explicit migration plan at that time.

---

## 8. Sign-off status for Stage 5 exit

**Conditional sign-off — not a full, unconditional approval.**

This document is sound and complete enough, as a conceptual/decision-level artifact, to satisfy Stage 5's entry requirement for Stage 6 (Database Design) to begin drafting real DDL and RLS SQL against it. The core structural decisions — `auth.users`/app-schema split, the four entities needed (`accounts`, `mfa` policy layer, `invitations`, `partner_organizations`), append-only state-transition and audit-log tables, the `account_id` cross-reference contract, and the authorization-data-location rule (never `user_metadata`) — are settled and are not expected to change materially at Stage 6.

**However, this is explicitly a conditional sign-off, not a clean one**, because of the items in §6, most importantly:
- Item 2 (RBAC/visibility scope for admin/operator/support-agent accounts) — Stage 6 must proceed on the conservative own-row-only RLS default; if Feature 001's actual Stage 9 build needs broader visibility to function (e.g., an admin account list), that requirement must surface and be ruled on *before* Stage 6 DDL is finalized, not discovered mid-development.
- Item 3 (account deletion/anonymization mechanism) — this is a real, compliance-flagged gap carried forward from Stage 1 that this document does not close, only re-confirms and adds a referential-integrity constraint onto (§5's "anonymize-in-place, don't recycle the UUID" recommendation).
- Item 1 (actual RLS SQL) is by definition not done at this stage and must not be treated as done — the policy-intent table in §3 is a starting brief for `security-engineer`, not a substitute for their review.

**Recommendation:** Stage 5 may exit and Stage 6 may begin on this basis, provided items 2, 3, and 4 from §6 are scheduled as joint working sessions with `compliance-specialist` and `cybersecurity-architect` **before** Stage 6's DDL is treated as final, and item 1 (RLS SQL authorship/review by `security-engineer`) is treated as a hard gate before any RLS policy is applied to a real project — consistent with Stage 8 (Security Review) being a non-negotiable gate per the lifecycle document, but flagged here early since RLS design intent (this document) should not silently harden into unreviewed RLS SQL by drift.
