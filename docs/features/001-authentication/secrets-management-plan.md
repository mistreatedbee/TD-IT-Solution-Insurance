# Feature 001 — Customer Account Creation & Authentication
## Secrets Management Plan — ADR-0002 Required Follow-up #2

**Lifecycle stage:** 8 (Security Review) — this document is a required input to that gate, and to Stage 9 (Development) start.
**Author:** `security-engineer`
**Status:** Proposed — awaiting `cybersecurity-architect` Stage 8 sign-off (joint gate with `compliance-specialist`).
**Date:** 2026-08-08
**Discharges:** [ADR-0002](../../organization/adr/0002-polyglot-persistence-identity-vs-domain-data.md), "Required Follow-ups Before Implementation" item 2 — *"`security-engineer`'s secrets-management plan for both the MongoDB and Supabase credential sets... Not designed in this [ADR]."* Blocks Feature 001 Stage 8 exit and Stage 9 start per that ADR's ratification condition.
**Reads on:** [`06-security-standards.md`](../../organization/06-security-standards.md), [`05-development-standards.md`](../../organization/05-development-standards.md), [ADR-0003](../../organization/adr/0003-backend-hosting-platform.md) (Render as backend host — honored below, not re-litigated), [`architecture/backend-approach.md`](architecture/backend-approach.md), [`database-design.md`](database-design.md), root `CLAUDE.md`.
**Input artifacts checked against current repo state:** `backend/.env.example`, `backend/src/config/env.ts`, `backend/src/db/mongodb.ts`, `backend/src/db/supabase.ts`, `.gitignore`, `.github/workflows/ci.yml`.

---

## 1. Scope

ADR-0002 put two credential sets in the backend's hands:

1. **MongoDB** — a connection URI (Atlas), already live today (`MONGODB_URI`), used for policies/assets/GPS history/claims (ADR-0001) and unaffected by ADR-0002.
2. **Supabase** — currently represented in the repo only as `SUPABASE_DB_URL` (a direct Postgres connection string), unset and stubbed (`backend/src/db/supabase.ts` throws if invoked). Feature 001's actual implementation will need more than the raw Postgres string — see §2.

This plan covers both sets end-to-end: where they live at rest per environment, who/what can read them, rotation cadence, local-dev onboarding, and the compromise runbook. It does not re-open ADR-0002 (whether to split persistence) or ADR-0003 (where the backend runs) — both are treated as settled inputs.

---

## 2. Credential inventory

The current `.env.example` under-specifies what Supabase actually requires once Identity Service is implemented (Stage 9). Per `architecture/backend-approach.md` §1 (server-side Supabase client only, service-role credential, no client SDK anywhere) and `database-design.md` §5 (RLS written for `authenticated`, but all Feature 001 access paths are backend-mediated via `service_role`), the real credential set is:

| Variable | System | Purpose | Sensitivity | Needed now? |
|---|---|---|---|---|
| `MONGODB_URI` | MongoDB Atlas | Connection string (embeds DB user + password) for policy/asset/claim/GPS collections. | **Secret.** | Live today. |
| `SUPABASE_DB_URL` | Supabase Postgres | Direct Postgres connection string (embeds DB password) — used for running migrations (§7 of `database-design.md`) and any direct-SQL access outside the `supabase-js` client. | **Secret.** | Required at Stage 9 start (currently unset/stubbed). |
| `SUPABASE_URL` | Supabase project API | Project's REST/GoTrue API base URL (e.g. `https://<ref>.supabase.co`). Not itself a secret (it's a public endpoint, analogous to any API host), but it is meaningless without the key below and should be sourced the same way for operational consistency. | Low sensitivity, treated as secret-adjacent (same storage/rotation channel). | Required at Stage 9 start — **new variable, not yet in `.env.example`/`env.ts`.** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Auth Admin/GoTrue API | Server-side admin key used by the backend's `@supabase/supabase-js` client to call Supabase Auth on the client's behalf (invite issuance, MFA enrollment mechanics, session mediation) per `backend-approach.md` §1. **Bypasses RLS entirely.** | **Secret — highest sensitivity in this inventory.** Equivalent to a Postgres superuser for every `app.*`/`auth.*` table. | Required at Stage 9 start — **new variable, not yet in `.env.example`/`env.ts`.** |
| `SUPABASE_ANON_KEY` | Supabase project API | Public/anon key intended for direct client SDK use. | N/A under the current architecture — **explicitly not required.** ADR-0002 and `backend-approach.md` §1 forbid any client (mobile/admin dashboard/security-company dashboard) from holding a Supabase SDK or talking to Supabase directly; the backend itself always authenticates as `service_role`, never `anon`. | **Not provisioned unless a future ADR reverses the mediation principle.** If it is ever introduced, treat it as public-but-not-secret (it is safe to ship in a client bundle by Supabase's own design) — do not conflate its handling with the two secrets above. |

**Action arising from this inventory (tracked, not blocking this document):** `backend/.env.example` and `backend/src/config/env.ts` should be extended to declare `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (fail-fast `requireEnv`, same pattern as `MONGODB_URI`) once Stage 9 implementation of `backend/src/db/supabase.ts` begins — flagged here for `backend-architect`/whoever implements it, not done in this document since it's a code change, not a plan artifact.

**Also flagged forward, out of this document's two-credential-set scope but worth naming so it isn't missed:** `backend-approach.md` §5.1 specifies a Redis-backed (or equivalent) rate-limit counter store in front of login/MFA endpoints. Whatever connection credential that store needs (e.g. `REDIS_URL`) should go through the identical mechanism this plan describes — do not stand up a third, ad hoc secrets pattern for it when it lands.

---

## 3. Where secrets live at rest, per environment

No dedicated third-party secrets manager (Vault, AWS Secrets Manager, Doppler, etc.) is being introduced at this stage. That would be a hosting/infrastructure-strategy decision belonging to `cloud-infrastructure-architect`, and ADR-0001 already scopes a fuller multi-criteria hosting evaluation as a *future* deliverable before Phase 2 GPS-ingestion work — introducing a standalone secrets-manager vendor now, ahead of that evaluation, would be exactly the kind of premature vendor lock-in the root `CLAUDE.md` and `05-development-standards.md` warn against. Instead, this plan uses each already-decided platform's own encrypted environment-variable store, which is a legitimate, common pattern at this scale and requires no new vendor relationship:

| Environment | Where secrets live | Mechanism |
|---|---|---|
| **Local development** | Repo-root `.env.local` (gitignored). | Plain file on the engineer's machine, per the existing pattern in `backend/src/index.ts` (loads dotenv from `../.env.local`). Never `backend/.env` — that path isn't even read. |
| **CI (GitHub Actions)** | Nowhere, currently — no secret is needed. | `.github/workflows/ci.yml` only runs lint/typecheck/build against both apps; no step connects to a real MongoDB or Supabase instance today. **This must stay true intentionally:** when integration tests are added (Stage 10, `automation-qa-engineer`/`qa-architect`), they must run against ephemeral/test-only databases (e.g., a disposable MongoDB container, a dedicated non-prod Supabase project or schema) provisioned per CI run or per test environment — never against production `MONGODB_URI`/`SUPABASE_DB_URL`/`SUPABASE_SERVICE_ROLE_KEY`. If/when a CI job does need a real non-prod credential (e.g., a shared staging Atlas/Supabase project), it goes into a GitHub **Environment** (not a bare repo secret) scoped to that job, so it inherits GitHub's per-environment protection rules. |
| **Staging** | **Does not exist yet as a provisioned environment** — flagged as an open item, see §8. When it is provisioned, it gets its own Render environment (or Render "Environment Group") and its own non-prod MongoDB Atlas project/database and Supabase project, with credentials stored the same way as production (below) but never shared values with production. |
| **Production (backend)** | Render's built-in encrypted Environment Variables, per ADR-0003 (Render is the ratified backend host — this plan does not re-litigate that). | Set directly in the Render service's dashboard/API, never in a committed file, never in Render's build logs. Render encrypts environment variables at rest and injects them into the running process's environment — no code change needed beyond what `backend/src/config/env.ts` already does (`process.env.X`). |
| **Production (frontend, Vercel)** | Vercel's built-in encrypted Environment Variables — **but no backend secret should ever be set here.** | The frontend build only needs non-secret, build-time values (e.g. `VITE_API_BASE_URL` per ADR-0003). **Hard rule:** nothing prefixed `VITE_` may ever hold a MongoDB or Supabase secret — Vite inlines every `VITE_*` variable into the client-side bundle at build time, so anything given that prefix is, by construction, public. `MONGODB_URI`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY` must never exist in the Vercel project's environment variable list at all, secret-flagged or not — the frontend has no legitimate reason to hold them under the mediation principle (ADR-0002, `backend-approach.md` §1). |

**Encryption at rest for the secrets themselves:** Render and Vercel both encrypt stored environment variables using their own platform-managed encryption — this plan relies on that rather than layering a second, independently-managed encryption mechanism on top, which would add operational complexity without a concrete threat it defends against at this stage. If a future compliance or pentest finding requires stronger guarantees (e.g., customer-managed keys), that's a `cybersecurity-architect`-directed escalation, not assumed here.

---

## 4. Access control — who/what can read these secrets

- **Backend service process only.** Both credential sets are consumed exclusively by the Node.js/TypeScript backend (`backend/src/config/env.ts` → `backend/src/db/mongodb.ts` / `backend/src/db/supabase.ts`), per ADR-0002's mediation principle. No mobile app, admin dashboard, or security-company dashboard build or runtime ever holds either credential — confirmed by the Vercel rule in §3 (no `VITE_`-prefixed secret) and by architecture (`backend-approach.md` §1: "the only Supabase client present anywhere in the system is a server-side Supabase client... inside the Node.js/TypeScript backend").
- **Human access is minimized and platform-gated, not shared out-of-band.** Access to the actual secret values is scoped to whoever has admin/owner access to the Render project (backend prod), the MongoDB Atlas project, and the Supabase project dashboards — this is access-control-by-platform-membership, not a separately maintained permissions list. As the team grows beyond the platform owner, `devops-engineer`/`site-reliability-engineer` own tightening this to least-privilege roles within each platform (e.g., Render/Atlas/Supabase team roles) rather than shared owner-level credentials for every engineer — **flagged as a near-term action once a second engineer with production access joins, not urgent at today's team size.**
- **Never in logs.** `backend/src/config/env.ts`'s `requireEnv`/warning paths already avoid printing variable values (only variable *names* appear in error/warn messages) — confirmed by reading the current implementation. This must hold for any future logging added around Supabase client initialization: log "Supabase client initialized" or the failure reason, never the key/URI itself.
- **Never in client bundles.** Covered by §3's Vercel rule; enforced going forward by the Stage 8/PR-review checklist item "no secrets... in client bundles" this role already carries.

---

## 5. Unified rotation policy and cadence

ADR-0002 explicitly asked for both credential sets to go through "the same secrets-management approach... rotated on the same cadence policy" so the platform doesn't end up with two divergent postures. This plan commits to that:

- **Routine rotation cadence: every 90 days, for both `MONGODB_URI`'s underlying database-user credential and `SUPABASE_DB_URL`/`SUPABASE_SERVICE_ROLE_KEY`.** Both are long-lived static secrets (not short-lived tokens with native auto-rotation in either MongoDB Atlas's or Supabase's free/current tier), so rotation is a deliberate, scheduled action, not an automated background process:
  1. Generate a new database user/password (Atlas) or regenerate the key (Supabase project API settings).
  2. Update the value in Render's environment variables and in each engineer's local `.env.local` (communicated per §6's secure-handoff channel, never plaintext chat/email).
  3. Redeploy the backend so the new value takes effect; confirm `/api/health/ready` (already exists per ADR-0003) returns 200 against the new credential before revoking the old one.
  4. Revoke/delete the old credential only after the new one is confirmed working — avoids a self-inflicted outage from rotating and revoking in the same step.
- **90 days is a floor, not a ceiling.** Rotate immediately, out of cycle, on any of the triggers in §7 (suspected compromise) — routine cadence never overrides an incident-driven rotation.
- **Set a tracked reminder, not tribal memory.** Since neither Atlas nor Supabase auto-rotates these on this plan's tier, `security-engineer` owns adding a recurring calendar/ticket reminder (90-day interval) until a fuller secrets-management tool with native rotation scheduling is adopted — this is a process control filling a gap the current tooling doesn't automate, and should be named as a real, owned task rather than left implicit.
- **What is explicitly *not* rotated on this cadence, because it isn't a static secret:** Supabase Auth's JWT signing keys, verified by the backend via Supabase's public JWKS endpoint (`backend-approach.md` §1) — JWKS rotation is Supabase's own managed responsibility and requires no action from us; our backend's local-JWKS verification path already tolerates key rotation by design (fetches/caches the public key set, doesn't hardcode a key).
- **Staging and production credentials are never the same value** (once staging exists, §8) — this makes "rotate production" and "rotate staging" independent actions on independent schedules if ever needed, and means a staging leak cannot compromise production.

---

## 6. Local development story

New-engineer onboarding, with no secret ever touching a committed file:

1. Clone the repo. `backend/.env.example` (committed, placeholder-only, already exists) documents every variable name and what it's for — extended per §2's action item to include `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` once those land in `env.ts`.
2. Copy it: create a repo-root `.env.local` (matching the existing convention in `backend/src/index.ts`, **not** `backend/.env`) — this file is covered by the root `.gitignore`'s `.env` / `.env.*` / `!.env.example` rules (confirmed by reading `.gitignore` directly — the exception is scoped to files literally named `.env.example`, so a real `.env.local` with real values is never accidentally un-ignored).
3. Obtain real values through a **secure, access-controlled handoff — never Slack/email/plaintext chat, never committed anywhere, even temporarily.** At this team's current size, that means the platform owner (or whoever holds Atlas/Supabase/Render access) shares values via a password manager's shared-vault feature (e.g., a shared 1Password/Bitwarden entry) or a platform's own "invite as team member" flow (Atlas/Supabase/Render all support adding a collaborator directly, which is preferable to sharing the raw credential at all when the new engineer only needs read access to generate their own dev-scoped credential rather than reusing a shared one — see next point).
4. **Prefer engineer-specific, narrower-scoped dev credentials over sharing the one production secret**, wherever the platform makes this easy: e.g., a separate MongoDB Atlas database user per engineer (Atlas supports multiple database users against the same cluster) rather than everyone using the same `MONGODB_URI`. This is a "should, where practical" today rather than a hard requirement, because a dedicated non-prod database/project doesn't fully exist yet (§8) — once it does, this becomes the default onboarding path rather than an aspiration.
5. Never paste a real secret into a PR description, commit message, issue tracker, or this documentation tree. If one is pasted anywhere by accident, treat it as a compromise event per §7 immediately, not as a cleanup-only task (deleting the message doesn't undo exposure if it was ever transmitted/indexed).

---

## 7. Suspected-compromise runbook (brief, not a full incident-response doc)

Triggered by: a secret appearing in a git diff/commit (even on a branch, even if not yet merged), a leaked CI log, a lost/compromised laptop with `.env.local` on it, or any other exposure signal.

1. **Rotate immediately** — do not wait for the 90-day cadence, do not wait to first assess "how bad" the exposure is. Follow the same mechanical steps as §5's routine rotation (new credential → update Render + local files → verify health check → revoke old), compressed to happen as fast as safely possible rather than on a planned schedule.
2. **Revoke the old credential the moment the new one is confirmed working** — for a suspected-compromise rotation, minimize the overlap window more aggressively than the routine cadence would (routine rotation can afford a longer safety overlap; a suspected-live-compromise rotation should not).
3. **If the exposure was via git** (a secret committed, even briefly, even if since removed in a later commit): treat the value as permanently burned regardless of whether the commit was force-pushed away or history-rewritten — assume it was cloned/cached/indexed somewhere outside your control the moment it was pushed. Rotation (step 1), not history rewriting, is the actual remediation; history rewriting is optional cleanup afterward, not a substitute for rotation.
4. **Check for misuse before declaring the incident closed:** MongoDB Atlas's access log / Supabase's project logs (Auth logs, Postgres logs) for connections from unfamiliar IPs or unusual query/API patterns in the window between suspected exposure and rotation. This is a `security-engineer` task, escalated to `cybersecurity-architect` if misuse is actually found (that shifts this from a hygiene incident to a real security incident with its own response track).
5. **Log the event** per `03-communication-workflow.md`'s decision-log format — what leaked, when, how it was found, when it was rotated, whether misuse was found — even for a "caught it fast, nothing happened" case. This is what feeds `security-engineer`'s Continuous Improvement input (recurring vulnerability classes) and gives `compliance-specialist` what they'd need if the exposed data path ever turns out to matter for a breach-notification determination.

---

## 8. Explicitly open items — not resolved by this document

Flagged rather than assumed, per this task's instruction:

- **No staging environment is provisioned yet.** Nothing in the repo (Render config, Supabase project, Atlas project) currently reflects a non-production environment. This plan describes the pattern staging *will* follow (§3) but does not itself provision it — that's a `devops-engineer`/`cloud-infrastructure-architect` action, ideally before Stage 9 development produces enough surface area that "test against production" becomes a temptation.
- **No dedicated non-prod MongoDB Atlas project/database or non-prod Supabase project exists yet.** Until one does, any integration testing beyond unit tests risks running against the same data store as production. This should be provisioned before Stage 10 (QA Testing) begins in earnest, owned by `database-architect`/`cloud-infrastructure-architect` — named here as a dependency this plan surfaces, not one it resolves.
- **Long-term secrets-manager strategy is intentionally deferred, not decided.** This plan uses Render/Vercel/GitHub's native encrypted env-var stores because introducing a dedicated secrets-management product now would be a premature, unreviewed vendor decision ahead of `cloud-infrastructure-architect`'s scoped future hosting evaluation (ADR-0001). If that evaluation later selects a platform with native cross-environment secret management (or the team's size/compliance posture outgrows per-platform env vars), this document should be revisited — not treated as a permanent architecture.
- **Engineer-count-aware access tightening (§4)** — least-privilege platform roles (vs. shared owner access) is named as a near-term action once a second engineer with production access exists, not designed in detail here since it isn't yet needed at the current team size.
- **`backend/.env.example` and `env.ts` do not yet declare `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`** (§2) — a small, tracked code change for whoever begins Stage 9 implementation of `backend/src/db/supabase.ts`, not something this planning document edits directly.

None of these block this document's own purpose (a decided, concrete plan for where secrets live, how they're accessed, and how they rotate); they are named as adjacent, real gaps so Stage 8 sign-off isn't mistaken for "everything about the environment topology is settled."

---

## 9. Alignment confirmation

- **Root `CLAUDE.md`** ("No secrets/credentials in source; `.env` stays gitignored") — confirmed satisfied: `.gitignore` (read directly for this document) ignores `.env`, `.env.*`, with a single, correctly narrow exception for `.env.example`. No change to `.gitignore` is needed; this plan's local-dev story (§6) uses `.env.local`, which the existing pattern already covers.
- **`06-security-standards.md`** — "environment variables only, never committed" is satisfied by §3's mechanism for every environment; "encryption at rest for the database" is a separate, already-tracked item (`database-design.md` §8's "sensitive-field/encryption review" line) distinct from *secrets* encryption at rest, which this document covers via each platform's native env-var encryption.
- **ADR-0003** — honored as a settled input: Render (backend) and Vercel (frontend) are used as the concrete production secret stores in §3 precisely because ADR-0003 already ratified them; this document does not introduce a hosting assumption ADR-0003 didn't already make.

---

## 10. Sign-off status

**Proposed, not yet ratified.** Per ADR-0002's Required Follow-ups, this document must be accepted by `cybersecurity-architect` (jointly with `compliance-specialist` on any data-residency implications of where Supabase/Atlas actually host data, which is that pairing's separate, still-open follow-up item — not restated here) before Feature 001's Stage 8 exit and Stage 9 start. Recommend acceptance on the basis that: both credential sets now have a concrete, non-divergent storage/rotation/access mechanism (§3–§5); the local-dev and compromise paths are defined (§6–§7); and every genuinely unresolved dependency is named explicitly (§8) rather than silently assumed.
