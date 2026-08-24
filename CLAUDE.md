# TD IT Solution Insurance — Asset Protection & Recovery Platform

Enterprise InsurTech platform: customers subscribe to monthly plans and register valuable assets (vehicles, laptops, phones, tablets, TVs, desktops, business equipment). Registered assets can carry GPS tracking hardware; the platform ingests location data to help locate and recover lost or stolen assets, coordinating with security-company partners. Surfaces: Customer Mobile App, Admin Dashboard, Security Company Dashboard, Backend API, GPS Integration Layer, Payment System, Notification Services, Reporting & Analytics, Authentication System, Customer Support Portal.

## Current repo state — read this before assuming anything exists

**Read [`HANDOFF.md`](HANDOFF.md) first for narrative detail — but note it is a point-in-time
snapshot (last fully rewritten 2026-08-14) and is itself now behind the code.** This section was
refreshed 2026-08-24 by reading the actual source tree (`backend/src/routes/`, `mobile/app/`,
`src/admin/`, `src/security/`, `docs/organization/adr/`, `docs/features/`), not copied from
HANDOFF.md's prose. If the two disagree, trust the code over either document, and flag the
discrepancy back to `technical-writer` for an updated HANDOFF.

This is a real, multi-surface product now — not a design-system showcase:

- **Web** (`src/`): design-system component library + marketing site, **plus** real product
  surfaces — customer auth/onboarding/dashboard (`src/customer/`, `/get-started`, `/dashboard`),
  an Admin Panel (`src/admin/`, `/admin/*`), and a Security Company Dashboard (`src/security/`,
  `/security/*`).
- **Backend** (`backend/src/routes/`): Node.js + TypeScript API covering auth/session/MFA
  (Feature 001), customer **and admin** policies/assets (Feature 004), plan catalog + admin plan
  editor (Feature 006), notifications/push-token/preferences (Feature 007), a recovery-case /
  security-case API (`recovery.ts`, `security-cases.ts`), customer profile + admin verification
  routes, an alerts API, and Feature 008/009 GPS-adjacent routes: `asset-location.ts`
  (self-device, phone-only location reporting per Feature 008 Phase 1 / ADR-0009) and
  `tracking-devices.ts` (provider-agnostic device registration/linking/installation-guide per
  Feature 009 Phase 4, gated through `resolveTrackingProfile()` so third-party hardware
  capabilities stay honestly "pending" until a GPS vendor is chosen). **Claims and payments have
  no backend routes** — no `claims.ts`/`payments.ts` exists. Test count moves every session —
  re-verify with `cd backend && npm test` before citing a number rather than trusting this file
  or HANDOFF.md's last-recorded figure.
- **Mobile** (`mobile/app/`): Expo Router app — auth, onboarding, Policy/Assets, notification
  preferences, plus a substantially built-out Feature 009 surface: home, alerts, map, device
  locations, live-tracking, report-theft flow, device activation/health/installation-guide
  screens, and a separate security-company operator portal (`(security-app)/`). **Claims screens
  exist in the UI (`app/(app)/claims/`) with no backend route behind them — still a stub against
  what would 404 in production.** Re-verify test count with `cd mobile && npm test`.
- **Supabase** (`supabase/`): linked project, `auth-send-email` Edge Function (Resend-backed
  branded auth email templates), config and migrations — real, not scaffolding.
- **Databases**: Supabase Postgres (identity) + MongoDB Atlas (domain), per ADR-0002. Both live
  with applied schemas.
- **Hosting**: backend + web are deployed via Render (`render.yaml`), per **ADR-0003 (Accepted,
  ratified 2026-08-07)** — hosting provider is a settled decision now, not open. Payment gateway
  and GPS hardware vendor remain **open decisions** (`integration-architect`) — Feature
  008/009's tracking code is deliberately written vendor-agnostic (self-device today,
  capability-gated "pending hardware" placeholders for anything requiring a vendor), not a sign
  that a vendor has been chosen.
- **Not built**: payments/billing, claims backend, GPS hardware-vendor integration, push
  notification event bus beyond the current partial adapter, staging environment, production
  email delivery confirmation (Resend owner action), object-storage/photo-upload vendor (MP-5).

Feature 009 (`docs/features/009-customer-experience-redesign/`) is the design package behind
most of the newer mobile/backend surfaces above (protection-centre home, tracking-provider
abstraction, security-ops dashboard) — its own roadmap doc phases hardware integration, live
maps, and AI/analytics as future work; check its README and `09-implementation-roadmap.md`
before assuming a phase is complete just because some of its routes/screens exist.

Don't describe or build against systems that aren't there yet — check code before assuming.

## This project has a full engineering organization — use it

Full governance lives in [`docs/organization/`](docs/organization/README.md) (org chart, RACI matrix, feature lifecycle, quality gates, dev/security/documentation standards, roadmap, ADRs). **Read that directory before doing any non-trivial work on this project.**

35 specialized roles exist as real, invocable subagents under [`.claude/agents/`](.claude/agents/) — each file is both an HR-style role spec and a working system prompt. Default behavior for this project:

- **Act as `cto`** for cross-cutting requests, prioritization, or anything spanning multiple domains — orchestrate rather than doing everything generically yourself.
- **Route domain-specific work to the owning subagent** per [`docs/organization/01-raci-matrix.md`](docs/organization/01-raci-matrix.md) — e.g. a schema question goes to `database-architect`, a security question to `cybersecurity-architect`/`security-engineer`, a design question to `ui-designer`/`design-system-manager`. Don't silently do backend-architecture work as a generic assistant when `backend-architect` exists to own it.
- **Follow the 15-stage feature lifecycle** in [`docs/organization/02-feature-lifecycle.md`](docs/organization/02-feature-lifecycle.md) for any real feature — Security Review (stage 8) and QA Testing (stage 10) are hard gates, never skipped for speed.
- **Document decisions** per the format in [`docs/organization/03-communication-workflow.md`](docs/organization/03-communication-workflow.md) — architecture-significant calls become ADRs under `docs/organization/adr/`, following [ADR-0001](docs/organization/adr/0001-baseline-architecture.md) as the template/precedent.

## Stack baseline (see ADR-0001 for full rationale)

- Web (marketing site, Admin Dashboard, Security Company Dashboard): the existing React/Vite/TS/Tailwind stack.
- Mobile (Customer App): Expo (React Native) + TypeScript.
- Backend API: Node.js + TypeScript (`/api/v1`).
- **Identity → Supabase Postgres; domain data → MongoDB** (ADR-0002 polyglot split).
- **Hosting: Render** (`render.yaml`), per **ADR-0003 (Accepted, ratified 2026-08-07)** — no longer an open decision.
- Payment gateway and GPS hardware vendor remain **open decisions**, owned by `integration-architect` / `cloud-infrastructure-architect` — don't hardcode an assumed vendor. Don't treat Feature 008/009's deliberately vendor-agnostic self-device/tracking-provider abstraction (`backend/src/lib/tracking-profile.ts`) as evidence a GPS vendor has been chosen — it's built to degrade honestly ("pending hardware") until one is.

## House rules

- Never claim a system, integration, or feature exists if it hasn't been built in this repo yet — see [`docs/organization/07-documentation-standards.md`](docs/organization/07-documentation-standards.md) on honesty about current state.
- New one-off UI components require `design-system-manager` sign-off — reuse `src/components/*` first.
- No secrets/credentials in source; `.env` stays gitignored.
