# Project Handoff — TD IT Solution Insurance

Snapshot written for a tool transition (Claude Code → Cursor). This captures what exists,
what's mid-flight, and what's genuinely open — not a roadmap re-statement. See
`.cursor/rules/00-house-rules.mdc` for the condensed standing rules; this doc is the
point-in-time status.

## What actually exists and works right now

**Feature 001 — Authentication.** Real, tested, and has run end-to-end against a live
Supabase (Postgres, EU region) + MongoDB Atlas project:
- Backend (`backend/`): signup, login, MFA enroll/verify, session refresh/rotation with
  device-binding, password reset, invitation-accept, and **`GET /v1/admin/accounts` +
  `/admin/accounts/:id`** — the platform's first `/admin/*` route. **85 tests across 14 files,
  re-run and verified green 2026-08-12** (Feature 004 customer routes + email module).
- Mobile (`mobile/`): Expo app with matching auth screens, SecureStore token handling,
  device-ID binding on login *and* refresh. **30 tests passing** (10 suites), typecheck/lint clean.
  **EAS deploy scaffold:** `eas.json` uses EAS environment scoping (preview/production API URLs
  via `eas env:create`, not hardcoded); [`mobile/docs/DEPLOY.md`](mobile/docs/DEPLOY.md) documents
  the full flow ([EAS production config](be5edc20-7c7a-4ace-87be-3ce7a6631520)). Owner actions
  remain: `eas init`, Apple/Google accounts, confirm bundle IDs, deploy Render backend, set
  `EXPO_PUBLIC_API_BASE_URL` in EAS.
- Full paper trail: `docs/features/001-authentication/` has business-requirements, product-
  plan, ux-research, ui-design, architecture-review, database-design (+ addendum-001),
  api-design (**v1.2.0** — check its §11 Contract Amendment Log for the full change history),
  security-review (verdict: sign-off granted with 25 required changes, all since applied),
  secrets-management-plan, compliance-review-supabase.md, compliance-review-smtp-vendor.md.
- Both live databases have the real schema applied (not just paper design) — confirmed via
  an actual signup smoke test that landed a real row, then was deleted.

**Feature 004 — Policy/Asset Management.** Paper design complete; **customer API + mobile screens implemented**:
- `docs/features/004-policy-asset-management/` has `database-design.md` + `database-addendum-001.md`
  (Amendment A1 discharges ADR-0006 FU-A2), `api-design.md` (10 endpoints), **`business-requirements.md`**
  (Stage 1 minimum — 2026-08-11, [Minimal Stage 1 unblock](bec6a3ef-4a29-444e-a19d-7daaea560dd8)), and
  **`field-sensitivity-review.md`** (P-14 Phase 1 stub — no field-level encryption for VIN/serial/`estimatedValue`).
- **Backend:** `POST/GET /v1/policies`, `GET /v1/policies/{id}`, `POST/GET /v1/assets`, `GET /v1/assets/{id}`
  in `backend/src/routes/policies.ts` and `assets.ts`. Mongo bootstrap:
  `backend/src/db/feature004-collections.ts` + `scripts/bootstrap-mongo-collections.ts`
  ([Mongo collections bootstrap](c734196c-9969-4f80-b6a8-32428d01ba2d) — applied to live
  Atlas `td-it-solution-insurance`, idempotent re-run verified). Startup path uses the same
  shared function via `mongo-bootstrap.ts`. **85 tests across 14 files, green** (2026-08-12).
- **Mobile:** Policy and Assets tabs are **real screens** wired to Feature 004 customer API
  (`PolicyListScreen`, `CreatePolicyScreen`, `AssetListScreen`, `RegisterAssetScreen`, detail
  routes); OpenAPI at `mobile/openapi/policy-asset-service.yaml` with codegen. Home (M-03) shows
  live policy/asset counts. **Stage 8 sign-off granted** (cybersecurity-architect + security-engineer
  concurrence, SR-004-1…5 open). **Stage 10:** strategy + checklist filed; unit/API tests green;
  E2E scaffold at `mobile/e2e/` — **execution blocked on Brevo** (real email verification → BR-2).
- **Stage 1:** minimum viable `business-requirements.md` exists; **D-01–D-08 deferred** (tiers, pricing,
  coverage limits, eligibility, billing, cancel/refund, retention, claims). P-01 partially discharged for
  Phase 1; commercial rules still open. Pending `product-manager` sign-off (OQ-1–OQ-3).

**Governance/ADRs.** `docs/organization/adr/`: 0001 (stack baseline), 0002 (Supabase for
identity, MongoDB for domain data — the load-bearing split decision), 0003 (Render hosting),
**0006** (privileged-access audit correlation — **Ratified 2026-08-11 by `cto`, §16**, with five
rulings and four conditions; see §16.5 for the conditions and §16.6 for FU-A10…FU-A12).
**§17 was appended later the same day** — a `cto` post-ratification correction of one factual
error inside §16 (an index it described as existing does not exist, §17.1) plus two new
follow-ups, FU-A13 and FU-A14 (§17.6). §16's text stands as signed; §17 corrects it in the
open rather than editing the ratification record.
0004/0005 are reserved by name in other documents but not yet written; 0007 is reserved for
FU-08's third-persistence-surface ADR (ruling R-4); **0008 (MongoDB schema provisioning) is
proposed** at [`0008-mongodb-schema-provisioning.md`](docs/organization/adr/0008-mongodb-schema-provisioning.md)
— pending `cto` ratification. 0009 is the next free number.

## Local dev / demo environment

- `.env.local` (repo root, gitignored) and `mobile/.env` (gitignored) hold real credentials
  for a live Supabase project and MongoDB Atlas cluster. **These are real, not placeholders.**
  The platform owner explicitly chose not to rotate them despite being pasted in a chat
  transcript during setup — that's a standing decision, not an oversight to "fix."
- The backend was running locally on port 3000 as of this handoff (`cd backend && npm run
  dev`). Two tunnels were used for remote client demoing (Cloudflare quick tunnel for the
  backend API, Expo's own tunnel for Metro) — both are ephemeral, tied to whoever's machine
  runs them, and **will need restarting** in a new environment. See git history / prior
  session transcript for the exact commands if you need to stand this up again; there's
  nothing durable to reconnect to.
- No staging environment and no dedicated non-prod database project exist yet — this is the
  same live project used for the local demo. Treat write operations accordingly.

## Real bugs found and fixed this session (for context on what "done" has meant here)

Several agents caught and fixed genuine defects, not just documentation gaps — worth knowing
the bar this project has been held to:
- An account-takeover path in MFA enrollment (client-supplied account ID) — fixed before any
  code shipped, via a server-issued single-use enrollment ticket.
- A forced-MFA-re-enrollment flow that issued a ticket but never persisted it — fixed with a
  regression test that fails against the old code.
- A mobile refresh call silently missing the device-ID field the whole binding mechanism
  depended on — fixed, with the stale generated OpenAPI types also caught and regenerated.
- An invitation token with a 7-day TTL against a 72-hour compliance ceiling — tightened.
- An audit-log table that could only record one of {actor, subject} for the same event,
  causing two call sites to silently disagree about what they were logging — fixed via
  migration 031, applied to the live database.

## Open items — genuinely unresolved, not busywork

| Item | What it needs | Blocking? |
|---|---|---|
| **Supabase DPA execution** | Platform owner signs Supabase's DPA and returns it | Blocks real production identity data (not local dev/testing) |
| **AUD-3**: bulk admin list endpoints don't record a per-subject audit entry | **Trail A: implemented** — `GET /v1/admin/accounts` calls `recordBulkDisclosure()`; `GET /v1/admin/accounts/{id}` calls `record()`. **Trail B:** shape is paper-complete (FU-A2); Mongo writer + `/admin/policies*`/`/admin/assets*` routes still unbuilt when Feature 004 ships | Feature 004 Stage 8 still needs P-14, trail read ACL, and Feature 004 admin routes — not AUD-3 on Trail A. **C-14 now binds to `GET /v1/admin/accounts`** (bulk access purpose-documented + role-restricted, `backend-architect` + `authentication-engineer`): it was filed against Feature 004's Stage 8, but a Feature 001 endpoint reached that surface first — `cto` disposition at ADR-0006 §17.7 |
| **~~ADR-0006 ratification~~** | **Done** — ratified 2026-08-11, §16. Remaining §16.5 conditions: ~~C-16(a)(b) folded into AUD-9~~ (done); ~~FU-A4 runbook document~~ (done — [`aud-8-privileged-access-reconstruction.md`](docs/organization/runbooks/aud-8-privileged-access-reconstruction.md); **executable use still blocked on FU-A11**); AUD-11 "checked" not "enforced" until FU-A10; C-13 closed before go-live | Ratification no longer blocking; FU-A11 blocks relying on the runbook |
| **~~Migrations 032 + 033 not applied~~** | **Applied** to the live Supabase project (2026-08-11), and **verified against its catalog** rather than taken on trust (`cto`, ADR-0006 §17.5): all four AUD-1 columns plus `result_count`, all four R-3 `CHECK`s, `account_audit_log_actor_created_at` with the right partial shape, 031's superseded actor index dropped, all three new enum values present. Both files' headers still read "NOT YET APPLIED" long after they were applied — **corrected in place**, since `.cursor/rules/database.mdc` makes the header, not a doc, the source of truth. **Residual:** the four constraints were added `NOT VALID` and have **not** been promoted; 033's verification block is `security-engineer`'s to run and there is no record of it having been run | No longer blocking deploy; constraint promotion still an open decision |
| **FU-A13 (new)** — Trail A indexes + purge scheduling | **Indexes applied** — migration `034` created `account_audit_log_account_id_created_at` and `account_audit_log_created_at` on the live Supabase project (2026-08-11, catalog-verified). **Still open:** purge scheduling (nothing calls `app.purge_expired_audit_log()`); deploy-time live-vs-design schema check (FU-A13 second half, shares FU-A10); 033's `NOT VALID` constraint promotion (`security-engineer`) | Subject-keyed AUD-8 query no longer seq-scans; retention still not enforced until scheduled |
| **FU-A14 (new)** — AUD-9's mandatory purpose/case reference has nothing to resolve against | ADR-0006 AUD-9, as amended by C-16(b), requires location-access and partner-operator reads to carry a case reference that *"resolves to a case that exists independently of the access."* **No case, claim, theft-report or recovery entity exists on this platform and none is planned** — Feature 004 defines policies/assets only; Claims is unstarted. A free-text purpose string is explicitly ruled out (ADR-0006 §17.3) as being the exact thing the requirement excludes | Blocks **Stage 1** — not Stage 8 — of the GPS location-access trail and of any Security Company Dashboard read surface |
| **FU-A11 — investigative read credential** | Read-only credential scoped to both audit trails, for whoever executes the AUD-8 runbook (`cloud-infrastructure-architect` + `database-architect`, verified `security-engineer`) | Blocks *using* the runbook before first production privileged account (§16.5 item 2) |
| **Brevo (SMTP vendor) account creation** | Platform owner creates the account and, critically, **sets transactional-log/preview retention to its 1-month minimum and disables marketing mode *before* the first real send** — this setting is not retroactive | Blocks real email delivery (currently `console.warn` stand-ins) |
| **Supabase dashboard Auth email-link TTLs** | Confirm/tighten in the Supabase dashboard directly — not reachable from application code | Compliance completeness (C-5.3) |
| **Real integration test suite** | Automated tests against the live Supabase/Postgres/Mongo stack, beyond the manual smoke tests done so far | Not blocking, but the current test coverage is unit-level + one manual E2E pass |

## Mobile production push (2026-08-12, `cto`) — the current directive

**Goal as stated by the platform owner:** "Get the mobile app ready — not a demo, the real
thing." This section is the coordination record for that push: what it means concretely, what
each role owns, and what is honestly still in the way. It is a plan with a **partial execution record** — check the code before believing any line
below has landed. As of 2026-08-12: Wave 0–1 **done**; Wave 2 **substantially done** (Stage 8
concurrence, QA strategy, CI, Render blueprint, Maestro scaffold). **Remaining:** Brevo account
(owner), manual QA execution on device, live Render deploy, MP-8 staging DB separation, E2E run.

### What "the real thing" actually means here, and what it can't mean yet

Today the mobile app is a real auth app with **live Policy and Assets tabs** wired to Feature 004's
customer API. The gap to "definition of done" is Wave 2 gates (Stage 8 formal concurrence, Stage 10
E2E) and **Brevo** (real email verification). Two things adjacent to it are **not**, and this push does not
pretend otherwise:

- **Plan/tier selection.** Stage 1 `business-requirements.md` now exists and ratifies Phase 1
  scope without inventing tiers/pricing (D-01–D-04 deferred). MP-3 still stands: **no plan-picker,
  no pricing screen, no tier comparison UI** until commercial rules are ratified.
- **Public app-store release.** `003-mobile-app-foundation/architecture.md` §6 already ruled
  that this app should not go to public store review until Phase 1 scope is genuinely complete;
  internal distribution (EAS `preview` → TestFlight / Play Internal Testing) is the correct
  channel for this push's output.

**Definition of done for this push:** a customer can sign up, verify, log in, register an asset
of any of the eight supported types, see it in a list, open its detail, and read their policy if
one exists — against the real backend, on a real device build, with Stage 8 and Stage 10 passed,
distributed internally. Not: buying a plan, uploading photos, GPS, claims, or admin surfaces.

### `cto` rulings that scope this push

| ID | Ruling |
|---|---|
| **MP-1** | **Customer surface only.** Build §6.1/§6.2 of `004/api-design.md` (`POST/GET /v1/policies`, `GET /v1/policies/{id}`, `POST/GET /v1/assets`, `GET /v1/assets/{id}`). **The four `/v1/admin/policies*` / `/v1/admin/assets*` endpoints are out of scope for this push.** Consequence, and the reason this ruling is load-bearing: with no admin route in scope, **P-13 (`admin_access_log` formalization), AUD-3 Trail B, and C-14 do not bind this push.** They bind the moment anyone adds the first Feature 004 admin route, and that is a separate work item with its own Stage 8. |
| **MP-2** | **Stage 7 disposition.** `004/api-design.md` is marked "Draft — submitted for `solution-architect` review," and its §9 last checkbox is open. Per `00-house-rules.mdc`, `solution-architect` has no role file and `cto` is the fallback owner for that stage. **Disposition: authorized for implementation as written, for the §6.1/§6.2 customer surface only**, on the conditions in MP-4/MP-5/MP-6. This authorization does not extend to the admin surface (MP-1) and does not close P-12 or the formal Stage 8 `security-review.md` (P-14 stub filed — see Wave 0). The document itself is `backend-architect`'s artifact and is deliberately not edited here; this row is the review record. |
| **MP-3** | **No business rules may be invented to unblock delivery.** `planTier` stays a free-form string, `coverageLimits` stays `[]`, no eligibility check is added to `POST /v1/assets`. Concretely for mobile: **no plan-picker, no pricing screen, no tier comparison UI.** The Policy tab renders a real policy read-only if one exists and keeps its honest empty state if not. If a screen would require knowing what a tier is, it is not in this push. |
| **MP-4** | **Stage 8 is a hard gate.** P-14 **Phase 1 stub** is filed at `field-sensitivity-review.md` (no FLE for VIN/IMEI/serials/`estimatedValue` in Phase 1). Formal `security-review.md` verdict (Wave 2) remains required before treating Stage 8 as passed. |
| **MP-5** | **Photo upload is deferred, and the reason is a missing decision, not a missing sprint.** `Asset.photos` is `array of string` with no upload endpoint, and **no object-storage provider has been selected for this platform** — that is an open vendor decision (`integration-architect` + `cloud-infrastructure-architect`, ADR-worthy, and it carries a POPIA transborder-flow question because photos of insured assets are personal information). Assets register without photos in this push; the mobile form must not show a disabled camera affordance implying it's coming next week. |
| **MP-6** | **MongoDB provisioning — interim mechanism in place; ADR-0008 proposed.** Shared bootstrap in `feature004-collections.ts`; applied to live Atlas; startup re-run. [`0008-mongodb-schema-provisioning.md`](docs/organization/adr/0008-mongodb-schema-provisioning.md) filed 2026-08-12 — pending `cto` ratification. |
| **MP-7** | **New endpoints must carry an explicit rate limiter.** `backend/src/index.ts`'s router topology makes a blanket authenticated limiter structurally unreachable — the comment there is accurate and is not a TODO. Every route added in Wave 1 applies `createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, ...)` directly, per `api-design.md` §5's platform default. A route that ships without one is an incomplete route. |
| **MP-8** | **No QA or load testing against the live project's production data.** There is still no staging environment and no non-prod database project — the same live Supabase/Atlas project backs local dev. At minimum Stage 10 runs against a separate Mongo database name; a real staging environment is required **before go-live**, not before Stage 10. `devops-engineer` + `cloud-infrastructure-architect`. |

### Work assignment — who owns what, and what runs in parallel

**Wave 0 — start immediately, all four in parallel. None depends on the others.**

| Role | Deliverable | Notes |
|---|---|---|
| `business-analyst` | ~~Feature 004 Stage 1 `business-requirements.md`~~ **Done (minimum Stage 1, 2026-08-11)** — [`business-requirements.md`](docs/features/004-policy-asset-management/business-requirements.md). Ratifies Phase 1 shippable scope; D-01–D-08 deferred. **P-01 partially discharged** — commercial rules (tier enum, populated `coverageLimits`, eligibility checks) still open pending `product-manager` sign-off. |
| `database-architect` | ~~Feature 004 collections live on Atlas + MP-6 provisioning proposal~~ **Done (2026-08-12)** — bootstrap applied; [`ADR-0008`](docs/organization/adr/0008-mongodb-schema-provisioning.md) **proposed** (pending `cto` ratification). |
| `cybersecurity-architect` + `security-engineer` | ~~P-14 stub + Stage 8~~ **Done (2026-08-12)** — [`field-sensitivity-review.md`](docs/features/004-policy-asset-management/field-sensitivity-review.md), [`security-review.md`](docs/features/004-policy-asset-management/security-review.md) with **security-engineer concurrence**. SR-004-1…5 remain tracked open items. |
| `backend-architect` | ~~**P-12** Mongo-outage failure mode~~ **Done (2026-08-12)** — `lib/mongo-errors.ts` + error-handler maps connectivity failures to `503 UPSTREAM_UNAVAILABLE`. |

**Wave 1 — build, once Wave 0's schema is on the cluster.**

| Role | Deliverable |
|---|---|
| `backend-engineer` | ~~The six customer endpoints (MP-1)~~ **Done** — six routes, repositories, bootstrap, **85 tests green**, Brevo-ready `transactional-email.ts` wired to auth + invitations. |
| `mobile-engineer` | ~~Replace placeholders~~ **Done** — real Policy/Assets screens, OpenAPI codegen, M-03 home with live counts, `gateWriteAction` on writes. |
| `ui-designer` + `ux-researcher` | ~~M-03 + asset registration~~ **Done (Phase 1 minimum)** — [`ui-design.md`](docs/features/004-policy-asset-management/ui-design.md), [`ux-research-notes.md`](docs/features/004-policy-asset-management/ux-research-notes.md). |
| `design-system-manager` | ~~Form primitives for eight-type form~~ **Done (bridge)** — `FormField`, `SelectChipGroup` in `mobile/src/theme/primitives/`; `RegisterAssetScreen` updated. List-row primitive + `expo-font` still deferred. |

**Wave 2 — gates. Neither Stage 8 nor Stage 10 is skippable, including under schedule pressure.**

| Role | Deliverable |
|---|---|
| `security-engineer` | ~~Feature 004 Stage 8 concurrence~~ **Done (2026-08-12)** — [`security-review.md`](docs/features/004-policy-asset-management/security-review.md). |
| `qa-architect` + `automation-qa-engineer` | ~~Stage 10 strategy + automation~~ **Substantially done** — [`qa-test-strategy.md`](docs/features/004-policy-asset-management/qa-test-strategy.md); backend list/detail cross-account tests; mobile screen tests (`PolicyList`, `AssetList`, `CreatePolicy`); `gateWriteAction.test.ts`; Maestro scaffold at `mobile/e2e/`. **E2E execution blocked on Brevo.** |
| `manual-qa-engineer` | ~~Checklist~~ **Filed** — [`manual-qa-checklist.md`](docs/features/004-policy-asset-management/manual-qa-checklist.md). **Execution on real device still pending** (owner + Brevo). |
| `devops-engineer` | ~~M-08 CI + Render~~ **Substantially done** — CI green; [`render.yaml`](render.yaml) + [`backend/docs/DEPLOY.md`](backend/docs/DEPLOY.md) (MP-8 staging guidance). **Live Render service not yet provisioned** (owner). |
| `technical-writer` | ~~README honesty~~ **Done (2026-08-12)** — `backend/README.md`, `mobile/README.md`, `HANDOFF.md` synced. |

### Blockers that no agent in this repo can clear — platform owner action required

These are the honest answer to "can we ship the real thing." Ordered by how hard they block.

1. **Brevo account + retention settings.** Backend is **code-ready** (`transactional-email.ts` wired to signup, resend, reset, invitations). Without `BREVO_API_KEY` + `EMAIL_FROM`, delivery remains dev stand-ins. **No real user can verify email → BR-2 gate → asset registration on a fresh account.**
2. **Supabase DPA execution.** Blocks real production identity data. Local dev and internal testing are unaffected; a public launch is not.
3. **Object-storage vendor decision (MP-5).** Blocks asset photos — deferred, not blocking this push's scope.
4. **App-store provisioning.** Bundle ID `co.za.tditsolutions.insurance` is a placeholder guess; icons are still Expo's defaults. [`mobile/docs/DEPLOY.md`](mobile/docs/DEPLOY.md) documents owner steps (`eas init`, Apple/Google accounts, env vars). Internal TestFlight/Play builds are unblocked on **code**; owner actions still required before any store-bound build.
5. **FU-A13 / FU-A14** remain open and unchanged by this push. FU-A13 (missing audit indexes, unscheduled retention purge) is not on this push's critical path because MP-1 excludes admin routes, but it stays open. FU-A14 (AUD-9's case reference with no case entity) blocks **GPS Phase 2**, which this push does not touch.

### Explicitly not in this push, so nobody builds it by accident

Admin policy/asset dashboards (MP-1) · plan selection, pricing, coverage-limit display (MP-3) ·
asset photo upload (MP-5) · policy/asset edit, cancel or delete (P-15 — never designed) ·
payments and checkout (no gateway selected) · GPS pairing, live map, theft reporting (Phase 2,
and FU-A14 blocks its Stage 1) · claims (no collection, no design) · push notifications (no
payload contract) · biometric app-unlock (M-06, still an open decision).

---

## Where to actually start

If continuing Feature 001 hardening: read `security-review.md`'s full required-changes list
and cross-check which are done (several are, as of the bug-fix pass above) vs. still open.

If starting Feature 004 for real: **read the "Mobile production push" section above first**.
Wave 0–2 agent deliverables are **substantially complete**. Critical path for internal distribution:
**Brevo** (owner) → manual QA on device → provision Render (`render.yaml`) → E2E against staging Mongo DB name (MP-8).

If picking up ADR-0006's AUD-3: **the shape decision and both trail designs are done** (ADR-0006 §16.1,
`recordBulkDisclosure()` on Trail A; addendum-001 Amendment A1 on Trail B). What's left is calling
the writer from the first admin list endpoint anyone builds. Read ADR-0006 §16 before touching any
of it — five rulings changed things §5's original text left open.

## Last session (2026-08-11, `cto`): ADR-0006 ratified and its Trail A work landed

Scope was deliberately narrow: close the ratification blocker, then implement the parts of it
that were blocked *on* the ratification.

- **`docs/organization/adr/0006-*.md`** — new §16 (`cto` ratification): rulings R-1 (AUD-3(b)
  shape: one row per disclosed subject + one call-scoped row), R-2 (FU-A9 pulled forward —
  `privilege_granted` closes RR-4 structurally), R-3 (take AUD-2's `CHECK` and extend it),
  R-4/R-5 (numbering, ADR-level classification). Every open condition from both concurrences
  dispositioned in a table at §16.4; three new follow-ups FU-A10…FU-A12. §13's last checkbox
  closed honestly; the `security-engineer` concurrence renumbered §14→§15.
- **`backend/migrations/032` + `033`** — FU-A1, explicitly additive to 031 (which added only
  `actor_account_id` and a differently-shaped index than AUD-8's runbook cites). **Applied**
  to the live Supabase project 2026-08-11. 033's header records the chosen AUD-3(b) shape;
  authoritative queries live in the AUD-8 runbook.
- **`backend/src/`** — FU-A3: `req.auditRequestId` (AUD-4/AUD-5); the audit writer extended
  with the AUD-1 join key plus `recordBulkDisclosure()`; guards mirroring 033's `CHECK`s; both
  live call sites updated (`invitations.ts` → `privilege_granted` + session id; `internal.ts` →
  `actor_service`, closing the unattributed-service-read gap). New tests in
  `repositories/audit-log.test.ts` and `middleware/error-handler.test.ts`.
- **`api-design.md` v1.3.0 (§11.F)** — carries R-1/R-2 into the contract; withdraws §11.E's
  "list call records the calling admin's own id" convention.
- **Honest caveat:** that session could not run `npm run typecheck`/`test` (no shell), so the
  code above is **written and reviewed, not executed**. First thing next session: run the
  backend test suite before anything else.

## This session (2026-08-11, continuation)

- **`docs/organization/runbooks/aud-8-privileged-access-reconstruction.md`** — FU-A4 discharged
  by `security-engineer`: both reconstruction directions, R-1 bulk shape, sitting grouping,
  RR-4 via `privilege_granted`. Document complete; production use blocked on FU-A11.
- **Migrations 032 + 033** — confirmed applied on the live Supabase project.
- **FU-A5 + C-16(a)(b)** — discharged earlier this session by `cybersecurity-architect`.
- **FU-A2** — discharged by `database-architect`: addendum-001 Amendment A1 complete (validator,
  indexes, retention, AUD-11 role split, §6/§7 handoff).

### `cto` verification pass, same session — what was checked and what it found

The four discharges above were **verified against the artifacts and the live database**, not
accepted as filed. All four hold. Two things that were *not* true turned up in the process:

- **`backend` tests actually run: 64 passing across 10 files** (60/9 before the admin-accounts
  route landed later in the session). The previous session's honest caveat ("written and
  reviewed, not executed") is now closed — that was the first thing it asked the next session
  to do.
- **AUD-3 acquired its first real caller mid-session.** `GET /v1/admin/accounts` exists, is
  mounted, and calls `recordBulkDisclosure()`. ADR-0006 §16.8's "no live bulk call site"
  statement is now stale — corrected at **§17.7**, which also disposes **C-14** onto this
  endpoint rather than leaving it filed against a Feature 004 gate the platform overtook.
- **ADR-0006 contained a factual error about Trail A indexes, now corrected on the live database.** §5 and §16.1 described `account_audit_log_account_id_created_at` as an *existing* index; it did not exist until migration `034` (FU-A13, applied 2026-08-11). Same for the purge-scan partial index. R-1's ruling survives; only its performance argument rested on the missing index, and that gap is closed.
  Corrected at **ADR-0006 §17.1**, filed as **FU-A13**, fixed in migration 033's header and the AUD-8 runbook's index list, and **applied** via `034_account_audit_log_subject_and_purge_indexes.sql`.
- **`app.purge_expired_audit_log()` exists but nothing calls it** — no `pg_cron`, no scheduler
  in the repo. `compliance-review-supabase.md` §407 calls this "automated-and-evidenced
  enforcement"; it currently is not. FU-A13's scheduling half remains open.
- **AUD-9's mandatory case reference has no case entity to point at** — filed as **FU-A14**
  (§17.3), with a ruling that a free-text purpose string is not an acceptable interim.
- **ADR-0006 §17 appended.** §16's ratification text is left exactly as signed; §17 corrects
  it alongside rather than editing the record, and adds the two follow-ups above.

**Not done, deliberately:** nothing was committed. Migration `034` was written by `database-architect` per §16.1 and **applied to live Supabase** in the follow-up session (2026-08-11); FU-A13's purge-scheduling and schema-check halves remain open.
- **`GET /v1/admin/accounts*`** — implemented with ADR-0006 bulk/detail audit (unblocks AUD-3 on Trail A).

## Follow-up session (2026-08-11): Wave 0 docs + EAS scaffold

- **[Minimal Stage 1 unblock](bec6a3ef-4a29-444e-a19d-7daaea560dd8)** — `business-requirements.md` (Stage 1 minimum, D-01–D-08 deferred, AC-1–AC-8) and `field-sensitivity-review.md` (P-14 Phase 1 stub). Unblocks mobile Wave 1 and partially discharges P-01/P-14; formal Stage 8 `security-review.md` and `product-manager` sign-off still open.
- **[EAS production config](be5edc20-7c7a-4ace-87be-3ce7a6631520)** — `eas.json` environment scoping, `mobile/docs/DEPLOY.md`, `.env.example` updates, README deployment section. M-08 scaffold done; GitHub Actions CI and Render deploy still open.
- **Backend Feature 004 customer routes** — [Feature 004 customer API](704d299d-2035-4bfc-9df5-a176a19ccf10): six endpoints, Mongo bootstrap at startup, 76 tests green.
- **Mobile Wave 1** — Policy/Assets screens wired to live API; OpenAPI codegen in place.
- **[Mongo collections bootstrap](c734196c-9969-4f80-b6a8-32428d01ba2d)** — `feature004-collections.ts`, CLI script, Atlas apply verified; startup path unified to same function.
- **[CTO mobile production push](ce3eaaee-9308-4337-b90c-ddf8d2cbe150)** — MP-1…MP-8 rulings in "Mobile production push" section.
