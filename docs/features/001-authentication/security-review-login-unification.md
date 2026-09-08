# Feature 001 — Security Review (Stage 8): Unified Role-Agnostic Login

**Status:** **SIGN-OFF WITHHELD — CONDITIONAL, REMEDIATION REQUIRED IN PLACE.** The change is **not** ordered rolled back. 6 required changes (SR-LU-1 … SR-LU-6), 4 of them classed *must fix now*. 7 residual risks recorded, 3 of them newly created by this change rather than inherited.
**Date:** 2026-09-08
**Lifecycle stage:** 8 — Security Review, conducted **after the fact**. **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate:** **INCOMPLETE.** `security-engineer` and `compliance-specialist` have filed nothing on this change. Per `02-feature-lifecycle.md` all three signatures are required; this document is one of three and does not constitute the gate.
**Subject:** commit `7422b5d` and its follow-ups — unification of login so every account type (`customer`, `admin`, `security_company_operator`, `support_agent`) authenticates at the single public `/login` page and is client-side routed to its dashboard.
**Relationship to prior gates:** this change materially alters a surface already signed off under a *different* trust assumption. `docs/features/006-customer-onboarding/security-review.md` reviewed `src/pages/CustomerLoginPage.tsx` as a **customer-only** page (see `docs/organization/gates/stage8-manifest.json:743-753`, entry `web-customer-onboarding-auth`). That coverage no longer describes the artifact. It does not extend to privileged credential handling and must not be read as covering it.
**Reviewed against:** [`06-security-standards.md`](../../organization/06-security-standards.md), [`security-review.md`](security-review.md) (Feature 001, SR-12 / SR-14 / R-5), [`006 security-review.md`](../006-customer-onboarding/security-review.md) (SR-006-1 … SR-006-3), ADR-0006.

**Method and honesty note, per `07-documentation-standards.md`.** This session had **no shell access**. I could not run `git show 7422b5d`, could not diff the commit against its parent, and **could not run `cd backend && npm test`**. Everything below was established by reading the **working tree as it currently stands on `main`**, file by file, with line citations. Where a claim depends on the diff rather than the current state, I say so and mark it unresolved. **No test suite was executed for this review** — that is a gap, and SR-LU-1 below is a defect that a test would have caught and that no test exists to catch.

---

## 0. Verdict, stated up front

**The central security claim of the change is TRUE, and I verified it rather than accepting the comment that asserts it.**

`src/lib/jwt.ts:1-13` claims the client-side `user_type` decode is a routing hint and never an authorization decision, and that the server is the sole authority. That claim holds:

- `backend/src/middleware/authenticate.ts:86-131` verifies the JWT **signature** (`verifyAccessToken`) and checks the `jti` against the revocation set before populating `req.auth`. A client-forged or client-edited token never reaches a handler.
- `backend/src/middleware/require-role.ts:18-30` gates on `req.auth.userType`, which comes from the **verified** claim set, not from anything the browser asserts.
- `requireUserType` is applied per route, not left to a global — 45 occurrences across 13 route files, including every `/admin/*` route (`backend/src/routes/admin-accounts.ts:95-97`, `:136-138`, `:176-178`), the security-company routes, and the support/call-centre routes.
- Every privileged route tree re-derives role server-side before rendering: `DashboardAuthProvider`'s hydration path (`src/dashboard/auth/DashboardAuthProvider.tsx:108-133`) **awaits** `/session/refresh` and then **awaits** `validateAccount` → `GET /account/me` (`:92-106`) before it will ever set `status: 'signed-in'`, and `AdminAuthGate` (`src/admin/layout/AdminLayout.tsx:8-37`) renders nothing but a spinner until that resolves.

**So the direct answer to "can a customer reach a privileged dashboard's UI shell by manipulating the client-side decode or route state?" is: not through `/login`. Yes, through `/admin/login`.** The unification did not close the old role-specific pages — it left them live and explicitly documented them as "harmless redundant entry points… nothing about their behavior changes" (`src/pages/CustomerLoginPage.tsx:40-43`). That characterisation is wrong. Those pages use a **different code path** (`signInWithTokens`, `DashboardAuthProvider.tsx:135-155`) which sets `status: 'signed-in'` **synchronously, before any role check**, fires the `GET /account/me` check as a detached `void` promise, and **swallows its failure with an empty catch** (`:149-151`). A customer who signs in at `/admin/login` renders the full admin shell, and if that one `/account/me` call fails or is dropped, they stay in it indefinitely. That is SR-LU-3.

**And MFA is not droppable.** Enforcement is entirely server-side at `backend/src/routes/auth.ts:587-601`: no verified TOTP factor plus `mfa_required` yields an enrollment ticket, never a session; and `mfa_required` is structurally `true` for all three privileged types via the `accounts_privileged_roles_require_mfa` CHECK (`database-design.md:139-141`). The client cannot skip it by choosing a different login page. **However — see SR-LU-1 — MFA at the new `/login` page is functionally broken.**

**Four things drive the conditions:**

1. **SR-LU-1 — the unified page cannot complete an MFA challenge at all.** `onSubmitCredentials` has no `finally`; the `mfaRequired` branch returns with `loading` still `true` (`src/pages/CustomerLoginPage.tsx:99-124`), and `Button` sets `disabled={disabled || loading}` (`src/components/Button/index.tsx:80`). The Verify button is permanently disabled, and HTML implicit submission does nothing when the default button is disabled. **Every admin, security-company operator and support agent — and every MFA-enrolled customer — is locked out of `/login`.** The page is bricked until reload. This is not itself an exploitable vulnerability; it is a total functional break on the security-critical step of the flow, in production, on a change that shipped with **zero tests** (`src/lib`, `src/dashboard` and `src/pages` contain no test files for any of this). I am naming it first because the *remediation* is where the security risk lives: the predictable operational response to "admins can't log in at /login" is a hurried patch or a "just use /admin/login" workaround, and `/admin/login` is the path with SR-LU-3 on it.

2. **SR-LU-2 — the Stage 8 manifest still says this surface is covered, and it is not.** `docs/organization/gates/stage8-manifest.json:743-753` records `/login` under Feature 006 with verdict `sign-off-granted-with-changes`, on the strength of a review whose entire threat model was customer-only. The CI gate therefore reports green on a surface that now handles privileged credentials and seeds privileged refresh tokens. The commit immediately preceding this work (`2d893db`) was itself a fix for manifest gaps; this change reopened one. My charter's first success metric is *zero Security-Review-gate bypasses*, and this is one — not because someone defeated the gate, but because the gate's own inventory silently went stale. Fixing the manifest is not paperwork; it is the control.

3. **SR-LU-4 — nothing logs the previous role out.** `routeTokensByRole` (`src/pages/CustomerLoginPage.tsx:76-97`) writes one storage slot and navigates. It never clears the other three privileged slots, never clears `td-customer-web-refresh` in `localStorage`, and never calls `/session/logout` on whatever refresh token was already there. Answering the task's question plainly: **no, the unified page does not log a user out of a previous role's session before establishing a new one, and the previous session stays valid server-side.** On any shared or multi-role browser, "log in as someone else" leaves the earlier privileged session both resident in storage and live on the server.

4. **SR-LU-5 — the shared entry point is now the single best account-enumeration oracle on the platform, and the code comment above it says the opposite.** `backend/src/routes/auth.ts:516-524` reads: *"the credential-verification call and the failure-recording call happen identically whether or not `account` is null."* The code on line 524 is `account ? await ctx.supabase.verifyPassword(...) : null` — **the Supabase round trip is skipped entirely when the account does not exist.** A non-existent email returns after one local lookup; an existing email with a wrong password returns after a full GoTrue network round trip. That is a first-order, trivially measurable timing difference on the one endpoint every role now uses. This is distinct from SR-006-2, which was about `/auth/notify-email-verified` and is closed.

**What I am explicitly not doing.** I am not ordering a rollback. The zero-trust property that matters — server-side authorization independent of the client's decode — is genuinely intact, verified endpoint by endpoint, and reverting would trade a real functional break for a different one without improving the security posture. But this change cannot be left to stand as a silent precedent: it altered the trust properties of a signed-off surface, it did so without the gate, and two of the findings below (SR-LU-3, SR-LU-4) are state-confusion defects that a review at stage 8 would have caught for the cost of an hour.

---

## 1. Scope

**In scope:** the trust-boundary consequences of collapsing four role-specific login entry points into one public page; the client-side role-routing mechanism (`src/lib/jwt.ts`, `src/dashboard/auth/roleRouting.ts`); the pre-server-check UI exposure question; MFA continuity across all roles at the shared entry; cross-role storage and session-state bleed; enumeration and timing at the shared entry; redirect-target handling.

**Out of scope:** the underlying `/auth/login`, `/session/refresh`, `/auth/mfa/challenge` contracts (ratified in `security-review.md`, unchanged by this work); the design of `PrivilegedLoginPage` beyond the fact that it is still reachable; per-endpoint authorization inside the dashboards (Features 004/009/010/011 reviews); legal/regulatory framing (`compliance-specialist`); line-level implementation hardening and scanning (`security-engineer`).

**Unresolved because I had no shell:** whether commit `7422b5d` also touched files I did not identify by reading the tree; whether the backend suite passes today; whether any follow-up commit partially remediates something below. Each of those is a re-verification item for `security-engineer`, not an assumption I have filled in.

---

## 2. Threat model delta

### 2.1 Trust boundaries changed by this commit

| # | Boundary | Before | After | Ruling |
|---|---|---|---|---|
| TB-L1 | Public marketing origin → privileged credential entry | `/admin/login`, `/security/login`, `/call-centre/login` — same SPA, same origin, but reached only by someone who knew the path | **`/login`, the page linked from the public marketing header**, is the primary privileged credential entry | Same origin either way (`src/App.tsx:66-127`), so **no new origin boundary is crossed**. What changed is discoverability and blast radius of a marketing-bundle compromise. See R-LU-3. |
| TB-L2 | Login page → privileged dashboard route tree | `PrivilegedLoginPage` handed tokens to the provider in-process | `/login` writes the refresh token into `sessionStorage` under a key chosen by an **unverified** JWT claim, then navigates (`CustomerLoginPage.tsx:80-89`) | **Acceptable.** The handoff is a hint; the receiving provider re-derives role from the server before rendering. Verified, §3.1. |
| TB-L3 | Browser storage ← privileged refresh token | one slot per dashboard, written only by that dashboard | four slots, written by a page in the *marketing* route tree, none of them cleared on role switch | **NOT acceptable as-is. SR-LU-4.** |
| TB-L4 | Unauthenticated internet → identity oracle | four entry points, one per role | one entry point for all roles, with a role-correlated timing signal behind it | **SR-LU-5.** |

### 2.2 Attack tree — "customer account reaches privileged dashboard UI"

```
GOAL: render privileged dashboard UI (shell, nav, page structure) as a non-privileged account
├── A. Forge/alter the client-side user_type decode
│   ├── A1. Edit the JWT before decodeJwtPayload sees it
│   │     → decode is on the response the server just returned; nothing to edit in transit  ✔ closed
│   ├── A2. Tamper with sessionStorage to seed a privileged slot with a customer token
│   │     → DashboardAuthProvider hydration awaits /session/refresh + /account/me
│   │       (DashboardAuthProvider.tsx:108-133, :92-106) → 'wrong-role' → Unauthorized card ✔ closed
│   └── A3. Prototype-pollute PRIVILEGED_DASHBOARD_CONFIG lookup
│         → isPrivilegedUserType uses Object.prototype.hasOwnProperty.call
│           (roleRouting.ts:36-38) → inherited keys do not match                            ✔ closed
├── B. Use the still-live role-specific login pages
│   └── B1. Customer signs in at /admin/login → signInWithTokens sets 'signed-in'
│           BEFORE the role check, /account/me check is a detached void promise with an
│           empty catch (DashboardAuthProvider.tsx:135-155, esp. :149-151)                  ✖ OPEN — SR-LU-3
├── C. Ride a stale privileged session left in the same browser
│   └── C1. Log in as admin at /login, then log in as a customer at /login; td-admin-refresh-token
│           is never cleared and the admin session is never revoked; navigate to /admin      ✖ OPEN — SR-LU-4
└── D. Reach privileged DATA (not just UI)
    ├── D1. via any /admin/* route → requireUserType('admin') on the verified claim          ✔ closed
    ├── D2. via a forged/edited access token → signature verification                        ✔ closed
    └── D3. via a revoked token → jti revocation-set check on every request                  ✔ closed
```

**Reading of the tree.** Every branch that leads to privileged **data** is closed, server-side, structurally. The two open branches lead only to privileged **UI structure** — nav labels, page scaffolding, empty tables whose data calls 403. That is a genuine but bounded confidentiality impact. It is still a finding, because (a) B1 persists indefinitely if the single `/account/me` call fails, which an attacker on a hostile network can arrange, and (b) it writes a non-admin refresh token into the admin storage slot, which is exactly the state confusion SR-LU-4 is about.

### 2.3 What is **not** exposed before the server check resolves

I looked specifically for the "privileged-looking UI, cached data, or timing signal before the server check" the task asked about:

- **Via `/login`:** nothing. The privileged branch navigates to `target.homePath`, the receiving `AuthGate` sees `status: 'hydrating'` and renders `<LoadingState />` only (`AdminLayout.tsx:12-18`, and identically `SecurityLayout.tsx:12-18`). No nav, no layout, no page component mounts.
- **No cached privileged data exists to leak.** There is no client-side data cache shared across role trees; each dashboard fetches on mount, after the gate.
- **Timing signal:** the `hydrating → signed-in` transition takes two round trips (`/session/refresh`, then `/account/me`) for a valid privileged account, versus two round trips ending in `wrong-role` for a non-privileged one. Both paths make both calls, so the wall-clock difference is not usefully discriminating and, more importantly, the observer in this scenario is the account holder themselves, who already knows their own role. **Not a finding.**
- **`decodeJwtPayload` itself** (`src/lib/jwt.ts:14-33`) is well built for what it is: no verification is *attempted* (so there is no fake-assurance failure mode), it returns `null` on any malformed input rather than throwing, and it is used at exactly one call site. I have no objection to the module. Its documentation comment is accurate. **I am signing off `src/lib/jwt.ts` as written** — with the standing constraint in §6 that its use must not spread.

---

## 3. Findings

Severity is my rating of security impact on this platform, where a privileged session is the eventual route to real-time asset location. **[MUST-NOW]** = fix before the next release; **[MUST-SOON]** = fix within one sprint; **[R]** = residual, accepted, tracked with an owner.

---

### SR-LU-1 — `/login` cannot complete an MFA challenge; the page bricks itself **[MUST-NOW]**
**Severity: High (availability of the authentication path for every privileged role). Not an exploitable confidentiality/integrity vulnerability.**

`src/pages/CustomerLoginPage.tsx:99-124`:

```ts
setLoading(true);
try {
  const result = await loginRequest(email, password);
  if (result.mfaRequired && result.mfaChallengeToken) {
    setMfaToken(result.mfaChallengeToken);
    return;                 // <-- loading is never reset
  }
  ...
} catch (err) {
  setError(mapUserFacingError(err, { context: 'auth' }));
  setLoading(false);        // <-- the ONLY reset, on the failure path
}
```

There is no `finally`. Three early-return branches (`mfaRequired` at `:105-108`, `mfaEnrollmentRequired` at `:109-114`, malformed response at `:115-118`) all leave `loading === true`. `Button` renders `disabled={disabled || loading}` (`src/components/Button/index.tsx:80`), so the MFA form's Verify button (`CustomerLoginPage.tsx:164-166`) is disabled the moment it appears. Per the HTML spec, implicit submission fires a click at the default button and does nothing if that button is disabled, so Enter does not work either. The "Back to email and password" button (`:167-177`) clears `mfaToken` but not `loading`, so the credentials form's submit button is now disabled too. **The page is unusable until a full reload.**

Because `mfa_required` is `true` for all three privileged types by database CHECK, this affects **100% of admin, security-company-operator and support-agent logins at `/login`**, plus any MFA-enrolled customer. Contrast `PrivilegedLoginPage`, which gets this right with a `finally` (`src/dashboard/components/PrivilegedLoginPage.tsx:57-61`) — the defect was introduced by re-implementing the flow rather than reusing it.

**Required:** wrap `onSubmitCredentials` in `try/finally` so `loading` is reset on every exit path. **Additionally required:** a test asserting that an `mfaRequired` response from `/login` yields an *enabled* Verify button and that submitting it calls `/auth/mfa/challenge`. There is currently no test file anywhere under `src/pages`, `src/lib` or `src/dashboard` covering any of this (SR-LU-6).

**I am flagging the second-order risk explicitly:** the operational pressure created by this bug is "tell the admins to use `/admin/login`", which routes them onto the SR-LU-3 code path. Fix SR-LU-1 and SR-LU-3 together, in that order.

---

### SR-LU-2 — the Stage 8 manifest asserts coverage that no longer exists **[MUST-NOW]**
**Severity: High (gate integrity). Owner: me.**

`docs/organization/gates/stage8-manifest.json:743-753` records:

```
"id": "web-customer-onboarding-auth",
"pattern": "/{get-started,signup,login}",
"feature": "006",
"verdict": "sign-off-granted-with-changes",
"note": "... src/pages/CustomerLoginPage.tsx (/login) are in this review's directly-cited code scope ..."
```

That review's threat model, attack tree and findings are customer-only throughout; the phrase "privileged" appears in it only to note that privileged accounts are *excluded* from the web exchange endpoint (`routes/auth.ts:358-361`, still true — `CustomerLoginPage` deliberately bypasses that endpoint and calls `/auth/login`, correctly and for exactly that reason, per its own comment at `:13-24`). The manifest now certifies a privileged credential-entry surface on the strength of a customer-only review.

**Required:** (a) add a distinct manifest entry for `/login` as a **multi-role** entry point pointing at *this* document, with verdict `conditional-sign-off-joint-gate-incomplete` until `security-engineer` and `compliance-specialist` file; (b) amend `web-customer-onboarding-auth` so it no longer claims `/login`; (c) add manifest entries for `src/lib/jwt.ts` and `src/dashboard/auth/roleRouting.ts` as reviewed artifacts of this record. Until (a)-(c) land, the Stage 8 CI check is reporting a false green on this surface, which is worse than reporting a gap.

---

### SR-LU-3 — the still-live role-specific login pages render privileged UI before the server role check, and fail open if the check errors **[MUST-NOW]**
**Severity: Medium (privileged UI-structure disclosure; state confusion). Pre-existing code path, but this change's own documentation misstates it as unchanged and harmless, which is why it is a finding of this review.**

`src/pages/CustomerLoginPage.tsx:40-43` asserts the dedicated pages are "harmless redundant entry points into the exact same `DashboardAuthProvider` flow — nothing about their behavior changes." They are not the same flow. `/login` seeds storage and lets the target tree **hydrate** (`DashboardAuthProvider.tsx:108-133`, which `await`s both round trips). `PrivilegedLoginPage` calls `signInWithTokens` (`DashboardAuthProvider.tsx:135-155`), which:

```ts
writeRefreshToken(config.storageKey, refreshToken);
setAccessToken(token);
setStatus('signed-in');              // :139 — BEFORE any role check
void (async () => {
  try {
    const me = await getAccountMe();
    if (me.userType !== config.allowedUserType) { setStatus('wrong-role'); ... }
    ...
  } catch {
    /* signed-in; protected routes can retry account load */   // :149-151
  }
})();
```

Consequences, all reachable in production today:

- **(a)** A customer (or a support agent, or an operator) who signs in at `/admin/login` passes `AdminAuthGate`'s `status !== 'signed-in'` check (`AdminLayout.tsx:31-34`) and renders `AdminLayout` + `AccountsListPage` for the duration of the `/account/me` round trip. Data calls then 403, but the admin nav, route structure and page scaffolding are disclosed.
- **(b)** If that single `/account/me` call fails — network blip, or an attacker on-path dropping one request — the empty catch leaves `status: 'signed-in'` **permanently**. There is no retry, no timeout, no fail-closed. The comment "protected routes can retry account load" describes behaviour that does not exist: `AdminAuthGate` reads `status` only.
- **(c)** A non-admin's refresh token is now sitting in `td-admin-refresh-token`, and is not cleared when the role check eventually says `wrong-role` (`:143-146` sets state but never calls `clearRefreshToken`). It survives into SR-LU-4's territory.

**Required:** `signInWithTokens` must `await` the `/account/me` verification and must **fail closed** — on a mismatch *or* on an error, clear the refresh token, clear the access token, and set `signed-out`/`wrong-role`. Do not set `signed-in` before the server has confirmed the role. This makes both login paths behave identically, which is what the unification comment already claims.

**Also decide, and write down:** whether `/admin/login`, `/security/login` and `/call-centre/login` should remain reachable at all. My recommendation is to keep them as thin `<Navigate to="/login?redirect=..." replace />` redirects — one credential-entry code path is materially easier to keep correct than two, and the manifest entries `web-admin-login` / `web-security-login` / `web-call-centre-login` (`stage8-manifest.json:645-696`) then collapse into the single `/login` entry SR-LU-2 creates. That is a recommendation, not a ruling; `frontend-architect` owns the call, and either answer is acceptable provided SR-LU-3's fail-closed fix lands.

---

### SR-LU-4 — no session or storage teardown on role switch; the previous role's session stays live **[MUST-NOW]**
**Severity: Medium-High (cross-role state bleed on shared browsers; unrevoked privileged sessions).**

`routeTokensByRole` (`src/pages/CustomerLoginPage.tsx:76-97`) writes exactly one slot and navigates. Nothing anywhere on this page clears the other three privileged `sessionStorage` slots, clears `td-customer-web-refresh` in `localStorage` (`CustomerAuthProvider.tsx:17`), or calls `POST /session/logout` on a previously-held refresh token. Concretely:

- **(a) Privileged → customer.** Sign in as admin at `/login` (`td-admin-refresh-token` seeded, rotated by the dashboard). Return to `/login`, sign in as a customer. The customer session is established; `td-admin-refresh-token` is untouched and the admin session is **not revoked server-side**. Navigating to `/admin` resumes full admin access with no credentials. On a shared workstation or a kiosk, the user's mental model — "I logged in as someone else, so the admin session is gone" — is wrong. This is the single most likely real-world exploitation of anything in this document, and it needs no attacker skill.
- **(b) Customer → privileged.** The reverse leaves a live customer session in `localStorage` (which per SR-006-3 is JS-reachable and long-lived — 30-day idle / 90-day absolute for the customer surface per `security-review.md` §6).
- **(c) Privileged → different privileged.** Both slots end up populated with live, independent, unrevoked sessions.
- **(d) Availability side effect, same root cause.** A lingering customer session makes `/login` unreachable for a privileged user: `CustomerAuthProvider` hydrates to `signed-in` and `CustomerLoginPage.tsx:58-74` immediately bounces the browser to `/dashboard` before the form can be used. There is no "sign in as a different user" affordance.

**Required:** before seeding any new session, `/login` must (i) read every known refresh token (`td-customer-web-refresh`, and all three `PRIVILEGED_DASHBOARD_CONFIG[*].storageKey`), (ii) fire `POST /session/logout` for each one present, and (iii) clear all four slots — *then* write the new one. `logout` is already available at `src/customer/api/auth.ts:77-83` and is unauthenticated, so this is a small change. Failure of the logout call must not block login, but the local clear must be unconditional.

**Also required:** `/login` must render a "not you? sign out" path when `auth.status === 'signed-in'`, rather than silently redirecting (fixes (d)).

---

### SR-LU-5 — account-existence timing oracle on the now-shared entry point, contradicted by its own comment **[MUST-SOON]**
**Severity: Medium (account enumeration, including of privileged accounts).**

`backend/src/routes/auth.ts:514-533`. The comment at `:516-521` states the credential-verification call happens "identically whether or not `account` is null" and that a password is still sent to Supabase in the non-existent case "so the code path/timing profile matches as closely as possible." **The code does not do this.** Line 524:

```ts
verification = account ? await ctx.supabase.verifyPassword(normalizedEmail, password) : null;
```

Non-existent account → no GoTrue call, no network round trip. Existing account, wrong password → full GoTrue round trip. The difference is a network RTT plus GoTrue's password-hash verification — tens to hundreds of milliseconds, first-order, measurable over a handful of samples through ordinary jitter. Everything downstream is correctly identical (`recordLoginFailure`, the `login_failure` audit event, the `INVALID_CREDENTIALS` body with `attemptsRemaining` at `:558`), which makes the response *content* non-discriminating — but content parity was never the weak half.

This existed before the unification. **The unification is what makes it matter**, and it is in scope for that reason: `/login` is now the one address at which an unauthenticated attacker enumerates *any* account on the platform, and the roles it now serves include the ones whose compromise leads to asset location data. It is also a direct regression against the ratified anti-enumeration posture in `security-review.md` §6 (the AC-5 rider) and the pattern established when SR-006-2 was closed.

**Required:** make the timing profile genuinely uniform. Either (a) always perform the GoTrue call, using a fixed dummy identifier in a non-existent-account branch and discarding the result, or (b) enforce a constant floor on the failure path — measure elapsed time and pad to a fixed budget before responding. (a) is structurally better and is what the comment already promises; (b) is cheaper. Whichever is chosen, **the comment at `:516-521` must be corrected in the same commit** — a comment that describes a control the code does not implement is worse than no comment, because it stops the next reviewer looking. Owner: `authentication-engineer`, verified by `security-engineer`. `OI-11`/`SR-15`'s live-timing measurement remains open and is the acceptance test for this.

---

### SR-LU-6 — zero test coverage on the role-routing decision **[MUST-SOON]**
**Severity: Medium (architecture drift — the risk I am specifically chartered to monitor).**

There is no test file under `src/lib`, `src/dashboard` or `src/pages` covering `decodeJwtPayload`, `PRIVILEGED_DASHBOARD_CONFIG`, `isPrivilegedUserType`, or `CustomerLoginPage`'s routing branches. A function that decides which dashboard a browser enters, and a page that writes privileged refresh tokens into role-keyed storage, currently have no regression protection whatsoever. SR-LU-1 is the direct evidence: a total functional break on the MFA path shipped to production undetected.

**Required, minimum set:** (1) `decodeJwtPayload` returns `null` for malformed/absent/non-JSON payloads and never throws; (2) `isPrivilegedUserType` rejects `'__proto__'`, `'constructor'`, `'toString'` and unknown strings; (3) each privileged `user_type` seeds **only** its own storage key and navigates to its own `homePath`; (4) `customer` seeds **no** privileged key; (5) an unrecognised `user_type` falls through to the customer path and does not seed any privileged key; (6) SR-LU-1's MFA-button assertion; (7) SR-LU-4's teardown assertion. Owner: `automation-qa-engineer` with `frontend-architect`; derived from this threat model per my standing obligation to `qa-architect`.

---

## 4. Residual risks — recorded, not fixed

| # | Risk | Assessment | Owner |
|---|---|---|---|
| **R-LU-1** | **Unvalidated `redirect` query parameter.** `CustomerLoginPage.tsx:49` takes `params.get('redirect')` with no validation and feeds it to `navigate(redirect, { replace: true })` (`:60`) and `<Navigate to={redirect} replace />` (`:73`). | **Not an open redirect today, and I checked rather than assumed.** Both call sites use `replace`, and `@remix-run/router`'s `replace()` (`node_modules/@remix-run/router/dist/router.cjs.js:499-514`) has **no** try/catch — a cross-origin value like `//evil.com` throws an uncaught `SecurityError` from `replaceState`, producing a blank page, not a navigation. The `push()` path at `:477-490` **does** fall back to `window.location.assign(url)` on that exception, so **this becomes a genuine open redirect the moment any call site switches from `replace` to `push`.** That is a landmine, not a vulnerability. Current impact: a client-side DoS reachable by sending an already-signed-in user `/login?redirect=//attacker.example`. The privileged branch ignores `redirect` entirely (it uses `target.homePath`, `:88`), which is the right design. **Recommended (cheap, do it with SR-LU-4):** reject any `redirect` that does not match `^/(?!/)` before use. | `frontend-architect` |
| **R-LU-2** | **Device binding is inert for privileged web sessions, and asymmetric.** `/login` sends the customer web device id for **every** role (`src/customer/api/auth.ts:44-55`), so a privileged session minted there has `session.deviceId` set; but `DashboardAuthProvider` refreshes with `deviceId: null` (`DashboardAuthProvider.tsx:118-122`, `src/dashboard/api/client.ts:81`), and the mismatch check requires **both** sides non-null (`backend/src/lib/refresh-session.ts:206`). | **No false-positive revocation risk** — I checked this specifically, because a mismatch triggers `revokeFamily` + `revokeAllForAccount` (`:209-211`) and a spurious platform-wide logout of every admin would have been a serious operational hazard. It cannot fire. The residual is that FR-20 binding provides **zero** protection on the privileged web surface, and that an attacker holding a stolen refresh token bypasses the check simply by omitting `deviceId` — the same fail-open `routes/notifications.ts:83-95` already calls out and refuses to mirror. This is `security-review.md` **R-5** unchanged; the unification neither improved nor worsened it, but it did create the asymmetry. **Accept, tracked.** Cheap partial improvement available: have the dashboard client send the same web device id the login call sent. | `authentication-engineer` |
| **R-LU-3** | **All four surfaces remain one origin, one bundle, and there is still no CSP anywhere in the repo** (grep for `Content-Security-Policy`: no matches; `render.yaml` sets no headers). `src/App.tsx:66-127` serves the marketing landing page, the customer dashboard, `/admin/*`, `/security/*` and `/call-centre/*` from a single SPA. Privileged refresh tokens sit in `sessionStorage`, readable by any script on that origin. | **`security-review.md` SR-12(a) — my own ratified ruling that the marketing origin must be separate from the admin and security-company origins — has never been implemented.** This change did not create the violation; it **cements** it, by making the marketing origin's `/login` the canonical privileged credential entry. Honest assessment: origin separation is now materially harder to retrofit than it was when SR-12 was written, and the unification is the reason. `sessionStorage` for privileged (vs `localStorage` for customer, SR-006-3) is the correct relative choice and I credit it — it bounds exposure to the tab. **Escalating to `cto` as a risk-acceptance decision**, with the CSP from SR-12(ii) as the minimum compensating control if separation is declined. This is the highest-severity item in this document that I am *not* requiring be fixed now, and I want that stated plainly rather than buried. | `cto` / `cloud-infrastructure-architect` |
| **R-LU-4** | **Module-singleton API client config shared by all three privileged dashboards.** `src/dashboard/api/client.ts:21-26` holds `clientConfig` and `refreshInFlight` at module scope; `configureDashboardClient` overwrites it with no reset on unmount (`DashboardAuthProvider.tsx:79-90` has no cleanup). | Not exploitable today: `src/App.tsx:103-126` mounts at most one privileged route tree at a time, and React runs the new tree's effect after the old unmounts, so last-writer-wins is deterministic. The residual is a stale config pointing at a previous role's storage key and access-token closure during the window after unmount and before the next configure. **Accept, tracked**, with the note that this stops being safe the instant anything renders two dashboards concurrently. | `frontend-architect` |
| **R-LU-5** | **Silent `sessionStorage` write failure.** `CustomerLoginPage.tsx:82-87` swallows the exception and navigates anyway. The server session has already been minted and is now orphaned — unreachable by the client, unrevoked, live until its 8-hour absolute cap. | Low. The comment's stated fallback ("the dashboard's own dedicated login page still works") is unlikely to hold, since a `sessionStorage` write usually fails because storage is disabled entirely, which breaks the fallback too. **Accept**; fold a user-visible error into the SR-LU-4 change. | `frontend-architect` |
| **R-LU-6** | **No web MFA-enrollment path.** Both `/login` (`:109-114`) and `PrivilegedLoginPage` (`:52-55`) receive `enrollmentTicket` on the `mfaEnrollmentRequired` response and **discard it**, showing a "contact support" message. | **Fail-closed and therefore correct security posture** — no browser path exists to enroll a first factor, which is exactly what SR-1's enrollment-ticket design intended. Recorded because it is an operational lockout risk for a newly invited admin, and because the ticket is being dropped rather than never issued. `SR-24`'s support-assisted recovery process is still undesigned. **Accept.** | `authentication-engineer` |
| **R-LU-7** | **Idle-timeout signalling is lost at the shared entry.** `usePrivilegedIdleTimeout` redirects to `${loginPath}?reason=idle-timeout` (`src/dashboard/auth/usePrivilegedIdleTimeout.ts:19-23`), and only `PrivilegedLoginPage` reads that parameter (`:28`, `:85-87`). `/login` has no idle-timeout awareness. | Cosmetic today because the idle logout still routes to the role-specific page. Becomes a UX gap the moment SR-LU-3's recommendation (collapse those pages into redirects) is adopted. **Accept, coupled to that decision.** | `frontend-architect` |

---

## 5. Answers to the specific questions asked

Stated flatly, so none of this has to be inferred from the findings above.

1. **Can a customer reach a privileged dashboard's UI shell by manipulating the client-side decode or route state?** Through `/login`: **no** — the receiving provider awaits `/session/refresh` and `GET /account/me` before leaving `hydrating`, and renders only a spinner meanwhile. Through `/admin/login` (still live): **yes** — the shell renders before the role check, and renders *indefinitely* if that check errors. **SR-LU-3.** No privileged data is exposed on either path; server-side `requireUserType` holds.
2. **Is there privileged-looking UI, cached data, or a timing signal before the server check resolves?** No cached data (no cross-role client cache exists). No privileged UI via `/login`. Privileged UI *structure* via `/admin/login`. The `hydrating` timing difference is not a useful signal to anyone who is not already the account holder.
3. **Did unification silently drop MFA for any role?** **No.** Enforcement is entirely server-side at `backend/src/routes/auth.ts:587-601`, backed by a database CHECK; the client cannot influence it by choosing an entry point. **But MFA at `/login` is functionally broken** for every role that needs it — SR-LU-1.
4. **Information leak between "wrong password" / "MFA-required role" / "no such account"?** Response *content* is uniform (`INVALID_CREDENTIALS` + `attemptsRemaining`, identical for both cases). Response *timing* is not: the GoTrue round trip is skipped entirely for a non-existent account, and the code comment claims the opposite. **SR-LU-5.** Role is never disclosed before a correct password is supplied.
5. **Cross-role storage collision or stale-session leakage?** No key *collision* — the four keys are distinct and `isPrivilegedUserType` is prototype-safe. But substantial **stale-session leakage**: nothing is ever cleared or revoked on role switch. **SR-LU-4.**
6. **Does the page log the user out of a previous role before establishing a new one?** **No.** Neither locally nor server-side. **SR-LU-4.**
7. **CSRF / redirect-target validation?** No CSRF exposure introduced — the session credential is a bearer token in a header, not a cookie, so there is no ambient-authority request to forge, and `/auth/login` is unauthenticated by necessity. The privileged routing target comes from the JWT and is **not** attacker-influenced, as the task expected. The `redirect` *query parameter* is unvalidated but is not currently an open redirect, for the precise mechanical reason set out in **R-LU-1** — and it would become one under a `push`-based navigation. Fix it anyway; it costs one regex.

---

## 6. Standing constraints this record sets

Binding on future work, recorded here so the next change inherits them rather than rediscovers them:

- **C-LU-1.** `decodeJwtPayload` (`src/lib/jwt.ts`) may be used **only** for navigation-target selection. It must never gate rendering of privileged UI, must never be used to decide what to fetch, and must never be introduced into the mobile app or the backend. Any new call site is an automatic Stage 8 re-review trigger. `security-engineer`: this belongs in the scanner as a named-symbol check.
- **C-LU-2.** Any client-side auth state transition to a "signed-in" status for a privileged role must be **awaited on, and fail closed against, a server response.** Optimistic `signed-in` followed by a detached verification is prohibited on privileged surfaces, in this codebase, from now on. SR-LU-3 is the remediation of the existing instance.
- **C-LU-3.** Establishing a session for role X must first terminate any session for role Y held by the same browser — locally *and* server-side. This is not a UX preference; it is the control that keeps role separation meaningful on a single-origin SPA.
- **C-LU-4.** Any change that alters *which roles* can authenticate at a given surface is architecture-significant and requires a Stage 8 record before merge, regardless of how small the diff is. This change was roughly 100 lines across three files and changed the trust properties of the platform's front door.

---

## 7. Verdict

**Safe to leave in production as-is? No. Safe to leave in production while it is fixed? Yes.**

Nothing found here is an active, remotely exploitable path to customer PII, asset location, or a privileged session. The property the whole design rests on — that the client-side `user_type` decode is a routing hint and the server independently authorizes every privileged route — is **true, and verified in the route handlers, not merely claimed in a comment**. I want that on the record, because it is the right architecture and whoever built it got the hard part right: the decode is scoped to one call site, the storage handoff is re-verified server-side, MFA is enforced where it cannot be reached by a client, and the privileged surface uses `sessionStorage` rather than `localStorage`. A rollback would not improve the platform's security posture.

**But this is not a rubber stamp, and four things must be fixed:**

- **SR-LU-1 (must fix now)** — every privileged role is locked out of the page the change exists to provide. Shipped broken, undetected, untested.
- **SR-LU-2 (must fix now)** — the Stage 8 manifest is reporting a false green on this surface. Mine to fix, and I am fixing it.
- **SR-LU-3 (must fix now)** — the old login pages, which this change explicitly described as unchanged and harmless, render privileged UI before the server role check and fail **open** when that check errors.
- **SR-LU-4 (must fix now)** — no session teardown on role switch; a privileged session survives, live and unrevoked, past a subsequent login as a different user in the same browser.

**SR-LU-5** and **SR-LU-6** follow within one sprint. **R-LU-3** — single origin, no CSP, SR-12(a) never implemented and now harder to implement — goes to `cto` as an explicit risk-acceptance decision, because silent risk acceptance is not permitted and this one has now been carried silently for a while.

**Gate status: NOT SATISFIED.** This document is one of three required signatures. `security-engineer` must verify the remediations in code (and, since I had no shell, must independently run the backend suite and diff `7422b5d` against its parent to confirm I have not missed a touched file). `compliance-specialist` must rule on whether a single shared credential-entry point for customer and privileged personas on the public marketing origin changes anything in the POPIA framing. Until both file, `/login` carries a conditional sign-off from me and nothing more.

**Process ruling, for the record.** This change reached production without Stage 8. The lifecycle names Security Review a hard gate; a small diff is not an exemption, and "it's just a login page routing change" is precisely the shape of change this gate exists for. I am not escalating this as a disciplinary matter — the engineering judgment in the change itself was mostly sound, and the review found no exploitable hole. I am recording it as a **gate bypass** against my own success metric, and C-LU-4 above exists so the class of change that caused it is unambiguously in scope next time.

---

**Chair:** `cybersecurity-architect` · 2026-09-08
**Joint gate:** `security-engineer` — *not filed* · `compliance-specialist` — *not filed*
