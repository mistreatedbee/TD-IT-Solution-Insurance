# Roadmap — Release Gate A (Path to a Real Client Release)

**Owner:** `product-manager` · **Status:** Active, authoritative for current sprint sequencing
**Source of truth for scope:** CTO decision memo, 2026-08-24 (reproduced in full in the PR/commit
that added this file's originating task; treat every §-reference below as pointing at that memo).
**Relationship to [`08-roadmap.md`](08-roadmap.md):** that document is the multi-phase product
roadmap (Phase 0–4). This document is a release-scoped insert — it sequences the work required to
close **Release Gate A** and does not replace or reorder the phase roadmap. Once Release Gate A
closes, Phase 1/2 sequencing in `08-roadmap.md` resumes as the long-range plan.

This document follows `08-roadmap.md`'s tone: order of operations and acceptance criteria, not a
committed calendar. Sizing/sprint placement is `technical-project-manager`'s call on handoff.

---

## 1. Backlog — Release Gate A + compliance conditions (b)–(e)

Each entry is sized for `technical-project-manager` to slot into a sprint, not a full PRD. Owners
are named per the memo and per `01-raci-matrix.md` role ownership; open vendor/technical decisions
are flagged explicitly rather than assumed.

### 1.1 Release Gate A — item (1): deliberate release identity

**As the platform owner, I need the next client build signed under a real, owned release identity,
so that a client build is never again tied to an accidental demo keystore.**

- Owner: `mobile-engineer` + `devops-engineer`. One sprint, per memo §1.
- Acceptance criteria:
  - New EAS project under the correct account/slug; old preview-APK EAS project identity is not
    referenced by any build profile.
  - Bundle ID `co.za.tditsolutions.insurance` explicitly confirmed by the platform owner (not
    left as the placeholder guess `HANDOFF.md` currently flags it as).
  - New Android keystore generated, backed up off-machine (owner-controlled, not left only in
    EAS's managed credentials with no export).
  - Build number/version scheme documented in `mobile/docs/DEPLOY.md` and incremented for build #2.
  - `mobile/docs/DEPLOY.md` updated to state the old keystore/slug are retired and why.

### 1.2 Release Gate A — item (2): confirmed email delivery

**As a new customer, I need my signup verification email to actually arrive in my inbox, so that
I can complete signup without a broken flow.**

- Owner: platform owner (Resend account/domain/secrets) with `technical-project-manager` tracking
  daily until closed, per memo §2(2). This is not an engineering task — the code path
  (`auth-send-email` Edge Function → Resend, `transactional-email.ts`) is already built per
  `HANDOFF.md`.
- Acceptance criteria:
  - A fresh signup on a real email address (not a Supabase test inbox) receives a verification
    email in an actual inbox — screenshot or message-ID evidence recorded, not "code is wired."
  - `resend-setup.md` steps (API key, domain verification, hook secrets) all confirmed complete
    against the live Supabase project, not assumed from repo state (secrets are correctly not
    committed, so nothing in-repo can confirm this — see §3 below).
  - Result logged in the Release Gate A tracking record (owner: `technical-project-manager`).

### 1.3 Release Gate A — item (3): device QA pass, signup through asset detail

**As QA, I need to run the full signup → verify → login → create policy → register asset → view
detail flow on a physical device against Render, so that Release Gate A has real evidence, not a
simulator run.**

- Owner: `manual-qa-engineer`, executing the existing
  [`manual-qa-checklist.md`](../features/004-policy-asset-management/manual-qa-checklist.md).
- Depends on: 1.1 (real build), 1.2 (email delivery), and a live Render deployment (owner action
  per `HANDOFF.md` — `render.yaml` exists, service not yet provisioned as of last handoff; verify
  current state before scheduling this item).
- Acceptance criteria:
  - Full flow completes on a physical Android and/or iOS device (internal distribution channel —
    TestFlight / Play Internal Testing, per `003-mobile-app-foundation/architecture.md` §6, not
    public store).
  - Every checklist item in `manual-qa-checklist.md` is executed and its result recorded, not
    just the happy path.
  - Any defect found is triaged before Release Gate A is declared closed — this is a hard gate,
    not a "known issues" list.

### 1.4 Release Gate A — item (4): hide claims behind a build flag

**As a client evaluating the app, I need every screen I can reach to either work or be visibly
absent, so that I never land on a 404 and lose trust in the product.**

- Owner: `mobile-engineer`, with `product-manager` sign-off on the flag's scope.
- Rationale (memo §2(4)): `mobile/app/(app)/claims/` (`index.tsx`, `new.tsx`, `[id].tsx`,
  `_layout.tsx`) calls a backend that does not exist — confirmed no `/claims/*` route exists
  under `backend/src/routes/`. Claims is DEFERRED (§3), so the UI must match.
- Acceptance criteria:
  - A build-time flag (e.g. an EAS environment variable consumed at build, not a runtime toggle
    a client could flip) removes the Claims tab/entry point entirely from client builds.
  - No navigation path in a client build reaches `mobile/app/(app)/claims/*`.
  - Internal/dev builds may still expose the stub behind the same flag, defaulted off, so
    engineering doesn't lose the scaffold.
  - Flag mechanism documented in `mobile/docs/DEPLOY.md` (no such mechanism currently exists in
    `mobile/src/` — this is new work, not a wire-up of something already there).
  - Recovery UI stubs (`mobile/app/(app)/recovery/*`, if present) audited under the same rule —
    confirm before Release Gate A whether recovery screens hit real endpoints (Feature 004's
    recovery-case scaffold, `recovery.ts`/`security-cases.ts`, does exist per `HANDOFF.md`) or
    are also stubs needing the same flag. Don't assume; check current routes before closing this
    item.

### 1.5 Release Gate A — item (5): honest release notes

**As a client, I need release notes that state what this build does and does not do, so that
expectations match the product.**

- Owner: `technical-writer` with `product-manager` review.
- Acceptance criteria:
  - Release notes list exactly the "sayable" items in §2 of this document below, in the same
    language as the memo's §7 (no upgrades in framing — "working auth," not "production-ready").
  - Release notes explicitly state payments, claims, GPS tracker hardware, and live recovery
    dispatch are not in this build.
  - No launch date appears anywhere in the notes.

### 1.6 Compliance condition (b): Supabase DPA, Resend operator review, platform RoPA

**As compliance, I need the three outstanding conditions blocking real customer PII to close, so
that Release Gate A's client build can be used with real (not test) customer accounts.**

- Owner: platform owner (Supabase DPA execution — signature + return), `compliance-specialist`
  (Resend operator review C-006-3/C-007-2, RoPA C-006-4/C-007-4).
- Acceptance criteria:
  - Supabase DPA signed and returned; confirmation recorded (not just "sent").
  - A Resend-specific operator/POPIA-s72/DPA review document exists — the only SMTP vendor review
    currently on file, `compliance-review-smtp-vendor.md`, is for Brevo, the superseded vendor,
    and was never redone after the vendor change to Resend. New document must supersede it by
    name.
  - A single platform-level RoPA document exists at a stable path under `docs/`, covering at
    minimum Features 001/004/006/007 (identity, policy/asset, onboarding, notifications).
  - `compliance-specialist` upgrades concurrence on Feature 006 and Feature 007 security reviews
    from "withheld for real customer PII" to full concurrence, recorded in each
    `security-review.md`.

### 1.7 Compliance condition (c): SR-007-11 admin suspend/deactivate endpoint

**As an admin, I need to suspend or deactivate a compromised or fraudulent customer account, so
that the platform has a real incident-response control before it holds real customer data.**

- Owner: `backend-architect` (API-design amendment) + `backend-engineer` (implementation),
  `security-engineer` (Stage 8).
- **Flag before scoping this as new work:** `backend/src/routes/admin-accounts.ts` currently
  contains `PATCH /admin/accounts/:id/state` (lines ~175–), gated by `authenticate` +
  `requireUserType('admin')`, rate-limited, restricted to `ADMIN_MUTABLE_USER_TYPES`, with a
  self-modification guard (`subjectId === actorId` → `FORBIDDEN`) and a companion test file
  `admin-accounts.test.ts`. This directly contradicts `HANDOFF.md`'s standing claim ("no
  `PATCH`/`PUT`/`POST` route against `/admin/accounts*` exists") — that claim is stale as of
  this writing. **This backlog item should be re-scoped from "build the endpoint" to "verify,
  Stage-8-review, and wire `disableAllForAccount()` into the existing endpoint"** — see §3 below
  for the full flag. Confirm current state in code before sprint planning, not from either doc.
- Acceptance criteria (revised assuming the endpoint is real, pending verification):
  - `notification-engineer`'s `disableAllForAccount()` (already wired to logout-all and
    password-reset per `HANDOFF.md`) is confirmed wired into this endpoint's suspend/deactivate
    transition, or a ticket is filed if it is not.
  - A dedicated Stage 8 `security-review.md` entry (or amendment to an existing one) exists for
    this endpoint specifically — audit-log coverage, authorization boundary, and abuse cases
    (e.g. can a non-owning admin escalate another admin) all reviewed.
  - Regression test exists asserting a suspended account cannot log in / cannot use an existing
    session.

### 1.8 Compliance condition (d): C-007-11 account-closure / deletion path

**As a customer, I need to close my account and have my data handled per POPIA s24, so that the
platform can honestly claim a deletion capability exists.**

- Owner: `backend-architect` + `database-architect` (design), `backend-engineer` (implementation).
- Acceptance criteria:
  - A defined account-closure flow exists (customer-initiated at minimum; admin-initiated may
    ride the same state machine as 1.7 if scoping allows).
  - Closure triggers or schedules deletion/anonymization of dependent data per each feature's
    already-written retention rules (audit logs, push tokens, notification preferences,
    Feature 004 policies/assets) — these rules exist on paper today with no trigger to fire them,
    per `HANDOFF.md`'s open-items table.
  - `compliance-specialist` sign-off that the flow satisfies a POPIA s24 request end to end.
  - Not required to be self-service in the UI for Release Gate A if a documented, auditable
    admin-assisted path exists — `product-manager` call: self-service closure is Phase 2 for this
    item, an operable path (even manual/admin-triggered) is the Release Gate A bar. Flag this
    scoping call to `technical-project-manager` explicitly when sequencing.

### 1.9 Compliance condition (e): FU-A14 wiring half (SD-FU-07)

**As an auditor, I need every privileged read of a location-adjacent record to carry a resolvable
case reference, so that ADR-0006's AUD-9 requirement is actually enforced, not just possible.**

- Owner: `backend-architect` + `backend-engineer`, per ADR-0006 §17.3/FU-A14 and
  `HANDOFF.md`'s SD-FU-05/SD-FU-07 notes.
- Scope note: the entity half (recovery_cases Mongo collection + `recovery.ts`/`security-cases.ts`
  API) already exists per `HANDOFF.md`. This item is the **wiring half only**: no read path
  currently resolves a purpose against a case, and no location endpoint exists to attach one to.
- Acceptance criteria:
  - `GET`/read paths on recovery-case and security-case routes that expose case-adjacent data
    resolve and record a case reference per AUD-9, not a free-text purpose string.
  - The partner-operator audit gap flagged as SD-FU-05 (`security-cases.ts` writes no
    `admin_access_log` entry for partner-operator reads) is closed as part of this item, since the
    memo places GPS/self-device work strictly after condition (b)–(e) closes and SD-FU-05 becomes
    blocking "the moment any location value is exposed there" — this item is exactly where that
    moment arrives if Feature 008 work starts next.
  - No location coordinate is exposed by any route until this wiring is confirmed — this is a
    precondition for GPS self-device work (memo §3, "GPS: self-device only, and only after (b)"),
    not just an audit nicety.

### 1.10 GPS self-device tracking (Feature 008) — gated, not sequenced yet

**Not a sprint-ready backlog item today.** Per memo §3, Feature 008 stays design-gated until
condition (b) [1.6] closes, and SDL-2 (a self-asserted location may never alone drive a real-world
consequence) is binding now regardless of ADR-0009 ratification status. Listed here only so
`technical-project-manager` doesn't accidentally sequence it ahead of 1.6–1.9:

- Blocked on: 1.6 (compliance conditions), 1.9 (FU-A14 wiring — SDL-5's non-owner read path
  depends on it), ADR-0009 ratification (§15–17 reserved, `cto` action), `product-manager`
  sign-off on OQ-SD-01/02/05 (still open per `HANDOFF.md`).
- Do not add `expo-location` or any location permission to `mobile/package.json` on the strength
  of this roadmap entry — that remains explicitly out of authorization per ADR-0009 §14.

### 1.11 Staging environment interim (MP-8) — target within two sprints

**As engineering, I need QA to run against something other than the live production database, so
that Stage 10 execution doesn't risk production customer data once real customers exist.**

- Owner: `cloud-infrastructure-architect` + `devops-engineer`, per memo §4.
- Not a Release Gate A blocker (memo §4 explicitly). Hard blocker for the first real paying
  customer signup.
- Acceptance criteria:
  - Separate MongoDB Atlas database name for QA, distinct from the live/demo database currently
    shared with local dev (per `HANDOFF.md`: "No staging environment and no dedicated non-prod
    database project exist yet — this is the same live project used for the local demo").
  - Separate Supabase project for QA.
  - `render.yaml` / deploy docs updated to reference the QA target explicitly.
  - Explicitly out of scope for this item: multi-region, load testing, production-parity
    infrastructure — MP-8's "minimum acceptable interim" bar only.

---

## 2. What ships in the next client build vs. what's out of scope

Reproduced to match memo §2 and §5 exactly — do not add, drop, or soften any line without a new
CTO decision.

### Ships in the next client build (once Release Gate A closes)

- Working authentication (signup, login, MFA where enrolled).
- Policy creation against the live API.
- Asset registration against the live API (all eight supported asset types, no photos — MP-5
  remains deferred).
- Asset detail view.
- Admin dashboard (existing web surface, `src/admin/*`).
- Security-company partner dashboard (existing web surface, `src/security/*`).
- Self-device location **design** as complete — sayable as "design complete," not as a working
  feature. No location capability ships in this build (see §1.10 above and memo §3/§7).

### Explicitly not sayable, in any form, per memo §7

- Payments / subscriptions.
- Claims (backend does not exist; UI hidden behind build flag per §1.4).
- GPS tracker hardware.
- Live recovery dispatch.
- "Production-ready" (or any equivalent framing).
- Any launch date.

### Out of scope for this release cycle (deferred, with reason)

- **Payments/billing** — no gateway selected, PCI posture unreviewed, commercial rules (D-01–D-08)
  unratified. Payment-gateway scorecard due in 3 weeks (`integration-architect`, memo §5);
  selection ratified by ADR-0010. Onboarding continues ending at `pending_activation` /
  `billingStatus: not_configured`.
- **Claims backend** — highest regulatory-exposure surface on the platform; no Stage 1
  requirements, no compliance review, no design. Not next after Release Gate A closes either —
  memo is explicit it's deferred past this milestone, not just this build.
- **GPS tracker hardware / non-self-device GPS** — vendor scorecard due in 6 weeks, no selection
  before then; `tracking-profile.ts` abstraction stays vendor-agnostic.
- **Object storage / asset photos (MP-5)** — deferred until photos are actually scoped as a
  feature; no disabled camera affordance permitted in any client-facing screen.
- **Public app-store release** — internal distribution only (TestFlight / Play Internal Testing)
  per `003-mobile-app-foundation/architecture.md` §6; unchanged by this memo.
- **Staging environment as a Release Gate A blocker** — explicitly not required before build #2;
  required before first real paying customer (§1.11 above).

---

## 3. Repo-vs-memo flags — risks/assumptions to verify, not overrides

These do not change any memo decision. They are places where current repo state either
contradicts a standing doc, is missing context the memo assumed, or needs a scoping call flagged
to `technical-project-manager` before sprint planning.

1. **SR-007-11 (admin suspend/deactivate endpoint) may already be substantially built.**
   `backend/src/routes/admin-accounts.ts` contains a `PATCH /admin/accounts/:id/state` route
   with auth, rate limiting, user-type restriction, and a self-modification guard, plus a test
   file (`admin-accounts.test.ts`). `HANDOFF.md`'s current text states flatly "there is no admin
   account suspend/deactivate endpoint anywhere in this codebase" and "no `PATCH`/`PUT`/`POST`
   route against `/admin/accounts*` exists." **One of these is stale.** Before scoping item 1.7
   as net-new backend work, `backend-architect` should confirm current state and either (a) close
   SR-007-11 as already implemented pending Stage 8 review, or (b) determine the existing route
   is incomplete/different in scope from what SR-007-11 requires (e.g. does it call
   `disableAllForAccount()`, does it have its own security review). Do not plan a full new
   endpoint build without checking this first — real risk of duplicated work.

2. **Recovery mobile screens' actual backend-reality is unconfirmed at time of writing.** The
   memo names claims (`mobile/app/(app)/claims/`) as the specific stub to hide, and per
   `HANDOFF.md` claims genuinely has no backend. But `HANDOFF.md` also states a recovery-case
   scaffold (`POST/GET /v1/recovery/cases*`, `GET/PATCH/POST /v1/security/cases*`) does exist on
   the backend — meaning `mobile/app/(app)/recovery/*`, if it exists as UI, may or may not be a
   genuine stub in the same sense as claims. This needs a direct check (does the mobile recovery
   UI call the real recovery-case API, or is it also calling a 404) before item 1.4 is closed —
   the memo's build-flag decision was written specifically about claims; don't silently extend or
   withhold it from recovery without checking.

3. **CLAUDE.md's current-state section is stale relative to `HANDOFF.md` and this verification
   pass.** `CLAUDE.md` states "No backend, no mobile app, no database, no infrastructure, no real
   product pages" and "only a design-system showcase exists." This is materially out of date: a
   working backend (188 tests), a mobile app with live API integration, two MongoDB/Supabase
   databases with real schema, and both Admin (`src/admin/*`) and Security Company
   (`src/security/*`) dashboards exist today. This does not change any memo decision, but anyone
   scoping work from `CLAUDE.md` alone (rather than `HANDOFF.md`) will underestimate what already
   exists and risk re-building it. Flagged for `technical-writer`/`cto` to refresh — out of this
   role's authority to edit directly, since `CLAUDE.md` is a project-instruction file.

4. **No feature-flag mechanism exists today for build-time surface hiding.** A grep of
   `mobile/src/` for flag-related patterns found nothing that does compile-time/build-profile
   gating of a whole route tree. Item 1.4 (hide claims) is genuinely new plumbing work, not a
   toggle flip — sizing should account for that, not assume a trivial config change.

5. **Live Render deployment status is unconfirmed.** `HANDOFF.md` states `render.yaml` exists but
   "Live Render service not yet provisioned (owner)" as of the last handoff snapshot. Item 1.3
   (device QA against Render) depends on this being live — `technical-project-manager` should
   confirm current deploy status before scheduling the QA pass, not assume it from this document.

6. **Resend delivery confirmation (item 1.2) has no in-repo way to verify prerequisite completion.**
   Because secrets are correctly not committed, nothing in this repository can confirm whether the
   platform owner has completed the Resend account/domain/secret setup described in
   `resend-setup.md`. This is expected and correct (no secrets in source, per house rules), but it
   means item 1.2's daily-tracking requirement (memo §2(2)) has to be driven by direct
   owner confirmation, not a repo check.

7. **Bundle ID `co.za.tditsolutions.insurance` is still described as a placeholder guess** in
   `HANDOFF.md`, not a confirmed value. Item 1.1 requires the owner to confirm or replace it — do
   not treat the string currently in `mobile/app.json`/EAS config as already ratified.

8. **MongoDB staging separation (item 1.11 / MP-8) has no existing `MONGO_DB_NAME`-style
   environment separation found in `backend/src/db/`** in this pass — worth `database-architect`
   confirming the current connection-string/db-name wiring supports a clean second-database split
   before committing to the two-sprint target, rather than assuming the abstraction is already
   parameterized for it.

---

## 4. Sequencing note for `technical-project-manager`

Recommended order, following the memo's own priority chain in §3 ("(a) Release Gate A, (b)
compliance conditions, (c) SR-007-11, (d) C-007-11, (e) FU-A14 wiring"):

1. §1.1 (release identity) and §1.6/§1.2 (Resend delivery, owner-tracked) can start in parallel —
   neither depends on the other.
2. §1.4 (claims build flag) and §1.5 (release notes) are small and can run alongside 1.1.
3. §1.3 (device QA) is the gate-closing item — schedule last, once 1.1/1.2/1.4 are done and Render
   is confirmed live (flag 5 above).
4. §1.7 (SR-007-11) — **resolve flag 1 above first**; this may already be most of the way done,
   which changes its sprint sizing substantially.
5. §1.8 (account closure) and §1.9 (FU-A14 wiring) can run in parallel with each other, after 1.6
   compliance conditions are underway (they don't strictly require 1.6 to be *closed*, but touch
   the same PII-handling surface and should be reviewed together by `compliance-specialist`).
6. §1.11 (staging) runs on its own two-sprint track, independent of the Release Gate A critical
   path, per memo §4.
7. §1.10 (GPS/Feature 008) stays off the sprint board entirely until 1.6 and 1.9 close and
   ADR-0009 is ratified — do not let it drift onto a sprint by momentum.

