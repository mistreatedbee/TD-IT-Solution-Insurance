# ADR-0008: MongoDB Schema Provisioning — Platform-Wide (originated on Feature 004)

**Status:** **Ratified** — `cto`, 2026-08-24 (§`cto` ratification, below). Ratified with three conditions, none of which reopens the decision.  
Date: 2026-08-12 (proposed) · 2026-08-24 (ratified)  
Deciders: `database-architect` (proposing), `devops-engineer` (co-owner), ratified 2026-08-24 by `cto` (final decision authority for this platform; no separate CEO role exists, and `cto` also stands in for `solution-architect` ratification per `.cursor/rules/00-house-rules.mdc`)

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

---

## `cto` ratification — **Ratified**, with three conditions

**Approving authority:** `cto` (final decision authority for this platform; no separate CEO role exists) · **Effective date:** 2026-08-24 · **Filed by:** `solution-architect`, on `cto`'s direction of 2026-08-24 that ADR-0008 and ADR-0009, ratified in principle, have their ratification sections filed within one week. **Also covering `solution-architect` ratification**, per `.cursor/rules/00-house-rules.mdc`, which names `cto` the fallback owner for that stage.

**Verdict: ratified.** The dual-path model — declarative specs in `feature004-collections.ts` as single source of truth, applied by both an idempotent startup bootstrap and a CLI script that CI and operators run the same way — is adopted as platform precedent for MongoDB provisioning, not only for Feature 004.

The load-bearing reason is the fourth item of the Decision, and it is the reason this is ADR-level rather than a README note: **catalog-queried verification plus an explicit migration script for validator tightening is the structural answer to the FU-A13 failure mode** (`ADR-0006` §17.1 — a design document cited as existing infrastructure). Mongo had no versioned equivalent to `backend/migrations/*.sql`; this closes that asymmetry between the two stores that ADR-0002 split, and it does so before the collection set grew large enough for the gap to be expensive.

No technical content is revisited here. The decision, alternatives, and consequences stand exactly as `database-architect` filed them on 2026-08-12.

### Conditions on this ratification

Ratified now because none of these reopens the decision and all three are cheaper to hold as conditions than to wait on:

1. **Verification (Decision item 3) is not built.** Verified in the repository on 2026-08-24: `backend/src/db/feature004-collections.ts`, `backend/src/db/mongo-bootstrap.ts`, and `backend/scripts/bootstrap-mongo-collections.ts` exist; **no deploy-time or CI check asserts the live Atlas catalog against them.** Until that check exists, no document may describe Mongo provisioning as *verified* — only as *applied*, on the same standard ADR-0006 §16.5 condition 3 applies to AUD-11 ("checked," never "enforced"). Owner: `devops-engineer` with `database-architect`, riding FU-A10's mechanism rather than becoming a second script (ADR-0006 §17.2).
2. **`backend/scripts/mongo-migrations/` does not exist yet.** That is correct today — no validator tightening has been attempted. The condition is that the directory is created **by the first tightening change, not after it**, and that the startup bootstrap is never the mechanism by which a production validator is narrowed (Decision item 4). Owner: `database-architect`.
3. **Scope note, recorded rather than left to be discovered — corrected 2026-08-24 by `database-architect` on `cto`'s finding that this condition as originally filed understated scope.** The model has already been extended well beyond Feature 004 and beyond the single second module (`recovery-collections.ts`) this condition originally named. Verified against `backend/src/db/mongo-bootstrap.ts` on 2026-08-24: **seven** collection-spec modules are wired into the startup bootstrap path — `feature004-collections.ts`, `recovery-collections.ts`, `notification-collections.ts`, `customer-profile-collections.ts`, `tracking-device-collections.ts`, `location-events-collections.ts`, and `alerts-collections.ts` — and the same set (or its `bootstrap-mongo-collections.ts` CLI equivalent) is the intended parity path per Decision item 2. This ADR's title said "for Feature 004"; corrected to reflect that its rules bind all seven collection-spec modules today, and every subsequent one added to either apply path. Conditions 1 and 2 are read as covering all seven collection-spec modules on both apply paths, not only `feature004-collections.ts` or `recovery-collections.ts`, and this is now binding platform-wide language for MongoDB provisioning generally — not a per-module opt-in. This is a clarification of scope, not an amendment of the decision or of the verdict above.

### What is not ratified here

- **Not a claim that the verification path exists.** It does not (condition 1).
- **Not a provisioning decision for `admin_access_log`, GPS/location collections, sharding, or cross-region** — all four are explicitly out of scope per the Decision's closing line and stay out.
- **Not an Atlas tier, cost, or access-control ruling.** ADR-0006 §16.4's C-16(c) escalation (database-layer audit capability at Atlas, and elimination of standing human access to production stores) is a separate, still-open `cto` obligation and is untouched by this ratification.

**Signed:** `cto`, 2026-08-24. Ratified with the three conditions above.
