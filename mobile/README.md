# TD IT Solution Insurance — Customer Mobile App

Expo (React Native) + TypeScript, per [ADR-0001](../docs/organization/adr/0001-baseline-architecture.md)
and [Feature 003's architecture document](../docs/features/003-mobile-app-foundation/architecture.md)
(the actual work order for everything in this directory — read that first
if something here seems undermotivated).

This README follows the same honesty standard as [`backend/README.md`](../backend/README.md):
it says plainly what's built, what's stubbed, and what's blocked. Don't
assume a capability exists here just because a file with a promising name
exists — check the sections below.

## What this is (and isn't) — one paragraph

This is the auth-integrated app shell **plus Feature 004 Phase 1 customer screens**: real
signup/login/forgot-password/logout/MFA wired to Feature 001's Identity Service API; real token
handling (SecureStore, device-binding, auto-refresh); and **real Policy/Assets tabs** wired to
Feature 004's customer API (`POST/GET /policies`, `POST/GET /assets`). It is not store-ready:
Wave 2 gates (Stage 8, Stage 10 E2E), Brevo email delivery, and app-store provisioning remain open.

---

## What's built

### App shell & navigation
- **Expo Router**, file-based, with route groups gating on auth state:
  - `app/(auth)/*` — welcome, signup, verify-pending, login, mfa-challenge,
    forgot-password, reset-password, terms, privacy (unauthenticated).
  - `app/(app)/*` — tab navigator (Home, Policy, Assets, Profile) plus
    `policy/*` and `assets/*` stacks (list, create/register, detail),
    non-tab `mfa-enroll`, and Phase 2 placeholders (`report-theft`,
    `claims`, `live-tracking`) linked from Home.
  - `app/verify-email.tsx`, `app/invitations/accept.tsx`, and
    `app/verification-gate.tsx` sit outside both groups — reachable via deep
    links or pushed as modals (email verification, staff invitation, BR-2 gate).
  - Gating is done via `expo-router`'s `Stack.Protected` in `app/_layout.tsx`,
    keyed off `src/auth/session-store.ts`'s `status` (`hydrating` /
    `signed-out` / `signed-in`).
- Every screen implements a specific, numbered section of
  [`ui-design.md`](../docs/features/001-authentication/ui-design.md) §4.1–§4.3,
  §4.7, §4.8 — the file header comment on each screen names which one.

### Auth & token handling (architecture.md §2/§3)
- `src/auth/secure-storage.ts` — the **only** place that touches
  `expo-secure-store`. Holds the refresh token and the FR-20 device ID.
  Never AsyncStorage, never plain state.
- `src/auth/session-store.ts` — Zustand store holding the access token
  **in memory only** (never persisted — a 10-minute-TTL token gains
  nothing from disk persistence and is one more thing that could leak).
- `src/auth/device.ts` — locally-generated UUID v4 device ID (via
  `expo-crypto`), persisted once at first launch; **deliberately not** a
  hardware identifier (see file header for the reasoning — sidesteps
  ATT/Advertising-ID policy surface entirely).
- `src/api/client.ts` — the fetch wrapper: attaches the bearer token,
  single-flight refresh-on-401-then-retry-once, forces a full local logout
  on a 423 (suspended) or an invalid/revoked refresh token, and clears
  local session state **immediately, client-side** regardless of network
  reachability on explicit logout. Every `POST /session/refresh` call also
  sends the FR-20 `deviceId` from `src/auth/device.ts` (api-design.md
  v1.1.0 §11 Amendment C) — a device-mismatch comes back as an
  indistinguishable-from-reuse 401, handled by the same forced-logout path
  as any other invalid/revoked refresh token.
- **Honest gap, flagged in code** (`src/api/client.ts`'s file header):
  `api-design.md`'s published contract doesn't yet enumerate a specific
  error `code` for a plain expired-access-token 401 on a generic
  authenticated endpoint (only `/session/refresh`'s own 401 codes are
  documented). This client currently treats *any* 401 from an
  authenticated request as "try a refresh" — safe, but not the fully
  code-driven disambiguation architecture.md §2.4 describes as the target
  state. Revisit once `backend-architect`/`authentication-engineer`
  publish that code.
- **Device-binding fields, both now ratified (api-design.md v1.1.0 §11
  Amendment C, 2026-08-11)**: `src/auth/device.ts`'s `getOrCreateDeviceId()`
  is the single source of the locally-generated `deviceId` — sent on both
  `POST /auth/login` (`src/api/auth.ts`'s `login()`) and, as of this pass,
  every `POST /session/refresh` call (`src/api/client.ts`'s
  `refreshAccessToken()`). `deviceName` is sent alongside `deviceId` on
  login only. Previously, `refreshAccessToken()` omitted `deviceId`
  entirely — an oversight from before `device.ts` existed — which meant
  the backend's device-mismatch chokepoint (rejecting a refresh presented
  from an unexpected device, ahead of ordinary rotation-reuse detection)
  never actually engaged for this client. Fixed; covered by
  `src/api/__tests__/client.test.ts`'s "includes the locally-generated
  deviceId on every /session/refresh request" case.

### Feature 004 — Policy & Assets (Phase 1 customer surface)

Implemented against [`004/api-design.md`](../docs/features/004-policy-asset-management/api-design.md)
§6.1/§6.2 and [`business-requirements.md`](../docs/features/004-policy-asset-management/business-requirements.md)
AC-1–AC-8. **No plan-picker, no pricing, no photos** (MP-3/MP-5).

- `openapi/policy-asset-service.yaml` + `npm run generate:api-types` →
  `src/api/generated/policy-asset-service.ts`
- `src/api/policies.ts`, `src/api/assets.ts`, `src/api/idempotency.ts` — customer API client
- `src/api/hooks/usePolicies.ts`, `useAssets.ts` — TanStack Query hooks with cursor pagination
- Screens: `src/screens/policy/*` (list, create, detail), `src/screens/assets/*` (list,
  register, detail); routes under `app/(app)/policy/` and `app/(app)/assets/`
- **`POST` writes require `Idempotency-Key`** (UUID v4) — sent automatically by the API client
- **`planTier` is free-form** — create-policy UI accepts a string, not a closed tier enum (P-01)
- **`coverageLimits` is always `[]` on create** — UI must not imply paid coverage when
  `billing.billingStatus` is `not_configured`
- **403 `ACCOUNT_NOT_ACTIVE`** on writes when account is not verified/active (live-checked)
- **`src/auth/gateWriteAction.ts`** — live `GET /account/me` before write CTAs (BR-2)
- Home screen shows policy/asset counts from the same queries (display cache only)

**Backend dependency (honest):** `backend/src/routes/` has **no** `policies.ts` / `assets.ts`
yet — the mobile client is ready; integration completes when these endpoints exist:

| Method | Path | Mobile consumer |
|--------|------|-----------------|
| `GET` | `/api/v1/policies` | Policy tab list, home count |
| `GET` | `/api/v1/policies/{policyId}` | Policy detail |
| `POST` | `/api/v1/policies` | Create policy (`Idempotency-Key` required) |
| `GET` | `/api/v1/assets` | Assets tab list, home count |
| `GET` | `/api/v1/assets/{assetId}` | Asset detail |
| `POST` | `/api/v1/assets` | Register asset (`Idempotency-Key` required) |

All calls use `EXPO_PUBLIC_API_BASE_URL` + `/api/v1` only — never MongoDB/Supabase from the app.

### State management & offline posture (architecture.md §4/§5)
- **TanStack Query** (`src/query/queryClient.ts`) for server state, with
  on-device cache persistence via `@tanstack/query-async-storage-persister`
  (AsyncStorage-backed) wired in at `app/_layout.tsx` via
  `PersistQueryClientProvider` — includes policy/asset queries, not only `GET /account/me`.
- **`GET /account/me` gating rule, enforced in code, not just documented**:
  `src/auth/useAccountQuery.ts` exports two different things on purpose —
  `useAccountQuery()` (cached, **display only**) and
  `fetchLiveAccountForGating()` (always a fresh network call, **never**
  cache-backed). `app/(app)/index.tsx` uses the former for the welcome
  banner; policy/asset write paths use `fetchLiveAccountForGating()` before
  navigating to create/register screens. Do not add a second gating call site
  that reads from the persisted cache — that would silently reopen the
  staleness hole `architecture-review.md`'s D-2 spent real effort closing.
- **Connectivity plumbing**: `src/network/NetworkProvider.tsx` wires
  `@react-native-community/netinfo` into TanStack Query's `onlineManager`
  (so paused-mutation/query behavior works for free) and exposes a global,
  non-dismissible `OfflineBanner`.
- **Resilient signup draft**: `src/forms/signupDraft.ts` persists the
  in-progress email + consent checkbox (AsyncStorage) so a connectivity
  drop mid-signup doesn't destroy what the user typed. The password field
  is deliberately never persisted (see file header).
- **Logout retry posture**: on logout, local session is cleared
  synchronously; the server-side revocation call is fire-and-forget
  best-effort (`app/(app)/profile.tsx`). If it never lands, the session
  naturally expires within the ≤10-minute access-token ceiling — an
  accepted, bounded residual per architecture.md §2.6, not a Phase-2
  offline-mutation-queue (that infrastructure doesn't exist and isn't
  needed for this one fire-and-forget call).

### Design-system bridge (architecture.md §1.5)
- `src/theme/tokens.ts` and `src/theme/primitives/*` are an **explicitly
  temporary** RN port of `src/components/*`'s web design system — every
  file carries a header comment saying so. Ported: `Button`, `Input`,
  `Card`, `Screen` (full-bleed mobile surface, no `Card` wrapper, per
  `ui-design.md` §1). Also implemented, beyond that named list, because
  the screens in scope require them and no web equivalent exists yet
  either: `Alert` and `OtpInput` (both specified in
  [`design-system-additions.md`](../docs/features/001-authentication/design-system-additions.md)
  §1/§2 — this mobile build implements that spec's prop contract, it
  doesn't invent a new one) and `Badge` (extended with `warning`/`danger`
  tones per that same document's §3, for the account-state chip on the
  Profile screen).
- **What doesn't port cleanly, flagged rather than guessed at:**
  - The web app's brand fonts (`Fraunces` / `Public Sans`, via
    `tailwind.config.js`) are not loaded natively — no `expo-font` step
    exists yet. Mobile screens currently render in the OS system font.
    Flagged in `src/theme/tokens.ts`'s `typography.fontFamily` — loading
    the same fonts via `expo-font`/`@expo-google-fonts` is a
    `design-system-manager` + `mobile-engineer` follow-up.
  - Web's `Card` component has an `interactive` hover/press treatment
    (translate + shadow lift on hover) that has no real RN equivalent
    (no hover on touch devices) — the RN `Card` primitive is intentionally
    just a static bounded surface.
  - `ArrowLink`'s "arrow slides on hover" micro-interaction likewise has
    no touch-device equivalent; mobile screens use plain `Pressable` text
    links instead of porting that component at all.
  - Token *values* (hex colors, radii) are manually mirrored from
    `src/index.css` / `tailwind.config.js`, documented inline with the
    date mirrored and the exact source — not independently invented. See
    `src/theme/tokens.ts`'s header for the full "replace this wholesale
    once `design-system-manager` ships the RN token package" instruction.
  - No cross-surface consistency audit has been run (design-system-additions.md's
    own checklist names this as a required follow-up once these
    components exist on more than one surface) — this mobile build is
    that first surface for `Alert`/`OtpInput`.

### Tests
- Jest + `jest-expo` + `@testing-library/react-native`.
- `src/api/__tests__/client.test.ts` — the load-bearing one: covers
  bearer-token attachment, refresh-then-retry-once on a 401, single-flight
  concurrent refresh, forced-logout-on-423 (including the "don't fire the
  navigation side effect on a cold-boot no-session case" nuance), and that
  every `/session/refresh` request body includes the FR-20 `deviceId`.
- `src/auth/__tests__/` — session store transitions, device-ID
  generate-once-then-reuse behavior.
- `src/theme/primitives/__tests__/` — `Button` press/disabled/loading
  states, `OtpInput` digit-filtering/length-truncation/auto-complete.
- `src/api/__tests__/policy-asset.test.ts` — Feature 004 client paths,
  Idempotency-Key on POST, no client-supplied `accountId`.
- `src/screens/__tests__/PolicyListScreen.test.tsx` — empty vs populated list states.
- Run: `npm test` (or `npm run test:watch`).
- **Not covered yet:** full create/register form flows, E2E, device matrix —
  `qa-architect`/`automation-qa-engineer` deliverable per architecture.md §1.7.

---

## What's stubbed / placeholder (built, but not final)

- **App icons and splash** — generated from `public/logo.png` into `assets/` via
  `npm run generate-icons` (full wordmark on white square; re-run after logo updates).
  Android adaptive layers and favicon included. Store review may still want a
  glyph-only variant if the wordmark is hard to read at small sizes.
- **Bundle identifiers** (`co.za.tditsolutions.insurance` in `app.json`)
  are a placeholder guess for this pass, not a ratified value — confirm
  with whoever owns App Store Connect / Play Console provisioning before
  a real store submission.
- **`eas.json`** has development/preview/production profiles; preview and
  production API URLs are **not** in the file — set `EXPO_PUBLIC_API_BASE_URL`
  in EAS per environment (see [`docs/DEPLOY.md`](docs/DEPLOY.md)). GitHub
  Actions CI for EAS (M-08) is still open.
- **Home screen information architecture** (`app/(app)/_layout.tsx`'s tab
  layout, `app/(app)/index.tsx`'s composition) is an architecture-level
  scaffold, explicitly **not** a `ux-researcher`/`ui-designer`-approved
  design — architecture.md's own M-03 names this as a still-needed,
  lightweight Stage 3/4 pass before this shell is finalized beyond the
  literal auth screens.
- **Biometric app-unlock** (Face ID/Touch ID as a local relaunch gate,
  architecture.md §3.3) is not implemented — explicitly deferred, open
  decision owned by `authentication-engineer`/`cybersecurity-architect`
  (M-06).

---

## What's blocked (not built, and correctly so)

- **End-to-end on a real device with a new account** — auth email (signup verification, password reset, staff invitations) is triggered by Supabase Auth and delivered via the **`auth-send-email` Edge Function** with branded templates (`supabase/README.md`). Enable the Send Email Hook in Supabase Dashboard, set Edge Function secrets (`SEND_EMAIL_HOOK_SECRET`, `EMAIL_FROM`, `RESEND_API_KEY` or `BREVO_API_KEY`), and allowlist redirect URLs (`tditinsurance://verify-email`, `tditinsurance://reset-password`, `tditinsurance://invitations/accept`). After verifying email, log in once so the backend syncs `app.accounts` to `active`.
- **Feature 004 Stage 8** — sign-off granted with required changes tracked
  (SR-004-1…5); see `docs/features/004-policy-asset-management/security-review.md`.
- **Stage 10 E2E** — Maestro scaffold at `mobile/e2e/`; execution blocked on Brevo
  or a test bypass. Manual QA checklist filed, not yet executed on device.
- **Admin policy/asset views** — MP-1 excludes `/admin/policies*` and
  `/admin/assets*` from this push; mobile only needs customer endpoints.
- **Push notifications** — no `notification-engineer` payload contract
  exists yet; not integrated. Expo Router's file-based routes are chosen
  partly *in anticipation* of this (a deep-link target maps directly onto
  a route path) but no contract exists to build the actual integration
  against.
- **GPS / live map / theft-report flows** — Phase 2 scope per
  `08-roadmap.md`, not touched here.
- **Kill-switch / remote feature flag** (architecture.md §6, M-07) — not
  built; named as a Phase 2 planning item with `backend-architect`.
- **Security/architecture sign-off is still pending**, independent of
  anything code-quality-related:
  - **M-02**: `authentication-engineer` + `cybersecurity-architect` have
    not yet reviewed §2.3/§3's token-storage and device-binding design.
    This build implements that design; it does not certify it.
  - **M-01**: the `deviceName` (login) and `deviceId` (refresh,
    device-mismatch detection) contract additions are now ratified
    (api-design.md v1.1.0 §11 Amendment C) and, as of this pass, both are
    correctly sent by this client. `authentication-engineer`/
    `cybersecurity-architect` sign-off on the underlying device-binding
    design (M-02, below) is still separate and still open.
  - **ADR-0005** (backend-minted session-token contract) is
    design-resolved but not yet formally ratified by `solution-architect`
    + `cto`.
  - Feature 001's own Stage 8 Security Review and Stage 9 Development
    entry conditions (FU-07's live Supabase-behavior verification, FU-15's
    ADR-0002 follow-ups) are Feature 001's to close, not something this
    mobile build can borrow or self-certify.

---

## Known, non-blocking tooling finding

`npx expo-doctor` flags a duplicate `react` version (this app's own
`react@19.2.3` vs. the repo root web app's `react@19.2.0`, found by
scanning parent directories). This is expected and benign for this
repo's layout — `mobile/` is a fully independent deployable with its own
`node_modules` and lockfile (same pattern as `backend/`), so Metro
resolves `react` from `mobile/node_modules` first and never reaches the
root copy. Not a real defect; not fixed by "deduplicating" across two
genuinely separate apps that happen to share a parent directory.

---

## Setup

```bash
cd mobile
npm install
cp .env.example .env
# edit .env — EXPO_PUBLIC_API_BASE_URL should point at your locally
# running backend (see ../backend/README.md), or the deployed Render
# staging URL.
```

**Android emulator note:** `localhost` from inside the emulator refers to
the emulator itself, not your host machine. Use `http://10.0.2.2:3000`
instead of `http://localhost:3000` in `.env` when testing against a
locally-run backend from an Android emulator (not needed for iOS
simulator, or for a physical device on the same network — use your host
machine's LAN IP for a physical device either way).

## Run

```bash
npm start          # Expo dev server — scan the QR with Expo Go, or press i/a
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run web        # Expo web (auth screens only render meaningfully here;
                    # this app's actual target is iOS/Android)
```

**Expo Go is sufficient for this build.** Nothing in this pass's scope
requires a custom dev client — every native module used
(`expo-secure-store`, `expo-crypto`, `expo-device`,
`react-native-gesture-handler`, `react-native-reanimated`,
`react-native-screens`, `@react-native-async-storage/async-storage`,
`@react-native-community/netinfo`) ships in Expo Go's managed-workflow
SDK. Revisit this the moment GPS/location or another hardware-SDK-backed
module (Phase 2) requires a custom dev client, per architecture.md §1.1's
own re-evaluation trigger.

## Quality checks

```bash
npm run typecheck   # tsc --noEmit, strict mode + noUncheckedIndexedAccess
npm run lint        # eslint (eslint-config-expo flat config)
npm test            # jest
```

All three are currently green on this codebase. CI wiring for these
(GitHub Actions) is `devops-engineer`'s deliverable (M-08), not set up in
this pass.

## Deployment (EAS)

Real builds (TestFlight, Play internal, App Store) use **EAS Build**, not
Expo Go or tunnels. Full steps, env-var strategy, and store prerequisites:
[`docs/DEPLOY.md`](docs/DEPLOY.md).

Quick reference:

```bash
eas login
eas init                    # once — links expo.dev project
eas env:create ...          # set EXPO_PUBLIC_API_BASE_URL per environment
eas build --profile preview --platform all
```

## Regenerating API types after a contract change

If Feature 001 §7 or Feature 004 §6 OpenAPI contracts change:

1. Re-copy the updated YAML into `mobile/openapi/identity-service.yaml` and/or
   `mobile/openapi/policy-asset-service.yaml`.
2. `npm run generate:api-types`
3. Fix typecheck failures in `src/api/auth.ts`, `policies.ts`, `assets.ts`.

---

## Directory guide

```
mobile/
  app.json, eas.json          Expo config; EAS build profiles (scaffold, see above)
  openapi/identity-service.yaml   Copy of api-design.md §7 — source for codegen
  openapi/policy-asset-service.yaml   Feature 004 §6 — second codegen target
  app/                         Expo Router routes (see "App shell" above)
  src/
    api/                       client.ts, auth.ts, policies.ts, assets.ts,
                                generated/ (identity + policy-asset codegen)
    auth/                      secure-storage.ts, session-store.ts, device.ts,
                                useAccountQuery.ts (display vs. live-gating split)
    forms/                     signupDraft.ts (resilient-form-UX, not offline queue)
    network/                   NetworkProvider.tsx (NetInfo + onlineManager + OfflineBanner)
    query/                     queryClient.ts (TanStack Query + persister)
    screens/                   policy/*, assets/* (Feature 004); BlockedFeaturePlaceholder (legacy)
    theme/                     tokens.ts + primitives/ — TEMPORARY design-system bridge
```
