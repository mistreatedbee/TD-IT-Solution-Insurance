# ADR-0008: MongoDB Schema Provisioning for Feature 004

**Status:** Proposed — pending `cto` ratification  
Date: 2026-08-12  
Deciders: `database-architect` (proposing), `devops-engineer` (co-owner), `cto` (ratifier)

## Context

Feature 004 stores policies, assets, and policy status history in MongoDB Atlas (ADR-0002). Supabase schema changes are versioned in `backend/migrations/*.sql` with headers as source of truth. MongoDB had **no equivalent** until MP-6:

- `backend/src/db/feature004-collections.ts` — shared validator, indexes, `bootstrapFeature004Collections()`
- `backend/scripts/bootstrap-mongo-collections.ts` — one-shot CLI apply
- `backend/src/db/mongo-bootstrap.ts` — startup re-run (same function)

This works for Phase 1 but does not answer: how do we **verify** live Atlas matches design, how do we **evolve** validators safely, and how do we **avoid** the FU-A13 class of error (document claims index exists, migration never ran)?

## Decision

**Adopt a dual-path Mongo provisioning model for Feature 004:**

1. **Declarative specs** live in `feature004-collections.ts` (single source of truth).
2. **Apply mechanisms:**
   - **Startup bootstrap** — idempotent ensure (current behavior); acceptable for indexes and greenfield collection create.
   - **CLI script** — `bootstrap-mongo-collections.ts` for CI/CD and manual first apply; must be run (or startup must succeed) before customer routes serve traffic.
3. **Verification** — extend FU-A10 deploy-time checks to assert Feature 004 collection names, index names, and assets validator presence match `feature004-collections.ts` exports (catalog query, not file trust).
4. **Validator tightening** — changes that **restrict** an existing validator require an explicit migration script (new file under `backend/scripts/mongo-migrations/`) run before deploy; startup bootstrap must **not** silently tighten production validators.

**Not in this ADR:** `admin_access_log` (deferred until admin routes); sharding; cross-region.

## Alternatives considered

- **Mongoose migrations only** — rejected; repo uses native driver, not Mongoose.
- **Atlas CLI only** — rejected; no versioned spec in repo, repeats FU-A13 failure mode.
- **Startup-only, no CLI** — rejected; cold-start on empty cluster is fine, but operators need a runbook command that matches CI.

## Consequences

- `database-architect` owns `feature004-collections.ts` + any `mongo-migrations/*` scripts.
- `devops-engineer` wires verification into deploy pipeline when Render service exists.
- `backend-engineer` imports collection constants from `feature004-collections.ts`, never hardcodes names.
- ADR-0007 remains reserved for FU-08 third-persistence-surface; this is ADR-0008.

## Revisit triggers

- First validator **tightening** on a non-empty production collection
- Introduction of `admin_access_log` or GPS collections
- Multi-region Atlas requirement
