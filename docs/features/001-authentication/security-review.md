# Feature 001 — Security Review (Stage 8)

**Status:** **SIGN-OFF GRANTED WITH REQUIRED CHANGES — one scoped hold.** 25 required changes (SR-1 … SR-25). SR-1 is a **scoped hold**: Stage 9 may not begin on the invitation-acceptance / MFA-enrollment flow until it is closed. The remaining Stage-9-blocking items (SR-2 … SR-16) are contract, configuration and schema corrections — days of work, not weeks. 9 residual risks accepted with named owners. 8 open items I could not resolve from inside this repository.
**Date:** 2026-08-08
**Lifecycle stage:** 8 — Security Review. **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate:** `security-engineer` (R — [`secrets-management-plan.md`](secrets-management-plan.md), filed 2026-08-08) · `compliance-specialist` (R — [`compliance-review-supabase.md`](compliance-review-supabase.md), filed 2026-08-08). Per `02-feature-lifecycle.md` all three must sign; this document is the third and final signature, and it does not override or re-open either of the other two.
**Discharges:** ADR-0002 "Required Follow-ups Before Implementation" item 1 — **the technical half** · `architecture-review.md` **FU-15(a)** (technical half, expressly reserved for this role by `compliance-review-supabase.md` §1 and §13) · **FU-05**, **FU-06**, **FU-17** · the `cybersecurity-architect` half of **C-9** (FR-24 factor-type wording) · **FU-16** at the design level.
**Reviewed against:** [`06-security-standards.md`](../../organization/06-security-standards.md), [`05-development-standards.md`](../../organization/05-development-standards.md), [ADR-0001](../../organization/adr/0001-baseline-architecture.md), [ADR-0002](../../organization/adr/0002-polyglot-persistence-identity-vs-domain-data.md), [ADR-0003](../../organization/adr/0003-backend-hosting-platform.md).
**Artifacts reviewed in full:** `business-requirements.md`, `architecture-review.md`, `architecture/backend-approach.md`, `architecture/data-model-approach.md`, `database-design.md`, `architecture/database-addendum-001.md`, `api-design.md`, `compliance-review-supabase.md`, `secrets-management-plan.md`.
**Running code read directly:** `backend/src/index.ts`, `backend/src/config/env.ts`, `backend/src/db/mongodb.ts`, `backend/src/db/supabase.ts`, `backend/src/middleware/error-handler.ts`, `backend/src/routes/health.ts`, `backend/.env.example`, `.gitignore`, `.mcp.json`, `vercel.json`.

---

## 0. Verdict, stated up front

**SIGN-OFF GRANTED WITH REQUIRED CHANGES.**

The architecture is sound in the place it most matters. `api-design.md` §1's ruling that the backend mints its own session tokens rather than passing Supabase JWTs through is the single best security decision in this feature's whole document chain: it converts ADR-0002's mediation principle from a policy someone has to remember into a structural property of the system, and it removes an entire class of vulnerability (a client holding a credential that a third-party data API would honour) rather than mitigating it. I concur with it without reservation and I am ratifying the 10-minute access-token ceiling it set.

Four findings drive the conditions:

1. **One privileged-account-takeover path exists in the contract as written.** `POST /v1/mfa/enroll`'s pre-session path (api-design.md §7) authorizes on a **client-supplied `accountId`** and `POST /v1/mfa/enroll/verify` then **mints a full session** against it. There is no server-issued, single-use, account-bound artifact tying the caller to the account. An actor who knows or learns a privileged account's UUID can enroll their own TOTP factor and obtain a session as an admin. Account IDs are not secrets in this design — they appear in the `/invitations/{token}/accept` response, in the JWT `sub`, in `/admin/audit-log` responses, and in `/internal/accounts/{id}/status` paths. **This is SR-1 and it is a scoped hold, not a note.**

2. **RLS is defense-in-depth only, that is the correct posture, and it defends against almost none of the threat that actually matters.** FU-18's resolution means no client ever holds a Supabase-honoured credential, so the `authenticated`-role policies in `database-design.md` §5 have no caller. That is fine — but it must be said plainly that RLS gives **zero** protection against the real threat, which is compromise of the service-role key or the Postgres credential: both bypass RLS by definition. The controls that actually address that threat are not RLS. They are (a) **not exposing the `app` schema through PostgREST at all**, (b) a least-privilege Postgres role instead of the project's superuser, and (c) detection. (a) is currently specified the *wrong way round* — `database-design.md` §1 instructs that `app` be added to Supabase's Exposed Schemas. **SR-3 reverses that.**

3. **The Supabase project's own internet-facing auth endpoint is a bypass route around our security controls, and the plan currently treats the key that opens it as public.** Supabase's GoTrue API (`https://<ref>.supabase.co/auth/v1/*`) is internet-facing, cannot be disabled, and implements email+password sign-in directly — with **none** of FR-11's lockout policy and **none** of FR-12's audit logging, both of which live exclusively in our backend. The only thing keeping that route shut is that the `anon` key is never published. `secrets-management-plan.md` §2 characterises the anon key as "public-but-not-secret… safe to ship in a client bundle by Supabase's own design." **Under this architecture that characterisation is wrong and I am overruling it (SR-4):** in a system where the anon key is the sole gate on a control-bypass route, it is a secret.

4. **A large amount of load-bearing security posture lives in Supabase dashboard configuration that no code review, CI check, or ADR touches.** Exposed schemas, the auth redirect-URL allowlist (an open-redirect/token-exfiltration surface for verification and reset links), leaked-password protection, Supabase's own auth rate limits, custom SMTP, network restrictions, log drains. This is the architecture-drift risk I am specifically chartered to monitor, and it is currently invisible. **SR-5** requires it be written down in-repo as a verifiable baseline.

**What I am explicitly *not* doing:** I am not blocking the feature. Every finding below is a correction to a paper artifact or a configuration setting, at the cheapest possible moment to make it — before a single line of auth code exists. That is the entire point of this gate existing at stage 8 rather than stage 10.

**On C-2 (Supabase DPA):** unexecuted, confirmed by the platform owner. It is a **compliance/legal gate owned by `compliance-specialist` and `cto`**, not a technical one, and it does **not** block this technical sign-off. It does block the overall Stage 8 exit artifact and Stage 9 entry, per `compliance-review-supabase.md` §13 and this org's lifecycle table separating stage ownership from stage isolation. I am naming it, not absorbing it, and not signing around it.

**On C-4(c) (`auth.audit_log_entries` retention):** **still open, and partly mine.** `compliance-review-supabase.md` routed the design and upgrade-safety review to `database-architect` + `security-engineer`, and OI-4 (does Supabase support deleting from that table) is unanswered. I am **not** closing it. See §7 and OI-4 below.

---

## 1. Scope of This Review

**In scope:** the technical security architecture of Feature 001 — encryption in transit across every channel this feature opens; service-role and database credential handling across every surface; the RLS threat model and what it does and does not defend; network exposure and CORS/cross-site posture; authentication and session mechanics at the precision level required to implement them safely; authorization-boundary (IDOR/BOLA) and injection surface in the API contract; and the residual risks that must be accepted rather than silently carried.

**Out of scope, deliberately, and not duplicated here:**

- **Legal/regulatory determinations.** POPIA lawfulness, the s72 basis, the operator/responsible-party framing, retention *periods* as a legal matter, and disclosure copy are `compliance-specialist`'s and are settled in `compliance-review-supabase.md`. Where I set a technical control, I am satisfying their acceptance criteria, not re-deriving them.
- **Implementation hardening and scanning.** `security-engineer`'s lane. This document sets standards; it does not verify code, because no auth code exists yet.
- **Whether to use Supabase at all.** ADR-0002, ratified. Not re-litigated. None of ADR-0002's revisit triggers is fired by anything in this review.
- **Non-security architecture.** Latency budgets, index strategy, capacity. Where I tighten a security number that has a performance consequence (§6), I say so.

**Method and honesty note, per `07-documentation-standards.md`:** every finding below was established by reading the repository and the documents named in the header. **No live Supabase project was inspected. No dashboard, no `supabase` MCP call, no credential, no network probe.** Every statement about *this platform's specific Supabase project* — region code, tier, PITR, exposed-schema setting, redirect allowlist, auth rate limits, whether `af`/`eu` — is therefore an **open item, not a finding**, and is listed as such in §9. I have not filled a single one of those gaps with an assumption. Likewise: **no Feature 001 endpoint exists in code**, so this review assesses *design*, and cannot yet assess design-to-implementation conformance. That conformance check is a Stage 9/10 obligation and is recorded as such (SR-17, R-8).

---

## 2. Threat Model — Feature 001 Surfaces

### 2.1 Trust boundaries this feature creates

| # | Boundary | Crossed by | Zero-trust posture |
|---|---|---|---|
| TB-1 | Public internet → Identity Service (Render) | Mobile app, admin dashboard, security-company dashboard, and anyone else | Explicit authN/authZ per endpoint; 12 of 20 endpoints are unauthenticated **by necessity** (signup, login, reset, invitation accept) — these are the hard edge and carry rate limiting, anti-enumeration and idempotency as their controls. **Verified present in contract.** |
| TB-2 | Identity Service → Supabase GoTrue Admin API | `SUPABASE_SERVICE_ROLE_KEY` | Single credential, single module, single service. **Verified: `backend/src/db/supabase.ts` is the only Supabase-touching module and it throws rather than half-initialising.** |
| TB-3 | Identity Service → Supabase Postgres | `SUPABASE_DB_URL` | **Currently the project superuser and RLS-exempt. SR-3 requires a least-privilege role.** |
| TB-4 | Identity Service → MongoDB Atlas | `MONGODB_URI` | Untouched by Feature 001. Verified TLS-by-default via `mongodb+srv`, no TLS-weakening options set. |
| TB-5 | Identity Service → Redis-class store (revocation set + rate-limit counters) | `REDIS_URL`, undecided (FU-08) | **No trust posture defined anywhere.** SR-2, SR-16. |
| TB-6 | Identity Service ← future domain services (`/internal/accounts/{id}/status`) | Static `X-Internal-Service-Key` | **Weakest boundary in the design.** Internet-routable on the current topology, single shared static secret, no per-caller identity, no rotation, no audit. SR-13. |
| TB-7 | Identity Service → SMTP operator (verification / reset / invitation emails) | Vendor unselected (C-5) | Carries email address **plus a token equivalent to temporary account access**. SR-2(e). |
| TB-8 | Public internet → Supabase's own GoTrue + PostgREST endpoints | `anon` key (gate), `service_role` key (total) | **Not eliminable — Supabase's endpoints are always internet-facing.** SR-3, SR-4, SR-5. This is the boundary the whole document chain had not previously named. |
| TB-9 | Browser dashboard JS ← session credential | XSS on a `*.vercel.app` origin | **Undesigned.** No CSP anywhere (`vercel.json` verified: rewrites only, no `headers`), and refresh-token storage for browser clients is unspecified (FU-10 open). SR-12. |

### 2.2 STRIDE, per surface, Feature 001 only

| Surface | Spoofing | Tampering | Repudiation | Information disclosure | DoS | Elevation of privilege |
|---|---|---|---|---|---|---|
| **Customer mobile app** | Credential stuffing (mitigated: §6 lockout); stolen refresh token (partial: FR-20 device binding — **client-supplied `device_id` is not an authenticator**, R-5) | Token forgery (mitigated: backend-signed JWT, `kid`-rotatable) | Weak — `ip_address` will record Render's proxy IP unless SR-7 lands, destroying the forensic value of `app.account_audit_log` | `attemptsRemaining` is a deliberate, accepted minor oracle | Signup/login flood (mitigated: §6 per-IP limits, contingent on SR-7) | Customer → privileged is structurally impossible: no self-service path to a privileged `user_type` exists (verified: `invitations_privileged_user_type` CHECK + separate endpoint group) |
| **Admin dashboard** | **SR-1: MFA-enroll takeover.** Compound lockout has no designed recovery (FU-16 → SR-24) | Invitation forgery (mitigated: hashed token, partial-unique pending index) | No audit event type exists for "admin read another account's data" — **`06-security-standards.md` requires it. SR-10** | Audit-log read is cross-account by design; admin-only per C8 | Rate-limited (60/min) | **`POST /v1/invitations` is a privilege-escalation primitive** — an admin mints admins. Step-up MFA required, SR-6/§6 |
| **Security-company dashboard** | Same as admin, plus a partner-org insider | — | — | **No operator-facing data endpoint exists in Feature 001 at all.** Partner-org scoping is therefore not yet enforced anywhere, because there is nothing yet to scope. §5.3 sets the binding forward constraint | — | Operator → admin blocked by `user_type`; **cross-org escalation is undefendable today because `app.account_status_cache` does not carry `partner_organization_id`. SR-9** |
| **Backend API (Identity Service)** | TB-6's static key | Body tampering (OpenAPI validation, SR-21) | Client-supplied `x-request-id` echoed verbatim into logs and responses — log-forging. SR-18 | `errorHandler` returns raw `err.message` on any non-500. SR-19. `/api/health/ready` discloses dependency state unauthenticated. SR-20 | `express.json()` default limit only. SR-21 | — |
| **Supabase (TB-8)** | GoTrue direct sign-in **bypasses FR-11 and FR-12 entirely**. SR-4, SR-5 | Auth redirect-URL allowlist unverified → reset/verify token exfiltration. SR-5 | `auth.audit_log_entries` is a vendor-managed duplicate we cannot purge (C-4(c), OI-4) | PostgREST on `app` schema. SR-3 | Vendor's problem, but ours to detect (FU-02(c), SR-23) | `service_role` = total. §4 |

### 2.3 Attack tree — "attacker obtains a session as an admin or security-company operator"

This is the scenario this platform must care about most, because a privileged session is the eventual route to real-time asset location, and `06-security-standards.md` treats location as sensitive personal data for exactly that reason. Feature 001 does not yet expose location — it builds the door.

```
GOAL: hold a valid session for an admin / security-company-operator account
├── A. Enroll an attacker-controlled MFA factor on a privileged account
│   ├── A1. POST /v1/mfa/enroll with a known accountId, then /verify → session   ** OPEN — SR-1 **
│   └── A2. Remove the victim's factor via service_role, re-enroll               → requires B; also undetected today → SR-14
├── B. Obtain SUPABASE_SERVICE_ROLE_KEY
│   ├── B1. Leaked into a client bundle          → structurally prevented today; NOT CI-enforced → SR-17
│   ├── B2. Committed to git                     → .gitignore verified correct; rotation runbook exists (secrets plan §7)
│   ├── B3. Render dashboard account compromise  → R-2 (accepted; MFA on Render/Supabase/Atlas accounts is the control, unverified — OI-7)
│   └── B4. Read from logs                       → env.ts verified never to print values; SR-18 extends the rule forward
├── C. Steal a live privileged session credential
│   ├── C1. XSS on the dashboard origin → read refresh token from JS-reachable storage   ** UNDESIGNED — SR-12 **
│   ├── C2. Steal refresh token in transit                                   → TLS; SR-2
│   └── C3. Replay a rotated-out refresh token                              → detection specified, response incomplete → SR-8
├── D. Defeat the password + MFA gate directly
│   ├── D1. Brute-force TOTP at /auth/reset-password/mfa-verify   ** NO RATE LIMIT SPECIFIED — SR-6 **
│   ├── D2. Brute-force password via Supabase GoTrue, bypassing our lockout  ** SR-4, SR-5 **
│   └── D3. Brute-force password via our /auth/login             → 5/15min per identifier + 20/15min per IP → adequate
├── E. Hijack the account-recovery path
│   ├── E1. Exfiltrate a reset token via an unallowlisted Supabase redirect URL  ** SR-5 **
│   ├── E2. Read the reset token from the SMTP provider's message logs           → C-5 + SR-2(e)
│   ├── E3. Leak the token via Referer from our own reset page                   → SR-12(d)
│   └── E4. Social-engineer the support-assisted reset                           ** NO PROCESS EXISTS — SR-24 **
└── F. Get invited
    └── F1. Compromise one admin, mint more admins   → step-up MFA on POST /v1/invitations, §6; audit event SR-10
```

**Reading of this tree:** five of six branches are closed or adequately mitigated by the design as written. The two that are open — **A1** and **D1** — are both single-line contract omissions, and both are fixed before Stage 9 by SR-1 and SR-6. **C1** and **E4** are undesigned rather than broken, and are the two items most likely to be quietly skipped if not given owners and deadlines, which is why SR-12 and SR-24 exist.

### 2.4 Attack tree — "attacker reads the identity store directly"

```
GOAL: read app.accounts / auth.users out of Postgres
├── PostgREST at https://<ref>.supabase.co/rest/v1/
│   ├── with anon key   → requires (i) anon key published AND (ii) app schema exposed AND (iii) an RLS hole
│   │                     → SR-3 removes (ii) structurally; SR-4 removes (i); RLS draft removes (iii). Three independent gates.
│   └── with service_role key → RLS irrelevant. See branch B above.
└── Direct Postgres (port 5432 / pooler 6543)
    ├── credential compromise  → branch B; SR-3's least-privilege role bounds the blast radius
    └── network reachability    → Supabase Postgres is internet-reachable by default; Network Restrictions are tier-gated → OI-5, SR-5
```

**This is the honest answer to the task's RLS question.** RLS is the third of three gates on one of two routes. It is worth keeping — it is cheap and it fails closed — but anyone who reads `database-design.md` §5 and concludes the identity store is protected has misread which control is load-bearing. **SR-3 is.**

---

## 3. Encryption in Transit — Findings

**Verdict: not adequately specified anywhere today. Nothing is *wrong*; several things are simply unstated, and one (Postgres TLS verification) defaults to a weaker posture than `06-security-standards.md` ("TLS everywhere in transit — no exceptions") permits.**

| Channel | Current state, as verifiable from the repo | Ruling |
|---|---|---|
| Client → API | `helmet()` is applied (`backend/src/index.ts:40`), whose defaults include HSTS. Render terminates TLS and redirects HTTP→HTTPS at the platform edge. **But no document asserts TLS-only, and the OpenAPI contract's `servers:` block is `- url: /v1` — scheme-relative, so the contract itself does not require HTTPS.** | **Adequate in practice, unstated in contract.** SR-2(a). |
| API → Supabase GoTrue | `https://<ref>.supabase.co` — TLS mandatory, vendor-enforced. | **Adequate.** No action. |
| API → Supabase Postgres | `SUPABASE_DB_URL` connection string. Nothing in `secrets-management-plan.md`, `database-design.md` or `.env.example` specifies TLS parameters. Node Postgres clients commonly default to either no TLS or **TLS without certificate verification**; `sslmode=require` encrypts but does **not** authenticate the server. | **NOT ADEQUATE. SR-2(b): `sslmode=verify-full` with Supabase's CA certificate, pinned and version-controlled.** "Encrypted but unauthenticated" is not TLS-everywhere; it is an unauthenticated channel carrying every credential and every identity row on the platform. |
| API → MongoDB Atlas | `mongodb+srv://` — TLS on by default. **Verified `backend/src/db/mongodb.ts` sets only `serverSelectionTimeoutMS` and no TLS-weakening option.** | **Adequate.** SR-2(c) records the standing prohibition on `tlsAllowInvalidCertificates`/`tlsInsecure` so it is a reviewable rule rather than a lucky default. |
| API → Redis-class store | Undecided (FU-08). No transport posture stated. This channel carries session `jti` values (the revocation set) and account identifiers (rate-limit keys). | **NOT SPECIFIED. SR-2(d): `rediss://` (TLS) mandatory, plaintext Redis prohibited in every environment including local dev-against-shared-instance.** |
| API → SMTP operator | Vendor unselected (C-5). Carries email + a token equivalent to temporary account access. | **SR-2(e): TLS-mandatory submission (implicit 465 or enforced STARTTLS with certificate verification); opportunistic TLS is not acceptable for this payload.** Feeds C-5's selection criteria. |
| Frontend (Vercel) → API (Render) | Cross-origin per ADR-0003, HTTPS both sides. | Adequate for transport. The *cross-site* consequences are a different problem — §5.2. |

**One factual correction for the record:** `api-design.md` §6 states the `/api` prefix was forced by "the Vercel multi-service deployment (`vercel.json`, repo root), whose rewrite rules route `/api/*` to the backend service." **That is no longer true.** ADR-0003 removed the backend from Vercel and its migration checklist item 9 explicitly removed that rewrite; the current `vercel.json` contains a single SPA catch-all and no `/api` route. The `/api` prefix ratification stands (it matches `05-development-standards.md` regardless), but the stated reason is stale, and the *real* topology — two genuinely different registrable domains — has a material security consequence the document chain has not registered. See §5.2 / SR-12.

---

## 4. Service-Role Credential Handling — Findings

**Verdict: the design does not expose a Supabase service-role key or a MongoDB credential to any client surface. Verified, not assumed. Two structural gaps and one mischaracterisation.**

**What I verified directly:**

- `grep` across the whole repo excluding `docs/`: **no `VITE_SUPABASE_*` variable exists anywhere**, no frontend source file references Supabase, and no client-side Supabase SDK is a dependency of the web app. The only Supabase-touching module in the codebase is `backend/src/db/supabase.ts`, which throws rather than returning a half-configured client — the correct fail-loud posture.
- `secrets-management-plan.md` §3's hard rule ("nothing prefixed `VITE_` may ever hold a MongoDB or Supabase secret… must never exist in the Vercel project's environment variable list at all, secret-flagged or not") is the right rule, correctly reasoned from how Vite inlines build-time variables. **Accepted as written.**
- `.gitignore` ignores `.env`, `.env.*` (with a correctly narrow `!.env.example` exception) **and** `*.local` — `.env.local` is covered twice over. `backend/.env.example` contains no real values.
- `backend/src/config/env.ts` prints variable **names** only, never values, on both the throw and warn paths.
- `.mcp.json` **is committed** and contains the Supabase `project_ref` (`mowaqxfbwqdmjssghpvt`) in a URL. **No access token is committed** — the MCP server is `type: http` with no credential in the file. A project ref is not a credential; it is the project's public API hostname. **Accepted, with the note that it makes TB-8 concretely targetable, which is a further argument for SR-3/SR-4/SR-5 rather than a finding in itself.**

**Gap 1 — the rule is documented but not enforced (SR-17).** Nothing prevents a future engineer from adding `VITE_SUPABASE_SERVICE_ROLE_KEY` to the Vercel project. `compliance-review-supabase.md` C-7 already establishes the precedent and the mechanism (a CI check asserting a forbidden string is absent from the production bundle). The same mechanism must cover credentials. This is exactly the class of control I prefer — one that makes a mistake structurally impossible rather than relying on someone remembering §3 of a planning document.

**Gap 2 — the Postgres credential is the project superuser (SR-3).** `SUPABASE_DB_URL` as provisioned is the project's `postgres` role: table owner, RLS-exempt, DDL-capable, and able to read `auth.users`, `auth.mfa_factors` and every `app.*` table. A compromise of that one string is a total compromise of the identity store with no bounding. The backend needs: `SELECT/INSERT/UPDATE` on named `app.*` tables, and nothing else. Migrations are a separate, human-run, separately-credentialed activity. **Required: a dedicated least-privilege application role, distinct from the migration credential.** This is the control that actually bounds branch B of §2.3, and it is the only one that does.

**Gap 3 — the `anon` key is mischaracterised (SR-4).** `secrets-management-plan.md` §2 says of the anon key: *"treat it as public-but-not-secret (it is safe to ship in a client bundle by Supabase's own design)."* That is true of a *conventional* Supabase application, where the anon key's power is bounded by RLS and the client is *supposed* to talk to Supabase. **It is false here.** In this architecture the anon key is the credential that unlocks TB-8 — direct GoTrue sign-in that bypasses FR-11's lockout policy and FR-12's audit log completely, and direct PostgREST access if SR-3 is ever reversed. **Ruling: the `anon` key is not to be provisioned into any environment, is not to be published, and is to be handled as a secret if it ever exists.** `secrets-management-plan.md` §2's characterisation must be amended. Everything else in that plan — the storage matrix, the 90-day unified rotation, the local-dev handoff, the compromise runbook, the honest §8 open items — I accept as written and it is a genuinely good artifact; this is a single-cell correction, not a rejection.

**Also required (SR-17, second half):** `backend/src/config/env.ts` currently treats `SUPABASE_DB_URL` as optional/warn-only, and `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` do not exist in `env.ts` or `.env.example` at all. At Stage 9 all three must become fail-fast `requireEnv` calls. `secrets-management-plan.md` §2 already flagged this as a tracked action; I am making it a gate condition rather than a note, because a backend that boots without an identity credential and fails later is a worse failure mode than one that refuses to boot.

---

## 5. Network Posture and Cross-Site Findings

### 5.1 Internet-facing surfaces

**Endpoints intentionally unauthenticated** (`security: []` in the contract): `/auth/signup`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/login`, `/auth/mfa/challenge`, `/session/refresh`, `/auth/reset-password/{request,confirm,mfa-verify}`, `/invitations/{token}` (GET), `/invitations/{token}/accept`. **All correct** — each is a pre-session flow that cannot require a session. Each carries a rate-limit row in `api-design.md` §5 except `/auth/reset-password/mfa-verify` (SR-6) and `/auth/verify-email` (accept: single-use Supabase token, low value in brute-forcing).

**`POST /v1/mfa/enroll` does not declare `security: []`,** so it inherits the global `bearerAuth` — yet its own summary says it is "callable by an unauthenticated-but-invitation-verified privileged user." The contract is internally contradictory about whether this endpoint requires a bearer token. That contradiction is the surface of SR-1.

**No GPS webhook ingestion exists in this feature** — confirmed. Nothing in Feature 001 accepts vendor-originated input. The standing requirement (device/vendor signature verification, treat every webhook as adversarial) is untouched and unaffected.

**`/api/health` and `/api/health/ready` are unauthenticated.** `/health` returns `{status:'ok'}` — fine. `/health/ready` discloses `{mongodb: 'up'|'down', supabase: 'configured'|'not_configured'}`. Minor information disclosure plus a free liveness oracle for confirming a DoS is landing. **SR-20: reduce the public readiness response to a status code plus `status`; put the dependency breakdown behind auth or an internal path.** Low severity, near-zero cost.

**`/api/v1/internal/accounts/{id}/status` (TB-6) is internet-routable.** On the ADR-0003 topology there is no private network — everything mounted on the Render service answers on its public hostname. The endpoint is therefore protected solely by a static `X-Internal-Service-Key` header: one shared secret, no per-caller identity, no rotation cadence (it appears in no credential inventory, including `secrets-management-plan.md` §2), no rate limit row, and no audit trail. It is also IDOR-shaped **by design** — it accepts an arbitrary `{id}`. That is acceptable for a service-to-service surface, but it makes the key the entire control, and a leaked key yields account-status enumeration across every account. **SR-13.** Credit where due: the response body is properly minimised (`accountState`, `mfaRequired`, `updatedAt` — no PII), and that minimisation must be treated as a boundary, not a starting point.

**Supabase's own endpoints (TB-8) cannot be closed.** Covered in §0 finding 3, §2.4, SR-3/SR-4/SR-5. This is the most important network-posture finding in this review and it appears in none of the upstream documents.

### 5.2 CORS and the cross-site problem nobody has surfaced

**CORS itself is correctly configured.** `backend/src/index.ts:45-50` uses an explicit allowlist from `CORS_ALLOWED_ORIGINS` and **fails closed** (`origin: false`) when the list is empty, rather than reflecting all origins. `env.ts` warns loudly on an empty list. This is exactly right and I am signing it off as-is. Two riders:

- **(a)** The allowlist is empty in every environment today. It must be populated before any browser surface calls the API, and — a lateral-movement point, not a CORS point — **the public marketing origin must not appear in it.** The admin dashboard and the security-company dashboard should be distinct origins from the marketing site and from each other, so that an XSS or a supply-chain compromise on the public marketing bundle cannot reach an authenticated API session. This is the "lateral movement between customer-facing and admin/security-company surfaces" risk I am chartered to monitor, and origin separation is the cheapest structural defence available. **SR-12(a).**
- **(b)** `credentials: true` is set. Under `api-design.md` §7's `securitySchemes`, the session credential is a **bearer token in a header**, not a cookie — so `credentials: true` is currently unnecessary. Whether it should stay depends entirely on (c).

**(c) — the finding.** ADR-0003 put the frontend on `*.vercel.app` and the backend on `*.onrender.com`: **two different registrable domains.** `FU-10` (browser session handling) is still open, and nothing anywhere states where a browser client stores the refresh token. The two candidate answers have very different security properties, and the topology has already foreclosed the better one:

- **HttpOnly / Secure / SameSite cookie** — the correct answer for a privileged dashboard, because it takes the refresh token out of JS reach and neutralises XSS-to-persistent-session-theft. **On the current two-domain topology this requires `SameSite=None`, i.e. a third-party cookie** — blocked outright by Safari's ITP and being phased out in Chrome. It is not a viable option as deployed.
- **Refresh token in JS-reachable storage** — viable, and means any XSS on a dashboard origin yields a long-lived privileged session. For a dashboard whose eventual purpose includes coordinating asset recovery, I am not willing to accept that silently.

**Ruling (SR-12):** before either browser dashboard ships, the platform must either **(i)** place the frontend and the API under a **common registrable domain** (e.g. `app.<domain>` and `api.<domain>`), which makes a host-only `SameSite=Lax`/`Strict` HttpOnly cookie work and is my strong preference because it is structural, or **(ii)** record an explicit, `cto`-signed risk acceptance for JS-reachable refresh tokens, with a **CSP** as the compensating control. This is a domain/DNS decision with a lead time, which is why it is being raised now rather than at Stage 13. Owner: `frontend-architect` + `cloud-infrastructure-architect`, ruling mine. **It is not a Stage 9 blocker for the mobile app or the API** — mobile clients are unaffected — so it does not hold this gate; it holds the dashboards.

**(d)** No CSP or security headers exist for the Vercel-served surfaces — verified, `vercel.json` contains rewrites only. `helmet()`'s defaults (HSTS, `Referrer-Policy`) apply to **API responses only**, not to the frontend pages. Since the pages that receive email-verification, password-reset and invitation tokens **in the URL** are frontend pages, they need `Referrer-Policy: no-referrer` and must strip the token from the URL/history after reading it, or the token leaks via `Referer` to any third-party asset those pages load. **SR-12(d).**

### 5.3 Partner-org scoping — the direct answer

The task asks whether the security-company-operator's partner-org scoping is enforced server-side. **Honest answer: there is nothing to enforce yet, and the mechanism needed to enforce it later is missing.**

- Feature 001 contains **no operator-facing data endpoint**. `partner_organization_id` is captured at invitation (validated: `invitations_operator_requires_partner_org` CHECK), persisted (`accounts_operator_requires_partner_org` CHECK), and carried as a JWT claim. No endpoint in the contract returns partner-scoped data. So the scoping is *captured* correctly and *enforced* nowhere, because nothing yet requires it.
- `database-design.md` §5.5's own-org RLS policy on `app.partner_organizations` is inert under mediation (no `authenticated` caller exists).
- **The gap that matters (SR-9):** `architecture-review.md` D-2(d) rules that authorization decisions must be re-derived from `app.accounts`, never trusted from a JWT claim. But `app.account_status_cache` — the cheap re-derivation surface built precisely to make that rule affordable — carries only `account_state` and `mfa_required`. It does **not** carry `user_type` or `partner_organization_id`. Those two are exactly the authorization attributes that matter most for the security-company surface, and today the only way to re-derive them is a read against the wide, write-hot `app.accounts` row — the thing `database-design.md` §4 built the cache to avoid. The predictable outcome is that the first operator-facing feature trusts the claim, because re-deriving is expensive. **Add `user_type` and `partner_organization_id` to `app.account_status_cache` and to `/internal/accounts/{id}/status`'s response now**, while it is a two-column change rather than a retrofit against live services.
- **Binding forward constraint, recorded here so the next feature inherits it rather than rediscovers it:** every partner-org-scoped query must derive the scope server-side from the account record (via the status cache), never from a client-presented claim or parameter; and per `06-security-standards.md`, every operator access to a customer's data is an audit event (SR-10). I will re-threat-model the security-company surface when the first operator-facing endpoint is specified — that is a new trust boundary, not an extension of this one.

---

## 6. Authentication and Session Mechanics — Ratified Policy (closes FU-17)

`architecture-review.md` FU-17 and `api-design.md` §2/§5 both defer the concrete numbers to this role. I am setting them. These are **ratified, not provisional.** Where I am accepting a number `backend-architect` proposed, I say so — the proposals were well-reasoned and I am not changing numbers for the sake of it.

| Control | Ratified value | Note |
|---|---|---|
| Access-token TTL | **10 minutes** | `api-design.md` §2.2's number, **ratified unchanged**. Its infra-cost reasoning is sound and the mobile-wakeup argument against going tighter is the correct binding constraint. Not loosenable. |
| Refresh-token TTL (idle) | **Privileged web: 15 min. Customer mobile: 30 days.** | Sliding; each rotation resets it. |
| **Absolute session lifetime cap** | **Privileged web: 8 hours. Customer mobile: 90 days.** | **New — this closes a real hole.** `app.sessions.expires_at` exists but nothing forbids each rotation from setting a fresh `expires_at`, which makes a session indefinitely renewable. The cap must be carried from the *first* session in a rotation chain and must not be extendable by rotation. |
| Dashboard idle timeout (FR-21) | **15 minutes, all three privileged roles.** Client-side warning at 13 min (`ui-design.md` §4.7's banner). | This is the security floor `frontend-architect` builds to at FU-10, not a starting point for negotiation. It falls out of the refresh-TTL row above rather than being a separate mechanism. |
| Password policy (FR-2) | **Customers: min 10 chars. Privileged roles: min 14. Max 128. No composition rules. Breached-password rejection mandatory.** | Composition rules are counterproductive (NIST SP 800-63B); length plus a breach check is what works. Enable **Supabase's leaked-password protection** (SR-5) rather than building our own. **`api-design.md` §7's `minLength: 8` must be raised** on `/auth/signup`, `/invitations/{token}/accept` and `/auth/reset-password/confirm`. |
| Login lockout (FR-11) | **5 failures / 15 min per identifier; 20 / 15 min per source IP; auto-clear.** | `api-design.md` §5's numbers, **ratified**. **Mandatory rider:** the identifier counter must fire **identically for identifiers that resolve to no account**, and `attemptsRemaining` must be returned identically in both cases — otherwise `423 Locked` becomes an account-existence oracle that defeats AC-5. §5's design already keys on the attempted email when unresolved; I am making it an explicit, testable requirement (§8 QA hand-off) because it is the kind of detail an implementation quietly drops. |
| MFA challenge attempts | **5 / 10 min per challenge token, then invalidate the challenge.** | §5's numbers, ratified. Correctly a separate counter from the password counter. |
| MFA enrollment verify | **10 / 1 hour per account.** Abuse limit, not a security lockout. | §5's number, ratified. |
| **Reset-password MFA verify** | **5 attempts / 15 min per `mfaVerificationToken`; token single-use, 5-minute TTL, cryptographically bound to the reset token and the account.** | **NEW — `api-design.md` §5's table has no row for `/auth/reset-password/mfa-verify`,** though §7 declares a `429` for it. Without this, an attacker holding a valid reset token can brute-force a 6-digit TOTP against a privileged account. That is branch D1 of §2.3. **SR-6.** |
| MFA re-prompt cadence (FR-9/FR-23) | **Every login for all three privileged roles** (already the design), **plus step-up re-verification when `mfa_verified_at` is older than 15 minutes for `POST /v1/invitations`.** | Invitation issuance mints privileged accounts — it is a privilege-escalation primitive and the one action in this feature that warrants step-up. Requires a **`mfa_verified_at` column on `app.sessions`** and a claim on the access token. Owner: `database-architect` (column), `backend-architect` (contract). |
| MFA factor types (FR-24) | **TOTP only in Feature 001.** **SMS OTP prohibited for the three privileged roles** on SIM-swap grounds; permitted, if ever, only as a customer-optional factor under a recorded risk acceptance. **Passkeys/WebAuthn approved in principle for a later phase, on the express condition that the biometric template never leaves the user's device and only a public key is stored — the platform then processes no biometric information.** **Server-side biometric enrolment (fingerprint/face template, voiceprint) into Supabase or any platform store is PROHIBITED.** | **This discharges the `cybersecurity-architect` half of `compliance-review-supabase.md` C-9,** in the wording that document required, and keeps its §4.4 "no s57 prior authorisation" ruling intact. |
| Refresh-token generation & storage | **≥32 bytes from a CSPRNG, base64url; stored as SHA-256 of the token.** | **Closes `database-addendum-001.md` §1.4,** which correctly deferred the algorithm to me. Plain SHA-256 is right here: the input is 256 bits of entropy, so there is nothing for a keyed HMAC or a KDF to defend against — precomputation and dictionary attacks are inapplicable, and lookup is by unique index on the digest, which is not a timing oracle over a secret. Do **not** use bcrypt/argon2 (a per-request KDF on the refresh path is cost without benefit). |
| Invitation tokens | **≥32 bytes CSPRNG, SHA-256 at rest (matches the existing pattern), TTL 7 days.** | `app.invitations.expires_at` is `not null` but **no TTL value is stated anywhere.** Setting it. |
| Email-verification link TTL | **24 hours.** | Supabase-configurable; record in the SR-5 baseline. |
| Password-reset link TTL | **1 hour, single use.** | Supabase-configurable; record in the SR-5 baseline. |
| `mfaChallengeToken` TTL | **5 minutes** (matches `api-design.md` §7's `expiresIn: 300`). | Ratified. |
| Device binding (FR-20) | **Refresh must require the presented `device_id` to match the session's stored value; a mismatch is treated as token theft — revoke the whole session family, audit, notify.** | Honest limitation: `device_id` is client-supplied and therefore not an authenticator. This bounds blast radius against a token-only theft; it does not defend against an attacker who takes both. Real binding needs a keystore-held key and proof-of-possession — out of Feature 001's scope, registered as **R-5** and a Phase-2 item for `mobile-architect` (FU-09). |

**Refresh-token rotation — two defects to fix (SR-8).** The rotation design is right in outline and incomplete in two specific ways:

1. **`app.session_revoked_reason` has no value for an ordinary rotation.** The enum is `logout | logout_all | password_reset | admin_forced | rotation_reuse_detected`. A normally-rotated session must therefore either be left un-revoked (breaking the `sessions_revoked_at_requires_reason` CHECK's intent and making reuse detection ambiguous) or be labelled with a reason that did not happen. `database-addendum-001.md` §1.1's own prose is visibly tangled on this point ("the prior row's `revoked_at`/`revoked_reason = 'rotation_reuse_detected'`-eligible chain field"). **Add `rotated`.**
2. **Reuse detection has no specified response beyond a `401`.** `api-design.md` §7 returns `401` on reuse. That is not sufficient: reuse means either the legitimate client or an attacker is holding a stolen token and **we cannot tell which**. The only safe response is to assume theft: **revoke the entire rotation chain and every active session for that account, write an audit event, and notify the account owner.** Additionally, `app.audit_event_type` has no value for this — add `refresh_token_reuse_detected`. Without both halves, the rotation chain is instrumentation that observes an attack and does not stop it.

**Revocation-set failure mode — must not fail open (SR-16).** `database-addendum-001.md` §3 accepts that a Redis failover losing the revocation set produces "a false negative on Mechanism 1 — a revoked token is briefly treated as valid." For a platform whose sessions will see asset location, **I am not accepting a silent fail-open on the revocation check.** Required: **(a)** on Redis cold start, rebuild the set from `app.sessions` (`select id from app.sessions where revoked_at > now() - interval '10 minutes'`) before serving traffic — one indexed query, and it closes the hole completely; **(b)** TLS per SR-2(d); **(c)** an explicit, documented decision on Redis persistence at FU-08 rather than an inherited default; **(d)** a defined degraded-mode behaviour when the store is unreachable — my ruling is that privileged-role sessions fail closed and customer sessions may fail open with an alert, because the availability cost of failing closed for customers is real and the privileged blast radius is not.

**MFA enforcement is not currently verifiable (SR-14).** BR-4 says MFA cannot be disabled for the three privileged roles, with no bypass short of a `cto`-signed risk acceptance. The enforcement points are good as far as they go: the `accounts_privileged_roles_require_mfa` CHECK is a genuinely strong structural control, and `backend-approach.md` §3 correctly places the login-flow gate server-side. Two holes:

- **`mfa_required` is a policy flag, not evidence of an enrolled factor.** Nothing in the contract says where "does this account have ≥1 *verified* factor" is read from, and `app.account_status_cache` does not carry it. **Required: for any account with `mfa_required = true`, a session may be minted only after the backend has confirmed a verified factor exists (queried from Supabase at login) — and if none exists, the flow must force enrollment rather than issue a session.**
- **`service_role` can remove a factor, and nothing would notice.** `backend-approach.md` §3 describes the BR-4 override as "a manual database intervention with its own audit trail" — but no such audit trail exists, because the intervention happens inside Supabase's `auth` schema, outside our audit log. **Required: a scheduled reconciliation asserting that every `mfa_required` account has ≥1 verified factor, alerting on any violation.** Cheap, and it is the only thing that makes BR-4's "no bypass" a verifiable claim rather than an aspiration. Owner: `authentication-engineer` + `site-reliability-engineer`.

**A structural win worth recording, because it is a direct consequence of FU-18 and would otherwise go unnoticed:** because no client ever holds a Supabase-honoured JWT, a user **cannot** call GoTrue's own factor-unenroll endpoint to strip their own MFA. Under the JWT-pass-through alternative they could have. FU-18's ruling closed an ATO/BR-4-bypass path that nobody had identified as being at stake in that decision. This is what "structurally impossible rather than remembered" looks like, and it is the strongest single argument for ADR-0005 being ratified as proposed.

---

## 7. Injection and Authorization-Boundary (IDOR/BOLA) Sweep

**Injection: adequate, with two code-level items.**

- **SQL/SQLi:** all Postgres access is via `supabase-js` or a parameterized client. The DDL functions are correctly hardened and I reviewed each: `app.sync_account_email_from_auth_users` (`security definer`, `set search_path = ''`, fully-qualified references, driven solely by `NEW.id`, writes two columns — the justification comment is accurate and the scope genuinely cannot be repurposed); `app.sync_account_status_cache` (`security invoker` — correctly *not* elevated, and the reasoning given is right, not an oversight); `app.purge_expired_audit_log` and `app.purge_expired_idempotency_keys` (`security definer`, no client-supplied input, cutoff computed internally). **`security-engineer`'s FU-05 line-level review is still required at Stage 9 against the SQL as actually applied**, but I have no architectural objection to any of it.
- **NoSQLi:** MongoDB is untouched by Feature 001. The standing `06-security-standards.md` requirement carries forward unchanged to the first service that queries it.
- **Input validation (SR-21):** `express.json()` is called with no explicit `limit` (default 100 kB — acceptable, but should be stated deliberately), and the OpenAPI schemas are not yet enforced at the edge. Request validation must be schema-driven from the contract, not hand-rolled per handler.
- **Log injection (SR-18):** `requestIdMiddleware` accepts a client-supplied `x-request-id` **verbatim**, echoes it in the response header, and writes it into log lines. Node rejects CRLF in header values so response-header injection is blocked, but log-record forging is not, and this value ends up correlated against records that may matter in a POPIA breach determination. **Required: accept the header only if it is UUID-shaped; otherwise generate.**
- **Error-message leakage (SR-19):** `errorHandler` returns `err.message` verbatim for every non-500 status. A `409` or `400` originating from Postgres or the Supabase Admin API would return the driver's or vendor's message to the caller — which also directly threatens the anti-enumeration guarantee (FR-5/AC-2), since Supabase's own duplicate-signup error text is precisely the thing `api-design.md` §6 promises to normalise away. **Required: 4xx messages come from a fixed catalogue keyed by `code`; no upstream string is ever passed through.**

**Authorization boundaries, endpoint by endpoint:**

| Endpoint | Client-supplied identifier | Assessment |
|---|---|---|
| `POST /v1/mfa/enroll` | **`accountId` in the body** | **BROKEN — SR-1.** Unauthenticated path authorizes on an identifier the caller names. `/mfa/enroll/verify` then mints a session. Privileged ATO. **Fix: `/invitations/{token}/accept` must return a short-lived (10 min), single-use, server-issued `enrollmentTicket` bound to the account it just created; `/mfa/enroll` and `/mfa/enroll/verify` must accept that ticket and nothing else on the pre-session path; `accountId` must be removed from the request body entirely.** The authenticated (customer opt-in) path must derive the account from the bearer token, never from the body. |
| `GET /v1/admin/audit-log?accountId=` | `accountId` | Cross-account by design, admin-only (C8), correctly enforced server-side with a `403`. **But `06-security-standards.md` mandates audit logging for "access to another user's data by an admin/support/security-company operator," and `app.audit_event_type` contains no such event type.** The standard is not satisfiable with the current schema. **SR-10.** |
| `GET /v1/internal/accounts/{id}/status` | `{id}` | IDOR-shaped by design; acceptable for service-to-service; the key is the whole control. **SR-13.** Response correctly minimised. |
| `POST /v1/invitations` | `partnerOrganizationId` | Admin-only; cross-org assignment is a legitimate admin capability. **Minor: nothing validates that the target partner org is `status = 'active'`** — an operator can be invited into an inactive org. Fold into SR-13's owner's backlog; not blocking. |
| `GET /v1/invitations/{token}`, `POST .../accept` | opaque token | Correct: backend hashes and looks up under service-role; never a client table query. `database-design.md` §5.4's reasoning for refusing a client-facing lookup — that RLS restricts rows but does not rate-limit or obscure the query surface — is exactly right and I want it on the record as the pattern to reuse. `404` for not-found/expired/revoked alike: correct, no enumeration of *why*. |
| `GET /v1/account/me` | none | Derived from the bearer token; live status-cache read. Correct. |
| `/session/logout`, `/logout-all`, `/refresh` | token only | No account identifier accepted. Correct. |

**No horizontal-privilege-escalation path exists between customer accounts in this feature.** Every customer-facing endpoint derives its subject from the session. Verified endpoint by endpoint.

**A second-order cascade finding for FU-03 / the deletion-vs-anonymisation ADR (not mine to rule, but mine to surface).** `compliance-review-supabase.md` §6.2.3 flagged that `auth.users → app.accounts on delete cascade` is a vendor-triggerable hard-delete path that destroys the accountability record. **The chain is longer than that document traced.** `app.accounts` is itself the cascade parent for `app.account_state_transitions.account_id` (`on delete cascade`), `app.account_status_cache.id` (`on delete cascade`) and `app.sessions.account_id` (`on delete cascade`). So a single user deletion performed in the Supabase dashboard destroys the **entire state-transition history** and the **entire session history** for that account, with no platform code invoked and no audit event written. Only `app.account_audit_log.account_id` (`on delete set null`) survives. This materially strengthens the case against `cascade` that both `compliance-review-supabase.md` and `architecture-review.md` D-1 were already circling. **Recorded as a required technical input to FU-03; `compliance-specialist` remains A on the ruling.**

---

## 8. Required Changes

**[S9]** blocks Stage 9 (Development) start for the whole feature. **[S9-scoped]** blocks Stage 9 for the named flow only. **[S9-exit]** must land during Stage 9 and be verified by `security-engineer` before the PR merges. **[GL]** blocks go-live.

| ID | Required change | Owner (A) | Blocks |
|---|---|---|---|
| **SR-1** | **Remove client-supplied `accountId` from the `/mfa/enroll` pre-session path.** `/invitations/{token}/accept` returns a single-use, account-bound, 10-minute `enrollmentTicket`; `/mfa/enroll` + `/mfa/enroll/verify` accept only that ticket pre-session, and derive the account from the bearer token post-session. Amend `api-design.md` §7 and declare each operation's `security` unambiguously. | `backend-architect` (contract); `authentication-engineer` (impl) | **[S9-scoped]** — invitation-acceptance + MFA-enrollment flow (backlog #4/#5/#6) |
| **SR-2** | **TLS made explicit end to end:** (a) API contract states HTTPS-only, absolute `https://` `servers` at publication, HSTS asserted as a requirement not a helmet side-effect; (b) **Supabase Postgres `sslmode=verify-full` with a pinned, version-controlled CA**; (c) Atlas TLS asserted, `tlsAllowInvalidCertificates`/`tlsInsecure` prohibited standing; (d) **Redis over `rediss://`, plaintext prohibited in every environment**; (e) SMTP submission TLS-mandatory with certificate verification (feeds C-5). | `security-engineer` (a,c,d); `backend-architect` + `cloud-infrastructure-architect` (b,e) | **[S9]** |
| **SR-3** | **`app` schema must NOT be added to Supabase's Exposed Schemas.** `database-design.md` §1's comment instructing the opposite is superseded. `app.*` access via a direct Postgres connection using a **dedicated least-privilege role** (not the project superuser, no DDL, no `auth` access beyond need), distinct from the migration credential; `supabase-js`/service-role reserved for GoTrue Admin API calls. Any deviation reverts RLS to front-line and requires a new ADR. | `backend-architect` + `cloud-infrastructure-architect` + `database-architect` | **[S9]** |
| **SR-4** | **The `anon` key is a secret in this architecture and must not be provisioned or published.** Amend `secrets-management-plan.md` §2 to remove "safe to ship in a client bundle" for this platform, and record *why* (it bypasses FR-11 lockout and FR-12 audit logging via GoTrue). | `security-engineer` | **[S9]** |
| **SR-5** | **Supabase project-configuration security baseline, recorded in-repo as a reviewable, verifiable checklist** (this config is dashboard-managed and outside code review — this is the anti-drift control): exposed schemas = `public` only; **auth redirect-URL allowlist explicitly set** (open-redirect / reset-token exfiltration); leaked-password protection ON; Supabase's own auth rate limits set to the tightest values compatible with our volume, as a second layer behind SR-4; custom SMTP (C-5); MFA settings; email link TTLs per §6; Network Restrictions if the tier permits (OI-5); log drains prohibited (C-10). | `cloud-infrastructure-architect` + `security-engineer`, countersigned `cybersecurity-architect` | **[S9]** |
| **SR-6** | **Rate-limit and bind `/auth/reset-password/mfa-verify`:** 5 attempts / 15 min per `mfaVerificationToken`; token single-use, 5-min TTL, bound to the reset token and account. **Also state explicitly that the password is NOT changed until MFA verification succeeds** for privileged accounts, so a reset token alone cannot lock out a legitimate privileged user. | `backend-architect` | **[S9]** |
| **SR-7** | **Define `X-Forwarded-For` / `trust proxy` handling before any IP-keyed rate limit or `ip_address` audit column is implemented.** Behind Render's proxy, an unconfigured Express records the proxy IP — which silently breaks the per-IP limits (§6), the credential-stuffing detection `app.account_audit_log`'s partial index exists to serve (FR-11/FR-12), and the accuracy of a POPIA-relevant record. | `backend-architect` + `devops-engineer` | **[S9]** |
| **SR-8** | **Complete refresh-token rotation semantics:** add `rotated` to `app.session_revoked_reason`; on reuse detection **revoke the entire rotation chain and all active sessions for the account**, write an audit event, notify the owner; add `refresh_token_reuse_detected` to `app.audit_event_type`. | `backend-architect` + `database-architect` | **[S9]** |
| **SR-9** | **Add `user_type` and `partner_organization_id` to `app.account_status_cache`** and to `/internal/accounts/{id}/status`'s response, so D-2(d)'s "re-derive, never trust the claim" rule is affordable for the authorization attributes that matter most (§5.3). | `database-architect` + `backend-architect` | **[S9]** |
| **SR-10** | **Add an audit event type for privileged cross-account data access** (e.g. `privileged_data_access`, recording actor, subject and endpoint). `06-security-standards.md` mandates this logging; `app.audit_event_type` currently cannot express it. Emit it from `GET /v1/admin/audit-log` and from every future admin/support/operator read of another account's data. | `database-architect` + `backend-architect` | **[S9]** |
| **SR-11** | **Implement the §6 policy table** in the contract: absolute session-lifetime cap that rotation cannot extend; refresh TTLs per surface; raise `minLength: 8` to the §6 password minimums; add `mfa_verified_at` to `app.sessions` and the step-up requirement on `POST /v1/invitations`; set invitation/verification/reset TTLs. | `backend-architect` (contract) + `database-architect` (columns) | **[S9]** |
| **SR-12** | **Browser-surface session posture:** (a) CORS allowlist populated per environment, **public marketing origin excluded**, dashboards on distinct origins; (b) resolve `credentials: true` consistently with (c); (c) **either adopt a common registrable domain for frontend + API (enabling an HttpOnly/Secure/SameSite refresh cookie — preferred) or record a `cto`-signed risk acceptance for JS-reachable refresh tokens**; (d) CSP + `Referrer-Policy: no-referrer` on Vercel-served surfaces, and strip tokens from the URL/history on verify/reset/invite-accept pages. | `frontend-architect` + `cloud-infrastructure-architect`; ruling `cybersecurity-architect` | (a),(d) **[S9]**; (b),(c) before either dashboard ships |
| **SR-13** | **Harden the `/internal/*` boundary (TB-6):** per-consumer keys with a caller identity, added to the credential inventory and the 90-day rotation cadence, rate-limited, and **every call audit-logged**; plus a stated position on network isolation vs. accepting a public route protected by a static secret. | `backend-architect` + `cloud-infrastructure-architect` | **[S9]** |
| **SR-14** | **Make BR-4 verifiable:** (a) a session may be minted for an `mfa_required` account only after the backend confirms ≥1 **verified** factor exists, forcing enrollment otherwise; (b) a scheduled reconciliation asserting every `mfa_required` account has ≥1 verified factor, alerting on violation — so an out-of-band factor removal via `service_role` cannot be silent. | `authentication-engineer` + `site-reliability-engineer` | **[S9]** |
| **SR-15** | **Run FU-07's live verification spike** (duplicate signup, reset-for-unknown-email: status, body **and timing**) before Stage 9 implements the normalisation layer. Anti-enumeration (FR-5/AC-2) is a binding acceptance criterion and ADR-0002 explicitly required this be verified, not assumed. | `backend-architect` + `authentication-engineer` | **[S9]** |
| **SR-16** | **Revocation set must not fail open:** rebuild from `app.sessions` on Redis cold start before serving traffic; TLS (SR-2(d)); explicit persistence decision at FU-08; degraded-mode ruling — **privileged sessions fail closed, customer sessions may fail open with an alert.** | `backend-architect` + `cloud-infrastructure-architect` + `site-reliability-engineer` | **[S9]** |
| **SR-17** | **Credential-leak prevention enforced in CI, not documented in prose:** a build-time assertion that no client bundle contains a Supabase/Mongo/Redis credential or a `service_role`-shaped JWT (same mechanism as C-7's placeholder check); secret scanning on every PR; and `env.ts` made fail-fast for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL`. | `security-engineer` + `devops-engineer` | **[S9-exit]** — must land in the same PR series that introduces the key |
| **SR-18** | **Logging and redaction standard for auth paths:** never log tokens, the `Authorization` header, request bodies, passwords, or plaintext email; log `account_id`. **Validate `x-request-id` to a UUID shape or generate one** (log forging). | `security-engineer` + `backend-engineer` | **[S9-exit]** |
| **SR-19** | **`errorHandler` must not return raw upstream/driver messages on 4xx** — fixed message catalogue keyed by `code`. Directly protects FR-5/AC-2. | `backend-architect` + `backend-engineer` | **[S9-exit]** |
| **SR-20** | **Reduce `/api/health/ready`'s public response** to a status code plus `status`; dependency detail behind auth or an internal path. | `backend-engineer` | **[S9-exit]** |
| **SR-21** | **Explicit `express.json({ limit })` and contract-driven request validation** at the edge for every endpoint. | `backend-architect` + `backend-engineer` | **[S9-exit]** |
| **SR-22** | **No Free-tier production identity store.** I concur with `compliance-review-supabase.md` §7's paid-tier-with-PITR floor and add an independent security reason: without PITR there is **no recovery path from a destructive compromise**, and with the shortest log retention there is **no forensic window** for an incident whose vendor notice may itself arrive up to 48 hours late (that document's §4.2). Joint go-live blocker. | **`cto`** (cost); `cloud-infrastructure-architect` (verify) | **[GL]** |
| **SR-23** | **FU-02(c) independent detection and alerting** for Supabase degradation/compromise. Already carries a compliance driver (C-6, because we may not rely on the vendor telling us). It also carries a security driver: it is the only detection control for branch B of §2.3. **May not be descoped as optional observability.** | `site-reliability-engineer` + `backend-architect` | **[GL]** |
| **SR-24** | **Support-assisted privileged reset process (FU-16), designed here, runbook required before the first production privileged account.** Architecture I am setting: out-of-band identity proofing against a pre-registered channel that is **not** the account email; **dual control** (two admins, or one admin plus `cto`); mandatory notification to the account's registered email at initiation, not only completion; a mandatory delay window in which the legitimate holder can cancel; full audit trail using SR-10's event type; and completion forces `admin_forced` revocation of all sessions plus re-enrollment. **This is also the only operational path by which BR-4's `cto`-signed override could ever be exercised, so its absence makes that override fictional.** Recommended scope reduction: allow privileged users to enroll a **second** TOTP factor, which makes most compound lockouts self-service and reduces reliance on the human process — the cheapest fix available to branch E4. | `cybersecurity-architect` (design, above) + `compliance-specialist` (runbook, with C-6) | **[GL]**, and before the first production privileged account |
| **SR-25** | **External penetration test of the authentication surface before go-live**, per `06-security-standards.md`'s "before any major architecture change that expands the attack surface." Exercising my authority to mandate it: this feature introduces a third-party identity store, a new hosted Postgres, a new cross-origin browser surface and the platform's first credential handling. Minimum scope: TB-1, TB-6, TB-8, TB-9 and every branch of §2.3. | `security-engineer` (coordinate); `cto` (commission) | **[GL]** |

---

## 9. Open Items — Not Resolvable From Inside This Repository

Named rather than assumed, per §1's method note. **None of these is closed by this document, and no downstream artifact may treat any of them as answered.**

| ID | Open item | Who can answer | Consequence if unanswered |
|---|---|---|---|
| **OI-4** | **Whether `auth.audit_log_entries` has vendor-side retention and whether deleting from it is supported** — inherited unchanged from `compliance-review-supabase.md`. **This is C-4(c), and it is partly mine** (that document routed the design and upgrade-safety review to `database-architect` + `security-engineer`). **STILL OPEN. I am explicitly not closing it.** My technical position: option (i) mirror-and-minimise is architecturally the safest of that document's three options, because it does not depend on a vendor-managed schema tolerating our writes across platform upgrades. But the decision requires OI-4's answer first, and I will not pre-empt it. | Supabase support/docs, verified against a live project | Unbounded PI retention in a vendor schema, contradicting a published 12-month policy. **[GL]** via C-4. |
| **OI-5** | **Project tier, PITR availability, and whether Network Restrictions are available.** | Platform owner / `cto` | Blocks SR-22 and part of SR-5. |
| **OI-7** | **NEW — whether MFA is enforced on the platform-owner accounts for Render, Supabase, MongoDB Atlas, Vercel and GitHub.** These accounts hold every secret in `secrets-management-plan.md` §3 and are branch B3 of §2.3. **This is the single highest-leverage unverified control in the entire platform** — every technical control in this review is downstream of it. | Platform owner / `cto` | An unverified control with total blast radius. **Answer before Stage 9.** |
| **OI-8** | **NEW — the exposed-schemas setting, auth redirect-URL allowlist, leaked-password-protection state, and auth rate limits currently configured on the live project.** No dashboard was inspected. | Platform owner / `cloud-infrastructure-architect` | SR-5 cannot be verified, only specified. |
| **OI-9** | **NEW — Redis-class store technology, hosting, TLS support and persistence options** (FU-08, still open). | `cloud-infrastructure-architect` | SR-2(d) and SR-16 cannot be closed. |
| **OI-10** | **NEW — whether the platform will hold a common registrable domain for frontend and API** (SR-12(c)). A DNS/domain decision with lead time, not a code change. | `cto` / `cloud-infrastructure-architect` | Determines whether HttpOnly-cookie session storage is available to the dashboards at all. |
| **OI-11** | **NEW — Supabase's actual response shape *and timing* for duplicate signup and reset-for-unknown-email** (FU-07). Requires a live call. | `backend-architect` + `authentication-engineer` (SR-15) | FR-5/AC-2 is asserted by contract but unverified in mechanism. |
| **OI-2, OI-3, OI-6** | Sub-processor list unread; logging/backup residency unknown; FAIS retention floor pending a licence answer. | `compliance-specialist` / platform owner | Inherited unchanged. Compliance-owned; no technical dependency on this review. |

---

## 10. Residual Risks Accepted

Per this role's standing rule, **silent risk acceptance is not permitted.** Each of these is accepted *because* a required change above bounds it, not because it is harmless.

| ID | Residual risk | Why accepted | Bounded by | Owner / review |
|---|---|---|---|---|
| **R-1** | **`service_role` compromise = total identity-store compromise.** RLS does not and cannot mitigate this. | Inherent to using a hosted auth product; ADR-0002 accepted the vendor, and no key-less alternative exists. | SR-3 (least-privilege Postgres role, no PostgREST exposure), SR-17 (leak prevention), 90-day rotation + compromise runbook (secrets plan §5/§7), SR-23 (detection) | `cybersecurity-architect`; review each release cycle |
| **R-2** | **Platform-owner account compromise (Render/Supabase/Atlas/Vercel/GitHub) yields every secret.** | Single-operator team; no separation of duties is achievable at this size. | OI-7 (verify MFA), secrets plan §4's least-privilege-when-team-grows action | `cto`; re-review when a second engineer gains production access |
| **R-3** | **Vendor-side breach may reach us up to 48 hours late** (`compliance-review-supabase.md` §4.2). | Market-standard DPA; not renegotiable at this scale. | SR-23 (independent detection), C-6 (runbook) | `compliance-specialist` + `site-reliability-engineer` |
| **R-4** | **Bounded 10-minute authorization staleness** for passive `suspended`/`deactivated` drift. | The alternative is a database read on every request, which breaks the p95 ≤ 5 ms hot-path target that makes Identity Service tolerable as a universal dependency. Explicit revocation is exact (Mechanism 1), so this covers only drift with no accompanying teardown event. | 10-min TTL ratified; `/session/refresh`, `/account/me`, `/internal/.../status` chokepoints; SR-9 extends coverage to `user_type`/org scope | `cybersecurity-architect`; tightenable, never loosenable |
| **R-5** | **FR-20 device binding relies on a client-supplied `device_id`, which is not an authenticator.** | Keystore-backed proof-of-possession is real work and out of Feature 001's scope. | Binding check + theft response (§6), SR-8's chain revocation | `mobile-architect` (FU-09); Phase 2 |
| **R-6** | **`attemptsRemaining` in the 401 body is a minor information oracle.** | Required by `ux-research.md` §1.2's escalating-warning UX; the alternative is worse security outcomes from users who don't know they are near lockout. | Only returned at ≤1 remaining; **must be returned identically for identifiers that resolve to no account** (§6 rider, QA-tested) | `cybersecurity-architect` |
| **R-7** | **A second, unpurgeable copy of authentication PI exists in `auth.audit_log_entries`.** | Vendor-managed schema; not removable by configuration. | OI-4 → C-4(c); **not yet accepted as final** — this is a *provisional* acceptance pending OI-4, and if OI-4 resolves against us it becomes a `cto` risk-acceptance decision, not a silent carry | `compliance-specialist` + `database-architect` |
| **R-8** | **Architecture drift: everything in this review is a design, and no auth code exists yet.** | Unavoidable at stage 8 by definition. | SR-17 (CI), FU-05 line-level review at Stage 9, `security-engineer`'s design-conformance check before merge, SR-25 (pentest) | `security-engineer`; continuous |
| **R-9** | **Supabase project configuration is dashboard-managed, outside code review and outside CI.** | No IaC exists for Supabase at this stage, and introducing one is a `cloud-infrastructure-architect` decision beyond this feature. | SR-5 (written baseline as a compensating control), re-verified at Stage 13 | `cloud-infrastructure-architect`; re-verify each release |

---

## 11. Disposition of Every Inherited Follow-Up

`architecture-review.md`'s STATUS LINE binds Stage 8 exit to closing every remaining item in its §6. Item by item, with the two governance items it could not have anticipated.

| ID | Stage 8 disposition |
|---|---|
| FU-01 | **Closed** by `api-design.md` §§1–2; the 10-minute number **ratified** here (§6). |
| FU-02 | (a) closed at Stage 7. (b) closed — `api-design.md` §6's read-path availability guarantee is correct and is a genuine consequence of FU-18. **(c) OPEN → SR-23 [GL].** |
| FU-03 | **OPEN**, `compliance-specialist` A. This review adds the full cascade-chain finding (§7) as a required technical input. Not mine to close. |
| FU-04 | **OPEN**, blocked on OI-6. No technical dependency on this review. |
| **FU-05** | **CLOSED by this review at the architectural level.** The drafted RLS in `database-design.md` §5 and `database-addendum-001.md` §5 is approved **as defense-in-depth**, with the §0/§2.4 caveat about what it does not defend and **SR-3** as the load-bearing control instead. `security-engineer`'s line-level review of the SQL *as applied* remains a Stage 9 obligation (R-8). |
| **FU-06** | **CLOSED. Confirmed: own-row-only client-facing RLS is Feature 001's final posture, not a placeholder.** Ruling C3 was correct. Under SR-3 the `authenticated` grants become inert, which is the desired end state — not a reason to remove them. |
| FU-07 | **OPEN → SR-15 [S9].** Escalated from "pre-Stage-9 spike" to a gate condition. |
| FU-08 | **OPEN**, `cloud-infrastructure-architect`. Security requirements now attached: SR-2(d), SR-16, OI-9. **Governance note: the pre-registered "ADR-0003 trigger" number is taken** — ADR-0003 is the backend-hosting decision. The third-persistence-surface ADR needs a fresh number. |
| FU-09 | **OPEN**, `mobile-architect`. Security requirements attached so it cannot be closed vacuously: device-binding check on refresh, theft response, R-5. |
| FU-10 | **OPEN**, `frontend-architect`. **SR-12 is the security floor it must build to**, including the 15-minute idle timeout and the refresh-token-storage ruling. |
| FU-11 | **OPEN**, cost. **I concur with the paid-tier-with-PITR floor on independent security grounds → SR-22 [GL].** |
| FU-12 | Closed at Stage 6. No security implication. |
| FU-13 | **OPEN**, `backend-architect`. Not security-blocking for Stage 9 start. |
| FU-14 | Non-blocking, future RBAC feature. C4's default-deny is the correct posture and I confirm it. |
| **FU-15** | **(a) technical half — DISCHARGED BY THIS DOCUMENT.** (a) compliance half discharged 2026-08-08. **(b) secrets-management plan — ACCEPTED with the single SR-4 correction.** (c) `cto` ratification obtained 2026-08-07. **FU-15 is now closed in substance; C-2's execution remains the outstanding compliance action.** |
| **FU-16** | **Designed in SR-24; runbook required [GL].** Design-level obligation discharged here. |
| **FU-17** | **CLOSED — §6's table is the ratified policy set.** Every number `api-design.md` §5 marked provisional is either ratified unchanged or replaced, and the two it omitted (reset-MFA-verify limits, MFA re-prompt cadence) are set. |
| FU-18 | **Design concurred without reservation** (§0, §6's structural-win note). **ADR-0005 must still be drafted and ratified** by `solution-architect` + `cto` — a governance debt, not a technical one, and it is overdue against its own "before Stage 7 exit" deadline. **Numbering collision: `architecture-review.md` §7's ADR-0003/0004/0005 labels are stale now that 0003 is the hosting ADR. `solution-architect` should reassign before drafting.** |
| FU-19, FU-20 | Non-security. FU-20's finding (the mockup's duplicate-signup copy contradicts FR-5/AC-2) is correct and the contract is authoritative over the mockup; SR-19 protects the same guarantee at the error-handler layer. |
| **NEW (addendum §1.3)** | **`app.sessions` retention — OPEN**, `compliance-specialist`, same docket as FU-04. Technical note: a revoked session row carries `ip_address`/`user_agent`, so it is retained behavioural PII once dead. |
| **NEW (addendum §1.4)** | **CLOSED — SHA-256 over a ≥32-byte CSPRNG token** (§6, with reasoning). |
| **C-9 (compliance)** | **`cybersecurity-architect` half CLOSED** — FR-24 wording set in §6, in the form C-9 required. |

**Hand-off to `qa-architect` / `automation-qa-engineer` (my §"Collaborates With" obligation — these are the security test cases this threat model generates, and they belong in the Stage 10 plan):** privileged ATO via `/mfa/enroll` with a foreign `accountId` **must fail** (SR-1); `423 Locked` and `attemptsRemaining` are **byte-identical** for existing and non-existent identifiers (R-6, §6 rider); a rotated-out refresh token replay revokes the whole family (SR-8); a revoked `jti` is rejected on the very next request (AC-8); password reset revokes all sessions (AC-9); a `suspended` account is refused a new access token at `/session/refresh` within 10 minutes (R-4); TOTP brute force at `/auth/reset-password/mfa-verify` is throttled (SR-6); an `mfa_required` account with zero verified factors cannot obtain a session (SR-14); a non-admin receives `403` from `POST /v1/invitations` and `GET /v1/admin/audit-log` (C4/C8); no client bundle contains a credential (SR-17).

---

## 12. Pre-Approval Checklist (`cybersecurity-architect` self-review)

- [x] **Threat model updated to cover this feature's new data flows and trust boundaries.** §2 — nine trust boundaries, STRIDE per surface, two attack trees. TB-8 (Supabase's own internet-facing endpoints) and TB-9 (browser XSS → session) are boundaries no prior document had named. This is the platform's first threat model artifact and it should seed the platform-wide one.
- [x] **All new/changed trust boundaries follow zero-trust (explicit authN + authZ, no implicit trust).** With one honest exception: **TB-6 authenticates with a static shared secret and does not authorize per caller.** That is not zero-trust, it is named as such, and SR-13 fixes it rather than tolerating it.
- [x] **Sensitive data classification confirmed with `compliance-specialist`.** `compliance-review-supabase.md` §2.1's per-table classification is accepted in full as the input to this review. No location or payment data is in Feature 001's surface; the field-level-encryption evaluation `06-security-standards.md` requires therefore has no trigger in this feature and re-triggers on the first location/payment field, as `database-design.md` §8 also concluded.
- [x] **Encryption at rest and in transit specified for any new data store or channel.** In transit: §3, all eight channels, with one genuine defect found (SR-2(b)). At rest: Supabase Postgres and Atlas both encrypt at rest by platform default; Render/Vercel encrypt stored env vars (secrets plan §3). **Redis at rest is unaddressed and I am accepting that deliberately** — the revocation set holds `jti` values with a ≤10-minute lifetime and rate-limit counters, neither of which warrants a customer-managed-key discussion at this stage.
- [x] **Third-party access scoped to least privilege with audit logging.** SR-3 (Postgres role), SR-13 (internal boundary), SR-10 (the audit event type that makes `06-security-standards.md`'s cross-account-access logging requirement implementable at all). **The security-company dashboard has no data access in this feature**, so its least-privilege design is a forward constraint (§5.3), not a control I can sign today — and I have said so rather than implying coverage.
- [x] **Account-takeover and session-hijack scenarios explicitly considered.** §2.3's attack tree is entirely this. It found SR-1 and SR-6, which are the two findings that justify this gate's existence.
- [x] **Residual risks documented and explicitly accepted by an accountable owner.** §10, nine risks, each with an owner and a review trigger. **R-7 is a *provisional* acceptance pending OI-4 and is flagged as such** — I am not converting an unanswered question into an accepted risk.
- [x] **`security-engineer` and `compliance-specialist` have concurred (joint gate).** Both filed 2026-08-08. `secrets-management-plan.md` accepted with the SR-4 correction; `compliance-review-supabase.md` accepted in full with its C-2 and C-4(c) conditions carried forward intact and unclosed. **All three signatures now exist. C-2's execution is the one outstanding action on the overall Stage 8 exit artifact, and it is not mine to perform or to sign around.**

---

## 13. Gate Decision

> **Stage 8 (Security Review): SIGN-OFF GRANTED WITH REQUIRED CHANGES.**
> Signed `cybersecurity-architect`, 2026-08-08.
>
> **Stage 9 (Development) may begin** — for all of Feature 001 **except** the invitation-acceptance and MFA-enrollment flow (backlog #4/#5/#6) — **once SR-2 … SR-16 are closed and `compliance-review-supabase.md`'s C-2 and C-3 are satisfied.** Those compliance conditions are not mine; they are named because the lifecycle's exit artifact is joint.
>
> **SR-1 is a scoped hold.** No implementation of `/invitations/{token}/accept`, `/mfa/enroll` or `/mfa/enroll/verify` may begin until the contract amendment lands. I am using a scoped hold rather than blocking the feature because the defect is confined to three endpoints and the rest of the surface is genuinely ready — but the hold is binding, not advisory, and closing it requires my counter-sign on the amended contract, not a self-certification by the amending role.
>
> **SR-17 … SR-21 must land within Stage 9** and be verified by `security-engineer` before the PR merges. **SR-22 … SR-25 block go-live**, alongside the eight go-live conditions `compliance-review-supabase.md` already carries.
>
> **No Security-Review bypass has been requested or granted.** Nothing in this document was softened for schedule. Every finding is a correction to a paper artifact or a configuration setting, made at the cheapest possible moment — which is the entire reason this gate sits at stage 8 and not stage 10.
>
> **Escalated to `cto`:** OI-7 (MFA on the platform accounts that hold every secret — the highest-leverage unverified control on the platform), SR-22 (paid tier with PITR), SR-12(c)/OI-10 (common registrable domain, a decision with DNS lead time), SR-25 (commission the pentest), and ADR-0005's overdue ratification plus the ADR-numbering collision in `architecture-review.md` §7.
>
> **Re-threat-model triggers for this feature:** the first operator-facing (partner-org-scoped) endpoint; the first endpoint that returns asset location to any surface; any client-side Supabase SDK proposal (which would reverse FU-18 and make RLS front-line again); a log drain, read replica, Edge Function or Storage bucket; a new MFA factor type; and the introduction of a staging environment or a second engineer with production access.
