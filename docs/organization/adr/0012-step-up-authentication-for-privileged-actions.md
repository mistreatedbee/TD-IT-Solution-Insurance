# ADR-0012: Step-Up Authentication for Privileged Actions

Status: **Proposed** — awaiting `cto` ratification. Security design owned by `cybersecurity-architect`.
Date: 2026-09-23
Deciders: `cybersecurity-architect` (author, SR-11 control owner), `authentication-engineer` (co-owner
of the mechanism), `backend-architect` (contract), ratified by `cto`.
Driver: Feature 017 D-2 blocker **R-1** —
[`docs/features/017-privileged-account-self-service/01-architecture-scope-note.md`](../../features/017-privileged-account-self-service/01-architecture-scope-note.md) §6.
Numbering note: ADR-0010 remains **reserved** for the payment-gateway ratification
(`payment-gateway-vendor-scorecard.md`, per the 2026-09-10 `cto` check-in); 0012 is the next free number.

---

## 1. Context

### 1.1 What already exists (verified in code, 2026-09-23)

Step-up is **not** a from-scratch design. The *enforcement half* is already built and shipping:

- `backend/src/lib/policy.ts:190` — `INVITATION_ISSUANCE_STEP_UP_WINDOW_SECONDS = 15 * 60`.
- `backend/src/routes/invitations.ts:43-53` — `POST /v1/invitations` loads the **current session**
  live from `app.sessions` (`ctx.sessions.findById(req.auth!.sessionId)`) and rejects with
  `STEP_UP_REQUIRED` unless `mfaVerifiedAt` is within that window. It deliberately does **not**
  trust any token claim; the access token carries no `mfa_verified_at` at all.
- `backend/src/lib/errors.ts:77` — `STEP_UP_REQUIRED` → HTTP 401, "Please re-verify your identity
  to continue." Both clients already map it to user-facing copy
  (`src/lib/user-facing-errors.ts:118`, `mobile/src/lib/user-facing-errors.ts:154`).
- `backend/migrations/030_stage9_security_review_schema_changes.sql` — `app.sessions.mfa_verified_at`
  exists with a column comment stating the 15-minute re-verification intent.
- This is the implementation of **SR-11** from
  [`001-authentication/security-review.md`](../../features/001-authentication/security-review.md) §6,
  mitigating attack-tree branch **F1** ("compromise one admin, mint more admins").

So the answer to "is the constant already wired up?" is: **yes, on the checking side, in exactly one
place.** What is missing is the *refresh half* and the *generalisation*.

### 1.2 What is missing

1. **No way to renew `mfa_verified_at` on a live session.** It is set at exactly two points:
   login MFA challenge (`backend/src/routes/auth.ts:707`) and MFA enrollment verify
   (`backend/src/routes/mfa.ts:228`), both at `mintNewSession(...)` time. `session/refresh` **copies**
   the original timestamp onto the rotated session (`backend/src/lib/refresh-session.ts:237`).
   There is no `UPDATE app.sessions SET mfa_verified_at = ...` anywhere — `backend/src/repositories/sessions.ts`
   has no such method. **Consequence: an admin whose session is >15 minutes old cannot issue an
   invitation at all, and the only remedy is a full logout/login.** The feature is currently
   unusable by design accident, not by policy.
2. **No shared helper.** `backend/src/middleware/authenticate.ts:126` carries the comment
   `// step-up check is a separate, endpoint-specific concern (see lib/step-up.ts)` — **`backend/src/lib/step-up.ts`
   does not exist.** That is a stale forward-reference to a file that was never written; the logic
   lives inline in `invitations.ts`. Any second consumer would copy-paste it.
3. **No policy table.** Which privileged actions require step-up is currently "the one endpoint that
   happens to have the check pasted into it," not a reviewable list.

### 1.3 Why this is architecture-significant

Step-up is the only control in this platform that distinguishes *"this request carries a valid
session token"* from *"a human currently in possession of the registered MFA factor authorised this
specific action."* That distinction is the last line of defence for actions that mint privilege or
expose customer PII/geolocation. Getting its semantics wrong (e.g. letting refresh renew the
timestamp) silently converts it into a no-op while leaving every "step-up required" claim in our
security docs looking satisfied. It therefore needs an ADR, not a PR comment.

---

## 2. Decision

### 2.1 Definition — step-up is a *freshness assertion*, satisfied from the window, re-proved on demand

**Step-up MFA, for this platform, means: the current session's server-side `mfa_verified_at` is no
older than the action's configured freshness window, where that timestamp can only ever have been
written by a live, successful TOTP verification bound to that same session.**

Concretely, for a request to a step-up-protected action:

- If `mfa_verified_at` is **within** the window → the request proceeds. **The user is not
  re-prompted.** A TOTP code entered 4 minutes ago is live-possession proof that is still 4 minutes
  old; forcing a second code within the same window buys no security and trains admins to treat
  code entry as noise.
- If it is **stale, null, or the session is revoked** → `STEP_UP_REQUIRED` (401), and the client
  runs the re-prove flow in §2.2, then retries the original request.

Rejected alternative: *re-prompt unconditionally on every protected action* (§4.1). Rejected
alternative: *satisfy step-up from a recent password re-entry* (§4.3) — password is a knowledge
factor and is exactly what a phished/credential-stuffed attacker already has.

Three invariants make the window meaningful rather than decorative. These are the load-bearing part
of this ADR:

- **INV-1 — Only live factor verification writes the timestamp.** `mfa_verified_at` is set only by
  (a) login MFA challenge, (b) MFA enrollment verify, (c) the new step-up verify of §2.2. Nothing else.
- **INV-2 — Token refresh must never renew it.** The current copy-forward behaviour at
  `refresh-session.ts:237` is **correct and is hereby ratified as intentional**, not a bug. Renewing
  on refresh would let any holder of a stolen refresh token keep step-up permanently "fresh" without
  ever touching the factor, which is precisely the threat in §5.1. R-1 is a *missing endpoint*, not
  a refresh defect. Any future PR that makes refresh touch `mfa_verified_at` must be blocked on sight
  and must cite this ADR to be reopened.
- **INV-3 — The check reads the server-side session row, live, per request.** Never a JWT claim,
  never a cached value, never a client-supplied field. `invitations.ts` already does this; every new
  consumer inherits it via the shared middleware of §2.3.

### 2.2 Mechanism — a two-call, session-bound step-up that mints no tokens

Add two authenticated endpoints under the existing `/v1/auth/mfa/` namespace. Two calls, not one,
because GoTrue's TOTP verification requires a server-created `challengeId` (see
`ctx.supabase.challengeTotpFactor` / `verifyTotpFactor`, `backend/src/db/supabase.ts:248,260`) —
this mirrors the login flow's existing `POST /auth/mfa/challenge` shape rather than inventing a
third pattern.

```
POST /v1/auth/mfa/step-up/challenge     Authorization: Bearer <access token>
  body: {}                              (no identifiers accepted — principal from token ONLY)
  200 → { stepUpChallengeToken, expiresIn }        // short-lived, KV-stored, opaque
  409 → MFA_NOT_ENROLLED                           // no verified TOTP factor on the account

POST /v1/auth/mfa/step-up/verify        Authorization: Bearer <access token>
  body: { stepUpChallengeToken, code }             // 6-digit TOTP
  200 → { mfaVerifiedAt, stepUpExpiresAt }         // NO accessToken, NO refreshToken, NO sessionId
  401 → MFA_CHALLENGE_INVALID { attemptsRemaining }
```

Mandatory properties:

1. **Session-bound.** The challenge record stores `sessionId` and `accountId` taken from
   `req.auth`. Verify refuses if the bearer token on the verify call resolves to a different
   `sessionId` than the one that created the challenge. Step-up proved on session A can never
   satisfy session B.
2. **Mints nothing.** It writes `app.sessions.mfa_verified_at = now()` **for the current session
   only** and returns. No session rotation, no new refresh token, no re-issued access token, no
   privilege change. This keeps the endpoint uninteresting to an attacker who lacks the factor and
   keeps it out of the session-lifetime/absolute-cap logic entirely (it must **not** extend
   `expires_at` or `absolute_expires_at` — step-up freshens the *factor proof*, never the *session*).
3. **Refuses on a revoked/expired session**, and refuses if the account has no verified TOTP factor
   (`MFA_NOT_ENROLLED`) — there is no password fallback and no bypass for accounts that skipped
   enrollment. Privileged user types cannot reach an active session without MFA today
   (`mfa.ts` surfaces + SR-14 force-re-enrollment), so this is a closed set.
4. **Rate-limited and lockout-consistent** with `MFA_CHALLENGE_LIMIT`, keyed on `accountId`
   *and* on the challenge token (the pattern at `auth.ts:651`). Exhausting attempts invalidates the
   challenge token; it must **not** revoke the session (that would hand an attacker with a stolen
   token a denial-of-service against the legitimate admin — see §5.3).
5. **Audited on both outcomes** — new `app.audit_log` event types `mfa_step_up_verified` and
   `mfa_step_up_failed`, carrying `sessionId` and IP, correlatable per ADR-0006. A burst of
   `mfa_step_up_failed` on a privileged account is a high-signal ATO indicator and should be a
   detection rule (`security-engineer`, condition C-4 below).
6. **Idempotency-Key not required** on verify — it is not a resource-creating call, and requiring it
   would complicate client retry after an invalid code. (Deliberate departure from the
   `POST /v1/invitations` convention; noted so it does not read as an oversight.)

**Repository change:** `SessionRepo` gains `touchMfaVerifiedAt(sessionId: string, at: Date): Promise<void>`,
implemented in `backend/src/repositories/sessions.ts` as an `UPDATE ... WHERE id = $1 AND revoked_at IS NULL`.
This is the *only* sanctioned writer outside session creation (INV-1). No migration is needed — the
column already exists (migration 030).

### 2.3 Shared enforcement — create the `lib/step-up.ts` that `authenticate.ts` already references

Create `backend/src/lib/step-up.ts` exporting:

- `STEP_UP_WINDOW_SECONDS` per action class (see §3), with
  `INVITATION_ISSUANCE_STEP_UP_WINDOW_SECONDS` retained in `policy.ts` as the invitation-issuance
  value so nothing breaks and the SR-11 provenance comment survives;
- `requireStepUp(ctx, windowSeconds)` — Express middleware performing the INV-3 live read and
  raising `STEP_UP_REQUIRED`;
- and the `STEP_UP_ACTIONS` policy table of §3.

`invitations.ts` is refactored to use the middleware with **identical semantics and the same 15-minute
value** — behaviour-preserving, so it needs no new gate approval of its own. Update the stale comment
at `authenticate.ts:126` to point at the file once it exists.

### 2.4 Client contract (Feature 017 D-2 and every later consumer)

Clients treat `STEP_UP_REQUIRED` as a **recoverable, in-place interstitial**, never a logout:
catch it → challenge → collect a 6-digit code in a modal → verify → **retry the original request
with the same `Idempotency-Key`**. The scope note's option (b) ("force re-login") is explicitly
**rejected** — logging an admin out to prove a factor they already enrolled is both hostile and
worse for security, because it normalises unexpected re-login prompts, which is the exact muscle
memory a credential-phishing page exploits.

---

## 3. Which actions require step-up

Classification principle: **step-up is required where a single request either (a) creates, escalates,
or transfers privilege, (b) materially and irreversibly changes account state or money, or
(c) newly exposes precise location/PII to a party who could not already see it.** Reads that a role
performs dozens of times per shift are out — a control that fires constantly gets clicked through.

### Tier A — step-up required (15-minute window)

| Action | Route | Status | Rationale |
|---|---|---|---|
| Issue privileged invitation | `POST /v1/invitations` | **Enforced today** | Mints a new privileged account (SR-11, attack-tree F1) |
| Change account state (suspend/reactivate/close) | `PATCH /v1/admin/accounts/:id/state` (`admin-accounts.ts:175`) | **Gap — add** | Can lock out a real customer or un-suspend an attacker-controlled account |
| Approve/reject identity verification | `PATCH /v1/admin/accounts/:id/profile/verification` (`admin-verification.ts:183`) | **Gap — add** | Verification status is a trust primitive other controls key off |
| Edit plan catalog (pricing/tiers) | `PATCH /v1/admin/plans/:planId` (`admin-plans.ts:78`) | **Gap — add** | Commercial impact across every subscriber; effectively a money-moving action |

These three gaps are **not** part of Feature 017's scope and must not be smuggled into D-2. They are
raised here as follow-ups (**SU-FU-1**, below) so the policy table is honest about what the platform
does versus what it should do. Retro-fitting them requires their own UI work in `src/admin/` and is
sequenced by `technical-project-manager`.

### Tier A-reserved — required when these ship

| Future action | Source requirement |
|---|---|
| Asset location-tracking opt-in | **SDL-9** ([ADR-0009](0009-self-asserted-location-ingestion-trust-boundary.md) §, INC-001 A-7) — currently unsatisfiable because no step-up mechanism existed; this ADR supplies it. The route itself is withdrawn (no `backend/src/routes/asset-location.ts` in the tree today); re-enablement is gated by INC-002 and ADR-0009 §17 regardless. |
| Account deletion / erasure confirmation | Feature 015 business-requirements §"step-up", which already assumes this mechanism |
| Payment method add/change, payout destination change | `payment-engineer` + PCI scope; no payments backend exists yet |
| Household-member privilege grant | Feature 014 business-requirements §, which notes customers cannot satisfy SR-11 today |

Note a live constraint for Tier A-reserved: **customer-type accounts are not required to enrol MFA.**
For any customer-facing Tier A action, `MFA_NOT_ENROLLED` is a reachable state and the owning feature
must define its fallback **in its own Stage 8 review** — that fallback is out of scope here and is
*not* pre-approved by this ADR. Password re-entry is not an acceptable fallback (§4.3).

### Tier B — step-up NOT required

Privileged **reads** (`GET /v1/admin/accounts`, `GET /v1/admin/verification-requests`,
`support-lookup.ts` case lookups), support case notes (`POST /v1/recovery-cases/:caseId/notes`), and
all security-company case operations (`security-cases.ts`). These are governed by role scoping,
rate limits, and ADR-0006 audit correlation instead. **This is a deliberate, accepted trade-off, not
an oversight** — see residual risk RR-2. If support-lookup is later extended to reveal precise
location, it moves to Tier A and this table must be amended.

---

## 4. Alternatives considered

**4.1 Re-prompt for a TOTP code on every protected request (no window).** Rejected. Within a
15-minute window it adds no meaningful assurance over INV-1/INV-2 — an attacker who can drive the
admin's browser at minute 0 can drive it at minute 3. It does add reliable harm: prompt fatigue,
and the same modal appearing so often that a phishing overlay becomes unremarkable. Reconsider only
for a future action class with irreversible financial impact, where the *action-binding* variant
(4.2) would be the right answer anyway.

**4.2 Action-bound step-up (the TOTP code signs the specific request payload, e.g. "invite
alice@x.com as admin").** This is strictly stronger — it defeats an attacker who rides along inside
the freshness window and substitutes a different payload. Rejected **for now** on cost/benefit: it
requires a server-side pending-action store, per-action review UI, and a client contract far beyond
Feature 017's needs. Recorded as the designated upgrade path; revisit trigger in §7.

**4.3 Password re-entry as an acceptable step-up credential.** Rejected outright. Password is a
knowledge factor; the primary threats (§5.1) are session theft and credential compromise, against
both of which a password proves nothing new. Feature 008's `api-design.md:208` sketches a `stepUp`
object allowing "fresh password **or** MFA verification token" — **that alternative is void for
privileged actions**; only live TOTP satisfies step-up under this ADR. `integration-architect` and
whoever revives Feature 008 must align to this.

**4.4 Extend the window to reduce prompts (e.g. 60 minutes).** Rejected. 15 minutes is already
generous relative to the 10-minute access-token TTL it was derived from, and the window is exactly
the attacker's ride-along budget (§5.1). Keep 15.

**4.5 Force re-login on `STEP_UP_REQUIRED` (scope note option b).** Rejected — §2.4.

---

## 5. Threat model

Surface: privileged web dashboards (`src/admin/`, `src/security/`) → Backend API → Supabase identity.
New trust boundary introduced: **none** — this ADR *strengthens* an existing boundary
(authenticated-session → privileged-action) by adding a proof-of-possession checkpoint inside it.

### 5.1 Primary threat — Elevation of Privilege via a session that outlives its factor proof (STRIDE: E, S)

Attack tree, extending Feature 001's branch F1:

```
Goal: attacker mints themselves a persistent privileged account
├── A. Obtain a live admin session without the MFA factor
│   ├── A1. Steal access/refresh token — XSS on the shared marketing origin
│   │        (ADR-0011 accepted risk: /login is same-origin as public bundle)  ── LIVE
│   ├── A2. Unattended, unlocked admin workstation                              ── LIVE
│   ├── A3. Token exfiltrated from client storage by malware/extension          ── LIVE
│   └── A4. Refresh-token replay before family-revocation detection             ── partially mitigated (SR-8 family revoke)
├── B. Convert that session into new privilege
│   ├── B1. POST /v1/invitations  ──────► BLOCKED unless mfa_verified_at fresh (this control)
│   ├── B2. Wait out / renew the freshness without the factor
│   │        └── via session/refresh ───► BLOCKED by INV-2 (refresh copies, never renews)
│   │        └── via step-up endpoint ──► BLOCKED: requires a live TOTP code
│   └── B3. Ride along inside a window the legitimate admin just opened ─► RESIDUAL (RR-1)
└── C. Cover tracks ──► audit events mfa_step_up_verified/failed + ADR-0006 correlation
```

What this buys: the attacker's stolen session becomes a *read-and-routine-write* capability, not a
*privilege-minting* capability, unless they are also (i) present inside a 15-minute window the real
admin opened, or (ii) in possession of the TOTP factor. That is a materially smaller blast radius,
and it holds even while ADR-0011's origin-separation risk remains accepted.

### 5.2 Secondary threats addressed

- **Repudiation (R):** `mfa_step_up_verified`, with session and IP, is a far stronger
  "this human authorised this" record than "a valid token was presented." Strengthens the evidentiary
  quality of every Tier A action for POPIA accountability purposes (`compliance-specialist` to confirm).
- **Malicious insider at a partner org:** does not directly apply today (all Tier A actions are
  `admin`-only), but the same mechanism is the one to reach for if security-company operators ever
  gain a privilege-minting or location-revealing action.

### 5.3 Threats the endpoint itself introduces, and their mitigations

| New risk | Mitigation |
|---|---|
| Step-up endpoint as a **TOTP brute-force oracle** on a known-valid session | `MFA_CHALLENGE_LIMIT` rate limiting on account **and** challenge token; short challenge TTL; audit on every failure |
| Attacker uses repeated failures to **lock out** the legitimate admin | Attempt exhaustion invalidates only the *challenge token*, never the session and never the account (§2.2.4) |
| Endpoint becomes a **session-lifetime extender** | Explicitly writes only `mfa_verified_at`; must not touch `expires_at`/`absolute_expires_at` (§2.2.2) — QA assertion required (C-3) |
| **Cross-session confusion** (prove on a low-value session, spend on a privileged one) | Challenge is bound to `sessionId`; verify rejects mismatch (§2.2.1) |
| Phishing page imitating the step-up modal to harvest codes | Partially mitigated by the modal being in-place and rare-but-predictable rather than a surprise re-login (§2.4); **not fully mitigated** — see RR-3 |

### 5.4 Explicitly OUT of scope

1. **Real-time phishing / MITM relay of a TOTP code** (attacker proxies the code within its 30-second
   validity). TOTP is structurally vulnerable to this; only phishing-resistant factors (WebAuthn /
   passkeys, origin-bound) fix it. Out of scope for this ADR; see §7 revisit trigger.
2. **Malware on the admin's own device** driving an authenticated browser after a legitimate
   step-up. No server-side control fixes an attacker sitting behind the user's own successful
   authentication. Endpoint hardening is a separate `security-engineer`/IT concern.
3. **Compromise of the TOTP shared secret** (at enrollment, via Supabase, or a backed-up
   authenticator). Factor-provisioning security is Feature 001's scope.
4. **Server-side / database compromise.** An attacker with write access to `app.sessions` can set
   `mfa_verified_at` directly. This control assumes backend integrity.
5. **Authorisation correctness.** Step-up proves *who*, not *whether they may*. `requireUserType` and
   scoping remain fully responsible; step-up never substitutes for an authZ check.
6. **Customer-tier actions and MFA-unenrolled accounts** (§3 Tier A-reserved note).

---

## 6. Consequences, residual risks, and conditions

### 6.1 Consequences

- Feature 017 D-2 is unblocked: the step-up modal becomes a normal, designed part of the
  `/admin/accounts/invite` flow rather than a dead end. `ui-designer` must design the modal;
  the OTP input primitive may not exist on web yet (`design-system-manager` sign-off per scope note §7).
- Backend work is small and contained: two routes, one repo method, one new lib file, two audit
  event types, zero migrations.
- `authentication-engineer` is **co-owner**, not consulted: the challenge/verify lifecycle, GoTrue
  interaction, rate-limit keying, and lockout semantics are theirs to implement and to keep
  consistent with the login MFA flow.
- Every future "requires step-up" statement in a security review now has a real mechanism to point
  at, instead of a control that could not be satisfied.

### 6.2 Residual risks (accepted, with owners)

| ID | Risk | Owner | Disposition |
|---|---|---|---|
| **RR-1** | Attacker with a stolen session rides along inside a 15-minute window the legitimate admin opened | `cybersecurity-architect` | **Accepted.** Cost of eliminating it is action-bound step-up (§4.2) or no-window re-prompting (§4.1). Revisit if a Tier A action with irreversible financial impact ships. |
| **RR-2** | Tier B privileged reads (customer PII via support-lookup / admin account reads) remain reachable on a stale-factor session | `cybersecurity-architect` | **Accepted.** Governed by role scoping + ADR-0006 audit correlation. Re-open immediately if any Tier B read is extended to expose precise location. |
| **RR-3** | TOTP is phishable in real time; step-up raises the bar but is not phishing-resistant | `cybersecurity-architect` | **Accepted for now.** WebAuthn for privileged accounts is the structural fix and is a separate, larger decision (§7). |
| **RR-4** | Three Tier A gaps (account state, verification approval, plan edit) stay unprotected until SU-FU-1 lands | `technical-project-manager` (sequencing), `backend-architect` (build) | **Accepted, time-boxed.** Must have a target sprint at ratification, not "later." |

Per house rules, silent risk acceptance is not permitted: RR-1 through RR-4 require an explicit
accountable owner sign-off at `cto` ratification of this ADR.

### 6.3 Conditions on Stage 8 sign-off for any feature consuming this

- **C-1** `authentication-engineer` implements challenge/verify with the §2.2 properties; no session
  rotation, no token minting, no lifetime extension.
- **C-2** `backend-architect` lands `lib/step-up.ts` + the `STEP_UP_ACTIONS` table and refactors
  `invitations.ts` onto it behaviour-preservingly; stale `authenticate.ts:126` comment corrected.
- **C-3** `qa-architect`/`automation-qa-engineer` cover, as explicit tests derived from §5:
  (i) refresh does **not** renew `mfa_verified_at` (INV-2 — regression-guard this forever);
  (ii) step-up does not extend `expires_at`/`absolute_expires_at`;
  (iii) challenge bound to session A cannot be verified with session B's token;
  (iv) step-up on a revoked session fails;
  (v) attempt exhaustion does not revoke the session;
  (vi) `STEP_UP_REQUIRED` → step-up → retry succeeds end-to-end.
  Note scope-note **R-5**: there is still no `backend/src/routes/invitations.test.ts` — this work
  should not add a second consumer to an untested control.
- **C-4** `security-engineer` adds a detection rule on `mfa_step_up_failed` bursts against privileged
  accounts, and verifies no step-up artefact (code, challenge token) is logged.
- **C-5** `compliance-specialist` confirms the new audit event types satisfy POPIA accountability
  expectations for privileged actions and that they carry no excess personal data.
- **SU-FU-1** (follow-up, not blocking Feature 017) `backend-architect` extends Tier A to
  `PATCH /admin/accounts/:id/state`, `PATCH /admin/accounts/:id/profile/verification`,
  `PATCH /admin/plans/:planId`, with the matching admin-UI work.

---

## 7. Revisit trigger

Reopen this ADR if any of the following occur: a Tier A action with irreversible financial impact
ships (evaluate action-bound step-up, §4.2); an account-takeover incident shows ride-along inside the
freshness window (RR-1 realised → shorten window or adopt §4.2); WebAuthn/passkeys are adopted for
privileged accounts (RR-3 → step-up becomes phishing-resistant and the window could lengthen);
security-company operators gain any privilege-minting or precise-location-revealing action (Tier A
re-classification); or the customer tier gains a Tier A action, which forces the MFA-not-enrolled
fallback question this ADR deliberately leaves open.
