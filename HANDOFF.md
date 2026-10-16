# Project Handoff — TD IT Solution Insurance

**Last refreshed 2026-10-15** by `technical-writer` (full refresh; previous full rewrite was
2026-08-14). This is a single-author, point-in-time status snapshot — not a roadmap, not a gate
record. Where it disagrees with the code, **trust the code** and flag the discrepancy back to
`technical-writer`. Standing rules: root `CLAUDE.md`, `docs/organization/`, and
`.cursor/rules/00-house-rules.mdc`.

## How this refresh was done, and its limits — read before quoting anything

- **Method.** Read directly: `backend/src/routes/*` (every handler registration), `backend/src/index.ts`
  (mount order), `src/App.tsx` and the `src/admin|security|call-centre|invitations|dashboard` trees,
  `mobile/app/**`, `mobile/package.json`, `mobile/eas.json`, `mobile/app.json`,
  `mobile/src/config/features.ts`, `src/lib/features.ts`, `render.yaml`, `render-staging.yaml`,
  `docs/organization/{adr,incidents,cto-status,runbooks,gates}/`, the payment/GPS scorecards, and the
  header/status blocks of every `docs/features/*` folder.
- **Update, later 2026-10-15 (orchestrator, executed):** after the INC-003 remediation commits on
  this branch (through `93af9a8`), **backend 541/541 tests in 61 files** and **web 149/149 in 34
  files** pass, with `tsc --noEmit` clean for both. Mobile was **not** executed (no `node_modules`
  in the session); no mobile files changed in those commits. INC-003 status now lives in its
  §§12–19; ADR-0014 (A-21) is filed as **Proposed**. The note below is the original refresh
  author's, kept for audit.
- **No shell was available this session.** `npm test` was **not** run for backend, mobile, or web.
  **Test counts below are unverified.** What *was* counted (by file listing, not by execution):
  **58 backend test files** (`backend/src/**/*.test.ts`), **50 mobile test files**, **29 web test
  files** (`src/**/*.test.{ts,tsx}`). The last *executed* figure on record anywhere is
  **383/383 backend and 61/61 web** (INC-003 §6, A-4, 2026-09-23) — three weeks old; more tests
  have landed since (e.g. 18 demo-seed tests per ADR-0013's 2026-10-15 note). Re-run
  `cd backend && npm test`, `cd mobile && npm test`, and `npm test` at repo root before citing any
  number.
- **No git access.** I could not see what is committed vs. uncommitted, or commit dates. Nothing
  below distinguishes "in working tree" from "merged".
- **No console access** (Supabase, Render, Atlas, Vercel, EAS, Play Console). Every owner-gated item
  below is recorded as *not confirmed done*, not as *not done*.

---

## 1. Corrections to the previous HANDOFF (2026-08-14 snapshot) — now false

| Previous claim | Current truth (code-verified) |
|---|---|
| No web UI for staff invite-accept or MFA enrolment | **Built (Feature 017 D-1):** `src/invitations/InvitationAcceptPage.tsx` + `MfaEnrollmentStep.tsx`, routed publicly at `/invitations/accept` (`src/App.tsx:74`). Stage 8 manifest entry `web-invitations-accept` is a **waiver**, not a review — must be re-reviewed before real privileged-user exposure. |
| No web UI to *send* an invitation | **Built:** `src/admin/pages/InviteStaffPage.tsx` at `/admin/accounts/invite` (`AdminRoutes.tsx:62`). Has no Feature 017-specific Stage 8 record — it falls under the Feature 004 `web-admin-data-surface` glob (`/admin/{accounts,...}*`), and the 017 accept-waiver explicitly says it does not cover invite-send. `security_company_operator` invites remain blocked on the missing `partner_organizations` table (INC-003 §10 backlog). |
| `expo-location` and `expo-image-picker` absent from `mobile/package.json` | **Both present** (`mobile/package.json:18,20`). `expo-location` shipped past ADR-0009's prohibition — that is **INC-001**. `expo-image-picker` is used for **profile-picture** upload (`mobile/src/lib/prepareProfilePictureUpload.ts`), not asset photos. |
| Feature 008 "nothing implemented" | Location report/consent/read routes exist in `backend/src/routes/assets.ts` (see §3). Ingestion is **kill-switched** (`LOCATION_INGESTION_ENABLED`, fail-closed). See INC-001. |
| Privileged accounts have no forgot-password path | They do, via the unified `/login` — and it **bypassed SR-6 on web** (INC-003). Fixed in code (A-1/A-7 PASS); incident still open. |
| ADR "0010 is the next free number" | 0010 is **reserved** for the payment-gateway ratification (`payment-gateway-vendor-scorecard.md` line 4). Files on disk: 0001, 0002, 0003, 0006, 0008, 0009, 0011, 0012, 0013. **Next free unreserved number: 0014** (0004/0005/0007/0010 are reserved by name elsewhere). Re-verify before filing. |
| Backend "188 tests / 36 files" | Superseded (see limits above). |
| Admin suspend/deactivate endpoint missing (SR-007-11) | `PATCH /v1/admin/accounts/:id/state` exists and is now **step-up gated** (ADR-0012, SU-FU-1 landed 2026-10-02). INC-003 A-23 (suspension must reach GoTrue sessions) is still open. |
| No account-deletion path anywhere | A **request** path exists (web `/delete-account`, mobile `(auth)/delete-account*`) — **mailto only**, no erasure endpoint. See §4. |
| Resend never compliance-reviewed (C-006-3/C-007-2) | `docs/features/001-authentication/compliance-review-resend.md` (2026-09-10): **Approved with conditions, two blocking.** Read it before treating C-006-3/C-007-2 as closed. |
| Incidents, ADR-0011/12/13, Features 010–017 | Omitted entirely before. Now §5–§7. |

### Discrepancies in *other* docs found during this refresh (not edited here — flagged to owners)

1. **Root `CLAUDE.md` names `backend/src/routes/asset-location.ts`.** No such file exists. Only
   `asset-location.test.ts` exists; the location handlers live in `assets.ts` (L85–383). Owner of the
   CLAUDE.md section should correct it.
2. **Root `CLAUDE.md` says "backend + web are deployed via Render".** `render.yaml` deploys the
   **backend only** and says the web SPA is on **Vercel** per ADR-0003 (ADR-0003 §Decision item 4:
   "Frontend stays on Vercel"). `CORS_ALLOWED_ORIGINS` points at
   `td-it-solution-insurance-alpha.vercel.app`. Only the *staging* blueprint (`render-staging.yaml`,
   "not auto-wired") defines a Render static web service.
3. **`docs/features/009-customer-experience-redesign/README.md` still says "Implementation not
   started" (2026-08-14).** Large parts of Feature 009 are built (§3). Its own status line is stale;
   `product-manager` owns it.
4. **`docs/features/017-privileged-account-self-service/business-requirements.md` status says "two
   confirmed, never-built gaps".** Both are now built. Stage-status update belongs to its owners.
5. **`docs/organization/roadmap-release-gate-a.md` §1.1 still cites `co.za.tditsolutions.insurance`
   as the bundle ID to confirm.** The Play Console entry for `playInternal` is bound to the singular
   `co.za.tditsolution.insurance` (owner decision, `cto-status/2026-09-21-playinternal-package-decision.md`);
   `mobile/app.json` still carries the plural form for both iOS and Android. T-01 is unresolved and
   now spans three strings (plural, singular, and the `.internal`-suffixed one reported in
   `2026-09-21-status-and-dispatch.md` §8).

---

## 2. Infrastructure and environments

- **Backend:** Render web service `td-it-solution-insurance` (Frankfurt, free plan),
  `https://td-it-solution-insurance.onrender.com`, health check `/api/health/ready` (`render.yaml`).
  ADR-0003 Accepted. Whether the service is live and healthy right now is not checkable from here.
- **Web SPA:** Vercel (`td-it-solution-insurance-alpha.vercel.app`, per `render.yaml` CORS/redirect
  values and ADR-0003). `vercel.json` exists. **No CSP or `Referrer-Policy` on any host** (INC-003 A-15, open).
- **Identity:** Supabase Postgres (EU). **Domain:** MongoDB Atlas. Polyglot split per ADR-0002.
  Mongo provisioning per ADR-0008 (ratified, three conditions; catalog-vs-spec verification still
  described as *applied*, never *verified*).
- **Staging:** `render-staging.yaml` is a **blueprint document only** ("not auto-wired"), using a
  separate Mongo DB name `td_it_insurance_staging` on the same cluster. **No evidence a staging
  environment is provisioned** — T-27 (`cloud-infrastructure-architect`) asks exactly this. Treat
  local dev and any QA as running against the **production** project (MP-8 unchanged).
- **Auth email:** Supabase `auth-send-email` Edge Function → Resend. Code built. **Real delivery
  still unconfirmed** — and per `cto` (2026-09-21 §3 item 2), the Send Email Hook must not be
  enabled until CT-4a closes.
- **Production data:** `cto` recorded on 2026-10-13 (ADR-0013 Context) that production has **zero
  real customers and zero real recovery cases**. Not re-verified here.

### Mobile build profiles (`mobile/eas.json`) — note the development profile

| Profile | API base URL | Feature flags |
|---|---|---|
| `development` | **`https://td-it-solution-insurance.onrender.com` (production backend)** | **All seven `EXPO_PUBLIC_FEATURE_*` = `"true"`** |
| `preview`, `preview-simulator`, `production` | same prod URL | all seven `"false"` |
| `playInternal` (extends `preview`, AAB) | same prod URL | all seven `"false"`, forced by `cto` (INC-002 / INC-002-B) |

**The `development` profile turns on every gated surface — claims, location tracking, KYC, alerts,
theft reporting, hardware tracking, security-operator portal — against the production backend.**
`mobile/scripts/verify-eas-feature-flags.mjs` (the INC-002 CI guard) deliberately exempts the
`development` profile, so CI will not catch this. It is an internal dev-client profile
(`developmentClient: true, distribution: internal`), but anyone running it can drive location
consent, theft-report case creation, and KYC profile writes into the prod databases. Ingestion
itself stays off server-side unless `LOCATION_INGESTION_ENABLED` is exactly `"true"` on Render
(not in `render.yaml`; INC-002 §16.3(d) asked the owner to read the live value — unconfirmed).
Raise with `mobile-architect` / `cto` if a dev-client build is to be distributed to anyone.

Mobile flags fail **closed** on any EAS build when unset (`features.ts:22-28`, `EAS_BUILD_PROFILE`
check) and fail **open** in local `expo start`/Jest. Web's only flag,
`VITE_FEATURE_SECURITY_OPERATOR` (`src/lib/features.ts`), defaults **off**.

---

## 3. What is built — by surface (code-verified 2026-10-15)

### Backend API (`/api/v1`, `backend/src/routes/`, mounted in `backend/src/index.ts:136-162`)

| Area | Routes | Notes |
|---|---|---|
| Auth (F001) | `POST /auth/{signup,verify-email,resend-verification,notify-email-verified,supabase/exchange,login,mfa/challenge}`, `POST /auth/reset-password/{request,confirm,mfa-verify}` | SR-6 correct on backend. `/auth/supabase/exchange` is slated for retirement (INC-003 A-21). |
| Session / MFA / step-up | `POST /session/{logout,logout-all,refresh}`, `GET /account/me`, `POST /mfa/enroll`, `/mfa/enroll/verify`, `POST /auth/mfa/step-up/{challenge,verify}` | Step-up per ADR-0012; consumed by `admin-accounts`, `admin-plans`, `admin-verification`, `invitations`. Web `StepUpDialog.tsx`. |
| Invitations (F001/F017) | `POST /invitations`, `GET /invitations/:token`, `POST /invitations/:token/accept` | Accept redirect is the web route (`INVITATION_ACCEPT_REDIRECT_URL`). |
| Admin accounts | `GET /admin/accounts`, `/admin/accounts/customers/count`, `/admin/accounts/:id`, `PATCH /admin/accounts/:id/state` | Trail A audit (ADR-0006). |
| Policies / assets (F004) | `POST/GET /policies`, `GET /policies/:id`, **`PATCH /policies/:id/plan`**; `POST/GET /assets`, `GET/PATCH/DELETE /assets/:id` | Plan change is a policy-record change only — **no billing behind it**. Asset edit/delete now exist (were "never designed" under P-15 in August). |
| Admin policies / assets | `GET /admin/policies`, `/count`, `/:id`; `GET /admin/assets`, `/count`, `/:id` | Trail B (`admin_access_log`). Admin asset detail can read pre-containment coordinates (INC-001 §2). |
| Plans (F006) | `GET /plans/catalog` (public), `GET /plans`, `GET /admin/plans`, `PATCH /admin/plans/:planId` | Essential/Plus/Pro/Business per `pricing-model-v2.md`. |
| Subscription | `GET /subscription` | **Read-only snapshot** (plan, usage, entitlements) built from the policy record. No billing. |
| Internal | `GET /internal/accounts/:id/status`, `POST /internal/policies/:id/activate` | `activate` is the **POL-002 hook a payment gateway would call** — exists, service-key auth, no caller (no gateway). |
| Location (F008 / INC-001) | `GET /assets/location-summary`, `POST /assets/:id/location-report`, `POST /assets/:id/location-consent`, `DELETE /assets/:id/location`, `GET /assets/:id/location`, `GET /assets/:id/location-history` | All in `assets.ts`. Write path kill-switched and fail-closed. Consent log is **written** but **not checked** before accepting a report (INC-001 §10, A-7 half-built). |
| Tracking devices (F009 Ph4) | `GET /tracking/installation-guide`, `POST /tracking-devices/register`, `POST /assets/:id/tracking-devices/link`, `GET /assets/:id/tracking-profile` | Capability-gated via `lib/tracking-profile.ts`; hardware capabilities report "pending" — **no GPS vendor**. |
| Recovery (F009/F011) | `POST/GET /recovery/cases`, `GET /recovery/cases/:id`, `PATCH /recovery/cases/:id/police-report`, `GET /recovery/cases/:id/location` | SAPS case-number capture (Feature 011). |
| Security cases | `GET /security/cases`, `/count`, `/:id`, `POST /:id/claim`, `PATCH /:id` | Always live server-side (role + partner-org JWT). No partner registry exists. |
| Support / call centre (F010) | `POST/GET /support-cases`, `/count`, `/:id`, `POST /:id/notes`, `PATCH /:id/status`; `GET /support/customer-lookup`, `POST /support/recovery-cases/:id/notes` | `scope=all` on the list was **withheld** at Stage 8. |
| Customer profile / KYC | `GET/PATCH /account/profile`, `POST /account/profile/verification/submit`, `PUT/GET/DELETE /account/profile/picture`; admin `GET /admin/verification-requests`, `/count`, `GET /admin/accounts/:id/profile`, `PATCH /admin/accounts/:id/profile/verification` | **Manual review queue.** Only last 4 digits of SA ID stored (CT-11). Profile pictures stored as Mongo `Binary` (512 KB cap) — **not** object storage. |
| Notifications (F007) | `PUT/DELETE /devices/push-token`, `GET/PATCH /notifications/preferences`, `POST /notifications/test` | Expo push adapter; no event bus, no SMS. |
| Alerts | `GET /alerts`, `PATCH /alerts/:id` | |
| Analytics | `POST /analytics/events`, `GET /admin/analytics/dau` | North-star DAU instrumentation. |
| Health | `/api/health*` | |

**No route exists for:** claims, payments/billing/checkout, payment webhooks, account erasure, SMS,
GPS-vendor ingestion, partner-organisation registry, household members.

Scripts of note: `backend/scripts/bootstrap-mongo-collections.ts`; `seed-test-accounts.ts`
(**fixed passwords, privileged accounts without MFA — local/staging only, never production**, per
ADR-0013); `seed-demo-security-dashboard.ts` (ADR-0013 item 1, with `--teardown`; not authorised to
run against production — ADR-0013 is Proposed).

### Web (`src/`, Vite/React)

- **Public:** `/` landing, `/privacy`, `/terms`, `/delete-account` (mailto request page),
  `/invitations/accept` (F017).
- **Customer:** `/login` (**unified login for all four user types** — ADR-0011 risk acceptance),
  `/get-started`, `/signup`, `/forgot-password`, `/auth/callback`, `/auth/email-verified`,
  `/reset-password` (now routes through the backend — INC-003 fix), `/account`, and the gated
  `/dashboard{,/plan,/map,/account,/profile,/verification,/alerts,/notifications}`. The `/dashboard*`
  group is a Stage 8 **waiver**, not a review.
- **Admin Panel** `/admin/*`: home, customers, staff, invite staff, account detail, policies, assets,
  plans editor, analytics, verification queue/review.
- **Security Company Dashboard** `/security/*`: home, case queue/detail — **behind
  `VITE_FEATURE_SECURITY_OPERATOR` (off by default)**.
- **Call Centre Dashboard** `/call-centre/*` (Feature 010): home, customer lookup, support cases
  list/detail/new.
- Shared privileged layer `src/dashboard/` incl. the Feature 012 cross-role `HomeScreen.tsx`.
- The browser ships `@supabase/supabase-js` and the published anon key — the trust boundary INC-003
  A-5 threat-modelled; A-21 (ADR to remove it) is open.

### Mobile (`mobile/app/`, Expo Router)

- **Always on:** auth (welcome/intro/login/signup/verify/forgot/reset/MFA challenge/terms/privacy/
  delete-account request), onboarding, tabs (home, assets list/register/detail, account hub/profile),
  policy list/create/detail/**change-plan**, notification preferences, MFA enrol, invitation accept.
- **Behind flags (all `false` in every distributable profile):** claims `(app)/claims/*`
  (`FEATURE_CLAIMS` — **UI only, no backend**; renders `ClaimsComingSoonScreen` when off),
  map/device-locations/live-tracking (`LOCATION_TRACKING`), verification/KYC (`KYC`), alerts tab
  (`ALERTS`), report-theft (`THEFT_REPORTING`), activate-tracker/device-health/installation-guide
  (`HARDWARE_TRACKING`), `(security-app)/` operator portal (`SECURITY_OPERATOR`).
- Offline tolerance (React Query persistence, NetInfo) landed early October (INC-001 §10 cites
  commits `d8ed4b1`…`c7ba6dd`).
- Brand icons/splash are real (not Expo defaults). EAS `projectId` is set in `app.json`.

---

## 4. Stubbed, partial, or honestly not real

| Capability | Actual state |
|---|---|
| **Claims** | Mobile UI exists (`app/(app)/claims/index|new|[id]`), flag-gated off. **No backend route, no collection.** In a `development` build it would call endpoints that 404. |
| **Payments / billing** | **Not built.** `subscription.ts` is a read-only snapshot. Policies are created `pending_activation` / `billingStatus: not_configured`. `POST /internal/policies/:id/activate` is a hook with no caller. Plan change (`PATCH /policies/:id/plan`) changes the record only. |
| **Account deletion** | **Request flow only.** Web `/delete-account` and mobile `delete-account` → `delete-account-confirm` open a prefilled `mailto:` to the company inbox. **No erasure endpoint** (the only `router.delete` in `customer-profile.ts` is the profile picture). Fulfilment runbook `docs/organization/runbooks/account-deletion-request-runbook.md` is "Written. Partially executable." Feature 015 (real erasure) is Stage 1 and **cannot pass Stage 8 until Client instructions G-3/G-9 exist**. |
| **KYC / identity verification** | **Manual queue.** Customer self-attests profile + last-4 of SA ID; admin reviews in `/admin/verification`. No document capture, no vendor check, no gating of asset creation (`KYC_VERIFICATION_REQUIRED` does not exist in code yet). Mobile KYC surface is flag-off. Feature 013/016 own the real thing. |
| **Location tracking** | Phone self-device only; ingestion kill-switched in production (INC-001); consent enforcement not wired (A-7). Live tracking screens are honest placeholders. |
| **GPS hardware** | Provider-agnostic registration/link/profile routes; every hardware capability reports "pending". No vendor. |
| **Asset photos (MP-5)** | Not built. No object storage. (Profile pictures exist, stored in Mongo — not a precedent for asset photos or KYC documents.) |
| **Push / notifications** | Token registration, preferences, Expo send adapter, theft-case + test emitters. No event bus, no SMS. |
| **Email delivery** | Code built; real delivery unconfirmed (owner). |
| **Security partner integration** | Dashboard + API exist; no partner registry (`partner_organizations` table missing), no dispatch-model decision (G-7), no signed partner agreement. |
| **Household sharing (F014)** | Stage 1 only, blocked on owner clarification §0.3. Nothing built. |
| **Staging** | Blueprint only (see §2). |

---

## 5. Open incidents

| ID | Title | Status (as last recorded) | What keeps it open |
|---|---|---|---|
| **INC-001** (2026-08-25, chair `cybersecurity-architect`) | Location ingestion shipped past ADR-0009's explicit prohibition | **CONTAINED, not closed.** Server kill switch live; client flag off. | A-7 (server-side consent enforcement — consent log exists but isn't read by the report handler), SDL-1/8/9 gaps, pre-containment coordinates still readable by owner and admins (compliance decision), C-1/C-3 POPIA conditions open, **Release Gate A criterion 6 WITHHELD** (§9.4). |
| **INC-002** (2026-09-21, chair `cto`) | Location capture re-enabled in a live Play internal-testing build | **HALT ISSUED — awaiting owner action in Play Console.** | §16.3 owner console session (export evidence, deactivate release, read live `LOCATION_INGESTION_ENABLED`, Atlas inventory), C-1…C-8 conditions, s22 determination (C-6). ALERTS family's Stage 8 was returned clean (§14), but the flag is still `"false"` in every distributable profile. **INC-002-X-1:** Google Play requires a verified **Organization** developer account for insurance apps — D-U-N-S + business verification; **no upload to any track** until done. THEFT_REPORTING/SECURITY_OPERATOR waiver holds remain. |
| **INC-003** (2026-09-23, chair `cybersecurity-architect`) | Web password reset bypassed SR-6 MFA gate, session revocation, backend password policy | **OPEN, P0.** Code fix landed and verified (A-1, A-2, A-4, A-7 PASS); A-5 threat model filed 2026-10-02 (`INC-003-A5-browser-supabase-sdk-threat-model.md`). | **A-6** (prod Supabase auth-log check for prior exploitation — owner console, overdue, P0), **A-3** (Supabase min password length 14 + leaked-password protection — config declared, not applied), redirect allow-listing, and **A-8…A-23** (16 actions, 9 High — incl. A-10 session-lifecycle coupling, A-13 login CSRF at `/auth/callback`, A-21 ADR to remove browser `supabase-js`). Several due dates (10-06…10-16) have passed or are imminent; I could not verify closures. **Another agent is appending to this record now — read it directly.** A possible INC-004 (session-lifecycle coupling) was recommended in §11; no INC-004 file exists. |

---

## 6. ADR register (files on disk)

| ADR | Subject | Status |
|---|---|---|
| 0001 | Baseline architecture & stack | Accepted |
| 0002 | Supabase identity / MongoDB domain | Accepted |
| 0003 | Backend on Render (frontend stays on Vercel) | Accepted 2026-08-07 |
| 0006 | Privileged-access audit trails, join key | Ratified 2026-08-11 (§16), corrected §17; FU-A11/FU-A13 halves still open |
| 0008 | MongoDB schema provisioning | Ratified 2026-08-24, three conditions |
| 0009 | Self-asserted location trust boundary (SDL-1…12) | Ratified conditionally 2026-08-24; §15 `security-engineer` concurrence (T-23) still unfiled as of last record; §18 append-only correction after INC-001 |
| 0011 | Marketing-origin privileged login — risk acceptance (R-LU-3) | Accepted 2026-09-09; **review date 2026-10-09 has passed** — no review recorded that I found |
| 0012 | Step-up authentication for privileged actions | Accepted 2026-09-23; SU-FU-1 implemented 2026-10-02 (§9); C-4/C-5 open (block F017 D-2 Stage 8) |
| 0013 | Security Dashboard client demo — time-boxed exception | **Proposed — NOT authorised.** Needs the business owner's present, explicit go/no-go; `cto` refused to authorise autonomously (2026-10-13). Demo seed + teardown built (2026-10-15 note); open `admin_access_log` teardown gap (AUD-11) for `database-architect`. |
| 0014 | Web identity through backend only — remove browser supabase-js, retire exchange and published anon key (INC-003 A-21) | **Proposed** 2026-10-15; `cybersecurity-architect` concurred with conditions (INC-003 §19.4); awaiting `authentication-engineer` / `compliance-specialist` concurrence and `cto` ratification. |

Reserved, no file: 0004, 0005, 0007 (FU-08 third persistence surface), **0010 (payment gateway — do not open until a sub-review artefact lands, `cto` §9 of the scorecard)**. A-21 (remove browser supabase-js) is now ADR-0014 (Proposed). Next free number: 0015.

---

## 7. Feature lifecycle status

Stage numbers per `02-feature-lifecycle.md`. "Built" means code exists in the tree; it does not
imply any gate passed.

| # | Feature | Built? | Gate status (from the feature's own records) |
|---|---|---|---|
| 001 | Authentication | Yes (web + mobile + backend) | Stage 8 granted with 25 changes (applied). Login-unification review conditional (SR-LU-1…4 fixed; SR-LU-5/6 open; R-LU-3 → ADR-0011). INC-003 open against it. |
| 002 | Landing page | Yes | Design docs only; static. |
| 003 | Mobile app foundation | Yes | Architecture doc; §6: no public store release until Phase 1 complete. |
| 004 | Policy / asset management | Yes (customer + admin) | Stage 8 granted (SR-004-1…5 open); admin surface review: SR-004-admin-2/4/5(d) still block real customer data. Stage 10 strategy filed; device QA (T-03) never executed. Stage 1 D-01…D-08 deferred. |
| 005 | Admin dashboard | Yes | Architecture doc. |
| 006 | Customer onboarding | Yes | Stage 8 granted with changes; compliance concurrence in part (C-006-1 Supabase DPA, C-006-4 RoPA). SR-006-3…13 open. |
| 007 | Notifications | Partial | Stage 8 granted with changes; SR-007-3…10 open; compliance in part. |
| 008 | Self-device GPS | **Partially built against a prohibition** | Never passed Stage 8 → INC-001. Kill-switched. |
| 009 | Customer experience redesign | Largely built (home, map, alerts, theft report, tracking-device screens, security ops) | Security Operations slice: three-role Stage 8 **CONDITIONAL** (code-correctness only, not real-data clearance). Most other surfaces flag-off under INC-001 A-12 / INC-002-B waivers. README status line is stale (see §1). |
| 010 | Call centre dashboard | Yes (FR-11–17 scope) | Stage 8 conditional; `scope=all` withheld; FR-18–21 blocked at Stage 1; compliance and security-engineer concurrence partial. Contract sequences it after Gate A. |
| 011 | SAPS case reporting | Yes (police-report on recovery cases) | Stage 8 **not discharged** — concurrence withheld in part; no real-customer-data environment until SR-011-1/4/6 close (SR-011-1 satisfied; SR-011-4, SR-011-6 open as of 2026-09-08). |
| 012 | Employee dashboard (shared staff home) | Yes | Stages 1–10 closed (Stage 8 conditional, Stage 10 PASS WITH FINDINGS). `cto-review.md`: production-ready, three reported-closed items weren't (incl. Stage 6 index verification). |
| 013 | SA ID verification | Tier 1 checksum logic exists (`sa-id-number` libs on web/mobile) | Stage 1 draft; compliance review: Tier 1 conditionally clearable, Tiers 2/3 **blocked** at Stage 8. |
| 014 | Household member sharing | No | Stage 1, blocked on owner clarification (§0.3). |
| 015 | Account deletion / erasure | Request (mailto) only | Stage 1 draft; cannot pass Stage 8 until Client instructions G-3/G-9. |
| 016 | KYC identity verification | No (gating layer not built) | Stage 1 + `product-manager` scope decision 2026-09-21: Tier 1 data-only increment, no documents, build behind a flag. |
| 017 | Privileged account self-service | **Yes — D-1 accept/MFA and invite-send UI** | Stage 1 BR + architecture scope note + UI design (draft). Accept route Stage 8 **waived pending review**; invite-send has no 017 Stage 8 record; D-2 Stage 8 blocked on ADR-0012 C-4/C-5; operator invites blocked on `partner_organizations`. |

---

## 8. Open decisions

| Decision | Owner | State |
|---|---|---|
| **Payment gateway** | `integration-architect`; ratification `cto` + `solution-architect` (ADR-0010) | Owner steer 2026-09-21: pursue **PayFast and Ozow in parallel** — explicitly *not* a selection. Neither scored on C1–C8. Sub-reviews (POPIA per vendor, PCI/hosted-fields, sandbox trial) had **zero artefacts** at last record and none are on disk now. Proposed 2026-10-09/10-16 dates were **not ratified** by `cto`; preconditions (sandbox access for both; Ozow's card-rail partner named) were due 2026-09-28, outcome not recorded. No merchant credentials in any environment; any production billing work before sub-reviews needs a written `cto` security exception. CT-4c (sub-operator authorisation) sits upstream. |
| **GPS hardware vendor** | `integration-architect` | Scorecard "in progress", no vendor (last updated 2026-08-28). |
| **Object storage (MP-5)** | `integration-architect` + `cloud-infrastructure-architect` | Open. Blocks asset photos and any KYC document capture (plus the KMS/field-level-encryption gap KYC-R-4). |
| **KYC / ID-verification vendor** | `integration-architect` | New open vendor decision, deliberately sequenced behind payments. |
| **ADR-0013 demo exception** | Business owner | Pending in-person go/no-go. |
| **Partner registry / dispatch model** (PDM-6, G-7) | `product-manager` sponsor, `database-architect`/`solution-architect` | Required before any real pilot partner; needs its own ADR. |
| **Bundle / package ID (T-01)** | Owner | Three spellings in play (see §1, item 5). Android `applicationId` is a one-way door. |
| **Biometric app-unlock (M-06)** | — | Still open. |

---

## 9. Owner-gated blockers — no agent can clear these

Ordered roughly by how hard they block. None is confirmed done from this repository.

1. **One Supabase console session** (INC-003 §10 P0): A-6 auth-log check, A-3 password floor 14 +
   leaked-password protection, web reset redirect allow-list, A-22 live-config verification, A-8/A-18
   interim GoTrue settings.
2. **Play Console session** (INC-002 §16.3): export tester list/installs/Data-safety form, deactivate
   the internal release, then **Organization account verification (D-U-N-S)** — INC-002-X-1.
3. **Render / Atlas read access**: live `LOCATION_INGESTION_ENABLED` value; INC-002 D-4 inventory;
   T-25a credentials (Render read-only key, Atlas, Supabase dashboard).
4. **Supabase DPA** execution. Also **Render DPA** unexecuted (CT-13); Atlas region unconfirmed (CT-2);
   CT-1 cross-border consent sent 2026-09-14, not confirmed in required form.
5. **Resend** account/domain/secrets, **after** CT-4a; then a real-inbox verification-email test
   (Gate A item 2).
6. **T-01** bundle/package ID ruling; Apple/Google accounts; `eas submit` placeholders in `eas.json`
   (`SET_IN_EAS_SUBMIT_OR_APP_STORE_CONNECT` etc.) still unfilled.
7. **T-25b** admin-capable dev environment (Android SDK/emulator or device with `adb`) — critical path
   for Gate A criterion 6's artefact leg.
8. **T-03** device QA pass by a human with a phone.
9. **Client instructions** G-3 (retention) and G-9 (deletion) — block Feature 015 Stage 8.
10. **ADR-0013** go/no-go, if the Security Dashboard demo is still wanted.
11. Payment-gateway sandbox/merchant applications for PayFast and Ozow.

**Release Gate A is not closed.** Criterion 6 is withheld (INC-001 §9.4); items 1–3 are owner-gated;
INC-002-X-1 blocks any upload regardless.

---

## 10. Compliance floor for real customer PII — still not met

Supabase DPA unsigned · Resend operator review approved **with two blocking conditions** (and C-R-9,
consumer-webmail contact in `email-footer.ts`) · **no platform RoPA document** (only draft entries,
e.g. `location_consent_events` in `10-data-protection-contract-obligations.md`) · Render DPA
unexecuted · Atlas region unconfirmed · INC-001/002/003 compliance determinations provisional.
Per `north-star-2000-dau.md` M1 these must all clear before real customer PII.

---

## 11. Local dev / demo environment

- `.env.local` (repo root) and `mobile/.env` are gitignored and hold **real** credentials for the
  live Supabase project and Atlas cluster. The owner chose not to rotate them after they appeared in
  a chat transcript — a standing decision, not an oversight.
- There is no non-prod database project. Local dev, any `development` EAS build, and QA all touch the
  live project unless a separate `MONGODB_DB_NAME` is set. Treat writes accordingly.
- `backend/docs/TEST-ACCOUNTS.md` and `seed-test-accounts.ts` are for local/staging only.
- Deploy docs: `docs/DEPLOY.md`, `backend/docs/DEPLOY.md`, `mobile/docs/DEPLOY.md`.

---

## 12. Where to start

- **Anything auth/web-session:** read `INC-003-web-password-reset-control-bypass.md` §6 and §11 and
  the A-5 threat model first. A-10, A-13, A-21, A-23 are the High items with code work.
- **Anything location/tracking:** INC-001 §8–§10 and ADR-0009 in full. Do not set
  `LOCATION_INGESTION_ENABLED=true`; do not flip any mobile flag in a distributable profile —
  `verify-eas-feature-flags.mjs` will fail CI, and the waivers' premises depend on it.
- **Payments:** `payment-gateway-vendor-scorecard.md` §7–§9. Nothing gets built against a vendor
  SDK as final until ADR-0010 exists.
- **KYC:** `product-scope-decision.md` (Feature 016) and Feature 013's compliance review.
- **Deletion:** the runbook and Feature 015 §0 — do not build an erasure endpoint ahead of F-4's
  process and G-3/G-9.
- **Latest `cto` status file:** `docs/organization/cto-status/2026-09-21-status-and-dispatch.md`
  (no later status file exists; later rulings live inside INC-002 §16, INC-003 §10, and ADR-0013).
- **First thing next session with a shell:** run all three test suites and record the counts here.

---

## Appendix A — Standing rulings from the 2026-08-12 mobile production push (still cited elsewhere)

| ID | Ruling (condensed; full text in git history of this file) |
|---|---|
| MP-1 | Customer surface only for that push. (Admin routes were later built under their own Stage 8.) |
| MP-2 | `cto` stood in for `solution-architect` at Stage 7 for Feature 004's customer surface. |
| MP-3 | No invented business rules. Plan-picker later lifted by Feature 006's narrower ratification; still no real pricing/checkout behind it. |
| MP-4 | Stage 8 is a hard gate. |
| MP-5 | Photo upload deferred on a **missing vendor decision**; no disabled camera affordances. Still open. |
| MP-6 | Mongo provisioning via shared bootstrap; ADR-0008 conditions bind all collection-spec modules. |
| MP-7 | Every new endpoint carries an explicit rate limiter (`createRateLimiter`). |
| MP-8 | No QA/load testing against production data; real staging required before go-live. Still unmet. |

## Appendix B — Precedents worth knowing

- **Deferred-takeover pattern** for cross-account credential collisions
  (`backend/src/lib/push-token-takeover.ts`, SR-007-2) — the template for future collision handling.
- **SDL-2** (ADR-0009): a self-asserted signal may never alone drive dispatch, claims, billing, or
  partner disclosure. Binding on all future self-reported telemetry.
- **"A completion report is not evidence"** — INC-001's root cause; the stage8 manifest + CI-1 scanner
  exist because prose prohibitions did not stop shipping. A manifest *waiver* is not a review.
- **Append-only shared documents** (root `CLAUDE.md`, adopted 2026-09-10).
- Earlier real defects fixed (Aug 2026): client-supplied account ID in MFA enrolment, unpersisted
  forced-re-enrolment ticket, missing device ID on mobile refresh, 7-day invite TTL vs 72-hour
  ceiling, single-subject audit row (migration 031).

## Appendix C — Prior session logs

The 2026-08-11 → 2026-08-14 session logs that previously made up the second half of this file
(ADR-0006 ratification, migrations 031–034, Wave 0–2 execution, Feature 006/007 Stage 8 rounds,
Feature 008 design package) are superseded by the sections above and remain available in this
file's git history. Their still-open residuals are carried forward: FU-A11 (investigative read
credential), FU-A13 purge scheduling (`app.purge_expired_audit_log()` has no caller) and 033's
`NOT VALID` constraint promotion, and the Supabase "Confirm email" toggle being a project-config
assumption the code cannot assert. (SD-FU-05 — no audit trail on partner-operator reads — appears
addressed in code: `security-cases.ts` now calls `adminAccessLog.recordCaseBulkDisclosure` /
`recordDetail` / `recordStateChange`; I did not find a recorded formal closure.)
