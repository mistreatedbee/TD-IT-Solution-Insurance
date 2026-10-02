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

*Opened by `cybersecurity-architect`, 2026-09-23. This document is shared and append-only: correct your own
prior sections in place with superseded text marked void; disagree with another role's section in a new
section that cites it.*

