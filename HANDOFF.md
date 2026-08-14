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
  `/admin/accounts/:id`** — the platform's first `/admin/*` route. Feature 004 adds
  **`GET /v1/admin/policies*`**, **`GET /v1/admin/assets*`** (Trail B audit via `admin_access_log`).
  Recovery Phase 2 scaffold: **`POST/GET /v1/recovery/cases*`**, **`GET/PATCH/POST /v1/security/cases*`**.
  Feature 007 has landed its own routes on this same backend — see the new Feature 006/007
  entries below. **145 tests across 32 files, green as of 2026-08-13** (one combined backend
  suite spanning Features 001, 004, and Feature 007's shipped push/preferences code; up from the
  110+/21 figure this doc previously cited — re-verify with `cd backend && npm test` before
  trusting either number going forward).
- Mobile (`mobile/`): Expo app with matching auth screens, SecureStore token handling,
  device-ID binding on login *and* refresh. **Still only 30 tests passing (10 suites)** — unchanged
  since the mobile production push, despite the onboarding wizard, push-notification client, and
  plan-catalog API client landing since. No new mobile tests were added for any of that. Flagging
  this as a QA gap, not a documentation gap: `qa-architect`/`automation-qa-engineer` own closing it.
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
  (Amendment A1 discharges ADR-0006 FU-A2), `api-design.md` (**v1.1.0** — admin summary projections SR-004-admin-6), **`business-requirements.md`**
  (Stage 1 minimum — 2026-08-11, [Minimal Stage 1 unblock](bec6a3ef-4a29-444e-a19d-7daaea560dd8)), and
  **`field-sensitivity-review.md`** (P-14 Phase 1 stub — no field-level encryption for VIN/serial/`estimatedValue`).
- **Backend:** Customer routes in `policies.ts` / `assets.ts`; **admin routes** in `admin-policies.ts` / `admin-assets.ts` (summary list projections, rate limits SR-004-admin-5); **recovery routes** in `recovery.ts` / `security-cases.ts`. Mongo bootstrap:
  `backend/src/db/feature004-collections.ts`, `recovery-collections.ts` + `scripts/bootstrap-mongo-collections.ts`
  ([Mongo collections bootstrap](c734196c-9969-4f80-b6a8-32428d01ba2d) — applied to live
  Atlas `td-it-solution-insurance`, idempotent re-run verified). Startup path uses the same
  shared function via `mongo-bootstrap.ts`. Part of the combined **145 tests across 32 files**
  cited above (2026-08-13) — Feature 004 no longer has an isolated count worth quoting separately.
- **Web dashboards:** Shared privileged layer at `src/dashboard/`; Admin Panel at `/admin/*` (`src/admin/`); Security Company Dashboard at `/security/*` (`src/security/`). Architecture at `docs/features/005-admin-dashboard/architecture.md`. Stage 8 admin surface review at `security-review-admin-surface.md` — SR-004-admin-6 closed; SR-004-admin-2/4/5(d) still block real customer data.
- **Mobile:** Policy and Assets tabs are **real screens** wired to Feature 004 customer API
  (`PolicyListScreen`, `CreatePolicyScreen`, `AssetListScreen`, `RegisterAssetScreen`, detail
  routes); OpenAPI at `mobile/openapi/policy-asset-service.yaml` with codegen. Home (M-03) shows
  live policy/asset counts. **Stage 8 sign-off granted** (cybersecurity-architect + security-engineer
  concurrence, SR-004-1…5 open). **Stage 10:** strategy + checklist filed; unit/API tests green;
  E2E scaffold at `mobile/e2e/` — **execution blocked on Resend** (real email verification → BR-2;
  the vendor was Brevo when this line was first written, then changed to Resend — see the Feature 007/Resend items above).
- **Stage 1:** minimum viable `business-requirements.md` exists; **D-01–D-08 deferred** (tiers, pricing,
  coverage limits, eligibility, billing, cancel/refund, retention, claims). P-01 partially discharged for
  Phase 1; commercial rules still open. Pending `product-manager` sign-off (OQ-1–OQ-3).

**Feature 006 — Customer Registration & Onboarding (Web + Mobile).** New since the last
handoff; code shipped ahead of a formal Stage 7/8 disposition — read this before assuming it's
fully gated:
- **Web:** `/get-started` wizard (`src/pages/onboarding/CustomerOnboardingPage.tsx`), plus a
  customer login/signup entry on the landing page (`/login`, `/signup` → `CustomerLoginPage` /
  the same onboarding wizard) and a real post-login customer dashboard at `/dashboard`
  (`src/pages/customer/CustomerDashboardPage.tsx`, gated by `CustomerDashboardGate`). Steps:
  welcome → account type → create account/log in → verify email → choose plan → register
  assets → review → complete (honestly labelled "payment & activation pending").
- **Mobile:** `CustomerOnboardingScreen.tsx` mirrors the web flow. It briefly had an asset-photo
  step (`expo-image-picker`) mid-session on 2026-08-13, but a `product-manager` review caught
  that it requested live camera/photo-library OS permissions and then discarded the captured
  images — worse than MP-5's "no disabled camera affordance" rule, since a *working* capture
  flow with no destination asks for a sensitive permission under false pretenses. `mobile-engineer`
  removed the step the same session (`expo-image-picker` uninstalled, so it can't silently
  regress); neither the mobile nor the web wizard has a photo step today — MP-5 remains fully
  deferred on both surfaces, not just architecturally but in the actual UI.
- **Backend:** new public plan-catalog endpoint `GET /v1/plans/catalog` (unauthenticated, IP
  rate-limited, for the pre-signup marketing funnel) and `GET /v1/plans` (authenticated) —
  both backed by MongoDB `insurance_plan_catalog` via `ctx.planCatalog`. Admin editor:
  `GET /v1/admin/plans` + `PATCH /v1/admin/plans/:planId` (`admin-plans.ts`), Zod-validated,
  admin-only. Plans are `starter` (5 assets, R200/mo), `standard` (10 assets, R400/mo),
  `enterprise` (custom/quote-only — `PLAN_REQUIRES_QUOTE`, no self-serve checkout).
- **Paper trail:** `docs/features/006-customer-onboarding/` has `business-requirements.md`
  (**Status: Draft** — client-directed plan structure ratified for Phase 1; payment, photos,
  GPS assignment, full profile/KYC explicitly deferred with owners), `ui-design.md`,
  `ux-research-notes.md`. **No `security-review.md` exists yet for this feature** — Stage 8 has
  not formally run against code that is already live. See the placeholder note below.
- **Still explicitly not real:** payment/subscription activation, `pending_activation` →
  `active` transition (no payment webhook), GPS tracker assignment, phone OTP, full
  individual/business profile fields, KYC/ID verification, populated coverage limits, claims
  eligibility — all tracked as open items in `business-requirements.md` §7 with named owners.

**Feature 007 — Notifications & Communications.** New since the last handoff: a full planning
doc set **plus a partial real implementation**, not just paper. `docs/features/007-notifications/README.md`
carries its own honesty table — reproduced here so this doc doesn't drift from it:

| Capability | Status |
|---|---|
| Auth transactional email (signup, reset, invite, magic link, OTP) | **SHIPPED** — Supabase `auth-send-email` → Resend; branded templates in `supabase/functions/auth-send-email/` |
| Push token registration API (`PUT/DELETE /devices/push-token`) | **SHIPPED** — MongoDB `device_push_tokens`; customer-only |
| Notification preferences API (`GET/PATCH /notifications/preferences`) | **SHIPPED** — defaults per category; `theft_critical` push cannot self-disable |
| Mobile push registration (Expo token upload on app entry) | **SHIPPED** — `mobile/src/notifications/`; requires EAS `projectId` for a real token |
| Push delivery / event emitters | **PARTIAL** — Expo send adapter; theft case create + a test endpoint wired |
| SMS | **NOT BUILT** — vendor not selected |
| Notification service / event bus | **NOT BUILT** |
| Preference center UI | **NOT BUILT** — API only, no screen |
| Payment / GPS / claims / recovery notifications | **NOT BUILT** — upstream features incomplete |

  Master matrix, architecture, push spec, and email template catalogue are all filed under
  `docs/features/007-notifications/` — treat everything in that directory marked PLANNED or
  BLOCKED as design intent, not live behaviour. **No `security-review.md` or `compliance-review`
  sign-off exists for this feature beyond the design-time flags in
  `compliance-review-notifications.md` (explicitly "NOT legal sign-off").**

**Stage 8/10 status for Features 006 and 007 — pending concurrent review.** A `cybersecurity-architect`
pass and a `qa-architect` Stage 10 assessment were in flight for both features as of this
writing and had not landed. Check `docs/features/006-customer-onboarding/security-review.md`
and `docs/features/007-notifications/` for whether those exist yet before treating either
feature as Stage-8/10-clean — as of this snapshot, neither `security-review.md` file exists in
either feature's directory, meaning **both features have shipped code ahead of a formal Stage 8
gate**, which the org's own lifecycle treats as a hard-gate violation worth surfacing, not
quietly working around.

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
| **AUD-3**: bulk admin list endpoints don't record a per-subject audit entry | **Trail A: implemented** — `GET /v1/admin/accounts` calls `recordBulkDisclosure()`; `GET /v1/admin/accounts/{id}` calls `record()`. **Trail B: implemented** — `GET /v1/admin/policies*` / `GET /v1/admin/assets*` write to `admin_access_log` via `admin-access-log.ts` repo; bootstrap in `feature004-collections.ts`. Live Atlas verification (SR-004-admin-2) still pending. | Feature 004 admin routes **built**; C-14 purpose docs (SR-004-admin-4) and Atlas bootstrap verification still block real customer data |
| **~~ADR-0006 ratification~~** | **Done** — ratified 2026-08-11, §16. Remaining §16.5 conditions: ~~C-16(a)(b) folded into AUD-9~~ (done); ~~FU-A4 runbook document~~ (done — [`aud-8-privileged-access-reconstruction.md`](docs/organization/runbooks/aud-8-privileged-access-reconstruction.md); **executable use still blocked on FU-A11**); AUD-11 "checked" not "enforced" until FU-A10; C-13 closed before go-live | Ratification no longer blocking; FU-A11 blocks relying on the runbook |
| **~~Migrations 032 + 033 not applied~~** | **Applied** to the live Supabase project (2026-08-11), and **verified against its catalog** rather than taken on trust (`cto`, ADR-0006 §17.5): all four AUD-1 columns plus `result_count`, all four R-3 `CHECK`s, `account_audit_log_actor_created_at` with the right partial shape, 031's superseded actor index dropped, all three new enum values present. Both files' headers still read "NOT YET APPLIED" long after they were applied — **corrected in place**, since `.cursor/rules/database.mdc` makes the header, not a doc, the source of truth. **Residual:** the four constraints were added `NOT VALID` and have **not** been promoted; 033's verification block is `security-engineer`'s to run and there is no record of it having been run | No longer blocking deploy; constraint promotion still an open decision |
| **FU-A13 (new)** — Trail A indexes + purge scheduling | **Indexes applied** — migration `034` created `account_audit_log_account_id_created_at` and `account_audit_log_created_at` on the live Supabase project (2026-08-11, catalog-verified). **Still open:** purge scheduling (nothing calls `app.purge_expired_audit_log()`); deploy-time live-vs-design schema check (FU-A13 second half, shares FU-A10); 033's `NOT VALID` constraint promotion (`security-engineer`) | Subject-keyed AUD-8 query no longer seq-scans; retention still not enforced until scheduled |
| **FU-A14 (new)** — AUD-9's mandatory purpose/case reference has nothing to resolve against | **`recovery_cases` Mongo collection + API now exist** (`recovery.ts`, `security-cases.ts`) — partially addresses the "no case entity" gap for Security Dashboard reads. GPS location-access trail still needs full Stage 1 design and AUD-9 case-reference wiring on location endpoints | Blocks **GPS Phase 2** location-access trail completion; Security Dashboard case queue **unblocked at entity level** |
| **FU-A11 — investigative read credential** | Read-only credential scoped to both audit trails, for whoever executes the AUD-8 runbook (`cloud-infrastructure-architect` + `database-architect`, verified `security-engineer`) | Blocks *using* the runbook before first production privileged account (§16.5 item 2) |
| **Resend (auth email) + Supabase hook secrets** | Platform owner: Resend account, verify `tditsolutionsinsurance.co.za`, create API key, set Edge Function secrets (`RESEND_API_KEY`, `EMAIL_FROM`, `SEND_EMAIL_HOOK_SECRET`), enable Send Email Hook — see [`resend-setup.md`](docs/features/001-authentication/resend-setup.md). Code-side integration (Edge Function, templates, `transactional-email.ts`) is **built and unchanged since the last handoff**; nothing in this repo can confirm whether the owner has actually completed the Resend account/domain/secret steps (no secrets committed, correctly). **Treat as still owner-blocked until confirmed otherwise** — this is the same status the last handoff recorded, just now against Resend instead of the earlier Brevo recommendation (see `resend-setup.md` §7: "Resend replaces the earlier Brevo recommendation for this flow"). | Blocks real email delivery, which blocks real signup verification on both web (`/get-started`) and mobile — i.e. blocks Feature 006 end-to-end, not just Feature 001 |
| **Supabase dashboard Auth email-link TTLs, and "Confirm email" toggle** | Confirm/tighten in the Supabase dashboard directly — not reachable from application code. `authentication-engineer`'s 2026-08-13 BR-2 tightening (`sync-email-verification.ts`, closing a gap where `supabaseAuthSucceeded` could override an explicit `emailConfirmed: false` from GoTrue) narrows but does not remove this: the app has no independent way to verify the Supabase project's "Confirm email" setting is actually enabled, so email verification being mandatory is still ultimately a Supabase project-config assumption, not something this codebase can assert on its own | Compliance completeness (C-5.3); load-bearing assumption for BR-2 ("email must be verified" before a session is minted) — platform owner should confirm this toggle's state in the Supabase dashboard |
| **Object-storage vendor (MP-5)** | Still an open decision — `integration-architect` + `cloud-infrastructure-architect`, ADR-worthy, POPIA transborder-flow question attached. Neither onboarding wizard has an asset-photo step today (mobile's briefly did, mid-session on 2026-08-13, and was removed — see the Feature 006 bullet above; web never had one) — MP-5 is fully deferred in the UI, not just architecturally. | Blocks asset photo upload on both onboarding wizards and the existing Feature 004 asset forms |
| **Payment gateway selection** | Open decision (`integration-architect`). Feature 006's onboarding "Complete" step is explicit that payment/activation is pending; policies are created `status: pending_activation`, `billing.billingStatus: not_configured` | Blocks policy activation, plan enforcement, and any real subscription flow — onboarding can create a policy shell but never activate it |
| **GPS hardware vendor / Phase 2 ingestion** | Open decision (`integration-architect`). FU-A14's location-access audit trail still has no case-reference wiring to hang off of GPS endpoints that don't exist | Blocks GPS pairing, live map, and location-based recovery — recovery/claims mobile UI remains a stub against 404s |
| **Real integration test suite** | Automated tests against the live Supabase/Postgres/Mongo stack, beyond the manual smoke tests done so far | Not blocking, but the current test coverage is unit-level + one manual E2E pass |
| **Mobile test coverage has not kept pace with mobile feature growth** | `mobile/` is still 30 tests / 10 suites, unchanged since the mobile production push, despite the onboarding wizard, push-notification client, and plan-catalog client all landing since. None of that new code has test coverage | Not a hard blocker for internal distribution, but a real Stage 10 gap for whichever release this ships in |

## Mobile production push (2026-08-12, `cto`) — the current directive

**Goal as stated by the platform owner:** "Get the mobile app ready — not a demo, the real
thing." This section is the coordination record for that push: what it means concretely, what
each role owns, and what is honestly still in the way. It is a plan with a **partial execution record** — check the code before believing any line
below has landed. As of 2026-08-12: Wave 0–1 **done**; Wave 2 **substantially done** (Stage 8
concurrence, QA strategy, CI, Render blueprint, Maestro scaffold). **Remaining:** Resend secrets + hook (owner), manual QA on device, live Render deploy, MP-8 staging DB separation, E2E run.

### What "the real thing" actually means here, and what it can't mean yet

Today the mobile app is a real auth app with **live Policy and Assets tabs** wired to Feature 004's
customer API. The gap to "definition of done" is Wave 2 gates (Stage 8 formal concurrence, Stage 10
E2E) and **Resend** (real email verification). Two things adjacent to it are **not**, and this push does not
pretend otherwise:

- **Plan/tier selection.** Stage 1 `business-requirements.md` now exists and ratifies Phase 1
  scope without inventing tiers/pricing (D-01–D-04 deferred). MP-3 originally read: **no
  plan-picker, no pricing screen, no tier comparison UI** until commercial rules are ratified.
  **This has since been superseded, on the record, not silently worked around:** Feature 006's
  `business-requirements.md` explicitly "supersedes partially: Feature 004 `business-requirements.md`
  D-01 (tier catalog) for onboarding UX only" and ships a real plan-picker on both web and mobile
  (`starter`/`standard`/`enterprise`, prices read from `GET /v1/plans`, never hard-coded).
  What MP-3 was actually guarding against — invented pricing and a fake "purchase" — still holds:
  selecting a plan creates a `pending_activation` policy with `billingStatus: not_configured`,
  not a real subscription. Read this as the plan-picker constraint being formally lifted by a
  later, narrower ratification, not as a violation of the earlier one.
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
| `qa-architect` + `automation-qa-engineer` | ~~Stage 10 strategy + automation~~ **Substantially done** — [`qa-test-strategy.md`](docs/features/004-policy-asset-management/qa-test-strategy.md); backend list/detail cross-account tests; mobile screen tests (`PolicyList`, `AssetList`, `CreatePolicy`); `gateWriteAction.test.ts`; Maestro scaffold at `mobile/e2e/`. **E2E execution blocked on Resend** (this section originally said "Brevo" — the vendor changed to Resend after this table was written; see `resend-setup.md`). |
| `manual-qa-engineer` | ~~Checklist~~ **Filed** — [`manual-qa-checklist.md`](docs/features/004-policy-asset-management/manual-qa-checklist.md). **Execution on real device still pending** (owner + Resend). |
| `devops-engineer` | ~~M-08 CI + Render~~ **Substantially done** — CI green; [`render.yaml`](render.yaml) + [`backend/docs/DEPLOY.md`](backend/docs/DEPLOY.md) (MP-8 staging guidance). **Live Render service not yet provisioned** (owner). |
| `technical-writer` | ~~README honesty~~ **Done (2026-08-12)** — `backend/README.md`, `mobile/README.md`, `HANDOFF.md` synced. |

### Blockers that no agent in this repo can clear — platform owner action required

These are the honest answer to "can we ship the real thing." Ordered by how hard they block.

1. **Resend + Supabase Send Email Hook.** Auth mail is delivered by `auth-send-email` → Resend (not the Render API). Without `RESEND_API_KEY`, verified domain, and hook secrets, **no real user can verify email → BR-2 gate → asset registration on a fresh account.** Setup: [`resend-setup.md`](docs/features/001-authentication/resend-setup.md). **Still unconfirmed as of 2026-08-13** — code side is done, nothing in the repo can verify the owner's account/domain/secret steps.
2. **Supabase DPA execution.** Blocks real production identity data. Local dev and internal testing are unaffected; a public launch is not.
3. **Object-storage vendor decision (MP-5).** Blocks asset photos — deferred, not blocking this push's scope. **Still open as of 2026-08-13** — mobile's onboarding wizard (Feature 006) briefly had a photo-capture step mid-session and it was removed for requesting camera/photo-library permissions with nowhere to send the result (see the Feature 006 bullet above); the decision itself has not moved.
4. **App-store provisioning.** Bundle ID `co.za.tditsolutions.insurance` is a placeholder guess — still unresolved. **Icons and splash screens are no longer Expo defaults**, correcting what this line previously said: `mobile/assets/icon.png`, `splash-icon.png`, and the Android adaptive/monochrome icon set are the real TD IT Solution Insurance brand mark, and the web favicon/social-preview image (`public/logo.png`, `public/og-image.png`, wired into `index.html`) are also real. [`mobile/docs/DEPLOY.md`](mobile/docs/DEPLOY.md) documents remaining owner steps (`eas init`, Apple/Google accounts, env vars). Internal TestFlight/Play builds are unblocked on **code**; owner actions still required before any store-bound build.
5. **FU-A13 / FU-A14** remain open and unchanged by this push. FU-A13 (missing audit indexes, unscheduled retention purge) is not on this push's critical path because MP-1 excludes admin routes, but it stays open. FU-A14 (AUD-9's case reference with no case entity) blocks **GPS Phase 2**, which this push does not touch.

### Explicitly not in this push, so nobody builds it by accident

**This list is from the original 2026-08-12 mobile push and is preserved for the historical
record below; it is now partially stale — see the correction directly under it.**

Plan selection, pricing, coverage-limit display (MP-3) ·
asset photo upload (MP-5) · policy/asset edit, cancel or delete (P-15 — never designed) ·
payments and checkout (no gateway selected) · GPS pairing, live map (Phase 2 GPS ingestion not connected) ·
claims (no collection, no design) · push notifications (no
payload contract) · biometric app-unlock (M-06, still an open decision).

**Correction (2026-08-13):** two items on that list have since shipped, under later, narrower
rulings — not as scope creep on this push. **Plan selection** shipped as part of Feature 006
(see the MP-3 note above): real plan-picker, no real pricing/checkout behind it. **Push
notifications** shipped a real payload contract as part of Feature 007: token registration,
preferences API, and an Expo send adapter are live (see the Feature 007 table above); a full
notification service/event bus and most event sources (payments, GPS, claims) are still not
built. Everything else on the original list — photo upload, policy/asset edit/cancel/delete,
payments/checkout, GPS pairing/live map, claims, biometric unlock — remains genuinely not built.

**Built after the mobile push (2026-08-12 follow-on):** Admin Panel + Security Dashboard web surfaces; Feature 004 admin API; recovery case API scaffold; and, most recently, customer web auth + onboarding (Feature 006) and partial notifications (Feature 007) — see those sections above. Admin serving real customer data still blocked on SR-004-admin-2/4/5(d).

---

## Where to actually start

If continuing Feature 001 hardening: read `security-review.md`'s full required-changes list
and cross-check which are done (several are, as of the bug-fix pass above) vs. still open.

If starting Feature 004 for real: **read the "Mobile production push" section above first**.
Wave 0–2 agent deliverables are **substantially complete**. Critical path for internal distribution:
**Resend** (owner) → manual QA on device → provision Render (`render.yaml`) → E2E against staging Mongo DB name (MP-8).

If picking up ADR-0006's AUD-3: **the shape decision and both trail designs are done** (ADR-0006 §16.1,
`recordBulkDisclosure()` on Trail A; addendum-001 Amendment A1 on Trail B). What's left is calling
the writer from the first admin list endpoint anyone builds. Read ADR-0006 §16 before touching any
of it — five rulings changed things §5's original text left open.

If picking up Feature 006 or 007: **read the "Feature 006" and "Feature 007" entries under "What
actually exists and works right now" first**, then `docs/features/006-customer-onboarding/` and
`docs/features/007-notifications/README.md` directly — the latter's own honesty table is the
source of truth this doc copies from, so re-check it hasn't drifted further before trusting the
copy above. Neither feature has a `security-review.md` yet despite shipped code; that is the
single highest-priority gap for whoever picks this up next, ahead of any new feature work.

## Latest session (2026-08-13, `technical-writer`): HANDOFF sync after customer onboarding + notifications landed

This session did not write any product code — it verified and documented what a prior, larger
pull (195 files, commits `962ba25`..`c6a0e77`, landed after this file's 2026-08-12 snapshot) had
actually shipped, against the code, not against any planning doc's claims. Everything below was
checked directly; nothing here is taken on trust from a commit message or a doc header.

- **Customer web auth is real**, not a stub: `src/customer/auth/CustomerAuthProvider.tsx` wires
  Supabase login/signup/verify/reset; `/login`, `/signup`, `/get-started`, `/forgot-password`,
  `/auth/callback`, `/auth/email-verified`, `/reset-password` are live routes in `src/App.tsx`.
  A real post-login customer dashboard exists at `/dashboard`
  (`src/pages/customer/CustomerDashboardPage.tsx`), gated by `CustomerDashboardGate`.
- **A full onboarding wizard exists on both web (`/get-started`) and mobile**
  (`mobile/src/screens/onboarding/CustomerOnboardingScreen.tsx`), backed by a new public plan
  catalog (`GET /v1/plans/catalog`, `GET /v1/plans`) and an admin plan editor
  (`GET /v1/admin/plans`, `PATCH /v1/admin/plans/:planId`) — all confirmed directly in
  `backend/src/routes/plans.ts` and `admin-plans.ts`. See the new "Feature 006" entry above for
  what is and isn't real about it (mobile briefly had a photo-capture step and it was removed
  mid-session for requesting permissions with nowhere to send the result — MP-5 is the one worth
  remembering).
- **Feature 007 (Notifications) is a full planning doc set plus a genuinely partial
  implementation** — push token registration, notification preferences, an Expo push send
  adapter, and branded transactional email templates for the auth flows are shipped; SMS, an
  event bus, and a preference-center UI are not. `docs/features/007-notifications/README.md`'s
  own honesty table is reproduced above rather than re-described in different words, to avoid
  this doc and that one silently diverging.
- **Backend test count is 145 passing across 32 files** (re-verified against the actual test
  file listing in `backend/src/**/*.test.ts`, which counts to exactly 32) — up from the
  110+/21 and 85 figures this doc previously cited for different subsets of the same suite.
  **Mobile test count has not moved**: still 30 tests / 10 suites, meaning none of the onboarding
  wizard, push-notification client, or plan-catalog client shipped with test coverage. Flagged
  as an open item above, not silently absorbed into "substantially done."
- **Two things this doc previously listed as outstanding have actually shipped and were
  corrected in place rather than left stale:** the mobile app icon/splash/notification icon set
  and the web favicon/social-preview image are the real TD IT Solution Insurance brand mark, not
  Expo/Vite defaults (`mobile/assets/icon.png` et al.; `public/logo.png`, `public/og-image.png`).
  See the corrected item 4 under "Blockers that no agent in this repo can clear" above.
- **Stage 8/10 status for Features 006 and 007 is a genuine, currently-open gap, not a
  documentation oversight:** as of this writing, neither
  `docs/features/006-customer-onboarding/security-review.md` nor an equivalent file under
  `docs/features/007-notifications/` exists, despite both features having real, live code paths.
  A `cybersecurity-architect` Stage 8 pass and a `qa-architect` Stage 10 assessment for both
  features were reported in flight concurrently with this session but had not landed by the time
  this file was written. **Check both paths directly before assuming either has since closed** —
  this is exactly the kind of claim this role's standards require verifying in code, not copying
  from a hand-off note.
- **Terminology correction carried through this doc:** several places still said "Brevo" for the
  auth-email vendor; the actual vendor, confirmed in `docs/features/001-authentication/resend-setup.md`,
  is **Resend** ("Resend replaces the earlier Brevo recommendation for this flow"). Both terms now
  appear only where the "Brevo" wording is explicitly marked as the original, now-superseded text.
- **What was not attempted this session:** no attempt was made to confirm whether the platform
  owner has actually completed the Resend account/domain/secret setup, or the Supabase DPA, or
  either vendor decision (object storage, payment gateway) — none of those are checkable from the
  repository, and this session did not contact the owner. They remain listed as open exactly as
  handed off, not silently marked resolved.

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
