# Feature 017 — Privileged Account Self-Service (Web): Scope Note

- **Stage:** 1 — Architecture Scoping
- **Author:** `software-architect`
- **Date:** 2026-09-23
- **Status:** Draft for Stage 2 (product-manager) / Stage 3 (ui-designer) pickup
- **Priority:** P1 (CTO-authorized)

## 1. Problem

Privileged accounts (`admin`, `security_company_operator`, `support_agent` — see
`backend/src/lib/policy.ts` `PRIVILEGED_USER_TYPES`) work on the **web** dashboards
(`src/admin/`, `src/security/`), but the only client that can create or onboard one is the
**mobile** app (`mobile/src/screens/invitations/AcceptInvitationScreen.tsx`). Grepping `src/`
for "invitation" returns only error-copy strings (`src/lib/user-facing-errors.ts` already
carries `INVITATION_INVALID` / `INVITATION_EXPIRED` and an `'invitation'` context) — no page,
no API module, no send UI. There is therefore **no path today to onboard a privileged user
who does not install the customer mobile app.**

## 2. Backend contract — verified surface-agnostic (with two caveats)

Read in full: `backend/src/routes/invitations.ts`, `backend/src/routes/mfa.ts`.

Confirmed: the three endpoints a web client needs carry **no mobile-specific logic**.
`GET /v1/invitations/:token` and `POST /v1/invitations/:token/accept` are public,
opaque-token, JSON-only. `POST /v1/mfa/enroll` resolves its principal from the server-issued
`enrollmentTicket` or a bearer token and explicitly never from the body.
`POST /v1/mfa/enroll/verify` mints the session and already picks the right surface —
`surfaceFor()` in `mfa.ts:37` maps privileged user types to `'privilegedWeb'`, which is
itself evidence the contract was designed with a web client in mind. Both mutating calls
require an `Idempotency-Key` header; `src/customer/api/idempotency.ts` already supplies one
and is reusable. **No backend route changes are required for the accept/enroll flow.**

Caveats (not route code, but backend-owned):

- **C-1 (config, blocking):** `INVITATION_ACCEPT_REDIRECT_URL` is
  `tditinsurance://invitations/accept` in `render.yaml:43`, `render-staging.yaml:51` and the
  default at `backend/src/config/env.ts:311`. Every invitation email therefore deep-links to
  the **mobile app**. It is a single-valued env var, so it cannot serve both surfaces. Since
  privileged accounts are web accounts, this must be repointed to the new web URL — a config
  change plus an explicit decision on whether the mobile accept screen is retired or kept as
  a dead code path.
- **C-2 (missing endpoint, blocking for the *send* half only):** see §5, R-1.

## 3. Flow to mirror (from the mobile reference)

1. On mount, `GET /invitations/:token` → render invitee email + userType, or an "invitation
   unavailable" terminal state on any error (mobile does not distinguish 404 reasons — correct,
   the backend deliberately collapses not-found/expired/revoked to avoid enumeration).
2. Password + confirm, client-side min-length check, then
   `POST /invitations/:token/accept` → `{ accountId, mfaEnrollmentRequired, enrollmentTicket }`.
   **No session is minted here** (SR-1). HTTP 410 → terminal invalid state.
3. Immediately `POST /mfa/enroll { enrollmentTicket }` → `{ qrCodeImage, manualEntryKey,
   enrollmentId }`. Render QR + manual key fallback.
4. `POST /mfa/enroll/verify { enrollmentId, code }` → **this** returns
   `{ accessToken, refreshToken, expiresIn, sessionId }`. Store per the existing web session
   convention (`src/dashboard/api/auth.ts`), then redirect by `userType`:
   `admin` → `/admin`, `security_company_operator` → `/security`, `support_agent` → its
   dashboard. MFA is mandatory and un-skippable — there is no exit from step 3/4 to a session.

## 4. Who can send an invitation today

`POST /v1/invitations` is admin-only (`requireUserType('admin')`), rate-limited, idempotent,
**and requires step-up MFA**: the current session's `mfa_verified_at` must be ≤
`INVITATION_ISSUANCE_STEP_UP_WINDOW_SECONDS` (15 min) old, read live from `app.sessions`,
else `STEP_UP_REQUIRED`. **Nothing in the repo calls this endpoint** — no web UI, no mobile
screen, no script (`backend/scripts/seed-test-accounts.ts` creates accounts directly, it does
not invite). Invitations today can only be issued by hand-crafting an authenticated API call.

## 5. Scope boundary — one feature, two deliverables

Recommend **one feature, two independently shippable deliverables**, because they share the
invitation domain model, error copy, and the same backend contract, but have different auth
postures and different owners downstream:

- **D-1 — Accept + enroll (public, unauthenticated).** New top-level route
  **`/invitations/accept?token=…`** — query-param token, *not* a path param. Rationale: it
  mirrors the URL the backend already constructs at `invitations.ts:85`
  (`${redirect}?token=…`), so only the base URL changes in config (C-1); a path-param route
  would require a backend string change too. Must live **outside `/admin/*` and `/security/*`**
  and outside any authenticated route guard — the user has no account until step 2 completes.
  Suggested location: `src/invitations/` + `src/api/invitations.ts`, mirroring
  `mobile/src/api/invitations.ts`.
- **D-2 — Send invitation (admin-only).** Inside the existing admin dashboard,
  **`/admin/accounts/invite`** (or a modal on the existing accounts list), gated on
  `userType === 'admin'`.

D-1 is the critical path and should ship first: it unblocks onboarding for any invitation
issued by hand. D-2 is blocked on R-1 below.

## 6. Risks and complexity

- **R-1 (blocking for D-2) — there is no step-up re-verification endpoint.**
  `mfa_verified_at` is only ever set at login MFA challenge (`auth.ts:707`) and at enrollment
  verify (`mfa.ts:215`); `session/refresh` *copies* the original timestamp forward
  (`lib/refresh-session.ts:237`) rather than renewing it. There is no `POST /auth/mfa/step-up`
  route. So an admin whose session is more than 15 minutes old **cannot issue an invitation at
  all**, and has no way to re-verify short of a full logout/login. D-2 therefore needs either
  (a) a new backend step-up endpoint (`backend-architect` + `cybersecurity-architect`, since it
  touches the SR-11 control), or (b) an explicitly ugly UX that catches `STEP_UP_REQUIRED` and
  forces re-login. This contradicts the "zero backend changes" read and should be decided
  before D-2 enters design.
- **R-2 — `qrCodeImage` is SVG, not base64 PNG.** `mfa.ts:115-124` says so in a standing
  comment: GoTrue returns `totp.qr_code` as an **SVG**. The mobile screen renders it as
  `data:image/png;base64,…` (`AcceptInvitationScreen.tsx:155`) — i.e. the reference
  implementation is very likely broken on this line and has never been exercised against a
  live enrollment. The web version must not copy it. Treat the manual-entry key as the
  guaranteed path and the QR as best-effort until verified end-to-end.
- **R-3 — wrong-device / wrong-surface link opening.** Once C-1 repoints the redirect to web,
  an invitee opening the link on a phone gets the web flow in a mobile browser — acceptable,
  but the enrollment QR is then on the same device as the authenticator app and cannot be
  scanned. The manual-entry key is the required fallback and must be first-class
  (copy-to-clipboard), not fine print. Conversely, any invitation emailed *before* the config
  change still points at `tditinsurance://` and will dead-end for a web-only user.
- **R-4 — non-resumable flow.** The `enrollmentTicket` is held only in React state. If the
  invitee closes the tab between accept and verify, the invitation is already marked
  `accepted` (`markAccepted`, `invitations.ts:208`) and the token is dead, but MFA is not
  enrolled. They cannot re-accept and cannot log in (login will hit the SR-14 force-
  re-enrollment branch). Needs a confirmed answer from `authentication-engineer` that login
  re-issues an enrollment ticket for this state; if it does not, this is a
  permanently-bricked-account path and the highest-severity risk in the feature.
- **R-5 — no route-level test coverage.** There is no `backend/src/routes/invitations.test.ts`.
  Before a second client is built against these endpoints, `qa-architect` should confirm what
  coverage exists (the flow is exercised indirectly in `auth.test.ts` at most).
- **R-6 — `POST /invitations/:token/accept` has no rate limiter**, only idempotency and the
  opaque 256-bit token. Probably acceptable given token entropy; flag to
  `cybersecurity-architect` for an explicit ruling at Stage 8 rather than leaving it implicit.
- **R-7 — `partnerOrganizationName` is hardcoded `null`** (`invitations.ts:140`), and D-2
  must supply a `partnerOrganizationId` for `security_company_operator` invitations. The web
  send form therefore needs a partner-org picker, which needs a partner-org list endpoint —
  confirm one exists before D-2 design, or the form cannot be built.

## 7. Next stages

Stage 2 `product-manager` (business requirements, D-1 vs D-2 sequencing) → Stage 3
`ux-researcher`/`ui-designer` (reuse `src/components/*`; `design-system-manager` sign-off on
any new primitive such as the OTP input, which exists on mobile but may not on web) →
Stage 8 `cybersecurity-architect` is a hard gate here (R-1, R-4, R-6 all land on it).
Decisions needed before Stage 4: C-1 (redirect URL ownership), R-1 (step-up endpoint),
R-4 (abandoned-enrollment recovery).
