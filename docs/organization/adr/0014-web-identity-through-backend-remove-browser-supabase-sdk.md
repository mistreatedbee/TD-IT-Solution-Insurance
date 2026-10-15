# ADR-0014: Web Identity Goes Through the Backend Only — Remove `supabase-js` and Retire the Published Anon Key

Status: **Proposed** — not ratified. Discharges INC-003 action **A-21** (draft) once filed; ratification is `cto`'s.
Date: 2026-10-15
Deciders: `solution-architect` (author). Concurrence required from `cybersecurity-architect`,
`authentication-engineer` and `compliance-specialist`; ratified by `cto` (see §12).
Contributors consulted through their filed records, not in a live session: `backend-architect`,
`frontend-architect`, `mobile-architect`, `devops-engineer`.
Numbering: files on disk in `docs/organization/adr/` on 2026-10-15 are 0001, 0002, 0003, 0006, 0008,
0009, 0011, 0012 and 0013. 0004, 0005 and 0007 are reserved by name elsewhere, and 0010 is reserved for
the payment-gateway ratification. **0014 is the next free number** (re-verified against the directory,
not taken from `HANDOFF.md`).
Lateness: A-21's register entry set the draft for 2026-10-09 and ratification for 2026-10-16
(INC-003 §11). This draft is six days late. The ratification date is `cto`'s to hold or move (§13 Q-8).

> **Concurrency note: read this before relying on §5.** `authentication-engineer` is changing the web
> signup and resend flows (A-16) and the reset flows on this branch while this ADR is being drafted.
> The inventory in §5 records the code **as read from the working tree at `HEAD` = `62e973dd` on
> 2026-10-15**, and that tree may already contain uncommitted work. If a row has been migrated by the
> time this ADR is reviewed, the reviewer records that in an appended section. Nobody edits the row
> in place (append-only rule). The decision in §2 does not depend on which rows have moved.

---

## 1. Context

### 1.1 The bypass class

INC-003 began as one bypass. The deployed web client changed passwords by calling
`supabase.auth.updateUser({ password })` directly. That skipped SR-6 (MFA before a privileged
password change), session revocation, SR-007-1's push-token sweep, the backend password policy and
the audit trail (INC-003 §§1–3). The point fix (F-1…F-9) is shipped and verified (§9, A-7 PASS).

The A-5 threat model (`docs/organization/incidents/INC-003-A5-browser-supabase-sdk-threat-model.md`)
showed that the incident was one case of a wider **class**, which has two layers:

- **Layer 1: what our bundle calls.** The browser runs a second identity client next to the backend.
  It holds its own self-refreshing GoTrue session in `localStorage`, and `POST /auth/supabase/exchange`
  turns that session into a backend session. Every web call that reaches GoTrue directly runs
  outside the backend's policy decision point (A-5 §2, L1-0…L1-10).
- **Layer 2: what the published key makes callable.** The anon key is compiled into every web build
  (`src/customer/supabase/client.ts:21-22`). Anyone who holds it can call GoTrue's password grant,
  signup, recover, resend, verify, `PUT /user` and factor endpoints without touching our code (A-5 §3,
  C-1…C-10). Removing calls from `src/` closes none of these. A-5 §3's closing sentence says so: the
  fix is the key, or GoTrue-side configuration.

The class has one root: **a GoTrue-honoured credential exists outside the backend.** INC-003 §5
stated the principle behind the fix, and this ADR adopts it as a platform rule: *Supabase Auth is the
identity store, not the policy decision point. The backend is.*

### 1.2 What this reverses, and what it restores

- **ADR-0002** (§Decision, bullet 3): *"No client … talks to Supabase or MongoDB directly — all
  access is mediated through the backend API."* The web customer surface has violated this since it
  shipped. This ADR restores it. It does not amend ADR-0002.
- **Feature 001 FU-18** (`docs/features/001-authentication/api-design.md` §1): backend-minted
  session tokens, with no client holding a Supabase-honoured JWT. That design is recorded as pending
  **ADR-0005**, which is reserved and still unwritten. This ADR extends FU-18 to the web customer
  surface. It does **not** substitute for ADR-0005, which remains owed (§13 Q-9).
- **Feature 001 SR-4**: *"the anon key is a secret in this architecture and must not be provisioned
  or published."* SR-4 is currently not satisfied (A-5 §0 item 2). The backend already complies:
  `SUPABASE_ANON_KEY` is never read (`backend/src/config/env.ts:11`, `backend/src/db/supabase.ts:12-18`),
  and every backend GoTrue call sends the service-role key as `apikey` (`backend/src/db/supabase.ts:180`).
- **Feature 001 §13 re-threat-model trigger**: *"any client-side Supabase SDK proposal"*. It fired
  when web auth was built and was not honoured (INC-003 §2.5). A-5 discharged it after the fact. This
  ADR is the structural response A-5 §9 asked for.
- **A-9 (governance)**: Feature 006's acceptance of the anon key as "public, not a secret" has been
  voided by its author. The interval until this ADR's key-retirement phase is therefore an
  **unaccepted** residual until `cto` explicitly accepts or rejects it (§13 Q-1).

### 1.3 Who uses Supabase credentials today (verified 2026-10-15)

| Surface | Supabase SDK | Anon key | GoTrue session held client-side |
|---|---|---|---|
| Web, customer flows | **Yes**: `@supabase/supabase-js ^2.112.3` (`package.json:22`) | **Yes**: `VITE_SUPABASE_ANON_KEY` (`src/vite-env.d.ts:6`; Vercel; `render-staging.yaml` static-site envVars) | **Yes**: `persistSession: true` (`client.ts:34`) |
| Web, privileged flows (`/login` for staff, `/admin`, `/security`, `/call-centre`, invitations) | Not called. These flows use backend `POST /auth/login`, `/auth/mfa/challenge` and `/mfa/enroll*` only (`CustomerLoginPage.tsx:7,120`; A-5 §2 last row) | Shipped in the same bundle | No |
| Mobile | **No** (`mobile/package.json` has no `@supabase` entry; A-5 §8) | **No** | No |
| Backend | `supabase-js` server-side with the **service-role** key only | **Never read** | Transient only (§9 RR-8) |

**This corrects the premise that the anon key "still exists for mobile".** It does not. The only
consumer of the anon key is the web bundle. Its *exposure*, however, is account-level: a mobile-only
customer is as exposed to C-1/C-8/C-9/C-10 as a web customer (A-5 §8). This is why retiring the key is
both **possible** (nothing else depends on it) and **in scope** (it protects every account, §7).

---

## 2. Decision

1. **The web client holds no Supabase credential and runs no Supabase SDK.** Remove
   `@supabase/supabase-js` from the web `package.json`. Delete `src/customer/supabase/` (client, auth
   helpers, the exchange caller). Remove `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from
   `src/vite-env.d.ts`, from Vercel and from `render-staging.yaml`.
2. **Every web identity operation is a backend `/api/v1` call.** Signup, verification resend, email
   verification, login, MFA challenge, password reset (already done), logout, logout-all and refresh
   use the endpoints mobile and privileged web already use. **No web-only fork of any auth contract is
   allowed.** Where web needs something mobile does not, it is a discriminator on the shared endpoint,
   following the INC-003 F-2 `client: 'web' | 'mobile'` precedent (§5.2 G-1).
3. **Retire `POST /v1/auth/supabase/exchange`.** With no browser GoTrue session, it has no legitimate
   caller. It is the TB-8c bridge behind A-10's coupling, A-13's CSRF surface and the re-mint path.
4. **Retire the published anon key.** Disable or rotate it so that no key a browser has ever received
   can reach GoTrue (§6 Phase 4). Until this step lands, Layer 2 stays open, and every Layer 2 High
   (A-8, A-18, A-19) stays on its console-only interim control.
5. **SR-4 becomes an enforced invariant**, not a review note. CI fails the web build if the bundle or
   lockfile contains `@supabase/`, `supabase.co`, or a string that matches a Supabase API key. This is
   A-11's "capability check" and replaces the F-9(b) grep as the control that matters. F-9(b) stays,
   relabelled as code hygiene per A-11.
6. **Session model for web: unchanged from today's backend model.** The access token is held in memory
   and sent as a bearer token. The refresh token is in `localStorage` for customers and in per-tab
   `sessionStorage` for privileged roles. §4 explains why cookies are not adopted now, and what would
   change that.

---

## 3. Alternatives considered

### 3.1 Keep `supabase-js` and harden the Supabase console instead

Turn on Secure password change and Secure email change, set the password floor to 14, tighten rate
limits, add session time-box and inactivity limits, and disable magic-link sign-in (A-22 items 1–10).

**Rejected as the end state. Required as the interim.**
- **Console settings narrow Layer 2 but do not close it.** Secure password change bites only on
  sessions older than 24 hours, so a fresh C-1 session is never asked (A-5 C-8). Secure email change
  does not stop C-10 factor enrolment on an account with no factor. Rate limits slow C-1 down; they do
  not apply FR-11 lockout or FR-12 audit.
- **The magic-link toggle cannot be applied.** "Disable magic-link sign-in" conflicts with the
  backend's own `mintTransientUserAccessToken` (INC-003 §13.4 C-5, withdrawn).
- **The controls stay unenforced by us.** Every control lives in a dashboard nobody here can read.
  A-22 has been open since 2026-10-06, and the settings are verified only when the owner is in a console
  session. A control we can neither test nor observe is not the policy decision point.
- **The coupling stays.** The browser keeps a GoTrue session, so A-10's watermark becomes permanent
  load-bearing infrastructure instead of defence in depth.
- **The governance cost is ongoing.** `cto` would have to accept a published-key residual
  permanently, against SR-4, and re-accept it at every GoTrue upgrade.

### 3.2 Backend-for-frontend with httpOnly cookies

The backend (or a BFF in front of it) sets the refresh token, and possibly the access token, as
`HttpOnly; Secure; SameSite` cookies. The SPA never touches a token.

**Deferred, not rejected. Recorded as the designated upgrade path (§11).** Why it is not the
decision now:
- **The origins are cross-site, so cookies would be third-party.** Production web is
  `td-it-solution-insurance-alpha.vercel.app` and the API is `td-it-solution-insurance.onrender.com`
  (`render.yaml:48,55-56`). `vercel.app` and `onrender.com` are both public suffixes, so the two hosts
  share no registrable domain. A refresh cookie would need `SameSite=None` and would be blocked by
  every browser that restricts third-party cookies. That breaks web sign-in for a large share of users.
- **The fix has DNS lead time and an owner of its own.** Making it work needs a common registrable
  domain (Feature 001 SR-12(c) / OI-10, already escalated to `cto`) or a same-origin proxy (§3.3).
- **Cookies add ambient credentials, and so a CSRF surface the bearer model does not have** (§4.2).
  Adopting them correctly is its own design (CSRF tokens, `Origin` checks, credentialed CORS) and should
  not ride on an incident remediation.
- **It does not change what this ADR removes.** Cookies govern how the *backend* session is stored.
  A-21's problem is the *GoTrue* session and the anon key, and both are removed either way.

### 3.3 Proxy-only: keep the browser speaking GoTrue, but through a server-side proxy that injects the key

A Vercel edge function or backend route forwards `supabase-js` traffic to `/auth/v1/*` and adds the
key server-side. The key leaves the bundle, and little client code changes.

**Rejected.**
- **The proxy becomes the new anon key.** Whatever the proxy forwards is callable by anyone who can
  reach the proxy. Forwarding everything keeps every Layer 2 row reachable (C-1, C-8, C-9, C-10),
  now behind our own hostname. Allow-listing only the calls we approve means re-implementing the
  backend's auth endpoints as a pass-through without their policy, which is strictly worse than
  calling the endpoints that already exist.
- **The coupling stays.** The browser still holds a GoTrue session, so the A-10 coupling and the
  exchange bridge both stay.
- **It adds a third component on the identity path.** The new component is a proxy that has to be
  secured, monitored and kept in step with GoTrue's API.

### 3.4 Remove `supabase-js` but keep the anon key alive "for now"

**Rejected as an end state.** This closes Layer 1 only. A-5 §9 item 2: *"Without this step, item 1
only removes Layer 1."* It is allowed only as the **soak interval** between Phase 1 and Phase 4
(§6), with an end date `cto` sets.

---

## 4. Target token and session model for web

### 4.1 Model

| Credential | Issuer | Where it lives on web | Lifetime | Revocable by backend |
|---|---|---|---|---|
| Backend access token (JWT, `session_id` claim) | Backend (`signAccessToken`) | **JS memory only** (`CustomerAuthProvider` state); sent as `Authorization: Bearer` | Short (backend policy) | Yes: KV JTI revocation plus a live session read where enforced |
| Backend refresh token (opaque, rotating, family-tracked, device-bound) | Backend (`mintNewSession`) | Customer: `localStorage` (`CustomerAuthProvider.tsx:40-54`). Privileged: per-tab `sessionStorage` | Customer: 90-day absolute cap. Privileged: 8 h absolute, 15 min idle | Yes: SR-8 reuse, FR-20 mismatch, logout, logout-all, `admin_forced` |
| GoTrue access/refresh token | GoTrue | **Nowhere on web after Phase 1** | n/a | n/a |
| Anon key | Supabase | **Nowhere after Phase 1; disabled after Phase 4** | n/a | n/a |
| Plaintext password | — | **Nowhere after Phase 1** (A-14's `sessionStorage` record deleted) | n/a | n/a |

After this change, the web customer session works exactly as mobile and privileged web already do.
It is one credential family, issued, rotated and revoked by one authority.

### 4.2 CSRF implications

- **API requests: no CSRF surface added, none needed.** The backend session is a bearer token in a
  header the browser never attaches on its own. A cross-site page cannot make an authenticated request
  without first stealing the token. The JSON `Content-Type` also forces a CORS preflight, which the
  `CORS_ALLOWED_ORIGINS` allow-list (`render.yaml:55-56`) refuses for foreign origins. This ADR does not
  add cookies, so it adds no CSRF token requirement. **Any future proposal to add an auth cookie
  reopens this section** (§11).
- **Login CSRF via email links (A-13): structurally removed.** The class needed the browser to turn a
  URL-borne token into a session. After Phase 1 the callback page does not turn a link into a session
  at all:
  - a `signup` link's `token_hash` + `email` goes to `POST /auth/verify-email`, which marks the
    account verified and **mints nothing**;
  - a `recovery` link goes to `/reset-password` and the backend's `resetToken` branch (already the case
    since A-24).

  There is no browser GoTrue session to plant, and no exchange to call. A forged signup link can only
  verify the attacker's own address. A forged recovery link can only reset the attacker's own account,
  and only if the victim chooses a password for it. That is a phishing pretext, not a session switch.
- **Login form CSRF: not applicable.** `/auth/login` is a credentialless JSON `fetch`.
- **XSS is still the token-theft path.** The bearer model keeps the customer refresh token readable by
  any script on the origin. The credential set an XSS can steal shrinks from three items to one: the
  GoTrue session, the backend refresh token and the plaintext password, down to the backend refresh
  token only. It is still not zero. A-15 (CSP + `Referrer-Policy`) and ADR-0011's accepted origin risk
  are unchanged by this ADR (§9 RR-1).

### 4.3 Explicitly not changed here

- **Where the customer refresh token is stored.** Moving it to `sessionStorage` would trade XSS
  persistence against user experience (lost on tab close). That is a `frontend-architect` +
  `cybersecurity-architect` call, best made together with A-15.
- **The privileged dashboards' model.** It is already backend-only.
- **Access-token lifetime, refresh rotation, FR-20 device binding.** All are ratified elsewhere and
  are unchanged.

---

## 5. Inventory: every web `supabase-js` touchpoint and its backend replacement

Read from the working tree at `62e973dd`, 2026-10-15 (see the concurrency note at the top). Test files
are listed separately (§5.3). "Exists" means the route is in `backend/src/routes/` today and mobile
or privileged web already calls it.

### 5.1 Call sites

| # | Web call (file:line) | Reached from | Backend replacement | Status |
|---|---|---|---|---|
| **W-1** | `createClient(url, anonKey, { autoRefreshToken, persistSession, detectSessionInUrl, flowType: 'pkce' })` (`src/customer/supabase/client.ts:31-38`). Helpers: `isSupabaseAuthConfigured` (`:6-10`), `supabaseAuthRedirectUrl` (`:44-48`) | Any page calling `getSupabase()` | None needed; delete. `SupabaseAuthConfigNotice.tsx` (rendered at `CustomerSignupPage.tsx:80,121`) is deleted with it | Delete |
| **W-2** | `auth.signUp({ email, password, options.emailRedirectTo })` via `signUpWithSupabase` (`src/customer/supabase/auth.ts:152-186`, call at `:161-167`) | `CustomerSignupPage.tsx:52`; `CustomerOnboardingPage.tsx:203` | `POST /v1/auth/signup` (`backend/src/routes/auth.ts:82-132`): per-IP `SIGNUP_LIMIT` (`:84`), customer password policy (`:91`), `consentAccepted: z.literal(true)` (`:79`), synchronous `app.accounts` creation (`:102`). A web wrapper `signup()` **already exists and is unused** (`src/customer/api/auth.ts:37-43`) | **Exists. Gap G-1** (redirect) |
| **W-3** | `auth.resend({ type: 'signup' })` via `resendSignupVerification` (`src/customer/supabase/auth.ts:203-212`) | `CustomerSignupPage.tsx:69`; `CustomerOnboardingPage.tsx:459` | `POST /v1/auth/resend-verification` (`auth.ts:183-216`): per-email cooldown and ceiling | **Exists. Gap G-1** (redirect); G-6 (no per-IP limiter) |
| **W-4** | `auth.signInWithPassword` via `signInWithSupabase` (`src/customer/supabase/auth.ts:188-201`), then the exchange (W-9) | `CustomerAuthProvider.loginWithPassword` (`CustomerAuthProvider.tsx:164-187`), called **only** from the onboarding wizard: `CustomerOnboardingPage.tsx:148` (poll) and `:222` (wizard login form). `/login` already uses backend `POST /auth/login` (`CustomerLoginPage.tsx:7,120`) | `POST /v1/auth/login` (`auth.ts:519-662`) + `POST /v1/auth/mfa/challenge` (`:668-747`). Web wrappers already exist (`src/customer/api/auth.ts:45-64`). Also fixes `CustomerOnboardingPage.tsx:228`, which today refuses MFA-enrolled customers ("Use the mobile app") | **Exists** |
| **W-5** | *Not an SDK call, but only exists because of W-4:* plaintext password in `sessionStorage` (`savePendingSignupAuth`, `CustomerOnboardingPage.tsx:208`), replayed every 10 s (`:144-174`). This is A-14 | Onboarding verify step | No replacement credential. The wizard needs a *verification-status* signal, not a password | **Gap G-3** (decision: no new endpoint recommended) |
| **W-6** | `auth.verifyOtp({ token_hash, type })` via `verifySupabaseEmailLink` (`src/customer/supabase/auth.ts:255-280`; `signup` falls back to type `email` at `:260-262`) | `CustomerAuthCallbackPage.tsx:128` (signup links only; recovery links are forwarded to `/reset-password` at `:110-126`) | `POST /v1/auth/verify-email` `{ token, email }` (`auth.ts:141-177`): marks the account verified and mints **no** session. The callback already has the link's `email` (hook sets it, `supabase/functions/auth-send-email/lib/confirmation-url.ts:22-24`) | **Exists. Open check G-4** |
| **W-7** | `auth.exchangeCodeForSession(code)` (`CustomerAuthCallbackPage.tsx:155`); also `detectSessionInUrl` | PKCE `?code=` links | None. PKCE links only arise from a browser-initiated `signUp` carrying a code challenge. Backend signup sends links through `/resend` with no PKCE (`backend/src/db/supabase.ts:326-339`), so after W-2 moves no such link is produced | Delete branch |
| **W-8** | `auth.signOut({ scope: 'local' })` (`CustomerAuthCallbackPage.tsx:47-53`) | After signup verification | None. There is no browser session to clear | Delete |
| **W-9** | `fetch POST /auth/supabase/exchange { accessToken, deviceId, deviceName }` (`src/customer/supabase/auth.ts:36-102`) | W-4 | **Retire the route** (`backend/src/routes/auth.ts:336-507`) in Phase 3 | Delete client in Phase 1; delete route in Phase 3 |
| **W-10** | `auth.signOut()` (default `scope: 'global'`) (`CustomerAuthProvider.tsx:74-79`) | Customer sign-out; `onSessionTerminated` (`:89-91`) | `POST /v1/session/logout` (`backend/src/routes/session.ts:58-68`). **Precondition defect, see G-2:** web's `logout()` cannot succeed today | **Exists. Gap G-2** (client defect) |
| **W-11** | `auth.getSession()` on the reset page | — | Already removed (INC-003 §16.1, verified §17.1) | Done |
| **W-12** | *Non-SDK coupling:* `mapSupabaseAuthError` (`src/customer/supabase/auth.ts:306-339`, imported by `src/lib/user-facing-errors.ts:2`) maps GoTrue error **strings**. "Supabase Auth" copy at `CustomerAuthCallbackPage.tsx:215` and `CustomerSignupPage.tsx:89` | Signup, verify and login error display | Map backend catalogue **codes** (`mapApiErrorByCode`, already used on the reset path, INC-003 §8b) | Replace |

**Also unchanged, and must stay unchanged:** `notifyEmailAlreadyVerified` (`src/customer/supabase/auth.ts:116-139`) already calls the backend
(`POST /auth/notify-email-verified`, `backend/src/routes/auth.ts:236-324`). It moves to
`src/customer/api/auth.ts` with the directory deletion, and its behaviour does not change. The
uniform-response rule (SR-006-2) stays binding.

**Behaviour change, intentional:** `signUpWithSupabase` currently branches on GoTrue's
`identities.length === 0` and `email_confirmed_at` to show "already verified"
(`src/customer/supabase/auth.ts:170-183`). The backend's `202` is uniform by design (FR-5/AC-2,
`auth.ts:125-127`), so web loses that branch and always shows "check your inbox". This is the
anti-enumeration posture working as intended, not a regression to engineer around.

### 5.2 Endpoint gaps

| ID | Gap | Owner | Needed by |
|---|---|---|---|
| **G-1** | **Signup and resend send a mobile deep link to web users.** Both routes use the single `ctx.env.emailVerificationRedirectUrl` (`backend/src/routes/auth.ts:106,208`), which is `tditinsurance://verify-email` in production and staging (`render.yaml:39-40`; `backend/src/config/env.ts:338-339`). A desktop web user who signs up through the backend would receive a link that opens nowhere. **Required fix, same pattern as F-2:** add `client: z.enum(['web','mobile']).optional().default('mobile')` to `/auth/signup` and `/auth/resend-verification`. Map it server-side to a new `EMAIL_VERIFICATION_REDIRECT_URL_WEB` (`…/auth/callback`). Never accept or echo a caller-supplied URL. Allow-list the new URL in Supabase Auth's URL configuration. The default keeps existing mobile builds unaffected | `backend-architect` (contract), `backend-engineer`; `devops-engineer` + project owner (env and allow-list) | Phase 0 |
| **G-2** | **Web customer logout does not reach the backend today.** `logout(refreshToken)` (`src/customer/api/auth.ts:137-143`) sends `authenticated: false` with a body. `POST /session/logout` requires a bearer token (`authenticate`, `session.ts:58`; `middleware/authenticate.ts:88-90`) and ignores the body. The 401 is swallowed (`CustomerAuthProvider.tsx:68-72`). As read, the only server-side effect of a web customer sign-out today is W-10's GoTrue global sign-out. **Removing W-10 before fixing this would make web sign-out purely local.** Fix: send the bearer access token (as mobile does, `mobile/src/api/auth.ts:117`) and add a test. Read from code; not reproduced against a live backend | `authentication-engineer` | Phase 0, a **blocking** precondition for Phase 1 |
| **G-3** | **The onboarding wizard needs a non-credential way to advance after verification** (replaces W-5, closes A-14). Recommended: **no new endpoint.** The email link lands on `/auth/callback`, which runs `/auth/verify-email` (W-6) and returns the user to the wizard's sign-in step. The user enters their password once, through `POST /auth/login`. Alternative, not recommended: a status poll keyed by a signup handle. `/auth/signup`'s uniform `202` (FR-5) means a handle would have to be issued for existing addresses too, and a poll on it risks becoming the enumeration oracle SR-006-2 removed. That needs its own `cybersecurity-architect` review | `authentication-engineer` + `ux-researcher`/`ui-designer` (flow); `cto` (accepts the UX cost, §13 Q-4) | Phase 1 |
| **G-4** | **Verify that GoTrue accepts what the backend sends.** `verifySignupToken` and `verifyRecoveryToken` post `{ type, token: <value>, email }` to GoTrue `/verify` (`backend/src/db/supabase.ts:422-428,443-456`). The hook's links carry a `token_hash` (`confirmation-url.ts:18`). Whether GoTrue treats a hash supplied in the `token` field as valid, or needs it in `token_hash`, must be **confirmed live**. A-24's live end-to-end reset check (INC-003 §17.3) answers it for recovery; the same check is needed for signup. If it fails, the fix is backend-internal (send `token_hash`), not a contract change. The same question touches mobile: `mobile/app/verify-email.tsx:23` reads a `token` parameter, while the hook appends `token_hash`. Observation only, for `mobile-architect`; not verified live | `devops-engineer` (live check), then `backend-architect` | Phase 0 |
| **G-5** | **Retire the exchange.** Delete the route `auth.ts:336-507` and its tests. Check whether `resolveCustomerAccountAfterSupabaseAuth`'s `emailConfirmed` path has other callers before removing anything shared. The A-10 watermark **stays**: it still guards `/auth/mfa/challenge` (`:688-696`), `/mfa/enroll/verify` and the `recoveryAccessToken` branch | `backend-architect` | Phase 3 |
| **G-6** | **Low, recommended.** `/auth/resend-verification` has no per-IP limiter (per-email only, `auth.ts:191-202`), and `/auth/verify-email` has none at all (`:141`). Both are already public via mobile. Web traffic raises their profile. Add per-IP limiters consistent with `NOTIFY_EMAIL_VERIFIED_IP_LIMIT` | `backend-architect` | Phase 1 (non-blocking) |

**No new auth endpoint is required.** G-1 is a discriminator on two existing endpoints. G-2 is a
client defect. G-3 is a flow decision. G-4 is a live check. G-5 is a deletion. This matches A-5 §9's
estimate: "mostly deletion plus wiring to existing endpoints."

### 5.3 Tests that change

- `src/pages/CustomerAuthCallbackPage.test.tsx:19`, `src/pages/CustomerResetPasswordPage.test.tsx:22`
  and `src/customer/auth/CustomerAuthProvider.test.tsx:19` mock `getSupabase`. After Phase 1 they mock
  `fetch` against backend routes instead.
- **New: a capability guard (A-11).** CI fails if `package.json` or the lockfile lists `@supabase/*`
  for the web package, or if `dist/` contains a Supabase API key or a `*.supabase.co` URL. **New:**
  G-2's logout-sends-bearer test. **New:** G-1's backend tests, mirroring F-2's three cases (default →
  mobile; `web` → web constant; smuggled URL fields stripped).
- `src/lib/inc-003-no-direct-password-mutation.test.ts` stays, relabelled as code hygiene (A-11).

---

## 6. Migration phases and rollback

Every phase that changes shipped code goes through Stage 8 (`cybersecurity-architect`, with
`security-engineer` verifying the implementation) and Stage 10 (`qa-architect` /
`automation-qa-engineer`). Neither gate is waived for an incident remediation.

| Phase | Content | Exit criteria | Rollback |
|---|---|---|---|
| **0: Preconditions** (no user-visible change) | G-1 (contract + env + allow-list); G-2 (logout fix); G-4 (live `/verify` check); A-22 item 11 (which key format the project uses, and whether the legacy anon key can be disabled independently); INC-003 C-2 (grants and RLS) still applies while the exchange is live | G-1 and G-2 merged and green; G-4 and A-22 item 11 recorded in INC-003 | Ordinary revert. G-1 is additive with a mobile default |
| **1: Web cut-over** (one PR, no feature flag; a flag would mean shipping both paths and the anon key together) | W-1…W-10 and W-12 migrated or deleted; `pendingSignupAuth` deleted (A-14); `@supabase/supabase-js` removed from `package.json`; `VITE_SUPABASE_*` removed from `vite-env.d.ts` and both hosts; capability guard added; error mapping moved to backend codes | Stage 8 + 10 passed; deployed; `security-engineer` confirms the deployed bundle contains no key (manual, until the CI guard runs on deploy) | **Vercel instant rollback** to the previous deployment. Works **only while the exchange and the anon key are still live**, which is why Phases 3–4 wait. A rollback re-opens A-13/A-14 and the coupling, so it needs a `cto`-recorded decision, not an operator's call |
| **2: Soak** | Monitor `/auth/supabase/exchange` call volume. Legitimate traffic should fall to zero once cached SPA bundles age out. Anything after that is a stale tab or a non-browser caller | `cto` sets the duration (proposed: 7 days); exchange calls ≈ 0 for the final 72 h; no rise in signup/login error rates | Same as Phase 1 |
| **3: Retire the exchange; purge browser-era GoTrue sessions** | G-5. Then end every GoTrue session that a browser could hold. Those sessions sit in users' `localStorage` and stay usable at Layer 2 until expiry or Phase 4. Mechanism to be chosen by `backend-architect` + `devops-engineer`. The per-user `signOutAllUserSessions` exists, but writes a system "login" into `auth.audit_log_entries` per call (INC-003 §13.3 low item (a)). Effect on users: none on backend sessions (`app.sessions` is separate); in-flight MFA challenges (≤5 min) fail and must be retried | Route deleted and deployed; purge run and recorded | Re-deploy the previous backend (git revert). Possible only while the key is live |
| **4: Retire the key (point of no return)** | Disable or rotate the published key per A-22 item 11's answer. If the project is on **legacy JWT keys**, anon and service-role keys share the JWT secret. Rotating it rotates both, invalidates every GoTrue session and needs a coordinated backend redeploy with the new `SUPABASE_SERVICE_ROLE_KEY`. If the project can use **new-format keys**, move the backend to a secret key first, then disable the legacy keys. **Verify first** that the backend's pattern of sending one key as both `apikey` and `Authorization: Bearer` (`backend/src/db/supabase.ts:180-181`) works with the new format. Record whether the gateway refuses `/auth/v1` requests that carry no valid `apikey`. Layer 2's closure rests on that, and it is assumed here, not verified | Key disabled; a request to `/auth/v1/token?grant_type=password` with the old key is refused (recorded); backend smoke test green (login, MFA, reset, enrolment, `/account/me`); CI capability guard live | **None in practice.** Re-enabling, or publishing a fresh browser key, recreates Layer 2 and needs a new explicit `cto` risk acceptance (A-9). A failed backend deploy rolls back by restoring the backend's own secret, never by re-publishing a browser key |

**Order matters.** If Phase 4 runs before Phase 1 is deployed and soaked, live web signup and
verification break. If Phase 1 runs before G-2, web sign-out stops reaching any server.

---

## 7. What this does and does not fix in the INC-003 actions

The phase noted is the one at which each effect occurs. Nothing below closes an action by itself.
Each action is closed by its owner, on the evidence, in INC-003.

| Action | Effect of this ADR | Remains after this ADR |
|---|---|---|
| **A-8**: anon key opens the GoTrue password grant (C-1) | Phase 1 removes our own GoTrue password grant (W-4). **Phase 4 removes it for everyone else.** After Phase 4 the only password-grant caller is the backend, under FR-11 lockout and FR-12 audit | The A-22 item 8 rate-limit interim stays until Phase 4. Backend's own grant traffic is subject to GoTrue's limits (RR-5) |
| **A-9**: void F006's acceptance; `cto` accepts or rejects the residual | Gives the residual an **end date**: Phase 4. After Phase 4, SR-4 holds again and no replacement acceptance is needed | **Does not discharge A-9.** `cto` must still explicitly accept or reject the interval up to Phase 4 (§13 Q-1) |
| **A-10 / A-23**: session-lifecycle coupling | Phase 3 removes the exchange, so the browser-to-backend re-mint path stops existing. The watermark becomes defence in depth for the remaining GoTrue-token-accepting steps (G-5) | Deploy check C-2 still applies until Phase 3 |
| **A-12**: `/reset-password/confirm` accepts any GoTrue token as `recoveryAccessToken` | **Does not fix it.** It narrows who can hold a GoTrue token: web holds none since C-7 (INC-003 §16.1); after Phase 4, an attacker can no longer mint one with the anon key. It makes the clean fix viable: **delete the `recoveryAccessToken` branch** once no client sends it. The only remaining sender is mobile's legacy `access_token` deep-link parameter (`mobile/app/(auth)/reset-password.tsx:16-24`) | Owned by `backend-architect` with `mobile-architect`. Recommendation only; not decided here |
| **A-13**: login CSRF at `/auth/callback` | Phase 1 removes the SDK from the callback, so no URL-borne credential can create a session (§4.2) | C-6 deploy check as recorded |
| **A-14**: plaintext password replay | Phase 1 deletes `pendingSignupAuth` (G-3) | — |
| **A-15**: CSP / Referrer-Policy | Reduces what XSS can steal (§4.2) | **Unchanged and still required.** The customer backend refresh token stays in JS-readable storage |
| **A-16**: GoTrue-direct signup, resend, recover | **Layer 1:** Phase 1 routes signup and resend through backend limiters, the password policy and `consentAccepted` (recover already moved under F-1). **Layer 2:** P-anon calling `/signup`, `/resend`, `/recover` directly is closed only by Phase 4 | Historic web-originated accounts created without the backend consent check (§9 RR-7, `compliance-specialist`). G-1 must land first, or web signups receive mobile links |
| **A-17**: console limb (C-5) | Moot after Phase 1: nothing in the browser verifies OTPs. Magic-link sign-in at Layer 2 is closed by Phase 4 | C-5's withdrawal stands |
| **A-18**: GoTrue `PUT /user` at Layer 2 (C-8/C-9) | **Phase 1 does nothing here.** No such call exists in the bundle (INC-003 §12.4, §13.5). **Phase 4 closes it** for every holder of the published key. The Phase 3 purge closes it for stale browser sessions | Console interim (A-22 items 1, 2, 10) until Phase 4 |
| **A-19**: GoTrue-direct TOTP enrolment (C-10) | Prevention arrives at Phase 4. The SR-14(b) reconciliation stays as detection | C-4 (non-TOTP factors, scheduling, triage) unchanged |
| **A-20**: TOTP-enrolled customers cannot reset | **Not affected.** It is a backend GoTrue AAL issue, and today's web path already fails the same way | Unchanged |
| **A-11**: guard test relabel + bundle check | This ADR specifies the capability check (§2 item 5, §5.3) | Implementation by `automation-qa-engineer` |
| **A-22**: live-config verification | Item 11 becomes a Phase 0 precondition. Items 3, 5, 6 and 8 lose most of their weight after Phase 4, but stay worth recording | Items still owed to the owner's console session |

---

## 8. Mobile parity: an explicit decision

**Mobile client code is out of scope.** There is nothing to remove. Verified on 2026-10-15: no
`@supabase` dependency in `mobile/package.json`; no Supabase key or SDK call under `mobile/src` or
`mobile/app` (the only matches are the reset screen's `access_token` parameter and generated API
types). Mobile already uses every backend endpoint web is moving to.

**In scope for mobile, as consequences of this ADR:**
1. **Phase 4 protects mobile-only accounts.** Layer 2 is account-level (A-5 §8), so retiring the key is
   as much a mobile-user control as a web one.
2. **Contract parity.** G-1's `client` field defaults to `'mobile'`, so every mobile build in the field
   keeps its behaviour with no app release. No auth contract may diverge between web and mobile under
   this ADR (§2 item 2).
3. **Phase 3's GoTrue session purge does not touch mobile sessions,** which are backend `app.sessions`
   rows.

**Explicitly not decided here:** the mobile `access_token` deep-link parameter (stays with A-12, §7),
and G-4's mobile `token` vs `token_hash` observation (handed to `mobile-architect`).

---

## 9. Residual risks

| ID | Risk | Owner | Proposed disposition |
|---|---|---|---|
| **RR-1** | An XSS on the shared marketing/customer/admin origin can still read the customer backend refresh token (`localStorage`, 90-day cap) and the privileged per-tab token | `cybersecurity-architect`; `frontend-architect` | Not accepted by this ADR. Tracked under A-15 and ADR-0011, which already govern it |
| **RR-2** | GoTrue remains internet-facing. After Phase 4, only service-role-key holders can use it. Compromise of the service-role key is total, as before | `security-engineer` | Unchanged; SR-17 and the ADR-0002 secrets plan |
| **RR-3** | Between Phase 1 and Phase 3/4, browser GoTrue sessions issued before the cut-over stay valid at Layer 2 | `cybersecurity-architect` | Bounded by the soak length and A-22 item 6's time-box. Closed by Phase 3's purge |
| **RR-4** | **Availability.** Web signup and email verification now depend on the backend as well as GoTrue. The production backend is on Render's **free** plan (`render.yaml:10`), and its cold starts already surface to users as "Our sign-in service is waking up" (`src/customer/supabase/auth.ts:289`) | `cloud-infrastructure-architect`; `devops-engineer` | Escalated, `cto` decision (§13 Q-3). Login already had this dependency through the exchange, so the change is that signup now shares it |
| **RR-5** | GoTrue's per-IP rate limits may now see all web and mobile identity traffic arriving from the backend's egress address. Whether service-role-authenticated calls are exempt is **not verified** | `security-engineer` + project owner | Add to A-22 item 8 before Phase 1 ships |
| **RR-6** | Web loses the "already verified" signup branch (§5.1) | `product-manager` | Accept. It is the FR-5 posture |
| **RR-7** | Customer accounts created through GoTrue-direct web signup since web auth shipped have no backend `consentAccepted` evidence (A-5 §12) | `compliance-specialist` | Referral. This ADR fixes accounts created from Phase 1 on, not historic ones |
| **RR-8** | Every backend password grant creates a GoTrue session whose refresh token the backend discards and never logs out. The sessions build up in `auth.sessions` until GoTrue's time-box. They are not client-exposed | `backend-architect`; `database-architect` | Low. Note only. Revisit if A-22 item 6 finds no time-box is available on the plan |
| **RR-9** | Phase 4 cannot practically be reversed (§6) | `cto` | Gated by explicit Phase 4 exit criteria and a `cto` go decision |

---

## 10. Consequences

**Easier**
- One identity client per surface, one authority for every web session, and one place where policy
  runs. Web inherits the existing controls without duplicating any:
  - FR-11 lockout, the FR-12 audit, the SR-6 MFA gate;
  - SIGNUP and reset limiters, the consent check;
  - SR-8/FR-20 revocation and SR-007-1.
- `/auth/supabase/exchange`, `pendingSignupAuth`, PKCE handling and GoTrue error-string mapping are
  deleted, not maintained.
- **The bundle gets smaller.** It drops `@supabase/supabase-js` and its realtime client.
- **Feature 001's "structural win"** (no client can manipulate its own factors) becomes true again
  after Phase 4.
- **SR-4 becomes testable in CI** instead of resting on review.

**Harder / new obligations**
- Web signup gains a dependency on backend availability (RR-4).
- **Backend contract work** for G-1, plus the Phase 4 key operation, which needs a console session and a
  coordinated backend deploy.
- **The onboarding wizard's UX changes** (G-3): users sign in once after verifying.
- **Any future proposal to put a Supabase SDK in any client is an ADR-level reversal of this ADR.** It
  re-fires Feature 001 §13's trigger, and it may not be done ad hoc.

---

## 11. Revisit trigger

Reopen this ADR if any of the following happens:
- **A proposal to put any Supabase SDK or key in any client** (web, mobile or a new surface), for any
  reason, including Realtime, Storage (MP-5) or "just for one call".
- **A common registrable domain for web and API ships** (SR-12(c)/OI-10), or a same-origin `/api`
  rewrite is adopted. Then re-evaluate §3.2's httpOnly-cookie model, and reopen §4.2 for CSRF.
- **A-22 item 11 finds the legacy anon key cannot be disabled independently**, and rotating the JWT
  secret is judged unsafe. Phase 4's mechanism must then be re-decided, and the residual goes back to
  `cto`.
- **G-4 finds a backend `/verify` defect** that forces a contract change rather than a backend-internal
  fix.
- **RR-4 materialises.** Signup failure rates caused by backend cold starts become user-visible in
  monitoring.
- **ADR-0005 is ratified with a session-token model different from FU-18.** Re-check §4 against it.

---

## 12. Review and concurrence required

Proposed by `solution-architect`. Under `.cursor/rules/adr-process.mdc` and
`docs/organization/05-development-standards.md`, an ADR is ratified by `solution-architect` + `cto`.
As the author, this role's ratification is the proposal itself. Each reviewer records their position in a new
appended section (§14 onward). Nobody edits §§1–13 in place.

| Role | What their concurrence covers | Blocking for |
|---|---|---|
| `cybersecurity-architect` | Security review of the decision. Specifically: §3 rejections; §4.2 CSRF reasoning; §7's per-action mapping (author of A-5 and the INC-003 register); RR-1…RR-9 dispositions; whether Phase 4's exit criteria prove Layer 2 is closed. Stage 8 for every Phase 0–3 code change | Ratification; each phase |
| `authentication-engineer` | The §5 inventory against their concurrent A-16/reset work (append any rows already migrated); G-2 and G-3 feasibility; Phase 1 ownership | Ratification; Phase 1 |
| `compliance-specialist` | RR-7 (historic consent evidence); whether the cut-over changes any POPIA s19 position already open under INC-003 §7; whether Phase 3's purge or Phase 4's rotation needs any notice to data subjects or the operator agreement (Supabase DPA, still an open owner action) | Ratification |
| `cto` | Ratification, plus the decisions in §13 that only `cto` can make | — |
| Consulted, non-blocking | `backend-architect` (G-1, G-4, G-5, G-6; A-12 coordination); `frontend-architect` (§4.3, Phase 1 review); `mobile-architect` (§8, G-4 observation); `devops-engineer` + project owner (Phases 0, 3, 4 console and env work); `automation-qa-engineer` (A-11 guard); `qa-architect` (Stage 10 plan per phase) | — |

---

## 13. Open questions

**For `cto`**
- **Q-1 (A-9).** Do you explicitly accept the published-anon-key residual for the interval up to
  Phase 4, with a dated end? Or do you reject it, which would mean pulling web signup until Phase 1
  ships? Silent carry-over is not available (A-5 §10 item 4).
- **Q-3 (RR-4).** Accept the backend cold-start risk on web signup, or move the production backend off
  Render's free plan first? This ties to the paid-tier escalation already on your desk (Feature 001
  SR-22).
- **Q-4 (G-3).** Accept the onboarding change (verify via the link, then sign in once) instead of a
  status poll?
- **Q-5 (§4).** Ratify bearer-token web sessions now, with httpOnly cookies deferred until a common
  registrable domain exists?
- **Q-6 (§6).** What soak length between Phase 1 and Phase 3? The proposal here is 7 days. Do you want
  a go decision recorded before Phase 4?
- **Q-8.** A-21's draft date (2026-10-09) was missed. Hold or move the 2026-10-16 ratification date?
- **Q-9.** ADR-0005 (FU-18 session-token contract) is reserved, overdue and unwritten. This ADR leans on
  FU-18 without replacing it. Assign it a date?

**For the business owner (console access needed; no agent can do these)**
- **Q-2 (A-22 item 11).** Is the project on legacy `anon` / `service_role` keys or on the newer
  publishable/secret keys? Can the legacy anon key be disabled on its own? This decides Phase 4's
  mechanism.
- **Q-7 (Phase 3).** Is a one-time sign-out of all GoTrue sessions acceptable? Users keep their backend
  sessions, so the visible effect is limited to any MFA challenge in progress at that moment.
- **G-1 / G-4 console work.** Add the new web verification redirect URL to Supabase Auth's URL
  allow-list, and take part in the live `/verify` check.

---

*Filed by `solution-architect`, 2026-10-15, as INC-003 action A-21 (draft). This document is shared
and append-only once committed. Reviewers respond in new sections that cite the section they address.
The author corrects their own sections in place, keeping superseded text marked void.*
