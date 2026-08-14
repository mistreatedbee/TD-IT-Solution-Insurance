# Feature 006 — QA Test Strategy (Stage 10)

**Lifecycle stage:** 10 — QA Testing
**Owner (A):** `qa-architect`
**Contributors:** `automation-qa-engineer`, `manual-qa-engineer`
**Status:** **Filed retroactively — code landed ahead of a Stage 10 strategy.** This document
records the coverage that exists today, the gaps found on audit, and the exit criteria still
outstanding. It does not certify the feature as tested; see §6.
**Related:** [`business-requirements.md`](./business-requirements.md) FR-P1–FR-P3, AC-O1–AC-O6,
[`004/qa-test-strategy.md`](../004-policy-asset-management/qa-test-strategy.md) (this feature
reuses Feature 004's asset/policy write paths and RBAC posture),
[`007-notifications/README.md`](../007-notifications/README.md) (push token registration
overlaps this onboarding flow)

---

## 0. Why this document exists

`006-customer-onboarding` and the plan-catalog/notifications code that ships alongside it
(`backend/src/routes/plans.ts`, `admin-plans.ts`; `backend/src/lib/plan-enforcement.ts`;
`src/pages/onboarding/CustomerOnboardingPage.tsx`; `mobile/src/screens/onboarding/
CustomerOnboardingScreen.tsx`; `mobile/src/onboarding/`) landed via a series of commits
(`d8d81a1` … `c6a0e77`) without a Stage 10 strategy or manual checklist ever being filed —
unlike Feature 004, which had both before its mobile screens shipped. This is a **process gap**,
not just a coverage gap: the feature reached "shipped" language in `007-notifications/README.md`
("SHIPPED" rows) and a live Render deploy before QA reviewed it. This document is the retroactive
Stage 10 artifact; §6 states plainly what is and is not verified.

---

## 1. Scope

- **Web:** `/get-started` onboarding wizard (`src/pages/onboarding/CustomerOnboardingPage.tsx`,
  606 lines) — account type → signup/login → verify → choose plan → register asset(s) → review.
  Customer web dashboard (`src/pages/customer/CustomerDashboardPage.tsx`) as the post-onboarding
  landing surface.
- **Mobile:** onboarding wizard + marketing slides (`mobile/src/onboarding/`,
  `mobile/src/screens/onboarding/CustomerOnboardingScreen.tsx`, 1141 lines), `useOnboardingGate.ts`
  (decides app-vs-onboarding on session resume).
- **Backend:** plan catalog (`GET /v1/plans`, `GET /v1/plans/catalog`), admin plan editor
  (`GET/PATCH /v1/admin/plans*`), plan-enforcement gate on asset registration
  (`ASSET_LIMIT_REACHED`), enterprise-quote gate on policy creation (`PLAN_REQUIRES_QUOTE`).
- **Adjacent, in-scope for this doc because onboarding triggers it:** mobile push token
  registration on app entry (`PUT /v1/devices/push-token`), notification preferences defaults,
  welcome/onboarding-incomplete email notifications (`onboarding-notification-service.ts`).
- **Out of scope (unchanged from Feature 004/006 business requirements):** payment/checkout
  (no gateway selected), asset photo upload (MP-5), GPS assignment, KYC, phone OTP.

---

## 2. Test pyramid — current state, verified by re-running the suites

| Layer | Owner | Target | Status |
|---|---|---|---|
| **Backend unit/route** | `backend-engineer` | Plan catalog, admin plan editor, plan enforcement, notifications | **Partially green — see §3 for specific gaps.** 145 tests / 32 files pass (`cd backend && npm test`, re-verified 2026-08-13). |
| **Mobile unit/screen** | `mobile-engineer` | Onboarding wizard, push registration, onboarding gate | **Not exercised.** 30 tests / 10 suites pass (`cd mobile && npm test`, re-verified 2026-08-13 after a stale-`node_modules` fix), but **zero of those tests touch `mobile/src/onboarding/`, `mobile/src/screens/onboarding/`, or `mobile/src/notifications/`** — the count is unchanged from before this pull landed. |
| **Web unit/component** | `frontend-engineer` | Onboarding wizard, admin plan editor, customer dashboard | **Does not exist as a layer.** The root `src/` app has no test runner configured at all — no `test` script in `package.json`, zero `*.test.*`/`*.spec.*` files anywhere under `src/`, and no test step in `.github/workflows/ci.yml`'s `frontend` job (lint → typecheck → build only). This predates this pull (the design-system/marketing site was never test-harnessed) but now covers a 606-line money-adjacent wizard and a 344-line admin pricing editor with zero automated assertions. |
| **API contract** | `automation-qa-engineer` | Route tests with in-memory fakes | **Uneven.** `plans.test.ts` (customer catalog) is adequate; `admin-plans.ts` (admin-only pricing editor) has **no test file at all**; `plan-enforcement.ts` (`ASSET_LIMIT_REACHED`) has **no direct or indirect test coverage** anywhere in the suite. |
| **Integration (live Mongo/Supabase)** | `automation-qa-engineer` | Staging DB name per MP-8 | **Not started** — same status as Feature 004. |
| **E2E** | `automation-qa-engineer` | Maestro scaffold, signup → verify → plan → asset → review | **Not extended to onboarding.** The existing `mobile/e2e/` scaffold predates the onboarding wizard and was written against the old direct-to-Policy/Assets-tab flow, not the new wizard steps. Execution is blocked regardless — see §5. |
| **Manual** | `manual-qa-engineer` | Full wizard, both platforms, RBAC on admin plan editor | **No checklist filed.** Feature 004's `manual-qa-checklist.md` does not cover plan selection, asset-limit enforcement, or the admin plan editor. |

---

## 3. Coverage gaps found on audit (concrete, file-level)

### 3.1 `backend/src/lib/plan-enforcement.ts` — `ASSET_LIMIT_REACHED` — no test coverage (highest priority)

`assertAssetRegistrationAllowed()` is the function that turns FR-P3 ("asset registration is
blocked when active asset count ≥ plan `maxAssets`") into enforced behavior. It is called from
`POST /v1/assets` (confirmed via `assets.ts:48`). There is no `plan-enforcement.test.ts`, and
`assets.test.ts` has no test case that exercises the limit at all (its `POST /assets` suite only
covers detail-shape validation and the `ACCOUNT_NOT_ACTIVE` gate — checked directly, no
`ASSET_LIMIT_REACHED` or `maxAssets` string appears anywhere in `assets.test.ts`).

This is the single most consequential gap in this feature: it is a business rule that maps
directly to what a customer is paying for (plan tier → device count), it is new behavior (Feature
004's MP-3 explicitly ruled out asset-registration eligibility checks; Feature 006 reintroduces
one), and it is cheap to close — the function takes an injectable `ctx` shape already used
elsewhere in the route test harnesses.

**Spec for `automation-qa-engineer` — `backend/src/lib/plan-enforcement.test.ts` (or inline in
`assets.test.ts`), unit-level with fakes:**
- Policy has no `planCatalogId` → registration allowed regardless of asset count (no plan attached, matches the Feature 004 default posture).
- Policy references a plan with `maxAssets: null` (enterprise/custom) → always allowed.
- Policy references a plan with `maxAssets: 5`, account has 4 active assets → allowed (boundary: `activeCount < maxAssets`).
- Same plan, account has exactly 5 active assets → **rejected** with `ASSET_LIMIT_REACHED` and `maxAssets: 5` in the error detail (boundary: `activeCount >= maxAssets`).
- Account has assets but the referenced plan no longer resolves (`findById` returns `null` — e.g. deleted/deactivated plan) → allowed, not a hard failure (confirm this is the intended fail-open behavior; if not, that's a defect, not just a test gap).
- Account has more than one policy — confirm which policy's plan is checked (`listByAccount(accountId, 1, null)` takes only the first row; is "first" well-defined — creation order? — worth a one-line comment plus a test if ordering matters for correctness).
- End-to-end through the route: `POST /v1/assets` returns **403 `ASSET_LIMIT_REACHED`** (per `errors.ts`) when the gate fires, not a generic 400 validation error.

### 3.2 `backend/src/routes/admin-plans.ts` — no test file at all

`GET /v1/admin/plans` and `PATCH /v1/admin/plans/:planId` are `requireUserType('admin')`-gated,
mutate pricing/limits (`monthlyAmountCents`, `maxAssets`, `isActive`) that customer-facing
`GET /v1/plans` reads back, and have shipped an admin UI against them
(`src/admin/pages/AdminPlansPages.tsx`, 344 lines) — with zero test evidence that:
- A non-admin (customer) token gets **403**, not 200 or 500.
- An unauthenticated request gets **401**.
- `PATCH` with a partial body only updates the supplied fields (Zod `.optional()` on every field — easy to get the merge semantics wrong; `updateById`'s `$set: { ...patch }` will silently drop nothing but is worth locking in).
- `PATCH` on a non-existent `planId` returns **404**, not a 500 from an invalid ObjectId.
- `PATCH` with a malformed `planId` (not a valid ObjectId) is handled — `plan-catalog.ts`'s `updateById` guards `ObjectId.isValid(id)` and returns `null`, which the route maps to 404; worth a test since it's the kind of guard that regresses silently.
- Setting `isActive: false` on a plan removes it from `GET /v1/plans/catalog` and `GET /v1/plans` (cross-route effect — customer catalog must reflect admin edits) but **not** from an already-created policy's stored `planTier`/`planCatalogId` (no retroactive rewrite — confirm this is intended).

This is an RBAC boundary on a money-adjacent write path with no automated evidence either way.
Per this org's risk-based prioritization (theft, tracking, claims, billing, RBAC get the deepest
coverage), an untested admin-only pricing mutation endpoint is a Stage 10 blocker on its own
merits, independent of the rest of this document.

### 3.3 Mobile onboarding wizard, marketing slides, and push registration — zero test files

`mobile/src/onboarding/` (14 files, including `useOnboardingGate.ts` and
`onboardingStorage.ts`), `mobile/src/screens/onboarding/CustomerOnboardingScreen.tsx` (1141
lines — the largest single screen file in the mobile app), and `mobile/src/notifications/` (5
files, including the Expo push registration hook `usePushNotifications.ts`) have no
corresponding `__tests__` entries. The mobile suite's pass count (30 tests / 10 suites) is
byte-for-byte the same set of suites that existed before this pull — confirmed by listing the
suite files (`src/auth/__tests__/*`, `src/api/__tests__/*`, `src/theme/primitives/__tests__/*`,
`src/screens/__tests__/PolicyListScreen.test.tsx` / `CreatePolicyScreen.test.tsx` /
`AssetListScreen.test.tsx`) — none reference onboarding or notifications.

Two specific behaviors worth flagging as testable and currently unverified, not just "add
tests generically":
- **`useOnboardingGate.ts`'s error-swallowing path** (lines 47–49 in the current file): if
  `listPolicies`/`listAssets` throw for *any* reason — including a transient network error, not
  just "genuinely has none" — the hook resolves to `gate: 'onboarding'`. For an already-onboarded
  customer on a flaky connection, this routes them back into the onboarding wizard instead of the
  app on every session resume until the calls happen to succeed. Whether this is the intended
  fail-safe (worth a comment + test asserting it) or a defect (should probably fail to a neutral
  "retry" state, not silently re-onboard a paying customer) is a real product decision that
  currently has no test locking in either answer.
- **Push token registration timing relative to the onboarding gate.** `usePushNotifications.ts`
  requests an Expo token "on app entry" per the 007 README; `useOnboardingGate.ts` also runs on
  session resume. There's no test confirming these don't race (e.g., a push-token PUT firing
  before the account is known to be `active`, or firing during the onboarding wizard itself)
  or that a customer who never completes onboarding still gets a push token registered.

### 3.4 Web onboarding wizard, admin plan editor, customer dashboard — no test layer exists to run them in

Not specific missing test cases so much as the layer itself: `npm run lint`, `npm run typecheck`,
and `npm run build` are the only CI signal for `src/pages/onboarding/CustomerOnboardingPage.tsx`,
`src/admin/pages/AdminPlansPages.tsx`, and `src/pages/customer/CustomerDashboardPage.tsx`. A
regression in, for example, the `PLAN_REQUIRES_QUOTE` branch (`CustomerOnboardingPage.tsx:180`)
or the `ASSET_LIMIT_REACHED` branch (`:223`) would only surface via manual click-through or in
production. This is a pre-existing condition of the web app (it has never had a test runner), but
the risk profile of what's being shipped into that untested layer has materially changed — from
a marketing site to a wizard that creates policies and gates asset registration.

### 3.5 Lower-priority observations (not blocking, worth a follow-up ticket)

- `backend/src/repositories/push-tokens.ts`'s `disableAllForAccount(accountId)` exists but is
  never called from any route or service in the current codebase (checked: only the repo
  definition and its own implementation reference it). There is no account-lifecycle event
  (deletion, forced logout, MFA reset) that bulk-clears push tokens. Not a Stage 10 test gap
  per se — there's nothing to test yet — but worth flagging to `compliance-specialist` /
  `authentication-engineer` since push tokens are device-identifying personal data under the
  Feature 007 compliance review's own framing (`compliance-review-notifications.md` §2).
- `backend/src/lib/push-notification-service.ts` (the orchestration layer that gates sends on
  notification-preferences and disables invalid tokens) has no direct test, though both of its
  dependencies (`expo-push.test.ts`, `notification-brand.test.ts`) are tested. Lower priority
  than §3.1/§3.2 because the risk is delivery-quality, not RBAC or money.
- `backend/src/lib/resend-email.ts`, `domain-email-templates.ts`, `email-footer.ts` are untested
  thin wrappers/templates. Consistent with the existing pattern elsewhere in the codebase
  (`transactional-email.ts` under Feature 001 is similarly a thin wrapper); not flagging as a
  gap distinct from that established pattern.

---

## 4. Critical scenarios (must pass before this feature is considered ready for internal distribution)

Building on Feature 004's §3, add:

### 4.1 Plan selection & enforcement
- Selecting Starter/Standard creates a policy with the correct `planCatalogId` (AC-O3).
- Selecting Enterprise returns `PLAN_REQUIRES_QUOTE` and the UI shows a quote CTA, not a broken create attempt (AC-O6).
- Registering assets up to `maxAssets` succeeds; the next registration is blocked with `ASSET_LIMIT_REACHED` and the UI surfaces this as a plan-limit message, not a generic error (§3.1).
- `GET /plans/catalog` (public) and `GET /plans` (authenticated) return the same active-plan set; an admin deactivating a plan removes it from both.

### 4.2 RBAC — admin plan editor
- Customer token against `GET/PATCH /admin/plans*` → 403.
- Unauthenticated against `GET/PATCH /admin/plans*` → 401.
- Admin PATCH of `monthlyAmountCents`/`maxAssets` is reflected in the next customer-facing `GET /plans` call.

### 4.3 Onboarding gate correctness
- A customer with an existing policy + asset resumes the app directly into the app shell, not the wizard.
- A customer with no policy/asset resumes into the wizard at the correct step.
- Network failure during the gate check does not silently re-onboard an already-onboarded customer (§3.3 — needs a product decision plus a test, not just a test).

### 4.4 Push token / notification preferences (overlaps Feature 007)
- Token registration is scoped to the authenticated account only (already covered — `notifications.test.ts`).
- `theft_critical` push cannot be disabled via the preferences API (already covered).
- **Not yet covered:** a customer who logs out on one device and back in on another does not receive push notifications on a token that should have been disabled (`disableForDevice` is tested for explicit "revoke on logout device"; there's no test for the *implicit* case of re-registering the same `deviceId` after a session change).

---

## 5. E2E / device status — do not overstate this

**Blocked on the same thing Feature 004 was blocked on, and it is still open.** `HANDOFF.md`'s
open-items table (as of the commit that last touched it, `7a5eaaa`, 2026-08-13) still lists
**"Resend (auth email) + Supabase hook secrets"** as a platform-owner action with status "Blocks
real email delivery until configured." No later commit or doc records the Resend account being
created, the sending domain verified, or the Edge Function secrets being set — there is no
`supabase/.env` in the repo (expected, it's gitignored) and no status line anywhere claiming this
is done. `007-notifications/README.md` marking auth email "SHIPPED" describes the **code path**
(Supabase `auth-send-email` → Resend, wired and deployed) — it is not evidence the owner's Resend
account is live. Recent commits (`594e5ff`, `d178b05`, `de2c21d`) fixed real bugs in the
verification/login path (session insert using UUIDs, 503 on Supabase MFA lookup, pending-account
activation ordering), which suggests **someone exercised this against a real or near-real flow**
during that work — but that is engineer-driven debugging, not a QA-owned, checklist-driven Stage
10 pass, and no artifact records what was actually verified or with which account.

**Conclusion: no E2E run and no manual device pass have occurred for this feature.** Do not
represent otherwise. `mobile/e2e/` remains a scaffold, not a suite that has been executed against
the current onboarding wizard.

---

## 6. Exit criteria (Stage 10 sign-off) — not yet met

- [ ] §3.1 `plan-enforcement.ts` has direct unit coverage (cheap, no blocker other than time)
- [ ] §3.2 `admin-plans.ts` has route-level RBAC + CRUD coverage (cheap, no blocker other than time)
- [ ] Web test runner exists and covers, at minimum, the `PLAN_REQUIRES_QUOTE` / `ASSET_LIMIT_REACHED` branches of `CustomerOnboardingPage.tsx` and the admin/non-admin boundary of `AdminPlansPages.tsx` — this requires a tooling decision (Vitest + Testing Library is the natural fit given `backend/` already uses Vitest) that is `frontend-architect`'s / `qa-architect`'s call, not something to bolt on ad hoc
- [ ] Mobile onboarding wizard and gate logic have at least the scenarios in §4.3
- [ ] Manual QA checklist filed and executed for the wizard end-to-end on both platforms (template: `004/manual-qa-checklist.md`)
- [ ] `mobile/e2e/` scaffold updated to walk the actual onboarding wizard steps, and run at least once against a real or credibly-stubbed email-verification path
- [ ] Resend is confirmed live (owner action, tracked in `HANDOFF.md`) before any E2E run is treated as representative of production behavior
- [ ] No open P0/P1 from this document's §3 without an explicit, dated deferral decision

**Not signed.** This document is filed to make the gap visible and actionable, not to certify
readiness. Per the Definition of Done, a feature with an untested money-adjacent enforcement
path (§3.1) and an untested admin-only pricing-mutation RBAC boundary (§3.2) does not meet the
bar for release regardless of how much of the rest of the surface works.
