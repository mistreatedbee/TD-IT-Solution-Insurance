# Feature 003 — Customer Mobile App Foundation

## Architecture Foundation (Stage 5 — Architecture Review equivalent)

**Lifecycle stage:** 5 — Architecture Review, for a narrower slice than the stage normally covers (see §0).
**Author:** `mobile-architect`
**Status:** Draft — submitted for `solution-architect` review. Not yet ratified. No code exists yet under a `mobile/` directory; this document is the design that would produce it.
**Date:** 2026-08-08
**Governing ADRs:** [ADR-0001](../../organization/adr/0001-baseline-architecture.md) (Expo React Native + TypeScript baseline, Accepted), [ADR-0002](../../organization/adr/0002-polyglot-persistence-identity-vs-domain-data.md) (Supabase-for-identity / mediation principle, Accepted), [ADR-0003](../../organization/adr/0003-backend-hosting-platform.md) (Render backend host, Accepted) — no deviation from any of the three is proposed here.
**Reads on (read in full to produce this document):** [`business-requirements.md`](../001-authentication/business-requirements.md), [`ux-research.md`](../001-authentication/ux-research.md), [`ui-design.md`](../001-authentication/ui-design.md), [`architecture/backend-approach.md`](../001-authentication/architecture/backend-approach.md), [`architecture-review.md`](../001-authentication/architecture-review.md), [`api-design.md`](../001-authentication/api-design.md), [`secrets-management-plan.md`](../001-authentication/secrets-management-plan.md), [`02-feature-lifecycle.md`](../../organization/02-feature-lifecycle.md), [`00-org-chart.md`](../../organization/00-org-chart.md), [`01-raci-matrix.md`](../../organization/01-raci-matrix.md), [`05-development-standards.md`](../../organization/05-development-standards.md), `.claude/agents/design-system-manager.md`.
**This document discharges:** `architecture-review.md`'s **FU-09** ("FR-20 mobile device-binding architectural review — owner `mobile-architect`, due Stage 7 exit"). FU-09 was open at Stage 5/7 of Feature 001 because no `mobile-architect` artifact existed. §3 below is that review, delivered late against Feature 001's own deadline (Stage 7 has already produced `api-design.md` without it) but delivered before any mobile code is written, which is the point that actually matters here.
**Related:** Phase 1 roadmap scope (`08-roadmap.md`): "Customer Mobile App (Expo): register, view policy, view assets."

---

## 0. What This Document Is, and an Honest Process Note

The 15-stage lifecycle (`02-feature-lifecycle.md`) puts Architecture Review at Stage 5, after Business Requirements (1), Product Planning (2), UX Research (3), and UI Design (4) have run **for the feature under review**. This document does not pretend those four stages ran as a discrete "Feature 003" track — they didn't. What actually exists, split honestly by what it covers:

- **The customer-facing auth screens the mobile app needs (signup, login, forgot-password, logout, the BR-2 verification-gate block) already have Stage 1–4 artifacts** — they were produced as part of Feature 001, not Feature 003, because Feature 001's scope always named "Customer Mobile App" as one of three client surfaces (`business-requirements.md` §2). Concretely: `business-requirements.md` FR-1–FR-25 and BR-1–BR-7 (Stage 1), `ux-research.md` §1.1–§1.3/§1.7/§1.8 (Stage 3), and `ui-design.md` §4.1 (signup→verify→first login), §4.2 (login + optional MFA), §4.3 (forgot password), §4.7 (logout), §4.8 (BR-2 gate block) (Stage 4) are all written explicitly against "Mobile App" as the target surface. These are composition-level specs (which shared-design-system component, which states, which copy, which error/lockout behavior) rather than platform-specific pixel mockups, which is exactly the right altitude for a design system that is supposed to have one source of truth across web and mobile (see §1.4). **This document treats those as its Stage 1–4 input for the auth-integrated app shell** — it does not re-derive them, and does not second-guess `ui-designer`'s screen composition.
- **The mobile app's own information architecture (navigation shape, tab structure, what the authenticated home screen looks like, empty-state design) has no Stage 1–4 artifact at all.** No `ux-researcher`/`ui-designer` work has been done specifically on "what does the Customer Mobile App's shell feel like as a whole app," as opposed to "what does the signup flow feel like." §1.3 below proposes a structure sufficient to build the auth shell now, but it is an architecture-level scaffold, not a UX-researched-and-approved information architecture. **Recommendation, not yet actioned:** `ux-researcher`/`ui-designer` should run a lightweight Stage 3/4 pass on the authenticated-app shell (tab layout, home-screen composition, empty states) before `mobile-engineer` finalizes screens beyond the literal auth flows — this is cheap now and expensive to redo after Phase 1's "view policy"/"view assets" screens exist and have their own opinions about navigation.
- **"View policy" and "view assets" have zero Stage 1–4 artifacts, and cannot have Stage 5–7 artifacts either, because the domain they'd describe doesn't exist.** No `business-requirements.md` for a Policy/Subscription or Asset-Registry domain exists anywhere in `docs/features/`; no MongoDB schema exists (`database-architect`, Stage 6, not started); no API contract exists (`backend-architect`, Stage 7, not started). This is not a gap in this document — it is a gap in the platform that this document refuses to paper over. §5 names exactly what's blocked and what has to happen first, per root `CLAUDE.md`'s instruction not to describe systems that don't exist.

**What this document actually is, then:** the Stage 5 architecture for the one slice of the Customer Mobile App that has real upstream artifacts to build against today — the Expo app shell, its auth integration, and its state-management/offline posture — written so it does not paint itself into a corner when the policy/asset domain eventually lands. It is not a claim that Feature 003 has completed a full Stage 1–4 pass; it is the architecture foundation those stages (for the shell IA) and Stage 6/7 (for policy/assets) will build on, per this task's own framing.

---

## 1. Project Structure & Tooling

### 1.1 Managed workflow, not bare — and why that's not a close call for Phase 1

ADR-0001 already picked Expo (React Native) + TypeScript and explicitly favors managed workflow, re-opening only "the moment a hardware SDK genuinely requires it" (`mobile-architect`'s own re-evaluation trigger). Phase 1's scope — register, view policy, view assets — touches **no native capability Expo's managed workflow doesn't already cover**: no background location, no GPS hardware SDK, no camera-dependent theft-recovery flow. Those are Phase 2 (`08-roadmap.md`). There is therefore no eject trigger today, and none is being proposed. Decision: **Expo managed workflow, SDK current-stable at implementation time**, using EAS (Expo Application Services) for builds from day one (§6) even though Phase 1 has no app-store submission target yet — standing the build pipeline up early means Phase 2's actual urgency (shipping GPS/location config-plugin changes) isn't also the first time anyone has run an EAS build.

**Revisit trigger, restated for this feature specifically:** if `gps-integration-engineer`'s Phase 2 hardware integration requires a native module with no Expo config-plugin equivalent, that is an ADR-0001 revisit, jointly evaluated with `solution-architect` — not a unilateral mobile-architect eject decision, per this role's charter.

### 1.2 TypeScript configuration

Strict mode, no exceptions, matching `05-development-standards.md`'s platform-wide rule ("TypeScript in strict mode across every surface — no `any` without a documented reason inline"). Concretely: `mobile/tsconfig.json` extends `expo/tsconfig.base` with `"strict": true`, `"noUncheckedIndexedAccess": true` (catches the exact class of bug an insurance app showing asset/policy data can least afford — silently-undefined array access rendered as if it were real data). The mobile TypeScript project is **independent** of the root `tsconfig.json` (which configures the Vite web app) and `backend/tsconfig.json` — three separate compilation units, consistent with how `backend/` already sits alongside root `src/` today. No shared `tsconfig` inheritance across them is proposed; the two things that *should* be shared (API types, design tokens) are shared as data/type packages, not by cross-referencing build configs (see §1.5).

### 1.3 Folder structure

Repo placement: a new top-level `mobile/` directory, sibling to `backend/`, following the existing pattern (root `src/` = web, `backend/` = API, `mobile/` = Expo app — three independent deployables, one repo).

```
mobile/
  app.json / app.config.ts        # Expo config; app.config.ts for env-driven values
  eas.json                        # EAS build/submit/update profiles (§6)
  package.json / tsconfig.json / babel.config.js
  app/                             # Expo Router file-based routes (see §1.4)
    _layout.tsx                   # Root layout — session bootstrap + gate routing (§2)
    (auth)/
      _layout.tsx
      welcome.tsx
      signup.tsx
      verify-pending.tsx          # ui-design.md §4.1 Screen C/E
      login.tsx                   # ui-design.md §4.2 Screen A
      mfa-challenge.tsx           # ui-design.md §4.2 Screen B
      forgot-password.tsx         # ui-design.md §4.3
      reset-password.tsx
    (app)/
      _layout.tsx                 # Tab navigator, requires an active/live session
      index.tsx                   # Home — placeholder empty states, see §5
      policy.tsx                  # BLOCKED per §5 — placeholder screen only
      assets.tsx                  # BLOCKED per §5 — placeholder screen only
      profile.tsx                 # Account/session mgmt: logout, logout-all, MFA opt-in enroll
    verification-gate.tsx         # ui-design.md §4.8 — BR-2 pending_verification block
  src/
    api/
      client.ts                   # fetch wrapper: refresh-on-401, single-flight refresh (§2.4)
      generated/                  # openapi-typescript output from api-design.md §7 (§1.6)
      auth.ts                     # typed calls to /auth/*, /session/*, /mfa/*
    auth/
      session-store.ts            # in-memory access-token + accountState store (§2.3)
      secure-storage.ts           # Expo SecureStore wrapper: refreshToken, deviceId (§2.3, §3)
      device.ts                   # deviceId generation/persistence, deviceName (§3)
    query/
      queryClient.ts              # TanStack Query client + persister config (§4)
    theme/
      tokens.ts                   # TEMPORARY manual mirror of web tokens (§1.5) — flagged for replacement
      primitives/                 # TEMPORARY RN Button/Input/Card/Alert/Screen (§1.5)
    network/
      NetworkProvider.tsx         # NetInfo listener + OfflineBanner (§5)
    screens/                      # Screen-level components rendered by app/ routes
```

### 1.4 Navigation: Expo Router, not bare React Navigation

**Decision: Expo Router**, which is Expo's own file-based routing layer built on top of React Navigation (so this is not a deviation from "React Navigation" as a library choice — it *is* React Navigation, with a routing convention on top). This is within this role's final authority ("mobile app structure... within the Expo React Native baseline") and does not require a `solution-architect`-approved ADR — it is not a stack change, just a navigation-library-within-the-stack decision.

**Why Expo Router over hand-rolled React Navigation stacks:**
- **Deep-linking is a first-class responsibility of this role** (per this role's charter, in partnership with `notification-engineer`) and is explicitly named in the mission as something a broken theft-alert deep link would "trust-destroy." Expo Router's routes are URL-shaped by construction (`/policy`, `/assets/[id]`), which means a push-notification payload's deep-link target maps directly onto a route path instead of requiring a hand-maintained linking config object kept in sync by convention. This pays off concretely the moment `notification-engineer`'s Phase 2 alert payloads need to open a specific asset/claim screen — the routing surface already exists in a shape a notification payload can target.
- **Typed routes** (Expo Router's `typed-routes` experiment, stable by the time of implementation) give compile-time checking that a deep link or an in-app navigation call targets a route that actually exists — valuable specifically because a stale/incorrect deep link is the named trust-risk in the mission brief.
- **Auth-gating maps cleanly onto route groups.** `(auth)` and `(app)` are Expo Router route *groups* (no URL segment, pure organizational/gating boundary) — the root `_layout.tsx` reads session state and conditionally renders one group or the other (or a `verification-gate` route for the BR-2-blocked state), which is a smaller, more auditable amount of code than a hand-built conditional `NavigationContainer` tree, and is the same pattern Expo's own documentation recommends for this exact problem (protected routes keyed on auth state).

**What Expo Router does not change:** the underlying navigation primitives (native-stack, bottom-tabs) are still React Navigation's, so nothing about this decision is exotic or hard to staff for.

### 1.5 Positioning for `design-system-manager`'s planned RN port — not a second design system

`design-system-manager`'s own role spec names "Plan and govern the Expo React Native port strategy" and "a token package consumed by both Tailwind config and RN theming" as their deliverables — this is explicitly **not** this role's decision to make unilaterally, and this document does not make it. What this document does own is making sure the mobile app's architecture doesn't foreclose that plan or duplicate it in the meantime:

- **No RN port of `src/components/*` exists yet.** The current design system (Button, Card, Badge, Input, Alert-equivalent, etc.) is a Tailwind-CSS/React-DOM implementation — not portable to React Native as-is (no DOM, no Tailwind class runtime in RN without a bridge like NativeWind, which is `design-system-manager`'s call to adopt or not).
- **Decision for Phase 1: a small, explicitly-temporary set of RN primitives** (`mobile/src/theme/primitives/` — `Button`, `Input`, `Card`, `Alert`, `Screen`) implemented directly against a token file (`mobile/src/theme/tokens.ts`) whose values are **manually mirrored, on a documented-in-code basis, from the current web Tailwind config** — not independently invented. This is the minimum necessary bridge to build the already-specified auth screens (§0) at all, given the RN port doesn't exist yet; it is explicitly **not** a second design system, and both files carry a header comment stating: *"Temporary bridge. Do not add new tokens/variants here independently of `src/components/*`'s web equivalents. Replace wholesale once `design-system-manager` ships the RN token package / component port."* This satisfies root `CLAUDE.md`'s "new one-off UI components require `design-system-manager` sign-off" in spirit — flagged to `design-system-manager` for explicit sign-off before `mobile-engineer` builds it, not asserted unilaterally here.
- **Recommendation to `design-system-manager` (not decided here):** extract the token *values* (color, spacing, typography scale, radius) into a platform-agnostic module (plain TS/JSON, no Tailwind-specific syntax) that both `tailwind.config.js` and the mobile app's theme layer import from — this is precisely what that role's own Best Practices already commit to ("design the token layer to be platform-agnostic from day one so the future Expo RN port doesn't require a parallel token system"). This document is not proposing *how* that module is packaged (a monorepo workspace package vs. a published internal package is a repo-tooling decision touching `frontend-architect`/`solution-architect` as well, since it would mean introducing npm/pnpm workspaces at the repo root, which doesn't exist today) — only naming that the mobile app's `theme/tokens.ts` is architected as a drop-in replacement target for that module, not as its own permanent source of truth.
- **Component-level (not token-level) port** is `design-system-manager` + `mobile-engineer`'s joint deliverable per the org chart's "Collaborates With" mapping. This document's `theme/primitives/` folder is scoped to disappear once that lands.

### 1.6 API types generated from the contract, not hand-typed

`api-design.md` §7 is a real, versioned OpenAPI 3.1 contract for every endpoint the mobile app needs for Phase 1. Decision: generate `mobile/src/api/generated/*` from that contract (e.g., `openapi-typescript`) rather than hand-writing request/response types. This makes "the mobile app's types match backend-architect's published spec" (a Pre-Approval checklist item this role owns) a build-time property instead of a code-review discipline — a contract change that isn't reflected in the mobile client's types is a type error, not a silent runtime mismatch. The generated types are consumed by a thin hand-written client (`src/api/auth.ts`, `client.ts`) — codegen produces types and (optionally) fetch stubs, not the retry/refresh/token-injection logic, which is architecture this document owns directly (§2.4).

### 1.7 Testing baseline (brief — full strategy owned by `qa-architect`)

Jest + `@testing-library/react-native` for unit/component tests, matching the platform-wide "unit tests for new logic" baseline (`05-development-standards.md`). Device-matrix and offline-scenario test strategy is `qa-architect`/`manual-qa-engineer`/`automation-qa-engineer`'s deliverable, not this document's — named here only so it isn't silently absent from the toolchain.

---

## 2. Auth Integration Architecture

### 2.1 The mobile app talks to our backend only, never Supabase — structurally, not by convention

Per ADR-0002 and `backend-approach.md` §1 (a hard architectural constraint, not a preference): the mobile app **never** includes `@supabase/supabase-js` or any Supabase client SDK, holds **no** Supabase URL/anon key/service-role key, and makes **zero** direct calls to `*.supabase.co`. Every auth operation goes through the platform's own backend at `${EXPO_PUBLIC_API_BASE_URL}/api/v1/...` (mounted under `/api` per `api-design.md` §6; the backend itself is the Render service ADR-0003 already stood up). `EXPO_PUBLIC_API_BASE_URL` is Expo's public-env-var convention (inlined at build time, exactly like Vite's `VITE_`-prefixed vars per the secrets-management plan's Vercel rule) — it is a host URL, not a secret, and is fine to ship in the client bundle for the same reason `VITE_API_BASE_URL` is.

Because `api-design.md` §1 rules that the backend mints its **own** opaque session tokens (not a Supabase-issued JWT passed through verbatim), the mobile app's bearer token is, by construction, cryptographically meaningless to Supabase's own APIs even if it leaked or someone tried to misuse it against `supabase.co` directly — mediation is structural, not just a rule the mobile app promises to follow. **This mobile architecture assumes that ruling holds.** It is presently "design-resolved, pending ADR-0005 ratification" per `api-design.md` §1/§8 — flagged as a live upstream dependency in §5.

### 2.2 Endpoints consumed (Phase 1)

Everything the app needs already exists as a contract in `api-design.md` §7: `POST /auth/signup`, `POST /auth/verify-email`, `POST /auth/resend-verification`, `POST /auth/login` (with `deviceId`, see §3), `POST /auth/mfa/challenge`, `POST /mfa/enroll` + `/mfa/enroll/verify` (customer opt-in path — FR-25), `POST /session/refresh`, `POST /session/logout`, `POST /session/logout-all`, `POST /auth/reset-password/request` + `/confirm`, `GET /account/me`. No endpoint outside this set is called by the mobile app in Phase 1.

### 2.3 Token storage on-device

- **Refresh token → Expo SecureStore** (iOS Keychain / Android Keystore-backed), never `AsyncStorage` (unencrypted) and never plain React state. This is the long-lived, highest-blast-radius credential (`api-design.md` §1: "an opaque, high-entropy random value, stored hashed server-side"), and SecureStore is the standard Expo-managed-workflow mechanism for exactly this class of secret — no native module beyond what Expo ships is required, so this does not touch the eject question in §1.1.
- **Access token → in-memory only** (a plain JS value inside `session-store.ts`, not persisted to SecureStore or anything else). Given the 10-minute TTL `api-design.md` §2.2 sets, persisting it buys nothing (it's stale within minutes of an app restart anyway) and only adds a second thing that could leak from disk. On cold start, the app has no access token until it successfully calls `/session/refresh` with the persisted refresh token — this is a deliberate "always refresh on launch" posture, not an oversight, and it is exactly what `api-design.md` §2.3's chokepoint table expects (`/session/refresh` is Mechanism 2's actual enforcement point for account-state drift, so making cold start always pass through it is a feature, not overhead).
- **`GET /account/me` is never read from a cached/persisted value for authorization purposes** — per `api-design.md` §2.3, this endpoint's entire purpose is live BR-2 gating and it explicitly never serves from a JWT claim alone. TanStack Query may cache its *display* value (§4), but the mobile app's route-gating logic (§1.4/§1.3's `(app)` vs. `verification-gate` decision) always uses a fresh call at points where the decision matters (app foreground-resume, before rendering the gated home screen), not a stale cache entry. This is stated explicitly here because it is the one place a well-intentioned offline-caching decision (§4) could accidentally reintroduce the staleness hole `architecture-review.md`'s D-2 spent real effort closing.

### 2.4 Refresh handling

A single fetch wrapper (`src/api/client.ts`) owns: attaching the in-memory access token to every authenticated request; on a `401` (expired/invalid access token — distinct from a revoked-token `401`, distinguishable by the error `code` in the shared envelope), transparently calling `/session/refresh`, updating the in-memory access token, and retrying the original request once; on a `423` (account suspended/deactivated — Mechanism 2's own enforcement point per `api-design.md` §2.3) or a refresh-token-invalid `401` (revoked, expired, or rotation-reuse-detected), forcing a full local logout and routing to `(auth)/login` with a specific, honest message (distinguish "please log in again" from "your account has been suspended — contact support" using the error `code`, not a generic failure string). **Single-flight refresh**: concurrent requests that all hit a 401 simultaneously (realistic — several TanStack Query queries can fire near the same access-token-expiry boundary) share one in-flight `/session/refresh` call via a memoized promise, rather than firing N redundant refresh calls that would each attempt to rotate the same refresh token — the second-and-later calls would fail as reuse under `api-design.md` §3.1's rotation-chain design if this isn't handled, which would incorrectly force-logout a legitimate multi-query burst.

### 2.5 MFA UX (optional for customers — FR-25)

Customers are **not** in the mandatory-MFA role set (BR-4 names admin, security-company operator, and support agent only). The mobile login flow is exactly `ui-design.md` §4.2: Screen A (login) always attempts `/auth/login`; the response is `oneOf` `SessionTokens` or `MfaChallengeRequired` per the OpenAPI contract, and the app branches on which shape it received — no separate "does this account have MFA" pre-check call, matching the contract as written. If `MfaChallengeRequired`, render Screen B (OTP entry) and call `/auth/mfa/challenge`. Enrollment (opt-in, from a settings/profile screen, not forced) calls `/mfa/enroll` (no `accountId` needed — the authenticated-caller path) and renders the returned `qrCodeImage` (base64 PNG) via a plain `Image` component with a `data:image/png;base64,...` URI, plus the `manualEntryKey` as selectable text underneath (not an image-only fallback — matches `ui-design.md` §6's accessibility redline, which already mandates this for the web equivalent and applies identically here). Completion posts to `/mfa/enroll/verify`.

**This document does not decide** whether/when customer MFA becomes mandatory above a policy-value or asset-count threshold — that's `business-requirements.md`'s still-open OQ-3, owned by `product-manager`. The mobile MFA screens are built against the current optional-for-customers rule and are structurally reusable (same endpoints, same screens) if that rule changes later, since the enrollment/challenge code path is already shared infrastructure, not customer-specific code (per `backend-approach.md` §2.2's own reasoning for why MFA enrollment is one group serving two policies).

### 2.6 Session expiry, background/foreground handling, and logout

- **Foreground resume after backgrounding:** if the app has been backgrounded long enough that the in-memory access token is stale (or was cleared, e.g., by the OS reclaiming memory), the app silently attempts `/session/refresh` before rendering any gated screen — never rendering a screen against a token it hasn't confirmed is still valid where that screen's content matters for authorization (§2.3's `/account/me` rule extends here too).
- **Explicit logout (`POST /session/logout`):** clears the in-memory access token and the SecureStore refresh token **immediately, client-side, regardless of network reachability** — a user must never appear "still logged in" locally because the network call to the backend hasn't landed. If offline, the server-side revocation call is retried best-effort on reconnect (a small, non-critical retry, not the Phase 2 offline-mutation-queue infrastructure named in §4/§5 — this is a fire-and-forget cleanup call, not a user-visible pending action). Worst case if it never lands: the session remains server-side valid until its natural ≤10-minute access-token expiry (`api-design.md` §2.2) — an acceptable, bounded residual, not a regression this app introduces, and the same bound every other client of this API already accepts.
- **"Log out everywhere" (`POST /session/logout-all`):** exposed in the Phase 1 profile screen as an explicit action, reusing the endpoint `api-design.md` §2.2 already contracts for password-reset finalization. A future device-list UI (showing `app.sessions.device_name` entries so a customer can see and revoke a specific lost device) is **not** built in Phase 1 — no endpoint currently exposes a per-session list to the client (`app.sessions` is service-role-only per `api-design.md` §3.1's RLS posture) — named here as a natural, low-cost Phase 1.5/2 addition once such a read endpoint exists, not invented now.

---

## 3. Device-Binding Architecture (FR-20 / discharging FU-09)

This is the review `architecture-review.md` flagged as missing at Feature 001's Stage 5 (no `mobile-architect` artifact existed) and named as a Stage 7 exit condition that has since gone unmet. Delivered here, against the actual session/refresh-token contract `api-design.md` already published.

### 3.1 What "device-bound" means architecturally

FR-20: "The Customer Mobile App binds sessions/refresh tokens to the device to reduce token-theft blast radius." `api-design.md` §3.1 already anticipated this at the schema level — `app.sessions.device_id` / `device_name`, explicitly flagged as "the field FU-09/mobile-architect's device-binding review needs to react to, not invent independently." Reacting to it, not inventing it:

- **Device identity: a locally-generated, app-storage-scoped UUID v4, not a hardware identifier.** Generated once (`expo-crypto`'s `randomUUID()`) at first app launch and persisted in SecureStore. **Deliberately not** IDFA/IDFV (iOS) or the Android Advertising ID / hardware serials — those are subject to platform privacy restrictions (App Tracking Transparency, Play's Advertising ID policy) that have nothing to do with this app's actual need (distinguishing sessions, not tracking users across apps), and using a locally-generated opaque ID sidesteps that compliance surface entirely rather than requiring a privacy-policy justification for a stronger identifier this app doesn't need. Consequence, accepted as correct rather than a limitation: a fresh app **reinstall** generates a new `deviceId` and is therefore architecturally indistinguishable from a new device for binding purposes. This is the right behavior, not a bug — a reinstalled app has no more claim to a prior session's trust than a genuinely new device would, and re-binding on reinstall is consistent with FR-20's stated goal (reduce token-theft blast radius) rather than in tension with it.
- **`deviceId` is sent on `POST /auth/login`** (already an optional field on that endpoint per `api-design.md` §7's `login` operation) and the backend persists it to `app.sessions.device_id`. The mobile app additionally sends a human-readable `deviceName` (e.g., `expo-device`'s `Device.modelName`, "iPhone 14" / "Pixel 8") for the future device-list UI named in §2.6 — this is not currently a documented request field on `/auth/login` in `api-design.md` §7 (only `deviceId` is), so this is flagged as a **small, additive contract request to `backend-architect`**, not assumed to already exist: add an optional `deviceName` string alongside the existing `deviceId` on `POST /auth/login`, mapped straight to the already-provisioned `app.sessions.device_name` column.

### 3.2 The gap this review is adding: device consistency at refresh time

`api-design.md` §7's `POST /session/refresh` request body today is `{ refreshToken }` only — it does not carry `deviceId`. This means a stolen refresh token, replayed from a different physical device, is **not currently detectable as a device mismatch** at the one endpoint (`refresh`) that runs on every token-hygiene cycle — reuse-detection (`api-design.md` §3.1's rotation chain) catches a token replayed *after* legitimate rotation has already moved past it, but does not catch a same-generation token used from an unexpected device before rotation occurs.

**Recommendation to `backend-architect` + `cybersecurity-architect`, not unilaterally decided here (this is exactly the boundary this role's charter draws — "defers to backend-architect on API contract shape"):** add an optional `deviceId` field to `POST /session/refresh`'s request body. If present and it does not match the `device_id` stored on the session being refreshed, treat it as a signal at least as strong as rotation-reuse (`api-design.md`'s existing `rotation_reuse_detected` revocation reason is a reasonable place to fold this in, or a new `device_mismatch` reason if `cybersecurity-architect` wants it distinguishable for audit purposes) — reject the refresh and revoke the session rather than silently honoring it. This is additive to the existing contract (an optional field, ignorable by other clients that don't send it), does not require reopening `api-design.md`'s already-published shape, and directly closes the one concrete hole FR-20's "reduce token-theft blast radius" language leaves open under the current contract. **This is a proposal, tracked as an open item (§5), not something this document treats as already true.**

### 3.3 Biometric app-unlock — a separate concern from MFA, named so it isn't conflated

`expo-local-authentication` (Face ID / Touch ID / Android biometric prompt) is recommended as an **optional, device-level app-relaunch/foreground gate** — a local convenience control that prevents someone who picks up an already-logged-in, unlocked phone from opening the app without the device's own biometric/passcode check. This is architecturally distinct from MFA (§2.5): MFA proves identity to the **server** at login; biometric app-unlock is a **local** gate on an already-valid session and involves no network call or server-side state at all. **This document does not mandate it for Phase 1** — flagged as an open question for `authentication-engineer`/`cybersecurity-architect` on whether it should be a required control given the app will eventually surface location-adjacent asset data (Phase 2), or remain an opt-in convenience feature. Not deciding this now is a scope choice, not an oversight: Phase 1's screens (auth + placeholders) don't yet expose the sensitive data that would make this control's absence a real risk.

---

## 4. State Management Approach

### 4.1 Decision: TanStack Query (React Query) for all server state; a small local store for session/UI state — no Redux

**Server state (session/account data now; policy/asset data once §5 unblocks):** TanStack Query. Justification specific to this platform's actual problem, not a generic recommendation:
- **First-class persistence story.** `@tanstack/query-async-storage-persister` (or an `expo-sqlite`-backed persister) lets the entire query cache survive app restarts and offline periods on-device. This is the concrete mechanism that satisfies the platform's asset-recovery mission requirement — "a customer needs to see their asset info even with poor connectivity" — for the read side, and it is being decided **now**, in the auth-only shell, specifically so it isn't a Phase 2 retrofit once real policy/asset queries exist to persist.
- **Built-in offline/retry primitives that are the correct on-ramp to Phase 2, without over-building Phase 1.** TanStack Query's `onlineManager` (network-state-aware query pausing) and `MutationCache` (paused mutations that automatically resume and retry on reconnect) are exactly the primitives a future "queue a stolen-device report while offline" feature needs — choosing this library now means Phase 2's harder offline-mutation-queue work extends existing, already-proven infrastructure instead of introducing a second, parallel offline system next to whatever Phase 1 picked. This document does **not** build that queue now (§5 names it explicitly out of scope) — it picks infrastructure that doesn't have to be replaced when it's needed.
- **Mature React Native support** — no meaningful gaps versus its web usage, unlike some alternatives that are web-DOM-oriented by default.

**Local/UI state:** a small store (Zustand, or React Context + `useReducer` if a dependency-averse call is preferred — either is acceptable, this is not a load-bearing decision) for: the auth/session store (`session-store.ts` — in-memory access token, derived `isAuthenticated`, `accountState` cache-for-display only per §2.3's rule, hydration status at boot) and ephemeral UI state (in-progress form fields, navigation-adjacent flags). **Redux is explicitly not chosen** — the actual state shape here (one server-cache library + one small session store) doesn't need Redux's ceremony, and `05-development-standards.md`'s "every new dependency is a reviewed decision" argues against adding a heavier dependency than the problem requires.

### 4.2 What this buys architecturally, stated plainly

The state-management choice is deliberately the same choice whether the data being cached is `/account/me` today or `/v1/assets` once that endpoint exists (§5) — the persistence, staleness, and offline-pause behavior are properties of the query-cache layer, not hand-written per-screen. This is the concrete mechanism by which this Phase 1 shell "does not paint itself into a corner," per this task's own framing.

---

## 5. Offline-First Posture for Phase 1 — and What's Blocked, Named Explicitly

### 5.1 What "offline-tolerant" means for each Phase 1 scope item, concretely

- **Register (signup):** account creation is inherently online-only — there is no offline path to creating a Supabase-backed identity, and none is proposed. What *is* built now: in-progress signup-form field values persist locally (a simple `AsyncStorage`/MMKV-backed draft, cleared on successful submission or explicit cancel) so a connectivity drop mid-form doesn't destroy what the user typed. This is resilient-form UX, not a queued action in the Phase 2 offline-mutation sense — no retry/reconciliation logic is needed because nothing has been submitted yet.
- **View policy / view assets:** **architecturally prepared for, not functionally built**, because the APIs don't exist (§5.2). The posture this shell establishes now: TanStack Query's persisted cache (§4) means that once these queries exist, the last successfully fetched response remains available read-only while offline, and the network-state plumbing to know *when* to show that as "possibly stale" is being wired into the shell today — `NetworkProvider.tsx` (a `@react-native-community/netinfo`-backed listener) plus a global `OfflineBanner` affordance (built from the temporary design-system bridge in §1.5) that the app can show anywhere, including on the current placeholder screens. When real policy/asset screens land, they inherit this plumbing rather than each screen reinventing "am I online" detection.
- **`/account/me` (already real):** cached for *display* only (e.g., a profile screen showing last-known email while offline), **never** as an offline authorization decision, per §2.3's rule — this is the one place this section is careful not to contradict `api-design.md`'s explicit live-read requirement for that endpoint.

### 5.2 What's blocked, and exactly why — no invented contract

**The policies/assets backend (MongoDB schema + API) does not exist.** Per root `CLAUDE.md`'s explicit instruction, this document does not invent field names, response envelopes, or endpoint shapes for "view policy" or "view assets" — doing so would produce a fake contract `mobile-engineer` could accidentally build against as if it were real. Concretely, nothing exists yet in `docs/features/` for a Policy/Subscription or Asset-Registry domain: no Stage 1 business requirements, no Stage 6 schema, no Stage 7 OpenAPI contract. This is the same lifecycle Feature 001 went through for identity (`business-requirements.md` → `database-design.md` → `api-design.md`) — Phase 1's policy/asset domain needs its own run through Stages 1–7 before this app's two remaining screens can be built for real.

**What's needed from `backend-architect`/`database-architect` before "view policy"/"view assets" can be built for real** (this is the concrete, named dependency this document's task explicitly asked for):
1. A published OpenAPI contract, at the same fidelity as `api-design.md`, for at minimum: a read endpoint returning the caller's own policy/subscription record, and a list/detail pair for the caller's registered assets. Whether these are scoped implicitly from the bearer token's `account_id` (the pattern Identity Service already established and the only pattern consistent with ADR-0002's mediation principle) or require an explicit client-supplied identifier needs to be the former — this document would push back on the latter as reopening an authorization hole the auth API already closed, and says so now rather than after mobile code is written against a weaker shape.
2. Confirmation that the existing platform-wide pagination convention (`api-design.md` §6 — cursor-based, `limit`/`cursor` params, `{ data, pagination: { nextCursor, hasMore } }` envelope, ratified there "for every other future list endpoint, not invented uniquely for audit logs") is what the asset-list endpoint uses, so the mobile client's list-handling code (and its TanStack Query `useInfiniteQuery` usage) is written once, not once per list endpoint with a slightly different shape.
3. The actual field-level shape for polymorphic asset types (a vehicle vs. a laptop vs. a GPS tracker, per ADR-0001's own stated rationale for choosing MongoDB) — this determines whether the mobile UI needs one generic "asset card" component or per-type rendering branches, and `ui-designer` cannot produce a real Stage 4 mockup for this screen, nor can this role finalize the client data layer for it, before `database-architect`'s schema exists.
4. The shared error envelope and Supabase/Mongo-outage failure-mode pattern already established for Identity Service (`api-design.md` §6) extended to whatever service owns this domain, so the mobile app's existing error-handling code (§2.4) doesn't need a second, divergent pattern for a second service.

**What CAN be built now, against the real, already-published auth API** — this is the actual Phase 1 deliverable this document authorizes:
- The full app shell and navigation skeleton (§1.3/§1.4).
- Signup → email verification → first login (`ui-design.md` §4.1), login with optional MFA (§4.2), forgot/reset password (§4.3), logout and logout-all (§4.7), and the BR-2 verification-gate block (§4.8) — all end-to-end against the real backend, with real session handling (§2), real device-binding (§3), and real offline-resilient form drafts (§5.1).
- MFA enrollment (customer opt-in, §2.5) end-to-end.
- A placeholder authenticated home screen with **explicit, honest empty states** for the Policy and Assets sections — copy to the effect of "Your policy details will appear here once policy management is available" / "Register your first asset once asset registration launches," never a hardcoded or mocked-up fake policy/asset card presented as if it were real data. This is a hard requirement of this document, not a style preference: per root `CLAUDE.md`'s honesty rule, the shipped placeholder must not visually claim a capability the platform doesn't have yet.
- A profile/settings screen: view own account state (live, per §2.3), MFA opt-in enrollment, logout, logout-all.

### 5.3 A dependency this section surfaces, not resolves

Even the auth-only slice above is not "fully production-verified" today, independent of anything mobile-specific: `architecture-review.md`'s **FU-07** (verifying Supabase's actual duplicate-signup/reset-for-unknown-email behavior against a live project) and **FU-15** (ADR-0002's three required follow-ups — data-residency review, `security-engineer`'s secrets-management plan ratification, and `cto` ratification of the whole ADR) are named there as gating Feature 001's own Stage 9 (Development) entry and Stage 8 (Security Review) exit respectively. The mobile app's auth screens can be **architected and scaffolded** against the published contract now (this document does exactly that), but neither this document nor `mobile-engineer`'s implementation of it should be read as certifying that the backend side of that contract is itself fully security-reviewed and production-verified — that certification is Feature 001's own to give, on its own gate, not something a mobile architecture document can borrow.

---

## 6. App-Store Release Strategy (brief — full runbook is a `devops-engineer` deliverable)

- **Build/submit tooling: EAS Build + EAS Submit.** Profiles in `eas.json`: `development` (dev-client build for local iteration), `preview` (internal distribution — TestFlight internal / Play Internal Testing — for stakeholder review of the auth shell before Phase 1 is feature-complete), `production` (store-bound builds).
- **OTA policy: Expo Updates (EAS Update) for JS-only changes; a new store build for anything native.** Concretely: copy fixes, most business-logic changes, and bug fixes that don't touch `app.json`/`app.config.ts` native config (permissions, icons, splash, an added native module or config plugin) ship via `eas update` to the relevant channel, live to users on their next update check — no app-store review cycle. Any permission or native-module change (the first realistic trigger for Phase 1 being a camera permission for asset-photo upload, if that lands before Phase 2's location work) requires a new binary and store review; it cannot be OTA'd, and this document does not pretend otherwise.
- **Runtime versioning:** use Expo's `runtimeVersion` policy (`appVersion` or `fingerprint`, whichever is current-recommended at implementation time) so an OTA update is only served to a native binary it's actually compatible with — this avoids the standard Expo-Updates failure mode of shipping a JS update that references a native capability an older installed binary doesn't have.
- **Urgent-fix path, generalized from the mission's own example ("a broken theft-reporting flow," which is Phase 2, generalized here to "any critical flow"):** an OTA update via `eas update` to the production channel is the fast path (typically live within the app's update-check interval — checked on cold start by default; a foreground re-check can be enabled for genuinely critical pushes), materially faster than an app-store review cycle. **Named gap, not solved here:** even OTA has a rollout curve, not instant delivery to every installed device — a true kill-switch (a lightweight, backend-served remote flag the app checks to disable a broken flow client-side while the OTA rolls out) is recommended as a **Phase 2 planning item with `backend-architect`**, not built in Phase 1, since Phase 1 has no flow risky enough yet to justify the infrastructure.
- **Store submission timing:** not proposed for Phase 1's auth-only slice. App-store review guidelines (both platforms) discourage submitting an app that is substantially placeholder/empty-shell; the honest empty-state screens in §5.2 are correct for internal review but the app should not go to public store review until the full Phase 1 scope (register, view policy, view assets, all real) is complete. Internal distribution (EAS `preview` profile → TestFlight/Play Internal Testing) is the right distribution channel now.
- **Handoff to `devops-engineer`:** the CI/CD pipeline needs a third leg (GitHub Actions triggering `eas build` / `eas update`) alongside the existing Vercel (frontend) and Render (backend) pipelines ADR-0003 already stood up — named here as the concrete ask this document's Outputs commit to, not designed further (pipeline mechanics are `devops-engineer`'s to own).

---

## 7. Pre-Approval Checklist (`mobile-architect` self-review)

- [x] **Offline behavior explicitly designed and tested for every critical flow in Phase 1's actual scope.** Designed for register (form-draft resilience, §5.1) and for the shell-level plumbing view-policy/view-assets will consume once real (§5.1). "Tested" is not yet applicable — no code exists yet. Full offline-first design for theft-reporting is explicitly out of scope (Phase 2), named as such, not silently deferred.
- [ ] **Background-location permission flow follows platform policy with justified minimum permission tier.** **N/A for this document** — no background location is in Phase 1 scope; this checklist item belongs to the Phase 2 GPS/theft-recovery architecture document, not this one. Left unchecked rather than marked N/A-and-ignored, so it isn't mistaken for "considered and cleared."
- [ ] **Push notification deep-link contract verified end-to-end.** Not yet — no push-notification feature exists in Phase 1 scope (notification-engineer's Phase 2 surface). §1.4's Expo Router decision is made partly *in anticipation* of this, but no contract exists to verify yet.
- [ ] **Battery/performance impact of background tracking measured, not assumed.** N/A — no background tracking exists in this document's scope.
- [x] **Any native-module dependency evaluated for Expo managed-workflow compatibility.** §1.1 — nothing in Phase 1 scope requires a native module beyond what Expo's managed workflow + SecureStore/local-authentication/device/crypto config plugins already provide. No ejection risk identified; none flagged to `solution-architect` because none exists yet.
- [ ] **Auth token/secure storage design reviewed with `authentication-engineer` and `cybersecurity-architect`.** **Not yet — this document is the submission for that review**, not a self-certified pass. §2.3's storage split (refresh token in SecureStore, access token in-memory) and §3's device-binding proposal (including the `/session/refresh` `deviceId` addition, which is `backend-architect`/`cybersecurity-architect`'s call, not this document's to finalize) are explicitly flagged as needing that sign-off.
- [x] **API contract consumed matches `backend-architect`'s published spec, including sync/delta endpoints.** For the auth surface: yes, `api-design.md` §7 is the contract §1.6/§2.2 build against directly (generated types, not hand-typed). For policy/assets: **no contract exists**, named explicitly and repeatedly in §5, not silently assumed.
- [ ] **Release plan (OTA vs. store submission) specified for the change.** §6 specifies the general policy; there is no specific "change" yet to apply it to, since no code exists. Left unchecked as a placeholder for the first real PR to point back to this section, not because the policy itself is missing.

**Net status:** three items fully satisfied (offline posture for actual Phase 1 scope, no native-module/eject risk, auth API contract fidelity), four correctly left open (three are genuinely out of this document's scope — background location, push deep-linking, battery — and one, `cybersecurity-architect`/`authentication-engineer` review of the token/device-binding design, is a real pending dependency named as such, not glossed).

---

## 8. Follow-Up Tracker

| ID | Item | Owner | Blocks | Status |
|---|---|---|---|---|
| **M-01** | Ratify `deviceName` as an additive field on `POST /auth/login` and `deviceId` as an additive, optional field on `POST /session/refresh` for device-mismatch detection (§3.1, §3.2). | `backend-architect` + `cybersecurity-architect` | Full device-binding value of FR-20; a stronger `api-design.md` contract | Proposed here, not yet ratified |
| **M-02** | Review §2.3/§3's token-storage and device-binding design. | `authentication-engineer` + `cybersecurity-architect` | Pre-Approval checklist item; Stage 8-equivalent sign-off for the mobile auth build | Open |
| **M-03** | Lightweight Stage 3/4 UX/UI pass on the authenticated-app shell (tab layout, home composition, empty states) — separate from the already-specified auth screens. | `ux-researcher` + `ui-designer` | Finalization of `mobile/app/(app)/*` beyond the literal placeholders in §5.2 | Not started |
| **M-04** | Decide whether/how design tokens are extracted into a platform-agnostic module consumed by both Tailwind config and the mobile theme layer (§1.5), including any repo-tooling change (workspaces) that implies. | `design-system-manager` (+ `frontend-architect`/`solution-architect` on repo tooling) | Retirement of the temporary `mobile/src/theme/*` bridge | Recommended, not decided |
| **M-05** | Policy/Asset domain: Stage 1 business requirements through Stage 7 API contract, before "view policy"/"view assets" can be built for real (§5.2). | `business-analyst` → `product-manager` → `database-architect` → `backend-architect` | The two remaining Phase 1 mobile screens | Not started anywhere in the platform |
| **M-06** | Biometric app-unlock: decide required vs. optional (§3.3). | `authentication-engineer` + `cybersecurity-architect` | Whether Phase 1 ships it at all | Open, non-blocking for Phase 1 |
| **M-07** | Kill-switch / remote feature-flag mechanism for urgent-fix rollout ahead of OTA propagation (§6). | `backend-architect` (mechanism) + `mobile-architect` (client integration) | Phase 2 urgent-fix response time | Named, deferred to Phase 2 planning |
| **M-08** | Third CI/CD leg (EAS Build/Update pipeline) alongside existing Vercel/Render pipelines. | `devops-engineer` | Any real mobile deployment | Handed off, not started |
| **M-09** | ADR-0005 (platform session-token contract) ratification — this document's §2.1/§2.3 assume the backend-minted-token outcome already ruled in `api-design.md` §1. | `backend-architect` + `cybersecurity-architect`, ratified `solution-architect` + `cto` | Structural (vs. policy-only) validity of §2.1's mediation claim | Design-resolved, not yet ratified (tracked upstream in Feature 001, restated here as a live mobile dependency) |

---

**Net summary:** the auth-integrated app shell (project structure, navigation, auth integration including a substantive FR-20 device-binding design, state management, and a Phase-1-scoped offline posture) is architected and ready for `solution-architect` review and, once reviewed, for `mobile-engineer` to build against real endpoints that already exist. "View policy" and "view assets" are explicitly not architected beyond the shell-level plumbing they'll inherit (§4, §5.1), because the backend domain they'd depend on has not been designed — that gap is named, owned, and routed (§5.2, M-05), not filled with an invented contract.
