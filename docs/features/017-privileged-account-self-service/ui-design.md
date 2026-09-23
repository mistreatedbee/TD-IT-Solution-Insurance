# Feature 017 (D-1) — UI Design (Stage 3/4): Invitation Accept + MFA Enrollment (Web)

**Lifecycle stage:** 3/4 — UX/UI Design
**Owner:** `ui-designer`
**Status:** Draft — feeds Stage 5 (Architecture Review) and Stage 9 (`frontend-engineer` build).
Covers **D-1 only** (public accept + enroll route). D-2 (admin-side send/revoke/resend UI) is out
of scope here per `01-architecture-scope-note.md` §5 sequencing — it is blocked on R-1 (no step-up
re-verification endpoint) and is a separate design pass once that's resolved.
**Input artifacts:** [`business-requirements.md`](./business-requirements.md) (Stage 1, AC-3/AC-4),
[`01-architecture-scope-note.md`](./01-architecture-scope-note.md) (Stage 1, backend contract +
risks R-1–R-7, C-1/C-2)

**Route:** `/invitations/accept?token=…` — new top-level route, outside `/admin/*` and
`/security/*`, outside the authenticated route guard (scope note §5, D-1). Lives at
`src/invitations/` with an `src/api/invitations.ts` client module, mirroring
`mobile/src/api/invitations.ts` in call shape only, **not** in visual treatment (see R-2 note
below — the mobile QR rendering line is being fixed under a parallel incident and must not be
copied).

---

## 0. What already exists and is reused verbatim

This flow is deliberately designed as a **sibling of `PrivilegedLoginPage`**
(`src/dashboard/components/PrivilegedLoginPage.tsx`), the one other place this codebase renders an
unauthenticated, security-sensitive, single-purpose web form. Reusing its container idiom exactly
means an invitee's first-ever screen and their first-ever login screen (days or weeks later, after
their invitation-minted password) look like the same product, not two different design eras.

Reused verbatim, no new component:
- **Page shell:** `min-h-full` flex-centered container on `bg-surface-navy-deep`, single `Card
  padding="lg" interactive={false} className="w-full max-w-md"` — same as `PrivilegedLoginPage`.
- **`SectionHeading as="h1" size="md"`** for the step title, **`<p className="text-sm
  text-text-secondary">`** for the subtitle line directly under it.
- **`InlineAlert`** (`src/dashboard/components/ui.tsx`) — `tone="danger"` for blocking errors,
  `tone="info"` for the idle/neutral notices, `tone="warning"` is available but unused here (no
  warning-severity state in this flow).
- **`Input`** (`src/components/Input`) — used for password/confirm and for the 6-digit code field.
  Its `error` prop drives the built-in red-border + `AlertCircleIcon` state; no new "OTP box"
  component is introduced (see §3.3 for why).
- **`Button`** (`src/components/Button`) — `variant="primary"` for the primary forward action per
  step, `fullWidth`, with `loading` bound to each step's in-flight state exactly like
  `PrivilegedLoginPage.onSubmitCredentials`/`onSubmitMfa`.
- **`Badge`** (`src/components/Badge`) — `tone="gold"` to display the invited role on the landing
  state (§1.2), matching how role/status chips already read elsewhere in the dashboards
  (`StatusBadge` in `ui.tsx` follows the same tone convention).
- **`mapUserFacingError`** (`src/lib/user-facing-errors.ts`) — already carries every error code
  this flow can hit (`INVITATION_INVALID`, `INVITATION_EXPIRED`, `MFA_CHALLENGE_INVALID`,
  `MFA_ENROLLMENT_NOT_FOUND`, `ENROLLMENT_TICKET_INVALID`, `RATE_LIMITED`,
  `UPSTREAM_UNAVAILABLE`, `VALIDATION_ERROR`) with copy already written and reviewed. This design
  does not introduce new copy for any of those — it only decides *which screen/step* each one
  renders on and confirms none is missing (§4 audits the full list against the routes).

**No new primitive is requested from `design-system-manager`.** The one place a new component
might seem tempting — a segmented 6-digit OTP box — is deliberately *not* proposed; see §3.3.

---

## 1. Screen structure (one route, four sequential steps, one shared shell)

```
/invitations/accept?token=…
 ┌─────────────────────────────────────────────────────────┐
 │  Card (max-w-md, centered, on bg-surface-navy-deep)       │
 │                                                            │
 │  Step 1: Landing / token validation  (auto, on mount)      │
 │     → success: invitation details + "Accept" CTA           │
 │     → failure: terminal error card (§2.3), no retry form   │
 │                                                            │
 │  Step 2: Set password  (only reached from Step 1 success)  │
 │     → success: advances in place to Step 3                 │
 │     → failure: either re-renders Step 2 with inline error, │
 │       or (410/INVITATION_EXPIRED) drops to the same        │
 │       terminal error card as Step 1                        │
 │                                                            │
 │  Step 3: MFA enrollment (QR + manual key + code)            │
 │     → success: advances to Step 4                          │
 │     → failure: re-renders Step 3 with inline error          │
 │       (wrong code, rate-limited) or a distinct ticket-      │
 │       expired terminal state (abandoned-session case)       │
 │                                                            │
 │  Step 4: Success  → auto-redirect to role's dashboard       │
 └─────────────────────────────────────────────────────────┘
```

All four steps render inside the **same `Card`**, in the **same route** — no client-side routing
between steps, only local component state (`step: 'loading' | 'landing' | 'password' |
'mfa' | 'success' | 'error'`), matching `PrivilegedLoginPage`'s own pattern of swapping form
content inside one static shell rather than navigating. A `StepItem`-based progress indicator
(`src/components/StepItem`) is **not** used here: the house style guidance to show visible progress
via `StepItem` applies to multi-page flows the user actively steers (e.g. theft report); this flow
has exactly one path with no branching choices for the user to make, so a numbered stepper would
add visual noise without adding orientation value. Instead, each step's `SectionHeading` states
plainly which step it is ("Step 2 of 3: Set your password") — enough orientation, zero decoration,
consistent with "don't over-design stressful/procedural flows."

---

## 2. Step 1 — Landing / token validation

### 2.1 Loading state (on mount, before `GET /invitations/:token` resolves)

```
Card
  SectionHeading  "Accept your invitation"
  <spinner row, reusing Button's inline Spinner treatment or a simple
   centered text row: "Checking your invitation…">
```
No `Input`/`Button` rendered yet — nothing is interactive until the token result is known. Keep
this state brief in copy; it should typically resolve in well under a second.

### 2.2 Success — invitation details

```
Card
  SectionHeading "Accept your invitation"
  <p className="text-sm text-text-secondary">
    You've been invited to join TD IT Solutions Insurance as {roleLabel}.
  </p>

  <dl> two-row detail block, reusing DetailGrid (src/dashboard/components/ui.tsx) >
    Email        →  {invitation.email}
    Role         →  <Badge tone="gold">{roleLabel}</Badge>

  <Button variant="primary" fullWidth onClick={() => setStep('password')}>
    Accept invitation
  </Button>
```

`roleLabel` reuses the **exact same mapping table** Feature 012 already canonicalized
(`admin` → "Admin", `security_company_operator` → "Security Partner Operator", `support_agent` →
"Call Centre Agent") — one source of truth for role display strings across the whole privileged
surface, not a second copy invented here. `partnerOrganizationName` is always `null` from the
backend today (`invitations.ts:140`, explicitly flagged as out of scope) — the design **omits**
a partner-org row entirely rather than rendering "Partner organization: —", since a labeled blank
field reads as a bug, not a deliberate omission.

There is no "Decline" action. The backend has no decline/reject endpoint — only accept. A user who
doesn't want the account simply closes the tab; the token expires naturally per its TTL.

### 2.3 Error — terminal state

`GET /invitations/:token` collapses not-found / expired / revoked into a single `INVITATION_INVALID`
(backend deliberately avoids enumeration — scope note §3, confirmed at `invitations.ts:132-136`).
The design **must not** try to distinguish these client-side (there is no signal to distinguish
them with) — one error card, matching the backend's actual honesty about what it knows:

```
Card
  SectionHeading "This invitation link isn't valid"
  InlineAlert tone="danger"
    {mapUserFacingError(err, { context: 'invitation' })}
    → "This invitation link is not valid. Ask your administrator to send a new one."
  <p className="text-sm text-text-secondary">
    If you were expecting this invitation, contact your administrator to have a new one sent.
  </p>
```

No form, no retry button — retrying `GET` on the same dead token cannot succeed. This is a
deliberate **terminal** state (AC-4's "distinct, actionable error" is satisfied by the copy telling
the user exactly what to do next — ask for a new link — not by offering a dead-end retry).

---

## 3. Step 2 — Set password

Reached only after the user clicks "Accept invitation" in §2.2. `POST /invitations/:token/accept`
takes `{ password }` only — **no confirm-password field is required by the contract**, but the
design keeps a client-side confirm field anyway, because this is an irreversible, unrecoverable
action for a brand-new privileged account (a typo here is a support ticket, not a "click here to
reset" — see R-2 in the scope note: the password-reset half of this problem space is explicitly
out of scope / blocked elsewhere).

```
Card
  SectionHeading "Step 2 of 3: Set your password"
  <p className="text-sm text-text-secondary">
    {invitation.email} · {roleLabel}
  </p>

  InlineAlert tone="danger" (only if error)

  <form>
    Input label="Password" type="password" autoComplete="new-password" required
    Input label="Confirm password" type="password" autoComplete="new-password" required
    <Button type="submit" fullWidth loading={submitting}>Continue</Button>
  </form>
```

**Client-side validation** (before the network call, mirroring the backend's own privileged-account
rule at `isPasswordValidForUserType(password, 'privileged')` in `validation.ts` — the design copies
that rule's *intent*, not a guessed threshold): show an inline `Input` `error` if the two fields
don't match ("Passwords don't match"), and rely on the server's `VALIDATION_ERROR` response
("Some details look incorrect. Review the form and try again.") for the actual minimum-length rule
so the two never drift apart. On any 4xx other than the two explicitly handled below, that generic
`VALIDATION_ERROR` copy renders as an `InlineAlert` above the form, form stays populated (except
the password fields, cleared for the same reason login/MFA clear code fields on failure).

**Two error paths that terminate the flow instead of re-rendering this step:**
- `INVITATION_INVALID` (token disappeared between Step 1 and submit — e.g. someone else redeemed it
  meanwhile) and `INVITATION_EXPIRED` (410, or `status !== 'pending'`, per `invitations.ts:169-176`)
  both drop straight to the **same terminal error card as §2.3**, re-using its exact markup, not a
  new one — the backend's `mapUserFacingError` copy already differs correctly between the two codes
  ("not valid" vs. "expired or already used"), so the card's `InlineAlert` text changes but its
  shape doesn't.
- `UPSTREAM_UNAVAILABLE` (Supabase user creation/verification failed, `invitations.ts:191-196` /
  `219-221`) re-renders **this same step** with an `InlineAlert tone="danger"` reading "Our service
  is waking up. Wait a few seconds and try again." and the form fields preserved (not cleared) —
  this is a transient-retry case, not a dead token, so the user should not have to re-decide
  anything, just resubmit.

On success (`{ accountId, mfaEnrollmentRequired: true, enrollmentTicket }`), the client holds
`enrollmentTicket` in local component state only (R-4's known limitation — see §5) and advances to
Step 3. **No session exists yet** — nothing is written to the session/token storage this codebase
uses for authenticated state (SR-1: this endpoint never mints a session).

---

## 3.3 Step 3 — MFA enrollment

This is the step the parallel R-2 investigation bears directly on. Two backend calls happen here:
`POST /mfa/enroll { enrollmentTicket }` fires automatically on entering this step (no user action
needed to trigger it — same pattern as the mobile screen's `useEffect`), then the user submits a
6-digit code to `POST /mfa/enroll/verify`.

### 3.3.1 Enrollment load state

```
Card
  SectionHeading "Step 3 of 3: Set up two-factor authentication"
  <p className="text-sm text-text-secondary">Setting up…</p>
```
Brief — this is a same-request round trip, not a polling wait.

### 3.3.2 Enrollment ready — QR + manual key + code entry

```
Card
  SectionHeading "Step 3 of 3: Set up two-factor authentication"
  <p className="text-sm text-text-secondary">
    Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, or
    similar) if you don't already have one, then add this account.
  </p>

  ── Manual entry key: PRIMARY, not fallback ──
  <div className="rounded-lg border border-border bg-background-alt p-4">
    <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
      Setup key
    </p>
    <div className="mt-1 flex items-center justify-between gap-2">
      <code className="text-sm font-mono text-text-primary break-all">{manualEntryKey}</code>
      <Button variant="tertiary" size="sm" onClick={copyToClipboard}>Copy</Button>
    </div>
    <p className="mt-1 text-xs text-text-secondary">
      In your authenticator app, choose "enter a setup key manually" and paste this in.
    </p>
  </div>

  ── QR code: secondary, collapsible, best-effort ──
  <Accordion single title="Prefer to scan a QR code instead?">
    <div className="flex justify-center">
      <img
        alt="QR code for authenticator app setup — use the setup key above if this doesn't load"
        src={`data:image/svg+xml;base64,${btoa(qrCodeImage)}`}
      />
    </div>
    <p className="text-xs text-text-secondary">
      If scanning this device's own screen isn't possible (e.g. you're completing this on your
      phone), use the setup key above instead.
    </p>
  </Accordion>

  InlineAlert tone="danger" (only if verify error)

  <form>
    Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
      error={codeError}
    <Button type="submit" fullWidth loading={verifying}>Verify and finish</Button>
  </form>
```

**Design decisions this encodes, directly from the scope note and R-2:**

1. **Manual key is first-class, not fine print** (scope note R-3: "must be first-class
   (copy-to-clipboard), not fine print"). It is the first thing rendered after the instructional
   copy, in its own bordered block with a visible Copy button, *above* the QR. The QR is placed
   inside a collapsed `Accordion` (`src/components/Accordion`) by default — reusing an existing
   primitive rather than inventing a "show/hide" toggle, and making the QR opt-in rather than
   the default visual anchor of the screen. This directly inverts the mobile screen's hierarchy
   (QR large and centered at the top, manual key small text below it) because the mobile version
   is the one currently under investigation for being broken, and because R-3's wrong-device
   scenario (web flow opened on a phone, QR unusable on the same device as the authenticator app)
   is *more* likely on web than on the mobile-native original.
2. **Content-type fix, not a blind port.** The mobile bug (per the scope note and confirmed by
   reading `AcceptInvitationScreen.tsx:155` / `mfa-enroll.tsx:86`) is rendering
   `qrCodeImage` — which `mfa.ts:121` documents as an **SVG string** from GoTrue — as
   `data:image/png;base64,…`. This design specifies `data:image/svg+xml;base64,…` instead, per the
   actual field the backend sends (`enrollment.qrCodeSvg`, `mfa.ts:121`). This is a design-level
   correction so `frontend-engineer` doesn't copy the same bug into a second client — it is *not*
   a claim that this has been verified against a live enrollment (the code comment at `mfa.ts:116-
   120` is explicit that this is unverified against a real Supabase project); the `alt` text and
   the accordion's helper copy both exist specifically so a user who sees a broken/blank image has
   an immediate, visible next step (use the setup key) rather than a dead end.
3. **No new segmented-OTP component.** Mobile has `OtpInput` (`mobile/src/theme/primitives`); web
   has no equivalent, and `PrivilegedLoginPage`'s existing MFA-challenge step (§ line 91-104 of
   that file) already solves this exact problem with a single `Input inputMode="numeric"
   maxLength={6}`. This design reuses that established web pattern rather than requesting a new
   primitive from `design-system-manager` — consistent with the "reuse rate" success metric and
   with there being a *directly precedented* solution already in this codebase for the identical
   input type. If product later wants a segmented six-box UI to match mobile, that is a
   `design-system-manager`-routed request, not something to build ad hoc here.

### 3.3.3 Verify error states (re-render this same step, code field cleared)

| Backend code | Copy (`user-facing-errors.ts`, unchanged) | Additional UI |
|---|---|---|
| `MFA_CHALLENGE_INVALID` | "That code is incorrect. Open your authenticator app and enter the current 6-digit code." | `Input error` set on the code field itself (red border + inline icon), code field cleared and refocused. |
| `RATE_LIMITED` | "Too many attempts. Wait a few minutes, then try again." | `Button` disabled for a short cool-down; **do not** show a live countdown timer sourced from a `resetSeconds` field the client doesn't reliably have surfaced end-to-end — keep the copy as the single source of truth rather than inventing a number the UI can't guarantee is accurate. |
| `MFA_ENROLLMENT_NOT_FOUND` | "This setup session expired. Start sign-in again to set up two-factor authentication." | **Terminal**, not a re-render — see §5 (R-4). The pending-verification KV entry is gone (TTL'd out or already consumed); no retry on this screen can succeed. Render the same terminal-card shape as §2.3, with a single action: "Return to sign-in" (`Button variant="secondary"`, links to `/security/login` or `/admin/login` if role is known from earlier state, else a neutral privileged-login landing). |
| `ENROLLMENT_TICKET_INVALID` | "This setup session expired. Start sign-in again to set up two-factor authentication." | Same terminal treatment as above — this fires if the ticket was already redeemed or never valid (`mfa.ts:86-92`, `mfa.ts:196`). |
| `UPSTREAM_UNAVAILABLE` | "Our service is waking up. Wait a few seconds and try again." | Re-render this step, form preserved, retry the `POST /mfa/enroll/verify` call — transient, not terminal. |

---

## 4. Step 4 — Success

`POST /mfa/enroll/verify` success returns `{ accessToken, refreshToken, expiresIn, sessionId }`
directly (`mfa.ts:230`) — per the scope note, this **mints a session immediately**, no separate
login step. Design:

```
Card
  SectionHeading "You're all set"
  <p className="text-sm text-text-secondary">
    Two-factor authentication is enabled. Taking you to your dashboard…
  </p>
  <spinner row>
```

Store the returned tokens through the existing web session convention
(`src/dashboard/api/auth.ts` / `DashboardAuthProvider`, the same store `PrivilegedLoginPage` writes
to via `auth.signInWithTokens`), then redirect by `account.userType`/`decoded JWT user_type`:
`admin` → `/admin`, `security_company_operator` → `/security`, `support_agent` → its dashboard
route. This screen is intentionally brief and non-interactive (≤1s hold before redirect) — it exists
only so the transition isn't a jarring blank-then-dashboard flash, not as a step requiring input.

No recovery-code display is designed here: TOTP enrollment via GoTrue as implemented in
`mfa.ts`/`enrollTotpFactor` returns `qrCodeImage` + `manualEntryKey`, not a recovery-code set —
`business-requirements.md` §Scope lists "recovery-code display" as in-scope UX copy, but nothing in
the actual `mfa.ts` response shape provides recovery codes to display. Flagging this gap explicitly
rather than inventing a recovery-codes screen with no backend data to populate it:
**`authentication-engineer` should confirm whether recovery codes are a planned but unbuilt part of
the contract, or whether the business-requirements line should be corrected** — this design doc
does not fabricate a screen for data that doesn't exist.

---

## 5. Cross-cutting: R-4, the abandoned-flow risk

The scope note flags R-4 as "the highest-severity risk in the feature": if the tab is closed
between Step 2 success and Step 3 completion, the invitation is already `accepted` server-side and
the token is dead, but MFA was never enrolled. This design does not attempt a client-side fix (there
is none available purely in the UI layer) but makes the failure **visible and actionable** rather
than silent:

- The terminal card for `MFA_ENROLLMENT_NOT_FOUND` / `ENROLLMENT_TICKET_INVALID` (§3.3.3) is
  written generically enough to also cover this exact scenario — a user who abandoned and returns
  later gets the same "start sign-in again" copy and CTA, which is the correct instruction *if and
  only if* `authentication-engineer` confirms login re-issues an enrollment ticket for this account
  state (the open question the scope note raises). If that turns out to be false, the CTA copy and
  destination need to change before this ships — flagged for Stage 5 architecture review, not
  resolved here.
- No auto-save/resume mechanism (e.g. persisting `enrollmentTicket` to `localStorage`) is proposed:
  the ticket is a bearer credential for completing account setup: persisting it client-side across
  tab closes would trade a support-ticket-generating failure mode for a credential-left-lying-around
  security posture, which is a `cybersecurity-architect` call, not a default this design should make
  unilaterally. Flagged for Stage 8.

---

## 6. Accessibility (WCAG 2.1 AA checklist)

- All four steps keep the same `Card`/`SectionHeading`/`Input`/`Button` primitives, which already
  carry this codebase's existing contrast and focus-visible treatment (`Button`'s
  `focus-visible:ring-2 focus-visible:ring-accent-gold-deep`, `Input`'s `aria-invalid` +
  `aria-describedby` wiring) — no new contrast surface is introduced.
- QR code `<img>` has explicit `alt` text stating both what it is and what to do if it fails to
  render (§3.3.2) — never decorative/unlabeled, since it is the one genuinely fragile visual element
  in the flow (R-2).
- Setup-key block uses `<code>` with `break-all` so the 32+ character secret doesn't cause horizontal
  scroll on narrow viewports; Copy button has a visible focus ring via `Button`'s existing styles and
  should set `aria-live="polite"` feedback ("Copied") rather than a silent state change.
- Terminal error cards use a single `InlineAlert role="alert"` (existing component behavior) so
  screen readers announce the failure without requiring the user to discover it visually.
- Every `Input` in the flow keeps its visible `label` (no `hideLabel`) — password and code fields
  in a security-sensitive flow are exactly the case where an icon-only or placeholder-only field
  would fail AA and fail comprehension under stress.
- Tap targets: `Button` `size="md"`/`"lg"` and `Input` fields already meet the ≥44px target height
  used elsewhere in this codebase — no override needed.

---

## 7. Error-code coverage audit (AC-4)

Every error code `mfa.ts`/`invitations.ts` can actually emit on these three endpoints, and where it
surfaces:

| Code | Endpoint(s) | Where it renders |
|---|---|---|
| `INVITATION_INVALID` | `GET /invitations/:token`, `POST …/accept` | Terminal card, §2.3 |
| `INVITATION_EXPIRED` | `POST …/accept` | Terminal card, §2.3 (copy varies by code) |
| `VALIDATION_ERROR` | `POST …/accept` | Inline on Step 2, §3 |
| `UPSTREAM_UNAVAILABLE` | `POST …/accept`, `POST /mfa/enroll`, `POST /mfa/enroll/verify` | Inline retry on the step it occurred, §3 / §3.3.3 |
| `UNAUTHORIZED` | `POST /mfa/enroll` (no ticket present — shouldn't reach the client in normal flow) | Not user-reachable via this UI's own control flow; if hit, falls back to generic `VALIDATION_ERROR`-shaped inline error rather than a dedicated design, since it indicates a client bug, not a user-recoverable state |
| `ENROLLMENT_TICKET_INVALID` | `POST /mfa/enroll`, `POST /mfa/enroll/verify` | Terminal card, §3.3.3 |
| `MFA_ENROLLMENT_NOT_FOUND` | `POST /mfa/enroll/verify` | Terminal card, §3.3.3 |
| `MFA_CHALLENGE_INVALID` | `POST /mfa/enroll/verify` | Inline on Step 3, §3.3.3 |
| `RATE_LIMITED` | `POST /mfa/enroll/verify` | Inline on Step 3 with cool-down, §3.3.3 |

No hypothetical codes (e.g. a speculative "TOKEN_ALREADY_USED" distinct from `INVITATION_EXPIRED`)
are designed for — only what the route code in this repo actually returns.

---

## 8. Open items for downstream stages

1. **C-1 (blocking, `cloud-infrastructure-architect`/backend config owner):** this design assumes
   `INVITATION_ACCEPT_REDIRECT_URL` is repointed from `tditinsurance://invitations/accept` to this
   route's web URL. Until that config changes, no real invitation email will ever reach this screen.
2. **Recovery codes (§4):** business-requirements.md names them; `mfa.ts`'s actual response shape
   doesn't provide them. Needs `authentication-engineer` clarification before Stage 9 build.
3. **R-4 resume behavior (§5):** needs `authentication-engineer` confirmation that login re-issues
   an enrollment ticket for an accepted-but-unenrolled account, or this design's terminal-state CTA
   is wrong and the risk is worse than "annoying" — it's "permanently bricked," per the scope note.
4. **QR content-type fix (§3.3.2):** specified here as `image/svg+xml`, unverified against a live
   Supabase project per the standing open item — `frontend-engineer` should confirm against a real
   enrollment response before shipping, not trust this doc or the mobile precedent blindly.
