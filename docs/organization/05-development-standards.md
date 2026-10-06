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

## Offline behaviour for mutations that need confirmed delivery

`cto` ruling, 2026-10-06, prompted by the mobile app's report-theft flow having zero offline handling. Applies to every client-side mutation where the user needs to know, with confidence, whether the action actually happened — not just to that one flow.

**The rule: fail clearly, never queue silently, and make retry safe.** A mutation in this category must never be queued for later, invisible, background sync. If a customer believes a stolen asset is reported, consent is withdrawn, or any other confirmed-delivery action went through when it actually didn't, that is a worse outcome than an honest, immediate failure the user can act on.

But "fail clearly" does **not** mean treating every connectivity problem as a definite failure. A dropped connection does not prove the request never reached the server — timeouts and connections dropped mid-response both surface as the same client-side network error, and the server may have already processed the request. Building a retry flow on the assumption that a network error always means "nothing happened" causes a real bug: a successful action can come back as an error on retry.

Concretely, every mutation in this category must implement all four:

- **(a) Definite failure, before sending.** If the client already knows it's offline, block the action before any request is sent and say so plainly — e.g. "You're offline. Your report has not been sent." This is accurate because nothing left the device.
- **(b) Uncertain failure, after sending.** A network error *after* the request was sent must not claim the action definitely failed. Use wording like "We couldn't confirm this was received. Check your connection and try again — retrying won't create a duplicate." Reserve today's generic error copy for actions that are harmless to repeat regardless.
- **(c) One idempotency key per submission intent, reused across retries.** If the endpoint is not naturally safe to repeat (e.g. it has its own duplicate-prevention check), the client must generate one key per logical attempt and reuse it on every retry of that same attempt — never mint a fresh key per HTTP call. Reset the key only when the user materially changes what they're submitting, or once the submission succeeds.
- **(d) A "this already happened" response is success, not an error.** If retrying with the same idempotency key surfaces a conflict/duplicate response, treat it as confirmation the original attempt succeeded — route the user to the result that already exists, never show it as a failure.

**Naturally idempotent endpoints are exempt from (c)/(d).** Some mutations are safe to repeat by construction — a DELETE-style withdrawal that clears state regardless of its prior value, or a POST that appends a fresh timestamped record rather than upserting. These only need (a) and (b). Confirm this in the endpoint's own code/comments before assuming it — don't guess.

**Known mutations this currently covers**, and their required treatment:
- Theft report creation (`mobile/src/screens/recovery/ReportTheftConfirmScreen.tsx`) — full (a)-(d); not naturally idempotent, the backend's duplicate-open-case check means a retry without key reuse returns a false CONFLICT.
- Police report updates (`updateRecoveryCasePoliceReport`) — (a)/(b); confirm retry safety (update-in-place) before assuming (c)/(d) can be skipped.
- Asset location consent grant, location report, and consent withdrawal (`mobile/src/screens/assets/AssetDetailScreen.tsx`) — (a)/(b) only; both grant and withdrawal are naturally idempotent by design. Withdrawal is the highest-stakes of the three under POPIA: local consent/linked-device state must only be cleared *after* the server confirms withdrawal, never optimistically beforehand, so an ambiguous failure never shows a customer "tracking is off" when it might not be.
- **Any future claims-submission flow inherits this rule by default** — claims has no backend today, but when it's built, claim creation is a confirmed-delivery mutation and must not be built as a silent queue.

**This does not license a generic offline action queue.** Nothing in the current feature set needs background-sync/reconciliation infrastructure, and adding one would change delivery guarantees platform-wide. A future proposal for a generic offline queue needs its own ADR — it is not pre-approved by this section.
