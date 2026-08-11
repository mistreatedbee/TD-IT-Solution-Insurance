# TD IT Solution Insurance — Asset Protection & Recovery Platform

Enterprise InsurTech platform: customers subscribe to monthly plans and register valuable assets (vehicles, laptops, phones, tablets, TVs, desktops, business equipment). Registered assets can carry GPS tracking hardware; the platform ingests location data to help locate and recover lost or stolen assets, coordinating with security-company partners. Surfaces: Customer Mobile App, Admin Dashboard, Security Company Dashboard, Backend API, GPS Integration Layer, Payment System, Notification Services, Reporting & Analytics, Authentication System, Customer Support Portal.

## Current repo state — read this before assuming anything exists

**Read [`HANDOFF.md`](HANDOFF.md) first** — point-in-time status as of 2026-08-12.

- **Web** (`src/`): design-system component library + marketing site — no Admin or Security Company dashboards yet.
- **Backend** (`backend/`): Feature 001 auth + Feature 004 **customer** policies/assets API — **85 tests green**. Recovery, claims, payments, admin routes **not built**.
- **Mobile** (`mobile/`): Expo app with auth + Policy/Assets on live API; Phase 2 recovery/claims UI scaffold (stub APIs). **30 tests green**.
- **Databases**: Supabase Postgres (identity) + MongoDB Atlas (domain), per ADR-0002. Both live with applied schemas.

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
- Payment gateway, GPS hardware vendor, and hosting provider are **open decisions**, owned by `integration-architect` / `cloud-infrastructure-architect` — don't hardcode an assumed vendor.

## House rules

- Never claim a system, integration, or feature exists if it hasn't been built in this repo yet — see [`docs/organization/07-documentation-standards.md`](docs/organization/07-documentation-standards.md) on honesty about current state.
- New one-off UI components require `design-system-manager` sign-off — reuse `src/components/*` first.
- No secrets/credentials in source; `.env` stays gitignored.
