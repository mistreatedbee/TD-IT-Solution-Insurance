# Feature 001 — Customer Account Creation & Authentication
## API Design — Stage 7

**Lifecycle stage:** 7 — API Design
**Author:** `backend-architect`
**Formalizes:** [`architecture/backend-approach.md`](./architecture/backend-approach.md) (Stage 5, this role), against [`architecture-review.md`](./architecture-review.md) (Stage 5 synthesis, `solution-architect`) and [`database-design.md`](./database-design.md) (Stage 6, `database-architect`)
**Consulted:** `ui-design.md` (Stage 4, for client-consumed shapes), `backend/src/middleware/error-handler.ts` (running code — this contract is written to match it, not the reverse)
**Status:** Draft — submitted for `solution-architect` review per Stage 7 exit criteria. **No SQL is applied by this document.** The two schema additions named in §3 are proposals for `database-architect`, not migrations.
**Exit artifact:** OpenAPI 3.1 contract (§7), reviewed and versioned as `/v1`.

---

## 0. What This Document Resolves, Per the Stage 5 Gate Conditions

Architecture-review.md's binding ruling: **"Stage 7 may not exit until FU-01, FU-02(a), FU-07, FU-09, FU-10, FU-18 and FU-19 are closed."** §8 of this document works through each by name. The two most consequential — FU-18 (session token shape) and FU-01/D-2 (claim-staleness protocol) — are resolved first (§§1–2) because everything else in this contract (the `securitySchemes` in §7, the `/v1/session/*` group, the rate-limit/idempotency stores in §3) is built on top of that resolution, not the other way around.

---

## 1. Resolving FU-18 First: Session Token Shape

D-3 in architecture-review.md left this open with two defensible answers and named the consequence of each: if the client holds a Supabase-honoured JWT verbatim, ADR-0002's mediation principle is *policy*, enforced only by RLS as a backstop; if the backend mints its own token, mediation is *structural*.

**Ruling: the backend mints its own opaque session-token pair. The client never receives a Supabase-issued JWT or refresh token.**

- **Access token:** a JWT signed with a backend-owned key (not Supabase's), `kid`-rotatable, containing `sub` (`account_id`), `user_type`, `mfa_required`, `account_state` (labelled as a cache, see §2), `partner_organization_id`, `session_id` (the token's `jti`), `iat`, `exp`.
- **Refresh token:** an opaque, high-entropy random value, stored **hashed** server-side in the new `app.sessions` table (§3.1) — never a JWT, never Supabase's own refresh token.
- Internally, when the backend needs to call Supabase Auth's Admin API on the account's behalf (rare, post-login — Supabase's own session objects are not held past the point of mediation), it does so with its own service-role credential, not a token derived from the client's session.

**Why this, not pass-through:**
1. It makes ADR-0002's "no client talks to Supabase directly" a structural property, not a policy one — the client's bearer token is cryptographically meaningless to Supabase's own APIs (wrong signing key), so RLS becomes true defence-in-depth (as C7 already assumed, conservatively, and correctly) rather than the front-line control D-3 worried it might have to be.
2. It gives the backend full control of access-token TTL, claim set, and revocation semantics — the exact three things D-2/FU-01 needs, and none of which the backend can unilaterally control on a Supabase-issued token without re-signing it anyway (at which point it isn't a Supabase JWT pass-through in any meaningful sense).
3. It decouples client session lifetime from Supabase's own session/refresh-token lifetime policy, which the backend does not own and Supabase could change out from under the platform.

**Consequence — this fires the ADR-0005 trigger named in architecture-review.md §7.** Per that document's own terms, ADR-0005 ("platform session-token contract") is required before Stage 7 formally exits, proposed by `backend-architect` + `cybersecurity-architect`, ratified by `solution-architect` + `cto`. **This document proposes the ADR-0005 content (this section) but does not self-ratify it.** FU-18 is therefore **design-resolved here, formally closed pending ADR-0005 ratification** — tracked in §8, not silently treated as fully closed.

---

## 2. Resolving D-2/FU-01: The Claim-Staleness Protocol and the Final Number

Architecture-review.md's ruling bound this document to: (a) a stated, testable staleness number, not an emergent TTL; (b) FR-22/AC-8/AC-9-immediate actions may never be enforced from an unexpired claim alone; (c) BR-2 gate checks are re-derived live by the consuming service; (d) `app.accounts` (via `app.account_status_cache`, per database-design.md §4) remains the only source of truth, and a JWT claim is a labelled cache of it.

This protocol has **two separate mechanisms**, because D-2 is actually two different problems wearing one name — architecture-review's own text conflates them slightly, and separating them is what makes both AC-8/AC-9's "immediately" and the account-state-drift case simultaneously satisfiable without a network call on every request:

### 2.1 Mechanism 1 — Explicit revocation (logout, logout-all, password-reset, admin-forced revocation): true immediacy, not bounded staleness

FR-22 and AC-8/AC-9 describe **actions the backend itself performs** — a session being explicitly torn down. For these, "immediately" is achievable exactly, not just bounded, because the backend is the actor:

- Every explicit revocation (`POST /v1/session/logout`, `/v1/session/logout-all`, password-reset completion, a future admin-forced revocation) does two things in the same transaction: (1) marks the `app.sessions` row `revoked_at = now()`; (2) writes the token's `session_id` (`jti`) into a **revocation set** — a Redis `SET` with a TTL equal to the token's *remaining* lifetime (so the set never grows unbounded; an entry disappears exactly when the token it revokes would have expired anyway).
- **Every access-token verification, on every authenticated request, checks the revocation set for that `jti` in addition to verifying the JWT signature.** This is a single Redis `EXISTS` lookup — sub-millisecond, and it is the one and only place this design adds a network call to the hot request path (token verification is otherwise fully local, per the Stage 5 NFR target). This is the deliberate trade: a per-request cache lookup, not a per-request Postgres round trip, buys **exact** immediacy for the case FR-22/AC-8/AC-9 actually name.
- This closes AC-8 and AC-9 literally: "a subsequent request using the old token is rejected" is true on the very next request, not bounded by any window.

### 2.2 Mechanism 2 — Passive account-state drift (a `suspended`/`deactivated` transition not accompanied by an explicit session teardown): bounded staleness

This is the case D-2 actually flagged as unsolved: an admin flips `account_state` to `suspended`, but no revocation event fires against the holder's *existing, still-cryptographically-valid* access token. Here, true immediacy would require a live database check on every request, which the Stage 5 NFR target (`p95 ≤ 5ms`, no network round trip) explicitly rules out.

**Final bounded-staleness number: access-token TTL = 10 minutes**, replacing architecture-review's provisional 15-minute ceiling. This is a *tightening*, which D-2(a) explicitly permits without needing to loosen anything.

**Justification for 10 minutes specifically, against AC-9's "immediately, not at next natural expiry" and realistic infra cost:**
- AC-9's text is written about *password reset*, which is Mechanism 1 (exact, not bounded) — the 10-minute number is not what AC-9 is measured against; it only bounds the residual case Mechanism 1 cannot cover (state drift with no accompanying revocation event, e.g. a support-agent-initiated suspension for cause that isn't modelled as a "logout"). No Stage 1 acceptance criterion names a number for that case; this document is the first place one is set, which is exactly what Stage 7 exists to do.
- **Infra cost, concretely:** a refresh happens on every access-token expiry. At 10 minutes, a single active user generates 6 refresh calls/hour; at the previous 15-minute ceiling, 4/hour. The marginal cost of the tighter number is 2 extra refresh calls/hour/active session — each a single indexed point-lookup against `app.account_status_cache` (database-design.md §4, sub-millisecond, not the wide `app.accounts` row) plus a signed-JWT mint, not a Supabase round trip. At the platform's stated scale (Feature 001 has no throughput target — architecture-review §5 — and Identity Service's own NFR ceiling is p95 ≤ 800ms for the *login* path, not refresh), this is not a capacity concern; it is a rounding error against the mobile client's own battery/network-wakeup budget, which is the actual binding constraint on how tight this number can go, not server cost. 10 minutes is chosen over, say, 2–5 minutes because it stays inside typical mobile background-refresh/foreground-resume cadence (avoiding forcing an unnecessary network wakeup purely for token hygiene) while being tight enough that a support-initiated suspension for cause becomes effective within a number a QA test can assert deterministically.
- 10 minutes is **tightenable further, not loosenable**, by `cybersecurity-architect`/`security-engineer` at Stage 8 per FU-17, consistent with D-2(a)'s framing — this document sets the ceiling; Stage 8 may lower it with recorded justification, must not raise it without one.

### 2.3 Which chokepoints check live vs. trust the claim — the concrete list

| Chokepoint | Check performed | Mechanism |
|---|---|---|
| Every authenticated request (any endpoint, any service) | JWT signature + `jti` **not in revocation set** | Mechanism 1 — exact, Redis lookup |
| `POST /v1/session/refresh` | Point-lookup `app.account_status_cache` by `id`; refuses to mint a new access token if `account_state ∈ {suspended, deactivated}`, and revokes the refresh token | Mechanism 2's actual enforcement point — this is where drift gets caught and terminated, at worst 10 minutes after it occurred |
| `GET /v1/account/me` | Point-lookup `app.account_status_cache`, **never** served from the JWT claim alone, because this endpoint's entire purpose is UI gating (BR-2) | Live read, every call — cheap (indexed PK lookup), and this is the one client-facing endpoint where staleness would directly contradict the endpoint's purpose |
| BR-2 commerce-gated actions in **other** services (future Policy/Asset services — not built yet) | Must call an internal, non-client-facing endpoint, `GET /v1/internal/accounts/{id}/status` (§7.9), backed by the same `account_status_cache` point-lookup, service-to-service authenticated, **not** the requester's own JWT claim | Live read, per D-2(c) — this is the contract those services build against |
| `POST /v1/auth/login`, `POST /v1/auth/mfa/challenge` | Always a fresh, full read (these mint the token from scratch) | N/A — not a staleness question |
| All other authenticated reads (e.g., a future non-security-critical UI-navigation decision) | JWT claim alone is acceptable, bounded by the 10-minute ceiling | Mechanism 2's default — this is what "bounded staleness" means in practice: everywhere except the four rows above |

This table **is** FU-01's deliverable: a stated, testable number (10 minutes) plus the explicit list of what may never be decided from a claim alone (row 2–4) versus what may (row 6), closing D-2(b)/(c)/(d) as written.

---

## 3. Required Stage 6 Addenda — Flagged Explicitly, Not Silently Assumed

Per the task's own instruction: this contract needs two tables `database-design.md` does not currently define. Both are proposed here for `database-architect` to formalize (DDL, indexing, RLS) — **this document does not write SQL for them**, consistent with this role's charter boundary (defers schema/index specifics to `database-architect`).

### 3.1 `app.sessions` — required by §1/§2, does not exist in database-design.md

Needed to back the backend-minted refresh-token model (§1) and to give Mechanism 1 (§2.1) something durable to revoke against (the Redis revocation set is the *fast* check; `app.sessions` is the *durable* record an admin/audit view or a `logout-all` operation enumerates against).

Proposed shape (columns, not DDL — `database-architect`'s to formalize):
- `id` (the session's `jti`, uuid, PK)
- `account_id` (FK → `app.accounts.id`, `on delete cascade` — a session cannot outlive the account it belongs to)
- `refresh_token_hash` (hashed, never plaintext — mirrors `app.invitations.token_hash`'s existing pattern)
- `device_id`, `device_name` (nullable — populated by mobile clients per FR-20; **this is the field FU-09/mobile-architect's device-binding review needs to react to**, not invent independently)
- `ip_address`, `user_agent` (parity with `app.account_audit_log`'s existing columns)
- `created_at`, `last_used_at`, `expires_at`
- `revoked_at`, `revoked_reason` (nullable; enum-shaped: `logout | logout_all | password_reset | admin_forced | rotation_reuse_detected`)
- `replaced_by_session_id` (nullable, self-referencing FK — refresh-token rotation chain, so reuse of a rotated-out token is detectable, per FR-20's token-theft-blast-radius goal)

RLS posture recommendation (for `database-architect`/`security-engineer` to formalize, not decided here): identical posture to `app.account_status_cache` (database-design.md §5.6) — no `authenticated`/`anon` grant at all, service-role-only, since a client never queries this table directly (session state is exposed only through `/v1/session/*` and `/v1/account/me`, never raw table access).

### 3.2 `app.idempotency_keys` — required by §4, does not exist in database-design.md

Backs the idempotency strategy below. Proposed shape:
- `id` (uuid, PK)
- `endpoint` (text — the route, e.g. `POST /v1/invitations`)
- `idempotency_key` (text — client-supplied, expected UUID v4)
- `account_id` (nullable — null for pre-auth flows like invitation acceptance, where no session exists yet)
- `request_hash` (sha-256 of the normalized request body, to detect key-reuse-with-different-body)
- `response_status`, `response_body` (jsonb — the cached response, replayed verbatim on retry)
- `created_at`, `expires_at` (24-hour TTL, purge job analogous in shape to `app.purge_expired_audit_log`, §6 of database-design.md — a new, small function, not proposed in full here)

Unique constraint: `(endpoint, idempotency_key)`. RLS: service-role-only, same posture as §3.1 — clients never read this table, only experience its effect via response replay.

**Not a new table (confirmed, no addendum needed):** password-reset and email-verification tokens are Supabase Auth's own native recovery/confirmation mechanism (per backend-approach.md §3/BR-6 — Supabase is trusted for token *mechanism*), so no platform-owned token-storage table is needed for those two flows, unlike invitations (which are backend-owned per BR-3).

**Not a new table, but a named infra dependency already anticipated:** the revocation set (§2.1) and the rate-limit counters (§5) both live in the Redis-class store `backend-approach.md` §5.1 already named and architecture-review's FU-08 already tracks (owner `cloud-infrastructure-architect`, ADR-0003 trigger). This document does not reopen that decision — it confirms the revocation set is a second, equally load-bearing use of the same store, which `cloud-infrastructure-architect`/`security-engineer` should size for accordingly at FU-08.

---

## 4. Idempotency Strategy

Per `05-development-standards.md` ("Idempotency keys required on any write endpoint that a mobile client might retry") and this role's Best Practice ("mandatory on all mutating endpoints tied to money or device state"), extended per Stage 5's own reasoning to security-relevant account-state mutations.

**Mechanism:** an `Idempotency-Key` request header (client-generated UUID v4), required (not optional) on the endpoint set below. On first receipt, the backend executes the mutation and stores `{endpoint, idempotency_key, request_hash, response_status, response_body}` in `app.idempotency_keys` (§3.2), TTL 24 hours. On a replay with the same key:
- **Same request body** (hash matches) → the cached response is replayed verbatim, same status code, without re-executing the mutation.
- **Same key, different body** → `409 Conflict`, `code: IDEMPOTENCY_KEY_REUSE`, per the shared error envelope — this is a client bug (key reuse across logically different requests), not a retry, and must not silently execute either version.
- **Missing header on a mandatory endpoint** → `400 Bad Request`, `code: IDEMPOTENCY_KEY_REQUIRED`.

**Mandatory on:**
| Endpoint | Why |
|---|---|
| `POST /v1/invitations` | Stage 5's own reasoning stands: a duplicate-send race creates ambiguity about which invitation token is authoritative — security-relevant, not just a UX annoyance. |
| `POST /v1/invitations/{token}/accept` | Creates the identity/account itself; a retried accept (flaky network on a privileged user's first-ever authenticated action) must not create two Supabase Auth users or two `app.accounts` rows against one invitation. |
| `POST /v1/auth/reset-password/confirm` | Device/account-state mutation (this role's charter names money/device-state mutations explicitly; account credential state is the closest analogue this feature has). |
| `POST /v1/auth/reset-password/mfa-verify` | Same reasoning, privileged-role variant. |
| `POST /v1/mfa/enroll/verify` | Completes MFA enrollment — a retried verify must not silently re-run enrollment against a factor already confirmed. |
| `POST /v1/session/logout-all` | A retried "log out everywhere" must not have a second, later-arriving retry silently re-revoke a session the user has since legitimately re-established — idempotency-key replay returns the original result instead of re-executing. |

**Not mandatory, per Stage 5's own ruling, unchanged here:** `POST /v1/auth/signup` and `POST /v1/auth/login` — naturally idempotent-safe by their own semantics (duplicate signup handled by the anti-enumeration response shape, §7; duplicate login just re-authenticates and mints a new session, which is a safe no-op-equivalent, not a state-corruption risk).

---

## 5. Rate-Limiting Contract

Enforcement point per Stage 5 §5.1: the Redis-class counter store in front of Identity Service, never inside Supabase Postgres. **The numbers below are a proposed, concrete contract — necessary for `frontend-engineer`/`mobile-engineer` to build the ux-research.md-mandated escalating-warning UI against something real — but remain provisional pending `cybersecurity-architect`/`security-engineer` ratification at FU-17 (Stage 8)**, exactly the same status this document gave the 10-minute staleness ceiling in §2. `backend-architect` does not have unilateral final authority over security-policy numbers (this role's charter: "defers to... `cybersecurity-architect`" on security posture) — these are a starting contract, not a closed one.

| Endpoint | Counter key | Threshold | Window | Lockout/backoff behavior |
|---|---|---|---|---|
| `POST /v1/auth/login` (password step) | `account_id` (or attempted email if unresolved) | 5 attempts | 15 min | Escalating warning surfaced at attempt 4 of 5 (`attemptsRemaining: 1` in the 401 body — the field ux-research.md §1.2 requires the backend expose as data). At 5, soft lockout: further attempts return `423 Locked` for the remainder of the window; **auto-clears**, no manual unlock needed, matching the "temporary, clears automatically" UI copy in ui-design.md §4.2/§4.5. |
| `POST /v1/auth/login` | source IP | 20 attempts | 15 min | Broader net for credential-stuffing across many accounts from one source; `429` once exceeded, independent of any single account's own counter. |
| `POST /v1/auth/mfa/challenge` | `session_id`(the MFA-challenge token issued at password-step success) | 5 attempts | 10 min | **Separate counter from the password-attempt counter**, per ux-research.md §1.2's explicit instruction not to conflate them. Exceeding it invalidates the challenge token — user must restart login from the password step, not "locked out of MFA forever." |
| `POST /v1/mfa/enroll/verify` | `account_id` | 10 attempts | 1 hour | Not a login-lockout (ui-design.md §4.4 explicitly rules out attempt-count lockout at enrollment) — this is abuse-rate-limiting only, not a security lockout, and does not feed the same escalating-warning UI. |
| `POST /v1/auth/reset-password/request` | attempted email/identifier | 3 requests | 1 hour | Anti-enumeration-consistent: response is always the generic success shape (§7) regardless of whether the limit is hit *for an existing account* — but see note below on the one place this can't be perfectly disguised. |
| `POST /v1/auth/reset-password/request` | source IP | 10 requests | 1 hour | Anti-spam net, independent of per-identifier limit. |
| `POST /v1/auth/reset-password/confirm` | reset token | 5 attempts | 15 min | Protects against token brute-forcing; the token itself is single-use and Supabase-expiry-bounded (mechanism-level, per §3.2's note) regardless of this counter. |
| `POST /v1/auth/signup` | source IP | 10 requests | 1 hour | Anti-bot/anti-abuse; per-email duplication is already handled by BR-6, not by this counter. |
| `POST /v1/auth/resend-verification` | `account_id` | 1 request | 60 sec (cooldown) | Matches the UI's literal countdown ("Resend available in 0:47", ui-design.md §4.1 Screen C) — the response includes a `retryAfterSeconds` field the client renders directly as that countdown, not a client-invented number. |
| `POST /v1/auth/resend-verification` | `account_id` | 5 requests | 1 hour | Ceiling above the per-minute cooldown, prevents cooldown-cycling abuse. |
| `POST /v1/invitations` | admin `account_id` | 50 requests | 1 hour | Abuse guard only, not security-lockout — an admin issuing invitations is a trusted, authenticated actor. |
| `GET /v1/admin/audit-log` | admin `account_id` | 60 requests | 1 min | Standard API-shape rate limit, not a security lockout — protects against an accidental tight polling loop, not an attacker. |
| All other authenticated endpoints (baseline) | `account_id` | 100 requests | 1 min | Platform-wide default guard, not enumerated per-endpoint above. |

**Honest limitation, disclosed rather than glossed:** the password-reset anti-enumeration guarantee (FR-15) and the per-identifier rate limit above are in slight tension — if an attacker sends 4 reset requests for the same non-existent email and gets identical `202`-shaped responses for all 4 (because the response never reveals whether the account exists), the *rate limit itself* still fires identically for existing and non-existing identifiers (the counter is keyed on the attempted identifier regardless), so no distinguishing signal leaks through status code or body shape — only through response *timing*, which is exactly the residual risk FU-07 (§8) exists to verify against Supabase's actual behavior, not something this document can close by design alone.

---

## 6. API Design Standards (ratifying backend-approach.md §2.3 into the actual contract)

- **Versioning — RESOLVED at deployment time, 2026-08-07:** the platform-wide prefix is ratified as **`/api`**, per `05-development-standards.md`'s `/api/v1/...` convention. This document's endpoint paths below are written as `/v1/...` (matching backend-approach.md's grouping table) — read every path in §7 as mounted under `/api`, i.e. `/v1/auth/signup` is actually served at `/api/v1/auth/signup`. Resolution was forced by setting up the Vercel multi-service deployment (`vercel.json`, repo root), whose rewrite rules route `/api/*` to the backend service and everything else to the frontend SPA — a bare `/v1/...` mount would have been unreachable in production, 404ing into the frontend instead. `backend/src/index.ts` mounts the health router under `/api` accordingly (`/api/health`, `/api/health/ready`, verified). The actual `/api/v1/auth/*` etc. business routes described in §7 are not yet mounted in code — that awaits Stage 8/9 — but the prefix they'll be mounted under is now settled, not still open.
- **Error envelope:** exactly `backend/src/middleware/error-handler.ts`'s shape — `{ "error": { "code": string, "message": string, "requestId": string } }` — reused verbatim as the OpenAPI `Error` schema (§7.3). No endpoint below defines a bespoke error shape.
- **Pagination:** cursor-based, applies only to `GET /v1/admin/audit-log` in this feature's scope (per backend-approach.md §2.3) — `limit` (default 50, max 200) and `cursor` (opaque, base64-encoded `created_at,id` tuple) query params; response wraps `data` + `pagination: { nextCursor, hasMore }`. This is the convention Stage 7 ratifies platform-wide for every future list endpoint, not invented uniquely for audit logs.
- **Idempotency:** §4.
- **Rate limiting:** §5, surfaced on every response via `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers, and `Retry-After` on `429`/`423` responses.
- **Supabase-outage error shape (closes FU-02(a)):** any endpoint whose completion depends on a live Supabase Admin API call (signup, login, MFA enroll/verify, password reset, invitation accept) returns `503 Service Unavailable`, `code: UPSTREAM_UNAVAILABLE`, with a `Retry-After` header, if that call fails or times out (backend-owned timeout: 5s, not Supabase's own timeout, so the backend controls its own worst-case latency contract). **Read paths do not carry this failure mode at all** — because access-token verification and the revocation-set check (§2.1) are both fully local/Redis-backed, an already-issued session remains fully usable for every read path (`GET /v1/account/me`, any other authenticated GET) during a Supabase outage. This is a materially stronger answer to architecture-review FU-02(b) than Stage 5's own "likely yes, worth confirming" — the backend-minted-token decision in §1 makes it unconditionally true, not merely likely.

---

## 7. OpenAPI 3.1 Contract

```yaml
openapi: 3.1.0
info:
  title: TD IT Solutions — Identity Service API
  version: "1.0.0"
  description: >
    Feature 001 (Customer Account Creation & Authentication). Mediates all
    client access to Supabase Auth per ADR-0002's mediation principle —
    no client ever holds a Supabase-honoured credential (see api-design.md §1).
servers:
  - url: /v1
security:
  - bearerAuth: []

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: Backend-minted access token (api-design.md §1). Never a Supabase-issued JWT.
    internalServiceAuth:
      type: apiKey
      in: header
      name: X-Internal-Service-Key
      description: Service-to-service auth for the internal-only account-status surface (§2.3 row 4). Not reachable by any client.

  parameters:
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: true
      schema:
        type: string
        format: uuid
      description: Client-generated UUID v4. See api-design.md §4.
    CursorParam:
      name: cursor
      in: query
      required: false
      schema:
        type: string
      description: Opaque pagination cursor from a prior response's pagination.nextCursor.
    LimitParam:
      name: limit
      in: query
      required: false
      schema:
        type: integer
        minimum: 1
        maximum: 200
        default: 50

  headers:
    RateLimitLimit:
      schema: { type: integer }
    RateLimitRemaining:
      schema: { type: integer }
    RateLimitReset:
      schema: { type: integer, description: Unix timestamp. }
    RetryAfter:
      schema: { type: integer, description: Seconds. }

  schemas:
    Error:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message, requestId]
          properties:
            code: { type: string, example: VALIDATION_ERROR }
            message: { type: string }
            requestId: { type: string, format: uuid }

    GenericAcceptedMessage:
      type: object
      description: >
        Anti-enumeration response shape (FR-5/FR-15/AC-2). Identical status
        code and body regardless of whether the underlying identifier exists.
        Used by signup and password-reset-request.
      required: [message]
      properties:
        message: { type: string }
        retryAfterSeconds:
          type: integer
          nullable: true
          description: Present only on resend-style endpoints (api-design.md §5).

    UserType:
      type: string
      enum: [customer, admin, security_company_operator, support_agent]

    AccountState:
      type: string
      enum: [pending_verification, active, suspended, deactivated]

    Account:
      type: object
      properties:
        id: { type: string, format: uuid }
        email: { type: string, format: email }
        userType: { $ref: '#/components/schemas/UserType' }
        accountState: { $ref: '#/components/schemas/AccountState' }
        mfaRequired: { type: boolean }
        mfaEnrolled: { type: boolean }
        partnerOrganizationId: { type: string, format: uuid, nullable: true }
        createdAt: { type: string, format: date-time }

    SessionTokens:
      type: object
      required: [accessToken, refreshToken, expiresIn, sessionId]
      properties:
        accessToken: { type: string, description: Backend-minted JWT, api-design.md §1. }
        refreshToken: { type: string }
        expiresIn: { type: integer, example: 600, description: Seconds (10 min ceiling, api-design.md §2). }
        sessionId: { type: string, format: uuid }

    MfaChallengeRequired:
      type: object
      required: [mfaRequired, mfaChallengeToken, expiresIn]
      properties:
        mfaRequired: { type: boolean, enum: [true] }
        mfaChallengeToken: { type: string }
        expiresIn: { type: integer, example: 300 }

    InvitationStatus:
      type: string
      enum: [pending, accepted, expired, revoked]

    InvitationPublic:
      type: object
      description: Invitee-facing view — never exposes token_hash.
      properties:
        email: { type: string, format: email }
        userType: { $ref: '#/components/schemas/UserType' }
        partnerOrganizationName: { type: string, nullable: true }
        status: { $ref: '#/components/schemas/InvitationStatus' }
        expiresAt: { type: string, format: date-time }

    AuditLogEntry:
      type: object
      properties:
        id: { type: string, format: uuid }
        accountId: { type: string, format: uuid, nullable: true }
        eventType:
          type: string
          enum: [login_success, login_failure, logout, password_reset_requested,
                 password_reset_completed, mfa_enrolled, mfa_verified,
                 mfa_challenge_failed, session_revoked]
        attemptedIdentifier: { type: string, nullable: true }
        ipAddress: { type: string, nullable: true }
        createdAt: { type: string, format: date-time }

    AuditLogPage:
      type: object
      properties:
        data:
          type: array
          items: { $ref: '#/components/schemas/AuditLogEntry' }
        pagination:
          type: object
          properties:
            nextCursor: { type: string, nullable: true }
            hasMore: { type: boolean }

  responses:
    BadRequest:
      description: Validation error.
      headers:
        X-Request-Id: { schema: { type: string } }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Unauthorized:
      description: Missing/invalid/expired/revoked bearer token.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Forbidden:
      description: Authenticated, but role/RBAC does not permit this action.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    NotFound:
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Conflict:
      description: Idempotency-key reuse with a different body, or a state conflict.
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    Locked:
      description: Account temporarily locked (rate-limit escalation, api-design.md §5).
      headers:
        Retry-After: { $ref: '#/components/headers/RetryAfter' }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    TooManyRequests:
      description: Rate limit exceeded.
      headers:
        Retry-After: { $ref: '#/components/headers/RetryAfter' }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    UpstreamUnavailable:
      description: Supabase Admin API unreachable/timed out (api-design.md §6).
      headers:
        Retry-After: { $ref: '#/components/headers/RetryAfter' }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }
    InternalError:
      content:
        application/json:
          schema: { $ref: '#/components/schemas/Error' }

paths:
  # ---------------------------------------------------------------
  # Signup & verification
  # ---------------------------------------------------------------
  /auth/signup:
    post:
      operationId: signup
      summary: Customer self-service signup.
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, password, consentAccepted]
              properties:
                email: { type: string, format: email }
                password: { type: string, minLength: 8 }
                consentAccepted: { type: boolean, enum: [true] }
      responses:
        '202':
          description: >
            Always this shape, always this status — identical whether the
            email is new or already registered (FR-5/AC-2). See api-design.md
            §6/§8 (FU-20) for the required ui-design.md correction this implies.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/GenericAcceptedMessage' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
        '503': { $ref: '#/components/responses/UpstreamUnavailable' }

  /auth/verify-email:
    post:
      operationId: verifyEmail
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [token]
              properties:
                token: { type: string }
      responses:
        '200':
          description: Email verified; account_state transitions pending_verification → active.
          content:
            application/json:
              schema:
                type: object
                properties:
                  message: { type: string }
        '410':
          description: Link expired or already used.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '503': { $ref: '#/components/responses/UpstreamUnavailable' }

  /auth/resend-verification:
    post:
      operationId: resendVerification
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email]
              properties:
                email: { type: string, format: email }
      responses:
        '202':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/GenericAcceptedMessage' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  # ---------------------------------------------------------------
  # Invitation & privileged provisioning
  # ---------------------------------------------------------------
  /invitations:
    post:
      operationId: createInvitation
      summary: Admin-only. Issues an invitation for admin/security_company_operator/support_agent.
      security: [{ bearerAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, userType]
              properties:
                email: { type: string, format: email }
                userType:
                  type: string
                  enum: [admin, security_company_operator, support_agent]
                partnerOrganizationId:
                  type: string
                  format: uuid
                  description: Required if userType = security_company_operator (BR-7).
      responses:
        '201':
          description: Invitation created.
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: { type: string, format: uuid }
                  status: { $ref: '#/components/schemas/InvitationStatus' }
                  expiresAt: { type: string, format: date-time }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403':
          description: Caller is not admin (ruling C4 — support agents may not issue invitations).
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '409': { $ref: '#/components/responses/Conflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /invitations/{token}:
    get:
      operationId: getInvitation
      summary: Invitee views invite details before accepting. Token is opaque; backend hashes and looks up server-side (never a direct table query — database-design.md §5.4).
      security: []
      parameters:
        - name: token
          in: path
          required: true
          schema: { type: string }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/InvitationPublic' }
        '404':
          description: Token not found, expired, or revoked — same shape for all three (no enumeration of *why* it's invalid).
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }

  /invitations/{token}/accept:
    post:
      operationId: acceptInvitation
      security: []
      parameters:
        - name: token
          in: path
          required: true
          schema: { type: string }
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [password]
              properties:
                password: { type: string, minLength: 8 }
      responses:
        '200':
          description: >
            Account created, invitation marked accepted. Does NOT issue a
            session — the caller must proceed to mandatory MFA enrollment
            (BR-4) before any session is minted; see /mfa/enroll.
          content:
            application/json:
              schema:
                type: object
                properties:
                  accountId: { type: string, format: uuid }
                  mfaEnrollmentRequired: { type: boolean, enum: [true] }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/Conflict' }
        '410':
          description: Invitation expired or already accepted.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '503': { $ref: '#/components/responses/UpstreamUnavailable' }

  # ---------------------------------------------------------------
  # MFA enrollment
  # ---------------------------------------------------------------
  /mfa/enroll:
    post:
      operationId: mfaEnroll
      summary: Starts TOTP enrollment. Callable by an unauthenticated-but-invitation-verified privileged user (first login) or an authenticated customer opting in.
      requestBody:
        required: false
        content:
          application/json:
            schema:
              type: object
              properties:
                accountId:
                  type: string
                  format: uuid
                  description: Required only for the forced-first-login (post-accept, pre-session) path; omitted when called with a bearer token.
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  qrCodeImage: { type: string, description: Base64-encoded PNG. }
                  manualEntryKey: { type: string }
                  enrollmentId: { type: string, format: uuid }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '503': { $ref: '#/components/responses/UpstreamUnavailable' }

  /mfa/enroll/verify:
    post:
      operationId: mfaEnrollVerify
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [enrollmentId, code]
              properties:
                enrollmentId: { type: string, format: uuid }
                code: { type: string, minLength: 6, maxLength: 6 }
      responses:
        '200':
          description: Enrollment confirmed. For the forced-first-login path, this now issues session tokens (mandatory MFA gate cleared).
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SessionTokens' }
        '400':
          description: Wrong/expired code. No attempt-count lockout at enrollment (ui-design.md §4.4).
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '409': { $ref: '#/components/responses/Conflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  # ---------------------------------------------------------------
  # Login & session issuance
  # ---------------------------------------------------------------
  /auth/login:
    post:
      operationId: login
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, password]
              properties:
                email: { type: string, format: email }
                password: { type: string }
                deviceId:
                  type: string
                  nullable: true
                  description: Mobile clients only (FR-20). See api-design.md §3.1 / FU-09.
      responses:
        '200':
          description: Either a full session (no MFA required/enabled) or an MFA challenge.
          content:
            application/json:
              schema:
                oneOf:
                  - $ref: '#/components/schemas/SessionTokens'
                  - $ref: '#/components/schemas/MfaChallengeRequired'
        '401':
          description: >
            Generic "incorrect email or password" (AC-5) — never distinguishes
            unknown-email from wrong-password. Body includes attemptsRemaining
            when ≤1 (api-design.md §5 escalating-warning contract).
          content:
            application/json:
              schema:
                allOf:
                  - { $ref: '#/components/schemas/Error' }
                  - type: object
                    properties:
                      attemptsRemaining: { type: integer, nullable: true }
        '423': { $ref: '#/components/responses/Locked' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
        '503': { $ref: '#/components/responses/UpstreamUnavailable' }

  /auth/mfa/challenge:
    post:
      operationId: mfaChallenge
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [mfaChallengeToken, code]
              properties:
                mfaChallengeToken: { type: string }
                code: { type: string, minLength: 6, maxLength: 6 }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SessionTokens' }
        '400':
          description: Wrong/expired code — attempt counter separate from the password counter (api-design.md §5).
          content:
            application/json:
              schema:
                allOf:
                  - { $ref: '#/components/schemas/Error' }
                  - type: object
                    properties:
                      attemptsRemaining: { type: integer, nullable: true }
        '410':
          description: Challenge token expired/exhausted — restart login from /auth/login.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  # ---------------------------------------------------------------
  # Logout & session management
  # ---------------------------------------------------------------
  /session/logout:
    post:
      operationId: logout
      responses:
        '204':
          description: Current session revoked immediately (api-design.md §2.1, Mechanism 1).
        '401': { $ref: '#/components/responses/Unauthorized' }

  /session/logout-all:
    post:
      operationId: logoutAll
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      responses:
        '204':
          description: All sessions for this account revoked immediately.
        '401': { $ref: '#/components/responses/Unauthorized' }

  /session/refresh:
    post:
      operationId: refreshSession
      summary: >
        Exchanges a refresh token for a new access token. This is the
        Mechanism-2 chokepoint (api-design.md §2.3) — always performs a live
        account_status_cache read before minting a new access token.
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [refreshToken]
              properties:
                refreshToken: { type: string }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SessionTokens' }
        '401':
          description: Refresh token invalid, expired, revoked, or reuse-detected (rotation chain break — api-design.md §3.1).
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '423':
          description: Account is suspended/deactivated — refusing to mint a new access token.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '503': { $ref: '#/components/responses/UpstreamUnavailable' }

  # ---------------------------------------------------------------
  # Password reset
  # ---------------------------------------------------------------
  /auth/reset-password/request:
    post:
      operationId: resetPasswordRequest
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email]
              properties:
                email: { type: string, format: email }
      responses:
        '202':
          description: Always this shape (FR-15, AC anti-enumeration) regardless of whether the account exists.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/GenericAcceptedMessage' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /auth/reset-password/confirm:
    post:
      operationId: resetPasswordConfirm
      security: []
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [resetToken, newPassword]
              properties:
                resetToken: { type: string }
                newPassword: { type: string, minLength: 8 }
      responses:
        '200':
          description: >
            For customer accounts: password reset complete, all sessions
            invalidated (FR-17/AC-9, Mechanism 1). For privileged accounts,
            returns mfaVerificationRequired instead of completing — see
            /auth/reset-password/mfa-verify (FR-18/AC-10).
          content:
            application/json:
              schema:
                oneOf:
                  - type: object
                    properties:
                      message: { type: string }
                      allSessionsRevoked: { type: boolean, enum: [true] }
                  - type: object
                    properties:
                      mfaVerificationRequired: { type: boolean, enum: [true] }
                      mfaVerificationToken: { type: string }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/Conflict' }
        '410':
          description: Reset link expired or already used.
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
        '503': { $ref: '#/components/responses/UpstreamUnavailable' }

  /auth/reset-password/mfa-verify:
    post:
      operationId: resetPasswordMfaVerify
      summary: Privileged-role-only finalization step (FR-18/AC-10). Distinguished in ui-design.md §4.6 Screen D so it doesn't read as a bug.
      security: []
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [mfaVerificationToken, code]
              properties:
                mfaVerificationToken: { type: string }
                code: { type: string, minLength: 6, maxLength: 6 }
      responses:
        '200':
          description: Reset finalized. All sessions invalidated (FR-17/AC-9, Mechanism 1).
          content:
            application/json:
              schema:
                type: object
                properties:
                  message: { type: string }
                  allSessionsRevoked: { type: boolean, enum: [true] }
        '400':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '410': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  # ---------------------------------------------------------------
  # Account-state read
  # ---------------------------------------------------------------
  /account/me:
    get:
      operationId: getCurrentAccount
      summary: >
        Always a live account_status_cache read (api-design.md §2.3) — never
        served from the JWT claim alone. Drives client-side BR-2 gating UI.
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Account' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  # ---------------------------------------------------------------
  # Internal-only surface (server-to-server, not client-facing)
  # ---------------------------------------------------------------
  /internal/accounts/{id}/status:
    x-internal: true
    get:
      operationId: internalGetAccountStatus
      summary: >
        Consumed by future domain services (Policy/Subscription, Asset
        Registry) to re-derive the BR-2 commerce gate live at the point of a
        gated action, per D-2(c). Never reachable by any client — service-to-
        service credential only. Contract published now so those services'
        auth middleware can be built against it before they exist.
      security: [{ internalServiceAuth: [] }]
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string, format: uuid }
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  accountState: { $ref: '#/components/schemas/AccountState' }
                  mfaRequired: { type: boolean }
                  updatedAt: { type: string, format: date-time }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }

  # ---------------------------------------------------------------
  # Audit log (internal/admin surface only)
  # ---------------------------------------------------------------
  /admin/audit-log:
    get:
      operationId: getAuditLog
      summary: Admin-only (ruling C8). Contract-only in Feature 001 — no dashboard screen ships yet (FU-19).
      parameters:
        - $ref: '#/components/parameters/CursorParam'
        - $ref: '#/components/parameters/LimitParam'
        - name: accountId
          in: query
          required: false
          schema: { type: string, format: uuid }
        - name: eventType
          in: query
          required: false
          schema: { type: string }
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AuditLogPage' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403':
          description: Caller is not admin (ruling C8 — support-agent read is not granted in Feature 001).
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Error' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
```

---

## 8. Follow-Up Tracker — Closing Out Every Item Assigned to `backend-architect` or "Stage 7"

Per architecture-review.md §6, cross-checked item by item. Stage 7's hard exit list first, then the remaining backend-architect-owned items from the full 18.

### 8.1 Stage 7 hard-exit conditions (architecture-review.md §STATUS LINE)

| ID | Item | Status | Reasoning |
|---|---|---|---|
| **FU-01** | Session-assertion contract: claim set, TTL, immediacy protocol | **CLOSED** | §§1–2 of this document. Final number: **10-minute access-token TTL**, two-mechanism protocol (exact revocation via Redis `jti` check; bounded 10-min drift via `account_status_cache` at defined chokepoints). Table in §2.3 names exactly which decisions may never be made from a claim alone. |
| **FU-02(a)** | Supabase-outage client-visible error shape | **CLOSED** | §6: `503 UPSTREAM_UNAVAILABLE` + `Retry-After`, scoped to write paths only; §7 OpenAPI marks it on every Supabase-dependent operation. FU-02(b)/(c) (monitoring hook, SRE-facing) remain **open**, correctly Stage-8-scoped per architecture-review's own split — owner `site-reliability-engineer`. |
| **FU-07** | Verify Supabase's actual duplicate-signup/reset-for-unknown-email responses | **PARTIALLY CLOSED — contract-level closed, live verification still open.** | The *contract* no longer depends on Supabase's raw response shape: §7's `/auth/signup` and `/auth/reset-password/request` always return the same normalized envelope/status regardless of what Supabase returns underneath (§6, §5's honest-limitation note). This satisfies Stage 7's actual need (a contract client engineers can build against now). The literal verification-against-a-live-project action is **still open** — it requires calling Supabase's Admin API directly, which is an execution/spike action this document (a paper artifact) cannot perform even with the CLI link now confirmed live. **Owner: `backend-architect` + `authentication-engineer`, to run as a pre-Stage-9 spike** — the now-live `supabase link` unblocks it but does not discharge it. If verification surfaces a timing side-channel, the fix is internal normalization logic, not a contract change. |
| **FU-09** | FR-20 mobile device-binding architectural review | **OPEN — owner `mobile-architect`.** | This document supplies the contract surface that review needs (`deviceId` on `/auth/login`, `app.sessions.device_id`/`device_name` in §3.1) so the review is unblocked, not skipped. The review itself has not happened and this document cannot substitute for it. |
| **FU-10** | FR-21 dashboard idle-timeout review | **OPEN — owner `frontend-architect`.** | This document's 10-minute access-token TTL plus refresh-on-demand model is compatible with an idle-timeout policy (a web client simply stops calling `/session/refresh` after inactivity, letting the session lapse), but the actual idle-timeout **value** and enforcement UX (ui-design.md §4.7's banner) is `frontend-architect`'s call, not made here. |
| **FU-18** | Session token shape | **DESIGN-RESOLVED, pending ADR-0005 ratification.** | §1. Backend-minted opaque tokens, not Supabase pass-through. This fires the ADR-0005 trigger architecture-review.md §7 already registered — that ADR must still be drafted and ratified by `solution-architect`+`cto` before this is fully closed in governance terms, but the *design content* Stage 7 needed is delivered here, on schedule. |
| **FU-19** | `GET /v1/admin/audit-log` — confirm contract-only, no UI expected | **CLOSED.** | Cross-referenced against the full `ui-design.md` (read in full for this document) — none of its 9 specified flows include an audit-log screen, consistent with D-5/ruling C8. §7's endpoint is marked accordingly. Formal `product-manager` sign-off is still the named owner of record, but nothing in this contract is blocked pending it — if product later wants a screen, that's correctly a Stage 3/4 re-entry per architecture-review's own framing, not a Stage 7 blocker. |

**Stage 7 hard-exit count: 5 of 7 closed (FU-01, FU-02(a), FU-18 design-content, FU-19; FU-07 contract-level), 2 remain open with named non-backend-architect owners (FU-09, FU-10) whose review this document unblocks but cannot substitute for.**

### 8.2 Other items this document touches or newly raises

| ID | Item | Status |
|---|---|---|
| FU-08 | Redis-class counter store — technology/hosting | **Still open**, owner `cloud-infrastructure-architect`. This document adds a second load-bearing use (the revocation set, §2.1) to the same store and flags it for their sizing — does not change the decision owner. |
| FU-13 | Deletion/anonymization event publication (outbox contract shape) | **Still open**, due at Stage 7 per architecture-review, **not resolved in this document** — disclosed rather than silently dropped. This is a real gap: this contract does not yet define the outbox event shape backend-approach.md §4.2 committed to designing at Stage 7. Recommend a follow-up addendum to this document before Stage 7 formally closes, or an explicit re-scoping of FU-13's due date to Stage 8 by `solution-architect` if this gap is judged non-blocking. **Flagging honestly rather than fabricating a resolution.** |
| FU-17 | Concrete auth policy numbers (password strength, lockout thresholds, MFA cadence, token TTL, idle-timeout) | **Still open**, owner `cybersecurity-architect`/`security-engineer`, Stage 8 — this document supplies the numbers FU-17 needs as a *proposal* (§2's 10-minute TTL, §5's rate-limit table) but does not carry the authority to ratify them, consistent with this role's charter. |
| **FU-20 (NEW, raised by this document)** | `ui-design.md` §4.1 Screen B's duplicate-signup error copy ("We couldn't create this account... try logging in") is a distinguishable, existence-confirming response — this **contradicts** FR-5/AC-2's binding non-enumeration requirement, which this contract (§7) implements literally (identical `202` for both cases). Neither Stage 5 nor Stage 6 caught this; it surfaced only when writing the actual response contract. | **Open, owner `ui-designer`/`product-manager`.** Recommend Screen B be revised to match §4.3 Screen B's already-correct generic pattern before Stage 9 builds against it. This document's OpenAPI contract is authoritative over the mockup where the two conflict, per FR-5/AC-2 being a binding Stage 1 acceptance criterion. |

---

## 9. Sign-Off Against the Pre-Approval Checklist

- [x] **API contract (OpenAPI) exists and is reviewed before client implementation starts.** §7. Submitted for `solution-architect` review now — no client implementation is authorized before that review lands.
- [x] **Service boundaries documented with clear data ownership per service.** Unchanged from Stage 5 (§2.1 of backend-approach.md); this document adds no new service, only the contract for the one already scoped.
- [x] **GPS ingestion and other high-throughput paths are architecturally isolated from low-throughput transactional paths.** N/A to this feature, as at Stage 5 — no change.
- [x] **Idempotency and retry strategy defined for all money- and device-state-mutating endpoints.** §4, extended from Stage 5's invitation-only scope to the full account-state-mutation set, with reasoning per endpoint.
- [x] **Authn/authz model for each client type (customer, admin, security-company) is explicit per endpoint.** Every path in §7 states its `security` scheme; `403` responses name the specific RBAC ruling (C4, C8) they enforce.
- [x] **Third-party failure modes (GPS vendor, payment gateway) have designed fallbacks, not silent assumptions.** §6/§7 — Supabase-outage shape is now a contract-level guarantee (`503 UPSTREAM_UNAVAILABLE`), not a Stage 5 aspiration; §1's token design makes read-path availability during a Supabase outage unconditional rather than merely likely.
- [x] **Capacity/throughput targets stated and testable by performance-engineer.** Stage 5's NFR targets (architecture-review §5) are respected by design: token verification stays local + one Redis lookup (no Postgres round trip on the hot path), consistent with the p95 ≤ 5ms target; §2.2's cost analysis is testable by `performance-engineer` directly (refresh-call volume at 10-minute TTL).
- [ ] **Reviewed and approved by `solution-architect` for cross-domain consistency.** Pending — this document is the submission for that review, not a self-certified pass. Flagging FU-13's genuine gap (§8.2) explicitly so that review is not surprised by it.

**Net:** seven of eight satisfied; one left open exactly as it should be (final sign-off is never self-granted), and one substantive gap (FU-13) disclosed rather than papered over.

---

## 10. Summary for Handoff

- **D-2 final number: 10-minute access-token TTL**, tightened from the provisional 15-minute ceiling, via a two-mechanism protocol — exact immediacy for explicit revocation (Redis `jti` check on every request), bounded 10-minute staleness for passive account-state drift (caught at `/session/refresh`, `/account/me`, and the new internal `/internal/accounts/{id}/status` chokepoint for future services' BR-2 gates).
- **FU-18 resolved:** backend-minted opaque session tokens, not Supabase JWT pass-through — fires the pre-registered ADR-0005 trigger; this document proposes that ADR's content but does not self-ratify it.
- **Stage 7 hard-exit tracker: 5 of 7 items closed** (FU-01, FU-02(a), FU-18 at the design-content level, FU-19, and FU-07 at the contract level); **2 remain open** with named non-backend-architect owners (FU-09/`mobile-architect`, FU-10/`frontend-architect`) whose review this contract unblocks but cannot substitute for.
- **Stage 6 addendum required:** two new tables, `app.sessions` and `app.idempotency_keys` (§3), proposed in column-shape form for `database-architect` to formalize as DDL/RLS — not applied here.
- **One new gap surfaced by this document, not previously caught:** `ui-design.md` §4.1 Screen B's duplicate-signup copy contradicts FR-5/AC-2's binding anti-enumeration requirement (§8.2, FU-20) — the OpenAPI contract implements the binding requirement; the mockup needs a corresponding revision before Stage 9.
- **One item honestly left unresolved:** FU-13 (deletion-event outbox contract shape), due at Stage 7 per architecture-review, not delivered in this document — flagged rather than fabricated.
