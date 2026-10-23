# ADR-0014: Web Identity Goes Through the Backend Only — Remove `supabase-js` and Retire the Published Anon Key

Status: **Accepted** — ratified by `cto` 2026-10-16, with conditions (see §16). Discharges INC-003 action **A-21**.
Superseded status line (void, retained for audit): ~~Status: **Proposed** — not ratified. Discharges INC-003 action **A-21** (draft) once filed; ratification is `cto`'s.~~
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

## 14. `authentication-engineer` concurrence (2026-10-16)

This section cites §§2, 4, 5, 6 and 12, plus INC-003 §§18, 19 and 20. §§1–13 are unaltered.
`cybersecurity-architect`'s concurrence is recorded at INC-003 §19.4 and is not mirrored here.

> **Provenance, so `cto` can weigh it.** This section and §15 were prepared on 2026-10-16 at the
> orchestrator's direction, to unblock the 2026-10-21 ratification target (INC-003 §20.4). The session
> that wrote them is not an independent instance of `authentication-engineer` or `compliance-specialist`.
> Its standing role is in the architecture chain that authored this ADR. Every claim below was checked
> against the working tree on branch `claude/nice-bardeen-0j5x8y` on 2026-10-16. None is taken from §5's
> description or from INC-003 §18's self-report. If `cto` decides that a required concurrence must come
> from an independent session, either role may re-affirm, amend or withdraw this position in a later
> section. Nothing here is binding on them beyond what the code shows.

**Verdict: CONCUR WITH CONDITIONS.** No condition blocks ratification. Conditions AE-1…AE-4 are
**Phase 1 exit criteria**. AE-5 is a defect outside this ADR's scope, and the merge-readiness ruling
should hear about it.

### 14.1 What I read

- `backend/src/routes/auth.ts`:
  - signup `:77-156`;
  - verify-email `:161-201`;
  - resend `:206-261`;
  - exchange `:375-552`;
  - login `:557-707`.
- `backend/src/routes/session.ts:58-97`.
- `backend/src/db/supabase.ts`: `verifyPassword :243-256` and the signup `/verify` body `:447`.
- `backend/src/lib/sync-email-verification.ts:55-74`.
- `backend/src/repositories/audit-log.ts:41-63`.
- Web, customer:
  - `src/customer/supabase/auth.ts` (all of it);
  - `src/customer/api/auth.ts` (all of it);
  - `src/customer/auth/CustomerAuthProvider.tsx` (all of it);
  - `src/pages/onboarding/CustomerOnboardingPage.tsx:130-261`.
- Web, privileged dashboards:
  - `src/dashboard/api/auth.ts` and `src/dashboard/api/client.ts`;
  - `src/dashboard/auth/DashboardAuthProvider.tsx:55-91`;
  - `src/dashboard/auth/roleRouting.ts:95-140`.
- I did **not** re-run the test suites. The orchestrator's figures (backend 541/541, web 149/149) are
  in INC-003 §18.5.

### 14.2 Does the ADR describe what was actually built? Yes, with drift that is recorded here and not edited into §5

The §5 inventory was read at `62e973dd`, and its line numbers have since moved. The concurrency note at
the top of this ADR asks the reviewer to record migrated rows in an appended section. This is that
record.

| Row | State on this branch, 2026-10-16 (verified) |
|---|---|
| W-1 | **Unchanged, still live.** `getSupabase()` is still imported by `CustomerAuthCallbackPage.tsx:13` and `CustomerAuthProvider.tsx:86` |
| W-2 | **Migrated (A-16).** `signUpWithSupabase` is deleted (tombstone comment at `src/customer/supabase/auth.ts:151-154`). `signup()` at `src/customer/api/auth.ts:48-60` sends `consentAccepted` and `client: 'web'`. The backend route is at `auth.ts:93-156` |
| W-3 | **Migrated (A-16).** `resendVerificationEmail()` is at `src/customer/api/auth.ts:64-70`. The backend route is at `auth.ts:214-261`, with the per-IP limiter at `:218-222` |
| W-4 | **Still live.** `signInWithSupabase` (`src/customer/supabase/auth.ts:156-169`) is called from `CustomerAuthProvider.tsx:175-198`, which is reached from onboarding `:221` and `:248`. The MFA refusal that §5 places at onboarding `:228` is now at `:230` ("Use the login page") and `:254` ("Use the mobile app") |
| W-5 | **Removed (A-14).** There is no stored password. The verify step asks for the password once (`:214-241`). This is G-3's recommended option, now built |
| W-6 | **Still live:** `CustomerAuthCallbackPage.tsx:128` |
| W-7 | **Still live:** `CustomerAuthCallbackPage.tsx:155` |
| W-8 | **Still live:** `CustomerAuthCallbackPage.tsx:49` |
| W-9 | **Still live.** The client is at `src/customer/supabase/auth.ts:36-102`. The route has moved to `auth.ts:381-552`, and its watermark is at `:455-466` |
| W-10 | **Half done.** G-2 is fixed (see 14.3). The GoTrue global `signOut()` still runs after the backend logout (`CustomerAuthProvider.tsx:85-90`). Phase 1 removes it |
| W-12 | **Still live.** `mapSupabaseAuthError` is at `src/customer/supabase/auth.ts:267-300`. The "waking up" copy §9 RR-4 cites is now at `:250` |
| G-6 | **Half done.** Resend has its per-IP limiter (ratified at INC-003 §19.2). `/auth/verify-email` (`auth.ts:165`) still has none |

**Behaviour versus description.** §5.1 says `/auth/verify-email` "mints nothing". That is correct
(`:165-201`). §5.1 says signup's 202 is uniform. That is correct, and on this branch it is *more*
uniform than §5 assumed: the legacy case where an auth user exists with no account row also gets the
202, with no mail (`:116-126`). §5.2 G-4 describes the backend sending the link value in the `token`
field. That is correct: `db/supabase.ts:447` sends `{ type: 'signup', token: tokenHash, email }`, so
G-4's live check is still needed.

### 14.3 G-1 and G-2: correct as built

- **G-1.** Both routes use a closed `z.enum(['web','mobile']).optional().default('mobile')`
  (`auth.ts:84`, `:208`). `verificationRedirectFor()` (`:87-91`) picks a server-side env value and
  falls back to the mobile URL when `EMAIL_VERIFICATION_REDIRECT_URL_WEB` is unset. That matches
  INC-003 §18.2, but it differs from §18.2's description of `loadEnv()`'s fallback (production web
  callback) at the *route* level. Which fallback wins depends on whether `loadEnv()` fills
  `emailVerificationRedirectUrlWeb` before the route sees it. I did not trace `config/env.ts`. Either
  way, INC-003 §19.2's C-8 item 2 (set the value explicitly on staging) already makes the difference
  irrelevant. A caller-supplied URL cannot be read, because Zod strips unknown keys. **PASS**, matching
  INC-003 §19.1.
- **G-2.** `logout()` (`src/customer/api/auth.ts:174-176`) goes through the authenticated client.
  `signOut` calls it **before** clearing tokens, and a re-entrancy guard
  (`CustomerAuthProvider.tsx:66-91`) stops the `onSessionTerminated` loop. `POST /session/logout`
  (`session.ts:58-68`) revokes the session named by the bearer token, sets the KV JTI revocation and
  writes a `logout` audit row. The Phase 1 precondition is **met in code**. Deploy verification stays
  with `security-engineer` (INC-003 §19.5).

### 14.4 Session, token and MFA handling in the target state (§4): concur

- **One credential family.** After Phase 1, the web customer obtains sessions only from `/auth/login`
  (`:564-707`) or `/auth/mfa/challenge`. Both run FR-11 lockout (`:574-626`), the FR-12 audit, the
  `account_state` gate (`:648-651`) and SR-14(a)'s verified-factor gate (`:655-702`). That is exactly
  the path mobile and the privileged web already use.
- **The exchange's MFA parity work becomes moot.** SR-006-1 (`:468-547`) existed only because the
  exchange was a second minting path.
- **Device binding (FR-20) survives the move.** The web passes `getOrCreateWebDeviceId()` on login
  (`src/customer/api/auth.ts:78`) and on refresh (`CustomerAuthProvider.tsx:131`).
- **Surface classification.** Web customer sessions are classified under the `customerMobile` surface
  (`session.ts:27-29`). "The web customer session works exactly as mobile" (§4.1) is therefore
  literally true, idle TTL included. I record it so nobody later assumes a separate web-customer
  idle policy exists.
- **The access token stays in memory only,** as `cybersecurity-architect`'s condition 3 requires
  (INC-003 §19.4).
- **MFA enrolment.** The customer enrolment-ticket path on `/auth/login` (`:658-666`) is the same as
  the exchange's (`:478-488`), so Phase 1 needs no enrolment contract change. G-3 feasibility:
  confirmed, and already built (A-14).
- **Phase 1 ownership.** I accept it, with `frontend-architect` reviewing the callback and provider
  changes.

### 14.5 Conditions (Phase 1 exit criteria)

**AE-1. `/auth/login` must handle a correct password on an unverified account. Owners:
`authentication-engineer`, with `cybersecurity-architect` deciding the error shape.**
- **What happens today.** An unverified customer who uses the verify step's "Verified? Sign in"
  form before opening the link calls the browser password grant. The GoTrue error never reaches the
  backend's lockout counter.
- **What Phase 1 would do.** After Phase 1 the same attempt goes to `/auth/login`. GoTrue refuses an
  unconfirmed email's password grant with a 400. `verifyPassword` turns every 400 or 401 into `null`
  (`db/supabase.ts:248-250`), so the route answers `INVALID_CREDENTIALS` and **counts the attempt
  toward FR-11 lockout** (`auth.ts:599-625`).
- **The result.** The user just chose that password and is told it is wrong. The wizard invites
  retries, so they can lock themselves out. The `ACCOUNT_NOT_ACTIVE` branch the wizard relies on
  (`CustomerOnboardingPage.tsx:233-234`) becomes unreachable, because it only fires from the exchange
  (`auth.ts:439-442`).
- **Required before Phase 1 ships.** Distinguish GoTrue's `email_not_confirmed` from a bad password in
  `verifyPassword`. Then either:
  - **(a)** answer it with `ACCOUNT_NOT_ACTIVE` without counting a lockout failure; or
  - **(b)** keep the uniform `INVALID_CREDENTIALS` and change the wizard copy.

  Option (a) is an enumeration signal **only if** GoTrue checks confirmation before it checks the
  password. If it checks the password first, the signal is visible only to someone who already holds
  the password, which is the same exposure the exchange has today. **Confirm GoTrue's check order in
  G-4's live run before choosing (a).** Mobile already has this behaviour today. Fixing it in the
  shared route fixes both clients, which satisfies §2 item 2's no-fork rule.

**AE-2. The A-17 link-type allow-list and the backend-code error mapping must survive the directory
deletion.**
- **The risk.** §2 item 1 deletes `src/customer/supabase/` wholesale. §5 lists `notifyEmailAlreadyVerified`
  as moving. It does **not** list the following, which the callback still needs after Phase 1:
  - `ALLOWED_EMAIL_LINK_TYPES` (`:209`; the A-17 refusal of `magiclink`, `invite`, `email_change` and
    bare `email` links);
  - `mapAuthCallbackError`'s `ApiError`-code branches (`:247-259`);
  - `isVerificationLinkError` (`:140-149`).
- **Required.** Move them to `src/customer/api/` or the callback page, together with a test that the
  callback refuses a `magiclink` link **with no backend call**. Otherwise the deletion silently drops
  the A-13/A-17 control. That control is INC-003 deploy check C-6.

**AE-3. Phase 1 must purge stale GoTrue sessions from the browser.**
- **The gap.** `persistSession: true` has left a `sb-<project-ref>-auth-token` entry in the
  `localStorage` of every returning web customer. After Phase 1 no code reads it, and nothing removes
  it. It stays usable at Layer 2 until Phase 3 or 4 (§9 RR-3), and XSS can read it.
- **Required.** On mount, purge it the same way A-14 purges its legacy key
  (`CustomerOnboardingPage.tsx:160-167`): remove every `sb-*-auth-token` key, plus the PKCE
  code-verifier key.
- **Effect.** This shrinks RR-3 on the client side from "until Phase 3" to "until the user's next
  visit". It does not replace Phase 3's server-side purge.

**AE-4. Finish MFA completion in the onboarding wizard as part of W-4, not as follow-up.** Today both
wizard sign-in handlers turn away an `mfa` result (`:230`, `:254`). Once `/auth/login` is the only path,
the provider's `completeMfa` (`CustomerAuthProvider.tsx:200-206`) already exists, so wire it in. This
closes the A-20-adjacent dead end §5.1 W-4 already names.

### 14.6 AE-5: a defect outside this ADR, with the same class as G-2, on the privileged dashboards

**Privileged web sign-out never reaches the backend. Severity: Medium. Proposed as a new INC-003
action, owner `authentication-engineer`.**
- **The code.** `src/dashboard/api/auth.ts:51-57` sends `POST /session/logout` with
  `authenticated: false` and `{ refreshToken }` in the body. This is exactly the shape G-2 fixed on the
  customer side.
- **Why it fails.** `/session/logout` authenticates by bearer token only and ignores the body
  (`session.ts:58`). The dashboard client attaches no token when `authenticated` is false
  (`src/dashboard/api/client.ts:35-38`) and does not retry. `DashboardAuthProvider.signOut`
  (`:65-78`) swallows the 401, and it clears the tokens *before* making the call.
- **Effect.** An admin, security-company operator or call-centre agent who signs out gets a local
  sign-out only. The backend session stays valid until its 15-minute idle or 8-hour absolute
  expiry, and **no `logout` audit row is written for staff**.
- **Severity reasoning.** A stolen privileged refresh token, for example via RR-1 XSS, survives the
  victim's sign-out. That matters most on exactly the accounts SR-6 and ADR-0012 protect. The 15-minute
  idle window bounds the harm.
- **The fix is small, and the pattern already exists in this repo.** `roleRouting.ts:116-140` already
  revokes a stale privileged refresh token correctly: it refreshes, then logs out with the bearer
  token. Mirror G-2:
  1. call `logout()` through the authenticated client before clearing tokens;
  2. add a re-entrancy guard;
  3. add a test.
- **On scope.** This does not touch ADR-0014's decision. §1.3 and §4.3 call the privileged model
  "already backend-only", and that remains true. The *call* is backend-only; it just never succeeds.
- **Recommendation to `cto`.** Fix it on this branch before the merge in INC-003 §20.3. It is the
  same size as G-2, it carries less deploy risk than C-2 or C-8, and it closes a staff-account gap. If
  it is not fixed on this branch, register it.

### 14.7 Position on the remaining §12 items

- **Phases and order (§6).** Concur. I add the INC-003 §19.3 backfill to Phase 3. It matters to
  authentication as much as to security: once G-5 removes the exchange, an auth-only legacy user has
  **no** path to an account row. `/auth/login` would answer `INVALID_CREDENTIALS` (`:599`, because
  `findByEmail` returns null), and `/auth/signup` answers a mail-less 202 (`:123-126`).
- **G-5.** Concur. The watermark stays. `resolveCustomerAccountAfterSupabaseAuth`'s `emailConfirmed`
  branch is also used by `/auth/login` (`:633-638`, which passes `supabaseAuthSucceeded` only), so the
  helper stays and only the exchange's call site goes.
- **§9 RR-8.** Concur, Low. `/auth/login` already creates such sessions for every mobile and privileged
  login, so Phase 1 adds web volume, not a new class.

**Signed:** `authentication-engineer` capacity (see the provenance note), 2026-10-16. **CONCUR WITH
CONDITIONS.** AE-1…AE-4 are Phase 1 exit criteria. AE-5 is out of scope and referred to `cto` for the
merge ruling. Nothing here blocks ratification.

---

## 15. `compliance-specialist` concurrence (2026-10-16)

This section cites §§1.2, 6, 9 (RR-7) and 12. It also cites INC-003 §7, §18.2 and §20, A-5 §12, ADR-0006,
`compliance-review-supabase.md`, `10-data-protection-contract-obligations.md` and the CT-1 letter
(`correspondence/SENT-2026-09-14-ct-1-cross-border-consent-request.md`). §§1–14 are unaltered. The same
provenance note as §14 applies.

**Verdict: CONCUR WITH CONDITIONS.** Nothing in this ADR conflicts with an existing compliance ruling.
The ADR moves the platform *toward* positions that are already recorded. No condition blocks
ratification. CS-1 is a Phase 1 exit criterion. CS-2 is a Phase 3 precondition.

**This is not my concurrence on INC-003 §7.** That concurrence is separately owed, and it stays open
until A-6 returns (INC-003 §20.2).

### 15.1 What I read

- Feature 001 `business-requirements.md` §9.2: lawful basis for account creation.
- `compliance-review-supabase.md`:
  - §2 (data classification);
  - §4.3.1 (no cross-border consent checkbox);
  - §6.1–6.3 (the FR-12 record of authority; `auth.audit_log_entries` as an un-purgeable duplicate,
    OI-4).
- Feature 006 `business-requirements.md` PM-5: terms versioning, deferred to me.
- The CT-1 letter as sent: §B ¶3, the schedule.
- ADR-0006: AUD-1…AUD-12 and §10.
- `src/pages/PrivacyPolicyPage.tsx`.
- The backend signup, verify, resend and login routes, and the `AuditEventType` union
  (`backend/src/repositories/audit-log.ts:41-63`).

### 15.2 RR-7 (historic consent evidence): resolved as a POPIA question, re-scoped as an evidence question

- **The lawful basis does not rest on `consentAccepted`.** Feature 001 §9.2 rules that customer account
  creation runs on **s11(1)(b), necessity for a contract**. `compliance-review-supabase.md` §4.3.1
  reserves consent for genuinely optional processing. The signup checkbox ("accept the terms and
  privacy notice") is therefore an **acceptance of terms plus an s18 acknowledgement**, not
  s11(1)(a) consent.
- **Effect on historic accounts.** Web accounts created through GoTrue directly, without the backend's
  `z.literal(true)` check, are **not processed unlawfully on that account**. No remediation is needed
  for lawfulness.
- **The real gap is platform-wide.** The backend *validates* the checkbox but stores nothing: no
  timestamp, terms or notice version, or IP. This is true of every route, mobile and post-A-16 web
  included (INC-003 §18.2; PM-5). So **no account on the platform** has durable acceptance evidence.
  RR-7 is therefore not a web-cohort defect that this ADR could fix or leave unfixed. It is PM-5, which
  is already mine.
- **One cohort is genuinely different.** Accounts created through Layer 2, meaning a direct
  `/signup` call with the anon key and no client UI, have no acceptance at all, not even a client-side
  tick. They cannot be told apart from the rest.
- **Ruling.** When PM-5's versioned terms-acceptance record is built, **every account that has no
  record, from either cohort and on either client, is asked to accept at its next sign-in.** That one
  remedy covers RR-7, the A-5 §12 first bullet and the INC-003 §18.2 consent referral. It does not
  block this ADR, or Phase 1.

### 15.3 Processing description: the ADR makes the sent CT-1 schedule accurate

- **The mismatch today.** CT-1 §B ¶3 item 4, as sent to the Client, says the web dashboards "hold no
  personal information at rest — all data is fetched live from item 1" (Render). For web customer
  identity that is **inaccurate today**:
  - the browser calls item 2 (Supabase) directly;
  - it keeps a GoTrue session, which carries the email and user id, in `localStorage`.
- **What Phase 1 changes.** It makes the statement true.
- **No corrective letter is needed.** The *locations* are unchanged: Supabase in Frankfurt was already
  scheduled as item 2. No new operator is introduced. The defect is in how the data travels, not where
  it goes, so it does not alter the scope of the clause 19(c) consent sought.
- **Record-keeping.** Record this in the register (`10-data-protection-contract-obligations.md`) as a
  known inaccuracy, corrected when Phase 1 is deployed. I have not edited the register, because this
  task is scoped to this ADR.
- **Operators.** After Phase 1, web signup passwords pass through Render, as mobile's already do.
  Item 1 of the sent schedule already covers this ("all personal information … passes through these
  servers"). No change to an s21 operator agreement is needed. The Supabase DPA owner action is neither
  helped nor worsened by this ADR.

### 15.4 Privacy notice: no conflict, one forward constraint

`PrivacyPolicyPage.tsx` states that it does not yet cover account processing. The account-processing
notice is still owed (`compliance-review-supabase.md` C-7). This ADR therefore contradicts no published
notice.

**Forward constraint.** The C-7 notice must be written against the **post-Phase-1** flow:
- browser → our API → identity store;
- browser storage limited to the backend refresh token and the device identifier.

It must not describe the current direct flow. If C-7 ships before Phase 1, it must not claim the
browser never contacts the identity provider.

### 15.5 Audit trail and ADR-0006: no conflict; one gap this ADR makes worse

- **ADR-0006 is not engaged.** It governs privileged access to *another* account's data (AUD-1…AUD-12).
  Nothing in this ADR adds a privileged read, and Phase 3's purge is a system operation, not
  subject-data access. ADR-0006 §10's "ADR-0002 is not amended" holds here too.
- **FR-12 coverage improves.** After Phase 1, every web customer login is an `app.account_audit_log`
  event under FR-12, which is the record of authority under `compliance-review-supabase.md` §6.1. The
  exchange was audited as well, so for login this is parity, not a gain.
- **Minimisation gain.**
  - **What GoTrue sees.** The backend does not forward the end user's IP to GoTrue (`db/supabase.ts`
    has no `X-Forwarded-For`). After Phase 1, `auth.audit_log_entries`, `auth.sessions` and
    Supabase's edge layer therefore record the **backend's egress address**, not the data subject's,
    for web identity events.
  - **Why that matters.** It reduces the personal information going into the store
    `compliance-review-supabase.md` §6.2.1 found un-purgeable (OI-4). It also reduces what the
    Cloudflare-class sub-processors in §5 of that review see.
  - **Status.** Recorded as a benefit. It is not a reason to delay A-6, whose window predates all of
    this.
- **The gap. Condition CS-1, a Phase 1 exit criterion. Owners `backend-architect` +
  `database-architect`.**
  - **What is missing.** `AuditEventType` has **no** event for account creation, email verification or
    verification resend (`audit-log.ts:41-63`). The signup, verify and resend routes write no audit row
    (`auth.ts:93-261`).
  - **Before A-16,** those web events were in GoTrue's log, at least, with the subject's IP.
  - **After A-16 (already on this branch) and Phase 1,** they are in GoTrue's log under the backend's
    IP, and **in our own log not at all**.
  - **Effect.** "When, and from where, was this account created and verified?" can no longer be
    answered for web accounts. That question belongs in an s23 access response and in s22 breach
    scoping.
  - **Required:**
    - add `account_created` and `email_verified` (and `verification_email_resent` if wanted) to
      `app.audit_event_type`, by forward migration as `035` did;
    - write them with IP and user agent from `/auth/signup`, `/auth/verify-email` and
      `/auth/resend-verification`;
    - keep the uniform-response rule: the write must not change the response or its timing class;
    - when PM-5 is built, its acceptance record attaches to `account_created`.
  - **Retention.** This is the existing 12-month `app.account_audit_log` policy. No new retention
    ruling is needed.

### 15.6 Phase 3 purge and Phase 4 key retirement: no notice to data subjects, one sequencing precondition

- **No notice to data subjects for either phase.** Both are security measures:
  - neither changes the purpose of processing, a recipient, a location or the data collected, so s18
    is not engaged;
  - the only visible effect is a failed in-flight MFA challenge, at most (§13 Q-7), which is not a
    processing change that needs telling.
- **No notice to the Client under TDIT-2026-09 clause 19.** No operator is added or removed. A clause
  19(b) breach notice is triggered only if A-6, or A-22 item 12, finds exploitation (INC-003 §20.2).
  That does not depend on this ADR.
- **Condition CS-2, a Phase 3 precondition.**
  - **Sequencing.** Do not run Phase 3's purge until the A-6 queries and A-22 item 12's extended
    customer-account query have been run, or the table exported. The reasoning is `cto`'s, from
    INC-003 §20.2 about this branch's deploy: a system-generated sign-out writes into the exact table
    those queries read. A bulk purge would do so at scale.
  - **Mechanism.** I concur with `cybersecurity-architect` (INC-003 §19.4) that the purge should not
    write a per-user "login" row. From a compliance standpoint, each such row adds personal information
    to a log we cannot purge (OI-4), and it would show up as an unexplained sign-in in a subject's s23
    access response.
  - **If per-user sign-out is still chosen,** record the run window and the account count in INC-003, so
    that an access response and any breach scoping can exclude those rows.
- **Phase 4.** No compliance precondition beyond `cto`'s go decision. Retiring the key ends the
  INC-003 §7 s19 exposure at Layer 2 (see 15.7).

### 15.7 Effect on the INC-003 §7 position (not a determination on §7)

- **s19 (security safeguards).** This ADR is the structural s19 remediation for Layer 2. Until
  Phase 4, my position stays "s19 engaged, remediation in progress". `cto` accepted the A-9 residual
  with an end date of 2026-11-30 (INC-003 §20.4). I treat that date as the **s19 remediation date**
  for Layer 2. If the acceptance lapses under its own condition (iv), this position returns to "s19
  engaged, no dated remediation" and I re-assess.
- **s22.** Unchanged. It depends on A-6 and on A-22 item 12. Nothing in this ADR moves it.
- **RR-1** (refresh token in `localStorage`). I concur with `cybersecurity-architect` that A-15 is a
  Phase 1 exit criterion. It is also my s19 expectation for the only credential left on the web.

**Signed:** `compliance-specialist` capacity (see the provenance note in §14), 2026-10-16. **CONCUR
WITH CONDITIONS.**
- CS-1: audit events for account creation and verification, a Phase 1 exit criterion.
- CS-2: purge sequencing and mechanism, a Phase 3 precondition.
- RR-7 is resolved as stated in 15.2 and folded into PM-5.

Nothing here blocks ratification.

---

## 16. `cto` ratification (2026-10-16)

This section cites §§2, 6, 9, 11, 12 and 13, §14, §15, and INC-003 §19.4, §20.4 and §21. §§1–15 are
unchanged. The only other edit is the Status line at the top. Following the ADR-0008/0012 precedent,
the superseded line is kept there, marked void.

**Decision: RATIFIED. Status is now Accepted.** §2 items 1–6 are the binding direction for web
identity. Web reaches identity only through the backend; `supabase-js` and the published anon key
are removed on the §6 phases. This is five days ahead of the 2026-10-21 target in INC-003 §20.4.
Ratifying does **not** authorize starting any phase. Each phase still passes Stage 8 and Stage 10, as
§6 says. Phase 4 also needs the separate `cto` go decision in 16.4.

### 16.1 Concurrences: what I relied on, and the independence defect

- **`cybersecurity-architect` (INC-003 §19.4).** Concurs with conditions. It was prepared by a session
  dispatched as that role, and it is the security gate for this ADR. I adopt its conditions in full
  (16.3).
- **`authentication-engineer` (§14) and `compliance-specialist` (§15).** Both concur with conditions,
  and neither blocks. The §14 provenance note is accurate. Both sections were written by the
  orchestrating session, which sits in the chain that authored this ADR. Neither is an independent
  instance of either role. **A required concurrence written by the proposing chain is a weaker control
  than the one §12 specifies, and I am recording that rather than passing over it.**
- **Why I ratify anyway, rather than holding until 2026-10-21:**
  1. **I checked the load-bearing facts myself on `main` at `e646fbc`.** None of the following is taken
     from §14 or §15:
     - `client: z.enum(['web','mobile']).optional().default('mobile')` is at `backend/src/routes/auth.ts:84`,
       `:208` and `:806`, and `verificationRedirectFor` is at `:87` (G-1).
     - `verifyPassword` turns every GoTrue 400 or 401 into `null` (`backend/src/db/supabase.ts:248-250`).
       AE-1's lockout concern is therefore real.
     - `AuditEventType` (`backend/src/repositories/audit-log.ts:41`) has no `account_created` or
       `email_verified` member. CS-1's gap is therefore real.
     - The privileged `logout()` now goes through the authenticated `apiFetch`
       (`src/dashboard/api/auth.ts:51-58`). AE-5 is fixed in `ba525b0` and merged.
     - `@supabase/supabase-js` is still in `package.json:22`. Phase 1 has not started, as expected.
  2. **Neither concurrence objects to the decision.** Every condition either sharpens a Phase 1 or
     Phase 3 exit criterion or refers out a matter that is already tracked. An independent instance
     could add conditions, but a reversal of direction is unlikely: the security gate, which was
     independent, already concurs.
  3. **The ADR can be reversed until Phase 4, and Phase 4 has its own `cto` gate (16.4).**
  4. **Delay has a cost.** INC-003 §20.4 records it: the 2026-11-30 Phase 4 date anchors the A-9
     acceptance and, through §15.7, the s19 remediation date.
- **Conditions that come from this defect (binding):**
  - **I-1.** An **independent** session dispatched as `authentication-engineer` re-affirms, amends or
    withdraws §14 in a new appended section. Deadline: before the Phase 1 PR enters Stage 8.
    AE-1…AE-4 bind as Phase 1 exit criteria **now**. If the re-affirmation amends them, the amended
    form applies.
  - **I-2.** An **independent** session dispatched as `compliance-specialist` does the same for §15.
    Deadline: **before §15.2's RR-7 ruling is cited anywhere as a compliance determination**, and in
    any case before Phase 1 deploys. §15.2 is a substantive POPIA position: lawful basis s11(1)(b),
    with no remediation needed for historic accounts. It is not a concurrence detail, and it must not
    travel on non-independent provenance. CS-1 and CS-2 bind now.
  - **I-3.** If either independent session **withdraws** concurrence, this ADR comes back to `cto`.
    It does not revert to Proposed automatically, and no phase may start until I rule.
  - **I-4 (standing rule, from today).** A concurrence that §12, or any ADR's review table, marks as
    blocking for ratification must be written by a session dispatched as that role. It must not be
    written by the orchestrator or by the authoring chain. This ratification is the last exception,
    and it is recorded as one.

### 16.2 Answers to the §13 `cto` questions

- **Q-1.** Already ruled at INC-003 §20.4: ACCEPT, with conditions (i)–(iv) and Phase 4 by
  **2026-11-30**.
- **Q-3 (RR-4).** Accept the cold-start risk on web signup for Phase 1. Login already carries it. Moving
  off Render's free plan is the owner's cost decision under Feature 001 SR-22, and this ADR does not
  wait for it. The §6 Phase 2 soak criterion ("no rise in signup/login error rates") is the
  measurement. If it fails, the §11 RR-4 trigger fires.
- **Q-4 (G-3).** Accept: verify through the link, then sign in once. It is already built (§14.2 W-5).
- **Q-5.** Ratified: bearer-token web sessions now, with the access token kept in memory only.
  httpOnly cookies are deferred to the §11 trigger.
- **Q-6.** The soak is **7 days**, and exchange calls must be about zero for the final 72 hours (§6
  Phase 2). Phase 3 needs a recorded `cto` go decision as well as Phase 4. Phase 3's purge is
  user-affecting and is gated by CS-2.
- **Q-8.** Moot. Ratified today.
- **Q-9 (ADR-0005 / FU-18).** Assigned. The owner is the role that reserved it, or `solution-architect`
  if none did, with `authentication-engineer`. The draft is due **2026-11-13**, before Phase 4. If it is
  ratified with a token model different from FU-18, the §11 revisit trigger applies.

### 16.3 Consolidated exit criteria by phase (a list, not new requirements)

- **Phase 1 exit:**
  - AE-1…AE-4 (§14.5);
  - CS-1 (§15.5);
  - A-15, meaning CSP and `Referrer-Policy: no-referrer` deployed (INC-003 §19.4, condition 1);
  - the A-11 capability guard as a required Stage 8 check;
  - the RR-1 note that FR-20 device binding is not an XSS control (§19.4);
  - I-1 complete; I-2 complete before deploy.
- **Phase 3 precondition:**
  - CS-2: A-6 and A-22 item 12 queries run or the table exported first, and a purge mechanism that
    writes no per-user "login" rows, or the run window recorded;
  - the INC-003 §19.3 backfill;
  - a `cto` go decision.
- **Phase 4 go (`cto`, recorded in INC-003):**
  - §19.4's strengthened exit criteria: the old key is refused on `/signup`, `/recover`, `/resend`,
    `/otp`, `/verify`, `PUT /user` and `POST /factors`, not only on the password grant;
  - no other publishable or anon key is enabled;
  - the `auth-send-email` hook and the backend service-role path are confirmed working;
  - the A-22 item 11 key-format answer is on record;
  - §4.3's `sessionStorage` question is decided together with A-15.

### 16.4 Not decided here

- Starting Phase 1.
- The A-12 `recoveryAccessToken` removal (`backend-architect` with `mobile-architect`).
- Raising the customer password minimum to 14 (`product-manager`, INC-003 §20.4).
- INC-003 §7 (`compliance-specialist`, after A-6 returns).

**Signed:** `cto`, 2026-10-16. **RATIFIED with conditions I-1…I-4 and the criteria in 16.3.**

---

---

## 17. `authentication-engineer` independent concurrence (2026-10-16, satisfies I-1)

This section is written by a session dispatched specifically as an independent instance of
`authentication-engineer`, per `cto`'s I-1 condition (§16.1). **Provenance disclosure, so `cto` can
weigh it exactly as §14's own disclosure was weighed:** the file read that returned §§1–13 for this
review was paginated by the tool in a way that also returned §14's text in the same chunk, before the
code-reading step the task instructions specified. I did not selectively seek out §14 first, and every
substantive claim below was checked independently against the primary sources (the working tree, not
§14's prose) before being written here — §17.3's "AE-2, sharpened" and the dynamic-import finding in
the same section are not in §14 and were found by my own reading, which is evidence the check was
real and not a copy. But a reader should know the ordering guarantee the task asked for (form a
judgment, then read §14) was not perfectly achieved, and should weigh this section accordingly rather
than treating it as if §14 were never seen. It cites §§2, 4, 5, 6, 7, 9, 12 and 14, and was checked
against the working tree on `main` at `3ca8e03` (one commit past the `e646fbc` merge §16.1 cites).
§§1–16 are unaltered.

**Verdict: CONCUR WITH CONDITIONS — independently reached, same conclusions as §14.** AE-1…AE-4
stand as Phase 1 exit criteria, unchanged. AE-5 is confirmed already fixed on this branch (not a
condition going forward). No condition blocks ratification, which has in any case already been
given (§16).

### 17.1 What I read and verified myself

Read: §§1–13 of this ADR in full; then `backend/src/routes/auth.ts` (signup,
verify-email, resend, exchange, login, mfa/challenge, reset-password/request, reset-password/confirm,
reset-password/mfa-verify — all in full); `backend/src/db/supabase.ts:243-255` (`verifyPassword`);
`src/customer/supabase/auth.ts` (all of it); `src/customer/api/auth.ts` (all of it);
`src/customer/auth/CustomerAuthProvider.tsx` (all of it); `src/dashboard/api/auth.ts`;
`src/dashboard/auth/DashboardAuthProvider.tsx`. Every finding in §§17.2–17.4 below was checked
against these files directly, not taken from §14's description of them (see the provenance
disclosure above for the one respect in which this fell short of the task's intended ordering).

### 17.2 Does the ADR's description of what's built (G-1, G-2) match the code? Yes

- **G-1.** `backend/src/routes/auth.ts:77-91` (signup) and `:206-209` (resend) both carry a closed
  `client: z.enum(['web','mobile']).optional().default('mobile')`, resolved server-side by
  `verificationRedirectFor()` against `ctx.env.emailVerificationRedirectUrlWeb ??
  ctx.env.emailVerificationRedirectUrl` — no caller-supplied URL is accepted (Zod strips unknown
  keys before this point). The same discriminator pattern repeats for
  `/auth/reset-password/request` (`:804-833`), which is outside G-1's own line references but is the
  same control, already shipped, and worth recording since the ADR does not call it out by number.
  **Matches the ADR's description. PASS.**
- **G-2.** `src/customer/api/auth.ts:174-176`'s `logout()` is a plain `apiFetch('/session/logout', {
  method: 'POST' })` with no manual `authenticated: false` override, so it goes through the
  authenticated client, attaches the bearer token, and will refresh-and-retry once on a 401 inside
  `apiFetch` (per the comment at `:164-172`). `CustomerAuthProvider.tsx:67-91` calls this before
  clearing local tokens, under a re-entrancy guard, then does a best-effort GoTrue global sign-out
  after. This is a real fix, not merely claimed: before it, `logout()` sent an unauthenticated body
  that `/session/logout` (bearer-only, per its own `authenticate` middleware) could never act on.
  **Matches. PASS.**

### 17.3 Auth/session/MFA defects: did §14 miss or mischaracterize anything?

I looked specifically for anything a prior pass might have missed, not only for confirmation of what
it found.

- **AE-1 (unverified-account login counts toward lockout) — independently reproduced.**
  `verifyPassword` (`backend/src/db/supabase.ts:243-255`) turns every GoTrue 400 *or* 401 into a bare
  `null`, with no way for the caller to tell `email_not_confirmed` apart from a wrong password. In
  `/auth/login` (`auth.ts:588-626`), a `null` verification always falls into
  `recordLoginFailure(...)`, which counts toward FR-11 lockout, regardless of which GoTrue reason
  produced it. This is real today, and it is real for mobile and privileged web as well, not only the
  web cutover — the ADR's framing of AE-1 as something Phase 1 "surfaces" rather than introduces is
  correct. I find no additional wrinkle here beyond what §14.5 AE-1 already states, including its
  caveat that option (a)'s enumeration risk depends on GoTrue's check order and needs a live G-4
  check before being chosen.
- **AE-2 (callback-page controls undocumented for deletion) — independently confirmed, and I'd
  sharpen the severity.** `src/customer/supabase/auth.ts` holds three things with no listed migration
  path in §5: `ALLOWED_EMAIL_LINK_TYPES` (`:209`, the A-17 allow-list that refuses `magiclink`,
  `invite`, `email_change` and bare `email` link types before any SDK call is even made),
  `mapAuthCallbackError` (`:247-265`), and `isVerificationLinkError` (`:140-149`, imported by
  `CustomerSignupPage.tsx` and `CustomerOnboardingPage.tsx`, not only the callback page — one more
  caller than §14.5 AE-2 names). §2 item 1 of this ADR instructs deleting
  `src/customer/supabase/` wholesale. If that deletion lands without relocating these three, the
  callback page loses the A-17 pre-SDK-call refusal silently — a web build would still compile (TS
  would catch the missing import, but only if the replacement call site is written correctly), and a
  regression here reopens exactly the login-CSRF-adjacent class this ADR is meant to close at §4.2. I
  concur with AE-2 as a hard Phase 1 exit criterion, and add: the Stage 10 plan for Phase 1 should
  include an explicit test that a `magiclink`-typed callback URL is refused with **no** `fetch` or
  Supabase call made (not just that it's refused), so the guard can't regress to "refused after
  calling GoTrue anyway."
- **AE-3 (stale `sb-*-auth-token` purge) and AE-4 (wire up `completeMfa` in onboarding) — I concur with
  both as stated; I found nothing to add or subtract.** On AE-3, I'll note one thing in the
  conditions' favor: `getOrCreateWebDeviceId()` and the CUSTOMER_REFRESH_STORAGE_KEY are
  already namespaced apart from Supabase's own `sb-<project-ref>-auth-token` key, so a wildcard
  `sb-*-auth-token` removal cannot collide with the backend's own refresh-token storage key. That
  makes AE-3's purge safe to implement exactly as scoped.
- **AE-5 (privileged sign-out never reached the backend) — I verified this is now fixed, not merely
  open.** `src/dashboard/api/auth.ts:51-59`'s `logout()` is the same unauthenticated-no-more shape as
  the customer fix, and the file carries its own comment dating it to this ADR's §14.6 and to a
  mirrored fix of G-2. `git log` shows `ba525b0 fix(web): AE-5 — privileged (admin/security/support)
  sign-out never reached the backend` already merged, one commit before `e646fbc`, which is itself
  one commit before the current `HEAD`. **AE-5 is closed on `main` as read.** I did not find a
  defect in the fix itself: `DashboardAuthProvider.tsx:73-91` mirrors the customer provider's
  re-entrancy guard and call-before-clear ordering exactly.
- **One item I did not find pre-flagged anywhere in §§1–16, and want to raise on my own
  authority, not as a blocking condition:** `CustomerAuthProvider.tsx:85-90`'s post-logout GoTrue
  `signOut()` call is wrapped in `const { getSupabase } = await import('../supabase/client')`, a
  dynamic import done *after* the backend logout has already completed and local tokens are already
  cleared. Once Phase 1 deletes `src/customer/supabase/` entirely (§2 item 1, W-10), this dynamic
  import will break at build time if the line itself is not deleted in the same change — which the
  ADR's own W-10 row already says to do ("Phase 1 removes it", §14.2). I raise this only to record
  that the removal is not optional cleanup but a hard compile-time dependency: Phase 1 cannot ship
  with `src/customer/supabase/` deleted while this call site survives. This is consistent with, not
  contrary to, what the ADR already requires — I note it because an implementer skimming only the
  inventory table might treat W-10's deletion as a nice-to-have rather than something the build
  itself will enforce.

### 17.4 Session, token and MFA handling in the target state (§4): concur, independently

Checked directly, not taken from §14: after a hypothetical Phase 1, the only two session-minting
routes for web customers become `/auth/login` and `/auth/mfa/challenge`, both of which already run
FR-11 lockout, the FR-12 audit, the `account_state` gate, and SR-14(a)'s verified-factor gate
(`auth.ts:574-702`). This is identical to what mobile already does. The access token lives in memory
only on both the customer and dashboard providers (`accessToken` is component state, never written to
`localStorage` or `sessionStorage` by either provider — I checked `writeRefreshToken`/`readRefreshToken`
on both files and confirmed they handle only the *refresh* token). Device binding (FR-20) is attached
on both login and refresh for web customers via `getOrCreateWebDeviceId()`. I find the §4 target model
sound and already load-bearing elsewhere in this codebase, not a new, untested pattern being proposed
for web alone.

### 17.5 Verdict on the Phase 1 plan

**CONCUR WITH CONDITIONS**, independently arrived at:
- AE-1, AE-2, AE-3, AE-4 (§14.5, this section's §17.3) stand as Phase 1 exit criteria.
- AE-2 is sharpened: the Stage 10 plan should test the pre-SDK-call refusal itself, not only the
  refusal's outcome, and the relocation must account for all current importers of
  `isVerificationLinkError`, not only the callback page.
- AE-5 is confirmed closed on `main` — no outstanding condition.
- CS-1 and CS-2 (§15, compliance-specialist's conditions) are outside this role's remit to re-verify,
  but I independently confirmed the underlying fact CS-1 rests on: `AuditEventType`
  (`backend/src/repositories/audit-log.ts:41-63`) has no `account_created` or `email_verified` member,
  and none of `/auth/signup`, `/auth/verify-email`, `/auth/resend-verification` writes an audit row
  today (grep of `auditLog.record` call sites in `auth.ts` turns up none before line 457, i.e. none
  in signup/verify/resend).
- Nothing here blocks ratification, which `cto` has already given (§16). This section discharges
  condition **I-1**.

**Signed:** `authentication-engineer`, independent session, 2026-10-16. **CONCUR WITH CONDITIONS,**
same substance as §14, verified independently against primary sources (code, not §14's text) — with
the ordering caveat disclosed at the top of this section.

---

## 18. `compliance-specialist` independent concurrence (2026-10-16, satisfies I-2)

Written by a session dispatched as an independent instance of `compliance-specialist`, per `cto`'s
condition I-2 (§16.1). It cites §§1.3, 2, 5, 6, 9 (RR-7), 12, 15 and 16. It was checked against the
working tree on `main` at `3ca8e03`. §§1–17 are unaltered.

**How the review was done.** I read the sources in this order: §§1–13 of this ADR; Feature 001
`business-requirements.md` §§3, 4 and 9; `10-data-protection-contract-obligations.md` §§1–10; the
CT-1 letter as sent; ADR-0006 §0 and AUD-1…AUD-12; `PrivacyPolicyPage.tsx`; and the backend
signup, verify, resend, notify-email-verified and account-repository code. I formed the findings in
18.2–18.6 before I read §15's text. Two facts about the order, stated so `cto` can weigh them: a
heading listing of this file, taken to find §§1–13, showed §15's subsection titles. My dispatch
message also summarised §15's RR-7 conclusion in one sentence. I read §15's body only after the
source reading, and §17 only to place this section.

**Verdict: CONCUR WITH CONDITIONS.** I independently reach §15's conclusions on every point. On
three points I amend them (18.2, 18.4, 18.6). None of the amendments reverses the decision, and none
blocks anything this ADR does. **§15.2's RR-7 ruling may now be cited, but only together with 18.2,
which narrows what it establishes.** This section discharges **I-2**.

### 18.1 What I verified in code (on `main`, `3ca8e03`)

- **The consent gate exists but leaves no trace.** `consentAccepted: z.literal(true)` is at
  `backend/src/routes/auth.ts:80`. Nothing persists it: there is no `consent` match anywhere in
  `backend/src` outside that schema line, its tests and the unrelated location-consent log.
  `createCustomerAccount` (`backend/src/repositories/accounts.ts:197-207`) inserts id, type, state and
  email only.
- **The checkbox copy.** It reads *"I agree to the Terms of Service and Privacy Policy"*
  (`src/pages/CustomerSignupPage.tsx:157-167`) and *"I agree to the Terms and Privacy Policy"*
  (`src/pages/onboarding/CustomerOnboardingPage.tsx:438-441`). It is a single, mandatory box.
- **The linked notice.** `src/pages/PrivacyPolicyPage.tsx:37-41` says the policy *"does not yet
  cover every type of processing an account involves."*
- **Web signup and resend already go through the backend** (A-16: `src/customer/api/auth.ts:48-57`
  sends `consentAccepted` and `client: 'web'`). Web **login** on the onboarding wizard still uses
  `signInWithSupabase` and the exchange (`CustomerAuthProvider.tsx:177`). The GoTrue session in
  `localStorage` is therefore still live for that path.
- **Four writers create a customer account or activate it, and none of them writes an audit row:**
  - `/auth/signup` (`auth.ts:129`);
  - `/auth/verify-email` (`:189`);
  - `/auth/notify-email-verified`, which **creates** the `app.accounts` row for a GoTrue-only user
    (`:337`) and activates it (`:342`);
  - the exchange (`:410`), until Phase 3 removes it.

  `markEmailVerified` (`accounts.ts:262-268`) changes `pending_verification` to `active` and writes
  no `app.account_state_transitions` row. `AuditEventType` (`audit-log.ts:41-63`) has no creation or
  verification member.
- **Unverified identities are never deleted.** I found no deletion or retention job for accounts
  that are never verified, nor for GoTrue users that have no `app.accounts` row, in `backend/src` or
  `backend/migrations`. The code itself states that such orphans exist (`auth.ts:116-126`).
- **The backend does not pass the end user's IP to GoTrue.** `backend/src/db/supabase.ts` has no
  forwarded-IP header.
- **Two log lines carry a plaintext email address:** `auth.ts:136-139` (signup email failure) and
  `:357-360` (notify-email-verified). Both go to Render's logs. The resend route at `:250-253` logs
  the account id instead.

### 18.2 RR-7: I concur with the lawful-basis ruling, and narrow what it establishes

**Agreed, reached independently.**
- Feature 001 §9.2 rules that customer account creation runs on **POPIA s11(1)(b)**: processing
  necessary for actions to conclude a contract the data subject is seeking. It does not run on
  consent.
- §9.2 also forbids treating a bundled, mandatory tick as consent. The shipped checkbox is exactly
  that: one mandatory box covering the terms and the privacy policy. So it **cannot be s11(1)(a)
  consent on any cohort.** What it can be is evidence that the user accepted the terms and saw the
  notice.
- The historic GoTrue-direct web cohort therefore does **not** lack a lawful basis because it
  skipped the server-side `z.literal(true)` check. That check was never the basis.
- §15.2's further point is also correct. Because the backend stores nothing, **no account on any
  client** holds durable evidence of accepting the terms. The gap is platform-wide (PM-5). It is not
  specific to the web cohort.

**Amendment 1: scope. "Not unlawful on that account" covers s11 only.** POPIA lawfulness requires
all eight conditions in Chapter 3, and s18 (openness) is **not** met for any account on any cohort:
- the only notice linked at signup states that it does not cover account processing;
- the account notice (`compliance-review-supabase.md` C-7) remains unshipped.

This does not make the historic cohort worse than any other cohort. It does mean that no document
may cite §15.2 or this section as "historic accounts are POPIA-compliant." The correct statement is:
*"the s11 lawful basis for account creation does not depend on the consent checkbox, for any
cohort; the s18 notice remains owed for every cohort under C-7."* The CT-1 §9.3 containment (no
real customer PII until CT-1 closes) is what keeps this a pre-go-live gap and not a live one. I
cannot verify from the repository that the containment has held.

**Amendment 2: s11(1)(b) assumes the data subject started the signup. For never-verified accounts,
nothing shows that.**
- **Why the basis is weak there.** s11(1)(b) covers processing done *at the data subject's
  request*. A signup can be submitted for someone else's address through the backend
  (`consentAccepted: true` is just a field in the request) or through Layer 2 (C-3). Until the
  address holder verifies, nothing shows they asked for anything.
- **Why §15.2's remedy does not reach them.** Asking for acceptance at next sign-in never reaches
  an address holder who never verifies and never signs in.
- **The remedy is retention limitation (s14), not consent.** That is condition **CS-4** below. It
  applies to every client and every route, not only the web cohort.
- **Verified accounts are different.** Verifying is an act by the address holder. For them,
  s11(1)(b) together with the PM-5 re-acceptance is sufficient, as §15.2 says.

**Amendment 3: under the operator framing, this ruling is our analysis and the Client adopts it.**
- **The ruling predates the contract framing.** Feature 001 §9.2 (2026-08) was written as if the
  platform were the responsible party. Under TDIT-2026-09 the Client is the responsible party and
  NextWave is the operator (`10-data-protection-contract-obligations.md` §1). The responsible party
  chooses the lawful basis.
- **The conclusion stands either way.** It does not change if the Client adopts it.
- **It must still be recorded.** `11-documented-client-instructions.md` does not mention the lawful
  basis for account creation. Recorded as a referral to the CT-4 follow-up (**CS-5**).

**PM-5 copy constraint (my authority over consent and disclosure copy).** When PM-5 builds the
versioned acceptance record, it must replace the single box with two distinct elements:
- an acceptance of the **Terms of Service**, which is the contract;
- an acknowledgement that the user has **read the Privacy Notice**, which is s18.

Neither may be worded as "agree to the Privacy Policy." Users read a privacy notice; they do not
agree to it. Wording it as an agreement repeats the consent/notice confusion that RR-7 grew out of.

### 18.3 CS-1 and CS-2: still accurate. Re-affirmed, with CS-1's scope corrected

- **CS-1: accurate.** The union has no creation or verification event, and the routes write none
  (18.1). **Scope correction:** CS-1 as written names three routes. It must cover **every writer in
  18.1**, including `/auth/notify-email-verified` (`:337`, `:342`) and the exchange (`:410`) while
  it lives. Otherwise the route that backfills historic GoTrue-only accounts leaves no trace of the
  backfill. Where the write goes (route or repository) is `backend-architect`'s call. Two
  constraints apply:
  - the uniform-response rule (SR-006-2) binds `/auth/notify-email-verified` exactly as it binds
    signup;
  - the write must not create a timing difference between branches.
- **CS-1 retention: I concur with 12 months for the IP/user-agent-bearing audit rows.** I add one
  recommendation, which does not block Phase 1:
  - **The issue.** Activation is a BR-5 state change.
    `compliance-review-supabase.md` §6.1.2 puts state transitions on a separate, longer FU-04 clock.
    Activation should therefore also be written to `app.account_state_transitions`. The schema
    appears to allow a null actor: the watermark query at `sessions.ts:160-161` filters
    `actor_account_id is not null`.
  - **Why it matters.** Without that row, "when did this account become active" cannot be
    answered after 12 months, because `markEmailVerified` overwrites only `updated_at`.
  - **Owner.** `database-architect`, decided with FU-04.
- **CS-2: accurate, and more urgent than when written.**
  - **Status of A-6.** The INC-003 register still shows A-6 as **OPEN** (INC-003 line 224). Yet
    `main` contains the `e646fbc` merge, whose backend sign-out writes system "login" rows into
    `auth.audit_log_entries` (INC-003 §20.2).
  - **What I cannot verify.** I cannot tell from the repository whether the A-6 queries or a table
    export ran before that merge.
  - **If they did not.** The pollution CS-2 guards against has already started at small scale, and
    the export is due now, not at Phase 3.
  - **Addition to CS-2.** Phase 3's purge will be run by a human holding a privileged credential
    against the identity store. Record it the way INC-003 §21 recorded production access: who ran
    it, which credential, what ran, the time window and the number of affected users. Do it under
    the CT-4 instruction regime. Do not pass a production credential through agent chat (§21's
    standing rule).

### 18.4 CT-1: no conflict. One forward note on the CT-1b addendum

- **Route, not location.** I agree with §15.3. CT-1 §B ¶3 item 4 says web data "is fetched live
  from item 1". That is inaccurate today for customer web login only, because the browser calls
  item 2 directly. The error is in the route, not the location. Item 2 (Supabase, Frankfurt) was
  scheduled, no operator is added, and the consent sought for items 1, 2, 5 and 6 is unaffected.
- **No corrective letter is needed.**
- **The schedule stays inside what was sought after Phase 1:**
  - Supabase will see the backend's egress IP, not the data subject's. That narrows item 2.
  - Plaintext signup passwords will transit item 1, as mobile's already do.
  - CS-1's new audit rows are "IP addresses … authentication audit records", already listed in
    item 2.

  No supplementary disclosure is triggered.
- **Forward note on CT-1b.** If the CT-1b signed addendum is executed **before** Phase 1 deploys,
  its annexed schedule should carry one accurate line on item 4: until Phase 1, customer web sign-in
  contacts item 2 directly. §A of the letter sets the standard: "a consent obtained on a wrong
  schedule is not consent to what we actually do." The error does not change the scope of consent,
  but a signed annex should not repeat a known inaccuracy.

### 18.5 ADR-0006: no conflict. I agree with §15.5

- **ADR-0006 is not engaged.** It governs privileged access to another account's data, and this
  ADR adds no privileged read path.
- **The effect is positive.** After Phase 1 every web customer session is backend-minted, so
  AUD-1's `actorSessionId` is always available. AUD-4's server-derived-identifier rule loses a
  parallel GoTrue session that it never governed.
- **Caveat on CS-1's rows.** They will be written by a credential that INC-003 §21 found to be
  `rolbypassrls` and able to `UPDATE`/`DELETE` the audit table. AUD-11 is unenforced, as RR-6 of
  ADR-0006 already records. CS-1 is still required. Until SR-3 lands, though, its rows are not
  tamper-evident, and no s23 response or s22 scoping may present them as if they were.

### 18.6 Privacy notice, Phase 3/4 notices, and INC-003 §7

- **Privacy notice.** I concur with §15.4, including the forward constraint that C-7 must describe
  the post-Phase-1 flow.
- **Phases 3 and 4.** I concur that neither phase needs notice to data subjects under s18 or to the
  Client under clause 19. Both are security measures that change no purpose, recipient, location or
  data category.
- **INC-003 §7.** §15.7 states a working s19 position and correctly disclaims it as not a
  determination on §7. I re-affirm that disclaimer and do not extend it. INC-003 §7 stays open until
  A-6 returns.
- **Amendment.** §15.7 treats `cto`'s 2026-11-30 A-9 date as the Layer 2 s19 remediation date. That
  holds only while the A-9 acceptance holds. Its condition (ii) is the A-22 console session by
  **2026-10-22**, and A-6 has no recorded run (18.3). If 2026-10-22 passes without that session, the
  acceptance lapses, and the s19 position returns to "engaged, no dated remediation" on that date.
  It does not wait for 2026-11-30.

### 18.7 Conditions

| ID | Condition | Owner | When |
|---|---|---|---|
| **CS-1** *(re-affirmed, scope corrected, 18.3)* | Audit events for account creation and activation. Write them from **every** writer in 18.1, including `/auth/notify-email-verified` and the exchange while it lives. Uniform-response and timing constraints apply. 12-month retention | `backend-architect` + `database-architect` | Phase 1 exit (unchanged) |
| **CS-2** *(re-affirmed, extended, 18.3)* | Before any purge, run the A-6 and A-22 item 12 queries or export the table. Use a mechanism that writes no per-user "login" rows, or record the run window. **Added:** an INC-003 §21-style execution record. **Urgency raised:** if A-6 did not run before the `e646fbc` merge, export now | `security-engineer` + project owner; `devops-engineer` | Phase 3 precondition; export **now** |
| **CS-3** *(new, recommended)* | Replace the plaintext email in `auth.ts:136-139` and `:357-360` with the account id, as `:250-253` already does. Phase 1 sends all web signup traffic through `:136-139` | `backend-engineer` | Phase 1. Non-blocking |
| **CS-4** *(new, 18.2 Amendment 2)* | **Retention for never-verified identities.** Delete any customer account still in `pending_verification` 30 days after its last verification email. Also delete any GoTrue user with no confirmed email and no `app.accounts` row 30 days after creation. Both the `app.accounts` row and the `auth.users` row go. Use an automated, logged job, per Feature 001 §9.3's method. The 30-day figure is my ruling as operator, to go into the CT-4 instruction set for the Client's adoption | `database-architect` + `backend-architect` | Before the CT-1 containment lifts (go-live). Not a Phase 1 criterion |
| **CS-5** *(new, referral)* | Record the s11(1)(b) basis for customer account creation, with 18.2's narrowing, in the CT-4 documented-client-instructions follow-up for the Client's adoption | `compliance-specialist` + `cto` | With the next CT-4 revision |
| PM-5 copy constraint | Two separate elements, terms acceptance and privacy-notice acknowledgement, never "agree to the Privacy Policy" (18.2) | `compliance-specialist` with `ui-designer` | When PM-5 is built |
| CS-1b *(recommendation)* | Also record activation in `app.account_state_transitions` on the FU-04 clock (18.3) | `database-architect` | With FU-04 |

**Signed:** `compliance-specialist`, independent session, 2026-10-16. **CONCUR WITH CONDITIONS.**
- I independently reach §15's conclusions on RR-7, CS-1, CS-2, CT-1, ADR-0006 and Phases 3 and 4.
- RR-7 is narrowed by 18.2. Cite this section together with §15.2, never §15.2 alone.
- CS-1 and CS-2 are re-affirmed, with CS-1's scope corrected and CS-2 extended.
- CS-3, CS-4 and CS-5 are added. None reverses the decision, and none blocks ratification or
  Phase 1, except that CS-1 remains a Phase 1 exit criterion.
- This section discharges **I-2**.

---

## 19. `cybersecurity-architect`: RR-1 note — FR-20 device binding is not an XSS control (2026-10-23)

This section is the note asked for in INC-003 §19.4 ("State it in RR-1 so nobody counts it as a
control"). §16.3 (line 927) lists it as a Phase 1 exit criterion. It **annotates the §9 RR-1 row
and does not change it.** RR-1 stays as written: not accepted by this ADR, tracked under A-15 and
ADR-0011. §§1–18 are unaltered. Checked against `main` at `5ce0b0a`.

### 19.1 The statement

**FR-20 device binding does not mitigate RR-1, and must not be cited as a control against XSS on
the web origin, in any review, risk acceptance, Stage 8 sign-off or incident record.**

- **What FR-20 covers.** A refresh token is stolen and then replayed from a *different* device
  (Feature 001 `business-requirements.md` FR-20: "reduce token-theft blast radius").
  `/session/refresh` revokes the family and the account's sessions when a presented `deviceId`
  differs from the stored one (`backend/src/lib/refresh-session.ts:228-235`).
- **What RR-1 is.** Attacker script runs **in the victim's own browser, on our origin**. That is a
  different threat, and FR-20 does nothing against it, for three reasons:
  1. **The binding value sits next to the token.** `getOrCreateWebDeviceId()` keeps the device id
     in `localStorage` under `td-customer-web-device-id` (`src/customer/auth/deviceId.ts:1-10`).
     The customer refresh token is in the same `localStorage` (`CustomerAuthProvider.tsx:43-54`).
     A script that can read one can read both, and can replay the pair from anywhere with no
     mismatch.
  2. **The attacker need not leave the victim's browser.** Injected script can call
     `/session/refresh` and any API in place, with the real device id. There is no "other device"
     for FR-20 to detect.
  3. **Omitting the id skips the check.** The comparison runs only when a `deviceId` is presented
     (`refresh-session.ts:228`). A missing one is deliberately not a mismatch
     (`refresh-session.test.ts:324`). A thief who drops the field avoids FR-20 without stealing the
     id at all. This is a corollary of Feature 001 `security-review.md` R-5 (a client-supplied
     `device_id` is not an authenticator), and it already limits FR-20 against off-device replay,
     not only XSS.
- **The privileged per-tab token is not covered by FR-20 at all.** The dashboard clients send
  `deviceId: null` on login and refresh (`src/dashboard/api/auth.ts:34`,
  `DashboardAuthProvider.tsx:138`, `src/dashboard/api/client.ts:85`, `roleRouting.ts:121`).
  RR-1's privileged half has no device-binding layer to over-count.

### 19.2 What does bear on RR-1

These are the controls RR-1 may cite. None of them closes it.
- **A-15**: CSP and `Referrer-Policy: no-referrer`, both in `vercel.json:10-15`. This is the main
  control (INC-003 §19.4 condition 1).
- **The access token is held in memory only** (INC-003 §19.4 condition 3; verified in §17.4).
- **SR-8 rotation-reuse detection.** It helps only after the legitimate client has rotated past a
  stolen token. Against a token used in-browser before rotation, it gives nothing.
- **The token lifetimes**: the customer 90-day absolute cap, and the privileged 8 h absolute and
  15 min idle limits. These bound how long a stolen token lasts. They do not stop the theft.
- **ADR-0011**: the accepted risk of a shared origin.

**One observation for the A-15 owners.** It is not a new condition. `connect-src` allows
`https://*.onrender.com` and `https://*.supabase.co` (`vercel.json:11`). Anyone can host an app on
those suffixes, so the CSP does **not** block exfiltration of a stolen token to an attacker-owned
Render or Supabase host. CSP's real value against RR-1 is `script-src 'self'`, which blocks injected
inline and third-party script. Do not describe CSP as an exfiltration control while those wildcards
remain. Narrowing them to the exact backend and project hosts is the obvious hardening step. It
belongs to `security-engineer`/`frontend-architect` under A-15, and it must not reopen the A-15
criterion, which has been met.

### 19.3 Disposition

- The §16.3 Phase 1 exit item "the RR-1 note that FR-20 device binding is not an XSS control
  (§19.4)" is **met by this section.**
- RR-1 itself stays **open and not accepted**. The owners are `cybersecurity-architect` and
  `frontend-architect`. It is next revisited with the §4.3 `sessionStorage` decision, taken
  together with A-15 before Phase 4 (§16.3).

**Signed:** `cybersecurity-architect`, 2026-10-23.

---

*Filed by `solution-architect`, 2026-10-15, as INC-003 action A-21 (draft). This document is shared
and append-only once committed. Reviewers respond in new sections that cite the section they address.
The author corrects their own sections in place, keeping superseded text marked void.*
