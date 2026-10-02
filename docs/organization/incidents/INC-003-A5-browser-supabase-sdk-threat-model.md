# INC-003 A-5 — Threat model: the browser-resident Supabase SDK and the Supabase project surface it exposes

- **Parent:** [`INC-003-web-password-reset-control-bypass.md`](INC-003-web-password-reset-control-bypass.md) §2.5, §6 A-5, §10 item 4.
- **Honours:** Feature 001 [`security-review.md`](../../features/001-authentication/security-review.md) §13 re-threat-model trigger *"any client-side Supabase SDK proposal (which would reverse FU-18 and make RLS front-line again)"*.
- **Author / owner:** `cybersecurity-architect` · **Date:** 2026-10-02 · **Status:** FILED. Findings are registered as INC-003 actions **A-8 … A-23** (INC-003 §11; summary register in §13 below).
- **Method and honesty note.** Every repo statement below comes from reading the source on 2026-10-02, with a file:line cited. Statements about GoTrue behaviour come from the **upstream `supabase/auth` source (master)**, read this session, and are labelled *upstream*. The hosted project's GoTrue version is recorded in `supabase/.temp/gotrue-version` as **v2.195.0** (written at last CLI link; not re-verified live). **I did not inspect the live Supabase project, dashboard, logs or bundle.** Anything that depends on dashboard state is marked **requires console** and becomes a verification item (§7), not an assumed pass. No code was changed.
- **Scope boundary.** Out of scope, per the tasking: code changes; A-6 and the console session itself; compliance determinations (flagged to `compliance-specialist`, §12); re-rating INC-003 (flagged to `cto`, §10).

---

## 0. Verdict, stated up front

1. **The browser SDK is a second identity client running beside the backend, not a thin helper.** It holds its own GoTrue session (access + refresh token) in `localStorage`, refreshes it itself, and that session can be traded for a backend session at any time through `POST /auth/supabase/exchange`. **No backend revocation event reaches it** (logout, logout-all, SR-8 reuse revocation, device-mismatch revocation, admin suspend). Only a completed password reset reaches it, and only as a side effect of GoTrue's own behaviour (§4). This is the INC-003-class finding: a credential sits outside the policy boundary. **A-10, High; SU-FU-1 fold-in A-23 (§11).** The re-mint limb is customer-only, because the exchange refuses non-customers (`auth.ts:372-375`) and admins cannot be suspended by admins (`admin-accounts.ts:37-41`). See §4.3.
2. **The anon key in the web bundle opens TB-8 to anyone, whatever our source code calls.** Feature 001 SR-4 ruled that, in this architecture, *"the `anon` key is a secret… must not be provisioned or published"*, precisely because it opens a route around FR-11 lockout and FR-12 audit. The web build requires it (`src/customer/supabase/client.ts:21-22`, `src/vite-env.d.ts:5-6`). SR-4 is therefore **not satisfied**. The INC-003 F-9(b) guard test (`src/lib/inc-003-no-direct-password-mutation.test.ts`) is a **code-hygiene control, not a capability control.** It proves our bundle does not *call* `updateUser({ password })`. It cannot stop anyone holding the anon key and a session from sending `PUT /auth/v1/user` themselves. **A-8 (High), A-9 (High, governance), A-11.**
3. **GoTrue itself blocks part of the INC-003 attack, and that matters for A-6 and §4 of the incident.** *Upstream* `internal/api/user.go`: if `user.HasMFAEnabled() && !session.IsAAL2()`, any password, email or phone change returns `401 insufficient_aal` (*"AAL2 session is required to update email or password when MFA is enabled."*). Supabase users reported this exact error in production by May 2025 (supabase/supabase#35940), so v2.195.0 almost certainly enforces it. **Consequence:** the original INC-003 web path would most likely have **failed** for a privileged account that already had a verified TOTP factor. It would have succeeded for customers, and for privileged accounts with no verified factor yet. I am not re-rating INC-003 — that is `cto`'s call — but the input is material and is flagged in §10.
4. **The same GoTrue rule breaks one of our own flows.** A customer who has enrolled TOTP **cannot reset their password through the backend.** The customer branch calls `PUT /user` with an AAL1 recovery token (`backend/src/routes/auth.ts:878`), GoTrue returns 401, and `db/supabase.ts:299-301` relabels that as `UPSTREAM_UNAVAILABLE`. It fails closed, but it leaves those users with no self-service recovery, and the support-assisted process (SR-24) does not exist. **A-20.**
5. **Mobile carries no Supabase SDK** (§8). Every Layer 2 finding is account-level, though, so mobile users' accounts are exposed to it too.
6. **Structural recommendation:** remove `supabase-js` from the web, route web identity through the backend endpoints that already exist, **and rotate or disable the already-published anon key.** Without the key rotation the capability persists. This is an ADR for `solution-architect`, not a build item here (§9).

---

## 1. Trust boundary being modelled

| # | Boundary | Credential | Prior treatment |
|---|---|---|---|
| **TB-8** (F001 §2.1) | Public internet → Supabase GoTrue / PostgREST / Storage / Realtime / Edge Functions | `anon` key (gate) | F001: "the anon key is a secret" (SR-4). **Now published** in the web bundle. |
| **TB-8b** (new name) | Browser JS ↔ its own GoTrue session (`sb-<ref>-auth-token` in `localStorage`, auth-js default key) | GoTrue access + refresh token | Never modelled. Named B1 in F006 §1 but analysed only as "lockout is GoTrue's" (F006 §4 row 1). |
| **TB-8c** (new name) | GoTrue-issued token → backend (`/auth/supabase/exchange`, `/auth/reset-password/confirm` `recoveryAccessToken`) | Any valid GoTrue access token | F006 B2; SR-006-1 closed the MFA hole. The *lifecycle* coupling was never analysed. |
| TB-9 (F001 §2.1) | XSS → session credential | — | SR-12 / SR-006-3, both still open. Now holds **two** credential families (§6). |

**Clarifying INC-003 §2.5, a section I wrote:** the §13 trigger was not completely ignored. Feature 006 `security-review.md` §1 named the browser→GoTrue boundary (B1), and its §4 accepted *"Anon Supabase key is present in the web bundle… it is a public key, not a secret"* as a residual risk. That acceptance was written by this role. It contradicted Feature 001 SR-4 without citing it and without `cto` sign-off, and no capability-level (Layer 2) analysis was done. So §2.5's conclusion — no re-threat-model was run — still stands. The governance defect is now tracked as **A-9**.

---

## 2. Layer 1 — what the web bundle actually does (inventory, verified 2026-10-02)

Grep scope: every `supabase` / `getSupabase` / `.auth.` reference under `src/` (18 files). Test files and comment-only hits are excluded below. The client is created lazily (`client.ts:16-19`), so the implicit behaviours in L1-0 run only on pages that call `getSupabase()`. Those are the auth callback, reset-password, signup and onboarding pages, plus the customer provider's sign-out.

| # | Call (file:line) | Reached from (file:line) | Backend control it runs **alongside / replaces / skips** | Notes → finding |
|---|---|---|---|---|
| L1-0 | `createClient(url, anonKey, { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true, flowType: 'pkce' })` — `src/customer/supabase/client.ts:31-38` | any page calling `getSupabase()` | **Skips** all backend session policy: creates a parallel session store in `localStorage` that the browser refreshes itself. It has no 90-day absolute cap, no device binding (FR-20), and is not revoked by any backend event. | A-10, A-15. `detectSessionInUrl` + PKCE: auth-js consumes `?code=` itself on init and rejects implicit `#access_token` — but see L1-8. |
| L1-1 | `auth.signUp({ email, password, options.emailRedirectTo })` — `src/customer/supabase/auth.ts:161-167` | `CustomerSignupPage.tsx:52`; `CustomerOnboardingPage.tsx:203` | **Replaces** `POST /auth/signup` (`backend/src/routes/auth.ts:81-131`). Skips the `SIGNUP_LIMIT` per-IP limiter (`:83`), the customer password minimum (`:90`, replaced by the GoTrue project floor — INC-003 A-3 still OPEN), the `consentAccepted: z.literal(true)` requirement (`:78`), and synchronous `app.accounts` creation (deferred to just-in-time creation at exchange, `:361-370`). | A-16; consent → `compliance-specialist`. |
| L1-2 | `auth.signInWithPassword({ email, password })` — `src/customer/supabase/auth.ts:192-195` | `CustomerAuthProvider.tsx:166` ← `CustomerOnboardingPage.tsx:148` (**polled every 10 s**, `:49`, `:168-171`) and `:222` | **Replaces** `POST /auth/login`. Skips FR-11 per-identifier lockout (`LOGIN_LOCKOUT`), the FR-12 `login_failure` audit, and SR-4. Followed by L1-9 (exchange). | A-8, A-14. |
| L1-3 | `auth.resend({ type: 'signup', email })` — `src/customer/supabase/auth.ts:204-210` | `CustomerSignupPage.tsx:69`; `CustomerOnboardingPage.tsx:459` | **Replaces** `POST /auth/resend-verification` (`backend/src/routes/auth.ts:182-215`). Skips the per-email cooldown and ceiling (`RESEND_VERIFICATION_LIMIT`). GoTrue's email quota is the only limit. | A-16 (Low on its own). |
| L1-4 | `auth.verifyOtp({ token_hash, type })` — `src/customer/supabase/auth.ts:254-257` | `CustomerAuthCallbackPage.tsx:93` | **Replaces** `POST /auth/verify-email` (`backend/src/routes/auth.ts:140-176`) and the server-side recovery verification (`/auth/reset-password/confirm` `resetToken` branch, `:836-854`). **Creates a persisted AAL1 browser session** for whichever `type` the URL names. `mapEmailActionToOtpType` (`auth.ts:229-240`) accepts `signup`, `recovery`, `invite`, `magiclink`, `email_change` and `email`. | A-10, A-13, A-17. |
| L1-5 | `auth.exchangeCodeForSession(code)` — `CustomerAuthCallbackPage.tsx:130` | same page | Same as L1-4, for PKCE links. auth-js `detectSessionInUrl` will already have consumed the code on init, so this explicit call races it (functional, Low). | — |
| L1-6 | `auth.getSession()` — `CustomerAuthCallbackPage.tsx:149-154` | same page, when the URL has no params | **Re-mints a backend session from any lingering browser GoTrue session** via exchange. Runs *instead of* any fresh authentication. | **A-10** (the re-mint path). |
| L1-7 | `auth.getSession()` — `CustomerResetPasswordPage.tsx:55-56` | reset page | **Runs alongside** `POST /auth/reset-password/confirm`: reads the recovery token only to hand it to the backend (INC-003 F-3, verified in §9.2 of the incident). ✔ | A-12 concerns what the backend accepts here. |
| L1-8 | *Not an SDK call:* manual read of `#access_token` — `CustomerAuthCallbackPage.tsx:121-124` | same page | Hands an **attacker-suppliable** GoTrue token straight to exchange. Under `flowType: 'pkce'` auth-js itself would reject an implicit fragment; our page bypasses the SDK's own guard. | **A-13.** |
| L1-9 | `fetch POST /auth/supabase/exchange { accessToken, deviceId, deviceName }` — `src/customer/supabase/auth.ts:61-69` | L1-2, L1-4/5/6/8 | Bridge TB-8c. Backend side `backend/src/routes/auth.ts:335-486`: per-IP limiter only (`:337`); just-in-time account creation (`:361-370`); customer-only (`:372-375`) ✔; account-state gate (`:393-400`) ✔; TOTP gate (`:410`, SR-006-1) ✔; **client-supplied `deviceId`** (`:341`). | A-10, A-13. |
| L1-10 | `auth.signOut()` (auth-js default `scope: 'global'`, verified `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:3395`) — `CustomerAuthProvider.tsx:76`; `CustomerResetPasswordPage.tsx:97` | customer sign-out; `onSessionTerminated` (`CustomerAuthProvider.tsx:89-91`); end of reset | **Runs alongside** backend logout, best-effort. A positive control, but **client-side only.** It fires only in the browser that holds the session, only if that browser is online, and both call sites swallow errors. | A-10 explains why it doesn't fix the coupling problem. |
| — | `updateUser({ password })`, `resetPasswordForEmail` | — | **Absent.** Deleted under INC-003 F-5 (`src/customer/supabase/auth.ts:214-219`, verified by `security-engineer` in INC-003 §9.3). ✔ | — |
| — | Privileged sign-in: `DashboardAuthProvider.tsx:177-189`, `CustomerLoginPage.tsx:113` | `/login`, `/admin/login`, `/security/login`, `/call-centre/login` | **Backend `POST /auth/login` only.** No SDK on any privileged path. ✔ | — |

**One Layer 1 item outside Supabase, found because the SDK makes it necessary:** `savePendingSignupAuth` writes the user's **plaintext password** to `sessionStorage['td_signup_pending_auth']` for up to 10 minutes (`src/onboarding/pendingSignupAuth.ts:13-20`, called at `CustomerOnboardingPage.tsx:208`). It exists so the wizard can re-run L1-2 every 10 seconds while waiting for email verification. Expired records are only cleared lazily, when they are next read (`:27-29`). **A-14.**

---

## 3. Layer 2 — what an attacker can do with the public anon key, regardless of our code

**Framing.** Layer 1 lists what our code *calls*. Layer 2 lists what is *callable*. GoTrue, PostgREST, Storage, Realtime and Edge Functions all answer anyone who presents the project's anon key, and the anon key is in every web build the project has shipped. Deleting a call from `src/` removes it from Layer 1 only. Removing a Layer 2 capability takes a GoTrue setting, a hook-side refusal, a backend check, or revoking the key itself.

**Principals.**
- **P-anon:** anyone holding the anon key.
- **P-cust:** a customer holding a GoTrue session (their own, or a stolen one).
- **P-priv:** `admin`, `security_company_operator` or `support_agent` holding a GoTrue session obtained directly from GoTrue, e.g. with only a password via `/token?grant_type=password`. The backend never issues one, but GoTrue will.

**Output table** (one row per capability; a row that is reachable today and bypasses a backend control carries its own action ID):

| # | endpoint / call | principal | backend control(s) bypassed (SR-ID) | reachable today (evidence) | severity | disposition |
|---|---|---|---|---|---|---|
| C-1 | GoTrue `POST /token?grant_type=password` | P-anon vs any account | **FR-11** per-identifier lockout (F001 §6, `LOGIN_LOCKOUT`); **FR-12** `login_failure` audit; **SR-4**. For a customer **without** a verified TOTP factor, a correct guess yields a GoTrue session that C-14 turns into a backend session. For accounts **with** a factor, it is still an unthrottled-by-us, unaudited-by-us **password oracle** (GoTrue answers "valid password" before MFA). | **Yes.** Anon key compiled into the bundle (`client.ts:21-22`); endpoint provably enabled — our own backend uses it (`backend/src/db/supabase.ts:217-230`). Only GoTrue's project rate limits apply (**requires console**, §7). | **High** | **A-8**; structural fix A-21 |
| C-2 | GoTrue `POST /token?grant_type=refresh_token` | P-cust / P-priv holding a GoTrue refresh token | Backend **absolute session cap** (F001 §6: 90 d customer / 8 h privileged); **FR-20** device binding; **SR-8** reuse → family revocation; every backend revocation event (logout, logout-all, `admin_forced`, `device_mismatch`, `rotation_reuse_detected`). None of these touch GoTrue. | **Yes.** auth-js refreshes automatically (`client.ts:33`). GoTrue session lifetime is unbounded unless time-box/inactivity limits are set (**requires console**). | **High** | **A-10** (§4) |
| C-3 | GoTrue `POST /signup` | P-anon | `SIGNUP_LIMIT` per-IP (`auth.ts:83`); customer password policy (`:90`); `consentAccepted: z.literal(true)` (`:78`); synchronous `app.accounts` creation. Also an email-sending primitive against arbitrary addresses (only GoTrue's email quota limits it). | **Yes** — our own code calls it (L1-1). Whether signup can be disabled without breaking web signup: no, not while L1-1 exists. | **Medium** | **A-16**; consent → `compliance-specialist` (§12) |
| C-4 | GoTrue `POST /recover` (`resetPasswordForEmail`) | P-anon vs any email | **INC-003's own request limb, still live at Layer 2:** `RESET_PASSWORD_REQUEST_LIMIT` (3/h identifier, 10/h IP), `password_reset_requested` audit, **F-2's server-side redirect selection** (caller supplies `redirect_to`; only GoTrue's redirect allow-list constrains it). | **Yes.** F-1 removed our *call*; the *capability* is unchanged. Exfiltration via `redirect_to` depends on the allow-list (**requires console**, §7 item 7). | **Medium** (mailbox still gates the reset itself) | **A-16** |
| C-5 | GoTrue `POST /resend` | P-anon | `RESEND_VERIFICATION_LIMIT` per-email cooldown/ceiling (`auth.ts:182-215`). | **Yes** (L1-3). | Low (rolled into A-16) | **A-16** |
| C-6 | GoTrue `POST /otp` (magic link / email OTP sign-in) | P-anon (link goes to the account's mailbox) | The **password factor entirely**, FR-11, FR-12. Combined with C-7 + C-14, mailbox control alone yields a backend customer session. | **Requires console** — Supabase enables email OTP/magic link by default with the email provider; our UI never uses it. | **Medium** | **A-17** |
| C-7 | GoTrue `POST /verify` / `verifyOtp({ token_hash, type })` | P-anon holding any `token_hash` (incl. **the attacker's own**) | `POST /auth/verify-email` and the `/reset-password/confirm` `resetToken` branch; and it **persists** a browser session for whatever `type` the URL names. | **Yes** (L1-4; `auth.ts:229-240` accepts six types). Cross-browser by design, therefore CSRF-able (§5). | **Medium** (type-allow-list) / **High** as a login-CSRF vector | **A-17**, **A-13** |
| C-8 | GoTrue `PUT /user { password }` | P-cust / P-priv with an AAL1 session | **SR-6** (for a privileged account that has no verified factor yet); backend session revocation; **SR-007-1** push-token sweep; `password_reset_completed` audit; `PASSWORD_MIN_LENGTH` 10/14 (only GoTrue's floor applies, A-3 still OPEN). **This is the INC-003 capability itself, still reachable outside our code.** | **Yes**, for every account **without** a verified TOTP factor (all customers by default; privileged accounts between invitation and enrolment). **Blocked** by GoTrue's `insufficient_aal` rule for accounts **with** one (*upstream* `internal/api/user.go`). "Secure password change" (reauthentication nonce) only bites when the session is **>24 h old** (*upstream*), so a freshly-minted C-1 session is never asked for it. | **High** | **A-18** |
| C-9 | GoTrue `PUT /user { email }` | P-cust / P-priv with an AAL1 session | No backend email-change flow exists at all; `app.accounts.email` silently diverges from `auth.users.email`; afterwards C-4 delivers recovery mail to the **new** (attacker) address while our backend `/reset-password/request` looks the account up by the **old** one. Durable ATO. | **Yes** for accounts without a verified factor; same AAL2 block otherwise. Whether the **old** address must also confirm ("Secure email change") **requires console**. | **High** | **A-18** |
| C-10 | GoTrue `POST /factors` → `/factors/{id}/challenge` → `/verify` (enrol TOTP) | P-cust with an AAL1 session on an account with **no** verified factor | **SR-14 / BR-4 integrity** and Feature 001 §6's recorded "structural win" (*no client holds a Supabase-honoured JWT, so no client can manipulate its own factors*) — **that premise is now false**. An attacker enrols **their** authenticator; from then on `/auth/login` and C-14 both gate on it (`auth.ts:410`, `findVerifiedTotpFactor` picks the first verified factor, `supabase.ts:287-289`). The legitimate customer is locked out of their own account; the attacker holds it. | **Yes.** *Upstream* `internal/api/mfa.go` requires AAL2 to enrol only when a verified factor **already** exists ("AAL2 required to enroll a new factor"), so accounts without one — every customer by default — are open. | **High** | **A-19** |
| C-11 | GoTrue `DELETE /factors/{id}` (unenrol) | P-cust / P-priv AAL1 | BR-4 "no bypass". | **Blocked for verified factors** — *upstream* "AAL2 required to unenroll verified factor". Unverified-factor deletion is harmless. | Low | None; monitor via SR-14(b) reconciliation |
| C-12 | GoTrue `GET /user`, `POST /logout` | P-cust (own session) | None — own-record read and a positive control. | Yes | Info | None |
| C-13 | GoTrue `GET /settings` | P-anon | None; discloses which providers/signup modes are enabled. | Yes | Info | None — useful input to §7 |
| C-14 | **Our** `POST /auth/supabase/exchange` given any GoTrue access token (TB-8c) | P-cust (or anyone holding a customer's GoTrue session) | Customer-only ✔ (`auth.ts:372-375`), state gate ✔ (`:393-400`), TOTP gate ✔ (`:410`). **Not** enforced: any freshness/lifecycle relation between the GoTrue session and the backend's revocation history (§4); any proof the token was obtained by **this browser's user** (§5); device binding (`deviceId` is client-supplied, `:341`, `:434`). | **Yes** | **High** | **A-10**, **A-13** |
| C-15 | **Our** `POST /auth/reset-password/confirm { recoveryAccessToken }` | P-cust holding **any** GoTrue access token | "Proof of recovery". The branch at `auth.ts:818-835` only checks that the token resolves to a user (`getUserFromAccessToken`); it never checks the token's `amr` contains `recovery`. A C-1 password-grant token or a stolen browser session is accepted as a "recovery" token; for a customer the backend then changes the password, **revokes every backend session** (locking the real owner out) and writes a `password_reset_completed` audit row that misdescribes what happened. | **Yes** | **Medium** (capability overlaps C-8, but our backend launders it into a legitimate-looking reset) | **A-12** |
| C-16 | PostgREST `/rest/v1/*` | P-anon (`anon` role) and — **new** — P-cust (`authenticated` role, now reachable because real users hold GoTrue JWTs) | **SR-3** (`app` not exposed). F001 §11 FU-06 ruled the `authenticated` grants "inert" because no `authenticated` caller existed; **that is no longer true.** | **Requires console** (exposed schemas). Repo evidence is favourable: no migration creates a `public.*` table or grants to `anon`/`authenticated` (`backend/migrations/030_…sql:192-193,225` are RLS-on, no-grant). A table created ad hoc in `public` via the dashboard would inherit Supabase's default grants. | Low (contingent) | §7 item 4; no action unless console finds exposure |
| C-17 | Storage `/storage/v1/*`, Realtime `/realtime/v1/*` | P-anon / P-cust | SR-3 analogue | **Requires console.** No bucket or publication is declared in the repo; MP-5 has no storage vendor. | Low (contingent) | §7 item 4 |
| C-18 | Edge Function `auth-send-email` | P-anon | — | Deployed `verify_jwt = false` (`supabase/config.toml:35-36`) but verifies a Standard Webhooks signature (`supabase/functions/auth-send-email/index.ts:10,34,55`). Not usefully callable without `SEND_EMAIL_HOOK_SECRET`. ✔ | Low | None |
| C-19 | GoTrue `/admin/*` | P-anon | — | **Not reachable** — requires the `service_role` key, which is not in any client bundle (F001 §4 verified; SR-17 is the CI control). ✔ | — | None |

**Reading of this table.** Every High row has the same root: a GoTrue-honoured credential (the anon key, plus any session minted with it) exists outside the backend. C-8, C-9 and C-10 are each a full account-takeover-persistence primitive for **every customer without TOTP**, and they need nothing our bundle does — only the key that is already published. Deleting more code from `src/` will not close them; A-21's key rotation, or GoTrue-side configuration (A-22), will.

---

## 4. Session-lifecycle coupling — the most load-bearing finding in this document (A-10, A-23)

> **Plain statement.** A browser GoTrue session is a credential that our backend treats as sufficient to mint a brand-new backend session, at any time, with no password, and **no backend revocation event ever reaches it.** Logging a customer out everywhere, suspending them, detecting refresh-token theft, or detecting a device mismatch all leave it alive. For a customer without TOTP, whoever holds it can be back inside the account seconds after we believe we have thrown them out. **This bears directly on SU-FU-1's newly step-up-gated suspend/reactivate action (§11).**

### 4.1 The evidence chain, link by link

1. **The browser holds a self-refreshing GoTrue session.** `createClient(…, { autoRefreshToken: true, persistSession: true, … })` — `src/customer/supabase/client.ts:31-38`. auth-js persists it in `localStorage` under its default `sb-<ref>-auth-token` key, alongside our own backend refresh token (`src/customer/auth/CustomerAuthProvider.tsx:42-53`) and the web `deviceId` (`src/customer/auth/deviceId.ts:6-9`). Every web customer login creates one, because customer web login *is* a GoTrue password grant (`CustomerAuthProvider.tsx:166` → `src/customer/supabase/auth.ts:192-200`).
2. **The callback page re-mints from it with no user action beyond a page load.** When `/auth/callback` is opened with no `token_hash`, `#access_token` or `code`, it calls `getSupabase().auth.getSession()` and, if any session exists, hands its access token to `completeWithSession` — `src/pages/CustomerAuthCallbackPage.tsx:149-154` → `:51-53` → `exchangeSupabaseSession` (`src/customer/supabase/auth.ts:36-69`). An attacker holding the stolen refresh token does not need our page at all: they refresh it themselves (C-2) and POST the access token to the exchange endpoint.
3. **The exchange endpoint asks only "is this a valid GoTrue user right now?"** `backend/src/routes/auth.ts:346` calls `getUserFromAccessToken`, which is a GoTrue `GET /user` with that token (`backend/src/db/supabase.ts:377-401`). It then checks customer-only (`:372-375`), account state (`:393-400`) and verified-TOTP (`:410`). **Nothing compares the GoTrue session's age against the account's revocation history.** With no verified factor it mints a fresh session family — `mintNewSession(…, { deviceId: deviceId ?? null, …, mfaVerifiedAt: null })` at `:432-440`, with a caller-chosen `deviceId` (`:341`) — and returns access + refresh tokens (`:458-463`).
4. **No backend revocation path calls GoTrue.** The Supabase mediation layer (`backend/src/db/supabase.ts`) exposes `createUser`, `deleteUser`, `verifyPassword`, the factor calls, `updateUserPassword`, link generation, `getUserByEmail`, `getUserFromAccessToken`, `isUserEmailConfirmed`, `verifySignupToken`, `verifyRecoveryToken` and `mintTransientUserAccessToken` (`:194-465`). **There is no logout, sign-out, session-delete or ban method.** Every backend revocation site touches only `app.sessions` and the KV JTI set:
   - `POST /session/logout` — `backend/src/routes/session.ts:33-38`
   - `POST /session/logout-all` — `session.ts:49-62`
   - `PATCH /admin/accounts/:id/state` (suspend/deactivate) — `backend/src/routes/admin-accounts.ts:259-263`
   - SR-8 refresh-token reuse — `backend/src/lib/refresh-session.ts:195`
   - FR-20 device mismatch — `refresh-session.ts:219`
5. **The one event that does reach GoTrue — a completed password change — does so only as GoTrue's own side effect.** *Upstream* `internal/models/user.go` `UpdatePassword`: `if sessionID == nil { Logout(tx, u.ID) } else { LogoutAllExceptMe(tx, *sessionID, u.ID) }`. So the backend reset (`auth.ts:878`, `:955`) does kill other GoTrue sessions, except the recovery session itself. After that, a stale token fails at step 3 because GoTrue's `GET /user` refuses tokens whose session no longer exists.
6. **The client-side `signOut()` is a partial, best-effort mitigation, not a control.** auth-js `signOut()` defaults to `scope: 'global'` (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:3395`), so when *this* browser signs out (`CustomerAuthProvider.tsx:74-79`) or sees its backend session terminated (`:89-91`), it revokes **all** of the user's GoTrue sessions, including an attacker's. But it only fires if the victim's browser still holds a GoTrue session, is open and online, and the error is swallowed either way (`:77-79`). Mobile holds no GoTrue session (§8), so a "log out everywhere" pressed **on mobile**, an admin suspension, or a server-side SR-8/FR-20 revocation never triggers it.

### 4.2 Attack narratives

**N-1 — "Log out everywhere" does not log the attacker out.** The attacker obtains a customer's GoTrue session: an XSS on the web origin reads `localStorage` (TB-9; no CSP, §6), an extension or malware takes it, or a phished password is replayed straight at C-1. The customer notices activity and presses "log out of all devices" on the mobile app. The backend revokes every `app.sessions` row (`session.ts:55`). The attacker refreshes their GoTrue session (C-2) and calls `/auth/supabase/exchange` → **new backend session, `login_success` audited as if it were an ordinary login** (`auth.ts:441`). The customer believes the incident is over.

**N-2 — SR-8 and FR-20 observe the theft, then hand the thief a fresh family.** The same holds when the backend itself detects theft: reuse of a rotated refresh token revokes all sessions (`refresh-session.ts:195`), and a device-id mismatch does too (`:219`). Neither reaches GoTrue, so the thief re-mints. The new family is bound to whatever `deviceId` the thief sends (`auth.ts:341`), which defeats FR-20 by construction.

**N-3 — Suspend → reactivate re-admits the attacker (the SU-FU-1 case).** An admin responding to a suspected account takeover suspends the customer through `PATCH /v1/admin/accounts/:id/state`. Since `a730488` that action requires fresh step-up MFA (`admin-accounts.ts:189`). Backend sessions are revoked (`:259-263`). **During suspension** the exchange refuses (`auth.ts:397-399` → `ACCOUNT_SUSPENDED`) ✔ — but the attacker's GoTrue session is untouched and still fully usable **against GoTrue directly**. With it they can:
   - change the password (C-8);
   - change the email (C-9);
   - enrol their own TOTP factor (C-10).

When the admin completes the investigation and reactivates (`suspended → active` is a permitted transition, `backend/src/repositories/accounts.ts:99`), one of two things happens:
   - The attacker exchanges immediately and is back in, if they did nothing during suspension.
   - If they enrolled a factor during suspension, the **legitimate customer** is now the one locked out: `/auth/login` demands a TOTP code only the attacker has.

The step-up gate SU-FU-1 added proves *the admin* is who they say they are. It cannot make the suspension reach a credential the backend does not know exists.

### 4.3 Scope — what this finding is *not* (correcting the framing I was handed)

- **A suspended or reactivated *admin* is not a reachable case on this route.** Admins cannot change another admin's state: `ADMIN_MUTABLE_USER_TYPES` is `customer`, `support_agent`, `security_company_operator` (`admin-accounts.ts:37-41`, enforced at `:219-222`). Self-mutation is also refused (`:208-211`).
- **Privileged subjects cannot re-mint through the exchange.** `support_agent` and `security_company_operator` are refused by the customer-only check (`auth.ts:372-375`), so N-3's re-mint limb is **customer-only**. For privileged subjects the residual is C-8/C-9 during suspension. GoTrue's AAL2 rule blocks those once a TOTP factor is verified, and SR-14 makes MFA mandatory for those roles. So the privileged residual is narrow: an account between invitation and first enrolment, Low.
- **Customers with a verified TOTP factor are protected on the re-mint limb.** The exchange issues an MFA challenge instead of tokens (`auth.ts:467-481`). Customers are not required to enrol (ADR-0012 §3 note), so the default customer population is exposed.
- **Detection exists, but it can't tell the paths apart.** A re-mint writes `login_success` (`auth.ts:441`) and may fire a new-device notification (`:424-430`). `/auth/login` writes the same event type, so an exchange-originated re-mint straight after an `admin_forced`/`logout_all` revocation cannot be told apart in the audit log today.

### 4.4 Required design direction (owner `backend-architect`; A-10 general, A-23 SU-FU-1-specific)

Design ownership is `backend-architect`'s. These are the properties the fix must have. They are not an implementation.

1. **Revocation watermark checked at the exchange (authoritative, ours).** Every account-wide revocation event (`logout_all`, `admin_forced`, `rotation_reuse_detected`, `device_mismatch`, `password_reset`) must advance a per-account watermark. `/auth/supabase/exchange` must refuse a GoTrue access token whose session was established before that watermark. Use the token's `iat`, or better its session's creation time, read via GoTrue. This puts the decision on our side of the boundary and does not depend on GoTrue behaviour.
2. **Propagate revocation to GoTrue (defence in depth).** On the same events, terminate the user's GoTrue sessions. The mediation layer already has a primitive that makes this cheap: `mintTransientUserAccessToken` (`supabase.ts:449-465`) yields a user-scoped token, and GoTrue `POST /logout?scope=global` with it revokes every session. On **suspend/deactivate** (A-23) also consider a GoTrue ban, so the account's GoTrue session cannot be refreshed or used for C-8/C-9/C-10 while suspended. Cleared on reactivation.
3. **Distinguish the audit event.** Exchange-minted sessions should be recorded so that "re-mint shortly after a forced revocation" is queryable. Hand to `security-engineer` as a detection rule alongside ADR-0012 C-4.
4. **Regression tests** (`automation-qa-engineer`): after `logout-all`, `admin_forced` suspend → reactivate, SR-8 reuse and FR-20 mismatch, a pre-existing GoTrue access token presented to the exchange **must** be refused.

None of this replaces A-21. Removing the browser GoTrue session altogether is what removes the coupling. A-10/A-23 are what make the current architecture safe until then.

---

## 5. Callback and recovery-link handling — login CSRF (A-13) and type confusion (A-17)

### 5.1 The page accepts a credential it never asked for

`CustomerAuthCallbackPage` (`src/pages/CustomerAuthCallbackPage.tsx:80-160`) sets a session from **any** of four URL-borne inputs, in this order:
- `token_hash` + `type` (`:91-101`);
- a raw `#access_token` (`:121-124`);
- `?code` (`:127-134`);
- a lingering session (`:149-154`).

The `token_hash` and `#access_token` inputs are not tied to anything this browser started:

- **Raw `#access_token` (`:121-124`).** The page reads the fragment itself and passes it to `completeWithSession` → exchange. Under `flowType: 'pkce'` (`client.ts:36`) auth-js would refuse an implicit-grant fragment. Our page goes around the SDK's own guard.
- **`token_hash` (`:84`, `:93`).** `verifyOtp({ token_hash, type })` is cross-browser by design (the comment at `src/customer/supabase/auth.ts:242` says so: *"works across browsers; no PKCE verifier required"*). That is exactly what makes it forgeable: nothing proves the person clicking is the person the link was minted for.

### 5.2 Attack narrative (N-4, login CSRF into an attacker-owned account)

1. The attacker creates a customer account they control. They take its GoTrue access token: from their own C-1 call, or by requesting a magic link (C-6) / signup link to their own mailbox and lifting its `token_hash`.
2. They send the victim `https://<web-origin>/auth/callback#access_token=<attacker token>` or `…/auth/callback?type=magiclink&token_hash=<attacker hash>`. The domain is ours and TLS-valid, and the email can be plausible ("verify your TD IT account").
3. The victim's browser exchanges the token (`:51-53` → `auth.ts:335-463`). The attacker's account has no TOTP, so tokens are minted. `auth.signInWithTokens` runs (`:64`) and the victim lands on `/dashboard` (`:67`) **signed in as the attacker, silently.**
4. Everything the victim then does is written into the attacker's account, where the attacker can read it from their own session:
   - registers assets (make, model, serial, value);
   - completes their profile (address, ID-verification material per the profile/verification routes);
   - reports a theft with circumstances.
5. As a side effect, the `token_hash` variant also seeds the attacker's GoTrue session into the victim's `localStorage`.

**Why High, not the usual Medium for login CSRF.** On this platform the data a victim enters after the switch includes inventories of high-value property, theft reports and, once tracking ships, the location trail of that property. That is the data class this architecture treats as equivalent to health/biometric data. The only tell is the account email shown in the UI. The `type=recovery` variant (`:94-96` → `/reset-password`) is lower impact: the victim sets a password on the attacker's account. It is still the same defect.

### 5.3 Type confusion (A-17)

`mapEmailActionToOtpType` (`src/customer/supabase/auth.ts:229-240`) passes `signup`, `recovery`, `invite`, `magiclink` and `email_change` through, and maps anything else to `email`. The product uses only `signup` and `recovery` on web. So this page will establish a GoTrue session from a **magic link** (passwordless — C-6), an **invite** link (privileged invitations are meant to go through `/invitations/accept` and the backend — F001 SR-1), or an **email-change** confirmation. Each of these is a session-establishing path no review approved.

### 5.4 Required fix direction (owner `authentication-engineer` + `frontend-architect`; A-13, A-17)

1. Delete the `#access_token` branch (`:121-125`) outright.
2. Allow-list `type` to `signup` and `recovery`; reject everything else before any SDK call.
3. **Email verification must not sign the user in.** After a successful `signup` verification, route to `/login`; do not call `completeWithSession`. That alone removes the CSRF value of a forged signup/magic-link hash. The lingering-session branch (`:149-154`) should go with it, which also removes N-1's page-load re-mint.
4. Strip `token_hash`/`code` from the URL and history on every exit path, including the error state (`:161-164` leaves the URL untouched).
5. Mobile parity check: `mobile/app/(auth)/reset-password.tsx:16-24` also accepts an `access_token` deep-link parameter and forwards it as `recoveryAccessToken`. Together with A-12 (the backend does not check `amr=recovery`), that is the same "act on a token the user did not request" shape. It has lower impact: it can only set a password on the account the token belongs to. Fold into A-12's fix.

---

## 6. Browser storage and page-level hardening (A-14, A-15)

### 6.1 Plaintext password in `sessionStorage`, replayed every 10 seconds (A-14)

- `savePendingSignupAuth(email, password)` writes `{ email, password, expiresAt }` as JSON to `sessionStorage['td_signup_pending_auth']` (`src/onboarding/pendingSignupAuth.ts:4,13-20`). It is called immediately after GoTrue signup (`src/pages/onboarding/CustomerOnboardingPage.tsx:203,208`).
- While the wizard sits on the verify step, `tryAdvanceFromVerification` runs immediately and then every `POLL_INTERVAL_MS = 10_000` (`:49`, `:165-174`). Each run reads the password back (`:144`) and replays it through `auth.loginWithPassword` (`:148`), i.e. a GoTrue password grant (L1-2), for up to the 10-minute TTL (`pendingSignupAuth.ts:5`).
- Clearing happens only on success (`:137`, `:153`) or lazily when an expired record is next read (`pendingSignupAuth.ts:27-29`). A tab left open after the TTL keeps the record until the next read.

**Why this matters beyond "XSS steals a session".** XSS against a token is bounded by the token's life and our revocation. XSS against a **password** is not: users reuse passwords, and our own revocation machinery is irrelevant to a credential the attacker can replay anywhere. The replay loop also generates up to 60 GoTrue password grants per signup. None is visible to FR-11/FR-12, and on a real lockout they would look like credential stuffing from the user's own IP. **Severity Medium** (XSS precondition; customer accounts only; 10-minute window).

**Fix direction:** the wizard needs a *verification-status* signal, not a credential. Poll a backend endpoint keyed by an opaque, signup-scoped handle, or simply let the verification link complete the step. Do not hold the password at all.

### 6.2 No CSP, no Referrer-Policy on any web host — confirmed independently (A-15)

Verified this session, not taken from the draft summary:
- `vercel.json` (production web host) contains a single SPA rewrite and **no `headers` block** (`vercel.json:1-5`).
- `index.html` has **no `<meta http-equiv="Content-Security-Policy">` and no `<meta name="referrer">`** (`index.html:1-55`).
- The staging static site on Render declares `routes` (rewrite only) and **no `headers`** (`render-staging.yaml:60-80`).
- A repo-wide search outside `node_modules`/`docs` for `Content-Security-Policy`, `Referrer-Policy`, `http-equiv` and `referrer` finds only one `rel="noopener noreferrer"` link attribute (`src/pages/MobileAppDownloadSection.tsx:21`).
- `helmet()` protects API responses only (F001 §5.2(d)).

**SR-12(d) remains unmet.**

What sits in JS-reachable storage on this origin today, i.e. what one XSS anywhere on the shared marketing/customer/admin origin can read:

| Item | Where | Lifetime | Backend can revoke it? |
|---|---|---|---|
| GoTrue access + refresh token | `localStorage`, auth-js default key | Unbounded unless GoTrue time-box set (§7) | **No** (§4) |
| Backend customer refresh token | `localStorage` (`CustomerAuthProvider.tsx:42-53`) | 90-day absolute cap | Yes |
| Web `deviceId` (the FR-20 binding value) | `localStorage` (`deviceId.ts:6-9`) | Permanent | n/a. Readable by the same XSS, so FR-20 gives **zero** protection against XSS-based theft. |
| Privileged backend refresh token | `sessionStorage` per tab (`DashboardAuthProvider.tsx:40-51`) | 8-hour cap | Yes |
| **Plaintext password** | `sessionStorage` (§6.1) | ≤10 min (lazy clear) | **No — it is a password** |

**Severity Medium.**
- **CSP limb:** this is the compensating control SR-12(c)(ii) names, and two of the five rows above are credentials the backend cannot revoke.
- **Referrer limb: Low on its own.** Modern browsers default to `strict-origin-when-cross-origin`, so cross-origin requests do not carry the `?token_hash=` path. I found no third-party resource loaded by `index.html`, but I did not audit every runtime asset fetch.

Owner `frontend-architect` + `devops-engineer`, ruling mine.

---

## 7. Live-configuration verification items (console) — A-22

Several Layer 2 rows are "reachable" or "blocked" depending on settings that live only in the Supabase dashboard. None was inspected (method note). Each item below is a **verification**: record the observed value, then compare it to the required value. A "requires console" row in §3 stays OPEN until its item here is answered. Run in the **same console session as INC-003 A-6 / A-3** (`cto` §10 P0). Owner `security-engineer` + project owner, `devops-engineer` to record results in `supabase/README.md` as the SR-5 baseline.

| # | Setting (Dashboard → Authentication unless noted) | Why it matters (row) | Required / expected |
|---|---|---|---|
| 1 | **Secure password change** / `update_password_require_reauthentication` | C-8. Only effective for sessions >24 h old (*upstream*), so it is a partial control at best. | ON (record). Does not close C-8 for fresh sessions. |
| 2 | **Secure email change** (double confirmation, old + new address) | C-9 durable ATO | ON |
| 3 | **Allow new users to sign up** (`enable_signup`) and **email OTP / magic link** sign-in | C-3, C-6 | Record. Signup cannot be turned off while L1-1 exists. Magic-link/OTP sign-in **OFF** if the provider exposes it separately; otherwise A-17's type allow-list is the control. |
| 4 | **API → Exposed schemas**; any tables in `public`; Storage buckets; Realtime publications | C-16, C-17 (SR-3) | Exposed schemas: no `app`; `public` empty or RLS-on with no `anon`/`authenticated` grants; no buckets; no publications. Also run Supabase's **Security Advisor** and record output. |
| 5 | **Sessions → Refresh-token rotation** and **reuse interval** | C-2 | Rotation ON, reuse interval minimal (record) |
| 6 | **JWT expiry** (access-token TTL) and **Sessions → time-box / inactivity timeout** (plan-dependent) | C-2, §4: how long a lingering browser session lives | JWT expiry ≤ 3600 s (record); time-box ≤ 90 days and inactivity timeout set **if the plan offers it** (record unavailability otherwise; feeds OI-5) |
| 7 | **URL Configuration → Site URL and Redirect allow-list** | C-4 `redirect_to` exfiltration; INC-003 §8a's outstanding web-reset entry | Exact URLs only, **no wildcards** on hosts we do not control (e.g. no `*.vercel.app/**`); includes `PASSWORD_RESET_REDIRECT_URL_WEB` |
| 8 | **Rate Limits** (sign-in/sign-up, token refresh, email sent, OTP/verify) | C-1, C-3, C-4, C-6: the **only** limiter on Layer 2 | Tightest values compatible with volume; record each. Note the user-visible copy at `src/customer/supabase/auth.ts:306` cites ~30 emails/hour. |
| 9 | **Multi-Factor → TOTP enrol/verify enabled**, max factors per user, and (if offered) **MFA verification hook** | C-10, C-11 | Record. Enrol must stay enabled (the backend uses it, `supabase.ts:232-273`), so it cannot be switched off as a fix for A-19. |
| 10 | **Minimum password length = 14** and **leaked-password protection** | C-8 floor (INC-003 A-3) | As A-3; record whether applied |
| 11 | **API keys** — whether the project is on legacy `anon`/`service_role` keys or the newer publishable/secret keys, and whether the legacy anon key can be disabled independently | A-21 feasibility | Record. Backend user-scoped GoTrue calls send the **service-role** key as `apikey` (`supabase.ts:171-172`), so disabling the browser-facing key should not break the backend. Verify before relying on it. |
| 12 | **`auth.audit_log_entries`** for `factor_in_progress`/`mfa_factor_*`, `user_updated` (email/password) and `token_refreshed` events by **customer** accounts not paired with a backend audit event | Retrospective check of C-8/C-9/C-10 abuse | Extends A-6's query from privileged to customer accounts. Report the coverage window, as A-6 requires. |

---

## 8. Mobile — independently confirmed: no Supabase SDK

Verified this session rather than carried over from the draft:
- `mobile/package.json` (and lockfile, `app.json`/`app.config.*`, `eas.json`, `.env.example`) has **no** `@supabase/*` dependency and no `SUPABASE` variable. The only Supabase-related strings under `mobile/` are documentation, error-copy mapping (`mobile/src/lib/user-facing-errors.ts:56,211-219`) and the generated OpenAPI types, which state *"no client ever holds a Supabase-honoured credential"* (`mobile/openapi/identity-service.yaml:23-24,36`).
- `mobile/.env.example:7` explicitly forbids Supabase keys.
- The web package does carry it: `package.json:22` (`@supabase/supabase-js ^2.112.3`).

**Consequences.**
- Mobile holds no GoTrue session, so N-1 is aggravated rather than mitigated when the response comes from mobile: §4.1 point 6.
- Every Layer 2 row (C-1…C-15) is **account-level**. A customer who has only ever used the mobile app is still exposed to C-1, C-8, C-9 and C-10 by anyone who holds the published anon key plus their password or a GoTrue session.
- One mobile-side item: `mobile/app/(auth)/reset-password.tsx:16-24,45-48` forwards a deep-link `access_token` as `recoveryAccessToken`. Low; folded into A-12 (§5.4 item 5).

---

## 9. Structural recommendation — remove `supabase-js` from the web, route identity through the backend, retire the published key (A-21)

**Recommendation (this role's position; not a build instruction).**
1. Remove `@supabase/supabase-js` from the web bundle. Web signup, login, resend and email verification go through the backend endpoints that already exist and that mobile already uses:
   - `POST /auth/signup`, `/auth/login`, `/auth/resend-verification`, `/auth/verify-email`;
   - `/auth/reset-password/*` (already done under INC-003 F-1/F-3);
   - `/auth/mfa/challenge`.

   The email-link callback hands its `token_hash` to the backend instead of calling `verifyOtp` in the browser. This restores ADR-0002's mediation principle and F001 FU-18's ruling that no client holds a Supabase-honoured JWT, which brings back the "structural win" F001 §6 relied on.
2. **Rotate or disable the published anon key** (A-22 item 11 decides which is possible). Without this step, item 1 only removes Layer 1. Every Layer 2 High (C-1, C-2, C-8, C-9, C-10) stays callable by anyone who has scraped any previously shipped bundle.
3. With the browser out of GoTrue, `/auth/supabase/exchange` loses its reason to exist and should be removed. That retires TB-8c, A-10's coupling, A-13's CSRF surface and A-12's laundering path together.
4. Retire `pendingSignupAuth` (A-14) as part of the same change.

**Trade-offs, stated honestly.**
- Web loses Supabase's client conveniences (PKCE, auto-refresh).
- Signup email deliverability and the `auth-send-email` hook are unaffected, because the backend already triggers GoTrue's mail.
- The work is mostly deletion plus wiring to existing endpoints. No new backend contract is needed except possibly a backend-mediated verification-status poll (§6.1).

**This is architecture-significant: it reverses a shipped client architecture and closes a re-threat-model trigger.** It therefore becomes an **ADR owned by `solution-architect`**, with `authentication-engineer`, `frontend-architect` and `backend-architect` as contributors, this role as security reviewer, and `cto` ratifying. Until it lands, A-10, A-13, A-17, A-18, A-19 and A-22 are the interim controls, and **A-9's governance correction stands**: the anon key is not "public, not a secret" in this architecture.

---

## 10. Note to `cto` — material inputs to INC-003's severity, and two findings that may warrant their own

Not a re-rating; that is `cto`'s call. These are the inputs.

1. **The GoTrue AAL2 rule (§0 point 3) is material to INC-003 §4.** *Upstream* GoTrue returns `401 insufficient_aal` for any password/email/phone change on an MFA-enabled user holding an AAL1 session. The hosted project reports v2.195.0 (`supabase/.temp/gotrue-version`, not re-verified live), and production reports of this error predate it. So the original INC-003 web path would most likely **have failed for any staff account that already had a verified TOTP factor.** It would have succeeded for privileged accounts with no verified factor yet (invited, not enrolled) and for all customers. INC-003 §4's High rested on staff exposure, so this narrows that population considerably. It does **not** touch the revocation-failure and audit-gap limbs, which were unconditional. It should also inform A-6: a clean result for MFA-enrolled staff is now the expected outcome, and the accounts to look at hardest are the privileged ones that were not yet enrolled during the exposure window. **Live confirmation** that v2.195.0 enforces the rule belongs in A-22.
2. **Session-lifecycle coupling (§4, A-10/A-23) may warrant its own incident-level severity, independent of A-5's scope.** It defeats every backend revocation control (logout-all, `admin_forced`, SR-8, FR-20) for the default customer population. It is reachable today with no precondition beyond holding a GoTrue session once. It also makes SU-FU-1's newly gated suspend action ineffective for its main use case (§11). I rate it **High**. It is arguably a separate control-bypass incident of the same class as INC-003, and I recommend `cto` consider opening it as **INC-004** rather than leaving it as an action under INC-003.
3. **Login CSRF (§5, A-13) also merits its own assessment.** It is a no-precondition, one-click attack on the customer surface whose impact is the victim's asset inventory and theft reports landing in an attacker's account. Rated **High** here on data-class grounds; `cto` may weigh it differently.
4. **A-9 (governance).** Feature 006 `security-review.md` §4's acceptance of the anon key as "public, not a secret" was written by this role. It contradicted F001 SR-4 without citing it or obtaining `cto` sign-off. I am **voiding that acceptance on my own authority**: it is my section, and the correction will be recorded there in place with the superseded text marked void. Accepting the residual risk of a published anon key until A-21 lands is then a `cto` risk-acceptance decision, made explicitly, as F001 §10's rule requires. Silent acceptance is not available.

---

## 11. SU-FU-1 fold-in — flagged to `backend-architect` (A-23)

ADR-0012 §9.4 records that, at the time of writing, `backend-architect` found no A-5 finding touching `account_state_change`, `verification_decision` or `plan_catalog_edit`. **There now is one, for `account_state_change`.**

- **What SU-FU-1 shipped is correct and stands.** `requireStepUp` on `PATCH /v1/admin/accounts/:id/state` (`admin-accounts.ts:185-189`, commits `a730488` / `ded59a7`) does what ADR-0012 says. Nothing here reopens ADR-0012 or argues against the step-up gate.
- **What the action does not do:** suspend/deactivate revokes only backend sessions and push tokens (`admin-accounts.ts:259-263`). It never reaches the subject's GoTrue sessions (§4.1 point 4). So for a customer subject:
  - during suspension, the attacker can still mutate credentials, email and factors directly at GoTrue (C-8/C-9/C-10);
  - on reactivation, the attacker can re-mint immediately via the exchange (§4.2 N-3).

  The action's purpose ("lock out an attacker-controlled account", per ADR-0012 §3's own rationale) is therefore not achieved for the default customer.
- **`verification_decision` and `plan_catalog_edit`:** no browser-to-Supabase path touches either. Both are backend-only writes against MongoDB/`app.*`, unreachable via PostgREST pending §7 item 4. No fold-in needed.
- **Requested of `backend-architect` (A-23, follow-up, not fixed by A-5):** extend the state-change handler so that suspend/deactivate also terminates the subject's GoTrue sessions, and preferably bans the GoTrue user until reactivation (§4.4 item 2). Make reactivation subject to the A-10 watermark, so no GoTrue session that predates the suspension can be exchanged afterwards. Add regression tests for suspend → (GoTrue-direct mutation attempt) → reactivate → stale-token exchange refused. This is a Stage 8 item: I will review the design before build, per ADR-0012 §9.6, which already lists my SU-FU-1 Stage 8 sign-off as outstanding. **That sign-off is now conditional on A-23 having an owner and a date**, not on A-23 being complete. SU-FU-1's backend gate itself is sound.

---

## 12. Referrals to `compliance-specialist` (not determinations)

- **Consent evidence (A-16):** web signup creates the identity in GoTrue without passing through the backend's `consentAccepted: z.literal(true)` check (`auth.ts:78`). The consent checkbox is client-side only (`CustomerOnboardingPage.tsx:197-200`). Whether the platform holds POPIA-adequate evidence of consent for web-originated accounts is `compliance-specialist`'s call.
- **Plaintext password at rest in the browser (A-14):** input to the s19 safeguards assessment already open under INC-003 §7.
- **Retrospective exposure (A-22 item 12):** if the extended audit-log query shows C-8/C-9/C-10 activity on customer accounts that cannot be tied to legitimate use, the s22 analysis becomes live for those accounts, the same dependency INC-003 §7 records for A-6.

---

## 13. Action register (registered in INC-003 §11)

| ID | Finding | Severity | Owner | Due |
|---|---|---|---|---|
| A-8 | Published anon key opens GoTrue password grant (C-1): FR-11/FR-12/SR-4 bypass + password oracle | High | `security-engineer` + project owner (interim: §7 item 8); structural via A-21 | 2026-10-06 (interim) |
| A-9 | Governance: F006 §4 acceptance of anon key contradicted SR-4 without `cto` sign-off; void it and put the residual to `cto` | High (governance) | `cybersecurity-architect` (void) → `cto` (accept/reject) | 2026-10-06 |
| A-10 | Session-lifecycle coupling: no backend revocation reaches the browser GoTrue session; exchange re-mints (§4) | High | `backend-architect` (design) + `authentication-engineer` | 2026-10-09 |
| A-11 | INC-003 F-9(b) guard is code-hygiene, not a capability control; relabel it and add a bundle check for the anon key once A-21 lands | Low | `automation-qa-engineer` | 2026-10-16 |
| A-12 | `/reset-password/confirm` accepts any GoTrue token as `recoveryAccessToken` (no `amr=recovery` check); mobile deep-link parity | Medium | `backend-architect` | 2026-10-09 |
| A-13 | Callback login CSRF: raw `#access_token`, attacker-supplied `token_hash`, sign-in on verification (§5) | High | `authentication-engineer` + `frontend-architect` | 2026-10-07 |
| A-14 | Plaintext password in `sessionStorage`, replayed every 10 s (§6.1) | Medium | `authentication-engineer` | 2026-10-16 |
| A-15 | No CSP / Referrer-Policy on any web host; two un-revocable credentials in JS storage (§6.2, SR-12(d)) | Medium | `frontend-architect` + `devops-engineer` | 2026-10-16 |
| A-16 | GoTrue-direct signup/resend/recover bypass backend limiters, audit, consent and F-2 redirect selection (C-3/C-4/C-5) | Medium | `authentication-engineer`; consent → `compliance-specialist` | 2026-10-16 |
| A-17 | Callback accepts `magiclink`/`invite`/`email_change`/`email` OTP types; passwordless session path (C-6/C-7) | Medium | `authentication-engineer` | 2026-10-07 (with A-13) |
| A-18 | GoTrue `PUT /user` password/email change by any AAL1 session on accounts without TOTP (C-8/C-9), the INC-003 capability at Layer 2 | High | project owner + `devops-engineer` (interim: §7 items 1, 2, 10); structural via A-21 | 2026-10-06 (interim) |
| A-19 | GoTrue-direct TOTP enrolment on accounts without a verified factor: attacker factor = durable ATO + owner lockout (C-10) | High | `authentication-engineer` + `site-reliability-engineer` (interim: extend SR-14(b) reconciliation to flag factors with no matching backend enrolment audit); structural via A-21 | 2026-10-09 (interim) |
| A-20 | TOTP-enrolled customers cannot reset password via backend (AAL1 → `insufficient_aal` → `UPSTREAM_UNAVAILABLE`); SR-24 absent | Medium (availability; fails closed) | `backend-architect` + `authentication-engineer` | 2026-10-16 |
| A-21 | Structural: remove `supabase-js` from web, retire exchange, rotate/disable published anon key (§9) → ADR | High | `solution-architect` (ADR), `cto` (ratify) | ADR draft 2026-10-09; ratification 2026-10-16 |
| A-22 | Live-config verification of §7's 12 items, incl. AAL2 enforcement on v2.195.0 and the customer-account audit-log query | High (gates the "requires console" rows) | `security-engineer` + project owner; `devops-engineer` records | 2026-10-06 (same session as A-6) |
| A-23 | SU-FU-1 fold-in: suspend/deactivate must reach GoTrue; reactivation subject to A-10 watermark (§11) | High | `backend-architect` | 2026-10-09 |

**Totals:** 16 actions. **High 9** (A-8, A-9, A-10, A-13, A-18, A-19, A-21, A-22, A-23) · **Medium 6** (A-12, A-14, A-15, A-16, A-17, A-20) · **Low 1** (A-11).

---

*Filed by `cybersecurity-architect`, 2026-10-02, discharging INC-003 A-5 and Feature 001 §13's re-threat-model trigger. This document is shared and append-only once committed: other roles respond in new sections citing the section they address.*