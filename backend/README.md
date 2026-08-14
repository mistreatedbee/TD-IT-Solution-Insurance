# TD IT Solutions — Backend API

Node.js + TypeScript backend, per [ADR-0001](../docs/organization/adr/0001-baseline-architecture.md).

Stage 9 (Development) of Feature 001 (Customer Account Creation &
Authentication) has landed: this now includes a working auth/session/MFA/
invitation implementation, in addition to the original infrastructure
scaffold (health checks, MongoDB connectivity, error-handling conventions).
It **has** been run against a live Supabase project (Postgres, identity) and
a live MongoDB Atlas cluster (domain data) — see [`HANDOFF.md`](../HANDOFF.md)
for the current point-in-time status, including which surfaces are still
demo/local-dev only vs. genuinely production-ready. Auth transactional email
goes through Resend via a Supabase Edge Function, not through this backend
directly (see `docs/features/001-authentication/resend-setup.md`).

## Why this is a separate app from the frontend

The frontend (`/` at repo root — React 18 + Vite) and this backend are
genuinely separate deployables per ADR-0001's service decomposition (web,
mobile, backend are three different runtime targets with different deploy
lifecycles). Rather than bolting Express into the root `package.json`
alongside Vite/React dependencies, `backend/` has its own `package.json`
and its own `node_modules`, installed and run independently. The root
`package.json`'s existing scripts/dependencies are untouched by this task.

## Install

```bash
cd backend
npm install
```

## Configure environment variables

This app loads environment variables from the **repo-root** `.env.local`
(`../.env.local` relative to `backend/`), not from a `backend/.env` file.
See [`.env.example`](./.env.example) for the full, current variable list
and what each one is for.

**Fail-fast required in every environment:** `MONGODB_URI`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SESSION_JWT_SIGNING_KEYS`,
`SESSION_JWT_ACTIVE_KID` (security-review.md SR-17 — a backend that boots
without an identity credential and fails later is a worse failure mode than
one that refuses to boot). **Fail-fast in production only, warn-and-fall-
back in development:** `REDIS_URL` (SR-16 — in-memory rate-limit/revocation
store in dev only, never in production) and `SUPABASE_DB_CA_CERT_PATH`
(SR-2(b) — `sslmode=verify-full`). **Optional everywhere:**
`INTERNAL_SERVICE_KEYS` (SR-13 — empty today, no consuming service exists
yet; every `/api/v1/internal/*` call is rejected until this is set),
`TRUST_PROXY_HOPS` (SR-7, defaults to `1`), `PORT`. `CORS_ALLOWED_ORIGINS`
fails **closed** (no cross-origin requests permitted) if unset — see
[ADR-0003](../docs/organization/adr/0003-backend-hosting-platform.md).

**Deliberately never read anywhere in this backend:** `SUPABASE_ANON_KEY`.
Per security-review.md SR-4, the anon key is a secret in this architecture
(it is the sole gate on Supabase's own GoTrue sign-in, which bypasses this
backend's lockout policy and audit logging) and must never be provisioned
into any environment.

## Run

```bash
# Development (watch mode)
npm run dev

# Type-check only
npm run typecheck

# Production build, then run
npm run build
npm start

# Lint
npm run lint

# Unit tests (vitest) — security-critical logic only needs fakes/in-memory
# stores, no live Postgres/Redis/Supabase required to run this suite.
npm run test
```

Once running, verify (routes are mounted under `/api`, per the deployment-time
prefix resolution in
[`api-design.md`](../docs/features/001-authentication/api-design.md) §6):

```bash
curl http://localhost:3000/api/health         # liveness — no DB check
curl http://localhost:3000/api/health/ready   # readiness — pings MongoDB, reports Supabase config status
```

## Deployment

Per [ADR-0003](../docs/organization/adr/0003-backend-hosting-platform.md),
this backend deploys to **Render** as a persistent-process Web Service —
not Vercel, and not as a serverless Function. Render root directory:
`backend/`. Start command: `npm start`. Environment variables to set in
Render's dashboard: every variable in `.env.example` except `PORT` (Render
provides that itself) — at minimum `MONGODB_URI`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_DB_CA_CERT_PATH`,
`REDIS_URL`, `SESSION_JWT_SIGNING_KEYS`, `SESSION_JWT_ACTIVE_KID`,
`CORS_ALLOWED_ORIGINS`, `NODE_ENV=production`. The process refuses to boot
in production without the fail-fast set (config/env.ts, SR-17).

**Build command — must explicitly include dev dependencies:**

```
npm install --include=dev && npm run build
```

Not plain `npm install && npm run build`. With `NODE_ENV=production` set
(above), a bare `npm install` skips `devDependencies` — which is exactly
where `typescript`, `@types/node`, `@types/express`, and `@types/cors`
live, so the build fails with "Cannot find name 'process'" /
"Cannot find name 'console'" / missing module declarations even though
the code is correct. `--include=dev` forces them in regardless of
`NODE_ENV`.

The frontend (deployed separately on Vercel) reaches this backend via an
explicit `VITE_API_BASE_URL` build-time env var pointing at the Render
service's public URL — the two are genuinely cross-origin deployables, not
same-origin, so no frontend code should assume a relative `/api/*` path
resolves to this backend.

## Running frontend + backend together

These are independent apps with independent lifecycles:

```bash
# Terminal 1 — frontend (repo root)
npm run dev

# Terminal 2 — backend
cd backend && npm run dev
```

There is no combined root script (deliberately — see "Why this is a
separate app" above); if a combined dev-orchestration script becomes
desirable later, that's a `backend-architect`/`devops-engineer` call, not
something this scaffold assumes.

## What's here

**Infrastructure substrate (pre-existing):**

- `src/index.ts` — Express entrypoint: env loading, `helmet()`, `cors()`,
  JSON body parsing (explicit 100kb limit, SR-21), `trust proxy` set from
  `TRUST_PROXY_HOPS` (SR-7), health routes, revocation-set rebuild at
  startup (SR-16(a)), graceful shutdown (SIGTERM/SIGINT) that closes
  MongoDB/Postgres/Redis cleanly.
- `src/config/env.ts` — typed env loader; fails fast on every credential
  named in "Configure environment variables" above.
- `src/db/mongodb.ts` — `MongoClient` singleton, unchanged from the
  original scaffold (domain data — policies/assets/GPS/claims — untouched
  by Feature 001).
- `src/middleware/error-handler.ts` — centralized error handling. Now
  enforces SR-19 structurally: only an `ApiError` (lib/errors.ts's fixed
  catalogue) can ever produce a non-generic 4xx message; every other error
  collapses to `"An internal error occurred."` regardless of any
  `statusCode`/`code` a caller may have set on a plain `Error`. Also
  enforces SR-18 (`x-request-id` must be UUID-shaped or is regenerated).

**Feature 001 (Stage 9 — this pass):**

- `src/db/redis.ts` — `KeyValueStore` abstraction backing the revocation
  set and every rate-limit counter; `RedisKeyValueStore` (production) and
  `InMemoryKeyValueStore` (dev-only fallback, per `config/env.ts`'s
  documented posture); `rebuildRevocationSet()` implements SR-16(a).
- `src/db/pg.ts` — direct Postgres pool against the `app` schema (SR-3's
  least-privilege role, SR-2(b)'s `sslmode=verify-full`).
- `src/db/supabase.ts` — real GoTrue Admin API / password-grant / MFA
  mediation (rewritten from the original stub). Never reads
  `SUPABASE_ANON_KEY` (SR-4); every Supabase-dependent call carries a
  5-second backend-owned timeout, surfaced as `SupabaseUnavailableError` →
  `503 UPSTREAM_UNAVAILABLE` (api-design.md §6).
- `src/repositories/*` — SQL access to every table
  `migrations/030_stage9_security_review_schema_changes.sql`,
  `migrations/031_account_audit_log_actor_column.sql`, and the Stage-6
  baseline/addendum define (`accounts`, `sessions`, `invitations`,
  `enrollment_tickets`, `reset_mfa_verification_tokens`, `account_audit_log`,
  `idempotency_keys`).
- `src/lib/*` — the security-critical, DB-independent business logic, each
  unit-tested against an in-memory fake of its repository interface:
  `enrollment-ticket.ts` (SR-1), `refresh-session.ts` (SR-8 rotation/reuse-
  detection, SR-11 absolute cap, device-mismatch), `reset-mfa-
  verification.ts` (SR-6), `login-lockout.ts` (FR-11/AC-5 anti-
  enumeration), `rate-limit.ts`, `jwt.ts`, `errors.ts` (SR-19's catalogue),
  `crypto.ts`.
- `src/middleware/authenticate.ts`, `require-role.ts`, `rate-limit.ts`,
  `idempotency.ts`, `internal-service-auth.ts` (SR-13).
- `src/routes/auth.ts`, `session.ts`, `mfa.ts`, `invitations.ts`,
  `internal.ts`, **`policies.ts`**, **`assets.ts`**, `admin-accounts.ts` —
  mounted under `/api/v1` by `index.ts`.
- `src/context.ts` — wires the above into one `AppContext` object threaded
  through every route factory (no route file imports a DB singleton
  directly), so an equivalent context built from fakes is what the test
  suite uses.

**Feature 004 (Phase 1 — customer surface only, MP-1):**

- `src/db/feature004-collections.ts` — shared collection names, assets
  `$jsonSchema` validator (all 8 types), §5 index specs, and
  `bootstrapFeature004Collections()` (used by startup and the CLI script).
- `scripts/bootstrap-mongo-collections.ts` — one-shot Atlas/local apply:
  `npx tsx backend/scripts/bootstrap-mongo-collections.ts` (requires
  `MONGODB_URI` in repo-root `.env.local`). **Applied and verified idempotent
  on live Atlas `td-it-solution-insurance` (2026-08-11).**
- `scripts/seed-test-accounts.ts` — creates customer, admin, and security
  partner test logins (with MFA for privileged roles). See
  [`docs/TEST-ACCOUNTS.md`](./docs/TEST-ACCOUNTS.md). Run:
  `npm run seed:test-accounts` (requires Supabase vars in repo-root `.env.local`).
- `src/db/mongo-bootstrap.ts` — calls the same bootstrap function at server
  startup after `connectMongo()`. Interim mechanism; ADR-0008 reserved for
  formal versioned provisioning.
- `src/repositories/policies.ts`, `assets.ts`, `policy-status-history.ts`
  — MongoDB access for Feature 004.
- `src/routes/policies.ts`, `assets.ts` — six customer endpoints:
  `POST/GET /policies`, `GET /policies/:id`, `POST/GET /assets`,
  `GET /assets/:id`. Idempotency on `POST`; live `getAccountStatus` gate
  on writes; per-asset-type `details` validation; explicit rate limiters
  per MP-7. **Admin `/admin/policies*` / `/admin/assets*` not implemented.**
- `src/lib/mongo-pagination.ts`, `asset-validation.ts`, `account-gate.ts`,
  `policy-asset-serializers.ts` — supporting libs with tests.
- **85 tests** across 14 files (`npm run typecheck` + `npm test` both pass).
- All auth email (signup verification, password reset, staff invitations) is sent via **Supabase Auth** (`sendSignupConfirmationEmail`, `sendPasswordRecoveryEmail`, `sendInvitationEmail` in `db/supabase.ts`).
- `src/lib/transactional-email.ts` remains for reference but is **no longer wired** to routes.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) + repo-root [`render.yaml`](../render.yaml) —
  Render blueprint (ADR-0003).

## What's NOT here yet

**Named gaps in this pass, not silently dropped:**

- **Brevo (C-5) is deprecated for auth email.** Signup, reset, and invitations use Supabase Auth SMTP.
- **`GET /v1/admin/audit-log`** (the audit-log *read* endpoint) is not
  implemented — this pass wires the audit-log *write* path
  (`account_audit_log`) used by every other route, but the admin-facing
  paginated read contract from api-design.md §7 is not built. `ui-
  design.md` confirms no screen needs it yet (FU-19), so this is a gap,
  not a regression against anything currently consumed.
- **`POST /session/logout`'s and `/mfa/enroll/verify`'s TOTP QR-code
  shape** — GoTrue's actual enrollment response shape (SVG vs. the base64
  PNG `api-design.md` §7 names) is asserted from Supabase's documented API,
  **not verified against a live project** — none exists (same OI-11/FU-07
  posture the security review already named as open).
- **No live integration test exists against a real Supabase/Postgres/
  Redis/GoTrue.** Every test in this pass (`npm run test`) exercises pure
  business logic against in-memory fakes of the repository/store
  interfaces — this is deliberate (fast, deterministic, no infrastructure
  dependency) but it means the SQL in `src/repositories/*` and the GoTrue
  REST calls in `src/db/supabase.ts` have never executed against a real
  database or a real Supabase project. `R-8`'s standing risk ("everything
  in this review is a design, and no auth code exists yet") is now half
  true rather than fully true: the code exists and is unit-tested, but is
  not yet integration-tested or pentested (SR-25).
- **`docs/features/003-mobile-app-foundation/architecture.md` §3.2's
  `deviceId`-on-refresh mechanism** is implemented and server-side correct
  (`/session/refresh` accepts an optional `deviceId`, checks it against the
  session's bound device in `lib/refresh-session.ts`'s `rotateRefreshToken`,
  and treats a mismatch at least as seriously as rotation reuse — whole-chain
  plus whole-account revocation, `device_mismatch` revoked-reason). Formally
  ratified into the contract as of `api-design.md` v1.1.0 (§11 Amendment C).
  **Known gap, not this service's to close:** the mobile client
  (`mobile/src/api/client.ts`'s `refreshAccessToken()`) does not yet send
  `deviceId` on refresh, so the mechanism is not yet exercised end-to-end in
  production traffic — tracked against `mobile-engineer`, not blocking here
  since the field is optional/additive and safe in its absence.
- **SR-14's forced-re-enrollment branch of `POST /auth/login`**
  (`mfaEnrollmentRequired`/`enrollmentTicket`/`expiresIn`, ratified in
  `api-design.md` v1.1.0 §11 Amendment B) now correctly calls
  `storePendingEnrollment` alongside `issueEnrollmentTicket`, mirroring
  `routes/invitations.ts`'s `/accept` handler — a prior gap here (the ticket
  was issued but never given a matching KV-backed pending-enrollment record)
  made the flow fail every time at `/mfa/enroll` with
  `ENROLLMENT_TICKET_INVALID`. Covered end-to-end by
  `src/routes/auth.test.ts` (login → `mfaEnrollmentRequired` → `/mfa/enroll`
  → `/mfa/enroll/verify` → session issued, plus single-use-ticket
  re-rejection).
- **Three small, independent fixes flagged by review work, all landed in one
  pass:**
  1. **`privileged_data_access` actor-vs-subject fix.** `app.account_audit_log`
     had exactly one account column, and `routes/invitations.ts` (actor) and
     `routes/internal.ts` (subject) disagreed about what it meant for the same
     event type (api-design.md §11 Amendment E's open item). `migrations/031`
     adds `actor_account_id` (mirroring `app.account_state_transitions`'s
     existing actor/subject split); `repositories/audit-log.ts`'s
     `AuditEventInput` now takes an optional `actorAccountId` alongside the
     existing subject `accountId`; both call sites updated to populate both
     fields explicitly rather than overload one. Covered by
     `src/repositories/audit-log.test.ts`.
  2. **`GET /account/me` now actually sets `mfaEnrolled`** (the response
     schema declared it; the handler never populated it). Reuses the exact
     same "does this account have a verified TOTP factor" check SR-14's login
     gate and `POST /mfa/enroll`'s authenticated opt-in path already use
     (`supabase.findVerifiedTotpFactor`), minting a transient Supabase user
     access token from the account's email the same way `routes/mfa.ts`'s
     authenticated path does (no second mechanism invented). Covered by
     `src/routes/session.test.ts`.
  3. **Token TTLs tightened/documented to C-5.3's ceilings**
     (`compliance-review-smtp-vendor.md` — token lifetimes must be short
     enough that a copy retained in Brevo's 1-month-floor transactional logs
     is inert). `lib/policy.ts`'s `INVITATION_TTL_SECONDS` was **7 days**,
     over C-5.3's 72-hour ceiling by more than 2x — tightened to 72 hours;
     this is the one of the three token types this codebase actually
     controls end to end (its own opaque token, its own DB-stored expiry).
     `EMAIL_VERIFICATION_LINK_TTL_SECONDS` (24h ceiling) and
     `PASSWORD_RESET_LINK_TTL_SECONDS` (60min ceiling) were already at their
     ceilings numerically, but **neither constant is wired into any TTL
     check in this codebase** — both tokens are minted via Supabase Admin
     API's `generateLink()` and their actual expiry is governed by the
     Supabase project's own Auth configuration (dashboard "Email OTP
     expiration"/mailer settings), which this backend's code has no
     parameter to set. **Follow-up action item, out of this codebase's
     reach:** whoever administers the Supabase project dashboard must
     confirm/set those two expiries to <= 24h / <= 60min respectively to
     actually satisfy C-5.3 for those two token types — this pass only
     documents the required ceiling in code comments citing C-5.3, it does
     not and cannot enforce it from here.

- **ADR-0006's privileged-access audit correlation (ratified 2026-08-11) —
  landed in code, gated on two unapplied migrations, with no bulk call site to
  protect yet.** What exists: `requestIdMiddleware` sets `req.auditRequestId`
  (server-generated only, never from a header, never echoed — AUD-4/AUD-5);
  `repositories/audit-log.ts` records `actor_service`, `actor_session_id` and
  `audit_request_id` alongside the existing subject/actor pair, refuses an
  unattributed privileged read or a subject-less `privileged_data_access` row,
  and exposes `recordBulkDisclosure()` implementing AUD-3(b) in the shape
  ruling R-1 chose (one row per disclosed subject **plus** one call-scoped
  `privileged_bulk_access` row carrying `result_count`, all in one multi-row
  statement); `POST /v1/invitations` emits `privilege_granted` rather than
  `privileged_data_access` (ruling R-2 — granting privilege is not accessing
  data; `api-design.md` §11.F, v1.3.0). **Two hard caveats.**
  (a) `migrations/032` and `migrations/033` are **written and not applied** —
  they must be applied to the live Supabase project *before* this code is
  deployed, or every audit write fails, and audit writes are on the login path.
  (b) `recordBulkDisclosure()` has **no caller**: no `/admin/*` route exists on
  this platform, so the bulk-disclosure guarantee is machinery waiting for its
  first endpoint (`GET /v1/admin/accounts` per `api-design.md` §11.E, and
  Feature 004's `/admin/policies*`/`/admin/assets*`), which is exactly what
  gating at design time was meant to achieve. Covered by
  `src/repositories/audit-log.test.ts` and `src/middleware/error-handler.test.ts`.

**Infrastructure/process items, out of application-code scope (confirmed,
not assumed) — see the final Stage 9 hand-off summary for the authoritative
per-SR breakdown:**

- SR-2(a)/(c)/(e), SR-5, SR-22, SR-23, SR-24, SR-25 — Supabase-dashboard
  configuration, hosting-tier/PITR decisions, pentest commissioning, and
  the support-assisted-reset runbook are outside what a `git diff` to this
  directory can close.
- **C-5.3 (`compliance-review-smtp-vendor.md`)** — the Supabase project's
  Auth dashboard "Email OTP expiration"/mailer expiry settings for the
  signup-confirmation and recovery token types must be confirmed/set to
  <= 24 hours and <= 60 minutes respectively. Not addressable from this
  repo's code (see the token-TTL fix above); tracked here so it isn't lost.
