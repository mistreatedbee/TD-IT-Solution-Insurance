# ADR-0001: Baseline Architecture & Stack Selection

Status: Accepted
Date: 2026-08-07
Deciders: `solution-architect`, `backend-architect`, `frontend-architect`, `mobile-architect`, `database-architect`, ratified by `cto`

## Context

TD IT Solution Insurance's Asset Protection & Recovery Platform is starting from a Magic Patterns-generated React design-system showcase and nothing else — no backend, no mobile app, no database, no infrastructure. Before any product feature work begins, the platform needs a ratified stack baseline so every subsequent architecture decision (schema design, API design, deployment topology) has firm ground to build on, and so the 35-role engineering organization isn't guessing at what it's building on top of.

## Decision

- **Web** (marketing site, Admin Dashboard, Security Company Dashboard): keep and extend the existing **React 18 + Vite + TypeScript + Tailwind CSS** stack and component library already present in this repo (`src/components/*`). Rewriting it would throw away a working, already-themed design system for no benefit.
- **Mobile** (Customer App): **Expo (React Native) + TypeScript** — per explicit platform-owner direction. Expo's managed workflow gives faster iteration and simpler OTA updates, at the cost of some native-module flexibility that `mobile-architect` will re-evaluate if a specific GPS SDK requires ejecting.
- **Backend API**: **Node.js + TypeScript**. Keeps one language (TypeScript) across web, mobile, and backend, reducing context-switching cost and enabling shared type definitions for API contracts.
- **Database**: **MongoDB** — per explicit platform-owner direction. Document model fits the platform's naturally polymorphic asset types (a vehicle, a laptop, and a GPS device tracker have different attribute shapes) better than a rigid relational schema would, without giving up the ability to normalize relationships (users → policies → assets → claims) where it matters. Final schema, indexing, and migration strategy owned by `database-architect`.

## Alternatives Considered

- **Web**: Rebuild on Next.js for SSR/SEO benefits. Rejected for now — the existing Vite/React investment is real and working; SSR can be revisited by `frontend-architect` if organic-search acquisition becomes a priority, without blocking Phase 1.
- **Mobile**: Bare React Native or native (Swift/Kotlin) for maximum GPS/background-location control. Rejected for MVP — Expo's managed workflow is faster to ship and still supports background location via config plugins; `mobile-architect` owns re-evaluating this the moment a hardware SDK genuinely requires it.
- **Backend**: Different runtime per service (e.g., Go for the GPS ingestion hot path). Rejected for now — premature optimization before real load data exists; `integration-architect` and `performance-engineer` may revisit for the ingestion layer specifically once Phase 2 load-tests reveal a real bottleneck.
- **Database**: PostgreSQL for stronger relational guarantees around policies/billing. Rejected — explicit platform-owner direction for MongoDB, and the asset-type polymorphism argument holds; `database-architect` should still apply relational discipline (references, schema validation, transactions where MongoDB supports them) rather than treating "document store" as "no schema."

## Consequences

- Every future architecture decision (API design, schema design, deployment) builds on a single confirmed stack — no more open questions on language/runtime/database.
- Explicitly **left open**: payment gateway, GPS hardware vendor, and hosting/cloud provider. These are owned by `integration-architect` (payment gateway, GPS vendor) and `cloud-infrastructure-architect` (hosting), each to be captured in their own ADR before Phase 1/Phase 2 work depending on them begins.
- TypeScript-everywhere is a deliberate constraint: any proposal to introduce a second backend language must clear `solution-architect` and come with a load-tested justification, not developer preference.

## Revisit Trigger

Reopen this ADR if: Expo's managed workflow cannot support a required GPS SDK without ejecting; MongoDB's transaction/consistency model proves insufficient for payment/claims correctness under real load; or the web stack needs SSR for a confirmed SEO/acquisition requirement.
