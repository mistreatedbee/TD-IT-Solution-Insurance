# Development Standards

Owned jointly by `solution-architect` (technical direction) and `cto` (final ratification). Domain architects own the sub-sections in their area.

## Stack baseline

See [ADR-0001](adr/0001-baseline-architecture.md) for the full rationale. Summary:

- **Web** (marketing site, Admin Dashboard, Security Company Dashboard): React 18 + Vite + TypeScript + Tailwind CSS — the stack already present in this repo's component library (`src/components/*`).
- **Mobile** (Customer App): Expo (React Native) + TypeScript.
- **Backend API**: Node.js + TypeScript.
- **Database**: MongoDB.
- **Payment gateway, GPS hardware vendor, hosting provider**: open decisions, owned by `integration-architect` / `cloud-infrastructure-architect` — do not hardcode assumptions about these until an ADR ratifies them.

## Coding conventions

- TypeScript in strict mode across every surface — no `any` without a documented reason inline.
- Shared design-system components (`src/components/*`) are the only building blocks for UI — new one-off components require `design-system-manager` sign-off before merge.
- Functions and modules stay single-responsibility; prefer composition over deep inheritance.
- No secrets, API keys, or credentials in source — environment variables only, never committed (`.env` stays gitignored).
- Linting (`eslint`) and type-checking are CI-blocking, not advisory.
- Every new dependency is a reviewed decision, not a drive-by `npm install` — flag in the PR why it's needed and who reviewed it.

## Branching & release strategy

- `main` is always deployable. Feature branches off `main`, named `<type>/<short-description>` (e.g. `feat/gps-geofence-alerts`, `fix/payment-webhook-retry`).
- No direct commits to `main` — every change lands via reviewed PR (see [04-quality-gates.md](04-quality-gates.md)).
- Releases are tagged (`vX.Y.Z`, semver) and shipped via the CI/CD pipeline `devops-engineer` owns — never a manual out-of-band deploy.
- Hotfixes branch from the last release tag, not from an in-progress `main`, to avoid shipping unrelated in-flight work.

## API design conventions

Owned by `backend-architect`.

- REST, resource-oriented, versioned from day one (`/api/v1/...`).
- Every endpoint has an OpenAPI contract before Development starts (lifecycle stage 7) — the contract is the source of truth, not the implementation.
- Consistent envelope for errors (code, message, request ID) across all services, including the GPS ingestion webhook layer and payment webhooks.
- Idempotency keys required on any write endpoint that a mobile client might retry (asset registration, claim submission, payment actions).
- Backwards-incompatible changes require a new API version, never a silent breaking change to `v1`.

## Architecture Decision Records (ADRs)

- Any decision that is expensive to reverse, affects multiple teams, or sets a precedent gets an ADR under `docs/organization/adr/`.
- Numbered sequentially (`0001-`, `0002-`, ...), never renumbered or deleted — superseded ADRs are marked `Status: Superseded by ADR-00XX`, not removed.
- Proposed by any architect, ratified by `solution-architect` + `cto`.
- Template and process detail: [07-documentation-standards.md](07-documentation-standards.md).

## Testing expectations

Full strategy owned by `qa-architect` — see [04-quality-gates.md](04-quality-gates.md) for gating. Baseline expectation for every PR: unit tests for new logic, integration tests for new API endpoints, and no reduction in existing coverage.
