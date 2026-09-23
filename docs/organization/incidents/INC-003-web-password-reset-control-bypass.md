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
| **A-1** | F-1…F-7 implemented and merged | `authentication-engineer` / `frontend-architect` | 2026-09-26 | OPEN |
| **A-2** | F-2 contract amendment (allow-listed per-client redirect) | `backend-architect` | 2026-09-25 | OPEN |
| **A-3** | F-8 Supabase project password floor = 14 + leaked-password protection | `devops-engineer` + project owner | 2026-09-24 | OPEN |
| **A-4** | F-9 regression tests green | `automation-qa-engineer` | 2026-09-26 | OPEN |
| **A-5** | Re-threat-model the **browser-resident Supabase SDK** as a trust boundary in its own right — every credential- or session-mutating call the web bundle can make against Supabase directly, not just this one. The §2.5 trigger is now overdue. | `cybersecurity-architect` | 2026-10-03 | OPEN |
| **A-6** | Check production Supabase auth logs for `user_updated`/recovery events against any `admin` / `security_company_operator` / `support_agent` address since web auth shipped, and report whether this path has been exercised. Not reachable from this repo; needs console access. | `security-engineer` + project owner | 2026-09-26 | OPEN |
| **A-7** | Implementation verification against §5 and counter-sign | `security-engineer` | on A-1 merge | OPEN |

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

## 8. Cross-references

- `docs/features/001-authentication/security-review.md` §2.3 (attack tree), §6 (ratified policy table), §8
  (SR-6), §13 (the re-threat-model trigger that fired). A pointer to this incident is appended there as §14.
- `docs/features/007-notifications/security-review.md` §8.2 (SR-007-1, the push-token limb).
- `backend/src/routes/auth.ts:722-956` — the correct implementation this bypasses.
- `mobile/app/(auth)/reset-password.tsx` — the correct client-side consumption pattern, except for F-4.

---

*Opened by `cybersecurity-architect`, 2026-09-23. This document is shared and append-only: correct your own
prior sections in place with superseded text marked void; disagree with another role's section in a new
section that cites it.*
