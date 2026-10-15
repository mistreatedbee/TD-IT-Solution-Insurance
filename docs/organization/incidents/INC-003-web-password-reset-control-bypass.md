# INC-003 — Web password-reset flow bypasses the SR-6 MFA gate, session revocation, and the backend password policy

**Owner / chair:** `cybersecurity-architect` · **Opened:** 2026-09-23 · **Status:** **OPEN — remediation required, P0**
**Severity:** **High** (not Critical — see §4 for the reasoning, which is a precondition argument, not a minimisation)
**Class:** Architecture drift / security-control bypass on a deployed surface. **Not** a personal-information breach — see §7.
**Detected by:** code review this session. **Evidence of exploitation:** none found; none looked for beyond the repo (no production auth logs are reachable from here — see §8, A-6).

---

## 1. Summary

Feature 001's Stage 8 gate (`docs/features/001-authentication/security-review.md`) was granted subject to
**SR-6**, whose text is explicit: *"state explicitly that the password is NOT changed until MFA verification
succeeds for privileged accounts."* The backend implements SR-6 correctly. **The deployed web client does not
call the backend at all for password reset**, and therefore executes a privileged-account password change with
no MFA proof, no session revocation, no push-token sweep, no backend password-length check, and no audit-log
entry.

This is not a missing feature. The control exists, was reviewed, was signed off, and is reachable-around in
shipped code. That is the definition of architecture drift, which is one of the named risks this role monitors.

---

## 2. Verified findings (read from code 2026-09-23, not inherited from the reporting framing)

### 2.1 The backend control is correct and intact

`backend/src/routes/auth.ts`:

- **L845–848** — `isPasswordValidForUserType(newPassword, isPrivilegedUserType(account.userType) ? 'privileged' : 'customer')` enforces `PASSWORD_MIN_LENGTH.privileged = 14` (`backend/src/lib/policy.ts:25-28`).
- **L850–859** — privileged accounts get `{ mfaVerificationRequired: true, mfaVerificationToken }`; the new password is parked in KV under `reset-mfa-pending:<token>` and **is not applied**. SR-6 satisfied.
- **L861–875** — customer branch: `updateUserPassword` → `sessions.revokeAllForAccount(account.id, 'password_reset')` → `revokeJtisInKv` → `pushTokens.disableAllForAccount` (SR-007-1) → audit `password_reset_completed`.
- **L886–956** — `POST /auth/reset-password/mfa-verify`: rate-limited per `RESET_PASSWORD_MFA_VERIFY_LIMIT` (5/15 min), single-use token, real TOTP challenge/verify against the recovery access token, then the same revoke + push-disable + audit sequence. SR-6's rate-limit limb satisfied.
- **L722–749** — `POST /auth/reset-password/request` applies the ratified `RESET_PASSWORD_REQUEST_LIMIT` (3/hr per identifier, 10/hr per IP) and records `password_reset_requested`.

Mobile consumes this correctly: `mobile/app/(auth)/reset-password.tsx:45-58` calls `resetPasswordConfirm` and branches on `isMfaVerificationRequired`. **The bypass is web-only.**

### 2.2 The web client bypasses all of it — both limbs, request and confirm

- **Confirm limb.** `src/pages/CustomerResetPasswordPage.tsx:46` calls `updatePasswordWithSupabase(password)`, which is `src/customer/supabase/auth.ts:221-231` → `supabase.auth.updateUser({ password })` directly against Supabase Auth. The backend is never contacted for the password change. It then calls `exchangeSupabaseSession`, i.e. the backend only ever sees the *aftermath*.
- **Request limb (not in the original framing — additional finding).** `src/pages/CustomerForgotPasswordPage.tsx:22` → `requestPasswordReset` (`src/customer/supabase/auth.ts:203-208`) → `supabase.auth.resetPasswordForEmail(...)` directly. `POST /auth/reset-password/request` is never called from web either.
- **User-type awareness: none.** Neither file, nor `src/customer/supabase/auth.ts`, nor `src/customer/api/auth.ts` has any notion of `userType` on the reset path. `mfaVerificationRequired` appears **zero times anywhere under `src/`** (verified by grep). No web code knows the response shape exists.
- **Password length.** `CustomerResetPasswordPage.tsx:11` hardcodes `PASSWORD_MIN_LENGTH = 10`. This is worse than "10 instead of 14": it is a **client-side check only**, trivially removed in devtools, and the backend's `isPasswordValidForUserType` never executes on this path. The only server-side floor left is the Supabase project's own minimum-password-length setting. `supabase/config.toml` sets none, so that floor is whatever the hosted project is configured to (GoTrue default: **6**). The enforced privileged-account minimum on this path is therefore unverified and plausibly 6, not 14.

### 2.3 Staff *do* have an intended entry point — the reporting framing was wrong on this point

The framing supplied to me stated that no privileged login page links to `/forgot-password`, making this
theoretical. **That is incorrect and it changes the severity.**

`src/pages/CustomerLoginPage.tsx` is, by its own header comment (L17-48), *"the single, role-agnostic login
page for every account type — customer, admin, security_company_operator, support_agent"*, and **L213-217
renders a "Forgot password?" link straight to `/forgot-password`.** The route is registered publicly at
`src/App.tsx:88`. `src/pages/CustomerAuthCallbackPage.tsx:94,116` routes a `type=recovery` callback to
`/reset-password`. The chain is complete and signposted:

> staff member opens `/login` → clicks "Forgot password?" → Supabase sends a recovery link to the staff
> mailbox → `/auth/callback?type=recovery` → `/reset-password` → password changed with no MFA, no revocation.

`PrivilegedLoginPage` (`src/dashboard/components/PrivilegedLoginPage.tsx`) has no forgot-password link — but
it is described in `CustomerLoginPage`'s own comment as a *redundant* entry point to the same flow, so its
silence provides no containment.

### 2.4 The symptom that masks it

After the password is changed, `updatePasswordWithSupabase` calls `exchangeSupabaseSession`, and
`POST /auth/supabase/exchange` rejects any non-customer account (`backend/src/routes/auth.ts:372-375`,
`account.userType !== 'customer'` → `INVALID_CREDENTIALS`). A staff member using this flow therefore sees an
**error page after their password has already been successfully changed**. The flow *looks* broken for staff,
which is very likely why it was never treated as reachable. It is not broken — it is a completed credential
mutation with a cosmetic failure on the follow-on sign-in.

### 2.5 A re-threat-model trigger fired and was never honoured

`docs/features/001-authentication/security-review.md` §13 lists, verbatim, as a re-threat-model trigger:
*"any client-side Supabase SDK proposal (which would reverse FU-18 and make RLS front-line again)."* The web
app ships `@supabase/supabase-js` in the browser (`src/customer/supabase/client.ts`) and uses it to mutate
credentials. That trigger fired at the moment web auth was built and no re-threat-model was run. **This
incident is the deferred cost of that omission**, and the process fix in §6 (A-5) matters at least as much as
the code fix.

---

## 3. What is actually lost, control by control

| Control | Owner document | Status on the web reset path |
|---|---|---|
| **SR-6** — password not changed until MFA verified (privileged) | 001 security-review §8 | **Bypassed.** Password changes with no second factor. |
| **SR-007-1** — completed reset disables all push tokens | 007 security-review §8.2 | **Never fires.** A stolen device keeps receiving `theft_critical` notifications through the owner's reset. |
| **Session revocation** — `revokeAllForAccount` + `revokeJtisInKv` | ratified policy | **Never fires.** Pre-existing sessions, including an attacker's, survive the "reset". |
| **`PASSWORD_MIN_LENGTH.privileged = 14`** | `backend/src/lib/policy.ts:25-28` | **Not enforced server-side at all** on this path (§2.2). |
| **Reset rate limits** (3/hr identifier, 10/hr IP) | 001 security-review §6 | **Not applied.** Supabase's own quota is the only limiter. |
| **Audit trail** — `password_reset_requested` / `password_reset_completed` | 001 security-review §6 | **Neither event is written.** A web password reset — including a staff one — leaves **no entry in the platform audit log**. |

The audit limb (last row) is its own finding and was not in the original framing. It means that if this *has*
already been used against a staff account, **the platform holds no record from which to determine that.** It
also degrades POPIA s19 accountability evidence and removes the forensic anchor any future IR would need.

---

## 4. Severity ruling — High, and why an incident record rather than a finding

**Ruling: this is an incident. A formal record (this document) is required; a security-review-style finding
alone is not sufficient.**

Reasoning, stated so it can be argued with:

1. **A ratified, gate-conditional control is bypassable in deployed code.** Feature 001's Stage 8 sign-off is
   *conditioned* on SR-6. Production behaviour does not match the approved design. Recording that only as a
   finding inside a feature document would mean the gate register continues to show SR-6 as satisfied while it
   is not. Gate integrity is a success metric for this role ("zero Security-Review-gate bypasses"), and a
   silent divergence is functionally a bypass even though nobody requested one. It gets an incident number so
   it is tracked to closure with an owner and a date, not filed.
2. **It is live, not hypothetical.** §2.3 establishes a signposted staff entry point on a publicly routed page
   on a deployed surface (Render, per ADR-0003). This is not "a code path staff don't reach in practice" — it
   is the only password-reset link a staff member is ever shown on the web.
3. **The blast radius is the platform's worst-case asset.** An admin or `security_company_operator` takeover
   yields customer PII plus live asset geolocation — the data class this architecture treats as equivalent to
   biometric/health data, and the exact scenario in §2.3's attack tree ("attacker obtains a session as an admin
   or security-company operator") that SR-6 was written to close.

**Why High and not Critical.** The MFA-bypass limb requires a precondition the attacker does not get for free:
control of the staff mailbox, or interception of the recovery link. An unauthenticated remote attacker who
merely knows a staff email address cannot complete the reset — they never receive the link. SR-6 exists
precisely to make mailbox compromise insufficient for privileged takeover, and that defence-in-depth layer is
gone, but the outer layer (mailbox control) still stands. Two limbs, however, need **no** precondition at all:

- the **revocation failure** — a legitimate staff member who resets their password *because they suspect
  compromise* does not evict the attacker, and reasonably believes they have; and
- the **audit gap** — which is unconditional and already in effect.

These are what lift it above Medium. Combined, they make this a High that is remediated at P0, not a Critical
that would justify taking `/forgot-password` offline mid-session.

**Rejected alternative dispositions,** recorded so the reasoning is auditable:
- *"Security-review addendum only."* Rejected per (1) — it would leave the gate register wrong.
- *"Critical / emergency takedown."* Rejected per the precondition argument. Also, there is no clean config
  toggle: disabling `/forgot-password` removes the only self-service reset for customers too, and pulling the
  route is a code change of comparable size to the fix. The correct response is to ship the fix, not to
  half-disable the surface.

---

## 5. Required fix specification (binding on the implementing roles)

The `cto`'s preliminary direction — route web through the backend rather than build a second staff-specific
reset page — is **confirmed, with the amendments below.** I have vetted it against the trust boundary and it
is the correct call for a structural reason worth stating: **Supabase Auth is the identity *store*, not the
policy decision point. The backend is.** A browser that holds a credential-mutating capability against the
store is, by construction, outside the policy boundary, and no amount of client-side care fixes that. A
second staff-specific page would be strictly worse: it would leave the customer page able to mutate any
account's password (it has no user-type awareness to stop it) and would create two paths to keep in sync —
precisely the class of vulnerability this architecture is supposed to make structurally impossible rather
than rely on developers remembering.

**F-1 — Request limb.** `CustomerForgotPasswordPage` must call `POST /v1/auth/reset-password/request` instead
of `supabase.auth.resetPasswordForEmail`. Restores ratified rate limits and the `password_reset_requested`
audit event, and makes the redirect URL server-controlled.

**F-2 — Redirect target must be server-side and allow-listed.** `ctx.env.passwordResetRedirectUrl`
(`auth.ts:740`) is a single value and is a mobile deep link in every test fixture. It must become a per-client
selection: the request body may carry a `client: 'web' | 'mobile'` discriminator that the backend maps to an
**env-configured allow-listed URL**. The backend must **never** echo a caller-supplied redirect URL — that
would be an open redirect that exfiltrates the recovery token, i.e. trading this bug for a worse one. This is
a hard requirement, not a suggestion; `backend-architect` owns the contract change.

**F-3 — Confirm limb.** `CustomerResetPasswordPage` must call `POST /v1/auth/reset-password/confirm` with
`{ recoveryAccessToken, newPassword }`. The page already establishes a Supabase recovery session via
`/auth/callback`, and the endpoint already accepts `recoveryAccessToken` (`auth.ts:801-818`), so no new
backend contract is needed for this limb. Both endpoints require an `Idempotency-Key` header
(`auth.ts:779,888`); web needs the equivalent of `mobile/src/api/idempotency.ts`.

**F-4 — Handle `mfaVerificationRequired`.** On that response, render a TOTP step and call
`POST /v1/auth/reset-password/mfa-verify` with `{ mfaVerificationToken, code }`. Mobile's defensive handling
(`mobile/app/(auth)/reset-password.tsx:50-58`) is *not* the model to copy — mobile treats it as an error
because privileged accounts do not use the mobile app. **Web must implement the full second step**, because
web is where staff actually reset. Surface the 5-attempt/15-min rate limit and the 5-minute token TTL as
user-visible states, not as generic failures.

**F-5 — Remove the capability, don't just stop calling it.** `updatePasswordWithSupabase`
(`src/customer/supabase/auth.ts:221-231`) must be deleted, not merely unreferenced. Leaving a working
credential-mutating helper in the client bundle guarantees this recurs. If some other caller needs it, that
caller is also in scope for this fix and must be named in the PR.

**F-6 — Password length: do not add a user-type probe.** The client cannot know the account's user type before
authentication and **must not learn it** — a client-side branch on privileged-vs-customer minimum length would
be a user-type enumeration oracle, which would breach the FR-15 anti-enumeration posture the request endpoint
is explicitly built to preserve (`auth.ts:731-736`). Required behaviour: the client displays the customer
minimum (10) as a hint, submits, and renders the server's `VALIDATION_ERROR` verbatim-enough for a privileged
user to understand they need 14. The server is the only length authority. This constraint is binding on the
implementer.

**F-7 — No auto-sign-in after reset.** The backend revokes all sessions on completion, so the current
`auth.signInWithTokens(...)` follow-on (`CustomerResetPasswordPage.tsx:55`) is both wrong and the source of
the misleading error in §2.4. Show a success state and route to `/login`, matching mobile's Screen D.

**F-8 — Supabase project floor (defence in depth).** Supabase remains the entity that ultimately writes the
password hash. Set the project's minimum password length to **14** in Supabase Auth settings and enable leaked
-password protection. Owner: `devops-engineer` with the project owner. This does not substitute for F-1…F-7;
it is the backstop for any path we have not found. It is also the only part of this that can be done today
without a deploy.

**F-9 — Regression tests, required before this incident closes.**
(a) a web test asserting a privileged-account reset cannot complete without the mfa-verify step;
(b) a guard test asserting no `supabase.auth.updateUser({ password })` call exists anywhere under `src/`;
(c) a test asserting the web forgot-password path calls the backend endpoint, not the Supabase SDK.
Owner: `automation-qa-engineer`, derived from this threat model per the QA/threat-model link.

**Routing.** F-1/F-3/F-4/F-5/F-6/F-7 → `authentication-engineer` with `frontend-architect`; F-2 →
`backend-architect` (contract) then `backend-engineer`; F-8 → `devops-engineer`; F-9 →
`automation-qa-engineer`. **Implementation verification is `security-engineer`'s**, not mine — I designed it,
they confirm the shipped code matches. This incident does not close on the implementer's own say-so.

---

## 6. Actions register

| ID | Action | Owner | Due | Status |
|---|---|---|---|---|
| **A-1** | F-1…F-7 implemented and merged | `authentication-engineer` / `frontend-architect` | 2026-09-26 | **DONE** (commit `ba65236`) |
| **A-2** | F-2 contract amendment (allow-listed per-client redirect) | `backend-architect` | 2026-09-25 | **DONE** (commit `ac1685d`) |
| **A-3** | F-8 Supabase project password floor = 14 + leaked-password protection | `devops-engineer` + project owner | 2026-09-24 | OPEN — config declared (commit `e2b1904`), **not yet applied to the hosted project**; see `cto`'s 2026-09-29 ruling in §10, item 2 |
| **A-4** | F-9 regression tests green | `automation-qa-engineer` | 2026-09-26 | **DONE** (61/61 web, 383/383 backend, part of `ba65236`) |
| **A-5** | Re-threat-model the **browser-resident Supabase SDK** as a trust boundary in its own right — every credential- or session-mutating call the web bundle can make against Supabase directly, not just this one. The §2.5 trigger is now overdue. | `cybersecurity-architect` | 2026-10-03 | OPEN — reaffirmed P1 by `cto` 2026-09-29, see §10 |
| **A-6** | Check production Supabase auth logs for `user_updated`/recovery events against any `admin` / `security_company_operator` / `support_agent` address since web auth shipped, and report whether this path has been exercised. Not reachable from this repo; needs console access. | `security-engineer` + project owner | 2026-09-26 (**overdue as of 2026-09-29**) | OPEN — escalated to P0 by `cto`, see §10 |
| **A-7** | Implementation verification against §5 and counter-sign | `security-engineer` | on A-1 merge | **DONE — PASS**, see §9 |

A-6 is the one that determines whether §7's "no breach" conclusion holds. Until it returns, §7 is provisional.

---

## 7. Compliance position — provisional, and `compliance-specialist` owns the final call

My technical read, offered as input to `compliance-specialist` and **not** as a compliance determination,
which is not mine to make:

- **No POPIA s22 notification obligation is triggered on present evidence.** This is a control failure, not a
  confirmed unauthorised access to personal information. No exposure of PII or location data has been
  demonstrated.
- **That conclusion is conditional on A-6.** If the production auth logs show a recovery/password-update event
  against a privileged account that cannot be tied to a legitimate staff action, this record must be reopened
  and reclassified, and the s22 analysis becomes live. I am flagging that dependency explicitly rather than
  letting a clean-looking §7 stand on an unchecked assumption.
- **s19 (security safeguards) is engaged regardless of exploitation.** A documented, ratified safeguard was not
  operative on a deployed surface, and §3's last row means the platform cannot evidence reset activity on that
  surface at all. `compliance-specialist` should judge whether that warrants anything beyond remediation.

Referred to `compliance-specialist` for concurrence or correction. Per the append-only rule, that response
belongs in a new section of this document, not an edit to this one.

---

## 8a. F-2 implementation record (`backend-architect`, 2026-09-23)

Implemented, not just specced — A-2's contract amendment is closed on the backend side. This section cites
§5's F-2 and does not restate or alter it.

**Interface shipped:**

- `POST /v1/auth/reset-password/request` body gains an optional `client: 'web' | 'mobile'` field
  (`z.enum(['web','mobile']).optional().default('mobile')`, `backend/src/routes/auth.ts:728-731`). Default
  preserves the existing mobile client's behaviour unchanged — `mobile/src/api/auth.ts:131-134` sends no
  `client` field today and does not need to change for this fix to be safe.
- The handler (`backend/src/routes/auth.ts:748-758`) does a closed, server-side lookup —
  `client === 'web' ? ctx.env.passwordResetRedirectUrlWeb ?? ctx.env.passwordResetRedirectUrl :
  ctx.env.passwordResetRedirectUrl` — and interpolates only that value plus the account's own normalized
  email into the Supabase redirect URL. **No request field is ever read into the redirect string.** Because
  `validateBody` replaces `req.body` with the Zod-parsed result (`backend/src/lib/validation.ts:17`, strips
  unrecognized keys and applies the `client` default), any additional caller-supplied field attempting to
  smuggle a URL (`redirectUrl`, `redirectTo`, `continueUrl`, etc.) is dropped before the handler ever runs —
  verified by test, not just by inspection (see below).
- **New env var:** `PASSWORD_RESET_REDIRECT_URL_WEB`, additive alongside the existing
  `PASSWORD_RESET_REDIRECT_URL` (kept as-is; it remains the mobile value — renaming it would have forced an
  update to ~30 existing test fixtures across `backend/src/routes/*.test.ts` and `backend/src/lib/*.test.ts`
  for zero behavioural gain). `Env.passwordResetRedirectUrlWeb` (`backend/src/config/env.ts`) is typed
  **optional** for the same reason — every pre-existing hand-built `Env` test fixture compiles unchanged —
  but `loadEnv()` always populates it (env var or a hardcoded fallback), so production/staging never run
  without it. Mirrors the existing `INVITATION_ACCEPT_REDIRECT_URL` web/mobile split precedent (Feature 017
  C-1) rather than inventing a new pattern.
- **Deploy config:** `PASSWORD_RESET_REDIRECT_URL_WEB` added to `render.yaml` (production, defaults to
  `https://td-it-solution-insurance-alpha.vercel.app/reset-password`, matching the existing prod web origin)
  and `render-staging.yaml` (defaults to `https://td-it-insurance-web-staging.onrender.com/reset-password`),
  plus `backend/.env.example`. **Action required, not yet done here:** this new URL must be allow-listed in
  Supabase Auth → URL configuration alongside the existing mobile deep link, or GoTrue will silently drop the
  redirect — same caveat `env.ts` already documents for `INVITATION_ACCEPT_REDIRECT_URL`. Flagging for
  `devops-engineer` to action alongside A-3.

**F-3 confirmed scope, no change needed.** Re-verified `backend/src/routes/auth.ts:801-818` (now shifted a
few lines from the pre-implementation line numbers in §5 due to F-2's schema/comment additions, still the
same `recoveryAccessToken` branch) — the confirm endpoint's contract is unchanged by this work. F-2 is scoped
entirely to `/request`'s redirect selection, as §5 anticipated.

**F-9(c)-adjacent regression tests added** (not a substitute for `automation-qa-engineer`'s owned F-9, which
covers the frontend-side (a)/(b)/(c) items against F-1/F-5 — this is the backend contract's own test,
narrower and specific to F-2): `backend/src/routes/auth.test.ts`, new `describe('POST
/auth/reset-password/request — INC-003 F-2 per-client redirect allow-list')`, three cases —
(1) omitted `client` resolves to the mobile constant, (2) `client: 'web'` resolves to the web constant, (3) a
request smuggling `redirectUrl`/`redirectTo`/`continueUrl` alongside `client: 'web'` still resolves to the
web constant with the attacker string absent from the value handed to `sendPasswordRecoveryEmail`.

**Verification status:** implemented and unit-tested against fakes (no live Supabase/Postgres/Redis). I do
not have shell/CI execution in this environment to run `cd backend && npm test` / `npx tsc --noEmit` myself
this session — the three new tests and the full suite need to be run by `backend-engineer` or CI before this
sub-item is treated as green, and this remains subject to `security-engineer`'s independent A-7
implementation-verification pass per §5's routing, same as every other F-item. Not claiming A-7 here.

Routing note: this closes the backend half of A-2. The frontend `client: 'web'` call site
(`CustomerForgotPasswordPage` per F-1) is `authentication-engineer`/`frontend-architect`'s remaining work —
not touched here.

---

## 8b. F-1/F-3–F-7 implementation record (`authentication-engineer`, 2026-09-23)

Builds on §5's spec and §8a's shipped `client: 'web'` backend contract. Implemented and tested;
`security-engineer`'s A-7 verification (§5 routing) still applies and is not claimed here.

**F-1 (request limb).** `src/pages/CustomerForgotPasswordPage.tsx` no longer calls
`supabase.auth.resetPasswordForEmail` (the removed `requestPasswordReset` helper,
`src/customer/supabase/auth.ts`). It now calls `resetPasswordRequest(email)`
(`src/customer/api/auth.ts`), which posts `{ email, client: 'web' }` to
`POST /v1/auth/reset-password/request` per §8a's contract. On failure the page now surfaces the
mapped error directly (rate limit, network, upstream) instead of the prior code's "treat as
submitted unless the message contains 'rate limit'" heuristic — safe to simplify because the
endpoint's 202 response is unconditionally generic (FR-15), so anything that throws is a real
failure, never an "account not found" signal.

**F-3 (confirm limb).** `src/pages/CustomerResetPasswordPage.tsx` no longer calls
`updatePasswordWithSupabase`. The page already established a Supabase recovery session via
`/auth/callback` (`CustomerAuthCallbackPage.tsx`, unchanged) and reads its `access_token` via
`getSupabase().auth.getSession()` (same technique the removed helper used, now used only to
obtain a bearer credential to hand the backend, never to mutate the password itself). It calls
the new `resetPasswordConfirm({ recoveryAccessToken, newPassword })`
(`src/customer/api/auth.ts`), which POSTs to `/auth/reset-password/confirm` with an
`Idempotency-Key` header (`newIdempotencyKey()`, matching `src/customer/api/policies.ts` /
`assets.ts`'s existing convention). Confirmed against `backend/src/routes/auth.ts:801-818` per
§8a — no backend contract change needed, matches as specced.

**F-4 (MFA step).** On `{ mfaVerificationRequired: true, mfaVerificationToken }`, the page moves
to a real `mfa` step (6-digit TOTP input) instead of mobile's error-out pattern
(`mobile/app/(auth)/reset-password.tsx:50-58`, explicitly not copied per §5). Calls the new
`resetPasswordMfaVerify({ mfaVerificationToken, code })` against
`POST /auth/reset-password/mfa-verify` (also `Idempotency-Key`-bearing). User-visible states
added, not silent failures: a live countdown from `RESET_PASSWORD_MFA_VERIFY_TOKEN_TTL_SECONDS`
(5 min, mirrored as `MFA_TOKEN_TTL_SECONDS` in the component) that flips to an explicit "expired,
request a new link" card; and a `RATE_LIMITED` branch that reads the `Retry-After` response
header (see next paragraph) and renders "try again in N minute(s)", disabling the submit button
for that window rather than just showing a generic error on every retry.

**Plumbing needed for F-4's rate-limit UI, additive only:**
- `src/dashboard/api/errors.ts` — `ApiError` gained two optional fields: `details` (captures a
  catalogue error's `extra` payload, e.g. `VALIDATION_ERROR`'s `details: [...]`) and
  `retryAfterSeconds` (third constructor arg). Neither is populated unless a caller passes it, so
  every existing `new ApiError(status, body)` call site (`dashboard/api/client.ts`,
  `customer/supabase/auth.ts`, `DashboardAuthProvider.tsx`, `InvitationAcceptPage.tsx`)
  is unaffected — verified by the full suite passing unchanged (see test results below).
- `src/customer/api/client.ts`'s `rawRequest` now reads the `Retry-After` response header on a
  non-OK response and threads it into the thrown `ApiError`'s third argument. This is the only
  place a numeric retry-after reaches the UI; the backend only ever sets it as a header
  (`backend/src/middleware/error-handler.ts:92-94`), never in the JSON body.
- `src/lib/user-facing-errors.ts`'s `mapApiErrorByCode` gained an optional `details` parameter,
  used only for `VALIDATION_ERROR` in the `password-reset` context: when the server's `details`
  array is present, the array is rendered verbatim-enough (`"...: password does not meet the
  minimum length requirement."`) instead of the generic "Some details look incorrect" fallback.
  This is F-6's binding requirement in code: the string never mentions a user-type or a specific
  number, so a privileged user is told what's wrong without the client ever knowing or branching
  on which minimum applies — the check that would fail is entirely server-side
  (`isPasswordValidForUserType`, `backend/src/routes/auth.ts:862`).

**F-6 (no user-type probe).** Confirmed no new code path reads or infers `userType` anywhere in
this flow. The pre-existing client-side length gate (`PASSWORD_MIN_LENGTH_HINT = 10`, renamed
from `PASSWORD_MIN_LENGTH` for clarity that it is a hint) is unchanged in effect: it only ever
rejects locally when `password.length < 10`, so a 10–13-character password from a privileged
account still round-trips to the server and gets the real `VALIDATION_ERROR`. Verified by test
(see below) — a 12-char password is submitted, not blocked client-side, and the server's message
is what's rendered.

**F-7 (no auto-sign-in).** Removed: the `auth.signInWithTokens(...)` call after a successful
reset, and the `useCustomerAuth()` dependency entirely (the page no longer needs the customer
auth context). Both the customer-branch success and the post-MFA-verify success now call a single
`endAndRedirectToLogin()` that (a) best-effort calls `getSupabase().auth.signOut()` to clear the
local recovery session client-side — hygiene only, since the backend has already revoked every
server-side session and disabled push tokens (SR-007-1) regardless of what the browser does next
— and (b) `navigate('/login', { replace: true })`. No call to `/auth/supabase/exchange` remains
anywhere in this component, closing the §2.4 symptom (staff previously saw a post-reset error
from that endpoint rejecting non-customer types).

**F-5 (delete, don't just unreference).** `updatePasswordWithSupabase` and the direct-Supabase
`requestPasswordReset` are both deleted from `src/customer/supabase/auth.ts`, not left dead —
grep-confirmed zero remaining references anywhere under `src/` or `mobile/`. A code comment is
left in their place pointing at this incident and at the replacement call sites
(`resetPasswordConfirm`/`resetPasswordMfaVerify`/`resetPasswordRequest` in
`src/customer/api/auth.ts`).

**F-9 (this role's share — web-side (a)/(b)/(c), building on §8a's backend-contract tests which
are narrower and already covered separately):**
- `src/pages/CustomerResetPasswordPage.test.tsx` (5 tests): no-session state; customer happy path
  (asserts the exact `/auth/reset-password/confirm` request body and `Idempotency-Key` header,
  then asserts redirect to `/login` with `auth.signOut()` called and no session-establishing call
  made — item (a)'s "cannot complete without mfa-verify" is covered from the other direction by
  the next two cases plus this one proving the *customer* path never even offers an MFA step to
  skip); F-6's 12-char-password-not-blocked-client-side case; the full privileged/staff path
  (confirm → `mfaVerificationRequired` → TOTP entry → `mfa-verify` → success → redirect, no
  auto-sign-in) — this is INC-003 F-9(a)'s direct case: a privileged reset cannot reach the
  "Password updated"/redirect state without a `mfa-verify` call happening in between, because the
  component has no other code path from the `mfaVerificationRequired` response to success; and
  the mfa-verify `RATE_LIMITED` case rendering the real 15-minute window from the `Retry-After`
  header.
- `src/pages/CustomerForgotPasswordPage.test.tsx` (3 tests): asserts the request body is
  `{ email, client: 'web' }` against `/auth/reset-password/request` (item (c)); asserts the
  identical confirmation UI regardless of account existence; asserts a real `RATE_LIMITED`
  failure is shown rather than the generic-accepted state.
- `src/lib/inc-003-no-direct-password-mutation.test.ts` (item (b)): a structural grep-style guard
  (recursive file walk under `src/`, regex `\.updateUser\(\s*\{\s*password\s*[:,]`) that fails
  the suite if any file reintroduces a direct `.updateUser({ password ... })` call. This is
  intentionally a suite-level guard, not a one-off assertion, so it catches a reintroduction in
  any file, not just the two touched here.

**Verification status:** `cd . && npx vitest run` — **16 test files, 61 tests, all passing**
(includes the 9 new/changed tests above plus the full pre-existing web suite, confirming no
regression from the additive `ApiError`/`mapApiErrorByCode` changes). `npm run typecheck`
(`tsc -p tsconfig.json --noEmit`) — clean, no errors. Both run in this session, not asserted from
inspection alone. `security-engineer`'s independent A-7 implementation-verification pass per §5's
routing is still outstanding and is not claimed here.

Not in scope here per the incident's routing and this task's constraints: F-2/backend (§8a,
already shipped), F-8 (Supabase project floor — `devops-engineer`), A-5/A-6
(`cybersecurity-architect`/`security-engineer`), mobile app (already correct per §2.1).

---

## 8. Cross-references

- `docs/features/001-authentication/security-review.md` §2.3 (attack tree), §6 (ratified policy table), §8
  (SR-6), §13 (the re-threat-model trigger that fired). A pointer to this incident is appended there as §14.
- `docs/features/007-notifications/security-review.md` §8.2 (SR-007-1, the push-token limb).
- `backend/src/routes/auth.ts:722-956` — the correct implementation this bypasses.
- `mobile/app/(auth)/reset-password.tsx` — the correct client-side consumption pattern, except for F-4.

---

## 9. A-7 independent verification (`security-engineer`, 2026-09-23)

Independent verification per §5's routing ("Implementation verification is `security-engineer`'s,
not mine — I designed it, they confirm the shipped code matches") and A-7's closure condition
(does not close on the implementers' self-certification). This section verifies §8a and §8b by
reading the shipped code myself, not by trusting either report's prose. Citing §5 (spec), §8a
(backend record), §8b (frontend record).

**Verdict: A-7 PASSES. SR-6 can be marked satisfied on the web surface. No fix reopen required.**
No discrepancy found between the implementation reports and the shipped code on any of the seven
items I was asked to check.

### 9.1 `backend/src/routes/auth.ts` (verifies §8a, checks against F-2/F-3/F-4)

- `POST /auth/reset-password/request`: `resetRequestSchema = z.object({ email: z.string().email(),
  client: z.enum(['web','mobile']).optional().default('mobile') })` (read at `auth.ts` ~L723-726).
  `validateBody` (`backend/src/lib/validation.ts:9-19`) does `schema.safeParse(req.body)` then
  `req.body = result.data` — Zod's `z.object` default (non-`.passthrough()`) strips any key not in
  the schema, so `redirectUrl`/`redirectTo`/`continueUrl`/anything else supplied by a caller never
  survives into `req.body`. Confirmed by reading the handler itself: the only two identifiers read
  out of `req.body` are `email` and `client` — no other field is referenced anywhere in the
  handler. The redirect string is built exclusively from `ctx.env.passwordResetRedirectUrlWeb ??
  ctx.env.passwordResetRedirectUrl` or `ctx.env.passwordResetRedirectUrl`, both of which are
  `Env` fields populated only from `loadEnv()`/environment variables (`backend/src/config/env.ts`
  L103, L120, L340-349, L408-409) — never from `req.body`. §8a's "no request field is ever read
  into the redirect string" claim is correct. Confirmed the added regression test exists and
  passes: `describe('POST /auth/reset-password/request — INC-003 F-2 per-client redirect
  allow-list')` in `backend/src/routes/auth.test.ts` (3 cases, all green — see §9.4).
- `POST /auth/reset-password/confirm`: read the full handler. Privileged branch (`isPrivilegedUserType`)
  parks `newPassword` under `reset-mfa-pending:<token>` in KV and returns
  `{ mfaVerificationRequired: true, mfaVerificationToken }` **without** calling
  `ctx.supabase.updateUserPassword` — the password is not applied. Only the customer branch calls
  `updateUserPassword` directly, followed unconditionally by `sessions.revokeAllForAccount(...,
  'password_reset')` → `revokeJtisInKv` → `pushTokens.disableAllForAccount` → audit
  `password_reset_completed`. SR-6 gate confirmed intact.
- `POST /auth/reset-password/mfa-verify`: rate-limited (`RESET_PASSWORD_MFA_VERIFY_LIMIT`),
  single-use (`consumeResetMfaVerificationToken` + KV `del` on the pending record before password
  is applied), a real TOTP verify against `ctx.supabase.findVerifiedTotpFactor` /
  `challengeTotpFactor` / `verifyTotpFactor` using the recovery access token — not a client-supplied
  flag — gates `ctx.supabase.updateUserPassword(pending.userAccessToken, pending.newPassword)`. Same
  revoke/disable/audit sequence fires afterward. No path from `mfaVerificationRequired: true` to a
  changed password other than through a verified TOTP code.
- `isPasswordValidForUserType` (`backend/src/lib/validation.ts:24-27`) checks
  `PASSWORD_MIN_LENGTH.privileged = 14` / `.customer = 10` (`backend/src/lib/policy.ts:25-28`,
  header-commented "tightenable, not loosenable" — unchanged) and is invoked on both the customer
  and privileged branches of `/confirm` before any password is parked or applied. Confirmed correct
  per-user-type minimum is enforced server-side on this path, not the client-side hint alone.

### 9.2 Web pages (verifies §8b, checks against F-1/F-3/F-4/F-5/F-6/F-7)

- `src/pages/CustomerForgotPasswordPage.tsx`: only calls `resetPasswordRequest(email)`
  (`src/customer/api/auth.ts`), which per its own source posts to the backend endpoint. No
  `import` of `getSupabase`/`../customer/supabase/client` or any Supabase auth call anywhere in
  this file. Confirmed no direct Supabase SDK usage remains on the request limb.
- `src/pages/CustomerResetPasswordPage.tsx`: imports `getSupabase` only to read the already
  -established recovery session's `access_token` (`auth.getSession()`, used purely to obtain a
  bearer credential to hand the backend) and, in `endAndRedirectToLogin()`, to call
  `auth.signOut()` for local hygiene after the backend has already revoked everything server-side.
  No `updateUser`, no `resetPasswordForEmail`, no `signInWithTokens`, no
  `/auth/supabase/exchange` call anywhere in the file (grepped both terms directly against this
  file — zero hits). The privileged path's only route from `password` step to `success` step is:
  `resetPasswordConfirm` → response has `mfaVerificationRequired` → step becomes `'mfa'` →
  `onSubmitMfa` → `resetPasswordMfaVerify` succeeds → `endAndRedirectToLoginWithSuccess()`. There is
  no code path from `'mfa'` to `'success'` that does not pass through a successful
  `resetPasswordMfaVerify` call — confirmed by reading `onSubmitMfa`'s only success branch and
  finding no other `setStep('success')` call site in the component besides the one inside
  `endAndRedirectToLoginWithSuccess`, which both the customer branch and the post-MFA branch share.
  A privileged/staff account genuinely cannot complete a reset on this page without a live TOTP
  verification against the backend. F-6 confirmed: no `userType` read/inferred anywhere in this
  file; `PASSWORD_MIN_LENGTH_HINT = 10` only ever produces a client-side early-return, never blocks
  submission of a 10-13-char password, which is left to the server's `VALIDATION_ERROR`. F-7
  confirmed: no `signInWithTokens` call remains; both success paths route through
  `endAndRedirectToLogin()` → `navigate('/login', { replace: true })`.

### 9.3 `src/customer/supabase/auth.ts` (verifies §8b's F-5 claim)

Read the full file. `updatePasswordWithSupabase` does not exist in the file at all — not present,
not commented-out-but-reachable, actually absent — replaced by an inline comment
(`// INC-003 F-5: ... was removed entirely, not just unreferenced ...`) pointing at this incident.
The direct `supabase.auth.resetPasswordForEmail` call referenced by the old `requestPasswordReset`
helper is likewise absent from the file; the only Supabase Auth calls remaining in this file are
`signUp`, `signInWithPassword`, `resend` (signup-verification resend), and `verifyOtp`
(email-link verification) — none of which mutate a password or issue a recovery email.
Repo-wide grep (`grep -rn "updateUser(" src/ mobile/`) returns only the guard-test file's own
regex-pattern comments (`src/lib/inc-003-no-direct-password-mutation.test.ts`), confirmed by
running that guard test directly (passes, see §9.4). Grep for `resetPasswordForEmail` /
`updatePasswordWithSupabase` across `src/` and `mobile/` returns only the explanatory comment in
`src/customer/supabase/auth.ts` itself — zero live call sites. F-5 confirmed: deleted, not merely
unreferenced.

### 9.4 Test suites — actually run, not taken on report

- `npx vitest run` (repo root): **16 test files, 61 tests, all passing.** Matches §8b's claimed
  count exactly. Includes `src/pages/CustomerResetPasswordPage.test.tsx` (5 tests, including the
  privileged/mfa-verify path and the rate-limit UI case), `src/pages/CustomerForgotPasswordPage.test.tsx`
  (3 tests, including the `client: 'web'` body assertion), and
  `src/lib/inc-003-no-direct-password-mutation.test.ts` (1 test, the structural guard) — all green.
- `cd backend && npm test`: first run showed **1 failed / 383 total**
  (`src/routes/session.test.ts > GET /account/me — mfaEnrolled > is false when the account has no
  verified TOTP factor`, expected 200 got 404). Investigated before accepting either report's
  green claim: (a) `git log` shows `session.test.ts` was not touched by any INC-003 commit
  (F-2/F-1/F-3-F-9 commits only touch `auth.ts`, `auth.test.ts`, the web pages/tests, `env.ts`,
  `render*.yaml`, `.env.example`); (b) running `npx vitest run src/routes/session.test.ts` in
  isolation passes (3/3); (c) re-running the full `npm test` a second time passes cleanly
  (**56/56 files, 383/383 tests**). This is a pre-existing cross-test-file ordering/state-leak
  flake, unrelated to INC-003 and not introduced by F-1…F-9 — flagging for `automation-qa-engineer`
  as a separate, lower-priority test-isolation issue, not blocking A-7.
- `cd backend && npx tsc --noEmit`: clean, no errors, on the same pass as the green full suite.
- The three F-2 backend regression tests referenced in §8a
  (`describe('POST /auth/reset-password/request — INC-003 F-2 per-client redirect allow-list')`,
  `backend/src/routes/auth.test.ts`) exist as described and are included in the above green run.

### 9.5 Scope sweep for anything the implementers might have missed

- Repo-wide grep for `changePassword` / `change-password` / `updatePassword\b` across `src/`,
  `mobile/`, `backend/src` returns **no matches**. There is no "change password while
  authenticated" account-settings feature built anywhere in this repo yet — INC-003's forgot/reset
  scope is therefore the entire password-mutation surface today, not a subset of it. Recorded so
  this isn't silently assumed: if/when such a feature is built, it is a *new* surface requiring its
  own security review, not something INC-003 already covered or missed.
- Mobile: `mobile/src/api/auth.ts` sends no `client` field on the reset-request call, confirming
  §8a's claim that mobile's behaviour is unaffected by F-2's additive schema default
  (`client` defaults to `'mobile'` server-side when omitted).
- `render.yaml` / `render-staging.yaml` / `backend/.env.example` all carry
  `PASSWORD_RESET_REDIRECT_URL_WEB` as claimed in §8a. Confirmed present, not just asserted.
  F-8 (Supabase project floor = 14 + leaked-password protection, and allow-listing the new web
  redirect URL in Supabase Auth → URL configuration) remains **outside this repo's reach to
  verify** — it requires Supabase console access, is owned by `devops-engineer` + the project
  owner per A-3, and is **not claimed as done** anywhere in §8a/§8b. A-7 does not depend on F-8
  (it is explicitly a defence-in-depth backstop per §5, not a substitute for F-1…F-7), but F-8's
  action item (A-3) is separately still OPEN and should not be inferred as closed by this section.

### 9.6 Audit trail (verifies §2.3's "no audit entry" finding is now fixed)

Traced directly in `backend/src/routes/auth.ts`: `POST /auth/reset-password/request` calls
`ctx.auditLog.record({ accountId: account.id, eventType: 'password_reset_requested', ipAddress:
clientIp(req) })` inside the `if (account)` branch (fires only for a real account, consistent with
the anti-enumeration posture — the 202 response is generic either way, but the audit event
correctly only exists when there is an account to attribute it to). Both completion paths —
the customer branch of `/confirm` and `/mfa-verify`'s privileged completion — call
`ctx.auditLog.record({ accountId: account.id, eventType: 'password_reset_completed', ipAddress:
clientIp(req) })` unconditionally on success, before the handler returns. Since F-1 routes the web
request limb through this same backend endpoint (confirmed §9.2) and F-3/F-4 route both confirm
limbs through the same backend endpoints, a web password reset — including a privileged/staff
one — now produces both audit events. §3's "no entry in the platform audit log" row is fixed on
the corrected path; the audit gap identified in §2.2/§3 no longer applies going forward.
**Historical gap unaffected**: A-6 (checking production Supabase auth logs for prior exploitation
before this fix shipped) is a separate, still-OPEN action and is not addressed by this section —
this section only confirms the audit trail is correct *going forward*.

### 9.7 Conclusion

All seven verification items in this session's task, and the two additional cross-checks I ran
(the flaky test investigation and the audit-trail trace), matched the implementers' claims in §8a
and §8b exactly. No discrepancy found. The severity ruling in §4 is unaffected — I found nothing
that would upgrade it — and SR-6 is satisfied on the web surface as of this commit.

**A-7: CLOSED — PASS.** Recommend `cybersecurity-architect` update the Feature 001 gate register
(§8's cross-reference to `docs/features/001-authentication/security-review.md` §14) to reflect SR-6
as satisfied on both mobile and web. **Still open and unaffected by this verification:** A-3/F-8
(Supabase console action, `devops-engineer` + project owner), A-5 (re-threat-model the
browser-resident Supabase SDK as its own trust boundary, `cybersecurity-architect`), A-6
(production auth-log check for prior exploitation, `security-engineer` + project owner — I do not
have Supabase console access in this environment and did not attempt it), and `compliance-specialist`'s
concurrence on §7. This incident does not fully close until those remaining actions land; A-7
specifically (implementation verification) is what closes here.

---

## 10. Prioritisation and ownership after A-7 (`cto`, 2026-09-29)

Cites §6 (actions register) and §9 (A-7 verification). Does not restate or alter either.

**A-6 is overdue (due 2026-09-26, now 3 days late) and is escalated to P0**, ahead of everything
else below. Two reasons: §7's "no breach" conclusion is formally provisional on A-6 per line 227,
and the evidence window may be closing — Supabase dashboard log retention depends on the project's
plan tier, which has not been confirmed, so each day of delay may lose part of what A-6 needs to
examine.

**P0 — today, one console session with the Supabase project owner.** All three need the same
person with production access:

1. **A-6.** `security-engineer` + project owner. Query `auth.audit_log_entries` first (a database
   table, not subject to dashboard log-retention limits — confirm it's populated on this project),
   then the Logs Explorer for recovery/`user_updated` events against any `admin` /
   `security_company_operator` / `support_agent` address since web auth shipped. Record how far
   back the evidence actually goes — a clean result only covers the period the logs cover.
2. **A-3/F-8.** Project owner applies `minimum_password_length = 14` + leaked-password protection
   per `supabase/README.md`; `devops-engineer` confirms afterward.
3. **§8a's outstanding redirect allow-listing.** Project owner adds the new web reset-redirect URL
   to Supabase Auth's URL configuration; `devops-engineer` tests end-to-end afterward. Without this
   the fixed reset flow may not redirect correctly in production.

**If A-6 finds suspicious events:** this incident is reclassified as having real victims —
`security-engineer` force-resets and revokes sessions for affected accounts same-day,
`compliance-specialist` starts the POPIA s22 notification assessment same-day, `cto` re-opens the
severity rating. Everything in P1/P2 below proceeds regardless.

**P1 — start now, in parallel with P0 (different owners, no conflict):**

4. **A-5**, `cybersecurity-architect`, due 2026-10-03, unchanged. This is the root-cause fix; any
   direct browser-to-Supabase call it finds that skips the backend gets its own action item, not a
   note.
5. **SU-FU-1** (ADR-0012, tracked there — referenced here because A-5 may feed it),
   `backend-architect`. Two-sprint deadline from 2026-09-23 ratification is not moving. Stage 8/10
   gates still apply. If A-5 surfaces direct-SDK calls touching account-state change,
   verification-decision, or plan-catalog edit, `backend-architect` folds them into this work
   rather than deferring them.

**P2 — gated on the above:**

6. **C-5** (ADR-0012), `compliance-specialist`: POPIA sign-off on `mfa_step_up_verified`/`failed`,
   done in the same pass as this incident's §7 finding once A-6 returns (one compliance review, not
   two).
7. **C-4** (ADR-0012), `security-engineer`: detection rule for `mfa_step_up_failed` bursts, started
   after A-6 closes and written against the full step-up action set SU-FU-1 adds, targeted for the
   same sprint SU-FU-1 lands.

**Backlog, explicitly deferred:** the missing `partner_organizations` table (blocks
`security_company_operator` invitations in Feature 017 D-2). Owner `product-manager` as sponsor,
with `database-architect`/`solution-architect`; enters the lifecycle at stage 1, needs its own ADR.
Nobody adds a table or an invite path ad hoc to unblock this.

**What needs the user:** getting the Supabase project owner into a console session today for P0
items 1–3. No agent can do that part.

---

## 11. A-5 discharged — browser Supabase SDK threat model filed; new actions A-8 … A-23 (`cybersecurity-architect`, 2026-10-02)

Cites §6 (A-5 row) and §10 item 4. §§1–10 are unaltered.

**A-5: DONE.** The threat model is filed at
[`INC-003-A5-browser-supabase-sdk-threat-model.md`](INC-003-A5-browser-supabase-sdk-threat-model.md), on its due date. It covers:
- Layer 1: what the web bundle calls;
- Layer 2: what the published anon key makes callable regardless of our code;
- session-lifecycle coupling, callback handling, browser storage, live-config verification items, mobile confirmation, and a structural recommendation.

Per `cto`'s §10 instruction, every reachable bypass has its own action below, not a note. The Feature 001 gate register is updated in `docs/features/001-authentication/security-review.md` §15.

**Three items `cto` should read first** (detail in A-5 doc §10):
1. **GoTrue's AAL2 rule is material to this incident's §4 severity.** *Upstream* GoTrue refuses password/email changes from an AAL1 session on an MFA-enabled user. So the original web path most likely **failed** for staff who already had a verified TOTP factor, and **succeeded** for un-enrolled privileged accounts and all customers. §4's revocation and audit limbs are unaffected. A-6's search should concentrate on privileged accounts that were un-enrolled during the exposure window. Live confirmation is A-22.
2. **Session-lifecycle coupling (A-10/A-23)** defeats logout-all, admin suspension, SR-8 and FR-20 for customers without TOTP, and it directly undercuts SU-FU-1's suspend action. I recommend `cto` consider opening it as its own incident (INC-004).
3. **Login CSRF at `/auth/callback` (A-13)** is a one-click, no-precondition attack on the customer surface. It is rated High on data-class grounds and merits its own severity assessment.

**New actions** (continuing §6's register; existing rows untouched):

| ID | Action | Owner | Due | Severity | Status |
|---|---|---|---|---|---|
| **A-8** | Published anon key opens GoTrue password grant: FR-11/FR-12/SR-4 bypass + password oracle. Interim: tighten GoTrue rate limits (A-22 item 8); structural via A-21 | `security-engineer` + project owner | 2026-10-06 (interim) | High | OPEN |
| **A-9** | Void Feature 006 security-review §4's "anon key is public, not a secret" acceptance (in place, superseded text marked void); `cto` to explicitly accept or reject the residual until A-21 lands | `cybersecurity-architect` → `cto` | 2026-10-06 | High (governance) | OPEN |
| **A-10** | Session-lifecycle coupling: backend revocation events never reach the browser GoTrue session; `/auth/supabase/exchange` re-mints. Design a revocation watermark at the exchange + GoTrue global sign-out on revocation (A-5 doc §4.4) | `backend-architect` (design) + `authentication-engineer` | 2026-10-09 | High | OPEN |
| **A-11** | Relabel the F-9(b) guard test as code-hygiene, not a capability control; add a bundle check for the anon key once A-21 lands | `automation-qa-engineer` | 2026-10-16 | Low | OPEN |
| **A-12** | `/auth/reset-password/confirm` accepts any GoTrue access token as `recoveryAccessToken` (no `amr=recovery` check, `backend/src/routes/auth.ts:818-835`); include mobile deep-link `access_token` parity | `backend-architect` | 2026-10-09 | Medium | OPEN |
| **A-13** | Login CSRF at `/auth/callback`: delete the raw `#access_token` branch, stop signing in on email verification, strip tokens from URL on all exits (A-5 doc §5.4) | `authentication-engineer` + `frontend-architect` | 2026-10-07 | High | OPEN |
| **A-14** | Remove the plaintext password in `sessionStorage` and the 10-second password replay loop (`src/onboarding/pendingSignupAuth.ts:13-20`, `CustomerOnboardingPage.tsx:144-171`) | `authentication-engineer` | 2026-10-16 | Medium | OPEN |
| **A-15** | CSP + `Referrer-Policy: no-referrer` on Vercel and Render static hosting (SR-12(d)); none exists today (`vercel.json`, `index.html`, `render-staging.yaml` re-verified) | `frontend-architect` + `devops-engineer` | 2026-10-16 | Medium | OPEN |
| **A-16** | GoTrue-direct signup/resend/recover bypass backend limiters, audit, consent check and F-2 redirect selection; route through backend (with A-21) | `authentication-engineer`; consent → `compliance-specialist` | 2026-10-16 | Medium | OPEN |
| **A-17** | Allow-list callback OTP `type` to `signup`/`recovery`; disable magic-link/OTP sign-in if the console permits | `authentication-engineer` | 2026-10-07 | Medium | OPEN |
| **A-18** | GoTrue `PUT /user` password/email change by any AAL1 session on accounts without TOTP. This is this incident's capability at Layer 2. Interim: Secure password change, Secure email change, A-3's floor; structural via A-21 | project owner + `devops-engineer` | 2026-10-06 (interim) | High | OPEN |
| **A-19** | GoTrue-direct TOTP enrolment on accounts with no verified factor makes the attacker's factor a durable ATO + owner lockout. Interim: extend the SR-14(b) reconciliation to flag factors with no matching backend enrolment event; structural via A-21 | `authentication-engineer` + `site-reliability-engineer` | 2026-10-09 (interim) | High | OPEN |
| **A-20** | TOTP-enrolled customers cannot reset their password via the backend (AAL1 → `insufficient_aal`, surfaced as `UPSTREAM_UNAVAILABLE`); needs a customer MFA reset branch; SR-24 still absent | `backend-architect` + `authentication-engineer` | 2026-10-16 | Medium (fails closed) | OPEN |
| **A-21** | ADR: remove `supabase-js` from web, retire `/auth/supabase/exchange`, rotate/disable the published anon key | `solution-architect` (ADR), `cto` (ratify) | draft 2026-10-09; ratify 2026-10-16 | High | OPEN |
| **A-22** | Supabase live-config verification, 12 items (A-5 doc §7), incl. AAL2 enforcement on v2.195.0 and the customer-account audit-log query. **Run in the same P0 console session as A-6/A-3** | `security-engineer` + project owner; `devops-engineer` records | 2026-10-06 | High | OPEN |
| **A-23** | SU-FU-1 fold-in: `PATCH /v1/admin/accounts/:id/state` suspend/deactivate must reach the subject's GoTrue sessions; reactivation subject to A-10's watermark (A-5 doc §11). Follow-up to SU-FU-1, not a reopen of ADR-0012 | `backend-architect` | 2026-10-09 | High | OPEN |

**Totals:** 16 new actions. High 9 (A-8, A-9, A-10, A-13, A-18, A-19, A-21, A-22, A-23) · Medium 6 (A-12, A-14, A-15, A-16, A-17, A-20) · Low 1 (A-11).

**Effect on this incident's status:** INC-003 does not close until A-6 and A-3 close (unchanged) **and** each of A-8 … A-23 is closed or transferred to a successor incident by `cto` (see item 2 above). The §7 compliance position also gains the dependencies listed in the A-5 doc §12, for `compliance-specialist`.

---

## 12. Remediation status: A-10, A-13, A-17, A-19 (interim), A-23, and a correction on A-18 (`authentication-engineer`, 2026-10-15)

Cites §11 (actions A-8 … A-23) and the A-5 threat model (§4.4, §5.4, §3 row C-10). §§1–11 are unaltered. The code is in the working tree and **not committed** (the orchestrator commits). **None of these actions is CLOSED.** Each one marked "fixed" below is **fixed — pending Stage 8 security review**. `security-engineer` verifies the implementation and `cybersecurity-architect` closes the action, as §5's routing requires. Nothing here is self-certified as closed.

### 12.1 A-10 / A-23: backend revocation now reaches the browser GoTrue session. Status: fixed — pending Stage 8 security review

Built to the A-5 doc's §4.4 properties 1, 2 and 4. Property 3 (a distinct audit event type) is still open, see §12.6.

- **Revocation watermark at the exchange. This is the authoritative control.** `POST /auth/supabase/exchange` (`backend/src/routes/auth.ts:403-422`) now refuses a GoTrue access token whose session was *authenticated* before the account's watermark. It returns `401 REFRESH_TOKEN_INVALID` and writes a `login_failure` audit row carrying `accountId`. The check runs after the customer-only and account-state gates and before the TOTP branch, so neither minting path can be reached.
  - **How the watermark is computed.** `SessionRepo.findRevocationWatermark` (`backend/src/repositories/sessions.ts:148-167`) takes `greatest()` of two existing durable rows, so no migration is needed:
    - the latest `app.sessions.revoked_at` with reason `logout_all`, `admin_forced`, `rotation_reuse_detected`, `device_mismatch` or `password_reset`;
    - the latest admin-driven `app.account_state_transitions.created_at`.
  - **Why the state-transition row is included.** A reactivation revokes no session row, so the state-transition row is the only record of it. Including it means a GoTrue session minted *during* a suspension is still refused after reactivation, which is the A-23 / N-3 case.
  - **Reasons that do not advance the watermark.** A single `logout` and `rotated` are per-session housekeeping and leave it unchanged.
  - **How authentication time is read.** It is the earliest `amr[].timestamp` in the GoTrue JWT. GoTrue sets this when the session is created and keeps it across refreshes, unlike `iat`, which a thief resets just by refreshing (`backend/src/lib/gotrue-session-revocation.ts`).
  - **Fail-closed rule.** If a watermark exists and the token's authentication time cannot be read, the session is refused.
  - **Signature checking.** The JWT is decoded only after `getUserFromAccessToken` has had GoTrue accept the token, so the signature does not need to be re-verified.
- **Propagation to GoTrue (defence in depth, best-effort).** The new `SupabaseAdmin.signOutAllUserSessions` (`backend/src/db/supabase.ts:476-485`) uses a transient user token to call GoTrue `POST /logout?scope=global`. It is called on:
  - `POST /session/logout-all` (`backend/src/routes/session.ts:83`);
  - SR-8 reuse and FR-20 mismatch detection in `/session/refresh` (`session.ts:145`);
  - **every** admin state change, including suspend, deactivate and reactivate (`backend/src/routes/admin-accounts.ts:312`).

  A GoTrue failure is logged with the account id and trigger only (never the email or a token) and does not fail the request. The backend revocation has already been committed by then, and the watermark does not depend on GoTrue being reachable.
- **Tests: 26 new, backend total 522/522.**
  - `backend/src/routes/auth.test.ts`, describe `INC-003 A-10/A-23 revocation watermark` (8 cases):
    - N-1: logout-all, then a stale token is refused and a fresh sign-in is accepted;
    - N-2/N-3: refused after each of `admin_forced`, `rotation_reuse_detected`, `device_mismatch` and `password_reset`;
    - a single-session logout does not advance the watermark;
    - suspend, then reactivate, then a GoTrue session minted during the suspension is refused;
    - fail-closed on a token with no `amr` and on a non-JWT token.
  - `backend/src/lib/gotrue-session-revocation.test.ts` (16 cases). Unit tests, including that the warning log contains no email.
  - `backend/src/routes/session-logout-all.test.ts` (+2 cases):
    - GoTrue sign-out is called;
    - a GoTrue outage still returns 204.
  - `backend/src/routes/admin-accounts.test.ts`: the suspend and reactivate cases now assert the GoTrue sign-out, and the 409 case asserts no sign-out.

### 12.2 A-13 (and A-17 code limb): login CSRF at `/auth/callback`. Status: fixed — pending Stage 8 security review

`src/pages/CustomerAuthCallbackPage.tsx` was reworked against the A-5 doc's §5.4 items 1–4:

1. The raw `#access_token` branch is deleted.
2. `type` is allow-listed to `signup` / `recovery` before any SDK call. The same guard is in `verifySupabaseEmailLink` (`ALLOWED_EMAIL_LINK_TYPES`, `src/customer/supabase/auth.ts`).
3. Email verification **never signs the user in**. This applies to both the `token_hash` and the PKCE `code` paths. The GoTrue session that `verifyOtp` creates is cleared with `signOut({ scope: 'local' })`, the generic SR-006-2 `notify-email-verified` sync is fired, and the user is routed to `/auth/email-verified` and from there to `/login`. The page no longer calls `/auth/supabase/exchange` or `signInWithTokens` at all. The lingering-session `getSession()` re-mint branch is deleted.
4. `token_hash` / `code` / fragment are stripped from the URL with `history.replaceState` on entry, so every exit, including the error state, leaves a clean URL.

**Tests:** `src/pages/CustomerAuthCallbackPage.test.tsx` (9 cases):
- raw `#access_token` is never exchanged, and the URL is scrubbed on the error path;
- a bare load does not call `getSession`;
- `magiclink` / `invite` / `email_change` / `email` are refused with no `verifyOtp` call;
- signup and PKCE verification do not sign in;
- recovery still routes to `/reset-password`.

Web total: 125/125.

**Residuals, stated so they are not assumed closed:**
- **The `type=recovery` variant is unchanged.** A forged recovery `token_hash` still establishes a browser recovery session, so the victim could set a password on the attacker's account. The A-5 doc §5.2 rates this lower-impact. It cannot be removed while `/reset-password` depends on a browser recovery session (INC-003 F-3), so it rides on A-21.
- **A-17's console limb (disable magic-link/OTP sign-in) is still OPEN** under A-22 item 3.
- **The mobile `access_token` deep-link parity item (§5.4 item 5) stays with A-12.** It is not touched here.

### 12.3 A-19 interim: SR-14(b) reconciliation, extended. Status: fixed (interim) — pending Stage 8 security review; scheduling OPEN

SR-14(b)'s reconciliation had never been built. Repo-wide search on 2026-10-15 found no implementation. It now exists as a read-only control:

- **Logic:** `backend/src/lib/mfa-factor-reconciliation.ts`. It runs two checks:
  - (i) the original SR-14(b) check: an `mfa_required` account with no verified TOTP factor;
  - (ii) the A-19 extension: a verified TOTP factor with no `mfa_enrolled` audit event for that account within `[factor.created_at − 60 s, + ENROLLMENT_TICKET_TTL_SECONDS + 60 s]`. That is the GoTrue-direct C-10 signature.

  Each event can vouch for at most one factor, so an attacker factor enrolled right after a legitimate one is not hidden.
- **Runner:** `backend/scripts/sr14b-mfa-factor-reconciliation.ts` (`npm run inc-003:sr14b-mfa-reconciliation`). It reads Postgres, plus the GoTrue Admin `mfa.listFactors` call with the service-role key (never the anon key). It writes nothing and removes no factor. The output contains account and factor ids only. Exit codes: 0 clean, 2 findings, 1 run failed.
- **Tests:** `backend/src/lib/mfa-factor-reconciliation.test.ts` (6 cases).
- **Still OPEN:**
  - **Scheduling and alert routing** belong to `site-reliability-engineer`, the SR-14 owner pairing.
  - **Triage of the first run** belongs to `security-engineer`. Factors that predate `mfa_enrolled` logging, or whose events were purged by the 12-month retention job, will show up as false positives.
  - **A flagged factor is a suspected ATO.** It is investigated, never auto-deleted.
  - **This is detection, not prevention.** The prevention side of A-19 is still A-21.

### 12.4 A-18: correction to the framing I was given; no code change possible here. Status: OPEN

I was asked to route web password change and TOTP enrolment through the backend, the same way F-3 was done. I read the code on 2026-10-15 and there is **no GoTrue-direct password-change or TOTP-enrolment call in the web bundle to re-route**:
- The only "change password" on web is a link from `src/pages/customer/CustomerAccountSettingsPage.tsx:142` to `/forgot-password`, which is already backend-routed (F-1).
- Web TOTP enrolment (`src/invitations/MfaEnrollmentStep.tsx`, `src/api/invitations.ts`) already calls the backend's `POST /mfa/enroll` and `/mfa/enroll/verify`.
- No `updateUser` / `mfa.enroll` call exists under `src/` (grep 2026-10-15).

This matches the A-5 doc's own analysis. A-18 and A-19 are **Layer 2** capabilities (A-5 §3 rows C-8/C-9/C-10): anyone holding the published anon key plus a session can call GoTrue `PUT /user` or `/factors` directly, whatever our bundle does. So no client-side re-routing can close them.
- **What §12.1 does contribute.** The GoTrue global sign-out on suspend now ends an attacker's existing GoTrue session at the moment of suspension.
- **What remains.** A-18's interim is still console configuration: Secure password change, Secure email change and A-3's floor of 14 (A-22 items 1, 2, 10), owned by project owner + `devops-engineer`. The structural fix is still A-21.

### 12.5 Deliberately not done, and why (for `backend-architect` / `solution-architect`)

- **GoTrue ban on suspend (A-5 §4.4 item 2, "preferably").** I did not implement it. Once a user is banned, GoTrue's password grant returns `user_banned`, and whether it checks the password before or after the ban is version-dependent. That leaves two outcomes, both bad:
  - **If `/auth/login` maps `user_banned` to `ACCOUNT_SUSPENDED`:** that risks a suspension-state oracle with no password needed.
  - **If it does not map it:** every suspended user's login turns into a lockout-counting `INVALID_CREDENTIALS`.

  Choosing between those is a design call for `backend-architect`. It needs a live check against v2.195.0, which belongs in A-22. While suspended, an attacker who knows the password can still mint a fresh GoTrue session (C-1). The watermark still refuses that session at the exchange after reactivation, as tested in §12.1.
- **A-21** (remove `supabase-js` from the web, retire the exchange, rotate the anon key) is an ADR for `solution-architect`, as §11 says. It is not attempted here.
- **A-12, A-14, A-16, A-20** were not in this tasking and are untouched.

### 12.6 Open items this work creates or exposes (owners named)

1. **Database grant check before deploy.** Owners: `database-architect` + `devops-engineer`. The watermark query reads `app.account_state_transitions`. The backend role writes to it today, but its **SELECT** grant is not recorded anywhere in the repo. If the grant is missing, the exchange fails closed with a 5xx, which would break customer web sign-in. Verify the grant on the live project before deploying. Also consider a partial index on `app.sessions (account_id, revoked_at desc) where revoked_reason in (…)`. Today that half of the query relies on scanning the account's revoked rows, because `sessions_account_id_active` covers live rows only.
2. **Distinct audit event for an exchange re-mint (A-5 §4.4 item 3).** Owners: `backend-architect` + `security-engineer` (detection rule, alongside ADR-0012 C-4). A refused stale re-mint is now visible as `login_failure` with an `accountId`. A *successful* exchange-minted session is still indistinguishable from `/auth/login` (`login_success`). Separating them needs a new `app.audit_event_type` value, which means a migration.
3. **Possible functional defect on the web reset path, seen while tracing A-13. Not verified live.** Owner: `devops-engineer` (live check), then `backend-architect`. `PASSWORD_RESET_REDIRECT_URL_WEB` is `…/reset-password` (`render.yaml:47-48`), and the `auth-send-email` hook appends `token_hash`/`type` to `redirect_to` (`supabase/functions/auth-send-email/lib/confirmation-url.ts`). So a web recovery link most likely lands on `/reset-password?token_hash=…`. `CustomerResetPasswordPage` only reads `getSession()` and never consumes `token_hash`, so the user would see "Reset link required". There are two candidate fixes:
   - point the env var at `/auth/callback?type=recovery`;
   - preferably, have `/reset-password` hand `token_hash` + `email` to the backend's existing `resetToken` branch of `/auth/reset-password/confirm`, which also removes the browser recovery session from the §12.2 residual.
4. **Console items.** A-22 items 3, 6 and 9 also bound how long a stale GoTrue session exists to be refused at all.

### 12.7 Test evidence (run this session, 2026-10-15)

| Suite | Before | After |
|---|---|---|
| `cd backend && npm test` | 58 files / 490 tests, all passing | **60 files / 522 tests, all passing** |
| `cd backend && npx tsc --noEmit` | — | clean (the new script was also type-checked on its own) |
| `cd backend && npm run lint` | — | 0 errors. Warnings are pre-existing `no-non-null-assertion`; the new files have none |
| `npx vitest run` (web) | 29 files / 116 tests, all passing | **30 files / 125 tests, all passing** |
| `npm run typecheck` (web) | — | clean |
| `npm run lint` (web) | 5 errors, all pre-existing in `src/admin/pages/AdminDataPages.tsx` and `src/test/setup.ts`, untouched | unchanged; 0 errors or warnings in the files changed here |
| `npm run check:adr-prohibitions` | — | PASS |

**Action status after this section:**
- **A-10, A-13, A-23:** fixed — pending Stage 8 security review.
- **A-17:** code limb fixed — pending Stage 8; console limb OPEN.
- **A-19:** interim detection fixed — pending Stage 8; scheduling OPEN.
- **A-18:** OPEN (console + A-21).
- **All other actions:** unchanged.

---

## 13. Stage 8 security review of §12 / commit `079f93c` (`cybersecurity-architect`, 2026-10-15)

Cites §11 (actions A-10 … A-23) and §12 (`authentication-engineer`'s remediation record). §§1–12 are unaltered. I read
the shipped files myself; I did not rely on §12's prose. The orchestrator reports backend 60/60 test files and web
125/125 tests passing, with both typechecks clean. I did not re-run them. Nothing here is a code change and nothing
is committed. Implementation verification is still `security-engineer`'s, per §5's routing. This section is the
architecture verdict.

### 13.1 Verdicts

| Action | Verdict | Status after this review |
|---|---|---|
| **A-10** | **CONDITIONAL** | Fixed and deployable once C-2 is met. Stays **OPEN** until C-1 and C-3 are met |
| **A-23** | **PASS** | **Closed pending deploy check** (C-2) |
| **A-13** | **PASS** | **Closed pending deploy check** (C-6). The recovery-variant residual moves to new A-24 |
| **A-17** (code limb) | **PASS** | Code limb closed. Console limb **re-scoped**, see C-5. A-17 stays OPEN on that limb only |
| **A-19** (interim) | **CONDITIONAL** | Detection logic accepted. Not an operative control until C-4 is met. Stays **OPEN** |
| **A-18** claim | **CONFIRMED** | No client-side GoTrue-direct path exists to re-route. A-18 stays **OPEN** (console + A-21), unchanged |
| §12.6 item 3 (reset `token_hash`) | **CONFIRMED by code** (not verified live) | New action **A-24**, see §13.5 |

**No defect in `079f93c` blocks merge.** **Deploy is blocked on C-2.** **A-10's closure is blocked on C-1 (defect D-1).**

### 13.2 A-10: what holds

- **The authentication time is read from the earliest `amr` timestamp. That choice is correct and load-bearing.**
  - GoTrue upserts `mfa_amr_claims` per `(session, method)` and refreshes the timestamp when the same method is re-added in the same session.
  - Within an existing session, TOTP verification is the only method that can be re-added. An attacker who holds a stale session and their own GoTrue-direct factor (C-10 / A-19) can therefore move the `totp` entry to "now".
  - The first-factor entry (`password` / `otp` / `recovery`) is only ever written when a session is created. Taking `min()` pins the check to it.
  - Using the latest `amr` entry, or `iat`, would be bypassable. **Do not "simplify" this to `max()` or `iat`.** I am recording that as a design constraint.
- **`amr` spoofing.** The payload is decoded only after `getUserFromAccessToken` (GoTrue `GET /user`) has accepted the token. That call validates the signature, so an `amr` cannot be altered without failing it. A token with no `amr`, malformed `amr`, non-numeric timestamps or non-JWT structure returns `null`, and with a watermark present `null` means refused. **Fail-closed is confirmed** (`gotrue-session-revocation.ts:64-97`).
- **Clock skew.** The watermark is Postgres `now()` and the `amr` timestamp is GoTrue's clock. Both run on Supabase infrastructure, and the comparison is floored to whole seconds.
  - The residual is a session authenticated less than about 1 s + skew before a revocation surviving it. It is not exploitable as a timing attack, because the attacker does not choose when the victim revokes.
  - The reverse case, a fresh sign-in within the skew window being refused, fails safe.
  - **Accepted residual. Owner: `cybersecurity-architect`.** No action.
- **Revocation reasons.**
  - `logout_all`, `admin_forced`, `rotation_reuse_detected`, `device_mismatch` and `password_reset` advance the watermark. `logout` and `rotated` correctly do not.
  - The `admin_forced` per-session revoke in `/session/refresh` (`session.ts:158`) also advances it, but only when the account is already suspended or deactivated. That is harmless.
  - Admin transitions are filtered on `actor_account_id is not null`. The only writer today is `transitionAccountState` (`accounts.ts:419`). Approving a pending account would also advance the watermark, which fails safe.
- **Ordering in the exchange.** The check runs after the customer-only and account-state gates and before `findVerifiedTotpFactor`, so neither minting branch can be reached (`auth.ts:403-421`).
- **Regression to legitimate sign-in.** None found. Web sign-in always performs a fresh password grant (`signInWithSupabase`, `src/customer/supabase/auth.ts:188-201`), so `amr` is newer than any watermark. No web code re-exchanges a stored GoTrue session.
- **Information leak.** The stale-token response is `REFRESH_TOKEN_INVALID`, distinct from `INVALID_CREDENTIALS`. Only a party already holding a GoTrue-valid token for that account can observe the difference, and it tells them nothing beyond "you were evicted". **Accepted.** Propagation logs carry the account id and trigger only. Confirmed.

### 13.3 A-10 / A-23: defects and conditions

**D-1 (defect, blocks A-10 closure). The `password_reset` watermark only advances if the account had at least one unrevoked session row.**
- **Mechanism.** `revokeAllForAccount` updates only `where revoked_at is null` (`repositories/sessions.ts:122-131`). The watermark reads `max(revoked_at)` over rows with an account-wide reason (`:155-167`). If the account's existing rows were all already closed by `logout` or `rotated`, the reset writes nothing and the watermark does not move.
- **Why this is the common case, not an edge case.** That state is typical for a forgot-password user: they are logged out, so every row is already revoked.
- **Attack scenario.** An attacker holds the victim's browser GoTrue session (a C-series localStorage theft). The victim resets their password *because* they suspect compromise. The attacker's session is not refused at the exchange. This is the §4 "revocation limb" scenario again, at Layer 1.
- **Tests miss it.** Every N-2/N-3 test seeds an active session first (`auth.test.ts:667-680`), so the zero-row case is untested.
- **Mitigation that is not ours to rely on.** GoTrue's own `PUT /user` password path is understood to sign out the user's *other* GoTrue sessions. That is upstream behaviour we have not verified (add it to A-22). The reset paths also do **not** call `propagateRevocationToGoTrue` (`auth.ts:910-919`, `985-994`), so §12.1's "authoritative" claim does not hold for this reason.
- **C-1 (required before A-10 closes).**
  - Make the reset write a watermark source that does not depend on there being live rows. Acceptable options: include `max(created_at)` of `password_reset_completed` in `app.account_audit_log` in the watermark, or add a dedicated `accounts.sessions_revoked_before` column. `backend-architect` chooses.
  - Add `propagateRevocationToGoTrue` to both reset completion paths.
  - Add a test with zero active rows.

**C-2 (required before deploy; owners `database-architect` + `devops-engineer`). Verify the `SELECT` grant on `app.account_state_transitions`.**
- **Why it is required.** The backend role only `INSERT`s into this table today, with no `RETURNING` (`accounts.ts:418-423`). Migrations 001–029 are not in the repo, so the grant cannot be confirmed from here.
- **Blast radius if the grant is missing.** Every `/auth/supabase/exchange` call 5xxs, not just calls for accounts with a watermark, because the query always runs. **All customer web sign-in breaks.**
- **How to check.** Run `select has_table_privilege(current_user, 'app.account_state_transitions', 'SELECT')` *as the backend's connection role* on the live project. If it returns false, add a forward migration with the grant. Record the result in this document.
- **Ruling: the fail-closed behaviour is correct and must not be changed to fail-open to work around a missing grant.**
- **Index.** The partial index on `app.sessions (account_id, revoked_at desc) where revoked_reason in (…)` (§12.6 item 1) is recommended, not required, at current scale.

**C-3 (required before A-10 closes). Fold the watermark into the other endpoints that accept a GoTrue user token.**
- **The gap.** `POST /auth/reset-password/confirm`'s `recoveryAccessToken` branch (`auth.ts:839-856`) does no staleness check. If GoTrue propagation failed, a stale holder could set a new password there and then sign in fresh. That defeats eviction without ever touching the exchange.
- **Fix.** Apply `isGoTrueSessionStale` in that branch. It belongs naturally with A-12's `amr=recovery` check, and `backend-architect` may close both together.
- **Recommended, not required.** Re-check the watermark when the pending MFA challenge or enrolment that the exchange issued is completed (`/auth/mfa/challenge` `auth.ts:668-721`, `/mfa/enroll/verify`). Today there is a time-of-check/time-of-use window as long as the challenge TTL. A successful GoTrue sign-out already mitigates it, because `verifyTotpFactor` against a deleted session fails.

**Low follow-ups (non-blocking; owner `backend-architect` unless stated):**
- **Propagation failures need an alert.** They are only a `console.warn`. While A-18 / A-19 are open, a failed propagation leaves a Layer-2-capable session alive during a suspension. Owner: `site-reliability-engineer`.
- **Side effects of `signOutAllUserSessions`.** It works by minting and verifying a magic link (`db/supabase.ts:458-485`). Two consequences:
  - **(a) Fake logins in the audit trail.** Each call writes a GoTrue login to `auth.audit_log_entries` and updates `last_sign_in_at` for the subject. Anyone running A-6-style forensics must know these entries are system-generated. Owner: `security-engineer`, to note this in the IR runbook.
  - **(b) Unintended email confirmation.** On an unconfirmed user, verifying a magic link may set `email_confirmed_at`. Skip propagation for `pending_verification` subjects, or confirm GoTrue's behaviour under A-22.
- **Comment placement.** In `repositories/sessions.ts:143-154`, the ADR-0012 INV-1 comment for `touchMfaVerifiedAt` now sits above `findRevocationWatermark`. Move it back above `touchMfaVerifiedAt`.

**A-23 specifically.**
- **What I checked.** Every admin state change writes the transition row and then propagates, including reactivation. The 409 path returns before either. The watermark refuses a GoTrue session minted during a suspension after reactivation.
- **Ban on suspend.** Not implementing it (§12.5) is the right call to defer. The oracle trade-off is real. It needs a `backend-architect` design and the A-22 live check, not an implementation guess.
- **Verdict.** A-23 **PASS**, closed pending C-2.

### 13.4 A-13 / A-17: callback

**What I confirmed** (`src/pages/CustomerAuthCallbackPage.tsx`):
- The raw `#access_token` branch is gone.
- The lingering-session `getSession()` branch is gone.
- `type` is allow-listed before any SDK call, both on the page and inside `verifySupabaseEmailLink`.
- Neither the `token_hash` path nor the PKCE path signs the visitor in. `signOut({ scope: 'local' })` also revokes that one GoTrue session on the server, and it does not touch the user's other sessions.
- The URL is scrubbed before any branch runs.
- No call to `/auth/supabase/exchange` remains on the page.

**Login CSRF at `/auth/callback` is closed for the signup, PKCE and raw-token variants.**

**Residuals (accepted for this action, tracked elsewhere):**
- **Recovery variant.** A forged recovery `token_hash` still plants a browser recovery session. This is unchanged, as §12.2 says. It moves to **A-24**, whose preferred fix removes it.
- **The A-17 allow-list labels links; it does not check the token's real type.** `type=signup` falls back to verifying as type `email` (`auth.ts:260-262`), which GoTrue also accepts for magic-link hashes. No impact today, because no sign-in follows, but the guarantee is "no sign-in", not "only signup tokens". Recorded so nobody relies on it as a token-type control.
- **Pre-scrub exposure.** Credentials sit in the URL until JavaScript runs. With no `Referrer-Policy` in place (A-15, open), any sub-resource fetched first sees them. A-15 remains the control.

**C-5 (A-17 console limb, owner `cto` with `devops-engineer`). The console item conflicts with A-10.**
- **The conflict.** "Disable magic-link/OTP sign-in" is not an independent console toggle; Supabase ties it to the email provider. If it could be disabled, it would break `mintTransientUserAccessToken`, and with it A-10/A-23 propagation and every other existing caller. Propagation would then fail silently, as a warning only.
- **Ruling.** Withdraw that limb. Rely on the callback allow-list now and on A-21 structurally. Do **not** apply it in the A-22 console session without a code change first.

**C-6 (deploy check, owner `security-engineer`).** On the deployed web build, confirm two things:
- a `type=signup` link and a `type=magiclink` link both end on `/auth/email-verified` or the error state, with no backend session issued;
- the address bar is clean afterwards.

### 13.5 A-19 interim; A-18 claim; the `token_hash` defect

**A-19 reconciliation: CONDITIONAL.**
- **What is accepted.** The script is read-only, uses the service role, and prints ids only. A failed `listFactors` aborts the run with exit 1, which fails loud. The one-event-per-factor matching does not hide a second factor: either way, the account produces a finding.
- **C-4 (required before this counts as a control).**
  - **(a) Flag every verified factor that is not TOTP** (`phone`, `webauthn`). The product only issues TOTP. Today the filter (`mfa-factor-reconciliation.ts:70-72`) silently ignores a GoTrue-direct phone or WebAuthn factor, and that factor yields the same AAL2 lockout as C-10. Alternatively, A-22 confirms those factor types are disabled on the project and the confirmation is recorded here.
  - **(b) Scheduling and alert routing** are done by `site-reliability-engineer`.
  - **(c) The first run is triaged** by `security-engineer`.
- **Scale note (non-blocking).** The script makes one Admin API call per account.

**A-18 claim: CONFIRMED.**
- **What I searched.** Under `src/`: `.updateUser(`, `.mfa.`, `reauthenticate`, `signInWithOtp`, `setSession(`, `resetPasswordForEmail`, `unenroll`, and any raw `/auth/v1` or `/factors` fetch.
- **What remains.** The only live Supabase Auth calls are `signUp`, `signInWithPassword`, `resend`, `verifyOtp`, `exchangeCodeForSession`, `getSession` and `signOut`. None of them changes a password or a factor.
- **Conclusion.** A-18 and A-19 are Layer-2 capabilities of the published anon key, as A-5 §3 says. Interim mitigation is in the console (A-22 items 1, 2, 10). The structural fix is A-21.

**`CustomerResetPasswordPage` never reads `token_hash`: CONFIRMED by code, not verified live.**
- **The broken chain.** `PASSWORD_RESET_REDIRECT_URL_WEB` is `…/reset-password`. `buildConfirmationUrl` appends `token_hash`, `type` and `email` to `redirect_to` (`supabase/functions/auth-send-email/lib/confirmation-url.ts:17-24`). The page only calls `getSession()` (`CustomerResetPasswordPage.tsx:54-66`), so a genuine web recovery link lands on "Reset link required".
- **Why tests missed it.** The F-9 tests mock `getSession`.
- **Not introduced by `079f93c`.** It dates from the F-2/F-3 commits. It also means the §6 A-1 "DONE" and §9's A-7 PASS describe correct *control* behaviour, not a working end-to-end web reset. The security controls fail **closed**: no password changes without the backend.
- **Security impact (Medium).** The page does not scrub the URL, and the token is never consumed. A **live, unused recovery token** therefore stays in the address bar and history and in any `Referer` (no `Referrer-Policy`, A-15) until it expires, along with the user's email address.
- **New action A-24.** Owners: `authentication-engineer` + `backend-architect`; `devops-engineer` for the live check. Severity: High (availability of the only self-service reset), Medium (security). Due 2026-10-22.
  - **Required fix (option b of §12.6 item 3).** `/reset-password` reads `token_hash` and `email`, scrubs the URL immediately, and submits them to the backend's existing `resetToken` branch of `/auth/reset-password/confirm` (server-side `verifyRecoveryToken`).
  - **What this fix also achieves.** It creates no browser recovery session. That removes the A-13 recovery-CSRF residual and this page's dependence on A-12's "any GoTrue token" acceptance.
  - **Option (a) is rejected as the end state.** Repointing the variable to `/auth/callback?type=recovery` keeps the browser recovery session. It is acceptable only as a same-day stopgap, and only if `cto` wants reset working before (b) ships.
  - **Tests.** F-9 must gain a test where the page is loaded with `?token_hash=…&type=recovery&email=…` and **no** mocked session.

### 13.6 Register effect

- **Closed pending deploy check:** A-23 (C-2), A-13 (C-6), and the A-17 code limb.
- **Still OPEN:** A-10 (C-1, C-3; deploy gated on C-2), A-17 console limb (C-5), A-19 (C-4), A-18 (unchanged).
- **New:** A-24.

INC-003's overall status is unchanged. It is **OPEN**, and the conditions in §11 still apply.

---

## 14. Response to §13: D-1/C-1, C-3, A-24 and the low follow-ups (`authentication-engineer`, 2026-10-15)

Cites §13 (`cybersecurity-architect`'s Stage 8 review of `079f93c`). §§1–13 are unaltered. The code is in the working tree and **not committed**. **Every item below is fixed — pending Stage 8 re-review.** None is CLOSED. Out of scope per tasking and untouched: C-2 (live grant check), C-4 (A-19 non-TOTP factors / scheduling / triage), C-5, C-6, and the console items.

### 14.1 D-1 / C-1: the watermark no longer depends on a live session row

- **What changed in the watermark.** `findRevocationWatermark` (`backend/src/repositories/sessions.ts`) now takes the `greatest()` of a **third** source: `max(created_at)` from `app.account_audit_log` where `event_type` is in `WATERMARK_AUDIT_EVENT_TYPES`. That set is `password_reset_completed` and `session_family_revoked` (`backend/src/lib/gotrue-session-revocation.ts`).
- **Why these two events, and no migration.** Both are written unconditionally:
  - both reset completion paths write `password_reset_completed`;
  - `/session/refresh` writes `session_family_revoked` on both SR-8 reuse and FR-20 mismatch, whether or not any row was still live.

  So no migration is needed. The query uses the existing `account_audit_log_account_id_created_at` index (migrations/034).
- **Same gap, also closed.** The audit-event source also covers a reuse or mismatch detected against a family that was already fully closed. That is the D-1 mechanism outside password reset; §13 did not name it.
- **Propagation on both reset paths.** `propagateRevocationToGoTrue(..., 'password_reset')` is now called on the customer branch of `/auth/reset-password/confirm` (`backend/src/routes/auth.ts:937-941`) and on the `/mfa-verify` privileged completion (`:1018-1022`).
- **Tests** (`backend/src/routes/auth.test.ts`):
  - a password reset by an account with **zero** `app.sessions` rows refuses a pre-existing stolen GoTrue session at the exchange, and also calls GoTrue sign-out;
  - a `session_family_revoked` event with no live rows advances the watermark;
  - the `resetToken`-branch push-token test now asserts the sign-out;
  - a new privileged test asserts no sign-out before MFA verification and exactly one after it.
- **New dependency for the C-2 grant check (owner `database-architect` + `devops-engineer`).** The backend role **SELECT**s from `app.account_audit_log` in this query. Before this change nothing in `backend/src` read that table, so the grant is as unverified as the one C-2 names. Add `select has_table_privilege(current_user, 'app.account_audit_log', 'SELECT')` to the same check.
- **Retention residual (owner `cybersecurity-architect`).** If the 12-month audit purge runs, a reset older than 12 months stops counting toward the watermark. That only matters for a GoTrue session older than 12 months, which A-22 item 6's time-box should exclude.

### 14.2 C-3: staleness check on `recoveryAccessToken`

- **Fix.** The `recoveryAccessToken` branch of `/auth/reset-password/confirm` (`backend/src/routes/auth.ts:883-896`) now runs the same `isGoTrueSessionStale` check against the account's watermark, with the same fail-closed rule. It runs before the password check and before any GoTrue write, and returns `RESET_TOKEN_INVALID` on a stale token. The `resetToken` branch is unaffected, because GoTrue redeems that token server-side.
- **Tests:**
  - a stale token is refused with 404 `RESET_TOKEN_INVALID` and no `updateUserPassword` call;
  - a fresh recovery token is then accepted;
  - an unreadable token with a watermark present is refused.
- **Not done (recommended, not required):** re-checking the watermark when an exchange-issued MFA challenge or enrolment is completed. Still with `backend-architect`.

### 14.3 A-24: `/reset-password` consumes the hook link server-side

- **`src/pages/CustomerResetPasswordPage.tsx`:**
  - On mount it reads `token_hash` / `type` / `email` from the query or fragment and **scrubs the URL immediately**, before any render the user can interact with.
  - It refuses a link whose `type` is not `recovery`, or that has no email, without calling the backend.
  - It submits `{ email, resetToken, newPassword }` to the backend's existing `resetToken` branch of `/confirm`.
  - **No browser recovery session is created, and supabase-js is not touched on this path** (no `getSession`, no `signOut`).
- **`src/customer/api/auth.ts`:** `resetPasswordConfirm` takes a `ResetCredential` that is either `link` (the token and email) or `session` (a GoTrue access token).
- **`src/pages/CustomerAuthCallbackPage.tsx`:** a `type=recovery` `token_hash` is **no longer redeemed in the browser**. It is forwarded to `/reset-password` in router state, never in the URL, and the reset page submits it the same way. This also closes the §13.4 recovery-CSRF residual for hook links.
- **Legacy fallback kept, removable with A-21.** If neither a URL token nor a router-state token is present, the page still reads a pre-existing browser recovery session with `getSession()` (the F-3 behaviour). It covers non-hook link formats. I kept it rather than risk breaking an unknown live configuration.
- **No env-var stopgap was applied.**
- **Tests:**
  - `src/pages/CustomerResetPasswordPage.test.tsx` (+5 cases):
    - a genuine `?token_hash&type=recovery&email` load with **no mocked session**: the URL is scrubbed before any input, `getSession` is never called, the exact request body is asserted, it redirects to `/login`, and `signOut` is not called;
    - the privileged MFA step still appears via a link;
    - a wrong-type link is refused with no fetch;
    - the router-state handoff works;
    - the single-use message is shown.
  - `src/pages/CustomerAuthCallbackPage.test.tsx`:
    - recovery is forwarded with no `verifyOtp` call;
    - a recovery link with no email is refused.
- **New UX limitation (owner `backend-architect`).** `/confirm` redeems the single-use token (`verifyRecoveryToken`) *before* checking the password against the account's minimum. That ordering is correct, because checking first would leak the user type (F-6). The consequence is that a staff member who submits a 10–13 character password spends the link. The page now tells the user this plainly. Fixing it properly needs a server-side design, for example parking the redeemed token for a retry, without creating a user-type oracle.
- **Minor residual.** In the router-state handoff, the token sits in that tab's `history.state` until the reset completes or the tab closes. It is not in the URL or a Referer.

### 14.4 Low follow-ups

- **Error-level log with a stable tag.** Propagation failures now log at **error** level with the stable tag `[ALERT:gotrue_revocation_propagation_failed]` (`GOTRUE_PROPAGATION_FAILURE_LOG_TAG`). That covers both the GoTrue call and the account lookup in `session.ts`. A unit test pins the exact string. Alert routing belongs to `site-reliability-engineer`.
- **Comment moved.** The ADR-0012 INV-1 comment is back above `touchMfaVerifiedAt` in `backend/src/repositories/sessions.ts`.
- **§13 low item (b), done.** Propagation is skipped for subjects in `pending_verification`, so the magic-link sign-out cannot confirm their email as a side effect. There is a unit test.
- **§13 low item (a), unchanged.** The audit-trail side effects of system sign-outs still need a note in the IR runbook. Owner: `security-engineer`.

### 14.5 Test evidence (run this session)

| Suite | After §12 | After §14 |
|---|---|---|
| `cd backend && npm test` | 60 files / 522 tests | **60 files / 528 tests, all passing** |
| `cd backend && npx tsc --noEmit` | clean | clean |
| `npx vitest run` (web) | 30 files / 125 tests | **30 files / 131 tests, all passing** |
| `npm run typecheck` (web) | clean | clean |
| `npm run lint` (web) | 5 errors, all pre-existing in files not touched here | unchanged; 0 errors or warnings in the files changed here |

**Status after this section:**
- **A-10 (C-1, C-3):** fixed — pending Stage 8 re-review. Deploy is still gated on C-2, which now covers two grants (§14.1).
- **A-24:** fixed — pending Stage 8 re-review. `devops-engineer`'s live end-to-end check is still OPEN.
- **Low follow-ups:** done — pending re-review.
- **Everything else:** unchanged from §13.6.

---

## 15. Stage 8 re-review of §14 / commit `d38a8a5` (`cybersecurity-architect`, 2026-10-15)

Cites §13 (my conditions) and §14 (`authentication-engineer`'s response). §§1–14 are unaltered. I read the shipped code myself. The orchestrator reports backend 528/528 and web 131/131 tests passing, with both typechecks clean; I did not re-run them. No code was changed and nothing is committed.

### 15.1 Verdicts

| Action | Verdict | Status |
|---|---|---|
| **A-10** | **PASS** | **Closed pending deploy check:** C-2 as extended in §15.2, plus the smoke test in §15.2 |
| **A-23** | **PASS** (unchanged from §13) | **Closed pending deploy check** (C-2) |
| **A-13** | **PASS** | **Closed pending deploy check** (C-6). The §13.4 recovery-CSRF residual is now closed for hook links by A-24 |
| **A-24** | **CONDITIONAL** | Moves to closed pending deploy check once C-7 is met. The deploy check is `devops-engineer`'s live end-to-end reset, customer and staff |
| **A-17** | Unchanged | Code limb closed. Console limb stays under C-5 |
| **A-19** | Unchanged | **CONDITIONAL** (C-4) |
| **A-18** | Unchanged | **OPEN** (console + A-21) |
| §13 low items | **Accepted** | Alert tag, comment placement and the `pending_verification` skip are done. Still open: alert routing (`site-reliability-engineer`) and the IR-runbook note (`security-engineer`) |

**Nothing blocks merge or deploy beyond C-2.** C-7 blocks A-24's closure only. The exposure it addresses predates this commit.

### 15.2 A-10: C-1 and C-3 met; C-2 extended

- **C-1 is met.**
  - `findRevocationWatermark` now also reads `max(created_at)` of `password_reset_completed` and `session_family_revoked` in `app.account_audit_log` (`repositories/sessions.ts:155-169`).
  - `auditLog.record` is an awaited `INSERT` that throws on failure (`repositories/audit-log.ts:177-185`). So the source is not written best-effort.
  - Both reset completion paths now propagate to GoTrue (`auth.ts:937-941`, `1018-1022`).
  - The zero-live-row test exists.
  - §14.1's extension to an already-closed family under SR-8/FR-20 is correct, and I accept it.
- **C-3 is met.** The `recoveryAccessToken` branch runs the stale-session check before the length check and before any GoTrue write (`auth.ts:890-896`). A stale token returns `RESET_TOKEN_INVALID`, the same code as an unknown account, so the check adds no oracle.
- **C-2 is extended. Owners: `database-architect` + `devops-engineer`. Required before deploy.** Run all checks as the backend's connection role.
  1. **Privileges.** `has_table_privilege(current_user, 'app.account_state_transitions', 'SELECT')` and the same for `'app.account_audit_log'`. A missing grant fails **closed** with a 5xx on every exchange, which breaks all customer web sign-in. Fix it with a grant migration, never by changing the code to fail open.
  2. **Row-level security. This is new, and it is the more dangerous failure.** Migration 030 shows that `app.*` tables in this schema use RLS. If RLS is enabled on either table, and the backend role is not the owner, not `bypassrls`, and has no permissive policy, then the `max()` subqueries silently return `NULL`. The watermark would then quietly lose that source. That **fails open**: D-1 comes back with no error and no log line. Check `relrowsecurity` for both tables and the role's `rolbypassrls` or the applicable policies.
  3. **Smoke test** on the deployed backend. Use a test customer with zero live sessions. Complete a reset, then confirm that a pre-reset GoTrue token is refused at `/auth/supabase/exchange` with 401 `REFRESH_TOKEN_INVALID`. This is the only check that proves items 1 and 2 end to end.

  Record the results in this document. A-10 and A-23 become CLOSED on that record.
- **The 12-month audit purge is an accepted residual. Owner: `cybersecurity-architect`.** Once the purge deletes the audit row, a reset older than 12 months stops counting. It matters only for a GoTrue session older than 12 months that survived the GoTrue sign-out the reset itself now performs. **Dependency:** A-22 item 6 must set the GoTrue session time-box to **at most 12 months**. If the console cannot do that, this residual reopens as a condition on A-10.
- **Low, non-blocking (owner `backend-architect`).**
  - **Propagation order.** On both reset paths, propagation runs after the audit insert. If the insert throws, the password has changed and no GoTrue sign-out happens. Move propagation ahead of the audit write, or make the two independent.
  - **MFA-completion re-check.** Re-checking the watermark when an exchange-issued MFA challenge or enrolment completes is still recommended, per §13.3.

### 15.3 A-24: the link path is correct; the legacy fallback must go (C-7)

- **The link path is correct.**
  - **No browser session is involved.** The page reads `token_hash`, `type` and `email`, scrubs the URL, and refuses anything that is not a recovery link. It submits to the `resetToken` branch, and `verifyRecoveryToken` redeems the token server-side. There is no `getSession` and no `signOut` on this path.
  - **The callback no longer redeems recovery links** (`CustomerAuthCallbackPage.tsx:110-121`). So for hook links, a forged recovery link no longer plants a browser session.
- **C-7 (required for A-24 closure; owner `authentication-engineer`). Delete the `getSession()` fallback** (`CustomerResetPasswordPage.tsx:105-118`), or keep it only after A-12's server-side `amr=recovery` check has landed. §14.3 says the fallback covers non-hook link formats. By the code, no legitimate flow reaches it:
  - **(a) Hook links never reach it.** They arrive with `token_hash`, so the link path (step 1) or router state (step 2) handles them.
  - **(b) A GoTrue default-template recovery link cannot produce a session here either.**
    - It would arrive as an implicit `#access_token`, because the backend's `/recover` call carries no PKCE challenge.
    - `takeRecoveryLinkFromUrl` scrubs the fragment before `getSupabase()` is ever called on this page.
    - The client is configured `flowType: 'pkce'` (`src/customer/supabase/client.ts:31-37`), and supabase-js refuses implicit callbacks in that mode. I am treating that refusal as version-dependent, but either of these two facts is enough on its own.
  - **(c) PKCE `code` links never reach it.** The callback treats them as verification only and signs out.
  - **What the fallback actually returns.** The only session `getSession()` can return here is a **persisted ordinary login session**: `persistSession: true`, and `signInWithPassword` leaves the GoTrue session in `localStorage` after the exchange.
  - **Why that is exploitable.** The backend accepts any GoTrue token as `recoveryAccessToken`; that is A-12. So anyone at a logged-in browser, or any XSS, can open `/reset-password` directly and set a customer's password with no old password and no proof of mailbox control. C-3 does not stop this, because the session is fresh.
  - **Severity.** This is not a regression: 079f93c behaved the same way. But the fallback now serves only that path, so A-24 does not close while it remains.
  - **Test required.** A persisted non-recovery session, with no link and no router state, must yield `no-session`.
- **Router-state token residency is an accepted residual. Recommended fix, non-blocking.**
  - **The residual.** `history.state` is never cleared after the page reads it. Browser session-restore can persist it to disk, so an unredeemed `token_hash` can outlive the tab for up to GoTrue's OTP expiry. It is single-use and bound to the email address, and it never appears in the URL or a `Referer`, which is a clear improvement over §13.5.
  - **The fix.** Once the token is copied into component state, call `navigate(location.pathname, { replace: true, state: null })`. If the user reloads, they reopen the email link, which is still unredeemed.
- **Minor (non-blocking).** For recovery links, the callback falls back to `loadSignupEmail()` (`CustomerAuthCallbackPage.tsx:92-96`) when the URL carries no email. GoTrue binds the token to the address, so a mismatched address can only fail; it cannot be misused. Still, use the URL email only, so a shared browser cannot pick up another person's stored address.

### 15.4 Staff password-length catch: accepted residual, fails closed

- **The ordering is correct.** Redeeming the token before checking the length is required by F-6. Checking the length first, from email plus a bogus token, would be a user-type oracle that needs no proof of the mailbox.
- **The cost is availability only.** A 10–13-character staff password spends the link. The staff member has to request another one, which consumes the 3-per-hour reset quota. No security control is weakened.
- **Recommended fix. Owner `backend-architect`, Low.**
  - When a successful redemption is followed by `VALIDATION_ERROR`, park the redeemed GoTrue access token in KV under a short-lived, single-use retry token. That is the same pattern `reset-mfa-pending:` already uses.
  - This creates no oracle, because the caller has already proved possession of the token.
  - Until then, the web hint stays at 10. **Do not raise it per user type.** Raising it uniformly to 14 is a product call, not a security requirement.
- **Message wording (minor).** The page's "this link can only be used once" message is shown on every failure (`CustomerResetPasswordPage.tsx:203-207`). Some failures happen before the link is redeemed: `RATE_LIMITED`, network errors and `UPSTREAM_UNAVAILABLE`. Show the message only on `VALIDATION_ERROR`, `RESET_TOKEN_EXPIRED` or `RESET_TOKEN_INVALID`.

### 15.5 Register effect

- **Closed pending deploy check:**
  - **A-10, A-23:** C-2 as extended in §15.2: grants, RLS and the smoke test.
  - **A-13:** C-6.
  - **A-17 code limb.**
- **A-24 joins that list once C-7 is met.** It then also needs `devops-engineer`'s live end-to-end check.
- **Still OPEN:**
  - A-17 console limb (C-5);
  - A-19 (C-4);
  - A-18;
  - A-12, which C-7 depends on unless the fallback is deleted;
  - the §15.2 retention dependency on A-22 item 6.

INC-003 overall remains **OPEN**.

---

## 16. Response to §15: C-7, router-state clearing, propagation order, callback email, MFA-completion re-check (`authentication-engineer`, 2026-10-15)

Cites §15 (`cybersecurity-architect`'s re-review of `d38a8a5`). §§1–15 are unaltered. The code is in the working tree and **not committed**. **Every item below is fixed — pending Stage 8 re-review.** None is CLOSED. Not touched, per tasking: C-2 (grants, RLS and the smoke test), C-4, C-5, C-6, the console items, and the §15.4 server-side retry token (`backend-architect`).

### 16.1 C-7: `getSession()` fallback deleted outright

- **Fix.** `src/pages/CustomerResetPasswordPage.tsx` now has exactly two credential sources: the recovery link in the URL, or the router-state handoff from `/auth/callback`. With neither, the page renders "Reset link required".
  - The `getSession()` branch has been deleted, not gated. This page no longer imports `getSupabase` at all.
  - `signOut()` was removed as well; the link path never creates a browser session.
- **The capability is removed from the API client too.** `ResetCredential` in `src/customer/api/auth.ts` is now link-only. The web client has no code path left that can submit a browser GoTrue session as `recoveryAccessToken`.
- **Tests:** `src/pages/CustomerResetPasswordPage.test.tsx`.
  - Every test now runs with a **persisted ordinary login session** present in the mocked supabase client.
  - The new case §15.3 C-7 covers "logged-in session, no link, no router state". It asserts:
    - the page shows "Reset link required";
    - there is no password form and no "Update password" button;
    - `getSession` is never called;
    - `fetch` is never called.
  - The happy path asserts the request body is `{ email, resetToken, newPassword }` with no `recoveryAccessToken`, and that neither `getSession` nor `signOut` is called.

### 16.2 Router-state token cleared from history

- Once the page has copied the token into component state, it calls `navigate(location.pathname, { replace: true, state: null })`.
- **Test:** a location-state probe asserts the state becomes `null` once the form is shown.
- A reload therefore lands on "Reset link required", and the user reopens the email link, which is still unredeemed.

### 16.3 GoTrue sign-out now runs before the audit insert, on both reset paths

- **Where.** On both reset paths (`backend/src/routes/auth.ts`: the customer branch of `/confirm`, and the `/mfa-verify` completion), `propagateRevocationToGoTrue` now runs **before** the `password_reset_completed` insert.
- **What is unchanged.** The insert is still awaited and still throws on failure, so a failed insert still returns 5xx.
- **Test** (`auth.test.ts`, "§15.2: GoTrue sign-out runs BEFORE the audit insert"): with the audit insert forced to fail, it asserts:
  - the response is 500;
  - the sign-out call is recorded before the failed insert.

### 16.4 Callback uses only the URL's email for recovery links

- **Fix.** The recovery branch of `src/pages/CustomerAuthCallbackPage.tsx` now reads the email only from the link's own query or fragment. It never falls back to `loadSignupEmail()`.
- **Test:** a stored signup email belonging to someone else, plus a recovery link with no email, leads to the "Link problem" state and no `verifyOtp` call.

### 16.5 §15.4 wording fix (minor)

- **Fix.** The "this reset link can only be used once" text is now shown only on `VALIDATION_ERROR`, `RESET_TOKEN_EXPIRED` or `RESET_TOKEN_INVALID`.
- **Test:** a `RATE_LIMITED` failure does not show it.

### 16.6 MFA-completion re-check (§13.3 / §15.2 optional item): done

The fix was small and local, so I did it. Both handlers now re-run `isGoTrueSessionStale(pending.userAccessToken, findRevocationWatermark(accountId))` **before** the TOTP challenge or verify:
- `POST /auth/mfa/challenge` (`backend/src/routes/auth.ts`). A stale token invalidates the challenge and returns 410 `MFA_CHALLENGE_EXPIRED`.
- `POST /mfa/enroll/verify` (`backend/src/routes/mfa.ts`). A stale token clears the pending enrolment and returns `MFA_ENROLLMENT_NOT_FOUND`. No factor is verified, no `mfa_enrolled` audit row is written, and no session is minted.

Tests:
- `auth.test.ts`, "an exchange-issued MFA challenge cannot be completed after a revocation lands": no `verifyTotpFactor` call and no tokens are returned.
- `auth.test.ts`, "an enrolment cannot be completed … after a revocation lands mid-enrolment".

The login path is unaffected. `/auth/login` always passes a fresh password-grant token, which is newer than any watermark.

### 16.7 Test evidence (run this session)

| Suite | After §14 | After §16 |
|---|---|---|
| `cd backend && npm test` | 60 files / 528 tests | **60 files / 531 tests, all passing** |
| `cd backend && npx tsc --noEmit` | clean | clean |
| `npx vitest run` (web) | 30 files / 131 tests | **30 files / 134 tests, all passing** |
| `npm run typecheck` (web) | clean | clean |
| `npm run lint` (web) | 5 errors, all pre-existing in files not touched here | unchanged; the changed web files lint clean |

**Status after this section:**
- **A-24 (C-7 met):** fixed — pending Stage 8 re-review. After that it still needs `devops-engineer`'s live end-to-end reset, customer and staff.
- **A-10:** the §15.2 low items (propagation order, MFA-completion re-check) are done — pending re-review. Deploy is still gated on C-2 as extended in §15.2 (grants, RLS, smoke test).
- **A-12:** no longer on A-24's critical path for the web, because the web client can no longer submit a `recoveryAccessToken`. It stays OPEN for the mobile deep link and for the backend's acceptance of any GoTrue token (`backend-architect`).
- **Everything else:** unchanged from §15.5.

---

## 17. Final Stage 8 re-review of §16 (`cybersecurity-architect`, 2026-10-15)

Cites §15 (my conditions) and §16 (`authentication-engineer`'s response). §§1–16 are unaltered. I read the shipped code myself. The orchestrator reports backend 531/531 and web 134/134 tests passing, with both typechecks clean; I did not re-run them. No code was changed and nothing is committed.

### 17.1 What I verified

- **C-7 is met.**
  - `CustomerResetPasswordPage.tsx` has exactly two credential sources: the URL link (`:86-96`) and router state (`:97-107`). Anything else renders `no-session` (`:108-114`).
  - The page no longer imports `getSupabase`.
  - `ResetCredential` is link-only (`src/customer/api/auth.ts:104`).
  - No caller under `src/` sends `recoveryAccessToken` any more.
- **The router-state token is cleared after it is read.** The page calls `navigate(location.pathname, { replace: true, state: null })` right after copying the token (`:104`).
  - I checked one risk with this pattern: under React StrictMode, the effect runs twice and the second run could see the cleared state. `src/` does not use StrictMode, so that cannot happen.
- **The recovery callback uses only the URL's email.** `linkEmail` is taken from the query or fragment only, with no `loadSignupEmail()` fallback (`CustomerAuthCallbackPage.tsx:117-124`).
- **GoTrue sign-out now runs before the audit insert** on both reset paths (`auth.ts:948` → `:953` and `:1029` → `:1034`).
- **The cutoff is re-checked when an MFA step completes.** The check runs before any TOTP call:
  - `/auth/mfa/challenge` (`auth.ts:688-696`) invalidates the challenge and returns 410;
  - `/mfa/enroll/verify` (`mfa.ts:171-178`) clears the pending enrolment.

  No legitimate flow regresses. `/auth/login` and invitation enrolment both carry a freshly minted GoTrue token, so its sign-in time is always after any cutoff.
- **The "this link can only be used once" message** now appears only for redemption-class errors (§16.5).

**One consequence for C-2 (stated here, not a new defect).** The cutoff query now also runs on `/auth/mfa/challenge` and `/mfa/enroll/verify`. Both are on the **privileged** login path. A missing grant, or an RLS filter, therefore no longer affects only customer web sign-in. It would also:
- 5xx every admin, security-company and support login, if a grant is missing (fail closed);
- silently drop part of the cutoff for those logins, if RLS filters the rows (fail open).

C-2's smoke test (§15.2 item 3) must therefore **also** include one staff MFA login and one enrolment verify on the deployed backend.

### 17.2 Verdicts

| Action | Verdict | Status |
|---|---|---|
| **A-10** | **PASS** | **Closed pending deploy check.** C-2 as extended in §15.2 and §17.1 |
| **A-23** | **PASS** | **Closed pending deploy check** (C-2) |
| **A-24** | **PASS** | **Closed pending deploy check.** `devops-engineer` runs a live end-to-end reset for both a customer and a staff account (staff must hit the TOTP step). The web confirm limb of A-1/F-3 is only actually working once this is confirmed |
| **A-13** | **PASS** (unchanged) | **Closed pending deploy check** (C-6) |
| **A-17** | Code limb PASS | Code limb closed. Console limb **OPEN** under C-5 |
| **A-19** | **CONDITIONAL** (unchanged) | **OPEN** (C-4) |
| **A-18** | Claim confirmed (unchanged) | **OPEN** (console + A-21) |
| **A-12** | Not reviewed in this pass; scope narrowed | **OPEN**. Since C-7, the web client can no longer submit `recoveryAccessToken`. Two things remain: the backend still accepts any GoTrue token, and mobile deep-link parity. Owner: `backend-architect` |

**No blocking defects remain in the code under review.** Everything left is a deploy check, console or configuration work, or a separately owned action.

### 17.3 INC-003 overall status after this commit: **OPEN**

**Closed pending deploy check.** Each moves to CLOSED when its check is recorded in this document.

| Item | Deploy check | Owner of the check |
|---|---|---|
| A-10, A-23 | C-2: `SELECT` grants **and** RLS behaviour on `app.account_state_transitions` and `app.account_audit_log` for the backend role. Then the smoke test: a customer reset with zero live sessions refuses a pre-reset token at the exchange, **plus** one staff MFA login and one enrolment verify | `database-architect` + `devops-engineer` |
| A-24 | Live end-to-end web reset, customer **and** staff (the staff run must hit the TOTP step) | `devops-engineer` |
| A-13, A-17 code limb | C-6: on the deployed web, crafted `signup` / `magiclink` links issue no session and leave a clean URL | `security-engineer` |

**Still OPEN**, as recorded in this document; I have not re-checked other documents for status changes since §11.

| ID | What remains | Owner |
|---|---|---|
| A-6 | P0: production auth-log check for prior exploitation. §7's "no breach" conclusion is still provisional on this | `security-engineer` + project owner |
| A-3 | Supabase password floor of 14 + leaked-password protection, applied to the live project | `devops-engineer` + project owner |
| A-8 | Published anon key opens the GoTrue password grant; interim fix is tighter rate limits | `security-engineer` + project owner |
| A-9 | Void Feature 006's anon-key acceptance; `cto` explicitly accepts or rejects the residual | `cybersecurity-architect` → `cto` |
| A-11 | Relabel the guard test as code hygiene; add an anon-key bundle check | `automation-qa-engineer` |
| A-12 | Backend accepts any GoTrue token as `recoveryAccessToken`; mobile deep-link parity | `backend-architect` |
| A-14 | Plaintext password in `sessionStorage` / password replay loop | `authentication-engineer` |
| A-15 | CSP + `Referrer-Policy: no-referrer` | `frontend-architect` + `devops-engineer` |
| A-16 | GoTrue-direct signup/resend bypass backend limits, audit and consent | `authentication-engineer`; consent → `compliance-specialist` |
| A-17 console limb | C-5: withdraw "disable magic-link"; it conflicts with A-10's sign-out | `cto` + `devops-engineer` |
| A-18 | GoTrue `PUT /user` reachable at Layer 2; interim fix is console "secure password/email change" | project owner + `devops-engineer` |
| A-19 | C-4: flag non-TOTP verified factors; scheduling and alert routing; first-run triage | `authentication-engineer`; `site-reliability-engineer`; `security-engineer` |
| A-20 | Customers with TOTP enrolled cannot reset their password; SR-24 still absent | `backend-architect` + `authentication-engineer` |
| A-21 | ADR: remove supabase-js from web, retire the exchange, rotate the anon key. This is the structural fix for A-8/A-16/A-18/A-19 | `solution-architect` (ADR), `cto` (ratify) |
| A-22 | 12-item live-config verification. Item 6 (GoTrue session time-box) must be **at most 12 months**; the §15.2 audit-retention residual depends on it | `security-engineer` + project owner; `devops-engineer` records |
| §7 | Concurrence on the compliance position (incl. the dependencies in A-5 doc §12) | `compliance-specialist` |

**Non-blocking follow-ups.** These do not hold the incident open on their own:

| Follow-up | Owner |
|---|---|
| Alert routing for `[ALERT:gotrue_revocation_propagation_failed]` | `site-reliability-engineer` |
| IR-runbook note that system sign-outs write GoTrue "login" entries | `security-engineer` |
| Staff password-length retry token (§15.4) | `backend-architect` |
| Partial index on revoked `app.sessions` rows | `database-architect` |
| Distinct audit event for exchange-minted sessions (§12.6 item 2) | `backend-architect` + `security-engineer` |
| Ban-on-suspend design (§12.5) | `backend-architect` |

**Closure rule (restating §11, unchanged).** INC-003 closes only when all of the following hold:
- A-3 and A-6 are closed;
- every item A-8 … A-24 is closed or has been transferred to a successor incident by `cto`;
- `compliance-specialist` has concurred on §7.

---

## 18. A-14, A-16, A-20, plus ADR-0014 G-1 / G-2 (`authentication-engineer`, 2026-10-15)

Cites §11 (actions A-14, A-16, A-20) and §17.3 (current owner table). It also cites ADR-0014 (`docs/organization/adr/0014-web-identity-through-backend-remove-browser-supabase-sdk.md`, Proposed) §5.2 G-1 and G-2. §§1–17 are unaltered, and I did not edit ADR-0014. The code is in the working tree and **not committed**. **Every item below is fixed — pending Stage 8 review.** None is CLOSED. A-21 (removing supabase-js) is untouched. The callback page still verifies signup links with `verifyOtp` in the browser; that is ADR-0014 Phase 1 (W-6), not this batch.

### 18.1 A-14: plaintext password in `sessionStorage`. Status: fixed — pending Stage 8 review

- **Where it was.**
  - `src/onboarding/pendingSignupAuth.ts` wrote `{ email, password, expiresAt }` to `sessionStorage['td_signup_pending_auth']`.
  - `CustomerOnboardingPage.tsx` wrote that record after signup, then replayed the password as a GoTrue password grant on entering the verify step and every 10 s after that.
- **Why it existed.** The wizard needed to notice that email verification had happened.
- **Fix: ADR-0014 G-3's recommended option. No new endpoint.**
  - **The module is deleted, not just unreferenced.**
  - **The wizard holds no credential.** After the backend signup it clears the password fields from component state and pre-fills the email.
  - **Advancing the verify step.** The step now shows an inline "Verified? Sign in to continue" form. The user enters the password once, after opening the link, through the existing `loginWithPassword` path. An unverified account gets "Still waiting for verification", mapped from `ACCOUNT_NOT_ACTIVE`.
  - **The automatic poll** survives only for an already-signed-in account, and it uses the backend session (`refreshAccount`), never a password.
  - **Leftover records.** A record left by a pre-fix build in an open tab is purged when the page mounts.
- **The UX cost, which ADR-0014 §13 Q-4 already puts to `cto`:** the user types their password one more time.
- **Tests:**
  - `src/pages/onboarding/CustomerOnboardingPage.test.tsx` (new, 6 cases):
    - after signup, no `sessionStorage` or `localStorage` value contains the password;
    - no background `loginWithPassword` call happens on entering the verify step;
    - the explicit sign-in calls it exactly once, with the typed password;
    - a legacy record is purged.
  - `src/lib/inc-003-a14-a16-guards.test.ts`: the module is absent, nothing writes the legacy key, and no `Storage.setItem` call passes a password-named value. Like F-9(b), this is a code-hygiene guard (A-11).

### 18.2 A-16 + ADR-0014 G-1: web signup and resend through the backend. Status: fixed — pending Stage 8 review

**Web client:**
- `CustomerSignupPage` and the onboarding wizard now call `signup()` → `POST /v1/auth/signup` and `resendVerificationEmail()` → `POST /v1/auth/resend-verification` (`src/customer/api/auth.ts`).
- `signUpWithSupabase` and `resendSignupVerification` (`supabase.auth.signUp` / `.resend`) are **deleted** from `src/customer/supabase/auth.ts`.
- **Response handling.** The client no longer branches on Supabase's `identities.length === 0` "already verified" signal. Every signup now shows the same "check your email" state, matching the backend's uniform 202.

**Backend (`backend/src/routes/auth.ts`):**
- **G-1, exactly as ADR-0014 specifies.**
  - Both routes take `client: z.enum(['web','mobile']).optional().default('mobile')`, so mobile builds already released are unchanged.
  - That value is mapped server-side to `EMAIL_VERIFICATION_REDIRECT_URL_WEB` or to the existing mobile URL. A caller-supplied URL is never read; Zod strips it.
- **No account enumeration on the signup path.**
  - **Before:** an `auth.users` row with no `app.accounts` row (created by the pre-A-16 browser signup) made `createUser` fail. Every Supabase error was wrapped as `SupabaseUnavailableError`, so the response was a **503** for a registered address against a 202 for a new one.
  - **New error class:** `createUser` now throws a distinct `SupabaseUserAlreadyExistsError` (`backend/src/db/supabase.ts`).
  - **Response:** the route answers that case with the identical 202 and sends **no** email, so `/signup` cannot be used to mail-bomb an address.
- **No account enumeration on the resend path.**
  - **The 503 is gone.** A resend for a pending account is now best-effort. Before, a GoTrue or hook failure surfaced as a 503 that only ever happened for pending accounts.
  - **New per-IP limit.** Resend gains a per-IP ceiling: `RESEND_VERIFICATION_IP_LIMIT`, 20 per 15 min, the same values as `NOTIFY_EMAIL_VERIFIED_IP_LIMIT`. This also discharges ADR-0014 G-6 for this route. **It is a new policy value and needs `cybersecurity-architect` ratification.**
- **`redirect_to` query parameter (found while wiring G-1).** GoTrue reads the email-link redirect from the `redirect_to` *query* parameter, which is where supabase-js puts it. The mediation layer was sending it only in the JSON body (`/resend` as `options.emailRedirectTo`, `/recover` as `redirect_to`), where GoTrue may ignore it and fall back to the Site URL. Both calls now also send it as a query parameter.
  - **Why it matters:** this may be what actually made F-2 and G-1 take effect in production. **Not verified live.** Include it in A-24's live reset and ADR-0014 G-4's live check.
  - **Risk if wrong:** none. If a URL is not on the allow-list, GoTrue falls back to the Site URL, as it may do today.

**Consent — semantics unchanged; referred to `compliance-specialist`, not decided here:**
- **What is the same.** Both web forms still require the checkbox client-side, and the client now sends `consentAccepted: true`. The type is a literal `true`, so it can never be defaulted.
- **What is new.** The backend's existing `z.literal(true)` check now applies to web signups too. Before, web signups bypassed it entirely (A-5 §12, first bullet).
- **For compliance to judge.** The backend **validates** consent but **records no evidence of it**: there is no timestamp, notice version or IP in `app.accounts` or the audit log. Whether POPIA needs a durable consent record is `compliance-specialist`'s call. So is the status of web accounts created before this fix, which never passed the server-side check.

**Tests:**
- **Backend:** `backend/src/routes/auth.test.ts`, describe `INC-003 A-16`, 7 cases:
  - web vs mobile redirect, mirroring F-2;
  - smuggled `redirectTo` / `emailRedirectTo` ignored;
  - consent still required (missing or false → 400, no user created);
  - an identical 202 body for a new address, a registered address and an auth-only legacy user, with no mail sent in the legacy case;
  - resend gives an identical 202 for unknown, pending and active accounts, and mails only the pending one;
  - a send failure still returns 202;
  - the 21st resend from one IP returns 429.
- **Backend:** `backend/src/db/__tests__/supabase-redirect-param.test.ts` (2 cases): `redirect_to` is in the query string for `/resend` and `/recover`.
- **Web:** `src/pages/CustomerSignupPage.test.tsx` (2 cases) and the onboarding tests: exact request bodies; `supabase.auth.signUp` / `.resend` never called; no request without consent.
- **Guard:** the guard test fails if `.auth.signUp(` or `.auth.resend(` reappears under `src/`.

**Owner action required (G-1), not done here.**
- **What is declared.** `EMAIL_VERIFICATION_REDIRECT_URL_WEB` is declared **without a value** in `render.yaml` and `render-staging.yaml` (`sync: false`) and in `backend/.env.example`.
- **What the project owner must do:**
  1. In each Render environment, set it to that environment's web origin + `/auth/callback?type=signup`.
  2. **Add that URL to Supabase Auth → URL configuration (redirect allow-list).** Otherwise GoTrue drops the redirect.
- **Fallback if unset.** `loadEnv()` falls back to the production web callback, following the `PASSWORD_RESET_REDIRECT_URL_WEB` precedent. So staging must be set explicitly, or its links will point at the production web.
- **Owners:** project owner + `devops-engineer`.

### 18.3 ADR-0014 G-2: web logout never reached the backend. Status: fixed — pending Stage 8 review

- **Fix to the client.** `logout()` in `src/customer/api/auth.ts` now goes through the authenticated client. It sends the bearer access token and, if that token has expired, refreshes once and retries. It previously sent `authenticated: false` with a body that the route ignores.
- **Fix to sign-out.** `CustomerAuthProvider.signOut` now calls it **before** clearing the local tokens; it previously cleared them first. A re-entrancy guard stops the client's `onSessionTerminated` callback (fired if that refresh fails) from recursing.
- **Unchanged.** The GoTrue `signOut()` (ADR-0014 W-10) is untouched; it is ADR-0014 Phase 1.
- **Tests:** `src/customer/auth/CustomerAuthProvider.logout.test.tsx` (2 cases):
  - `POST /session/logout` carries `Authorization: Bearer access-1`, and the stored refresh token is cleared afterwards;
  - with an expired access token, the logout is retried with the refreshed token, so it still reaches the server.
- **What this unblocks.** Per ADR-0014 §6, G-2 was a blocking precondition for Phase 1.

### 18.4 A-20: TOTP-enrolled customers cannot reset. Status: fixed (web/backend) — pending Stage 8 review; mobile and SR-24 OPEN

- **Fix: small, local, and the same mechanism as SR-6 / ADR-0012.**
  - `POST /auth/reset-password/confirm` now applies its "verified TOTP factor → park the password, require `/mfa-verify`" branch to **every** user type with a verified factor, not only privileged ones (`backend/src/routes/auth.ts`, the `findVerifiedTotpFactor` gate).
  - The KV handoff (`reset-mfa-pending:`), the 5-minute token, the 5-per-15-minute limit, the single-use consumption and the revoke / push / GoTrue-sign-out / audit sequence are all existing code. None of it changed.
  - Customers without a factor still complete immediately.
- **Enumeration.** No oracle is added: the response is only visible to someone holding a valid recovery token.
- **Web.** The reset page already renders the TOTP step for any `mfaVerificationRequired` response, without knowing the user type (F-4/F-6). No web change was needed.
- **Tests** (`backend/src/routes/auth.test.ts`):
  - a customer with a verified factor gets `mfaVerificationRequired`, with no password applied and nothing revoked;
  - a wrong code returns 400 and still applies nothing;
  - the right code applies the password once, disables push tokens and signs out of GoTrue;
  - the existing no-factor customer test now asserts that the factor check returns `null` and completion is immediate.
- **Still OPEN. Not built, because each needs a decision:**
  1. **Mobile second step. Owner: `mobile-engineer`.** `mobile/app/(auth)/reset-password.tsx:50-57` treats `mfaVerificationRequired` as a defensive error ("privileged only"). A TOTP-enrolled customer resetting **on mobile** now sees that error instead of a 503 dead end. That is still a dead end, but an honest one, and it can be completed on web. Mobile needs the same code-entry step as web F-4.
  2. **Lost authenticator. Proposal for `backend-architect` + `cybersecurity-architect`; SR-24.** A customer who has lost their TOTP device still cannot reset by self-service, and it would be wrong to bypass MFA for them. Options to decide between:
     - **(a) Recovery codes.** Issue them at enrolment and accept one in place of TOTP at `/mfa-verify`. They are hashed at rest and single-use. This needs a new table and enrolment UX.
     - **(b) Support-assisted reset per SR-24.** Out-of-band proofing, dual control, a notification at initiation, a cancel window, `admin_forced` revocation, then re-enrolment. Customers would need a lighter variant of the staff process.
     - **(c) Allow a second TOTP factor** (SR-24's own scope reduction).

     I recommend (a) for customers, with (b) as the fallback. Both are design decisions and neither is built.
  3. **Live check (GoTrue).** Confirm on the deployed project that verifying a TOTP code against the recovery session's *original* access token raises that session to AAL2, so `PUT /user` succeeds without the new token GoTrue returns from `/factors/{id}/verify`. The staff path has always relied on this. Add it to A-24's live end-to-end check for both staff and a TOTP-enrolled customer. **Owner: `devops-engineer`.**

### 18.5 Test evidence (run this session)

| Suite | Before this batch | After |
|---|---|---|
| `cd backend && npm test` | 60 files / 531 tests | **61 files / 541 tests, all passing** |
| `cd backend && npx tsc --noEmit` | clean | clean |
| `npx vitest run` (web) | 30 files / 134 tests | **34 files / 149 tests, all passing** |
| `npm run typecheck` (web) | clean | clean |
| `npm run lint` (web) | 5 errors, all pre-existing in files not touched here | Unchanged: still the same 5 pre-existing errors, and 0 errors in changed files. The new warnings are `no-non-null-assertion` in the new test files, the same pattern the existing tests use |

**Status after this section:**
- **A-14:** fixed — pending Stage 8 review.
- **A-16:** fixed — pending Stage 8 review. The consent-evidence question goes to `compliance-specialist`. The owner sets the env var and the allow-list.
- **G-1, G-2:** fixed — pending Stage 8 review.
- **A-20:** backend and web fixed — pending Stage 8 review. Mobile step, SR-24 / lost-authenticator design, and the live AAL2 check are OPEN.
- **Everything else:** unchanged from §17.3.

---

## 19. Stage 8 review of §18 (A-14, A-16, G-1, G-2, A-20) and ADR-0014 concurrence (`cybersecurity-architect`, 2026-10-15)

This section cites §18 and ADR-0014. §§1–18 are unaltered, and I did not edit ADR-0014.

- **Evidence.** I read the shipped code myself. The orchestrator reports backend 541/541 and web 149/149 tests passing, with both typechecks clean. I did not re-run them.
- **No code changed. Nothing committed.**
- **ADR-0014 is filed** at `docs/organization/adr/0014-web-identity-through-backend-remove-browser-supabase-sdk.md` (Proposed, 2026-10-15). It is the A-21 draft, six days late against the register. My concurrence is §19.4. ADR-0014 §12 asks reviewers to record their position in an appended ADR section. This §19.4 is that record until it is mirrored there, and a pointer section in the ADR should cite it.

### 19.1 Verdicts

| Item | Verdict | Status |
|---|---|---|
| **A-14** | **PASS** | **Closed pending deploy check.** `security-engineer` confirms the deployed onboarding wizard writes no password to any storage |
| **A-16** (Layer 1: our bundle) | **CONDITIONAL** | Closed pending deploy check once **C-8** is met. Layer 2 (direct GoTrue `/signup`, `/resend`, `/recover` with the anon key) is **transferred to ADR-0014 Phase 4**. It is no longer tracked as an A-16 code item |
| **G-1** | **PASS** | Deploy gated on **C-8** |
| **G-2** | **PASS** | **Closed pending deploy check.** A deployed web sign-out produces a `logout` audit row and revokes the backend session |
| **`RESEND_VERIFICATION_IP_LIMIT` = 20 / 15 min** | **RATIFIED** | Policy value, owner `cybersecurity-architect` |
| **A-20** (backend/web) | **PASS** | **Closed pending deploy check:** the §18.4 item 3 live AAL2 check, for a TOTP-enrolled customer as well as staff. The mobile step and the lost-authenticator design move to new action **A-25** |

**No blocking code defect.** C-8 gates the deploy of the A-16/G-1 change. C-9 gates the *application* of A-3, not this deploy.

### 19.2 Findings

**A-14: the fix holds.**
- `pendingSignupAuth` is gone.
- Nothing under `src/` writes the legacy key. The only reference is the purge constant (`CustomerOnboardingPage.tsx:47`).
- The password fields are cleared after signup (`:198-205`).
- Sign-in is explicit and happens once (`:221`, `:248`).
- **Interim note.** That sign-in still runs `loginWithPassword` → GoTrue password grant → exchange (ADR-0014 W-4) until Phase 1. Accepted as interim.

**A-16 / G-1: the routes are correct and leak nothing.**
- **Redirect.** `client` is a closed enum mapped server-side (`auth.ts:84-91`, `:208`). No caller-supplied URL is read.
- **Signup.** A registered address, a new address and a legacy auth-only address all receive the same 202. The legacy case sends no mail (`:109-151`), and `SupabaseUserAlreadyExistsError` is keyed on GoTrue error *codes*, not strings (`db/supabase.ts:224-226`).
- **Resend.**
  - The per-email cooldown and ceiling are spent before the account lookup, so the 429 is uniform.
  - Send failures are swallowed, so the 503 oracle is gone.
  - The new per-IP ceiling runs first.
  - Logs carry the account id only.
- **Pre-existing residual: signup timing.** A new address costs `createUser` + DB insert + `/resend`; a known address returns at once. That gap is a timing oracle under FR-5. It predates this change, but web traffic raises its profile. Owner `backend-architect`, Low: equalise the latency, or defer the work until after the response.
- **Pre-existing residual: PII in a log.** The signup email-failure log at `auth.ts:136-139` prints the email address. Owner `backend-architect`, Low.

**Ratification of `RESEND_VERIFICATION_IP_LIMIT` (20 / 15 min).**
- **Per-address.** Abuse is already bounded per address by the per-email cooldown and ceiling.
- **Sweeps.** The per-IP ceiling bounds a sweep across many addresses. It mirrors `NOTIFY_EMAIL_VERIFIED_IP_LIMIT`, which suits an unauthenticated route of the same class.
- **Shared IPs.** Carrier-grade NAT can put many users behind one address. Twenty resends per 15 min from one address is well above legitimate demand for a rare action.
- **Status: ratified.** It may be tightened, never loosened, without re-ratification.
- **Still open from G-6.** `/auth/verify-email` still has **no** per-IP limiter (`auth.ts:165`).

**C-8 (pre-deploy for the A-16/G-1 change; owners `devops-engineer` + `mobile-architect`). The `redirect_to` query-parameter fix is not risk-free.**
- **Why §18.2's "risk if wrong: none" does not hold.**
  - **Before:** GoTrue very likely ignored the body-only `redirect_to` and used the Site URL, the web origin. If so, mobile users' verification and reset emails have in practice been landing on **web** and completing there.
  - **After:** once the query parameter is honoured, **mobile users start receiving `tditinsurance://` deep links.** Those do not open on desktop. ADR-0014 G-4 also records that `mobile/app/verify-email.tsx:23` reads `token` while the hook appends `token_hash`.
  - **Effect:** shipping this can therefore *break* mobile verification and reset in production.
- **Classification.** This is an availability regression, not a security one. It fails closed, and allow-listing is unchanged.
- **What must happen before deploy:**
  1. Live end-to-end checks of a mobile-originated signup verification and a mobile-originated reset, with the new parameter. Alternatively, ship the G-4 mobile `token_hash` fix at the same time.
  2. `EMAIL_VERIFICATION_REDIRECT_URL_WEB` set **explicitly** on staging. The fallback points at the production web.
  3. The new URL added to the Supabase redirect allow-list.

**C-9 (blocks *applying* A-3, not this deploy; owner `cto`, with `devops-engineer` and `backend-architect`). A-3's project-wide floor of 14 conflicts with the customer policy of 10.**
- **The conflict.** A Supabase minimum of 14 applies to every user. With it applied, backend customer signup and reset for 10–13-character passwords fail at GoTrue (`weak_password`).
- **How that fails.**
  - `createUser` and `updateUserPassword` wrap the error as `SupabaseUnavailableError`, so the user sees **503 `UPSTREAM_UNAVAILABLE`**.
  - On reset, that happens *after* the single-use link has been redeemed.
- **Decision needed before A-3 is applied:** either
  - **(a)** raise the customer minimum to 14 (permitted: "tightenable, not loosenable") and update the web and mobile hints; or
  - **(b)** set the project floor to 10 and accept that the backend is the only authority for 14 on privileged accounts until ADR-0014 Phase 4.

  I recommend **(a)**. Phase 4 is the point where Layer 2 password writes stop, so until then the floor is the only backstop on those writes.
- **Separately, Low:** map GoTrue `weak_password` to `VALIDATION_ERROR`, not 503. Owner `backend-architect`.

**G-2: the fix holds.**
- `logout()` goes through the authenticated client with one refresh-and-retry (`src/customer/api/auth.ts:174-176`).
- `signOut` calls it before clearing tokens, and the re-entrancy guard prevents the `onSessionTerminated` loop (`CustomerAuthProvider.tsx:66-91`).
- The GoTrue `signOut()` still runs; it is W-10 and Phase 1 removes it.
- ADR-0014's Phase 1 precondition on G-2 is met in code.

**A-20: the fix is correct.** The gate is now "has a verified TOTP factor", for every user type (`auth.ts:969-987`). It reuses the SR-6 mechanism unchanged. The response is visible only to someone holding a valid recovery credential, so it adds no user-type oracle. A customer with no factor is unchanged. Two observations:
- **TOTP guess amplification. This predates A-20, which extends it to customers.**
  - **The mechanism.** `RESET_PASSWORD_MFA_VERIFY_LIMIT` is keyed per `mfaVerificationToken` (5 attempts per 15 min). Each new `/confirm` issues a fresh token.
  - **Through emailed links:** an attacker who controls the mailbox gets about 3 links/hr (the reset-request limit) × 5 attempts, so about 15 guesses/hr.
  - **Through `recoveryAccessToken`** (mobile legacy only, since C-7): about 5 tokens × 5 attempts per 15 min per GoTrue token.
  - **There is no account-scoped TOTP-failure ceiling** across `/auth/mfa/challenge`, `/mfa/enroll/verify` and `/reset-password/mfa-verify`.
  - **Recommended action. Owner `backend-architect`; detection owner `security-engineer`, tying into ADR-0012 C-4.**
    - Add an account-keyed failure ceiling.
    - Invalidate earlier pending reset-MFA tokens for the account when a new one is issued.
  - **Not blocking.** It requires prior mailbox compromise, which is the scenario SR-6 defends, and the ceiling is a hardening.
- **Lost authenticator (A-25). My position on §18.4 item 2:**
  - **(a) Recovery codes:** concur as the primary customer path. The design must include all of the following:
    - generated at enrolment and shown once;
    - stored as slow hashes, single-use;
    - using one triggers a notification and a full revocation (sessions, push, GoTrue);
    - the user is prompted to re-enrol;
    - an audit event that is distinct from a TOTP success.
  - **(b) Support-assisted SR-24 variant:** concur as the fallback.
  - **(c) A second factor:** acceptable only as an optional complement, because it does not help a user who never enrolled one.
  - **Design review.** The (a) design needs its own Stage 8 review. It is a new credential class.

### 19.3 Consequences for ADR-0014 discovered in this batch (for `solution-architect`)

- **Phase 3 precondition: backfill legacy auth-only users.**
  - **The gap.** Accounts created by browser `signUp` before this change may have an `auth.users` row and no `app.accounts` row. Today the exchange creates the row just in time (`auth.ts` exchange, `createCustomerAccount`). `/auth/signup` now answers them with a mail-less 202.
  - **The consequence.** Once G-5 retires the exchange, these users cannot sign in or re-register.
  - **What is needed.** Phase 3 needs either a backfill, or a just-in-time creation path in `/auth/login`, with its own review.
- **§7 table corrections** (the author corrects in place, per the ADR's rule):
  - A-20 is no longer "not affected"; see §18.4;
  - A-14 is done ahead of Phase 1;
  - A-16's Layer 1 is largely done ahead of Phase 1 (signup and resend; the W-4 onboarding sign-in remains).

### 19.4 ADR-0014: `cybersecurity-architect` concurrence

**Overall: CONCUR with the decision (§2 items 1–6), subject to the conditions below.** These are ratification-level comments for `cto`, not blocking defects in the ADR text.

- **§3 rejections.** I concur with all four.
  - §3.3, the proxy, is correctly rejected. A forwarding proxy *is* a published key under a new name.
  - §3.4, removing the SDK but keeping the key, is correctly allowed only as the dated soak.
- **§4.2 CSRF reasoning.** Concur. One addition for RR-1: FR-20 device binding gives **no** protection against XSS on web. `getOrCreateWebDeviceId` lives in the same `localStorage` as the refresh token, so a script that steals one steals both. State it in RR-1 so nobody counts it as a control.
- **Session model (§2 item 6, §4, Q-5).** **Concur:** bearer tokens now, httpOnly cookies deferred to the §11 trigger (common registrable domain or same-origin `/api`). The cross-site reasoning is right: `vercel.app` and `onrender.com` are both public suffixes, so cookies would be third-party. Conditions:
  1. **A-15 (CSP + `Referrer-Policy: no-referrer`) ships no later than the Phase 1 deployment.**
     - Phase 1 makes the customer refresh token the *only* web credential (90-day cap, `localStorage`).
     - CSP is the main control left against stealing it.
     - I am raising A-15 from "should" to a **Phase 1 exit criterion**.
  2. **§4.3's `sessionStorage` question is decided jointly with A-15 before Phase 4,** not left open-ended. My provisional position is to keep `localStorage`, but require refresh-token rotation (already in place) plus an absolute cap reviewed down from 90 days, once CSP is live.
  3. **The access token stays in memory only.** Any proposal to persist it reopens this section.
- **Q-1 (A-9 residual window). My recommendation to `cto`: explicitly ACCEPT, with a hard end date. Do not reject.**
  - **Why rejecting does not help.** Rejection, meaning pulling web signup, **would not reduce the risk.** Layer 2 is account-level, not web-level (A-5 §8). The key is already in every shipped bundle, CDN cache and the browser history of every past visitor. Pulling signup stops new web accounts, and nothing else. Every C-1/C-8/C-9/C-10 path stays open for every existing account, mobile-only accounts included.
  - **The real decision is the date.** The only thing that reduces the risk is Phase 4. So the question for `cto` is how soon Phase 4 happens, not whether the residual is accepted.
  - **Conditions I attach to the acceptance:**
    - **(i) End date.** **2026-11-30** for Phase 4, or the date `cto` sets.
    - **(ii) Interim controls.** The acceptance is conditional on the A-22 console session completing by **2026-10-22**: Secure password change, Secure email change, rate limits, the C-9-resolved floor, the session time-box, and item 11's key-format answer.
    - **(iii) Running controls.** It is also conditional on A-6 and the A-19 reconciliation (C-4) being run and scheduled.
    - **(iv) Lapse rule.** If any date in (i)–(iii) slips, the acceptance **lapses automatically** and returns to `cto`. There is no silent carry-over, per A-5 §10 item 4. Each renewal is recorded in INC-003 with the reason.
- **Phase 4 exit criteria (§6).** Strengthen them. With the old key, the following must be refused, not just `/token?grant_type=password`:
  - `POST /signup`, `/recover`, `/resend`, `/otp`, `/verify`;
  - `PUT /user`;
  - `POST /factors`.

  Also record that no other publishable or anon key is enabled on the project. Confirm that the `auth-send-email` hook and the backend's service-role path still work. Only then is "Layer 2 closed" demonstrated, not assumed.
- **Phase 3.**
  - **Add** the §19.3 backfill as a precondition.
  - **Purge mechanism.** Choose one that does not write a per-user system "login" into `auth.audit_log_entries`, such as a time-boxed bulk revocation via `auth.sessions` maintenance or the key rotation itself. If per-user sign-out is used, `security-engineer` must record the run window so A-6-style forensics can exclude it.
  - **The A-10 watermark stays,** per G-5. Concur.
- **RR dispositions.**
  - **RR-1, RR-3:** concur; I own them.
  - **RR-4 and RR-5:** concur that they go to `cto` and A-22. RR-5 matters more after this batch, because all web signup and resend traffic now leaves from the backend's egress IP.
  - **RR-7:** concur with the compliance referral.
  - **RR-8:** concur, Low.
  - **RR-9:** concur. `cto`'s go decision for Phase 4 should cite the strengthened exit criteria above.
- **Stage 8 for the phases.** Phases 0–3 each come back to this gate, as §6 says. I will treat the Phase 1 PR's capability guard (A-11, `@supabase/` and key patterns in the bundle and lockfile) as a **required** Stage 8 check for that PR.

### 19.5 INC-003 status after this commit: **OPEN**

**Closed pending deploy check.** Each item moves to CLOSED when its check is recorded here.

| Item | Deploy check | Owner of the check |
|---|---|---|
| A-10, A-23 | C-2 (§15.2 / §17.1): grants and RLS on `app.account_state_transitions` and `app.account_audit_log`; then the smoke test (customer, plus one staff MFA login and one enrolment verify) | `database-architect` + `devops-engineer` |
| A-24 | Live web reset for a customer and for staff (staff must reach the TOTP step) | `devops-engineer` |
| A-20 | Live AAL2 check: a TOTP-enrolled customer completes a reset via `/mfa-verify` and `PUT /user` succeeds (do it in the same run as A-24) | `devops-engineer` |
| A-13, A-17 code limb | C-6: crafted `signup` / `magiclink` links issue no session and leave a clean URL | `security-engineer` |
| A-14 | The deployed onboarding wizard stores no password | `security-engineer` |
| G-2 | A deployed web sign-out reaches `/session/logout` (audit row plus revoked backend session) | `security-engineer` |
| A-16 Layer 1, G-1 | **C-8:** live mobile verify and reset with `redirect_to` honoured, or the G-4 mobile fix shipped alongside; staging env var set explicitly; web URL allow-listed | `devops-engineer` + `mobile-architect`; project owner (allow-list) |

**Still OPEN.**

| ID | What remains | Owner |
|---|---|---|
| A-6 (P0) | Production auth-log check for prior exploitation; §7 depends on it | `security-engineer` + project owner |
| A-3 | Floor + leaked-password protection. **Blocked on C-9** (customer minimum 10 vs floor 14) | `cto` decides C-9; then `devops-engineer` + project owner |
| A-8 | Anon-key password grant. Interim: rate limits (A-22). Structural: ADR-0014 Phase 4 | `security-engineer` + project owner |
| A-9 | `cto` accepts or rejects the residual window. Recommendation and conditions are in §19.4 Q-1 | `cto` |
| A-11 | Relabel the guard; add the capability check (required at the ADR-0014 Phase 1 Stage 8) | `automation-qa-engineer` |
| A-12 | Backend accepts any GoTrue token; mobile legacy `access_token` | `backend-architect` + `mobile-architect` |
| A-15 | CSP + `Referrer-Policy`. **Now a Phase 1 exit criterion** (§19.4) | `frontend-architect` + `devops-engineer` |
| A-16 Layer 2 | Transferred to ADR-0014 Phase 4. Consent-evidence and historic-account questions referred | `solution-architect` / `cto`; `compliance-specialist` |
| A-17 console limb | C-5: withdraw (moot after Phase 1) | `cto` + `devops-engineer` |
| A-18 | Layer 2 `PUT /user`. Console interim; Phase 4 | project owner + `devops-engineer` |
| A-19 | C-4: non-TOTP factors | `authentication-engineer` |
| A-19 | C-4: scheduling and alert routing | `site-reliability-engineer` |
| A-19 | C-4: first-run triage | `security-engineer` |
| A-21 | ADR-0014 **filed (Proposed)**. Concurrence of `cybersecurity-architect` recorded (§19.4); `authentication-engineer` and `compliance-specialist` pending; `cto` ratification (2026-10-16 target, Q-8) | `solution-architect`; `cto` |
| A-22 | Live-config verification, including item 11 (key format) and item 6 (time-box ≤ 12 months). Must complete by **2026-10-22** for the §19.4 Q-1 acceptance to hold | `security-engineer` + project owner; `devops-engineer` records |
| **A-25 (new)** | A-20 remainder: (i) mobile TOTP step for customer reset; (ii) customer lost-authenticator path (recovery codes primary, SR-24 variant fallback) with its own Stage 8; (iii) account-scoped TOTP-failure ceiling + invalidate earlier reset-MFA tokens (§19.2) | (i) `mobile-engineer`; (ii) `backend-architect` + `cybersecurity-architect`; (iii) `backend-architect`, detection `security-engineer` |
| §7 | Compliance concurrence, plus the A-16 consent-evidence referral | `compliance-specialist` |

**Non-blocking follow-ups**, carried from §17.3 plus this batch:

| Follow-up | Owner |
|---|---|
| Alert routing for the propagation-failure tag | `site-reliability-engineer` |
| IR-runbook note on system sign-outs | `security-engineer` |
| Staff password-length retry token | `backend-architect` |
| Partial index on revoked sessions | `database-architect` |
| Distinct audit event for exchange-minted sessions | `backend-architect` + `security-engineer` |
| Ban-on-suspend design | `backend-architect` |
| Signup timing equalisation; email-address PII in the signup failure log; GoTrue `weak_password` → `VALIDATION_ERROR` | `backend-architect` |
| Per-IP limiter on `/auth/verify-email` (G-6 remainder) | `backend-architect` |
| Phase 3 backfill of auth-only users (§19.3) | `solution-architect` / `backend-architect` |

**Closure rule (unchanged).** INC-003 closes when all of the following hold:
- A-3 and A-6 are closed;
- every item A-8 … A-25 is closed or has been transferred to a successor incident by `cto`;
- `compliance-specialist` has concurred on §7.

---

*Opened by `cybersecurity-architect`, 2026-09-23. This document is shared and append-only: correct your own
prior sections in place with superseded text marked void; disagree with another role's section in a new
section that cites it.*

