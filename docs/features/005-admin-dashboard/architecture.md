# Feature 005 — Admin Dashboard (Phase 1 MVP)

## Architecture — Stage 5

**Lifecycle stage:** 5 — Architecture Review  
**Author:** `frontend-architect`  
**Status:** Draft — submitted for `solution-architect` review. Not yet ratified.  
**Date:** 2026-08-12  
**Governing ADRs:** [ADR-0001](../../organization/adr/0001-baseline-architecture.md) (React/Vite/TS/Tailwind baseline), [ADR-0002](../../organization/adr/0002-polyglot-persistence-identity-vs-domain-data.md) (backend mediation — no Supabase client in frontend), [ADR-0003](../../organization/adr/0003-backend-hosting-platform.md) (`VITE_API_BASE_URL` → Render backend)  
**Reads on:** [`08-roadmap.md`](../../organization/08-roadmap.md) Phase 1, [`001-authentication/api-design.md`](../001-authentication/api-design.md) v1.3.0, [`001-authentication/ui-design.md`](../001-authentication/ui-design.md) §4.4–§4.7 (privileged web auth), [`004-policy-asset-management/api-design.md`](../004-policy-asset-management/api-design.md) §4.4/§6.3 (admin policy/asset reads), [`003-mobile-app-foundation/architecture.md`](../003-mobile-app-foundation/architecture.md) §2 (auth/API patterns), [`HANDOFF.md`](../../../HANDOFF.md) (MP-1 scope exclusions), [`001-authentication/security-review.md`](../001-authentication/security-review.md) SR-12 / FU-10 (privileged web session floor)  
**This document discharges:** `architecture-review.md` **FU-10** (FR-21 dashboard idle-timeout and privileged web session handling — owner `frontend-architect`, due Stage 7 exit). FU-10 was open because no web dashboard architecture existed at Feature 001 Stage 5.

---

## 0. What This Document Is, and an Honest Process Note

The 15-stage lifecycle puts Architecture Review at Stage 5, after Business Requirements, Product Planning, UX Research, and UI Design. **Feature 005 does not yet have its own Stage 1–4 artifacts.** What exists today, split honestly:

| Stage | What exists for Admin Dashboard | How this document treats it |
|---|---|---|
| 1 — Business Requirements | Phase 1 need named in `08-roadmap.md`: "Admin Dashboard: view customers, policies, assets." No dedicated `business-requirements.md` for Feature 005. | Scope is bounded to that roadmap line plus backend contracts already published. No commercial/tier/pricing UI is invented. |
| 2 — Product Planning | Not filed as a discrete Feature 005 track. | Phase 1 MVP only; Security Company Dashboard and Support Portal are Phase 2/3 per roadmap. |
| 3 — UX Research | Privileged-operator auth journeys in `001-authentication/ux-research.md` §1.4–§1.6. No IA research for "admin home / list / detail" beyond auth. | Auth flows reuse Feature 001 research. **List/detail IA is an architecture-level scaffold** until `ux-researcher`/`ui-designer` run a lightweight Stage 3/4 pass on the authenticated admin shell. |
| 4 — UI Design | Privileged web auth screens fully specified in `001-authentication/ui-design.md` §4.4–§4.7, §4.9 (`surface-navy-deep` + `Card` layout, MFA challenge, idle-timeout banner). **No hi-fi mockups for accounts/policies/assets list or detail views.** | Auth screens compose existing design-system components per §4. Dashboard data screens are structural placeholders (`StatBlock`, `Card`, `Badge`, `AssetBadge`) until `ui-designer` delivers Feature 005 screen specs. |

**What this document is:** the Stage 5 architecture for the Admin Dashboard web surface — routing, auth integration, API client layer, RBAC boundaries, design-system composition rules, and code-splitting — written so `frontend-engineer` can implement without guessing, and so the marketing site (`src/pages/*`, `/components/*`) stays isolated from privileged UI.

**What this document is not:** a claim that admin policy/asset API routes are live (they are **in progress** per `HANDOFF.md`; `GET /v1/admin/accounts*` **is** live). It does not substitute for Feature 005 Stage 8 Security Review or Stage 10 QA.

---

## 1. Scope

### 1.1 In scope (Phase 1 MVP)

- **Read-only admin views** across three domains, matching `08-roadmap.md` Phase 1:
  - **Customers (accounts):** `GET /v1/admin/accounts`, `GET /v1/admin/accounts/{id}` — **implemented** (Feature 001).
  - **Policies:** `GET /v1/admin/policies`, `GET /v1/admin/policies/{policyId}` — **contract published** (`004/api-design.md` §6.3); backend **in progress**.
  - **Assets:** `GET /v1/admin/assets`, `GET /v1/admin/assets/{assetId}` — same as policies.
- **Privileged auth flows** required to reach those views, per `001-authentication/ui-design.md`:
  - Login + mandatory MFA challenge (§4.5).
  - Invitation accept → forced password → mandatory MFA enrollment (§4.4) — needed for first admin onboarding; routed under `/admin/*` but not part of the "view" MVP itself.
  - Password reset with MFA re-verification (§4.6).
  - Logout + idle-timeout logout with distinct UX (§4.7, FR-21).
- **RBAC:** `user_type = admin` only. No `support_agent` or `security_company_operator` surfaces in Phase 1 (consistent with `004/api-design.md` §4.4 and Feature 001 C8 posture).
- **Reuse** of `src/components/*` design system — no parallel admin component library.

### 1.2 Explicitly out of scope (Phase 1 — do not build by accident)

Aligned with `HANDOFF.md` MP-1 and `004/api-design.md` §1:

| Area | Reason |
|---|---|
| Create / edit / delete policies or assets | Not in API contract (`004/api-design.md` §1 — "creating/viewing" for customer; admin is list/view only). P-15: cancel/delete never designed. |
| Customer signup, email verification, mobile-only flows | Customer surface (`003-mobile-app-foundation`); admin accounts are invitation-created. |
| Payments, billing, plan tiers, pricing UI | No gateway selected; `planTier` is a free-form string; `coverageLimits: []` (MP-3). |
| GPS pairing, live maps, location history | Phase 2; FU-A14 blocks GPS Stage 1. |
| Claims / recovery cases | No backend collection or API. |
| Push notifications | No payload contract. |
| Audit-log viewer UI | `GET /v1/admin/audit-log` exists but is not a Phase 1 dashboard requirement; defer unless `product-manager` prioritizes. |
| Security Company Dashboard / Support Portal | Phase 2/3 (`08-roadmap.md`). Separate route trees when built — not shared nav with admin in Phase 1. |
| Asset photo upload / display beyond URL strings | MP-5 — no object-storage vendor. |
| Supabase client SDK in the browser | ADR-0002 mediation — structurally forbidden. |

---

## 2. Route Structure

### 2.1 Top-level partition

The existing SPA (`src/App.tsx`) serves the **public marketing site** and **design-system showcase** at `/`, `/privacy`, `/terms`, `/components/*`. The Admin Dashboard is a **separate route subtree** at `/admin/*`:

- **Code-split** at the `/admin/*` boundary via `React.lazy` so marketing visitors never download admin bundles.
- **No shared layout chrome** between marketing and admin — admin uses its own shell (sidebar + content), not the marketing `LandingPage` wrapper.
- **Vercel SPA fallback** (`vercel.json` → `index.html`) already covers `/admin/*`; no server config change required.

### 2.2 Admin route map

| Path | Access | Purpose | Backend (when live) |
|---|---|---|---|
| `/admin/login` | Public | Privileged login (§4.5 Screen A) | `POST /auth/login`, `POST /auth/mfa/challenge` |
| `/admin/forgot-password` | Public | Password reset request (§4.6) | `POST /auth/reset-password/request` |
| `/admin/reset-password` | Public | Reset confirm + MFA re-verify (§4.6) | `POST /auth/reset-password/confirm`, `POST /auth/reset-password/mfa-verify` |
| `/admin/accept-invitation` | Public (token in URL) | First-login invitation flow (§4.4) | `POST /invitations/accept`, MFA enroll |
| `/admin` | Authenticated admin | Redirect → `/admin/accounts` | — |
| `/admin/accounts` | Authenticated admin | Customer list | `GET /admin/accounts` |
| `/admin/accounts/:accountId` | Authenticated admin | Customer detail | `GET /admin/accounts/{id}` |
| `/admin/policies` | Authenticated admin | Policy list (cross-customer) | `GET /admin/policies` |
| `/admin/policies/:policyId` | Authenticated admin | Policy detail | `GET /admin/policies/{policyId}` |
| `/admin/assets` | Authenticated admin | Asset list | `GET /admin/assets` |
| `/admin/assets/:assetId` | Authenticated admin | Asset detail | `GET /admin/assets/{assetId}` |

**Nested navigation (cross-linking, not separate routes):**

- From account detail → filtered policy list (`/admin/policies?accountId={uuid}`) and asset list (`/admin/assets?accountId={uuid}`) using the admin API's `accountId` query filter (`004/api-design.md` §6.3).
- From policy/asset detail → link to owning account (`/admin/accounts/{accountId}`) when `accountId` is present on the resource.

**Default landing:** authenticated `/admin` redirects to `/admin/accounts` — customers are the admin's primary navigation anchor; policies and assets are secondary cross-customer views.

### 2.3 Route guards

Two layers — **defense in depth**, neither sufficient alone:

1. **Client route guard** (`AdminAuthGate`): while session is `hydrating`, render a minimal loading shell; if `signed-out`, redirect to `/admin/login` preserving `?redirect=` return path; if signed-in but `GET /account/me` returns `user_type !== 'admin'`, render a dedicated **403 Unauthorized** page (not a silent redirect — avoids confusing a support agent who accidentally uses the admin URL).
2. **API enforcement** (authoritative): every admin endpoint returns `403` for non-admin callers. The client maps `403` on admin routes to the same Unauthorized page and clears the session if the token's role claim is stale.

Unauthenticated access to `/admin/accounts` etc. → redirect to `/admin/login?redirect=/admin/accounts`.

---

## 3. Module Structure

New application code lives under `src/admin/`, separate from `src/components/*` (design system) and `src/pages/*` (marketing):

```
src/admin/
  AdminRoutes.tsx              # Nested <Routes> mounted at /admin/*
  layout/
    AdminLayout.tsx            # Sidebar nav, header, logout — composes Card/Section
    AdminAuthGate.tsx          # Outlet guard for authenticated admin routes
    AdminAuthLayout.tsx        # surface-navy-deep full-bleed wrapper for auth screens
  pages/
    LoginPage.tsx              # §4.5 — placeholder until ui-design implementation
    AccountsListPage.tsx
    AccountDetailPage.tsx
    PoliciesListPage.tsx
    PolicyDetailPage.tsx
    AssetsListPage.tsx
    AssetDetailPage.tsx
    UnauthorizedPage.tsx
  auth/
    AdminAuthProvider.tsx      # React context: session status, login/logout, idle timer
    session-storage.ts         # sessionStorage: refresh token + browser deviceId
    idle-timeout.ts            # FR-21: 15 min idle, 13 min warning hook
  api/
    config.ts                  # VITE_API_BASE_URL + /api/v1 prefix
    client.ts                  # fetch wrapper: bearer attach, refresh-on-401, single-flight
    errors.ts                  # ApiError envelope (mirror mobile/src/api/errors.ts)
    auth.ts                    # typed /auth/*, /session/*, /mfa/* calls
    admin-accounts.ts          # GET /admin/accounts*
    admin-policies.ts          # GET /admin/policies* (stub until backend lands)
    admin-assets.ts            # GET /admin/assets* (stub until backend lands)
    generated/                 # openapi-typescript output (identity + policy-asset contracts)
  hooks/                       # TanStack Query hooks (frontend-engineer adds @tanstack/react-query)
```

**Naming rule:** `src/admin/*` is **application composition**; `src/components/*` stays presentational. Admin-specific table rows, filter bars, and sidebar nav are admin modules — they compose `Button`, `Card`, `Badge`, `StatBlock`, `Input`, not fork them.

---

## 4. Auth & Session Handling

### 4.1 Backend-only auth — no Supabase client

Identical constraint to mobile (`003-mobile-app-foundation/architecture.md` §2.1): the web admin app **never** imports `@supabase/supabase-js` or holds Supabase credentials. All auth goes through `${VITE_API_BASE_URL}/api/v1/*`. The bearer token is backend-minted and meaningless to Supabase directly (ADR-0002).

### 4.2 Token storage (privileged web — discharges FU-10 / SR-12)

| Credential | Storage | Rationale |
|---|---|---|
| **Access token** | In-memory only (React context / module singleton) | 10-minute TTL (`api-design.md` §2.2). Persisting adds XSS blast radius with no UX benefit. |
| **Refresh token** | `sessionStorage` | Tab-scoped — closing the browser tab ends the persisted refresh credential. Matches privileged-web posture in `security-review.md` SR-12 ("Privileged web: 15 min" refresh TTL / idle expectation). **Not** `localStorage`. |
| **Browser `deviceId`** | `sessionStorage` (generated UUID on first admin auth use) | Optional on `POST /auth/login` and `POST /session/refresh` per `api-design.md` §11.C. Web cannot offer keystore-backed binding (SR-5/R-5); sending a stable per-tab/device id still enables server-side session consistency checks when present. |

**Cold start / page reload:** no access token in memory → read refresh token from `sessionStorage` → `POST /session/refresh` → hydrate session before rendering gated routes (status: `hydrating` → `signed-in` | `signed-out`).

### 4.3 Refresh-on-401 (mirror mobile)

`src/admin/api/client.ts` follows `mobile/src/api/client.ts` §2.4:

- Attach `Authorization: Bearer {accessToken}` on authenticated requests.
- On `401` from a non-refresh endpoint: single-flight `POST /session/refresh`, update tokens, retry once.
- On refresh `401` or `423`: clear storage, set `signed-out`, redirect to `/admin/login` with reason (`session-invalid` | `account-suspended`).
- Include `{ refreshToken, deviceId }` on refresh (device id from `session-storage.ts`).

### 4.4 MFA flows (mandatory for admin — BR-4)

Admin login is **never** password-only:

1. `POST /auth/login` → `SessionTokens` **or** `MfaChallengeRequired`.
2. If challenge: navigate to `/admin/login/mfa` (nested under login route group) → `POST /auth/mfa/challenge` → tokens.
3. First-time invitation path (§4.4): accept invitation → set password → `/mfa/enroll` + `/mfa/enroll/verify` before entering dashboard.

UI composition follows `ui-design.md` §4.4–§4.5: `Card` on `surface-navy-deep`, **[NEW: OTP input]** and **[NEW: MFA QR display]** from `design-system-additions.md` — `frontend-engineer` implements or ports from `mobile/src/theme/primitives/OtpInput.tsx` with `design-system-manager` sign-off for the web variant.

### 4.5 Idle timeout (FR-21)

Per `security-review.md` SR-12 and `ui-design.md` §4.7:

| Parameter | Value |
|---|---|
| Idle limit | **15 minutes** without user activity |
| Warning | **13 minutes** — non-blocking banner ("You will be logged out soon due to inactivity") |
| Enforcement | Stop calling `/session/refresh`; clear tokens; redirect to `/admin/login` with `?reason=idle-timeout` |
| UX distinction | Idle redirect shows info `Alert` banner on login; manual logout does **not** (§4.7) |

Implementation: `idle-timeout.ts` listens to `pointerdown`, `keydown`, and `visibilitychange` (document visible) on the admin layout only — not on public marketing pages.

### 4.6 Logout

- **Manual:** `POST /session/logout` best-effort, then **immediate** client-side token clear regardless of network (same as mobile §2.6).
- **Idle:** client-side clear only (refresh token may already be expired server-side).

---

## 5. API Client Pattern

### 5.1 Configuration

```ts
// src/admin/api/config.ts — mirrors mobile/src/api/config.ts
const host = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
export const API_BASE_URL = `${host}/api/v1`;
```

`VITE_API_BASE_URL` is a **host only** (no `/api/v1` suffix), gitignored in production via Vercel env vars per ADR-0003 and `secrets-management-plan.md`.

### 5.2 Typed contracts — generated, not hand-written

Mirror mobile's pipeline:

1. OpenAPI YAML extracted from `001-authentication/api-design.md` §7 and `004-policy-asset-management/api-design.md` §6 into `openapi/` at repo root (or `src/admin/openapi/`).
2. `openapi-typescript` → `src/admin/api/generated/*.ts`.
3. Thin hand-written modules (`auth.ts`, `admin-accounts.ts`, …) call `apiFetch` with generated types.

**Do not** hand-type request/response shapes — contract drift is a security and audit problem on privileged reads.

### 5.3 Pagination

All list endpoints use cursor pagination (`limit`, `cursor`, `pagination.nextCursor`, `pagination.hasMore`) per platform convention. Admin list pages implement "Load more" (not page numbers) — consistent with mobile list screens and `004/api-design.md` §5.

### 5.4 Error envelope

Uniform `{ error: { code, message, requestId } }` — reuse `ApiError` class pattern from `mobile/src/api/errors.ts`. Surface `requestId` in admin error toasts for support correlation.

### 5.5 Endpoints consumed (Phase 1)

**Identity (Feature 001) — live:**

- Auth: `POST /auth/login`, `POST /auth/mfa/challenge`, `POST /mfa/enroll`, `POST /mfa/enroll/verify`
- Session: `POST /session/refresh`, `POST /session/logout`
- Account: `GET /account/me`
- Admin: `GET /admin/accounts`, `GET /admin/accounts/{id}`
- Invitations: `POST /invitations/accept` (first admin onboarding)

**Policy & Asset (Feature 004) — contract ready, backend in progress:**

- `GET /admin/policies`, `GET /admin/policies/{policyId}`
- `GET /admin/assets`, `GET /admin/assets/{assetId}`

Frontend may scaffold list/detail pages against mocks or feature-flagged empty states until backend-engineer lands routes; **do not** pretend live data exists in production UI.

---

## 6. RBAC

### 6.1 Phase 1 role matrix

| `user_type` | Admin Dashboard (`/admin/*`) |
|---|---|
| `admin` | Allowed — list/detail reads only |
| `customer` | **Denied** — `UnauthorizedPage` |
| `support_agent` | **Denied** — Phase 3 Support Portal is a separate surface |
| `security_company_operator` | **Denied** — Phase 2 Security Company Dashboard |

No role switcher, no shared "staff portal" shell in Phase 1.

### 6.2 Enforcement points

1. **Route guard:** after `GET /account/me`, require `userType === 'admin'`.
2. **JWT claim check (optimistic):** decode-free — trust `/account/me` live read at gate time; do not cache role for authorization decisions beyond the current navigation session.
3. **API:** backend `requireUserType('admin')` is authoritative; client handles `403 FORBIDDEN` gracefully.

### 6.3 MFA required flag

If `/account/me` returns `mfaRequired: true` and MFA is not enrolled, redirect into §4.4 enrollment flow before any admin list route renders — same posture as privileged first login.

---

## 7. Design System Composition

### 7.1 Layers

| Layer | Location | Examples |
|---|---|---|
| Design system (presentational) | `src/components/*` | `Button`, `Card`, `Badge`, `StatBlock`, `Input`, `Section`, `SectionHeading`, `AssetBadge`, `ArrowLink` |
| Admin application | `src/admin/*` | `AdminLayout`, list tables, filter bars, sidebar |
| Marketing | `src/pages/*` | Unchanged |

### 7.2 Auth screens (specified)

Per `001-authentication/ui-design.md`:

- Background: `bg-surface-navy-deep` full viewport.
- Form container: `Card` (`interactive={false}`, `padding="lg"`, `max-w-md`, centered).
- Primary CTA: single `Button` variant primary per screen.
- Idle banner: **[NEW: Alert/banner]** — coordinate with `design-system-manager` (`design-system-additions.md`).

### 7.3 Dashboard screens (architecture scaffold — pending ui-design)

Until Feature 005 Stage 4 mockups exist, use this composition baseline:

| UI need | Design-system component |
|---|---|
| Page title | `SectionHeading` |
| KPI summary row | `StatBlock` (e.g. total accounts, active policies) |
| Status chips | `Badge` / `AssetBadge` (asset status, policy status) |
| List container | `Card` with table inside (semantic `<table>` for accessibility) |
| Empty state | `Card` + `SectionHeading` + muted copy |
| Detail field groups | `Card` + label/value rows using `text-secondary` for labels |
| Navigation | Sidebar with `ArrowLink` or styled anchor; active route highlighted with `primary-tint` background |

**Do not** add admin-only variants to `src/components/*` without `design-system-manager` sign-off — extend via `className` composition in `src/admin/*`.

### 7.4 Mobile primitive bridge

Changes to shared web components may affect `mobile/src/theme/primitives/*`. Admin-specific needs (data tables, dense list rows) stay in `src/admin/` and do not require RN port.

---

## 8. Data Fetching & Client State

### 8.1 Recommended libraries (align with mobile)

| Concern | Library | Notes |
|---|---|---|
| Server state | `@tanstack/react-query` | List/detail caching, pagination, stale-while-revalidate |
| Session state | React Context (`AdminAuthProvider`) or `zustand` | Match mobile session-store pattern if zustand is added |
| URL state | React Router `useSearchParams` | `accountId`, `status`, `cursor` filters |

The minimal scaffold uses React Context only; **frontend-engineer should add TanStack Query** before wiring live list endpoints (same choice as mobile `src/query/queryClient.ts`).

### 8.2 Query keys

```
['admin', 'accounts', { cursor, limit }]
['admin', 'accounts', accountId]
['admin', 'policies', { cursor, accountId, status }]
['admin', 'assets', { cursor, accountId, status, assetType }]
```

Invalidate account-scoped lists when navigating from account detail — avoid over-fetching unfiltered cross-customer lists by default (`004/api-design.md` §6.3 capacity note).

---

## 9. Performance & Code Splitting

| Budget | Target |
|---|---|
| Admin initial JS (login route) | ≤ 150 KB gzip (excluding shared vendor chunk) |
| Admin authenticated shell + one list route | ≤ 250 KB gzip incremental |
| LCP (authenticated list) | ≤ 2.5 s on mid-tier laptop |

**Strategy:**

- `React.lazy` for `src/admin/AdminRoutes.tsx` at `/admin/*` boundary.
- Optional: lazy-load each of accounts/policies/assets route modules if bundle grows.
- No map libraries, no chart libraries in Phase 1.
- Generated API types are dev/build-time only — no runtime OpenAPI parser.

---

## 10. Backend Dependencies & Sequencing

| Dependency | Status (2026-08-12) | Blocks |
|---|---|---|
| `GET /v1/admin/accounts*` | **Live**, tested | Accounts list/detail |
| `GET /v1/admin/policies*` | Contract published; route **in progress** | Policies list/detail |
| `GET /v1/admin/assets*` | Contract published; route **in progress** | Assets list/detail |
| `admin_access_log` Mongo writer | Trail B — **not built** | Feature 004 admin route Stage 8 (backend), not frontend |
| ADR-0006 C-14 purpose header | Binds bulk admin lists | Backend audit — no frontend header in Phase 1 unless backend-architect adds one |

**Recommended build order for frontend-engineer:**

1. Auth shell + route guard + login/MFA placeholders.
2. Accounts list/detail (live API).
3. Policies/assets when backend PR merges — until then, honest "API not available" empty state, not fake data.

---

## 11. Testing Architecture (brief)

Full strategy owned by `qa-architect` / `automation-qa-engineer`. Minimum for Phase 1:

- **Unit:** `client.ts` refresh single-flight, idle-timeout math, RBAC guard redirect logic.
- **Component:** login form, unauthorized page, list empty/loading/error states.
- **Integration:** MSW or mock server against OpenAPI shapes for admin list pagination.
- **E2E (Stage 10 gate):** Playwright — admin login → MFA → accounts list → account detail; run against staging backend (MP-8 — not production Mongo).

---

## 12. Open Items

| ID | Item | Owner |
|---|---|---|
| AD-1 | Feature 005 Stage 1 `business-requirements.md` (acceptance criteria for list/detail) | `business-analyst` + `product-manager` |
| AD-2 | Authenticated admin shell IA + list/detail hi-fi (Stage 4) | `ui-designer` + `ux-researcher` |
| AD-3 | Web OTP input + Alert banner components | `design-system-manager` + `frontend-engineer` |
| AD-4 | OpenAPI codegen pipeline for web (mirror mobile) | `frontend-engineer` + `devops-engineer` |
| AD-5 | Ratify this document (Stage 5 exit) | `solution-architect` / `cto` fallback |
| AD-6 | Feature 005 Stage 8 security review (privileged read UI, XSS + token storage) | `cybersecurity-architect` |

---

## 13. Pre-Approval Checklist

- [x] Module/route structure documented for Admin Dashboard Phase 1.
- [x] Reuses `src/components/*`; admin composition isolated under `src/admin/`.
- [x] Real-time GPS/alert pattern — N/A Phase 1 (explicitly out of scope).
- [x] Role-based route guards documented; admin-only, no support/security-operator in Phase 1.
- [x] Performance/code-splitting plan at `/admin/*` boundary.
- [x] API contracts referenced from published OpenAPI sections — not invented.
- [x] Idle-timeout / FR-21 disposition documented (FU-10).
- [ ] Reviewed and approved by `solution-architect` — **pending**.

---

## 14. Contract Amendment Log

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-08-12 | Initial Stage 5 architecture — Phase 1 admin read surface, auth/session, API client, RBAC, design-system rules. |
